# Pixoris v4.3 Migration Guide

## From v4.1 → v4.3

### No Database Changes
v4.3 uses the **same schema** as v4.1. No SQL migration needed.

### What's New
- ✅ Admin panel completely redesigned (Notion/Linear/Vercel-inspired)
- ✅ New color palette (#7C3AED / #06B6D4 / #EC4899)
- ✅ Command Palette (Ctrl+K)
- ✅ Custom modal system (replaces alert/confirm)
- ✅ Auto-save + draft recovery in post editor
- ✅ Card view for posts (with grid/list toggle)
- ✅ Large drag-drop media upload zone
- ✅ SEO panel with social card previews
- ✅ Analytics dashboard (mock data)
- ✅ `/api/bootstrap` endpoint (API aggregation)
- ✅ Image optimization (lazy + decoding=async + width/height)
- ✅ Vazirmatn Persian font

### Migration Steps

#### 1. Deploy Worker
```bash
cd worker
wrangler deploy
```
This adds the new `/api/bootstrap` endpoint.

#### 2. Update Frontend
Upload all files in `page/` to your GitHub repo. Key changes:
- `admin.html` — completely rewritten
- `css/tokens.css` — new color palette
- `css/admin.css` — completely rewritten
- `js/admin.js` — completely rewritten
- `js/modules/content.js` — uses /api/bootstrap

Cloudflare Pages auto-deploys.

#### 3. Verify
```bash
# New bootstrap endpoint
curl https://dev.pixoris.workers.dev/api/bootstrap | jq

# Version
curl https://dev.pixoris.workers.dev/api/health
# "version":"4.3.0"
```

### If Admin Panel Doesn't Load

1. **Hard refresh**: `Ctrl+Shift+R`
2. **Clear cache**: DevTools → Application → Clear storage
3. **Check console**: Should see no errors
4. **Verify files uploaded**:
   ```bash
   curl -s https://pixoris.pages.dev/admin.html | grep "command-palette"
   # Should show the command palette div
   ```

### If Command Palette (Ctrl+K) Doesn't Work

- Make sure you're logged into the admin panel
- Press `Ctrl+K` (or `Cmd+K` on Mac)
- Check console for errors
- The palette should appear centered at top

### If Auto-Save Doesn't Work

- Auto-save triggers 2 seconds after you stop typing
- Check localStorage: DevTools → Application → Local Storage → `pixorisDraft`
- The save indicator (💾) should show "saving" then "saved"

### If Draft Recovery Doesn't Appear

- Only appears if there's a draft less than 24 hours old
- Close the browser tab while editing, then reopen the editor
- A modal should ask "بازیابی پیش‌نویس؟"

### Rollback to v4.1

If v4.3 causes issues:

1. Revert your GitHub repo to the previous commit
2. Re-deploy v4.1 worker (the `/api/bootstrap` endpoint is harmless if unused)
3. Cloudflare Pages auto-deploys the old version

## Post-Deploy Verification

- [ ] Visit `/admin.html` — new login card UI
- [ ] Login works (Iliya / P!xoris2026)
- [ ] Dashboard shows 6 stat cards
- [ ] Activity feed loads
- [ ] Ctrl+K opens command palette
- [ ] Posts tab shows card grid
- [ ] Grid/List toggle works
- [ ] Post editor has two-column layout
- [ ] Auto-save indicator works
- [ ] Media upload via drag-drop works
- [ ] Categories show as cards
- [ ] SEO tab shows 3 social previews
- [ ] Analytics tab loads
- [ ] Audit logs have filter chips
- [ ] Confirm dialogs are custom modals (not browser native)
- [ ] Toasts appear in bottom-left
- [ ] Status bar shows at bottom
- [ ] Mobile: sidebar becomes drawer
- [ ] No console errors
