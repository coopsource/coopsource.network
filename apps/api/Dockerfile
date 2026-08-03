FROM node:24-alpine AS base
RUN corepack enable

FROM base AS build
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json ./
COPY apps/api/package.json apps/api/
COPY packages/arbiter-client/package.json packages/arbiter-client/
COPY packages/common/package.json packages/common/
COPY packages/coop-view/package.json packages/coop-view/
COPY packages/db/package.json packages/db/
COPY packages/federation/package.json packages/federation/
COPY packages/governance-view/package.json packages/governance-view/
COPY packages/lexicons/package.json packages/lexicons/
COPY packages/spaces-consumer/package.json packages/spaces-consumer/
COPY packages/config/ packages/config/
RUN pnpm install --frozen-lockfile

COPY packages/arbiter-client/ packages/arbiter-client/
COPY packages/common/ packages/common/
COPY packages/coop-view/ packages/coop-view/
COPY packages/db/ packages/db/
COPY packages/lexicons/ packages/lexicons/
COPY packages/federation/ packages/federation/
COPY packages/governance-view/ packages/governance-view/
COPY packages/spaces-consumer/ packages/spaces-consumer/
COPY apps/api/ apps/api/
# `--filter <pkg>...` selects the package AND its workspace dependencies, so
# each dependency runs its own build script. `--filter @coopsource/api` alone
# runs only `tsc` for the app, and any dependency build step — such as
# packages/db copying schema.sql into dist — is silently skipped.
RUN pnpm --filter "@coopsource/api..." build

# Prune to production dependencies
RUN CI=true pnpm install --frozen-lockfile --prod

FROM base AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Copy the entire pnpm node_modules structure (preserves symlink resolution)
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /app/packages/arbiter-client/node_modules ./packages/arbiter-client/node_modules
COPY --from=build /app/packages/common/node_modules ./packages/common/node_modules
COPY --from=build /app/packages/coop-view/node_modules ./packages/coop-view/node_modules
COPY --from=build /app/packages/db/node_modules ./packages/db/node_modules
COPY --from=build /app/packages/federation/node_modules ./packages/federation/node_modules
COPY --from=build /app/packages/governance-view/node_modules ./packages/governance-view/node_modules
COPY --from=build /app/packages/lexicons/node_modules ./packages/lexicons/node_modules
COPY --from=build /app/packages/spaces-consumer/node_modules ./packages/spaces-consumer/node_modules

# Copy compiled output and package.json for each workspace package
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/package.json ./apps/api/
COPY --from=build /app/packages/arbiter-client/dist ./packages/arbiter-client/dist
COPY --from=build /app/packages/arbiter-client/package.json ./packages/arbiter-client/
COPY --from=build /app/packages/common/dist ./packages/common/dist
COPY --from=build /app/packages/common/package.json ./packages/common/
COPY --from=build /app/packages/coop-view/dist ./packages/coop-view/dist
COPY --from=build /app/packages/coop-view/package.json ./packages/coop-view/
COPY --from=build /app/packages/db/dist ./packages/db/dist
COPY --from=build /app/packages/db/package.json ./packages/db/
COPY --from=build /app/packages/federation/dist ./packages/federation/dist
COPY --from=build /app/packages/federation/package.json ./packages/federation/
COPY --from=build /app/packages/governance-view/dist ./packages/governance-view/dist
COPY --from=build /app/packages/governance-view/package.json ./packages/governance-view/
COPY --from=build /app/packages/lexicons/dist ./packages/lexicons/dist
COPY --from=build /app/packages/lexicons/package.json ./packages/lexicons/
COPY --from=build /app/packages/spaces-consumer/dist ./packages/spaces-consumer/dist
COPY --from=build /app/packages/spaces-consumer/package.json ./packages/spaces-consumer/

RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

EXPOSE 3001
CMD ["node", "apps/api/dist/index.js"]
