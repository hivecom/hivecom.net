import { createClient } from "@supabase/supabase-js";
import { Database, Tables } from "database-types";
import { corsHeaders } from "../_shared/cors.ts";
import { authorizeSystemTrigger } from "../_shared/auth.ts";
import { responseMethodNotAllowed } from "../_shared/response.ts";

type EventData = Tables<'events'>
type SupabaseClientType = ReturnType<typeof createClient<Database>>

interface SyncRequest {
	action: 'INSERT' | 'UPDATE' | 'DELETE'
	eventId: number
	timestamp?: string
	discord_event_id?: string | null
}

type DiscordHttpMethod = 'POST' | 'PATCH' | 'DELETE'

const DISCORD_API_BASE = 'https://discord.com/api/v10'
const DISCORD_PRIVACY_LEVEL_GUILD_ONLY = 2
const DISCORD_ENTITY_TYPE_EXTERNAL = 3
const MAX_DESCRIPTION_LENGTH = 1000
const MAX_LOCATION_LENGTH = 100

class DiscordApiError extends Error {
	status: number
	body?: unknown

	constructor(message: string, status: number, body?: unknown) {
		super(message)
		this.name = 'DiscordApiError'
		this.status = status
		this.body = body
	}
}

Deno.serve(async (req) => {
	if (req.method !== 'POST') {
		return responseMethodNotAllowed(req.method)
	}

	try {
		const authResponse = authorizeSystemTrigger(req)
		if (authResponse) {
			console.error('Authorization failed:', authResponse.statusText)
			return authResponse
		}

		const requestData = await req.json() as SyncRequest
		const { action, eventId } = requestData

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

		const discordBotToken = Deno.env.get('DISCORD_BOT_TOKEN')
		const discordGuildId = Deno.env.get('DISCORD_GUILD_ID')

		if (!discordBotToken || !discordGuildId) {
			throw new Error('Missing Discord bot configuration (DISCORD_BOT_TOKEN or DISCORD_GUILD_ID)')
		}

		console.log(`Processing Discord ${action} sync for event ${eventId}`)

		let result: unknown

		if (action === 'DELETE') {
			const deletePayload: Pick<EventData, 'id' | 'discord_event_id'> = {
				id: eventId,
				discord_event_id: requestData.discord_event_id ?? null
			}
			result = await deleteDiscordEvent(discordBotToken, discordGuildId, deletePayload)
		} else {
			const supabase = createSupabaseClient()
			const eventRecord = await fetchEventRecord(supabase, eventId)

			if (action === 'INSERT') {
				result = await createDiscordEvent(discordBotToken, discordGuildId, eventRecord, supabase)
			} else {
				result = await updateDiscordEvent(discordBotToken, discordGuildId, eventRecord, supabase)
			}
		}

		console.log(`Successfully processed Discord ${action} for event ${eventId}`)
		return new Response(JSON.stringify({ success: true, result }), {
			headers: { ...corsHeaders, 'Content-Type': 'application/json' },
			status: 200
		})
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unknown error'
		console.error('Error syncing with Discord:', message, error)
		return new Response(JSON.stringify({ error: message }), {
			headers: { ...corsHeaders, 'Content-Type': 'application/json' },
			status: 500
		})
	}
})

function createSupabaseClient() {
	const url = Deno.env.get('SUPABASE_URL') ?? ''
	const key = Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

	if (!url || !key) {
		throw new Error('Missing Supabase service credentials (SUPABASE_URL or SUPABASE_SECRET_KEY)')
	}

	return createClient<Database>(url, key)
}

async function fetchEventRecord(supabase: SupabaseClientType, eventId: number) {
	const { data, error } = await supabase
		.from('events')
		.select('*')
		.eq('id', eventId)
		.single()

	if (error || !data) {
		throw new Error(`Event not found: ${error?.message ?? 'unknown error'}`)
	}

	return data
}

async function createDiscordEvent(
	token: string,
	guildId: string,
	eventData: EventData,
	supabase: SupabaseClientType
) {
	const payload = buildDiscordEventPayload(eventData)
	const createdEvent = await discordRequest<{ id: string }>('POST', `/guilds/${guildId}/scheduled-events`, token, payload)

	await supabase
		.from('events')
		.update({
			discord_event_id: createdEvent?.id ?? null,
			discord_last_synced_at: new Date().toISOString()
		})
		.eq('id', eventData.id)

	return createdEvent
}

