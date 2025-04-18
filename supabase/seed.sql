-- Insert RBAC roles.
INSERT INTO public.role_permissions(role, permission)
  VALUES ('admin', 'events.crud'),
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

-- Create the storage buckets
INSERT INTO "storage"."buckets"("id", "name", "owner", "created_at", "updated_at", "public", "avif_autodetection", "file_size_limit", "allowed_mime_types", "owner_id")
  VALUES ('hivecom-content-static', 'hivecom-content-static', NULL, '2025-04-13 21:02:43.930594+00', '2025-04-13 21:02:43.930594+00', 'true', 'false', '1048576', '{"image/*"}', NULL),
('hivecom-content-users', 'hivecom-content-users', NULL, '2025-04-13 21:02:26.456458+00', '2025-04-13 21:02:26.456458+00', 'true', 'false', '1048576', '{"image/*"}', NULL);

-- Insert our admin seed user.
INSERT INTO "auth"."users"("instance_id", "id", "aud", "role", "email", "encrypted_password", "email_confirmed_at", "invited_at", "confirmation_token", "confirmation_sent_at", "recovery_token", "recovery_sent_at", "email_change_token_new", "email_change", "email_change_sent_at", "last_sign_in_at", "raw_app_meta_data", "raw_user_meta_data", "is_super_admin", "created_at", "updated_at", "phone", "phone_confirmed_at", "phone_change", "phone_change_token", "phone_change_sent_at", "email_change_token_current", "email_change_confirm_status", "banned_until", "reauthentication_token", "reauthentication_sent_at", "is_sso_user", "deleted_at", "is_anonymous")
  VALUES ('00000000-0000-0000-0000-000000000000', '018d224c-0e49-4b6d-b57a-87299605c2b1', 'authenticated', 'authenticated', 'contact@hivecom.net', '$2a$10$Q6EF4VpHdLQlgwHxpUyPrewgFHmqwaw/ZTaKwuD3X8k0v4DVoMf7a', '2025-01-01 12:00:00.000000+00', NULL, '', NULL, '', NULL, '', '', NULL, NULL, '{"provider": "email", "providers": ["email"]}', '{"email_verified": true}', NULL, '2025-04-15 04:18:06.23308+00', '2025-04-15 04:18:06.237601+00', NULL, NULL, '', '', NULL, '', '0', NULL, '', NULL, 'false', NULL, 'false');

-- Create user_roles entry for admin
INSERT INTO public.user_roles(role, user_id)
  VALUES ('admin', '018d224c-0e49-4b6d-b57a-87299605c2b1');

-- Create or update a profile for our admin user
INSERT INTO public.profiles(id, created_at, username, title, subtitle)
  VALUES ('018d224c-0e49-4b6d-b57a-87299605c2b1', NOW(), 'Hivecom', 'Hivecom Administrator', 'System administrator')
ON CONFLICT (id)
  DO UPDATE SET
    title = EXCLUDED.title,
    subtitle = EXCLUDED.subtitle;

-- Insert a test event
INSERT INTO public.events(created_at, created_by, date, description, title, location)
  VALUES (NOW(), '018d224c-0e49-4b6d-b57a-87299605c2b1', '2025-05-01 18:00:00.000000+00', 'Join us for our monthly gaming session!', 'May Community Gaming Night', 'Discord');

-- Insert a test game
INSERT INTO public.games(created_at, created_by, name, shorthand, steam_id)
  VALUES (NOW(), '018d224c-0e49-4b6d-b57a-87299605c2b1', 'Counter-Strike 2', 'CS2', 730);

-- Insert a test server
INSERT INTO public.servers(active, address, created_at)
  VALUES (TRUE, 'server.hivecom.net', NOW());

-- Insert a test gameserver_container
INSERT INTO public.containers(created_at, healthy, name, reported_at, running, server, uptime)
  VALUES (NOW(), TRUE, 'gameserver-cs2', NOW(), TRUE, 1, -- References the server ID we just created
    3600 -- 1 hour uptime
);

-- Insert a test gameserver
INSERT INTO public.gameservers(addresses, created_at, created_by, description, game, name, port, region, container)
  VALUES (ARRAY['cs2.gameserver.hivecom.net', 'cs2.g.hivecom.net'], NOW(), '018d224c-0e49-4b6d-b57a-87299605c2b1', 'Our community CS2 server for casual play', 1, -- References the game ID we just created
    'Hivecom CS2 Community Server', '27015', 'eu', 'gameserver-cs2' -- References the container name we just created
);

