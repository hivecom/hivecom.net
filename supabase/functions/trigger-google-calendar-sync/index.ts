import { createClient } from "@supabase/supabase-js";
import { Database, Tables } from "database-types";
import { calendar_v3, google } from "googleapis";
import { JWT } from "google-auth-library";
import { corsHeaders } from "../_shared/cors.ts";
import { authorizeSystemTrigger } from "../_shared/auth.ts";
import { responseMethodNotAllowed } from "../_shared/response.ts";

/*
 * This function syncs events with Google Calendar based on changes in the Supabase database.
 * It handles INSERT, UPDATE, and DELETE operations for events.
 * Requires service role access to Supabase and Google Calendar API credentials.
 *
 * Some important notes:
 * - The calendar requires the service account to have been added as a writer or owner.
 * - The Google Calendar ID and service account key must be set in environment variables.
 */

type EventData = Tables<"events">;
type SupabaseClientType = ReturnType<typeof createClient<Database>>;

interface SyncRequest {
  action: "INSERT" | "UPDATE" | "DELETE";
  eventId: number;
  timestamp?: string;
  google_event_id?: string; // Used for DELETE - official calendar.
  google_community_event_id?: string; // Used for DELETE - community calendar.
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
    // Authorize the request using the system trigger authorization function
    const authResponse = authorizeSystemTrigger(req);
    if (authResponse) {
      console.error("Authorization failed:", authResponse.statusText);
      return authResponse;
    }

    // Read the request body once and store it
    const requestData = await req.json();
    const { action, eventId } = requestData as SyncRequest;

    // Validate request data
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

    // Get Google Calendar credentials
    const googleCalendarId = Deno.env.get("GOOGLE_CALENDAR_ID");
    const googleCommunityCalendarId = Deno.env.get("GOOGLE_COMMUNITY_CALENDAR_ID");
    const googleServiceAccountKey = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_KEY");

    if (!googleCalendarId || !googleCommunityCalendarId || !googleServiceAccountKey) {
      throw new Error("Missing Google Calendar configuration");
    }

    // Initialize Google Calendar API client
    const auth = await initializeGoogleAuth(googleServiceAccountKey);
    const calendar = google.calendar({ version: "v3", auth });

    let result;

    // For DELETE, use the data provided in the request since the row is already deleted
    if (action === "DELETE") {
      // Use the already parsed request data - check both calendar IDs
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

      // Delete from whichever calendar(s) the event was synced to
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
        console.log("Deleting event from community calendar:", communityEventId);
        result = await deleteGoogleEvent(
          calendar,
          googleCommunityCalendarId,
          { ...requestData, google_event_id: communityEventId } as EventData,
          undefined,
        );
      }
    } else {
      // For INSERT/UPDATE, fetch the data from the database
      const supabase = createClient<Database>(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SECRET_KEY") ??
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      );

      const { data: event_data, error: eventError } = await supabase
        .from("events")
        .select("*")
        .eq("id", eventId)
        .single();

      if (eventError || !event_data) {
        throw new Error(`Event not found: ${eventError?.message}`);
      }

      // Route to the correct calendar based on is_official
      const calendarId = event_data.is_official ? googleCalendarId : googleCommunityCalendarId;
      console.log(
        `Routing event ${eventId} to ${event_data.is_official ? "official" : "community"} calendar`,
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
        const isOfficialFlip = oldIsOfficial !== undefined && oldIsOfficial !== event_data.is_official;

        if (isOfficialFlip) {
          // Event moved between calendars - delete from old, create in new.
          const oldCalendarId = oldIsOfficial ? googleCalendarId : googleCommunityCalendarId;
          const oldGoogleEventId = oldIsOfficial
            ? requestData.old_google_event_id
            : requestData.old_google_community_event_id;

          if (oldGoogleEventId) {
            console.log(
              `is_official flipped for event ${eventId} - deleting from ${oldIsOfficial ? "official" : "community"} calendar`,
            );
            await deleteGoogleEvent(
              calendar,
              oldCalendarId,
              { ...event_data, google_event_id: oldGoogleEventId } as EventData,
              undefined,
            );

            // Clear the stale ID column from the old calendar
            const clearPayload = oldIsOfficial
              ? { google_event_id: null, google_last_synced_at: null }
              : { google_community_event_id: null, google_community_last_synced_at: null };

            await supabase
              .from("events")
              .update(clearPayload)
              .eq("id", event_data.id);
          }

          // Create fresh in the new calendar
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

function buildGoogleEventPayload(eventData: EventData) {
  const eventStart = new Date(eventData.date);
  const eventEnd = eventData.duration_minutes
    ? new Date(eventStart.getTime() + eventData.duration_minutes * 60000)
    : new Date(eventStart.getTime() + 60 * 60000); // Default 1 hour if no duration
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
    recurrence: eventData.recurrence_rule
      ? [`RRULE:${eventData.recurrence_rule}`]
      : [],
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

    // Write back to the correct ID column based on which calendar was used
    const updatePayload = isOfficial
      ? { google_event_id: response.data.id, google_last_synced_at: new Date().toISOString() }
      : { google_community_event_id: response.data.id, google_community_last_synced_at: new Date().toISOString() };

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
  // Pick the correct existing event ID based on which calendar we're targeting
  const existingEventId = isOfficial
    ? eventData.google_event_id
    : eventData.google_community_event_id;

  if (!existingEventId) {
    // No existing entry in this calendar - create instead
    return await createGoogleEvent(calendar, calendarId, eventData, supabase, isOfficial);
  }

  const googleEvent = buildGoogleEventPayload(eventData);

  try {
    const response = await calendar.events.update({
      calendarId,
      eventId: existingEventId,
      requestBody: googleEvent,
    });

    // Update the correct sync timestamp
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
    // Nothing to delete in Google Calendar
    return { message: "No Google event ID found, nothing to delete" };
  }

  try {
    await calendar.events.delete({
      calendarId: calendarId,
      eventId: eventData.google_event_id,
    });

    return { message: "Event deleted from Google Calendar" };
  } catch (error) {
    // If the event doesn't exist (404), that's fine - it's already "deleted"
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
