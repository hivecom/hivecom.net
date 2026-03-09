-- Allow discussion authors to lock (but not unlock) their own discussions
-- Admins/moderators (discussions.update permission) retain full lock/unlock control.
-- is_sticky remains restricted to discussions.update permission only.

CREATE OR REPLACE FUNCTION public.protect_discussion_admin_fields()
RETURNS TRIGGER AS $$
BEGIN
  -- Handle is_sticky changes: always requires discussions.update permission
  IF (OLD.is_sticky IS DISTINCT FROM NEW.is_sticky) THEN
    IF NOT authorize('discussions.update'::public.app_permission) THEN
      RAISE EXCEPTION 'Insufficient permissions to modify sticky status';
    END IF;
  END IF;

  -- Handle is_locked changes
  IF (OLD.is_locked IS DISTINCT FROM NEW.is_locked) THEN
    -- Admins/moderators can lock and unlock freely
    IF authorize('discussions.update'::public.app_permission) THEN
      RETURN NEW;
    END IF;

    -- Discussion authors may only lock (not unlock) their own discussion
    IF auth.uid() = OLD.created_by AND NEW.is_locked = true THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Insufficient permissions to modify lock status';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
