insert into public.role_permissions (role, permission)
values
  ('admin', 'events.crud'),
  ('admin', 'expenses.crud'),
  ('admin', 'funding.crud'),
  ('admin', 'games.crud'),
  ('admin', 'gameservers.crud'),
  ('admin', 'profiles.crud'),
  ('admin', 'referendums.crud'),
  ('admin', 'servers.crud'),
  ('admin', 'users.crud'),
  ('moderator', 'events.crud'),
  ('moderator', 'games.crud'),
  ('moderator', 'gameservers.crud'),
  ('moderator', 'referendums.crud');
