import { z } from "zod";

/**
 * Server-side environment. Never import this from a client component — it
 * reads `SF_*` and `GEMINI_API_KEY`, which must stay on the server.
 *
 * Parsing happens at module load so a misconfigured deploy fails immediately
 * with a readable message instead of a 500 on the first scan.
 */

const nonEmpty = (label: string) =>
  z
    .string({ error: (issue) => (issue.input === undefined ? `${label} is not set` : `${label} must be text`) })
    .trim()
    .min(1, `${label} must not be empty`);

/**
 * `.env` files spell "not set" as `FOO=`, so an empty value must read as
 * absent — otherwise `.default()` never fires and optionals fail `min(1)`.
 */
function stripEmpty(raw: unknown): unknown {
  if (typeof raw !== "object" || raw === null) return raw;
  return Object.fromEntries(
    Object.entries(raw as Record<string, unknown>).filter(
      ([, value]) => !(typeof value === "string" && value.trim() === ""),
    ),
  );
}

const envShape = z.object({
  AUTH_SECRET: nonEmpty("AUTH_SECRET"),
  AUTH_GOOGLE_ID: nonEmpty("AUTH_GOOGLE_ID"),
  AUTH_GOOGLE_SECRET: nonEmpty("AUTH_GOOGLE_SECRET"),

  /*
   * Hostinger terminates TLS in front of the Node process, so Auth.js has to
   * be told to trust the forwarded host. Without it every sign-in fails with
   * UntrustedHost, because Auth.js will not guess a callback URL from headers
   * it does not trust. Only set "false" if the app is ever served with no
   * proxy in front of it.
   */
  AUTH_TRUST_HOST: z
    .enum(["true", "false"], { error: 'AUTH_TRUST_HOST must be "true" or "false"' })
    .default("true")
    .transform((value) => value === "true"),

  ALLOWED_EMAIL_DOMAIN: nonEmpty("ALLOWED_EMAIL_DOMAIN").default("thinkvibes.com"),
  /** Comma-separated in the environment, a lowercased list here. */
  ADMIN_EMAILS: z
    .string()
    .default("")
    .transform((raw) =>
      raw
        .split(",")
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean),
    ),

  NEXT_PUBLIC_APP_URL: z.url({ message: "NEXT_PUBLIC_APP_URL must be an absolute URL" }),

  GEMINI_API_KEY: nonEmpty("GEMINI_API_KEY"),
  GEMINI_MODEL: nonEmpty("GEMINI_MODEL").default("gemini-3.5-flash"),

  SF_LOGIN_URL: z
    .url({ message: "SF_LOGIN_URL must be the org My Domain URL, e.g. https://acme.my.salesforce.com" })
    // Trailing slashes break `${SF_LOGIN_URL}/services/...`.
    .transform((url) => url.replace(/\/+$/, "")),
  SF_CLIENT_ID: nonEmpty("SF_CLIENT_ID"),
  SF_CLIENT_SECRET: nonEmpty("SF_CLIENT_SECRET"),
  SF_API_VERSION: z
    .string()
    .regex(/^v\d+\.\d+$/, "SF_API_VERSION must look like v60.0")
    .default("v60.0"),

  // Phase 2. Absent in Phase 1, which is why they are optional.
  SYNC_SECRET: z.string().trim().min(1).optional(),
  MONGODB_URI: z.string().trim().min(1).optional(),
  MONGODB_DB: nonEmpty("MONGODB_DB").default("snapcard"),
});

export const envSchema = z.preprocess(stripEmpty, envShape);

export type Env = z.infer<typeof envShape>;

/** Parses a raw environment, throwing one error that names every bad variable. */
export function parseEnv(raw: NodeJS.ProcessEnv | Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(raw);
  if (result.success) return result.data;

  const problems = result.error.issues.map((issue) => {
    const name = issue.path.join(".") || "(root)";
    // Most messages already name the variable; don't say it twice.
    return issue.message.startsWith(name) ? `  ${issue.message}` : `  ${name}: ${issue.message}`;
  });

  throw new Error(
    `Invalid environment. Fix these variables in .env.local (see .env.example):\n${problems.join("\n")}`,
  );
}

let cached: Env | undefined;

/** Parses `process.env` once. Throws on every call until the environment is fixed. */
export function loadEnv(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}

/**
 * Read as `env.SF_CLIENT_ID`. Parsing is deferred to first access so that
 * importing this module in a unit test does not need a real environment;
 * `src/instrumentation.ts` forces the parse at server startup so a bad deploy
 * still fails immediately rather than on the first scan.
 */
export const env: Env = new Proxy({} as Env, {
  get: (_target, key: string) => loadEnv()[key as keyof Env],
});
