
import * as constants from "app-constants" with { type: "json" };
import { createClient } from "@supabase/supabase-js";
import { corsHeaders } from "../_shared/cors.ts";
import { authorizeSystemCron } from "../_shared/auth.ts";
import { Database } from "database-types";

Deno.serve(async (req: Request) => {
  // Skip CORS preflight check for OPTIONS requests as this should not originate from a browser.
  try {
    // Authorize the request using the system cron authorization function
    const authorizeResponse = authorizeSystemCron(req);
    if (authorizeResponse) {
      console.error("Authorization failed:", authorizeResponse.statusText);

      return authorizeResponse;
    }

    const PATREON_ACCESS_TOKEN = Deno.env.get("PATREON_ACCESS_TOKEN");
    const PATREON_CAMPAIGN_ID = Deno.env.get("PATREON_CAMPAIGN_ID");
    const PATREON_CAMPAIGN_SUPPORTER_TIER_ID = Deno.env.get("PATREON_CAMPAIGN_SUPPORTER_TIER_ID");

    if (!PATREON_ACCESS_TOKEN) {
      throw new Error("PATREON_ACCESS_TOKEN environment variable is not set");
    }

    if (!PATREON_CAMPAIGN_ID) {
      throw new Error("PATREON_CAMPAIGN_ID environment variable is not set");
    }

    if (!PATREON_CAMPAIGN_SUPPORTER_TIER_ID) {
      throw new Error("PATREON_CAMPAIGN_SUPPORTER_TIER_ID environment variable is not set");
    }

    // Create a Supabase client with the service role key (full admin access)
    // Don't pass Authorization header from the request
    const supabaseClient = createClient<Database>(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // Fetch the latest Patreon contribution records for our campaign.
    // Using currently_entitled_amount_cents since it represents the amount the patron is entitled to in the campaign's currency (Euro)
    const patreonUrl = `https://patreon.com/api/oauth2/v2/campaigns/${PATREON_CAMPAIGN_ID}/members?fields%5Bmember%5D=full_name,campaign_lifetime_support_cents,currently_entitled_amount_cents,last_charge_date,last_charge_status,patron_status,note,is_free_trial,is_gifted,will_pay_amount_cents&include=currently_entitled_tiers`;

    console.log("Fetching Patreon data from:", patreonUrl);

    const patreonResponse = await fetch(patreonUrl, {
      headers: {
        Authorization: `Bearer ${PATREON_ACCESS_TOKEN}`,
        Accept: "application/json",
      },
    });

    if (!patreonResponse.ok) {
      throw new Error(`Patreon API returned ${patreonResponse.status}: ${await patreonResponse.text()}`);
    }

    const patreonData = await patreonResponse.json();

    // Parse the patreon data to get member information
    const members = patreonData.data || [];
    console.log(`Found ${members.length} Patreon members`);

    // Calculate total monthly funding by summing up the currently_entitled_amount_cents of all active patrons
    // This value is already in cents in the campaign's currency (Euro)
    let monthlyPatreonCents = 0;
    let lifetimePatreonCents = 0;

    // Track patrons by ID for profile updates
    const activePatronIds: string[] = [];
    const supporterPatronIds: string[] = [];

    // Process each member to calculate total and identify supporters
    for (const member of members) {
      // Track lifetime total from all members regardless of status
      if (member.attributes.campaign_lifetime_support_cents) {
        lifetimePatreonCents += member.attributes.campaign_lifetime_support_cents;
      }

      // Only include active patrons in the monthly totals
      if (member.attributes.patron_status === "active_patron" &&
          member.attributes.last_charge_status === "Paid") {

        // Add to monthly total keeping the value in cents
        const patronAmountCents = member.attributes.currently_entitled_amount_cents;
        monthlyPatreonCents += patronAmountCents;

        console.log(`Patron ${member.id}: €${patronAmountCents / 100} (${patronAmountCents} cents)`);

        // Track this active patron's ID
        const patronId = member.id;
        activePatronIds.push(patronId);

        // Check if this patron is entitled to the supporter tier
        const entitledTiers = member.relationships?.currently_entitled_tiers?.data || [];
        const isSupporterTier = entitledTiers.some(
          (tier: { id: string }) => tier.id === PATREON_CAMPAIGN_SUPPORTER_TIER_ID
        );

        if (isSupporterTier) {
          supporterPatronIds.push(patronId);
        }
      }
    }

    // The totals calculated in cents
    const monthlyPatreonTotal = Math.round(monthlyPatreonCents);
    const lifetimePatreonTotal = Math.round(lifetimePatreonCents);

    console.log(`Active patrons: ${activePatronIds.length}, Supporters: ${supporterPatronIds.length}`);
    console.log(`Monthly Patreon total: ${monthlyPatreonTotal} cents (€${monthlyPatreonTotal / 100})`);
    console.log(`Lifetime Patreon total: ${lifetimePatreonTotal} cents (€${lifetimePatreonTotal / 100})`);

    // Get the current month in YYYY-MM-DD format for the monthly funding record
    // Using the first day of the month as the date
    const now = new Date();
    const currentMonthDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

    console.log(`Updating monthly funding record for date: ${currentMonthDate}`);

    // Upsert the monthly funding record for this month based on the Patreon data
    // Using the new column structure as per the DB schema changes
    const { error: upsertError } = await supabaseClient
      .from("monthly_funding")
      .upsert({
        month: currentMonthDate,
        patreon_amount: monthlyPatreonTotal, // Monthly amount in cents
        patreon_count: activePatronIds.length, // Number of active patrons
        patreon_lifetime: lifetimePatreonTotal, // Lifetime total in cents
      }, {
        onConflict: "month",
      });

    if (upsertError) {
      console.error("Error upserting monthly funding:", upsertError);
      throw new Error(`Failed to update monthly funding record: ${upsertError.message}`);
    }

    // Update supporter status for all profiles with patreon_id
    // First, set all users with patreon_id to false initially
    const { error: resetError } = await supabaseClient
      .from("profiles")
      .update({ supporter_patreon: false })
      .not("patreon_id", "is", null);

    if (resetError) {
      console.error("Error resetting supporter status:", resetError);
      throw new Error(`Failed to reset supporter status: ${resetError.message}`);
    }

    // Then, set supporter_patreon to true for users with matching patreon_id in the supporter tier
    let supporterUpdateResult = null;
    if (supporterPatronIds.length > 0) {
      const { data: updatedProfiles, error: supporterError } = await supabaseClient
        .from("profiles")
        .update({ supporter_patreon: true })
        .in("patreon_id", supporterPatronIds)
        .select("id, username, patreon_id");

      if (supporterError) {
        console.error("Error updating supporter profiles:", supporterError);
        throw new Error(`Failed to update supporter profiles: ${supporterError.message}`);
      }

      supporterUpdateResult = updatedProfiles;
    }

    const results = {
      monthlyPatreon: monthlyPatreonTotal / 100,
      lifetimePatreon: lifetimePatreonTotal / 100,
      currentMonth: currentMonthDate,
      activePatrons: activePatronIds.length,
      supporters: supporterPatronIds.length,
      updatedProfiles: supporterUpdateResult?.length || 0,
    };

    console.log("Processed records:", results);

    return new Response(
      JSON.stringify({
        success: true,
        message: "Processed Patreon records successfully",
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const error = err as Error;
    console.error("Error in cron-patreon-fetch:", error);

    return new Response(
      JSON.stringify({
        success: false,
        error: constants.default.API_ERROR,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      },
    );
  }
});
