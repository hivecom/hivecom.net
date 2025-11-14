import { createClient } from "@supabase/supabase-js";
import { Database, Tables } from "database-types";
import { google, calendar_v3 } from 'npm:googleapis@144.0.0';
import { JWT } from 'npm:google-auth-library@9.15.0';
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

type EventData = Tables<'events'>
type SupabaseClientType = ReturnType<typeof createClient<Database>>

interface SyncRequest {
  action: 'INSERT' | 'UPDATE' | 'DELETE'
  eventId: number
  timestamp?: string
  google_event_id?: string // This field is used for DELETE operation as the row is already deleted.
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
      return new Response(JSON.stringify({
        success: false,
        error: 'Missing required fields: action and eventId are required'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      })
    }

    if (!['INSERT', 'UPDATE', 'DELETE'].includes(action)) {
      return new Response(JSON.stringify({
        success: false,
        error: `Invalid action: ${action}. Must be INSERT, UPDATE, or DELETE`
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      })
    }

    console.log(`Processing ${action} for event ${eventId}`)

    // Get Google Calendar credentials
    const googleCalendarId = Deno.env.get('GOOGLE_CALENDAR_ID')
    const googleServiceAccountKey = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_KEY')

    if (!googleCalendarId || !googleServiceAccountKey) {
      throw new Error('Missing Google Calendar configuration')
    }

    // Initialize Google Calendar API client
    const auth = await initializeGoogleAuth(googleServiceAccountKey)
    const calendar = google.calendar({ version: 'v3', auth })

    let result

    // For DELETE, use the data provided in the request since the row is already deleted
    if (action === 'DELETE') {
      // Use the already parsed request data
      console.log('Deleting event with Google Calendar ID:', requestData.google_event_id)

      if (!requestData.google_event_id) {
        return new Response(JSON.stringify({
          success: true,
          message: 'No Google Calendar ID was provided, nothing to delete'
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200
        })
      }

      result = await deleteGoogleEvent(calendar, googleCalendarId, requestData as EventData, undefined)
    } else {
      // For INSERT/UPDATE, fetch the data from the database
      const supabase = createClient<Database>(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      )

      const { data: event_data, error: eventError } = await supabase
        .from('events')
        .select('*')
        .eq('id', eventId)
        .single()

      if (eventError || !event_data) {
        throw new Error(`Event not found: ${eventError?.message}`)
      }

      if (action === 'INSERT') {
        result = await createGoogleEvent(calendar, googleCalendarId, event_data, supabase)
      } else { // UPDATE
        result = await updateGoogleEvent(calendar, googleCalendarId, event_data, supabase)
      }
    }

    console.log(`Successfully processed ${action} for event ${eventId}`)
    return new Response(JSON.stringify({ success: true, result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    })

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('Error syncing with Google Calendar:', errorMessage)
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    )
  }
})

function initializeGoogleAuth(serviceAccountKey: string) {
  const credentials = JSON.parse(serviceAccountKey)

  const auth = new JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: [
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.events'
    ]
  })

  return auth
}

