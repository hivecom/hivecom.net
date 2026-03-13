-- auto_subscribe_discussion_author and auto_subscribe_reply_author both insert
-- into discussion_subscriptions.user_id which is NOT NULL. When discussions are
-- created by the create_discussion_for_entity trigger during seeding (or any
-- service-role context with no authenticated session), created_by is NULL and
-- the insert fails.
--
-- Fix: early-return from both functions when created_by is NULL.

CREATE OR REPLACE FUNCTION public.auto_subscribe_discussion_author()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.created_by IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.discussion_subscriptions (user_id, discussion_id)
  VALUES (NEW.created_by, NEW.id)
  ON CONFLICT (user_id, discussion_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.auto_subscribe_reply_author()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.created_by IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.discussion_subscriptions (user_id, discussion_id, last_seen_at)
  VALUES (NEW.created_by, NEW.discussion_id, now())
  ON CONFLICT (user_id, discussion_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
