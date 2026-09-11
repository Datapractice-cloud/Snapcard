"use client";

import { useEffect } from "react";
import { startOutbox } from "@/lib/client/outbox";

/**
 * Drains the outbox on app open, on `online`, and whenever the tab becomes
 * visible again.
 *
 * Lives in the signed-in layout rather than on /scan, because the commonest
 * recovery is a rep opening the app on the train home — they will not think to
 * visit the capture screen first.
 */
export function OutboxRunner() {
  useEffect(() => startOutbox(), []);
  return null;
}
