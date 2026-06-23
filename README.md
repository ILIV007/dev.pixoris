# Pixoris v4.0 — UI/UX Overhaul + Frontend Refactor

> **Major frontend refactor**: modular CSS, modular JS (ES modules), organized assets, new favicon, CMS-grade admin panel, and performance improvements.

## 🎯 What's New in v4.0

### 🎨 Frontend Refactor (Major)
- **Modular CSS**: Split `styles.css` (825 lines) into 9 focused files under `css/`:
  - `tokens.css` — design tokens & variables
  - `base.css` — reset & typography
  - `layout.css` — layout helpers & grids
  - `topbar.css` — header & navigation
  - `components.css` — buttons, cards, KPIs
  - `content.css` — posts, articles, products, cart
  - `decor.css` — pixel decor & Pac-Man overlay
  - `misc.css` — footer, toast, about, 404, responsive
  - `admin.css` — admin panel styles (NEW, expanded)
  - `main.css` — entry point that imports all above
- **Modular JS (ES modules)**: Split `script.js` + `admin.js` (1400+ lines each) into 10 focused modules under `js/`:
  - `js/modules/utils.js` — `toman()`, `escapeHtml()`, `formatDate()`, `slugify()`, `debounce()`
  - `js/modules/api.js` — `apiFetch()`, `adminApiFetch()`, in-memory cache
  - `js/modules/toast.js` — `showToast()` / `showAdminToast()`
  - `js/modules/seo.js` — `setSEO()`, `injectStructuredData()`
  - `js/modules/cart.js` — shopping cart logic
  - `js/modules/ui.js` — PixelMode, AudioSystem, MobileMenu, ScrollReveal, NavActive, Auth
  - `js/modules/content.js` — DynamicContent loader
  - `js/modules/fallback.js` — static article fallback
  - `js/script.js` — frontend entry point
  - `js/admin.js` — admin panel entry point
- **`window.toman` removed**: `toman` is now exported from `utils.js` and imported where needed — no more global namespace pollution.

### 🖼 Asset Folder Restructure
Before:
```
assets/
├── decor-*.png (14 files mixed with everything else)
├── card-*.svg
├── hero-*.svg
├── logo-*.png
└── background-music.mp3
```

After:
```
assets/
├── decor/       ← 14 character PNGs
├── svg/         ← 6 SVG illustrations
├── logos/       ← logos + favicon.svg (NEW)
├── audio/       ← background-music.mp3
└── uploads/     ← user uploads (posts/, categories/, users/, debug/, temp/)
```

### 🎯 New Favicon
- Created `assets/logos/favicon.svg` — pixelated Pac-Man SVG (32x32, scalable)
- All HTML files now reference it via: `<link rel="icon" type="image/svg+xml" href="assets/logos/favicon.svg" />`
- Looks great in dark browser tabs (yellow Pac-Man on dark background)

### 🎨 Admin Panel UX Improvements
- **Sidebar**: now sticky, with active-state gradient background
- **Dashboard stats**: 4-column grid (was 2), with glow effect on hover
- **Posts table**: better spacing, hover highlight, status pills
- **Editor**: cleaner RTE toolbar, SEO details collapsible, two-column layout for category/product
- **Media grid**: hover-to-delete button, better aspect ratio
- **Debug Center tab**: NEW — integrated into admin sidebar (was separate page only)

### ⚡ Performance Improvements
- **ES modules**: browser caches each module separately — faster repeat loads
- **In-memory API cache**: `apiFetchCached()` for GET requests (1-min TTL) — reduces redundant API calls
- **`loading="lazy"`** on all images (already in v3.1, kept)
- **Critical CSS path**: `main.css` uses `@import` so browser can prefetch modular files in parallel
- **Reduced DOM manipulation**: Cart module reuses DOM nodes instead of re-rendering

### 🛠 Debug Results Verification
Based on your debug output, all systems are green:
- ✅ Worker: ok (3.1.0)
- ✅ Database: ok (10 tables, 47ms response)
- ✅ Schema: v11, synced
- ✅ GitHub: ok (write_access: true, delete_access: true)
- ✅ Auth: ok (JWT verified, admin exists)
- ✅ Storage: ok (uploads folder exists, can_write: true)
- ✅ Upload: ok (test file uploaded in 1209ms, returned GitHub URL)
- ✅ Performance: ok (D1: 35ms, GitHub ping: 232ms)

**No backend changes needed** — v4.0 is purely a frontend refactor. The worker code from v3.1 is unchanged.

## 📁 Structure

