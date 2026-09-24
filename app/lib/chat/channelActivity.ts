// One channel's standing in the dashboard chat card: who's in it now and how
// much it said today.

export interface ChannelEntry {
  key: string
  name: string
  here: number
  messages: number
}

// A person in the channel is worth this many messages when ranking. Someone
// sitting there is a reason to join; a burst of messages from an hour ago is
// only evidence that people were.
const USER_WEIGHT = 10

export function channelScore(entry: ChannelEntry): number {
  return entry.here * USER_WEIGHT + entry.messages
}

// Half a tile fits about twenty characters, so this stays abbreviated and the
// timeframe lives in the title. "62 messages today" wraps to two lines and
// pushes the row out of line with the tile beside it.
export function channelActivity(entry: ChannelEntry): string {
  const parts: string[] = []

  if (entry.here > 0)
    parts.push(`${entry.here} user${entry.here === 1 ? '' : 's'}`)

  if (entry.messages > 0)
    parts.push(`${entry.messages} msg${entry.messages === 1 ? '' : 's'}`)

  return parts.length ? parts.join(', ') : 'quiet today'
}

export function channelActivityTitle(entry: ChannelEntry): string {
  const parts: string[] = []

  if (entry.here > 0)
    parts.push(`${entry.here} user${entry.here === 1 ? '' : 's'} here now`)

  if (entry.messages > 0)
    parts.push(`${entry.messages} message${entry.messages === 1 ? '' : 's'} today`)

  return parts.length ? parts.join(', ') : 'No messages today'
}
