/* ────────────────────────────────────────────────────────
   Energy Intelligence Dashboard — app.js
   Uses Anthropic Claude API (browser-side) to:
     1. Fetch and discover articles from source URLs
     2. Classify them into user-defined subjects
     3. Display and refresh them on demand
   ──────────────────────────────────────────────────────── */

const STORAGE_KEY = 'energy_intel_v2';
const API_ENDPOINT = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-20250514';

// Tag colour rotation
const TAG_CLASSES = ['tag-green','tag-blue','tag-amber','tag-purple','tag-teal','tag-coral'];
const TYPE_LABELS = { article: 'Article', report: 'Report', ruling: 'Ruling', study: 'Study', news: 'News', other: 'Other' };

/* ═══════════════════════════════════════════════════════
   State
   ═══════════════════════════════════════════════════════ */
let state = {
  sources: [],
  subjects: [],
  articles: [],        // { id, title, url, summary, date, source, type, subjects[] }
  lastRefresh: null,
  activeSubject: null, // null = "All"
  apiKey: ''
};

/* ═══════════════════════════════════════════════════════
   Persistence
   ═══════════════════════════════════════════════════════ */
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      state = { ...state, ...saved };
    }
  } catch(e) { console.warn('State load failed', e); }

  // Seed defaults if empty
  if (!state.sources.length) {
    state.sources = [
      { id: uid(), label: 'Utility Dive', url: 'https://www.utilitydive.com/' },
      { id: uid(), label: 'LBL Energy Research', url: 'https://emp.lbl.gov/research-areas/' }
    ];
  }
  if (!state.subjects.length) {
    state.subjects = [
      { id: uid(), name: 'Energy Efficiency', keywords: 'efficiency, conservation, building, HVAC, retrofit, insulation, LED, heat pump' },
      { id: uid(), name: 'Load Management (Demand Response)', keywords: 'demand response, DR, load flexibility, curtailment, peak demand, VPP, virtual power plant, load shifting' },
      { id: uid(), name: 'Distributed Energy Resources (Solar & Storage)', keywords: 'solar, PV, storage, battery, BESS, DER, distributed generation, rooftop, microgrid, inverter, SGIP' }
    ];
  }

  // Load API key from localStorage separately (keep it separate for clarity)
  const storedKey = localStorage.getItem('energy_intel_apikey');
  if (storedKey) state.apiKey = storedKey;
}

function saveState() {
  const toSave = { ...state };
  delete toSave.apiKey; // Don't save key in main blob
  localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
  if (state.apiKey) localStorage.setItem('energy_intel_apikey', state.apiKey);
}

function uid() { return Math.random().toString(36).slice(2, 9); }

/* ═══════════════════════════════════════════════════════
   Render Helpers
   ═══════════════════════════════════════════════════════ */
function renderSubjectTabs() {
  const scroll = document.getElementById('subtabScroll');
  const allTab = `<button class="subtab ${state.activeSubject === null ? 'active' : ''}"
      onclick="app.setActiveSubject(null)">
    All
    <span class="subtab-count">${state.articles.length}</span>
  </button>`;

  const tabs = state.subjects.map(s => {
    const count = state.articles.filter(a => a.subjects && a.subjects.includes(s.id)).length;
    return `<button class="subtab ${state.activeSubject === s.id ? 'active' : ''}"
        onclick="app.setActiveSubject('${s.id}')">
      ${s.name}
      <span class="subtab-count">${count}</span>
    </button>`;
  }).join('');

  scroll.innerHTML = allTab + tabs;
  document.getElementById('sourceCount').textContent = state.sources.length;
}

function renderArticles() {
  const grid = document.getElementById('articleGrid');
  const empty = document.getElementById('emptyState');

  let articles = state.activeSubject === null
    ? state.articles
    : state.articles.filter(a => a.subjects && a.subjects.includes(state.activeSubject));

  // Sort newest first (by date string descending, fallback to insertion order)
  articles = [...articles].sort((a, b) => {
    if (a.date && b.date) return new Date(b.date) - new Date(a.date);
    return 0;
  });

  if (articles.length === 0) {
    grid.style.display = 'none';
    empty.style.display = 'flex';
    return;
  }

  empty.style.display = 'none';
  grid.style.display = 'grid';

  grid.innerHTML = articles.map((a, i) => renderCard(a, i)).join('');
}

