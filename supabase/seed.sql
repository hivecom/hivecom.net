-- ─────────────────────────────────────────────────────────────────────────────
-- System themes (colorblind-friendly)
--
-- created_by IS NULL = system-owned. Service role inserts only; RLS blocks
-- regular users from mutating these rows.
--
-- Semantic color strategy per type:
--   Deuteranopia/Protanopia: red -> orange-amber, green -> teal/cyan
--   Tritanopia:              yellow -> magenta, blue -> cyan/teal
--   Achromatopsia:           all semantic colors are luminance-distinct grays
--
-- Accent uses the Hivecom brand green (#a7fc2f dark / #69883e light) across all
-- themes where green is distinguishable. Achromatopsia is the exception - the
-- accent falls back to a high-luminance gray to stay distinct from the semantic
-- green slot. Neutral backgrounds/text/borders are unchanged.
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.themes (
  id,
  created_by,
  is_official,
  name,
  description,
  spacing,
  rounding,
  transitions,
  widening,
  -- dark palette
  dark_bg, dark_bg_medium, dark_bg_raised, dark_bg_lowered,
  dark_text, dark_text_light, dark_text_lighter, dark_text_lightest, dark_text_invert,
  dark_button_gray, dark_button_gray_hover, dark_button_fill, dark_button_fill_hover,
  dark_text_red,    dark_bg_red_lowered,    dark_bg_red_raised,
  dark_text_green,  dark_bg_green_lowered,  dark_bg_green_raised,
  dark_text_yellow, dark_bg_yellow_lowered, dark_bg_yellow_raised,
  dark_text_blue,   dark_bg_blue_lowered,   dark_bg_blue_raised,
  dark_border, dark_border_strong, dark_border_weak,
  dark_accent, dark_bg_accent_lowered, dark_bg_accent_raised,
  -- light palette
  light_bg, light_bg_medium, light_bg_raised, light_bg_lowered,
  light_text, light_text_light, light_text_lighter, light_text_lightest, light_text_invert,
  light_button_gray, light_button_gray_hover, light_button_fill, light_button_fill_hover,
  light_text_red,    light_bg_red_lowered,    light_bg_red_raised,
  light_text_green,  light_bg_green_lowered,  light_bg_green_raised,
  light_text_yellow, light_bg_yellow_lowered, light_bg_yellow_raised,
  light_text_blue,   light_bg_blue_lowered,   light_bg_blue_raised,
  light_border, light_border_strong, light_border_weak,
  light_accent, light_bg_accent_lowered, light_bg_accent_raised
)
VALUES

-- ── Deuteranopia / Protanopia (red-green) ─────────────────────────────────────
-- Red slot  -> orange-amber  (distinguishable from blue/yellow for deutan/protan)
-- Green slot -> teal/cyan    (clearly distinct from the orange-amber red slot)
-- Yellow and blue slots are kept as-is (hue shift doesn't affect them).
(
  '00000000-0000-0000-0000-000000000001',
  NULL,
  TRUE,
  'Default Colorblind - Deuteranopia',
  'Colorblind-friendly theme for red-green color vision deficiency (deuteranopia / protanopia). Red is replaced with orange-amber; green is replaced with teal.',
  50, 20, 25, 0,
  -- dark neutrals (unchanged)
  '#111111', '#161616', '#1c1c1c', '#0c0c0c',
  '#e7e7e7', '#b4b4b4', '#5a5a5a', '#414141', '#111111',
  '#2e2e2e', '#262626', '#fafafa', '#d2d2d2',
  -- dark semantic: red -> orange-amber
  '#f5930a', '#5e3100', '#7a4200',
  -- dark semantic: green -> teal
  '#22d4c8', '#0a4a46', '#0d5e59',
  -- dark semantic: yellow (unchanged)
  '#ffc107', '#4e3400', '#986800',
  -- dark semantic: blue (unchanged)
  '#558df5', '#0d204a', '#1a3b77',
  -- dark borders / accent: brand green
  '#282828', '#363636', '#242424',
  '#a7fc2f', '#4e8502', '#69b103',
  -- light neutrals (unchanged)
  '#f6f6f6', '#ececec', '#dedede', '#ffffff',
  '#080808', '#404040', '#5c5c5c', '#808080', '#f8f8f8',
  '#e0e0e0', '#c6c6c6', '#0c0c0c', '#343434',
  -- light semantic: red -> orange-amber
  '#c46a00', '#7a3d00', '#d97200',
  -- light semantic: green -> teal
  '#0e9e96', '#0a5e5a', '#13817a',
  -- light semantic: yellow (unchanged)
  '#b0810f', '#e6cd89', '#fdc856',
  -- light semantic: blue (unchanged)
  '#558df5', '#c4d6ff', '#88b2ff',
  -- light borders / accent: brand green
  '#c8c8c8', '#989898', '#e0e0e0',
  '#69883e', '#93be57', '#7ea34a'
),

-- ── Tritanopia (blue-yellow) ───────────────────────────────────────────────────
-- Yellow slot -> magenta/rose  (clearly distinct from blue for tritan)
-- Blue slot   -> cyan/teal     (clearly distinct from the magenta yellow slot)
-- Red and green slots are kept as-is (tritan vision handles these well).
(
  '00000000-0000-0000-0000-000000000002',
  NULL,
  TRUE,
  'Default Colorblind - Tritanopia',
  'Colorblind-friendly theme for blue-yellow color vision deficiency (tritanopia). Yellow is replaced with magenta-rose; blue is replaced with cyan-teal.',
  50, 20, 25, 0,
  -- dark neutrals (unchanged)
  '#111111', '#161616', '#1c1c1c', '#0c0c0c',
  '#e7e7e7', '#b4b4b4', '#5a5a5a', '#414141', '#111111',
  '#2e2e2e', '#262626', '#fafafa', '#d2d2d2',
  -- dark semantic: red (unchanged)
  '#f34e46', '#681818', '#7f1d1d',
  -- dark semantic: green (unchanged)
  '#6acf30', '#285f08', '#1a7a0d',
  -- dark semantic: yellow -> magenta-rose
  '#f0429e', '#5e0a38', '#870f50',
  -- dark semantic: blue -> cyan-teal
  '#22d4c8', '#0a3d3a', '#0d5e59',
  -- dark borders / accent: brand green
  '#282828', '#363636', '#242424',
  '#a7fc2f', '#4e8502', '#69b103',
  -- light neutrals (unchanged)
  '#f6f6f6', '#ececec', '#dedede', '#ffffff',
  '#080808', '#404040', '#5c5c5c', '#808080', '#f8f8f8',
  '#e0e0e0', '#c6c6c6', '#0c0c0c', '#343434',
  -- light semantic: red (unchanged)
  '#d13c34', '#ac2d2d', '#dc2626',
  -- light semantic: green (unchanged)
  '#4da01d', '#2a7213', '#3d9223',
  -- light semantic: yellow -> magenta-rose
  '#c4186e', '#e8b4ce', '#f07ab8',
  -- light semantic: blue -> cyan-teal
  '#0e9e96', '#b0e4e2', '#7dd4d0',
  -- light borders / accent: brand green
  '#c8c8c8', '#989898', '#e0e0e0',
  '#69883e', '#93be57', '#7ea34a'
),

-- ── Achromatopsia (monochrome / total color blindness) ────────────────────────
-- All semantic slots use luminance-distinct grays so they remain
-- distinguishable without any hue information:
--   red    -> light gray  (~200)
--   green  -> medium-light gray (~155)
--   yellow -> medium gray (~115)
--   blue   -> medium-dark gray (~80)
-- Contrast ratios are kept high against the background in both palettes.
(
  '00000000-0000-0000-0000-000000000003',
  NULL,
  TRUE,
  'Default Colorblind - Achromatopsia',
  'Colorblind-friendly theme for total color blindness (achromatopsia). All semantic colors are replaced with luminance-distinct grays.',
  50, 20, 25, 0,
  -- dark neutrals (unchanged)
  '#111111', '#161616', '#1c1c1c', '#0c0c0c',
  '#e7e7e7', '#b4b4b4', '#5a5a5a', '#414141', '#111111',
  '#2e2e2e', '#262626', '#fafafa', '#d2d2d2',
  -- dark semantic: red -> light gray (~200 luminance)
  '#c8c8c8', '#444444', '#555555',
  -- dark semantic: green -> medium-light gray (~155)
  '#9b9b9b', '#333333', '#404040',
  -- dark semantic: yellow -> medium gray (~115)
  '#737373', '#2a2a2a', '#333333',
  -- dark semantic: blue -> medium-dark gray (~80)
  '#505050', '#1e1e1e', '#272727',
  -- dark borders / accent: high-luminance gray - green can't be used here since
  -- it would be indistinguishable from the semantic green slot in grayscale
  '#282828', '#363636', '#242424',
  '#e0e0e0', '#484848', '#606060',
  -- light neutrals (unchanged)
  '#f6f6f6', '#ececec', '#dedede', '#ffffff',
  '#080808', '#404040', '#5c5c5c', '#808080', '#f8f8f8',
  '#e0e0e0', '#c6c6c6', '#0c0c0c', '#343434',
  -- light semantic: red -> dark gray (~50 luminance on light bg)
  '#323232', '#686868', '#505050',
  -- light semantic: green -> medium-dark gray (~80)
  '#505050', '#848484', '#6c6c6c',
  -- light semantic: yellow -> medium gray (~110)
  '#6e6e6e', '#aaaaaa', '#909090',
  -- light semantic: blue -> medium-light gray (~145)
  '#919191', '#c8c8c8', '#b4b4b4',
  -- light borders / accent: near-black gray - same reasoning as dark palette
  '#c8c8c8', '#989898', '#e0e0e0',
  '#1e1e1e', '#9a9a9a', '#b0b0b0'
),

-- ── High Contrast ─────────────────────────────────────────────────────────────
-- Maximises luminance contrast throughout. Pure black/white backgrounds with
-- fully saturated, high-brightness semantic colors. Useful for low vision,
-- bright environments, or anyone who just wants things unambiguous.
-- Semantic choices: red=#ff3333, green=#00e060, yellow=#ffe000, blue=#3399ff
-- All chosen for >7:1 contrast ratio against the dark bg and >4.5:1 on light.
(
  '00000000-0000-0000-0000-000000000004',
  NULL,
  TRUE,
  'Default - High Contrast',
  'Maximum luminance contrast theme for low vision or bright environments. Pure black and white backgrounds with fully saturated semantic colors.',
  50, 20, 25, 0,
  -- dark neutrals: true black base, sharp borders
  '#000000', '#0a0a0a', '#141414', '#000000',
  '#ffffff', '#e0e0e0', '#aaaaaa', '#888888', '#000000',
  '#1e1e1e', '#2a2a2a', '#ffffff', '#cccccc',
  -- dark semantic: red - bright saturated red
  '#ff3333', '#660000', '#990000',
  -- dark semantic: green - bright saturated green
  '#00e060', '#003d1a', '#005c28',
  -- dark semantic: yellow - bright saturated yellow
  '#ffe000', '#4a3d00', '#6e5a00',
  -- dark semantic: blue - bright saturated blue
  '#3399ff', '#002b66', '#003d99',
  -- dark borders: high contrast borders visible against black
  '#444444', '#666666', '#333333',
  -- dark accent: brand green pushed to full brightness for maximum contrast
  '#b8ff00', '#3a6600', '#559900',
  -- light neutrals: true white base
  '#ffffff', '#f0f0f0', '#e0e0e0', '#ffffff',
  '#000000', '#1a1a1a', '#404040', '#666666', '#ffffff',
  '#d0d0d0', '#b0b0b0', '#000000', '#1a1a1a',
  -- light semantic: red - deep saturated red
  '#cc0000', '#990000', '#dd0000',
  -- light semantic: green - deep saturated green
  '#007a30', '#005522', '#009040',
  -- light semantic: yellow - deep amber (yellow on white needs darkening)
  '#8a6000', '#d4b87a', '#c49a20',
  -- light semantic: blue - deep saturated blue
  '#0055cc', '#aac4f0', '#5599ee',
  -- light borders: strong visible borders
  '#888888', '#444444', '#bbbbbb',
  -- light accent: brand green darkened for white bg contrast
  '#3d6600', '#aad96e', '#7db83d'
);

-- Insert RBAC roles.
INSERT INTO public.role_permissions(role, permission)
VALUES
  -- Admin permissions - full access to all resources
('admin', 'alerts.read'),
('admin', 'assets.create'),
('admin', 'assets.delete'),
('admin', 'assets.read'),
('admin', 'assets.update'),
('admin', 'complaints.create'),
('admin', 'complaints.delete'),
('admin', 'complaints.read'),
('admin', 'complaints.update'),
('admin', 'containers.create'),
('admin', 'containers.delete'),
('admin', 'containers.read'),
('admin', 'containers.update'),
('admin', 'discussion_topics.create'),
('admin', 'discussion_topics.delete'),
('admin', 'discussion_topics.read'),
('admin', 'discussion_topics.update'),
('admin', 'discussions.create'),
('admin', 'discussions.delete'),
('admin', 'discussions.read'),
('admin', 'discussions.update'),
('admin', 'events.create'),
('admin', 'events.delete'),
('admin', 'events.read'),
('admin', 'events.update'),
('admin', 'expenses.create'),
('admin', 'expenses.delete'),
('admin', 'expenses.read'),
('admin', 'expenses.update'),
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
('admin', 'kvstore.create'),
('admin', 'kvstore.delete'),
('admin', 'kvstore.read'),
('admin', 'kvstore.update'),
('admin', 'motds.create'),
('admin', 'motds.delete'),
('admin', 'motds.read'),
('admin', 'motds.update'),
('admin', 'profiles.delete'),
('admin', 'profiles.read'),
('admin', 'profiles.update'),
('admin', 'projects.create'),
('admin', 'projects.delete'),
('admin', 'projects.read'),
('admin', 'projects.update'),
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
  -- Moderator permissions - content management with delete access but no role management
('moderator', 'alerts.read'),
('moderator', 'assets.create'),
('moderator', 'assets.delete'),
('moderator', 'assets.read'),
('moderator', 'assets.update'),
('moderator', 'complaints.create'),
('moderator', 'complaints.read'),
('moderator', 'complaints.update'),
('moderator', 'discussion_topics.create'),
('moderator', 'discussion_topics.read'),
('moderator', 'discussion_topics.update'),
('moderator', 'discussions.create'),
('moderator', 'discussions.delete'),
('moderator', 'discussions.read'),
('moderator', 'discussions.update'),
('moderator', 'events.create'),
('moderator', 'events.delete'),
('moderator', 'events.read'),
('moderator', 'events.update'),
('moderator', 'expenses.read'),
('moderator', 'funding.read'),
('moderator', 'games.create'),
('moderator', 'games.delete'),
('moderator', 'games.read'),
('moderator', 'games.update'),
('moderator', 'gameservers.create'),
('moderator', 'gameservers.delete'),
('moderator', 'gameservers.read'),
('moderator', 'gameservers.update'),
('moderator', 'motds.create'),
('moderator', 'motds.delete'),
('moderator', 'motds.read'),
('moderator', 'motds.update'),
('moderator', 'profiles.read'),
('moderator', 'profiles.update'),
('moderator', 'projects.create'),
('moderator', 'projects.read'),
('moderator', 'projects.update'),
('moderator', 'referendums.create'),
('moderator', 'referendums.delete'),
('moderator', 'referendums.read'),
('moderator', 'referendums.update'),
('moderator', 'roles.read'),
('moderator', 'users.create'),
('moderator', 'users.read'),
('moderator', 'users.update')
ON CONFLICT (role, permission)
  DO NOTHING;

-- Create the ` buckets
INSERT INTO "storage"."buckets"("id", "name", "owner", "created_at", "updated_at", "public", "avif_autodetection", "file_size_limit", "allowed_mime_types", "owner_id")
VALUES
('hivecom-content-static', 'hivecom-content-static', NULL, '2025-04-13 21:02:43.930594+00', '2025-04-13 21:02:43.930594+00', 'true', 'false', '5242880', '{"application/json","image/*","video/*","text/csv"}', NULL),
('hivecom-content-users', 'hivecom-content-users', NULL, '2025-04-13 21:02:26.456458+00', '2025-04-13 21:02:26.456458+00', 'true', 'false', '1048576', '{"image/*"}', NULL),
('hivecom-content-forums', 'hivecom-content-forums', NULL, NOW(), NOW(), 'true', 'false', '10485760', '{"application/json","image/*","video/*","text/csv"}', NULL),
('hivecom-cms', 'hivecom-cms', NULL, NOW(), NOW(), 'true', 'false', '52428800', NULL, NULL)
ON CONFLICT (id)
  DO NOTHING;

-- Insert our admin seed user.
INSERT INTO "auth"."users"("instance_id", "id", "aud", "role", "email", "encrypted_password", "email_confirmed_at", "invited_at", "confirmation_token", "confirmation_sent_at", "recovery_token", "recovery_sent_at", "email_change_token_new", "email_change", "email_change_sent_at", "last_sign_in_at", "raw_app_meta_data", "raw_user_meta_data", "is_super_admin", "created_at", "updated_at", "phone", "phone_confirmed_at", "phone_change", "phone_change_token", "phone_change_sent_at", "email_change_token_current", "email_change_confirm_status", "banned_until", "reauthentication_token", "reauthentication_sent_at", "is_sso_user", "deleted_at", "is_anonymous")
  VALUES ('00000000-0000-0000-0000-000000000000', '018d224c-0e49-4b6d-b57a-87299605c2b1', 'authenticated', 'authenticated', 'contact@hivecom.net', '$2a$10$Q6EF4VpHdLQlgwHxpUyPrewgFHmqwaw/ZTaKwuD3X8k0v4DVoMf7a', '2025-01-01 12:00:00.000000+00', NULL, '', NULL, '', NULL, '', '', NULL, NULL, '{"provider": "email", "providers": ["email"]}', '{"email_verified": true}', NULL, '2025-04-15 04:18:06.23308+00', '2025-04-15 04:18:06.237601+00', NULL, NULL, '', '', NULL, '', '0', NULL, '', NULL, 'false', NULL, 'false');

-- Create user_roles entry for admin
INSERT INTO public.user_roles(role, user_id)
  VALUES ('admin', '018d224c-0e49-4b6d-b57a-87299605c2b1');

-- Create or update a profile for our admin user
INSERT INTO public.profiles(id, steam_id, created_at, username, introduction, supporter_lifetime, badges, markdown, public, avatar_extension)
  VALUES ('018d224c-0e49-4b6d-b57a-87299605c2b1', '76561198000000001', '2013-01-01 00:00:00+00', 'Hivecom', 'Local develop and test user', 'true', ARRAY['founder']::public.profile_badge[], '# whoami

```javascript
console.log("Hello, Hivecom!");
```

Hey there! I''m @{018d224c-0e49-4b6d-b57a-87299605c2b1}, the developer test account. Let''s do some Markdown testing here.

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

###### Heading 6

## Link Embeds

Here is a plain discussion link:

http://localhost:3000/forum/looking-for-people-to-play-cs2-with

And the same discussion but linking to a specific reply:

http://localhost:3000/forum/looking-for-people-to-play-cs2-with?comment=018d224c-0e49-4b6d-b57a-87299605c2b5

And here is a profile link (public):

http://localhost:3000/profile/018d224c-0e49-4b6d-b57a-87299605c2b1

Profile link (private):

http://localhost:3000/profile/018d224c-0e49-4b6d-b57a-87299605c2b3

And a game server link:

http://localhost:3000/servers/gameservers/1

And another:

http://localhost:3000/servers/gameservers/2

An ongoing event link:

http://localhost:3000/events/11

A future event link:

http://localhost:3000/events/1

And a community vote link:

http://localhost:3000/votes/1

A multi-choice ongoing vote:

http://localhost:3000/votes/3

A concluded vote:

http://localhost:3000/votes/4

Links that appear **inline** like [this one](http://localhost:3000/forum/looking-for-people-to-play-cs2-with) should stay as regular links and not get embedded.', true, 'jpg')
ON CONFLICT (id)
  DO UPDATE SET
    steam_id = EXCLUDED.steam_id,
    username = EXCLUDED.username,
    introduction = EXCLUDED.introduction,
    badges = EXCLUDED.badges,
    markdown = EXCLUDED.markdown,
    public = EXCLUDED.public,
    avatar_extension = EXCLUDED.avatar_extension;

-- The audit trigger (update_profiles_audit_fields) always resets created_at = OLD.created_at on
-- any UPDATE, so ON CONFLICT DO UPDATE cannot change it. Bypass the trigger temporarily to force
-- the 2013 member-since date for the Hivecom seed account.
ALTER TABLE public.profiles DISABLE TRIGGER update_profiles_audit_fields;
UPDATE public.profiles SET created_at = '2013-01-01 00:00:00+00' WHERE id = '018d224c-0e49-4b6d-b57a-87299605c2b1';
ALTER TABLE public.profiles ENABLE TRIGGER update_profiles_audit_fields;

-- Seed a Steam presence entry for Hivecom (current game + last app)
INSERT INTO public.presences_steam(
  profile_id,
  status,
  last_online_at,
  last_app_id,
  last_app_name,
  current_app_id,
  current_app_name,
  updated_at,
  fetched_at,
  visibility,
  steam_name,
  details
)
VALUES (
  '018d224c-0e49-4b6d-b57a-87299605c2b1',
  'away',
  NOW() - INTERVAL '20 minutes',
  4000,
  'Garrys Mod',
  NULL,
  NULL,
  NOW(),
  NOW(),
  'public',
  'Hivecom',
  '{}'::jsonb
)
ON CONFLICT (profile_id)
  DO UPDATE SET
    status = EXCLUDED.status,
    last_online_at = EXCLUDED.last_online_at,
    last_app_id = EXCLUDED.last_app_id,
    last_app_name = EXCLUDED.last_app_name,
    current_app_id = EXCLUDED.current_app_id,
    current_app_name = EXCLUDED.current_app_name,
    updated_at = EXCLUDED.updated_at,
    fetched_at = EXCLUDED.fetched_at,
    visibility = EXCLUDED.visibility,
    steam_name = EXCLUDED.steam_name,
    details = EXCLUDED.details;

-- Insert example test user for admin to modify and test with
INSERT INTO "auth"."users"("instance_id", "id", "aud", "role", "email", "encrypted_password", "email_confirmed_at", "invited_at", "confirmation_token", "confirmation_sent_at", "recovery_token", "recovery_sent_at", "email_change_token_new", "email_change", "email_change_sent_at", "last_sign_in_at", "raw_app_meta_data", "raw_user_meta_data", "is_super_admin", "created_at", "updated_at", "phone", "phone_confirmed_at", "phone_change", "phone_change_token", "phone_change_sent_at", "email_change_token_current", "email_change_confirm_status", "banned_until", "reauthentication_token", "reauthentication_sent_at", "is_sso_user", "deleted_at", "is_anonymous")
  VALUES ('00000000-0000-0000-0000-000000000000', '018d224c-0e49-4b6d-b57a-87299605c2b3', 'authenticated', 'authenticated', 'testuser@example.com', '$2a$10$Q6EF4VpHdLQlgwHxpUyPrewgFHmqwaw/ZTaKwuD3X8k0v4DVoMf7a', '2025-01-01 12:00:00.000000+00', NULL, '', NULL, '', NULL, '', '', NULL, NULL, '{"provider": "email", "providers": ["email"]}', '{"email_verified": true}', NULL, '2025-04-15 04:18:06.23308+00', '2025-04-15 04:18:06.237601+00', NULL, NULL, '', '', NULL, '', '0', NULL, '', NULL, 'false', NULL, 'false');

-- Keep in mind, we're not going to assign the user a role because most users will not have a role assigned.
-- Create profile for test user
INSERT INTO public.profiles(id, steam_id, created_at, username, introduction, rich_presence_enabled, supporter_patreon)
  VALUES ('018d224c-0e49-4b6d-b57a-87299605c2b3', '76561198000000002', NOW(), 'TestUser', 'Example user for testing admin features and role assignments', TRUE, TRUE)
ON CONFLICT (id)
  DO UPDATE SET
    steam_id = EXCLUDED.steam_id,
    username = EXCLUDED.username,
    introduction = EXCLUDED.introduction,
    rich_presence_enabled = EXCLUDED.rich_presence_enabled,
    supporter_patreon = EXCLUDED.supporter_patreon;

-- Seed a Steam presence entry for TestUser (not currently playing)
INSERT INTO public.presences_steam(
  profile_id,
  status,
  last_online_at,
  last_app_id,
  last_app_name,
  current_app_id,
  current_app_name,
  updated_at,
  fetched_at,
  visibility,
  steam_name,
  details
)
VALUES (
  '018d224c-0e49-4b6d-b57a-87299605c2b3',
  'online',
  NOW(),
  730,
  'Counter-Strike 2',
  730,
  'Counter-Strike 2',
  NOW(),
  NOW(),
  'public',
  'TestUser',
  '{}'::jsonb
)
ON CONFLICT (profile_id)
  DO UPDATE SET
    status = EXCLUDED.status,
    last_online_at = EXCLUDED.last_online_at,
    last_app_id = EXCLUDED.last_app_id,
    last_app_name = EXCLUDED.last_app_name,
    current_app_id = EXCLUDED.current_app_id,
    current_app_name = EXCLUDED.current_app_name,
    updated_at = EXCLUDED.updated_at,
    fetched_at = EXCLUDED.fetched_at,
    visibility = EXCLUDED.visibility,
    steam_name = EXCLUDED.steam_name,
    details = EXCLUDED.details;

-- Insert BirthdayUser - a test account whose birthday is set to today.
INSERT INTO "auth"."users"("instance_id", "id", "aud", "role", "email", "encrypted_password", "email_confirmed_at", "invited_at", "confirmation_token", "confirmation_sent_at", "recovery_token", "recovery_sent_at", "email_change_token_new", "email_change", "email_change_sent_at", "last_sign_in_at", "raw_app_meta_data", "raw_user_meta_data", "is_super_admin", "created_at", "updated_at", "phone", "phone_confirmed_at", "phone_change", "phone_change_token", "phone_change_sent_at", "email_change_token_current", "email_change_confirm_status", "banned_until", "reauthentication_token", "reauthentication_sent_at", "is_sso_user", "deleted_at", "is_anonymous")
  VALUES ('00000000-0000-0000-0000-000000000000', '018d224c-0e49-4b6d-b57a-87299605c2b4', 'authenticated', 'authenticated', 'birthdayuser@example.com', '$2a$10$Q6EF4VpHdLQlgwHxpUyPrewgFHmqwaw/ZTaKwuD3X8k0v4DVoMf7a', '2025-01-01 12:00:00.000000+00', NULL, '', NULL, '', NULL, '', '', NULL, NULL, '{"provider": "email", "providers": ["email"]}', '{"email_verified": true}', NULL, NOW(), NOW(), NULL, NULL, '', '', NULL, '', '0', NULL, '', NULL, 'false', NULL, 'false');

-- Create profile for BirthdayUser with birthday set to today
INSERT INTO public.profiles(id, created_at, username, introduction, birthday)
  VALUES ('018d224c-0e49-4b6d-b57a-87299605c2b4', NOW(), 'BirthdayUser', 'Test account whose birthday is always today.', CURRENT_DATE)
ON CONFLICT (id)
  DO UPDATE SET
    username = EXCLUDED.username,
    introduction = EXCLUDED.introduction,
    birthday = EXCLUDED.birthday;

-- Insert an upcoming test event (moved 2 weeks earlier)
INSERT INTO public.events(created_at, created_by, date, description, title, location, markdown, games)
  VALUES (NOW(), '018d224c-0e49-4b6d-b57a-87299605c2b1', NOW() + INTERVAL '16 days', 'Join us for our monthly gaming session!', 'Community Gaming Night', 'Voice Channels', '
It is that time of the month again! Join us for our community gaming night where we play various games together, chat, and have fun.

We will probably be playing on our CS2 server, but feel free to suggest other games as well.
  ', ARRAY[1, 2]);

-- Insert Hivecom Meetup event in Prague
INSERT INTO public.events(created_at, created_by, date, description, title, location, markdown, duration_minutes)
  VALUES (NOW(), '018d224c-0e49-4b6d-b57a-87299605c2b1', NOW() + INTERVAL '1 month', 'Epic 3-day meetup in Prague with pub crawls, LAN parties, and community bonding!', 'Hivecom Meetup - Prague', 'Prague, Czech Republic', '
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
INSERT INTO public.servers(active, address, created_at, docker_control, docker_control_secure, docker_control_port, accessible, last_accessed)
  VALUES (TRUE, 'host.docker.internal', NOW(), TRUE, FALSE, 54320, TRUE, NOW());

-- Insert test games
INSERT INTO public.games(created_at, created_by, name, shorthand, steam_id)
VALUES
  (NOW(), '018d224c-0e49-4b6d-b57a-87299605c2b1', 'Counter-Strike 2', 'cs2', 730),
  (NOW(), '018d224c-0e49-4b6d-b57a-87299605c2b1', 'Garrys Mod', 'gmod', 4000),
  (NOW(), '018d224c-0e49-4b6d-b57a-87299605c2b1', 'Minecraft', 'minecraft', NULL);

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

-- Insert a test gameserver for Minecraft
INSERT INTO public.gameservers(addresses, created_at, created_by, description, game, name, port, region)
  VALUES (ARRAY['mc.g.hivecom.net'], NOW(), '018d224c-0e49-4b6d-b57a-87299605c2b1', 'Our community Minecraft survival server', 3, 'Hivecom Minecraft Survival', '25565', 'eu');

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

-- Insert a public referendum from Hivecom
INSERT INTO public.referendums(created_at, created_by, title, description, choices, date_start, date_end, multiple_choice, is_public)
  VALUES (NOW(), '018d224c-0e49-4b6d-b57a-87299605c2b1', 'Next Community Game Server', 'Which game should we host as our next community server? This will help us decide where to invest our resources for the best community experience.', ARRAY['Minecraft', 'Valheim', 'Rust', 'Team Fortress 2'], NOW(), NOW() + INTERVAL '14 days', FALSE, TRUE);

-- Insert a private referendum from TestUser
INSERT INTO public.referendums(created_at, created_by, title, description, choices, date_start, date_end, multiple_choice, is_public)
  VALUES (NOW(), '018d224c-0e49-4b6d-b57a-87299605c2b3', 'Movie Night Pick', 'Hey everyone, which movie should we watch this Friday? Drop your vote!', ARRAY['Interstellar', 'In Brugges', 'Bo Burnham: Inside'], NOW(), NOW() + INTERVAL '3 days', FALSE, FALSE);

-- Insert a multi-choice ongoing referendum from Hivecom
INSERT INTO public.referendums(created_at, created_by, title, description, choices, date_start, date_end, multiple_choice, is_public)
  VALUES (NOW(), '018d224c-0e49-4b6d-b57a-87299605c2b1', 'Community Event Activities', 'Which activities should we include at the next community event? Pick all that apply!', ARRAY['Big Hike', 'Movie Night', 'Andrew Explosion Chamber', '69 Challenge', 'Soap Hiding'], NOW(), NOW() + INTERVAL '10 days', TRUE, TRUE);

-- Insert a concluded referendum from Hivecom
INSERT INTO public.referendums(created_at, created_by, title, description, choices, date_start, date_end, multiple_choice, is_public)
  VALUES (NOW() - INTERVAL '30 days', '018d224c-0e49-4b6d-b57a-87299605c2b1', 'Community Name Vote', 'What should we call our weekly community meetup?', ARRAY['Andy and the Boys', 'Hivecome', 'Unfit and Stinky Podcast', 'Hangout'], NOW() - INTERVAL '30 days', NOW() - INTERVAL '16 days', FALSE, TRUE);

-- Insert votes on the concluded referendum
INSERT INTO public.referendum_votes(created_at, user_id, referendum_id, choices)
  SELECT NOW() - INTERVAL '20 days', '018d224c-0e49-4b6d-b57a-87299605c2b1', id, ARRAY[2]
  FROM public.referendums WHERE title = 'Community Name Vote';

INSERT INTO public.referendum_votes(created_at, user_id, referendum_id, choices)
  SELECT NOW() - INTERVAL '22 days', '018d224c-0e49-4b6d-b57a-87299605c2b3', id, ARRAY[0]
  FROM public.referendums WHERE title = 'Community Name Vote';

-- Insert a test vote on the public referendum from Hivecom
INSERT INTO public.referendum_votes(created_at, user_id, referendum_id, choices)
  SELECT NOW() + INTERVAL '1 hour', '018d224c-0e49-4b6d-b57a-87299605c2b1', id, ARRAY[1]
  FROM public.referendums
  WHERE title = 'Next Community Game Server';

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
INSERT INTO public.discussions(created_at, created_by, title, slug, description, markdown, is_sticky, discussion_topic_id)
SELECT
  v.created_at,
  v.created_by,
  v.title,
  v.slug,
  v.description,
  v.markdown,
  v.is_sticky,
  dt.id
FROM (VALUES
  (
    NOW(),
    '018d224c-0e49-4b6d-b57a-87299605c2b1'::uuid,
    'Welcome to Hivecom',
    'welcome-to-hivecom',
    'Welcome to our gaming community platform!',
    '
We are excited to have you join our gaming community! This platform serves as the central hub for all our community activities, events, and server information.

## What you can do here

- **Browse Events**: Check out upcoming gaming sessions and community events
- **Game Servers**: Find and connect to our various game servers
- **Community Voting**: Participate in community decisions through our referendum system
- **Stay Updated**: Get the latest announcements and updates

Feel free to explore and don''t hesitate to reach out if you have any questions!
    ',
    TRUE
  ),
  (
    NOW() - INTERVAL '2 days',
    '018d224c-0e49-4b6d-b57a-87299605c2b1'::uuid,
    'New CS2 Server Online',
    'new-cs2-server-online',
    'Our new Counter-Strike 2 server is now live!',
    '
Great news! Our brand new Counter-Strike 2 community server is now online and ready for action.

## Server Details

- **Address**: cs2.gameserver.hivecom.net
- **Port**: 27015
- **Region**: EU
- **Game Mode**: Casual

The server is configured for casual play with a friendly, welcoming environment. Whether you''re a seasoned veteran or new to CS2, everyone is welcome!

Come join us and let''s have some fun together!
    ',
    FALSE
  )
) as v(created_at, created_by, title, slug, description, markdown, is_sticky)
CROSS JOIN public.discussion_topics dt
WHERE dt.slug = 'announcements';

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

-- Insert a discussion by TestUser in the General topic, with a reply mentioning the Hivecom user.
-- The auto-subscribe triggers will subscribe TestUser on discussion create.
-- The mention trigger will create a notification for the Hivecom user.
INSERT INTO public.discussions(created_at, created_by, title, slug, description, markdown, is_sticky, discussion_topic_id)
SELECT
  NOW() - INTERVAL '1 hour',
  '018d224c-0e49-4b6d-b57a-87299605c2b3'::uuid,
  'Looking for people to play CS2 with',
  'looking-for-people-to-play-cs2-with',
  'Anyone down for some casual CS2 this weekend?',
  'Hey everyone! I just joined and I''m looking for some people to queue up with this weekend on the community server. I''m not the best player but I''m here to have fun. Let me know if you''re interested!',
  FALSE,
  dt.id
FROM public.discussion_topics dt
WHERE dt.slug = 'general'
;

-- TestUser replies to their own discussion and mentions the Hivecom admin user.
-- This fires both the subscription fan-out trigger (no-op for TestUser since
-- they are already subscribed) and the mention notification trigger which will
-- create a notification for the Hivecom user.
INSERT INTO public.discussion_replies(id, created_at, created_by, discussion_id, markdown)
SELECT
  '018d224c-0e49-4b6d-b57a-87299605c2b5'::uuid,
  NOW() - INTERVAL '30 minutes',
  '018d224c-0e49-4b6d-b57a-87299605c2b3'::uuid,
  d.id,
  'Hey @{018d224c-0e49-4b6d-b57a-87299605c2b1} do you know if the CS2 server will be up this weekend? Would love to get a few games in!'
FROM public.discussions d
WHERE d.slug = 'looking-for-people-to-play-cs2-with';

-- TestUser replies on Hivecom's profile discussion.
-- This tests the profile discussion subscription flow - Hivecom is subscribed
-- to their own profile discussion and should receive a notification.
INSERT INTO public.discussion_replies(created_at, created_by, discussion_id, markdown)
SELECT
  NOW() - INTERVAL '15 minutes',
  '018d224c-0e49-4b6d-b57a-87299605c2b3'::uuid,
  d.id,
  'Hey @{018d224c-0e49-4b6d-b57a-87299605c2b1}, love your profile! Really cool setup you have here.'
FROM public.discussions d
WHERE d.profile_id = '018d224c-0e49-4b6d-b57a-87299605c2b1'::uuid;

-- Insert test projects
INSERT INTO public.projects(created_at, created_by, title, description, markdown, link, owner, tags, github)
  VALUES (NOW(), '018d224c-0e49-4b6d-b57a-87299605c2b1', 'VUI', 'The UI library that powers the Hivecom platform interface.', '
VUI is the powerful and elegant Vue 3 component library that drives the user interface of Hivecom and other modern web applications.

It powers every aspect of the Hivecom interface:

- **Admin Dashboard**: All admin tables, forms, and management interfaces
- **Community Pages**: Project cards, event listings, and user profiles
- **Authentication**: Login forms and user management
- **Gaming Features**: Server status displays and game information

The library''s consistent design language helps create a cohesive user experience across all areas of the platform.

Give @dolanske a shout since we couldn''t have built this project without his hard work and dedication!
  ', 'https://dolanske.github.io/vui/', '018d224c-0e49-4b6d-b57a-87299605c2b1', ARRAY['vue', 'typescript', 'ui-library', 'components', 'frontend', 'open-source'], 'dolanske/vui');
