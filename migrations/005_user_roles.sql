-- Migration 005: Expand admins with user roles (v2.2)
ALTER TABLE admins ADD COLUMN email TEXT;
ALTER TABLE admins ADD COLUMN is_active INTEGER DEFAULT 1;
ALTER TABLE admins ADD COLUMN last_login TEXT;
ALTER TABLE admins ADD COLUMN updated_at TEXT DEFAULT CURRENT_TIMESTAMP;

-- Migrate existing admin role to super_admin
UPDATE admins SET role = 'super_admin' WHERE role = 'admin' OR role IS NULL;