function renderCard(a, idx) {
  const tagClass = TAG_CLASSES[idx % TAG_CLASSES.length];
  const subjectNames = (a.subjects || []).map(sid => {
    const s = state.subjects.find(x => x.id === sid);
    return s ? `<span class="card-tag ${TAG_CLASSES[state.subjects.indexOf(s) % TAG_CLASSES.length]}">${s.name}</span>` : '';
  }).join('');

  const typeLabel = TYPE_LABELS[a.type] || 'Article';
  const dateStr = a.date ? formatDate(a.date) : '';
  const sourceDomain = a.source || extractDomain(a.url);

  return `<div class="article-card" style="animation-delay:${idx * 0.03}s">
    <div class="card-meta">
      <span class="card-source">${escHtml(sourceDomain)}</span>
      ${dateStr ? `<span class="card-date">${dateStr}</span>` : ''}
    </div>
    <div class="card-title">
      <a href="${escHtml(a.url)}" target="_blank" rel="noopener">${escHtml(a.title)}</a>
    </div>
    ${a.summary ? `<p class="card-summary">${escHtml(a.summary)}</p>` : ''}
    ${subjectNames ? `<div class="card-tags">${subjectNames}</div>` : ''}
    <div class="card-footer">
      <span class="card-type-badge">${typeLabel}</span>
      <a href="${escHtml(a.url)}" target="_blank" rel="noopener" class="card-link">
        Read →
      </a>
    </div>
  </div>`;
}

function renderSourceList() {
  const list = document.getElementById('sourceList');
  if (!state.sources.length) {
    list.innerHTML = '<li style="color:var(--text-muted);font-size:0.8rem;padding:8px 0">No sources yet.</li>';
    return;
  }
  list.innerHTML = state.sources.map(s => `
    <li class="source-item">
      <div class="source-dot"></div>
      <div class="source-info">
        <div class="source-label">${escHtml(s.label || extractDomain(s.url))}</div>
        <div class="source-url">${escHtml(s.url)}</div>
      </div>
      <button class="btn-delete btn-icon" title="Delete" onclick="app.deleteSource('${s.id}')">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
      </button>
    </li>
  `).join('');
}

function renderSubjectList() {
  const list = document.getElementById('subjectList');
  if (!state.subjects.length) {
    list.innerHTML = '<li style="color:var(--text-muted);font-size:0.8rem;padding:8px 0">No subjects yet.</li>';
    return;
  }
  list.innerHTML = state.subjects.map((s, i) => `
    <li class="subject-item" draggable="true"
        data-id="${s.id}"
        ondragstart="app.dragStart(event,'${s.id}')"
        ondragover="app.dragOver(event)"
        ondrop="app.drop(event,'${s.id}')"
        ondragleave="app.dragLeave(event)">
      <span class="drag-handle">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="5" width="16" height="2" rx="1"/><rect x="4" y="11" width="16" height="2" rx="1"/><rect x="4" y="17" width="16" height="2" rx="1"/></svg>
      </span>
      <div style="flex:1;min-width:0">
        <div class="subject-name">${escHtml(s.name)}</div>
        ${s.keywords ? `<div class="subject-keywords">Keywords: ${escHtml(s.keywords.slice(0,60))}${s.keywords.length>60?'…':''}</div>` : ''}
      </div>
      <button class="btn-edit btn-icon" title="Edit" onclick="app.openEditSubject('${s.id}')">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4Z"/></svg>
      </button>
      <button class="btn-delete btn-icon" title="Delete" onclick="app.deleteSubject('${s.id}')">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
      </button>
    </li>
  `).join('');
}

function renderAll() {
  renderSubjectTabs();
  renderArticles();
  renderSourceList();
  renderSubjectList();
  updateApiKeyUI();
  updateLastRefresh();
}

function updateLastRefresh() {
  const el = document.getElementById('lastRefresh');
  if (state.lastRefresh) {
    el.textContent = 'Refreshed ' + timeAgo(new Date(state.lastRefresh));
  } else {
    el.textContent = 'Never refreshed';
  }
}

function updateApiKeyUI() {
  const input = document.getElementById('apiKeyInput');
  const status = document.getElementById('apiStatus');
  if (state.apiKey) {
    input.value = state.apiKey;
    status.textContent = '✓ API key saved';
    status.style.color = 'var(--accent)';
  }
}

/* ═══════════════════════════════════════════════════════
   Navigation
   ═══════════════════════════════════════════════════════ */
