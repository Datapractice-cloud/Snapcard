import { describe, expect, it } from "vitest";
import { stepIndex } from "./lightbox-nav";

describe("stepIndex", () => {
  it("moves forward and back through the sides", () => {
    expect(stepIndex(0, 1, 2)).toBe(1);
    expect(stepIndex(1, -1, 2)).toBe(0);
  });

  it("stops at the ends rather than wrapping", () => {
    // Swiping off the back onto the front reads as a glitch, not a carousel.
    expect(stepIndex(1, 1, 2)).toBe(1);
    expect(stepIndex(0, -1, 2)).toBe(0);
  });

  it("goes nowhere when the card has only one side", () => {
    expect(stepIndex(0, 1, 1)).toBe(0);
    expect(stepIndex(0, -1, 1)).toBe(0);
  });

  it("survives an empty list rather than returning -1", () => {
    expect(stepIndex(0, 1, 0)).toBe(0);
    expect(stepIndex(0, -1, 0)).toBe(0);
  });

  it("clamps a jump larger than the list", () => {
    expect(stepIndex(0, 5, 2)).toBe(1);
    expect(stepIndex(1, -5, 2)).toBe(0);
  });
});
