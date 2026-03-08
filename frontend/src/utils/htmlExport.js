/**
 * htmlExport.js — Generates self-contained HTML reports from RepoSage analyses.
 *
 * The output HTML file:
 *   - Has all CSS embedded inline (no external dependencies)
 *   - Renders markdown via a compact inline JS renderer (no CDN)
 *   - Shows a file tree sidebar + main analysis content
 *   - Works offline in any modern browser
 */

// ---------------------------------------------------------------------------
// File icon helper
// ---------------------------------------------------------------------------

function fileIcon(name) {
  const ext = name.split('.').pop().toLowerCase()
  const map = {
    js: '🟨', jsx: '⚛', ts: '🔷', tsx: '⚛', py: '🐍', rb: '💎',
    go: '🐹', rs: '🦀', java: '☕', cs: '💜', cpp: '⚙', c: '⚙',
    html: '🌐', css: '🎨', scss: '🎨', sass: '🎨',
    json: '📋', yaml: '⚙', yml: '⚙', toml: '⚙', xml: '📄',
    md: '📝', txt: '📝', sh: '💻', bash: '💻', zsh: '💻',
    dockerfile: '🐳', makefile: '🔨', sql: '🗄', graphql: '◈',
    env: '🔒', gitignore: '🙈', lock: '🔒',
    png: '🖼', jpg: '🖼', jpeg: '🖼', gif: '🖼', svg: '🖼', ico: '🖼',
  }
  const lname = name.toLowerCase()
  if (lname === 'dockerfile') return '🐳'
  if (lname === 'makefile') return '🔨'
  if (lname === '.gitignore') return '🙈'
  if (lname === '.env' || lname.startsWith('.env.')) return '🔒'
  return map[ext] || '📄'
}

// ---------------------------------------------------------------------------
// File tree HTML builder
// ---------------------------------------------------------------------------

function buildFileTreeHtml(fileTree) {
  return fileTree.map(f => {
    const parts = f.split('/')
    const depth = parts.length - 1
    const name = parts[parts.length - 1]
    return `<div class="ft-item" style="padding-left:${depth * 14 + 10}px" title="${f}">
      <span class="ft-icon">${fileIcon(name)}</span>
      <span class="ft-name">${name}</span>
    </div>`
  }).join('\n')
}

// ---------------------------------------------------------------------------
// Embedded markdown renderer (ES5, no backticks in source — safe to embed)
// ---------------------------------------------------------------------------

