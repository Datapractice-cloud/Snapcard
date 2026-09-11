import { env } from "../env";
import type { CardSide, LeadSubmit, SalesforceResult } from "../schemas";
import {
  SalesforceUnreachable,
  classifyError,
  describeError,
  errorCodeOf,
  findDuplicateId,
  sfFetch,
} from "./client";

/**
 * Everything that writes a Lead. The field names here are the contract in
 * CLAUDE.md; the custom ones are created by the org admin (SETUP.md §2).
 */

export type CaptureContext = {
  /** The rep's Google email. */
  capturedBy: string;
  event: string;
  consentVersion: string;
  /** When the rep ticked the consent box. Stamped by the server, never the phone. */
  consentAt: Date;
};

/**
 * Builds the Salesforce record. Pure and free of `env` so it can be tested
 * without a validated environment.
 *
 * Empty strings are omitted rather than sent: writing "" to a field that
 * already has a value would blank it on the second upsert of the same card.
 */
export function mapFields(submit: LeadSubmit, context: CaptureContext): Record<string, string> {
  const { fields } = submit;

  const record: Record<string, string> = {
    // The external id. Every write is an upsert on this, which is what makes a
    // double-tapped save one Lead instead of two.
    SnapCard_Client_Id__c: submit.clientId,
    SnapCard_Consent_At__c: context.consentAt.toISOString(),
    SnapCard_Consent_Version__c: context.consentVersion,
    SnapCard_Captured_By__c: context.capturedBy,
    SnapCard_Event__c: context.event,
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
    LinkedIn__c: fields.linkedin,
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

function contextFor(capturedBy: string, consentAt: Date = new Date()): CaptureContext {
  return {
    capturedBy,
    event: env.EVENT_SLUG,
    consentVersion: env.CONSENT_TEXT_VERSION,
    consentAt,
  };
}

const EXTERNAL_ID_PATH = "/sobjects/Lead/SnapCard_Client_Id__c";

/**
 * Creates or updates the Lead, keyed on the phone's clientId.
 *
 * `capturedBy` is passed in rather than read from a session because the Phase 2
 * sync cron replays leads out of Atlas, where there is no session — only the
 * email recorded at capture time.
 */
export async function upsertLead(submit: LeadSubmit, capturedBy: string): Promise<SalesforceResult> {
  const record = mapFields(submit, contextFor(capturedBy));
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

/** Adds the Lead to the event Campaign. Being there already is not an error. */
export async function addToCampaign(leadId: string): Promise<void> {
  const response = await sfFetch("/sobjects/CampaignMember", {
    method: "POST",
    body: JSON.stringify({
      CampaignId: env.SF_CAMPAIGN_ID,
      LeadId: leadId,
      Status: "Responded",
    }),
  });

  if (response.ok) return;

  const body = await readJson(response);
  const code = errorCodeOf(body);
  // The rep scanned someone who is already a member of this campaign.
  if (code === "DUPLICATE_VALUE") return;

  throw new Error(`CampaignMember failed: ${code}`);
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
