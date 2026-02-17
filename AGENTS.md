# Agents Guide: Hivecom.net

This document provides essential context for AI agents working on the Hivecom.net codebase.

## 1. Project Overview

- **Framework**: Nuxt 4 (Vue 3)
- **Backend**: Supabase (PostgreSQL, Edge Functions via Deno)
- **Language**: TypeScript (Strict mode)
- **UI Library**: `@dolanske/vui` (Internal/Custom component library)
- **State Management**: Pinia
- **Styling**: SCSS
- **Deployment**: GitHub Pages (Static/SPA hybrid)

## 2. Essential Commands

### Setup & Development

- **Install dependencies**: `npm install`
- **Start local Supabase**: `npm run supabase start` (Requires Docker)
- **Start dev server**: `npm run dev` (Starts Nuxt + Supabase if not running)
- **Start staging dev**: `npm run dev:staging` (Uses `.env.production`)

### Quality & Build

- **Lint & Typecheck**: `npm run lint` (Run this before committing)
- **Auto-fix Lint**: `npm run lint:fix`
- **Build for Production**: `npm run build` (Preset: `github_pages`)
- **Generate Static**: `npm run generate`

### Database & Functions

- **Reset Local DB**: `npm run supabase db reset` (Applies migrations & seeds)
- **Pull Remote DB**: `npm run supabase db pull`
- **New Migration**: `npm run supabase migration new <name>`
- **Generate Types**: `npx supabase gen types typescript --local --schema public,private > types/database.types.ts`
- **Serve Functions**: `npm run supabase functions serve`
- **Deploy Function**: `npm run supabase functions deploy <name>`

## 3. Code Organization

- **`app/`**: Nuxt frontend application
  - **`components/`**: Vue components (Organized by feature/domain)
  - **`composables/`**: Shared logic/state (Auto-imported)
  - **`assets/`**: SCSS styles, images
  - **`pages/`**: Route definitions (Keep logic minimal here)
  - **`layouts/`**: Page layouts
- **`supabase/`**: Backend logic
  - **`functions/`**: Deno Edge Functions
  - **`migrations/`**: SQL migration files
  - **`seed.sql`**: Initial data for local dev
- **`types/`**: Shared TypeScript definitions (Database types, models)

## 4. Development Guidelines

### Frontend (Nuxt + VUI)

- **VUI First**: Always use `@dolanske/vui` primitives (`<Flex>`, `<Button>`, `<Card>`, `<Input>`) instead of custom HTML/CSS.
- **Styling**:
  - **Avoid Custom CSS**: Use VUI props (`gap`, `align`, `justify`, `variant`) whenever possible.
  - **SCSS**: If needed, co-locate styles in the component or use `app/assets`.
  - **Global Styles**: Defined in `app/assets/index.scss` (rarely change).
- **Nuxt Patterns**:
  - Use `<script setup lang="ts">`.
  - Use auto-imported composables (`useSupabaseUser`, `useRouter`, etc.).
  - **Strict TypeScript**: No `any`. Use `database.types.ts` for data models.

### Backend (Supabase + Deno)

- **Edge Functions**:
  - written in Deno (TypeScript).
  - Use `deno.json` imports (e.g., `import { ... } from "shared/..."`).
  - **Secrets**: NEVER hardcode. Use `Deno.env.get()` and Supabase Vault secrets.
  - **Logs**: `console.log` is allowed but keep it minimal.
- **Database**:
  - **RLS (Row Level Security)**: MANDATORY for all tables.
  - **Migrations**: Always verify with `db reset` after creating migrations.
  - **Triggers**: Complex logic (e.g., sync to Discord/Steam) is handled via DB triggers calling Edge Functions. See `TRIGGERS.md`.

## 5. Testing Strategy

- **Automated Tests**: There are currently **NO** unit or E2E tests configured.
- **Verification**:
  - **Linting**: `npm run lint` is the primary automated gate.
  - **Manual Testing**: Verify changes in the local dev environment (`localhost:3000`).
  - **Type Safety**: Rely heavily on TypeScript compiler errors to catch issues.

## 6. Important Gotchas

- **Nuxt 4**: This project uses Nuxt 4 (beta/RC). Be aware of potential API differences from Nuxt 3, though mostly compatible.
- **Secrets Management**:
  - Local: `.env`
  - Production: Supabase Vault (accessed via Edge Functions or Postgres).
  - **Critical Secrets**: `anon_key`, `project_url`, `system_cron_secret` (for internal API calls).
- **Environment**:
  - Docker is required for local Supabase.
  - Deno is required for local Edge Functions development.
- **Imports**:
  - Frontend: Use `#imports` or auto-imports.
  - Edge Functions: Use Deno-style imports (URLs or `deno.json` aliases), NOT npm packages.

## 7. Workflow for Agents

1.  **Explore**: Read `app/components` to find reusable UI patterns.
2.  **Change**:
    - If modifying DB: Create migration -> Apply -> Generate Types -> Update Frontend.
    - If modifying UI: Use VUI components -> Update styles -> Check Lint.
3.  **Verify**: Run `npm run lint` and `npm run typecheck` (via `nuxi typecheck`).
