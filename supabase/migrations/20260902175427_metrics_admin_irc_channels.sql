-- Admin-only IRC channel lookup for the metrics collector.
--
-- The public `metrics` table and latest.json snapshot key secret (+s) IRC
-- channels by an opaque id instead of their name, so anyone can read message
-- volume without learning that the channel exists. This table maps those ids
-- back to names for users holding `metrics_admin.read`. The collector writes
-- it with the service role, every listed channel gets a row, and the `secret`
-- flag records which ones are keyed by id in the public snapshot.
--
-- `metrics_admin_` is the prefix for enrichment tables that sit behind the
-- same gate, so future admin-only metric lookups land next to this one.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Add metrics_admin.read permission to the enum
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TYPE public.app_permission ADD VALUE IF NOT EXISTS 'metrics_admin.read';

COMMIT;

-- Must be in a separate transaction because enum values added with
-- ADD VALUE are not visible inside the same transaction.
BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Seed role_permissions for the new permission
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.role_permissions (role, permission)
VALUES ('admin', 'metrics_admin.read')
ON CONFLICT (role, permission) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Table
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.metrics_admin_irc_channels (
  -- Opaque key used in place of the name inside public metrics for secret
  -- channels. Assigned here so it stays stable across collector runs.
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Channel name as Ergo reports it, display case preserved.
  name text NOT NULL UNIQUE,

  -- Whether the channel was +s the last time the collector saw it.
  secret boolean NOT NULL DEFAULT false,

  first_seen timestamptz NOT NULL DEFAULT now(),
  last_seen timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Comments
-- ─────────────────────────────────────────────────────────────────────────────

COMMENT ON TABLE public.metrics_admin_irc_channels
  IS 'Admin-only lookup from the opaque ids used for secret IRC channels in public metrics back to channel names. Written by cron-metrics-fetch.';
COMMENT ON COLUMN public.metrics_admin_irc_channels.id
  IS 'Opaque key that stands in for the name in public metrics while the channel is secret.';
COMMENT ON COLUMN public.metrics_admin_irc_channels.name
  IS 'Channel name as reported by Ergo.';
COMMENT ON COLUMN public.metrics_admin_irc_channels.secret
  IS 'True when the channel was +s at the last collector run.';
COMMENT ON COLUMN public.metrics_admin_irc_channels.last_seen
  IS 'Last collector run that listed this channel.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. RLS
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.metrics_admin_irc_channels ENABLE ROW LEVEL SECURITY;

-- Only users with metrics_admin.read can resolve ids back to names
CREATE POLICY "Authorized roles can read metrics_admin_irc_channels"
  ON public.metrics_admin_irc_channels FOR SELECT
  TO authenticated
  USING (authorize('metrics_admin.read'::public.app_permission));

-- No authenticated INSERT/UPDATE/DELETE policies - rows come from the
-- collector via service_role only.

COMMIT;
