// A full page load instead of a client-side route change. Used to enter the console after sign-in: the client
// router may still hold the proxy's redirect to sign-in from a prefetch made while signed out (the "Verwaltung"
// link, the console's own nav), and replaying it would send a signed-in staff member back to sign-in forever.
// A real request goes through src/proxy.ts with the new session cookies and starts with an empty router cache.
export function hardNavigate(path: string): void {
  window.location.replace(path);
}
