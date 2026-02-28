ALTER TABLE public.discussions
  ADD COLUMN is_nsfw boolean NOT NULL DEFAULT false;

ALTER TABLE public.discussion_replies
  ADD COLUMN is_nsfw boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.discussions.is_nsfw IS 'Marks discussion as NSFW content.';
COMMENT ON COLUMN public.discussion_replies.is_nsfw IS 'Marks reply as NSFW content.';
