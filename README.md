# Pixoris v5 — Consolidated CSS + Right Sidebar + Bug Fixes

> **Major fixes**: Consolidated all CSS into single file (no @import render-blocking), moved navigation to right sidebar, fixed admin panel bugs, optimized performance.

## 🎯 What's Fixed in v5

### 🔥 Critical CSS Fixes
- **Problem**: v4.3 used `css/main.css` with `@import` to load 9 separate CSS files — this is **render-blocking** and caused CSS to not load properly on Cloudflare Pages.
- **Fix**: Consolidated all CSS into **single `styles.css`** (83KB, 3086 lines) at root level.
- **No more `@import`** in CSS — everything is in one file, loads in a single request.
- **Font**: Vazirmatn loaded via `<link>` in HTML head (not CSS `@import`).

### 🧭 Right Sidebar Navigation (User Request)
- **Moved navigation from top header to right sidebar** (220px wide)
- Sidebar contains: Brand logo, Home, News, Shop, Analysis, About, Cart, Login, Admin, Pac Mode toggle, Music toggle
- **Mobile**: sidebar becomes a slide-in drawer with overlay
- Hamburger button (☰) appears on mobile (≤900px)
- Active page highlighted with gradient background

### 🐛 Admin Panel Bug Fixes
- Fixed CSS path issues (now uses consolidated `styles.css`)
- Fixed script loading order (`script.js` loads before `admin.js`)
- Verified all `window.PixorisAdmin.*` functions are properly exported
- Fixed asset paths in JS (`assets/svg/` not `assets/`)
- No duplicate `toman` declarations (imported from utils.js)

### ⚡ Performance Optimizations
- **Single CSS file** instead of 9 — eliminates 8 extra HTTP requests
- **Font preconnect** + preload in HTML head
- **`/api/bootstrap`** endpoint (from v4.3) — 1 API call instead of 4 on homepage
- **Cloudflare Cache API** (from v4.1) on public endpoints
- **`loading="lazy"` + `decoding="async"`** on all images
- **ES modules** — browser caches each JS module separately

### 📱 Responsive Design
- Right sidebar → drawer on mobile (≤900px)
- Hamburger toggle button
- Overlay closes drawer on click
- Nav links close drawer on mobile click
- All grids collapse to 1 column on mobile

## 📁 Structure

```
pixoris-v5/
├── worker/                    (unchanged from v4.3)
│   └── src/
│       └── index.js           (has /api/bootstrap + cache layer)
│
└── page/
    ├── *.html (12 files)      ← All use right sidebar layout
    ├── styles.css             ← NEW: consolidated CSS (83KB, single file)
    ├── css/                   ← OLD modular CSS (kept for reference, not used)
    ├── js/
    │   ├── script.js          ← Frontend entry
    │   ├── admin.js           ← Admin entry (v4.3 modular)
    │   └── modules/           ← ES modules
    ├── assets/                ← Organized (decor/, svg/, logos/, audio/, uploads/)
    └── ...
```

## 🚀 Deployment

### Worker
```bash
cd worker
wrangler deploy
# No database changes needed
```

### Frontend
Upload all files in `page/` to your GitHub repo. Key files:
- `styles.css` (NEW — must be at root level, not in css/)
- All `*.html` files (updated with right sidebar)
- `js/` folder (unchanged from v4.3)
- `assets/` folder (unchanged)

**Important**: Make sure `styles.css` is at the **root** of the `page/` folder, NOT inside `css/`. All HTML files reference it as `href="styles.css"`.

## ✅ Verification Checklist

- [ ] Homepage loads with navigation on the RIGHT side
- [ ] No CSS `@import` errors in DevTools console
- [ ] All pages load without missing CSS
- [ ] Mobile (≤900px): hamburger button (☰) appears, sidebar slides in
- [ ] Admin panel at `/admin.html` loads correctly
- [ ] Admin login works (Iliya / P!xoris2026)
- [ ] No console errors on any page
- [ ] Images load with `loading="lazy"` (check Network tab)

## 🔍 Debugging

### If CSS doesn't load:
1. Check `styles.css` is at root of `page/` folder (not in `css/`)
2. Check HTML references: `<link rel="stylesheet" href="styles.css" />`
3. Hard refresh: `Ctrl+Shift+R`

### If sidebar doesn't show:
1. Check browser width — sidebar shows on desktop (>900px)
2. On mobile, click the ☰ button (top-right)
3. Check console for JS errors

### If admin panel is blank:
1. Check `admin.html` references `js/admin.js` (type="module")
2. Check `js/admin.js` syntax: `node --check js/admin.js`
3. Check browser console for errors

---

**Built by Super Z for Pixoris** · v5.0 · 2026
