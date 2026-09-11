import { describe, expect, it } from "vitest";
import {
  COMPANY_FALLBACK,
  EMPTY_LEAD_FIELDS,
  cleanPhone,
  leadFieldsSchema,
  leadFieldsSubmitSchema,
  leadSubmitSchema,
  withCompanyFallback,
} from "./schemas";

const CLIENT_ID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";

const PNG_PIXEL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

/** A lead that passes every rule, so each test can break exactly one thing. */
const validFields = {
  firstName: "Rohan",
  lastName: "Deshmukh",
  company: "Acme Ltd",
  email: "rohan@acme.com",
};

function submit(overrides: Record<string, unknown> = {}) {
  return {
    clientId: CLIENT_ID,
    fields: validFields,
    rawText: "ACME LTD\nRohan Deshmukh",
    consent: { given: true },
    images: [{ side: "front", dataUrl: PNG_PIXEL }],
    ...overrides,
  };
}

/** The field paths zod reported, so tests can assert where an error landed. */
function issuePaths(result: { success: boolean; error?: { issues: { path: PropertyKey[] }[] } }) {
  return (result.error?.issues ?? []).map((issue) => issue.path.join("."));
}

describe("cleanPhone", () => {
  it("keeps a number a human would recognise", () => {
    expect(cleanPhone("+1 (415) 555-0134")).toBe("+1 (415) 555-0134");
  });

  it("drops labels and punctuation that are not part of the number", () => {
    expect(cleanPhone("Tel: +91 98765-43210")).toBe("+91 98765-43210");
    expect(cleanPhone("555.123.4567")).toBe("5551234567");
    expect(cleanPhone("m: 07700 900 123")).toBe("07700 900 123");
  });

  it("keeps the digits of an extension once the word is stripped", () => {
    expect(cleanPhone("+44 20 7946 0958 ext. 22")).toBe("+44 20 7946 0958 22");
  });

  it("normalises exotic whitespace and collapses runs", () => {
    // OCR happily returns non-breaking and em spaces where a card had a gap.
    expect(cleanPhone("+1\u00a0415\u2003555 0134")).toBe("+1 415 555 0134");
    expect(cleanPhone("+1 415 555\t0134")).toBe("+1 415 555 0134");
    expect(cleanPhone("  +1   415  ")).toBe("+1 415");
  });

  it("leaves an empty value empty", () => {
    expect(cleanPhone("")).toBe("");
    expect(cleanPhone("n/a")).toBe("");
  });
});

describe("leadFieldsSchema", () => {
  it("fills every missing field with an empty string", () => {
    expect(leadFieldsSchema.parse({})).toEqual(EMPTY_LEAD_FIELDS);
    expect(Object.values(EMPTY_LEAD_FIELDS).every((value) => value === "")).toBe(true);
  });

  it("trims what Gemini returns", () => {
    expect(leadFieldsSchema.parse({ firstName: "  Rohan  " }).firstName).toBe("Rohan");
  });

  it("cleans the phone on the way in, so the rep reviews what will be saved", () => {
    expect(leadFieldsSchema.parse({ phone: "Tel: +91 98765-43210" }).phone).toBe("+91 98765-43210");
  });

  it("requires nothing — the rep fixes fields at review", () => {
    expect(leadFieldsSchema.safeParse({}).success).toBe(true);
  });

  it("truncates to the Salesforce limit instead of throwing away the scan", () => {
    const fields = leadFieldsSchema.parse({
      firstName: "a".repeat(60), // Lead.FirstName holds 40
      postalCode: "9".repeat(30), // Lead.PostalCode holds 20
      phone: "+1 ".repeat(40), // Lead.Phone holds 40
    });
    expect(fields.firstName).toHaveLength(40);
    expect(fields.postalCode).toHaveLength(20);
    expect(fields.phone.length).toBeLessThanOrEqual(40);
  });
});

