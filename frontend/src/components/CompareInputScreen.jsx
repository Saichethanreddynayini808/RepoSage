/**
 * CompareInputScreen.jsx — Configuration form for Compare Mode.
 *
 * Pure form component: validates inputs and calls onCompareStart({ repoAConfig,
 * repoBConfig, aiConfig }) immediately — no async work here.  The actual
 * analysis and progress tracking live in App.jsx so the compare view can render
 * skeletons while each repo streams in.
 */

import { useState, useEffect } from 'react'

// ─── Styles ─────────────────────────────────────────────────────────────────

const s = {
  container: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    padding: '24px 20px 32px',
    overflowY: 'auto',
  },

  providerCard: {
    width: '100%',
    maxWidth: '700px',
    margin: '0 auto 20px',
    background: '#161b22',
    border: '1px solid #21262d',
    borderRadius: '10px',
    padding: '20px 28px',
  },

  columns: {
    display: 'flex',
    gap: '16px',
    width: '100%',
    maxWidth: '1100px',
    margin: '0 auto',
    flexWrap: 'wrap',
  },

  repoCard: {
    flex: '1 1 420px',
    background: '#161b22',
    border: '1px solid #21262d',
    borderRadius: '10px',
    padding: '20px 28px',
    minWidth: '300px',
  },

  badge: (color) => ({
    display: 'inline-block',
    padding: '2px 10px',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: 700,
    background: `${color}22`,
    color,
    border: `1px solid ${color}55`,
    marginRight: '8px',
  }),
  repoTitle: {
    fontSize: '15px',
    fontWeight: 600,
    color: '#e6edf3',
    display: 'inline',
  },
  repoCardHeader: { marginBottom: '16px' },

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
    marginTop: '-10px',
    marginBottom: '14px',
    lineHeight: '1.4',
  },
  helperLink: { color: '#58a6ff', textDecoration: 'none' },

  toggleRow: { display: 'flex', gap: '6px', marginBottom: '16px' },
  toggleBtn: (active, color = '#58a6ff') => ({
    flex: 1,
    padding: '7px 10px',
    borderRadius: '6px',
    border: active ? `1px solid ${color}` : '1px solid #30363d',
    background: active ? `${color}18` : '#0d1117',
    color: active ? color : '#8b949e',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: active ? 600 : 400,
    transition: 'all 0.15s',
  }),

  input: {
    width: '100%',
    padding: '9px 12px',
    background: '#0d1117',
    border: '1px solid #30363d',
    borderRadius: '6px',
    color: '#e6edf3',
    fontSize: '13px',
    outline: 'none',
    marginBottom: '6px',
    fontFamily: 'monospace',
    boxSizing: 'border-box',
  },
  select: {
    width: '100%',
    padding: '9px 12px',
    background: '#0d1117',
    border: '1px solid #30363d',
    borderRadius: '6px',
    color: '#e6edf3',
    fontSize: '13px',
    outline: 'none',
    marginBottom: '6px',
    cursor: 'pointer',
    boxSizing: 'border-box',
  },
  ollamaOffline: {
    padding: '9px 12px',
    background: '#161b22',
    border: '1px solid #30363d',
    borderRadius: '6px',
    fontSize: '12px',
    color: '#8b949e',
    marginBottom: '6px',
  },
  advancedToggle: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    background: 'none',
    border: 'none',
    color: '#6e7681',
    cursor: 'pointer',
    fontSize: '11px',
    padding: '4px 0',
    marginBottom: '8px',
  },
  advancedBox: {
    marginBottom: '12px',
    padding: '10px 12px',
    background: '#0d111788',
    border: '1px solid #21262d',
    borderRadius: '6px',
  },
  urlHelperText: { fontSize: '11px', color: '#6e7681', marginTop: '4px', lineHeight: '1.5' },

  submitRow: { width: '100%', maxWidth: '1100px', margin: '20px auto 0' },
  compareBtn: {
    width: '100%',
    padding: '12px',
    borderRadius: '8px',
    border: 'none',
    background: '#1f6feb',
    color: '#fff',
    fontSize: '15px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'background 0.15s',
  },

  error: {
    marginTop: '12px',
    padding: '10px 14px',
    background: '#da363322',
    border: '1px solid #da363355',
    borderRadius: '8px',
    color: '#f85149',
    fontSize: '13px',
    maxWidth: '1100px',
    width: '100%',
    boxSizing: 'border-box',
    margin: '12px auto 0',
  },
}

