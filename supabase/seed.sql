-- Insert RBAC roles.
INSERT INTO public.role_permissions(role, permission)
  VALUES
    -- Admin permissions - full access to all resources
('admin', 'announcements.create'),
('admin', 'announcements.delete'),
('admin', 'announcements.read'),
('admin', 'announcements.update'),
('admin', 'containers.create'),
('admin', 'containers.delete'),
('admin', 'containers.read'),
('admin', 'containers.update'),
('admin', 'events.create'),
('admin', 'events.delete'),
('admin', 'events.read'),
('admin', 'events.update'),
('admin', 'expenses.create'),
('admin', 'expenses.delete'),
('admin', 'expenses.read'),
('admin', 'expenses.update'),
('admin', 'forums.create'),
('admin', 'forums.delete'),
('admin', 'forums.read'),
('admin', 'forums.update'),
('admin', 'funding.create'),
('admin', 'funding.delete'),
('admin', 'funding.read'),
('admin', 'funding.update'),
('admin', 'games.create'),
('admin', 'games.delete'),
('admin', 'games.read'),
('admin', 'games.update'),
('admin', 'gameservers.create'),
('admin', 'gameservers.delete'),
('admin', 'gameservers.read'),
('admin', 'gameservers.update'),
('admin', 'profiles.delete'),
('admin', 'profiles.read'),
('admin', 'profiles.update'),
('admin', 'referendums.create'),
('admin', 'referendums.delete'),
('admin', 'referendums.read'),
('admin', 'referendums.update'),
('admin', 'servers.create'),
('admin', 'servers.delete'),
('admin', 'servers.read'),
('admin', 'servers.update'),
('admin', 'users.create'),
('admin', 'users.delete'),
('admin', 'users.read'),
('admin', 'users.update'),
    -- Moderator permissions - content management with delete access
('moderator', 'announcements.create'),
('moderator', 'announcements.delete'),
('moderator', 'announcements.read'),
('moderator', 'announcements.update'),
('moderator', 'events.create'),
('moderator', 'events.delete'),
('moderator', 'events.read'),
('moderator', 'events.update'),
('moderator', 'forums.create'),
('moderator', 'forums.delete'),
('moderator', 'forums.read'),
('moderator', 'forums.update'),
('moderator', 'games.create'),
('moderator', 'games.delete'),
('moderator', 'games.read'),
('moderator', 'games.update'),
('moderator', 'gameservers.create'),
('moderator', 'gameservers.delete'),
('moderator', 'gameservers.read'),
('moderator', 'gameservers.update'),
('moderator', 'referendums.create'),
('moderator', 'referendums.delete'),
('moderator', 'referendums.read'),
('moderator', 'referendums.update');

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

