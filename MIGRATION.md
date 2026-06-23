# Pixoris v4.0 Migration Guide

## From v3.1 → v4.0

### No Backend Changes
v4.0 is **frontend-only**. The worker code from v3.1 is unchanged. No database migration needed.

### What's New
- ✅ Modular CSS (9 files under `css/`)
- ✅ Modular JS (10 ES modules under `js/`)
- ✅ Organized asset folders (`decor/`, `svg/`, `logos/`, `audio/`, `uploads/`)
- ✅ New favicon (`assets/logos/favicon.svg` — pixel Pac-Man)
- ✅ Improved admin panel UX
- ✅ In-memory API cache for GET requests
- ✅ Better responsive design

### Migration Steps

1. **Backup current frontend** (optional — your GitHub history has it)
   ```bash
   git clone https://github.com/ILIV007/Pixoris.git pixoris-backup
   ```

2. **Upload new frontend files**
   - Extract `pixoris-v4.zip`
   - Replace all files in your `Pixoris` GitHub repo with the contents of `page/`
   - Important: **delete the old `styles.css`, `script.js`, `admin.js`** at the root level (they're now in `css/` and `js/`)
   - Cloudflare Pages auto-deploys

3. **Verify deployment**
   ```bash
   # Favicon should load
   curl -I https://pixoris.pages.dev/assets/logos/favicon.svg
   # Should return 200 OK

   # CSS should load
   curl -I https://pixoris.pages.dev/css/main.css
   # Should return 200 OK

   # JS modules should load
   curl -I https://pixoris.pages.dev/js/script.js
   # Should return 200 OK
   ```

4. **Test in browser**
   - Visit `https://pixoris.pages.dev`
   - Check browser tab — Pac-Man favicon should appear
   - Open DevTools → Console — no errors
   - Open DevTools → Network — all requests return 200
   - Test admin panel at `/admin.html`

### If You See "404 styles.css"

This means the old HTML is cached. Force-refresh:
- **Hard reload**: `Ctrl+Shift+R` (or `Cmd+Shift+R` on Mac)
- **Or**: Open DevTools → Network → check "Disable cache" → reload
- **Or**: Wait 5-10 minutes for Cloudflare Pages cache to expire

### If You See "Module script failed to load"

This usually means the JS file path is wrong. Verify:
```bash
# These should all return 200
curl -I https://pixoris.pages.dev/js/script.js
curl -I https://pixoris.pages.dev/js/admin.js
curl -I https://pixoris.pages.dev/js/modules/utils.js
curl -I https://pixoris.pages.dev/js/modules/api.js
```

If any return 404, the file wasn't uploaded. Re-check your GitHub repo.

### If Images Don't Load

The asset paths changed:
- Old: `assets/decor-wanda.png`
- New: `assets/decor/decor-wanda.png`

All HTML files have been updated, but if you have custom content in your database (e.g., post content with hardcoded `<img src="assets/card-shop.svg">`), those will break.

**Fix**: Run this SQL on your D1 database:
```sql
UPDATE posts
SET content = REPLACE(content, 'assets/card-shop.svg', 'assets/svg/card-shop.svg')
WHERE content LIKE '%assets/card-shop.svg%';

UPDATE posts
SET content = REPLACE(content, 'assets/card-game.svg', 'assets/svg/card-game.svg')
WHERE content LIKE '%assets/card-game.svg%';

UPDATE posts
SET content = REPLACE(content, 'assets/card-cinema.svg', 'assets/svg/card-cinema.svg')
WHERE content LIKE '%assets/card-cinema.svg%';

UPDATE posts
SET content = REPLACE(content, 'assets/hero-cinema.svg', 'assets/svg/hero-cinema.svg')
WHERE content LIKE '%assets/hero-cinema.svg%';

UPDATE posts
SET content = REPLACE(content, 'assets/hero-gaming.svg', 'assets/svg/hero-gaming.svg')
WHERE content LIKE '%assets/hero-gaming.svg%';

UPDATE posts
SET content = REPLACE(content, 'assets/hero-shop.svg', 'assets/svg/hero-shop.svg')
WHERE content LIKE '%assets/hero-shop.svg%';
```

Also update product image URLs:
```sql
UPDATE products
SET image_url = REPLACE(image_url, 'assets/card-shop.svg', 'assets/svg/card-shop.svg')
WHERE image_url LIKE '%assets/card-shop.svg%';

UPDATE products
SET image_url = REPLACE(image_url, 'assets/hero-cinema.svg', 'assets/svg/hero-cinema.svg')
WHERE image_url LIKE '%assets/hero-cinema.svg%';

UPDATE products
SET image_url = REPLACE(image_url, 'assets/hero-gaming.svg', 'assets/svg/hero-gaming.svg')
WHERE image_url LIKE '%assets/hero-gaming.svg%';
```

And media URLs in the media table:
```sql
UPDATE media
SET url = REPLACE(url, 'assets/card-shop.svg', 'assets/svg/card-shop.svg')
WHERE url LIKE '%assets/card-shop.svg%';
```

Run via:
```bash
cd worker
wrangler d1 execute pixoris-db --remote --command="UPDATE posts SET content = REPLACE(content, 'assets/card-shop.svg', 'assets/svg/card-shop.svg') WHERE content LIKE '%assets/card-shop.svg%';"
# (repeat for each replacement)
```

### Rollback to v3.1

If v4.0 causes issues:

1. Revert your GitHub repo to the previous commit
2. Cloudflare Pages auto-deploys the old version
3. The worker is unchanged, so no rollback needed there
4. If you ran the SQL UPDATEs above, you can revert them:
   ```sql
   UPDATE posts SET content = REPLACE(content, 'assets/svg/card-shop.svg', 'assets/card-shop.svg');
   -- etc.
   ```

## Post-Deploy Verification

- [ ] Favicon shows in browser tab (Pac-Man icon)
- [ ] Homepage loads without errors
- [ ] DevTools Console shows no errors
- [ ] DevTools Network shows all 200s (no 404s)
- [ ] Admin panel works
- [ ] Debug Center tab shows all green
- [ ] Mobile view works (test at 375px width)
- [ ] Pac Mode toggle works
- [ ] Music toggle works

## File Mapping (v3.1 → v4.0)

| v3.1 Location | v4.0 Location |
|---------------|---------------|
| `styles.css` | `css/main.css` (imports 9 modules) |
| `script.js` | `js/script.js` (imports 8 modules) |
| `admin.js` | `js/admin.js` (imports modules) |
| `assets/decor-*.png` | `assets/decor/decor-*.png` |
| `assets/card-*.svg` | `assets/svg/card-*.svg` |
| `assets/hero-*.svg` | `assets/svg/hero-*.svg` |
| `assets/logo-pixoris-small.png` | `assets/logos/logo-pixoris-small.png` |
| `assets/background-music.mp3` | `assets/audio/background-music.mp3` |
| (none) | `assets/logos/favicon.svg` (NEW) |