// ─── Single-repo sub-form ─────────────────────────────────────────────────────

function RepoForm({ label, color, state, onChange }) {
  const { sourceType, path, githubToken, showToken } = state
  const set = (key, val) => onChange({ ...state, [key]: val })

  return (
    <div style={s.repoCard}>
      <div style={s.repoCardHeader}>
        <span style={s.badge(color)}>{label}</span>
        <span style={s.repoTitle}>Repository {label}</span>
      </div>

      <label style={s.sectionLabel}>Source</label>
      <div style={s.toggleRow}>
        <button style={s.toggleBtn(sourceType === 'github', color)} onClick={() => set('sourceType', 'github')}>
          GitHub URL
        </button>
        <button style={s.toggleBtn(sourceType === 'local', color)} onClick={() => set('sourceType', 'local')}>
          Local Path
        </button>
      </div>

      <label style={s.sectionLabel}>
        {sourceType === 'github' ? 'GitHub Repository URL' : 'Local Folder Path'}
      </label>
      <input
        style={s.input}
        type="text"
        placeholder={sourceType === 'github' ? 'https://github.com/owner/repo' : '/Users/you/projects/my-app'}
        value={path}
        onChange={(e) => set('path', e.target.value)}
        autoComplete="off"
        spellCheck={false}
      />

      {sourceType === 'github' && (
        <>
          <div style={{ ...s.helperText, marginTop: '2px' }}>
            <button
              onClick={() => set('showToken', !showToken)}
              style={{ background: 'none', border: 'none', color: '#58a6ff', cursor: 'pointer', fontSize: '11px', padding: 0 }}
            >
              {showToken ? '▼' : '▶'} Add GitHub Token (private repos)
            </button>
          </div>
          {showToken && (
            <input
              style={{ ...s.input, marginTop: '2px' }}
              type="password"
              placeholder="ghp_..."
              value={githubToken}
              onChange={(e) => set('githubToken', e.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
          )}
        </>
      )}
    </div>
  )
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function CompareInputScreen({ onCompareStart }) {
  // Shared AI provider
  const [provider, setProvider] = useState(
    () => localStorage.getItem('reposauge_provider') || 'claude'
  )
  const [apiKey, setApiKey] = useState('')
  const [ollamaModels, setOllamaModels] = useState([])
  const [ollamaRunning, setOllamaRunning] = useState(null)
  const [ollamaModel, setOllamaModel] = useState('')
  const [ollamaBaseUrl, setOllamaBaseUrl] = useState(
    () => localStorage.getItem('reposauge_ollama_url') || 'http://localhost:11434'
  )
  const [showAdvanced, setShowAdvanced] = useState(false)

  // Repo A / B form state
  const [repoA, setRepoA] = useState({ sourceType: 'github', path: '', githubToken: '', showToken: false })
  const [repoB, setRepoB] = useState({ sourceType: 'github', path: '', githubToken: '', showToken: false })

  const [error, setError] = useState(null)

  function switchProvider(p) {
    setProvider(p)
    localStorage.setItem('reposauge_provider', p)
    setError(null)
  }

  function handleBaseUrlChange(url) {
    setOllamaBaseUrl(url)
    localStorage.setItem('reposauge_ollama_url', url)
  }

  useEffect(() => {
    if (provider !== 'ollama') return
    setOllamaRunning(null)
    fetch(`/ollama/models?base_url=${encodeURIComponent(ollamaBaseUrl)}`)
      .then((r) => r.json())
      .then((data) => {
        setOllamaRunning(data.running)
        setOllamaModels(data.models)
        if (data.models.length > 0 && !ollamaModel) setOllamaModel(data.models[0])
      })
      .catch(() => { setOllamaRunning(false); setOllamaModels([]) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, ollamaBaseUrl])

  function handleCompare() {
    if (provider === 'claude' && !apiKey.trim()) {
      setError('Please enter your Anthropic API key.')
      return
    }
    if (provider === 'ollama' && !ollamaRunning) {
      setError("Ollama not detected. Make sure it's running with 'ollama serve'.")
      return
    }
    if (!repoA.path.trim() || !repoB.path.trim()) {
      setError('Please enter URLs or paths for both repositories.')
      return
    }
    setError(null)

    const aiConfig = { provider, apiKey, ollamaModel, ollamaBaseUrl }
    const shared = { provider, apiKey, ollamaModel, ollamaBaseUrl }

    onCompareStart({
      repoAConfig: { ...shared, sourceType: repoA.sourceType, path: repoA.path, githubToken: repoA.githubToken },
      repoBConfig: { ...shared, sourceType: repoB.sourceType, path: repoB.path, githubToken: repoB.githubToken },
      aiConfig,
    })
  }

  return (
    <div style={s.container}>
      {/* ── Shared AI Provider ───────────────────────────────────────── */}
      <div style={s.providerCard}>
        <label style={s.sectionLabel}>AI Provider</label>
        <div style={s.toggleRow}>
          <button style={s.toggleBtn(provider === 'claude', '#58a6ff')} onClick={() => switchProvider('claude')}>
            ☁ Claude API
          </button>
          <button style={s.toggleBtn(provider === 'ollama', '#a371f7')} onClick={() => switchProvider('ollama')}>
            🦙 Local Ollama
          </button>
        </div>

        {provider === 'claude' && (
          <>
            <label style={s.sectionLabel}>Anthropic API Key</label>
            <input
              style={s.input}
              type="password"
              placeholder="sk-ant-..."
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
            <div style={s.helperText}>
              <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer" style={s.helperLink}>
                Get a key →
              </a>
            </div>
          </>
        )}

        {provider === 'ollama' && (
          <>
            <label style={s.sectionLabel}>Local Model</label>
            {ollamaRunning === null && <div style={s.ollamaOffline}>Checking for Ollama...</div>}
            {ollamaRunning === false && (
              <div style={{ ...s.ollamaOffline, color: '#f85149', borderColor: '#da363355' }}>
                Ollama not detected.{' '}
                <a href="https://ollama.com" target="_blank" rel="noreferrer" style={s.helperLink}>Install Ollama</a>
                {' '}then run <code style={{ fontFamily: 'monospace', fontSize: '12px' }}>ollama serve</code>
              </div>
            )}
            {ollamaRunning && ollamaModels.length === 0 && (
              <div style={{ ...s.ollamaOffline, color: '#e3b341', borderColor: '#d2930055' }}>
                Ollama running but no models installed. Run:{' '}
                <code style={{ fontFamily: 'monospace', fontSize: '12px' }}>ollama pull llama3.2</code>
              </div>
            )}
            {ollamaRunning && ollamaModels.length > 0 && (
              <select style={s.select} value={ollamaModel} onChange={(e) => setOllamaModel(e.target.value)}>
                {ollamaModels.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            )}
            <button style={s.advancedToggle} onClick={() => setShowAdvanced((v) => !v)}>
              <span style={{ fontSize: '9px' }}>{showAdvanced ? '▼' : '▶'}</span> Advanced
            </button>
            {showAdvanced && (
              <div style={s.advancedBox}>
                <label style={{ ...s.sectionLabel, marginBottom: '6px' }}>Base URL</label>
                <input
                  style={{ ...s.input, marginBottom: '4px' }}
                  type="text"
                  placeholder="http://localhost:11434"
                  value={ollamaBaseUrl}
                  onChange={(e) => handleBaseUrlChange(e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                />
                <div style={s.urlHelperText}>
                  Ollama: 11434 &nbsp;|&nbsp; LM Studio: 1234 &nbsp;|&nbsp; LocalAI: 8080 &nbsp;|&nbsp; Jan.ai: 1337
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Repo columns ─────────────────────────────────────────────── */}
      <div style={s.columns}>
        <RepoForm label="A" color="#58a6ff" state={repoA} onChange={setRepoA} />
        <RepoForm label="B" color="#a371f7" state={repoB} onChange={setRepoB} />
      </div>

      {/* ── Submit ───────────────────────────────────────────────────── */}
      <div style={s.submitRow}>
        <button style={s.compareBtn} onClick={handleCompare}>
          Compare Both →
        </button>
      </div>

      {error && <div style={s.error}>⚠ {error}</div>}
    </div>
  )
}
