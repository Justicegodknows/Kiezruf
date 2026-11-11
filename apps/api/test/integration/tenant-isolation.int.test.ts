// Phase 0 exit criterion: "the RLS isolation test passes" (PROGRESS.md).
// Definition of Done: every staff endpoint has a test proving no cross-tenant rows are returned.
// These become real once schema v1 and the RLS policies exist (PROGRESS.md, Next up 2 and 3).
import { describe, it } from 'vitest';

describe('row-level security (US-42)', () => {
  it.todo('a case worker scoped to Neukölln reads no Spandau rows from report');
  it.todo('a case worker scoped to Neukölln cannot update a Spandau report');
  it.todo('a viewer scoped to Berlin reads Neukölln and Spandau reports');
  it.todo('a viewer scoped to Berlin cannot update any report');
  it.todo('a query without a tenant scope set returns no rows');
  it.todo('photo, comment and vote rows follow the scope of their report');
});

describe('staff endpoints (US-42)', () => {
  it.todo('GET /staff/reports returns only reports inside the caller subtree');
  it.todo('GET /staff/reports/BE-SP-2026-0233 answers 404 for a Neukölln case worker');
  it.todo('PATCH /staff/reports/:id answers 404 for a report outside the subtree');
});

describe('routing (US-41, US-44)', () => {
  it.todo('assigns a report at Karl-Marx-Straße 100 to Neukölln');
  it.todo('creates no report and records one demand signal inside a not-live tenant');
  it.todo('uses the deepest pilot or live tenant when nodes are nested');
});
