# Déploiement backend (Windows) : dépendances, migrations, client Prisma, build.
# Prérequis : Node 20+, .env avec DATABASE_URL
$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')

Write-Host "==> Répertoire :" (Get-Location)

if (-not (Test-Path .env)) {
  Write-Warning "Pas de fichier .env — DATABASE_URL doit être définie dans l’environnement."
}

Write-Host "==> npm ci"
npm ci

Write-Host "==> prisma migrate deploy"
npx prisma migrate deploy

Write-Host "==> prisma generate"
npx prisma generate

Write-Host "==> npm run build (tsc)"
npm run build

Write-Host "==> Terminé. Démarrage : npm run start"
