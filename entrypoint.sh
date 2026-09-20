#!/bin/sh
# Entrypoint: sync schema, seed on first boot (fresh volume), then serve.
set -e

: "${DATABASE_URL:=file:/data/dispatch.db}"
export DATABASE_URL

DB_FILE=$(echo "$DATABASE_URL" | sed 's/^file://')
FRESH=0
if [ ! -f "$DB_FILE" ]; then
  FRESH=1
fi

npx drizzle-kit push

if [ "$FRESH" = "1" ]; then
  npx tsx scripts/seed.ts
fi

exec node server.js
