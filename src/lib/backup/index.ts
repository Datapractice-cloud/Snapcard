import { env } from "../env";
import type { BackupResult } from "../schemas";
import { mongoBackupStore } from "./mongo";
import { noopBackupStore } from "./noop";
import type { BackupStore } from "./types";

export type { BackupStore } from "./types";

/**
 * Runs the backup so that it can never change the Salesforce result.
 *
 * A function rather than an inline try/catch because this is the rule the save
 * flow exists to protect — Salesforce is the system of record, and a broken
 * mirror must not turn a saved lead into a failed one. Worth a test of its own.
 */
export async function saveLeadSafely(
  store: BackupStore,
  input: Parameters<BackupStore["saveLead"]>[0],
): Promise<BackupResult> {
  try {
    return await store.saveLead(input);
  } catch {
    // Deliberately swallowed. The clientId is logged by the caller; the reason
    // is not, because a backup error can quote the record it choked on.
    return { status: "failed" };
  }
}

/**
 * The only place that decides which backup implementation is in play.
 *
 * Atlas when MONGODB_URI is set, otherwise nothing. Phase 1 deployments and
 * the unit tests run without it.
 */
export function getBackupStore(): BackupStore {
  return env.MONGODB_URI ? mongoBackupStore : noopBackupStore;
}
