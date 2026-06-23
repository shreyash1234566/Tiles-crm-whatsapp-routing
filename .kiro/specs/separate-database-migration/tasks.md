# Implementation Plan: Separate Database for Tiles & Sanitary CRM

## Overview

This plan wires up a separate PostgreSQL database for the Tiles & Sanitary CRM using the project's existing Prisma setup. There is no custom migration tooling — we add environment files, npm scripts that target the tiles database via `dotenv -e .env.tiles`, optional tiles-specific seed data, and documentation. The existing Furniture CRM is left working unchanged.

## Tasks

- [x] 1. Create environment configuration files
  - Create `.env.example` documenting required variables: `DATABASE_URL`, `BUSINESS_TYPE`, and any other env vars already referenced by the app (e.g. auth/storage keys) with placeholder values.
  - Create `.env.tiles` with `BUSINESS_TYPE=tiles` and a placeholder `DATABASE_URL` pointing at a new tiles database (e.g. `postgresql://USER:PASSWORD@HOST:5432/tiles_sanitary_crm`).
  - Ensure `.env.tiles` (and other real env files) are git-ignored in `.gitignore`.
  - _Requirements: 1.1, 1.2, 1.3, 5.1, 8.1_

- [x] 2. Add npm scripts to target the tiles database
  - In `package.json`, add scripts using `dotenv -e .env.tiles --` (dotenv is already a devDependency):
    - `db:push:tiles` → `dotenv -e .env.tiles -- prisma db push`
    - `db:migrate:tiles` → `dotenv -e .env.tiles -- prisma migrate deploy`
    - `db:seed:tiles` → `dotenv -e .env.tiles -- tsx prisma/seed.ts`
    - `setup:tiles` → `prisma generate && dotenv -e .env.tiles -- prisma db push && dotenv -e .env.tiles -- tsx prisma/seed.ts`
    - `dev:tiles` → `dotenv -e .env.tiles -- next dev`
  - Leave all existing furniture scripts unchanged.
  - _Requirements: 3.1, 3.2, 5.2, 5.3_

- [x] 3. Add an active-database startup log (safety)
  - In `lib/db.ts`, after creating the pool, log the active database name and host (parsed from `DATABASE_URL`) with credentials redacted, plus `BUSINESS_TYPE` if set. Only log in non-production or behind a debug flag.
  - This makes it obvious which database the running process is connected to.
  - _Requirements: 5.4, 9.1, 11.x_

- [x] 4. Make the seed script vertical-aware
  - [x] 4.1 Branch seed logic on `BUSINESS_TYPE`
    - In `prisma/seed.ts`, read `BUSINESS_TYPE` (default `furniture`).
    - When `furniture` or unset, keep current behavior exactly.
    - When `tiles`, seed tiles defaults instead (see 4.2).
    - _Requirements: 4.1, 8.1, 8.2_
  - [x] 4.2 Add tiles & sanitary seed data
    - Create default store settings with a tiles & sanitary showroom name.
    - Create product categories relevant to tiles/sanitary (e.g. Floor Tiles, Wall Tiles, Bathroom Fittings, Sanitaryware, Faucets, Adhesives & Grouts).
    - Create a default admin user.
    - Make seeding idempotent (skip rows that already exist) so re-running is safe.
    - _Requirements: 4.2, 4.3, 4.4, 4.5_

- [x] 5. Provision and migrate the tiles database
  - Document/run creation of a new empty PostgreSQL database for tiles (the actual DB creation is an operator step; confirm the connection string in `.env.tiles` is valid).
  - Run `npm run setup:tiles` (generate client + push schema + seed) so all tables exist in the tiles database.
  - Note: this task may require the user to supply real database credentials; pause and ask if they are not available.
  - _Requirements: 3.2, 3.3, 4.1, 11.x_

- [x] 6. Verify database isolation
  - Confirm the tiles schema/tables exist in the tiles database (`dotenv -e .env.tiles -- prisma migrate status` or `prisma db pull`/Studio).
  - Confirm furniture data is untouched and tiles seed rows do not appear in the furniture database.
  - Start `npm run dev:tiles`, create one record, and verify it persists only in the tiles database.
  - _Requirements: 7.1, 7.2, 7.3, 7.4_

- [x] 7. Document the setup
  - Add a README section: how to create the tiles database, copy `.env.example` → `.env.tiles`, set `DATABASE_URL`, run `setup:tiles`, and start with `dev:tiles`.
  - Include the new npm scripts and a short troubleshooting note (wrong env file, schema drift).
  - State clearly that furniture and tiles databases are fully isolated.
  - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5_

## Notes

- Reuses Prisma's built-in migrate/push/seed — no custom migration engine.
- The Furniture CRM continues to work with the existing `.env` and scripts (backward compatible).
- Isolation is enforced by PostgreSQL: separate databases share no data.
- Task 5 may need real DB credentials from the user before it can complete.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1"] },
    { "id": 1, "tasks": ["2", "3", "4.1"] },
    { "id": 2, "tasks": ["4.2"] },
    { "id": 3, "tasks": ["5"] },
    { "id": 4, "tasks": ["6"] },
    { "id": 5, "tasks": ["7"] }
  ]
}
```
