import { after } from "next/server";
import { requireSession } from "@/lib/auth";
import { getBackupStore, saveLeadSafely } from "@/lib/backup";
import { json, jsonError } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { attachImage, upsertLead } from "@/lib/salesforce/lead";
import { leadSubmitSchema, type LeadsResponse } from "@/lib/schemas";

/**
 * Saves a reviewed lead.
 *
 * Answers 200 whenever the request was understood, even when Salesforce
 * refused it — the phone reads the body and decides whether to keep the item
 * in its outbox. 4xx is only for auth, validation and rate limiting, because
 * those are the cases where retrying the same bytes can never work.
 */

const SUBMITS_PER_MINUTE = 60;

/** Two compressed card photos plus fields. Well above a real submit. */
const MAX_BODY_BYTES = 6 * 1024 * 1024;

export async function POST(request: Request) {
  const session = await requireSession();
  if (session instanceof Response) return session;

  const capturedBy = session.user.email as string;

  const limit = rateLimit(`leads:${capturedBy}`, SUBMITS_PER_MINUTE, 60_000);
  if (!limit.ok) {
    return json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  // Checked before reading the stream, so an oversized body is refused rather
  // than buffered.
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_BODY_BYTES) return jsonError("payload_too_large", 413);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("invalid_json", 400);
  }

  const parsed = leadSubmitSchema.safeParse(body);
  if (!parsed.success) {
    // Field paths and the schema's own messages — enough for the phone to show
    // the rep what to fix, and none of it echoes the card.
    return json(
      {
        error: "invalid_lead",
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
      { status: 400 },
    );
  }

  const submit = parsed.data;

  // The only awaited external call before responding. Everything else either
  // cannot change the answer or happens after it.
  const salesforce = await upsertLead(submit);

  const backup = await saveLeadSafely(getBackupStore(), { submit, capturedBy, salesforce });

  /*
   * On a blocked duplicate there is no new Lead, but the person exists — so the
   * card image goes on the record Salesforce matched.
   */
  const leadId = salesforce.leadId ?? salesforce.duplicateOf;

  if ((salesforce.status === "synced" || salesforce.status === "duplicate") && leadId) {
    // Runs after the response is sent: the rep has their answer and is already
    // photographing the next card. A failed attachment is not worth waiting for.
    after(async () => {
      for (const image of submit.images) {
        try {
          await attachImage(leadId, image.side, image.dataUrl);
        } catch {
          // clientId and side only — never the image or the fields.
          console.error("attach_image_failed", { clientId: submit.clientId, side: image.side });
        }
      }
    });
  }

  const response: LeadsResponse = { clientId: submit.clientId, salesforce, backup };
  return json(response);
}
