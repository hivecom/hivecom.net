import {
  GetAccountCommand,
  GetEmailIdentityCommand,
  SESv2Client,
} from "@aws-sdk/client-sesv2";
import { corsHeaders } from "../_shared/cors.ts";
import { authorizeAuthenticatedHasPermissionAal2 } from "../_shared/auth.ts";
import { responseMethodNotAllowed } from "../_shared/response.ts";
import { createPublicServiceRoleClient } from "../_shared/serviceRoleClients.ts";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
}

function requireSesConfig(): { client: SESv2Client; from: string } {
  const region = Deno.env.get("AWS_SES_REGION");
  const accessKeyId = Deno.env.get("AWS_SES_ACCESS_KEY_ID");
  const secretAccessKey = Deno.env.get("AWS_SES_SECRET_ACCESS_KEY");
  const from = Deno.env.get("EMAIL_BROADCAST_FROM");

  if (!region || !accessKeyId || !secretAccessKey || !from) {
    throw new Error(
      "Missing SES configuration (AWS_SES_REGION, AWS_SES_ACCESS_KEY_ID, AWS_SES_SECRET_ACCESS_KEY, EMAIL_BROADCAST_FROM)",
    );
  }

  return {
    client: new SESv2Client({
      region,
      credentials: { accessKeyId, secretAccessKey },
    }),
    from,
  };
}

/**
 * Pulls the sending domain out of the configured from address. Handles both
 * the "Hivecom <noreply@hivecom.net>" display name form and a bare address.
 */
function extractDomain(from: string): string | null {
  const angled = from.match(/<([^>]+)>/);
  const address = (angled ? angled[1] : from).trim();
  const at = address.lastIndexOf("@");

  if (at === -1 || at === address.length - 1) return null;

  return address.slice(at + 1).toLowerCase();
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
    // Verify user has permission to read broadcast state (includes ban + aal2 checks)
    const authResponse = await authorizeAuthenticatedHasPermissionAal2(
      req,
      ["broadcasts.read"],
    );

    if (authResponse) {
      return authResponse;
    }

    const { client: ses, from } = requireSesConfig();

    const account = await ses.send(new GetAccountCommand({}));

    const accountSummary = {
      sendingEnabled: account.SendingEnabled ?? false,
      enforcementStatus: account.EnforcementStatus ?? null,
      productionAccess: account.ProductionAccessEnabled ?? false,
      quota: {
        max24HourSend: account.SendQuota?.Max24HourSend ?? null,
        sentLast24Hours: account.SendQuota?.SentLast24Hours ?? null,
        maxSendRate: account.SendQuota?.MaxSendRate ?? null,
      },
      suppressionReasons: account.SuppressionAttributes?.SuppressedReasons ??
        [],
    };

    // Identity health for the domain we actually send from. A missing identity
    // is a real state the page should show, so it degrades to null instead of
    // failing the whole response.
    const domain = extractDomain(from);
    let identity: {
      domain: string;
      verifiedForSending: boolean;
      dkimStatus: string | null;
      dkimTokens: string[];
    } | null = null;

    if (domain) {
      try {
        const result = await ses.send(
          new GetEmailIdentityCommand({ EmailIdentity: domain }),
        );

        identity = {
          domain,
          verifiedForSending: result.VerifiedForSendingStatus ?? false,
          dkimStatus: result.DkimAttributes?.Status ?? null,
          dkimTokens: result.DkimAttributes?.Tokens ?? [],
        };
      } catch (err) {
        const error = err as Error;
        if (error.name !== "NotFoundException") {
          throw error;
        }
        console.warn(`SES identity not found for domain ${domain}`);
      }
    }

    // How many members a full broadcast would reach right now: every profile
    // minus the bounce-flagged ones the send skips. Counted from profiles since
    // every auth user has one; the broadcast function resolves the same set
    // through the Auth Admin API at send time.
    const supabase = createPublicServiceRoleClient();

    const { count: totalProfiles, error: totalError } = await supabase
      .from("profiles")
      .select("id", { count: "exact", head: true });

    const { count: suppressedProfiles, error: suppressedError } = await supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("email_notifications_bounced", true);

    if (totalError || suppressedError) {
      console.warn(
        "Unable to count broadcast recipients:",
        totalError ?? suppressedError,
      );
    }

    const recipients = totalProfiles === null ? null : {
      eligible: totalProfiles - (suppressedProfiles ?? 0),
      suppressed: suppressedProfiles ?? 0,
    };

    return jsonResponse({
      success: true,
      account: accountSummary,
      identity,
      recipients,
    });
  } catch (err) {
    const error = err as Error;
    console.error("Error in admin-email-overview:", error);

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
