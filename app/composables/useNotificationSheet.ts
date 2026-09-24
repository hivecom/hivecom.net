export type NotificationSheetTab = 'active' | 'past' | 'subscriptions'

// Shared useState so any surface can open the nav's notification sheet on a tab.
export function useNotificationSheet() {
  const open = useState('notification-sheet-open', () => false)
  const activeTab = useState<NotificationSheetTab>('notification-sheet-tab', () => 'active')

  function openTo(tab: NotificationSheetTab) {
    activeTab.value = tab
    open.value = true
  }

  return { open, activeTab, openTo }
}
