/**
 * CompareAnalysis.jsx — Split-view results for Compare Mode.
 *
 * Accepts per-repo loading state from App.jsx so that panels can show
 * animated skeletons while an analysis is still in-flight.
 *
 * Layout:
 *   ┌──────────────────────┬──────────────────────┐
 *   │  Repo A              │  Repo B              │
 *   │  (skeleton or data)  │  (skeleton or data)  │
 *   ├──────────────────────┴──────────────────────┤
 *   │  Key Differences (streamed on demand)       │
 *   └─────────────────────────────────────────────┘
 */

import { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import FileTree from './FileTree.jsx'
import ChatBox from './ChatBox.jsx'
import { generateCompareHtmlReport, downloadFile, repoSlug, todaySlug } from '../utils/htmlExport.js'

// ─── Shimmer keyframe (injected once) ────────────────────────────────────────

const SHIMMER_STYLE = `
  @keyframes shimmer {
    0%   { background-position:  200% 0 }
    100% { background-position: -200% 0 }
  }
`

const SHIMMER_BASE = {
  background: 'linear-gradient(90deg, #21262d 25%, #30363d 50%, #21262d 75%)',
  backgroundSize: '200% 100%',
  animation: 'shimmer 1.5s infinite',
  borderRadius: '4px',
}

// ─── Skeleton component ───────────────────────────────────────────────────────

function Skeleton({ progress, error }) {
  const bar = (w, h = 12, extra = {}) => (
    <div style={{ ...SHIMMER_BASE, width: w, height: h, marginBottom: 10, ...extra }} />
  )

  if (error) {
    return (
      <div style={{ padding: '24px', color: '#f85149', fontSize: '13px' }}>
        ⚠ {error}
      </div>
    )
  }

  return (
    <div style={{ padding: '24px' }}>
      <style>{SHIMMER_STYLE}</style>

      {/* Progress hint */}
      {progress && (
        <div style={{ fontSize: '11px', color: '#58a6ff', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <PulsingDot />
          {progress.message || 'Analyzing…'}
        </div>
      )}

      {/* Heading bar */}
      {bar('60%', 20, { marginBottom: 20 })}

      {/* Paragraph lines */}
      {bar('100%')}
      {bar('90%')}
      {bar('75%', 12, { marginBottom: 24 })}

      {/* Sub-heading */}
      {bar('45%', 16, { marginBottom: 16 })}

      {/* List items */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
        <div style={{ ...SHIMMER_BASE, width: 8, height: 8, borderRadius: '50%', flexShrink: 0 }} />
        <div style={{ ...SHIMMER_BASE, flex: 1, height: 12 }} />
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 24 }}>
        <div style={{ ...SHIMMER_BASE, width: 8, height: 8, borderRadius: '50%', flexShrink: 0 }} />
        <div style={{ ...SHIMMER_BASE, width: '80%', height: 12 }} />
      </div>

      {/* Code block placeholder */}
      {bar('100%', 80, { borderRadius: 8 })}

      {/* More lines */}
      <div style={{ marginTop: 24 }}>
        {bar('55%', 16, { marginBottom: 14 })}
        {bar('100%')}
        {bar('85%')}
        {bar('70%', 12, { marginBottom: 24 })}
      </div>

      {bar('100%', 60, { borderRadius: 8 })}
    </div>
  )
}

function PulsingDot() {
  return (
    <span style={{
      display: 'inline-block',
      width: 6, height: 6,
      borderRadius: '50%',
      background: '#58a6ff',
      boxShadow: '0 0 6px #58a6ff',
      animation: 'pulse 1s ease-in-out infinite',
    }}>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.3} }`}</style>
    </span>
  )
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const s = {
  wrapper: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' },

  toolbar: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 16px',
    borderBottom: '1px solid #21262d',
    background: '#161b22',
    flexShrink: 0,
  },
  toolbarInfo: { fontSize: '12px', color: '#8b949e', marginRight: 'auto' },
  toolBtn: (disabled) => ({
    padding: '5px 12px',
    borderRadius: '6px',
    border: disabled ? '1px solid #21262d' : '1px solid #1f6feb55',
    background: disabled ? 'transparent' : '#1f6feb22',
    color: disabled ? '#484f58' : '#79c0ff',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: '12px',
    fontWeight: 500,
    whiteSpace: 'nowrap',
    transition: 'all 0.15s',
  }),

  compareBody: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    minHeight: 0,
  },

  panelsRow: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
    minHeight: 0,
  },

  repoPanel: (borderRight) => ({
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    borderRight: borderRight ? '2px solid #21262d' : 'none',
    minWidth: 0,
  }),

  panelHeader: (color) => ({
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '7px 14px',
    background: '#161b22',
    borderBottom: '1px solid #21262d',
    flexShrink: 0,
    fontSize: '12px',
    color: '#8b949e',
  }),
  panelBadge: (color) => ({
    padding: '1px 8px',
    borderRadius: '3px',
    fontSize: '11px',
    fontWeight: 700,
    background: `${color}22`,
    color,
    border: `1px solid ${color}44`,
  }),
  panelName: { fontSize: '13px', fontWeight: 600, color: '#e6edf3' },

  panelBody: { flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 },

  panelContent: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 },
  panelAnalysis: { flex: '0 0 55%', overflowY: 'auto', padding: '20px 24px', borderBottom: '1px solid #21262d' },
  panelProse: { maxWidth: '100%', lineHeight: '1.7', fontSize: '13px', color: '#e6edf3' },

  skeletonPanel: { flex: 1, overflowY: 'auto' },

  // Key Differences section
  diffSection: {
    flexShrink: 0,
    borderTop: '2px solid #21262d',
    background: '#161b22',
    display: 'flex',
    flexDirection: 'column',
    maxHeight: '380px',
    overflow: 'hidden',
  },
  diffHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '10px 20px',
    borderBottom: '1px solid #21262d',
    flexShrink: 0,
  },
  diffTitle: { fontSize: '13px', fontWeight: 700, color: '#e6edf3', marginRight: 'auto' },
  diffBody: { overflowY: 'auto', padding: '16px 24px', flex: 1 },
  diffProse: { maxWidth: '1200px', lineHeight: '1.7', fontSize: '13px', color: '#e6edf3' },
  generateBtn: (loading) => ({
    padding: '6px 16px',
    borderRadius: '6px',
    border: loading ? '1px solid #30363d' : '1px solid #1f6feb88',
    background: loading ? 'transparent' : '#1f6feb22',
    color: loading ? '#8b949e' : '#79c0ff',
    cursor: loading ? 'not-allowed' : 'pointer',
    fontSize: '12px',
    fontWeight: 500,
    whiteSpace: 'nowrap',
  }),
  diffHint: { color: '#484f58', fontSize: '13px', padding: '16px 0' },
}

// ─── Markdown renderer ────────────────────────────────────────────────────────

function MarkdownRenderer({ content }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        code({ node, inline, className, children, ...props }) {
          const match = /language-(\w+)/.exec(className || '')
          return !inline && match ? (
            <SyntaxHighlighter style={vscDarkPlus} language={match[1]} PreTag="div"
              customStyle={{ borderRadius: '6px', fontSize: '12px', margin: '8px 0' }} {...props}>
              {String(children).replace(/\n$/, '')}
            </SyntaxHighlighter>
          ) : (
            <code style={{ background: '#21262d', padding: '2px 5px', borderRadius: '3px', fontSize: '12px', fontFamily: 'monospace', color: '#f0883e' }} {...props}>
              {children}
            </code>
          )
        },
        h1: ({ children }) => <h1 style={{ fontSize: '18px', fontWeight: 700, margin: '24px 0 10px', color: '#e6edf3', borderBottom: '1px solid #21262d', paddingBottom: '6px' }}>{children}</h1>,
        h2: ({ children }) => <h2 style={{ fontSize: '15px', fontWeight: 600, margin: '20px 0 8px', color: '#cdd9e5' }}>{children}</h2>,
        h3: ({ children }) => <h3 style={{ fontSize: '13px', fontWeight: 600, margin: '14px 0 6px', color: '#cdd9e5' }}>{children}</h3>,
        p: ({ children }) => <p style={{ margin: '8px 0' }}>{children}</p>,
        ul: ({ children }) => <ul style={{ paddingLeft: '20px', margin: '6px 0' }}>{children}</ul>,
        ol: ({ children }) => <ol style={{ paddingLeft: '20px', margin: '6px 0' }}>{children}</ol>,
        li: ({ children }) => <li style={{ margin: '3px 0' }}>{children}</li>,
        blockquote: ({ children }) => <blockquote style={{ borderLeft: '3px solid #58a6ff', paddingLeft: '14px', margin: '10px 0', color: '#8b949e' }}>{children}</blockquote>,
        hr: () => <hr style={{ border: 'none', borderTop: '1px solid #21262d', margin: '18px 0' }} />,
        strong: ({ children }) => <strong style={{ color: '#e6edf3', fontWeight: 600 }}>{children}</strong>,
        a: ({ children, href }) => <a href={href} target="_blank" rel="noreferrer" style={{ color: '#58a6ff', textDecoration: 'none' }}>{children}</a>,
        table: ({ children }) => <div style={{ overflowX: 'auto', margin: '10px 0' }}><table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '12px' }}>{children}</table></div>,
        th: ({ children }) => <th style={{ padding: '6px 10px', borderBottom: '2px solid #30363d', textAlign: 'left', color: '#8b949e', fontWeight: 600 }}>{children}</th>,
        td: ({ children }) => <td style={{ padding: '6px 10px', borderBottom: '1px solid #21262d' }}>{children}</td>,
      }}
    >
      {content}
    </ReactMarkdown>
  )
}

// ─── Single repo panel ────────────────────────────────────────────────────────

function RepoPanel({ label, color, data, loading, progress, error, aiConfig, borderRight }) {
  const isReady = data && !loading

  return (
    <div style={s.repoPanel(borderRight)}>
      <div style={s.panelHeader(color)}>
        <span style={s.panelBadge(color)}>{label}</span>
        <span style={s.panelName}>{data?.repoName ?? (loading ? 'Loading…' : `Repo ${label}`)}</span>
        {isReady && <span style={{ marginLeft: 'auto' }}>{data.fileTree.length} files</span>}
      </div>

      <div style={s.panelBody}>
        {isReady ? (
          <>
            <FileTree files={data.fileTree} />
            <div style={s.panelContent}>
              <div style={s.panelAnalysis}>
                <div style={s.panelProse}>
                  <MarkdownRenderer content={data.analysis} />
                </div>
              </div>
              <ChatBox aiConfig={aiConfig} analysis={data.analysis} fileContents={data.fileContents} />
            </div>
          </>
        ) : (
          <div style={s.skeletonPanel}>
            <Skeleton progress={progress} error={error} />
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Key Differences section ──────────────────────────────────────────────────

function KeyDifferences({ repoA, repoB, aiConfig, comparison, onComparisonDone, bothReady }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [streamedText, setStreamedText] = useState(comparison || '')
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [streamedText])

  async function handleGenerate() {
    setLoading(true)
    setError(null)
    setStreamedText('')

    try {
      const response = await fetch('/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: aiConfig?.provider ?? 'claude',
          api_key: aiConfig?.apiKey ?? '',
          ollama_model: aiConfig?.ollamaModel ?? 'llama3.2',
          ollama_base_url: aiConfig?.ollamaBaseUrl ?? 'http://localhost:11434',
          analysis_a: repoA.analysis,
          analysis_b: repoB.analysis,
          repo_name_a: repoA.repoName,
          repo_name_b: repoB.repoName,
        }),
      })

      if (!response.ok) throw new Error(`Server error: ${response.status}`)

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let fullText = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop()

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = JSON.parse(line.slice(6))
          if (data.done) break
          if (data.error) throw new Error(data.error)
          if (data.chunk) {
            fullText += data.chunk
            setStreamedText(fullText)
          }
        }
      }

      onComparisonDone?.(fullText)
    } catch (e) {
      setError(e.message || 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={s.diffSection}>
      <div style={s.diffHeader}>
        <span style={s.diffTitle}>⚡ Key Differences</span>
        {error && <span style={{ fontSize: '12px', color: '#f85149' }}>⚠ {error}</span>}
        <button
          style={s.generateBtn(loading || !bothReady)}
          onClick={handleGenerate}
          disabled={loading || !bothReady}
          title={!bothReady ? 'Waiting for both analyses to complete' : undefined}
        >
          {loading ? 'Generating…' : streamedText ? '↺ Regenerate' : 'Generate Comparison →'}
        </button>
      </div>
      <div style={s.diffBody}>
        {!streamedText && !loading && (
          <div style={s.diffHint}>
            {bothReady
              ? 'Click "Generate Comparison" to get an AI-powered breakdown of both codebases.'
              : 'Waiting for both analyses to complete before comparison is available.'}
          </div>
        )}
        {loading && !streamedText && (
          <div style={{ marginTop: '8px' }}>
            <style>{SHIMMER_STYLE}</style>
            <div style={{ ...SHIMMER_BASE, width: '55%', height: '16px', marginBottom: '14px' }} />
            <div style={{ ...SHIMMER_BASE, width: '100%', height: '12px', marginBottom: '8px' }} />
            <div style={{ ...SHIMMER_BASE, width: '88%', height: '12px', marginBottom: '8px' }} />
            <div style={{ ...SHIMMER_BASE, width: '72%', height: '12px' }} />
          </div>
        )}
        {streamedText && (
          <div style={s.diffProse}>
            <MarkdownRenderer content={streamedText} />
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function CompareAnalysis({
  repoA, repoB,
  loadingA, loadingB,
  progressA, progressB,
  errorA, errorB,
  aiConfig,
}) {
  const [comparison, setComparison] = useState(null)

  const bothReady = !!(repoA && repoB)
  const totalFiles = (repoA?.fileTree?.length || 0) + (repoB?.fileTree?.length || 0)

  function handleExportHtml() {
    if (!bothReady) return
    const html = generateCompareHtmlReport({ repoA, repoB, comparison, aiConfig })
    const slugA = repoSlug(repoA.repoName)
    const slugB = repoSlug(repoB.repoName)
    downloadFile(html, `reposage-compare-${slugA}-vs-${slugB}-${todaySlug()}.html`, 'text/html')
  }

  const nameA = repoA?.repoName ?? (loadingA ? 'Repo A…' : 'Repo A')
  const nameB = repoB?.repoName ?? (loadingB ? 'Repo B…' : 'Repo B')

  return (
    <div style={s.wrapper}>
      {/* Toolbar */}
      <div style={s.toolbar}>
        <span style={s.toolbarInfo}>
          {nameA} vs {nameB}
          {bothReady && ` · ${totalFiles} files total`}
        </span>
        <button
          style={s.toolBtn(!bothReady)}
          onClick={handleExportHtml}
          disabled={!bothReady}
          title={!bothReady ? 'Available once both analyses complete' : 'Export combined HTML report'}
        >
          ⬡ Export Combined HTML
        </button>
      </div>

      {/* Main body */}
      <div style={s.compareBody}>
        {/* Two panels side by side */}
        <div style={s.panelsRow}>
          <RepoPanel
            label="A" color="#58a6ff"
            data={repoA} loading={loadingA} progress={progressA} error={errorA}
            aiConfig={aiConfig} borderRight
          />
          <RepoPanel
            label="B" color="#a371f7"
            data={repoB} loading={loadingB} progress={progressB} error={errorB}
            aiConfig={aiConfig} borderRight={false}
          />
        </div>

        {/* Key Differences strip */}
        <KeyDifferences
          repoA={repoA}
          repoB={repoB}
          aiConfig={aiConfig}
          comparison={comparison}
          onComparisonDone={setComparison}
          bothReady={bothReady}
        />
      </div>
    </div>
  )
}
