/**
 * Proves the Salesforce side of SETUP.md §2 really works, against a real org.
 *
 *   npm run sf:smoke          upsert the same clientId twice, expect one Lead, delete it
 *   npm run sf:smoke -- --full  also attach a card image and add it to the Campaign
 *
 * `--full` is opt-in because it leaves a file in the org's Files: deleting the
 * Lead removes the link, not the uploaded ContentDocument.
 *
 * Run this against a sandbox before production, and before every event.
 */
import { randomUUID } from "node:crypto";
import { sfFetch } from "../src/lib/salesforce/client";
import { addToCampaign, attachImage, upsertLead } from "../src/lib/salesforce/lead";
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
  consent: { given: true },
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

  step("First upsert (expect a new Lead)");
  const first = await upsertLead(submit, "smoke@thinkvibes.com");
  console.log(`  status: ${first.status}  leadId: ${first.leadId ?? "-"}  ${first.error ?? ""}`);

  if (first.status !== "synced" || !first.leadId) {
    throw new Error(`Expected "synced" with an Id, got "${first.status}". ${first.error ?? ""}`);
  }

  step("Second upsert, same clientId (expect the same Lead, not a new one)");
  const second = await upsertLead(submit, "smoke@thinkvibes.com");
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

    step("Add to the event Campaign (CampaignMember)");
    try {
      await addToCampaign(first.leadId);
      console.log("  added");
      await addToCampaign(first.leadId);
      console.log("  adding twice is not an error");
    } catch (error) {
      console.warn(`  FAILED: ${(error as Error).message}`);
      console.warn("  Check SF_CAMPAIGN_ID, Create on CampaignMember, and the 'Responded' status.");
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
