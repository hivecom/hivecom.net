-- Grant depot moderation to admin only.
--
-- Depot's own admin gate is a service-operator capability: only an OIDC login
-- whose user_role claim is "admin" reaches GET /admin/files and the
-- delete-any-file path (servers.nix sets [depot.admin] values = ["admin"]).
-- The flag is binary - listing and delete are not separable server-side - so
-- granting a moderator depot.read here would be a dead permission: the depot
-- API would refuse the call regardless. Keep the client grant aligned with the
-- server: admin gets both depot.read and depot.delete; moderators get neither.
INSERT INTO public.role_permissions (role, permission)
VALUES
  ('admin', 'depot.read'),
  ('admin', 'depot.delete')
ON CONFLICT (role, permission) DO NOTHING;
