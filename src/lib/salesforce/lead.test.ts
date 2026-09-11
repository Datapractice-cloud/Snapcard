import { describe, expect, it } from "vitest";
import { leadSubmitSchema, type LeadSubmit } from "../schemas";
import { mapFields, parseDataUrl } from "./lead";

const CLIENT_ID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";

const PNG_PIXEL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

/** Built through the real schema so the mapper sees exactly what the route will. */
function submitWith(fields: Record<string, string>): LeadSubmit {
  return leadSubmitSchema.parse({
    clientId: CLIENT_ID,
    fields: { firstName: "Rohan", lastName: "Deshmukh", email: "rohan@acme.com", ...fields },
    rawText: "ACME LTD\nRohan Deshmukh",
    consent: { given: true },
    images: [{ side: "front", dataUrl: PNG_PIXEL }],
  });
}

describe("mapFields", () => {
  it("produces the Salesforce field names from the contract", () => {
    const record = mapFields(submitWith({ company: "Acme Ltd", title: "Head of Procurement" }));

    expect(record).toMatchObject({
      FirstName: "Rohan",
      LastName: "Deshmukh",
      Company: "Acme Ltd",
      Title: "Head of Procurement",
      Email: "rohan@acme.com",
      LeadSource: "Event",
    });
  });

  it("stamps the external id, which is what makes the write an upsert", () => {
    expect(mapFields(submitWith({})).SnapCard_Client_Id__c).toBe(CLIENT_ID);
  });

  it("puts the OCR text in Description so an admin can check a wrong field", () => {
    expect(mapFields(submitWith({})).Description).toContain("ACME LTD");
  });

  it("maps the address into its separate Salesforce fields", () => {
    const record = mapFields(
      submitWith({
        street: "12 MG Road",
        city: "Pune",
        state: "MH",
        postalCode: "411001",
        country: "India",
      }),
    );
    expect(record).toMatchObject({
      Street: "12 MG Road",
      City: "Pune",
      State: "MH",
      PostalCode: "411001",
      Country: "India",
    });
  });

  it("maps the company website", () => {
    expect(mapFields(submitWith({ website: "acme.com" })).Website).toBe("acme.com");
  });

  it("omits empty fields rather than sending blanks", () => {
    // Sending "" would wipe a value already on the record when the same card is
    // upserted a second time.
    const record = mapFields(submitWith({ title: "", website: "", phone: "" }));
    expect(record).not.toHaveProperty("Title");
    expect(record).not.toHaveProperty("Website");
    expect(record).not.toHaveProperty("Phone");
  });

  it("still sends the company fallback, because Salesforce requires Company", () => {
    expect(mapFields(submitWith({ company: "" })).Company).toBe("[Not provided]");
  });

  it("writes only the fields the contract lists", () => {
    // A field the org does not have would fail every lead with
    // INVALID_FIELD_FOR_INSERT_UPDATE, so the set is pinned here.
    const record = mapFields(
      submitWith({
        company: "Acme Ltd",
        title: "Head of Procurement",
        phone: "+1 (415) 555-0134",
        website: "acme.com",
        linkedin: "https://linkedin.com/in/rohan",
        street: "12 MG Road",
        city: "Pune",
        state: "MH",
        postalCode: "411001",
        country: "India",
      }),
    );

    expect(Object.keys(record).sort()).toEqual([
      "City",
      "Company",
      "Country",
      "Description",
      "Email",
      "FirstName",
      "LastName",
      "LeadSource",
      "Phone",
      "PostalCode",
      "SnapCard_Client_Id__c",
      "State",
      "Street",
      "Title",
      "Website",
    ]);
  });

  it("does not send a LinkedIn URL, consent, the rep or the event", () => {
    const record = mapFields(submitWith({ linkedin: "https://linkedin.com/in/rohan" }));
    expect(record).not.toHaveProperty("LinkedIn__c");
    expect(record).not.toHaveProperty("SnapCard_Consent_At__c");
    expect(record).not.toHaveProperty("SnapCard_Consent_Version__c");
    expect(record).not.toHaveProperty("SnapCard_Captured_By__c");
    expect(record).not.toHaveProperty("SnapCard_Event__c");
  });

  it("sends only strings, so nothing needs coercing on the wire", () => {
    const record = mapFields(submitWith({ company: "Acme Ltd" }));
    expect(Object.values(record).every((value) => typeof value === "string")).toBe(true);
  });
});

describe("parseDataUrl", () => {
  it("splits the mime type from the payload", () => {
    const parsed = parseDataUrl(PNG_PIXEL);
    expect(parsed?.mimeType).toBe("image/png");
    expect(parsed?.base64.startsWith("iVBORw0KGgo")).toBe(true);
  });

  it("handles a jpeg", () => {
    expect(parseDataUrl("data:image/jpeg;base64,/9j/4AAQ")?.mimeType).toBe("image/jpeg");
  });

  it("returns nothing for anything that is not a base64 data URL", () => {
    expect(parseDataUrl("https://example.test/card.jpg")).toBeUndefined();
    expect(parseDataUrl("data:image/png,notbase64")).toBeUndefined();
    expect(parseDataUrl("")).toBeUndefined();
  });
});
