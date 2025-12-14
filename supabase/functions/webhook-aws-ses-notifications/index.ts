import { corsHeaders } from "../_shared/cors.ts";
import { createPublicServiceRoleClient } from "../_shared/serviceRoleClients.ts";
import type { Database } from "database-types";

type SnsMessage = {
  Type: "Notification" | "SubscriptionConfirmation" | "UnsubscribeConfirmation";
  MessageId: string;
  TopicArn: string;
  Subject?: string;
  Message: string;
  Timestamp: string;
  SignatureVersion: string;
  Signature: string;
  SigningCertURL: string;
  UnsubscribeURL?: string;
  SubscribeURL?: string;
  Token?: string;
  MessageAttributes?: Record<string, unknown>;
};

type SesNotificationType =
  | "Bounce"
  | "Complaint"
  | "Delivery"
  | "DeliveryDelay"
  | "Reject"
  | "RenderingFailure";

type SesNotification = {
  notificationType: SesNotificationType;
  eventType?: SesNotificationType; // present when using event publishing
  mail: { destination: string[]; messageId: string };
  bounce?: { bouncedRecipients: Array<{ emailAddress: string }> };
  complaint?: { complainedRecipients: Array<{ emailAddress: string }> };
  delivery?: {
    recipients?: string[];
    delayedRecipients?: Array<{ emailAddress: string }>;
  };
  deliveryDelay?: { delayedRecipients: Array<{ emailAddress: string }> };
  reject?: { recipients: Array<{ emailAddress: string }> };
  renderingFailure?: { failedRecipients: Array<{ emailAddress: string }> };
};

const topicAllowlist = (Deno.env.get("AWS_SNS_SES_TOPIC_ARN") ?? "")
  .split(",")
  .map((x) => x.trim())
  .filter(Boolean);

const supabase = createPublicServiceRoleClient();

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const messageType = req.headers.get("x-amz-sns-message-type");
  if (!messageType) {
    return jsonResponse({ error: "Missing SNS message type" }, 400);
  }

  let sns: SnsMessage;
  try {
    sns = await req.json();
  } catch (error) {
    console.error("Invalid SNS payload", error);
    return jsonResponse({ error: "Invalid SNS payload" }, 400);
  }

  if (!isMessageFromAllowedTopic(sns.TopicArn)) {
    console.warn("Blocked SNS message from unexpected topic", sns.TopicArn);
    return jsonResponse({ error: "Unexpected topic" }, 403);
  }

  const signatureValid = await verifySnsSignature(sns).catch((error) => {
    console.error("SNS signature verification failed", error);
    return false;
  });
  if (!signatureValid) {
    return jsonResponse({ error: "Invalid SNS signature" }, 403);
  }

  if (sns.Type === "SubscriptionConfirmation" && sns.SubscribeURL) {
    const confirmed = await confirmSubscription(sns.SubscribeURL);
    return jsonResponse({ ok: confirmed ? true : false }, confirmed ? 200 : 500);
  }

  if (sns.Type !== "Notification") {
    return jsonResponse({ ok: true, ignored: sns.Type }, 200);
  }

  let ses: SesNotification;
  try {
    ses = JSON.parse(sns.Message);
  } catch (error) {
    console.error("Failed to parse SES message", error);
    return jsonResponse({ error: "Invalid SES message" }, 400);
  }

  const emails = extractEmails(ses);
  if (emails.length === 0) {
    return jsonResponse({ ok: true, message: "No recipients" }, 200);
  }

  const notificationKind = ses.notificationType ?? ses.eventType;
  const results = await flagEmails(emails, notificationKind ?? "Bounce");

  return jsonResponse({ ok: true, results }, 200);
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isMessageFromAllowedTopic(topicArn: string): boolean {
  if (topicAllowlist.length === 0) return true;
  return topicAllowlist.includes(topicArn);
}

async function confirmSubscription(subscribeUrl: string): Promise<boolean> {
  try {
    const res = await fetch(subscribeUrl, { method: "GET" });
    if (!res.ok) {
      console.error("SNS subscription confirmation failed", res.status, res.statusText);
      return false;
    }
    return true;
  } catch (error) {
    console.error("SNS subscription confirmation error", error);
    return false;
  }
}

