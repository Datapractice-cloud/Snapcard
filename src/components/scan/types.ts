import type { CardSide, LeadFields } from "@/lib/schemas";

/** A compressed photo of one side of the card, held only in memory. */
export type Shot = {
  side: CardSide;
  /** The compressed JPEG. Converted to a data URL at submit time. */
  blob: Blob;
  /** An object URL for the preview. Revoked when the shot is replaced or dropped. */
  previewUrl: string;
  bytes: number;
};

/** What `/api/scan` gave back, carried into the review step. */
export type ScanResult = {
  fields: LeadFields;
  rawText: string;
};
