-- Discord notification for Ko-fi donations.
--
-- Fires on INSERT or UPDATE of funding_history when donation_count increases,
-- meaning a new donation has been received. Follows the same pattern as the
-- existing notify_discord_* trigger functions.
--
-- Patreon new supporter notifications are already handled by the existing
-- notify_discord_supporter_status_changed trigger on public.profiles.

CREATE OR REPLACE FUNCTION public.notify_discord_kofi_donation()
  RETURNS TRIGGER
  SECURITY DEFINER
  SET search_path = public
  LANGUAGE plpgsql
AS $$
DECLARE
  v_webhook_url  text;
  v_payload      jsonb;
  v_request_id   bigint;
  v_amount_euros numeric;
BEGIN
  -- On INSERT: any donation_count > 0 is a new donation.
  -- On UPDATE: only fire when donation_count actually increased.
  IF (TG_OP = 'INSERT' AND NEW.donation_count > 0) OR
     (TG_OP = 'UPDATE' AND NEW.donation_count IS DISTINCT FROM OLD.donation_count AND NEW.donation_count > COALESCE(OLD.donation_count, 0))
  THEN
    SELECT decrypted_secret
      INTO v_webhook_url
    FROM vault.decrypted_secrets
    WHERE name = 'system_discord_notification_webhook_url';

    IF v_webhook_url IS NULL OR v_webhook_url = 'REPLACE-ME' THEN
      RAISE NOTICE 'Discord webhook URL not configured, skipping Ko-fi donation notification';
      RETURN NEW;
    END IF;

    v_amount_euros := ROUND((NEW.donation_month_amount_cents::numeric / 100), 2);

    v_payload := jsonb_build_object(
      'content', '💛 **Ko-fi Donation Received**',
      'embeds', jsonb_build_array(
        jsonb_build_object(
          'title',       'Ko-fi Donation',
          'description', 'A new donation has been received via Ko-fi.',
          'color',       2869894, -- Ko-fi blue (0x29ABE0 -> 2800864... approx)
          'fields', jsonb_build_array(
            jsonb_build_object('name', 'Month',              'value', TO_CHAR(NEW.month, 'Month YYYY'), 'inline', TRUE),
            jsonb_build_object('name', 'Month Total',        'value', '€' || v_amount_euros::text,      'inline', TRUE),
            jsonb_build_object('name', 'Donations This Month', 'value', NEW.donation_count::text,        'inline', TRUE)
          ),
          'timestamp', TO_CHAR(NOW(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
        )
      )
    );

    SELECT net.http_post(
      url     := v_webhook_url,
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body    := v_payload
    ) INTO v_request_id;

    RAISE NOTICE 'Discord webhook initiated for Ko-fi donation (request_id: %)', v_request_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_notify_discord_kofi_donation ON public.funding_history;

CREATE TRIGGER trigger_notify_discord_kofi_donation
  AFTER INSERT OR UPDATE OF donation_count ON public.funding_history
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_discord_kofi_donation();

GRANT EXECUTE ON FUNCTION public.notify_discord_kofi_donation() TO service_role;
