FROM node:24-alpine AS base
RUN corepack enable

FROM base AS build
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json ./
COPY apps/api/package.json apps/api/
COPY packages/common/package.json packages/common/
COPY packages/db/package.json packages/db/
COPY packages/config/ packages/config/
RUN pnpm install --frozen-lockfile

COPY packages/common/ packages/common/
COPY packages/db/ packages/db/
COPY apps/api/ apps/api/
RUN pnpm --filter @coopsource/api build

FROM base AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/package.json ./apps/api/
COPY --from=build /app/packages/common/dist ./packages/common/dist
COPY --from=build /app/packages/common/package.json ./packages/common/
COPY --from=build /app/packages/db/dist ./packages/db/dist
COPY --from=build /app/packages/db/package.json ./packages/db/

EXPOSE 3001
CMD ["node", "apps/api/dist/index.js"]
