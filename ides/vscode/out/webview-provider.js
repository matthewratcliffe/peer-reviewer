"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.PeerReviewerWebviewProvider = void 0;
const vscode = __importStar(require("vscode"));
const notes_1 = require("./notes");
class PeerReviewerWebviewProvider {
    constructor(extensionUri) {
        this.extensionUri = extensionUri;
        this.repoRoot = "";
        this.findings = [];
    }
    setRepoRoot(repoRoot) {
        this.repoRoot = repoRoot;
    }
    updateFindings(findings) {
        this.findings = findings;
        this.sendFindingsToWebview();
    }
    showProcessing(text) {
        this.postMessage({ type: "processing", text });
    }
    hideProcessing() {
        this.postMessage({ type: "processing-done" });
    }
    showError(message) {
        this.postMessage({ type: "error", message });
    }
    resolveWebviewView(webviewView, _context, _token) {
        this.view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
        };
        webviewView.webview.html = this.getHtml();
        webviewView.webview.onDidReceiveMessage((msg) => {
            this.handleMessage(msg);
        });
        // Send current findings once webview is ready
        this.sendFindingsToWebview();
    }
    sendFindingsToWebview() {
        this.postMessage({ type: "findings", data: this.findings });
    }
    postMessage(msg) {
        if (this.view) {
            this.view.webview.postMessage(msg);
        }
    }
    handleMessage(msg) {
        switch (msg.type) {
            case "navigate-to-file": {
                const filePath = msg.file;
                const line = msg.line || 1;
                const uri = vscode.Uri.file(filePath);
                vscode.window.showTextDocument(uri, {
                    selection: new vscode.Range(line - 1, 0, line - 1, 0),
                    preserveFocus: false,
                });
                break;
            }
            case "dismiss": {
                const findingId = msg.findingId;
                vscode.commands.executeCommand("peerReviewer.dismiss", findingId);
                break;
            }
            case "load-note": {
                const finding = msg.finding;
                const note = (0, notes_1.loadNote)(this.repoRoot, finding);
                this.postMessage({ type: "note-loaded", findingId: finding.id, note });
                break;
            }
            case "save-note": {
                const saveFinding = msg.finding;
                const content = msg.content;
                (0, notes_1.saveNote)(this.repoRoot, saveFinding, content);
                break;
            }
            case "reanalyse-changes": {
                vscode.commands.executeCommand("peerReviewer.reanalyseChanges");
                break;
            }
            case "reanalyse-project": {
                vscode.commands.executeCommand("peerReviewer.reanalyseProject");
                break;
            }
            case "stop-analysis": {
                vscode.commands.executeCommand("peerReviewer.stopAnalysis");
                break;
            }
            case "test-connection": {
                vscode.commands.executeCommand("peerReviewer.testProvider");
                break;
            }
        }
    }
    getHtml() {
        return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: var(--vscode-font-family, sans-serif);
  font-size: var(--vscode-font-size, 13px);
  color: var(--vscode-foreground);
  background: var(--vscode-editor-background);
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
}
.toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-bottom: 1px solid var(--vscode-panel-border);
  flex-wrap: wrap;
}
.toolbar button {
  background: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
  border: none;
  padding: 4px 8px;
  cursor: pointer;
  font-size: 11px;
  border-radius: 2px;
}
.toolbar button:hover { background: var(--vscode-button-hoverBackground); }
.toolbar button.stop { background: var(--vscode-errorForeground); }
.severity-counts { display: flex; gap: 8px; font-size: 11px; margin-left: 8px; }
.severity-counts span { font-weight: bold; }
.sev-high { color: #f44; }
.sev-medium { color: #fa0; }
.sev-low { color: #4af; }
.sev-info { color: #888; }
.toolbar select {
  background: var(--vscode-dropdown-background);
  color: var(--vscode-dropdown-foreground);
  border: 1px solid var(--vscode-dropdown-border);
  padding: 2px 4px;
  font-size: 11px;
}
.toolbar .spacer { flex: 1; }
.toolbar .logo a { color: var(--vscode-foreground); text-decoration: none; font-size: 11px; opacity: 0.7; }
.toolbar .logo a:hover { opacity: 1; }

.main-area {
  display: flex;
  flex: 1;
  overflow: hidden;
}
.table-container {
  flex: 1;
  overflow: auto;
}
table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}
th, td {
  padding: 4px 8px;
  text-align: left;
  border-bottom: 1px solid var(--vscode-panel-border);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
th {
  position: sticky;
  top: 0;
  background: var(--vscode-editor-background);
  font-weight: 600;
  z-index: 1;
}
tr.data-row { cursor: pointer; }
tr.data-row:hover { background: var(--vscode-list-hoverBackground); }
tr.data-row.selected { background: var(--vscode-list-activeSelectionBackground); color: var(--vscode-list-activeSelectionForeground); }
tr.group-row {
  cursor: pointer;
  font-weight: bold;
  background: var(--vscode-sideBar-background);
}
tr.group-row td { padding: 6px 8px; }
td.sev-cell { font-weight: bold; text-transform: uppercase; font-size: 10px; }

.detail-panel {
  width: 320px;
  border-left: 1px solid var(--vscode-panel-border);
  overflow-y: auto;
  padding: 12px;
  display: none;
  flex-direction: column;
  gap: 10px;
}
.detail-panel.visible { display: flex; }
.detail-panel h3 { font-size: 14px; margin-bottom: 4px; }
.detail-panel .meta { font-size: 11px; color: var(--vscode-descriptionForeground); }
.detail-panel .meta span { display: block; margin-bottom: 2px; }
.detail-panel .section-title { font-size: 12px; font-weight: 600; margin-top: 8px; }
.detail-panel .message { font-size: 12px; white-space: pre-wrap; margin-top: 4px; line-height: 1.5; }
.detail-panel textarea {
  width: 100%;
  min-height: 80px;
  background: var(--vscode-input-background);
  color: var(--vscode-input-foreground);
  border: 1px solid var(--vscode-input-border);
  padding: 6px;
  font-family: inherit;
  font-size: 12px;
  resize: vertical;
}

.overlay {
  position: absolute;
  inset: 0;
  background: rgba(0,0,0,0.5);
  display: none;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 12px;
  z-index: 100;
}
.overlay.visible { display: flex; }
.overlay .progress-text { color: #fff; font-size: 14px; }
.overlay button { background: var(--vscode-errorForeground); color: #fff; border: none; padding: 6px 16px; cursor: pointer; border-radius: 3px; }

.loading { text-align: center; padding: 40px; color: var(--vscode-descriptionForeground); }
</style>
</head>
<body>
<div class="toolbar">
  <button id="btn-changes" title="Re-analyse changes">Re-analyse Changes</button>
  <button id="btn-project" title="Re-analyse project">Re-analyse Project</button>
  <button id="btn-stop" class="stop" title="Stop analysis">Stop</button>
  <div class="severity-counts">
    <span class="sev-high" id="count-high">H:0</span>
    <span class="sev-medium" id="count-medium">M:0</span>
    <span class="sev-low" id="count-low">L:0</span>
    <span class="sev-info" id="count-info">I:0</span>
  </div>
  <label><select id="filter-severity"><option value="all">All Severities</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option><option value="info">Info</option></select></label>
  <label><select id="filter-issue"><option value="all">All Issues</option></select></label>
  <label><select id="group-by"><option value="none">No Grouping</option><option value="severity">Group by Severity</option><option value="file">Group by File</option><option value="issue">Group by Issue</option></select></label>
  <button id="btn-detail" title="Toggle detail panel">Detail</button>
  <button id="btn-test-connection" title="Test connection to the configured LLM provider">Test Connection</button>
  <div class="spacer"></div>
  <div class="logo"><a href="https://www.matthewratcliffe.com.au" title="matthewratcliffe.com.au">MR</a></div>
</div>
<div class="main-area">
  <div class="table-container">
    <div class="loading" id="loading-state">Loading findings...</div>
    <table id="findings-table" style="display:none;">
      <thead><tr><th>Severity</th><th>Issue</th><th>Description</th><th>File</th><th>Line</th></tr></thead>
      <tbody id="findings-body"></tbody>
    </table>
  </div>
  <div class="detail-panel" id="detail-panel">
    <h3 id="detail-title"></h3>
    <div class="meta">
      <span id="detail-severity"></span>
      <span id="detail-category"></span>
      <span id="detail-file"></span>
      <span id="detail-lines"></span>
      <span id="detail-provider"></span>
    </div>
    <div class="section-title">Why it matters</div>
    <div class="message" id="detail-message"></div>
    <div class="section-title">Team Notes</div>
    <textarea id="detail-notes" placeholder="Add team notes..."></textarea>
  </div>
</div>
<div class="overlay" id="processing-overlay">
  <div class="progress-text" id="progress-text">Analysing...</div>
  <button id="overlay-stop">Stop Analysis</button>
</div>

<script>
(function() {
  const vscode = acquireVsCodeApi();
  let findings = [];
  let selectedFinding = null;
  let collapsedGroups = new Set();
  let detailVisible = false;
  let noteTimer = null;

  const btnChanges = document.getElementById('btn-changes');
  const btnProject = document.getElementById('btn-project');
  const btnStop = document.getElementById('btn-stop');
  const btnDetail = document.getElementById('btn-detail');
  const btnTestConnection = document.getElementById('btn-test-connection');
  const filterSeverity = document.getElementById('filter-severity');
  const filterIssue = document.getElementById('filter-issue');
  const groupBy = document.getElementById('group-by');
  const loadingState = document.getElementById('loading-state');
  const table = document.getElementById('findings-table');
  const tbody = document.getElementById('findings-body');
  const detailPanel = document.getElementById('detail-panel');
  const overlay = document.getElementById('processing-overlay');
  const progressText = document.getElementById('progress-text');
  const overlayStop = document.getElementById('overlay-stop');
  const notesArea = document.getElementById('detail-notes');

  btnChanges.addEventListener('click', () => vscode.postMessage({ type: 'reanalyse-changes' }));
  btnProject.addEventListener('click', () => vscode.postMessage({ type: 'reanalyse-project' }));
  btnStop.addEventListener('click', () => vscode.postMessage({ type: 'stop-analysis' }));
  btnTestConnection.addEventListener('click', () => vscode.postMessage({ type: 'test-connection' }));
  overlayStop.addEventListener('click', () => vscode.postMessage({ type: 'stop-analysis' }));
  btnDetail.addEventListener('click', () => {
    detailVisible = !detailVisible;
    detailPanel.classList.toggle('visible', detailVisible);
  });

  filterSeverity.addEventListener('change', render);
  filterIssue.addEventListener('change', render);
  groupBy.addEventListener('change', render);

  notesArea.addEventListener('input', () => {
    if (!selectedFinding) return;
    clearTimeout(noteTimer);
    noteTimer = setTimeout(() => {
      vscode.postMessage({ type: 'save-note', finding: selectedFinding, content: notesArea.value });
    }, 800);
  });

  window.addEventListener('message', (event) => {
    const msg = event.data;
    switch (msg.type) {
      case 'findings':
        findings = msg.data || [];
        loadingState.style.display = 'none';
        table.style.display = '';
        updateIssueFiler();
        updateCounts();
        render();
        break;
      case 'processing':
        overlay.classList.add('visible');
        progressText.textContent = msg.text || 'Analysing...';
        break;
      case 'processing-done':
        overlay.classList.remove('visible');
        break;
      case 'error':
        loadingState.textContent = msg.message || 'Failed to connect to service';
        loadingState.style.display = '';
        loadingState.style.color = 'var(--vscode-errorForeground)';
        table.style.display = 'none';
        break;
      case 'note-loaded':
        if (selectedFinding && selectedFinding.id === msg.findingId) {
          notesArea.value = msg.note || '';
        }
        break;
    }
  });

  function updateCounts() {
    const counts = { high: 0, medium: 0, low: 0, info: 0 };
    for (const f of findings) {
      if (!f.dismissed && counts[f.severity] !== undefined) counts[f.severity]++;
    }
    document.getElementById('count-high').textContent = 'H:' + counts.high;
    document.getElementById('count-medium').textContent = 'M:' + counts.medium;
    document.getElementById('count-low').textContent = 'L:' + counts.low;
    document.getElementById('count-info').textContent = 'I:' + counts.info;
  }

  function updateIssueFiler() {
    const cats = [...new Set(findings.map(f => f.category))].sort();
    filterIssue.innerHTML = '<option value="all">All Issues</option>';
    for (const c of cats) {
      const opt = document.createElement('option');
      opt.value = c;
      opt.textContent = c;
      filterIssue.appendChild(opt);
    }
  }

  function getFiltered() {
    let list = findings.filter(f => !f.dismissed);
    const sev = filterSeverity.value;
    if (sev !== 'all') list = list.filter(f => f.severity === sev);
    const iss = filterIssue.value;
    if (iss !== 'all') list = list.filter(f => f.category === iss);
    return list;
  }

  function render() {
    const filtered = getFiltered();
    const group = groupBy.value;
    tbody.innerHTML = '';

    if (group === 'none') {
      for (const f of filtered) appendRow(f);
      return;
    }

    const groups = new Map();
    for (const f of filtered) {
      let key;
      if (group === 'severity') key = f.severity;
      else if (group === 'file') key = f.file;
      else key = f.category;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(f);
    }

    for (const [key, items] of groups) {
      const collapsed = collapsedGroups.has(key);
      const arrow = collapsed ? '\\u25B6' : '\\u25BC';
      const gr = document.createElement('tr');
      gr.className = 'group-row';
      gr.innerHTML = '<td colspan="5">' + arrow + ' ' + key + ' (' + items.length + ')</td>';
      gr.addEventListener('click', () => {
        if (collapsedGroups.has(key)) collapsedGroups.delete(key);
        else collapsedGroups.add(key);
        render();
      });
      tbody.appendChild(gr);
      if (!collapsed) {
        for (const f of items) appendRow(f);
      }
    }
  }

  function appendRow(f) {
    const tr = document.createElement('tr');
    tr.className = 'data-row';
    if (selectedFinding && selectedFinding.id === f.id) tr.classList.add('selected');
    const sevClass = 'sev-' + f.severity;
    tr.innerHTML =
      '<td class="sev-cell ' + sevClass + '">' + f.severity + '</td>' +
      '<td>' + esc(f.category) + '</td>' +
      '<td>' + esc(f.title) + '</td>' +
      '<td>' + esc(basename(f.file)) + '</td>' +
      '<td>' + f.startLine + '</td>';
    tr.addEventListener('click', () => selectFinding(f, tr));
    tr.addEventListener('dblclick', () => {
      vscode.postMessage({ type: 'navigate-to-file', file: f.file, line: f.startLine });
    });
    tbody.appendChild(tr);
  }

  function selectFinding(f, tr) {
    selectedFinding = f;
    document.querySelectorAll('tr.data-row.selected').forEach(el => el.classList.remove('selected'));
    tr.classList.add('selected');
    document.getElementById('detail-title').textContent = f.title;
    document.getElementById('detail-severity').textContent = 'Severity: ' + f.severity;
    document.getElementById('detail-category').textContent = 'Category: ' + f.category;
    document.getElementById('detail-file').textContent = 'File: ' + f.file;
    document.getElementById('detail-lines').textContent = 'Lines: ' + f.startLine + '-' + f.endLine;
    document.getElementById('detail-provider').textContent = 'Provider: ' + f.provider;
    document.getElementById('detail-message').textContent = f.message;
    notesArea.value = '';
    detailVisible = true;
    detailPanel.classList.add('visible');
    vscode.postMessage({ type: 'load-note', finding: f });
  }

  function esc(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function basename(filepath) {
    return filepath.split(/[\\/\\\\]/).pop() || filepath;
  }
})();
</script>
</body>
</html>`;
    }
}
exports.PeerReviewerWebviewProvider = PeerReviewerWebviewProvider;
PeerReviewerWebviewProvider.viewType = "peerReviewer.panel";
//# sourceMappingURL=webview-provider.js.map