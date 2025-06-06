-- Add check constraint to ensure end date cannot be before start date
ALTER TABLE "public"."expenses"
  ADD CONSTRAINT "expenses_end_date_after_start_date_check" 
  CHECK (ended_at IS NULL OR ended_at >= started_at);
