"""
analyzer.py — Core logic for RepoSage.

Handles:
  - Walking local repo directories and reading file contents
  - Shallow-cloning GitHub repos (with optional auth token for private repos)
  - Sending repo content to Claude (Anthropic) or Ollama for analysis
  - Streaming chat follow-up responses from either provider
  - Guaranteed temp directory cleanup via context manager / explicit call
"""

import os
import asyncio
import tempfile
import shutil
import json
from pathlib import Path
from typing import AsyncGenerator

import httpx

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

SKIP_DIRS = {
    "node_modules", ".git", "__pycache__", ".venv", "venv",
    "build", "dist", ".next", ".nuxt", "coverage", ".pytest_cache",
    ".mypy_cache", "target", ".cargo", "vendor", ".terraform",
    "elm-stuff", ".stack-work",
}

SKIP_EXTENSIONS = {
    ".lock", ".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico",
    ".woff", ".woff2", ".ttf", ".eot", ".mp4", ".mp3", ".zip",
    ".tar", ".gz", ".exe", ".dll", ".so", ".dylib", ".bin",
    ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".pyc", ".pyo",
    ".class", ".jar", ".war", ".map",
}

SKIP_FILES = {
    "package-lock.json", "yarn.lock", "pnpm-lock.yaml",
    "poetry.lock", "Pipfile.lock", "Gemfile.lock",
    ".DS_Store", "Thumbs.db",
}

MAX_LINES_PER_FILE = 200
MAX_TOTAL_CHARS = 400_000   # ~100k tokens — safe limit for most tiers
LARGE_REPO_THRESHOLD = 500  # Warn user before analyzing repos with >500 files

CLAUDE_MODEL = "claude-sonnet-4-5"
OLLAMA_BASE_URL = "http://localhost:11434"  # default; overridable per-request

SYSTEM_PROMPT = """You are an expert code analyst. Analyze this repository thoroughly. Explain:
1) What the project does and why it exists
2) The architecture and how pieces fit together
3) Each important file and its role
4) The tech stack and why those choices
5) Data flow through the system
6) Current state - what works, what's in progress
7) How someone new should start understanding this codebase

Be specific, reference actual file names and code. Use markdown formatting with headers, bullet points, and code blocks where helpful."""

CHAT_SYSTEM = """You are an expert code analyst with deep knowledge of the repository that was just analyzed.
You have the full analysis and all file contents available. Answer questions specifically and accurately,
referencing actual code, file names, and implementation details. Use markdown formatting."""


# ---------------------------------------------------------------------------
# Custom exceptions for clear frontend error messages
# ---------------------------------------------------------------------------

class AuthError(Exception):
    """Raised when the AI provider rejects the API key."""

class RepoNotFoundError(Exception):
    """Raised when a GitHub repo is not found or is private without a token."""

class OllamaNotRunningError(Exception):
    """Raised when Ollama is not reachable on localhost:11434."""

class LargeRepoWarning(Exception):
    """Raised (non-fatally) when a repo exceeds LARGE_REPO_THRESHOLD files."""
    def __init__(self, file_count: int):
        self.file_count = file_count
        super().__init__(f"Repo has {file_count} files")


# ---------------------------------------------------------------------------
# RepoAnalyzer
# ---------------------------------------------------------------------------

