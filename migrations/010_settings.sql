-- Migration 010: Settings table (v2.2)
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_by INTEGER
);

INSERT OR IGNORE INTO settings (key, value) VALUES
  ('site_name', 'Pixoris'),
  ('site_description', 'رسانه گیم، سینما و فروشگاه گیکی'),
  ('site_url', 'https://pixoris.pages.dev'),
  ('posts_per_page', '12'),
  ('default_seo_title', 'Pixoris | گیم، سینما و فروشگاه گیکی'),
  ('default_seo_description', 'خبر، تحلیل و فروشگاه محصولات گیکی'),
  ('social_github', 'https://github.com/ILIV007/Pixoris');
