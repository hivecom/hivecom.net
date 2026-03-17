BEGIN;

-- Rich presence is changing from opt-out (default enabled) to opt-in (default disabled).
-- Rename the column to reflect positive semantics: rich_presence_disabled -> rich_presence_enabled.
ALTER TABLE public.profiles
  RENAME COLUMN rich_presence_disabled TO rich_presence_enabled;

-- Flip all existing values so the meaning is preserved after the rename.
UPDATE public.profiles
  SET rich_presence_enabled = NOT rich_presence_enabled;

-- Reset everyone to disabled (FALSE) - users must explicitly opt in under the new policy.
UPDATE public.profiles
  SET rich_presence_enabled = FALSE;

-- Change the column default so new accounts also start with rich presence disabled.
ALTER TABLE public.profiles
  ALTER COLUMN rich_presence_enabled SET DEFAULT FALSE;

COMMENT ON COLUMN public.profiles.rich_presence_enabled IS 'User toggle to enable rich presence display across connected services. Defaults to FALSE (opt-in - users must explicitly enable it).';

COMMIT;
