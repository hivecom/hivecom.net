SET statement_timeout = 0;

SET lock_timeout = 0;

SET idle_in_transaction_session_timeout = 0;

SET client_encoding = 'UTF8';

SET standard_conforming_strings = ON;

SELECT
  pg_catalog.SET_CONFIG('search_path', '', FALSE);

SET check_function_bodies = FALSE;

SET xmloption = content;

SET client_min_messages = warning;

SET row_security = OFF;

CREATE EXTENSION IF NOT EXISTS "pgsodium" WITH SCHEMA "pgsodium";

COMMENT ON SCHEMA "public" IS 'standard public schema';

CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";

CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";

CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";

CREATE EXTENSION IF NOT EXISTS "pgjwt" WITH SCHEMA "extensions";

CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";

CREATE TYPE "public"."app_permission" AS ENUM(
  'events.crud',
  'games.crud',
  'gameservers.crud',
  'funding.crud',
  'profiles.crud',
  'users.crud',
  'referendums.crud'
);

ALTER TYPE "public"."app_permission" OWNER TO "postgres";

COMMENT ON TYPE "public"."app_permission" IS 'RBAC permission enums';

CREATE TYPE "public"."app_role" AS ENUM(
  'admin',
  'moderator'
);

ALTER TYPE "public"."app_role" OWNER TO "postgres";

CREATE TYPE "public"."region" AS ENUM(
  'eu',
  'na',
  'all'
);

ALTER TYPE "public"."region" OWNER TO "postgres";

COMMENT ON TYPE "public"."region" IS 'Regional identifier';

CREATE OR REPLACE FUNCTION "public"."authorize"("requested_permission" "public"."app_permission")
  RETURNS boolean
  LANGUAGE "plpgsql"
  STABLE
  SECURITY DEFINER
  SET "search_path" TO ''
  AS $$

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
$$;

ALTER FUNCTION "public"."authorize"("requested_permission" "public"."app_permission") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."custom_access_token_hook"("event" "jsonb")
  RETURNS "jsonb"
  LANGUAGE "plpgsql"
  STABLE
  AS $$
  declare
    claims jsonb;
    user_role public.app_role;
  begin
    -- Fetch the user role in the user_roles table
    select role into user_role from public.user_roles where user_id = (event->>'user_id')::uuid;

    claims := event->'claims';

    if user_role is not null then
      -- Set the claim
      claims := jsonb_set(claims, '{user_role}', to_jsonb(user_role));
    else
      claims := jsonb_set(claims, '{user_role}', 'null');
    end if;

    -- Update the 'claims' object in the original event
    event := jsonb_set(event, '{claims}', claims);

    -- Return the modified or original event
    return event;
  end;
$$;

ALTER FUNCTION "public"."custom_access_token_hook"("event" "jsonb") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."handle_new_user"()
  RETURNS "trigger"
  LANGUAGE "plpgsql"
  SECURITY DEFINER
  SET "search_path" TO ''
  AS $$

begin
  insert into public.profiles (id)
  values (new.id);
  return new;

end;
$$;

ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";

CREATE TABLE IF NOT EXISTS "public"."events"(
  "id" bigint NOT NULL,
  "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
  "created_by" "uuid",
  "modified_at" timestamp with time zone DEFAULT "now"(),
  "modified_by" "uuid",
  "title" "text" DEFAULT ''::"text" NOT NULL,
  "description" "text" DEFAULT ''::"text" NOT NULL,
  "note" "text",
  "markdown" "text",
  "date" "date" NOT NULL,
  "location" "text",
  "link" "text"
);

ALTER TABLE "public"."events" OWNER TO "postgres";

COMMENT ON TABLE "public"."events" IS 'Community events';

COMMENT ON COLUMN "public"."events"."id" IS 'Unique identifier of this event';

COMMENT ON COLUMN "public"."events"."created_at" IS 'When this event was created';

COMMENT ON COLUMN "public"."events"."created_by" IS 'User ID that created this event';

COMMENT ON COLUMN "public"."events"."modified_at" IS 'When last this event was modified';

COMMENT ON COLUMN "public"."events"."modified_by" IS 'Last user ID that modified this event';

COMMENT ON COLUMN "public"."events"."title" IS 'Title for the event';

