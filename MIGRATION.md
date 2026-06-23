# Pixoris v4.1 Migration Guide

## From v4.0 → v4.1

### What's New
- ✅ Admin panel reverted to v3.1 structure (user-preferred)
- ✅ 2 new super admins: Iliya + Amirali (password: P!xoris2026)
- ✅ Password show/hide toggle on login forms
- ✅ Clean favicon (background removed, 5 files generated)
- ✅ Cloudflare Cache API layer (services/cache.js)
- ✅ RSS feed endpoint (/rss.xml)
- ✅ Dynamic sitemap endpoint (/sitemap.xml)

### Migration Steps

#### 1. Database Migration (REQUIRED — adds new admins)

```bash
cd worker
wrangler d1 execute pixoris-db --remote --file=./migrations/012_add_super_admins.sql
```

This adds Iliya and Amirali as super_admin users with pre-hashed passwords.

Verify:
```bash
wrangler d1 execute pixoris-db --remote --command="SELECT id, username, role FROM admins;"
# Should show 3 admins: admin, Iliya, Amirali
```

#### 2. Deploy Worker

```bash
cd worker
wrangler deploy
```

This adds:
- Cache layer on `/api/categories`, `/api/settings`, `/api/featured`, `/api/trending`
- New `/rss.xml` endpoint
- New `/sitemap.xml` endpoint

#### 3. Update Frontend

Upload all files in `page/` to your `Pixoris` GitHub repo. Key changes:
- `admin.html` — reverted to v3.1 structure (with password toggle + favicon)
- `admin.js` — reverted to v3.1 logic (as ES module)
- `login.html` — added password toggle
- `js/modules/ui.js` — added PasswordToggle module
- `css/components.css` — added password toggle styles
- `assets/logos/favicon.*` — new clean favicon files (5 files)

Cloudflare Pages auto-deploys.

### 4. Verify

```bash
# New endpoints
curl https://dev.pixoris.workers.dev/rss.xml | head -5
curl https://dev.pixoris.workers.dev/sitemap.xml | head -5

# Cache layer
curl -I https://dev.pixoris.workers.dev/api/categories
# First call: X-Cache-Status: MISS
curl -I https://dev.pixoris.workers.dev/api/categories
# Second call: X-Cache-Status: HIT

# New admins
curl -X POST https://dev.pixoris.workers.dev/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{"username":"Iliya","password":"P!xoris2026"}'
```

## If Admin Panel Looks Wrong

If the admin panel doesn't look like v3.1:

1. **Hard refresh**: `Ctrl+Shift+R` (or `Cmd+Shift+R` on Mac)
2. **Clear cache**: DevTools → Application → Clear storage → Clear site data
3. **Check console**: Should see no errors
4. **Verify files uploaded**: 
   ```bash
   curl -s https://pixoris.pages.dev/admin.html | grep "data-admin-tab"
   # Should show 11 tabs
   ```

## If Login Fails with New Users

If Iliya or Amirali can't login:

1. **Check if migration ran**:
   ```bash
   wrangler d1 execute pixoris-db --remote --command="SELECT username, role FROM admins WHERE username IN ('Iliya', 'Amirali');"
   ```
   Should return 2 rows.

2. **If empty, re-run migration**:
   ```bash
   wrangler d1 execute pixoris-db --remote --file=./migrations/012_add_super_admins.sql
   ```

3. **Password is case-sensitive**: `P!xoris2026` (capital P, exclamation mark, capital I in Pixoris, no spaces)

4. **Check password hash format**: The hash should start with `pbkdf2:`
   ```bash
   wrangler d1 execute pixoris-db --remote --command="SELECT username, substr(password_hash, 1, 10) FROM admins;"
   ```
   Iliya and Amirali should show `pbkdf2:xxx` (admin may show `pixoris2026` if not yet logged in).

## If Favicon Doesn't Show

1. **Check file exists**:
   ```bash
   curl -I https://pixoris.pages.dev/assets/logos/favicon.svg
   # Should return 200
   ```

2. **Clear browser cache**: Browsers cache favicons aggressively
   - Chrome: `chrome://favicon/` then clear
   - Firefox: about:config → `browser.chrome.favicons` → reset

3. **Check HTML head**:
   ```bash
   curl -s https://pixoris.pages.dev/ | grep favicon
   # Should show the link tag
   ```

## If Cache Headers Not Showing

Cloudflare Cache API requires the worker to be deployed. Verify:

```bash
curl -I https://dev.pixoris.workers.dev/api/categories
```

Response headers should include:
```
X-Cache-Status: MISS   (first call)
X-Cache-Status: HIT    (second call, within TTL)
```

If you see no `X-Cache-Status` header, the worker hasn't been deployed yet.

## Rollback to v4.0

If v4.1 causes issues:

1. Revert your GitHub repo (frontend)
2. Re-deploy v4.0 worker: `wrangler deploy` with old code
3. The new admins (Iliya, Amirali) will remain in the database — harmless
4. To remove them:
   ```sql
   DELETE FROM admins WHERE username IN ('Iliya', 'Amirali');
   ```

## Post-Deploy Verification

- [ ] `admin` can login (password: pixoris2026)
- [ ] `Iliya` can login (password: P!xoris2026)
- [ ] `Amirali` can login (password: P!xoris2026)
- [ ] Password eye toggle works on login forms
- [ ] Favicon (Pac-Man) shows in browser tab
- [ ] Admin panel has 11 tabs (Dashboard, Posts, New Post, Categories, Products, Media, Users, Audit, Debug, Settings, Logout)
- [ ] `/rss.xml` returns valid XML
- [ ] `/sitemap.xml` returns valid XML
- [ ] `X-Cache-Status: HIT` on repeat calls to cached endpoints
- [ ] Debug Center shows all green
