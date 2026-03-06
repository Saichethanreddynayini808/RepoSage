import { useState } from 'react'

function buildTree(paths) {
  const root = {}
  for (const p of paths) {
    const parts = p.split('/')
    let node = root
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      if (!node[part]) {
        node[part] = i === parts.length - 1 ? null : {}
      }
      if (node[part] !== null) node = node[part]
    }
  }
  return root
}

function TreeNode({ name, node, depth = 0 }) {
  const [open, setOpen] = useState(depth < 2)
  const isDir = node !== null && typeof node === 'object'

  const indent = depth * 14

  if (!isDir) {
    const ext = name.split('.').pop()
    const icon = getFileIcon(name, ext)
    return (
      <div style={{
        padding: '2px 8px 2px',
        paddingLeft: `${indent + 8}px`,
        fontSize: '12px',
        color: '#8b949e',
        display: 'flex',
        alignItems: 'center',
        gap: '5px',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        borderRadius: '4px',
      }}>
        <span style={{ flexShrink: 0 }}>{icon}</span>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</span>
      </div>
    )
  }

  const children = Object.entries(node).sort(([, a], [, b]) => {
    // dirs first
    const aIsDir = a !== null
    const bIsDir = b !== null
    if (aIsDir && !bIsDir) return -1
    if (!aIsDir && bIsDir) return 1
    return 0
  })

  return (
    <div>
      <div
        onClick={() => setOpen((o) => !o)}
        style={{
          padding: '2px 8px',
          paddingLeft: `${indent + 8}px`,
          fontSize: '12px',
          color: '#cdd9e5',
          display: 'flex',
          alignItems: 'center',
          gap: '5px',
          cursor: 'pointer',
          borderRadius: '4px',
          userSelect: 'none',
        }}
        onMouseEnter={(e) => e.currentTarget.style.background = '#21262d'}
        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
      >
        <span style={{ flexShrink: 0, fontSize: '10px', color: '#8b949e' }}>
          {open ? '▼' : '▶'}
        </span>
        <span style={{ flexShrink: 0 }}>📁</span>
        <span>{name}</span>
      </div>
      {open && children.map(([childName, childNode]) => (
        <TreeNode key={childName} name={childName} node={childNode} depth={depth + 1} />
      ))}
    </div>
  )
}

function getFileIcon(name, ext) {
  const icons = {
    py: '🐍', js: '📜', jsx: '⚛', ts: '📘', tsx: '⚛',
    json: '📋', md: '📝', html: '🌐', css: '🎨', scss: '🎨',
    sh: '⚙', yaml: 'yml', yml: '⚙', toml: '⚙', env: '🔒',
    txt: '📄', sql: '🗃', rs: '🦀', go: '🐹', java: '☕',
    rb: '💎', php: '🐘', c: '⚡', cpp: '⚡', h: '⚡',
    dockerfile: '🐳', gitignore: '🚫',
  }
  const lower = name.toLowerCase()
  if (lower === 'dockerfile') return '🐳'
  if (lower === '.gitignore' || lower === '.env') return '🔒'
  if (lower === 'readme.md') return '📖'
  return icons[ext] || '📄'
}

export default function FileTree({ files }) {
  const tree = buildTree(files)
  const entries = Object.entries(tree).sort(([, a], [, b]) => {
    const aIsDir = a !== null
    const bIsDir = b !== null
    if (aIsDir && !bIsDir) return -1
    if (!aIsDir && bIsDir) return 1
    return 0
  })

  return (
    <div style={{
      width: '240px',
      flexShrink: 0,
      borderRight: '1px solid #21262d',
      overflowY: 'auto',
      padding: '12px 4px',
      background: '#161b22',
    }}>
      <div style={{
        fontSize: '11px',
        fontWeight: 600,
        color: '#8b949e',
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
        padding: '0 8px 8px',
      }}>
        Files ({files.length})
      </div>
      {entries.map(([name, node]) => (
        <TreeNode key={name} name={name} node={node} depth={0} />
      ))}
    </div>
  )
}
