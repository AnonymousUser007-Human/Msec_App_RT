#!/usr/bin/env bash
# Déploiement backend : dépendances, migrations Prisma, client Prisma, build TypeScript.
# Prérequis : Node 20+, fichier .env avec DATABASE_URL (et le reste).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "==> Répertoire : $ROOT"

if [[ ! -f .env ]]; then
  echo "Attention : pas de fichier .env — assurez-vous que DATABASE_URL est définie dans l’environnement." >&2
fi

echo "==> npm ci"
npm ci

echo "==> prisma migrate deploy"
npx prisma migrate deploy

echo "==> prisma generate"
npx prisma generate

echo "==> npm run build (tsc)"
npm run build

echo "==> Terminé. Démarrage : npm run start"
