# ---- deps ----
FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- builder ----
FROM node:22-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN mkdir -p ./public && npm run build

# ---- runner ----
FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
ENV HOSTNAME=0.0.0.0
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs \
  && mkdir -p /data && chown nextjs:nodejs /data

# Traced standalone server
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Full modules + project files needed by the entrypoint's db setup
# (drizzle-kit and tsx are devDependencies, not in the traced output).
# The whole src tree is included so helper scripts (seed, etc.) can resolve
# their imports (src/lib/*) at boot.
COPY --from=deps --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json
COPY --from=builder --chown=nextjs:nodejs /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=builder --chown=nextjs:nodejs /app/src ./src
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts
COPY --chown=nextjs:nodejs entrypoint.sh ./entrypoint.sh
# Strip any Windows (CRLF) line endings: a stray \r breaks the #!/bin/sh
# shebang and the machine crash-loops with "No such file or directory".
RUN chmod +x ./entrypoint.sh && sed -i 's/\r$//' ./entrypoint.sh

USER nextjs
EXPOSE 8080
ENTRYPOINT ["./entrypoint.sh"]
