# Pixoris v2.2 — Production Ready CMS

> Transform from prototype CMS to production-ready gaming, movies, anime and technology publishing platform.

## 📁 Structure

```
pixoris-v2.2/
├── worker/                 ← Cloudflare Worker (Backend API)
│   ├── migrations/         ← Database migrations (run in order)
│   │   ├── 001_add_sort_order.sql
│   │   ├── 002_add_products.sql
│   │   ├── 003_expand_categories.sql
│   │   ├── 004_expand_posts.sql
│   │   ├── 005_user_roles.sql
│   │   ├── 006_audit_logs.sql
│   │   ├── 007_expand_media.sql
│   │   ├── 008_expand_products.sql
│   │   ├── 009_add_indexes.sql
│   │   └── 010_settings.sql
│   ├── schema.sql          ← Full v2.2 schema (run on fresh DB)
│   ├── wrangler.toml       ← Cloudflare Worker config
│   ├── package.json
│   └── src/
│       ├── index.js        ← API logic (v2.2)
│       └── router.js       ← Router (with PATCH support)
│
└── page/                   ← Cloudflare Pages (Frontend)
    ├── index.html          ← Dynamic homepage
    ├── news.html           ← Dynamic news list with pagination
    ├── shop.html           ← Dynamic shop from /api/products
    ├── product.html        ← Dynamic product detail
    ├── article.html        ← Dynamic article with SEO + structured data
    ├── analysis.html       ← Dynamic analysis category
    ├── cart.html
    ├── login.html
    ├── admin.html          ← Full CMS dashboard (8 tabs)
    ├── about.html
    ├── 404.html            ← Custom 404 page
    ├── script.js           ← Frontend logic (v2.2)
    ├── admin.js            ← CMS admin logic (v2.2)
    ├── styles.css          ← Styles (with v2.2 additions)
    ├── robots.txt          ← SEO
    ├── sitemap.xml         ← Static fallback sitemap
    └── assets/             ← Images + audio
```

## 🚀 Deployment Steps

### 1. Worker (Backend)

```bash
cd worker

# Configure secrets (REQUIRED)
wrangler secret put JWT_SECRET          # Random 32+ char string
wrangler secret put GITHUB_TOKEN         # GitHub PAT with repo:write
wrangler secret put GITHUB_REPO          # e.g. ILIV007/Pixoris
wrangler secret put GITHUB_BRANCH        # e.g. main

# Apply schema (full v2.2 fresh install)
wrangler d1 execute pixoris-db --file=./schema.sql --remote

# OR run migrations in order (if upgrading from v2.0/v2.1)
# Run each file in migrations/ in numerical order

# Deploy worker
wrangler deploy
```

### 2. Pages (Frontend)

Upload all files from `page/` directory to your `Pixoris` GitHub repository.
Cloudflare Pages will auto-deploy.

### 3. Post-deploy Checklist

- [ ] Visit `https://pixoris.pages.dev/admin.html`
- [ ] Login with `admin` / `pixoris2026` (password auto-hashed to PBKDF2 on first login)
- [ ] Test creating a post → verify it appears on `/news.html`
- [ ] Test creating a product → verify it appears on `/shop.html`
- [ ] Test uploading media
- [ ] Check `/api/health` returns version `2.2.0`
- [ ] Test 404 page: visit a non-existent URL
- [ ] Verify `robots.txt` and `sitemap.xml` are accessible

## 🔐 Security Improvements (v2.2)

| Area | v2.1 | v2.2 |
|------|------|------|
| Password hashing | SHA-256 + salt | **PBKDF2 100k iterations + SHA-256** |
| JWT | HMAC-SHA256 | HMAC-SHA256 (improved error handling) |
| Roles | admin / editor | **super_admin / admin / editor / author** |
| Audit logs | None | **All admin actions logged** |
| CORS | Permissive | Permissive + max-age caching |
| Schema sync | sort_order missing | **Fully synced with worker code** |

