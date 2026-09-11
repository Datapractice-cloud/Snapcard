import { env } from "../env";
import { noopBackupStore } from "./noop";
import type { BackupStore } from "./types";

export type { BackupStore } from "./types";

let warned = false;

/**
 * The only place that decides which backup implementation is in play.
 *
 * Phase 2 adds the Mongo branch here and nothing else in the save flow
 * changes.
 */
export function getBackupStore(): BackupStore {
  if (!env.MONGODB_URI) return noopBackupStore;

  // MONGODB_URI is set but Phase 2 has not landed. Say so once, rather than
  // letting someone believe leads are being mirrored when they are not.
  if (!warned) {
    warned = true;
    console.warn("backup_store_not_implemented", { reason: "MONGODB_URI is set but Phase 2 is not built" });
  }
  return noopBackupStore;
}
