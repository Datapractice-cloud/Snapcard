import type { BackupResult } from "../schemas";
import type { BackupStore } from "./types";

/**
 * Phase 1: there is no backup. Salesforce is the only store, and the phone's
 * outbox is what stops a lead being lost until the server confirms.
 *
 * `skipped` rather than `saved` is deliberate. It is the truth, and the outbox
 * rules in CLAUDE.md treat `skipped` and `saved` the same way in Phase 1 while
 * keeping `failed` meaningful — so when Phase 2 arrives, a real backup failure
 * is already distinguishable from a backup that was never attempted.
 */
export const noopBackupStore: BackupStore = {
  async saveLead(): Promise<BackupResult> {
    return { status: "skipped" };
  },

  async saveImages(): Promise<void> {
    // Nothing to do. Card images live in Salesforce as a ContentVersion.
  },
};
