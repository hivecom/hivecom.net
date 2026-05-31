# hivecom.net

[![build](https://github.com/hivecom/hivecom.net/actions/workflows/build.yml/badge.svg)](https://github.com/hivecom/hivecom.net/actions/workflows/build.yml)
[![deploy](https://github.com/hivecom/hivecom.net/actions/workflows/deploy.yml/badge.svg?branch=main)](https://github.com/hivecom/hivecom.net/actions/workflows/deploy.yml)

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

From there, it is recommended to configure your Supabase configuration. Add `SUPABASE_URL` and `SUPABASE_KEY` (your publishable key) to your `.env` in the root of the project:

```env
SUPABASE_URL="https://example.supabase.co"
SUPABASE_KEY="<your_key>"
```

## Development Server

Start the development server on `http://localhost:3000`:

```bash
npm run dev
```

This automatically start the Supabase instance locally as well if it's not already running. Keep in mind Docker is required for this to function.

To separately start or stop the Supabase instance, you can use the following commands:

```bash
npm run supabase [start/stop]
```

Once you have the Supabase instance running, you can access the admin panel at `http://localhost:54323`. To make your local app direct to it, read out the API URL and anon key and replace the values in your `.env` file. Make sure to include the port for the API URL.

If you'd like to test locally against production, you can invoke `npm run dev:staging`. Make sure the production credentials are defined in `.env.production`.

Don't forget to reset your local database to the latest migrations after starting the Supabase instance (we have a command for this as it also uploads static content to Supabase storage for local development):

```bash
npm run reset
```

This will ensure your local database is in sync with the latest migrations and schema changes plus seed it with the initial data.

## Edge Functions

Our edge functions are located in the `supabase/functions` directory. Keep in mind they run on Deno, so you will need to install Deno if you haven't already.

Then, install their dependencies:

```bash
cd supabase/functions
deno install
```

If you want to run the edge functions locally, you can do so with the following command:

```bash
npm run supabase functions serve
```

This will start a local server on `http://localhost:54321` where you can test your edge functions. If you ran `supabase start` before, your edge functions _should_ already be running on that port. If you create new edge functions, you will need to restart the server for them to be available.

Additionally, this command lets you see console logs from the edge functions. This is useful for debugging and testing your functions locally.

You can then use cURL or any other HTTP client to test your edge functions. For example, to test the `ping` function, you can run:

```bash
curl --request POST 'http://localhost:54321/functions/v1/ping' \
--header 'Authorization: Bearer SUPABASE_KEY' \
--header 'Content-Type: application/json' \
--data '{ "who":"me" }'
```

To format your edge functions, you can use the following command:

```bash
cd supabase/functions
deno fmt
```

If you want to push your edge functions to the Supabase project, you can do so with:

```bash
npm run supabase functions deploy <function_name>
```

## Production

To build the application for production:

```bash
npm run build
```

Locally preview the production build (keep in mind this will run against `.env`):

```bash
npm run preview
```

Check out the [deployment documentation](https://nuxt.com/docs/getting-started/deployment) for more information.

Make sure your GitHub pages deployment action has the right variables/secrets defined and matches those in the `.env` file.

## Scheduled Deploys

The `deploy` GitHub Actions workflow also runs once a week to rebuild and deploy the site. This ensures new dynamic content gets captured in the generated static paths even if no one pushes code that week. If you need to change the cadence, update the `schedule` cron in `.github/workflows/deploy.yml`.

## DB Changes / Migrations

### Local development workflow

Start by resetting your local environment and database to the latest migrations:

```bash
npm run reset
```

If you need to sync your local files with the current production schema, pull the latest remote migrations:

```bash
npm run supabase db pull
```

### Creating migrations

You can create migrations via SQL files:

```bash
npm run supabase migration new <migration_name>
```

Edit the new file in `supabase/migrations`, then apply locally:

```bash
npx supabase migrations up
```

Or make changes in Supabase Studio (`http://localhost:54323`) and generate a migration from the diff:

```bash
npm run supabase db diff -f <your_migration_name>
```

### Verify locally

Make sure your local database resets cleanly:

```bash
npm run reset
```

Then regenerate types:

```bash
npm run types
```

### Pushing to production

Only after local validation:

```bash
npm run supabase db push
```

> [!WARNING]
> `npm run supabase db push` applies migrations to **production**. Treat it as a production release step.
> Always review your migration SQL and confirm it’s safe before pushing.

## Further Reading

The documents below cover the detailed workings of the application - database triggers, scheduled jobs, secrets management, runtime configuration, and system architecture. If you are setting up a new environment, debugging unexpected behaviour, or extending an existing system, these are the right place to start.

| Document                                         | Contents                                                                                                        |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| [README_TRIGGERS.md](README_TRIGGERS.md)         | All database triggers - which are manual (protected schemas) and which are migration-managed                    |
| [README_CRON.md](README_CRON.md)                 | Scheduled cron jobs, their schedules, and required environment variables                                        |
| [README_VAULT.md](README_VAULT.md)               | Supabase Vault secrets required by triggers and cron functions                                                  |
| [README_KVSTORE.md](README_KVSTORE.md)           | Public and private KV store keys and their consumers                                                            |
| [README_ARCHITECTURE.md](README_ARCHITECTURE.md) | Cross-cutting system designs including RBAC, entity discussions, media cleanup, event sync, and the Steam queue |
| [README_CHAT.md](README_CHAT.md)                 | Chat client overview, OIDC/SASL auth bridge setup, and Ergo configuration checklist                             |