async function createGoogleEvent(
  calendar: calendar_v3.Calendar,
  calendarId: string,
  eventData: EventData,
  supabase: SupabaseClientType
) {
  const eventStart = new Date(eventData.date)
  const eventEnd = eventData.duration_minutes
    ? new Date(eventStart.getTime() + eventData.duration_minutes * 60000)
    : new Date(eventStart.getTime() + 60 * 60000) // Default 1 hour if no duration

  const googleEvent = {
    summary: eventData.title,
    description: [
      eventData.description,
      eventData.note,
      eventData.link ? `Event Link: ${eventData.link}` : `Event Page: https://hivecom.net/events/${eventData.id}`
    ].filter(Boolean).join('\n\n'),
    start: {
      dateTime: eventStart.toISOString(),
      timeZone: 'UTC'
    },
    end: {
      dateTime: eventEnd.toISOString(),
      timeZone: 'UTC'
    },
    location: eventData.location || undefined,
    status: 'confirmed',
    transparency: 'opaque', // Event blocks time on calendar
    visibility: 'public', // Community events are public
    source: {
      title: 'Hivecom Event',
      url: `https://hivecom.net/events/${eventData.id}`
    },
    extendedProperties: {
      shared: {
        hivecomEventId: eventData.id.toString(),
        hivecomSource: 'hivecom-admin-sync'
      }
    },
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'popup', minutes: 60 }, // 1 hour before
        { method: 'popup', minutes: 15 }  // 15 minutes before
      ]
    }
  }

  try {
    const response = await calendar.events.insert({
      calendarId: calendarId,
      requestBody: googleEvent
    })

    // Update our database with the Google event ID
    await supabase
      .from('events')
      .update({
        google_event_id: response.data.id,
        google_last_synced_at: new Date().toISOString()
      })
      .eq('id', eventData.id)

    return response.data
  } catch (error) {
    console.error('Error creating Google Calendar event:', error)
    throw error
  }
}

async function updateGoogleEvent(
  calendar: calendar_v3.Calendar,
  calendarId: string,
  eventData: EventData,
  supabase: SupabaseClientType
) {
  if (!eventData.google_event_id) {
    // If no Google event ID exists, create a new event instead
    return await createGoogleEvent(calendar, calendarId, eventData, supabase)
  }

  const eventStart = new Date(eventData.date)
  const eventEnd = eventData.duration_minutes
    ? new Date(eventStart.getTime() + eventData.duration_minutes * 60000)
    : new Date(eventStart.getTime() + 60 * 60000)

  const googleEvent = {
    summary: eventData.title,
    description: [
      eventData.description,
      `Event Link: ${eventData.link}`,
      `Event Page: https://hivecom.net/events/${eventData.id}`,
      eventData.note,
    ].filter(Boolean).join('\n\n'),
    start: {
      dateTime: eventStart.toISOString(),
      timeZone: 'UTC'
    },
    end: {
      dateTime: eventEnd.toISOString(),
      timeZone: 'UTC'
    },
    location: eventData.location || undefined,
    status: 'confirmed',
    transparency: 'opaque', // Event blocks time on calendar
    visibility: 'public', // Community events are public
    source: {
      title: 'Hivecom Event',
      url: eventData.link || `https://hivecom.net/events/${eventData.id}`
    },
    extendedProperties: {
      shared: {
        hivecomEventId: eventData.id.toString(),
        hivecomSource: 'hivecom-admin-sync'
      }
    },
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'popup', minutes: 60 }, // 1 hour before
        { method: 'popup', minutes: 15 }  // 15 minutes before
      ]
    }
  }

  try {
    const response = await calendar.events.update({
      calendarId: calendarId,
      eventId: eventData.google_event_id,
      requestBody: googleEvent
    })

    // Update sync timestamp
    await supabase
      .from('events')
      .update({
        google_last_synced_at: new Date().toISOString()
      })
      .eq('id', eventData.id)

    return response.data
  } catch (error) {
    console.error('Error updating Google Calendar event:', error)
    throw error
  }
}

async function deleteGoogleEvent(
  calendar: calendar_v3.Calendar,
  calendarId: string,
  eventData: EventData,
  _supabase?: SupabaseClientType | null
) {
  if (!eventData.google_event_id) {
    // Nothing to delete in Google Calendar
    return { message: 'No Google event ID found, nothing to delete' }
  }

  try {
    await calendar.events.delete({
      calendarId: calendarId,
      eventId: eventData.google_event_id
    })

    return { message: 'Event deleted from Google Calendar' }
  } catch (error) {
    // If the event doesn't exist (404), that's fine - it's already "deleted"
    if (error instanceof Error && 'code' in error && (error as { code: number }).code === 404) {
      return { message: 'Event not found in Google Calendar (already deleted)' }
    }
    console.error('Error deleting Google Calendar event:', error)
    throw error
  }
}
