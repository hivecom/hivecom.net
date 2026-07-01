-- Web Push subscriptions
--
-- Stores one row per browser/device push subscription so the `push-send` edge
-- function can deliver Web Push messages for platform notifications (non-chat).
-- Each subscription belongs to a single user and is only visible to them.
-- A user may have many subscriptions (one per installed PWA / browser).

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Table
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.user_push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The owner of this subscription (FK to auth.users so it survives profile
  -- deletion semantics consistent with user_notifications).
  user_id uuid NOT NULL REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE CASCADE,

  -- Push service endpoint URL. Globally unique - the same endpoint must never
  -- map to two rows, so re-subscribing upserts in place.
  endpoint text NOT NULL,

  -- Subscription crypto material (from PushSubscription.toJSON().keys).
  p256dh text NOT NULL,
  auth text NOT NULL,

  -- Best-effort device/browser label for the user to recognise the device.
  user_agent text,

  created_at timestamptz NOT NULL DEFAULT now(),
  modified_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX user_push_subscriptions_endpoint_idx
  ON public.user_push_subscriptions (endpoint);

CREATE INDEX user_push_subscriptions_user_id_idx
  ON public.user_push_subscriptions (user_id);

COMMENT ON TABLE public.user_push_subscriptions
  IS 'Web Push subscriptions. One row per browser/device, used by push-send to deliver platform notifications.';
COMMENT ON COLUMN public.user_push_subscriptions.endpoint
  IS 'Push service endpoint URL. Globally unique; re-subscribing upserts in place.';
COMMENT ON COLUMN public.user_push_subscriptions.p256dh
  IS 'Subscription public key (PushSubscription.toJSON().keys.p256dh).';
COMMENT ON COLUMN public.user_push_subscriptions.auth
  IS 'Subscription auth secret (PushSubscription.toJSON().keys.auth).';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. RLS
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.user_push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own push subscriptions"
  ON public.user_push_subscriptions FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can insert own push subscriptions"
  ON public.user_push_subscriptions FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can update own push subscriptions"
  ON public.user_push_subscriptions FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can delete own push subscriptions"
  ON public.user_push_subscriptions FOR DELETE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Grants
-- ─────────────────────────────────────────────────────────────────────────────

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_push_subscriptions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_push_subscriptions TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Audit trigger (keeps modified_at fresh, consistent with other tables)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TRIGGER update_user_push_subscriptions_audit_fields
  BEFORE UPDATE ON public.user_push_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_audit_fields();

COMMIT;
