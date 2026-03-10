-- Create alerts table
--
-- System-wide alerts readable by admins and moderators (anyone with the
-- alerts.read permission). Alerts are global - when any privileged user
-- acknowledges one it is acknowledged for everyone.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Add alerts.read permission to the enum
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TYPE public.app_permission ADD VALUE IF NOT EXISTS 'alerts.read';

COMMIT;

-- Must be in a separate transaction because enum values added with
-- ADD VALUE are not visible inside the same transaction.
BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Seed role_permissions for the new permission
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.role_permissions (role, permission)
VALUES
  ('admin', 'alerts.read'),
  ('moderator', 'alerts.read')
ON CONFLICT (role, permission) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Table
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Simple text content - no markdown needed
  title text NOT NULL,
  body text,

  -- Severity / category for UI presentation
  -- e.g. 'info', 'warning', 'danger'
  severity text NOT NULL DEFAULT 'info',

  -- Optional link for the alert to navigate to in the UI
  href text,

  -- Global acknowledgement - once any admin/mod marks it read, it is
  -- considered read for everyone.
  is_acknowledged boolean NOT NULL DEFAULT false,
  acknowledged_at timestamptz,
  acknowledged_by uuid REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE SET NULL,

  -- Audit
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE SET NULL DEFAULT auth.uid(),
  modified_at timestamptz NOT NULL DEFAULT now(),
  modified_by uuid REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE SET NULL DEFAULT auth.uid()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Indexes
-- ─────────────────────────────────────────────────────────────────────────────

-- Primary listing: newest first
CREATE INDEX alerts_created_at_idx
  ON public.alerts (created_at DESC);

-- Fast count of unacknowledged alerts for badge / dashboard
CREATE INDEX alerts_unacknowledged_idx
  ON public.alerts (id)
  WHERE is_acknowledged = false;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Constraints
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.alerts
  ADD CONSTRAINT alerts_severity_check
  CHECK (severity IN ('info', 'warning', 'danger'));

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Comments
-- ─────────────────────────────────────────────────────────────────────────────

COMMENT ON TABLE public.alerts
  IS 'System-wide alerts visible to admins and moderators. Globally acknowledged.';
COMMENT ON COLUMN public.alerts.title
  IS 'Short alert headline.';
COMMENT ON COLUMN public.alerts.body
  IS 'Optional longer description text.';
COMMENT ON COLUMN public.alerts.severity
  IS 'Alert severity level: info, warning, or danger.';
COMMENT ON COLUMN public.alerts.href
  IS 'Optional in-app link the alert should navigate to.';
COMMENT ON COLUMN public.alerts.is_acknowledged
  IS 'Whether this alert has been acknowledged by any admin or moderator.';
COMMENT ON COLUMN public.alerts.acknowledged_at
  IS 'Timestamp when the alert was acknowledged.';
COMMENT ON COLUMN public.alerts.acknowledged_by
  IS 'The user who acknowledged this alert.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. RLS
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;

-- Only users with alerts.read permission can see alerts
CREATE POLICY "Authorized roles can read alerts"
  ON public.alerts FOR SELECT
  TO authenticated
  USING (authorize('alerts.read'::public.app_permission));

-- Only service_role (triggers / CRON) should create alerts
-- No authenticated INSERT policy - alerts come from the system.

-- Authorized roles can update alerts (acknowledge them)
CREATE POLICY "Authorized roles can update alerts"
  ON public.alerts FOR UPDATE
  TO authenticated
  USING (authorize('alerts.read'::public.app_permission));

-- Authorized roles can delete alerts
CREATE POLICY "Authorized roles can delete alerts"
  ON public.alerts FOR DELETE
  TO authenticated
  USING (authorize('alerts.read'::public.app_permission));

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Grants
-- ─────────────────────────────────────────────────────────────────────────────

GRANT SELECT, UPDATE, DELETE ON public.alerts TO authenticated;
GRANT SELECT ON public.alerts TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.alerts TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. Audit trigger
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TRIGGER update_alerts_audit_fields
  BEFORE UPDATE ON public.alerts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_audit_fields();

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. Auto-fill acknowledged_at when is_acknowledged changes to true
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fill_alert_acknowledged_fields()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.is_acknowledged = false AND NEW.is_acknowledged = true THEN
    NEW.acknowledged_at = now();
    NEW.acknowledged_by = auth.uid();
  END IF;

  -- If un-acknowledging (shouldn't normally happen but be safe), clear fields
  IF OLD.is_acknowledged = true AND NEW.is_acknowledged = false THEN
    NEW.acknowledged_at = NULL;
    NEW.acknowledged_by = NULL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER fill_alert_acknowledged_fields_trigger
  BEFORE UPDATE ON public.alerts
  FOR EACH ROW
  EXECUTE FUNCTION public.fill_alert_acknowledged_fields();

COMMIT;
