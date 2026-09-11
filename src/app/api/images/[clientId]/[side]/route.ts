import { requireSession } from "@/lib/auth";
import { env } from "@/lib/env";
import { jsonError } from "@/lib/http";
import { findLeadImage, findLeadOwner } from "@/lib/mongo";

/**
 * Streams a stored card photo.
 *
 * These are photographs of a stranger's business card, so the response is
 * `private, no-store`: no CDN, no proxy and no browser disk cache keeps a copy
 * after the tab closes.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ clientId: string; side: string }> },
) {
  const session = await requireSession();
  if (session instanceof Response) return session;

  if (!env.MONGODB_URI) return jsonError("backup_not_configured", 503);

  const { clientId, side } = await params;
  if (!isUuid(clientId)) return jsonError("invalid_client_id", 400);
  if (side !== "front" && side !== "back") return jsonError("invalid_side", 400);

  // Checked before the image is read, so an unauthorised request never costs a
  // BinData fetch.
  const owner = await findLeadOwner(clientId);
  if (!owner) return jsonError("not_found", 404);
  if (session.user.role !== "admin" && owner !== session.user.email) {
    return jsonError("not_found", 404);
  }

  const image = await findLeadImage(clientId, side);
  if (!image) return jsonError("not_found", 404);

  return new Response(new Uint8Array(image.bytes), {
    headers: {
      "Content-Type": image.mimeType,
      "Content-Length": String(image.bytes.byteLength),
      "Cache-Control": "private, no-store",
      // Shown in the page, never downloaded as a file.
      "Content-Disposition": `inline; filename="card-${side}.jpg"`,
    },
  });
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
