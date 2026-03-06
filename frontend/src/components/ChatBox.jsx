/**
 * ChatBox.jsx — Streaming chat interface for follow-up questions.
 *
 * - Sends each question with the full analysis + file contents as context
 * - Streams the response chunk-by-chunk from the backend SSE endpoint
 * - Renders responses in markdown with syntax highlighting
 * - Enter to send, Shift+Enter for newline
 */

import { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'

// ─── Styles ─────────────────────────────────────────────────────────────────

const s = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    background: '#161b22',
    // flex:1 fills all space below the Divider in Analysis.jsx.
    // overflow:hidden keeps the inner messages list from blowing out the panel.
    flex: 1,
    overflow: 'hidden',
    minHeight: '150px',
  },
  header: {
    padding: '9px 20px',
    fontSize: '11px',
    fontWeight: 700,
    color: '#8b949e',
    borderBottom: '1px solid #21262d',
    textTransform: 'uppercase',
    letterSpacing: '0.6px',
    flexShrink: 0,
  },
  messages: {
    flex: 1,        // fills all space between header and inputRow
    overflowY: 'auto',
    padding: '12px 20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
    minHeight: 0,   // lets flexbox shrink below content height
  },
  userMsg: {
    alignSelf: 'flex-end',
    background: '#1f6feb',
    padding: '10px 14px',
    borderRadius: '12px 12px 2px 12px',
    maxWidth: '75%',
    fontSize: '14px',
    lineHeight: '1.5',
    wordBreak: 'break-word',
  },
  assistantMsg: {
    alignSelf: 'flex-start',
    background: '#21262d',
    padding: '12px 16px',
    borderRadius: '12px 12px 12px 2px',
    maxWidth: '92%',
    fontSize: '14px',
    lineHeight: '1.6',
    wordBreak: 'break-word',
  },
  errorMsg: {
    alignSelf: 'flex-start',
    background: '#da363322',
    border: '1px solid #da363355',
    padding: '10px 14px',
    borderRadius: '8px',
    maxWidth: '92%',
    fontSize: '13px',
    color: '#f85149',
  },
  inputRow: {
    display: 'flex',
    gap: '8px',
    padding: '8px 16px 10px',
    flexShrink: 0,
    alignItems: 'flex-end',
  },
  textarea: {
    flex: 1,
    padding: '10px 14px',
    background: '#0d1117',
    border: '1px solid #30363d',
    borderRadius: '8px',
    color: '#e6edf3',
    fontSize: '14px',
    outline: 'none',
    fontFamily: 'inherit',
    resize: 'vertical',
    lineHeight: '1.4',
    minHeight: '60px',
    maxHeight: '300px',
    overflowY: 'auto',
    boxSizing: 'border-box',
  },
  sendBtn: (disabled) => ({
    padding: '10px 18px',
    borderRadius: '8px',
    border: 'none',
    background: disabled ? '#1f6feb44' : '#1f6feb',
    color: disabled ? '#8b949e' : '#fff',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: '14px',
    fontWeight: 600,
    whiteSpace: 'nowrap',
    flexShrink: 0,
    alignSelf: 'flex-end',  // stick to bottom when textarea grows
    transition: 'background 0.15s',
  }),
  emptyHint: {
    textAlign: 'center',
    color: '#484f58',
    fontSize: '13px',
    padding: '20px',
    lineHeight: '1.6',
  },
}

// ─── Markdown renderer (compact, for chat bubbles) ──────────────────────────

