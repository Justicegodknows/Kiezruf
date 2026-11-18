# Deploying the API and worker (Scaleway, Docker)

ENG-25. One image runs the API, the worker, the migrations and the tenant seed. Staging runs as Scaleway Serverless
Containers in the `kiezruf-staging` namespace of the Scaleway project `kiezruf` (`4ed3307d-d181-490b-9426-d3c83f6f81fc`,
its own organisation, region `fr-par`), since 2026-11-16. The first staging in vlincta's `vlincta-staging` namespace
(project `7ba21567…`) is no longer used. Production is not set up yet (E-15).

## Staging at a glance

| What | Where |
| --- | --- |
| Image | `rg.fr-par.scw.cloud/kiezruf-staging-4ed3307d/kiezruf-api:staging-20261116` |
| API container | `kiezruf-staging-api`, public, HTTPS only, port 4000, 0 to 2 instances, 0.5 GB and 280 mvCPU · https://kiezrufstaging80e46bb2-kiezruf-staging-api.functions.fnc.fr-par.scw.cloud |
| Worker container | `kiezruf-staging-worker`, private, port 8080 (`WORKER_HEALTH_PORT`), exactly 1 instance, 0.25 GB and 140 mvCPU (always on, so sized to stay near the free tier; raise it if photo blurring runs out of memory) |
| Photos | Object Storage buckets `kiezruf-staging-4ed3307d-private` (CORS: PUT from https://kiezruf.vercel.app) and `kiezruf-staging-4ed3307d-public` (objects written `public-read`) |
| Email | Scaleway TEM, `smtp.tem.scaleway.com:587`, login = project ID; needs a verified sender domain (open) |

`apps/api/scripts/scaleway-staging.sh` does the hands-on parts without secrets passing through anyone's chat or the repo.
It uses the Scaleway key in the repository's `.env` (`SCALEWAY_ACCESS_KEY`, `SCALEWAY_SECRET_KEY`) when set there.
Scaleway replaces a container's whole set of plain variables, or of secrets, on every update that names any of them:
always send the complete set (the `secrets` command does), never a single variable.

```bash
apps/api/scripts/scaleway-staging.sh secrets   # hidden prompts; sets secrets on both containers, which redeploy
apps/api/scripts/scaleway-staging.sh migrate   # hidden DATABASE_URL prompt; migrations + tenant seed
apps/api/scripts/scaleway-staging.sh status    # container state and the API's /health
```

## Build and push

From the repository root (Scaleway runs x86):

```bash
scw registry login
docker build --platform linux/amd64 -f apps/api/Dockerfile -t rg.fr-par.scw.cloud/kiezruf-staging-4ed3307d/kiezruf-api:<tag> .
docker push rg.fr-par.scw.cloud/kiezruf-staging-4ed3307d/kiezruf-api:<tag>
```

Then point both containers at the new tag (`scw container container update <id> image=…`).

## Commands in the image

| Process | Command |
| --- | --- |
| API | default `CMD` (`node apps/api/dist/server.js`); health `GET /health` |
| Worker | `node apps/api/dist/worker.js`; with `WORKER_HEALTH_PORT` set it also answers `GET /health` |
| Migrations | `node apps/api/dist/db/migrate.js` (needs only `DATABASE_URL`), before each rollout |
| Tenant seed | `node apps/api/dist/db/seed/run.js` (idempotent), after the first migration |

## Environment variables

The API and worker read the same set. Plain values are set on the staging containers already; secrets are set with
the script above.

| Variable | Staging value |
| --- | --- |
| `DATABASE_URL` | Secret. Hosted Supabase Postgres, session pooler or direct connection on port 5432 (the worker's pg-boss and the migrations want a session connection, so avoid the transaction pooler on 6543). |
| `SUPABASE_URL` | `https://yhfifblsoqsfwipicxbz.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret, from the Supabase dashboard. |
| `SUPABASE_JWT_SECRET` | Unset: the hosted project signs with JWKS keys. |
| `WEB_BASE_URL` | `https://kiezruf.vercel.app` |
| `AI_PROVIDER_BASE_URL` | `https://api.vlincta.com/openai/v1` |
| `AI_PROVIDER_API_KEY` | Secret, the vlincta AI key. |
| `AI_MODEL_CHAT`, `AI_MODEL_VISION`, `AI_MODEL_EMBEDDING` | Unset; the provider chooses (E-01, E-07). |
| `S3_ENDPOINT`, `S3_REGION` | `https://s3.fr-par.scw.cloud`, `fr-par` |
| `S3_BUCKET_PRIVATE`, `S3_BUCKET_PUBLIC` | `kiezruf-staging-4ed3307d-private`, `kiezruf-staging-4ed3307d-public` |
| `S3_ACCESS_KEY`, `S3_SECRET_KEY` | Secret. A Scaleway API key allowed to use Object Storage in the staging project. |
| `S3_PUBLIC_OBJECT_ACL` | `public-read` |
| `PUBLIC_PHOTO_BASE_URL` | `https://s3.fr-par.scw.cloud/kiezruf-staging-4ed3307d-public` |
| `SMTP_HOST`, `SMTP_PORT` | `smtp.tem.scaleway.com`, `587` |
| `SMTP_USER` | The staging project ID, `4ed3307d-d181-490b-9426-d3c83f6f81fc` |
| `SMTP_PASSWORD` | Secret. A Scaleway secret key allowed to send with Transactional Email. |
| `MAIL_FROM` | `Kiezruf <no-reply@vlincta.com>`; the domain must be verified in TEM before mail goes out. |
| `BLUR_DETECTOR` | `full` (whole photos blurred until vlincta's blur endpoint exists, E-10) |
| `TRUST_PROXY` | Empty. Vercel has no fixed outbound addresses, so the API cannot safely trust its `X-Forwarded-For`. |
| `WORKER_HEALTH_PORT` | Worker only: `8080` |
| `EXPO_ACCESS_TOKEN` | Optional, worker only. |

## Connect the web app

When `status` shows the API's `/health` at HTTP 200, set `API_BASE_URL` to the API URL above in the Vercel project
(production and preview) and redeploy. The location check on `/new-report` then reaches the API.
