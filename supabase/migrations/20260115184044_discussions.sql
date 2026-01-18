-- Create enum for discussion types to handle polymorphism
CREATE TYPE public.discussion_type AS ENUM (
  'forum',
  'announcement',
  'event',
  'referendum',
  'profile',
  'project',
  'gameserver'
);

-- Create forum categories table to organize forum threads
CREATE TABLE public.forum_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  is_archived boolean NOT NULL DEFAULT false,

  -- Audit
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
  modified_at timestamptz NOT NULL DEFAULT now(),
  modified_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL DEFAULT auth.uid()
);

CREATE UNIQUE INDEX forum_categories_slug_idx ON public.forum_categories(slug);
CREATE INDEX forum_categories_sort_order_idx ON public.forum_categories(sort_order);

COMMENT ON TABLE public.forum_categories IS 'Categories for organizing general forum discussions.';

-- Create discussions table
CREATE TABLE public.discussions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text, -- Nullable because some comments (e.g. on events) might not have a distinct title, just the context
  slug text, -- Mainly for forum threads
  description text, -- Optional short description or subtitle
  type public.discussion_type NOT NULL,

  -- Foreign Keys for the specific contexts (Polymorphic-like association)
  forum_category_id uuid REFERENCES public.forum_categories(id) ON DELETE SET NULL,
  announcement_id bigint REFERENCES public.announcements(id) ON DELETE CASCADE,
  event_id bigint REFERENCES public.events(id) ON DELETE CASCADE,
  referendum_id bigint REFERENCES public.referendums(id) ON DELETE CASCADE,
  profile_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  project_id bigint REFERENCES public.projects(id) ON DELETE CASCADE,
  gameserver_id bigint REFERENCES public.gameservers(id) ON DELETE CASCADE,

  -- Metadata
  is_locked boolean NOT NULL DEFAULT false,
  is_sticky boolean NOT NULL DEFAULT false,
  accepted_reply_id uuid, -- Reference added later due to circular dependency
  view_count bigint NOT NULL DEFAULT 0,
  reply_count bigint NOT NULL DEFAULT 0,

  -- Audit fields
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
  modified_at timestamptz NOT NULL DEFAULT now(),
  modified_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),

  -- Constraint to ensure the FK matches the type
  CONSTRAINT discussions_type_fk_check CHECK (
    (type = 'forum' AND forum_category_id IS NOT NULL) OR
    (type = 'announcement' AND announcement_id IS NOT NULL) OR
    (type = 'event' AND event_id IS NOT NULL) OR
    (type = 'referendum' AND referendum_id IS NOT NULL) OR
    (type = 'profile' AND profile_id IS NOT NULL) OR
    (type = 'project' AND project_id IS NOT NULL) OR
    (type = 'gameserver' AND gameserver_id IS NOT NULL)
  ),

  -- Constraint to ensure forum topics have a title (body content lives in first reply)
  CONSTRAINT discussions_forum_title_check CHECK (
    type != 'forum' OR title IS NOT NULL
  )
);

-- Indexes
CREATE UNIQUE INDEX discussions_slug_idx ON public.discussions(slug) WHERE slug IS NOT NULL;
CREATE INDEX discussions_type_idx ON public.discussions(type);
CREATE INDEX discussions_created_at_idx ON public.discussions(created_at DESC);

-- Unique constraints to enforce one discussion per entity
CREATE UNIQUE INDEX discussions_announcement_unique_idx ON public.discussions(announcement_id) WHERE announcement_id IS NOT NULL;
CREATE UNIQUE INDEX discussions_event_unique_idx ON public.discussions(event_id) WHERE event_id IS NOT NULL;
CREATE UNIQUE INDEX discussions_referendum_unique_idx ON public.discussions(referendum_id) WHERE referendum_id IS NOT NULL;
CREATE UNIQUE INDEX discussions_profile_unique_idx ON public.discussions(profile_id) WHERE profile_id IS NOT NULL;
CREATE UNIQUE INDEX discussions_project_unique_idx ON public.discussions(project_id) WHERE project_id IS NOT NULL;
CREATE UNIQUE INDEX discussions_gameserver_unique_idx ON public.discussions(gameserver_id) WHERE gameserver_id IS NOT NULL;

