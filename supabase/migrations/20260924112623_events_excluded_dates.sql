-- Removed occurrences of recurring events (the iCal EXDATE equivalent), plus
-- sync trigger fixes so recurrence edits actually reach Discord and Google.

-- ============================================================
-- 1. excluded_dates column
-- ============================================================

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS excluded_dates timestamptz[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.events.excluded_dates IS 'Occurrence start times removed from a recurring series. Occurrences are computed client-side in local time, so matching uses a tolerance window instead of exact equality to absorb DST drift between clients.';

-- ============================================================
-- 2. Sync triggers: fire on recurrence changes too
--    Neither trigger listed recurrence_rule, so rule edits and fork caps
--    (UNTIL) never synced. Discord has no public API for recurrence
--    exceptions, so only Google listens to excluded_dates.
-- ============================================================

DROP TRIGGER IF EXISTS trigger_sync_google_calendar_update ON public.events;

CREATE TRIGGER trigger_sync_google_calendar_update
  AFTER UPDATE OF title, description, date, duration_minutes, location, note, link, is_official, recurrence_rule, excluded_dates
  ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_sync_google_calendar_update();

DROP TRIGGER IF EXISTS trigger_sync_discord_events_update ON public.events;

CREATE TRIGGER trigger_sync_discord_events_update
  AFTER UPDATE OF title, description, date, duration_minutes, location, note, link, recurrence_rule
  ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_sync_discord_events_update();

-- ============================================================
-- 3. Drop occurrence-scoped RSVPs for removed occurrences
--    RLS only lets users delete their own RSVPs, so the organizer can't clean
--    these up from the client. Series RSVPs are untouched.
-- ============================================================

CREATE OR REPLACE FUNCTION public.trigger_delete_rsvps_on_excluded_dates()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
AS $$
BEGIN
  IF OLD.excluded_dates IS NOT DISTINCT FROM NEW.excluded_dates THEN
    RETURN NEW;
  END IF;

  -- Same 6 hour tolerance the client uses when matching occurrences.
  DELETE FROM public.event_rsvps AS r
  WHERE r.event_id = NEW.id
    AND r.scope = 'occurrence'
    AND r.occurrence_date IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM unnest(NEW.excluded_dates) AS x(excluded_at)
      WHERE abs(extract(epoch FROM r.occurrence_date - x.excluded_at)) < 6 * 3600
    );

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.trigger_delete_rsvps_on_excluded_dates() IS
  'When occurrences are removed from a recurring event, deletes occurrence-scoped RSVPs that pointed at them.';

REVOKE EXECUTE ON FUNCTION public.trigger_delete_rsvps_on_excluded_dates() FROM anon, authenticated, public;

DROP TRIGGER IF EXISTS delete_rsvps_on_excluded_dates_trigger ON public.events;

CREATE TRIGGER delete_rsvps_on_excluded_dates_trigger
  AFTER UPDATE OF excluded_dates ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_delete_rsvps_on_excluded_dates();

-- ============================================================
-- 4. Admin events RPC: return excluded_dates
--    The admin edit sheet is fed from this RPC, not a select('*').
-- ============================================================

DROP FUNCTION IF EXISTS public.get_admin_events_paginated(text, text, text, integer, integer, boolean, boolean, bigint[]);

