-- Add created_by and modified_by fields to servers table
ALTER TABLE "public"."servers"
  ADD COLUMN "created_by" "uuid";

ALTER TABLE "public"."servers"
  ADD COLUMN "modified_at" timestamp with time zone DEFAULT "now"();

ALTER TABLE "public"."servers"
  ADD COLUMN "modified_by" "uuid";

-- Add foreign key constraints
ALTER TABLE "public"."servers"
  ADD CONSTRAINT "servers_created_by_fkey" 
  FOREIGN KEY ("created_by") 
  REFERENCES "auth"."users"("id") 
  ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE "public"."servers"
  ADD CONSTRAINT "servers_modified_by_fkey" 
  FOREIGN KEY ("modified_by") 
  REFERENCES "auth"."users"("id") 
  ON UPDATE CASCADE ON DELETE SET NULL;
