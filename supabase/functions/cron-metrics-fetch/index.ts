import * as constants from "constants" with { type: "json" };
import { createClient } from "@supabase/supabase-js";
import { authorizeSystemCron } from "../_shared/auth.ts";
import type { Database, Tables } from "database-types";
import { COUNTRIES } from "../../../app/lib/utils/country.ts";
import type { MetricsSnapshot } from "metrics-types";

interface CountryRow {
  country: Tables<"profiles">["country"];
}

const VALID_COUNTRY_CODES = new Set(COUNTRIES.map((country) => country.code));

const UNKNOWN_COUNTRY_KEY = "unknown";

function normalizeCountryCode(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalized)) {
    return null;
  }

  return VALID_COUNTRY_CODES.has(normalized) ? normalized : null;
}

Deno.serve(async (req: Request) => {
  // Skip CORS preflight check for OPTIONS requests as this should not originate from a browser.
  try {
    // Authorize the request using the system cron authorization function
    const authorizeResponse = authorizeSystemCron(req);
    if (authorizeResponse) {
      console.error("Authorization failed:", authorizeResponse.statusText);

      return authorizeResponse;
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseKey =
      Deno.env.get("SUPABASE_SECRET_KEY") ??
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
      "";

    if (!supabaseUrl) {
      throw new Error("SUPABASE_URL environment variable is not set");
    }

    if (!supabaseKey) {
      throw new Error(
        "SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY environment variable is not set",
      );
    }

    // Create a Supabase client with elevated permissions for internal metrics collection
    const supabaseClient = createClient<Database>(supabaseUrl, supabaseKey);

    const [totalUsersResponse, countryResponse, gameserverResponse, projectResponse] =
      await Promise.all([
        supabaseClient.from("profiles").select("id", {
          count: "exact",
          head: true,
        }),
        supabaseClient.from("profiles").select("country"),
        supabaseClient.from("gameservers").select("id", {
          count: "exact",
          head: true,
        }),
        supabaseClient.from("projects").select("id", {
          count: "exact",
          head: true,
        }),
      ]);

    if (totalUsersResponse.error) {
      throw new Error(
        `Unable to get user count: ${totalUsersResponse.error.message}`,
      );
    }

    if (countryResponse.error) {
      throw new Error(
        `Unable to get country data: ${countryResponse.error.message}`,
      );
    }

    if (gameserverResponse.error) {
      throw new Error(
        `Unable to get gameserver count: ${gameserverResponse.error.message}`,
      );
    }

    if (projectResponse.error) {
      throw new Error(
        `Unable to get project count: ${projectResponse.error.message}`,
      );
    }

    const totalUsers = totalUsersResponse.count ?? 0;
    const totalGameservers = gameserverResponse.count ?? 0;
    const totalProjects = projectResponse.count ?? 0;

    const countryCounts = (countryResponse.data as CountryRow[] | null)?.reduce(
      (acc, row) => {
        const code = normalizeCountryCode(row.country) ?? UNKNOWN_COUNTRY_KEY;
        acc[code] = (acc[code] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    ) ?? {};

    const usersByCountry = Object.fromEntries(
      Object.entries(countryCounts).sort(([, a], [, b]) => b - a),
    );

    const now = new Date();
    const filePath = `metrics/${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}/${
      String(now.getDate()).padStart(2, "0")
    }.json`;

    const payload: MetricsSnapshot = {
      collectedAt: now.toISOString(),
      totals: {
        users: totalUsers,
        gameservers: totalGameservers,
        projects: totalProjects,
      },
      breakdowns: {
        usersByCountry,
      },
    };

    const { error: uploadError } = await supabaseClient.storage
      .from("hivecom-content-static")
      .upload(
        filePath,
        new Blob([JSON.stringify(payload, null, 2)], {
          type: "application/json",
        }),
        {
          cacheControl: "86400",
          upsert: true,
          contentType: "application/json",
        },
      );

    if (uploadError) {
      throw new Error(`Failed to upload metrics file: ${uploadError.message}`);
    }

    console.log(`Uploaded metrics snapshot to hivecom-content-static/${filePath}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: "Collected application metrics successfully",
        metrics: payload,
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    const error = err as Error;
    console.error("Error in cron-metrics-fetch:", error);

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
