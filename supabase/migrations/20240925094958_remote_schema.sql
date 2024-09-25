drop policy "Allow authorized roles to CRUD user roles" on "public"."user_roles";

create policy "Allow authorized roles to CRUD profiles"
on "public"."profiles"
as permissive
for all
to authenticated
using (( SELECT authorize('profiles.crud'::app_permission) AS authorize));


create policy "Allow authorized roles to CRUD user roles"
on "public"."user_roles"
as permissive
for all
to authenticated
using (( SELECT authorize('gameservers.crud'::app_permission) AS authorize));



