// ---------------------------------------------------------------------------
// Discord notification helper
// ---------------------------------------------------------------------------
// DISCORD_NOTIFICATION_WEBHOOK_URL maps from the vault secret
// system_discord_notification_webhook_url. No-ops when unset.

interface DiscordEmbed {
  title?: string;
  description?: string;
  color?: number;
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
  timestamp?: string;
}

interface DiscordWebhookPayload {
  content?: string;
  embeds?: DiscordEmbed[];
}

export async function sendDiscordNotification(
  payload: DiscordWebhookPayload,
): Promise<void> {
  const webhookUrl = Deno.env.get("DISCORD_NOTIFICATION_WEBHOOK_URL");

  if (!webhookUrl || webhookUrl === "REPLACE-ME") {
    console.warn(
      "sendDiscordNotification: webhook URL not configured, skipping",
    );
    return;
  }

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    console.error(
      `sendDiscordNotification: webhook responded with ${res.status}`,
      await res.text(),
    );
  }
}