describe("leadFieldsSubmitSchema — required rules", () => {
  it("accepts a lead with an email and no phone", () => {
    expect(leadFieldsSubmitSchema.safeParse(validFields).success).toBe(true);
  });

  it("accepts a lead with a phone and no email", () => {
    const result = leadFieldsSubmitSchema.safeParse({
      ...validFields,
      email: "",
      phone: "+1 (415) 555-0134",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a missing first or last name, against that field", () => {
    expect(issuePaths(leadFieldsSubmitSchema.safeParse({ ...validFields, firstName: "" }))).toEqual([
      "firstName",
    ]);
    expect(issuePaths(leadFieldsSubmitSchema.safeParse({ ...validFields, lastName: "  " }))).toEqual([
      "lastName",
    ]);
  });

  it("rejects a lead with neither email nor phone, once, against email", () => {
    const result = leadFieldsSubmitSchema.safeParse({ ...validFields, email: "", phone: "" });
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toEqual(["email"]);
    expect(result.error?.issues[0].message).toMatch(/email address or a phone number/);
  });

  it("rejects a malformed email even when a phone is present", () => {
    const result = leadFieldsSubmitSchema.safeParse({
      ...validFields,
      email: "rohan@acme",
      phone: "+1 415 555 0134",
    });
    expect(issuePaths(result)).toEqual(["email"]);
  });

  it("does not require a company — that gap is filled at submit", () => {
    expect(leadFieldsSubmitSchema.safeParse({ ...validFields, company: "" }).success).toBe(true);
  });

  it("reports every broken field at once, not just the first", () => {
    const result = leadFieldsSubmitSchema.safeParse({});
    expect(issuePaths(result).sort()).toEqual(["email", "firstName", "lastName"]);
  });
});

describe("withCompanyFallback", () => {
  it("fills an empty company, because Salesforce requires one", () => {
    expect(withCompanyFallback({ ...EMPTY_LEAD_FIELDS }).company).toBe(COMPANY_FALLBACK);
  });

  it("leaves a real company alone", () => {
    expect(withCompanyFallback({ ...EMPTY_LEAD_FIELDS, company: "Acme Ltd" }).company).toBe("Acme Ltd");
  });
});

describe("leadSubmitSchema", () => {
  it("accepts a complete submission", () => {
    const result = leadSubmitSchema.safeParse(submit());
    expect(result.success).toBe(true);
    expect(result.data?.fields.company).toBe("Acme Ltd");
  });

  it("applies the company fallback server-side too", () => {
    const result = leadSubmitSchema.parse(submit({ fields: { ...validFields, company: "" } }));
    expect(result.fields.company).toBe(COMPANY_FALLBACK);
  });

  it("rejects a clientId that is not a uuid", () => {
    expect(issuePaths(leadSubmitSchema.safeParse(submit({ clientId: "lead-1" })))).toEqual(["clientId"]);
  });

  it("rejects consent that is absent, false, or merely truthy", () => {
    expect(leadSubmitSchema.safeParse(submit({ consent: undefined })).success).toBe(false);
    expect(leadSubmitSchema.safeParse(submit({ consent: { given: false } })).success).toBe(false);
    expect(leadSubmitSchema.safeParse(submit({ consent: { given: "yes" } })).success).toBe(false);
  });

  it("requires at least one image and allows at most two", () => {
    expect(leadSubmitSchema.safeParse(submit({ images: [] })).success).toBe(false);
    expect(
      leadSubmitSchema.safeParse(
        submit({
          images: [
            { side: "front", dataUrl: PNG_PIXEL },
            { side: "back", dataUrl: PNG_PIXEL },
          ],
        }),
      ).success,
    ).toBe(true);
  });

  it("rejects the same side twice, which would collide on the backup index", () => {
    const result = leadSubmitSchema.safeParse(
      submit({
        images: [
          { side: "front", dataUrl: PNG_PIXEL },
          { side: "front", dataUrl: PNG_PIXEL },
        ],
      }),
    );
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toMatch(/only be sent once/);
  });

  it("rejects an image that is not a JPEG or PNG data URL", () => {
    expect(
      leadSubmitSchema.safeParse(submit({ images: [{ side: "front", dataUrl: "https://evil.test/x.jpg" }] }))
        .success,
    ).toBe(false);
    expect(
      leadSubmitSchema.safeParse(
        submit({ images: [{ side: "front", dataUrl: "data:image/svg+xml;base64,PHN2Zz4=" }] }),
      ).success,
    ).toBe(false);
  });

  it("rejects an image far larger than a compressed card photo", () => {
    const huge = "data:image/jpeg;base64," + "A".repeat(2_900_000);
    expect(leadSubmitSchema.safeParse(submit({ images: [{ side: "front", dataUrl: huge }] })).success).toBe(
      false,
    );
  });

  it("defaults rawText, so a manually typed lead is still valid", () => {
    expect(leadSubmitSchema.parse(submit({ rawText: undefined })).rawText).toBe("");
  });

  it("carries the field rules through, against the nested path", () => {
    expect(
      issuePaths(leadSubmitSchema.safeParse(submit({ fields: { ...validFields, lastName: "" } }))),
    ).toEqual(["fields.lastName"]);
  });
});
