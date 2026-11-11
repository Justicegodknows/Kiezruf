# Kiezruf

Citizen reporting platform. The plan, user stories and clickable prototypes live in
`kiezruf-mvp-prototype.html` — that file is the source of truth.

## Layout

| Path | What |
|---|---|
| `apps/mobile` | Citizen app, Expo (React Native), iOS + Android |
| `apps/web` | Next.js: citizen web and municipal admin console |
| `apps/api` | Fastify API, Drizzle ORM on PostgreSQL + PostGIS, pg-boss jobs |
| `packages/shared` | Shared types and rules (priority score, levels) |
| `infra/docker-compose.yml` | Local PostGIS, MinIO (S3 photos), Mailpit (email) |

## Setup

```sh
pnpm install          # installs all workspaces from pnpm-lock.yaml
pnpm db:up            # starts PostGIS, MinIO and Mailpit in Docker
cp .env.example .env  # then fill in secrets
pnpm dev:api          # http://localhost:4000/health
pnpm dev:web          # http://localhost:3000
pnpm dev:mobile       # Expo dev server
```

Mailpit UI: http://localhost:8025 · MinIO console: http://localhost:9001

## Not yet decided

- Mobile map library (react-native-maps vs MapLibre) — add with `npx expo install` so versions match the Expo SDK.
- AI provider SDK: vlincta.com endpoint and models (D-13, D-15). The API calls it over HTTP; no package needed yet.
- Boundary import (BKG VG250, Berlin Bezirke) needs GDAL's `ogr2ogr`: `brew install gdal`.
