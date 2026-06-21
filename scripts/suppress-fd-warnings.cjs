// Silences a benign, noisy Node warning emitted by the dev server only:
//
//   Warning: File descriptor N opened in unmanaged mode twice
//   Warning: File descriptor N closed but not opened in unmanaged mode
//
// Root cause (not a bug in our code): Nuxt's dev SSR runs modules in a
// `tinypool` worker pool, and tinypool spawns every worker with
// `trackUnmanagedFds: true`. On those workers, Node's *own* ESM loader reads
// module source with `fs.readFileSync` (openSync/closeSync inside
// `getSourceSync`); the loader-thread FD bookkeeping miscounts those opens and
// closes and emits the warnings. The descriptors are opened AND closed
// correctly — nothing leaks — so the warnings are pure noise.
//
// Preloaded via NODE_OPTIONS=--require in the `dev` script so it also runs
// inside the worker threads (where the warnings originate); NODE_OPTIONS is
// inherited by worker threads, a nuxt.config-level patch would not reach them.
// CJS `--require` (not ESM `--import`) so the patch is installed synchronously
// before the ESM module graph is read — otherwise loading the preload itself
// emits one warning before the patch is in place.
//
// We match only the specific "unmanaged mode" message so all other warnings
// (deprecations, real leaks, etc.) still print.
const originalEmit = process.emit
process.emit = function (name, data, ...rest) {
  if (
    name === 'warning'
    && data
    && typeof data.message === 'string'
    && data.message.includes('in unmanaged mode')
  ) {
    return false
  }
  return originalEmit.call(this, name, data, ...rest)
}
