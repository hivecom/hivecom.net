// deno-lint-ignore-file no-explicit-any
import type { MetricsSnapshot } from "metrics-types";
import init, { Renderer } from "@takumi-rs/wasm";
import { container, text } from "@takumi-rs/helpers";

// ---------------------------------------------------------------------------
// Shared banner rendering module.
//
// This file owns everything needed to turn a MetricsSnapshot into PNG bytes:
// the WASM bootstrap, the renderer, the layout/scene, and placeholder data
// for local testing. The edge function (`index.ts`) and the local CLI
// (`cli.ts`) both import from here so the rendered output is identical
// regardless of how it is invoked.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// WASM bootstrap - runs once per isolate.
// ---------------------------------------------------------------------------
const wasmUrl = new URL(
  import.meta.resolve("@takumi-rs/wasm/takumi_wasm_bg.wasm"),
);
const wasmBytes = wasmUrl.protocol === "file:"
  ? await Deno.readFile(wasmUrl.pathname)
  : new Uint8Array(await (await fetch(wasmUrl)).arrayBuffer());
await init({ module_or_path: wasmBytes });

const renderer = new Renderer({});

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
export const BANNER_WIDTH = 600;
export const BANNER_HEIGHT = 320;
export const BANNER_PADDING = 0;

const RADIUS = 12; // outer card corner radius
const CARD_RADIUS = 8; // inner KPI card corner radius
const GRID_PADDING = 0;
const GRID_GAP = 8;
const GRID_FOOTER_GAP = 8;

const FOOTER_HEIGHT = 52;

// Explicit card dimensions derived from banner/grid constants so takumi
// doesn't have to resolve flexGrow across nested containers.
const CARD_W = (BANNER_WIDTH - GRID_PADDING * 2 - GRID_GAP) / 2; // 284
const CARD_H = (BANNER_HEIGHT - FOOTER_HEIGHT - GRID_PADDING * 2 - GRID_GAP) /
  2; // 118

const TEXT = "rgb(240, 240, 240)"; // white
const ACCENT = "rgb(167, 252, 47)"; // green  - website
const STEAM_BLUE = "rgb(59, 130, 246)"; // blue   - steam
const GAME_YELLOW = "rgb(234, 179, 8)"; // yellow - servers
const LIVE = "rgb(239, 68, 68)";       // red    - live event

const MONO_FAMILY = "Consolas, 'Courier New', monospace";

