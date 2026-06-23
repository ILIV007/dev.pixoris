-- Migration 004: Expand posts table (v2.2)
ALTER TABLE posts ADD COLUMN author_id INTEGER REFERENCES admins(id);
ALTER TABLE posts ADD COLUMN status TEXT DEFAULT 'draft';
ALTER TABLE posts ADD COLUMN featured_image_alt TEXT;
ALTER TABLE posts ADD COLUMN published_at TEXT;
ALTER TABLE posts ADD COLUMN reading_time INTEGER DEFAULT 0;
ALTER TABLE posts ADD COLUMN seo_title TEXT;
ALTER TABLE posts ADD COLUMN seo_description TEXT;
ALTER TABLE posts ADD COLUMN canonical_url TEXT;
ALTER TABLE posts ADD COLUMN meta_keywords TEXT;

-- Migrate legacy `published` column to `status`
UPDATE posts SET status = 'published' WHERE published = 1;
UPDATE posts SET status = 'draft' WHERE published = 0 OR published IS NULL;
