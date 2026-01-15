-- Add permissions for discussions
-- Separate migration to avoid "unsafe use of new value" error in the same transaction
ALTER TYPE public.app_permission ADD VALUE IF NOT EXISTS 'discussions.create';
ALTER TYPE public.app_permission ADD VALUE IF NOT EXISTS 'discussions.read';
ALTER TYPE public.app_permission ADD VALUE IF NOT EXISTS 'discussions.update';
ALTER TYPE public.app_permission ADD VALUE IF NOT EXISTS 'discussions.delete';
ALTER TYPE public.app_permission ADD VALUE IF NOT EXISTS 'discussions.manage';