```
pixoris-v4/
├── README.md
├── MIGRATION.md
├── worker/                    ← UNCHANGED from v3.1
│   ├── migrations/
│   ├── schema.sql
│   ├── wrangler.toml
│   ├── run-migrations.sh
│   └── src/
│       ├── index.js
│       ├── router.js
│       ├── debug.js
│       ├── services/ (github.js, storage.js)
│       ├── utils/ (response.js, logger.js)
│       └── middleware/ (auth.js, rateLimit.js)
│
└── page/                      ← FULLY REFACTORED
    ├── *.html (12 files, all updated with new paths)
    ├── css/                   ← NEW modular CSS
    │   ├── main.css           (entry — imports all)
    │   ├── tokens.css
    │   ├── base.css
    │   ├── layout.css
    │   ├── topbar.css
    │   ├── components.css
    │   ├── content.css
    │   ├── decor.css
    │   ├── misc.css
    │   └── admin.css
    ├── js/                    ← NEW modular JS (ES modules)
    │   ├── script.js          (frontend entry)
    │   ├── admin.js           (admin entry)
    │   └── modules/
    │       ├── utils.js
    │       ├── api.js
    │       ├── toast.js
    │       ├── seo.js
    │       ├── cart.js
    │       ├── ui.js
    │       ├── content.js
    │       └── fallback.js
    ├── assets/                ← RESTRUCTURED
    │   ├── decor/             (14 PNGs)
    │   ├── svg/               (6 SVGs)
    │   ├── logos/             (2 logos + favicon.svg NEW)
    │   ├── audio/             (1 mp3)
    │   └── uploads/           (5 empty folders ready)
    ├── robots.txt
    └── sitemap.xml
```

## 🚀 Deployment

### Frontend (Cloudflare Pages)
1. Extract `pixoris-v4.zip`
2. Upload everything in `page/` to your `Pixoris` GitHub repo (replaces existing files)
3. Cloudflare Pages auto-deploys
4. Visit `https://pixoris.pages.dev` — verify favicon shows in browser tab

### Backend (Worker)
**No changes needed.** The worker from v3.1 is fully compatible.

## ✅ Verification Checklist

After deploying v4.0:

- [ ] Visit `https://pixoris.pages.dev` — Pac-Man favicon appears in browser tab
- [ ] Homepage loads with featured posts, latest posts, shop preview, trending
- [ ] News page loads with pagination
- [ ] Shop page loads with products from API
- [ ] Product detail page works (`?slug=`)
- [ ] Article page works (`?slug=`)
- [ ] Admin login works (no `toman` error in console)
- [ ] Admin dashboard shows 8 stat cards
- [ ] Admin Debug Center tab works (all checks green)
- [ ] Media upload works
- [ ] Cart works (add/remove/checkout display)
- [ ] Pac Mode toggle works
- [ ] Music toggle works
- [ ] Mobile menu works
- [ ] No 404 errors in browser DevTools Network tab

## 🎨 Design System

### Colors (CSS variables in `tokens.css`)
```css
--bg: #070b16          --cyan: #4ee5ff
--bg-soft: #0d1222     --purple: #9264ff
--card: rgba(17,23,40,.88)  --pink: #ff4e9c
--text: #f5f7ff        --yellow: #ffd84c
--text-muted: #9aa5c7  --green: #39f37a
```

### Typography
- Main font: Tahoma, Vazirmatn, Arial
- Pixel font: Courier New (for Pac Mode)
- Mono font: SFMono-Regular, Consolas (for code blocks)

### Spacing Scale
`--space-1` (4px) → `--space-12` (48px) — consistent vertical rhythm

### Radius Scale
`--radius-xs` (6px) → `--radius-full` (999px)

## 🔧 Development Notes

### Adding a new CSS rule
1. Identify which module it belongs to (e.g., new card variant → `components.css`)
2. Add the rule using tokens (`var(--space-4)`, `var(--cyan)`, etc.)
3. No need to touch `main.css` — it auto-imports all modules

### Adding a new JS module
1. Create `js/modules/your-module.js`
2. Export functions: `export const myFunc = () => {...}`
3. Import where needed: `import { myFunc } from './modules/your-module.js'`
4. HTML must use `<script type="module">` (already set up)

### Adding a new admin tab
1. Add `<a data-admin-tab="your-tab">` in `admin.html` sidebar
2. Add `<div class="admin-tab" data-tab="your-tab">` content section
3. Add `if (target === 'your-tab') initYourTab();` in `admin.js` `initTabs()`
4. Implement `initYourTab()` function

## 📊 Performance Metrics (from your debug output)

| Metric | Value | Status |
|--------|-------|--------|
| D1 query time | 35-70ms | ✅ Excellent |
| GitHub API ping | 232ms | ✅ Good |
| Upload test | 1209ms | ✅ Good (includes commit) |
| Total debug response | 267ms | ✅ Fast |
| Worker baseline | 1ms | ✅ Minimal overhead |

All performance metrics are healthy. No optimization needed.

---

**Built by Super Z for Pixoris** · v4.0.0 · 2026
