import { getPublishableKey } from "../_shared/env.ts";
import { SendEmailCommand, SESv2Client } from "@aws-sdk/client-sesv2";
import { createClient } from "@supabase/supabase-js";
import { corsHeaders } from "../_shared/cors.ts";
import {
  authorizeAuthenticatedHasPermissionAal2,
  getAuthenticatedUserId,
} from "../_shared/auth.ts";
import { responseMethodNotAllowed } from "../_shared/response.ts";
import { createPublicServiceRoleClient } from "../_shared/serviceRoleClients.ts";
import { renderBroadcastEmail } from "broadcast-email";
import type { Database } from "database-types";

interface BroadcastRequest {
  subject: string;
  text: string; // Plain text body, always required as the fallback part
  html?: string; // Optional inner HTML rendered by the admin portal, wrapped here
  mode: "test" | "send"; // "test" only mails the caller, "send" goes to everyone
  centered?: boolean; // Content alignment in the email shell, defaults to centered
}

interface BroadcastFailure {
  email: string;
  error: string;
}

// Batches sent concurrently. SES default rate limits sit well above this, and
// a full member-base send stays comfortably inside the function wall clock.
const SEND_BATCH_SIZE = 10;

const PARAGRAPH_SPLIT_RE = /\n{2,}/;
const NEWLINE_RE = /\n/g;
const AMP_RE = /&/g;
const LT_RE = /</g;
const GT_RE = />/g;

/**
 * Fallback inner HTML for text-only broadcasts: one paragraph per blank-line
 * separated block, single newlines kept as line breaks. The text part is raw
 * user input, so it gets escaped before it lands in the HTML part.
 */
function textToInnerHtml(text: string): string {
  return text
    .split(PARAGRAPH_SPLIT_RE)
    .map((block) => block.trim())
    .filter((block) => block.length > 0)
    .map((block) =>
      `<p>${
        block
          .replace(AMP_RE, "&amp;")
          .replace(LT_RE, "&lt;")
          .replace(GT_RE, "&gt;")
          .replace(NEWLINE_RE, "<br />")
      }</p>`
    )
    .join("\n");
}

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

async function sendOne(
  ses: SESv2Client,
  from: string,
  to: string,
  subject: string,
  text: string,
  html?: string,
): Promise<void> {
  await ses.send(
    new SendEmailCommand({
      FromEmailAddress: from,
      Destination: { ToAddresses: [to] },
      Content: {
        Simple: {
          Subject: { Data: subject, Charset: "UTF-8" },
          Body: {
            Text: { Data: text, Charset: "UTF-8" },
            ...(html ? { Html: { Data: html, Charset: "UTF-8" } } : {}),
          },
        },
      },
    }),
  );
}

/**
 * Collects every account email via the Auth Admin API, paired with the
 * profile's bounce flag so hard-bounced addresses can be skipped. Broadcasts
 * are service notices, so the opt-out style notification preference does not
 * apply - only deliverability problems exclude an address.
 */
