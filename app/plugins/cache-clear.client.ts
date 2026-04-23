export default defineNuxtPlugin(() => {
  useEventListener('keydown', (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'R') {
      e.preventDefault()
      localStorage.clear()
      window.location.reload()
    }
  })
})
