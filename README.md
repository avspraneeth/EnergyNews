# Energy Intelligence Dashboard

A browser-based news aggregator for the energy sector. Uses the **Anthropic Claude API** to discover, summarize, and classify articles from your chosen sources — no backend or server required.

## Live App

→ Deployed at: `https://<your-username>.github.io/energy-news/`

---

## Features

| Feature | Details |
|---|---|
| **Dashboard tab** | Subject sub-tabs, article cards with summaries, newest first |
| **Inputs tab** | Add/remove source URLs, add/edit/reorder subject tabs |
| **One-click Refresh** | Claude fetches latest articles from all sources and classifies them |
| **Multi-subject tagging** | Articles appear in all relevant subject tabs |
| **Drag-to-reorder** | Drag subject tabs in the Inputs panel to reorganize |
| **Fully client-side** | No backend — everything lives in your browser's localStorage |

---

## Setup

### 1. Fork / Clone this repo

```bash
git clone https://github.com/<you>/energy-news.git
cd energy-news
```

### 2. Enable GitHub Pages

1. Go to **Settings → Pages**
2. Source: **GitHub Actions**
3. Push to `main` — the workflow auto-deploys

### 3. Get an Anthropic API Key

1. Sign up at [console.anthropic.com](https://console.anthropic.com)
2. Create an API key under **API Keys**

### 4. Add Your Key in the App

1. Open the deployed app
2. Go to the **Inputs** tab → scroll to **Anthropic API Key**
3. Paste your key and click **Save Key**
   - Key is stored only in your browser's localStorage, never sent anywhere except Anthropic's API

### 5. Hit Refresh

Click the green **Refresh** button on the Dashboard. Claude will:
1. Visit each source URL and discover article links one level deep
2. Extract titles, dates, and summaries
3. Classify each article into your subject tabs
4. Display them newest-first, grouped by subject

---

## Default Sources

| Source | URL |
|---|---|
| Utility Dive | https://www.utilitydive.com/ |
| LBL Energy Research | https://emp.lbl.gov/research-areas/ |

## Default Subjects

- Energy Efficiency
- Load Management (Demand Response)
- Distributed Energy Resources (Solar & Storage)

---

## Customization

### Adding Sources
Inputs tab → **Source Links** → `+ Add Source`

### Adding Subjects
Inputs tab → **Subject Tabs** → `+ Add Subject`  
Provide a name and comma-separated keywords to help Claude classify correctly.

### Reordering Subjects
Drag the ≡ handle on any subject row in the Inputs tab.

---

## How It Works

```
Refresh clicked
     │
     ▼
For each source URL:
  Claude (web_search tool) → discovers article links on the page
     │
     ▼
Deduplicate against existing articles
     │
     ▼
Claude classifies new articles → assigns subject IDs
     │
     ▼
Articles saved to localStorage + rendered on Dashboard
```

The app uses Claude's **web_search** tool so it can actually fetch live pages — no CORS issues.

---

## Privacy & Data

- Your API key is stored only in your browser (`localStorage`)
- Articles are cached locally in `localStorage` (capped at 500)
- No data is sent to any server other than Anthropic's API

---

## Local Development

Just open `index.html` in a browser — no build step needed.

```bash
# Optional: serve locally
npx serve .
```

---

## License

MIT
