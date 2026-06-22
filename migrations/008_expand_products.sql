-- Migration 008: Expand products table (v2.2)
ALTER TABLE products ADD COLUMN discount_price INTEGER;
ALTER TABLE products ADD COLUMN stock INTEGER DEFAULT 0;
ALTER TABLE products ADD COLUMN sku TEXT;
ALTER TABLE products ADD COLUMN gallery TEXT;
