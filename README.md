# hivecom.net

[![deploy](https://github.com/Mavulp/hivecom.net/actions/workflows/deploy.yml/badge.svg)](https://github.com/Mavulp/hivecom.net/actions/workflows/deploy.yml)
[![Fetch Supabase project DB types](https://github.com/hivecom/hivecom.net/actions/workflows/types.yml/badge.svg)](https://github.com/hivecom/hivecom.net/actions/workflows/types.yml)

Main website for the Hivecom community.

This is a Nuxt project. As such, look at the [Nuxt 3 documentation](https://nuxt.com/docs/getting-started/introduction) to learn more.

## Setup

Make sure to install the dependencies:

```bash
npm install
```

To run the Supabase instance locally, you will need to make sure you have [Docker](https://docs.docker.com/get-docker/) installed.

From there, link your project via the following command:

```bash
npm run supabase:link
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
npm run supabase:[start/stop]
```

Once you have the Supabase instance running, you can access the admin panel at `http://localhost:54323`. To make your local app direct to it, read out the
API URL and anon key and replace the values in your `.env` file. Make sure to include the port for the API URL.

## Production

Build the application for production:

```bash
# npm
npm run build
```

Locally preview production build:

```bash
# npm
npm run preview
```

Check out the [deployment documentation](https://nuxt.com/docs/getting-started/deployment) for more information.

## DB Changes / Migrations

First make sure you're pulling the lastest version of the database:

```bash
npx supabase db pull
```

Next up, depending on how comfortable you are with SQL, you can either use the Supabase Studio to make changes to the database or use the CLI to make changes directly.

For the SQL route, you can create a new migration file with:

```bash
npx supabase migration new <migration_name>
```

This will create a new SQL file in the `supabase/migrations` directory. You can then edit this file to add your SQL commands. Apply those migrations with `npx supabase migrations up` to apply the changes to your local database.

Alternatively, use the Supabase Studio to make changes to the database. This is a more user-friendly way to manage your database schema. You can access the Supabase Studio at `http://localhost:54323` when running a local instance.

Once you have made your database changes in the studio, diff the changes to a migration file with:

```bash
npx supabase db diff -f <your_migration_name>
```

Now to wrap things up and test your changes, you can make sure your local database will reset to the latest migration with:

```bash
npx supabase db reset
```

Finally once you've confirmed everything is working as expected, you can push the changes to the remote database with:

```bash
npx supabase db push
```