function extractEmails(ses: SesNotification): string[] {
  const recipients = new Set<string>();

  const push = (email?: string) => {
    if (!email) return;
    recipients.add(email.trim().toLowerCase());
  };

  ses.mail?.destination?.forEach(push);
  ses.bounce?.bouncedRecipients?.forEach((r) => push(r.emailAddress));
  ses.complaint?.complainedRecipients?.forEach((r) => push(r.emailAddress));
  ses.delivery?.recipients?.forEach(push);
  ses.delivery?.delayedRecipients?.forEach((r) => push(r.emailAddress));
  ses.deliveryDelay?.delayedRecipients?.forEach((r) => push(r.emailAddress));
  ses.reject?.recipients?.forEach((r) => push(r.emailAddress));
  ses.renderingFailure?.failedRecipients?.forEach((r) => push(r.emailAddress));

  return Array.from(recipients);
}

async function findUserIdByEmail(email: string): Promise<string | undefined> {
  const target = email.trim().toLowerCase();
  const { data, error } = await supabase.rpc(
    "get_user_id_by_email" as never,
    { email: target } as never,
  );
  if (error) {
    console.error("Failed to fetch user id by email via RPC", error);
    return undefined;
  }
  const rows = data as Array<{ id: string }> | null;
  const userId = rows?.[0]?.id;
  return userId ?? undefined;
}

async function flagEmails(emails: string[], reason: SesNotificationType) {
  const summary: Array<{ email: string; updated: boolean; error?: string }> = [];

  for (const email of emails) {
    try {
      const userId = await findUserIdByEmail(email);

      if (!userId) {
        summary.push({ email, updated: false, error: "user-not-found" });
        continue;
      }

      const updatePayload = {
        email_notifications_bounced: true,
        email_notifications_disabled: true,
      } satisfies Database["public"]["Tables"]["profiles"]["Update"];

      const { error: updateError } = await supabase
        .from("profiles")
        .update(updatePayload)
        .eq("id", userId);

      if (updateError) {
        summary.push({ email, updated: false, error: updateError.message });
        continue;
      }

      summary.push({ email, updated: true });
      console.log(`Flagged email ${email} due to ${reason}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      summary.push({ email, updated: false, error: message });
    }
  }

  return summary;
}

async function verifySnsSignature(message: SnsMessage): Promise<boolean> {
  if (message.SignatureVersion !== "1") return false;

  const certUrl = new URL(message.SigningCertURL);
  const host = certUrl.host.toLowerCase();
  if (!certUrl.protocol.startsWith("https")) return false;
  if (!host.endsWith("amazonaws.com")) return false;
  if (!certUrl.pathname.includes("/sns.")) return false;

  const certPem = await fetch(certUrl.toString()).then((res) => res.text());
  const certBytes = pemToArrayBuffer(certPem);
  const key = await crypto.subtle.importKey(
    "spki",
    certBytes,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-1" },
    false,
    ["verify"],
  );

  const stringToSign = buildStringToSign(message);
  const signature = base64ToArrayBuffer(message.Signature);
  const data = new TextEncoder().encode(stringToSign);

  return crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, signature, data);
}

function buildStringToSign(message: SnsMessage): string {
  const lines: string[] = [];

  const add = (label: string, value?: string) => {
    if (value === undefined) return;
    lines.push(`${label}\n${value}\n`);
  };

  if (message.Type === "Notification") {
    add("Message", message.Message);
    add("MessageId", message.MessageId);
    if (message.Subject) add("Subject", message.Subject);
    add("Timestamp", message.Timestamp);
    add("TopicArn", message.TopicArn);
    add("Type", message.Type);
  } else if (message.Type === "SubscriptionConfirmation" || message.Type === "UnsubscribeConfirmation") {
    add("Message", message.Message);
    add("MessageId", message.MessageId);
    add("SubscribeURL", message.SubscribeURL);
    add("Timestamp", message.Timestamp);
    add("Token", (message as { Token?: string }).Token);
    add("TopicArn", message.TopicArn);
    add("Type", message.Type);
  }

  return lines.join("");
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const contents = pem.replace(/-----BEGIN CERTIFICATE-----/, "")
    .replace(/-----END CERTIFICATE-----/, "")
    .replace(/\s+/g, "");
  return base64ToArrayBuffer(contents);
}