function ChatMarkdown({ content }) {
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
              customStyle={{ margin: '8px 0', borderRadius: '6px', fontSize: '12px' }}
              {...props}
            >
              {String(children).replace(/\n$/, '')}
            </SyntaxHighlighter>
          ) : (
            <code
              style={{
                background: '#0d1117',
                padding: '1px 5px',
                borderRadius: '3px',
                fontSize: '12px',
                fontFamily: 'monospace',
                color: '#f0883e',
              }}
              {...props}
            >
              {children}
            </code>
          )
        },
        p: ({ children }) => <p style={{ margin: '4px 0' }}>{children}</p>,
        ul: ({ children }) => <ul style={{ paddingLeft: '20px', margin: '4px 0' }}>{children}</ul>,
        ol: ({ children }) => <ol style={{ paddingLeft: '20px', margin: '4px 0' }}>{children}</ol>,
        li: ({ children }) => <li style={{ margin: '2px 0' }}>{children}</li>,
        h1: ({ children }) => <h1 style={{ fontSize: '16px', margin: '10px 0 4px' }}>{children}</h1>,
        h2: ({ children }) => <h2 style={{ fontSize: '15px', margin: '8px 0 4px' }}>{children}</h2>,
        h3: ({ children }) => <h3 style={{ fontSize: '14px', margin: '6px 0 4px' }}>{children}</h3>,
        a: ({ children, href }) => (
          <a href={href} target="_blank" rel="noreferrer" style={{ color: '#58a6ff' }}>{children}</a>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  )
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ChatBox({ aiConfig, analysis, fileContents }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const messagesEndRef = useRef(null)
  const textareaRef = useRef(null)

  /** Scroll to bottom whenever messages update. */
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  /** Send the current input as a question to the backend. */
  async function handleSend() {
    const question = input.trim()
    if (!question || streaming) return

    // Append user message and a placeholder for the assistant reply
    setMessages((prev) => [
      ...prev,
      { role: 'user', content: question },
      { role: 'assistant', content: '', isStreaming: true },
    ])
    setInput('')
    setStreaming(true)

    try {
      const response = await fetch('/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: aiConfig?.provider ?? 'claude',
          api_key: aiConfig?.apiKey ?? '',
          ollama_model: aiConfig?.ollamaModel ?? 'llama3.2',
          question,
          analysis,
          file_contents: fileContents,
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
        buffer = lines.pop() // keep incomplete line

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = JSON.parse(line.slice(6))

          if (data.done) break

          if (data.error) {
            // Replace the streaming placeholder with an error message
            setMessages((prev) => {
              const updated = [...prev]
              updated[updated.length - 1] = {
                role: 'error',
                content: data.error,
              }
              return updated
            })
            return
          }

          if (data.chunk) {
            // Append each streamed chunk to the last message
            setMessages((prev) => {
              const updated = [...prev]
              updated[updated.length - 1] = {
                role: 'assistant',
                content: updated[updated.length - 1].content + data.chunk,
                isStreaming: true,
              }
              return updated
            })
          }
        }
      }

      // Mark streaming done
      setMessages((prev) => {
        const updated = [...prev]
        updated[updated.length - 1] = {
          ...updated[updated.length - 1],
          isStreaming: false,
        }
        return updated
      })
    } catch (e) {
      setMessages((prev) => {
        const updated = [...prev]
        updated[updated.length - 1] = {
          role: 'error',
          content: e.message || 'Something went wrong.',
        }
        return updated
      })
    } finally {
      setStreaming(false)
    }
  }

  /** Enter submits; Shift+Enter adds a newline. */
  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div style={s.container}>
      <div style={s.header}>Follow-up questions</div>

      <div style={s.messages}>
        {messages.length === 0 && (
          <div style={s.emptyHint}>
            Ask anything about the codebase —<br />
            architecture, specific files, how things work, potential improvements...
          </div>
        )}

        {messages.map((msg, i) => {
          if (msg.role === 'error') {
            return (
              <div key={i} style={s.errorMsg}>
                ⚠ {msg.content}
              </div>
            )
          }
          return (
            <div key={i} style={msg.role === 'user' ? s.userMsg : s.assistantMsg}>
              {msg.role === 'assistant' ? (
                <ChatMarkdown content={msg.content || (msg.isStreaming ? '...' : '')} />
              ) : (
                msg.content
              )}
            </div>
          )
        })}

        <div ref={messagesEndRef} />
      </div>

      <div style={s.inputRow}>
        <textarea
          ref={textareaRef}
          style={s.textarea}
          placeholder="Ask about the codebase... (Enter to send, Shift+Enter for newline)"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={streaming}
          rows={2}
        />
        <button
          style={s.sendBtn(streaming || !input.trim())}
          onClick={handleSend}
          disabled={streaming || !input.trim()}
        >
          {streaming ? '...' : 'Send →'}
        </button>
      </div>
    </div>
  )
}
