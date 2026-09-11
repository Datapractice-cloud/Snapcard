import { describe, expect, it } from "vitest";
import { initialsFor } from "./initials";

describe("initialsFor", () => {
  it("uses the first and last word of a name", () => {
    expect(initialsFor("Vaibhav Parmar")).toBe("VP");
    expect(initialsFor("Ana Maria de Souza")).toBe("AS");
  });

  it("falls back to two letters of a single name", () => {
    expect(initialsFor("Prince")).toBe("PR");
  });

  it("falls back to the email local part when there is no name", () => {
    expect(initialsFor(null, "rep@thinkvibes.com")).toBe("RE");
    expect(initialsFor("   ", "boss@thinkvibes.com")).toBe("BO");
  });

  it("never returns an empty string", () => {
    expect(initialsFor()).toBe("??");
  });
});
