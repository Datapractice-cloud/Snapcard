import { requireSession } from "@/lib/auth";
import { GeminiError, extractCard, type ScanImage } from "@/lib/gemini";
import { json, jsonError } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { env } from "@/lib/env";
import type { ScanResponse } from "@/lib/schemas";

/**
 * Reads a business card and returns the fields for review.
 *
 * This route stores nothing. Images are held only long enough to send to
 * Gemini; they are persisted on submit, after consent, by `/api/leads`.
 */

const MAX_IMAGES = 2;
const MAX_BYTES = 2 * 1024 * 1024;
const ACCEPTED = new Set(["image/jpeg", "image/png"]);

/** Gemini is the slow part; fail before the phone's own patience runs out. */
const GEMINI_TIMEOUT_MS = 25_000;

const SCANS_PER_MINUTE = 20;

export async function POST(request: Request) {
  const session = await requireSession();
  if (session instanceof Response) return session;

  // Per rep, not per IP: a booth shares one wifi, and the point is to stop a
  // single stuck phone burning the shared Gemini quota.
  const email = session.user.email as string;
  const limit = rateLimit(`scan:${email}`, SCANS_PER_MINUTE, 60_000);
  if (!limit.ok) {
    return json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonError("invalid_form", 400);
  }

  // Any file part is accepted rather than a fixed field name, so curl and the
  // capture screen can both post without agreeing on one in advance.
  const files = [...form.values()].filter((value): value is File => value instanceof File);

  if (files.length === 0) return jsonError("no_images", 400);
  if (files.length > MAX_IMAGES) return jsonError("too_many_images", 400);

  for (const file of files) {
    if (!ACCEPTED.has(file.type)) return jsonError("unsupported_type", 400);
    if (file.size > MAX_BYTES) return jsonError("image_too_large", 400);
    if (file.size === 0) return jsonError("empty_image", 400);
  }

  const images: ScanImage[] = await Promise.all(
    files.map(async (file) => ({
      mimeType: file.type,
      base64: Buffer.from(await file.arrayBuffer()).toString("base64"),
    })),
  );

  try {
    const { fields, rawText } = await extractCard(images, AbortSignal.timeout(GEMINI_TIMEOUT_MS));
    const body: ScanResponse = { fields, rawText, model: env.GEMINI_MODEL };
    return json(body);
  } catch (error) {
    // Codes only. Never the card, the fields or the image — see CLAUDE.md.
    const code = error instanceof GeminiError ? error.code : "unknown";
    console.error("scan_failed", { code, images: images.length });
    return jsonError("scan_failed", 502);
  }
}
