# push-send

Delivers Web Push messages for **platform notifications** (non-chat). Fired by
the `trigger_send_notification_push` trigger on `public.user_notifications`
(one POST per inserted notification row).

Flow: `INSERT user_notifications` -> trigger (`net.http_post`, authorized by
`system_trigger_secret`) -> this function -> look up the recipient's
`user_push_subscriptions`, honour their `app_push_notifications` setting, sign
VAPID, POST to each push endpoint, prune dead (410/404) subscriptions.

Chat/IRC/Orbit notifications are intentionally out of scope - they never touch
`user_notifications`.

## Required secrets (function env)

| Name                        | Value                                                             |
| --------------------------- | ----------------------------------------------------------------- |
| `VAPID_KEYS`                | Exported VAPID JWK pair (JSON) from the generate step below       |
| `VAPID_SUBJECT`             | `mailto:` contact, e.g. `mailto:admin@hivecom.net` (optional)     |
| `SYSTEM_TRIGGER_SECRET`     | Same value as the `system_trigger_secret` vault secret (existing) |
| `SUPABASE_URL`              | Provided by the platform                                          |
| `SUPABASE_SERVICE_ROLE_KEY` | Provided by the platform                                          |

The browser needs the matching **public** key as
`NUXT_PUBLIC_VAPID_PUBLIC_KEY` (frontend env).

## Production handover

### 1. Generate VAPID keys (once)

```sh
deno run https://raw.githubusercontent.com/negrel/webpush/master/cmd/generate-vapid-keys.ts
```

- stdout prints the JWK pair -> set as the `VAPID_KEYS` function secret.
- stderr prints `your application server key is: <key>` -> set as the frontend
  `NUXT_PUBLIC_VAPID_PUBLIC_KEY`.

### 2. Apply migrations

```sh
# applies user_push_subscriptions + the user_notifications push trigger
npx supabase migration up                 # local
# or, against production, however you currently ship migrations:
npx supabase db push
```

Migrations:

- `20260612210927_user_push_subscriptions.sql`
- `20260612211004_user_notifications_push_trigger.sql`

The trigger reuses the existing `project_url`, `anon_key`, and
`system_trigger_secret` vault secrets - no new vault secret required.

### 3. Regenerate database types

Required - the frontend references the new `user_push_subscriptions` table and
will not typecheck until this runs:

```sh
npx supabase gen types typescript --local --schema public > types/database.types.ts
```

### 4. Set function secrets and deploy

```sh
npx supabase secrets set VAPID_KEYS='<paste JWK JSON>'
npx supabase secrets set VAPID_SUBJECT='mailto:admin@hivecom.net'
# SYSTEM_TRIGGER_SECRET should already be set (used by other triggers)

npx supabase functions deploy push-send
```

`verify_jwt` stays enabled (default): the trigger sends the anon key as the
bearer token, matching the existing trigger-driven functions.

### 5. Set frontend env and ship

Set `NUXT_PUBLIC_VAPID_PUBLIC_KEY` in the site's environment, then deploy the
frontend.

### 6. Add PWA icons (recommended)

`public/manifest.json` references icons that still need to be added (generate
from `public/icon.svg`):

- `public/icon-192.png` (192x192)
- `public/icon-512.png` (512x512)
- `public/icon-maskable-512.png` (512x512, maskable - keep art inside the safe zone)

## Verify

1. Open the installed PWA, go to Settings -> General, toggle **Push
   notifications** on (grant permission). A row should appear in
   `user_push_subscriptions`.
2. Trigger a notification (e.g. have someone reply to a subscribed discussion),
   or insert a test row into `user_notifications` for your user id.
3. The push should arrive even with the app closed. Check the function logs if
   not: `npx supabase functions logs push-send`.

## Notes / future work

- The trigger fires once per recipient row (mirrors the existing per-user OS
  notification path). If notification fan-out volume grows, consider batching
  recipients into a single edge invocation.
- iOS/iPadOS only deliver push to a PWA **installed to the home screen** (16.4+),
  and the permission prompt must come from a user gesture (the Settings toggle
  and the in-sheet prompt both satisfy this).
