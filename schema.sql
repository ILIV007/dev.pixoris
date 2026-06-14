-- Pixoris CMS Database Schema v2.1 — Synced with Worker API

CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT DEFAULT 'editor',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  color TEXT DEFAULT '#4ee5ff',
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  excerpt TEXT,
  content TEXT NOT NULL,
  image_url TEXT,
  category_id INTEGER,
  featured INTEGER DEFAULT 0,
  published INTEGER DEFAULT 0,
  views INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES categories(id)
);

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

CREATE TABLE IF NOT EXISTS media (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filename TEXT NOT NULL,
  url TEXT NOT NULL,
  size INTEGER,
  mime_type TEXT,
  uploaded_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- NEW: Products table for shop
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

-- Seed data
INSERT OR IGNORE INTO categories (name, slug, color, sort_order) VALUES
  ('Games', 'games', '#4ee5ff', 1),
  ('Movies', 'movies', '#ff4e9c', 2),
  ('Technology', 'technology', '#9264ff', 3),
  ('Anime', 'anime', '#ffd84c', 4),
  ('Reviews', 'reviews', '#39f37a', 5),
  ('Guides', 'guides', '#ff7b4e', 6),
  ('News', 'news', '#4ee5ff', 7);

-- Default admin (password will be hashed on first login)
INSERT OR IGNORE INTO admins (username, password_hash, role) VALUES
  ('admin', 'pixoris2026', 'admin');

-- Seed products
INSERT OR IGNORE INTO products (title, slug, description, price, image_url, category, featured, sort_order) VALUES
  ('اکشن‌فیگور Cyber Hero', 'cyber-hero', 'یک اکشن‌فیگور سایبرپانکی با استند اختصاصی، رنگ‌آمیزی دقیق و طراحی مناسب دکور اتاق گیمینگ.', 1490000, 'assets/card-shop.svg', 'Figure', 1, 1),
  ('پوستر سینمایی Neon Frame', 'neon-poster', 'پوستر گیکی با ترکیب رنگ نئون، مناسب دیوار اتاق گیم و فضای استریم.', 320000, 'assets/hero-cinema.svg', 'Poster', 0, 2),
  ('Pixel Box Collection', 'pixel-box', 'یک پک سورپرایزی برای عاشقان آیتم‌های پیکسلی؛ شامل کارت، استیکر، پین و آیتم‌های کوچک کلکسیونی.', 690000, 'assets/hero-gaming.svg', 'Merch', 1, 3);
