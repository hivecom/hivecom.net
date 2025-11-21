-- Restrict referendum visibility until their start date while keeping admins unrestricted

-- Optional index to speed up queries filtering by start date
CREATE INDEX IF NOT EXISTS "idx_referendums_date_start" ON "public"."referendums"("date_start");

-- Replace the broad SELECT policy with role-aware and schedule-aware policies
DROP POLICY IF EXISTS "Authenticated users can SELECT referendums" ON "public"."referendums";

-- Admins or members with the explicit read permission can view every referendum regardless of schedule
CREATE POLICY "Allow authorized roles to SELECT all referendums" ON "public"."referendums"
	FOR SELECT TO authenticated
		USING (public.has_permission('referendums.read'::public.app_permission));

-- General authenticated users can only see referendums that have already started
CREATE POLICY "Authenticated users can SELECT started referendums" ON "public"."referendums"
	FOR SELECT TO authenticated
		USING (date_start <= NOW());
