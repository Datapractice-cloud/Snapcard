/**
 * Runs once when the server boots. Parsing the environment here turns a
 * misconfigured deploy into a loud startup failure instead of a 500 on the
 * first scan of the event.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { loadEnv } = await import("@/lib/env");
  loadEnv();

  /*
   * The Mongo pool is deliberately NOT warmed here. This file is compiled for
   * the Edge runtime as well as Node, and the driver reaches for `net`, so even
   * a dynamic import behind a runtime check makes webpack try to resolve a Node
   * built-in for Edge and the whole app fails to build. The pool opens on first
   * use instead; `serverSelectionTimeoutMS` is sized for that cold handshake.
   */
}
