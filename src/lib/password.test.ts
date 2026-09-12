import { describe, expect, it } from "vitest";
import { MIN_PASSWORD_LENGTH, hashPassword, passwordProblem, suggestPassword, verifyPassword } from "./password";

// scrypt at the configured work factor takes a moment on purpose.
const SLOW = 30_000;

describe("hashPassword", () => {
  it("never stores the password", { timeout: SLOW }, async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(hash).not.toContain("correct");
    expect(hash).not.toContain("staple");
  });

  it("carries its parameters, so they can change without breaking old hashes", { timeout: SLOW }, async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(hash.split("$")).toHaveLength(6);
  });

  it("salts, so the same password twice gives different hashes", { timeout: SLOW }, async () => {
    const a = await hashPassword("correct horse battery staple");
    const b = await hashPassword("correct horse battery staple");
    expect(a).not.toBe(b);
  });
});

describe("verifyPassword", () => {
  it("accepts the right password", { timeout: SLOW }, async () => {
    const hash = await hashPassword("correct horse battery staple");
    await expect(verifyPassword("correct horse battery staple", hash)).resolves.toBe(true);
  });

  it("rejects a wrong password", { timeout: SLOW }, async () => {
    const hash = await hashPassword("correct horse battery staple");
    await expect(verifyPassword("Correct horse battery staple", hash)).resolves.toBe(false);
    await expect(verifyPassword("", hash)).resolves.toBe(false);
  });

  it("treats equivalent unicode as the same password", { timeout: SLOW }, async () => {
    // "é" composed vs decomposed: the same characters to a person typing them.
    const hash = await hashPassword("café password long");
    await expect(verifyPassword("café password long", hash)).resolves.toBe(true);
  });

  it("returns false rather than throwing on a malformed hash", { timeout: SLOW }, async () => {
    for (const bad of ["", "not-a-hash", "scrypt$1$2$3", "bcrypt$1$8$1$aaaa$bbbb", "scrypt$x$8$1$YQ==$Yg=="]) {
      await expect(verifyPassword("anything at all", bad)).resolves.toBe(false);
    }
  });
});

describe("passwordProblem", () => {
  it("requires length rather than punctuation", () => {
    expect(passwordProblem("a".repeat(MIN_PASSWORD_LENGTH))).toBeNull();
    // Long and memorable beats short and gnarly.
    expect(passwordProblem("correct horse battery staple")).toBeNull();
  });

  it("rejects a short password", () => {
    expect(passwordProblem("short")).toMatch(/at least 12/);
    expect(passwordProblem("a".repeat(MIN_PASSWORD_LENGTH - 1))).toMatch(/at least 12/);
  });

  it("rejects whitespace and absurd lengths", () => {
    expect(passwordProblem(" ".repeat(20))).toMatch(/only spaces/);
    expect(passwordProblem("a".repeat(201))).toMatch(/too long/);
  });
});

describe("suggestPassword", () => {
  it("is long enough to pass the rule it has to satisfy", () => {
    expect(passwordProblem(suggestPassword())).toBeNull();
  });

  it("is different every time", () => {
    const seen = new Set(Array.from({ length: 50 }, () => suggestPassword()));
    expect(seen.size).toBe(50);
  });
});
