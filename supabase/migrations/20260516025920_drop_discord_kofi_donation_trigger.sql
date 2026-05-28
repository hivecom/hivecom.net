-- Drop the DB trigger and function that sent a duplicate Discord notification
-- for Ko-fi donations. The edge function (webhook-kofi-donation) now sends a
-- single, richer notification that includes the donor email and month-to-date total.

DROP TRIGGER IF EXISTS trigger_notify_discord_kofi_donation ON public.funding_history;
DROP FUNCTION IF EXISTS public.notify_discord_kofi_donation();
