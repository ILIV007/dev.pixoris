-- Migration 001: Add sort_order to categories (legacy v2.0 → v2.1)
-- Run this if your database was created before v2.1

ALTER TABLE categories ADD COLUMN sort_order INTEGER DEFAULT 0;
