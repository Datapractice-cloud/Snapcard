import { Binary, type AnyBulkWriteOperation } from "mongodb";
import { leadImagesCollection, leadsCollection, type LeadImageDoc } from "../mongo";
import { parseDataUrl } from "../salesforce/lead";
import type { BackupResult, LeadSubmit } from "../schemas";
import type { BackupStore } from "./types";

/**
 * The Atlas mirror. Per CLAUDE.md this is the only file that may contain Mongo
 * code besides `mongo.ts` itself.
 *
 * Everything here is written so that a failure is the caller's to shrug off:
 * `/api/leads` wraps both methods, and a broken mirror must never turn a saved
 * lead into a failed one.
 */

/** Backoff for the first server-side retry, matching the phone's first step. */
const FIRST_RETRY_MS = 30_000;

/** A compressed card photo is ~50-400 KB. Anything past this is not a card. */
const MAX_IMAGE_BYTES = 1024 * 1024;

export const mongoBackupStore: BackupStore = {
  async saveLead({ submit, capturedBy, salesforce }): Promise<BackupResult> {
    const leads = await leadsCollection();
    const now = new Date();

    /*
     * `failed` is the only status the server can act on later, so it is the
     * only one that gets a retry schedule. Everything else is terminal: synced
     * and duplicate are done, and needs_review needs a human.
     */
    const retry =
      salesforce.status === "failed"
        ? { attempts: 1, nextAttemptAt: new Date(now.getTime() + FIRST_RETRY_MS) }
        : { attempts: 0 };

    await leads.updateOne(
      { clientId: submit.clientId },
      {
        // createdAt is the first time we saw the lead; a retry must not move it.
        $setOnInsert: { clientId: submit.clientId, createdAt: now },
        $set: {
          capturedBy,
          fields: submit.fields,
          rawText: submit.rawText,
          // Stamped by the server, as at capture. The phone never supplies it.
          consent: { given: true as const, at: now },
          salesforce: {
            status: salesforce.status,
            ...(salesforce.leadId ? { leadId: salesforce.leadId } : {}),
            ...(salesforce.duplicateOf ? { duplicateOf: salesforce.duplicateOf } : {}),
            ...(salesforce.error ? { lastError: salesforce.error.slice(0, 500) } : {}),
            ...(salesforce.status === "synced" || salesforce.status === "duplicate"
              ? { syncedAt: now }
              : {}),
            ...retry,
          },
          backup: { source: "live" as const, savedAt: now },
          updatedAt: now,
        },
      },
      { upsert: true },
    );

    return { status: "saved" };
  },

  async saveImages(clientId: string, images: LeadSubmit["images"]): Promise<void> {
    const decoded = images
      .map((image) => {
        const parsed = parseDataUrl(image.dataUrl);
        if (!parsed) return null;

        const data = Buffer.from(parsed.base64, "base64");
        // Dropped rather than stored: something this large is not a card photo,
        // and the Atlas free tier is 512 MB for the whole event.
        if (data.byteLength > MAX_IMAGE_BYTES) return null;

        return {
          clientId,
          side: image.side,
          mimeType: parsed.mimeType,
          sizeBytes: data.byteLength,
          data: new Binary(data),
          createdAt: new Date(),
        } satisfies LeadImageDoc;
      })
      .filter((doc): doc is LeadImageDoc => doc !== null);

    if (decoded.length === 0) return;

    const images_ = await leadImagesCollection();
    const operations: AnyBulkWriteOperation<LeadImageDoc>[] = decoded.map((doc) => ({
      updateOne: {
        filter: { clientId: doc.clientId, side: doc.side },
        update: { $set: doc },
        upsert: true,
      },
    }));

    // Unordered: one oversized or rejected side must not stop the other.
    await images_.bulkWrite(operations, { ordered: false });
  },
};
