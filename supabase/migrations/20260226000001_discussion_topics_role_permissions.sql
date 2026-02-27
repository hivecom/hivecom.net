-- Seed discussion topic permissions after enum update

INSERT INTO public.role_permissions (role, permission)
VALUES
  ('admin', 'discussion_topics.create'),
  ('admin', 'discussion_topics.read'),
  ('admin', 'discussion_topics.update'),
  ('admin', 'discussion_topics.delete')
ON CONFLICT (role, permission) DO NOTHING;
