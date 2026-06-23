-- =========================================================
-- Migration 012: Add Super Admin Users (v4.1)
-- =========================================================
-- Adds two super_admin accounts:
--   • Iliya    (password: P!xoris2026)
--   • Amirali  (password: P!xoris2026)
--
-- Passwords are pre-hashed with PBKDF2-SHA256 (100k iterations)
-- Format: pbkdf2:<salt>:<base64url-hash>
--
-- Run: wrangler d1 execute pixoris-db --remote --file=./migrations/012_add_super_admins.sql
-- =========================================================

INSERT OR IGNORE INTO admins (username, email, password_hash, role, is_active) VALUES
  ('Iliya', 'iliya@pixoris.local', 'pbkdf2:a7d796b254db4eda8b11eb87ccb49ac5:XDMl2JDc7WC3zmJwNLTzZv4_CsPRt9MrjqS2TFXjDpo', 'super_admin', 1),
  ('Amirali', 'amirali@pixoris.local', 'pbkdf2:27c703a6efdc4ff29de43b51c10d0661:GSYjGQbCzK7MV3Mpls8gqiCOyRlUpFrCkrH0HPA20Eg', 'super_admin', 1);

-- Mark migration as applied
INSERT OR IGNORE INTO schema_migrations (version, name) VALUES (12, 'add_super_admins_v4.1');

-- Verification query (run manually to check):
-- SELECT id, username, email, role, is_active FROM admins;
