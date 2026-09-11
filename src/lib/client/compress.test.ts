import { describe, expect, it } from "vitest";
import { MAX_EDGE, fitWithin, formatBytes } from "./compress";

describe("fitWithin", () => {
  it("scales a landscape photo down by its long edge", () => {
    // A typical phone shot, 4:3.
    expect(fitWithin(4032, 3024)).toEqual({ width: 1600, height: 1200 });
  });

  it("scales a portrait photo down by its long edge", () => {
    expect(fitWithin(3024, 4032)).toEqual({ width: 1200, height: 1600 });
  });

  it("leaves a photo that already fits alone", () => {
    // Never upscale: enlarging adds bytes and no legibility.
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(MAX_EDGE, 900)).toEqual({ width: MAX_EDGE, height: 900 });
  });

  it("keeps the aspect ratio", () => {
    const { width, height } = fitWithin(6000, 2000);
    // Edges are whole pixels, so the ratio shifts a little; a card stays square.
    expect(width / height).toBeCloseTo(3, 2);
    expect(Math.max(width, height)).toBe(MAX_EDGE);
  });

  it("never returns a zero edge, which would throw on canvas", () => {
    // A panorama: the short edge rounds toward nothing.
    const { width, height } = fitWithin(20000, 5);
    expect(width).toBe(MAX_EDGE);
    expect(height).toBeGreaterThanOrEqual(1);
  });

  it("does not divide by zero on a degenerate image", () => {
    expect(fitWithin(0, 0)).toEqual({ width: 0, height: 0 });
  });

  it("honours a custom max edge", () => {
    expect(fitWithin(4000, 2000, 1000)).toEqual({ width: 1000, height: 500 });
  });
});

describe("formatBytes", () => {
  it("reads the way a rep would expect", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1024)).toBe("1 KB");
    expect(formatBytes(412_000)).toBe("402 KB");
    expect(formatBytes(2_600_000)).toBe("2.5 MB");
  });
});
