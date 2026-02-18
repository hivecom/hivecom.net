-- Insert RBAC roles.
INSERT INTO public.role_permissions(role, permission)
VALUES
  -- Admin permissions - full access to all resources
('admin', 'announcements.create'),
('admin', 'announcements.delete'),
('admin', 'announcements.read'),
('admin', 'announcements.update'),
('admin', 'complaints.create'),
('admin', 'complaints.delete'),
('admin', 'complaints.read'),
('admin', 'complaints.update'),
('admin', 'containers.create'),
('admin', 'containers.delete'),
('admin', 'containers.read'),
('admin', 'containers.update'),
('admin', 'discussions.create'),
('admin', 'discussions.delete'),
('admin', 'discussions.read'),
('admin', 'discussions.update'),
('admin', 'discussions.manage'),
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
('admin', 'profiles.read'),
('admin', 'profiles.update'),
('admin', 'referendums.create'),
('admin', 'referendums.delete'),
('admin', 'referendums.read'),
('admin', 'referendums.update'),
('admin', 'roles.create'),
('admin', 'roles.delete'),
('admin', 'roles.read'),
('admin', 'roles.update'),
('admin', 'servers.create'),
('admin', 'servers.delete'),
('admin', 'servers.read'),
('admin', 'servers.update'),
('admin', 'users.create'),
('admin', 'users.delete'),
('admin', 'users.read'),
('admin', 'users.update'),
('admin', 'assets.create'),
('admin', 'assets.delete'),
('admin', 'assets.read'),
('admin', 'assets.update'),
  -- Moderator permissions - content management with delete access but no role management
('moderator', 'announcements.create'),
('moderator', 'announcements.delete'),
('moderator', 'announcements.read'),
('moderator', 'announcements.update'),
('moderator', 'complaints.create'),
('moderator', 'complaints.read'),
('moderator', 'complaints.update'),
('moderator', 'discussions.create'),
('moderator', 'discussions.delete'),
('moderator', 'discussions.read'),
('moderator', 'discussions.update'),
('moderator', 'events.create'),
('moderator', 'events.delete'),
('moderator', 'events.read'),
('moderator', 'events.update'),
('moderator', 'forums.create'),
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
('moderator', 'profiles.read'),
('moderator', 'profiles.update'),
('moderator', 'referendums.create'),
('moderator', 'referendums.delete'),
('moderator', 'referendums.read'),
('moderator', 'referendums.update'),
('moderator', 'roles.read'),
('moderator', 'users.create'),
('moderator', 'users.read'),
('moderator', 'users.update'),
('moderator', 'assets.create'),
('moderator', 'assets.delete'),
('moderator', 'assets.read'),
('moderator', 'assets.update')
ON CONFLICT (role, permission)
  DO NOTHING;

-- Create the storage buckets
INSERT INTO "storage"."buckets"("id", "name", "owner", "created_at", "updated_at", "public", "avif_autodetection", "file_size_limit", "allowed_mime_types", "owner_id")
VALUES
  ('hivecom-content-static', 'hivecom-content-static', NULL, '2025-04-13 21:02:43.930594+00', '2025-04-13 21:02:43.930594+00', 'true', 'false', '5242880', '{"application/json","image/*","video/*"}', NULL),
('hivecom-content-users', 'hivecom-content-users', NULL, '2025-04-13 21:02:26.456458+00', '2025-04-13 21:02:26.456458+00', 'true', 'false', '1048576', '{"image/*"}', NULL),
('hivecom-content-forums', 'hivecom-content-forums', NULL, NOW(), NOW(), 'true', 'false', '1048576', '{"application/json","image/*","video/*"}', NULL),
('hivecom-cms', 'hivecom-cms', NULL, NOW(), NOW(), 'true', 'false', '5242880', '{"image/*"}', NULL)
ON CONFLICT (id)
  DO NOTHING;

