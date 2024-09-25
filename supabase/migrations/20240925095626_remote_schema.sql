create policy "Everyone can SELECT role permissions"
on "public"."role_permissions"
as permissive
for select
to anon, authenticated
using (true);



