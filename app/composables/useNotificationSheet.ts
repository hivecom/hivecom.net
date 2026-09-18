export type NotificationSheetTab = 'active' | 'past' | 'subscriptions'

/**
 * Open state and active tab of the notification sheet in the nav. Shared
 * `useState` so any surface can open it onto a specific tab, the same way the
 * external link modal is driven from wherever the click happened.
 */
export function useNotificationSheet() {
  const open = useState('notification-sheet-open', () => false)
  const activeTab = useState<NotificationSheetTab>('notification-sheet-tab', () => 'active')

  function openTo(tab: NotificationSheetTab) {
    activeTab.value = tab
    open.value = true
  }

  return { open, activeTab, openTo }
}
