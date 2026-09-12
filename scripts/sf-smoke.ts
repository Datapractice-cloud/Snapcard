/**
 * Proves the Salesforce side of SETUP.md §2 really works, against a real org.
 *
 *   npm run sf:smoke            upsert the same clientId twice, expect one Lead, delete it
 *   npm run sf:smoke -- --full  also attach a card image
 *
 * `--full` is opt-in because it leaves a file in the org's Files: deleting the
 * Lead removes the link, not the uploaded ContentDocument.
 *
 * Run this against a sandbox before production, and before every event.
 */
import { randomUUID } from "node:crypto";
import { sfFetch } from "../src/lib/salesforce/client";
import { attachImage, checkLeadFieldAccess, upsertLead } from "../src/lib/salesforce/lead";
import { leadSubmitSchema } from "../src/lib/schemas";

const full = process.argv.includes("--full");

// A 1x1 PNG. Small enough not to matter, real enough for ContentVersion.
const PIXEL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const clientId = randomUUID();

const submit = leadSubmitSchema.parse({
  clientId,
  fields: {
    firstName: "SnapCard",
    lastName: `Smoke ${new Date().toISOString().slice(0, 16)}`,
    company: "SnapCard Smoke Test",
    title: "Delete me",
    email: `smoke+${clientId.slice(0, 8)}@example.invalid`,
    phone: "+1 (415) 555-0134",
  },
  rawText: "SnapCard smoke test — safe to delete",
  images: [{ side: "front", dataUrl: PIXEL }],
});

function step(message: string) {
  console.log(`\n— ${message}`);
}

async function deleteLead(leadId: string) {
  const response = await sfFetch(`/sobjects/Lead/${leadId}`, { method: "DELETE" });
  if (!response.ok && response.status !== 404) {
    throw new Error(`Delete failed with ${response.status}. Remove Lead ${leadId} by hand.`);
  }
}

async function main() {
  console.log(`clientId: ${clientId}`);

  /*
   * Checked first, because a field the integration user cannot see fails the
   * upsert with NOT_FOUND or INVALID_FIELD and no hint as to which field or
   * why. Describe respects field-level security, so "missing" here means
   * either the field was never created or the profile hides it — both are
   * fixed in Setup, and both are worth knowing before an event rather than
   * during one.
   */
  step("Field access (SETUP.md §2)");
  const access = await checkLeadFieldAccess();
  const blocked = access.filter((field) => field.missing || !field.writable);

  for (const field of access) {
    const state = field.missing ? "MISSING or hidden" : field.writable ? "ok" : "read only";
    console.log(`  ${field.name.padEnd(24)} ${state}`);
  }

  if (blocked.length > 0) {
    const names = blocked.map((field) => field.name).join(", ");
    throw new Error(
      [
        `The integration user cannot write ${blocked.length} field(s): ${names}.`,
        "  Create SnapCard_Client_Id__c if it is absent, then give the integration user's",
        "  profile or permission set field-level access to every field listed above.",
      ].join("\n"),
    );
  }

  step("First upsert (expect a new Lead)");
  const first = await upsertLead(submit);
  console.log(`  status: ${first.status}  leadId: ${first.leadId ?? "-"}  ${first.error ?? ""}`);

  if (first.status !== "synced" || !first.leadId) {
    throw new Error(`Expected "synced" with an Id, got "${first.status}". ${first.error ?? ""}`);
  }

  step("Second upsert, same clientId (expect the same Lead, not a new one)");
  const second = await upsertLead(submit);
  console.log(`  status: ${second.status}  leadId: ${second.leadId ?? "-"}  ${second.error ?? ""}`);

  if (second.leadId !== first.leadId) {
    throw new Error(
      `The external id did not de-duplicate: ${first.leadId} then ${second.leadId}. ` +
        "Check that SnapCard_Client_Id__c is marked External ID and Unique.",
    );
  }
  console.log(`  same Id both times: ${first.leadId}`);

  if (full) {
    step("Attach a card image (ContentVersion)");
    try {
      await attachImage(first.leadId, "front", PIXEL);
      console.log("  attached");
    } catch (error) {
      console.warn(`  FAILED: ${(error as Error).message}`);
      console.warn("  The integration user needs Create on ContentVersion.");
    }
  }

  step("Clean up");
  await deleteLead(first.leadId);
  console.log(`  deleted Lead ${first.leadId}`);
  if (full) {
    console.log("  note: the uploaded file stays in Files; remove it there if you care.");
  }

  console.log("\nSalesforce smoke test passed.");
}

main().catch((error: unknown) => {
  console.error(`\nSalesforce smoke test FAILED:\n  ${(error as Error).message}`);
  process.exitCode = 1;
});
