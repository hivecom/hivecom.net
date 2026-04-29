import { createClient } from "@supabase/supabase-js";
import type { Database, Tables } from "database-types";
import { corsHeaders } from "../_shared/cors.ts";
import { authorizeSystemTrigger } from "../_shared/auth.ts";
import { responseMethodNotAllowed } from "../_shared/response.ts";

type EventData = Tables<"events">;
type SupabaseClientType = ReturnType<typeof createClient<Database>>;

interface SyncRequest {
  action: "INSERT" | "UPDATE" | "DELETE";
  eventId: number;
  timestamp?: string;
  discord_event_id?: string | null;
}

type DiscordHttpMethod = "POST" | "PATCH" | "DELETE";

// ── Discord recurrence constants ──────────────────────────────────────────────

const DISCORD_FREQ_YEARLY = 0;
const DISCORD_FREQ_MONTHLY = 1;
const DISCORD_FREQ_WEEKLY = 2;
const DISCORD_FREQ_DAILY = 3;

const DISCORD_WEEKDAY: Record<string, number> = {
  MO: 0,
  TU: 1,
  WE: 2,
  TH: 3,
  FR: 4,
  SA: 5,
  SU: 6,
};

const DISCORD_MONTH: Record<string, number> = {
  "1": 1,
  "2": 2,
  "3": 3,
  "4": 4,
  "5": 5,
  "6": 6,
  "7": 7,
  "8": 8,
  "9": 9,
  "10": 10,
  "11": 11,
  "12": 12,
};

interface DiscordRecurrenceRule {
  start: string;
  frequency: number;
  interval: number;
  by_weekday?: number[] | null;
  by_n_weekday?: { n: number; day: number }[] | null;
  by_month?: number[] | null;
  by_month_day?: number[] | null;
}

/**
 * Convert an iCal RRULE string + event start date into a Discord recurrence
 * rule object. Returns null if the rule cannot be mapped to Discord's limited
 * recurrence model (e.g. FREQ=MONTHLY;BYMONTHDAY which Discord doesn't support
 * directly - Discord only allows nth-weekday-of-month for monthly events).
 */
function rruleToDiscord(
  rrule: string,
  eventStart: Date,
): DiscordRecurrenceRule | null {
  const parts = Object.fromEntries(
    rrule.split(";").map((p) => p.split("=")),
  ) as Record<string, string>;

  const freq = parts.FREQ;
  const interval = parts.INTERVAL ? parseInt(parts.INTERVAL, 10) : 1;
  const start = eventStart.toISOString();

  if (freq === "DAILY") {
    const byWeekday = parts.BYDAY
      ? parts.BYDAY.split(",").map((d) => DISCORD_WEEKDAY[d]).filter((d) =>
        d !== undefined
      )
      : null;
    return {
      start,
      frequency: DISCORD_FREQ_DAILY,
      interval: 1, // Discord only allows interval=1 for daily
      by_weekday: byWeekday?.length ? byWeekday : null,
    };
  }

  if (freq === "WEEKLY") {
    // Discord only supports interval 1 or 2 for weekly
    if (interval > 2) {
      console.warn(
        `RRULE interval ${interval} not supported by Discord for WEEKLY, skipping recurrence`,
      );
      return null;
    }
    // Discord weekly only supports a single BYDAY value
    const byDayCodes = parts.BYDAY ? parts.BYDAY.split(",") : [];
    if (byDayCodes.length > 1) {
      console.warn(
        "Discord weekly recurrence only supports a single BYDAY, skipping recurrence",
      );
      return null;
    }
    const byWeekday = byDayCodes.length === 1
      ? [DISCORD_WEEKDAY[byDayCodes[0]]]
      : null;
    return {
      start,
      frequency: DISCORD_FREQ_WEEKLY,
      interval,
      by_weekday: byWeekday,
    };
  }

  if (freq === "MONTHLY") {
    // Discord monthly only supports by_n_weekday (nth weekday of month),
    // not BYMONTHDAY. Derive nth weekday from the event start date.
    const day = eventStart.getDay(); // 0=Sun..6=Sat
    // Convert JS day (0=Sun) to Discord weekday enum (0=Mon, 6=Sun)
    const discordDay = day === 0 ? 6 : day - 1;
    // Which occurrence of this weekday in the month (1-5)?
    const n = Math.ceil(eventStart.getDate() / 7);
    return {
      start,
      frequency: DISCORD_FREQ_MONTHLY,
      interval: 1, // Discord only allows interval=1 for monthly
      by_n_weekday: [{ n, day: discordDay }],
    };
  }

  if (freq === "YEARLY") {
    // Derive month and day-of-month from the event start date
    const month = eventStart.getMonth() + 1; // 1-based
    const monthDay = eventStart.getDate();
    return {
      start,
      frequency: DISCORD_FREQ_YEARLY,
      interval: 1,
      by_month: [DISCORD_MONTH[month.toString()]],
      by_month_day: [monthDay],
    };
  }

  console.warn(`Unsupported RRULE FREQ=${freq}, skipping Discord recurrence`);
  return null;
}

