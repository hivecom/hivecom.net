import {
  ListSuppressedDestinationsCommand,
  SESv2Client,
} from "@aws-sdk/client-sesv2";
import { corsHeaders } from "../_shared/cors.ts";
import { authorizeAuthenticatedHasPermissionAal2 } from "../_shared/auth.ts";
import { responseMethodNotAllowed } from "../_shared/response.ts";
import { createPublicServiceRoleClient } from "../_shared/serviceRoleClients.ts";

interface SuppressionListRequest {
  pageSize?: number;
  nextToken?: string;
}

interface SuppressionUser {
  id: string;
  username: string | null;
  bouncedFlag: boolean;
  disabledFlag: boolean;
}

interface SuppressionEntry {
  email: string;
  reason: string | null;
  lastUpdate: string | null;
  sesSuppressed: boolean;
  user: SuppressionUser | null;
}

interface FlaggedProfileRow {
  id: string;
  email: string;
  username: string | null;
  email_notifications_bounced: boolean;
  email_notifications_disabled: boolean;
}

const DEFAULT_PAGE_SIZE = 50;
const MIN_PAGE_SIZE = 1;
const MAX_PAGE_SIZE = 100;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
}

function requireSesConfig(): { client: SESv2Client } {
  const region = Deno.env.get("AWS_SES_REGION");
  const accessKeyId = Deno.env.get("AWS_SES_ACCESS_KEY_ID");
  const secretAccessKey = Deno.env.get("AWS_SES_SECRET_ACCESS_KEY");

  if (!region || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "Missing SES configuration (AWS_SES_REGION, AWS_SES_ACCESS_KEY_ID, AWS_SES_SECRET_ACCESS_KEY)",
    );
  }

  return {
    client: new SESv2Client({
      region,
      credentials: { accessKeyId, secretAccessKey },
    }),
  };
}

async function findUserIdByEmail(
  supabase: ReturnType<typeof createPublicServiceRoleClient>,
  email: string,
): Promise<string | undefined> {
  const { data, error } = await supabase.rpc(
    "get_user_id_by_email" as never,
    { email } as never,
  );

  if (error) {
    console.error("Failed to fetch user id by email via RPC", error);
    return undefined;
  }

  const rows = data as Array<{ id: string }> | null;
  return rows?.[0]?.id ?? undefined;
}

Deno.serve(async (req: Request) => {
  // This is needed if you're planning to invoke your function from a browser. Which we are.
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return responseMethodNotAllowed(req.method);
  }

  try {
    // The page is read-only, so an empty body is fine and falls back to defaults
    let body: SuppressionListRequest = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const requestedSize = Number(body.pageSize ?? DEFAULT_PAGE_SIZE);
    const pageSize = Number.isFinite(requestedSize)
      ? Math.min(
        MAX_PAGE_SIZE,
        Math.max(MIN_PAGE_SIZE, Math.floor(requestedSize)),
      )
      : DEFAULT_PAGE_SIZE;

    if (body.nextToken !== undefined && typeof body.nextToken !== "string") {
      return jsonResponse(
        { success: false, error: "Next token must be a string when provided" },
        400,
      );
    }

    // Verify user has permission to read broadcast state (includes ban + aal2 checks)
    const authResponse = await authorizeAuthenticatedHasPermissionAal2(
      req,
      ["broadcasts.read"],
    );

    if (authResponse) {
      return authResponse;
    }

    const supabase = createPublicServiceRoleClient();
    const { client: ses } = requireSesConfig();

    const result = await ses.send(
      new ListSuppressedDestinationsCommand({
        PageSize: pageSize,
        NextToken: body.nextToken,
      }),
    );

    const summaries = result.SuppressedDestinationSummaries ?? [];

    // Resolve local accounts one address at a time. The RPC is the only way in
    // from an email, and a page tops out at 100 rows.
    const emails = summaries.map((summary) =>
      summary.EmailAddress?.trim().toLowerCase() ?? ""
    );
    const userIdByEmail = new Map<string, string>();

    for (const email of emails) {
      if (!email || userIdByEmail.has(email)) continue;

      const userId = await findUserIdByEmail(supabase, email);
      if (userId) {
        userIdByEmail.set(email, userId);
      }
    }

    // One profiles query for every matched id rather than one per row
    const profileById = new Map<
      string,
      {
        username: string | null;
        bouncedFlag: boolean;
        disabledFlag: boolean;
      }
    >();

    const matchedIds = Array.from(new Set(userIdByEmail.values()));

    if (matchedIds.length > 0) {
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select(
          "id, username, email_notifications_bounced, email_notifications_disabled",
        )
        .in("id", matchedIds);

      if (profilesError) {
        throw new Error(`Failed to fetch profiles: ${profilesError.message}`);
      }

      for (const profile of profiles ?? []) {
        profileById.set(profile.id, {
          username: profile.username ?? null,
          bouncedFlag: profile.email_notifications_bounced ?? false,
          disabledFlag: profile.email_notifications_disabled ?? false,
        });
      }
    }

    const entries: SuppressionEntry[] = summaries.map((summary, index) => {
      const email = emails[index];
      const userId = userIdByEmail.get(email);
      const profile = userId ? profileById.get(userId) : undefined;

      return {
        email,
        reason: summary.Reason ?? null,
        lastUpdate: summary.LastUpdateTime
          ? new Date(summary.LastUpdateTime).toISOString()
          : null,
        sesSuppressed: true,
        user: userId
          ? {
            id: userId,
            username: profile?.username ?? null,
            bouncedFlag: profile?.bouncedFlag ?? false,
            disabledFlag: profile?.disabledFlag ?? false,
          }
          : null,
      };
    });

    // Profiles flagged by the webhook (a DeliveryDelay never creates an SES
    // suppression entry) would otherwise be invisible here, so the first page
    // unions them in. Later pages skip this; the client dedupes by email in
    // case an SES page repeats one of these addresses.
    if (body.nextToken === undefined) {
      const sesEmails = new Set(entries.map((entry) => entry.email));
      const { data: flagged, error: flaggedError } = await supabase.rpc(
        "get_flagged_email_profiles" as never,
      );

      if (flaggedError) {
        throw new Error(
          `Failed to fetch flagged profiles: ${flaggedError.message}`,
        );
      }

      const rows = (flagged ?? []) as unknown as FlaggedProfileRow[];

      for (const row of rows) {
        if (!row.email || sesEmails.has(row.email)) continue;

        entries.push({
          email: row.email,
          reason: null,
          lastUpdate: null,
          sesSuppressed: false,
          user: {
            id: row.id,
            username: row.username ?? null,
            bouncedFlag: row.email_notifications_bounced,
            disabledFlag: row.email_notifications_disabled,
          },
        });
      }
    }

    return jsonResponse({
      success: true,
      entries,
      nextToken: result.NextToken ?? null,
    });
  } catch (err) {
    const error = err as Error;
    console.error("Error in admin-email-suppression-list:", error);

    return jsonResponse(
      {
        success: false,
        error:
          "Internal server error - please email contact@hivecom.net or visit #staff on irc.hivecom.net for support",
      },
      500,
    );
  }
});
