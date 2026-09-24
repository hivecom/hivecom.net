import { getSecretKey } from "../_shared/env.ts";
import { createClient } from "@supabase/supabase-js";
import type { Database, Tables } from "database-types";
import type { calendar_v3 } from "googleapis";
import { google } from "googleapis";
import { JWT } from "google-auth-library";
import { corsHeaders } from "../_shared/cors.ts";
import { authorizeSystemTrigger } from "../_shared/auth.ts";
import { responseMethodNotAllowed } from "../_shared/response.ts";

// The service account has to be added to each calendar as a writer or owner.

type EventData = Tables<"events">;
type SupabaseClientType = ReturnType<typeof createClient<Database>>;

interface SyncRequest {
  action: "INSERT" | "UPDATE" | "DELETE";
  eventId: number;
  timestamp?: string;
  google_event_id?: string; // DELETE only, official calendar
  google_community_event_id?: string; // DELETE only, community calendar
  // Passed on UPDATE so we can detect an is_official flip.
  old_is_official?: boolean;
  old_google_event_id?: string;
  old_google_community_event_id?: string;
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

    const requestData = await req.json();
    const { action, eventId } = requestData as SyncRequest;

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

    console.log(`Processing ${action} for event ${eventId}`);

    const googleCalendarId = Deno.env.get("GOOGLE_CALENDAR_ID");
    const googleCommunityCalendarId = Deno.env.get(
      "GOOGLE_COMMUNITY_CALENDAR_ID",
    );
    const googleServiceAccountKey = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_KEY");

    if (
      !googleCalendarId || !googleCommunityCalendarId ||
      !googleServiceAccountKey
    ) {
      throw new Error("Missing Google Calendar configuration");
    }

    const auth = await initializeGoogleAuth(googleServiceAccountKey);
    const calendar = google.calendar({ version: "v3", auth });

    let result;

