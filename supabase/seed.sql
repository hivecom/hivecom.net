insert into public.role_permissions (role, permission)
values
  ('admin', 'events.crud'),
  ('admin', 'games.crud'),
  ('admin', 'gameservers.crud'),
  ('admin', 'links.crud'),
  ('admin', 'profiles.crud'),
  ('admin', 'users.crud'),
  ('moderator', 'events.crud'),
  ('moderator', 'games.crud'),
  ('moderator', 'gameservers.crud'),
  ('moderator', 'links.crud');
