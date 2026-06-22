-- =========================================================
-- Migration 011: v3 Recovery — Ensure ALL v3 tables + columns exist
-- =========================================================
-- This is an IDEMPOTENT recovery migration. Safe to run multiple times.
-- Use this if previous migrations failed partway through.
-- =========================================================

-- 1. Ensure schema_migrations table exists
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT,
  applied_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- 2. Ensure admins table has all required v3 columns
-- (each ALTER wrapped in a separate statement — SQLite doesn't support IF NOT EXISTS for ADD COLUMN)
-- Run each individually; ignore errors if column already exists.

-- 3. Ensure categories has all required columns (is_active especially!)
-- We use PRAGMA table_info to check, but since SQLite doesn't allow conditional ALTER,
-- just attempt each. If you get "duplicate column name" errors, those columns already exist.

-- 4. Ensure settings table exists (critical for v3)
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_by INTEGER
);

-- 5. Ensure audit_logs table exists
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id INTEGER,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id INTEGER,
  details TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE SET NULL
);

-- 6. Ensure products table exists (critical for v3)
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  price INTEGER DEFAULT 0,
  image_url TEXT,
  category TEXT DEFAULT '',
  featured INTEGER DEFAULT 0,
  active INTEGER DEFAULT 1,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- 7. Seed settings if empty
INSERT OR IGNORE INTO settings (key, value) VALUES
  ('site_name', 'Pixoris'),
  ('site_description', 'رسانه گیم، سینما و فروشگاه گیکی'),
  ('site_url', 'https://pixoris.pages.dev'),
  ('posts_per_page', '12'),
  ('default_seo_title', 'Pixoris | گیم، سینما و فروشگاه گیکی'),
  ('default_seo_description', 'خبر، تحلیل و فروشگاه محصولات گیکی'),
  ('social_github', 'https://github.com/ILIV007/Pixoris');

-- 8. Seed admin if missing (default password: pixoris2026 — will be hashed on first login)
INSERT OR IGNORE INTO admins (username, email, password_hash, role) VALUES
  ('admin', 'admin@pixoris.local', 'pixoris2026', 'super_admin');

-- 9. Seed products if empty
INSERT OR IGNORE INTO products (title, slug, description, price, image_url, category, featured, sort_order) VALUES
  ('اکشن‌فیگور Cyber Hero', 'cyber-hero', 'یک اکشن‌فیگور سایبرپانکی با استند اختصاصی، رنگ‌آمیزی دقیق و طراحی مناسب دکور اتاق گیمینگ.', 1490000, 'assets/card-shop.svg', 'Figure', 1, 1),
  ('پوستر سینمایی Neon Frame', 'neon-poster', 'پوستر گیکی با ترکیب رنگ نئون، مناسب دیوار اتاق گیم و فضای استریم.', 320000, 'assets/hero-cinema.svg', 'Poster', 0, 2),
  ('Pixel Box Collection', 'pixel-box', 'یک پک سورپرایزی برای عاشقان آیتم‌های پیکسلی.', 690000, 'assets/hero-gaming.svg', 'Merch', 1, 3);

-- 10. Mark migration version 11 as applied
INSERT OR IGNORE INTO schema_migrations (version, name) VALUES (11, 'v3_recovery');

-- =========================================================
-- IMPORTANT: If your database is missing `is_active` on categories,
-- `status` on posts, or other columns added by migrations 003-008,
-- you MUST run those migration files separately. SQLite does not
-- support `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`.
-- =========================================================
