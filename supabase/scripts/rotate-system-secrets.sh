#!/usr/bin/env bash
# Rotate SYSTEM_CRON_SECRET and SYSTEM_TRIGGER_SECRET in both places they live:
# the edge function environment (supabase secrets set) and Vault (what the
# database sends). Function env goes first, so ticks firing between the two
# steps 401 and self-heal on the next run.
#
# Needs the direct database connection string for the Vault half:
#   SUPABASE_DB_URL='postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres' \
#     ./supabase/scripts/rotate-system-secrets.sh
#
# Afterwards, run the stability-pg-net-failures snippet and confirm the 401s
# stopped after the rotation window.

# Refuse to run sourced: exit would kill the calling shell and set -e would
# leak into it. `return` only succeeds in a sourced context (bash and zsh).
if (return 0 2>/dev/null); then
  echo "Run this directly (./rotate-system-secrets.sh), don't source it" >&2
  return 1
fi

set -euo pipefail

if [[ -z "${SUPABASE_DB_URL:-}" ]]; then
  echo "SUPABASE_DB_URL is not set (direct connection string, not the pooler)" >&2
  exit 1
fi

NEW_CRON=$(openssl rand -hex 32)
NEW_TRIGGER=$(openssl rand -hex 32)

echo "Updating edge function environment..."
supabase secrets set \
  SYSTEM_CRON_SECRET="$NEW_CRON" \
  SYSTEM_TRIGGER_SECRET="$NEW_TRIGGER"

echo "Updating Vault..."
if ! psql "$SUPABASE_DB_URL" -q -v ON_ERROR_STOP=1 \
  -v cron="$NEW_CRON" -v trigger="$NEW_TRIGGER" <<'SQL'
SELECT vault.update_secret(
  (SELECT id FROM vault.secrets WHERE name = 'system_cron_secret'),
  :'cron'
);
SELECT vault.update_secret(
  (SELECT id FROM vault.secrets WHERE name = 'system_trigger_secret'),
  :'trigger'
);
SQL
then
  # The function env is already rotated at this point, so the DB is sending
  # stale secrets until Vault matches. Print the values so they can be set
  # manually under Database > Vault.
  echo "" >&2
  echo "Vault update failed. Set these manually in Database > Vault:" >&2
  echo "  system_cron_secret:    $NEW_CRON" >&2
  echo "  system_trigger_secret: $NEW_TRIGGER" >&2
  exit 1
fi

echo "Done. Both secrets rotated."
