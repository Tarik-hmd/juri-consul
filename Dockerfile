# Portable production image (shared-hosting path; Netlify deploys from git).
# No secrets are baked in: all configuration arrives via environment.
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# Postinstall scripts are disabled by policy (supply-chain, spec 6.9);
# allowlist entries (e.g. Prisma in Phase 1) are added explicitly.
RUN npm ci --ignore-scripts

FROM node:24-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
COPY --from=builder --chown=appuser:appgroup /app/.next/standalone ./
COPY --from=builder --chown=appuser:appgroup /app/.next/static ./.next/static
COPY --from=builder --chown=appuser:appgroup /app/public ./public
USER appuser
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/ > /dev/null 2>&1 || exit 1
CMD ["node", "server.js"]
