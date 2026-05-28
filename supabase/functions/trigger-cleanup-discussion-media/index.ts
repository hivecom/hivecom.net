import { createClient } from "@supabase/supabase-js";
import type { Database } from "database-types";
import { corsHeaders } from "../_shared/cors.ts";
import { authorizeSystemTrigger } from "../_shared/auth.ts";
import { responseMethodNotAllowed } from "../_shared/response.ts";

const FORUMS_BUCKET = "hivecom-content-forums";
// Pattern is recreated per call (no module-level /g flag) to avoid lastIndex
// state bleeding between requests in the same Deno isolate.
const STORAGE_PATH_PATTERN =
  /\/storage\/v1\/object\/public\/hivecom-content-forums\/([^\s"')]+)/g;

interface CleanupDiscussionMediaRequest {
  entityId: string;
  entityType: "discussion" | "reply";
  markdown: string;
  action: "SOFT_DELETE" | "HARD_DELETE";
}

function extractStoragePaths(markdown: string): string[] {
  const paths: string[] = [];
  // Recreate the regex each call so lastIndex always starts at 0.
  const re = new RegExp(STORAGE_PATH_PATTERN.source, "g");
  let match: RegExpExecArray | null;

  while ((match = re.exec(markdown)) !== null) {
    const raw = match[1];
    // Strip query string
    const withoutQuery = raw.split("?")[0];
    const decoded = decodeURIComponent(withoutQuery);
    paths.push(decoded);
  }

  // Deduplicate
  return [...new Set(paths)];
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

    const payload = await req.json() as CleanupDiscussionMediaRequest;
    const { entityId, entityType, markdown, action } = payload;

    if (!markdown) {
      console.log(
        `No markdown for ${entityType} ${entityId}, nothing to clean up`,
      );
      return new Response(
        JSON.stringify({ success: true, pathsRemoved: 0 }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        },
      );
    }

    console.log(
      `Processing ${action} media cleanup for ${entityType} ${entityId}`,
    );

    const paths = extractStoragePaths(markdown);

    if (paths.length === 0) {
      console.log(`No storage paths found in ${entityType} ${entityId}`);
      return new Response(
        JSON.stringify({ success: true, entityId, pathsRemoved: 0 }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        },
      );
    }

    console.log(`Found ${paths.length} path(s) to remove:`, paths);

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
      Deno.env.get("SUPABASE_SECRET_KEY") ??
      "";

    if (!supabaseUrl || !supabaseKey) {
      throw new Error(
        "Missing Supabase service credentials (SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY)",
      );
    }

    const supabase = createClient<Database>(supabaseUrl, supabaseKey);

    const { data, error } = await supabase.storage
      .from(FORUMS_BUCKET)
      .remove(paths);

    if (error) {
      console.error(
        `Storage remove error for ${entityType} ${entityId}:`,
        error.message,
      );
      return new Response(
        JSON.stringify({
          success: true,
          entityId,
          storageError: error.message,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        },
      );
    }

    console.log(
      `Removed ${data?.length ?? 0} file(s) for ${entityType} ${entityId}`,
    );

    return new Response(
      JSON.stringify({ success: true, entityId, pathsRemoved: paths.length }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Error cleaning up reply media:", message, error);
    return new Response(
      JSON.stringify({ error: message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      },
    );
  }
});
