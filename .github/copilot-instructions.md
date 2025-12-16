# Hivecom.net Development Instructions

- ALWAYS CHECK FILES FOR PROBLEMS AFTER MAKING CHANGES.
- THIS PROJECT DOES NOT USE TAILWIND. DO NOT ADD TAILWIND CLASSES.

## Environment & Tooling

- Node/npm, Docker, Supabase CLI, and Deno required; run `npm install` then `npm run supabase link` when first setting up.
- Local env vars: set `SUPABASE_URL` and `SUPABASE_KEY` in `.env`; use `.env.production` for staging with `npm run dev:staging`.
- Supabase starts automatically with `npm run dev`; stop/start manually via `npm run supabase stop|start`.
- For edge functions, from `supabase/functions` run `deno install` and `deno fmt` before committing.

## Quality Gates

- Check for problems first. Only run `npm run lint` (eslint + typecheck) before pushing; `npm run lint:fix` for autofixes.
- Respect ESLint rules: `ts/no-explicit-any` is an error; use nullish coalescing where appropriate; `no-console` is allowed only in `supabase/functions/**`.
- TypeScript is strict; prefer typed refs/composables and avoid `any` casts.
- Always check for problems after making changes.

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

## Nuances

(You can extend this section whenever you find something non-obvious that future you should know)

- VUI token quick-reference (from `@dolanske/vui@1.5.7`):
- Colors: `--color-bg`, `--color-bg-medium`, `--color-bg-raised`, `--color-bg-lowered`, `--color-text`, `--color-text-light`, `--color-text-lighter`, `--color-text-invert`, `--color-border`, `--color-border-strong`, `--color-border-weak`, `--color-accent`, `--color-text-red/green/yellow/blue`, button gray/fill variants, with light/dark palettes baked in.
- Sizes: tokens are `xxs, xs, s, m, l, xl, xxl, xxxl` (not sm/md/lg); font sizes `--font-size-xxs..xxxxl` (1.1rem–4.8rem), spaces `--space-xxs..xxxl` (4px–64px), radii `--border-radius-xs/s/m/l` (3/5/8/12px), interactive height `--interactive-el-height` (36px).
- Transitions: `--transition-fast` (.05s), `--transition` (.11s cubic-bezier(.65,0,.35,1)), `--transition-slow` (.25s).
- Z-index scale: `--z-behind`, `--z-default`, `--z-active`, `--z-mask`, `--z-sticky`, `--z-nav`, `--z-overlay`, `--z-popout`, `--z-toast`, `--z-modal`.
- Components: button variants (gray/fill/accent/success/warning/danger/link, `square|icon|outline|plain`), badge variants (neutral/info/success/warning/danger/accent, `filled|outline`), avatar sizes (s=28px, m=36px default, l=48px), modal sizes (s/m/l/screen), tabs underline styles, data-title tooltips for simple labels, `<Tooltip>` for rich content.
