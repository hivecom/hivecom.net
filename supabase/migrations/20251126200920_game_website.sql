-- Add optional website link for games that are not on Steam
ALTER TABLE public.games
  ADD COLUMN IF NOT EXISTS website text;

