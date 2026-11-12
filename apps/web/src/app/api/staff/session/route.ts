import { connection, type NextRequest } from 'next/server';
import { getStaffSession } from '@/server/auth-handlers';

// Per request, never prerendered (see src/app/api/session/route.ts).
export async function GET(request: NextRequest) {
  await connection();
  return getStaffSession(request);
}
