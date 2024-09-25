[![deploy](https://github.com/Mavulp/hivecom.net/actions/workflows/deploy.yml/badge.svg)](https://github.com/Mavulp/hivecom.net/actions/workflows/deploy.yml)
[![build-types](https://github.com/Mavulp/hivecom.net/actions/workflows/build-types.yml/badge.svg)](https://github.com/Mavulp/hivecom.net/actions/workflows/build-types.yml)

# hivecom.net

Main website for the Hivecom community.

This is a Nuxt project. As such, look at the [Nuxt 3 documentation](https://nuxt.com/docs/getting-started/introduction) to learn more.

## Setup

Make sure to install the dependencies:

```bash
npm install
```

To be able to work with Supabase we recommend downloading the [Supabase CLI](https://supabase.com/docs/guides/cli/getting-started) and then logging in via `supabase login`.

Additionally, to run the Supabase instance locally, you will need to make sure you have [Docker](https://docs.docker.com/get-docker/) installed.

From there, it is recommended to configure your Supabase configuration. Add `SUPABASE_URL` and `SUPABASE_KEY` to your `.env`:

```env
SUPABASE_URL="https://example.supabase.co"
SUPABASE_KEY="<your_key>"
```

## Development Server

Start the development server on `http://localhost:3000`:

```bash
npm run dev
```

To additionally have access to a local Supabase instance, you can run the following to start/ stop that instance.

```bash
npm run supabase:[start/stop]
```

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
