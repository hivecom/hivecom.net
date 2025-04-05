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
