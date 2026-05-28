CREATE POLICY "Allow authorized roles to INSERT kvstore"
  ON kvstore
  FOR INSERT
  WITH CHECK (has_permission('kvstore.create'::app_permission));
