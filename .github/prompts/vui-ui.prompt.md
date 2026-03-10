# VUI UI Guardrails (use before any UI change)

You are modifying UI in Hivecom. Follow these rules:

## VUI-first

- Prefer `@dolanske/vui` components (`Flex`, `Grid`, `Card`, `Button`, `Input`, `Tabs`, `Modal`, `Alert`, `Spinner`, etc.) instead of custom layout markup.
- Replace layout-only CSS with VUI props (`gap`, `x-center`, `y-center`, `x-between`, `wrap`, `expand`, `column`) wherever possible.

## Styling & Tokens

- Use VUI theme tokens and CSS variables (e.g., `--space-*`, `--color-*`, `--font-size-*`, `--border-radius-*`).
- Keep SCSS minimal and component-scoped; avoid global styles unless required.
- Avoid inline styles for layout sizing unless strictly necessary.

## Consistency & DRY

- Reuse existing components from `app/components/**` before creating new structures.
- If a UI pattern repeats, extract a component instead of duplicating markup/styles.

## Constraints

- This project does NOT use Tailwind. Do not add Tailwind classes.
- Respect Nuxt conventions (`<script setup>`, `defineProps`, `defineEmits`, composables in `app/composables/**`).

## Final check

- Verify UI changes align with VUI patterns and tokens, with minimal custom CSS.
