import { describe, expect, it } from "vitest";
import { parseEnv } from "./env";

const complete = {
  AUTH_SECRET: "s",
  AUTH_GOOGLE_ID: "id",
  AUTH_GOOGLE_SECRET: "secret",
  ADMIN_EMAILS: "A@thinkvibes.com, b@thinkvibes.com",
  NEXT_PUBLIC_APP_URL: "https://scan.thinkvibes.com",
  GEMINI_API_KEY: "k",
  SF_LOGIN_URL: "https://acme.my.salesforce.com/",
  SF_CLIENT_ID: "ci",
  SF_CLIENT_SECRET: "cs",
};

describe("parseEnv", () => {
  it("accepts a complete environment and applies defaults", () => {
    const env = parseEnv(complete);
    expect(env.ALLOWED_EMAIL_DOMAIN).toBe("thinkvibes.com");
    expect(env.GEMINI_MODEL).toBe("gemini-3.5-flash");
    expect(env.SF_API_VERSION).toBe("v60.0");
    expect(env.MONGODB_DB).toBe("snapcard");
  });

  it("leaves the Phase 2 variables unset", () => {
    const env = parseEnv(complete);
    expect(env.SYNC_SECRET).toBeUndefined();
    expect(env.MONGODB_URI).toBeUndefined();
  });

  it("treats an empty value as unset so defaults still apply", () => {
    const env = parseEnv({ ...complete, SYNC_SECRET: "", MONGODB_URI: "  ", GEMINI_MODEL: "" });
    expect(env.SYNC_SECRET).toBeUndefined();
    expect(env.MONGODB_URI).toBeUndefined();
    expect(env.GEMINI_MODEL).toBe("gemini-3.5-flash");
  });

  it("defaults AUTH_TRUST_HOST on, because the app runs behind a proxy", () => {
    expect(parseEnv(complete).AUTH_TRUST_HOST).toBe(true);
    expect(parseEnv({ ...complete, AUTH_TRUST_HOST: "false" }).AUTH_TRUST_HOST).toBe(false);
  });

  it("rejects an AUTH_TRUST_HOST that is not true or false", () => {
    expect(() => parseEnv({ ...complete, AUTH_TRUST_HOST: "yes" })).toThrow(/AUTH_TRUST_HOST/);
  });

  it("splits and lowercases ADMIN_EMAILS", () => {
    expect(parseEnv(complete).ADMIN_EMAILS).toEqual(["a@thinkvibes.com", "b@thinkvibes.com"]);
  });

  it("strips a trailing slash from SF_LOGIN_URL", () => {
    expect(parseEnv(complete).SF_LOGIN_URL).toBe("https://acme.my.salesforce.com");
  });

  it("names every missing variable in one error", () => {
    const { AUTH_SECRET: _a, SF_CLIENT_ID: _b, ...missing } = complete;
    expect(() => parseEnv(missing)).toThrow(/AUTH_SECRET/);
    expect(() => parseEnv(missing)).toThrow(/SF_CLIENT_ID/);
  });

  it("rejects a malformed URL with a readable message", () => {
    expect(() => parseEnv({ ...complete, SF_LOGIN_URL: "acme.my.salesforce.com" })).toThrow(
      /SF_LOGIN_URL must be the org My Domain URL/,
    );
  });

  it("rejects a malformed API version", () => {
    expect(() => parseEnv({ ...complete, SF_API_VERSION: "60" })).toThrow(/v60\.0/);
  });
});
