import * as constants from "constants" with { type: "json" };
import { createClient } from "@supabase/supabase-js";
import { authorizeSystemCron } from "../_shared/auth.ts";
import type { Database } from "database-types";

interface SteamPresenceRow {
  current_app_id: number | null;
  current_app_name: string | null;
  profile: { rich_presence_enabled: boolean } | null;
}

Deno.serve(async (req: Request) => {
  try {
    const authorizeResponse = authorizeSystemCron(req);
    if (authorizeResponse) {
      console.error("Authorization failed:", authorizeResponse.statusText);

      return authorizeResponse;
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SECRET_KEY") ??
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl) {
      throw new Error("SUPABASE_URL environment variable is not set");
    }

    if (!supabaseKey) {
      throw new Error(
        "SUPABASE_SECRET_KEY / SUPABASE_SERVICE_ROLE_KEY environment variable is not set",
      );
    }

    const supabaseClient = createClient<Database>(supabaseUrl, supabaseKey);

    const { data: presences, error: presencesError } = await supabaseClient
      .from("presences_steam")
      .select(
        "current_app_id, current_app_name, profile:profiles!presences_steam_profile_id_fkey(rich_presence_enabled)",
      )
      .not("current_app_id", "is", null)
      .not("current_app_name", "is", null);

    if (presencesError) {
      throw new Error(
        `Failed to query presences_steam: ${presencesError.message}`,
      );
    }

    const rows = (presences ?? []) as SteamPresenceRow[];

    // Only keep rows where the linked profile has rich presence enabled
    const filtered = rows.filter(
      (row) => row.profile?.rich_presence_enabled === true,
    );

    // Deduplicate by app ID - keep any name for a given ID
    const gameMap = new Map<number, string>();
    for (const row of filtered) {
      if (row.current_app_id !== null && row.current_app_name !== null) {
        if (!gameMap.has(row.current_app_id)) {
          gameMap.set(row.current_app_id, row.current_app_name);
        }
      }
    }

    if (gameMap.size === 0) {
      console.log("No games found to upsert");

      return new Response(
        JSON.stringify({ success: true, upserted: 0 }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    const updatedAt = new Date().toISOString();
    const upsertPayload: {
      steam_id: number;
      name: string;
      updated_at: string;
    }[] = Array.from(gameMap.entries()).map(([steam_id, name]) => ({
      steam_id,
      name,
      updated_at: updatedAt,
    }));

    const { error: upsertError } = await supabaseClient
      .from("steam_games")
      .upsert(upsertPayload, { onConflict: "steam_id" });

    if (upsertError) {
      throw new Error(`Failed to upsert steam_games: ${upsertError.message}`);
    }

    const count = upsertPayload.length;
    console.log(`Upserted ${count} steam_games records`);

    return new Response(
      JSON.stringify({ success: true, upserted: count }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    const error = err as Error;
    console.error("Error in cron-steam-games-catalogue:", error);

    return new Response(
      JSON.stringify({
        success: false,
        error: constants.default.API_ERROR,
      }),
      {
        headers: { "Content-Type": "application/json" },
        status: 500,
      },
    );
  }
});
