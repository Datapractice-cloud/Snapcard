# Phase 2 — MongoDB Atlas live backup

Start only after Phase 1 passes the field test. Salesforce stays first;
nothing in this phase may add latency or failure to the Salesforce write.

Prerequisite: Atlas free cluster, database user limited to `snapcard`
readWrite, network access set (see SETUP.md §4), `MONGODB_URI` and
`SYNC_SECRET` added in hPanel.

---

## Task 1 — Mongo client and `MongoBackupStore`

`src/lib/mongo.ts`: singleton `MongoClient` cached on `globalThis` (the
Hostinger process is long-lived; avoid a new pool per request).
`serverSelectionTimeoutMS: 3000`, `maxPoolSize: 10`.

Collections and indexes (create in `scripts/mongo-indexes.ts`, run once):

```
leads        { clientId: 1 } unique
             { "salesforce.status": 1, "salesforce.nextAttemptAt": 1 }
             { capturedBy: 1, createdAt: -1 }
             { "fields.email": 1 }
lead_images  { clientId: 1, side: 1 } unique
```

Document shape (see CLAUDE.md for `LeadSubmit`/`SalesforceResult`):

```ts
leads: { clientId, capturedBy, fields, rawText,
         consent: { given, at },
         salesforce: { status, leadId?, duplicateOf?, attempts, lastError?, nextAttemptAt?, syncedAt?, claimedUntil? },
         backup: { source: "live" | "phone-retry" | "reconciled", savedAt },
         createdAt, updatedAt }
lead_images: { clientId, side, mimeType, sizeBytes, data: Binary, createdAt }
```

`src/lib/backup/mongo.ts` implements `BackupStore`:

- `saveLead`: upsert on `clientId` with `$setOnInsert` for createdAt and
  `$set` for everything else. If `salesforce.status === "failed"`, set
  `attempts: 1`, `nextAttemptAt: now + 30s`. Return `{ status: "saved" }`.
- `saveImages`: `bulkWrite` upserts, ordered false. Images arrive as data
  URLs; decode to `Binary`. Reject anything over 1 MB after decode.

`getBackupStore()` now returns the Mongo store when `MONGODB_URI` is set.

## Task 2 — Wire into `/api/leads` without touching the Salesforce path

Change step 3 of the Phase 1 route:

```ts
const [salesforce, imagesResult] = await Promise.all([
  upsertLead(submit, session),                        // priority path, unchanged
  backup.saveImages(submit.clientId, submit.images).then(() => "ok", () => "failed"),
]);
let backupResult: BackupResult;
try { backupResult = await backup.saveLead({ submit, capturedBy, salesforce }); }
catch { backupResult = { status: "failed" }; }
```

Rules: `saveImages` runs concurrently because it doesn't depend on
Salesforce; `saveLead` runs after because it records the Salesforce
result. Both are fully isolated with try/catch. Add a test that a throwing
`BackupStore` still yields `salesforce.status: "synced"` in the response.

## Task 3 — `POST /api/leads/backup`

For the phone's `backupOnly` retry (Salesforce succeeded, Atlas failed).
Body: `LeadSubmit` + `salesforce: SalesforceResult`. Calls `saveImages`
then `saveLead` with `backup.source: "phone-retry"`. **Never** calls
Salesforce. Returns `{ backup }`.

Update the outbox: on `backupOnly` items, call this route instead of
`/api/leads`; delete on `saved`.

## Task 4 — `POST /api/sync` (server-side Salesforce retry)

Auth: header `Authorization: Bearer ${SYNC_SECRET}`, else 401.

1. Find up to 25 leads where `salesforce.status = "failed"`,
   `attempts < 5`, `nextAttemptAt <= now`, and (`claimedUntil` missing or
   `< now`).
2. For each, **claim atomically**:
   `findOneAndUpdate({ clientId, salesforce.status: "failed", claimedUntil: {$lt: now} | missing }, { $set: { "salesforce.claimedUntil": now + 60s } })`.
   Skip if the claim returns null (someone else has it).
3. Rebuild `LeadSubmit` from the doc (images from `lead_images`), call
   `upsertLead`. On `synced`/`duplicate`: set status, leadId, syncedAt,
   unset claimedUntil; then `attachImage` inline (we're in a cron, no need
   for `after()`). On `retryable`: attempts+1,
   `nextAttemptAt = now + min(15m, 30s * 2^attempts)`, lastError. On
   `needs_review`: set status `needs_review`.
4. Respond `{ processed, synced, failed, needsReview }`.

`.github/workflows/sync.yml`: `schedule: "*/15 * * * *"` + `workflow_dispatch`,
one step `curl -fsS -X POST -H "Authorization: Bearer ${{ secrets.SYNC_SECRET }}" ${{ secrets.APP_URL }}/api/sync`.

Add the same atomic claim to the live path? Not needed: the live path only
upserts leads that don't exist in Atlas yet; the cron only touches
`failed` ones. Document this in a comment.

## Task 5 — `POST /api/reconcile` (Salesforce → Atlas backfill)

Auth: same `SYNC_SECRET`.

1. SOQL: `SELECT Id, SnapCard_Client_Id__c, FirstName, LastName, Company, Title, Email, Phone, Website, Street, City, State, PostalCode, Country, Description, CreatedDate FROM Lead WHERE SnapCard_Client_Id__c != null AND CreatedDate = LAST_N_DAYS:7` (paginate with `nextRecordsUrl`).
2. For each record whose `SnapCard_Client_Id__c` is not in `leads`, insert
   a doc with `salesforce.status: "synced"`, `backup.source: "reconciled"`.
   Salesforce has no capturing rep or consent record, so leave `capturedBy`
   and `consent` unset on a backfilled doc — a reconciled lead is a Salesforce
   record we are mirroring, not a capture we witnessed.
3. For those, also fetch attached files:
   `SELECT ContentDocumentId FROM ContentDocumentLink WHERE LinkedEntityId = :Id`,
   then `ContentVersion.VersionData` for the latest version, and insert into
   `lead_images` (side from the file title).
4. Respond `{ scanned, backfilled, imagesBackfilled }`.

`.github/workflows/reconcile.yml`: hourly. Running this once after Phase 2
deploys backfills every Phase 1 lead.

## Task 6 — Admin additions

- Lead list now comes from Atlas (fast, includes `needs_review` and
  `failed`), with a filter by status and a "Retry now" button per lead that
  calls a new admin-only `POST /api/leads/[clientId]/retry` (same logic as
  one cron iteration, bypassing `nextAttemptAt`).
- Storage meter: `db.stats()` → `dataSize + indexSize` vs 512 MB; warn at
  80 %.
- CSV export from Atlas.
- Image viewer: `GET /api/images/[clientId]/[side]` streams the BinData with
  `Content-Type` and `Cache-Control: private, no-store`. Session required;
  reps may only fetch their own.

## Task 7 — Tests to add

- `nextAction()` outbox reducer now covers all rows including `backupOnly`.
- `/api/leads` with a failing BackupStore keeps Salesforce result.
- Sync route: claimed lead is skipped; retryable increments attempts with
  correct backoff; needs_review stops retrying.
- Reconcile: inserts only missing clientIds.

## Task 8 — Field test (manual)

- Block Atlas (wrong password in env) → leads still reach Salesforce, phone
  shows "Backed up: retrying", fix env, outbox drains via `/api/leads/backup`.
- Block Salesforce (wrong client secret) → leads land in Atlas as `failed`,
  fix secret, run the sync workflow manually, all become `synced` with no
  duplicates.
- Delete one Atlas doc, run reconcile, confirm it comes back with its image.
