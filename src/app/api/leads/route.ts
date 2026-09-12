import { after } from "next/server";
import { requireSession } from "@/lib/auth";
import { env } from "@/lib/env";
import { listLeadsForRep } from "@/lib/mongo";
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

/**
 * Every lead this rep has captured, on any device, however long ago.
 *
 * /leads reads this rather than only the browser's IndexedDB: the account owns
 * the leads, not the handset it was standing in when it scanned them. Ownership
 * is the same rule the single-lead route applies — a rep sees their own.
 */
export async function GET() {
  const session = await requireSession();
  if (session instanceof Response) return session;

  /*
   * 503 rather than an empty list. "No backup configured" and "you have no
   * leads" look identical to the phone otherwise, and showing a rep an empty
   * list they know is wrong is the bug this endpoint exists to fix.
   */
  if (!env.MONGODB_URI) return jsonError("backup_not_configured", 503);

  const leads = await listLeadsForRep(session.user.email as string);
  return json({ leads });
}

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
  const store = getBackupStore();

  /*
   * The images do not depend on what Salesforce says, so they upload
   * alongside the Lead write rather than after it — two round trips in the
   * time of one, on a connection the rep is waiting on.
   *
   * Isolated with .then(_, _) rather than try/catch so a backup failure can
   * never reject the Promise.all and take the Salesforce result down with it.
   */
  const [salesforce] = await Promise.all([
    upsertLead(submit),
    store.saveImages(submit.clientId, submit.images).then(
      () => "ok" as const,
      () => {
        console.error("backup_images_failed", { clientId: submit.clientId });
        return "failed" as const;
      },
    ),
  ]);

  // After the upsert, because it records what the upsert did.
  const backup = await saveLeadSafely(store, { submit, capturedBy, salesforce });

  /*
   * On a blocked duplicate there is no new Lead, but the person exists — so the
   * card image goes on the record Salesforce matched.
   */
  const leadId = salesforce.leadId ?? salesforce.duplicateOf;

  // No Salesforce record to attach to when the integration is off; the images
  // are already in the backup store.
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
