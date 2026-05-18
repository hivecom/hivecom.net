-- Restore INSERT/UPDATE/DELETE grants on tables that take direct authenticated
-- client writes but were incorrectly reduced to SELECT-only by
-- 20260515055020_tighten_grants.sql.
--
-- That migration noted these as "admin writes go via service_role or SECURITY
-- DEFINER RPCs" but the app writes directly via the authenticated client;
-- the RLS policies (games.create / games.update / games.delete etc.) enforce
-- the permission check - the grant is still required.
--
-- Tables confirmed to need authenticated DML via app code:
--   public.games              - GameTable.vue / SteamGamesTable.vue
--   public.network_servers    - ServerTable.vue
--   public.network_gameservers - GameServerTable.vue
--   public.funding_expenses   - ExpenseTable.vue

GRANT INSERT, UPDATE, DELETE ON public.games               TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.network_servers     TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.network_gameservers TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.funding_expenses    TO authenticated;
