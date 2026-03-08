"""
main.py — FastAPI application for RepoSage.

Endpoints:
  POST /analyze      — SSE stream: clone/read repo → analyze with AI
  POST /chat         — SSE stream: follow-up question with full context
  GET  /ollama/models — List locally installed Ollama models
  GET  /health       — Simple liveness check
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import json

from analyzer import (
    RepoAnalyzer,
    list_ollama_models,
    AuthError,
    RepoNotFoundError,
    OllamaNotRunningError,
    LARGE_REPO_THRESHOLD,
    OLLAMA_BASE_URL,
)

app = FastAPI(title="RepoSage API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Request models
# ---------------------------------------------------------------------------

class AnalyzeRequest(BaseModel):
    # AI provider
    provider: str = "claude"                        # "claude" or "ollama"
    api_key: str = ""                               # Anthropic key (ignored for Ollama)
    ollama_model: str = "llama3.2"                  # Ollama model name (ignored for Claude)
    ollama_base_url: str = "http://localhost:11434"  # Custom endpoint for LM Studio, etc.

    # Repository source
    source_type: str                # "github" or "local"
    path: str                       # GitHub URL or absolute local path
    github_token: str = ""          # Optional PAT for private GitHub repos

    # If True, skip the large-repo guard and proceed anyway
    force: bool = False


class ChatRequest(BaseModel):
    provider: str = "claude"
    api_key: str = ""
    ollama_model: str = "llama3.2"
    ollama_base_url: str = "http://localhost:11434"
    question: str
    analysis: str
    file_contents: str


class CompareRequest(BaseModel):
    provider: str = "claude"
    api_key: str = ""
    ollama_model: str = "llama3.2"
    ollama_base_url: str = "http://localhost:11434"
    analysis_a: str
    analysis_b: str
    repo_name_a: str = "Repo A"
    repo_name_b: str = "Repo B"


# ---------------------------------------------------------------------------
# Error → user-friendly message mapping
# ---------------------------------------------------------------------------

def friendly_error(e: Exception) -> str:
    """Convert exceptions into clear, actionable messages for the frontend."""
    if isinstance(e, AuthError):
        return str(e)
    if isinstance(e, RepoNotFoundError):
        return str(e)
    if isinstance(e, OllamaNotRunningError):
        return str(e)

    msg = str(e).lower()
    if "authentication" in msg or "invalid x-api-key" in msg or "401" in msg:
        return "Invalid API key. Check your Anthropic console."
    if "not found" in msg or "repository not found" in msg or "404" in msg:
        return "Repository not found or private. Add a GitHub token for private repos."
    if "connect" in msg and "11434" in msg:
        return "Ollama not detected. Make sure it's running with 'ollama serve'."
    if "rate limit" in msg or "429" in msg:
        return "Rate limit hit. Wait a moment and try again."
    if "context_length" in msg or "too long" in msg:
        return "Repository is too large for the model's context. Try a smaller repo."
    return f"Error: {e}"


def sse(data: dict) -> str:
    """Format a dict as a Server-Sent Event data line."""
    return f"data: {json.dumps(data)}\n\n"


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.post("/analyze")
async def analyze_repo(request: AnalyzeRequest):
    """
    SSE stream that:
      1. Clones or reads the repo
      2. Optionally warns about large repos (>500 files) unless force=True
      3. Sends file content to the selected AI provider
      4. Streams progress events and the final analysis result
    """
    async def generate():
        analyzer = RepoAnalyzer(
            provider=request.provider,
            api_key=request.api_key,
            ollama_model=request.ollama_model,
            ollama_base_url=request.ollama_base_url,
        )
        try:
            # --- Step 1: Clone / read files ---
            if request.source_type == "github":
                yield sse({"status": "cloning", "message": "Cloning repository..."})
                file_data, file_tree, total_chars = await analyzer.read_github_repo(
                    request.path, token=request.github_token
                )
            else:
                yield sse({"status": "reading", "message": "Reading repository files..."})
                file_data, file_tree, total_chars = await analyzer.read_local_repo(request.path)

            file_count = len(file_tree)
            readable_count = len(file_data)

            # --- Step 2: Large repo guard ---
            if file_count > LARGE_REPO_THRESHOLD and not request.force:
                estimated_tokens = total_chars // 4
                yield sse({
                    "status": "large_repo",
                    "file_count": file_count,
                    "estimated_tokens": estimated_tokens,
                    "message": (
                        f"This repo has {file_count} files (~{estimated_tokens:,} tokens). "
                        "Analysis may be slow or hit context limits."
                    ),
                })
                return

            # Emit token estimate so the frontend can show it
            estimated_tokens = total_chars // 4
            provider_label = "Ollama" if request.provider == "ollama" else "Claude"
            yield sse({
                "status": "sending",
                "message": f"Sending {readable_count} files to {provider_label}...",
                "estimated_tokens": estimated_tokens,
                "file_count": file_count,
            })

            # --- Step 3: AI analysis ---
            analysis = await analyzer.analyze(file_data, file_tree)

            yield sse({
                "status": "done",
                "message": "Analysis complete!",
                "analysis": analysis,
                "file_tree": file_tree,
                "file_contents": file_data,
                "estimated_tokens": estimated_tokens,
            })

        except Exception as e:
            yield sse({"status": "error", "message": friendly_error(e)})
        finally:
            # Always clean up temp dirs even if analysis crashed mid-stream
            analyzer.cleanup()

    return StreamingResponse(generate(), media_type="text/event-stream")


@app.post("/chat")
async def chat(request: ChatRequest):
    """
    SSE stream for follow-up chat questions.
    Sends the original analysis + full file contents as context on every question.
    """
    async def generate():
        analyzer = RepoAnalyzer(
            provider=request.provider,
            api_key=request.api_key,
            ollama_model=request.ollama_model,
            ollama_base_url=request.ollama_base_url,
        )
        try:
            async for chunk in analyzer.chat(
                request.question, request.analysis, request.file_contents
            ):
                yield sse({"chunk": chunk})
            yield sse({"done": True})
        except Exception as e:
            yield sse({"error": friendly_error(e)})
        finally:
            analyzer.cleanup()

    return StreamingResponse(generate(), media_type="text/event-stream")


@app.get("/ollama/models")
async def ollama_models(base_url: str = OLLAMA_BASE_URL):
    """
    Return connectivity status and installed model list for the given base URL.
    Accepts ?base_url=http://localhost:1234 for LM Studio, LocalAI, etc.
    'running' is True even when the server is up but has no models installed.
    """
    result = await list_ollama_models(base_url=base_url)
    return result  # already {"running": bool, "models": [...]}


COMPARE_PROMPT = """You are an expert software architect. Compare these two codebases based on the analyses below.

