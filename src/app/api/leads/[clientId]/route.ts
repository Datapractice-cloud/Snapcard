import { requireSession } from "@/lib/auth";
import { env } from "@/lib/env";
import { json, jsonError } from "@/lib/http";
import { deleteLeadFromAtlas, findLeadDetail, findLeadOwner } from "@/lib/mongo";

/** One stored lead, for the detail view. */
export async function GET(_request: Request, { params }: { params: Promise<{ clientId: string }> }) {
  const session = await requireSession();
  if (session instanceof Response) return session;

  if (!env.MONGODB_URI) return jsonError("backup_not_configured", 503);

  const { clientId } = await params;
  if (!isUuid(clientId)) return jsonError("invalid_client_id", 400);

  const lead = await findLeadDetail(clientId);
  if (!lead) return jsonError("not_found", 404);

  /*
   * A rep may only open their own leads. 404 rather than 403, so the endpoint
   * cannot be used to discover which client ids exist.
   */
  if (session.user.role !== "admin" && lead.capturedBy !== session.user.email) {
    return jsonError("not_found", 404);
  }

  return json(lead);
}

/**
 * Deletes a lead and its card images, for good.
 *
 * Same ownership rule as the read above — a rep may delete their own, an admin
 * any — and the same 404 for a lead that is not theirs, so this cannot be used
 * to find out which client ids exist.
 *
 * Salesforce is untouched. It is switched off (SALESFORCE_ENABLED=false) and
 * nothing has been written there; when it is switched back on, a lead deleted
 * here would still need removing from the org by hand.
 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ clientId: string }> }) {
  const session = await requireSession();
  if (session instanceof Response) return session;

  if (!env.MONGODB_URI) return jsonError("backup_not_configured", 503);

  const { clientId } = await params;
  if (!isUuid(clientId)) return jsonError("invalid_client_id", 400);

  const owner = await findLeadOwner(clientId);
  if (owner === null) return jsonError("not_found", 404);

  if (session.user.role !== "admin" && owner !== session.user.email) {
    return jsonError("not_found", 404);
  }

  await deleteLeadFromAtlas(clientId);
  // clientId only — never the fields or the card, as CLAUDE.md requires.
  console.info("lead_deleted", { clientId, by: session.user.email });

  return json({ deleted: clientId });
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
