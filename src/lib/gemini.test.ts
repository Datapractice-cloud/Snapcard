import { describe, expect, it } from "vitest";
import { GeminiError, parseExtraction } from "./gemini";

/** A well-behaved model response: every key present, blanks as "". */
function modelJson(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    firstName: "Rohan",
    lastName: "Deshmukh",
    company: "Acme Ltd",
    title: "Head of Procurement",
    email: "rohan@acme.com",
    phone: "+91 98765 43210",
    website: "acme.com",
    street: "12 MG Road",
    city: "Pune",
    state: "MH",
    postalCode: "411001",
    country: "India",
    rawText: "ACME LTD\nRohan Deshmukh\nHead of Procurement",
    ...overrides,
  });
}

describe("parseExtraction", () => {
  it("returns the fields and the raw text", () => {
    const { fields, rawText } = parseExtraction(modelJson());
    expect(fields.firstName).toBe("Rohan");
    expect(fields.company).toBe("Acme Ltd");
    expect(rawText).toContain("Head of Procurement");
  });

  it("cleans the phone the same way a typed one is cleaned", () => {
    expect(parseExtraction(modelJson({ phone: "Tel: +91 98765-43210" })).fields.phone).toBe(
      "+91 98765-43210",
    );
  });

  it("trims and caps a field to its Salesforce length", () => {
    const fields = parseExtraction(modelJson({ firstName: `  ${"a".repeat(60)}  ` })).fields;
    expect(fields.firstName).toHaveLength(40);
  });

  it("fills in a field the model omitted", () => {
    const partial = JSON.stringify({ firstName: "Rohan", rawText: "Rohan" });
    expect(parseExtraction(partial).fields.lastName).toBe("");
  });

  it("ignores keys that are not part of the contact", () => {
    const withExtra = parseExtraction(modelJson({ confidence: 0.9, notes: "looks like a card" }));
    expect(withExtra.fields).not.toHaveProperty("confidence");
    expect(withExtra.fields.firstName).toBe("Rohan");
  });

  it("treats a missing rawText as empty rather than failing the scan", () => {
    expect(parseExtraction(modelJson({ rawText: undefined })).rawText).toBe("");
    expect(parseExtraction(modelJson({ rawText: 42 })).rawText).toBe("");
  });

  it("rejects an empty response", () => {
    expect(() => parseExtraction("")).toThrow(GeminiError);
    expect(() => parseExtraction("   ")).toThrow(/returned nothing/);
    expect(() => parseExtraction(undefined)).toThrow(/returned nothing/);
  });

  it("rejects output that is not JSON", () => {
    expect(() => parseExtraction("Here is the card:")).toThrow(/did not return JSON/);
  });

  it("rejects JSON that is not an object", () => {
    expect(() => parseExtraction("[]")).toThrow(/JSON object/);
    expect(() => parseExtraction("null")).toThrow(/JSON object/);
    expect(() => parseExtraction('"Rohan"')).toThrow(/JSON object/);
  });

  it("rejects fields of the wrong type instead of coercing them", () => {
    expect(() => parseExtraction(modelJson({ firstName: 12345 }))).toThrow(/wrong shape/);
  });

  it("carries a code that is safe to log", () => {
    try {
      parseExtraction("not json");
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(GeminiError);
      expect((error as GeminiError).code).toBe("bad_json");
    }
  });
});
