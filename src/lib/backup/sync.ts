import { attachImage, upsertLead } from "../salesforce/lead";
import { leadImagesCollection, leadsCollection, type LeadDoc } from "../mongo";
import type { LeadSubmit } from "../schemas";

/**
 * The server-side Salesforce retry.
 *
 * A lead reaches Atlas whether or not Salesforce accepted it. This is what
 * eventually gets the rejected ones in, without the phone — which may be in a
 * bag, flat, or three time zones away by then.
 */

/** One run's worth. Small enough that a cron tick cannot run long. */
const BATCH = 25;

/** Give up after this many tries and leave the lead for a person to look at. */
const MAX_ATTEMPTS = 5;

/** How long a run owns a lead before another run may take it. */
const CLAIM_MS = 60_000;

const MAX_BACKOFF_MS = 15 * 60_000;

/**
 * 30s doubling to a 15 minute ceiling.
 *
 * Capped rather than unbounded: an org that was misconfigured for a day should
 * not leave leads scheduled a week out once it is fixed.
 */
export function syncBackoffMs(attempts: number): number {
  const doubled = 30_000 * 2 ** Math.max(0, attempts);
  return Math.min(MAX_BACKOFF_MS, doubled);
}

export type SyncReport = {
  processed: number;
  synced: number;
  failed: number;
  needsReview: number;
};

export async function runSync(now: Date = new Date()): Promise<SyncReport> {
  const leads = await leadsCollection();
  const report: SyncReport = { processed: 0, synced: 0, failed: 0, needsReview: 0 };

  const due = await leads
    .find({
      "salesforce.status": "failed",
      "salesforce.attempts": { $lt: MAX_ATTEMPTS },
      "salesforce.nextAttemptAt": { $lte: now },
      $or: [{ "salesforce.claimedUntil": { $exists: false } }, { "salesforce.claimedUntil": { $lt: now } }],
    })
    .sort({ createdAt: 1 })
    .limit(BATCH)
    .toArray();

  for (const doc of due) {
    /*
     * Claimed atomically. Two cron runs can overlap — a slow run and the next
     * tick, or a manual workflow_dispatch alongside the schedule — and without
     * this both would upsert the same lead and attach the card image twice.
     * The filter repeats the status and claim conditions so the claim only
     * succeeds if nothing changed since the find.
     */
    const claimed = await leads.findOneAndUpdate(
      {
        clientId: doc.clientId,
        "salesforce.status": "failed",
        $or: [
          { "salesforce.claimedUntil": { $exists: false } },
          { "salesforce.claimedUntil": { $lt: now } },
        ],
      },
      { $set: { "salesforce.claimedUntil": new Date(now.getTime() + CLAIM_MS) } },
      { returnDocument: "after" },
    );

    // Someone else got there first.
    if (!claimed) continue;

    report.processed += 1;
    const outcome = await syncOne(claimed);
    report[outcome] += 1;
  }

  return report;
}

async function syncOne(doc: LeadDoc): Promise<"synced" | "failed" | "needsReview"> {
  const leads = await leadsCollection();
  const submit = await rebuildSubmit(doc);
  const result = await upsertLead(submit);
  const now = new Date();

  if (result.status === "synced" || result.status === "duplicate") {
    const leadId = result.leadId ?? result.duplicateOf;

    await leads.updateOne(
      { clientId: doc.clientId },
      {
        $set: {
          "salesforce.status": result.status,
          ...(leadId ? { "salesforce.leadId": leadId } : {}),
          ...(result.duplicateOf ? { "salesforce.duplicateOf": result.duplicateOf } : {}),
          "salesforce.syncedAt": now,
          updatedAt: now,
        },
        $unset: { "salesforce.claimedUntil": "", "salesforce.nextAttemptAt": "" },
      },
    );

    /*
     * Inline, not in after(): this is a cron request whose response nobody is
     * waiting on, so there is no reason to hand back early and every reason to
     * know the attachment finished before the run reports success.
     */
    if (leadId) {
      for (const image of submit.images) {
        try {
          await attachImage(leadId, image.side, image.dataUrl);
        } catch {
          console.error("sync_attach_failed", { clientId: doc.clientId, side: image.side });
        }
      }
    }

    return "synced";
  }

  if (result.status === "needs_review") {
    // Salesforce understood it and refused. Retrying changes nothing.
    await leads.updateOne(
      { clientId: doc.clientId },
      {
        $set: {
          "salesforce.status": "needs_review",
          "salesforce.lastError": (result.error ?? "").slice(0, 500),
          updatedAt: now,
        },
        $unset: { "salesforce.claimedUntil": "", "salesforce.nextAttemptAt": "" },
      },
    );
    return "needsReview";
  }

  const attempts = doc.salesforce.attempts + 1;
  await leads.updateOne(
    { clientId: doc.clientId },
    {
      $set: {
        "salesforce.attempts": attempts,
        "salesforce.nextAttemptAt": new Date(now.getTime() + syncBackoffMs(doc.salesforce.attempts)),
        "salesforce.lastError": (result.error ?? "").slice(0, 500),
        updatedAt: now,
      },
      $unset: { "salesforce.claimedUntil": "" },
    },
  );
  return "failed";
}

/**
 * Puts a stored lead back into the shape `upsertLead` takes.
 *
 * Not re-parsed through leadSubmitSchema: this data was validated by that
 * schema on the way in, and a reconciled lead legitimately has no images,
 * which the submit schema forbids.
 */
async function rebuildSubmit(doc: LeadDoc): Promise<LeadSubmit> {
  const images = await leadImagesCollection();
  const stored = await images.find({ clientId: doc.clientId }).toArray();

  return {
    clientId: doc.clientId,
    fields: doc.fields as LeadSubmit["fields"],
    rawText: doc.rawText,
    images: stored.map((image) => ({
      side: image.side,
      dataUrl: `data:${image.mimeType};base64,${Buffer.from(image.data.buffer).toString("base64")}`,
    })),
  };
}
