-- Extensions schema v1 depends on. The image in infra/postgres provides all three (ENG-04).
CREATE EXTENSION IF NOT EXISTS postgis;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS ltree;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS vector;
