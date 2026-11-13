// Console URLs. Shared by src/proxy.ts (server) and the console pages (browser).

/** The weekly briefing (US-53): the first thing staff see. */
export const CONSOLE_HOME = '/console';
export const CONSOLE_QUEUE = '/console/queue';
export const CONSOLE_HOTSPOTS = '/console/hotspots';
export const CONSOLE_TRENDS = '/console/trends';
export const CONSOLE_SIGN_IN = '/console/sign-in';

/** Where to go back to after sign-in. Only console paths, so the parameter cannot send anyone off-site. */
export function safeConsoleNext(value: string | null | undefined): string {
  if (!value || !/^\/console(?:[/?#]|$)/.test(value) || value.includes('\\') || value.includes('//')) return CONSOLE_HOME;
  if (value === CONSOLE_SIGN_IN || value.startsWith(`${CONSOLE_SIGN_IN}?`) || value.startsWith(`${CONSOLE_SIGN_IN}/`)) return CONSOLE_HOME;
  return value;
}

export function signInUrl(next: string): string {
  return `${CONSOLE_SIGN_IN}?next=${encodeURIComponent(safeConsoleNext(next))}`;
}

export function consoleReportPath(publicId: string): string {
  return `/console/reports/${encodeURIComponent(publicId)}`;
}
