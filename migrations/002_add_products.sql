-- Migration 002: Create products table (v2.1)
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

INSERT OR IGNORE INTO products (title, slug, description, price, image_url, category, featured, sort_order) VALUES
  ('اکشن‌فیگور Cyber Hero', 'cyber-hero', 'یک اکشن‌فیگور سایبرپانکی با استند اختصاصی، رنگ‌آمیزی دقیق و طراحی مناسب دکور اتاق گیمینگ.', 1490000, 'assets/card-shop.svg', 'Figure', 1, 1),
  ('پوستر سینمایی Neon Frame', 'neon-poster', 'پوستر گیکی با ترکیب رنگ نئون، مناسب دیوار اتاق گیم و فضای استریم.', 320000, 'assets/hero-cinema.svg', 'Poster', 0, 2),
  ('Pixel Box Collection', 'pixel-box', 'یک پک سورپرایزی برای عاشقان آیتم‌های پیکسلی.', 690000, 'assets/hero-gaming.svg', 'Merch', 1, 3);