COMMENT ON COLUMN "public"."events"."description" IS 'Description of the event';

COMMENT ON COLUMN "public"."events"."note" IS 'Shorthand note about this event';

COMMENT ON COLUMN "public"."events"."markdown" IS 'Markdown information for this event';

COMMENT ON COLUMN "public"."events"."date" IS 'Date of the event';

COMMENT ON COLUMN "public"."events"."location" IS 'Location of the event';

ALTER TABLE "public"."events"
  ALTER COLUMN "id"
  ADD GENERATED BY DEFAULT AS IDENTITY (SEQUENCE NAME
    "public"."events_id_seq" START WITH 1 INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1);

CREATE TABLE IF NOT EXISTS "public"."games"(
  "id" bigint NOT NULL,
  "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
  "steam_id" bigint,
  "name" "text",
  "shorthand" "text",
  "created_by" "uuid"
);

ALTER TABLE "public"."games" OWNER TO "postgres";

COMMENT ON TABLE "public"."games" IS 'Game definitions';

ALTER TABLE "public"."games"
  ALTER COLUMN "id"
  ADD GENERATED BY DEFAULT AS IDENTITY (SEQUENCE NAME
    "public"."games_id_seq" START WITH 1 INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1);

CREATE TABLE IF NOT EXISTS "public"."gameservers"(
  "id" bigint NOT NULL,
  "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
  "modified_at" timestamp with time zone,
  "created_by" "uuid",
  "modified_by" "uuid",
  "address" "text",
  "port" "text",
  "game" bigint,
  "description" "text",
  "region" "public"."region"
);

ALTER TABLE "public"."gameservers" OWNER TO "postgres";

COMMENT ON TABLE "public"."gameservers" IS 'Servers hosted or managed by Hivecom';

ALTER TABLE "public"."gameservers"
  ALTER COLUMN "id"
  ADD GENERATED BY DEFAULT AS IDENTITY (SEQUENCE NAME
    "public"."gameservers_id_seq" START WITH 1 INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1);

CREATE TABLE IF NOT EXISTS "public"."profiles"(
  "id" "uuid" NOT NULL,
  "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
  "modified_at" timestamp with time zone DEFAULT "now"(),
  "title" "text",
  "subtitle" "text",
  "markdown" "text",
  "modified_by" "uuid",
  "nickname" "text"
);

ALTER TABLE "public"."profiles" OWNER TO "postgres";

COMMENT ON TABLE "public"."profiles" IS 'User profiles';

COMMENT ON COLUMN "public"."profiles"."nickname" IS 'User nickname';

CREATE TABLE IF NOT EXISTS "public"."referendum_votes"(
  "id" bigint NOT NULL,
  "user_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
  "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
  "modified_at" timestamp with time zone DEFAULT "now"(),
  "referendum_id" bigint,
  "comment" "text",
  "choices" bigint[] DEFAULT '{}' ::bigint[] NOT NULL
);

ALTER TABLE "public"."referendum_votes" OWNER TO "postgres";

COMMENT ON TABLE "public"."referendum_votes" IS 'Community referendum votes';

ALTER TABLE "public"."referendum_votes"
  ALTER COLUMN "id"
  ADD GENERATED BY DEFAULT AS IDENTITY (SEQUENCE NAME
    "public"."referendum_votes_id_seq" START WITH 1 INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1);

CREATE TABLE IF NOT EXISTS "public"."referendums"(
  "id" bigint NOT NULL,
  "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
  "created_by" "uuid" DEFAULT "auth"."uid"() NOT NULL,
  "modified_at" timestamp with time zone DEFAULT "now"() NOT NULL,
  "modified_by" "uuid",
  "date_start" timestamp with time zone DEFAULT "now"() NOT NULL,
  "choices" "text"[] NOT NULL,
  "title" "text" NOT NULL,
  "description" "text",
  "date_end" timestamp with time zone NOT NULL,
  "multiple_choice" boolean DEFAULT FALSE NOT NULL
);

ALTER TABLE "public"."referendums" OWNER TO "postgres";

COMMENT ON TABLE "public"."referendums" IS 'Community referendums';

