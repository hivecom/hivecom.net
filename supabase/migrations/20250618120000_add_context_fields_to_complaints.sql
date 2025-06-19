-- Add context fields to complaints table
ALTER TABLE "public"."complaints"
  ADD COLUMN "context_user" uuid,
  ADD COLUMN "context_gameserver" bigint;

-- Add foreign key constraints with cascade delete
ALTER TABLE "public"."complaints"
  ADD CONSTRAINT "complaints_context_user_fkey" FOREIGN KEY (context_user) REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE "public"."complaints"
  ADD CONSTRAINT "complaints_context_gameserver_fkey" FOREIGN KEY (context_gameserver) REFERENCES public.gameservers(id) ON UPDATE CASCADE ON DELETE CASCADE;

-- Add indexes for better query performance
CREATE INDEX "complaints_context_user_idx" ON "public"."complaints" USING btree(context_user);

CREATE INDEX "complaints_context_gameserver_idx" ON "public"."complaints" USING btree(context_gameserver);

-- Add comments for documentation
COMMENT ON COLUMN "public"."complaints"."context_user" IS 'User that the complaint is about (optional)';

COMMENT ON COLUMN "public"."complaints"."context_gameserver" IS 'Game server that the complaint is about (optional)';

