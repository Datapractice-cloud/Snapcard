/**
 * Every `/api/*` response goes through here. A lead's fields must never sit in
 * a CDN or browser cache, so `no-store` is not optional — see CLAUDE.md.
 */
export function json(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  headers.set("Cache-Control", "no-store");
  return new Response(JSON.stringify(body), { ...init, headers });
}

export function jsonError(error: string, status: number): Response {
  return json({ error }, { status });
}