-- Insert an upcoming test event
INSERT INTO public.events(created_at, created_by, date, description, title, location, markdown)
  VALUES (NOW(), '018d224c-0e49-4b6d-b57a-87299605c2b1', NOW() + INTERVAL '30 days', 'Join us for our monthly gaming session!', 'Community Gaming Night', 'Voice Channels', '
# Community Gaming Night

It is that time of the month again! Join us for our community gaming night where we play various games together, chat, and have fun.

We will probably be playing on our CS2 server, but feel free to suggest other games as well.
  ');

-- Insert an ongoing test event
INSERT INTO "public"."events"("id", "created_at", "created_by", "modified_at", "modified_by", "title", "description", "note", "markdown", "date", "location", "link", "duration_minutes")
  VALUES ('11', NOW(), '018d224c-0e49-4b6d-b57a-87299605c2b1', NOW(), '018d224c-0e49-4b6d-b57a-87299605c2b1', 'Andrew Explosion', 'Andrew is placed in the explosion chamber. Bye!', 'You will want to see this one in person!', '
# Es ist Zeit!

The time has finally come to place our beloved Andrew in the communal destruction chamber.

Gather around for we will place him first in the bluff-em crush-em room before transitioning into the squisher-bisher.

## Itinerary

1. Guests arrive and are seated
2. Andrew enters and shakes hands (not everyone)
3. We wave goodbye to Andrew from a few meters away
4. Andrew enters the chamber
5. Remembrance speech and impressionist dance act
6. Andrew discovers religion
7. Break-time with tea and cake
8. Crushing time!
9. Annual shareholder meeting

## Questions?

Please keep them to yourself.

## FAQ

- Q: What are the papers saying about this?
  - A: No one gives a shit.

- Q: Will it hurt Andrew?
  - A: Probably?

- Q: Is he going to be ok?
  - A: We will see after.

- Q: What if I do not make it.
  - A: The event will be simulcast to qwer.ee just in case. You should really be there in person though. Just because.

## Refunds

There are no refunds. Why did you pay for this to begin with?', NOW(), 'TeamSpeak', 'https://ts.hivecom.net', 10080);

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

-- Insert a test server
INSERT INTO public.servers(active, address, created_at, docker_control, docker_control_secure, docker_control_port)
  VALUES (TRUE, 'host.docker.internal', NOW(), TRUE, FALSE, 54320);

-- Insert test games
INSERT INTO public.games(created_at, created_by, name, shorthand, steam_id)
  VALUES (NOW(), '018d224c-0e49-4b6d-b57a-87299605c2b1', 'Counter-Strike 2', 'cs2', 730),
(NOW(), '018d224c-0e49-4b6d-b57a-87299605c2b1', 'Garrys Mod', 'gmod', 4000);

-- Insert a test container for our gameserver
INSERT INTO public.containers(created_at, healthy, name, reported_at, running, server, started_at)
  VALUES (NOW(), TRUE, 'gameserver-cs2', NOW(), TRUE, 1, -- References the server ID we just created
    NOW() - INTERVAL '1 hour' -- Set started_at to 1 hour ago
);

-- Insert a test gameserver for CS2
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

-- Insert a test gameserver for Garrys Mod
INSERT INTO public.gameservers(addresses, created_at, created_by, description, game, name, port, region)
  VALUES (ARRAY['gmod.gameserver.hivecom.net', 'gmod.g.hivecom.net'], NOW(), '018d224c-0e49-4b6d-b57a-87299605c2b1', 'Our community Garrys Mod server for sandbox fun', 2, 'Hivecom Garrys Mod Sandbox Server', '27015', 'eu');

-- Insert a test expense
INSERT INTO public.expenses(created_at, created_by, name, description, url, amount_cents, started_at, ended_at)
  VALUES (NOW(), '018d224c-0e49-4b6d-b57a-87299605c2b1', 'Domain Fees', 'Domain registration fees', NULL, 2000, NOW() - INTERVAL '1 month', NULL);

-- Insert a monthly funding record
INSERT INTO public.monthly_funding(month, patreon_month_amount_cents, patreon_lifetime_amount_cents, patreon_count, donation_month_amount_cents, donation_lifetime_amount_cents, donation_count)
  VALUES (DATE_TRUNC('month', NOW()), 2500, 10000, 3, 5000, 20000, 1);

-- Insert a test referendum
INSERT INTO public.referendums(created_at, created_by, title, description, choices, date_start, date_end, multiple_choice)
  VALUES (NOW(), '018d224c-0e49-4b6d-b57a-87299605c2b1', 'Next Community Game Server', 'Which game should we host as our next community server? This will help us decide where to invest our resources for the best community experience.', ARRAY['Minecraft', 'Valheim', 'Rust', 'Team Fortress 2'], NOW(), NOW() + INTERVAL '14 days', FALSE);

-- Insert a test vote for the referendum
INSERT INTO public.referendum_votes(created_at, user_id, referendum_id, choices, comment)
  VALUES (NOW() + INTERVAL '1 hour', '018d224c-0e49-4b6d-b57a-87299605c2b1', 1, ARRAY[1], 'Minecraft would be fun!');

-- Insert test announcements
INSERT INTO public.announcements(created_at, created_by, title, description, markdown, pinned)
  VALUES (NOW(), '018d224c-0e49-4b6d-b57a-87299605c2b1', 'Welcome to Hivecom', 'Welcome to our gaming community platform!', '
# Welcome to Hivecom

We are excited to have you join our gaming community! This platform serves as the central hub for all our community activities, events, and server information.

## What you can do here

- **Browse Events**: Check out upcoming gaming sessions and community events
- **Game Servers**: Find and connect to our various game servers
- **Community Voting**: Participate in community decisions through our referendum system
- **Stay Updated**: Get the latest announcements and updates

Feel free to explore and don''t hesitate to reach out if you have any questions!
  ', TRUE),
(NOW() - INTERVAL '2 days', '018d224c-0e49-4b6d-b57a-87299605c2b1', 'New CS2 Server Online', 'Our new Counter-Strike 2 server is now live!', '
# New CS2 Server Online

Great news! Our brand new Counter-Strike 2 community server is now online and ready for action.

## Server Details

- **Address**: cs2.gameserver.hivecom.net
- **Port**: 27015
- **Region**: EU
- **Game Mode**: Casual

The server is configured for casual play with a friendly, welcoming environment. Whether you''re a seasoned veteran or new to CS2, everyone is welcome!

Come join us and let''s have some fun together!
  ', FALSE);

