// One channel's standing in the dashboard's chat card: who is in it now, and
// how much it said today. The card and its sheet both rank and label channels,
// so the shared shape and its two label forms live here rather than in whoever
// happened to need them first.

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

// Second line per channel. Whichever half is zero drops out, and a channel with
// neither says so rather than printing two zeroes. Half a tile is around twenty
// characters, so messages are abbreviated and the timeframe is left to the
// title: a busy channel spelling out "62 messages today" wrapped to two lines
// and pushed its row out of line with the tile beside it.
export function channelActivity(entry: ChannelEntry): string {
  const parts: string[] = []

  if (entry.here > 0)
    parts.push(`${entry.here} user${entry.here === 1 ? '' : 's'}`)

  if (entry.messages > 0)
    parts.push(`${entry.messages} msg${entry.messages === 1 ? '' : 's'}`)

  return parts.length ? parts.join(', ') : 'quiet today'
}

// The abbreviated line on hover, spelled out.
export function channelActivityTitle(entry: ChannelEntry): string {
  const parts: string[] = []

  if (entry.here > 0)
    parts.push(`${entry.here} user${entry.here === 1 ? '' : 's'} here now`)

  if (entry.messages > 0)
    parts.push(`${entry.messages} message${entry.messages === 1 ? '' : 's'} today`)

  return parts.length ? parts.join(', ') : 'No messages today'
}
