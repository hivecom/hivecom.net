CREATE OR REPLACE FUNCTION public.list_storage_objects(
  p_bucket_id   text,
  p_prefix      text    DEFAULT '',
  p_limit       integer DEFAULT 100,
  p_offset      integer DEFAULT 0,
  p_sort_col    text    DEFAULT 'updated_at',
  p_sort_order  text    DEFAULT 'desc',
  p_search      text    DEFAULT ''
)
RETURNS TABLE(
  id               uuid,
  bucket_id        text,
  name             text,
  size             bigint,
  mimetype         text,
  created_at       timestamp with time zone,
  updated_at       timestamp with time zone,
  last_accessed_at timestamp with time zone,
  total_count      bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
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
        AND (%L = '' OR o.name ILIKE '%%' || %L || '%%')
      ORDER BY %I %s
      LIMIT %s OFFSET %s
    $q$,
    p_bucket_id,
    p_prefix,
    p_prefix || '%',
    p_search,
    p_search,
    p_sort_col,
    p_sort_order,
    p_limit,
    p_offset
  );
END;
$function$;
