# Kiezruf API and worker image (ENG-22: runs on vlincta.com). Build from the repository root:
#   docker build -f apps/api/Dockerfile -t kiezruf-api .
# One image, three commands:
#   API:        docker run kiezruf-api                                   (default; listens on $PORT, 4000)
#   worker:     docker run kiezruf-api node apps/api/dist/worker.js
#   migrations: docker run --rm kiezruf-api node apps/api/dist/db/migrate.js
#   tenants:    docker run --rm kiezruf-api node apps/api/dist/db/seed/run.js   (idempotent; after migrations)
# Configuration comes from environment variables only (see apps/api/DEPLOY.md); no .env file is baked in.
# Node 24: @kiezruf/shared ships TypeScript source, which Node runs with built-in type stripping.

FROM node:24-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY patches ./patches
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/

FROM base AS build
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --filter api...
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter api build

FROM base AS runtime
ENV NODE_ENV=production
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --prod --filter api...
COPY packages/shared/src packages/shared/src
COPY apps/api/drizzle apps/api/drizzle
COPY --from=build /app/apps/api/dist apps/api/dist
# tsc copies no data files: the tenant seed reads the Bezirk boundaries next to its compiled module.
COPY apps/api/src/db/seed/berlin-bezirke.geojson apps/api/dist/db/seed/
USER node
EXPOSE 4000
CMD ["node", "apps/api/dist/server.js"]