async function collectRecipients(
  supabase: ReturnType<typeof createPublicServiceRoleClient>,
): Promise<{ recipients: string[]; skipped: string[] }> {
  const { data: bouncedProfiles, error: bouncedError } = await supabase
    .from("profiles")
    .select("id")
    .eq("email_notifications_bounced", true);

  if (bouncedError) {
    throw new Error(`Failed to fetch bounce flags: ${bouncedError.message}`);
  }

  const bouncedIds = new Set((bouncedProfiles ?? []).map((p) => p.id));

  const recipients: string[] = [];
  const skipped: string[] = [];
  const perPage = 1000;
  let page = 1;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage,
    });

    if (error) {
      throw new Error(`Failed to list users: ${error.message}`);
    }

    for (const user of data.users) {
      if (!user.email) continue;
      if (bouncedIds.has(user.id)) {
        skipped.push(user.email);
        continue;
      }
      recipients.push(user.email);
    }

    if (data.users.length < perPage) break;
    page++;
  }

  return { recipients, skipped };
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
    const body: BroadcastRequest = await req.json();
    const { subject, text, html, mode, centered } = body;

    if (centered !== undefined && typeof centered !== "boolean") {
      return jsonResponse(
        { success: false, error: "Centered must be a boolean when provided" },
        400,
      );
    }

    if (!subject || typeof subject !== "string" || !subject.trim()) {
      return jsonResponse(
        { success: false, error: "Subject is required" },
        400,
      );
    }

    if (!text || typeof text !== "string" || !text.trim()) {
      return jsonResponse(
        { success: false, error: "A plain text body is required" },
        400,
      );
    }

    if (html !== undefined && typeof html !== "string") {
      return jsonResponse(
        { success: false, error: "HTML body must be a string when provided" },
        400,
      );
    }

    if (mode !== "test" && mode !== "send") {
      return jsonResponse(
        {
          success: false,
          error: "Mode is required and must be either 'test' or 'send'",
        },
        400,
      );
    }

    // Verify user has permission to send broadcasts (includes ban + aal2 checks)
    const authResponse = await authorizeAuthenticatedHasPermissionAal2(
      req,
      ["broadcasts.create"],
    );

    if (authResponse) {
      return authResponse;
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse(
        { success: false, error: "Authorization header missing" },
        401,
      );
    }

    const tempClient = createClient<Database>(
      Deno.env.get("SUPABASE_URL") ?? "",
      getPublishableKey(),
      {
        global: {
          headers: { Authorization: authHeader },
        },
      },
    );

    const currentUser = await getAuthenticatedUserId(tempClient, authHeader);
    if ("response" in currentUser) {
      return currentUser.response;
    }

    const supabase = createPublicServiceRoleClient();
    const { client: ses, from } = requireSesConfig();

    // Resolve the recipient list
    let recipients: string[];
    let skipped: string[] = [];

    if (mode === "test") {
      const { data: callerData, error: callerError } = await supabase.auth
        .admin.getUserById(currentUser.userId);

      if (callerError || !callerData.user.email) {
        return jsonResponse(
          { success: false, error: "Unable to resolve your account email" },
          500,
        );
      }

      recipients = [callerData.user.email];
    } else {
      const collected = await collectRecipients(supabase);
      recipients = collected.recipients;
      skipped = collected.skipped;
    }

    console.log(
      `Broadcast (${mode}) "${subject}" starting: ${recipients.length} recipients, ${skipped.length} skipped as bounced`,
    );

    // The request carries the inner body only. Everything visual (the dark card,
    // the logo header, the footer) is added here so every broadcast matches the
    // hand-crafted templates in supabase/email.
    const innerHtml = html && html.trim() ? html : textToInnerHtml(text);
    const wrappedHtml = renderBroadcastEmail(subject.trim(), innerHtml, {
      centered: centered ?? true,
    });

    // Send in small concurrent batches, collecting failures instead of aborting
    let sent = 0;
    const failures: BroadcastFailure[] = [];

    for (let i = 0; i < recipients.length; i += SEND_BATCH_SIZE) {
      const batch = recipients.slice(i, i + SEND_BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map((to) => sendOne(ses, from, to, subject, text, wrappedHtml)),
      );

      results.forEach((result, index) => {
        if (result.status === "fulfilled") {
          sent++;
        } else {
          failures.push({
            email: batch[index],
            error: result.reason instanceof Error
              ? result.reason.message
              : String(result.reason),
          });
        }
      });
    }

    console.log(
      `Broadcast (${mode}) "${subject}" finished: ${sent} sent, ${failures.length} failed`,
    );

    return jsonResponse({
      success: failures.length === 0,
      mode,
      total: recipients.length,
      sent,
      skipped: skipped.length,
      failed: failures.length,
      failures,
    });
  } catch (err) {
    const error = err as Error;
    console.error("Error in admin-email-broadcast:", error);

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