    // The row is already gone on DELETE, so the request carries the IDs
    if (action === "DELETE") {
      const officialEventId = requestData.google_event_id;
      const communityEventId = requestData.google_community_event_id;

      if (!officialEventId && !communityEventId) {
        return new Response(
          JSON.stringify({
            success: true,
            message: "No Google Calendar ID was provided, nothing to delete",
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200,
          },
        );
      }

      if (officialEventId) {
        console.log("Deleting event from official calendar:", officialEventId);
        result = await deleteGoogleEvent(
          calendar,
          googleCalendarId,
          requestData as EventData,
          undefined,
        );
      }

      if (communityEventId) {
        console.log(
          "Deleting event from community calendar:",
          communityEventId,
        );
        result = await deleteGoogleEvent(
          calendar,
          googleCommunityCalendarId,
          { ...requestData, google_event_id: communityEventId } as EventData,
          undefined,
        );
      }
    } else {
      const supabase = createClient<Database>(
        Deno.env.get("SUPABASE_URL") ?? "",
        getSecretKey(),
      );

      const { data: event_data, error: eventError } = await supabase
        .from("events")
        .select("*")
        .eq("id", eventId)
        .single();

      if (eventError || !event_data) {
        throw new Error(`Event not found: ${eventError?.message}`);
      }

      const calendarId = event_data.is_official
        ? googleCalendarId
        : googleCommunityCalendarId;
      console.log(
        `Routing event ${eventId} to ${
          event_data.is_official ? "official" : "community"
        } calendar`,
      );

      if (action === "INSERT") {
        result = await createGoogleEvent(
          calendar,
          calendarId,
          event_data,
          supabase,
          event_data.is_official,
        );
      } else { // UPDATE
        const oldIsOfficial = requestData.old_is_official;
        const isOfficialFlip = oldIsOfficial !== undefined &&
          oldIsOfficial !== event_data.is_official;

        if (isOfficialFlip) {
          const oldCalendarId = oldIsOfficial
            ? googleCalendarId
            : googleCommunityCalendarId;
          const oldGoogleEventId = oldIsOfficial
            ? requestData.old_google_event_id
            : requestData.old_google_community_event_id;

          if (oldGoogleEventId) {
            console.log(
              `is_official flipped for event ${eventId} - deleting from ${
                oldIsOfficial ? "official" : "community"
              } calendar`,
            );
            await deleteGoogleEvent(
              calendar,
              oldCalendarId,
              { ...event_data, google_event_id: oldGoogleEventId } as EventData,
              undefined,
            );

            const clearPayload = oldIsOfficial
              ? { google_event_id: null, google_last_synced_at: null }
              : {
                google_community_event_id: null,
                google_community_last_synced_at: null,
              };

            await supabase
              .from("events")
              .update(clearPayload)
              .eq("id", event_data.id);
          }

          result = await createGoogleEvent(
            calendar,
            calendarId,
            event_data,
            supabase,
            event_data.is_official,
          );
        } else {
          result = await updateGoogleEvent(
            calendar,
            calendarId,
            event_data,
            supabase,
            event_data.is_official,
          );
        }
      }
    }

    console.log(`Successfully processed ${action} for event ${eventId}`);
    return new Response(JSON.stringify({ success: true, result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error
      ? error.message
      : "Unknown error";
    console.error("Error syncing with Google Calendar:", errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      },
    );
  }
});

function initializeGoogleAuth(serviceAccountKey: string) {
  const credentials = JSON.parse(serviceAccountKey);

  const auth = new JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: [
      "https://www.googleapis.com/auth/calendar",
      "https://www.googleapis.com/auth/calendar.events",
    ],
  });

  return auth;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function formatIcalUtc(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function buildGoogleRecurrence(
  eventData: EventData,
  eventStart: Date,
): string[] {
  if (!eventData.recurrence_rule) {
    return [];
  }

  const recurrence = [`RRULE:${eventData.recurrence_rule}`];
  if (eventData.excluded_dates.length === 0) {
    return recurrence;
  }

  // Google expands the series in UTC, so every occurrence shares the start's
  // UTC time of day. Removed dates were computed in the remover's local time
  // and can sit an hour off across DST, which Google wouldn't match. Snap each
  // one to the nearest UTC day at the series' time of day.
  const timeOfDay = eventStart.getTime() % DAY_MS;
  const exdates = eventData.excluded_dates.map((excluded) => {
    const time = new Date(excluded).getTime();
    let snapped = time - (time % DAY_MS) + timeOfDay;

    if (snapped - time > DAY_MS / 2) {
      snapped -= DAY_MS;
    } else if (time - snapped > DAY_MS / 2) {
      snapped += DAY_MS;
    }

    return formatIcalUtc(new Date(snapped));
  });

  recurrence.push(`EXDATE:${exdates.join(",")}`);
  return recurrence;
}

function buildGoogleEventPayload(eventData: EventData) {
  const eventStart = new Date(eventData.date);
  const eventEnd = eventData.duration_minutes
    ? new Date(eventStart.getTime() + eventData.duration_minutes * 60000)
    : new Date(eventStart.getTime() + 60 * 60000); // 1 hour when there's no duration
  const eventPageUrl = `https://hivecom.net/events/${eventData.id}`;
  const eventLink = eventData.link?.trim();
  const descriptionParts = [
    eventData.description,
    eventData.note,
    eventLink ? `Event Link: ${eventLink}` : undefined,
    `Event Page: ${eventPageUrl}`,
  ].filter(Boolean);
  const primarySourceUrl = eventLink || eventPageUrl;

  return {
    summary: eventData.title,
    description: descriptionParts.join("\n\n"),
    start: {
      dateTime: eventStart.toISOString(),
      timeZone: "UTC",
    },
    end: {
      dateTime: eventEnd.toISOString(),
      timeZone: "UTC",
    },
    // Pass RRULE to Google Calendar when set, or clear it when removed.
    recurrence: buildGoogleRecurrence(eventData, eventStart),
    location: eventData.location || undefined,
    status: "confirmed",
    transparency: "opaque",
    visibility: "public",
    source: {
      title: "Hivecom Event",
      url: primarySourceUrl,
    },
    extendedProperties: {
      shared: {
        hivecomEventId: eventData.id.toString(),
        hivecomSource: "hivecom-admin-sync",
      },
    },
    reminders: {
      useDefault: false,
      overrides: [
        { method: "popup", minutes: 60 },
        { method: "popup", minutes: 15 },
      ],
    },
  };
}

async function createGoogleEvent(
  calendar: calendar_v3.Calendar,
  calendarId: string,
  eventData: EventData,
  supabase: SupabaseClientType,
  isOfficial: boolean,
) {
  const googleEvent = buildGoogleEventPayload(eventData);

  try {
    const response = await calendar.events.insert({
      calendarId,
      requestBody: googleEvent,
    });

    const updatePayload = isOfficial
      ? {
        google_event_id: response.data.id,
        google_last_synced_at: new Date().toISOString(),
      }
      : {
        google_community_event_id: response.data.id,
        google_community_last_synced_at: new Date().toISOString(),
      };

    await supabase
      .from("events")
      .update(updatePayload)
      .eq("id", eventData.id);

    return response.data;
  } catch (error) {
    console.error("Error creating Google Calendar event:", error);
    throw error;
  }
}

async function updateGoogleEvent(
  calendar: calendar_v3.Calendar,
  calendarId: string,
  eventData: EventData,
  supabase: SupabaseClientType,
  isOfficial: boolean,
) {
  const existingEventId = isOfficial
    ? eventData.google_event_id
    : eventData.google_community_event_id;

  if (!existingEventId) {
    // Never synced to this calendar, so create it
    return await createGoogleEvent(
      calendar,
      calendarId,
      eventData,
      supabase,
      isOfficial,
    );
  }

  const googleEvent = buildGoogleEventPayload(eventData);

  try {
    const response = await calendar.events.update({
      calendarId,
      eventId: existingEventId,
      requestBody: googleEvent,
    });

    const updatePayload = isOfficial
      ? { google_last_synced_at: new Date().toISOString() }
      : { google_community_last_synced_at: new Date().toISOString() };

    await supabase
      .from("events")
      .update(updatePayload)
      .eq("id", eventData.id);

    return response.data;
  } catch (error) {
    console.error("Error updating Google Calendar event:", error);
    throw error;
  }
}

async function deleteGoogleEvent(
  calendar: calendar_v3.Calendar,
  calendarId: string,
  eventData: EventData,
  _supabase?: SupabaseClientType | null,
) {
  if (!eventData.google_event_id) {
    return { message: "No Google event ID found, nothing to delete" };
  }

  try {
    await calendar.events.delete({
      calendarId: calendarId,
      eventId: eventData.google_event_id,
    });

    return { message: "Event deleted from Google Calendar" };
  } catch (error) {
    // A 404 means it's already gone
    if (
      error instanceof Error && "code" in error &&
      (error as { code: number }).code === 404
    ) {
      return {
        message: "Event not found in Google Calendar (already deleted)",
      };
    }
    console.error("Error deleting Google Calendar event:", error);
    throw error;
  }
}
