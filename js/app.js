/* ────────────────────────────────────────────────────────
   Energy Intelligence Dashboard — app.js
   Fetches RSS/Atom feeds and classifies by keyword.
   No API key required — 100% free.
   ──────────────────────────────────────────────────────── */

const STORAGE_KEY = 'energy_intel_v2';
const CORS_PROXY  = 'https://corsproxy.io/?';

const TAG_CLASSES = ['tag-green','tag-blue','tag-amber','tag-purple','tag-teal','tag-coral'];
const TYPE_LABELS = { article: 'Article', report: 'Report', ruling: 'Ruling', study: 'Study', news: 'News', other: 'Other' };

/* ═══════════════════════════════════════════════════════
   State
   ═══════════════════════════════════════════════════════ */
let state = {
  sources:       [],
  subjects:      [],
  articles:      [],   // { id, title, url, summary, date, source, type, subjects[] }
  lastRefresh:   null,
  activeSubject: null  // null = "All"
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
      delete state.apiKey; // drop legacy field
    }
  } catch(e) { console.warn('State load failed', e); }

  if (!state.sources.length) {
    state.sources = [
      { id: uid(), label: 'Utility Dive',        url: 'https://www.utilitydive.com/feeds/news/' },
      { id: uid(), label: 'CleanTechnica',        url: 'https://cleantechnica.com/feed/' },
      { id: uid(), label: 'LBL Energy Research',  url: 'https://emp.lbl.gov/news' }
    ];
  }
  if (!state.subjects.length) {
    state.subjects = [
      { id: uid(), name: 'Energy Efficiency',                            keywords: 'efficiency, conservation, building, HVAC, retrofit, insulation, LED, heat pump' },
      { id: uid(), name: 'Load Management (Demand Response)',             keywords: 'demand response, DR, load flexibility, curtailment, peak demand, VPP, virtual power plant, load shifting' },
      { id: uid(), name: 'Distributed Energy Resources (Solar & Storage)', keywords: 'solar, PV, storage, battery, BESS, DER, distributed generation, rooftop, microgrid, inverter, SGIP' }
    ];
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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
  const grid  = document.getElementById('articleGrid');
  const empty = document.getElementById('emptyState');

  let articles = state.activeSubject === null
    ? state.articles
    : state.articles.filter(a => a.subjects && a.subjects.includes(state.activeSubject));

  articles = [...articles].sort((a, b) => {
    if (a.date && b.date) return new Date(b.date) - new Date(a.date);
    return 0;
  });

  if (articles.length === 0) {
    grid.style.display  = 'none';
    empty.style.display = 'flex';
    return;
  }

  empty.style.display = 'none';
  grid.style.display  = 'grid';
  grid.innerHTML = articles.map((a, i) => renderCard(a, i)).join('');
}

function renderCard(a, idx) {
  const subjectNames = (a.subjects || []).map(sid => {
    const s = state.subjects.find(x => x.id === sid);
    return s ? `<span class="card-tag ${TAG_CLASSES[state.subjects.indexOf(s) % TAG_CLASSES.length]}">${s.name}</span>` : '';
  }).join('');

  const typeLabel    = TYPE_LABELS[a.type] || 'Article';
  const dateStr      = a.date ? formatDate(a.date) : '';
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
      <a href="${escHtml(a.url)}" target="_blank" rel="noopener" class="card-link">Read →</a>
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
  updateLastRefresh();
}

function updateLastRefresh() {
  const el = document.getElementById('lastRefresh');
  el.textContent = state.lastRefresh
    ? 'Refreshed ' + timeAgo(new Date(state.lastRefresh))
    : 'Never refreshed';
}

/* ═══════════════════════════════════════════════════════
   Navigation
   ═══════════════════════════════════════════════════════ */
