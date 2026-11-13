import { connection, type NextRequest } from 'next/server';
import { getSession } from '@/server/auth-handlers';

// Per request, never prerendered: with Cache Components a GET handler that reads nothing at request time is built
// once (and, without Supabase settings at build time, would answer "signed out" forever).
export async function GET(request: NextRequest) {
  await connection();
  return getSession(request);
}