-- Insert our admin seed user.
INSERT INTO "auth"."users"("instance_id", "id", "aud", "role", "email", "encrypted_password", "email_confirmed_at", "invited_at", "confirmation_token", "confirmation_sent_at", "recovery_token", "recovery_sent_at", "email_change_token_new", "email_change", "email_change_sent_at", "last_sign_in_at", "raw_app_meta_data", "raw_user_meta_data", "is_super_admin", "created_at", "updated_at", "phone", "phone_confirmed_at", "phone_change", "phone_change_token", "phone_change_sent_at", "email_change_token_current", "email_change_confirm_status", "banned_until", "reauthentication_token", "reauthentication_sent_at", "is_sso_user", "deleted_at", "is_anonymous")
  VALUES ('00000000-0000-0000-0000-000000000000', '018d224c-0e49-4b6d-b57a-87299605c2b1', 'authenticated', 'authenticated', 'contact@hivecom.net', '$2a$10$Q6EF4VpHdLQlgwHxpUyPrewgFHmqwaw/ZTaKwuD3X8k0v4DVoMf7a', '2025-01-01 12:00:00.000000+00', NULL, '', NULL, '', NULL, '', '', NULL, NULL, '{"provider": "email", "providers": ["email"]}', '{"email_verified": true}', NULL, '2025-04-15 04:18:06.23308+00', '2025-04-15 04:18:06.237601+00', NULL, NULL, '', '', NULL, '', '0', NULL, '', NULL, 'false', NULL, 'false');

-- Create user_roles entry for admin
INSERT INTO public.user_roles(role, user_id)
  VALUES ('admin', '018d224c-0e49-4b6d-b57a-87299605c2b1');

