-- Fix system theme scale values to match the VUI-default DB values defined in
-- app/lib/theme.ts SCALE_CONFIGS:
--   spacing:     defaultDb = (100-25)/(250-25)*100 = 33.333... -> 33
--   rounding:    defaultDb = (100-0)/(500-0)*100   = 20
--   transitions: defaultDb = (100-0)/(400-0)*100   = 25
--   widening:    defaultDb = 0                     -> 0 (already correct)
--
-- All four system themes (created_by IS NULL) were stored with the column
-- default of 50, which maps to non-default scale values.
UPDATE public.themes
SET
  spacing     = 33,
  rounding    = 20,
  transitions = 25,
  widening    = 0
WHERE created_by IS NULL;
