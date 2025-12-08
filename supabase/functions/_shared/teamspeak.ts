import type { Tables } from "database-types";
import type { TeamSpeakIdentityRecord } from "../../../types/teamspeak.ts";

export function normalizeTeamSpeakIdentities(
  value: Tables<"profiles">["teamspeak_identities"] | TeamSpeakIdentityRecord[] | null | undefined,
): TeamSpeakIdentityRecord[] {
  if (!Array.isArray(value)) return [];

  const normalized: TeamSpeakIdentityRecord[] = [];

  value.forEach((entry) => {
    if (entry === null || entry === undefined || typeof entry !== "object") return;

    const rawServerId = (entry as { serverId?: unknown }).serverId;
    const rawUniqueId = (entry as { uniqueId?: unknown }).uniqueId;
    const linkedAt = (entry as { linkedAt?: unknown }).linkedAt;

    if (typeof rawServerId !== "string" || typeof rawUniqueId !== "string") return;

    const serverId = rawServerId.trim();
    const uniqueId = rawUniqueId.trim();

    if (!serverId || !uniqueId) return;

    normalized.push({
      serverId,
      uniqueId,
      linkedAt: typeof linkedAt === "string" ? linkedAt : undefined,
    });
  });

  return normalized;
}

export function identityKey(identity: TeamSpeakIdentityRecord): string {
  return `${identity.serverId}:${identity.uniqueId}`;
}