// This string is embedded verbatim inside a <script> tag in the HTML output.
// Rules:
//   - No backticks (outer template literal would break)
//   - No </script> substring
//   - Uses String.fromCharCode(96) to represent the backtick character at runtime
const MARKDOWN_RENDERER_SRC = `
(function() {
  var BT = String.fromCharCode(96);
  var BT3 = BT + BT + BT;

  function esc(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  window.mdToHtml = function(src) {
    var blocks = [];
    function stash(h) { blocks.push(h); return '\\x00' + (blocks.length - 1) + '\\x00'; }
    function restore(s) {
      return s.replace(/\\x00(\\d+)\\x00/g, function(_, i) { return blocks[+i]; });
    }

    // Fenced code blocks
    var cbRe = new RegExp(BT3 + '(\\\\w*)\\\\n?([\\\\s\\\\S]*?)' + BT3, 'g');
    src = src.replace(cbRe, function(_, lang, code) {
      return stash('<pre class="cb"><code class="lang-' + (lang || '') + '">' + esc(code.replace(/\\n$/, '')) + '<\\/code><\\/pre>');
    });

    // Inline code
    var icRe = new RegExp(BT + '([^' + BT + '\\\\n]+)' + BT, 'g');
    src = src.replace(icRe, function(_, c) {
      return stash('<code class="ic">' + esc(c) + '<\\/code>');
    });

    // Tables (GFM)
    src = src.replace(/(\\|.+\\|\\n\\|[-:\\| ]+\\|\\n(?:\\|.+\\|\\n?)*)/g, function(tbl) {
      var rows = tbl.trim().split('\\n').filter(function(r) { return !/^\\|[-:\\| ]+\\|$/.test(r); });
      if (!rows.length) return tbl;
      var th = rows[0].split('|').filter(function(c) { return c.trim(); })
        .map(function(c) { return '<th>' + c.trim() + '<\\/th>'; }).join('');
      var tbody = rows.slice(1).map(function(r) {
        return '<tr>' + r.split('|').filter(function(c) { return c.trim(); })
          .map(function(c) { return '<td>' + c.trim() + '<\\/td>'; }).join('') + '<\\/tr>';
      }).join('');
      return stash('<div class="tw"><table><thead><tr>' + th + '<\\/tr><\\/thead><tbody>' + tbody + '<\\/tbody><\\/table><\\/div>');
    });

    // Line-by-line block processing
    var lines = src.split('\\n');
    var out = [];
    var i = 0;
    while (i < lines.length) {
      var l = lines[i];
      var m;

      // Headings
      m = l.match(/^(#{1,6}) (.*)/);
      if (m) {
        out.push('<h' + m[1].length + '>' + m[2] + '<\\/h' + m[1].length + '>');
        i++; continue;
      }

      // Horizontal rule
      if (/^(---+|\\*\\*\\*+|___+)\\s*$/.test(l)) {
        out.push('<hr>'); i++; continue;
      }

      // Blockquote
      if (l.indexOf('> ') === 0) {
        var bq = [];
        while (i < lines.length && lines[i].indexOf('> ') === 0) {
          bq.push(lines[i].slice(2)); i++;
        }
        out.push('<blockquote>' + bq.join('<br>') + '<\\/blockquote>');
        continue;
      }

      // Unordered list
      if (/^[-*+] /.test(l)) {
        var ul = [];
        while (i < lines.length && /^[-*+] /.test(lines[i])) {
          ul.push('<li>' + lines[i].slice(2) + '<\\/li>'); i++;
        }
        out.push('<ul>' + ul.join('') + '<\\/ul>');
        continue;
      }

      // Ordered list
      if (/^\\d+\\.\\s/.test(l)) {
        var ol = [];
        while (i < lines.length && /^\\d+\\.\\s/.test(lines[i])) {
          ol.push('<li>' + lines[i].replace(/^\\d+\\.\\s/, '') + '<\\/li>'); i++;
        }
        out.push('<ol>' + ol.join('') + '<\\/ol>');
        continue;
      }

      // Empty line
      if (!l.trim()) { out.push(''); i++; continue; }

      // Paragraph
      var para = [l]; i++;
      while (i < lines.length && lines[i].trim() &&
             !/^[#>\\-*+]/.test(lines[i]) &&
             !/^\\d+\\.\\s/.test(lines[i]) &&
             lines[i].indexOf('\\x00') !== 0) {
        para.push(lines[i]); i++;
      }
      out.push('<p>' + para.join(' ') + '<\\/p>');
    }

    var html = out.join('\\n');

    // Inline formatting (applied after block structure)
    html = html.replace(/\\*\\*\\*([^*\\n]+?)\\*\\*\\*/g, '<strong><em>$1<\\/em><\\/strong>');
    html = html.replace(/\\*\\*([^*\\n]+?)\\*\\*/g, '<strong>$1<\\/strong>');
    html = html.replace(/__([^_\\n]+?)__/g, '<strong>$1<\\/strong>');
    html = html.replace(/\\*([^*\\n]+?)\\*/g, '<em>$1<\\/em>');
    html = html.replace(/_([^_\\n]+?)_/g, '<em>$1<\\/em>');
    html = html.replace(/~~([^~\\n]+?)~~/g, '<del>$1<\\/del>');
    html = html.replace(/\\[([^\\]]+)\\]\\(([^)]+)\\)/g,
      '<a href="$2" target="_blank" rel="noreferrer">$1<\\/a>');

    return restore(html);
  };
})();
`

// ---------------------------------------------------------------------------
// Shared CSS (dark theme matching RepoSage)
// ---------------------------------------------------------------------------

