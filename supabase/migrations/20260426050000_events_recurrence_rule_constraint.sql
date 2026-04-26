ALTER TABLE public.events
  ADD CONSTRAINT events_recurrence_rule_format
    CHECK (
      recurrence_rule IS NULL
      OR recurrence_rule ~ '^FREQ=(DAILY|WEEKLY|MONTHLY|YEARLY)(;[A-Z]+=[\w,+-]+)*$'
    );
