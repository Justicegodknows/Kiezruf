import Fastify, { type FastifyServerOptions } from 'fastify';
import { priorityLevel, priorityScore } from '@kiezruf/shared';

// Builds the API without listening, so tests can call it in-process with app.inject().
export function buildApp(opts: FastifyServerOptions = {}) {
  const app = Fastify(opts);

  app.get('/health', async () => ({
    ok: true,
    sampleLevel: priorityLevel(
      priorityScore({ coReporters: 4, commenters: 5, meToo: 20, ageHours: 2, dangerMarks: 3, safetyCategory: true }),
    ),
  }));

  return app;
}
