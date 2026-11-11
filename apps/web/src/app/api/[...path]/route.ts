// Catch-all backend-for-frontend proxy to the Kiezruf API. Only allowlisted endpoints pass (src/server/bff.ts).
import type { NextRequest } from 'next/server';
import { proxy } from '@/server/bff';

async function handle(request: NextRequest, ctx: RouteContext<'/api/[...path]'>) {
  const { path } = await ctx.params;
  return proxy(request, path);
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
