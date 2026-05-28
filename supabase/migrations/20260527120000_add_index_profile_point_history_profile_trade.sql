-- Add partial index on profile_point_history.profile_trade (nullable FK).
-- Without this, ON DELETE SET NULL on profiles does a full sequential scan as the
-- ledger grows. Also supports admin "trade transactions by user" queries.

CREATE INDEX IF NOT EXISTS idx_profile_point_history_profile_trade
  ON public.profile_point_history (profile_trade)
  WHERE profile_trade IS NOT NULL;
