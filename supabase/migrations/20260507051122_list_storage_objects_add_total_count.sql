DROP FUNCTION IF EXISTS public.list_storage_objects(text, text, int, int, text, text);

CREATE FUNCTION public.list_storage_objects(
  p_bucket_id  text,
  p_prefix     text    DEFAULT '',
  p_limit      int     DEFAULT 100,
  p_offset     int     DEFAULT 0,
  p_sort_col   text    DEFAULT 'updated_at',
  p_sort_order text    DEFAULT 'desc'
)
RETURNS TABLE (
  id               uuid,
  bucket_id        text,
  name             text,
  size             bigint,
  mimetype         text,
  created_at       timestamptz,
  updated_at       timestamptz,
  last_accessed_at timestamptz,
  total_count      bigint
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

  IF p_sort_col NOT IN ('name', 'updated_at', 'created_at', 'size') THEN
    RAISE EXCEPTION 'Invalid sort column: %', p_sort_col;
  END IF;

  IF p_sort_order NOT IN ('asc', 'desc') THEN
    RAISE EXCEPTION 'Invalid sort order: %', p_sort_order;
  END IF;

  RETURN QUERY EXECUTE format(
    $q$
      SELECT
        o.id,
        o.bucket_id,
        o.name,
        (o.metadata ->> 'size')::bigint          AS size,
        (o.metadata ->> 'mimetype')::text         AS mimetype,
        o.created_at,
        o.updated_at,
        o.last_accessed_at,
        COUNT(*) OVER ()                          AS total_count
      FROM storage.objects o
      WHERE
        o.bucket_id = %L
        AND o.id IS NOT NULL
        AND o.metadata IS NOT NULL
        AND (%L = '' OR o.name LIKE %L)
      ORDER BY %I %s
      LIMIT %s OFFSET %s
    $q$,
    p_bucket_id,
    p_prefix,
    p_prefix || '%',
    p_sort_col,
    p_sort_order,
    p_limit,
    p_offset
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_storage_objects(text, text, int, int, text, text)
  TO authenticated;