function switchMainTab(name) {
  document.querySelectorAll('.main-view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('view-' + name).classList.add('active');
  document.getElementById('tab-' + name).classList.add('active');
}

function setActiveSubject(id) {
  state.activeSubject = id;
  renderSubjectTabs();
  renderArticles();
}

/* ═══════════════════════════════════════════════════════
   Sources
   ═══════════════════════════════════════════════════════ */
function showAddSourceModal() {
  document.getElementById('newSourceUrl').value = '';
  document.getElementById('newSourceLabel').value = '';
  document.getElementById('addSourceModal').style.display = 'flex';
}

function addSource() {
  const url = document.getElementById('newSourceUrl').value.trim();
  const label = document.getElementById('newSourceLabel').value.trim();
  if (!url) { toast('Please enter a URL', 'error'); return; }
  try { new URL(url); } catch { toast('Invalid URL', 'error'); return; }
  state.sources.push({ id: uid(), label: label || extractDomain(url), url });
  saveState();
  closeModal('addSourceModal');
  renderSourceList();
  document.getElementById('sourceCount').textContent = state.sources.length;
  toast('Source added');
}

function deleteSource(id) {
  if (!confirm('Remove this source?')) return;
  state.sources = state.sources.filter(s => s.id !== id);
  saveState();
  renderSourceList();
  document.getElementById('sourceCount').textContent = state.sources.length;
  toast('Source removed');
}

/* ═══════════════════════════════════════════════════════
   Subjects
   ═══════════════════════════════════════════════════════ */
function addSubjectPrompt() {
  document.getElementById('newSubjectName').value = '';
  document.getElementById('newSubjectKeywords').value = '';
  document.getElementById('addSubjectModal').style.display = 'flex';
}

function addSubject() {
  const name = document.getElementById('newSubjectName').value.trim();
  const keywords = document.getElementById('newSubjectKeywords').value.trim();
  if (!name) { toast('Subject name required', 'error'); return; }
  state.subjects.push({ id: uid(), name, keywords });
  saveState();
  closeModal('addSubjectModal');
  renderAll();
  toast('Subject added');
}

function deleteSubject(id) {
  if (!confirm('Delete this subject? Articles won\'t be deleted, just unclassified from it.')) return;
  state.subjects = state.subjects.filter(s => s.id !== id);
  // Remove from articles
  state.articles.forEach(a => { a.subjects = (a.subjects||[]).filter(sid => sid !== id); });
  if (state.activeSubject === id) state.activeSubject = null;
  saveState();
  renderAll();
  toast('Subject deleted');
}

function openEditSubject(id) {
  const s = state.subjects.find(x => x.id === id);
  if (!s) return;
  document.getElementById('editSubjectId').value = id;
  document.getElementById('editSubjectName').value = s.name;
  document.getElementById('editSubjectKeywords').value = s.keywords || '';
  document.getElementById('editSubjectModal').style.display = 'flex';
}

function saveEditSubject() {
  const id = document.getElementById('editSubjectId').value;
  const name = document.getElementById('editSubjectName').value.trim();
  const keywords = document.getElementById('editSubjectKeywords').value.trim();
  if (!name) { toast('Name required', 'error'); return; }
  const s = state.subjects.find(x => x.id === id);
  if (s) { s.name = name; s.keywords = keywords; }
  saveState();
  closeModal('editSubjectModal');
  renderAll();
  toast('Subject updated');
}

/* ─── Drag-to-Reorder subjects ─── */
let _dragId = null;

function dragStart(e, id) { _dragId = id; e.dataTransfer.effectAllowed = 'move'; }
function dragOver(e) { e.preventDefault(); e.currentTarget.classList.add('drag-over'); }
function dragLeave(e) { e.currentTarget.classList.remove('drag-over'); }
function drop(e, targetId) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');
  if (_dragId === targetId) return;
  const fromIdx = state.subjects.findIndex(s => s.id === _dragId);
  const toIdx   = state.subjects.findIndex(s => s.id === targetId);
  if (fromIdx === -1 || toIdx === -1) return;
  const [moved] = state.subjects.splice(fromIdx, 1);
  state.subjects.splice(toIdx, 0, moved);
  saveState();
  renderAll();
}

/* ═══════════════════════════════════════════════════════
   Modals
   ═══════════════════════════════════════════════════════ */
function closeModal(id) { document.getElementById(id).style.display = 'none'; }

/* ═══════════════════════════════════════════════════════
   API Key
   ═══════════════════════════════════════════════════════ */
function saveApiKey() {
  const key = document.getElementById('apiKeyInput').value.trim();
  if (!key.startsWith('sk-ant')) { toast('Key should start with sk-ant-…', 'error'); return; }
  state.apiKey = key;
  saveState();
  updateApiKeyUI();
  toast('API key saved');
}

/* ═══════════════════════════════════════════════════════
   Refresh — Core Fetch & Classify Pipeline
   ═══════════════════════════════════════════════════════ */
