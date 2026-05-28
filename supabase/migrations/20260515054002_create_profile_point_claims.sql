-- Creates profile_point_claims to hold unmatched donation points that can be
-- claimed later by a user whose auth email matches the donor email.
--
-- Service role writes rows (webhook). Users claim via the claim_profile_points RPC.
-- RLS grants SELECT only where the row email matches the caller's auth email.

CREATE TABLE public.profile_point_claims (
  id          bigint    GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email       text      NOT NULL,
  points      integer   NOT NULL CHECK (points > 0),
  source      public.point_source NOT NULL,
  claimed_by  uuid      REFERENCES public.profiles (id) ON DELETE SET NULL,
  claimed_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX profile_point_claims_email_idx
  ON public.profile_point_claims (email)
  WHERE claimed_at IS NULL;

CREATE INDEX profile_point_claims_claimed_by_idx
  ON public.profile_point_claims (claimed_by);

-- ─── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.profile_point_claims ENABLE ROW LEVEL SECURITY;

-- Authenticated users can view their own unclaimed and claimed rows by email
CREATE POLICY "profile_point_claims_select_own"
  ON public.profile_point_claims
  FOR SELECT
  TO authenticated
  USING (email = auth.email());

-- ─── Grants ──────────────────────────────────────────────────────────────────

GRANT SELECT ON public.profile_point_claims TO authenticated;
GRANT ALL    ON public.profile_point_claims TO service_role;
GRANT USAGE, SELECT ON SEQUENCE profile_point_claims_id_seq TO service_role;

-- ─── Claim RPC ───────────────────────────────────────────────────────────────
-- Claims all pending profile_point_claims rows matching the caller's auth email.
-- Awards points_donations to profile_points and writes a profile_point_history
-- row per claim. Returns the total points awarded.

CREATE OR REPLACE FUNCTION public.claim_profile_points()
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_user_id    uuid    := auth.uid();
  v_email      text    := auth.email();
  v_claim      RECORD;
  v_total      integer := 0;
BEGIN
  IF v_user_id IS NULL OR v_email IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Guard: caller must have a profile row (FK on profile_points requires it)
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = v_user_id
  ) THEN
    RAISE EXCEPTION 'Profile not found for user %', v_user_id;
  END IF;

  FOR v_claim IN
    SELECT id, points, source
    FROM public.profile_point_claims
    WHERE email      = v_email
      AND claimed_at IS NULL
    FOR UPDATE SKIP LOCKED
  LOOP
    -- Each claim is fully atomic: all three writes succeed or all roll back.
    -- If one claim fails, the error is logged and the loop continues.
    BEGIN
      -- Award points
      INSERT INTO public.profile_points (profile_id, points_donations)
      VALUES (v_user_id, v_claim.points)
      ON CONFLICT (profile_id) DO UPDATE
        SET points_donations = profile_points.points_donations + EXCLUDED.points_donations,
            modified_at      = now();

      -- Write history row
      INSERT INTO public.profile_point_history (profile_id, amount, source)
      VALUES (v_user_id, v_claim.points, v_claim.source);

      -- Mark claim as taken only after both above succeed
      UPDATE public.profile_point_claims
      SET claimed_by = v_user_id,
          claimed_at = now()
      WHERE id = v_claim.id;

      v_total := v_total + v_claim.points;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'claim_profile_points: failed for claim % - %', v_claim.id, SQLERRM;
    END;
  END LOOP;

  RETURN v_total;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_profile_points() TO authenticated;
