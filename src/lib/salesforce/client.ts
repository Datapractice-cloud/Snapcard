import { env } from "../env";

/**
 * Salesforce REST access: one cached client-credentials token for the whole
 * process, and a fetch wrapper that renews it once when it is rejected.
 *
 * Server-only. SF_CLIENT_SECRET must never reach a phone.
 */

export type SalesforceErrorKind = "retryable" | "duplicate" | "needs_review";

/** Thrown when the request never got an answer: DNS, socket, or the 10s timeout. */
export class SalesforceUnreachable extends Error {
  readonly kind = "retryable" as const;
  constructor(cause: unknown) {
    super("Salesforce could not be reached.", { cause });
    this.name = "SalesforceUnreachable";
  }
}

type CachedToken = {
  token: string;
  instanceUrl: string;
  fetchedAt: number;
};

let cached: CachedToken | undefined;

/**
 * Renew well inside the org's session timeout (commonly two hours) so the
 * common path does not rely on catching a 401 first. The 401 retry in
 * `sfFetch` stays as the real safety net, since the timeout is an org setting
 * we do not control.
 */
const TOKEN_TTL_MS = 60 * 60 * 1000;

const REQUEST_TIMEOUT_MS = 10_000;

export function clearTokenCache() {
  cached = undefined;
}

export async function getToken(): Promise<CachedToken> {
  if (cached && Date.now() - cached.fetchedAt < TOKEN_TTL_MS) return cached;

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: env.SF_CLIENT_ID,
    client_secret: env.SF_CLIENT_SECRET,
  });

  let response: Response;
  try {
    response = await fetch(`${env.SF_LOGIN_URL}/services/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (cause) {
    throw new SalesforceUnreachable(cause);
  }

  if (!response.ok) {
    // The body names the misconfiguration (invalid_client, inactive user) and
    // carries no card data, so it is safe to surface.
    const detail = await response.text().catch(() => "");
    throw new Error(`Salesforce token request failed (${response.status}): ${detail.slice(0, 200)}`);
  }

  const json = (await response.json()) as { access_token?: string; instance_url?: string };
  if (!json.access_token || !json.instance_url) {
    throw new Error("Salesforce token response was missing access_token or instance_url.");
  }

  cached = { token: json.access_token, instanceUrl: json.instance_url, fetchedAt: Date.now() };
  return cached;
}

/**
 * `path` is relative to the data API root, e.g. `/sobjects/Lead`.
 *
 * Retries exactly once on 401: a token can be revoked or the session expired
 * early, and that is indistinguishable from a stale cache until it is tried.
 * Anything past the first retry is a real authorisation problem.
 */
export async function sfFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const response = await authorisedFetch(path, init);
  if (response.status !== 401) return response;

  clearTokenCache();
  return authorisedFetch(path, init);
}

async function authorisedFetch(path: string, init: RequestInit): Promise<Response> {
  const { token, instanceUrl } = await getToken();
  const url = `${instanceUrl}/services/data/${env.SF_API_VERSION}${path}`;

  /*
   * Authorization and Content-Type are the only headers sent, on purpose.
   * In particular there is no `Sforce-Auto-Assign: FALSE`, so Salesforce
   * applies its default of TRUE and an active Lead Assignment Rule runs and
   * routes the Lead to a real owner instead of leaving it on the integration
   * user. See SETUP.md §2.5 — with rules active the integration user needs
   * View All on Lead, or it loses sight of the records it just created.
   */
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (init.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  try {
    return await fetch(url, { ...init, headers, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch (cause) {
    throw new SalesforceUnreachable(cause);
  }
}

/**
 * Runs a SOQL query.
 *
 * Every query in this app is a constant — nothing a rep or an admin types
 * reaches SOQL. If that ever changes, bind values rather than interpolating
 * them: SOQL injection is as real as SQL injection and Salesforce has no
 * parameterised query API over REST.
 */
export async function soql<T>(query: string): Promise<{ records: T[]; totalSize: number; done: boolean }> {
  const response = await sfFetch(`/query?q=${encodeURIComponent(query)}`);

  if (!response.ok) {
    const body = await response.json().catch(() => undefined);
    throw new Error(describeError(response.status, body));
  }

  return (await response.json()) as { records: T[]; totalSize: number; done: boolean };
}

/** Salesforce returns errors as an array of these. */
type SalesforceError = {
  errorCode?: string;
  message?: string;
  duplicateResult?: {
    matchResults?: { matchRecords?: { record?: { Id?: string } }[] }[];
  };
};

function asErrors(body: unknown): SalesforceError[] {
  if (Array.isArray(body)) return body.filter((item): item is SalesforceError => isRecord(item));
  if (isRecord(body)) return [body as SalesforceError];
  return [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Decides what the phone and the Phase 2 cron should do with a failed write.
 *
 * `retryable` means the same request will probably work later — the org was
 * busy, throttling, or the token had gone stale. `needs_review` means it will
 * never work unchanged: a validation rule, a picklist value the org does not
 * have, or a field the integration user cannot write. Retrying those forever
 * would bury a real configuration problem.
 */
export function classifyError(status: number, body: unknown): SalesforceErrorKind {
  const errors = asErrors(body);

  // Checked before the status rules: a blocked duplicate arrives as a 400 but
  // is a success as far as the rep is concerned — the person is already in
  // Salesforce.
  if (errors.some((error) => error.errorCode === "DUPLICATES_DETECTED")) return "duplicate";

  if (status === 401 || status === 429 || status >= 500) return "retryable";

  // 400 and 403 are the documented cases; anything else unexpected (404 on a
  // bad path, 405) is also not going to fix itself.
  return "needs_review";
}

/** The Id of the record Salesforce matched, when it blocked a duplicate. */
export function findDuplicateId(body: unknown): string | undefined {
  for (const error of asErrors(body)) {
    for (const match of error.duplicateResult?.matchResults ?? []) {
      for (const record of match.matchRecords ?? []) {
        if (record.record?.Id) return record.record.Id;
      }
    }
  }
  return undefined;
}

/**
 * A short description for the rep and the admin. Includes the Salesforce
 * message because that is what says *which* validation rule fired; it is
 * returned in the response body and never written to a log.
 */
export function describeError(status: number, body: unknown): string {
  const errors = asErrors(body);
  if (errors.length === 0) return `HTTP ${status}`;

  return errors
    .slice(0, 2)
    .map((error) => [error.errorCode, error.message].filter(Boolean).join(": ") || `HTTP ${status}`)
    .join(" | ")
    .slice(0, 500);
}

/** The first errorCode, which is the only part of an error safe to log. */
export function errorCodeOf(body: unknown): string {
  return asErrors(body)[0]?.errorCode ?? "unknown";
}
