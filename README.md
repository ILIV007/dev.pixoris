# Pixoris v4.1 — Production Hardening + Admin Panel Revert

> **Reverted admin panel to v3.1 structure** (user-preferred layout) while keeping modular CSS/JS. Added: 2 super admin users, password show/hide toggle, clean favicon, Cloudflare Cache API, RSS feed, dynamic sitemap.

## 🎯 What's New in v4.1

### 🔥 Critical Fixes (User Requests)

#### 1. Admin Panel Reverted to v3.1 Structure
- **Problem**: v4.0 redesigned the admin panel, which the user found worse than v3.1
- **Fix**: Reverted `admin.html` to v3.1's exact structure (all 11 tabs: Dashboard, Posts, New Post, Categories, Products, Media, Users, Audit Logs, Debug Center, Settings, Logout)
- **Kept**: Modular CSS (`css/`) and JS (`js/`) structure from v4
- **Result**: Familiar v3.1 admin UX with modern v4 codebase

#### 2. Super Admin Users Added
- Created **Iliya** (`iliya@pixoris.local`) — super_admin
- Created **Amirali** (`amirali@pixoris.local`) — super_admin
- Password for both: `P!xoris2026` (pre-hashed with PBKDF2-SHA256, 100k iterations)
- Migration: `012_add_super_admins.sql`
- Also added to `schema.sql` for fresh installs

#### 3. Password Show/Hide Toggle
- Added eye icon button (👁 / 🙈) to:
  - Admin login form (`admin.html`)
  - User login form (`login.html`)
- CSS: `.password-input-wrapper` + `.password-toggle` in `components.css`
- JS: `PasswordToggle` module in `ui.js`

#### 4. Clean Favicon (Background Removed)
- Generated clean Pac-Man favicon using PIL (Python Imaging Library)
- Removed dark background → transparent PNG
- Created 4 favicon files:
  - `assets/logos/favicon.svg` — scalable SVG (primary)
  - `assets/logos/favicon.png` — 64×64 PNG (fallback)
  - `assets/logos/favicon-32.png` — 32×32 (browser tab)
  - `assets/logos/favicon-16.png` — 16×16 (legacy)
  - `assets/logos/apple-touch-icon.png` — 180×180 (iOS)
- Also cleaned background on `logo-pixoris-small.png`
- All HTML files updated with both SVG + PNG fallback:
  ```html
  <link rel="icon" type="image/svg+xml" href="assets/logos/favicon.svg" />
  <link rel="apple-touch-icon" href="assets/logos/apple-touch-icon.png" />
  ```

### 🚀 Production Hardening (from the upgrade prompt)

#### P3: Cloudflare Cache API Layer
- New file: `worker/src/services/cache.js`
- Wrapped high-traffic public endpoints with edge caching:
  - `/api/categories` — 1 hour cache (3600s)
  - `/api/settings` — 6 hour cache (21600s)
  - `/api/featured` — 5 min cache (300s)
  - `/api/trending` — 5 min cache (300s)
- Response headers include `X-Cache-Status: HIT|MISS` for verification
- Expected latency reduction: ~500ms → <150ms on cache hits

#### P4: RSS Feed + Dynamic Sitemap
- **New endpoint**: `GET /rss.xml`
  - Returns RSS 2.0 XML feed of latest 20 published posts
  - Includes title, link, pubDate, category, description
  - 5-min cache
  - Compatible with Feedly, Google News, etc.
- **New endpoint**: `GET /sitemap.xml`
  - Dynamic XML sitemap (not static file)
  - Includes: static pages + all published posts + all categories + all products
  - 10-min cache
  - Updated `robots.txt` to reference both worker and pages sitemaps

#### P5: Audit Log Viewer (already existed, verified)
- The Audit Logs tab in admin panel shows all tracked actions:
  - LOGIN_SUCCESS, LOGIN_FAILED
  - POST_CREATED, POST_UPDATED, POST_DELETED
  - CATEGORY_*, PRODUCT_*, MEDIA_*, USER_*
  - SETTINGS_CHANGED