-- Create or update a profile for our admin user
INSERT INTO public.profiles(id, created_at, username, introduction, supporter_lifetime, markdown)
  VALUES ('018d224c-0e49-4b6d-b57a-87299605c2b1', NOW(), 'Hivecom', 'Local develop and test user', 'true', '# whoami

```javascript
console.log("Hello, Hivecom!");
```

Hey there! I''m @Hivecom, the developer test account. Let''s do some Markdown testing here.

**Bold Text** and *Italic Text* are working fine.

> Blockquote text goes here.
>> Nested blockquote text goes here.
>>> Even more nested blockquote text goes here.

## Lists

### Unordered List
- Item 1
- Item 2
  - Nested item 2a
  - Nested item 2b
- Item 3

### Ordered List
1. First item
2. Second item
   1. Nested item 2.1
   2. Nested item 2.2
3. Third item

## Links and Images

[Link to Hivecom](https://hivecom.net)

![Alt text for image](https://via.placeholder.com/150)

## Code Blocks

Inline `code` example.

## Heading 2

### Heading 3

#### Heading 4

##### Heading 5

###### Heading 6')
ON CONFLICT (id)
  DO UPDATE SET
    username = EXCLUDED.username,
    introduction = EXCLUDED.introduction,
    markdown = EXCLUDED.markdown;

-- Insert example test user for admin to modify and test with
INSERT INTO "auth"."users"("instance_id", "id", "aud", "role", "email", "encrypted_password", "email_confirmed_at", "invited_at", "confirmation_token", "confirmation_sent_at", "recovery_token", "recovery_sent_at", "email_change_token_new", "email_change", "email_change_sent_at", "last_sign_in_at", "raw_app_meta_data", "raw_user_meta_data", "is_super_admin", "created_at", "updated_at", "phone", "phone_confirmed_at", "phone_change", "phone_change_token", "phone_change_sent_at", "email_change_token_current", "email_change_confirm_status", "banned_until", "reauthentication_token", "reauthentication_sent_at", "is_sso_user", "deleted_at", "is_anonymous")
  VALUES ('00000000-0000-0000-0000-000000000000', '018d224c-0e49-4b6d-b57a-87299605c2b3', 'authenticated', 'authenticated', 'testuser@example.com', '$2a$10$Q6EF4VpHdLQlgwHxpUyPrewgFHmqwaw/ZTaKwuD3X8k0v4DVoMf7a', '2025-01-01 12:00:00.000000+00', NULL, '', NULL, '', NULL, '', '', NULL, NULL, '{"provider": "email", "providers": ["email"]}', '{"email_verified": true}', NULL, '2025-04-15 04:18:06.23308+00', '2025-04-15 04:18:06.237601+00', NULL, NULL, '', '', NULL, '', '0', NULL, '', NULL, 'false', NULL, 'false');

-- Keep in mind, we're not going to assign the user a role because most users will not have a role assigned.
-- Create profile for test user
INSERT INTO public.profiles(id, created_at, username, introduction)
  VALUES ('018d224c-0e49-4b6d-b57a-87299605c2b3', NOW(), 'TestUser', 'Example user for testing admin features and role assignments')
ON CONFLICT (id)
  DO UPDATE SET
    username = EXCLUDED.username,
    introduction = EXCLUDED.introduction;

-- Create friend relationship between admin and test user
INSERT INTO public.friends(created_at, friender, friend)
  VALUES (NOW(), '018d224c-0e49-4b6d-b57a-87299605c2b3', '018d224c-0e49-4b6d-b57a-87299605c2b1');

-- Insert an upcoming test event (moved 2 weeks earlier)
INSERT INTO public.events(created_at, created_by, date, description, title, location, markdown, games)
  VALUES (NOW(), '018d224c-0e49-4b6d-b57a-87299605c2b1', NOW() + INTERVAL '16 days', 'Join us for our monthly gaming session!', 'Community Gaming Night', 'Voice Channels', '
# Community Gaming Night

It is that time of the month again! Join us for our community gaming night where we play various games together, chat, and have fun.

We will probably be playing on our CS2 server, but feel free to suggest other games as well.
  ', ARRAY[1, 2]);

-- Insert Hivecom Meetup event in Prague
INSERT INTO public.events(created_at, created_by, date, description, title, location, markdown, duration_minutes)
  VALUES (NOW(), '018d224c-0e49-4b6d-b57a-87299605c2b1', NOW() + INTERVAL '1 month', 'Epic 3-day meetup in Prague with pub crawls, LAN parties, and community bonding!', 'Hivecom Meetup - Prague', 'Prague, Czech Republic', '
# Hivecom Meetup - Prague

The moment we''ve all been waiting for! Join us for a 3-day community meetup in the beautiful city of Prague!

## What''s Planned

### Day 1 - Arrival & Pub Crawl
- **Afternoon**: Arrival and check-in at our Airbnb
- **Evening**: Classic Prague pub crawl through the historic center

### Day 2 - LAN Party
- **All Day**: LAN party at our Airbnb, followed by evening Beerio Kart sessions and drinking games.

### Day 3 - Sightseeing & Farewell
- **Morning**: Prague Castle and Old Town exploration
- **Afternoon**: Group lunch and final hangout
- **Evening**: Farewell dinner and departure preparations

## What to Bring

- Your gaming laptop/gear for the LAN party
- Comfortable walking shoes for the pub crawl
- Good vibes and readiness to have an amazing time!

## Accommodation

We''ve booked a large Airbnb that can accommodate the whole crew. The place has:
- High-speed internet perfect for gaming
- Large common areas for the LAN setup
- Multiple bedrooms and bathrooms
- Kitchen for late-night snacks

## Getting There

Prague is easily accessible by:
- **Flight**: Václav Havel Airport Prague (PRG)
- **Train**: Central Prague railway station
- **Bus**: Various bus connections from major European cities

## Cost Estimate

- Accommodation: ~€40/night per person (3 nights)
- Food & drinks: ~€50/day per person
- Activities: ~€30 total per person
- **Total estimated cost**: ~€200 per person

## RSVP

Please let us know if you''re coming so we can:
- Confirm accommodation capacity
- Plan food and drinks accordingly
- Organize group activities

Can''t wait to meet everyone in person!

## Questions?

Hit up in #events on IRC or drop me a direct message if you have any questions about the meetup!
  ', 4320);

-- Insert LAN Crossover Game Night (synced with Prague meetup day 2)
INSERT INTO public.events(created_at, created_by, date, description, title, location, markdown, duration_minutes, games)
  VALUES (NOW(), '018d224c-0e49-4b6d-b57a-87299605c2b1', NOW() + INTERVAL '1 month' + INTERVAL '1 day', 'Join the Prague crew online for an epic crossover LAN party with livestream, games, and drinks!', 'LAN Crossover Game Night', 'Online + Prague Airbnb', '
# LAN Crossover Game Night!

Tonight''s extra special - we''re crossing over with our Prague meetup crew!

## What''s Happening

The Prague gang will be hosting their LAN party at the Airbnb, and we''re all invited to join the fun online! They''ll be livestreaming the entire experience so we can hang out together virtually.

### Schedule

- **6:00 PM CET**: Stream goes live from Prague Airbnb
- **6:30 PM CET**: Multi-game session starts - join in!
- **10:00 PM CET**: Drinking games and Beerio Kart
- **Late Night**: We''ll see how things go!

## How to Join

### Online Participants
- **Discord**: Join the #lan-crossover voice channel
- **Stream**: Watch the Prague feed on our Twitch
- **Games**: The usual community staples!
- **Drinks**: BYOB for the crossover drinking games!

### Prague Crew
- You''re already sorted - just don''t forget to start the stream!

## Games We''ll Play

1. **Garrys Mod**: Probably some TTT, Prop Hunt, or Hide and Seek
2. **Counter-Strike Source**: Classic CS matches
3. **Jackbox Games**: Everyone can join with phone/browser
4. **Beerio Kart**: Synchronized drinking game madness
5. **Drinking Games**: We''ll figure this one out as we go!

## Stream Setup

The Prague crew will be streaming on:
- **Main Camera**: Overview of the LAN setup
- **Game Feed**: Direct capture of gameplay

## Questions?

Drop questions in #events or ask during the stream - the Prague crew will be monitoring chat throughout the night!
  ', 480, ARRAY[1, 2]);

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
INSERT INTO public.events(created_at, created_by, date, description, title, location, markdown, duration_minutes)
  VALUES (NOW() - INTERVAL '10 days', '018d224c-0e49-4b6d-b57a-87299605c2b1', NOW() - INTERVAL '5 days', 'Join us for a scenic 4-day hike through the beautiful Harz National Park!', 'Hike in Harz National Park', 'Harz National Park, Germany', '
# Hike in Harz National Park

Join us for an amazing 4-day hiking adventure in the Harz National Park, Germany!

## What we will explore

- Beautiful German mountain landscapes
- Dense ancient forests
- Local wildlife and nature
- Historic mining heritage sites

This will be a multi-day expedition with camping opportunities. Let me know if you have any questions or suggestions for the hike. Please also RSVP so I can plan accordingly!
  ', 5760);

-- Mark the test user as having RSVP'd to the past event
INSERT INTO public.events_rsvps(user_id, event_id, rsvp, created_at, created_by)
SELECT
  '018d224c-0e49-4b6d-b57a-87299605c2b3',
  id,
  'yes',
  NOW() - INTERVAL '6 days',
  '018d224c-0e49-4b6d-b57a-87299605c2b3'
FROM
  public.events
WHERE
  title = 'Hike in Harz National Park'
ORDER BY
  id DESC
LIMIT 1;

-- Insert a test server
INSERT INTO public.servers(active, address, created_at, docker_control, docker_control_secure, docker_control_port)
  VALUES (TRUE, 'host.docker.internal', NOW(), TRUE, FALSE, 54320);

-- Insert test games
INSERT INTO public.games(created_at, created_by, name, shorthand, steam_id)
VALUES
  (NOW(), '018d224c-0e49-4b6d-b57a-87299605c2b1', 'Counter-Strike 2', 'cs2', 730),
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
VALUES
  (NOW(), '018d224c-0e49-4b6d-b57a-87299605c2b1', 'Domain Fees', 'Domain registration fees', NULL, 100, NOW() - INTERVAL '1 month', NULL),
(NOW() - INTERVAL '1 month', '018d224c-0e49-4b6d-b57a-87299605c2b1', 'Game Server Hosting', 'Monthly server hosting fees', NULL, 5000, NOW() - INTERVAL '6 months', NULL),
(NOW() - INTERVAL '3 months', '018d224c-0e49-4b6d-b57a-87299605c2b1', 'Hivecom Supabase', 'Monthly Supabase hosting fees', NULL, 2000, NOW() - INTERVAL '3 months', NULL),
(NOW() - INTERVAL '12 months', '018d224c-0e49-4b6d-b57a-87299605c2b1', 'VPS Web Hosting', 'VPS hosting fees for Hivecom website', NULL, 3000, NOW() - INTERVAL '12 months', NOW() - INTERVAL '3 months');

-- Insert monthly funding records
INSERT INTO public.monthly_funding(month, patreon_month_amount_cents, patreon_lifetime_amount_cents, patreon_count, donation_month_amount_cents, donation_lifetime_amount_cents, donation_count)
VALUES
  (DATE_TRUNC('month', NOW()), 3000, 9000, 3, 5000, 20000, 1),
(DATE_TRUNC('month', NOW()) - INTERVAL '1 month', 2000, 6000, 2, 5000, 15000, 1),
(DATE_TRUNC('month', NOW()) - INTERVAL '2 months', 2000, 4000, 2, 0, 10000, 0),
(DATE_TRUNC('month', NOW()) - INTERVAL '3 months', 1000, 2000, 1, 0, 10000, 0),
(DATE_TRUNC('month', NOW()) - INTERVAL '4 months', 1000, 1000, 1, 10000, 10000, 1),
(DATE_TRUNC('month', NOW()) - INTERVAL '5 months', 0, 0, 0, 0, 0, 0);

-- Insert a test referendum
INSERT INTO public.referendums(created_at, created_by, title, description, choices, date_start, date_end, multiple_choice)
  VALUES (NOW(), '018d224c-0e49-4b6d-b57a-87299605c2b1', 'Next Community Game Server', 'Which game should we host as our next community server? This will help us decide where to invest our resources for the best community experience.', ARRAY['Minecraft', 'Valheim', 'Rust', 'Team Fortress 2'], NOW(), NOW() + INTERVAL '14 days', FALSE);

-- Insert a test vote for the referendum
INSERT INTO public.referendum_votes(created_at, user_id, referendum_id, choices)
  VALUES (NOW() + INTERVAL '1 hour', '018d224c-0e49-4b6d-b57a-87299605c2b1', 1, ARRAY[1]);

-- Insert default discussion topics
INSERT INTO public.discussion_topics (name, slug, description, priority, is_locked)
VALUES
  ('Announcements', 'announcements', 'Official news and updates from Hivecom.', 100, true),
  ('Events', 'events', 'Community events and gatherings.', 80, true),
  ('Projects', 'projects', 'Showcase and discussion of community projects.', 0, true),
  ('General', 'general', 'General discussion about anything and everything.', 60, false)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  priority = EXCLUDED.priority,
  is_locked = EXCLUDED.is_locked;

-- Insert forum discussions (migrated from former announcements seed data)
WITH seeded_discussions AS (
  INSERT INTO public.discussions(created_at, created_by, title, description, is_sticky, discussion_topic_id)
  SELECT
    v.created_at,
    v.created_by,
    v.title,
    v.description,
    v.is_sticky,
    dt.id
  FROM (VALUES
    (NOW(), '018d224c-0e49-4b6d-b57a-87299605c2b1'::uuid, 'Welcome to Hivecom', 'Welcome to our gaming community platform!', TRUE),
    (NOW() - INTERVAL '2 days', '018d224c-0e49-4b6d-b57a-87299605c2b1'::uuid, 'New CS2 Server Online', 'Our new Counter-Strike 2 server is now live!', FALSE)
  ) as v(created_at, created_by, title, description, is_sticky)
  CROSS JOIN public.discussion_topics dt
  WHERE dt.slug = 'announcements'
  RETURNING id, title, created_by, created_at
)
INSERT INTO public.discussion_replies(discussion_id, reply_to_id, content, meta, created_by, created_at)
SELECT
  sd.id,
  NULL,
  CASE sd.title
    WHEN 'Welcome to Hivecom' THEN '
# Welcome to Hivecom

We are excited to have you join our gaming community! This platform serves as the central hub for all our community activities, events, and server information.

## What you can do here

- **Browse Events**: Check out upcoming gaming sessions and community events
- **Game Servers**: Find and connect to our various game servers
- **Community Voting**: Participate in community decisions through our referendum system
- **Stay Updated**: Get the latest announcements and updates

Feel free to explore and don''t hesitate to reach out if you have any questions!
  '
    WHEN 'New CS2 Server Online' THEN '
# New CS2 Server Online

Great news! Our brand new Counter-Strike 2 community server is now online and ready for action.

## Server Details

- **Address**: cs2.gameserver.hivecom.net
- **Port**: 27015
- **Region**: EU
- **Game Mode**: Casual

The server is configured for casual play with a friendly, welcoming environment. Whether you''re a seasoned veteran or new to CS2, everyone is welcome!

Come join us and let''s have some fun together!
  '
  END,
  jsonb_build_object(
    'tags',
    CASE sd.title
      WHEN 'Welcome to Hivecom' THEN ARRAY['welcome', 'community', 'getting-started']
      WHEN 'New CS2 Server Online' THEN ARRAY['cs2', 'gameserver', 'gaming', 'announcement']
    END
  ),
  sd.created_by,
  sd.created_at
FROM seeded_discussions sd;

-- Insert sample MOTDs
INSERT INTO public.motds(message, created_at, created_by, modified_at, modified_by)
VALUES
  ('This is a message of the day.', NOW(), '018d224c-0e49-4b6d-b57a-87299605c2b1', NOW(), '018d224c-0e49-4b6d-b57a-87299605c2b1'),
('This is another message of the day.', NOW(), '018d224c-0e49-4b6d-b57a-87299605c2b1', NOW(), '018d224c-0e49-4b6d-b57a-87299605c2b1'),
('Jo moin Leude', NOW(), '018d224c-0e49-4b6d-b57a-87299605c2b1', NOW(), '018d224c-0e49-4b6d-b57a-87299605c2b1'),
('Message of the day', NOW(), '018d224c-0e49-4b6d-b57a-87299605c2b1', NOW(), '018d224c-0e49-4b6d-b57a-87299605c2b1'),
('You''re still here?', NOW(), '018d224c-0e49-4b6d-b57a-87299605c2b1', NOW(), '018d224c-0e49-4b6d-b57a-87299605c2b1'),
('Stay awhile and listen', NOW(), '018d224c-0e49-4b6d-b57a-87299605c2b1', NOW(), '018d224c-0e49-4b6d-b57a-87299605c2b1'),
('You''re among friends now', NOW(), '018d224c-0e49-4b6d-b57a-87299605c2b1', NOW(), '018d224c-0e49-4b6d-b57a-87299605c2b1'),
('Don''t forget to hydrate!', NOW(), '018d224c-0e49-4b6d-b57a-87299605c2b1', NOW(), '018d224c-0e49-4b6d-b57a-87299605c2b1')
ON CONFLICT
  DO NOTHING;

-- Insert test complaints
INSERT INTO public.complaints(created_at, created_by, message, response, responded_by, responded_at, acknowledged, context_user, context_gameserver)
  VALUES
  -- General complaint with no context (from TestUser)
(NOW() - INTERVAL '3 days', '018d224c-0e49-4b6d-b57a-87299605c2b3', 'I''m having trouble accessing my profile settings. The page seems to be loading indefinitely and I can''t update my information.', 'Thank you for reporting this issue. We have identified and fixed the bug affecting profile settings. Please try again and let us know if you continue to experience problems.', '018d224c-0e49-4b6d-b57a-87299605c2b1', NOW() - INTERVAL '2 days', TRUE, NULL, NULL),
  -- Complaint about a user (context_user)
(NOW() - INTERVAL '1 day', '018d224c-0e49-4b6d-b57a-87299605c2b1', 'This user was using inappropriate language and being disrespectful to other community members during our gaming session yesterday evening. They were also intentionally griefing other players.', 'Thank you for reporting this behavior. We have reviewed the situation and taken appropriate moderation action. The user has been warned and is now being monitored. Please continue to report any issues you encounter.', '018d224c-0e49-4b6d-b57a-87299605c2b1', NOW() - INTERVAL '20 hours', TRUE, '018d224c-0e49-4b6d-b57a-87299605c2b3', NULL),
  -- Complaint about a gameserver (context_gameserver) - acknowledged but not responded
(NOW() - INTERVAL '4 hours', '018d224c-0e49-4b6d-b57a-87299605c2b1', 'The CS2 server is experiencing severe performance issues. There are frequent lag spikes, players are getting disconnected randomly, and hit registration seems inconsistent. This makes the game unplayable.', NULL, NULL, NULL, TRUE, NULL, 1),
  -- New unacknowledged complaint with no context
(NOW() - INTERVAL '30 minutes', '018d224c-0e49-4b6d-b57a-87299605c2b1', 'I noticed that the community voting system seems to have a bug where my vote doesn''t get saved properly. I tried voting on the recent referendum but it keeps asking me to vote again.', NULL, NULL, NULL, FALSE, NULL, NULL);

-- Insert test projects
INSERT INTO public.projects(created_at, created_by, title, description, markdown, link, owner, tags, github)
  VALUES (NOW(), '018d224c-0e49-4b6d-b57a-87299605c2b1', 'VUI', 'The UI library that powers the Hivecom platform interface.', '
# VUI

VUI is the powerful and elegant Vue 3 component library that drives the user interface of Hivecom and other modern web applications.

It powers every aspect of the Hivecom interface:

- **Admin Dashboard**: All admin tables, forms, and management interfaces
- **Community Pages**: Project cards, event listings, and user profiles
- **Authentication**: Login forms and user management
- **Gaming Features**: Server status displays and game information

The library''s consistent design language helps create a cohesive user experience across all areas of the platform.

Give @dolanske a shout since we couldn''t have built this project without his hard work and dedication!
  ', 'https://dolanske.github.io/vui/', '018d224c-0e49-4b6d-b57a-87299605c2b1', ARRAY['vue', 'typescript', 'ui-library', 'components', 'frontend', 'open-source'], 'dolanske/vui');
