# Multi-Database Setup (Separate Database per Business Vertical)

This project runs the **same codebase** for different business verticals
(Furniture, Tiles & Sanitary) against **separate PostgreSQL databases**, so each
vertical's data is fully isolated from the others.

## Overview

- `lib/db.ts` and `prisma/schema.prisma` both read the `DATABASE_URL` environment
  variable. Loading a different env file simply points the app at a different
  database — there is no in-code routing or multi-tenant logic.
- A `BUSINESS_TYPE` env var (`furniture` | `tiles`) drives vertical-specific seed
  data. It defaults to `furniture` when unset.
- Data isolation is enforced by PostgreSQL itself: the databases are physically
  separate, so they share no tables or rows. A process that only ever loads
  `.env.tiles` can only ever reach the tiles database.

No application code changes are needed to add a vertical — you create a database,
add an env file, and run the existing Prisma commands against it.

## Environment files

| File | Purpose |
| --- | --- |
| `.env` (or `.env.furniture`) | Furniture `DATABASE_URL` + `BUSINESS_TYPE=furniture` |
| `.env.tiles` | Tiles `DATABASE_URL` + `BUSINESS_TYPE=tiles` |
| `.env.example` | Committed template with placeholder values |

Real env files contain credentials and are **git-ignored**. Only `.env.example`
is tracked in git. Copy it to create a real env file:

```bash
cp .env.example .env          # furniture
cp .env.example .env.tiles    # tiles & sanitary
```

## Creating a new vertical database (local PostgreSQL example)

1. **Create the database.** On Windows, `psql` is often not on the `PATH`, so call
   it with its full path:

   ```bat
   "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -c "CREATE DATABASE tiles_sanitary_crm;"
   ```

   On systems where `psql`/`createdb` are on the `PATH`, the equivalent is:

   ```bash
   createdb tiles_sanitary_crm
   ```

2. **Build the connection string** using this format:

   ```
   postgresql://USER:PASSWORD@localhost:5432/tiles_sanitary_crm
   ```

   URL-encode any special characters in the password (for example `@` → `%40`,
   `:` → `%3A`, `/` → `%2F`).

3. **Put the URL into `.env.tiles`** as `DATABASE_URL`, and set
   `BUSINESS_TYPE=tiles`.

## NPM scripts

These scripts target the tiles database by loading `.env.tiles` via
`dotenv -e .env.tiles --`. The `dotenv` CLI is provided by the `dotenv-cli`
devDependency, so run `npm install` first.

| Script | Command | What it does |
| --- | --- | --- |
| `db:push:tiles` | `dotenv -e .env.tiles -- prisma db push` | Pushes the Prisma schema to the tiles database (no migration files). |
| `db:migrate:tiles` | `dotenv -e .env.tiles -- prisma migrate deploy` | Applies committed Prisma migrations to the tiles database. |
| `db:seed:tiles` | `dotenv -e .env.tiles -- tsx prisma/seed.ts` | Seeds the tiles database with tiles/sanitary defaults (because `BUSINESS_TYPE=tiles`). |
| `setup:tiles` | `prisma generate && dotenv -e .env.tiles -- prisma db push && dotenv -e .env.tiles -- tsx prisma/seed.ts` | One-shot setup: generate the Prisma client, push the schema, and seed — all against the tiles database. |
| `tunnel` | `dotenv -e .env -- ngrok http 3000` | Exposes an already-running default dev server on port 3000. |
| `dev:mobile` | `dotenv -e .env -- concurrently ...` | Starts the default dev server and an ngrok tunnel together. |
| `dev:tiles` | `dotenv -e .env.tiles -- next dev` | Runs the Next.js dev server connected to the tiles database. |
| `tunnel:tiles` | `dotenv -e .env.tiles -- ngrok http 3001` | Exposes an already-running TGM dev server through a temporary HTTPS URL. |
| `dev:tiles:mobile` | `dotenv -e .env.tiles -- concurrently ...` | Starts the TGM dev server and an ngrok tunnel together. |

The existing furniture scripts (`db:push`, `db:migrate`, `db:seed`, `setup`, `dev`,
etc.) are unchanged and continue to use `.env` / `DATABASE_URL`.

Typical first run for a new tiles database:

```bash
npm install        # ensures dotenv-cli is available
npm run setup:tiles
npm run dev:tiles
```

## Testing on a mobile device

The TGM app runs on port `3001`. To expose it to a phone on another network,
create a free ngrok authtoken and add it only to your local `.env.tiles` file:

```dotenv
NGROK_AUTHTOKEN="your-local-ngrok-token"
```

Then use one of these workflows:

```bash
# Recommended: starts Next.js and ngrok together
npm run dev:tiles:mobile

# Or, if `npm run dev:tiles` is already running in another terminal
npm run tunnel:tiles

# If you started the app with the generic `npm run dev` command instead
npm run tunnel
```

Copy the printed `Public URL` into the mobile browser. Keep the terminal open
while testing; `Ctrl+C` closes the tunnel and stops the combined development
server.

## Tiles seed data

When `BUSINESS_TYPE=tiles`, `prisma/seed.ts` seeds tiles/sanitary defaults instead
of furniture data:

- **Store settings:** store name `Tiles & Sanitary Showroom`.
- **Product categories:** Floor Tiles, Wall Tiles, Vitrified Tiles,
  Bathroom Fittings, Sanitaryware, Faucets, Adhesives & Grouts, Kitchen Sinks.
- **Default admin login:** `admin@tilescrm.com` / `admin123` — **change this
  password immediately** after first login.

Seeding is idempotent, so re-running `db:seed:tiles` is safe.

## Verifying isolation

List the databases (Windows example shown; drop the full path if `psql` is on the
`PATH`):

```bat
"C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -c "\l"
```

Confirm each database holds only its own data by comparing the store name per
database:

```bat
:: Tiles database — expect "Tiles & Sanitary Showroom"
"C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -d tiles_sanitary_crm -c "SELECT \"storeName\" FROM \"StoreSettings\";"

:: Furniture database — expect "Furniture Store" (no tiles rows)
"C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -d furniture_crm -c "SELECT \"storeName\" FROM \"StoreSettings\";"
```

You can also confirm the tiles schema is present with:

```bash
npx dotenv -e .env.tiles -- prisma migrate status
```

Finally, start `npm run dev:tiles`, create one record, and verify it appears only
in the tiles database.

## Troubleshooting

- **Wrong env file loaded / writing to the wrong database.** `lib/db.ts` prints a
  startup log line in non-production:

  ```
  [db] BUSINESS_TYPE=tiles connected to host=localhost:5432 db=tiles_sanitary_crm
  ```

  Check this line to confirm the running process is connected to the database you
  expect. Credentials are redacted (only host, port, and database name are shown).

- **Schema drift between databases.** The verticals share one `schema.prisma`, so
  whenever the schema changes, re-run the push/migrate against **both** databases:

  ```bash
  npm run db:push          # furniture
  npm run db:push:tiles    # tiles
  ```

- **`dotenv: command not found`.** The `:tiles` scripts rely on the `dotenv` CLI
  from the `dotenv-cli` devDependency. Run `npm install` to install it.
