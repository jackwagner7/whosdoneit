# Who's Done It

This app is set up to run against a local Supabase stack in development.

## Prerequisites

- Node.js
- Docker Desktop
- Supabase CLI

## Local setup

1. Copy the tracked env template if you need a fresh local env file.

```bash
cp .env.example .env.local
```

2. Start the local Supabase stack.

```bash
npm run supabase:start
```

3. Reset and seed the local database from the checked-in SQL files.

```bash
npm run supabase:reset
```

4. Start the Next.js app.

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Local services

- App: `http://localhost:3000`
- Supabase API: `http://127.0.0.1:54321`
- Supabase Studio: `http://127.0.0.1:54323`
- Local Postgres: `postgresql://postgres:postgres@127.0.0.1:54322/postgres`

## Database bootstrap

Local `supabase db reset` applies:

- `supabase/migrations/*.sql`
- `supabase/reseed_sayless_pop_culture_cards.sql`

The migration files bootstrap the schema. The reseed file refreshes the Say Less card catalog.


## Stuff I forget

- npm run dev
- npx start supabase
- npx reset supabase
- npx supabase db push