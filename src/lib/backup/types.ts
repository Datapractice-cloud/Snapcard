import type { BackupResult, LeadSubmit, SalesforceResult } from "../schemas";

/**
 * The seam between the save flow and the Phase 2 Atlas backup.
 *
 * The whole point of this interface is that `/api/leads` is written against it
 * now, so Phase 2 is one new implementation and a line in `getBackupStore()` —
 * not a rewrite of the route that owns the Salesforce write. Per CLAUDE.md,
 * Mongo code goes in `backup/mongo.ts` and nowhere else.
 *
 * Two rules bind every implementation:
 *
 * 1. **Never block or slow the Salesforce write.** Salesforce is the system of
 *    record; the backup is a mirror. A slow store delays the rep's answer, and
 *    at a booth that is what makes someone give up and lose the lead.
 * 2. **Never throw in a way that changes the Salesforce result.** Callers wrap
 *    these in try/catch and turn any throw into `{ status: "failed" }`, but an
 *    implementation should prefer returning that itself over raising.
 */
export interface BackupStore {
  /**
   * Records the lead and what Salesforce did with it. Called after the
   * Salesforce write, because it stores that outcome.
   */
  saveLead(input: {
    submit: LeadSubmit;
    /** The rep's Google email. Salesforce no longer holds this; the backup does. */
    capturedBy: string;
    salesforce: SalesforceResult;
  }): Promise<BackupResult>;

  /**
   * Stores the card photos. Independent of the Salesforce result, so Phase 2
   * runs it concurrently with the upsert rather than after it.
   */
  saveImages(clientId: string, images: LeadSubmit["images"]): Promise<void>;
}
