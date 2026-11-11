import Fastify from 'fastify';
import { priorityLevel, priorityScore } from '@kiezruf/shared';

const app = Fastify({ logger: true });

app.get('/health', async () => ({
  ok: true,
  sampleLevel: priorityLevel(priorityScore({ coReporters: 4, commenters: 5, meToo: 20, ageHours: 2, dangerMarks: 3, safetyCategory: true })),
}));

await app.listen({ port: Number(process.env.PORT ?? 4000), host: '0.0.0.0' });