const DISCORD_API_BASE = "https://discord.com/api/v10";
const DISCORD_PRIVACY_LEVEL_GUILD_ONLY = 2;
const DISCORD_ENTITY_TYPE_EXTERNAL = 3;
const MAX_DESCRIPTION_LENGTH = 1000;
const MAX_LOCATION_LENGTH = 100;

class DiscordApiError extends Error {
  status: number;
  body?: unknown;

  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.name = "DiscordApiError";
    this.status = status;
    this.body = body;
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return responseMethodNotAllowed(req.method);
  }

  try {
    const authResponse = authorizeSystemTrigger(req);
    if (authResponse) {
      console.error("Authorization failed:", authResponse.statusText);
      return authResponse;
    }

    const requestData = await req.json() as SyncRequest;
    const { action, eventId } = requestData;

    if (!action || !eventId) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing required fields: action and eventId are required",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        },
      );
    }

    if (!["INSERT", "UPDATE", "DELETE"].includes(action)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Invalid action: ${action}. Must be INSERT, UPDATE, or DELETE`,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        },
      );
    }

    const discordBotToken = Deno.env.get("DISCORD_BOT_TOKEN");
    const discordGuildId = Deno.env.get("DISCORD_GUILD_ID");

    if (!discordBotToken || !discordGuildId) {
      throw new Error(
        "Missing Discord bot configuration (DISCORD_BOT_TOKEN or DISCORD_GUILD_ID)",
      );
    }

    console.log(`Processing Discord ${action} sync for event ${eventId}`);

    let result: unknown;

    if (action === "DELETE") {
      const deletePayload: Pick<EventData, "id" | "discord_event_id"> = {
        id: eventId,
        discord_event_id: requestData.discord_event_id ?? null,
      };
      result = await deleteDiscordEvent(
        discordBotToken,
        discordGuildId,
        deletePayload,
      );
    } else {
      const supabase = createSupabaseClient();
      const eventRecord = await fetchEventRecord(supabase, eventId);

      if (action === "INSERT") {
        result = await createDiscordEvent(
          discordBotToken,
          discordGuildId,
          eventRecord,
          supabase,
        );
      } else {
        result = await updateDiscordEvent(
          discordBotToken,
          discordGuildId,
          eventRecord,
          supabase,
        );
      }
    }

    console.log(
      `Successfully processed Discord ${action} for event ${eventId}`,
    );
    return new Response(JSON.stringify({ success: true, result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Error syncing with Discord:", message, error);
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});

function createSupabaseClient() {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const key = Deno.env.get("SUPABASE_SECRET_KEY") ??
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  if (!url || !key) {
    throw new Error(
      "Missing Supabase service credentials (SUPABASE_URL or SUPABASE_SECRET_KEY)",
    );
  }

  return createClient<Database>(url, key);
}

async function fetchEventRecord(supabase: SupabaseClientType, eventId: number) {
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .eq("id", eventId)
    .single();

  if (error || !data) {
    throw new Error(`Event not found: ${error?.message ?? "unknown error"}`);
  }

  return data;
}

async function createDiscordEvent(
  token: string,
  guildId: string,
  eventData: EventData,
  supabase: SupabaseClientType,
) {
  const payload = buildDiscordEventPayload(eventData);
  const createdEvent = await discordRequest<{ id: string }>(
    "POST",
    `/guilds/${guildId}/scheduled-events`,
    token,
    payload,
  );

  await supabase
    .from("events")
    .update({
      discord_event_id: createdEvent?.id ?? null,
      discord_last_synced_at: new Date().toISOString(),
    })
    .eq("id", eventData.id);

  return createdEvent;
}

async function updateDiscordEvent(
  token: string,
  guildId: string,
  eventData: EventData,
  supabase: SupabaseClientType,
) {
  if (!eventData.discord_event_id) {
    console.warn(
      `Discord event missing for event ${eventData.id}, creating new scheduled event`,
    );
    return createDiscordEvent(token, guildId, eventData, supabase);
  }

  const payload = buildDiscordEventPayload(eventData);

  try {
    const updatedEvent = await discordRequest<{ id: string }>(
      "PATCH",
      `/guilds/${guildId}/scheduled-events/${eventData.discord_event_id}`,
      token,
      payload,
    );

    await supabase
      .from("events")
      .update({
        discord_last_synced_at: new Date().toISOString(),
      })
      .eq("id", eventData.id);

    return updatedEvent;
  } catch (error) {
    if (error instanceof DiscordApiError && error.status === 404) {
      console.warn(
        `Discord event ${eventData.discord_event_id} not found, recreating for event ${eventData.id}`,
      );
      eventData.discord_event_id = null;
      return createDiscordEvent(token, guildId, eventData, supabase);
    }
    throw error;
  }
}

async function deleteDiscordEvent(
  token: string,
  guildId: string,
  eventData: Pick<EventData, "id" | "discord_event_id">,
) {
  if (!eventData.discord_event_id) {
    return { message: "No Discord event ID found, nothing to delete" };
  }

  try {
    await discordRequest(
      "DELETE",
      `/guilds/${guildId}/scheduled-events/${eventData.discord_event_id}`,
      token,
    );
    return { message: "Event deleted from Discord" };
  } catch (error) {
    if (error instanceof DiscordApiError && error.status === 404) {
      return { message: "Discord event already deleted" };
    }
    throw error;
  }
}

function buildDiscordEventPayload(eventData: EventData) {
  const eventStart = new Date(eventData.date);
  const eventEnd = eventData.duration_minutes
    ? new Date(eventStart.getTime() + eventData.duration_minutes * 60000)
    : new Date(eventStart.getTime() + 60 * 60000);

  const eventPageUrl = `https://hivecom.net/events/${eventData.id}`;
  const eventLink = eventData.link?.trim();
  const note = eventData.note?.trim();
  const descriptionParts = [
    eventData.description?.trim(),
    note ? `Note: ${note}` : undefined,
    eventLink ? `Event Link: ${eventLink}` : undefined,
    `Event Page: ${eventPageUrl}`,
  ].filter(Boolean) as string[];

  const description = truncate(
    descriptionParts.join("\n\n"),
    MAX_DESCRIPTION_LENGTH,
    "Hivecom event",
  );
  const location = truncate(
    eventData.location?.trim() || eventLink || eventPageUrl,
    MAX_LOCATION_LENGTH,
    "https://hivecom.net",
  );

  const recurrenceRule = eventData.recurrence_rule
    ? rruleToDiscord(eventData.recurrence_rule, eventStart)
    : null;

  return {
    name: eventData.title,
    description,
    scheduled_start_time: eventStart.toISOString(),
    scheduled_end_time: eventEnd.toISOString(),
    privacy_level: DISCORD_PRIVACY_LEVEL_GUILD_ONLY,
    entity_type: DISCORD_ENTITY_TYPE_EXTERNAL,
    entity_metadata: {
      location,
    },
    ...(recurrenceRule ? { recurrence_rule: recurrenceRule } : {}),
  };
}

async function discordRequest<T = unknown>(
  method: DiscordHttpMethod,
  path: string,
  token: string,
  body?: Record<string, unknown>,
) {
  const headers: Record<string, string> = {
    Authorization: `Bot ${token}`,
    "User-Agent": "hivecom-discord-sync (https://hivecom.net)",
    "Content-Type": "application/json",
  };

  const response = await fetch(`${DISCORD_API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const rawText = await response.text();
  let parsedBody: unknown = null;

  if (rawText) {
    try {
      parsedBody = JSON.parse(rawText);
    } catch (_error) {
      parsedBody = rawText;
    }
  }

  if (!response.ok) {
    throw new DiscordApiError(
      `Discord API responded with ${response.status}`,
      response.status,
      parsedBody,
    );
  }

  if (response.status === 204) {
    return null as T;
  }

  return parsedBody as T;
}

function truncate(
  value: string | null | undefined,
  maxLength: number,
  fallback = "",
) {
  const source = value?.trim() || fallback;
  if (source.length <= maxLength) {
    return source;
  }
  return `${source.slice(0, maxLength - 3)}...`;
}