ALTER TABLE "public"."referendums"
  ALTER COLUMN "id"
  ADD GENERATED BY DEFAULT AS IDENTITY (SEQUENCE NAME
    "public"."referendums_id_seq" START WITH 1 INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1);

CREATE TABLE IF NOT EXISTS "public"."role_permissions"(
  "id" bigint NOT NULL,
  "role" "public"."app_role" NOT NULL,
  "permission" "public"."app_permission" NOT NULL
);

ALTER TABLE "public"."role_permissions" OWNER TO "postgres";

COMMENT ON TABLE "public"."role_permissions" IS 'Application permissions for each role.';

ALTER TABLE "public"."role_permissions"
  ALTER COLUMN "id"
  ADD GENERATED BY DEFAULT AS IDENTITY (SEQUENCE NAME
    "public"."role_permissions_id_seq" START WITH 1 INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1);

CREATE TABLE IF NOT EXISTS "public"."user_roles"(
  "id" bigint NOT NULL,
  "user_id" "uuid" NOT NULL,
  "role" "public"."app_role" NOT NULL
);

ALTER TABLE "public"."user_roles" OWNER TO "postgres";

COMMENT ON TABLE "public"."user_roles" IS 'Application roles for each user.';

ALTER TABLE "public"."user_roles"
  ALTER COLUMN "id"
  ADD GENERATED BY DEFAULT AS IDENTITY (SEQUENCE NAME
    "public"."user_roles_id_seq" START WITH 1 INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1);

ALTER TABLE ONLY "public"."events"
  ADD CONSTRAINT "events_id_key" UNIQUE ("id");

ALTER TABLE ONLY "public"."events"
  ADD CONSTRAINT "events_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."games"
  ADD CONSTRAINT "games_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."gameservers"
  ADD CONSTRAINT "gameservers_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."profiles"
  ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."referendum_votes"
  ADD CONSTRAINT "referendum_votes_id_key" UNIQUE ("id");

ALTER TABLE ONLY "public"."referendum_votes"
  ADD CONSTRAINT "referendum_votes_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."referendums"
  ADD CONSTRAINT "referendums_id_key" UNIQUE ("id");

ALTER TABLE ONLY "public"."referendums"
  ADD CONSTRAINT "referendums_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."role_permissions"
  ADD CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."role_permissions"
  ADD CONSTRAINT "role_permissions_role_permission_key" UNIQUE ("role", "permission");

ALTER TABLE ONLY "public"."user_roles"
  ADD CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."user_roles"
  ADD CONSTRAINT "user_roles_user_id_role_key" UNIQUE ("user_id", "role");

ALTER TABLE ONLY "public"."events"
  ADD CONSTRAINT "events_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE ONLY "public"."events"
  ADD CONSTRAINT "events_modified_by_fkey" FOREIGN KEY ("modified_by") REFERENCES "auth"."users"("id") ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE ONLY "public"."games"
  ADD CONSTRAINT "games_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE ONLY "public"."gameservers"
  ADD CONSTRAINT "gameservers_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE ONLY "public"."gameservers"
  ADD CONSTRAINT "gameservers_game_fkey" FOREIGN KEY ("game") REFERENCES "public"."games"("id") ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE ONLY "public"."gameservers"
  ADD CONSTRAINT "gameservers_modified_by_fkey" FOREIGN KEY ("modified_by") REFERENCES "auth"."users"("id") ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE ONLY "public"."profiles"
  ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY "public"."profiles"
  ADD CONSTRAINT "profiles_modified_by_fkey" FOREIGN KEY ("modified_by") REFERENCES "auth"."users"("id") ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE ONLY "public"."referendum_votes"
  ADD CONSTRAINT "referendum_votes_referendum_id_fkey" FOREIGN KEY ("referendum_id") REFERENCES "public"."referendums"("id") ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY "public"."referendum_votes"
  ADD CONSTRAINT "referendum_votes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY "public"."referendums"
  ADD CONSTRAINT "referendums_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE ONLY "public"."referendums"
  ADD CONSTRAINT "referendums_modified_by_fkey" FOREIGN KEY ("modified_by") REFERENCES "auth"."users"("id") ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE ONLY "public"."user_roles"
  ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;

CREATE POLICY "Allow auth admin to read user roles" ON "public"."user_roles"
  FOR SELECT TO "supabase_auth_admin"
    USING (TRUE);

