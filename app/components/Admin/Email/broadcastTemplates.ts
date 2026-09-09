/**
 * Starting points for the broadcast composer. Picking one fills the subject and
 * the editor, then the admin edits from there. Anything in square brackets is a
 * placeholder that has to be replaced before sending.
 *
 * The subject is rendered as the heading at the top of the email, so the bodies
 * here start at the second level and never repeat the subject.
 */
export interface BroadcastTemplate {
  id: string
  name: string
  description: string
  subject: string
  markdown: string
}

export const BROADCAST_TEMPLATES: BroadcastTemplate[] = [
  {
    id: 'announcement',
    name: 'Community announcement',
    description: 'Blank skeleton for general news.',
    subject: '[Short headline]',
    markdown: `## What's happening

[One or two sentences on the news itself. Lead with the part people care about.]

[The detail: dates, what changes, what anyone needs to do about it. Link out if there's more to read.]

The Hivecom team
`,
  },
  {
    id: 'legal-update',
    name: 'Terms & Privacy update',
    description: 'Notice that the terms and privacy policy changed.',
    subject: 'We\'ve updated our Terms and Privacy Policy',
    markdown: `We've updated the Hivecom Terms of Service and Privacy Policy. The new versions take effect on [DATE].

## What changed

- [Change one]
- [Change two]
- [Change three]

You can read both in full at [hivecom.net/legal/terms](https://hivecom.net/legal/terms) and [hivecom.net/legal/privacy](https://hivecom.net/legal/privacy).

If you keep using Hivecom after [DATE], you're accepting the updated versions. Anything you want to ask about them, write to [contact@hivecom.net](mailto:contact@hivecom.net).

The Hivecom team
`,
  },
]
