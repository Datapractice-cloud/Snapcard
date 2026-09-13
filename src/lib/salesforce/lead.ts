import { env } from "../env";
import type { CardSide, LeadSubmit, SalesforceResult } from "../schemas";
import {
  SalesforceUnreachable,
  classifyError,
  describeError,
  errorCodeOf,
  findDuplicateId,
  sfFetch,
  soql,
} from "./client";

/**
 * Everything that writes a Lead. The field names here are the contract in
 * CLAUDE.md. `SnapCard_Client_Id__c` is the one custom field, created by the
 * org admin (SETUP.md §2); everything else is standard.
 */

/**
 * Builds the Salesforce record. Pure — no `env`, no session, no clock — so the
 * tests drive it directly.
 *
 * Empty strings are omitted rather than sent: writing "" to a field that
 * already has a value would blank it on the second upsert of the same card.
 */
export function mapFields(submit: LeadSubmit): Record<string, string> {
  const { fields } = submit;

  /*
   * `SnapCard_Client_Id__c` is deliberately NOT here. It is the upsert key and
   * travels in the URL path; Salesforce rejects the whole write with
   * "INVALID_FIELD: The SnapCard_Client_Id__c field should not be specified in
   * the sobject data" if it also appears in the body. Sending it looks harmless
   * and fails 100% of the time — every lead comes back needs_review.
   */
  const record: Record<string, string> = {
    LeadSource: "Event",
  };

  const optional: Record<string, string> = {
    FirstName: fields.firstName,
    LastName: fields.lastName,
    Company: fields.company,
    Title: fields.title,
    Email: fields.email,
    Phone: fields.phone,
    Website: fields.website,
    Street: fields.street,
    City: fields.city,
    State: fields.state,
    PostalCode: fields.postalCode,
    Country: fields.country,
    // The full OCR text, so an admin can see what the card actually said when a
    // field looks wrong.
    Description: submit.rawText,
  };

  for (const [name, value] of Object.entries(optional)) {
    if (value) record[name] = value;
  }

  return record;
}

const EXTERNAL_ID_PATH = "/sobjects/Lead/SnapCard_Client_Id__c";

/** Creates or updates the Lead, keyed on the phone's clientId. */
export async function upsertLead(submit: LeadSubmit): Promise<SalesforceResult> {
  /*
   * Short-circuited before any network call when the integration is off. Not a
   * failure — nothing was attempted, so nothing is owed a retry, and the
   * backup store is what holds the lead.
   */
  if (!env.SALESFORCE_ENABLED) return { status: "skipped" };

  const record = mapFields(submit);
  const path = `${EXTERNAL_ID_PATH}/${encodeURIComponent(submit.clientId)}`;

  let response: Response;
  try {
    response = await sfFetch(path, { method: "PATCH", body: JSON.stringify(record) });
  } catch (error) {
    /*
     * Never throws. CLAUDE.md requires /api/leads to answer 200 with a result
     * the phone can read even when Salesforce is unavailable, and PLAN-2 Task 8
     * expects a wrong client secret to leave leads as `failed` so the sync cron
     * drains them once the secret is fixed — so a token failure is retryable,
     * not needs_review.
     */
    if (error instanceof SalesforceUnreachable) {
      return { status: "failed", error: "Salesforce could not be reached." };
    }
    return { status: "failed", error: shortMessage(error) };
  }

  const body = await readJson(response);

  if (response.ok) {
    // 201 on create carries the new id. Update answers 200 or 204, and older
    // API versions send no body at all, so fall back to reading it back.
    const id = isRecord(body) && typeof body.id === "string" ? body.id : await findLeadId(submit.clientId);
    return id ? { status: "synced", leadId: id } : { status: "failed", error: "Lead saved but no Id returned." };
  }

  const kind = classifyError(response.status, body);

  if (kind === "duplicate") {
    // The person is already in Salesforce. That is a success for the rep; the
    // admin can merge later.
    return { status: "duplicate", duplicateOf: findDuplicateId(body), error: describeError(response.status, body) };
  }

  return {
    status: kind === "retryable" ? "failed" : "needs_review",
    error: describeError(response.status, body),
  };
}

/** Reads the Id back when an update did not return one. */
async function findLeadId(clientId: string): Promise<string | undefined> {
  const response = await sfFetch(`${EXTERNAL_ID_PATH}/${encodeURIComponent(clientId)}?fields=Id`);
  if (!response.ok) return undefined;
  const body = await readJson(response);
  return isRecord(body) && typeof body.Id === "string" ? body.Id : undefined;
}

/**
 * Attaches a card photo to the Lead.
 *
 * `FirstPublishLocationId` links the file to the record on creation, so no
 * separate ContentDocumentLink call is needed.
 */
