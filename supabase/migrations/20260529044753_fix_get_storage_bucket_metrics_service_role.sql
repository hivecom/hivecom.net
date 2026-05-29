-- The cron-metrics-fetch edge function calls get_storage_bucket_metrics via
-- the Supabase client initialised with the service role key. When called this
-- way the PostgREST JWT carries role=service_role, so auth.uid() is NULL and
-- the authorize() check fails with a 42501 permission error every 5 minutes.
--
-- Fix: allow callers whose JWT role is 'service_role' to bypass the permission
-- check, matching the pattern used by other internal/admin RPCs in the project.

CREATE OR REPLACE FUNCTION public.get_storage_bucket_metrics(
  p_bucket_id text
)
RETURNS TABLE (
  total_files  bigint,
  total_size   bigint,
  total_images bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  -- Service-role callers (e.g. cron edge functions) bypass the permission check.
  IF (SELECT auth.role()) <> 'service_role' THEN
    IF NOT public.authorize('assets.read'::public.app_permission) THEN
      RAISE EXCEPTION 'Insufficient permissions' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN QUERY
  SELECT
    COUNT(*)::bigint                                                        AS total_files,
    COALESCE(SUM((o.metadata ->> 'size')::bigint), 0)::bigint             AS total_size,
    COUNT(*) FILTER (
      WHERE (o.metadata ->> 'mimetype') LIKE 'image/%'
    )::bigint                                                              AS total_images
  FROM storage.objects o
  WHERE
    o.bucket_id = p_bucket_id
    AND o.id IS NOT NULL
    AND o.metadata IS NOT NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_storage_bucket_metrics(text) TO authenticated;
