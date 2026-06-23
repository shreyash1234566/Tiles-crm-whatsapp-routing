# Design Document: Separate Database for Tiles & Sanitary CRM

## Overview

The goal is simple: run the same CRM codebase against a **separate PostgreSQL database** for the Tiles & Sanitary showroom, so its data never lands in the existing Furniture database. The application already connects via a single `DATABASE_URL` environment variable (see `lib/db.ts`) and uses **Prisma** for schema and migrations. We therefore do **not** need a custom migration tool — we only need separate environment configuration and to run Prisma's existing commands against the new database.

This design uses **environment-file-based separation**: each business vertical has its own `.env` file pointing at its own database. The same code, the same Prisma schema, and the same tables — just an isolated database per vertical.

## Goals

- Tiles CRM writes to its own database; Furniture data is untouched.
- No code changes to API routes or queries (they keep using `prisma` from `lib/db.ts`).
- Reuse Prisma's built-in migrate/push/seed — no homegrown migration engine.
- Keep the existing Furniture setup working exactly as-is (backward compatible).

## Non-Goals

- Building a custom migration CLI, rollback engine, advisory locks, or checksum tracking (Prisma already handles migrations).
- Multi-tenant routing inside a single running process. Each vertical runs as its own deployment/process with its own env file.

## Current State

- `lib/db.ts` creates a `PrismaClient` using a `pg.Pool` with `connectionString: process.env.DATABASE_URL`. No change required.
- `prisma/schema.prisma` defines all models; `datasource db { url = env("DATABASE_URL") }`.
- `prisma/seed.ts` seeds initial data.
- `package.json` already has: `db:generate`, `db:push`, `db:migrate`, `db:seed`, `db:reset`, `setup`.
- `dotenv` is installed (devDependency), so Prisma CLI can target a specific env file.

## Approach

### 1. Environment files per vertical

Create dedicated env files (git-ignored), each with its own connection string:

- `.env` (or `.env.furniture`) → `DATABASE_URL` = existing furniture database
- `.env.tiles` → `DATABASE_URL` = **new** tiles database (e.g. `tiles_sanitary_crm`)

Provide a committed `.env.example` documenting required variables so anyone can reproduce the setup.

Because `lib/db.ts` and `schema.prisma` both read `DATABASE_URL`, simply loading a different env file selects the database. No code routing logic is needed.

### 2. NPM scripts for the tiles database

Add scripts that run the existing Prisma commands with the tiles env file loaded via `dotenv -e .env.tiles`:

```
db:push:tiles    -> dotenv -e .env.tiles -- prisma db push
db:migrate:tiles -> dotenv -e .env.tiles -- prisma migrate deploy
db:seed:tiles    -> dotenv -e .env.tiles -- tsx prisma/seed.ts
setup:tiles      -> prisma generate && dotenv -e .env.tiles -- prisma db push && dotenv -e .env.tiles -- tsx prisma/seed.ts
dev:tiles        -> dotenv -e .env.tiles -- next dev
```

The existing furniture scripts remain unchanged.

### 3. Tiles-specific seed data (optional but recommended)

The shared `prisma/seed.ts` will branch on a `BUSINESS_TYPE` env var (default `furniture`) so that when seeding the tiles database it creates tiles/sanitary-relevant defaults:

- Store settings with a tiles & sanitary showroom name.
- Product categories such as Floor Tiles, Wall Tiles, Bathroom Fittings, Sanitaryware, Faucets, etc.
- A default admin user.

When `BUSINESS_TYPE` is unset or `furniture`, seeding behaves exactly as today.

### 4. Documentation

A short README section explaining: create the new database, copy `.env.example` to `.env.tiles`, set its `DATABASE_URL`, run `setup:tiles`, then `dev:tiles`. Include a note that the two databases are fully isolated.

## Data Isolation

Isolation is guaranteed by PostgreSQL itself: two different databases (or two different connection strings) share no tables or rows. Since the tiles process only ever loads `.env.tiles`, it can only reach the tiles database.

## Backward Compatibility

- The furniture deployment continues to use `.env` / `DATABASE_URL` and the existing scripts.
- `lib/db.ts` is unchanged.
- `prisma/seed.ts` only gains a guarded branch; default behavior is identical.

## Testing / Verification

- `npx dotenv -e .env.tiles -- prisma migrate status` (or `db push`) confirms the tiles schema is created in the new database.
- After seeding tiles, connect to the furniture DB and confirm no tiles seed rows appear, and vice versa.
- Start `dev:tiles`, create a record, and verify it lands in the tiles database only.

## Risks

- **Wrong env file loaded** → writing to the wrong DB. Mitigation: clearly named scripts (`:tiles` suffix) and a startup log line printing the active database name (host/db only, credentials redacted).
- **Schema drift between databases** → run the same Prisma migrate/push against both whenever the schema changes.
