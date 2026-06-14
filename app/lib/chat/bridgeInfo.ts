export interface BridgeInfo {
  icon: string
  label: string
}

export function bridgeInfo(bridge: string): BridgeInfo {
  const b = bridge.toLowerCase()
  if (b === 'tele' || b === 'telegram')
    return { icon: 'ph:telegram-logo', label: 'Telegram' }
  if (b === 'cord' || b === 'discord')
    return { icon: 'ph:discord-logo', label: 'Discord' }
  return { icon: 'ph:swap', label: bridge }
}
