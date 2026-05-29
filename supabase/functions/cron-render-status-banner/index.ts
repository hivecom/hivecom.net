// deno-lint-ignore-file no-explicit-any
import { createClient } from "@supabase/supabase-js";
import type { Database } from "database-types";
import type { MetricsSnapshot } from "metrics-types";
import constants from "constants" with { type: "json" };
import init, { Renderer } from "@takumi-rs/wasm";
import { container, image, text } from "@takumi-rs/helpers";

import { authorizeSystemCron } from "../_shared/auth.ts";

// ---------------------------------------------------------------------------
// One-time module init: load WASM and construct the renderer once per
// isolate so subsequent invocations skip the (expensive) WASM bootstrap.
//
// Supabase edge-runtime does not resolve the wasm-bindgen default relative
// fetch, so we explicitly load the .wasm bytes via the npm package's exported
// asset path and hand them to init().
// ---------------------------------------------------------------------------
const wasmUrl = new URL(
  import.meta.resolve("@takumi-rs/wasm/takumi_wasm_bg.wasm"),
);
const wasmBytes = wasmUrl.protocol === "file:"
  ? await Deno.readFile(wasmUrl.pathname)
  : new Uint8Array(await (await fetch(wasmUrl)).arrayBuffer());
await init({ module_or_path: wasmBytes });

// ---------------------------------------------------------------------------
// Logo: inlined SVG encoded to bytes and registered as a persistent image so
// the renderer can cache the decoded pixels across invocations.
// ---------------------------------------------------------------------------
const LOGO_SVG = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">
<svg width="100%" height="100%" viewBox="0 0 137 32" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xml:space="preserve" xmlns:serif="http://www.serif.com/" style="fill-rule:evenodd;clip-rule:evenodd;stroke-linejoin:round;stroke-miterlimit:2;">
    <path d="M58.35,10.5L62.25,10.5L62.25,21L58.35,21L58.35,17.4L52.2,17.4L52.2,21L48.3,21L48.3,10.5L52.2,10.5L52.2,14.1L58.35,14.1L58.35,10.5Z" style="fill:rgb(167,252,47);fill-rule:nonzero;"/>
    <rect x="62.846" y="10.5" width="3.9" height="10.5" style="fill:rgb(167,252,47);fill-rule:nonzero;"/>
    <path d="M77.393,10.5L81.683,10.5L77.333,21L71.543,21L67.193,10.5L71.483,10.5L74.438,18.3L77.393,10.5Z" style="fill:rgb(167,252,47);fill-rule:nonzero;"/>
    <path d="M93.091,13.5L85.891,13.5L85.891,14.475L93.091,14.475L93.091,17.025L85.891,17.025L85.891,18L93.091,18L93.091,21L81.991,21L81.991,10.5L93.091,10.5L93.091,13.5Z" style="fill:rgb(167,252,47);fill-rule:nonzero;"/>
    <path d="M93.384,15.735C93.384,12.09 95.364,10.35 99.984,10.35C104.184,10.35 106.374,11.82 106.539,15.135L102.549,15.135C102.399,14.145 101.634,13.65 99.984,13.65C97.674,13.65 97.284,14.625 97.284,15.735C97.284,16.86 97.689,17.85 99.984,17.85C101.634,17.85 102.399,17.34 102.549,16.335L106.539,16.335C106.374,19.665 104.199,21.15 99.984,21.15C95.364,21.15 93.384,19.395 93.384,15.735Z" style="fill:rgb(167,252,47);fill-rule:nonzero;"/>
    <path d="M113.446,21.15C108.826,21.15 106.846,19.395 106.846,15.735C106.846,12.09 108.826,10.35 113.446,10.35C118.051,10.35 120.046,12.105 120.046,15.735C120.046,19.38 118.051,21.15 113.446,21.15ZM113.446,17.85C115.741,17.85 116.146,16.845 116.146,15.735C116.146,14.64 115.756,13.65 113.446,13.65C111.136,13.65 110.746,14.625 110.746,15.735C110.746,16.86 111.151,17.85 113.446,17.85Z" style="fill:rgb(167,252,47);fill-rule:nonzero;"/>
    <path d="M136.582,10.5L136.582,21L132.682,21L132.682,16.005L129.817,21L127.267,21L124.402,16.005L124.402,21L120.502,21L120.502,10.5L125.302,10.5L128.542,16.5L131.782,10.5L136.582,10.5Z" style="fill:rgb(167,252,47);fill-rule:nonzero;"/>
    <path d="M0,6C0,2.686 2.686,0 6,0L26,0C29.314,0 32,2.686 32,6L32,26C32,29.314 29.314,32 26,32L6,32C2.686,32 0,29.314 0,26L0,6Z" style="fill:rgb(167,252,47);fill-rule:nonzero;"/>
    <path d="M21,10L23.88,10L23.88,21.2L21,21.2L21,16.816L11.88,16.816L11.88,21.2L9,21.2L9,10L11.88,10L11.88,14.384L21,14.384L21,10Z" style="fill-rule:nonzero;"/>
