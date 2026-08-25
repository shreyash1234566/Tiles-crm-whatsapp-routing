# ──────────────────────────────────────────────────────────
#  Furniture CRM — Reset & Re-Seed Database (Windows)
#  Usage: powershell -ExecutionPolicy Bypass -File scripts\reset-db.ps1
# ──────────────────────────────────────────────────────────

$ErrorActionPreference = "Stop"
$env:Path = "C:\pgsql-local\pgsql\bin;C:\nodejs-new\node-v22.15.0-win-x64;" + $env:Path
$env:BUSINESS_TYPE = "tiles"
$env:NEXT_PUBLIC_BUSINESS_TYPE = "tiles"

Write-Host ""
Write-Host "Resetting database..." -ForegroundColor Yellow
npx prisma db push --force-reset

Write-Host "Seeding data..." -ForegroundColor Yellow
npx tsx prisma/seed.ts

Write-Host ""
Write-Host "Database reset complete!" -ForegroundColor Green
Write-Host "  Admin: admin@tilescrm.com / admin123" -ForegroundColor Magenta
