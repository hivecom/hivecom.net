DROP FUNCTION IF EXISTS public.get_storage_bucket_metrics(text);

CREATE FUNCTION public.get_storage_bucket_metrics(
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
  IF NOT public.authorize('assets.read'::public.app_permission) THEN
    RAISE EXCEPTION 'Insufficient permissions' USING ERRCODE = '42501';
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