export async function attachImage(leadId: string, side: CardSide, dataUrl: string): Promise<void> {
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) throw new Error(`Image for the ${side} of the card was not a data URL.`);

  const extension = parsed.mimeType === "image/png" ? "png" : "jpg";
  const response = await sfFetch("/sobjects/ContentVersion", {
    method: "POST",
    body: JSON.stringify({
      Title: `card-${side}`,
      PathOnClient: `card-${side}.${extension}`,
      VersionData: parsed.base64,
      FirstPublishLocationId: leadId,
    }),
  });

  if (!response.ok) {
    throw new Error(`ContentVersion failed: ${errorCodeOf(await readJson(response))}`);
  }
}

export function parseDataUrl(dataUrl: string): { mimeType: string; base64: string } | undefined {
  // [\s\S] rather than the `s` flag, which needs a newer tsconfig target.
  const match = /^data:([^;,]+);base64,([\s\S]*)$/.exec(dataUrl);
  if (!match) return undefined;
  return { mimeType: match[1], base64: match[2] };
}

async function readJson(response: Response): Promise<unknown> {
  // 204 and some error paths have no body; a parse failure must not mask the
  // status we are trying to classify.
  const text = await response.text().catch(() => "");
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Enough for an admin to act on, short enough to store on the lead. */
function shortMessage(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 500);
}

/** One row of the admin table. */
export type EventLead = {
  id: string;
  name: string;
  company: string;
  title: string;
  email: string;
  phone: string;
  createdAt: string;
  /** Only known when the rows came from the backup store. */
  status?: SalesforceResult["status"];
  capturedBy?: string;
};

export type EventLeadsResult =
  | { ok: true; leads: EventLead[]; capped: boolean }
  | { ok: false; error: string };

/** The admin table shows the most recent this many. */
const ADMIN_LIMIT = 500;

/*
 * Recent event leads. Constant query, no interpolation.
 *
 * Filtered on LeadSource rather than a custom event field: the app no longer
 * writes one (see the Salesforce contract in CLAUDE.md).
 *
 * LAST_N_DAYS:30 rather than TODAY, because the admin table now filters by date
 * in the browser and needs something older than today to filter. TODAY here was
 * also evaluated in the *org's* timezone while the Atlas path used the server's,
 * so the two sources disagreed about which day it was.
 */
const RECENT_LEADS_SOQL = `SELECT Id, Name, Company, Email, Phone, Title, CreatedDate FROM Lead WHERE LeadSource = 'Event' AND CreatedDate = LAST_N_DAYS:30 ORDER BY CreatedDate DESC LIMIT ${ADMIN_LIMIT}`;

type LeadRecord = {
  Id: string;
  Name: string | null;
  Company: string | null;
  Email: string | null;
  Phone: string | null;
  Title: string | null;
  CreatedDate: string;
};

/**
 * Returns a result rather than throwing: a Salesforce outage should give the
 * admin a page explaining that, not a 500.
 */
export async function listRecentEventLeads(): Promise<EventLeadsResult> {
  try {
    const { records } = await soql<LeadRecord>(RECENT_LEADS_SOQL);

    return {
      ok: true,
      capped: records.length >= ADMIN_LIMIT,
      leads: records.map((record) => ({
        id: record.Id,
        name: record.Name ?? "",
        company: record.Company ?? "",
        title: record.Title ?? "",
        email: record.Email ?? "",
        phone: record.Phone ?? "",
        createdAt: record.CreatedDate,
      })),
    };
  } catch (error) {
    return { ok: false, error: shortMessage(error) };
  }
}

/** The Lead fields SnapCard writes, as Salesforce names them. */
export const REQUIRED_LEAD_FIELDS = [
  "SnapCard_Client_Id__c",
  "FirstName",
  "LastName",
  "Company",
  "Title",
  "Email",
  "Phone",
  "Website",
  "Street",
  "City",
  "State",
  "PostalCode",
  "Country",
  "Description",
  "LeadSource",
] as const;

export type FieldCheck = {
  name: string;
  /** Absent from describe: either it does not exist, or field-level security hides it. */
  missing: boolean;
  writable: boolean;
};

/**
 * Asks Salesforce which of the fields we write the integration user can
 * actually see and set.
 *
 * Describe respects field-level security, so a field the user has no access to
 * simply does not come back — which is indistinguishable from one that was
 * never created. Both are fixed in Setup, and both otherwise show up as a
 * needs_review lead at an event with no clue as to why.
 */
export async function checkLeadFieldAccess(): Promise<FieldCheck[]> {
  const response = await sfFetch("/sobjects/Lead/describe");
  if (!response.ok) {
    throw new Error(`Could not describe Lead: ${errorCodeOf(await readJson(response))}`);
  }

  const body = (await response.json()) as {
    fields: { name: string; createable?: boolean; updateable?: boolean }[];
  };
  const byName = new Map(body.fields.map((field) => [field.name.toLowerCase(), field]));

  return REQUIRED_LEAD_FIELDS.map((name) => {
    const field = byName.get(name.toLowerCase());
    return {
      name,
      missing: !field,
      writable: Boolean(field?.createable && field?.updateable),
    };
  });
}
