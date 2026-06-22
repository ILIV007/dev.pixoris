# Pixoris v3.0 Migration Guide

## From v2.2 → v3.0

### What's New
- **Fixed**: `toman` duplicate declaration (admin.js)
- **Added**: 12 `/api/debug/*` diagnostic endpoints
- **Added**: `X-Response-Time` + `Server-Timing` headers on every response
- **Added**: `Cache-Control` on public GET endpoints
- **Added**: Graceful fallback for missing schema columns
- **Added**: `011_v3_recovery.sql` idempotent recovery migration
- **Added**: `run-migrations.sh` helper script
- **Added**: `debug.html` visual diagnostic dashboard

### Migration Steps (from v2.2)

You do NOT need to run any new database migrations if v2.2 was properly installed. v3.0 uses the same schema (v10/v11).

```bash
# 1. Deploy the new worker
cd worker
wrangler deploy

# 2. Upload new frontend files to your GitHub repo
# (Cloudflare Pages auto-deploys)

# 3. Verify
curl https://dev.pixoris.workers.dev/api/debug
```

### Migration Steps (from v2.0/v2.1 — your current state)

If your D1 database is missing tables (`products`, `settings`, `audit_logs`, `schema_migrations`) or columns (`categories.is_active`, `posts.status`), run:

```bash
cd worker
chmod +x run-migrations.sh
./run-migrations.sh          # for remote D1
# OR
./run-migrations.sh --local  # for local dev
```

This runs `schema.sql` first (creates all tables with `IF NOT EXISTS`), then runs each migration file in order (001-011). Migration 011 is a recovery migration that re-ensures all v3 tables exist.

### Verifying Migration Success

```bash
# Quick check
curl https://dev.pixoris.workers.dev/api/debug

# Detailed schema check
curl https://dev.pixoris.workers.dev/api/debug/schema

# Expected: all 10 tables should be true, migration_version >= 11
```

If any table shows `false`, run that specific migration:

| Missing table | Migration file |
|---------------|----------------|
| products | 002_add_products.sql |
| audit_logs | 006_audit_logs.sql |
| settings | 010_settings.sql |
| schema_migrations | 011_v3_recovery.sql |

| Missing column | Migration file |
|-----------------|----------------|
| categories.is_active | 003_expand_categories.sql |
| posts.status | 004_expand_posts.sql |
| admins.role | 005_user_roles.sql |
| products.stock | 008_expand_products.sql |

### If `categories.is_active` is missing

```bash
wrangler d1 execute pixoris-db --remote --command="ALTER TABLE categories ADD COLUMN is_active INTEGER DEFAULT 1;"
wrangler d1 execute pixoris-db --remote --command="UPDATE categories SET is_active = 1;"
```

### If `posts.status` is missing

```bash
wrangler d1 execute pixoris-db --remote --command="ALTER TABLE posts ADD COLUMN status TEXT DEFAULT 'draft';"
wrangler d1 execute pixoris-db --remote --command="UPDATE posts SET status = 'published' WHERE published = 1;"
wrangler d1 execute pixoris-db --remote --command="UPDATE posts SET status = 'draft' WHERE published = 0 OR published IS NULL;"
```

## Common Issues & Fixes

### Issue: "Identifier 'toman' has already been declared"
**Status**: ✅ Fixed in v3.0
**Cause**: v2.2 admin.js declared `function toman(num) {...}` which conflicted with script.js's `const toman = ...`
**Fix**: Removed the duplicate; admin.js now uses `window.toman` set by script.js.

### Issue: "no such column: c.is_active"
**Status**: ✅ Fixed in v3.0 (with graceful fallback) + migration available
**Cause**: Migration 003 was not run
**Fix**: Run migration 003 OR the v3 worker will fall back to `SELECT *` without the filter (returns a `warning` field).

### Issue: "no such table: settings"
**Status**: ✅ Fixed in v3.0 (with graceful fallback) + migration available
**Cause**: Migration 010 was not run
**Fix**: Run migration 010 OR the v3 worker will return `{settings: {}, warning: "..."}` instead of crashing.

### Issue: Admin login frozen / never completes
**Status**: ✅ Fixed in v3.0
**Cause**: v2.2 admin.js crashed on load due to `toman` duplicate, so the login form's submit handler was never attached.
**Fix**: Same as the `toman` fix above — admin.js now loads cleanly.

### Issue: GitHub upload fails
**Verify with**: `GET /api/debug/github` and `GET /api/debug/upload`
**Common causes**:
- `GITHUB_TOKEN` secret not set → `wrangler secret put GITHUB_TOKEN`
- Token doesn't have `repo:write` scope → regenerate PAT
- `GITHUB_REPO` not set → `wrangler secret put GITHUB_REPO` (format: `ILIV007/Pixoris`)
- `GITHUB_BRANCH` not set → defaults to `main`, change if your branch differs

### Issue: CMS CRUD fails
**Verify with**: `GET /api/debug/cms`
**Common causes**:
- Posts table missing required columns → run migrations 004, 007
- Permission issues on D1 → check wrangler.toml binding

## Rollback to v2.2

If v3.0 causes issues:

1. Re-deploy v2.2 worker from git history
2. Restore v2.2 frontend files
3. The v3.0 schema additions are backward-compatible
4. If `password_hash` has PBKDF2 hashes, v2.2 worker can verify them (same format)
5. To reset admin password:
   ```sql
   UPDATE admins SET password_hash = 'pixoris2026' WHERE username = 'admin';
   ```

## Post-Deploy Verification Checklist

- [ ] `curl https://dev.pixoris.workers.dev/api/debug` returns all "ok"
- [ ] `curl https://dev.pixoris.workers.dev/api/debug/schema` shows all 10 tables as `true`
- [ ] `curl https://dev.pixoris.workers.dev/api/debug/cms` returns `{"create":true,"read":true,"update":true,"delete":true}`
- [ ] `curl https://dev.pixoris.workers.dev/api/debug/upload` returns a GitHub URL
- [ ] Visit `/admin.html` — login works, no `toman` error in console
- [ ] Visit `/debug.html` — visual dashboard loads and all checks pass
- [ ] Response headers include `X-Response-Time` on every API call

## Storage Layout (Recommended)

All media uploads go to **the same Pixoris repo** (NOT a separate media repo):

```
ILIV007/Pixoris/
└── assets/
    └── uploads/
        ├── posts/         ← images for articles
        ├── categories/    ← category banners/icons
        ├── users/         ← user avatars
        ├── debug/         ← auto-generated by /api/debug/upload
        └── temp/          ← temp uploads
```

The worker uses these env vars:
- `GITHUB_REPO=ILIV007/Pixoris`
- `GITHUB_BRANCH=main`
- `GITHUB_TOKEN` (secret)
