# hivecom.net

[![Push Supabase](https://github.com/Mavulp/hivecom.net/actions/workflows/supabase.yml/badge.svg)](https://github.com/hivecom/hivecom.net/actions/workflows/supabase.yml)
[![Fetch Supabase project DB types](https://github.com/hivecom/hivecom.net/actions/workflows/types.yml/badge.svg)](https://github.com/hivecom/hivecom.net/actions/workflows/types.yml)
[![Deploy to GitHub pages](https://github.com/Mavulp/hivecom.net/actions/workflows/pages.yml/badge.svg)](https://github.com/hivecom/hivecom.net/actions/workflows/pages.yml)

Main website for the Hivecom community.

This is a Nuxt project. As such, look at the [Nuxt 3 documentation](https://nuxt.com/docs/getting-started/introduction) to learn more.

## Setup

Make sure to install the dependencies:

```bash
npm install
```

To run the Supabase instance locally, you will need to make sure you have [Docker](https://docs.docker.com/get-docker/) installed.

From there, link your project via the following command:

> [!NOTE]
> We have a `supabase` npm command but you can substitute `npm run supabase` with `npx supabase` too for brevity.
> Make sure to add `--` to the end of the npm command if you want to pass any arguments to the Supabase CLI.

```bash
npm run supabase link
```

You will probably have to login to your Supabase account via the CLI. You can do so via `npx supabase login`.

Ask your project admin for the necessary database credentials if you should have access to the Supabase instance.

From there, it is recommended to configure your Supabase configuration. Add `SUPABASE_URL` and `SUPABASE_KEY` (your anon key) to your `.env` in the root of the project:

```env
SUPABASE_URL="https://example.supabase.co"
SUPABASE_KEY="<your_key>"
```

## Development Server

Start the development server on `http://localhost:3000`:

```bash
npm run dev
```

To additionally have access to a local Supabase instance, you can run the following to start/stop that instance. Keep in mind Docker is required for this to function.

```bash
npm run supabase [start/stop]
```

Once you have the Supabase instance running, you can access the admin panel at `http://localhost:54323`. To make your local app direct to it, read out the API URL and anon key and replace the values in your `.env` file. Make sure to include the port for the API URL.

## Production

If you'd like to test locally against production, you can invoke `npm run dev:staging`. Make sure the production credentials are defined in `.env.production`.

To build the application for production:

```bash
# npm
npm run build
```

Locally preview the production build (keep in mind this will run against `.env`):

```bash
# npm
npm run preview
```

Check out the [deployment documentation](https://nuxt.com/docs/getting-started/deployment) for more information.

## DB Changes / Migrations

First make sure you're pulling the lastest version of the database:

```bash
npm run supabase db pull
```

Next up, depending on how comfortable you are with SQL, you can either use the Supabase Studio to make changes to the database or use the CLI to make changes directly.

For the SQL route, you can create a new migration file with:

```bash
npm run supabase migration new <migration_name>
```

This will create a new SQL file in the `supabase/migrations` directory. You can then edit this file to add your SQL commands. Apply those migrations with `npx supabase migrations up` to apply the changes to your local database.

Alternatively, use the Supabase Studio to make changes to the database. This is a more user-friendly way to manage your database schema. You can access the Supabase Studio at `http://localhost:54323` when running a local instance.

Once you have made your database changes in the studio, diff the changes to a migration file with:

```bash
npm run supabase db diff -f <your_migration_name>
```

Now to wrap things up and test your changes, you can make sure your local database will reset to the latest migration with:

```bash
npm run supabase db reset
```

Finally once you've confirmed everything is working as expected, you can push the changes to the remote database with:

```bash
npm run supabase db push
```

## DB Triggers

Due to some triggers relying on tables that are built-in Supabase you will have to create these triggers manually and not through migrations. Please refer to [TRIGGERS.md](TRIGGERS.md) for more information.

## RBAC

Hivecom utilizes Supabase's setup for role based access control (RBAC). In their guide, they outline the use of auth hooks to inject JWT tokens with additional metadata so the front-end can correctly show what users have access to.

For more information, please refer to the [official guide](https://supabase.com/docs/guides/database/postgres/custom-claims-and-role-based-access-control-rbac?queryGroups=language&language=plpgsql).

## cron

We use the `pg_cron` extension to schedule jobs in the database. This is a great way to run periodic tasks without needing an external service.

Our migrations should automatically create the necessary tables and invocation functions as well as the associated `system_cron_secret` Supabase Vault secret. This secret is used as an authorization token when invoking our cron edge functions so as to not allow anything but the database to invoke them.
