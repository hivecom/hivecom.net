import { createClient } from "@supabase/supabase-js";
import type { Database } from "database-types";
import type { MetricsSnapshot } from "metrics-types";
import constants from "constants" with { type: "json" };

import { authorizeSystemCron } from "../_shared/auth.ts";
import { formatCountdown, type LiveInfo, renderBanner } from "./banner.ts";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const METRICS_BUCKET = "hivecom-content-static";
const METRICS_OBJECT = "metrics/latest.json";
const BANNER_OBJECT = "banners/status.png";

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
    // Load latest metrics snapshot + live info in parallel
    // -----------------------------------------------------------------------
    const now = new Date().toISOString();
    const [
      snapshotResult,
      eventResult,
      nextEventResult,
      gamesResult,
    ] = await Promise.all([
      supabaseClient.storage.from(METRICS_BUCKET).download(METRICS_OBJECT),
      // Active official event: started and not yet finished (for footer)
      supabaseClient
        .from("events")
        .select("title, duration_minutes")
        .eq("is_official", true)
        .lte("date", now)
        .gt("date", new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString())
        .not("duration_minutes", "is", null)
        .order("date", { ascending: false })
        .limit(5),
      // Next upcoming official event (for countdown KPI)
      supabaseClient
        .from("events")
        .select("date")
        .eq("is_official", true)
        .gt("date", now)
        .order("date", { ascending: true })
        .limit(1),
      // Known games - resolves Steam app IDs to display names. Player counts
      // come from the metrics snapshot, not from here.
      supabaseClient
        .from("games")
        .select("steam_id, name")
        .not("steam_id", "is", null),
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

    // -----------------------------------------------------------------------
    // Resolve footer info: top currently-played game only
    // -----------------------------------------------------------------------
    let live: LiveInfo | null = null;

    const activeEvent = (eventResult.data ?? []).find((e) => {
      if (!e.duration_minutes) return false;
      const start = new Date(
        (e as unknown as Record<string, string>).date,
      ).getTime();
      return Date.now() < start + e.duration_minutes * 60_000;
    });
    const eventOngoing = Boolean(activeEvent);

    // Map known Steam app IDs to their display name. The games table only
    // supplies metadata (the name); player counts come from the snapshot.
    const steamIdToName = new Map<number, string>();
    for (const g of gamesResult.data ?? []) {
      const row = g as unknown as {
        steam_id: number | null;
        name: string | null;
      };
      if (row.steam_id != null && row.name) {
        steamIdToName.set(row.steam_id, row.name);
      }
    }

    // Pick the top currently-played known game from the snapshot counts, so the
    // footer count and the "In-game" KPI are derived from the same point in
    // time and can never disagree.
    let topAppId: number | null = null;
    let topCount = 0;
    for (const [appIdStr, count] of Object.entries(metrics.users.bySteamGame)) {
      const appId = Number(appIdStr);
      if (!steamIdToName.has(appId)) continue; // not a tracked game
      if (count > topCount) {
        topCount = count;
        topAppId = appId;
      }
    }
    if (topAppId != null) {
      live = {
        kind: "game",
        title: steamIdToName.get(topAppId)!,
        subtitle: `${topCount} playing`,
      };
    }

    // -----------------------------------------------------------------------
    // Countdown for next upcoming event
    // -----------------------------------------------------------------------
    const nextEvent = (nextEventResult.data ?? [])[0] as
      | { date: string }
      | undefined;
    const nextEventCountdown = nextEvent
      ? formatCountdown(
        new Date((nextEvent as unknown as Record<string, string>).date)
          .getTime() - Date.now(),
      )
      : null;

    // -----------------------------------------------------------------------
    // Render and upload
    // -----------------------------------------------------------------------
    const png = renderBanner(metrics, live, nextEventCountdown, eventOngoing);

    const { error: uploadError } = await supabaseClient.storage
      .from(METRICS_BUCKET)
      .upload(
        BANNER_OBJECT,
        new Blob([png as unknown as Uint8Array<ArrayBuffer>], {
          type: "image/png",
        }),
        { upsert: true, cacheControl: "60", contentType: "image/png" },
      );

    if (uploadError) {
      throw new Error(`Failed to upload banner: ${uploadError.message}`);
    }

    console.log(
      `Rendered status banner (${png.byteLength}b) from snapshot at ${metrics.collectedAt}`,
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
