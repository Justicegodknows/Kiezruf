# PostgreSQL 16 with pgvector, PostGIS 3 and ltree (contrib) in one image (ENG-04, answers E-05 for local dev and CI).
# Used by infra/docker-compose.yml and by the API integration tests (Testcontainers builds it once; Docker caches it).
# Based on the pgvector image because it is built for amd64 and arm64; postgis/postgis:16-3.4 is amd64 only
# and its Debian release is no longer served by the PostgreSQL apt repository.
FROM pgvector/pgvector:0.8.0-pg16
RUN apt-get update \
 && apt-get install -y --no-install-recommends postgresql-16-postgis-3 \
 && rm -rf /var/lib/apt/lists/*
