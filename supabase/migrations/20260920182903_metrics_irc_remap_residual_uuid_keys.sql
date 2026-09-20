-- Remap IRC channel keys the first pass couldn't reach
--
-- The derived-key migration rewrote every snapshot that existed when it ran,
-- but the collector kept writing uuid keys until its deploy landed, so the runs
-- in between were written after the rewrite and missed it. Those rows resolve
-- for nobody: the admin lookup is keyed by the derived key now, so their
-- channels fall into the charts' unresolved "Secret channels" bucket and show
-- up as an option covering a few minutes of data.
--
-- Same statements as the first pass. They're idempotent, since once no key
-- matches a lookup row id the COALESCE falls through to the existing key and
-- every row rewrites to itself, so this is safe to run again if the collector
-- ever gets rolled back and forward.

BEGIN;

WITH channel_keys AS (
  SELECT
    id::text AS old_key,
    CASE WHEN secret THEN key ELSE name END AS new_key
  FROM public.metrics_admin_irc_channels
)
UPDATE public.metrics m
SET data = jsonb_set(
  m.data,
  '{irc,byChannel}',
  (
    SELECT COALESCE(jsonb_object_agg(COALESCE(c.new_key, kv.key), kv.value), '{}'::jsonb)
    FROM jsonb_each(m.data -> 'irc' -> 'byChannel') AS kv(key, value)
    LEFT JOIN channel_keys c ON c.old_key = kv.key
  )
)
WHERE m.data -> 'irc' ? 'byChannel';

WITH channel_keys AS (
  SELECT
    id::text AS old_key,
    CASE WHEN secret THEN key ELSE name END AS new_key
  FROM public.metrics_admin_irc_channels
)
UPDATE public.metrics m
SET data = jsonb_set(
  m.data,
  '{irc,messagesByChannel}',
  (
    SELECT COALESCE(jsonb_object_agg(COALESCE(c.new_key, kv.key), kv.value), '{}'::jsonb)
    FROM jsonb_each(m.data -> 'irc' -> 'messagesByChannel') AS kv(key, value)
    LEFT JOIN channel_keys c ON c.old_key = kv.key
  )
)
WHERE m.data -> 'irc' ? 'messagesByChannel';

COMMIT;
