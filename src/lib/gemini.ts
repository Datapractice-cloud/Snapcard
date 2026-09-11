import { GoogleGenAI, Type } from "@google/genai";
import { env } from "./env";
import { leadFieldsSchema, type LeadFields } from "./schemas";

/**
 * Business-card OCR. Runs server-side only: GEMINI_API_KEY must never reach a
 * phone. Nothing here is persisted — see the `/api/scan` route.
 */

export type ScanImage = {
  mimeType: string;
  /** Raw base64, without the `data:` prefix. */
  base64: string;
};

export type Extraction = {
  fields: LeadFields;
  rawText: string;
};

export class GeminiError extends Error {
  constructor(
    /** A short code, safe to log. Never carries card contents. */
    readonly code: "empty_response" | "bad_json" | "api_error",
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "GeminiError";
  }
}

const STRING = { type: Type.STRING } as const;

/**
 * Mirrors LeadFields plus rawText, every value a string. Listing all of them as
 * required is what makes the model emit `""` for what it cannot read, rather
 * than omitting the key and leaving us to guess.
 */
const responseSchema = {
  type: Type.OBJECT,
  properties: {
    firstName: STRING,
    lastName: STRING,
    company: STRING,
    title: STRING,
    email: STRING,
    phone: STRING,
    website: STRING,
    street: STRING,
    city: STRING,
    state: STRING,
    postalCode: STRING,
    country: STRING,
    rawText: STRING,
  },
  required: [
    "firstName",
    "lastName",
    "company",
    "title",
    "email",
    "phone",
    "website",
    "street",
    "city",
    "state",
    "postalCode",
    "country",
    "rawText",
  ],
} as const;

const PROMPT = `You are reading a photograph of a business card. Extract the contact into the JSON schema you were given.

Rules:
- If you are given two images they are the front and back of the SAME card. Merge them into one contact; do not return two.
- Split the person's name into firstName and lastName. Drop honorifics (Mr, Ms, Dr) and post-nominals (MBA, PhD). If only one name is printed, put it in lastName.
- title is the person's job title, not the company name or a tagline.
- Split the postal address into street, city, state, postalCode and country. Put the whole street address, including any suite or floor, in street.
- website is the company's own site. A LinkedIn URL is not a website: if that is all the card shows, leave website empty.
- Use the single best phone number if several are printed, preferring a mobile.
- Use exactly "" for any field the card does not show. Never guess, never invent, never copy a value from one field into another.
- Transcribe only what is printed; do not translate or reformat it.
- rawText is every piece of visible text on the card, in reading order, with a line break between lines. Include both sides when there are two images.`;

let client: GoogleGenAI | undefined;

function getClient(): GoogleGenAI {
  client ??= new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
  return client;
}

/**
 * Turns the model's JSON into validated fields. Split out from the network call
 * so the parsing rules can be unit-tested without an API key.
 *
 * Unknown keys are dropped and every value is trimmed, phone-cleaned and capped
 * to its Salesforce length by `leadFieldsSchema` — the model's output gets the
 * same treatment as anything a rep types.
 */
export function parseExtraction(text: string | undefined): Extraction {
  if (!text?.trim()) {
    throw new GeminiError("empty_response", "The model returned nothing.");
  }

  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch (cause) {
    throw new GeminiError("bad_json", "The model did not return JSON.", { cause });
  }

  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    throw new GeminiError("bad_json", "The model did not return a JSON object.");
  }

  const record = payload as Record<string, unknown>;
  const fields = leadFieldsSchema.safeParse(record);
  if (!fields.success) {
    throw new GeminiError("bad_json", "The model returned fields of the wrong shape.");
  }

  const rawText = typeof record.rawText === "string" ? record.rawText.trim() : "";
  return { fields: fields.data, rawText };
}

export async function extractCard(images: ScanImage[], signal?: AbortSignal): Promise<Extraction> {
  const response = await getClient()
    .models.generateContent({
      model: env.GEMINI_MODEL,
      contents: [
        {
          role: "user",
          parts: [
            { text: PROMPT },
            ...images.map((image) => ({
              inlineData: { mimeType: image.mimeType, data: image.base64 },
            })),
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema,
        // Reading a card is transcription, not composition. Nothing about it
        // should vary between two runs on the same photo.
        temperature: 0,
        abortSignal: signal,
      },
    })
    .catch((cause: unknown) => {
      throw new GeminiError("api_error", "The Gemini request failed.", { cause });
    });

  return parseExtraction(response.text);
}
