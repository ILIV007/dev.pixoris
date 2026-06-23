-- Migration 003: Expand categories table (v2.2)
ALTER TABLE categories ADD COLUMN description TEXT;
ALTER TABLE categories ADD COLUMN icon TEXT;
ALTER TABLE categories ADD COLUMN banner_image TEXT;
ALTER TABLE categories ADD COLUMN seo_title TEXT;
ALTER TABLE categories ADD COLUMN seo_description TEXT;
ALTER TABLE categories ADD COLUMN is_active INTEGER DEFAULT 1;
ALTER TABLE categories ADD COLUMN is_featured INTEGER DEFAULT 0;
