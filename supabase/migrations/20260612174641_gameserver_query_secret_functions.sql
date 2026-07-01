-- Per-gameserver query secrets (currently: Factorio RCON passwords).
--
-- Design (see README_VAULT.md):
--   * Secrets are stored in Vault under the name `gameserver_query_secret_<id>`.
--   * Vault stays a database-layer concern: edge functions never read Vault
--     directly. cron-metrics-fetch calls get_gameserver_query_secret() (a
--     SECURITY DEFINER function) so the DB performs the decrypted read on its
--     behalf, and that function is granted to service_role only.
--   * Admins write/clear secrets via set_/delete_gameserver_query_secret(),
--     gated on the network.update permission. The plaintext is never returned
--     to the client; has_gameserver_query_secret() exposes only existence.
--   * Deleting a gameserver drops its secret via an AFTER DELETE trigger.

-- ---------------------------------------------------------------------------
-- Write (upsert) a gameserver query secret. Admin-only.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_gameserver_query_secret(
  p_gameserver_id bigint,
  p_secret text
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $$
DECLARE
  v_name text := 'gameserver_query_secret_' || p_gameserver_id::text;
  v_id uuid;
BEGIN
  IF NOT public.has_permission('network.update'::public.app_permission) THEN
    RAISE EXCEPTION 'Insufficient permission to set gameserver query secret';
  END IF;

  IF p_secret IS NULL OR length(btrim(p_secret)) = 0 THEN
    RAISE EXCEPTION 'Gameserver query secret must not be empty';
  END IF;

  SELECT id INTO v_id FROM vault.secrets WHERE name = v_name;

  IF v_id IS NULL THEN
    PERFORM vault.create_secret(
      p_secret,
      v_name,
      'Query secret (e.g. Factorio RCON password) for gameserver ' || p_gameserver_id::text
    );
  ELSE
    PERFORM vault.update_secret(v_id, p_secret);
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- Remove a gameserver query secret. Admin-only.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_gameserver_query_secret(
  p_gameserver_id bigint
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $$
BEGIN
  IF NOT public.has_permission('network.update'::public.app_permission) THEN
    RAISE EXCEPTION 'Insufficient permission to delete gameserver query secret';
  END IF;

  DELETE FROM vault.secrets
  WHERE name = 'gameserver_query_secret_' || p_gameserver_id::text;
END;
$$;

-- ---------------------------------------------------------------------------
-- Report whether a gameserver has a query secret (without revealing it).
-- Readable by anyone who can view the network admin surface.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_gameserver_query_secret(
  p_gameserver_id bigint
)
  RETURNS boolean
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path = ''
AS $$
BEGIN
  IF NOT public.has_permission('network.read'::public.app_permission) THEN
    RAISE EXCEPTION 'Insufficient permission to read gameserver query secret state';
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM vault.secrets
    WHERE name = 'gameserver_query_secret_' || p_gameserver_id::text
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Read the decrypted secret. service_role only (consumed by cron-metrics-fetch).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_gameserver_query_secret(
  p_gameserver_id bigint
)
  RETURNS text
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path = ''
AS $$
DECLARE
  v_secret text;
BEGIN
  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name = 'gameserver_query_secret_' || p_gameserver_id::text;

  RETURN v_secret;
END;
$$;

-- ---------------------------------------------------------------------------
-- Drop a gameserver's secret when the gameserver itself is deleted.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cleanup_gameserver_query_secret()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $$
BEGIN
  DELETE FROM vault.secrets
  WHERE name = 'gameserver_query_secret_' || OLD.id::text;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_cleanup_gameserver_query_secret ON public.network_gameservers;
CREATE TRIGGER trg_cleanup_gameserver_query_secret
  AFTER DELETE ON public.network_gameservers
  FOR EACH ROW
  EXECUTE FUNCTION public.cleanup_gameserver_query_secret();

-- ---------------------------------------------------------------------------
-- Grants: lock down who can call each function.
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.set_gameserver_query_secret(bigint, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_gameserver_query_secret(bigint, text) TO authenticated;

REVOKE ALL ON FUNCTION public.delete_gameserver_query_secret(bigint) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.delete_gameserver_query_secret(bigint) TO authenticated;

REVOKE ALL ON FUNCTION public.has_gameserver_query_secret(bigint) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.has_gameserver_query_secret(bigint) TO authenticated;

REVOKE ALL ON FUNCTION public.get_gameserver_query_secret(bigint) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_gameserver_query_secret(bigint) TO service_role;
