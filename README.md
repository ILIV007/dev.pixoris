# Pixoris v3.0 — Production Verified CMS

> Fixed all critical bug from v2.2 + comprehensive debug system + performance headers.

## 🎯 v3 Highlights

### 🔥 Critical Fixes (Priority 1)
- ✅ **Fixed**: `Uncaught SyntaxError: Identifier 'toman' has already been declared` — removed duplicate `toman` from admin.js, exposed via `window.toman` from script.js
- ✅ **Fixed**: Schema sync — added graceful fallback for missing columns (`categories.is_active`, `posts.status`, missing `products`/`settings`/`audit_logs` tables)
- ✅ **Fixed**: `no such table: settings` — endpoint now returns warning + empty object instead of crashing
- ✅ **Fixed**: `no such column: c.is_active` — endpoint falls back to `SELECT *` without filter

### 🔧 Debug System (Priority 2)
12 new diagnostic endpoints under `/api/debug/*`:
- `GET /api/debug` — quick overview (worker/db/schema/github/auth)
- `GET /api/debug/full` — full diagnostic (12 checks in parallel)
- `GET /api/debug/worker` — version + timestamp
- `GET /api/debug/database` — D1 connection + tables list + count
- `GET /api/debug/schema` — verify all 10 required tables exist + migration version
- `GET /api/debug/categories` — query + count + timing
- `GET /api/debug/posts` — query + count (published/drafts) + timing
- `GET /api/debug/settings` — settings table read test
- `GET /api/debug/auth` — JWT_SECRET exists + admin exists + token sign/verify round-trip
- `GET /api/debug/github` — repo exists + branch exists + token valid
- `GET /api/debug/upload` — live upload test to `assets/uploads/debug/test-*.txt`
- `GET /api/debug/storage` — verify uploads folder exists/writable
- `GET /api/debug/cms` — full CRUD round-trip test (create/read/update/delete a test post)
- `GET /api/debug/performance` — D1 query time + GitHub ping + total response time

**Plus**: `debug.html` page that gives a beautiful UI to run all these checks.

### ⚡ Performance (Priority 4)
- ✅ `X-Response-Time` header on every response (ms)
- ✅ `Server-Timing` header for browser DevTools
- ✅ `Cache-Control` on public GET endpoints:
  - `/api/health`: 60s
  - `/api/posts`: 60s (browser) / 120s (CDN)
  - `/api/categories`: 300s
  - `/api/trending`: 300s
  - `/api/products`: 300s
  - `/api/sitemap`: 600s
  - `/api/settings`: 600s
- ✅ Pagination already on `/api/posts` since v2.2
- ✅ `loading="lazy"` on all images since v2.2

### 🛡️ Resilience Improvements
- ✅ Worker no longer crashes on missing schema columns — falls back gracefully with warning
- ✅ Catch-all error handler in `fetch()` — never returns a bare 500
- ✅ Login flow: doesn't crash if `is_active` or `last_login` columns are missing
- ✅ Search/posts/categories endpoints: try v3 schema first, fall back to v2.1 schema

## 📁 Structure

```
pixoris-v3/
├── README.md
├── MIGRATION.md
├── worker/
│   ├── migrations/             ← 11 migration files (001-011)
│   │   ├── 001_add_sort_order.sql
│   │   ├── 002_add_products.sql
│   │   ├── 003_expand_categories.sql
│   │   ├── 004_expand_posts.sql
│   │   ├── 005_user_roles.sql
│   │   ├── 006_audit_logs.sql
│   │   ├── 007_expand_media.sql
│   │   ├── 008_expand_products.sql
│   │   ├── 009_add_indexes.sql
│   │   ├── 010_settings.sql
│   │   └── 011_v3_recovery.sql  ← NEW: idempotent recovery migration
│   ├── schema.sql
│   ├── wrangler.toml
│   ├── package.json
│   ├── run-migrations.sh        ← NEW: bash script to run all migrations
│   └── src/
│       ├── index.js             ← v3 (with timing + debug + fallbacks)
│       ├── router.js
│       └── debug.js             ← NEW: diagnostic module
│
└── page/
    ├── index.html, news.html, shop.html, product.html, article.html
    ├── analysis.html, about.html, cart.html, login.html
    ├── admin.html               ← CMS dashboard (8 tabs)
    ├── debug.html               ← NEW: visual debug dashboard
    ├── 404.html
    ├── script.js                ← v3 (toman exposed on window)
    ├── admin.js                 ← v3 (no toman duplicate)
    ├── styles.css
    ├── robots.txt, sitemap.xml
    └── assets/
```

## 🚀 Quick Deployment

### Fresh install (new database)

```bash
cd worker
./run-migrations.sh              # remote
# OR
./run-migrations.sh --local      # for local dev
```

### Upgrading from v2.2 (already deployed)

Your schema is already at v10. Just:
1. Deploy the new worker: `wrangler deploy`
2. Upload the new `page/` files to GitHub (Cloudflare Pages auto-deploys)
3. Verify with: `curl https://dev.pixoris.workers.dev/api/debug`

### Upgrading from v2.0/v2.1 (legacy DB)