async function refresh() {
  if (!state.apiKey) {
    toast('Please enter your Anthropic API key in the Inputs tab first.', 'error');
    switchMainTab('inputs');
    return;
  }
  if (!state.sources.length) {
    toast('Add at least one source link in the Inputs tab.', 'error');
    switchMainTab('inputs');
    return;
  }

  const btn = document.getElementById('refreshBtn');
  btn.classList.add('loading');
  btn.disabled = true;

  showProgress(0, 'Starting…');

  try {
    // Step 1: Discover article links from each source (one level deep)
    const discovered = [];
    for (let i = 0; i < state.sources.length; i++) {
      const src = state.sources[i];
      const pct = Math.round((i / state.sources.length) * 40);
      showProgress(pct, `Discovering articles from ${src.label}…`);

      try {
        const links = await discoverArticles(src);
        discovered.push(...links.map(l => ({ ...l, sourceId: src.id, sourceLabel: src.label })));
      } catch(e) {
        console.warn(`Failed to discover from ${src.url}:`, e);
        toast(`Could not reach ${src.label} — skipped`, 'error');
      }
    }

    if (!discovered.length) {
      toast('No articles discovered. Check API key and sources.', 'error');
      hideProgress();
      btn.classList.remove('loading');
      btn.disabled = false;
      return;
    }

    // Deduplicate by URL
    const seen = new Set(state.articles.map(a => a.url));
    const newLinks = discovered.filter(d => !seen.has(d.url));

    showProgress(45, `Found ${discovered.length} articles, ${newLinks.length} new…`);

    if (!newLinks.length) {
      toast('No new articles found since last refresh.');
      state.lastRefresh = new Date().toISOString();
      saveState();
      updateLastRefresh();
      hideProgress();
      btn.classList.remove('loading');
      btn.disabled = false;
      return;
    }

    // Step 2: Classify all new articles in one batch call
    showProgress(55, `Classifying ${newLinks.length} articles…`);
    const classified = await classifyArticles(newLinks);

    showProgress(85, 'Updating dashboard…');

    // Merge into state (keep existing articles, prepend new)
    state.articles = [...classified, ...state.articles];
    // Cap to 500 articles to avoid localStorage bloat
    if (state.articles.length > 500) state.articles = state.articles.slice(0, 500);

    state.lastRefresh = new Date().toISOString();
    saveState();

    showProgress(100, 'Done!');
    setTimeout(hideProgress, 800);

    renderAll();
    toast(`Added ${classified.length} new articles.`);

  } catch(err) {
    console.error('Refresh error:', err);
    toast('Error: ' + (err.message || 'Unknown error'), 'error');
    hideProgress();
  }

  btn.classList.remove('loading');
  btn.disabled = false;
}

/* ──────────────────────────────────────────────────────
   Discover Articles — asks Claude to fetch and parse
   the source URL and return article links + titles
   ────────────────────────────────────────────────────── */
async function discoverArticles(source) {
  const subjectDescriptions = state.subjects
    .map(s => `- "${s.name}": ${s.keywords}`)
    .join('\n');

  const prompt = `You are a research assistant that discovers articles from energy news websites.

Fetch the page at this URL: ${source.url}

Look at the page content and extract ALL linked articles, research reports, blog posts, news items, rulings, or publications you can find — especially those accessible from links on this page (one level deep from the homepage/index). Focus on actual content links, not navigation or legal links.

For each article found, return a JSON array with objects having these fields:
- url: the full URL (absolute)
- title: the article/report title
- date: publication date if visible (ISO format YYYY-MM-DD or null)
- type: one of "article", "report", "study", "ruling", "news", "other"
- summary: a 1-2 sentence summary if you can infer it from the title/context

Return ONLY a valid JSON array, no markdown fences, no explanation. Example:
[{"url":"https://example.com/article","title":"Article Title","date":"2024-01-15","type":"article","summary":"Brief summary."}]

If you cannot access the URL, return an empty array [].`;

  const response = await claudeAPI([{ role: 'user', content: prompt }], {
    tools: [{
      type: 'web_search_20250305',
      name: 'web_search'
    }]
  });

  // Extract JSON array from response
  return parseJsonArray(response);
}

/* ──────────────────────────────────────────────────────
   Classify Articles — asks Claude to assign each article
   to one or more subjects
   ────────────────────────────────────────────────────── */
