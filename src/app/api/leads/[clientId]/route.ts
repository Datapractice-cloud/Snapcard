import { requireSession } from "@/lib/auth";
import { env } from "@/lib/env";
import { json, jsonError } from "@/lib/http";
import { findLeadDetail } from "@/lib/mongo";

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

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
