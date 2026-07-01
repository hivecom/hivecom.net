import { ref } from 'vue'

const open = ref(false)

export function useChatNavSheet() {
  return { open }
}