Run all migrations in order:
```bash
cd worker
./run-migrations.sh
```

If some migrations fail (column already exists), that's OK — they're idempotent. Then verify:
```bash
curl https://dev.pixoris.workers.dev/api/debug/schema
```

Should return all 10 tables as `true` and `migration_version: 11`.

## 🔐 Required Secrets

```bash
wrangler secret put JWT_SECRET          # REQUIRED — random 32+ chars
wrangler secret put GITHUB_TOKEN         # REQUIRED — GitHub PAT with repo:write
wrangler secret put GITHUB_REPO          # e.g. ILIV007/Pixoris
wrangler secret put GITHUB_BRANCH        # e.g. main
```

## 🧪 Verification Checklist

After deployment, run these checks:

### 1. Quick health check
```bash
curl https://dev.pixoris.workers.dev/api/debug
```
Expected: `{"worker":"ok","database":"ok","schema":"v11","github":"configured","auth":"configured","version":"3.0.0"}`

### 2. Full diagnostic
```bash
curl https://dev.pixoris.workers.dev/api/debug/full | jq
```

### 3. Schema verification
```bash
curl https://dev.pixoris.workers.dev/api/debug/schema | jq
```
All 10 tables should be `true`:
- admins, categories, posts, tags, post_tags, media, products, settings, audit_logs, schema_migrations

### 4. CMS CRUD round-trip test
```bash
curl https://dev.pixoris.workers.dev/api/debug/cms | jq
```
Should return `{"create":true,"read":true,"update":true,"delete":true,"status":"ok"}`

### 5. GitHub upload test
```bash
curl https://dev.pixoris.workers.dev/api/debug/upload | jq
```
Should return `{"status":"ok","url":"https://raw.githubusercontent.com/...","path":"assets/uploads/debug/test-*.txt"}`

### 6. Visual debug dashboard
Visit `https://pixoris.pages.dev/debug.html` — runs all checks in the browser.

### 7. Admin login test
1. Visit `https://pixoris.pages.dev/admin.html`
2. Login: `admin` / `pixoris2026`
3. Should NOT see "Identifier 'toman' has already been declared" error
4. Should land on the dashboard

## 📊 API Endpoints

### Public (with caching + timing headers)
- `GET /api/health` — 60s cache
- `GET /api/posts?page=1&limit=12&category=&q=` — 60s cache, paginated
- `GET /api/post/:slug` — 120s cache
- `GET /api/categories?with_counts=1` — 300s cache
- `GET /api/category/:slug` — 300s cache
- `GET /api/featured?limit=6` — 120s cache
- `GET /api/trending` — 300s cache
- `GET /api/search?q=&type=posts|products|all` — 30s cache
- `GET /api/tags` — 300s cache
- `GET /api/products?category=` — 300s cache
- `GET /api/product/:slug` — 120s cache
- `GET /api/sitemap` — 600s cache
- `GET /api/settings` — 600s cache

### Admin (JWT required, no cache)
- `POST /api/admin/login`
- `GET /api/admin/me`
- `GET /api/admin/stats`
- `GET/POST/PUT/DELETE /api/admin/post[s]/...`
- `GET/POST/PUT/DELETE /api/admin/categor[y|ies]/...`
- `GET/POST/PUT/DELETE /api/admin/product[s]/...`
- `GET/POST/PUT/DELETE /api/admin/media/...`
- `GET/POST/PUT/DELETE /api/admin/user[s]/...` (super_admin only)
- `GET /api/admin/audit-logs` (admin+)
- `GET/PUT /api/admin/settings` (admin+)

### Debug (no auth, no cache)
- `GET /api/debug`
- `GET /api/debug/full`
- `GET /api/debug/{worker,database,schema,categories,posts,settings,auth,github,upload,storage,cms,performance}`

## 🆕 What's New in v3.0 (vs v2.2)

| Area | v2.2 | v3.0 |
|------|------|------|
| `toman` duplicate bug | ❌ Broke admin.js | ✅ Fixed |
| Missing `is_active` column | ❌ Crashed `/api/categories` | ✅ Graceful fallback |
| Missing `settings` table | ❌ Crashed `/api/settings` | ✅ Returns warning + empty |
| Missing `products` table | ❌ Crashed `/api/products` | ✅ Returns warning + empty |
| Diagnostic endpoints | ❌ None | ✅ 12 endpoints + UI |
| Response timing | ❌ Not exposed | ✅ `X-Response-Time` + `Server-Timing` |
| Public endpoint caching | ❌ No cache headers | ✅ Tiered (60s-600s) |
| Unhandled errors | ❌ Bare 500 | ✅ JSON-formatted 500 |
| Migration recovery | ❌ Manual fix needed | ✅ `011_v3_recovery.sql` |

## 🔧 Local Development

```bash
# Worker
cd worker
wrangler dev

# Pages (any static server)
cd page
npx serve .
```

## 📝 Default Credentials

- **Username**: `admin`
- **Password**: `pixoris2026` (auto-migrated to PBKDF2 on first login)

⚠️ Change after first login by creating a new super_admin and deleting the default.

---

**Built by Super Z for Pixoris** · v3.0.0 · 2026
