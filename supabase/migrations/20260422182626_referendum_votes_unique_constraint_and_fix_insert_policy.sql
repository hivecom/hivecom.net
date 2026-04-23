-- Clean up any existing duplicate votes, keeping only the latest per user per referendum
DELETE FROM referendum_votes
WHERE id NOT IN (
  SELECT DISTINCT ON (referendum_id, user_id) id
  FROM referendum_votes
  ORDER BY referendum_id, user_id, created_at DESC
);

-- Add unique constraint to prevent duplicate votes per user per referendum
ALTER TABLE referendum_votes
  ADD CONSTRAINT referendum_votes_referendum_id_user_id_key UNIQUE (referendum_id, user_id);

-- Fix the INSERT policy: the old policy required referendums.create permission,
-- which only admins/moderators have - regular users could never cast a vote.
-- Replace it with a policy that allows any authenticated, non-banned user to
-- insert a vote row that belongs to themselves.
DROP POLICY "Authorized users can INSERT votes" ON referendum_votes;

CREATE POLICY "Authenticated users can INSERT their own vote"
  ON referendum_votes
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND is_not_banned()
    AND user_id = auth.uid()
  );