class RepoAnalyzer:
    """
    Unified analyzer that supports both Claude (Anthropic) and Ollama providers.

    Usage:
        analyzer = RepoAnalyzer(provider="claude", api_key="sk-ant-...")
        file_data, file_tree = await analyzer.read_github_repo(url)
        analysis = await analyzer.analyze(file_data, file_tree)
        async for chunk in analyzer.chat(question, analysis, file_contents):
            ...
        analyzer.cleanup()
    """

    def __init__(
        self,
        provider: str = "claude",           # "claude" or "ollama"
        api_key: str = "",                  # Anthropic key (ignored for Ollama)
        ollama_model: str = "llama3.2",
        ollama_base_url: str = OLLAMA_BASE_URL,  # custom endpoint, e.g. LM Studio
    ):
        self.provider = provider
        self.ollama_model = ollama_model
        self.ollama_base_url = ollama_base_url.rstrip("/")
        self._temp_dir: str | None = None

        # Lazily import anthropic only when using Claude, so the app works
        # even if the user only has Ollama installed.
        if provider == "claude":
            try:
                import anthropic
                # Validate key format early — actual auth checked on first API call
                self._claude = anthropic.Anthropic(api_key=api_key)
            except ImportError:
                raise RuntimeError("anthropic package not installed. Run: pip install anthropic")

    # ------------------------------------------------------------------
    # Cleanup
    # ------------------------------------------------------------------

    def cleanup(self):
        """Remove any temp directory created during GitHub cloning."""
        if self._temp_dir and os.path.exists(self._temp_dir):
            shutil.rmtree(self._temp_dir, ignore_errors=True)
            self._temp_dir = None

    # ------------------------------------------------------------------
    # File system helpers
    # ------------------------------------------------------------------

    def _is_binary(self, path: str) -> bool:
        """Detect binary files by checking for null bytes in the first 8 KB."""
        try:
            with open(path, "rb") as f:
                return b"\x00" in f.read(8192)
        except Exception:
            return True

    def _read_file(self, path: str) -> str | None:
        """
        Read a single file, returning its contents as a string.
        Returns None for binary files, skipped extensions, and read errors.
        Truncates at MAX_LINES_PER_FILE to keep context manageable.
        """
        ext = Path(path).suffix.lower()
        name = Path(path).name

        if ext in SKIP_EXTENSIONS or name in SKIP_FILES:
            return None
        if self._is_binary(path):
            return None

        try:
            with open(path, "r", encoding="utf-8", errors="replace") as f:
                lines = []
                for i, line in enumerate(f):
                    if i >= MAX_LINES_PER_FILE:
                        lines.append(f"\n... [truncated at {MAX_LINES_PER_FILE} lines] ...")
                        break
                    lines.append(line)
            return "".join(lines)
        except Exception:
            return None

    def _walk_repo(self, root: str) -> tuple[dict[str, str], list[str], int]:
        """
        Recursively walk a repo directory.
        Returns:
          - file_contents: dict of rel_path → content (for readable files)
          - all_paths: sorted list of all rel_paths (including skipped files)
          - total_chars: total characters read (for token estimation)
        """
        file_contents: dict[str, str] = {}
        all_paths: list[str] = []
        total_chars = 0

        for dirpath, dirnames, filenames in os.walk(root):
            # Prune skip dirs in-place so os.walk doesn't descend into them
            dirnames[:] = [
                d for d in dirnames
                if d not in SKIP_DIRS and not d.startswith(".")
            ]

            for filename in sorted(filenames):
                full_path = os.path.join(dirpath, filename)
                rel_path = os.path.relpath(full_path, root).replace("\\", "/")
                all_paths.append(rel_path)

                # Stop reading content once we hit the char limit, but keep
                # collecting paths so the file tree stays complete.
                if total_chars < MAX_TOTAL_CHARS:
                    content = self._read_file(full_path)
                    if content is not None:
                        file_contents[rel_path] = content
                        total_chars += len(content)

        return file_contents, sorted(all_paths), total_chars

    # ------------------------------------------------------------------
    # Repo reading
    # ------------------------------------------------------------------

    async def read_local_repo(self, path: str) -> tuple[dict[str, str], list[str], int]:
        """Read a local directory. Raises ValueError if path doesn't exist."""
        if not os.path.isdir(path):
            raise ValueError(f"Path does not exist or is not a directory: {path}")
        return await asyncio.to_thread(self._walk_repo, path)

    async def read_github_repo(
        self, url: str, token: str = ""
    ) -> tuple[dict[str, str], list[str], int]:
        """
        Shallow-clone a GitHub repo to a temp directory and walk it.

        Args:
            url:   Public or private GitHub URL
            token: Personal access token for private repos (never logged)

        Raises:
            RepoNotFoundError if clone fails due to 404 / auth failure
            RuntimeError for other clone failures
        """
        try:
            import git
        except ImportError:
            raise RuntimeError(
                "gitpython not installed. Run: pip install gitpython"
            )

        self._temp_dir = tempfile.mkdtemp(prefix="reposauge_")

        # Embed token into URL for private repo auth (token never logged)
        clone_url = url
        if token:
            # Convert https://github.com/... → https://TOKEN@github.com/...
            clone_url = url.replace("https://", f"https://{token}@")

        try:
            await asyncio.to_thread(
                git.Repo.clone_from,
                clone_url,
                self._temp_dir,
                depth=1,            # shallow clone — much faster
                env={"GIT_TERMINAL_PROMPT": "0"},  # never hang waiting for input
            )
        except Exception as e:
            err = str(e).lower()
            # Detect auth / not-found errors vs other failures
            if any(kw in err for kw in ("not found", "repository not found", "authentication", "403", "404")):
                raise RepoNotFoundError(
                    "Repository not found or access denied. "
                    "For private repos, add a GitHub personal access token."
                )
            raise RuntimeError(f"Failed to clone repository: {e}")

        return await asyncio.to_thread(self._walk_repo, self._temp_dir)

    # ------------------------------------------------------------------
    # Prompt building
    # ------------------------------------------------------------------

    def _build_repo_prompt(self, file_data: dict[str, str], file_tree: list[str]) -> str:
        """Assemble the full repository dump sent to the AI model."""
        parts = ["# Repository File Tree\n```"]
        parts.append("\n".join(file_tree))
        parts.append("```\n\n# File Contents\n")

        for path, content in file_data.items():
            ext = Path(path).suffix.lstrip(".")
            parts.append(f"## {path}\n```{ext}\n{content}\n```\n")

        return "\n".join(parts)

    # ------------------------------------------------------------------
    # Analysis
    # ------------------------------------------------------------------

    async def analyze(self, file_data: dict[str, str], file_tree: list[str]) -> str:
        """Route analysis to the correct provider."""
        if self.provider == "ollama":
            return await self._analyze_ollama(file_data, file_tree)
        return await self._analyze_claude(file_data, file_tree)

    async def _analyze_claude(
        self, file_data: dict[str, str], file_tree: list[str]
    ) -> str:
        """Send repo content to Claude and return the analysis text."""
        repo_content = self._build_repo_prompt(file_data, file_tree)
        try:
            response = await asyncio.to_thread(
                self._claude.messages.create,
                model=CLAUDE_MODEL,
                max_tokens=4096,
                system=SYSTEM_PROMPT,
                messages=[{
                    "role": "user",
                    "content": f"Please analyze this repository:\n\n{repo_content}",
                }],
            )
            return response.content[0].text
        except Exception as e:
            err = str(e).lower()
            if "authentication" in err or "invalid x-api-key" in err or "401" in err:
                raise AuthError("Invalid API key. Check your Anthropic console.")
            raise

    async def _analyze_ollama(
        self, file_data: dict[str, str], file_tree: list[str]
    ) -> str:
        """Send repo content to a local Ollama model and return the analysis text."""
        repo_content = self._build_repo_prompt(file_data, file_tree)
        prompt = f"{SYSTEM_PROMPT}\n\nPlease analyze this repository:\n\n{repo_content}"

        try:
            async with httpx.AsyncClient(timeout=300.0) as client:
                resp = await client.post(
                    f"{self.ollama_base_url}/api/chat",
                    json={
                        "model": self.ollama_model,
                        "messages": [{"role": "user", "content": prompt}],
                        "stream": False,
                    },
                )
                resp.raise_for_status()
                data = resp.json()
                return data["message"]["content"]
        except httpx.ConnectError:
            raise OllamaNotRunningError(
                "Cannot connect to Ollama. Make sure it's running with: ollama serve"
            )
        except Exception as e:
            raise RuntimeError(f"Ollama error: {e}")

    # ------------------------------------------------------------------
    # Streaming chat
    # ------------------------------------------------------------------

    async def chat(
        self, question: str, analysis: str, file_contents: str
    ) -> AsyncGenerator[str, None]:
        """Route chat to the correct provider, yielding text chunks."""
        if self.provider == "ollama":
            async for chunk in self._chat_ollama(question, analysis, file_contents):
                yield chunk
        else:
            async for chunk in self._chat_claude(question, analysis, file_contents):
                yield chunk

    async def _chat_claude(
        self, question: str, analysis: str, file_contents: str
    ) -> AsyncGenerator[str, None]:
        """Stream a follow-up chat response from Claude."""
        context = f"# Previous Analysis\n{analysis}\n\n# Repository Contents\n{file_contents}"
        try:
            with self._claude.messages.stream(
                model=CLAUDE_MODEL,
                max_tokens=2048,
                system=CHAT_SYSTEM,
                messages=[{
                    "role": "user",
                    "content": (
                        f"Context about the repository:\n\n{context}"
                        f"\n\n---\n\nQuestion: {question}"
                    ),
                }],
            ) as stream:
                for text in stream.text_stream:
                    yield text
        except Exception as e:
            err = str(e).lower()
            if "authentication" in err or "invalid x-api-key" in err or "401" in err:
                raise AuthError("Invalid API key. Check your Anthropic console.")
            raise

    async def _chat_ollama(
        self, question: str, analysis: str, file_contents: str
    ) -> AsyncGenerator[str, None]:
        """Stream a follow-up chat response from Ollama, line by line."""
        context = f"# Previous Analysis\n{analysis}\n\n# Repository Contents\n{file_contents}"
        prompt = (
            f"{CHAT_SYSTEM}\n\nContext about the repository:\n\n{context}"
            f"\n\n---\n\nQuestion: {question}"
        )
        try:
            async with httpx.AsyncClient(timeout=300.0) as client:
                async with client.stream(
                    "POST",
                    f"{self.ollama_base_url}/api/chat",
                    json={
                        "model": self.ollama_model,
                        "messages": [{"role": "user", "content": prompt}],
                        "stream": True,
                    },
                ) as resp:
                    resp.raise_for_status()
                    async for line in resp.aiter_lines():
                        if not line:
                            continue
                        try:
                            data = json.loads(line)
                            chunk = data.get("message", {}).get("content", "")
                            if chunk:
                                yield chunk
                            if data.get("done"):
                                break
                        except json.JSONDecodeError:
                            continue
        except httpx.ConnectError:
            raise OllamaNotRunningError(
                "Cannot connect to Ollama. Make sure it's running with: ollama serve"
            )
        except Exception as e:
            raise RuntimeError(f"Ollama error: {e}")

    # ------------------------------------------------------------------
    # Direct comparison (no chat wrapper, longer timeout for large payloads)
    # ------------------------------------------------------------------

    async def compare(self, prompt: str) -> AsyncGenerator[str, None]:
        """Stream a codebase comparison — prompt is sent directly, no context headers."""
        if self.provider == "ollama":
            async for chunk in self._compare_ollama(prompt):
                yield chunk
        else:
            async for chunk in self._compare_claude(prompt):
                yield chunk

    async def _compare_claude(self, prompt: str) -> AsyncGenerator[str, None]:
        """Send the comparison prompt straight to Claude as a single user message."""
        try:
            with self._claude.messages.stream(
                model=CLAUDE_MODEL,
                max_tokens=4096,
                messages=[{"role": "user", "content": prompt}],
            ) as stream:
                for text in stream.text_stream:
                    yield text
        except Exception as e:
            err = str(e).lower()
            if "authentication" in err or "invalid x-api-key" in err or "401" in err:
                raise AuthError("Invalid API key. Check your Anthropic console.")
            raise

    async def _compare_ollama(self, prompt: str) -> AsyncGenerator[str, None]:
        """Stream comparison from a local Ollama model with an extended timeout."""
        try:
            # 600 s — two full analyses can be large; give Ollama plenty of time.
            async with httpx.AsyncClient(timeout=600.0) as client:
                async with client.stream(
                    "POST",
                    f"{self.ollama_base_url}/api/chat",
                    json={
                        "model": self.ollama_model,
                        "messages": [{"role": "user", "content": prompt}],
                        "stream": True,
                    },
                ) as resp:
                    resp.raise_for_status()
                    async for line in resp.aiter_lines():
                        if not line:
                            continue
                        try:
                            data = json.loads(line)
                            chunk = data.get("message", {}).get("content", "")
                            if chunk:
                                yield chunk
                            if data.get("done"):
                                break
                        except json.JSONDecodeError:
                            continue
        except httpx.ConnectError:
            raise OllamaNotRunningError(
                "Cannot connect to Ollama. Make sure it's running with: ollama serve"
            )
        except Exception as e:
            raise RuntimeError(f"Ollama error: {e}")


# ---------------------------------------------------------------------------
# Ollama model listing (called by the /ollama/models endpoint)
# ---------------------------------------------------------------------------

async def list_ollama_models(base_url: str = OLLAMA_BASE_URL) -> dict:
    """
    Check whether Ollama (or compatible server) is reachable and return its installed models.

    Args:
        base_url: The base URL to probe, e.g. "http://localhost:11434" (Ollama),
                  "http://localhost:1234" (LM Studio), "http://localhost:8080" (LocalAI).

    Returns {"running": bool, "models": list[str]} where:
      - running=True means we successfully connected (even if no models installed)
      - running=False means the connection failed (server not started)
    """
    url = base_url.rstrip("/")
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{url}/api/tags")
            resp.raise_for_status()
            data = resp.json()
            models = [m["name"] for m in data.get("models", [])]
            return {"running": True, "models": models}
    except Exception:
        return {"running": False, "models": []}
