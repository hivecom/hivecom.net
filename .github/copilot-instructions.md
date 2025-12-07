# Hivecom.net Development Instructions

## Environment & Tooling

- Node/npm, Docker, Supabase CLI, and Deno required; run `npm install` then `npm run supabase link` when first setting up.
- Local env vars: set `SUPABASE_URL` and `SUPABASE_KEY` in `.env`; use `.env.production` for staging with `npm run dev:staging`.
- Supabase starts automatically with `npm run dev`; stop/start manually via `npm run supabase stop|start`.
- For edge functions, from `supabase/functions` run `deno install` and `deno fmt` before committing.

## Quality Gates

- Run `npm run lint` (eslint + typecheck) before pushing; `npm run lint:fix` for autofixes.
- Respect ESLint rules: `ts/no-explicit-any` is an error; use nullish coalescing where appropriate; `no-console` is allowed only in `supabase/functions/**`.
- TypeScript is strict; prefer typed refs/composables and avoid `any` casts.

## Frontend Guidelines (Nuxt 4 + VUI)

- Prefer VUI components from `@dolanske/vui` for layout and widgets: use `<Flex>` and other primitives instead of custom flex CSS; lean on VUI buttons, inputs, tabs, cards, alerts, spinners, etc. before adding bespoke markup.
- Avoid custom CSS/utility classes when a VUI prop or component exists; remove ad-hoc style classes in favor of VUI variants and spacing props (e.g., `gap`, `x-center`, `y-center`).
- Reuse existing local components in `app/components/**` before introducing new styles; if a pattern recurs, extract/extend a component rather than duplicating styles.
- Functionally decompose: modals, buttons-with-modals, and complex UI chunks should live in dedicated components, not page files; keep pages as thin composition shells.
- Keep SCSS minimal; if styling is unavoidable, prefer theme tokens defined by VUI and co-locate styles with the component.
- Use Nuxt conventions: `defineProps/defineEmits`, script setup, and composables from `app/composables/**`; follow existing import aliases (`@/components/...`).

## Supabase Edge Functions (Deno)

- Shared imports are defined in `supabase/functions/deno.json` (use those aliases instead of relative paths).
- Use `deno fmt` for formatting and keep `console` logs meaningful (allowed here only).
- When adding functions, restart `npm run supabase functions serve` to pick them up locally.

## Database Migrations & Types

- Keep local DB in sync: `npm run supabase db reset` then `npm run supabase db pull`.
- Create migrations with `npm run supabase migration new <name>`; apply locally via `npx supabase migrations up`.
- Generate types after schema changes: `npx supabase gen types typescript --local --schema public > types/database.types.ts`.
- Manual triggers in protected schemas are documented in `TRIGGERS.md`; ensure vault secrets are set for trigger-driven edge calls.

## Secrets & Vault

- Required Vault secrets: `anon_key`, `project_url`, `system_cron_secret`, `system_trigger_secret`, `system_discord_notification_webhook_url`.
- Edge functions that rely on cron/trigger flows must read these secrets; do not hardcode service-role keys.

## PR Checklist

- [ ] Lint and typecheck pass locally.
- [ ] VUI components used instead of custom CSS; duplicate styles removed where possible.
- [ ] New UI split into reusable components; pages kept thin.
- [ ] Supabase migrations/types updated when schema changes; triggers aligned with `TRIGGERS.md`.
- [ ] Edge functions formatted with `deno fmt`; secrets documented/consumed correctly.
