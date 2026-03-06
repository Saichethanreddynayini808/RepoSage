/**
 * Analysis.jsx — The results screen for RepoSage.
 *
 * Layout:
 *   ┌─────────────────────────────────────────┐
 *   │  Toolbar (copy / export / token count)  │
 *   ├──────────┬──────────────────────────────┤
 *   │ FileTree │   Markdown analysis content  │
 *   │          ├──────────────────────────────┤
 *   │          │   ChatBox                    │
 *   └──────────┴──────────────────────────────┘
 */

import { useState, useRef, useLayoutEffect, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import FileTree from './FileTree.jsx'
import ChatBox from './ChatBox.jsx'

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
  toolBtn: {
    padding: '5px 12px',
    borderRadius: '6px',
    border: '1px solid #30363d',
    background: '#21262d',
    color: '#cdd9e5',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: 500,
    transition: 'border-color 0.15s',
  },
  toolBtnSuccess: {
    padding: '5px 12px',
    borderRadius: '6px',
    border: '1px solid #3fb95066',
    background: '#3fb95018',
    color: '#3fb950',
    cursor: 'default',
    fontSize: '12px',
    fontWeight: 500,
  },

  body: { flex: 1, display: 'flex', overflow: 'hidden' },
  content: { flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 },
  // Height is controlled dynamically via inline style after first drag.
  // overflowY:auto keeps the markdown scrollable independently.
  analysisArea: { overflowY: 'auto', padding: '32px 40px', flexShrink: 0 },
  prose: {
    maxWidth: '860px',
    margin: '0 auto',
    lineHeight: '1.7',
    fontSize: '14px',
    color: '#e6edf3',
  },
}

// ─── Markdown renderer ───────────────────────────────────────────────────────

function MarkdownRenderer({ content }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        code({ node, inline, className, children, ...props }) {
          const match = /language-(\w+)/.exec(className || '')
          return !inline && match ? (
            <SyntaxHighlighter
              style={vscDarkPlus}
              language={match[1]}
              PreTag="div"
              customStyle={{ borderRadius: '8px', fontSize: '13px', margin: '12px 0' }}
              {...props}
            >
              {String(children).replace(/\n$/, '')}
            </SyntaxHighlighter>
          ) : (
            <code
              style={{
                background: '#21262d',
                padding: '2px 6px',
                borderRadius: '4px',
                fontSize: '13px',
                fontFamily: 'monospace',
                color: '#f0883e',
              }}
              {...props}
            >
              {children}
            </code>
          )
        },
        h1: ({ children }) => (
          <h1 style={{ fontSize: '22px', fontWeight: 700, margin: '32px 0 12px', color: '#e6edf3', borderBottom: '1px solid #21262d', paddingBottom: '8px' }}>
            {children}
          </h1>
        ),
        h2: ({ children }) => (
          <h2 style={{ fontSize: '18px', fontWeight: 600, margin: '28px 0 10px', color: '#cdd9e5' }}>
            {children}
          </h2>
        ),
        h3: ({ children }) => (
          <h3 style={{ fontSize: '15px', fontWeight: 600, margin: '20px 0 8px', color: '#cdd9e5' }}>
            {children}
          </h3>
        ),
        p: ({ children }) => <p style={{ margin: '10px 0' }}>{children}</p>,
        ul: ({ children }) => <ul style={{ paddingLeft: '24px', margin: '8px 0' }}>{children}</ul>,
        ol: ({ children }) => <ol style={{ paddingLeft: '24px', margin: '8px 0' }}>{children}</ol>,
        li: ({ children }) => <li style={{ margin: '4px 0', lineHeight: '1.6' }}>{children}</li>,
        blockquote: ({ children }) => (
          <blockquote style={{ borderLeft: '3px solid #58a6ff', paddingLeft: '16px', margin: '12px 0', color: '#8b949e' }}>
            {children}
          </blockquote>
        ),
        table: ({ children }) => (
          <div style={{ overflowX: 'auto', margin: '12px 0' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '13px' }}>{children}</table>
          </div>
        ),
        th: ({ children }) => (
          <th style={{ padding: '8px 12px', borderBottom: '2px solid #30363d', textAlign: 'left', color: '#8b949e', fontWeight: 600 }}>
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td style={{ padding: '8px 12px', borderBottom: '1px solid #21262d' }}>{children}</td>
        ),
        hr: () => <hr style={{ border: 'none', borderTop: '1px solid #21262d', margin: '24px 0' }} />,
        strong: ({ children }) => <strong style={{ color: '#e6edf3', fontWeight: 600 }}>{children}</strong>,
        a: ({ children, href }) => (
          <a href={href} target="_blank" rel="noreferrer" style={{ color: '#58a6ff', textDecoration: 'none' }}>
            {children}
          </a>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  )
}

