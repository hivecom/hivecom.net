drop policy "Everyone can SELECT gameserver containers" on "public"."containers";

drop policy "Allow authorized roles to CRUD servers" on "public"."servers";

create policy "Everyone can SELECT containers"
on "public"."containers"
as permissive
for select
to authenticated, anon
using (true);


create policy "Allow authorized roles to CRUD expenses"
on "public"."expenses"
as permissive
for all
to authenticated
using (( SELECT authorize('expenses.crud'::app_permission) AS authorize));


create policy "Everyone can SELECT expenses"
on "public"."expenses"
as permissive
for select
to public
using (true);


create policy "Everyone can SELECT monthly funding"
on "public"."monthly_funding"
as permissive
for select
to anon, authenticated
using (true);


create policy "Everyone can SELECT user roles"
on "public"."user_roles"
as permissive
for select
to anon, authenticated
using (true);


create policy "Allow authorized roles to CRUD servers"
on "public"."servers"
as permissive
for all
to authenticated
using (( SELECT authorize('servers.crud'::app_permission) AS authorize));



