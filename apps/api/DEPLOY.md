# Deploying the API and worker (vlincta.com, Docker)

Target: `https://kiezruf-api.vlincta.com` (ENG-22, ENG-25). One image runs the API, the worker and the migrations.

## Build and push

From the repository root:

```bash
docker build -f apps/api/Dockerfile -t kiezruf-api .
```

Tag and push it to the registry vlincta.com pulls from. Build for the host's CPU (for example `--platform linux/amd64`).

## Run

| Process | Command | Notes |
| --- | --- | --- |
| Migrations | `node apps/api/dist/db/migrate.js` | One-off, before each rollout. Needs only `DATABASE_URL`. |
| API | default `CMD` (`node apps/api/dist/server.js`) | Listens on `PORT` (4000). Put HTTPS for `kiezruf-api.vlincta.com` in front of it. Health check: `GET /health`. |
| Worker | `node apps/api/dist/worker.js` | Exactly one instance; no port. |

## Environment variables

Set these in the host's secret store. Never bake them into the image or commit them. The API and worker read the same set.

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | Hosted Supabase Postgres, session pooler or direct connection on port 5432 (the worker's pg-boss and the migrations want a session connection, so avoid the transaction pooler on port 6543). Secret. |
| `SUPABASE_URL` | `https://ggjqqfotolfkpxigkydt.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | From the Supabase dashboard. Secret. |
| `SUPABASE_JWT_SECRET` | Leave unset: the hosted project signs with JWKS keys. |
| `WEB_BASE_URL` | `https://kiezruf.vercel.app` |
| `AI_PROVIDER_BASE_URL` | `https://api.vlincta.com/openai/v1` |
| `AI_PROVIDER_API_KEY` | vlincta AI key. Secret. |
| `AI_MODEL_CHAT`, `AI_MODEL_VISION`, `AI_MODEL_EMBEDDING` | Optional; empty lets the provider choose (E-01, E-07). |
| `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET_PRIVATE`, `S3_BUCKET_PUBLIC` | Photo storage. Provider still open (E-03). Keys are secret. |
| `PUBLIC_PHOTO_BASE_URL` | Public URL of `S3_BUCKET_PUBLIC`. |
| `SMTP_HOST`, `SMTP_PORT`, `MAIL_FROM` | Outgoing mail for notifications and briefings. |
| `BLUR_DETECTOR` | `none` until vlincta's blur endpoint exists (E-10); `full` blurs whole photos. |
| `TRUST_PROXY` | Leave empty. Vercel has no fixed outbound addresses, so the API cannot safely trust its `X-Forwarded-For` (rate limits then key on Vercel's address). |
| `EXPO_ACCESS_TOKEN` | Optional, worker only. |

## Connect the web app

After `https://kiezruf-api.vlincta.com/health` answers 200, set `API_BASE_URL=https://kiezruf-api.vlincta.com` in the Vercel project (production and preview) and redeploy. The location check on `/new-report` then reaches the API.