-- FK Indexes for performance
CREATE INDEX discussions_forum_category_id_idx ON public.discussions(forum_category_id);

COMMENT ON TABLE public.discussions IS 'Generic container for discussions, forum topics, and context-aware comment threads.';

-- Create discussion replies table
CREATE TABLE public.discussion_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  discussion_id uuid NOT NULL REFERENCES public.discussions(id) ON DELETE CASCADE,
  reply_to_id uuid REFERENCES public.discussion_replies(id) ON DELETE SET NULL,
  content text NOT NULL,

  -- Flexible metadata for things like "commenting on vote choice X"
  meta jsonb DEFAULT '{}'::jsonb,

  -- State
  is_deleted boolean NOT NULL DEFAULT false,

  -- Audit fields
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
  modified_at timestamptz NOT NULL DEFAULT now(),
  modified_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL DEFAULT auth.uid()
);

CREATE INDEX discussion_replies_discussion_id_idx ON public.discussion_replies(discussion_id);
CREATE INDEX discussion_replies_reply_to_id_idx ON public.discussion_replies(reply_to_id);
CREATE INDEX discussion_replies_created_at_idx ON public.discussion_replies(created_at);

COMMENT ON TABLE public.discussion_replies IS 'Individual replies or comments within a discussion.';
COMMENT ON COLUMN public.discussion_replies.meta IS 'Contextual metadata for the reply (e.g. referencing a specific vote option or paragraph).';

-- Add circular FK for accepted answer
ALTER TABLE public.discussions
  ADD CONSTRAINT discussions_accepted_reply_id_fkey
  FOREIGN KEY (accepted_reply_id)
  REFERENCES public.discussion_replies(id)
  ON DELETE SET NULL;

CREATE INDEX discussions_accepted_reply_id_idx ON public.discussions(accepted_reply_id);

-- Enable RLS
ALTER TABLE public.forum_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discussions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discussion_replies ENABLE ROW LEVEL SECURITY;

-- Forum Categories Policies
CREATE POLICY "Everyone can view forum categories"
  ON public.forum_categories FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage forum categories"
  ON public.forum_categories FOR ALL
  TO authenticated
  USING (
    authorize('discussions.manage'::app_permission)
  );

-- Discussions Policies

CREATE POLICY "Everyone can view discussions"
  ON public.discussions FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can create discussions"
  ON public.discussions FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = created_by AND
    (
      -- Standard users can create forum topics, others might be system generated or specific logic
      type = 'forum' OR
      type = 'profile' OR
      -- Allow creation on other types if the parent exists (logic simplified here, typically handled by UI/App guards)
      type IN ('event', 'announcement', 'referendum', 'project', 'gameserver')
    )
  );

CREATE POLICY "Users can update their own discussions"
  ON public.discussions FOR UPDATE
  TO authenticated
  USING (auth.uid() = created_by);

CREATE POLICY "Moderators can update any discussion"
  ON public.discussions FOR UPDATE
  TO authenticated
  USING (
    authorize('discussions.update'::app_permission)
  );

CREATE POLICY "Users can delete their own discussions"
  ON public.discussions FOR DELETE
  TO authenticated
  USING (auth.uid() = created_by);

CREATE POLICY "Moderators can delete any discussion"
  ON public.discussions FOR DELETE
  TO authenticated
  USING (
    authorize('discussions.delete'::app_permission)
  );

-- Replies Policies

CREATE POLICY "Everyone can view replies"
  ON public.discussion_replies FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can create replies"
  ON public.discussion_replies FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = created_by AND
    EXISTS (
        SELECT 1 FROM public.discussions d
        WHERE d.id = discussion_id
        AND (d.is_locked = false OR authorize('discussions.update'::app_permission))
    )
  );

