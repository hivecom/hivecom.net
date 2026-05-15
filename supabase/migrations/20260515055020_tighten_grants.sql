-- Revoke excess DML grants on all public tables for anon and authenticated roles.
-- Grants are tightened to match exactly what RLS policies permit.
-- service_role is unchanged (retains ALL on all tables via Supabase defaults).
--
-- Derivation per table:
--   anon      - SELECT only where a SELECT policy covering {anon} or {public} exists
--   anon      - no access where no anon-facing policy exists
--   authenticated - SELECT always where policies exist; DML only where policies exist
--
-- Tables where authenticated legitimately needs INSERT/UPDATE/DELETE are granted
-- those specific privileges only. TRUNCATE, TRIGGER, REFERENCES removed everywhere
-- for both roles as no policy or app code requires them.

-- ─── Revoke all first, then re-grant precisely ────────────────────────────────

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'alerts','complaints','containers','data_steam_games',
    'discussion_replies','discussion_subscriptions','discussion_topics','discussions',
    'events','events_rsvps','expenses','friends',
    'games','gameservers','kvstore','metrics','monthly_funding','motds',
    'notifications','presences_discord','presences_steam','presences_teamspeak',
    'profile_point_claims','profile_point_history','profile_points',
    'profiles','projects','referendum_votes','referendums',
    'role_permissions','servers','settings','themes','user_roles'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
  END LOOP;
END;
$$;

-- ─── anon: SELECT only where public-facing SELECT policies exist ──────────────

GRANT SELECT ON public.containers            TO anon;
GRANT SELECT ON public.data_steam_games      TO anon;
GRANT SELECT ON public.events                TO anon;
GRANT SELECT ON public.events_rsvps          TO anon;
GRANT SELECT ON public.expenses              TO anon;
GRANT SELECT ON public.games                 TO anon;
GRANT SELECT ON public.gameservers           TO anon;
GRANT SELECT ON public.kvstore               TO anon;
GRANT SELECT ON public.metrics               TO anon;
GRANT SELECT ON public.monthly_funding       TO anon;
GRANT SELECT ON public.motds                 TO anon;
GRANT SELECT ON public.profile_points        TO anon;
GRANT SELECT ON public.profiles              TO anon;
GRANT SELECT ON public.projects              TO anon;
GRANT SELECT ON public.role_permissions      TO anon;
GRANT SELECT ON public.servers               TO anon;
GRANT SELECT ON public.themes                TO anon;
-- discussion_replies/topics/discussions: public SELECT policy exists (covers anon)
GRANT SELECT ON public.discussion_replies    TO anon;
GRANT SELECT ON public.discussion_topics     TO anon;
GRANT SELECT ON public.discussions           TO anon;
GRANT SELECT ON public.referendums           TO anon;

-- ─── authenticated: SELECT + specific DML per table ──────────────────────────

-- Read-only for authenticated (admin writes go via service_role or SECURITY DEFINER RPCs)
GRANT SELECT ON public.containers            TO authenticated;
GRANT SELECT ON public.data_steam_games      TO authenticated;
GRANT SELECT ON public.expenses              TO authenticated;
GRANT SELECT ON public.games                 TO authenticated;
GRANT SELECT ON public.gameservers           TO authenticated;
GRANT SELECT ON public.kvstore               TO authenticated;
GRANT SELECT ON public.metrics               TO authenticated;
GRANT SELECT ON public.monthly_funding       TO authenticated;
GRANT SELECT ON public.profile_point_history TO authenticated;
GRANT SELECT ON public.profile_points        TO authenticated;
GRANT SELECT ON public.profile_point_claims  TO authenticated;
GRANT SELECT ON public.role_permissions      TO authenticated;
GRANT SELECT ON public.servers               TO authenticated;

-- alerts: admin SELECT/UPDATE/DELETE
GRANT SELECT, UPDATE, DELETE ON public.alerts TO authenticated;

-- complaints: users INSERT own; admin SELECT/UPDATE/DELETE
GRANT SELECT, INSERT, UPDATE, DELETE ON public.complaints TO authenticated;

-- discussion_replies: all users SELECT; authenticated INSERT/UPDATE/DELETE
GRANT SELECT, INSERT, UPDATE, DELETE ON public.discussion_replies TO authenticated;

-- discussion_subscriptions: authenticated only SELECT/INSERT/UPDATE/DELETE own
GRANT SELECT, INSERT, UPDATE, DELETE ON public.discussion_subscriptions TO authenticated;

-- discussion_topics: all SELECT; authenticated INSERT/UPDATE/DELETE (with permission check)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.discussion_topics TO authenticated;

-- discussions: all SELECT; authenticated INSERT/UPDATE/DELETE
GRANT SELECT, INSERT, UPDATE, DELETE ON public.discussions TO authenticated;

-- events: all SELECT; authenticated INSERT/UPDATE/DELETE (with permission check)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.events TO authenticated;

-- events_rsvps: all SELECT; authenticated INSERT/UPDATE/DELETE
GRANT SELECT, INSERT, UPDATE, DELETE ON public.events_rsvps TO authenticated;

-- friends: authenticated SELECT/INSERT/UPDATE/DELETE own
GRANT SELECT, INSERT, UPDATE, DELETE ON public.friends TO authenticated;

-- motds: SELECT public; authenticated INSERT/UPDATE/DELETE (with permission check)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.motds TO authenticated;

-- notifications: authenticated SELECT/INSERT/UPDATE/DELETE own
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;

-- presences: authenticated SELECT only (service_role writes via policy)
GRANT SELECT ON public.presences_discord    TO authenticated;
GRANT SELECT ON public.presences_steam      TO authenticated;
GRANT SELECT ON public.presences_teamspeak  TO authenticated;

-- profiles: authenticated SELECT/UPDATE/DELETE (with permission/owner check)
GRANT SELECT, UPDATE, DELETE ON public.profiles TO authenticated;

-- projects: authenticated SELECT/INSERT/UPDATE/DELETE (with permission check)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;

-- referendum_votes: authenticated SELECT/INSERT/UPDATE/DELETE
GRANT SELECT, INSERT, UPDATE, DELETE ON public.referendum_votes TO authenticated;

-- referendums: authenticated SELECT/INSERT/UPDATE/DELETE (with permission check)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.referendums TO authenticated;

-- settings: authenticated SELECT/INSERT/UPDATE/DELETE own
GRANT SELECT, INSERT, UPDATE, DELETE ON public.settings TO authenticated;

-- themes: all SELECT; authenticated INSERT/UPDATE/DELETE (with permission/owner check)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.themes TO authenticated;

-- user_roles: authenticated SELECT/INSERT/UPDATE/DELETE (with permission check)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;