async function updateDiscordEvent(
	token: string,
	guildId: string,
	eventData: EventData,
	supabase: SupabaseClientType
) {
	if (!eventData.discord_event_id) {
		console.warn(`Discord event missing for event ${eventData.id}, creating new scheduled event`)
		return createDiscordEvent(token, guildId, eventData, supabase)
	}

	const payload = buildDiscordEventPayload(eventData)

	try {
		const updatedEvent = await discordRequest<{ id: string }>(
			'PATCH',
			`/guilds/${guildId}/scheduled-events/${eventData.discord_event_id}`,
			token,
			payload
		)

		await supabase
			.from('events')
			.update({
				discord_last_synced_at: new Date().toISOString()
			})
			.eq('id', eventData.id)

		return updatedEvent
	} catch (error) {
		if (error instanceof DiscordApiError && error.status === 404) {
			console.warn(`Discord event ${eventData.discord_event_id} not found, recreating for event ${eventData.id}`)
			eventData.discord_event_id = null
			return createDiscordEvent(token, guildId, eventData, supabase)
		}
		throw error
	}
}

async function deleteDiscordEvent(
	token: string,
	guildId: string,
	eventData: Pick<EventData, 'id' | 'discord_event_id'>
) {
	if (!eventData.discord_event_id) {
		return { message: 'No Discord event ID found, nothing to delete' }
	}

	try {
		await discordRequest('DELETE', `/guilds/${guildId}/scheduled-events/${eventData.discord_event_id}`, token)
		return { message: 'Event deleted from Discord' }
	} catch (error) {
		if (error instanceof DiscordApiError && error.status === 404) {
			return { message: 'Discord event already deleted' }
		}
		throw error
	}
}

function buildDiscordEventPayload(eventData: EventData) {
	const eventStart = new Date(eventData.date)
	const eventEnd = eventData.duration_minutes
		? new Date(eventStart.getTime() + eventData.duration_minutes * 60000)
		: new Date(eventStart.getTime() + 60 * 60000)

	const eventPageUrl = `https://hivecom.net/events/${eventData.id}`
	const eventLink = eventData.link?.trim()
	const note = eventData.note?.trim()
	const descriptionParts = [
		eventData.description?.trim(),
		note ? `Note: ${note}` : undefined,
		eventLink ? `Event Link: ${eventLink}` : undefined,
		`Event Page: ${eventPageUrl}`
	].filter(Boolean) as string[]

	const description = truncate(descriptionParts.join('\n\n'), MAX_DESCRIPTION_LENGTH, 'Hivecom event')
	const location = truncate(eventData.location?.trim() || eventLink || eventPageUrl, MAX_LOCATION_LENGTH, 'https://hivecom.net')

	return {
		name: eventData.title,
		description,
		scheduled_start_time: eventStart.toISOString(),
		scheduled_end_time: eventEnd.toISOString(),
		privacy_level: DISCORD_PRIVACY_LEVEL_GUILD_ONLY,
		entity_type: DISCORD_ENTITY_TYPE_EXTERNAL,
		entity_metadata: {
			location
		}
	}
}

async function discordRequest<T = unknown>(
	method: DiscordHttpMethod,
	path: string,
	token: string,
	body?: Record<string, unknown>
) {
	const headers: Record<string, string> = {
		Authorization: `Bot ${token}`,
		'User-Agent': 'hivecom-discord-sync (https://hivecom.net)',
		'Content-Type': 'application/json'
	}

	const response = await fetch(`${DISCORD_API_BASE}${path}`, {
		method,
		headers,
		body: body ? JSON.stringify(body) : undefined
	})

	const rawText = await response.text()
	let parsedBody: unknown = null

	if (rawText) {
		try {
			parsedBody = JSON.parse(rawText)
		} catch (_error) {
			parsedBody = rawText
		}
	}

	if (!response.ok) {
		throw new DiscordApiError(`Discord API responded with ${response.status}`, response.status, parsedBody)
	}

	if (response.status === 204) {
		return null as T
	}

	return parsedBody as T
}

function truncate(value: string | null | undefined, maxLength: number, fallback = '') {
	const source = value?.trim() || fallback
	if (source.length <= maxLength) {
		return source
	}
	return `${source.slice(0, maxLength - 3)}...`
}

