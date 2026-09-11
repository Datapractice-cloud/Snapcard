/**
 * Runs once when the server boots. Parsing the environment here turns a
 * misconfigured deploy into a loud startup failure instead of a 500 on the
 * first scan of the event.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { loadEnv } = await import("@/lib/env");
  loadEnv();
}