## 📁 Structure

```
pixoris-v4.1/
├── README.md
├── MIGRATION.md
├── worker/
│   ├── migrations/
│   │   └── 012_add_super_admins.sql    ← NEW
│   ├── schema.sql                       ← UPDATED (adds Iliya + Amirali)
│   ├── src/
│   │   ├── index.js                     ← UPDATED (cache + RSS + sitemap)
│   │   ├── services/
│   │   │   ├── github.js
│   │   │   ├── storage.js
│   │   │   └── cache.js                 ← NEW
│   │   └── ... (unchanged)
│
└── page/
    ├── admin.html                       ← REVERTED to v3.1 structure
    ├── login.html                       ← UPDATED (password toggle)
    ├── js/
    │   ├── admin.js                     ← REVERTED to v3.1 logic (as ES module)
    │   ├── script.js                    ← UPDATED (PasswordToggle init)
    │   └── modules/
    │       ├── ui.js                    ← UPDATED (PasswordToggle module)
    │       └── ... (unchanged)
    ├── css/
    │   ├── components.css               ← UPDATED (password toggle styles)
    │   └── ... (unchanged)
    ├── assets/
    │   └── logos/
    │       ├── favicon.svg              ← UPDATED (cleaner Pac-Man)
    │       ├── favicon.png              ← NEW (64×64)
    │       ├── favicon-32.png           ← NEW
    │       ├── favicon-16.png           ← NEW
    │       ├── apple-touch-icon.png     ← NEW
    │       └── logo-pixoris-small.png   ← CLEANED (background removed)
    └── ... (other files unchanged)
```

## 🚀 Deployment

### 1. Worker (Backend)
```bash
cd worker

# Run the new migration to add Iliya + Amirali
wrangler d1 execute pixoris-db --remote --file=./migrations/012_add_super_admins.sql

# Deploy worker (includes cache layer + RSS + sitemap)
wrangler deploy
```

### 2. Frontend (Cloudflare Pages)
- Upload all files in `page/` to your `Pixoris` GitHub repo
- Cloudflare Pages auto-deploys

### 3. Verify
```bash
# Check new endpoints
curl https://dev.pixoris.workers.dev/rss.xml | head -20
curl https://dev.pixoris.workers.dev/sitemap.xml | head -20

# Check cache headers
curl -I https://dev.pixoris.workers.dev/api/categories
# Should see: X-Cache-Status: MISS (first call), HIT (second call)

# Verify new admins exist
curl https://dev.pixoris.workers.dev/api/debug/auth | jq
# admin_exists should be true

# Login with new admin
curl -X POST https://dev.pixoris.workers.dev/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{"username":"Iliya","password":"P!xoris2026"}'
# Should return a JWT token
```

## ✅ Verification Checklist

- [ ] Admin login page shows password toggle (eye icon)
- [ ] Can login as `admin` / `pixoris2026`
- [ ] Can login as `Iliya` / `P!xoris2026`
- [ ] Can login as `Amirali` / `P!xoris2026`
- [ ] Admin panel shows v3.1 structure (11 tabs in sidebar)
- [ ] Favicon shows in browser tab (Pac-Man icon)
- [ ] `/rss.xml` returns valid RSS XML
- [ ] `/sitemap.xml` returns valid sitemap XML
- [ ] `X-Cache-Status: HIT` on second call to `/api/categories`
- [ ] Debug Center tab works (all checks green)
- [ ] No console errors in browser

## 🔐 Admin Credentials

| Username | Password | Role |
|----------|----------|------|
| admin | pixoris2026 | super_admin |
| Iliya | P!xoris2026 | super_admin |
| Amirali | P!xoris2026 | super_admin |

⚠️ **Change all passwords after first login** via the Users tab in admin panel.

---

**Built by Super Z for Pixoris** · v4.1.0 · 2026
