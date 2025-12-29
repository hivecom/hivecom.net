import { createClient } from "@supabase/supabase-js";
import type { Database } from "database-types";
import { corsHeaders } from "../_shared/cors.ts";
import { authorizeSystemTrigger } from "../_shared/auth.ts";
import { responseMethodNotAllowed } from "../_shared/response.ts";

type SupabaseClientType = ReturnType<typeof createClient<Database>>;

type ImageContentType = "image/webp" | "image/png" | "image/jpeg" | "image/jpg";

type SyncUserAvatarRequest = {
  userId: string;
  avatarUrl?: string | null;
  picture?: string | null;
  gravatarEmailHash?: string | null;
  provider?: string | null;
  timestamp?: string;
  op?: string;
};

const AVATAR_BUCKET = "hivecom-content-users";
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB
const FETCH_TIMEOUT_MS = 8000;

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return responseMethodNotAllowed(req.method);
  }

  try {
    const authResponse = authorizeSystemTrigger(req);
    if (authResponse) {
      console.error("Authorization failed:", authResponse.statusText);
      return authResponse;
    }

    const payload = (await req.json()) as SyncUserAvatarRequest;
    const userId = typeof payload.userId === "string"
      ? payload.userId.trim()
      : "";

    if (userId === "") {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing required field: userId",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        },
      );
    }

    const candidateUrl =
      (typeof payload.avatarUrl === "string" ? payload.avatarUrl.trim() : "") ||
      (typeof payload.picture === "string" ? payload.picture.trim() : "");

    const gravatarHash = typeof payload.gravatarEmailHash === "string"
      ? payload.gravatarEmailHash.trim().toLowerCase()
      : "";

    const supabase = createSupabaseAdminClient();

    const existing = await findExistingAvatar(supabase, userId);
    if (existing) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "Avatar already exists; skipping",
          existingPath: existing.path,
          existingUrl: existing.publicUrl,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        },
      );
    }

    // Try social avatar URL first (if provided)
    let downloaded:
      | { ok: true; bytes: Uint8Array; contentType: ImageContentType }
      | { ok: false; reason: string; status?: number }
      | null = null;

    if (isValidHttpsUrl(candidateUrl)) {
      downloaded = await downloadAvatar(candidateUrl);
      if (!downloaded.ok) {
        console.log(
          "Social avatar download failed; trying gravatar:",
          downloaded.reason,
        );
      }
    }

    // Fall back to Gravatar if social URL is missing/invalid or download failed
    if (!downloaded || !downloaded.ok) {
      const gravatarUrl = buildGravatarUrl(gravatarHash);
      if (!gravatarUrl) {
        return new Response(
          JSON.stringify({
            success: true,
            message:
              "No valid avatar URL or gravatar hash provided; nothing to sync",
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200,
          },
        );
      }

      const gravatarDownloaded = await downloadAvatar(gravatarUrl);
      if (!gravatarDownloaded.ok) {
        // Gravatar returns 404 when there's no image (with d=404)
        return new Response(
          JSON.stringify({
            success: true,
            message: "No avatar found to sync",
            reason: gravatarDownloaded.reason,
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200,
          },
        );
      }

      downloaded = gravatarDownloaded;
    }

    const fileExt = contentTypeToExtension(downloaded.contentType);
    const filePath = `${userId}/avatar.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from(AVATAR_BUCKET)
      .upload(filePath, downloaded.bytes, {
        upsert: false,
        contentType: downloaded.contentType,
      });

    if (uploadError) {
      const msg = uploadError.message ?? "Unknown upload error";
      const alreadyExists = msg.toLowerCase().includes("already exists") ||
        msg.toLowerCase().includes("duplicate") ||
        msg.toLowerCase().includes("resource already exists");

      if (!alreadyExists) {
        console.error("Avatar upload failed:", uploadError);
        return new Response(
          JSON.stringify({ success: false, error: msg }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 500,
          },
        );
      }
    }

    const { data: urlData } = supabase.storage
      .from(AVATAR_BUCKET)
      .getPublicUrl(filePath);

    return new Response(
      JSON.stringify({
        success: true,
        message: "Avatar synced",
        userId,
        path: filePath,
        url: urlData.publicUrl,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Error syncing user avatar:", message);
    return new Response(JSON.stringify({ success: false, error: message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});

function createSupabaseAdminClient(): SupabaseClientType {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const key = Deno.env.get("SUPABASE_SECRET_KEY") ??
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
    "";

  if (url === "" || key === "") {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  return createClient<Database>(url, key);
}

function isValidHttpsUrl(value: string): boolean {
  try {
    if (value === "") {
      return false;
    }
    const url = new URL(value);
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

async function findExistingAvatar(
  supabase: SupabaseClientType,
  userId: string,
): Promise<{ path: string; publicUrl: string } | null> {
  const extensions = ["webp", "png", "jpg", "jpeg"] as const;

  for (const ext of extensions) {
    const { data, error } = await supabase.storage
      .from(AVATAR_BUCKET)
      .list(userId, { search: `avatar.${ext}` });

    if (error) {
      console.error("Storage list failed:", error);
      // If we can't check existence, continue and let the upload (with upsert:false)
      // be the final guard against overwriting an existing avatar.
      return null;
    }

    if (data && data.length > 0) {
      const path = `${userId}/avatar.${ext}`;
      const { data: urlData } = supabase.storage
        .from(AVATAR_BUCKET)
        .getPublicUrl(path);
      return { path, publicUrl: urlData.publicUrl };
    }
  }

  return null;
}

function contentTypeToExtension(
  contentType: ImageContentType,
): "webp" | "png" | "jpg" {
  switch (contentType) {
    case "image/webp":
      return "webp";
    case "image/png":
      return "png";
    case "image/jpeg":
    case "image/jpg":
      return "jpg";
  }
}

async function downloadAvatar(
  url: string,
): Promise<
  | { ok: true; bytes: Uint8Array; contentType: ImageContentType }
  | { ok: false; reason: string; status?: number }
> {
  const res = await fetch(url, {
    method: "GET",
    redirect: "follow",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      reason: `HTTP ${res.status} ${res.statusText}`,
    };
  }

  const contentTypeRaw = res.headers.get("content-type")?.split(";")[0]
    ?.trim()
    ?.toLowerCase();

  if (!isAllowedImageContentType(contentTypeRaw)) {
    return {
      ok: false,
      reason: `Unsupported content-type: ${contentTypeRaw ?? "(missing)"}`,
    };
  }

  const contentLengthHeader = res.headers.get("content-length");
  if (contentLengthHeader) {
    const declared = Number(contentLengthHeader);
    if (Number.isFinite(declared) && declared > MAX_IMAGE_BYTES) {
      return { ok: false, reason: "Image too large" };
    }
  }

  const buffer = new Uint8Array(await res.arrayBuffer());
  if (buffer.byteLength > MAX_IMAGE_BYTES) {
    return { ok: false, reason: "Image too large" };
  }

  return { ok: true, bytes: buffer, contentType: contentTypeRaw };
}

function isAllowedImageContentType(
  value: string | undefined,
): value is ImageContentType {
  return value === "image/webp" || value === "image/png" ||
    value === "image/jpeg" || value === "image/jpg";
}

function buildGravatarUrl(emailHash: string): string | null {
  // emailHash should be md5(lower(trim(email))) => 32 hex chars
  if (!/^[a-f0-9]{32}$/.test(emailHash)) {
    return null;
  }

  const url = new URL(`https://www.gravatar.com/avatar/${emailHash}`);
  url.searchParams.set("d", "404");
  url.searchParams.set("s", "256");
  return url.toString();
}
