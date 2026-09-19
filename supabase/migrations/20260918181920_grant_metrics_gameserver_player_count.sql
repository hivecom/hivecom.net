-- get_metrics_bucketed runs as the caller and is granted to anon, so the
-- helper it calls has to be callable by anon too. The previous migration
-- revoked it, which broke every anonymous metrics read.

GRANT EXECUTE ON FUNCTION public.metrics_gameserver_player_count(jsonb) TO anon;