CREATE FUNCTION public.get_admin_events_paginated(
  p_search         text      DEFAULT '',
  p_sort_col       text      DEFAULT 'date',
  p_sort_dir       text      DEFAULT 'desc',
  p_limit          integer   DEFAULT 20,
  p_offset         integer   DEFAULT 0,
  p_is_official    boolean   DEFAULT NULL,
  p_hide_recurring boolean   DEFAULT FALSE,
  p_game_ids       bigint[]  DEFAULT NULL
)
RETURNS TABLE (
  id                              bigint,
  title                           text,
  description                     text,
  note                            text,
  markdown                        text,
  date                            timestamptz,
  location                        text,
  link                            text,
  duration_minutes                bigint,
  games                           bigint[],
  google_event_id                 text,
  google_last_synced_at           timestamptz,
  google_community_event_id       text,
  google_community_last_synced_at timestamptz,
  discord_event_id                text,
  discord_last_synced_at          timestamptz,
  created_at                      timestamptz,
  created_by                      uuid,
  modified_at                     timestamptz,
  modified_by                     uuid,
  is_official                     boolean,
  recurrence_rule                 text,
  recurrence_parent_id            bigint,
  recurrence_exception            boolean,
  excluded_dates                  timestamptz[],
  total_count                     bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  has_access boolean;
BEGIN
  has_access := public.has_permission('events.read'::public.app_permission);

  IF NOT has_access THEN
    RAISE EXCEPTION 'Insufficient permissions to view admin events overview';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT
      e.id,
      e.title,
      e.description,
      e.note,
      e.markdown,
      e.date,
      e.location,
      e.link,
      e.duration_minutes,
      e.games,
      e.google_event_id,
      e.google_last_synced_at,
      e.google_community_event_id,
      e.google_community_last_synced_at,
      e.discord_event_id,
      e.discord_last_synced_at,
      e.created_at,
      e.created_by,
      e.modified_at,
      e.modified_by,
      e.is_official,
      e.recurrence_rule,
      e.recurrence_parent_id,
      e.recurrence_exception,
      e.excluded_dates
    FROM public.events AS e
    WHERE
      (
        p_search = ''
        OR e.title       ILIKE '%' || p_search || '%'
        OR e.description ILIKE '%' || p_search || '%'
        OR e.location    ILIKE '%' || p_search || '%'
      )
      AND (p_is_official IS NULL OR e.is_official = p_is_official)
      AND (NOT p_hide_recurring OR e.recurrence_rule IS NULL)
      AND (p_game_ids IS NULL OR e.games && p_game_ids)
  )
  SELECT
    b.id,
    b.title,
    b.description,
    b.note,
    b.markdown,
    b.date,
    b.location,
    b.link,
    b.duration_minutes,
    b.games,
    b.google_event_id,
    b.google_last_synced_at,
    b.google_community_event_id,
    b.google_community_last_synced_at,
    b.discord_event_id,
    b.discord_last_synced_at,
    b.created_at,
    b.created_by,
    b.modified_at,
    b.modified_by,
    b.is_official,
    b.recurrence_rule,
    b.recurrence_parent_id,
    b.recurrence_exception,
    b.excluded_dates,
    COUNT(*) OVER () AS total_count
  FROM base AS b
  ORDER BY
    CASE WHEN p_sort_dir = 'asc' THEN
      CASE p_sort_col
        WHEN 'date'       THEN b.date
        WHEN 'created_at' THEN b.created_at
        ELSE NULL::timestamptz
      END
    END ASC NULLS LAST,
    CASE WHEN p_sort_dir = 'asc' THEN
      CASE p_sort_col
        WHEN 'title'            THEN b.title
        WHEN 'location'         THEN b.location
        WHEN 'recurrence_rule'  THEN b.recurrence_rule
        ELSE NULL::text
      END
    END ASC NULLS LAST,
    CASE WHEN p_sort_dir = 'asc' THEN
      CASE p_sort_col
        WHEN 'is_official' THEN b.is_official::int
        ELSE NULL::int
      END
    END ASC NULLS LAST,
    CASE WHEN p_sort_dir = 'desc' THEN
      CASE p_sort_col
        WHEN 'date'       THEN b.date
        WHEN 'created_at' THEN b.created_at
        ELSE NULL::timestamptz
      END
    END DESC NULLS LAST,
    CASE WHEN p_sort_dir = 'desc' THEN
      CASE p_sort_col
        WHEN 'title'            THEN b.title
        WHEN 'location'         THEN b.location
        WHEN 'recurrence_rule'  THEN b.recurrence_rule
        ELSE NULL::text
      END
    END DESC NULLS LAST,
    CASE WHEN p_sort_dir = 'desc' THEN
      CASE p_sort_col
        WHEN 'is_official' THEN b.is_official::int
        ELSE NULL::int
      END
    END DESC NULLS LAST,
    b.created_at DESC
  LIMIT  p_limit
  OFFSET p_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_events_paginated(text, text, text, integer, integer, boolean, boolean, bigint[]) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_admin_events_paginated(text, text, text, integer, integer, boolean, boolean, bigint[]) FROM anon;