## 📊 API Endpoints (v2.2)

### Public
- `GET /api/health` — health check
- `GET /api/posts?page=1&limit=12&category=games&q=...` — paginated posts
- `GET /api/post/:slug` — single post with related + tags
- `GET /api/categories?with_counts=1` — categories list
- `GET /api/category/:slug` — single category
- `GET /api/featured?limit=6` — featured posts
- `GET /api/trending` — top 5 by views
- `GET /api/search?q=...&type=posts|products|all` — search
- `GET /api/tags` — popular tags
- `GET /api/products?category=Figure` — products list
- `GET /api/product/:slug` — single product with related
- `GET /api/sitemap` — sitemap data (posts, categories, products)
- `GET /api/settings` — public site settings

### Admin (JWT required)
- `POST /api/admin/login`
- `GET /api/admin/me`
- `GET /api/admin/stats` — full dashboard stats
- `GET/POST/PUT/DELETE /api/admin/post[s]/...`
- `GET/POST/PUT/DELETE /api/admin/categor[y|ies]/...`
- `GET/POST/PUT/DELETE /api/admin/product[s]/...`
- `GET/POST/PUT/DELETE /api/admin/media/...`
- `GET/POST/PUT/DELETE /api/admin/user[s]/...` (super_admin only)
- `GET /api/admin/audit-logs` (admin+)
- `GET/PUT /api/admin/settings` (admin+)

## 🎯 Sprint Completion Status

| Sprint | Feature | Status |
|--------|---------|--------|
| 1 | Admin Login Fix | ✅ |
| 1 | API_BASE Duplication | ✅ (window.API_BASE idempotent) |
| 1 | TinyMCE Replacement | ✅ (Enhanced custom RTE with code blocks, tables, blockquote) |
| 1 | Schema Sync | ✅ |
| 2 | Post CRUD | ✅ (with SEO fields, scheduled status) |
| 2 | Category CRUD | ✅ (with banner, icon, SEO, sort) |
| 2 | Media Manager | ✅ (upload, delete, search, folder, alt-text) |
| 2 | Products CRUD | ✅ (full admin tab + stock, SKU, gallery, discount) |
| 3 | Dynamic Homepage | ✅ (featured, latest, shop preview, trending) |
| 3 | Dynamic News | ✅ (pagination + search) |
| 3 | Dynamic Article | ✅ (related + tags + share + breadcrumb) |
| 3 | Dashboard Analytics | ✅ (8 stats + latest posts + top posts) |
| 4 | SEO Meta Tags | ✅ (per-article OG, Twitter cards, canonical) |
| 4 | Structured Data | ✅ (NewsArticle JSON-LD on article page) |
| 4 | Sitemap | ✅ (static + /api/sitemap endpoint) |
| 4 | Robots.txt | ✅ |
| 4 | 404 Page | ✅ (themed) |
| 5 | User Roles | ✅ (4 roles, role-based UI) |
| 5 | Audit Logs | ✅ (login, post/category/product/media CRUD, settings) |
| 5 | Storage Abstraction | ✅ (GitHub now, R2 ready via env.R2_BUCKET) |

## 🔄 Future Work (not in v2.2)

- R2 actual implementation (placeholder exists)
- Image optimization (WebP generation, compression)
- Code splitting at frontend
- Refresh tokens for JWT
- Email notifications
- Comment system
- Multi-language support

## 🔧 Local Development

```bash
# Worker
cd worker
wrangler dev

# Pages (any static server)
cd page
npx serve .
# or python3 -m http.server 8000
```

## 📝 Default Credentials

- **Username**: `admin`
- **Password**: `pixoris2026` (auto-migrated to PBKDF2 hash on first login)

⚠️ **Change this immediately after first login** by creating a new super_admin user and deleting the default one (or via D1 SQL).

---

**Built by Super Z for Pixoris** · v2.2.0 · 2026
