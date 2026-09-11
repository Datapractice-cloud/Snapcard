/**
 * Creates the Atlas indexes. Run once per environment:
 *
 *   npm run mongo:indexes
 *
 * Safe to re-run — createIndex is idempotent when the definition matches.
 */
import { leadImagesCollection, leadsCollection, mongoClient } from "../src/lib/mongo";

async function main() {
  const leads = await leadsCollection();
  const images = await leadImagesCollection();

  console.log("leads");
  // The external id. Unique, because every write path upserts on it and two
  // documents for one card would defeat the whole point of the client id.
  await leads.createIndex({ clientId: 1 }, { unique: true, name: "clientId_unique" });
  console.log("  clientId (unique)");

  // The query the sync cron runs every 15 minutes.
  await leads.createIndex(
    { "salesforce.status": 1, "salesforce.nextAttemptAt": 1 },
    { name: "salesforce_retry" },
  );
  console.log("  salesforce.status + salesforce.nextAttemptAt");

  // "This rep's leads, newest first" — the admin view.
  await leads.createIndex({ capturedBy: 1, createdAt: -1 }, { name: "capturedBy_recent" });
  console.log("  capturedBy + createdAt desc");

  // Finding a person again when someone asks "did we scan them?".
  await leads.createIndex({ "fields.email": 1 }, { name: "fields_email" });
  console.log("  fields.email");

  console.log("lead_images");
  await images.createIndex({ clientId: 1, side: 1 }, { unique: true, name: "clientId_side_unique" });
  console.log("  clientId + side (unique)");

  console.log("\nDone.");
}

main()
  .catch((error: unknown) => {
    console.error("Failed:", (error as Error).message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await (await mongoClient()).close();
  });
