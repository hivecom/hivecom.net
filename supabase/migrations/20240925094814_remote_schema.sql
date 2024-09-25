alter table "public"."user_roles" enable row level security;

create policy "Allow authorized roles to CRUD events"
on "public"."events"
as permissive
for all
to authenticated
using (( SELECT authorize('events.crud'::app_permission) AS authorize));


create policy "Allow authorized roles to CRUD games"
on "public"."games"
as permissive
for all
to authenticated
using (( SELECT authorize('games.crud'::app_permission) AS authorize));


create policy "Allow authorized roles to CRUD gameservers"
on "public"."gameservers"
as permissive
for all
to authenticated
using (( SELECT authorize('gameservers.crud'::app_permission) AS authorize));


create policy "Allow authorized roles to CRUD links"
on "public"."links"
as permissive
for all
to authenticated
using (( SELECT authorize('gameservers.crud'::app_permission) AS authorize));


create policy "Allow authorized roles to CRUD user roles"
on "public"."user_roles"
as permissive
for all
to public
using (( SELECT authorize('gameservers.crud'::app_permission) AS authorize));



