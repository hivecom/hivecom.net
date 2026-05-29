-- discussion_replies sees frequent soft-deletes (is_deleted) causing dead tuple
-- accumulation. Lower autovacuum thresholds to trigger well before the 20% default.
ALTER TABLE public.discussion_replies SET (
  autovacuum_vacuum_scale_factor = 0.10,
  autovacuum_analyze_scale_factor = 0.05
);