async function classifyArticles(articles) {
  const subjectDescriptions = state.subjects
    .map(s => `- id="${s.id}" name="${s.name}" keywords: ${s.keywords}`)
    .join('\n');

  // Process in chunks of 30 to stay within token limits
  const CHUNK = 30;
  const results = [];

  for (let i = 0; i < articles.length; i += CHUNK) {
    const chunk = articles.slice(i, i + CHUNK);

    const articleList = chunk.map((a, idx) =>
      `${idx}: title="${a.title}" type=${a.type || 'article'} url=${a.url}`
    ).join('\n');

    const prompt = `You are classifying energy industry articles into subject categories.

SUBJECTS:
${subjectDescriptions}

ARTICLES TO CLASSIFY (by index):
${articleList}

For each article, assign it to one or more subject IDs from the list above. An article can match multiple subjects.
Return a JSON array with one object per article, in the same order, with fields:
- index: the article index (0-based)
- subjects: array of matching subject id strings (can be empty array if none match)

Return ONLY valid JSON, no markdown, no explanation.`;

    try {
      const response = await claudeAPI([{ role: 'user', content: prompt }]);
      const classifications = parseJsonArray(response);

      chunk.forEach((article, idx) => {
        const cls = classifications.find(c => c.index === idx);
        results.push({
          id: uid(),
          title: article.title,
          url: article.url,
          date: article.date || null,
          type: article.type || 'article',
          summary: article.summary || '',
          source: article.sourceLabel || extractDomain(article.url),
          subjects: cls ? (cls.subjects || []) : []
        });
      });
    } catch(e) {
      // If classification fails, add articles without subjects
      chunk.forEach(article => {
        results.push({
          id: uid(),
          title: article.title,
          url: article.url,
          date: article.date || null,
          type: article.type || 'article',
          summary: article.summary || '',
          source: article.sourceLabel || extractDomain(article.url),
          subjects: []
        });
      });
    }
  }

  return results;
}

/* ──────────────────────────────────────────────────────
   Claude API Call
   ────────────────────────────────────────────────────── */
async function claudeAPI(messages, extra = {}) {
  const body = {
    model: MODEL,
    max_tokens: 4096,
    messages,
    ...extra
  };

  const res = await fetch(API_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': state.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-calls': 'true'
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `API error ${res.status}`);
  }

  const data = await res.json();

  // Extract text from content blocks
  return (data.content || [])
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('');
}

/* ══════════════════════════════════════════════════════
   Progress UI
   ══════════════════════════════════════════════════════ */
function showProgress(pct, label) {
  const wrap = document.getElementById('progressWrap');
  const bar  = document.getElementById('progressBar');
  const lbl  = document.getElementById('progressLabel');
  wrap.style.display = 'block';
  bar.style.width = pct + '%';
  lbl.textContent = label;
}

function hideProgress() {
  document.getElementById('progressWrap').style.display = 'none';
  document.getElementById('progressBar').style.width = '0%';
}

/* ══════════════════════════════════════════════════════
   Utilities
   ══════════════════════════════════════════════════════ */
function parseJsonArray(text) {
  try {
    // Strip markdown fences if present
    const clean = text.replace(/```json\s*/gi,'').replace(/```\s*/g,'').trim();
    const parsed = JSON.parse(clean);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // Try to find the first [ ... ] block
    const match = text.match(/\[[\s\S]*\]/);
    if (match) {
      try { const p = JSON.parse(match[0]); return Array.isArray(p) ? p : []; }
      catch { return []; }
    }
    return [];
  }
}

function extractDomain(url) {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, '');
  } catch { return url; }
}

function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  try {
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return dateStr; }
}

function timeAgo(date) {
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  const hrs  = Math.floor(mins / 60);
  const days = Math.floor(hrs / 24);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (hrs < 24)  return `${hrs}h ago`;
  return `${days}d ago`;
}

function toast(msg, type = 'success') {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

/* ══════════════════════════════════════════════════════
   Init
   ══════════════════════════════════════════════════════ */
loadState();
renderAll();

// Close modals on Escape
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay').forEach(m => m.style.display = 'none');
  }
});

// Enter key in modal inputs
document.getElementById('newSourceUrl').addEventListener('keydown', e => {
  if (e.key === 'Enter') app.addSource();
});
document.getElementById('newSubjectName').addEventListener('keydown', e => {
  if (e.key === 'Enter') app.addSubject();
});

/* ══════════════════════════════════════════════════════
   Public API
   ══════════════════════════════════════════════════════ */
window.app = {
  refresh,
  switchMainTab,
  setActiveSubject,
  showAddSourceModal,
  addSource,
  deleteSource,
  addSubjectPrompt,
  addSubject,
  deleteSubject,
  openEditSubject,
  saveEditSubject,
  closeModal,
  saveApiKey,
  dragStart,
  dragOver,
  dragLeave,
  drop
};
