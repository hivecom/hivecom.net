import * as constants from "constants" with { type: "json" };
import { corsHeaders } from "../_shared/cors.ts";
import { createPublicServiceRoleClient } from "../_shared/serviceRoleClients.ts";
import { sendDiscordNotification } from "../_shared/discord.ts";
import type { Database, Tables } from "database-types";

type MonthlyFunding = Database["public"]["Tables"]["funding_history"]["Row"];
type ProfilePoints = Database["public"]["Tables"]["profile_points"]["Row"];

const supabase = createPublicServiceRoleClient();

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  console.log("Ko-fi webhook received", {
    method: req.method,
    contentType: req.headers.get("content-type"),
  });

  try {
    // Verify token
    const kofiToken = Deno.env.get("KOFI_VERIFICATION_TOKEN");
    if (!kofiToken) {
      console.error("KOFI_VERIFICATION_TOKEN env var is not set");
      return jsonResponse({ error: constants.default.API_ERROR }, 500);
    }

    // Parse form data - Ko-fi sends application/x-www-form-urlencoded with a `data` field
    const formData = await req.formData();
    const raw = formData.get("data");
    if (!raw || typeof raw !== "string") {
      return jsonResponse({ error: "Missing data field" }, 400);
    }

    const payload = JSON.parse(raw) as {
      verification_token: string;
      type: string;
      amount: string;
      email?: string;
      kofi_transaction_id?: string;
      timestamp?: string;
      message?: string;
    };

    // Validate verification token
    if (payload.verification_token !== kofiToken) {
      console.warn("Ko-fi token mismatch");
      return jsonResponse({ error: "Forbidden" }, 403);
    }

    // Only process Donation type
    if (payload.type !== "Donation") {
      console.log("Ko-fi event ignored - not a Donation", {
        type: payload.type,
      });
      return jsonResponse({ ok: true, ignored: payload.type }, 200);
    }

    // Parse amount (string like "3.00") to cents
    const amountCents = Math.round(parseFloat(payload.amount) * 100);
    if (isNaN(amountCents) || amountCents <= 0) {
      console.warn("Invalid Ko-fi amount", { amount: payload.amount });
      return jsonResponse({ error: "Invalid amount" }, 400);
    }

    console.log("Ko-fi donation parsed", { amountCents, type: payload.type });

    // Read points rate from kvstore
    const { data: kvRow } = await supabase
      .from("kvstore")
      .select("value")
      .eq("key", "points_per_cent")
      .eq("type", "NUMBER")
      .maybeSingle();

    const rate: number =
      kvRow?.value != null && typeof kvRow.value === "number" && kvRow.value > 0
        ? kvRow.value
        : 1;

    const points = Math.round(amountCents * rate);
    console.log("Points computed", { rate, points });

    // Current month date YYYY-MM-01
    const now = new Date();
    const monthDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")
      }-01`;

    // Fetch existing funding_history row
    const { data: existingMonth, error: monthFetchError } = await supabase
      .from("funding_history")
      .select("*")
      .eq("month", monthDate)
      .maybeSingle();

    if (monthFetchError) {
      console.error("Failed to fetch monthly_funding", monthFetchError);
      throw new Error(monthFetchError.message);
    }

    if (existingMonth) {
      const updated: Partial<MonthlyFunding> = {
        donation_month_amount_cents:
          (existingMonth.donation_month_amount_cents ?? 0) + amountCents,
        donation_lifetime_amount_cents:
          (existingMonth.donation_lifetime_amount_cents ?? 0) + amountCents,
        donation_count: (existingMonth.donation_count ?? 0) + 1,
      };

      const { error: updateError } = await supabase
        .from("funding_history")
        .update(updated)
        .eq("month", monthDate);

      if (updateError) {
        console.error("Failed to update monthly_funding", updateError);
        throw new Error(updateError.message);
      }
    } else {
      const { error: insertError } = await supabase
        .from("funding_history")
        .insert({
          month: monthDate,
          donation_month_amount_cents: amountCents,
          donation_lifetime_amount_cents: amountCents,
          donation_count: 1,
          patreon_month_amount_cents: 0,
          patreon_lifetime_amount_cents: 0,
          patreon_count: 0,
        });

      if (insertError) {
        console.error("Failed to insert monthly_funding", insertError);
        throw new Error(insertError.message);
      }
    }

    console.log("monthly_funding updated", { monthDate, amountCents });

    // Email match
    let userMatched = false;
    let userId: string | undefined;

    if (payload.email) {
      const email = payload.email.trim().toLowerCase();
      const { data: rpcData, error: rpcError } = await supabase.rpc(
        "get_user_id_by_email",
        { email },
      );

      if (rpcError) {
        console.error("get_user_id_by_email RPC failed", rpcError);
      } else {
        const rows = rpcData as Array<{ id: string }> | null;
        userId = rows?.[0]?.id ?? undefined;
      }

      console.log("Email match result", {
        email,
        userId: userId ?? "not found",
      });
    }

    if (userId) {
      userMatched = true;

      // Fetch existing profile_points row
      const { data: existingPoints, error: pointsFetchError } = await supabase
        .from("profile_points")
        .select("*")
        .eq("profile_id", userId)
        .maybeSingle();

      if (pointsFetchError) {
        console.error("Failed to fetch profile_points", pointsFetchError);
        throw new Error((pointsFetchError as { message: string }).message);
      }

      if (existingPoints) {
        const row = existingPoints as ProfilePoints;
        const { error: pointsUpdateError } = await supabase
          .from("profile_points")
          .update(
            {
              points_donations: (row.points_donations ?? 0) + points,
            } satisfies Partial<Tables<"profile_points">>,
          )
          .eq("profile_id", userId);

        if (pointsUpdateError) {
          console.error("Failed to update profile_points", pointsUpdateError);
          throw new Error((pointsUpdateError as { message: string }).message);
        }
      } else {
        const { error: pointsInsertError } = await supabase
          .from("profile_points")
          .insert(
            {
              profile_id: userId,
              points_donations: points,
              points_patreon: 0,
              points_spent: 0,
              public: true,
            } satisfies Partial<Tables<"profile_points">>,
          );

        if (pointsInsertError) {
          console.error("Failed to insert profile_points", pointsInsertError);
          throw new Error((pointsInsertError as { message: string }).message);
        }
      }

      console.log("Points awarded", { userId, points });

      // Best-effort: write history row
      const { error: historyInsertError } = await supabase
        .from("profile_point_history")
        .insert({
          profile_id: userId,
          amount: points,
          source: "donation",
        });

      if (historyInsertError) {
        console.error(
          "Failed to insert profile_point_history",
          historyInsertError,
        );
      }
    } else if (payload.email) {
      // No matched profile - store as a pending claim keyed by donor email
      const email = payload.email.trim().toLowerCase();
      const { error: claimInsertError } = await supabase
        .from("profile_point_claims")
        .insert({ email, points, source: "donation" });

      if (claimInsertError) {
        console.error(
          "Failed to insert profile_point_claims",
          claimInsertError,
        );
      } else {
        console.log("Pending claim created", { email, points });
      }
    }

    // Best-effort: notify Discord
    const amountFormatted = `€${(amountCents / 100).toFixed(2)}`;

    // Fetch updated month total for the notification
    const { data: updatedMonth } = await supabase
      .from("funding_history")
      .select("donation_month_amount_cents")
      .eq("month", monthDate)
      .maybeSingle();

    const monthTotal = updatedMonth?.donation_month_amount_cents ?? amountCents;
    const monthTotalFormatted = `€${(monthTotal / 100).toFixed(2)}`;
    const monthLabel = new Date(monthDate).toLocaleString("en-GB", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });

    const emailField = payload.email
      ? (userMatched ? payload.email : `${payload.email} (no user matched)`)
      : "No email provided";

    await sendDiscordNotification({
      content: "💛 **Ko-fi Donation Received**",
      embeds: [{
        title: "Ko-fi Donation Received",
        color: 0x29ABE0,
        fields: [
          { name: "Amount", value: amountFormatted, inline: true },
          { name: `Month-to-Date Total (${monthLabel})`, value: monthTotalFormatted, inline: true },
          { name: "Email", value: emailField, inline: true },
        ],
        timestamp: new Date().toISOString(),
      }],
    });

    return jsonResponse({
      ok: true,
      results: { amountCents, points, monthDate, userMatched, userId },
    });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    console.error("Error in webhook-kofi-donation:", error);

    return jsonResponse(
      { success: false, error: constants.default.API_ERROR },
      500,
    );
  }
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
