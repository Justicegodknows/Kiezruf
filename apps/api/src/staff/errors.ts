// Database functions raise these codes (drizzle/0008_console_access.sql); the API answers with them.
const DB_CODES = ['read_only', 'invalid_target', 'not_same_tenant', 'forbidden_role'] as const;
export type DbCode = (typeof DB_CODES)[number];

/** The code a staff database function raised, or null for any other error. */
export function dbErrorCode(error: unknown): DbCode | null {
  for (let e: unknown = error; e instanceof Error; e = e.cause) {
    const code = DB_CODES.find((c) => e instanceof Error && e.message === c);
    if (code) return code;
  }
  return null;
}

export const STATUS_FOR: Record<DbCode, number> = { read_only: 403, invalid_target: 422, not_same_tenant: 422, forbidden_role: 403 };
