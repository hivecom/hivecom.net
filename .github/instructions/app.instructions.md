# App (Nuxt) Instructions

- Use VUI first: prefer `@dolanske/vui` primitives (`<Flex>`, buttons, inputs, tabs, cards, alerts, spinners, tables) over custom elements or utility classes. Remove bespoke flex/grid CSS when a VUI prop (`gap`, `x-center`, `y-center`, `wrap`, `align`, `justify`) covers it.
- Reuse existing components under `app/components/**`; if a pattern recurs (button+modal, card layout, list item), extract/extend a component rather than restyling per page. Keep page files thin composition shells.
- Keep SCSS minimal and co-located. Reach for theme tokens/variants before adding ad-hoc classes; avoid new global styles unless absolutely necessary.
- Follow Nuxt conventions: `<script setup>`, `defineProps/defineEmits`, composables from `app/composables/**`, and alias imports (`@/components/...`, `@/lib/...`).
- TypeScript is strict: no `any` (ESLint enforces), prefer typed refs/composables, and use nullish coalescing where relevant.
- Avoid console usage in the app; favor toasts/alerts or error boundaries. Keep accessibility in mind (labels, aria where needed) and ensure SSR-safe code (guard on `process.client`).
