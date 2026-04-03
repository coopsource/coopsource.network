FROM node:24-alpine AS base
RUN corepack enable

FROM base AS build
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json ./
COPY apps/api/package.json apps/api/
COPY packages/common/package.json packages/common/
COPY packages/db/package.json packages/db/
COPY packages/federation/package.json packages/federation/
COPY packages/lexicons/package.json packages/lexicons/
COPY packages/config/ packages/config/
RUN pnpm install --frozen-lockfile

COPY packages/common/ packages/common/
COPY packages/db/ packages/db/
COPY packages/lexicons/ packages/lexicons/
COPY packages/federation/ packages/federation/
COPY apps/api/ apps/api/
RUN pnpm --filter @coopsource/api build

# Prune to production dependencies
RUN CI=true pnpm install --frozen-lockfile --prod

FROM base AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Copy the entire pnpm node_modules structure (preserves symlink resolution)
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /app/packages/common/node_modules ./packages/common/node_modules
COPY --from=build /app/packages/db/node_modules ./packages/db/node_modules
COPY --from=build /app/packages/federation/node_modules ./packages/federation/node_modules
COPY --from=build /app/packages/lexicons/node_modules ./packages/lexicons/node_modules

# Copy compiled output and package.json for each workspace package
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/package.json ./apps/api/
COPY --from=build /app/packages/common/dist ./packages/common/dist
COPY --from=build /app/packages/common/package.json ./packages/common/
COPY --from=build /app/packages/db/dist ./packages/db/dist
COPY --from=build /app/packages/db/package.json ./packages/db/
COPY --from=build /app/packages/federation/dist ./packages/federation/dist
COPY --from=build /app/packages/federation/package.json ./packages/federation/
COPY --from=build /app/packages/lexicons/dist ./packages/lexicons/dist
COPY --from=build /app/packages/lexicons/package.json ./packages/lexicons/

RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

EXPOSE 3001
CMD ["node", "apps/api/dist/index.js"]
