-- Add the broadcast read permission resource.
-- Kept separate from the grant migration to avoid the Postgres "unsafe use of
-- new value" error: a freshly added enum value cannot be referenced in the
-- same transaction that adds it.
ALTER TYPE public.app_permission ADD VALUE IF NOT EXISTS 'broadcasts.read';
