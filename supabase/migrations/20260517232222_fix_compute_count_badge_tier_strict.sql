-- Fix private.compute_count_badge_tier being declared STRICT.
--
-- STRICT (a.k.a. RETURNS NULL ON NULL INPUT) causes the function to
-- short-circuit and return NULL whenever ANY argument is NULL. Because every
-- caller passes NULL for p_threshold_shiny (no badge has a shiny tier for
-- count-based badges), the function always returned NULL, causing every
-- recompute_*_badge call to fall into the removal branch instead of upserting.
--
-- The fix: replace STRICT with CALLED ON NULL INPUT (the Postgres default).
-- The function body already handles NULL thresholds correctly via IS NOT NULL
-- guards, so no logic changes are needed.

create or replace function private.compute_count_badge_tier(
  p_count           integer,
  p_threshold_shiny  integer,
  p_threshold_gold   integer,
  p_threshold_silver integer,
  p_threshold_bronze integer
)
returns public.badge_tier
language sql
immutable
called on null input
as $$
  select case
    when p_threshold_shiny  is not null and p_count >= p_threshold_shiny  then 'shiny'::public.badge_tier
    when p_threshold_gold   is not null and p_count >= p_threshold_gold   then 'gold'::public.badge_tier
    when p_threshold_silver is not null and p_count >= p_threshold_silver then 'silver'::public.badge_tier
    when p_threshold_bronze is not null and p_count >= p_threshold_bronze then 'bronze'::public.badge_tier
    else null
  end
$$;
