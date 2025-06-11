-- Add indexes for foreign key columns to improve query performance
-- These indexes will speed up JOIN operations and WHERE clauses on foreign key columns
-- Announcements table indexes
CREATE INDEX IF NOT EXISTS "idx_announcements_created_by" ON "public"."announcements"("created_by");

CREATE INDEX IF NOT EXISTS "idx_announcements_modified_by" ON "public"."announcements"("modified_by");

-- Complaints table indexes
CREATE INDEX IF NOT EXISTS "idx_complaints_created_by" ON "public"."complaints"("created_by");

CREATE INDEX IF NOT EXISTS "idx_complaints_responded_by" ON "public"."complaints"("responded_by");

-- Containers table indexes
CREATE INDEX IF NOT EXISTS "idx_containers_server" ON "public"."containers"("server");

-- Events table indexes
CREATE INDEX IF NOT EXISTS "idx_events_created_by" ON "public"."events"("created_by");

CREATE INDEX IF NOT EXISTS "idx_events_modified_by" ON "public"."events"("modified_by");

-- Expenses table indexes
CREATE INDEX IF NOT EXISTS "idx_expenses_created_by" ON "public"."expenses"("created_by");

CREATE INDEX IF NOT EXISTS "idx_expenses_modified_by" ON "public"."expenses"("modified_by");

-- Games table indexes
CREATE INDEX IF NOT EXISTS "idx_games_created_by" ON "public"."games"("created_by");

CREATE INDEX IF NOT EXISTS "idx_games_modified_by" ON "public"."games"("modified_by");

-- Gameservers table indexes
CREATE INDEX IF NOT EXISTS "idx_gameservers_administrator" ON "public"."gameservers"("administrator");

CREATE INDEX IF NOT EXISTS "idx_gameservers_container" ON "public"."gameservers"("container");

CREATE INDEX IF NOT EXISTS "idx_gameservers_created_by" ON "public"."gameservers"("created_by");

CREATE INDEX IF NOT EXISTS "idx_gameservers_game" ON "public"."gameservers"("game");

CREATE INDEX IF NOT EXISTS "idx_gameservers_modified_by" ON "public"."gameservers"("modified_by");

-- Profiles table indexes
CREATE INDEX IF NOT EXISTS "idx_profiles_modified_by" ON "public"."profiles"("modified_by");

-- Referendum_votes table indexes
CREATE INDEX IF NOT EXISTS "idx_referendum_votes_referendum_id" ON "public"."referendum_votes"("referendum_id");

CREATE INDEX IF NOT EXISTS "idx_referendum_votes_user_id" ON "public"."referendum_votes"("user_id");

-- Referendums table indexes
CREATE INDEX IF NOT EXISTS "idx_referendums_created_by" ON "public"."referendums"("created_by");

CREATE INDEX IF NOT EXISTS "idx_referendums_modified_by" ON "public"."referendums"("modified_by");

-- User_roles table indexes
CREATE INDEX IF NOT EXISTS "idx_user_roles_user_id" ON "public"."user_roles"("user_id");

