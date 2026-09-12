import { describe, expect, it, vi } from "vitest";
import { leadSubmitSchema } from "../schemas";
import { saveLeadSafely } from "./index";
import { noopBackupStore } from "./noop";
import type { BackupStore } from "./types";

const PNG_PIXEL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const submit = leadSubmitSchema.parse({
  clientId: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
  fields: { firstName: "Rohan", lastName: "Deshmukh", email: "rohan@acme.com" },
  rawText: "ACME LTD",
  images: [{ side: "front", dataUrl: PNG_PIXEL }],
});

const input = { submit, capturedBy: "rep@thinkvibes.com", salesforce: { status: "synced" as const } };

function storeThatThrows(error: unknown): BackupStore {
  return {
    saveLead: () => {
      throw error;
    },
    saveImages: async () => {},
  };
}

function storeThatRejects(error: unknown): BackupStore {
  return {
    saveLead: () => Promise.reject(error),
    saveImages: async () => {},
  };
}

describe("saveLeadSafely", () => {
  it("passes a working store's answer straight through", async () => {
    await expect(saveLeadSafely(noopBackupStore, input)).resolves.toEqual({ status: "skipped" });
  });

  it("turns a synchronous throw into a failed backup", async () => {
    // Salesforce already has the lead. A broken mirror must not be able to
    // make the rep think it does not.
    await expect(saveLeadSafely(storeThatThrows(new Error("Atlas is down")), input)).resolves.toEqual({
      status: "failed",
    });
  });

  it("turns a rejected promise into a failed backup", async () => {
    await expect(saveLeadSafely(storeThatRejects(new Error("timeout")), input)).resolves.toEqual({
      status: "failed",
    });
  });

  it("survives a store that throws something that is not an Error", async () => {
    await expect(saveLeadSafely(storeThatThrows("boom"), input)).resolves.toEqual({ status: "failed" });
    await expect(saveLeadSafely(storeThatRejects(undefined), input)).resolves.toEqual({ status: "failed" });
  });

  it("never rethrows, whatever the Salesforce outcome was", async () => {
    for (const status of ["synced", "duplicate", "failed", "needs_review"] as const) {
      await expect(
        saveLeadSafely(storeThatThrows(new Error("nope")), { ...input, salesforce: { status } }),
      ).resolves.toEqual({ status: "failed" });
    }
  });

  it("hands the store exactly what it was given", async () => {
    const saveLead = vi.fn().mockResolvedValue({ status: "saved" });
    const spy: BackupStore = { saveLead, saveImages: async () => {} };

    await saveLeadSafely(spy, input);

    expect(saveLead).toHaveBeenCalledWith(input);
  });
});