CREATE POLICY "Allow authorized roles to CRUD events" ON "public"."events" TO "authenticated"
  USING ((
    SELECT
      "public"."authorize"('events.crud'::"public"."app_permission") AS "authorize"));

CREATE POLICY "Allow authorized roles to CRUD games" ON "public"."games" TO "authenticated"
  USING ((
    SELECT
      "public"."authorize"('games.crud'::"public"."app_permission") AS "authorize"));

CREATE POLICY "Allow authorized roles to CRUD gameservers" ON "public"."gameservers" TO "authenticated"
  USING ((
    SELECT
      "public"."authorize"('gameservers.crud'::"public"."app_permission") AS "authorize"));

CREATE POLICY "Allow authorized roles to CRUD profiles" ON "public"."profiles" TO "authenticated"
  USING ((
    SELECT
      "public"."authorize"('profiles.crud'::"public"."app_permission") AS "authorize"));

CREATE POLICY "Allow authorized roles to CRUD referendums" ON "public"."referendums" TO "authenticated"
  USING ((
    SELECT
      "public"."authorize"('referendums.crud'::"public"."app_permission") AS "authorize"));

CREATE POLICY "Allow authorized roles to CRUD user roles" ON "public"."user_roles" TO "authenticated"
  USING ((
    SELECT
      "public"."authorize"('gameservers.crud'::"public"."app_permission") AS "authorize"));

CREATE POLICY "Authenticated users can CRUD their own vote" ON "public"."referendum_votes" TO "authenticated"
  USING (((
    SELECT
      "auth"."uid"() AS "uid") = "user_id"))
      WITH CHECK (((
        SELECT
          "auth"."uid"() AS "uid") = "user_id"));

CREATE POLICY "Authenticated users can SELECT referendum votes" ON "public"."referendum_votes"
  FOR SELECT TO "authenticated"
    USING (TRUE);

CREATE POLICY "Authenticated users can SELECT referendums" ON "public"."referendums"
  FOR SELECT TO "authenticated"
    USING (TRUE);

CREATE POLICY "Authorized users can CRUD votes" ON "public"."referendum_votes" TO "authenticated"
  USING ((
    SELECT
      "public"."authorize"('referendums.crud'::"public"."app_permission") AS "authorize"));

CREATE POLICY "Everyone can SELECT events" ON "public"."events"
  FOR SELECT TO "authenticated", "anon"
    USING (TRUE);

CREATE POLICY "Everyone can SELECT games" ON "public"."games"
  FOR SELECT TO "authenticated", "anon"
    USING (TRUE);

CREATE POLICY "Everyone can SELECT gameservers" ON "public"."gameservers"
  FOR SELECT TO "authenticated", "anon"
    USING (TRUE);

CREATE POLICY "Everyone can SELECT role permissions" ON "public"."role_permissions"
  FOR SELECT TO "authenticated", "anon"
    USING (TRUE);

CREATE POLICY "Users can SELECT profiles" ON "public"."profiles"
  FOR SELECT TO "authenticated"
    USING (TRUE);

CREATE POLICY "Users can UPDATE their profiles" ON "public"."profiles"
  FOR UPDATE TO "authenticated"
    USING (((
      SELECT
        "auth"."uid"() AS "uid") = "id"))
        WITH CHECK (((
          SELECT
            "auth"."uid"() AS "uid") = "id"));

ALTER TABLE "public"."events" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."games" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."gameservers" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."referendum_votes" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."referendums" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."role_permissions" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."user_roles" ENABLE ROW LEVEL SECURITY;

ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";

GRANT USAGE ON SCHEMA "public" TO "postgres";

GRANT USAGE ON SCHEMA "public" TO "anon";

GRANT USAGE ON SCHEMA "public" TO "authenticated";

GRANT USAGE ON SCHEMA "public" TO "service_role";

GRANT USAGE ON SCHEMA "public" TO "supabase_auth_admin";

GRANT ALL ON FUNCTION "public"."authorize"("requested_permission" "public"."app_permission") TO "anon";

GRANT ALL ON FUNCTION "public"."authorize"("requested_permission" "public"."app_permission") TO "authenticated";

