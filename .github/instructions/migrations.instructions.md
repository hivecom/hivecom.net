# Migrations Instructions

- Always design with RLS: new tables must enable RLS and ship policies that mirror existing patterns. Review prior migrations for similar tables to copy policy structure. Avoid leaving tables without policies.
- Reference `types/database.types.ts` for current schema and types; keep it regenerated after schema changes (`npx supabase gen types typescript --local --schema public > types/database.types.ts`).
- Workflow: `npm run supabase db reset` to align local state, make changes, then `npm run supabase db diff -f <name>` or `npm run supabase migration new <name>` + manual SQL. Apply locally with `npx supabase migrations up` and re-run `db reset` to verify idempotence.
- Check triggers/cron expectations: consult `TRIGGERS.md` for protected-schema triggers and vault-backed secrets. Do not embed service-role keys; use vault secrets and http_post patterns already present.
- Be cautious with data migrations: write forward-safe SQL, avoid dropping columns without backfill/transition, and include `IF EXISTS`/`IF NOT EXISTS` guards where safe. Preserve audit triggers and defaults.
