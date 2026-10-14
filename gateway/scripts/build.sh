#!/bin/sh
# Vercel+Neon crea POSTGRES_PRISMA_URL / DATABASE_URL_UNPOOLED: li mappiamo sui nomi attesi, senza mai stampare i valori.
export DATABASE_URL="${DATABASE_URL:-$POSTGRES_PRISMA_URL}"
export DIRECT_DATABASE_URL="${DIRECT_DATABASE_URL:-${DATABASE_URL_UNPOOLED:-${POSTGRES_URL_NON_POOLING:-$DATABASE_URL}}}"
[ -n "$DATABASE_URL" ] || { echo "DATABASE_URL mancante"; exit 1; }
prisma generate && prisma migrate deploy
