import { describe, expect, it } from "vitest";
import { classifyError, describeError, errorCodeOf, findDuplicateId } from "./client";

/*
 * Bodies below are the shapes Salesforce actually returns, kept verbatim so a
 * change in the REST API shows up here rather than at a booth.
 */

const VALIDATION_RULE = [
  {
    message: "Industry is required for event leads",
    errorCode: "FIELD_CUSTOM_VALIDATION_EXCEPTION",
    fields: ["Industry"],
  },
];

const FIELD_SECURITY = [
  {
    message: "Unable to create/update fields: LinkedIn__c.",
    errorCode: "INVALID_FIELD_FOR_INSERT_UPDATE",
    fields: ["LinkedIn__c"],
  },
];

const DUPLICATES_DETECTED = [
  {
    message: "Use one of these records?",
    errorCode: "DUPLICATES_DETECTED",
    duplicateResult: {
      matchResults: [
        {
          matchRecords: [
            { record: { Id: "00Q5g00000AbCdEAAV", Name: "Rohan Deshmukh" } },
            { record: { Id: "00Q5g00000ZzZzZAAV" } },
          ],
        },
      ],
    },
  },
];

const SERVER_BUSY = [{ message: "Server error", errorCode: "UNABLE_TO_LOCK_ROW" }];
const REQUEST_LIMIT = [{ message: "Request limit exceeded", errorCode: "REQUEST_LIMIT_EXCEEDED" }];
const SESSION_EXPIRED = [{ message: "Session expired or invalid", errorCode: "INVALID_SESSION_ID" }];

describe("classifyError", () => {
  it("treats a blocked duplicate as its own outcome, not a failure", () => {
    expect(classifyError(400, DUPLICATES_DETECTED)).toBe("duplicate");
  });

  it("sees a duplicate even on an unexpected status", () => {
    // The rule matters more than the status code it arrived with.
    expect(classifyError(403, DUPLICATES_DETECTED)).toBe("duplicate");
  });

  it("retries what will probably work later", () => {
    expect(classifyError(500, SERVER_BUSY)).toBe("retryable");
    expect(classifyError(503, SERVER_BUSY)).toBe("retryable");
    expect(classifyError(429, REQUEST_LIMIT)).toBe("retryable");
    // 401 here means the retry inside sfFetch already failed.
    expect(classifyError(401, SESSION_EXPIRED)).toBe("retryable");
  });

  it("sends to review what will never work unchanged", () => {
    expect(classifyError(400, VALIDATION_RULE)).toBe("needs_review");
    expect(classifyError(403, FIELD_SECURITY)).toBe("needs_review");
  });

  it("does not retry a bad path forever", () => {
    expect(classifyError(404, [{ errorCode: "NOT_FOUND", message: "The requested resource does not exist" }])).toBe(
      "needs_review",
    );
    expect(classifyError(405, undefined)).toBe("needs_review");
  });

  it("copes with a body that is not the documented array", () => {
    expect(classifyError(500, undefined)).toBe("retryable");
    expect(classifyError(400, "<html>gateway</html>")).toBe("needs_review");
    expect(classifyError(400, { errorCode: "DUPLICATES_DETECTED" })).toBe("duplicate");
    expect(classifyError(400, [null, "junk"])).toBe("needs_review");
  });
});

describe("findDuplicateId", () => {
  it("returns the first matched record", () => {
    expect(findDuplicateId(DUPLICATES_DETECTED)).toBe("00Q5g00000AbCdEAAV");
  });

  it("returns nothing when the rule reported no match records", () => {
    expect(findDuplicateId([{ errorCode: "DUPLICATES_DETECTED" }])).toBeUndefined();
    expect(findDuplicateId([{ errorCode: "DUPLICATES_DETECTED", duplicateResult: { matchResults: [] } }])).toBe(
      undefined,
    );
    expect(findDuplicateId(VALIDATION_RULE)).toBeUndefined();
    expect(findDuplicateId(undefined)).toBeUndefined();
  });
});

describe("describeError", () => {
  it("names the rule that fired, which is what an admin needs", () => {
    expect(describeError(400, VALIDATION_RULE)).toBe(
      "FIELD_CUSTOM_VALIDATION_EXCEPTION: Industry is required for event leads",
    );
  });

  it("falls back to the status when there is no usable body", () => {
    expect(describeError(502, undefined)).toBe("HTTP 502");
    expect(describeError(500, [])).toBe("HTTP 500");
  });

  it("stays short enough to store and show", () => {
    const long = [{ errorCode: "X", message: "y".repeat(2000) }];
    expect(describeError(400, long).length).toBeLessThanOrEqual(500);
  });
});

describe("errorCodeOf", () => {
  it("returns the code, which is the only part safe to log", () => {
    expect(errorCodeOf([{ errorCode: "DUPLICATE_VALUE" }])).toBe("DUPLICATE_VALUE");
  });

  it("never throws on a surprise body", () => {
    expect(errorCodeOf(undefined)).toBe("unknown");
    expect(errorCodeOf("nope")).toBe("unknown");
    expect(errorCodeOf([])).toBe("unknown");
  });
});
