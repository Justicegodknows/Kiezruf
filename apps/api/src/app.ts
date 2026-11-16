import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyServerOptions } from 'fastify';
import { priorityLevel, priorityScore } from '@kiezruf/shared';
import { accountRoutes } from './account/routes.js';
import { registerAuth } from './auth/plugin.js';
import { authRoutes } from './auth/routes.js';
import type { AppDeps } from './deps.js';
import { engagementRoutes } from './engagement/routes.js';
import { publicRoutes } from './public/routes.js';
import { assistRoutes } from './reports/assist-routes.js';
import { reportRoutes } from './reports/routes.js';
import { staffAdminRoutes } from './staff/admin-routes.js';
import { staffAnalysisRoutes } from './staff/analysis-routes.js';
import { staffAuthRoutes } from './staff/auth-routes.js';
import { staffReportRoutes } from './staff/report-routes.js';

// Builds the API without listening, so tests can call it in-process with app.inject().
export async function buildApp(deps: AppDeps, opts: FastifyServerOptions = {}) {
  const app = Fastify(opts);

  // Limits apply per route (see each route's config). In-memory store: fine for one API instance in the pilot.
  if (deps.rateLimits !== false) await app.register(rateLimit, { global: false });
  registerAuth(app, deps.db, deps.verifier);

  app.get('/health', async () => ({
    ok: true,
    sampleLevel: priorityLevel(
      priorityScore({ coReporters: 4, commenters: 5, meToo: 20, ageHours: 2, dangerMarks: 3, safetyCategory: true }),
    ),
  }));

  authRoutes(app, deps);
  reportRoutes(app, deps);
  assistRoutes(app, deps);
  publicRoutes(app, deps);
  engagementRoutes(app, deps);
  accountRoutes(app, deps);
  staffAuthRoutes(app, deps);
  staffReportRoutes(app, deps);
  staffAdminRoutes(app, deps);
  staffAnalysisRoutes(app, deps);

  return app;
}