Highlight differences in:
1. **Tech Stack** — languages, frameworks, libraries, tooling
2. **Architecture** — structure, patterns, modularity, separation of concerns
3. **Code Patterns** — conventions, style, quality, test coverage signals
4. **Complexity** — size, coupling, cognitive load for a new developer
5. **Strengths & Weaknesses** — what each does well and where it falls short
6. **Best Suited For** — what use-cases or teams each codebase is better suited for

Conclude with a brief verdict: which is more maintainable, and why.

---

## {name_a} Analysis

{analysis_a}

---

## {name_b} Analysis

{analysis_b}
"""


@app.post("/compare")
async def compare_repos(request: CompareRequest):
    """
    SSE stream that sends both analyses to the AI and streams a comparison report.
    """
    async def generate():
        analyzer = RepoAnalyzer(
            provider=request.provider,
            api_key=request.api_key,
            ollama_model=request.ollama_model,
            ollama_base_url=request.ollama_base_url,
        )
        prompt = COMPARE_PROMPT.format(
            name_a=request.repo_name_a,
            name_b=request.repo_name_b,
            analysis_a=request.analysis_a,
            analysis_b=request.analysis_b,
        )
        try:
            async for chunk in analyzer.compare(prompt):
                yield sse({"chunk": chunk})
            yield sse({"done": True})
        except Exception as e:
            yield sse({"error": friendly_error(e)})
        finally:
            analyzer.cleanup()

    return StreamingResponse(generate(), media_type="text/event-stream")


@app.get("/health")
async def health():
    return {"status": "ok"}
