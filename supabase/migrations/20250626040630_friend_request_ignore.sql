-- Allow users to delete friend relationships where they are involved
-- This enables users to "ignore" friend requests by deleting the friend relationship
-- where they are the target (friend column)
CREATE POLICY "Users can delete friend relationships involving them" ON "public"."friends"
  FOR DELETE TO authenticated
    USING (friender = auth.uid()
      OR friend = auth.uid());

