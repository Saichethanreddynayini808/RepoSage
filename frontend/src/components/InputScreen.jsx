/**
 * InputScreen.jsx — The landing form for RepoSage.
 *
 * Lets the user configure:
 *   - AI provider: Claude (Anthropic API key required) or Ollama (local, free)
 *   - Repository source: GitHub URL or local folder path
 *   - Optional GitHub token for private repos
 *
 * Emits onAnalysisComplete(data, config) when analysis finishes.
 */

import { useState, useEffect, useCallback } from 'react'

// ─── Styles ─────────────────────────────────────────────────────────────────

const s = {
  container: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '32px 20px',
    overflowY: 'auto',
  },
  card: {
    width: '100%',
    maxWidth: '580px',
    background: '#161b22',
    border: '1px solid #21262d',
    borderRadius: '12px',
    padding: '36px 40px',
  },
  title: { fontSize: '22px', fontWeight: 700, marginBottom: '6px', color: '#e6edf3' },
  subtitle: { fontSize: '13px', color: '#8b949e', marginBottom: '28px', lineHeight: '1.5' },

  sectionLabel: {
    display: 'block',
    fontSize: '11px',
    fontWeight: 700,
    color: '#8b949e',
    marginBottom: '8px',
    textTransform: 'uppercase',
    letterSpacing: '0.6px',
  },
  helperText: {
    fontSize: '11px',
    color: '#6e7681',
    marginTop: '-14px',
    marginBottom: '16px',
    lineHeight: '1.4',
  },
  helperLink: { color: '#58a6ff', textDecoration: 'none' },

  toggleRow: { display: 'flex', gap: '6px', marginBottom: '20px' },
  toggleBtn: (active, color = '#58a6ff') => ({
    flex: 1,
    padding: '8px 12px',
    borderRadius: '6px',
    border: active ? `1px solid ${color}` : '1px solid #30363d',
    background: active ? `${color}18` : '#0d1117',
    color: active ? color : '#8b949e',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: active ? 600 : 400,
    transition: 'all 0.15s',
  }),

  input: {
    width: '100%',
    padding: '10px 14px',
    background: '#0d1117',
    border: '1px solid #30363d',
    borderRadius: '6px',
    color: '#e6edf3',
    fontSize: '14px',
    outline: 'none',
    marginBottom: '6px',
    fontFamily: 'monospace',
    boxSizing: 'border-box',
  },

  select: {
    width: '100%',
    padding: '10px 14px',
    background: '#0d1117',
    border: '1px solid #30363d',
    borderRadius: '6px',
    color: '#e6edf3',
    fontSize: '14px',
    outline: 'none',
    marginBottom: '6px',
    cursor: 'pointer',
    boxSizing: 'border-box',
  },

  ollamaOffline: {
    padding: '10px 14px',
    background: '#161b22',
    border: '1px solid #30363d',
    borderRadius: '6px',
    fontSize: '13px',
    color: '#8b949e',
    marginBottom: '6px',
  },

  divider: { borderTop: '1px solid #21262d', margin: '20px 0' },

  analyzeBtn: (loading) => ({
    width: '100%',
    padding: '12px',
    borderRadius: '8px',
    border: 'none',
    background: loading ? '#1f6feb66' : '#1f6feb',
    color: '#fff',
    fontSize: '15px',
    fontWeight: 600,
    cursor: loading ? 'not-allowed' : 'pointer',
    marginTop: '4px',
    transition: 'background 0.15s',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
  }),

  progressBox: {
    marginTop: '20px',
    padding: '14px 16px',
    background: '#0d1117',
    border: '1px solid #21262d',
    borderRadius: '8px',
  },
  progressStep: (active, done) => ({
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '5px 0',
    color: done ? '#3fb950' : active ? '#e6edf3' : '#484f58',
    fontSize: '13px',
  }),
  dot: (active, done) => ({
    width: '7px',
    height: '7px',
    borderRadius: '50%',
    flexShrink: 0,
    background: done ? '#3fb950' : active ? '#58a6ff' : '#30363d',
    boxShadow: active ? '0 0 6px #58a6ff' : 'none',
    transition: 'all 0.2s',
  }),

  tokenEstimate: {
    marginTop: '12px',
    padding: '10px 14px',
    background: '#1f6feb11',
    border: '1px solid #1f6feb33',
    borderRadius: '6px',
    fontSize: '12px',
    color: '#79c0ff',
  },

  warningBox: {
    marginTop: '16px',
    padding: '14px 16px',
    background: '#d2930022',
    border: '1px solid #d2930066',
    borderRadius: '8px',
    fontSize: '13px',
    color: '#e3b341',
    lineHeight: '1.5',
  },
  warnActions: { display: 'flex', gap: '8px', marginTop: '12px' },
  warnBtn: (primary) => ({
    flex: 1,
    padding: '8px',
    borderRadius: '6px',
    border: primary ? 'none' : '1px solid #30363d',
    background: primary ? '#d29300' : 'transparent',
    color: primary ? '#000' : '#8b949e',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: primary ? 600 : 400,
  }),

  error: {
    marginTop: '14px',
    padding: '12px 16px',
    background: '#da363322',
    border: '1px solid #da363355',
    borderRadius: '8px',
    color: '#f85149',
    fontSize: '13px',
    lineHeight: '1.5',
  },
}

