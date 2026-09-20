#!/bin/sh
# Entrypoint: sync schema, seed on first boot (fresh volume), then serve.
set -e

: "${DATABASE_URL:=file:/data/dispatch.db}"
export DATABASE_URL

# Sync schema, then seed (the seed is a no-op unless the roster is empty).
npx drizzle-kit push
npx tsx scripts/seed.ts

exec node server.js
