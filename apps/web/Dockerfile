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

FROM base AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY --from=build /app/apps/web/build ./build
COPY --from=build /app/apps/web/package.json ./
COPY --from=build /app/node_modules ./node_modules

EXPOSE 3000
CMD ["node", "build/index.js"]
