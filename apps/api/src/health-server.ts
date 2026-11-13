// A minimal HTTP health endpoint for the worker (ENG-25). Serverless container platforms such as Scaleway's keep a
// container alive only while it listens on its port; the worker has no other HTTP surface. Answers 200 with
// `{"ok":true}` on GET /health and 404 on anything else. It exposes no data.
import { createServer, type Server } from 'node:http';

export function startHealthServer(port: number, host = '0.0.0.0'): Promise<Server> {
  const server = createServer((request, response) => {
    const ok = request.method === 'GET' && request.url?.split('?')[0] === '/health';
    response.writeHead(ok ? 200 : 404, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    response.end(ok ? '{"ok":true}' : '{"error":"not_found"}');
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => resolve(server));
  });
}
