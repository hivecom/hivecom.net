import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { authorizeSystemCron } from '../_shared/auth.ts'
import { Database } from '../_shared/database.types.ts'

interface DockerControlResponse {
  containers: {
    name: string
    running: boolean
    healthy: boolean
  }[]
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Create a Supabase client with the service role key (full admin access)
    const supabaseClient = createClient<Database>(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )
    
    // Authorize the request using the system cron authorization function
    const authorizeResponse = await authorizeSystemCron(req, supabaseClient)
    if (authorizeResponse) {
      return authorizeResponse
    }

    // Get the Docker Control port and token from environment variables
    const DOCKER_CONTROL_PORT = Deno.env.get('DOCKER_CONTROL_PORT') ?? '8080'
    const DOCKER_CONTROL_TOKEN = Deno.env.get('DOCKER_CONTROL_TOKEN')

    if (!DOCKER_CONTROL_TOKEN) {
      throw new Error('DOCKER_CONTROL_TOKEN environment variable is not set')
    }

    // Fetch all active servers from the database
    const { data: servers, error: serversError } = await supabaseClient
      .from('servers')
      .select('*')
      .eq('active', true)

    if (serversError) {
      throw serversError
    }

    if (!servers || servers.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No active servers found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Process each server in parallel
    const results = await Promise.all(
      servers.map(async (server) => {
        try {
          // Construct the Docker Control URL
          const dockerControlUrl = `https://${server.address}:${DOCKER_CONTROL_PORT}/containers`
          
          // Make a request to the Docker Control service
          const response = await fetch(dockerControlUrl, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${DOCKER_CONTROL_TOKEN}`,
              'Content-Type': 'application/json',
            },
          })

          if (!response.ok) {
            throw new Error(`Failed to fetch from ${server.address}: ${response.statusText}`)
          }

          // Parse the response JSON
          const data = await response.json() as DockerControlResponse
          
          // Current timestamp for reporting
          const now = new Date().toISOString()
          
          // Process each container and upsert to the gameserver_containers table
          const containerUpserts = await Promise.all(
            data.containers.map(async (container) => {
              const { error } = await supabaseClient
                .from('gameserver_containers')
                .upsert({
                  name: container.name,
                  running: container.running,
                  healthy: container.healthy,
                  reported_at: now,
                  server: server.id
                })
              
              return {
                container: container.name,
                success: !error,
                error: error?.message
              }
            })
          )
          
          return {
            server: server.address,
            success: true,
            containers: containerUpserts
          }
        } catch (err) {
          const error = err as Error
          console.error(`Error processing server ${server.address}:`, error)

          return {
            server: server.address,
            success: false,
            error: error.message || 'Unknown error'
          }
        }
      })
    )

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Processed servers successfully', 
        results 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    const error = err as Error
    console.error('Error in cron-docker-container-fetch:', error)
    
    return new Response(
      JSON.stringify({ success: false, error: error.message || 'Unknown error' }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    )
  }
})