const BASE_CSS = `
  *{box-sizing:border-box;margin:0;padding:0}
  :root{--bg:#0d1117;--surf:#161b22;--border:#21262d;--text:#e6edf3;--muted:#8b949e;--blue:#58a6ff;--green:#3fb950;--orange:#f0883e}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:var(--bg);color:var(--text);line-height:1.6;font-size:15px}
  a{color:var(--blue);text-decoration:none}a:hover{text-decoration:underline}
  .share-banner{background:#1f6feb1a;border-bottom:1px solid #1f6feb44;padding:8px 24px;font-size:12px;color:var(--blue);text-align:center;display:flex;align-items:center;justify-content:center;gap:8px}
  .page-header{background:var(--surf);border-bottom:1px solid var(--border);padding:20px 32px}
  .header-top{display:flex;align-items:center;gap:16px;margin-bottom:14px;flex-wrap:wrap}
  .logo{font-size:22px;font-weight:700;color:var(--blue);white-space:nowrap}
  .repo-name{font-size:19px;font-weight:600;color:var(--text)}
  .meta-grid{display:flex;gap:20px;flex-wrap:wrap}
  .meta-item{display:flex;flex-direction:column;gap:2px}
  .meta-label{font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.6px}
  .meta-value{font-size:13px;color:var(--text)}
  .layout{display:flex;height:calc(100vh - 160px);min-height:500px}
  .sidebar{width:240px;flex-shrink:0;border-right:1px solid var(--border);overflow-y:auto;background:var(--surf)}
  .sidebar-title{padding:10px 14px;font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.6px;border-bottom:1px solid var(--border);position:sticky;top:0;background:var(--surf)}
  .ft-item{padding:3px 0;font-size:12px;font-family:'SFMono-Regular',Consolas,monospace;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:default;transition:color .1s}
  .ft-item:hover{color:var(--text)}
  .ft-icon{margin-right:4px;font-size:11px}
  .ft-name{vertical-align:middle}
  .main-content{flex:1;overflow-y:auto;padding:32px 40px}
  .prose{max-width:860px;margin:0 auto}
  .prose h1{font-size:22px;font-weight:700;margin:32px 0 12px;color:var(--text);border-bottom:1px solid var(--border);padding-bottom:8px}
  .prose h2{font-size:18px;font-weight:600;margin:28px 0 10px;color:#cdd9e5}
  .prose h3{font-size:15px;font-weight:600;margin:20px 0 8px;color:#cdd9e5}
  .prose h4,.prose h5,.prose h6{font-size:14px;font-weight:600;margin:16px 0 6px;color:#cdd9e5}
  .prose p{margin:10px 0}
  .prose ul,.prose ol{padding-left:24px;margin:8px 0}
  .prose li{margin:4px 0;line-height:1.6}
  .prose blockquote{border-left:3px solid var(--blue);padding-left:16px;margin:12px 0;color:var(--muted)}
  .prose hr{border:none;border-top:1px solid var(--border);margin:24px 0}
  .prose strong{font-weight:600;color:var(--text)}
  .prose em{font-style:italic}
  .prose del{text-decoration:line-through;color:var(--muted)}
  .prose .tw{overflow-x:auto;margin:12px 0}
  .prose table{border-collapse:collapse;width:100%;font-size:13px}
  .prose th{padding:8px 12px;border-bottom:2px solid var(--border);text-align:left;color:var(--muted);font-weight:600}
  .prose td{padding:8px 12px;border-bottom:1px solid var(--border)}
  .prose .cb{background:#161b22;border:1px solid var(--border);border-radius:8px;padding:16px;margin:12px 0;overflow-x:auto}
  .prose .cb code{font-family:'SFMono-Regular',Consolas,monospace;font-size:13px;color:var(--text);white-space:pre}
  .prose .ic{background:#21262d;padding:2px 6px;border-radius:4px;font-family:'SFMono-Regular',Consolas,monospace;font-size:13px;color:var(--orange)}
  .footer{border-top:1px solid var(--border);padding:14px 32px;text-align:center;font-size:12px;color:var(--muted);background:var(--surf)}
  @media(max-width:768px){
    .layout{flex-direction:column;height:auto}
    .sidebar{width:100%;height:200px;border-right:none;border-bottom:1px solid var(--border)}
    .main-content{padding:20px}
  }
`

// ---------------------------------------------------------------------------
// Single-repo HTML report
// ---------------------------------------------------------------------------

