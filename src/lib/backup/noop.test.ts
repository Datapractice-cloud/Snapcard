import { describe, expect, it } from "vitest";
import { leadSubmitSchema } from "../schemas";
import { noopBackupStore } from "./noop";

const PNG_PIXEL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const submit = leadSubmitSchema.parse({
  clientId: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
  fields: { firstName: "Rohan", lastName: "Deshmukh", email: "rohan@acme.com" },
  rawText: "ACME LTD",
  consent: { given: true },
  images: [{ side: "front", dataUrl: PNG_PIXEL }],
});

describe("noopBackupStore", () => {
  it("reports skipped, not saved — nothing was written", async () => {
    // The distinction matters: Phase 2 needs `failed` to mean a real backup
    // failure, which it cannot if Phase 1 claims success.
    await expect(
      noopBackupStore.saveLead({ submit, capturedBy: "rep@thinkvibes.com", salesforce: { status: "synced" } }),
    ).resolves.toEqual({ status: "skipped" });
  });

  it("reports skipped whatever Salesforce did", async () => {
    for (const status of ["synced", "duplicate", "failed", "needs_review"] as const) {
      await expect(
        noopBackupStore.saveLead({ submit, capturedBy: "rep@thinkvibes.com", salesforce: { status } }),
      ).resolves.toEqual({ status: "skipped" });
    }
  });

  it("accepts images without doing anything", async () => {
    await expect(noopBackupStore.saveImages(submit.clientId, submit.images)).resolves.toBeUndefined();
  });

  it("never throws, so it cannot disturb the Salesforce result", async () => {
    // Called with nonsense on purpose: the save flow must not be able to fail
    // because of the backup.
    await expect(
      noopBackupStore.saveImages("", [] as unknown as (typeof submit)["images"]),
    ).resolves.toBeUndefined();
  });
});
