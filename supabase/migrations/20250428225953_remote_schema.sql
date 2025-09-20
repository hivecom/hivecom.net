drop policy "Allow authorized roles to CRUD events" on "public"."events";

drop policy "Allow authorized roles to CRUD expenses" on "public"."expenses";

drop policy "Allow authorized roles to CRUD games" on "public"."games";

drop policy "Allow authorized roles to CRUD gameservers" on "public"."gameservers";

drop policy "Allow authorized roles to CRUD profiles" on "public"."profiles";

drop policy "Authorized users can CRUD votes" on "public"."referendum_votes";

drop policy "Allow authorized roles to CRUD referendums" on "public"."referendums";

drop policy "Allow authorized roles to CRUD servers" on "public"."servers";

drop policy "Allow authorized roles to CRUD user roles" on "public"."user_roles";

drop function if exists "public"."authorize"();

alter table "public"."containers" alter column "healthy" drop not null;

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.authorize(requested_permission app_permission)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  bind_permissions int;
  user_role public.app_role;
begin
  -- Fetch user role once and store it to reduce number of calls
  select (auth.jwt() ->> 'user_role')::public.app_role into user_role;

  select count(*)
  into bind_permissions
  from public.role_permissions
  where role_permissions.permission = requested_permission
    and role_permissions.role = user_role;

  return bind_permissions > 0;
end;
$function$
;

create policy "Allow authorized roles to CRUD events"
on "public"."events"
as permissive
for all
to authenticated
using (( SELECT authorize('events.crud'::app_permission) AS authorize));


create policy "Allow authorized roles to CRUD expenses"
on "public"."expenses"
as permissive
for all
to authenticated
using (( SELECT authorize('expenses.crud'::app_permission) AS authorize));


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


create policy "Allow authorized roles to CRUD profiles"
on "public"."profiles"
as permissive
for all
to authenticated
using (( SELECT authorize('profiles.crud'::app_permission) AS authorize));


create policy "Authorized users can CRUD votes"
on "public"."referendum_votes"
as permissive
for all
to authenticated
using (( SELECT authorize('referendums.crud'::app_permission) AS authorize));


create policy "Allow authorized roles to CRUD referendums"
on "public"."referendums"
as permissive
for all
to authenticated
using (( SELECT authorize('referendums.crud'::app_permission) AS authorize));


create policy "Allow authorized roles to CRUD servers"
on "public"."servers"
as permissive
for all
to authenticated
using (( SELECT authorize('servers.crud'::app_permission) AS authorize));


create policy "Allow authorized roles to CRUD user roles"
on "public"."user_roles"
as permissive
for all
to authenticated
using (( SELECT authorize('gameservers.crud'::app_permission) AS authorize));



