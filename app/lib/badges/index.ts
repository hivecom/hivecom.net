/**
 * @/lib/badges - canonical entry point for badge utilities.
 *
 * Previously everything lived in @/lib/badges.ts (the file).
 * New code should import from here. The old .ts file re-exports from this
 * directory for backwards compatibility.
 */

export * from './catalog'
