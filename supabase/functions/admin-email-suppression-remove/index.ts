import {
  DeleteSuppressedDestinationCommand,
  SESv2Client,
} from "@aws-sdk/client-sesv2";
import { corsHeaders } from "../_shared/cors.ts";
import { authorizeAuthenticatedHasPermissionAal2 } from "../_shared/auth.ts";
import { responseMethodNotAllowed } from "../_shared/response.ts";
import { createPublicServiceRoleClient } from "../_shared/serviceRoleClients.ts";
import type { Database } from "database-types";

interface SuppressionRemoveRequest {
  email: string;
}

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
    const body: SuppressionRemoveRequest = await req.json();
    const { email } = body;

    if (!email || typeof email !== "string" || !email.trim()) {
      return jsonResponse(
        { success: false, error: "Email is required" },
        400,
      );
    }

    const target = email.trim().toLowerCase();

    // Removing a suppression changes who future broadcasts reach, so this
    // takes the send permission rather than the read one.
    const authResponse = await authorizeAuthenticatedHasPermissionAal2(
      req,
      ["broadcasts.create"],
    );

    if (authResponse) {
      return authResponse;
    }

    const supabase = createPublicServiceRoleClient();
    const { client: ses } = requireSesConfig();

    // An address SES has already dropped is the state we wanted anyway, so a
    // missing entry still lets the local cleanup below run.
    let removedFromSes = true;
    try {
      await ses.send(
        new DeleteSuppressedDestinationCommand({ EmailAddress: target }),
      );
    } catch (err) {
      const error = err as Error;
      if (error.name !== "NotFoundException") {
        throw error;
      }
      removedFromSes = false;
      console.warn(`Address ${target} was not on the SES suppression list`);
    }

    let profileCleared = false;
    const userId = await findUserIdByEmail(supabase, target);

    if (userId) {
      const updatePayload = {
        email_notifications_bounced: false,
        email_notifications_disabled: false,
      } satisfies Database["public"]["Tables"]["profiles"]["Update"];

      const { error: updateError } = await supabase
        .from("profiles")
        .update(updatePayload)
        .eq("id", userId);

      if (updateError) {
        throw new Error(
          `Failed to clear profile flags: ${updateError.message}`,
        );
      }

      profileCleared = true;
    }

    console.log(
      `Suppression removal for ${target}: removedFromSes=${removedFromSes}, profileCleared=${profileCleared}`,
    );

    return jsonResponse({
      success: true,
      email: target,
      removedFromSes,
      profileCleared,
    });
  } catch (err) {
    const error = err as Error;
    console.error("Error in admin-email-suppression-remove:", error);

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
