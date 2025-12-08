# Supabase Functions Instructions

- Deno project; use imports from `supabase/functions/deno.json` aliases (e.g., `constants`, `database-types`) instead of deep relative paths. Run `deno fmt` before committing.
- `console` is allowed here but keep logs purposeful and concise; avoid leaking secrets.
- Always validate auth/secrets: use shared helpers in `supabase/functions/_shared/**` for cron/trigger secret checks and Supabase client creation. Never hardcode service-role keys; read required secrets from Vault (see `copilot-instructions.md`).
- Prefer typed payloads: import types from `database-types` or shared schemas to avoid `any`. Validate inputs before use and return consistent error shapes.
- When adding functions, restart `npm run supabase functions serve` to register them locally. Keep handlers small; extract shared logic into `_shared` modules instead of duplicating.
