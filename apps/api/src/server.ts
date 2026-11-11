import { buildApp } from './app.js';

const app = buildApp({ logger: true });

await app.listen({ port: Number(process.env.PORT ?? 4000), host: '0.0.0.0' });
