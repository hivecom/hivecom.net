-- Add depot moderation permissions.
-- Kept separate from the role_permissions seed (next migration) to avoid the
-- Postgres "unsafe use of new value" error: a freshly added enum value cannot
-- be referenced in the same transaction that adds it.
ALTER TYPE public.app_permission ADD VALUE IF NOT EXISTS 'depot.read';
ALTER TYPE public.app_permission ADD VALUE IF NOT EXISTS 'depot.delete';
