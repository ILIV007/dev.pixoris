-- Migration 007: Expand media table (v2.2)
ALTER TABLE media ADD COLUMN original_name TEXT;
ALTER TABLE media ADD COLUMN width INTEGER;
ALTER TABLE media ADD COLUMN height INTEGER;
ALTER TABLE media ADD COLUMN alt_text TEXT;
ALTER TABLE media ADD COLUMN folder TEXT DEFAULT '';
ALTER TABLE media ADD COLUMN storage TEXT DEFAULT 'github';
ALTER TABLE media ADD COLUMN uploaded_by INTEGER REFERENCES admins(id);