</svg>`;

const renderer = new Renderer({
  persistentImages: [
    {
      src: "logo",
      data: new TextEncoder().encode(LOGO_SVG),
    },
  ],
});

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const BANNER_WIDTH = 1200;
const BANNER_HEIGHT = 360;
const LEFT_WIDTH = 500;
const RIGHT_WIDTH = BANNER_WIDTH - LEFT_WIDTH;
const RADIUS = 12;
const ACCENT = "rgb(167, 252, 47)";
const METRICS_BUCKET = "hivecom-content-static";
const METRICS_OBJECT = "metrics/latest.json";
const BANNER_OBJECT = "banners/status.png";

// ---------------------------------------------------------------------------
// History extraction helpers
// ---------------------------------------------------------------------------
interface HistorySeries {
  membersOnline: number[];
  teamspeakOnline: number[];
  gameServers: number[];
  playersInGame: number[];
}

function extractSeries(rows: Record<string, unknown>[]): HistorySeries {
  const num = (row: Record<string, unknown>, key: string): number =>
    typeof row[key] === "number" ? (row[key] as number) : 0;

  return {
    membersOnline: rows.map((r) => num(r, "users_online")),
    teamspeakOnline: rows.map((r) => num(r, "teamspeak_online")),
    gameServers: rows.map((r) => num(r, "gameservers_total")),
    playersInGame: rows.map((r) => num(r, "gameservers_players")),
  };
}

// ---------------------------------------------------------------------------
// Live info (active event or top game)
// ---------------------------------------------------------------------------
interface LiveInfo {
  kind: "event" | "game";
  title: string;
  subtitle?: string; // e.g. player count for game, nothing for event
}

function livePill(info: LiveInfo) {
  const isEvent = info.kind === "event";
  const dotColor = isEvent ? "rgb(239, 68, 68)" : ACCENT;
  const label = isEvent ? "LIVE EVENT" : "NOW PLAYING";

  return container({
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 6,
      marginTop: 24,
    },
    children: [
      // Label row with dot
      container({
        style: {
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
        },
        children: [
          container({
            style: {
              width: 7,
              height: 7,
              borderRadius: 4,
              backgroundColor: dotColor,
            },
          }),
          text(label, {
            fontSize: 11,
            color: dotColor,
            letterSpacing: 1,
          }),
        ],
      }),
      // Title (truncate long names)
      text(
        info.title.length > 28 ? info.title.slice(0, 26) + ".." : info.title,
        {
          fontSize: 15,
          fontWeight: 700,
          color: "#d0d0d0",
        },
      ),
      ...(info.subtitle
        ? [
          text(info.subtitle, {
            fontSize: 13,
            fontWeight: 700,
            color: "#5a5a5a",
          }),
        ]
        : []),
    ],
  });
}

// ---------------------------------------------------------------------------
// Layout helpers
// ---------------------------------------------------------------------------

// Bar width + gap that fits CHART_W pixels for BAR_COUNT bars.
const BAR_COUNT = 20;
const CHART_W = 140;
const CHART_H = 28;
const BAR_GAP = 2;
const BAR_W = Math.floor((CHART_W - BAR_GAP * (BAR_COUNT - 1)) / BAR_COUNT);

function miniBarChart(values: number[], color: string) {
  const slice = values.slice(-BAR_COUNT);
  // Pad left with zeros if fewer samples than BAR_COUNT
  const bars = Array.from(
    { length: BAR_COUNT },
    (_, i) => slice[i - (BAR_COUNT - slice.length)] ?? 0,
  );
  const max = Math.max(1, ...bars);

  return container({
    style: {
      display: "flex",
      flexDirection: "row",
      alignItems: "flex-end",
      gap: BAR_GAP,
      width: CHART_W,
      height: CHART_H,
    },
    children: bars.map((v) =>
      container({
        style: {
          width: BAR_W,
          height: Math.max(3, Math.round((v / max) * CHART_H)),
          backgroundColor: color,
          borderRadius: 2,
          opacity: v === 0 ? 0.15 : 1,
        },
      })
    ),
  });
}

function statRow(
  label: string,
  value: string | number,
  series: number[],
  color: string,
  last: boolean,
) {
  return container({
    style: {
      display: "flex",
      flexDirection: "row",
      alignItems: "center",
      width: "100%",
      paddingTop: 10,
      paddingBottom: 10,
      borderBottomWidth: last ? 0 : 1,
      borderBottomStyle: "solid",
      borderBottomColor: "#2a2a2a",
      gap: 16,
    },
    children: [
      text(label, {
        fontSize: 20,
        fontWeight: 700,
        color: "#a0a0a0",
        flexGrow: 1,
      }),
      miniBarChart(series, color),
      text(String(value), {
        fontSize: 26,
        fontWeight: 700,
        color,
        width: 56,
        textAlign: "right",
      }),
    ],
  });
}

function buildScene(
  metrics: MetricsSnapshot,
  history: HistorySeries,
  live: LiveInfo | null,
) {
  const updated = new Date(metrics.collectedAt).toUTCString();

  return container({
    style: {
      display: "flex",
      flexDirection: "row",
      width: BANNER_WIDTH,
      height: BANNER_HEIGHT,
      fontFamily: "Manrope",
    },
    children: [
      // Left: branding panel
      container({
        style: {
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          alignItems: "flex-start",
          width: LEFT_WIDTH,
          height: BANNER_HEIGHT,
          paddingLeft: 40,
          paddingRight: 40,
          paddingTop: 40,
          paddingBottom: 40,
          backgroundColor: "#161617",
          borderTopLeftRadius: RADIUS,
          borderBottomLeftRadius: RADIUS,
        },
        children: [
          // Logo SVG
          image({
            src: "logo",
            width: 411,
            height: 96,
            style: { objectFit: "contain" },
          }),
          ...(live ? [livePill(live)] : []),
        ],
      }),
      // Right: stats panel
      container({
        style: {
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-start",
          width: RIGHT_WIDTH,
          height: BANNER_HEIGHT,
          paddingTop: 28,
          paddingBottom: 40,
          paddingLeft: 40,
          paddingRight: 40,
          backgroundColor: "#0f0f10",
          borderTopRightRadius: RADIUS,
          borderBottomRightRadius: RADIUS,
        },
        children: [
          statRow(
            "Website",
            metrics.users.online,
            history.membersOnline,
            ACCENT,
            false,
          ),
          statRow(
            "Teamspeak",
            metrics.teamspeak.online,
            history.teamspeakOnline,
            "rgb(59, 130, 246)",
            false,
          ),
          statRow(
            "Game Servers",
            metrics.gameservers.total,
            history.gameServers,
            "rgb(234, 179, 8)",
            false,
          ),
          statRow(
            "Playing on Steam",
            metrics.gameservers.players,
            history.playersInGame,
            "rgb(168, 85, 247)",
            true,
          ),
          container({
            style: {
              display: "flex",
              flexDirection: "row",
              justifyContent: "space-between",
              width: "100%",
              marginTop: "auto",
            },
            children: [
              text(`Updated ${updated}`, {
                fontSize: 12,
                color: "#3a3a3a",
              }),
              text("Histogram over 24 hours", {
                fontSize: 12,
                color: "#3a3a3a",
              }),
            ],
          }),
        ],
      }),
    ],
  });
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------
Deno.serve(async (req: Request) => {
  try {
    const authorizeResponse = authorizeSystemCron(req);
    if (authorizeResponse) {
      console.error("Authorization failed:", authorizeResponse.statusText);
      return authorizeResponse;
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseKey = Deno.env.get("SUPABASE_SECRET_KEY") ??
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
      "";

    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Missing Supabase service role configuration");
    }

    const supabaseClient = createClient<Database>(supabaseUrl, supabaseKey);

    // -----------------------------------------------------------------------
    // Load latest metrics snapshot + history + live info in parallel
    // -----------------------------------------------------------------------
    const now = new Date().toISOString();
    const [snapshotResult, historyResult, eventResult, gameResult] =
      await Promise.all([
        supabaseClient.storage.from(METRICS_BUCKET).download(METRICS_OBJECT),
        supabaseClient.rpc("get_metrics_bucketed", {
          p_since: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
          p_until: now,
          p_bucket_interval: "72 minutes",
        }),
        // Active official event: started and not yet finished
        supabaseClient
          .from("events")
          .select("title, duration_minutes")
          .eq("is_official", true)
          .lte("date", now)
          .gt("date", new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString())
          .not("duration_minutes", "is", null)
          .order("date", { ascending: false })
          .limit(5),
        // Top currently-played Steam game (mirrors cron-metrics-fetch logic)
        supabaseClient
          .from("presences_steam")
          .select(
            "current_app_name, profile:profiles!presences_steam_profile_id_fkey(rich_presence_enabled)",
          )
          .not("current_app_name", "is", null),
      ]);

    if (snapshotResult.error || !snapshotResult.data) {
      throw new Error(
        `Failed to load metrics snapshot: ${
          snapshotResult.error?.message ?? "no data"
        }`,
      );
    }

    const metrics = JSON.parse(
      await snapshotResult.data.text(),
    ) as MetricsSnapshot;
    const history = extractSeries(historyResult.data ?? []);

    // -----------------------------------------------------------------------
    // Resolve live info: active event wins over top game
    // -----------------------------------------------------------------------
    let live: LiveInfo | null = null;

    const activeEvent = (eventResult.data ?? []).find((e) => {
      if (!e.duration_minutes) return false;
      const start = new Date(
        (e as unknown as Record<string, string>).date,
      ).getTime();
      return Date.now() < start + e.duration_minutes * 60_000;
    });

    if (activeEvent) {
      live = { kind: "event", title: activeEvent.title };
    } else {
      // Count occurrences of each game name
      const counts: Record<string, number> = {};
      for (const row of gameResult.data ?? []) {
        const profile = row.profile as
          | { rich_presence_enabled: boolean }
          | null;
        if (!profile?.rich_presence_enabled) continue;
        const name = row.current_app_name;
        if (name) counts[name] = (counts[name] ?? 0) + 1;
      }
      const topGame = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
      if (topGame) {
        live = {
          kind: "game",
          title: topGame[0],
          subtitle: `${topGame[1]} playing`,
        };
      }
    }

    // -----------------------------------------------------------------------
    // Render PNG (transparent background - no fill on outermost container)
    // -----------------------------------------------------------------------
    const node = buildScene(metrics, history, live);
    const png = renderer.render(node as any, {
      width: BANNER_WIDTH,
      height: BANNER_HEIGHT,
      format: "png",
    });

    // -----------------------------------------------------------------------
    // Upload to public bucket
    // -----------------------------------------------------------------------
    const { error: uploadError } = await supabaseClient.storage
      .from(METRICS_BUCKET)
      .upload(
        BANNER_OBJECT,
        new Blob([new Uint8Array(png)], { type: "image/png" }),
        {
          upsert: true,
          cacheControl: "60",
          contentType: "image/png",
        },
      );

    if (uploadError) {
      throw new Error(`Failed to upload banner: ${uploadError.message}`);
    }

    console.log(
      `Rendered status banner (${png.byteLength} bytes) from snapshot at ${metrics.collectedAt}`,
    );

    return new Response(
      JSON.stringify({
        success: true,
        message: "Rendered status banner",
        path: `${METRICS_BUCKET}/${BANNER_OBJECT}`,
        bytes: png.byteLength,
        snapshotAt: metrics.collectedAt,
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    const error = err as Error;
    console.error("Error in cron-render-status-banner:", error);

    return new Response(
      JSON.stringify({
        success: false,
        error: constants.API_ERROR,
      }),
      {
        headers: { "Content-Type": "application/json" },
        status: 500,
      },
    );
  }
});