CREATE POLICY "Users can update their own replies"
  ON public.discussion_replies FOR UPDATE
  TO authenticated
  USING (auth.uid() = created_by);

CREATE POLICY "Moderators can update any reply"
  ON public.discussion_replies FOR UPDATE
  TO authenticated
  USING (
    authorize('discussions.update'::app_permission)
  );

-- Users can delete their own replies (soft delete via update preferred, but row deletion allowed)
CREATE POLICY "Users can delete their own replies"
  ON public.discussion_replies FOR DELETE
  TO authenticated
  USING (auth.uid() = created_by);

CREATE POLICY "Moderators can delete any reply"
  ON public.discussion_replies FOR DELETE
  TO authenticated
  USING (
    authorize('discussions.delete'::app_permission)
  );

-- Triggers for automatic audit field updates
CREATE TRIGGER update_discussions_audit_fields
  BEFORE UPDATE ON public.discussions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_audit_fields();

CREATE TRIGGER update_discussion_replies_audit_fields
  BEFORE UPDATE ON public.discussion_replies
  FOR EACH ROW
  EXECUTE FUNCTION public.update_audit_fields();

CREATE TRIGGER update_forum_categories_audit_fields
  BEFORE UPDATE ON public.forum_categories
  FOR EACH ROW
  EXECUTE FUNCTION public.update_audit_fields();

-- Trigger to protect admin-only fields in discussions (is_locked, is_sticky)
CREATE OR REPLACE FUNCTION public.protect_discussion_admin_fields()
RETURNS TRIGGER AS $$
BEGIN
  -- If is_locked or is_sticky is being changed
  IF (OLD.is_locked IS DISTINCT FROM NEW.is_locked) OR (OLD.is_sticky IS DISTINCT FROM NEW.is_sticky) THEN
    -- Check if user has permission
    IF NOT authorize('discussions.manage'::app_permission) THEN
       RAISE EXCEPTION 'Insufficient permissions to modify lock/sticky status';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER protect_discussion_fields_trigger
  BEFORE UPDATE ON public.discussions
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_discussion_admin_fields();

-- Trigger to update reply_count
CREATE OR REPLACE FUNCTION public.update_discussion_reply_count()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    UPDATE public.discussions
    SET reply_count = reply_count + 1
    WHERE id = NEW.discussion_id;
  ELSIF (TG_OP = 'DELETE') THEN
    UPDATE public.discussions
    SET reply_count = reply_count - 1
    WHERE id = OLD.discussion_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER update_discussion_reply_count_trigger
  AFTER INSERT OR DELETE ON public.discussion_replies
  FOR EACH ROW
  EXECUTE FUNCTION public.update_discussion_reply_count();

-- Trigger to ensure accepted_reply_id belongs to the discussion
CREATE OR REPLACE FUNCTION public.validate_discussion_accepted_reply()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.accepted_reply_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.discussion_replies
      WHERE id = NEW.accepted_reply_id
      AND discussion_id = NEW.id
    ) THEN
      RAISE EXCEPTION 'Accepted reply must belong to the discussion';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER validate_discussion_accepted_reply_trigger
  BEFORE INSERT OR UPDATE ON public.discussions
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_discussion_accepted_reply();

-- RPC function to increment view count
CREATE OR REPLACE FUNCTION public.increment_discussion_view_count(target_discussion_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE public.discussions
  SET view_count = view_count + 1
  WHERE id = target_discussion_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.forum_categories TO authenticated;
GRANT SELECT ON public.forum_categories TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.forum_categories TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.discussions TO authenticated;
GRANT SELECT ON public.discussions TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.discussions TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.discussion_replies TO authenticated;
GRANT SELECT ON public.discussion_replies TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.discussion_replies TO service_role;

GRANT EXECUTE ON FUNCTION public.increment_discussion_view_count(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_discussion_view_count(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.increment_discussion_view_count(uuid) TO service_role;
