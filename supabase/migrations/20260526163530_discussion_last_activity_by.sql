-- Add last_activity_by to discussions and discussion_topics.
--
-- Tracks who triggered the most recent activity so the frontend can suppress
-- the "new activity" dot when the current user was the last poster.
--
-- Chain mirrors last_activity_at:
--   discussion_replies INSERT/DELETE
--     → discussions.last_activity_by  (update_discussion_last_activity)
--       → discussion_topics.last_activity_by  (update_topic_last_activity)

-- ============================================================
-- 1. Add columns
-- ============================================================

alter table public.discussions
  add column last_activity_by uuid references public.profiles(id) on delete set null;

alter table public.discussion_topics
  add column last_activity_by uuid references public.profiles(id) on delete set null;

-- ============================================================
-- 2. Backfill discussions: most recent non-deleted reply's author
-- ============================================================

update public.discussions d
set last_activity_by = (
  select r.created_by
  from public.discussion_replies r
  where r.discussion_id = d.id
    and r.is_deleted = false
  order by r.created_at desc
  limit 1
);

-- ============================================================
-- 3. Backfill discussion_topics: author from most recently active discussion
-- ============================================================

update public.discussion_topics t
set last_activity_by = (
  select d.last_activity_by
  from public.discussions d
  where d.discussion_topic_id = t.id
  order by d.last_activity_at desc
  limit 1
);

-- ============================================================
-- 4. Update trigger: reply changes → discussions.last_activity_by
--    (recreates the function from 20260301015257 with by-tracking added)
-- ============================================================

create or replace function public.update_discussion_last_activity()
  returns trigger
  language plpgsql
  security definer
  set search_path to ''
as $function$
begin
  if TG_OP = 'INSERT' then
    -- Fast path: only update if the new reply is more recent.
    update public.discussions
    set
      last_activity_at = greatest(last_activity_at, NEW.created_at),
      last_activity_by = case
        when NEW.created_at >= last_activity_at then NEW.created_by
        else last_activity_by
      end
    where id = NEW.discussion_id;

  elsif TG_OP = 'DELETE' then
    -- Slow path: deleted reply may have been the latest, recompute from scratch.
    update public.discussions
    set
      last_activity_at = coalesce(
        (
          select max(r.created_at)
          from public.discussion_replies r
          where r.discussion_id = OLD.discussion_id
        ),
        created_at
      ),
      last_activity_by = (
        select r.created_by
        from public.discussion_replies r
        where r.discussion_id = OLD.discussion_id
          and r.is_deleted = false
        order by r.created_at desc
        limit 1
      )
    where id = OLD.discussion_id;
  end if;

  return null;
end;
$function$;

-- ============================================================
-- 5. Update trigger: discussion changes → discussion_topics.last_activity_by
--    (recreates the function from 20260301015257 with by-tracking added)
-- ============================================================

create or replace function public.update_topic_last_activity()
  returns trigger
  language plpgsql
  security definer
  set search_path to ''
as $function$
begin
  -- When a discussion is re-parented, refresh the old topic too.
  if TG_OP = 'UPDATE'
    and OLD.discussion_topic_id is distinct from NEW.discussion_topic_id
    and OLD.discussion_topic_id is not null
  then
    update public.discussion_topics
    set
      last_activity_at = coalesce(
        (
          select max(d.last_activity_at)
          from public.discussions d
          where d.discussion_topic_id = OLD.discussion_topic_id
        ),
        created_at
      ),
      last_activity_by = (
        select d.last_activity_by
        from public.discussions d
        where d.discussion_topic_id = OLD.discussion_topic_id
        order by d.last_activity_at desc
        limit 1
      )
    where id = OLD.discussion_topic_id;
  end if;

  -- Determine target topic for the new/current state.
  declare
    target_topic_id uuid;
  begin
    if TG_OP = 'DELETE' then
      target_topic_id := OLD.discussion_topic_id;
    else
      target_topic_id := NEW.discussion_topic_id;
    end if;

    if target_topic_id is null then
      return null;
    end if;

    update public.discussion_topics
    set
      last_activity_at = coalesce(
        (
          select max(d.last_activity_at)
          from public.discussions d
          where d.discussion_topic_id = target_topic_id
        ),
        created_at
      ),
      last_activity_by = (
        select d.last_activity_by
        from public.discussions d
        where d.discussion_topic_id = target_topic_id
        order by d.last_activity_at desc
        limit 1
      )
    where id = target_topic_id;
  end;

  return null;
end;
$function$;

-- ============================================================
-- 6. Grants
-- ============================================================

grant execute on function public.update_discussion_last_activity() to service_role;
grant execute on function public.update_topic_last_activity() to service_role;
