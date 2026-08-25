-- send_notification_push was missed by 20260517221156_revoke_internal_function_grants.
-- It's a trigger function, so PostgREST can't call it anyway (Postgres refuses to
-- run trigger functions outside a trigger), but it's SECURITY DEFINER and reads
-- vault, so keep its grants consistent with the other internal functions.

REVOKE EXECUTE ON FUNCTION public.send_notification_push() FROM anon, authenticated;