function switchMainTab(name) {
  document.querySelectorAll('.main-view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('view-' + name).classList.add('active');
  document.getElementById('tab-'  + name).classList.add('active');
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
  document.getElementById('newSourceUrl').value   = '';
  document.getElementById('newSourceLabel').value = '';
  document.getElementById('addSourceModal').style.display = 'flex';
}

function addSource() {
  const url   = document.getElementById('newSourceUrl').value.trim();
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
  document.getElementById('newSubjectName').value     = '';
  document.getElementById('newSubjectKeywords').value = '';
  document.getElementById('addSubjectModal').style.display = 'flex';
}

function addSubject() {
  const name     = document.getElementById('newSubjectName').value.trim();
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
  state.articles.forEach(a => { a.subjects = (a.subjects||[]).filter(sid => sid !== id); });
  if (state.activeSubject === id) state.activeSubject = null;
  saveState();
  renderAll();
  toast('Subject deleted');
}

function openEditSubject(id) {
  const s = state.subjects.find(x => x.id === id);
  if (!s) return;
  document.getElementById('editSubjectId').value       = id;
  document.getElementById('editSubjectName').value     = s.name;
  document.getElementById('editSubjectKeywords').value = s.keywords || '';
  document.getElementById('editSubjectModal').style.display = 'flex';
}

function saveEditSubject() {
  const id       = document.getElementById('editSubjectId').value;
  const name     = document.getElementById('editSubjectName').value.trim();
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
function dragOver(e)  { e.preventDefault(); e.currentTarget.classList.add('drag-over'); }
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
   Refresh — RSS Feed Pipeline
   ═══════════════════════════════════════════════════════ */
async function refresh() {
  if (!state.sources.length) {
    toast('Add at least one source URL in the Inputs tab.', 'error');
    switchMainTab('inputs');
    return;
  }

  const btn = document.getElementById('refreshBtn');
  btn.classList.add('loading');
  btn.disabled = true;

  showProgress(0, 'Starting…');

  try {
    const discovered = [];

    for (let i = 0; i < state.sources.length; i++) {
      const src = state.sources[i];
      const pct = Math.round((i / state.sources.length) * 70);
      showProgress(pct, `Fetching ${src.label}…`);

      try {
        const items = await fetchAndParseRSS(src);
        discovered.push(...items);
      } catch(e) {
        console.warn(`Failed to fetch ${src.url}:`, e);
        toast(`Could not reach ${src.label} — skipped`, 'error');
      }
    }

    if (!discovered.length) {
      toast('No articles found. Check that your source URLs are accessible.', 'error');
      hideProgress();
      btn.classList.remove('loading');
      btn.disabled = false;
      return;
    }

    // Deduplicate by URL
    const seen     = new Set(state.articles.map(a => a.url));
    const newItems = discovered.filter(d => !seen.has(d.url));

    showProgress(75, `Found ${discovered.length} articles, ${newItems.length} new…`);

    if (!newItems.length) {
      toast('No new articles since last refresh.');
      state.lastRefresh = new Date().toISOString();
      saveState();
      updateLastRefresh();
      hideProgress();
      btn.classList.remove('loading');
      btn.disabled = false;
      return;
    }

    showProgress(88, `Classifying ${newItems.length} articles…`);

    const classified = newItems.map(item => ({
      ...item,
      subjects: classifyByKeywords(item)
    }));

    showProgress(96, 'Saving…');

    state.articles = [...classified, ...state.articles];
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
   Fetch & Parse — tries RSS/Atom first, falls back to
   HTML scraping for sites without a feed
   ────────────────────────────────────────────────────── */
async function fetchAndParseRSS(source) {
  const label    = source.label || extractDomain(source.url);
  const proxyUrl = CORS_PROXY + encodeURIComponent(source.url);
  const res      = await fetch(proxyUrl);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();

  // Try RSS/Atom first
  const rssItems = tryParseRSS(text, label);
  if (rssItems.length > 0) return rssItems;

  // Fall back to HTML scraping
  return scrapeHTML(text, label, source.url);
}

function tryParseRSS(text, sourceLabel) {
  try {
    const parser = new DOMParser();
    const doc    = parser.parseFromString(text, 'text/xml');
    const isAtom = !!doc.querySelector('feed');
    const items  = Array.from(doc.querySelectorAll(isAtom ? 'entry' : 'item'));
    if (!items.length) return [];

    return items.map(item => {
      let url, title, dateRaw, descRaw;
      if (isAtom) {
        url     = item.querySelector('link')?.getAttribute('href')
               || item.querySelector('link')?.textContent?.trim() || '';
        title   = item.querySelector('title')?.textContent?.trim() || '';
        dateRaw = item.querySelector('updated, published')?.textContent || null;
        descRaw = item.querySelector('summary, content')?.textContent || '';
      } else {
        url     = item.querySelector('link')?.textContent?.trim() || '';
        title   = item.querySelector('title')?.textContent?.trim() || '';
        dateRaw = item.querySelector('pubDate')?.textContent || null;
        descRaw = item.querySelector('description')?.textContent || '';
      }
      return {
        id:       uid(),
        url:      url.trim(),
        title:    title,
        date:     parseRSSDate(dateRaw),
        summary:  stripHtml(descRaw).slice(0, 220).trim(),
        source:   sourceLabel,
        type:     detectArticleType(title),
        subjects: []
      };
    }).filter(a => a.url && a.title);
  } catch { return []; }
}

/* ──────────────────────────────────────────────────────
   HTML scraper — extracts article links from pages that
   don't publish an RSS/Atom feed
   ────────────────────────────────────────────────────── */
function scrapeHTML(htmlText, sourceLabel, baseUrl) {
  const parser = new DOMParser();
  const doc    = parser.parseFromString(htmlText, 'text/html');

  // Remove navigation chrome to reduce noise
  doc.querySelectorAll('nav, header, footer, aside, .sidebar, .menu, .navigation, .breadcrumb').forEach(el => el.remove());

  const seen     = new Set();
  const articles = [];

  function addArticle(url, title, container) {
    if (!url || !title || title.length < 10 || seen.has(url)) return;
    if (!isLikelyArticleUrl(url, baseUrl)) return;
    seen.add(url);
    const dateEl  = container?.querySelector('time, [datetime], .date, .pub-date, .published, .entry-date');
    const dateStr = dateEl?.getAttribute('datetime') || dateEl?.textContent;
    const paraEl  = container?.querySelector('p');
    const summary = paraEl ? stripHtml(paraEl.textContent).slice(0, 220).trim() : '';
    articles.push({ id: uid(), url, title: title.trim(), date: parseRSSDate(dateStr), summary, source: sourceLabel, type: detectArticleType(title), subjects: [] });
  }

  // Strategy 1: explicit <article> elements
  doc.querySelectorAll('article').forEach(el => {
    const link    = el.querySelector('h1 a, h2 a, h3 a, h4 a, a[href]');
    const heading = el.querySelector('h1, h2, h3, h4');
    if (link && heading) {
      addArticle(resolveUrl(link.getAttribute('href'), baseUrl), heading.textContent, el);
    }
  });

  // Strategy 2: headings that contain or are followed by a link
  if (articles.length < 5) {
    doc.querySelectorAll('h2 a[href], h3 a[href]').forEach(link => {
      const container = link.closest('li, div, section, article') || link.parentElement?.parentElement;
      addArticle(resolveUrl(link.getAttribute('href'), baseUrl), link.textContent, container);
    });
  }

  // Strategy 3: any same-domain links with descriptive text as a last resort
  if (articles.length < 3) {
    doc.querySelectorAll('a[href]').forEach(link => {
      const title = link.getAttribute('title') || link.textContent;
      if (title && title.trim().length > 25) {
        addArticle(resolveUrl(link.getAttribute('href'), baseUrl), title, link.closest('li, div'));
      }
    });
  }

  return articles;
}

function resolveUrl(href, base) {
  if (!href) return null;
  try { return new URL(href, base).href; } catch { return null; }
}

function isLikelyArticleUrl(url, base) {
  try {
    const u = new URL(url);
    const b = new URL(base);
    // Must be same hostname or a subdomain of it
    if (u.hostname !== b.hostname && !u.hostname.endsWith('.' + b.hostname)) return false;
    // Must have a path beyond the root
    if (u.pathname === '/' || u.pathname === '') return false;
    // Skip common non-article paths
    if (/\/(tag|tags|category|categories|author|page|search|feed|rss|about|contact|privacy|terms|login|register)\b/i.test(u.pathname)) return false;
    return true;
  } catch { return false; }
}

/* ──────────────────────────────────────────────────────
   Keyword-based Classification
   ────────────────────────────────────────────────────── */
function classifyByKeywords(article) {
  const text = (article.title + ' ' + article.summary).toLowerCase();
  return state.subjects
    .filter(s => {
      if (!s.keywords) return false;
      return s.keywords
        .split(',')
        .map(k => k.trim().toLowerCase())
        .filter(Boolean)
        .some(kw => text.includes(kw));
    })
    .map(s => s.id);
}

/* ══════════════════════════════════════════════════════
   Progress UI
   ══════════════════════════════════════════════════════ */
function showProgress(pct, label) {
  const wrap = document.getElementById('progressWrap');
  const bar  = document.getElementById('progressBar');
  const lbl  = document.getElementById('progressLabel');
  wrap.style.display = 'block';
  bar.style.width    = pct + '%';
  lbl.textContent    = label;
}

function hideProgress() {
  document.getElementById('progressWrap').style.display = 'none';
  document.getElementById('progressBar').style.width    = '0%';
}

/* ══════════════════════════════════════════════════════
   Utilities
   ══════════════════════════════════════════════════════ */
function parseRSSDate(dateStr) {
  if (!dateStr) return null;
  try {
    const d = new Date(dateStr.trim());
    return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0];
  } catch { return null; }
}

function stripHtml(html) {
  if (!html) return '';
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function detectArticleType(title) {
  const t = title.toLowerCase();
  if (/\b(report|white ?paper|whitepaper)\b/.test(t))                            return 'report';
  if (/\b(study|research|analysis|findings|assessment)\b/.test(t))               return 'study';
  if (/\b(ruling|order|decision|commission|ferc|cpuc|puc|regulation)\b/.test(t)) return 'ruling';
  return 'article';
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
  const days = Math.floor(hrs  / 24);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (hrs  < 24) return `${hrs}h ago`;
  return `${days}d ago`;
}

function toast(msg, type = 'success') {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const el = document.createElement('div');
  el.className   = `toast ${type}`;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

/* ══════════════════════════════════════════════════════
   Init
   ══════════════════════════════════════════════════════ */
loadState();
renderAll();

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay').forEach(m => m.style.display = 'none');
  }
});

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
  dragStart,
  dragOver,
  dragLeave,
  drop
};
