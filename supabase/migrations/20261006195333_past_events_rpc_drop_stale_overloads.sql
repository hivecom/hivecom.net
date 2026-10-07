-- Each earlier signature change used CREATE OR REPLACE, which adds an overload
-- instead of replacing the function. PostgREST can't choose between them when a
-- caller omits the newer filters, so only the p_game_ids versions stay.

DROP FUNCTION IF EXISTS public.get_past_events_count();
DROP FUNCTION IF EXISTS public.get_past_events_count(text, boolean);
DROP FUNCTION IF EXISTS public.get_past_events_count(text, boolean, boolean);
DROP FUNCTION IF EXISTS public.get_past_events_count(text, boolean, boolean, bigint);

DROP FUNCTION IF EXISTS public.get_past_events_paginated(integer, integer);
DROP FUNCTION IF EXISTS public.get_past_events_paginated(integer, integer, text, boolean);
DROP FUNCTION IF EXISTS public.get_past_events_paginated(integer, integer, text, boolean, boolean);
DROP FUNCTION IF EXISTS public.get_past_events_paginated(integer, integer, text, boolean, boolean, bigint);
