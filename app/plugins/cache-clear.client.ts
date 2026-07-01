import { clearChatCache } from '@/lib/chat/bufferCache'

export default defineNuxtPlugin(() => {
  useEventListener('keydown', async (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'R') {
      e.preventDefault()
      localStorage.clear()
      await clearChatCache()
      window.location.reload()
    }
  })
})