GRANT ALL ON FUNCTION "public"."authorize"("requested_permission" "public"."app_permission") TO "service_role";

REVOKE ALL ON FUNCTION "public"."custom_access_token_hook"("event" "jsonb") FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."custom_access_token_hook"("event" "jsonb") TO "service_role";

GRANT ALL ON FUNCTION "public"."custom_access_token_hook"("event" "jsonb") TO "supabase_auth_admin";

GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";

GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";

GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";

GRANT ALL ON TABLE "public"."events" TO "anon";

GRANT ALL ON TABLE "public"."events" TO "authenticated";

GRANT ALL ON TABLE "public"."events" TO "service_role";

GRANT ALL ON SEQUENCE "public"."events_id_seq"
  TO "anon";

GRANT ALL ON SEQUENCE "public"."events_id_seq"
  TO "authenticated";

GRANT ALL ON SEQUENCE "public"."events_id_seq"
  TO "service_role";

GRANT ALL ON TABLE "public"."games" TO "anon";

GRANT ALL ON TABLE "public"."games" TO "authenticated";

GRANT ALL ON TABLE "public"."games" TO "service_role";

GRANT ALL ON SEQUENCE "public"."games_id_seq"
  TO "anon";

GRANT ALL ON SEQUENCE "public"."games_id_seq"
  TO "authenticated";

GRANT ALL ON SEQUENCE "public"."games_id_seq"
  TO "service_role";

GRANT ALL ON TABLE "public"."gameservers" TO "anon";

GRANT ALL ON TABLE "public"."gameservers" TO "authenticated";

GRANT ALL ON TABLE "public"."gameservers" TO "service_role";

GRANT ALL ON SEQUENCE "public"."gameservers_id_seq"
  TO "anon";

GRANT ALL ON SEQUENCE "public"."gameservers_id_seq"
  TO "authenticated";

GRANT ALL ON SEQUENCE "public"."gameservers_id_seq"
  TO "service_role";

GRANT ALL ON TABLE "public"."profiles" TO "anon";

GRANT ALL ON TABLE "public"."profiles" TO "authenticated";

GRANT ALL ON TABLE "public"."profiles" TO "service_role";

GRANT ALL ON TABLE "public"."referendum_votes" TO "anon";

GRANT ALL ON TABLE "public"."referendum_votes" TO "authenticated";

GRANT ALL ON TABLE "public"."referendum_votes" TO "service_role";

GRANT ALL ON SEQUENCE "public"."referendum_votes_id_seq"
  TO "anon";

GRANT ALL ON SEQUENCE "public"."referendum_votes_id_seq"
  TO "authenticated";

GRANT ALL ON SEQUENCE "public"."referendum_votes_id_seq"
  TO "service_role";

GRANT ALL ON TABLE "public"."referendums" TO "anon";

GRANT ALL ON TABLE "public"."referendums" TO "authenticated";

GRANT ALL ON TABLE "public"."referendums" TO "service_role";

GRANT ALL ON SEQUENCE "public"."referendums_id_seq"
  TO "anon";

GRANT ALL ON SEQUENCE "public"."referendums_id_seq"
  TO "authenticated";

GRANT ALL ON SEQUENCE "public"."referendums_id_seq"
  TO "service_role";

GRANT ALL ON TABLE "public"."role_permissions" TO "anon";

GRANT ALL ON TABLE "public"."role_permissions" TO "authenticated";

GRANT ALL ON TABLE "public"."role_permissions" TO "service_role";

GRANT ALL ON SEQUENCE "public"."role_permissions_id_seq"
  TO "anon";

GRANT ALL ON SEQUENCE "public"."role_permissions_id_seq"
  TO "authenticated";

GRANT ALL ON SEQUENCE "public"."role_permissions_id_seq"
  TO "service_role";

GRANT ALL ON TABLE "public"."user_roles" TO "service_role";

GRANT ALL ON TABLE "public"."user_roles" TO "supabase_auth_admin";

GRANT ALL ON SEQUENCE "public"."user_roles_id_seq"
  TO "anon";

GRANT ALL ON SEQUENCE "public"."user_roles_id_seq"
  TO "authenticated";

GRANT ALL ON SEQUENCE "public"."user_roles_id_seq"
  TO "service_role";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";

RESET ALL;

