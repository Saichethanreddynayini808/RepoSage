/**
 * App.jsx — Root component for RepoSage.
 *
 * Manages top-level screen routing (input ↔ analysis ↔ compare-results) and
 * owns the compare loading state so each repo panel can stream in independently
 * while skeletons are shown for the one still in-flight.
 */

import { useState } from 'react'
import InputScreen from './components/InputScreen.jsx'
import Analysis from './components/Analysis.jsx'
import CompareInputScreen from './components/CompareInputScreen.jsx'
import CompareAnalysis from './components/CompareAnalysis.jsx'

// ---------------------------------------------------------------------------
// Module-level helper — reads one /analyze SSE stream to completion.
// Returns the structured data object used by Analysis / CompareAnalysis.
// ---------------------------------------------------------------------------

async function analyzeRepo(config, onProgress) {
  const { provider, apiKey, ollamaModel, ollamaBaseUrl, sourceType, path, githubToken } = config
  const response = await fetch('/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider,
      api_key: apiKey,
      ollama_model: ollamaModel,
      ollama_base_url: ollamaBaseUrl,
      source_type: sourceType,
      path: path.trim(),
      github_token: githubToken || '',
      force: true,  // compare mode skips large-repo guard
    }),
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
    buffer = lines.pop()

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const data = JSON.parse(line.slice(6))
      if (data.status === 'error') throw new Error(data.message)
      onProgress?.(data)
      if (data.status === 'done') {
        const fileContentsStr = Object.entries(data.file_contents)
          .map(([p, c]) => `## ${p}\n\`\`\`\n${c}\n\`\`\``)
          .join('\n\n')
        const repoName = config.path.trim().split('/').filter(Boolean).pop() || 'Repo'
        return {
          analysis: data.analysis,
          fileTree: data.file_tree,
          fileContents: fileContentsStr,
          estimatedTokens: data.estimated_tokens,
          repoName,
        }
      }
    }
  }
  throw new Error('Stream ended without a result')
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = {
  app: {
    height: '100vh',
    display: 'flex',
    flexDirection: 'column',
    background: '#0d1117',
    color: '#e6edf3',
  },
  header: {
    padding: '14px 24px',
    borderBottom: '1px solid #21262d',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    background: '#161b22',
    flexShrink: 0,
  },
  logo: {
    fontSize: '20px',
    fontWeight: 700,
    color: '#58a6ff',
    letterSpacing: '-0.5px',
  },
  tagline: {
    fontSize: '13px',
    color: '#8b949e',
  },
  badge: (provider) => ({
    fontSize: '11px',
    padding: '3px 10px',
    borderRadius: '12px',
    background: provider === 'ollama' ? '#a371f718' : '#1f6feb18',
    color: provider === 'ollama' ? '#a371f7' : '#58a6ff',
    border: `1px solid ${provider === 'ollama' ? '#a371f744' : '#1f6feb44'}`,
    fontWeight: 500,
  }),
  main: {
    flex: 1,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  resetBtn: {
    padding: '6px 14px',
    borderRadius: '6px',
    border: '1px solid #30363d',
    background: '#21262d',
    color: '#e6edf3',
    cursor: 'pointer',
    fontSize: '13px',
  },
  compareToggle: (active) => ({
    marginLeft: 'auto',
    padding: '6px 14px',
    borderRadius: '6px',
    border: active ? '1px solid #a371f7' : '1px solid #30363d',
    background: active ? '#a371f722' : 'transparent',
    color: active ? '#a371f7' : '#8b949e',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: active ? 600 : 400,
    transition: 'all 0.15s',
  }),
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const EMPTY_COMPARE = {
  repoA: null, repoB: null,
  loadingA: false, loadingB: false,
  progressA: null, progressB: null,
  errorA: null, errorB: null,
}

export default function App() {
  // 'input' | 'analysis' | 'compare-results'
  const [screen, setScreen] = useState('input')
  const [analysisData, setAnalysisData] = useState(null)
  const [compareState, setCompareState] = useState(EMPTY_COMPARE)
  // aiConfig holds { provider, apiKey, ollamaModel, ollamaBaseUrl } — kept in memory only
  const [aiConfig, setAiConfig] = useState(null)
  const [compareMode, setCompareMode] = useState(false)

  /** Called by InputScreen when single-repo analysis finishes. */
  function handleAnalysisComplete(data, config) {
    setAnalysisData(data)
    setAiConfig(config)
    setScreen('analysis')
  }

  /**
   * Called by CompareInputScreen when the user clicks "Compare Both".
   * Switches immediately to the results screen (panels show skeletons),
   * then fires both analyses in parallel — updating each panel as it finishes.
   */
  function handleCompareStart({ repoAConfig, repoBConfig, aiConfig: cfg }) {
    setAiConfig(cfg)
    setScreen('compare-results')
    setCompareState({ ...EMPTY_COMPARE, loadingA: true, loadingB: true })

    const pA = (p) => setCompareState((prev) => ({ ...prev, progressA: p }))
    const pB = (p) => setCompareState((prev) => ({ ...prev, progressB: p }))

    analyzeRepo(repoAConfig, pA)
      .then((data) => setCompareState((prev) => ({ ...prev, repoA: data, loadingA: false })))
      .catch((err) => setCompareState((prev) => ({ ...prev, errorA: err.message, loadingA: false })))

    analyzeRepo(repoBConfig, pB)
      .then((data) => setCompareState((prev) => ({ ...prev, repoB: data, loadingB: false })))
      .catch((err) => setCompareState((prev) => ({ ...prev, errorB: err.message, loadingB: false })))
  }

  /** Return to the input screen and clear all state. */
  function handleReset() {
    setScreen('input')
    setAnalysisData(null)
    setCompareState(EMPTY_COMPARE)
    setAiConfig(null)
  }

  /** Toggle compare mode — only available from the input screen. */
  function toggleCompareMode() {
    setCompareMode((v) => !v)
  }

  const provider = aiConfig?.provider ?? localStorage.getItem('reposauge_provider') ?? 'claude'
  const providerLabel = provider === 'ollama' ? '🦙 Ollama' : '☁ Claude'
  const isResultScreen = screen === 'analysis' || screen === 'compare-results'

  return (
    <div style={styles.app}>
      <header style={styles.header}>
        <div style={styles.logo}>🔍 RepoSage</div>
        <div style={styles.tagline}>AI-powered code repository analyzer</div>

        {isResultScreen ? (
          <>
            <div style={styles.badge(provider)}>{providerLabel}</div>
            <button onClick={handleReset} style={{ ...styles.resetBtn, marginLeft: 'auto' }}>
              ← New Analysis
            </button>
          </>
        ) : (
          <>
            <div style={styles.badge(provider)}>Powered by {providerLabel}</div>
            <button
              style={styles.compareToggle(compareMode)}
              onClick={toggleCompareMode}
              title={compareMode ? 'Switch back to single repo mode' : 'Compare two repos side by side'}
            >
              {compareMode ? '⊟ Compare Mode' : '⊞ Compare Mode'}
            </button>
          </>
        )}
      </header>

      <main style={styles.main}>
        {screen === 'analysis' && (
          <Analysis data={analysisData} aiConfig={aiConfig} />
        )}

        {screen === 'compare-results' && (
          <CompareAnalysis
            repoA={compareState.repoA}
            repoB={compareState.repoB}
            loadingA={compareState.loadingA}
            loadingB={compareState.loadingB}
            progressA={compareState.progressA}
            progressB={compareState.progressB}
            errorA={compareState.errorA}
            errorB={compareState.errorB}
            aiConfig={aiConfig}
          />
        )}

        {screen === 'input' && !compareMode && (
          <InputScreen onAnalysisComplete={handleAnalysisComplete} />
        )}

        {screen === 'input' && compareMode && (
          <CompareInputScreen onCompareStart={handleCompareStart} />
        )}
      </main>
    </div>
  )
}
