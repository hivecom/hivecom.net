# Chat (IRC / Orbit auth bridge) Setup

The website's chat (`app/components/Chat/**`, `app/composables/useIrcChat.ts`) is an
IRC-over-WebSocket client pointed at Ergo (`wss://irc.hivecom.net:8097`). It is a
deliberately disposable client layer: **[Orbit](https://github.com/hivecom/orbit-spec)** will eventually replace it as an
embeddable webapp, reusing the same server-side identity stack described here.

This document is the **server-side checklist** the website client is already
prepped for. Once these pieces are in place, no client changes are needed.

## How identity works (OIDC)

We follow the Orbit identity model ([`spec/03-identity/01-authentication.md`](https://github.com/hivecom/orbit-spec/blob/main/spec/03-identity/01-authentication.md)):

1. The website already holds a **Supabase session JWT** (Supabase is the OIDC
   provider / "Transponder").
2. On connect, the client sends `SASL PLAIN` with `username` + the **JWT as the
   password** (chunked at 400 bytes per IRCv3, which a JWT always exceeds).
3. Ergo's `auth-script` hands the credentials to a small **auth-bridge** which
   verifies the JWT against Supabase's **JWKS** and returns the account name from
   the `preferred_username` claim.
4. Guests connect via `SASL ANONYMOUS` (no account, no JWT).

Until the bridge exists, the client **gracefully falls back** to plain IRC
registration, so chat keeps working today. SASL just starts succeeding once the
server side below is configured.

## What the client already does (no further work needed)

- Negotiates IRCv3 `CAP` and requests `sasl`, `message-tags`, `server-time`,
  `multi-prefix`, `account-tag`, `account-notify`, `extended-join`,
  `draft/chathistory`.
- Sends `SASL PLAIN` (JWT) for signed-in users, `SASL ANONYMOUS` for guests.
- On SASL failure, continues unauthenticated (today's behavior).
- Requests `CHATHISTORY LATEST <channel> * 50` when `draft/chathistory` is
  advertised, and flags replayed lines as backlog.
- The JWT source is the single seam `registerIdentityProvider()` (wired in
  `app/plugins/chat.client.ts`). When Orbit becomes a cross-origin iframe, only
  that function changes (token via `postMessage`).

## Server-side checklist

### 1. Supabase: add `preferred_username` to the JWT

Supabase access tokens do **not** include `preferred_username` by default, and the
bridge rejects logins without it. Add a **Custom Access Token Hook** that injects
it from the user's Hivecom username, ensuring it is a valid IRC nick (no spaces,
no leading digit, length-bounded, unique).

- Supabase Dashboard -> Authentication -> Hooks -> Custom Access Token (or define
  it as a Postgres function / edge function).
- The hook must set `claims.preferred_username = <sanitized hivecom username>`.
- Verify with a real token: decode the `access_token` and confirm the claim is
  present and matches the username.

### 2. Deploy the auth-bridge

Use the standard Orbit `auth-bridge` (a ~50-100 line stateless JWT verifier; the
spec publishes it as a container/binary). It needs one config value:

```
OIDC_ISSUER = https://camqocmuyolpjjbnbcha.supabase.co/auth/v1
```

It fetches `/.well-known/openid-configuration` -> `jwks_uri`, caches the JWKS, and
on each `auth-script` call:

- If the password is a JWT -> verify signature/exp against the JWKS, return
  `{ success: true, accountName: <preferred_username> }`.
- Reject if `preferred_username` is missing.
- (Optional) accept plain passwords for legacy clients via the provider's ROPC
  grant - Supabase supports it but it's optional.

Expose `/healthz` and structured auth logs (see [spec "Implementation Notes"](https://github.com/hivecom/orbit-spec/blob/main/spec/03-identity/04-transponder.md#implementation-notes)).

### 3. Ergo `ircd.yaml`

```yaml
accounts:
  authentication-enabled: true
  # Delegate SASL credential checks to the bridge.
  auth-script:
    enabled: true
    command: /usr/local/bin/orbit-auth-bridge # or an HTTP shim
    args: []
    timeout: 9s
  # NickServ goes away - the OIDC provider owns accounts (see below).
  registration:
    enabled: false
  nick-reservation:
    enabled: true
    method: strict
  # Persistent presence + history for authenticated users.
  multiclient:
    enabled: true
    always-on: opt-in

server:
  ip-cloaking:
    enabled: true
  websockets:
    # The client connects with the 'binary' subprotocol on :8097.
    allowed-origins:
      - 'https://hivecom.net'
      - 'https://*.hivecom.net'

history:
  enabled: true
  persistent:
    enabled: true # required for CHATHISTORY backlog across reconnects
    # configure the MySQL store per Ergo docs

# SASL ANONYMOUS for guests (web widget):
# ensure anonymous SASL is permitted so anon-* nicks are assigned.
```

> NickServ: per the [Transponder spec](https://github.com/hivecom/orbit-spec/blob/main/spec/03-identity/04-transponder.md#nickserv-and-the-identity-provider), once the OIDC bridge is live NickServ is disabled and
> Supabase becomes the sole account authority. You said you'll handle that

### 4. Validate end-to-end (before trusting the UI)

Test the SASL path with a raw client so failures aren't hidden behind the web UI:

1. Grab a real Supabase `access_token` (e.g. from the website devtools / a signed
   in session).
2. Connect with a SASL-capable client (e.g. `irssi`/`weechat`) using:
   - user/nick = your Hivecom username
   - SASL mechanism = PLAIN
   - SASL password = the JWT
3. Confirm the bridge logs a success and Ergo sets `account-tag` to your username.
4. Reconnect and confirm `CHATHISTORY` replays recent messages.

Once that passes, the website client authenticates with zero changes - it already
sends exactly this handshake.
