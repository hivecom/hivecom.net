-- Insert RBAC roles.
INSERT INTO public.role_permissions(role, permission)
  VALUES ('admin', 'containers.crud'),
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
    username = EXCLUDED.username,
    title = EXCLUDED.title,
    subtitle = EXCLUDED.subtitle;

-- Insert a test event
INSERT INTO public.events(created_at, created_by, date, description, title, location, markdown)
  VALUES (NOW(), '018d224c-0e49-4b6d-b57a-87299605c2b1', NOW() + INTERVAL '30 days', 'Join us for our monthly gaming session!', 'Community Gaming Night', 'Voice Channels', '
# Community Gaming Night

It is that time of the month again! Join us for our community gaming night where we play various games together, chat, and have fun.

We will probably be playing on our CS2 server, but feel free to suggest other games as well.
  ');

-- Insert an expired test event
INSERT INTO public.events(created_at, created_by, date, description, title, location, markdown)
  VALUES (NOW() - INTERVAL '10 days', '018d224c-0e49-4b6d-b57a-87299605c2b1', NOW() - INTERVAL '5 days', 'Join us for a scenic hike through the beautiful Harz National Park!', 'Hike in Harz National Park', 'Harz National Park, Germany', '
# Hike in Harz National Park

Join us for an amazing hiking adventure in the Harz National Park, Germany!

## What we will explore

- Beautiful German mountain landscapes
- Dense ancient forests
- Local wildlife and nature
- Historic mining heritage sites

Let me know if you have any questions or suggestions for the hike. Please also RSVP so I can plan accordingly!
  ');

-- Insert a test game
INSERT INTO public.games(created_at, created_by, name, shorthand, steam_id)
  VALUES (NOW(), '018d224c-0e49-4b6d-b57a-87299605c2b1', 'Counter-Strike 2', 'cs2', 730);

-- Insert a test server
INSERT INTO public.servers(active, address, created_at, docker_control, docker_control_secure, docker_control_port)
  VALUES (TRUE, 'host.docker.internal', NOW(), TRUE, FALSE, 54320);

-- Insert a test container for our gameserver
INSERT INTO public.containers(created_at, healthy, name, reported_at, running, server, started_at)
  VALUES (NOW(), TRUE, 'gameserver-cs2', NOW(), TRUE, 1, -- References the server ID we just created
    NOW() - INTERVAL '1 hour' -- Set started_at to 1 hour ago
);

-- Insert a test gameserver
INSERT INTO public.gameservers(addresses, created_at, created_by, description, game, name, port, region, container, markdown)
  VALUES (ARRAY['cs2.gameserver.hivecom.net', 'cs2.g.hivecom.net'], NOW(), '018d224c-0e49-4b6d-b57a-87299605c2b1', 'Our community CS2 server for casual play', 1, -- References the game ID we just created
    'Hivecom CS2 Community Server', '27015', 'eu', 'gameserver-cs2', '
# CS 2

Welcome to the Hivecom CS2 Community Server!

This server is geared towards casual play - if you are looking for a competitive environment, ranked play is probably a better fit.

## Rules

1. Be respectful to all players.
2. No cheating or exploiting.
3. Follow the server admin instructions.
4. Have fun!
  ');

-- Insert a test expense
INSERT INTO public.expenses(created_at, created_by, name, description, url, amount_cents, started_at, ended_at)
  VALUES (NOW(), '018d224c-0e49-4b6d-b57a-87299605c2b1', 'Domain Fees', 'Domain registration fees', NULL, 2000, NOW() - INTERVAL '1 month', NULL);

-- Insert a monthly funding record
INSERT INTO public.monthly_funding(month, patreon_month_amount_cents, patreon_lifetime_amount_cents, patreon_count, donation_month_amount_cents, donation_lifetime_amount_cents, donation_count)
  VALUES (DATE_TRUNC('month', NOW()), 2500, 10000, 3, 5000, 20000, 1);