// ---------------------------------------------------------------------------
// Countdown formatter (exported so index.ts and cli.ts can use it)
// ---------------------------------------------------------------------------
export function formatCountdown(ms: number): string {
  if (ms <= 0) return "now";
  const days = Math.floor(ms / 86_400_000);
  const hours = Math.floor((ms % 86_400_000) / 3_600_000);
  const mins = Math.floor((ms % 3_600_000) / 60_000);
  if (days >= 2) return `${days}d`;
  if (days === 1) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

// ---------------------------------------------------------------------------
// Live info (top game) - shown in the footer strip
// ---------------------------------------------------------------------------
export interface LiveInfo {
  kind: "game";
  title: string;
  subtitle?: string;
}

// Footer strip with distinct background, only rendered when a game is live.
// The slot is always reserved at FOOTER_HEIGHT to prevent layout shift.
function liveFooter(info: LiveInfo) {
  const labelColor = ACCENT;
  const label = "NOW PLAYING";
  const title = info.title.length > 26
    ? info.title.slice(0, 24) + ".."
    : info.title;

  return container({
    style: {
      display: "flex",
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      width: "100%",
      height: FOOTER_HEIGHT,
      paddingLeft: 14,
      paddingRight: 14,
      backgroundColor: "#161617",
      borderRadius: RADIUS,
    },
    children: [
      text(label, {
        fontSize: 20,
        fontWeight: 700,
        color: labelColor,
      }),
      text(title, {
        fontSize: 20,
        fontWeight: 700,
        color: "#e8e8e8",
        flexGrow: 1,
      }),
      ...(info.subtitle
        ? [
          text(info.subtitle, {
            fontSize: 17,
            fontWeight: 700,
            fontFamily: MONO_FAMILY,
            color: "#e8e8e8",
          }),
        ]
        : []),
    ],
  });
}

// ---------------------------------------------------------------------------
// KPI card
// ---------------------------------------------------------------------------
function kpiCard(label: string, value: string | number, color: string) {
  return container({
    style: {
      display: "flex",
      flexDirection: "column",
      justifyContent: "space-between",
      width: CARD_W,
      height: CARD_H,
      backgroundColor: "#181819",
      borderRadius: CARD_RADIUS,
      padding: 14,
    },
    children: [
      text(label, {
        fontSize: 21,
        fontWeight: 700,
        color: "#6a6a6a",
        letterSpacing: 0.5,
      }),
      text(String(value), {
        fontSize: 38,
        fontWeight: 700,
        fontFamily: MONO_FAMILY,
        color,
      }),
    ],
  });
}

// ---------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------
export function buildScene(
  metrics: MetricsSnapshot,
  live: LiveInfo | null,
  nextEventCountdown: string | null,
  eventOngoing = false,
) {
  const steamPlayers = Object.values(metrics.users.bySteamGame).reduce(
    (a, b) => a + b,
    0,
  );

  return container({
    style: {
      display: "flex",
      flexDirection: "column",
      width: BANNER_WIDTH + BANNER_PADDING * 2,
      height: BANNER_HEIGHT + BANNER_PADDING * 2,
      padding: BANNER_PADDING,
      fontFamily: "Manrope",
    },
    children: [
      container({
        style: {
          display: "flex",
          flexDirection: "column",
          width: BANNER_WIDTH,
          height: BANNER_HEIGHT,
          gap: GRID_FOOTER_GAP,
        },
        children: [
          // 2x2 KPI grid
          container({
            style: {
              display: "flex",
              flexDirection: "column",

              padding: GRID_PADDING,
              gap: GRID_GAP,
            },
            children: [
              // Row 1
              container({
                style: {
                  display: "flex",
                  flexDirection: "row",
                  height: CARD_H,
                  gap: GRID_GAP,
                },
                children: [
                  kpiCard("Website Online", metrics.users.online, ACCENT),
                  eventOngoing
                    ? kpiCard("Next Event", "ONGOING", LIVE)
                    : kpiCard(
                      "Next Event",
                      nextEventCountdown ?? "—",
                      nextEventCountdown ? "#e8e8e8" : "#5a5a5a",
                    ),
                ],
              }),
              // Row 2
              container({
                style: {
                  display: "flex",
                  flexDirection: "row",
                  height: CARD_H,
                  gap: GRID_GAP,
                },
                children: [
                  kpiCard("In-game Steam", steamPlayers, STEAM_BLUE),
                  kpiCard(
                    "In-game Servers",
                    metrics.gameservers.players,
                    GAME_YELLOW,
                  ),
                ],
              }),
            ],
          }),
          // Footer slot - always reserved at FOOTER_HEIGHT
          ...(live
            ? [liveFooter(live)]
            : [container({ style: { width: "100%", height: FOOTER_HEIGHT } })]),
        ],
      }),
    ],
  });
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------
export function renderBanner(
  metrics: MetricsSnapshot,
  live: LiveInfo | null,
  nextEventCountdown: string | null,
  eventOngoing = false,
): Uint8Array {
  return renderer.render(
    buildScene(metrics, live, nextEventCountdown, eventOngoing) as any,
    {
      width: BANNER_WIDTH + BANNER_PADDING * 2,
      height: BANNER_HEIGHT + BANNER_PADDING * 2,
      format: "png" as const,
    },
  );
}

// ---------------------------------------------------------------------------
// Placeholder data for local testing (CLI mode)
// ---------------------------------------------------------------------------
export const PLACEHOLDER_METRICS: MetricsSnapshot = {
  collectedAt: new Date().toISOString(),
  users: {
    total: 420,
    online: 37,
    byCountry: {},
    byGame: {},
    bySteamGame: { "440": 8, "730": 5, "252490": 3 },
  },
  community: { projects: 12 },
  discussions: { total: 0, replies: 0, newTotal: 0, newReplies: 0 },
  teamspeak: { online: 14, byServer: {} },
  gameservers: { total: 6, players: 23, byServer: {} },
  storage: { buckets: {} },
};

export const PLACEHOLDER_LIVE: LiveInfo = {
  kind: "game",
  title: "Team Fortress 2",
  subtitle: "16 playing",
};
// Next upcoming event date, shaped like the `events.date` timestamp the DB
// returns. The countdown string is derived from it via `formatCountdown`,
// so the CLI exercises the same code path as the edge function.
export const PLACEHOLDER_NEXT_EVENT_DATE = new Date(
  Date.now() + 2.5 * 60 * 60 * 1000,
).toISOString();
