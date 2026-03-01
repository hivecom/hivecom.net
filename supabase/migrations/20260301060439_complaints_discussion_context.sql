-- Add discussion context fields to complaints table
ALTER TABLE "public"."complaints"
  ADD COLUMN "context_discussion" uuid,
  ADD COLUMN "context_discussion_reply" uuid;

-- Add foreign key constraints with cascade delete
ALTER TABLE "public"."complaints"
  ADD CONSTRAINT "complaints_context_discussion_fkey" FOREIGN KEY (context_discussion) REFERENCES public.discussions(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE "public"."complaints"
  ADD CONSTRAINT "complaints_context_discussion_reply_fkey" FOREIGN KEY (context_discussion_reply) REFERENCES public.discussion_replies(id) ON UPDATE CASCADE ON DELETE CASCADE;

-- Add indexes for better query performance
CREATE INDEX "complaints_context_discussion_idx" ON "public"."complaints" USING btree(context_discussion);
CREATE INDEX "complaints_context_discussion_reply_idx" ON "public"."complaints" USING btree(context_discussion_reply);

-- Enforce one complaint per user per discussion and per discussion reply
CREATE UNIQUE INDEX "complaints_created_by_context_discussion_unique_idx" ON "public"."complaints" (created_by, context_discussion) WHERE context_discussion IS NOT NULL;
CREATE UNIQUE INDEX "complaints_created_by_context_discussion_reply_unique_idx" ON "public"."complaints" (created_by, context_discussion_reply) WHERE context_discussion_reply IS NOT NULL;

-- Add comments for documentation
COMMENT ON COLUMN "public"."complaints"."context_discussion" IS 'Discussion that the complaint is about (optional)';
COMMENT ON COLUMN "public"."complaints"."context_discussion_reply" IS 'Discussion reply that the complaint is about (optional)';
