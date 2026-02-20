-- Referendums
DROP TRIGGER IF EXISTS create_discussion_on_referendum ON public.referendums;
CREATE TRIGGER create_discussion_on_referendum
  AFTER INSERT ON public.referendums
  FOR EACH ROW
  EXECUTE FUNCTION public.create_discussion_for_entity('referendum_id', 'referendums');