// ─── Progress steps (filtered by context) ────────────────────────────────────

const ALL_STEPS = [
  { key: 'cloning',  label: 'Cloning repository' },
  { key: 'reading',  label: 'Reading files' },
  { key: 'sending',  label: 'Sending to AI' },
  { key: 'done',     label: 'Analysis complete' },
]

// ─── Component ───────────────────────────────────────────────────────────────

export default function InputScreen({ onAnalysisComplete }) {
  // AI provider
  const [provider, setProvider] = useState(
    () => localStorage.getItem('reposauge_provider') || 'claude'
  )
  const [apiKey, setApiKey] = useState('')
  const [ollamaModels, setOllamaModels] = useState([])
  const [ollamaRunning, setOllamaRunning] = useState(null) // null = checking
  const [ollamaModel, setOllamaModel] = useState('')

  // Repo source
  const [sourceType, setSourceType] = useState('github')
  const [path, setPath] = useState('')
  const [githubToken, setGithubToken] = useState('')
  const [showToken, setShowToken] = useState(false)

  // State
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(null)
  const [tokenEstimate, setTokenEstimate] = useState(null)
  const [largeRepoInfo, setLargeRepoInfo] = useState(null) // { file_count, estimated_tokens, message }
  const [error, setError] = useState(null)

  // ── Persist provider choice ──────────────────────────────────────────────
  function switchProvider(p) {
    setProvider(p)
    localStorage.setItem('reposauge_provider', p)
    setError(null)
  }

  // ── Fetch Ollama models when provider switches to ollama ─────────────────
  useEffect(() => {
    if (provider !== 'ollama') return
    setOllamaRunning(null)
    fetch('/ollama/models')
      .then((r) => r.json())
      .then((data) => {
        setOllamaRunning(data.running)
        setOllamaModels(data.models)
        if (data.models.length > 0 && !ollamaModel) {
          setOllamaModel(data.models[0])
        }
      })
      .catch(() => {
        setOllamaRunning(false)
        setOllamaModels([])
      })
  }, [provider])

  // ── Ctrl+Enter to submit ────────────────────────────────────────────────
  const handleGlobalKeyDown = useCallback(
    (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !loading) {
        e.preventDefault()
        handleAnalyze()
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [loading, apiKey, provider, path, sourceType, githubToken, ollamaModel]
  )
  useEffect(() => {
    document.addEventListener('keydown', handleGlobalKeyDown)
    return () => document.removeEventListener('keydown', handleGlobalKeyDown)
  }, [handleGlobalKeyDown])

  // ── Core analyze function ────────────────────────────────────────────────
  async function handleAnalyze(force = false) {
    // Validation
    if (provider === 'claude' && !apiKey.trim()) {
      setError('Please enter your Anthropic API key.')
      return
    }
    if (provider === 'ollama' && !ollamaRunning) {
      setError("Ollama not detected. Make sure it's running with 'ollama serve'.")
      return
    }
    if (!path.trim()) {
      setError('Please enter a repository path or URL.')
      return
    }

    setError(null)
    setLargeRepoInfo(null)
    setTokenEstimate(null)
    setLoading(true)
    setProgress({ status: sourceType === 'github' ? 'cloning' : 'reading', message: 'Starting...' })

    try {
      const body = {
        provider,
        api_key: apiKey,
        ollama_model: ollamaModel,
        source_type: sourceType,
        path: path.trim(),
        github_token: githubToken,
        force,
      }

      const response = await fetch('/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!response.ok) throw new Error(`Server error: ${response.status}`)

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        const lines = buffer.split('\n')
        buffer = lines.pop() // keep incomplete line in buffer

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = JSON.parse(line.slice(6))

          if (data.status === 'error') {
            throw new Error(data.message)
          }

          if (data.status === 'large_repo') {
            // Backend wants user confirmation — stop loading, show warning
            setLoading(false)
            setProgress(null)
            setLargeRepoInfo(data)
            return
          }

          // Show token estimate once we have it
          if (data.estimated_tokens) {
            setTokenEstimate(data.estimated_tokens)
          }

          setProgress({ status: data.status, message: data.message })

          if (data.status === 'done') {
            // Serialize file contents dict → string for chat context
            const fileContentsStr = Object.entries(data.file_contents)
              .map(([p, c]) => `## ${p}\n\`\`\`\n${c}\n\`\`\``)
              .join('\n\n')

            onAnalysisComplete(
              {
                analysis: data.analysis,
                fileTree: data.file_tree,
                fileContents: fileContentsStr,
                estimatedTokens: data.estimated_tokens,
              },
              { provider, apiKey, ollamaModel }
            )
            return
          }
        }
      }
    } catch (e) {
      setError(e.message || 'Something went wrong. Check the console for details.')
    } finally {
      setLoading(false)
      setProgress(null)
    }
  }

  // Computed progress display
  const visibleSteps = ALL_STEPS.filter(
    (step) => sourceType === 'github' || step.key !== 'cloning'
  )
  const activeIdx = progress ? visibleSteps.findIndex((s) => s.key === progress.status) : -1

  return (
    <div style={s.container}>
      <div style={s.card}>
        <div style={s.title}>Analyze a Repository</div>
        <div style={s.subtitle}>
          Get an AI-powered deep-dive into any codebase. Ask follow-up questions after.
        </div>

        {/* ── AI Provider ─────────────────────────────────────────────── */}
        <label style={s.sectionLabel}>AI Provider</label>
        <div style={s.toggleRow}>
          <button
            style={s.toggleBtn(provider === 'claude', '#58a6ff')}
            onClick={() => switchProvider('claude')}
            disabled={loading}
          >
            ☁ Claude API
          </button>
          <button
            style={s.toggleBtn(provider === 'ollama', '#a371f7')}
            onClick={() => switchProvider('ollama')}
            disabled={loading}
          >
            🦙 Local Ollama
          </button>
        </div>

        {/* ── Claude fields ────────────────────────────────────────────── */}
        {provider === 'claude' && (
          <>
            <label style={s.sectionLabel}>Anthropic API Key</label>
            <input
              style={s.input}
              type="password"
              placeholder="sk-ant-..."
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              disabled={loading}
              autoComplete="off"
              spellCheck={false}
            />
            <div style={s.helperText}>
              Never stored.{' '}
              <a
                href="https://console.anthropic.com/settings/keys"
                target="_blank"
                rel="noreferrer"
                style={s.helperLink}
              >
                Get a key →
              </a>
            </div>
          </>
        )}

        {/* ── Ollama fields ────────────────────────────────────────────── */}
        {provider === 'ollama' && (
          <>
            <label style={s.sectionLabel}>Local Model</label>
            {ollamaRunning === null && (
              <div style={s.ollamaOffline}>Checking for Ollama...</div>
            )}
            {ollamaRunning === false && (
              <div style={{ ...s.ollamaOffline, color: '#f85149', borderColor: '#da363355' }}>
                Ollama not detected.{' '}
                <a href="https://ollama.com" target="_blank" rel="noreferrer" style={s.helperLink}>
                  Install Ollama
                </a>{' '}
                then run <code style={{ fontFamily: 'monospace', fontSize: '12px' }}>ollama serve</code>
              </div>
            )}
            {/* Ollama is running but no models installed yet */}
            {ollamaRunning && ollamaModels.length === 0 && (
              <div style={{ ...s.ollamaOffline, color: '#e3b341', borderColor: '#d2930055' }}>
                Ollama is running but no models are installed.{' '}
                Run: <code style={{ fontFamily: 'monospace', fontSize: '12px' }}>ollama pull llama3.2</code>
              </div>
            )}
            {ollamaRunning && ollamaModels.length > 0 && (
              <select
                style={s.select}
                value={ollamaModel}
                onChange={(e) => setOllamaModel(e.target.value)}
                disabled={loading}
              >
                {ollamaModels.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            )}
            <div style={s.helperText}>
              Free, runs locally. Pull models with{' '}
              <code style={{ fontFamily: 'monospace', fontSize: '11px' }}>ollama pull llama3.2</code>
            </div>
          </>
        )}

        <div style={s.divider} />

        {/* ── Repository Source ────────────────────────────────────────── */}
        <label style={s.sectionLabel}>Repository Source</label>
        <div style={s.toggleRow}>
          <button
            style={s.toggleBtn(sourceType === 'github', '#58a6ff')}
            onClick={() => setSourceType('github')}
            disabled={loading}
          >
            GitHub URL
          </button>
          <button
            style={s.toggleBtn(sourceType === 'local', '#58a6ff')}
            onClick={() => setSourceType('local')}
            disabled={loading}
          >
            Local Path
          </button>
        </div>

        <label style={s.sectionLabel}>
          {sourceType === 'github' ? 'GitHub Repository URL' : 'Local Folder Path'}
        </label>
        <input
          style={s.input}
          type="text"
          placeholder={
            sourceType === 'github'
              ? 'https://github.com/owner/repo'
              : '/Users/you/projects/my-app'
          }
          value={path}
          onChange={(e) => setPath(e.target.value)}
          disabled={loading}
          autoComplete="off"
          spellCheck={false}
        />

        {/* ── GitHub Token (collapsible) ───────────────────────────────── */}
        {sourceType === 'github' && (
          <>
            <div style={s.helperText}>
              <button
                onClick={() => setShowToken((v) => !v)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#58a6ff',
                  cursor: 'pointer',
                  fontSize: '11px',
                  padding: 0,
                }}
              >
                {showToken ? '▼' : '▶'} Add GitHub Token (for private repos)
              </button>
            </div>
            {showToken && (
              <>
                <input
                  style={{ ...s.input, marginTop: '4px' }}
                  type="password"
                  placeholder="ghp_..."
                  value={githubToken}
                  onChange={(e) => setGithubToken(e.target.value)}
                  disabled={loading}
                  autoComplete="off"
                  spellCheck={false}
                />
                <div style={s.helperText}>
                  Stored in memory only. Never written to disk.{' '}
                  <a
                    href="https://github.com/settings/tokens"
                    target="_blank"
                    rel="noreferrer"
                    style={s.helperLink}
                  >
                    Get a token →
                  </a>
                </div>
              </>
            )}
          </>
        )}

        {/* ── Submit button ────────────────────────────────────────────── */}
        <button
          style={s.analyzeBtn(loading)}
          onClick={() => handleAnalyze(false)}
          disabled={loading}
        >
          {loading ? (
            <>
              <Spinner /> Analyzing...
            </>
          ) : (
            'Analyze Repository →'
          )}
        </button>
        <div style={{ textAlign: 'center', fontSize: '11px', color: '#484f58', marginTop: '6px' }}>
          Ctrl+Enter to submit
        </div>

        {/* ── Progress ─────────────────────────────────────────────────── */}
        {loading && progress && (
          <div style={s.progressBox}>
            {visibleSteps.map((step, i) => {
              const isDone = i < activeIdx
              const isActive = i === activeIdx
              return (
                <div key={step.key} style={s.progressStep(isActive, isDone)}>
                  <div style={s.dot(isActive, isDone)} />
                  {isDone ? `✓ ${step.label}` : isActive ? `${step.label}...` : step.label}
                </div>
              )
            })}
            {tokenEstimate && (
              <div style={s.tokenEstimate}>
                ~{tokenEstimate.toLocaleString()} tokens
              </div>
            )}
          </div>
        )}

        {/* ── Large repo warning ───────────────────────────────────────── */}
        {largeRepoInfo && (
          <div style={s.warningBox}>
            <strong>⚠ Large Repository</strong>
            <br />
            {largeRepoInfo.message}
            <br />
            <span style={{ fontSize: '12px', color: '#b08800' }}>
              Proceed anyway? This may be slow or hit context limits.
            </span>
            <div style={s.warnActions}>
              <button style={s.warnBtn(false)} onClick={() => setLargeRepoInfo(null)}>
                Cancel
              </button>
              <button style={s.warnBtn(true)} onClick={() => { setLargeRepoInfo(null); handleAnalyze(true) }}>
                Analyze Anyway →
              </button>
            </div>
          </div>
        )}

        {/* ── Error ────────────────────────────────────────────────────── */}
        {error && <div style={s.error}>⚠ {error}</div>}
      </div>
    </div>
  )
}

/** Minimal inline spinner SVG so we have no extra deps. */
function Spinner() {
  return (
    <svg
      width="14" height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      style={{ animation: 'spin 0.8s linear infinite' }}
    >
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
    </svg>
  )
}
