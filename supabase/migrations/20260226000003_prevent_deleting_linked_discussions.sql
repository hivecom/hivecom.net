-- Prevent deleting discussions that are linked to entities.
-- Cascaded deletes from linked entities are allowed.

BEGIN;

CREATE OR REPLACE FUNCTION public.prevent_deleting_linked_discussions()
RETURNS TRIGGER AS $$
BEGIN


  IF num_nonnulls(
    OLD.event_id,
    OLD.referendum_id,
    OLD.profile_id,
    OLD.project_id,
    OLD.gameserver_id
  ) > 0 THEN
    IF (
      (OLD.event_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.events e WHERE e.id = OLD.event_id))
      OR (OLD.referendum_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.referendums r WHERE r.id = OLD.referendum_id))
      OR (OLD.profile_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = OLD.profile_id))
      OR (OLD.project_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.projects pr WHERE pr.id = OLD.project_id))
      OR (OLD.gameserver_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.gameservers g WHERE g.id = OLD.gameserver_id))
    ) THEN
      RAISE EXCEPTION 'Cannot delete discussions linked to an entity. Delete the entity instead.';
    END IF;
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '';

DROP TRIGGER IF EXISTS prevent_deleting_linked_discussions_trigger ON public.discussions;

CREATE TRIGGER prevent_deleting_linked_discussions_trigger
  BEFORE DELETE ON public.discussions
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_deleting_linked_discussions();

COMMIT;
