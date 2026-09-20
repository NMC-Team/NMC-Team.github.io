# NMC Alliance Hub — Kingdom 820

A static dashboard site for the No Mercy (NMC) alliance: merit leaderboard, KPI scorecard, radar comparison, growth timeline, and war profit & loss.

No build step, no dependencies, no server. It's plain HTML/CSS/JS that reads CSV files from `data/`, so it hosts for free on GitHub Pages and you update it by editing a spreadsheet-style file.

> **The site currently ships with sample data** (10 fictional-ID players and 5 sample battles) so every page works out of the box. See [Switching to real data](#switching-to-real-data).

---

## Project structure

```
nmc-alliance-hub/
├── index.html                  Home: snapshot metrics + module cards
├── merits/index.html           Merit leaderboard
├── kpi/index.html              KPI scorecard
├── spider/index.html           Radar comparison
├── growth/index.html           Weekly growth chart
├── war-pl/index.html           War profit & loss ledger
├── 404.html                    Not-found page
│
├── assets/
│   ├── css/site.css            All styles (one shared file)
│   ├── favicon.svg
│   └── js/
│       ├── data.js             Loads + validates data/*.csv and roster.json
│       ├── common.js           Header, footer, nav, clock, formatting helpers
│       ├── home.js  merits.js  kpi.js  spider.js  growth.js  war.js
│
├── data/                       ← the files you edit
│   ├── roster.json             Governor IDs of all alliance members
│   ├── members.csv             One row per member: power, merits, quota, K/D, radar scores
│   ├── growth.csv              Weekly power/merit history per member
│   ├── wars.csv                One row per battle
│   └── config.json             Demo flag, KPI thresholds, season week names
│
├── .github/workflows/pages.yml Auto-deploys to GitHub Pages on every push to main
├── .nojekyll
├── .gitignore
└── README.md
```

Each page is a folder containing an `index.html`, so URLs are clean (`/merits/`, `/kpi/`) and there are no spaces in any path.

---

## Run it locally

Browsers block `fetch()` on `file://` URLs, so you can't just double-click `index.html`. Start any local server from the project folder:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

(or `npx serve`, or the VS Code "Live Server" extension.)

---

## Publish on GitHub Pages

### Option A: command line

```bash
cd nmc-alliance-hub
git init -b main
git add .
git commit -m "Initial commit: NMC Alliance Hub"
git remote add origin https://github.com/<your-username>/<repo-name>.git
git push -u origin main
```

### Option B: browser only

Create a new repo on github.com → **Add file → Upload files** → drag in the *contents* of this folder (make sure `.github/` and `.nojekyll` come along; if your file manager hides dotfiles, use Option A instead) → **Commit changes**.

### Then, once

1. In the repo go to **Settings → Pages**.
2. Under **Build and deployment → Source**, choose **GitHub Actions**.
3. Open the **Actions** tab. The "Deploy to GitHub Pages" run starts automatically (or click **Run workflow**). When it turns green, your site is live at:

   `https://<your-username>.github.io/<repo-name>/`

From then on, every push to `main` (including edits made directly on github.com) redeploys the site in about a minute.

> **Privacy:** on a free account, Pages sites are public, and so is everything in `data/`. Governor IDs and merit numbers will be readable by anyone with the URL. If that's a concern, use a private repo on a plan that supports private Pages, or keep the repo public but only publish data you're happy to share.

---

## Switching to real data

1. Open `data/members.csv` and replace the sample rows with your members (one row each, columns below).
2. Replace `data/growth.csv` and `data/wars.csv` the same way, or leave them header-only if you don't track that yet. Pages show a helpful empty state.
3. In `data/config.json` set `"demo": false`. This removes the amber "sample data" banner and turns on roster checking.
4. Commit. On github.com you can click a file → the pencil icon → edit → **Commit changes**.

Numbers in CSVs are plain digits (`14200000`, not `14.2M`). Commas inside a name need quotes: `"Smith, John"`.

### `data/members.csv`

| Column | Required | Notes |
|---|---|---|
| `id` | yes | Governor ID. Should match an entry in `roster.json`. |
| `name` | yes | Display name. |
| `role` | yes | `R5`, `R4`, `R3`, `R2` or `R1`. |
| `title` | no | Free text shown in dropdowns, e.g. `Rally Captain`. |
| `power` | yes | Current power. |
| `merits` | yes | Total merits this season. Also used as "Achieved" on the KPI page. |
| `weekly` | yes | Merits gained this week. |
| `quota` | yes | Merit quota. Members with no quota (0) are hidden from the KPI page. |
| `kd` | yes | K/D trade ratio. |
| `offense` `survivability` `rally` `merit` `mobility` `activity` | no | Radar scores, 0–100. Fill in **all six** or leave all six blank; members without them are simply not selectable on the Spider page. |

### `data/growth.csv`

`id,week,power_m,merits_m`. One row per member per week. `week` is 1, 2, 3…; power and merits are in **millions** (`48.5`). Missing weeks are fine (the line just breaks). Week names come from `config.json`.

### `data/wars.csv`

`date,title,type,outcome,kills,deaths,rss_m,trade_ratio,speedup_days`

- `date`: `YYYY-MM-DD`
- `type`: `RALLY`, `GARRISON` or `FIELD`
- `outcome`: `VICTORY` or `DEFEAT`
- `rss_m`: resources spent, in millions
- `trade_ratio`: your resource trade ratio for that battle (the site reports an RSS-weighted average across battles)
- `speedup_days`: healing speedup days used (optional)

### `data/roster.json`

A JSON list of governor IDs (currently 104). It powers the **Roster Coverage** metric on the Merits page and, when `demo` is `false`, a warning for any `members.csv` row whose ID isn't on the roster. Add or remove IDs as people join and leave.

### `data/config.json`

```json
{
  "demo": true,
  "kpi": { "exceedingPct": 120, "metPct": 90, "kdTarget": 2.5 },
  "season": { "name": "Season 1", "weeks": [ { "label": "Week 1", "phase": "Zone 1 Spawn" }, … ] }
}
```

**How KPI status is decided:** `merits ÷ quota`. At or above `exceedingPct` → *Exceeding*; at or above `metPct` → *Target Met*; otherwise *Below Target*. "Compliance" is the share of members at *Target Met* or better.

### Data warnings

If a row is malformed (non-numeric value, duplicate ID, unknown war type…), the page still loads and shows a collapsible **"N data warnings"** box with the exact file and line number. Fix the CSV and reload.

---

## Customizing

- **Rename the site / alliance / kingdom:** edit `SITE` at the top of `assets/js/common.js`, and the `<title>`/hero text in `index.html`.
- **Add a page:** create `mypage/index.html` (copy an existing one), a `mypage.js`, and add one line to `PAGES` in `common.js`. The nav and footer on every page update automatically.
- **Colors and fonts:** all design tokens are CSS variables at the top of `assets/css/site.css`.
- **Custom domain:** add a `CNAME` file in the repo root containing your domain, and configure it under Settings → Pages.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Blank page or "Could not load data/…" locally | You opened the file directly. Use a local server (see above). |
| Site shows old data after a commit | Wait for the Actions run to finish, then hard-refresh (Ctrl/Cmd+Shift+R). |
| Actions run fails with "Pages not enabled" | Settings → Pages → Source must be **GitHub Actions**. |
| 404 on the live URL | Use the full URL including the repo name; check the Actions run succeeded. |
| A member is missing from Spider or Growth | They need all six radar scores / at least one `growth.csv` row. |
