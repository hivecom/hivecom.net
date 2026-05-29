CREATE INDEX ON public.discussion_replies USING btree (is_deleted);
CREATE INDEX ON public.discussions USING btree (slug);
CREATE INDEX ON public.themes USING btree (name);
CREATE INDEX ON public.discussions USING btree (is_draft);
