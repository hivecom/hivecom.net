# Zed AI Rules Setup (VUI UI guardrails)

This project requires VUI-first UI changes. In Zed, set up a reusable rule so you can apply the guardrails with a slash command each time UI is modified.

## Create the rule (one-time setup)

1. Open the Agent Panel.
2. Open **Rules…** (three-dot menu → Rules, or run `agent: open rules library`).
3. Create a new rule named `vui-ui`.
4. Paste the contents of:
   `.github/prompts/vui-ui.prompt.md`

## Use it for every UI change

- **Text Threads:** run `/prompt vui-ui` before you ask for UI changes.
- **Agent Panel:** type `@vui-ui` at the top of your request (slash commands only work in Text Threads).

## Keep in sync

If `.github/prompts/vui-ui.prompt.md` changes, update the Zed rule to match.
