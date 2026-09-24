// Renders <outDir>/status.png from placeholder data, with no Supabase or network.
//
//   deno run -A cli.ts [outDir]           # live (placeholder game/event)
//   deno run -A cli.ts [outDir] --idle    # idle (no live info, no footer)
//   deno run -A cli.ts [outDir] --ongoing # event ongoing (Next Event card)
import {
  BANNER_HEIGHT,
  BANNER_WIDTH,
  formatCountdown,
  PLACEHOLDER_LIVE,
  PLACEHOLDER_METRICS,
  PLACEHOLDER_NEXT_EVENT_DATE,
  renderBanner,
} from "./banner.ts";

const args = Deno.args.filter((a) => !a.startsWith("--"));
const idle = Deno.args.includes("--idle");
const ongoing = Deno.args.includes("--ongoing");
const outDir = args[0] ?? ".";

const live = idle ? null : PLACEHOLDER_LIVE;
// Derive the countdown the same way the edge function does: from a DB-shaped
// event date. Idle mode has no planned event.
const nextEventCountdown = idle ? null : formatCountdown(
  new Date(PLACEHOLDER_NEXT_EVENT_DATE).getTime() - Date.now(),
);
const png = renderBanner(
  PLACEHOLDER_METRICS,
  live,
  nextEventCountdown,
  ongoing,
);
const outPath = `${outDir}/status.png`;

await Deno.writeFile(outPath, png);

console.log(
  `Rendered ${BANNER_WIDTH}x${BANNER_HEIGHT} banner (${
    idle ? "idle" : "live"
  }):`,
);
console.log(`  ${outPath} (${png.byteLength}b)`);
