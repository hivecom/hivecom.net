import * as webpush from "@negrel/webpush";
import { corsHeaders } from "../_shared/cors.ts";
import { authorizeSystemTrigger } from "../_shared/auth.ts";
import { responseMethodNotAllowed } from "../_shared/response.ts";
import { createPublicServiceRoleClient } from "../_shared/serviceRoleClients.ts";

// Payload sent by the `trigger_send_notification_push` trigger on
// public.user_notifications (one POST per inserted notification row).
interface PushRequest {
  notificationId: string;
  userId: string;
  title: string;
  body?: string | null;
  href?: string | null;
  source?: string | null;
}

// Mirror of the client `sourceLabel()` so the push title matches the in-app
// OS notification (title = friendly source label, body = notification title).
function sourceLabel(source?: string | null): string {
  switch (source) {
    case "discussion_reply":
      return "New discussion reply";
    case "discussion_reply_reply":
      return "New reply to your comment";
    case "mention":
      return "You were mentioned";
    case "event_rescheduled":
      return "Event rescheduled";
    default:
      return "New notification";
  }
}

// ApplicationServer construction is relatively expensive (imports VAPID keys);
// cache it across warm invocations of the same isolate.
let cachedAppServer:
  | Awaited<
    ReturnType<typeof webpush.ApplicationServer.new>
  >
  | null = null;

async function getApplicationServer() {
  if (cachedAppServer) return cachedAppServer;

  const raw = Deno.env.get("VAPID_KEYS");
  if (!raw) {
    throw new Error("Missing VAPID_KEYS (exported VAPID JWK pair)");
  }

  const subject = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@hivecom.net";
  const vapidKeys = await webpush.importVapidKeys(JSON.parse(raw), {
    extractable: false,
  });

  cachedAppServer = await webpush.ApplicationServer.new({
    contactInformation: subject,
    vapidKeys,
  });

  return cachedAppServer;
}

interface SubscriptionRow {
  endpoint: string;
  p256dh: string;
  auth: string;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return responseMethodNotAllowed(req.method);
  }

  const authResponse = authorizeSystemTrigger(req);
  if (authResponse) {
    return authResponse;
  }

  let payload: PushRequest;
  try {
    payload = await req.json() as PushRequest;
  } catch {
    return jsonResponse({ success: false, error: "Invalid JSON body" }, 400);
  }

  if (!payload.userId || !payload.title) {
    return jsonResponse(
      { success: false, error: "Missing required fields: userId, title" },
      400,
    );
  }

  const supabase = createPublicServiceRoleClient();

  // Honour the user's opt-in preference. Settings are a JSON blob keyed by the
  // user's profile id; skip delivery unless push is explicitly enabled.
  const { data: settingsRow } = await supabase
    .from("user_settings")
    .select("data")
    .eq("id", payload.userId)
    .maybeSingle();

  const settings = settingsRow?.data as
    | { app_push_notifications?: boolean }
    | null;

  if (!settings?.app_push_notifications) {
    return jsonResponse({ success: true, skipped: "push_disabled" });
  }

  const { data: subscriptions, error: subsError } = await supabase
    .from("user_push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("user_id", payload.userId);

  if (subsError) {
    console.error("Failed to load push subscriptions:", subsError.message);
    return jsonResponse({ success: false, error: subsError.message }, 500);
  }

  if (!subscriptions || subscriptions.length === 0) {
    return jsonResponse({ success: true, sent: 0 });
  }

  // Unread count for the app icon badge (PWA dock / home screen).
  const { count: unreadCount } = await supabase
    .from("user_notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", payload.userId)
    .eq("is_read", false);

  const appServer = await getApplicationServer();

  const message = JSON.stringify({
    title: sourceLabel(payload.source),
    body: payload.title,
    href: payload.href ?? "/",
    tag: `app-notification-${payload.notificationId}`,
    unreadCount: unreadCount ?? undefined,
  });

  let sent = 0;
  const staleEndpoints: string[] = [];

  await Promise.all(
    (subscriptions as SubscriptionRow[]).map(async (sub) => {
      try {
        const subscriber = appServer.subscribe({
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        });
        await subscriber.pushTextMessage(message, {});
        sent += 1;
      } catch (err) {
        // 404/410 mean the subscription is gone for good - prune it.
        const status = (err as { response?: { status?: number } })?.response
          ?.status;
        if (status === 404 || status === 410) {
          staleEndpoints.push(sub.endpoint);
        } else {
          console.error(
            `Push delivery failed for endpoint (status ${status ?? "?"}):`,
            err instanceof Error ? err.message : String(err),
          );
        }
      }
    }),
  );

  if (staleEndpoints.length > 0) {
    await supabase
      .from("user_push_subscriptions")
      .delete()
      .in("endpoint", staleEndpoints);
  }

  return jsonResponse({ success: true, sent, pruned: staleEndpoints.length });
});
