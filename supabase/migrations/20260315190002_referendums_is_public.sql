-- Add is_public column to referendums table.
--
-- Referendums are private by default. Moderators and admins can mark a
-- referendum as public, which causes it to appear on the /votes index page
-- for all users. Private referendums remain accessible via direct link to
-- their creator and anyone they share the link with - they just won't appear
-- in the listing.

ALTER TABLE public.referendums
  ADD COLUMN is_public boolean NOT NULL DEFAULT false;