export function generateHtmlReport({ analysis, fileTree, repoName, estimatedTokens, aiConfig }) {
  const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  const modelLabel = aiConfig?.provider === 'ollama'
    ? `Ollama / ${aiConfig.ollamaModel || 'local'}`
    : 'Claude (Anthropic)'
  const fileCount = fileTree?.length || 0
  const tokensDisplay = estimatedTokens ? `~${Number(estimatedTokens).toLocaleString()}` : 'N/A'
  const safeRepoName = (repoName || 'repo').replace(/[^a-z0-9-_]/gi, '-').toLowerCase()
  const slug = `${safeRepoName}-${new Date().toISOString().slice(0, 10)}`

  const treeHtml = buildFileTreeHtml(fileTree || [])

  // Embed analysis as JSON so backticks & special chars are safely escaped
  const analysisJson = JSON.stringify(analysis || '')

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>RepoSage \u2014 ${repoName || 'Analysis'}</title>
  <style>${BASE_CSS}</style>
</head>
<body>
  <div class="share-banner">
    \uD83D\uDCE4 Send this file to anyone \u2014 they can open it in any browser with no internet needed
  </div>

  <header class="page-header">
    <div class="header-top">
      <div class="logo">\uD83D\uDD0D RepoSage</div>
      <div class="repo-name">${repoName || 'Repository Analysis'}</div>
    </div>
    <div class="meta-grid">
      <div class="meta-item"><span class="meta-label">Date</span><span class="meta-value">${date}</span></div>
      <div class="meta-item"><span class="meta-label">Files</span><span class="meta-value">${fileCount}</span></div>
      <div class="meta-item"><span class="meta-label">Tokens</span><span class="meta-value">${tokensDisplay}</span></div>
      <div class="meta-item"><span class="meta-label">Model</span><span class="meta-value">${modelLabel}</span></div>
    </div>
  </header>

  <div class="layout">
    <aside class="sidebar">
      <div class="sidebar-title">Files (${fileCount})</div>
      ${treeHtml}
    </aside>
    <main class="main-content">
      <div class="prose" id="content"></div>
    </main>
  </div>

  <footer class="footer">
    Generated by <a href="https://github.com/Saichethanreddynayini808/RepoSage" target="_blank" rel="noreferrer">RepoSage</a>
    &nbsp;&middot;&nbsp; ${date}
  </footer>

  <script>
    ${MARKDOWN_RENDERER_SRC}
    var ANALYSIS = ${analysisJson};
    document.getElementById('content').innerHTML = mdToHtml(ANALYSIS);
  </script>
</body>
</html>`
}

// ---------------------------------------------------------------------------
// Two-repo comparison HTML report
// ---------------------------------------------------------------------------

const COMPARE_CSS = `
  ${BASE_CSS}
  .compare-layout{display:grid;grid-template-columns:1fr 1fr;gap:0;flex:1;overflow:hidden;min-height:0}
  .repo-panel{display:flex;flex-direction:column;overflow:hidden;border-right:1px solid var(--border)}
  .repo-panel:last-child{border-right:none}
  .panel-header{padding:10px 16px;font-size:12px;font-weight:700;color:var(--muted);background:var(--surf);border-bottom:1px solid var(--border);display:flex;gap:8px;align-items:center;flex-shrink:0}
  .panel-label{font-size:14px;color:var(--text)}
  .panel-body{display:flex;overflow:hidden;flex:1}
  .panel-sidebar{width:180px;flex-shrink:0;border-right:1px solid var(--border);overflow-y:auto;background:var(--surf)}
  .panel-content{flex:1;overflow-y:auto;padding:20px 24px}
  .panel-prose{max-width:100%}
  .diff-section{padding:24px 32px;border-top:2px solid var(--border);background:var(--surf)}
  .diff-title{font-size:16px;font-weight:700;color:var(--text);margin-bottom:16px;display:flex;align-items:center;gap:8px}
  .diff-content{max-width:1200px}
  @media(max-width:900px){
    .compare-layout{grid-template-columns:1fr}
    .repo-panel{border-right:none;border-bottom:1px solid var(--border)}
    .layout{flex-direction:column;height:auto}
    .sidebar{width:100%;height:160px;border-right:none;border-bottom:1px solid var(--border)}
  }
`

export function generateCompareHtmlReport({
  repoA,         // { analysis, fileTree, repoName, estimatedTokens }
  repoB,
  comparison,    // string | null
  aiConfig,
}) {
  const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  const modelLabel = aiConfig?.provider === 'ollama'
    ? `Ollama / ${aiConfig.ollamaModel || 'local'}`
    : 'Claude (Anthropic)'

  const nameA = repoA.repoName || 'Repo A'
  const nameB = repoB.repoName || 'Repo B'

  const treeHtmlA = buildFileTreeHtml(repoA.fileTree || [])
  const treeHtmlB = buildFileTreeHtml(repoB.fileTree || [])

  const analysisAJson = JSON.stringify(repoA.analysis || '')
  const analysisBJson = JSON.stringify(repoB.analysis || '')
  const comparisonJson = JSON.stringify(comparison || '')

  const diffSection = comparison
    ? `<div class="diff-section">
        <div class="diff-title">\u26A1 Key Differences</div>
        <div class="diff-content prose" id="diff-content"></div>
      </div>`
    : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>RepoSage \u2014 ${nameA} vs ${nameB}</title>
  <style>${COMPARE_CSS}</style>
</head>
<body>
  <div class="share-banner">
    \uD83D\uDCE4 Send this file to anyone \u2014 they can open it in any browser with no internet needed
  </div>

  <header class="page-header">
    <div class="header-top">
      <div class="logo">\uD83D\uDD0D RepoSage</div>
      <div class="repo-name">${nameA} vs ${nameB}</div>
    </div>
    <div class="meta-grid">
      <div class="meta-item"><span class="meta-label">Date</span><span class="meta-value">${date}</span></div>
      <div class="meta-item"><span class="meta-label">Model</span><span class="meta-value">${modelLabel}</span></div>
      <div class="meta-item"><span class="meta-label">${nameA} files</span><span class="meta-value">${(repoA.fileTree || []).length}</span></div>
      <div class="meta-item"><span class="meta-label">${nameB} files</span><span class="meta-value">${(repoB.fileTree || []).length}</span></div>
    </div>
  </header>

  <div class="compare-layout">
    <!-- Repo A -->
    <div class="repo-panel">
      <div class="panel-header">
        <span style="background:#58a6ff22;color:#58a6ff;padding:2px 8px;border-radius:4px;font-size:11px">A</span>
        <span class="panel-label">${nameA}</span>
        <span style="margin-left:auto;font-weight:400">${(repoA.fileTree||[]).length} files</span>
      </div>
      <div class="panel-body">
        <div class="panel-sidebar">
          <div class="sidebar-title">Files</div>
          ${treeHtmlA}
        </div>
        <div class="panel-content">
          <div class="prose panel-prose" id="content-a"></div>
        </div>
      </div>
    </div>

    <!-- Repo B -->
    <div class="repo-panel">
      <div class="panel-header">
        <span style="background:#a371f722;color:#a371f7;padding:2px 8px;border-radius:4px;font-size:11px">B</span>
        <span class="panel-label">${nameB}</span>
        <span style="margin-left:auto;font-weight:400">${(repoB.fileTree||[]).length} files</span>
      </div>
      <div class="panel-body">
        <div class="panel-sidebar">
          <div class="sidebar-title">Files</div>
          ${treeHtmlB}
        </div>
        <div class="panel-content">
          <div class="prose panel-prose" id="content-b"></div>
        </div>
      </div>
    </div>
  </div>

  ${diffSection}

  <footer class="footer">
    Generated by <a href="https://github.com/Saichethanreddynayini808/RepoSage" target="_blank" rel="noreferrer">RepoSage</a>
    &nbsp;&middot;&nbsp; ${date}
  </footer>

  <script>
    ${MARKDOWN_RENDERER_SRC}
    var ANALYSIS_A = ${analysisAJson};
    var ANALYSIS_B = ${analysisBJson};
    var COMPARISON = ${comparisonJson};
    document.getElementById('content-a').innerHTML = mdToHtml(ANALYSIS_A);
    document.getElementById('content-b').innerHTML = mdToHtml(ANALYSIS_B);
    var diffEl = document.getElementById('diff-content');
    if (diffEl && COMPARISON) diffEl.innerHTML = mdToHtml(COMPARISON);
  </script>
</body>
</html>`
}

// ---------------------------------------------------------------------------
// Trigger browser download
// ---------------------------------------------------------------------------

export function downloadFile(content, filename, mimeType = 'text/html') {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function repoSlug(name) {
  return (name || 'repo').replace(/[^a-z0-9-_]/gi, '-').replace(/-+/g, '-').toLowerCase()
}

export function todaySlug() {
  return new Date().toISOString().slice(0, 10)
}