// ─── Draggable divider ───────────────────────────────────────────────────────

/**
 * Horizontal splitter bar placed between the analysis area and chat panel.
 * Calls onMouseDown to begin a drag sequence managed by the parent.
 */
function Divider({ onMouseDown }) {
  const [hovered, setHovered] = useState(false)
  return (
    <div
      onMouseDown={onMouseDown}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        height: '8px',
        flexShrink: 0,
        background: hovered ? '#444' : '#30363d',
        cursor: 'ns-resize',
        userSelect: 'none',
        transition: 'background 0.12s',
      }}
    />
  )
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function Analysis({ data, aiConfig }) {
  const { analysis, fileTree, fileContents, estimatedTokens } = data
  const [copyLabel, setCopyLabel] = useState('Copy')

  // Pixel height of the analysis area. null until the content div mounts,
  // at which point useLayoutEffect seeds it to 60% of the available height.
  const [analysisHeight, setAnalysisHeight] = useState(null)

  const contentRef = useRef(null)   // wraps analysisArea + Divider + ChatBox
  const analysisRef = useRef(null)  // the scrollable analysis area itself

  /** Set initial split to 60 / 40 based on actual rendered height. */
  useLayoutEffect(() => {
    if (contentRef.current) {
      setAnalysisHeight(contentRef.current.clientHeight * 0.6)
    }
  }, [])

  /** Copy the raw markdown analysis text to clipboard. */
  function handleCopy() {
    navigator.clipboard.writeText(analysis).then(() => {
      setCopyLabel('Copied!')
      setTimeout(() => setCopyLabel('Copy'), 2000)
    })
  }

  /** Download the analysis as a timestamped .md file. */
  function handleExport() {
    const timestamp = new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '-')
    const filename = `reposage-analysis-${timestamp}.md`
    const blob = new Blob([analysis], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  /**
   * Begin a drag: snapshot the current analysis height and mouse Y, then
   * track mousemove on the document until mouseup.
   * Min heights: 200px analysis, 150px chat (+ 8px divider).
   */
  const handleDividerMouseDown = useCallback((e) => {
    e.preventDefault()
    const startY = e.clientY
    const startHeight = analysisRef.current
      ? analysisRef.current.getBoundingClientRect().height
      : (contentRef.current?.clientHeight ?? 600) * 0.6

    function onMouseMove(ev) {
      const totalHeight = contentRef.current?.clientHeight ?? 600
      const DIVIDER_H = 8
      const minAnalysis = 200
      const minChat = 150
      const maxAnalysis = totalHeight - DIVIDER_H - minChat
      const next = Math.min(maxAnalysis, Math.max(minAnalysis, startHeight + (ev.clientY - startY)))
      setAnalysisHeight(next)
    }

    function onMouseUp() {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [])

  return (
    <div style={s.wrapper}>
      {/* Toolbar */}
      <div style={s.toolbar}>
        <span style={s.toolbarInfo}>
          {fileTree.length} files analyzed
          {estimatedTokens ? ` · ~${estimatedTokens.toLocaleString()} tokens` : ''}
        </span>
        <button
          style={copyLabel === 'Copied!' ? s.toolBtnSuccess : s.toolBtn}
          onClick={handleCopy}
        >
          {copyLabel === 'Copied!' ? '✓ Copied!' : '⎘ Copy'}
        </button>
        <button style={s.toolBtn} onClick={handleExport}>
          ↓ Export .md
        </button>
      </div>

      {/* Main body */}
      <div style={s.body}>
        <FileTree files={fileTree} />

        {/* content: flex column containing analysis / divider / chat */}
        <div style={s.content} ref={contentRef}>

          {/* Analysis scroll area — height driven by drag state */}
          <div
            ref={analysisRef}
            style={{
              ...s.analysisArea,
              // Before mount measurement, flex:1 gives a reasonable default.
              // After, a fixed px height lets the divider control the split.
              height: analysisHeight != null ? analysisHeight : undefined,
              flex: analysisHeight != null ? '0 0 auto' : 1,
            }}
          >
            <div style={s.prose}>
              <MarkdownRenderer content={analysis} />
            </div>
          </div>

          {/* Draggable splitter — replaces the old static border */}
          <Divider onMouseDown={handleDividerMouseDown} />

          {/* Chat panel fills all remaining space below the divider */}
          <ChatBox aiConfig={aiConfig} analysis={analysis} fileContents={fileContents} />
        </div>
      </div>
    </div>
  )
}
