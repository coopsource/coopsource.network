FROM node:24-alpine AS base
RUN corepack enable

FROM base AS build
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json ./
COPY apps/web/package.json apps/web/
COPY packages/common/package.json packages/common/
COPY packages/config/ packages/config/
RUN pnpm install --frozen-lockfile

COPY packages/common/ packages/common/
COPY apps/web/ apps/web/
RUN pnpm --filter @coopsource/web build

# Prune to production dependencies.
# --ignore-scripts is required: this workspace's own `prepare` runs
# `svelte-kit sync`, and @sveltejs/kit is a devDependency that this very
# command removes, so without it the prune dies at `svelte-kit: not found`.
RUN CI=true pnpm install --frozen-lockfile --prod --ignore-scripts

FROM base AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY --from=build /app/apps/web/build ./build
COPY --from=build /app/apps/web/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/common/dist ./packages/common/dist
COPY --from=build /app/packages/common/package.json ./packages/common/

RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

EXPOSE 3000
CMD ["node", "build/index.js"]
