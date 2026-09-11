import { z } from "zod";

/**
 * One set of schemas shared by the browser and the route handlers, so the
 * review form and `/api/leads` can never disagree about what a valid lead is.
 */

/** Salesforce requires Company on a Lead, and an event badge often omits it. */
export const COMPANY_FALLBACK = "[Not provided]";

/**
 * Cards print phone numbers every way imaginable. Keep the shape a human wrote
 * — country code, grouping, extensions — and drop everything else, rather than
 * reducing to digits and losing the leading `+`.
 */
export function cleanPhone(raw: string): string {
  return raw
    .replace(/\s/g, " ") // non-breaking and exotic spaces become ordinary ones
    .replace(/[^+\d\-() ]/g, "")
    .replace(/ {2,}/g, " ")
    .trim();
}

/**
 * Truncate rather than reject. The lengths below are Salesforce's own limits on
 * Lead, so nothing that parses here can later fail the upsert with
 * STRING_TOO_LONG and land in the admin's needs-review pile. Rejecting instead
 * would throw away a whole scan over one long field, and the rep sees and can
 * correct every value at review anyway.
 */
const text = (max: number) =>
  z
    .string()
    .default("")
    .transform((value) => value.trim().slice(0, max));

/**
 * What Gemini returns and what the review form edits: every field a string,
 * every field optional. Nothing here is required — the rep fixes it at review.
 */
export const leadFieldsSchema = z.object({
  firstName: text(40),
  lastName: text(80),
  company: text(255),
  title: text(128),
  email: text(80),
  phone: z
    .string()
    .default("")
    .transform((value) => cleanPhone(value).slice(0, 40)),
  website: text(255),
  linkedin: text(255),
  street: text(255),
  city: text(40),
  state: text(80),
  postalCode: text(20),
  country: text(80),
});

export type LeadFields = z.infer<typeof leadFieldsSchema>;

/** Every field blank — the review form's default values. */
export const EMPTY_LEAD_FIELDS: LeadFields = leadFieldsSchema.parse({});

const emailFormat = z.email();

/**
 * The rule that decides whether a lead may be saved, applied identically on the
 * phone and on the server. Issues carry a field path so react-hook-form can put
 * each message under the input it belongs to.
 */
export const leadFieldsSubmitSchema = leadFieldsSchema.superRefine((fields, ctx) => {
  if (!fields.firstName) {
    ctx.addIssue({ code: "custom", path: ["firstName"], message: "First name is required." });
  }
  if (!fields.lastName) {
    ctx.addIssue({ code: "custom", path: ["lastName"], message: "Last name is required." });
  }

  if (fields.email && !emailFormat.safeParse(fields.email).success) {
    ctx.addIssue({ code: "custom", path: ["email"], message: "Enter a valid email address." });
  }

  // One way to reach the person is enough; a badge often has only one.
  // Reported on `email` alone — the same message under two fields reads as two
  // separate problems.
  if (!fields.email && !fields.phone) {
    ctx.addIssue({
      code: "custom",
      path: ["email"],
      message: "Enter an email address or a phone number.",
    });
  }
});

/** Stamped when the payload is built, not while the rep is still typing. */
export function withCompanyFallback(fields: LeadFields): LeadFields {
  return fields.company ? fields : { ...fields, company: COMPANY_FALLBACK };
}

export const cardSideSchema = z.enum(["front", "back"]);
export type CardSide = z.infer<typeof cardSideSchema>;

/*
 * Bounds on the base64 payloads. The client compresses to 1600px JPEG q0.8,
 * which lands well under these; they exist so a malformed or hostile request
 * cannot make the server hold tens of megabytes of string per lead.
 */
const MAX_DATA_URL_CHARS = 2_800_000; // ~2 MB decoded, matching the scan limit
const MAX_RAW_TEXT_CHARS = 20_000; // Lead.Description holds 32k

export const leadImageSchema = z.object({
  side: cardSideSchema,
  dataUrl: z
    .string()
    .max(MAX_DATA_URL_CHARS, "Image is too large.")
    .regex(/^data:image\/(jpeg|png);base64,[A-Za-z0-9+/]+=*$/, "Image must be a JPEG or PNG data URL."),
});

export type LeadImage = z.infer<typeof leadImageSchema>;

export const leadSubmitSchema = z.object({
  // Minted on the phone before any network call, and the Salesforce external
  // id. This is what makes a double-tapped save one Lead instead of two.
  clientId: z.uuid(),
  fields: leadFieldsSubmitSchema.transform(withCompanyFallback),
  rawText: z.string().max(MAX_RAW_TEXT_CHARS).default(""),
  // Literal `true`: there is no such thing as a submitted lead without consent,
  // so an absent or false value is a validation failure, not a flag to store.
  consent: z.object({ given: z.literal(true) }),
  images: z
    .array(leadImageSchema)
    .min(1, "Attach at least the front of the card.")
    .max(2)
    .refine(
      (images) => new Set(images.map((image) => image.side)).size === images.length,
      "Each side of the card may only be sent once.",
    ),
});

export type LeadSubmit = z.infer<typeof leadSubmitSchema>;

export const scanResponseSchema = z.object({
  fields: leadFieldsSchema,
  rawText: z.string(),
  /** Echoed back so a bad extraction can be traced to the model that produced it. */
  model: z.string(),
});

export type ScanResponse = z.infer<typeof scanResponseSchema>;

export const salesforceStatusSchema = z.enum(["synced", "duplicate", "failed", "needs_review"]);
export type SalesforceStatus = z.infer<typeof salesforceStatusSchema>;

export const salesforceResultSchema = z.object({
  status: salesforceStatusSchema,
  leadId: z.string().optional(),
  /** The Id of the Lead that already existed, when Salesforce blocked a duplicate. */
  duplicateOf: z.string().optional(),
  error: z.string().optional(),
});

export type SalesforceResult = z.infer<typeof salesforceResultSchema>;

export const backupResultSchema = z.object({
  status: z.enum(["saved", "skipped", "failed"]),
});

export type BackupResult = z.infer<typeof backupResultSchema>;

export const leadsResponseSchema = z.object({
  clientId: z.string(),
  salesforce: salesforceResultSchema,
  backup: backupResultSchema,
});

export type LeadsResponse = z.infer<typeof leadsResponseSchema>;
