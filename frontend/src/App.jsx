/**
 * App.jsx — Root component for RepoSage.
 *
 * Manages top-level screen routing (input ↔ analysis) and passes
 * the AI provider config down to child components that need it.
 */

import { useState } from 'react'
import InputScreen from './components/InputScreen.jsx'
import Analysis from './components/Analysis.jsx'

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
    marginLeft: 'auto',
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
    marginLeft: 'auto',
    padding: '6px 14px',
    borderRadius: '6px',
    border: '1px solid #30363d',
    background: '#21262d',
    color: '#e6edf3',
    cursor: 'pointer',
    fontSize: '13px',
  },
}

export default function App() {
  const [screen, setScreen] = useState('input')   // 'input' | 'analysis'
  const [analysisData, setAnalysisData] = useState(null)
  // aiConfig holds { provider, apiKey, ollamaModel } — kept in memory only
  const [aiConfig, setAiConfig] = useState(null)

  /** Called by InputScreen when analysis finishes successfully. */
  function handleAnalysisComplete(data, config) {
    setAnalysisData(data)
    setAiConfig(config)
    setScreen('analysis')
  }

  /** Return to the input screen and clear all state. */
  function handleReset() {
    setScreen('input')
    setAnalysisData(null)
    setAiConfig(null)
  }

  const provider = aiConfig?.provider ?? localStorage.getItem('reposauge_provider') ?? 'claude'
  const providerLabel = provider === 'ollama' ? '🦙 Ollama' : '☁ Claude'

  return (
    <div style={styles.app}>
      <header style={styles.header}>
        <div style={styles.logo}>🔍 RepoSage</div>
        <div style={styles.tagline}>AI-powered code repository analyzer</div>

        {screen === 'analysis' ? (
          <>
            <div style={styles.badge(provider)}>{providerLabel}</div>
            <button onClick={handleReset} style={styles.resetBtn}>
              ← New Analysis
            </button>
          </>
        ) : (
          <div style={styles.badge(provider)}>
            Powered by {providerLabel}
          </div>
        )}
      </header>

      <main style={styles.main}>
        {screen === 'input' ? (
          <InputScreen onAnalysisComplete={handleAnalysisComplete} />
        ) : (
          <Analysis data={analysisData} aiConfig={aiConfig} />
        )}
      </main>
    </div>
  )
}
