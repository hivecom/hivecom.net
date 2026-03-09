#!/usr/bin/env node
/**
 * VUI Frontend Check Hook
 *
 * Triggered as a PreToolUse hook before file-editing tools run.
 * If the target file(s) are Vue, HTML, CSS, or SCSS files, injects a
 * system message reminding the agent to follow the VUI design-system rules
 * for this project.
 *
 * Receives JSON on stdin (tool name + tool_input from the agent runtime).
 * Outputs JSON on stdout (systemMessage) when a frontend file is detected.
 */

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { raw += chunk; });
process.stdin.on('end', () => {
  try {
    const data = JSON.parse(raw);
    const input = data.tool_input ?? {};

    // Collect all file paths referenced by the tool invocation.
    const paths = [];

    if (typeof input.filePath === 'string') paths.push(input.filePath);
    if (typeof input.path === 'string') paths.push(input.path);

    // multi_replace_string_in_file passes an array of replacements
    if (Array.isArray(input.replacements)) {
      for (const r of input.replacements) {
        if (typeof r?.filePath === 'string') paths.push(r.filePath);
      }
    }

    const isFrontend = paths.some(p => /\.(vue|html|css|scss|sass|less)$/i.test(p));

    if (isFrontend) {
      process.stdout.write(JSON.stringify({
        systemMessage: [
          'VUI FRONTEND RULES — apply before making any changes to this file:',
          '',
          '1. CSS values: use VUI CSS custom properties (--color-*, --space-*, --font-size-*,',
          '   --border-radius-*, --transition*, --z-*, etc.) instead of raw/hardcoded values.',
          '2. Components first: before writing new markup or CSS, verify whether an existing',
          '   VUI component (<Flex>, <Stack>, Button, Badge, Avatar, Modal, Tabs, Tooltip, …)',
          '   or one of its props/variants already covers the requirement.',
          '3. Check VUI source: https://github.com/dolanske/vui — confirm component APIs,',
          '   available variants, and CSS variable names before referencing them.',
          '4. No Tailwind: do NOT add Tailwind utility classes.',
          '5. No ad-hoc utilities: do NOT invent one-off helper classes when a VUI prop or',
          '   variant already exists.',
          '6. Size tokens: use xxs/xs/s/m/l/xl/xxl/xxxl — not sm/md/lg.',
        ].join('\n'),
      }));
    }
  } catch {
    // Ignore malformed input — non-zero exit would surface as a warning.
  }

  process.exit(0);
});
