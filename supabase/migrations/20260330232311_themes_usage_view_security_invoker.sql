-- Fix theme_usage view to use security_invoker = true
--
-- By default Postgres views run as their owner (effectively SECURITY DEFINER),
-- which means RLS on the underlying tables is evaluated as the view owner
-- rather than the calling user. Recreating with security_invoker = true
-- ensures profiles RLS is applied in the caller's context instead.
--
-- In practice this is a no-op for authenticated users (their SELECT policy on
-- profiles includes OR true so they see all rows), and correctly restricts anon
-- users to only counting profiles where public = true.

DROP VIEW public.theme_usage;

CREATE VIEW public.theme_usage
  WITH (security_invoker = true)
AS
  SELECT
    theme_id,
    COUNT(*) AS user_count
  FROM public.profiles
  WHERE theme_id IS NOT NULL
  GROUP BY theme_id;

GRANT SELECT ON public.theme_usage TO anon;
GRANT SELECT ON public.theme_usage TO authenticated;
GRANT ALL   ON public.theme_usage TO service_role;
