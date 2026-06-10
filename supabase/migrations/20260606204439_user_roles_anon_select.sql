CREATE POLICY "Anon can SELECT user roles"
  ON "public"."user_roles"
  AS permissive
  FOR SELECT
  TO anon
  USING (true);
