import { describe, expect, it } from "vitest";
import { isAdmin, isAllowedProfile, parseAdminEmails, roleFor } from "./auth-rules";

const DOMAIN = "thinkvibes.com";
const valid = { email: "rep@thinkvibes.com", email_verified: true, hd: "thinkvibes.com" };

describe("isAllowedProfile", () => {
  it("accepts a verified Workspace account", () => {
    expect(isAllowedProfile(valid, DOMAIN)).toBe(true);
  });

  it("is case-insensitive about the email and hd", () => {
    expect(isAllowedProfile({ ...valid, email: "Rep@ThinkVibes.com", hd: "ThinkVibes.com" }, DOMAIN)).toBe(true);
  });

  it("rejects a personal account, which has no hd", () => {
    expect(isAllowedProfile({ email: "rep@gmail.com", email_verified: true }, DOMAIN)).toBe(false);
  });

  it("rejects an unverified email", () => {
    expect(isAllowedProfile({ ...valid, email_verified: false }, DOMAIN)).toBe(false);
    expect(isAllowedProfile({ ...valid, email_verified: undefined }, DOMAIN)).toBe(false);
    // Some providers send the string "true".
    expect(isAllowedProfile({ ...valid, email_verified: "true" }, DOMAIN)).toBe(false);
  });

  it("rejects a spoofed hd that does not match the email", () => {
    expect(isAllowedProfile({ ...valid, email: "attacker@evil.com" }, DOMAIN)).toBe(false);
  });

  it("rejects the right email under the wrong Workspace", () => {
    expect(isAllowedProfile({ ...valid, hd: "evil.com" }, DOMAIN)).toBe(false);
  });

  it("rejects a lookalike domain suffix", () => {
    expect(isAllowedProfile({ email: "x@notthinkvibes.com", email_verified: true, hd: DOMAIN }, DOMAIN)).toBe(false);
  });

  it("rejects a missing profile or an empty allowed domain", () => {
    expect(isAllowedProfile(null, DOMAIN)).toBe(false);
    expect(isAllowedProfile(undefined, DOMAIN)).toBe(false);
    expect(isAllowedProfile(valid, "")).toBe(false);
  });
});

describe("isAdmin / roleFor", () => {
  const admins = ["boss@thinkvibes.com", "ops@thinkvibes.com"];

  it("matches a listed email regardless of case or padding", () => {
    expect(isAdmin("Boss@thinkvibes.com", admins)).toBe(true);
    expect(isAdmin("  ops@thinkvibes.com ", admins)).toBe(true);
  });

  it("does not match an unlisted email", () => {
    expect(isAdmin("rep@thinkvibes.com", admins)).toBe(false);
  });

  it("treats a missing email and an empty list as not admin", () => {
    expect(isAdmin(null, admins)).toBe(false);
    expect(isAdmin(undefined, admins)).toBe(false);
    expect(isAdmin("boss@thinkvibes.com", [])).toBe(false);
  });

  it("maps to a role", () => {
    expect(roleFor("boss@thinkvibes.com", admins)).toBe("admin");
    expect(roleFor("rep@thinkvibes.com", admins)).toBe("rep");
  });
});

describe("parseAdminEmails", () => {
  it("splits, trims and lowercases the environment string", () => {
    expect(parseAdminEmails("Boss@thinkvibes.com, OPS@thinkvibes.com ")).toEqual([
      "boss@thinkvibes.com",
      "ops@thinkvibes.com",
    ]);
  });

  it("reads an unset or empty variable as nobody", () => {
    expect(parseAdminEmails(undefined)).toEqual([]);
    expect(parseAdminEmails(null)).toEqual([]);
    expect(parseAdminEmails("")).toEqual([]);
    expect(parseAdminEmails("  ,  ,")).toEqual([]);
  });

  /*
   * The regression this whole module exists to prevent: middleware parses
   * process.env directly and env.ts parses through zod. If those two ever
   * disagree, the admin gate and the admin nav disagree with them.
   */
  it("feeds roleFor the same answer the server computes", () => {
    const raw = "Boss@thinkvibes.com,ops@thinkvibes.com";
    expect(roleFor("boss@thinkvibes.com", parseAdminEmails(raw))).toBe("admin");
    expect(roleFor("rep@thinkvibes.com", parseAdminEmails(raw))).toBe("rep");
  });
});
