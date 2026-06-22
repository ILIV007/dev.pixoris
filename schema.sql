-- =========================================================
-- Pixoris CMS v2.2 — Production Schema (synced with Worker)
-- =========================================================
-- Run: wrangler d1 execute pixoris-db --file=./schema.sql --remote
-- =========================================================

-- Migration tracking table
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT,
  applied_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- ============= ADMINS / USERS =============
CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  email TEXT UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'editor' CHECK(role IN ('super_admin','admin','editor','author')),
  is_active INTEGER DEFAULT 1,
  last_login TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- ============= CATEGORIES =============
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  icon TEXT,
  banner_image TEXT,
  color TEXT DEFAULT '#4ee5ff',
  seo_title TEXT,
  seo_description TEXT,
  is_active INTEGER DEFAULT 1,
  is_featured INTEGER DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- ============= POSTS =============
CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  excerpt TEXT,
  content TEXT NOT NULL,
  image_url TEXT,
  featured_image_alt TEXT,
  category_id INTEGER,
  author_id INTEGER,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','scheduled','published','archived')),
  featured INTEGER DEFAULT 0,
  views INTEGER DEFAULT 0,
  reading_time INTEGER DEFAULT 0,
  published_at TEXT,
  seo_title TEXT,
  seo_description TEXT,
  canonical_url TEXT,
  meta_keywords TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
  FOREIGN KEY (author_id) REFERENCES admins(id) ON DELETE SET NULL
);

-- ============= TAGS =============
CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS post_tags (
  post_id INTEGER,
  tag_id INTEGER,
  PRIMARY KEY (post_id, tag_id),
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

-- ============= MEDIA =============
CREATE TABLE IF NOT EXISTS media (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filename TEXT NOT NULL,
  url TEXT NOT NULL,
  original_name TEXT,
  size INTEGER,
  mime_type TEXT,
  width INTEGER,
  height INTEGER,
  alt_text TEXT,
  folder TEXT DEFAULT '',
  storage TEXT DEFAULT 'github',  -- 'github' | 'r2' | 'local'
  uploaded_by INTEGER,
  uploaded_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (uploaded_by) REFERENCES admins(id) ON DELETE SET NULL
);

-- ============= PRODUCTS =============
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  price INTEGER DEFAULT 0,
  discount_price INTEGER,
  stock INTEGER DEFAULT 0,
  sku TEXT,
  image_url TEXT,
  gallery TEXT,           -- JSON array of URLs
  category TEXT DEFAULT '',
  featured INTEGER DEFAULT 0,
  active INTEGER DEFAULT 1,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- ============= AUDIT LOGS =============
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id INTEGER,
  action TEXT NOT NULL,        -- login, logout, post.create, post.update, post.delete, category.*, product.*, media.*, user.*
  entity_type TEXT,
  entity_id INTEGER,
  details TEXT,                -- JSON
  ip_address TEXT,
  user_agent TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE SET NULL
);

-- ============= SETTINGS =============
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_by INTEGER
);

-- ============= INDEXES (performance) =============
CREATE INDEX IF NOT EXISTS idx_posts_slug ON posts(slug);
CREATE INDEX IF NOT EXISTS idx_posts_category ON posts(category_id);
CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at);
CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status);
CREATE INDEX IF NOT EXISTS idx_posts_published ON posts(status, published_at);
CREATE INDEX IF NOT EXISTS idx_posts_featured ON posts(featured, status);
CREATE INDEX IF NOT EXISTS idx_categories_slug ON categories(slug);
CREATE INDEX IF NOT EXISTS idx_tags_slug ON tags(slug);
CREATE INDEX IF NOT EXISTS idx_media_folder ON media(folder);
CREATE INDEX IF NOT EXISTS idx_audit_admin ON audit_logs(admin_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_products_slug ON products(slug);
CREATE INDEX IF NOT EXISTS idx_products_active ON products(active, sort_order);

-- ============= SEED: CATEGORIES =============
INSERT OR IGNORE INTO categories (name, slug, description, color, sort_order, is_active) VALUES
  ('Games', 'games', 'اخبار و تحلیل بازی‌های ویدیویی', '#4ee5ff', 1, 1),
  ('Movies', 'movies', 'اخبار سینما و فیلم', '#ff4e9c', 2, 1),
  ('Technology', 'technology', 'تکنولوژی و گجت‌ها', '#9264ff', 3, 1),
  ('Anime', 'anime', 'انیمه و مانگا', '#ffd84c', 4, 1),
  ('Reviews', 'reviews', 'نقد و بررسی آثار', '#39f37a', 5, 1),
  ('Guides', 'guides', 'راهنما و آموزش', '#ff7b4e', 6, 1),
  ('News', 'news', 'اخبار روز', '#4ee5ff', 7, 1);

-- ============= SEED: ADMIN (password will be hashed on first login) =============
-- Default password: pixoris2026
INSERT OR IGNORE INTO admins (username, email, password_hash, role, is_active) VALUES
  ('admin', 'admin@pixoris.local', 'pixoris2026', 'super_admin', 1);

-- ============= SEED: PRODUCTS =============
INSERT OR IGNORE INTO products (title, slug, description, price, image_url, category, featured, active, sort_order, stock) VALUES
  ('اکشن‌فیگور Cyber Hero', 'cyber-hero', 'یک اکشن‌فیگور سایبرپانکی با استند اختصاصی، رنگ‌آمیزی دقیق و طراحی مناسب دکور اتاق گیمینگ.', 1490000, 'assets/card-shop.svg', 'Figure', 1, 1, 1, 25),
  ('پوستر سینمایی Neon Frame', 'neon-poster', 'پوستر گیکی با ترکیب رنگ نئون، مناسب دیوار اتاق گیم و فضای استریم.', 320000, 'assets/hero-cinema.svg', 'Poster', 0, 1, 2, 80),
  ('Pixel Box Collection', 'pixel-box', 'یک پک سورپرایزی برای عاشقان آیتم‌های پیکسلی؛ شامل کارت، استیکر، پین و آیتم‌های کوچک کلکسیونی.', 690000, 'assets/hero-gaming.svg', 'Merch', 1, 1, 3, 50);

-- ============= SEED: SETTINGS =============
INSERT OR IGNORE INTO settings (key, value) VALUES
  ('site_name', 'Pixoris'),
  ('site_description', 'رسانه گیم، سینما و فروشگاه گیکی'),
  ('site_url', 'https://pixoris.pages.dev'),
  ('posts_per_page', '12'),
  ('default_seo_title', 'Pixoris | گیم، سینما و فروشگاه گیکی'),
  ('default_seo_description', 'خبر، تحلیل و فروشگاه محصولات گیکی'),
  ('social_instagram', ''),
  ('social_telegram', ''),
  ('social_youtube', ''),
  ('social_github', 'https://github.com/ILIV007/Pixoris');

-- ============= MIGRATION VERSION =============
INSERT OR IGNORE INTO schema_migrations (version, name) VALUES (1, 'initial_v2.2');
