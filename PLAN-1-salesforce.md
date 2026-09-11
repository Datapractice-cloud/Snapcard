# Phase 1 — Salesforce-only SnapCard

Give Claude Code one task at a time, in order. Each task ends with a commit.
Before starting, make sure `CLAUDE.md` is in the repo root and the values in
SETUP.md §1–2 (Google OAuth, Salesforce app + fields) exist, otherwise tasks
5 and 7 cannot be tested.

Suggested opening prompt for each session:

> Read CLAUDE.md, then do Task N from PLAN-1-salesforce.md. Stop and ask if
> anything in the task conflicts with CLAUDE.md.

---

## Task 1 — Scaffold

Create the Next.js 15 app with TypeScript, Tailwind, ESLint, `src/` dir, App
Router. Add shadcn/ui (button, input, textarea, checkbox, card, badge, sheet,
toast). Add vitest, `@t3-oss/env-nextjs` or a hand-rolled zod `src/lib/env.ts`.
Add scripts: `dev`, `build`, `start`, `lint`, `typecheck`, `test`.
Create `.env.example` with every variable from CLAUDE.md. Add `.gitignore`
for `.env*.local`, `node_modules`, `.next`.

Done when: `npm run build` succeeds with an empty `.env.local` that has only
placeholder values; `env.ts` throws a clear message when a variable is missing.

## Task 2 — Auth (Google, thinkvibes.com only)

Install `next-auth@beta`. In `src/lib/auth.ts`:

- Google provider with `authorization: { params: { hd: "thinkvibes.com", prompt: "select_account" } }`.
- `signIn` callback returns `false` unless
  `profile.email_verified === true` **and** `profile.hd === env.ALLOWED_EMAIL_DOMAIN`
  **and** `profile.email.endsWith("@" + env.ALLOWED_EMAIL_DOMAIN)`.
  (Check both — `hd` alone can be spoofed by some flows; email alone is
  not enough because `hd` proves the Workspace account.)
- `jwt` callback adds `role: "admin" | "rep"` from `ADMIN_EMAILS`.
- `session.strategy = "jwt"`, `maxAge = 30 days`.
- Export `auth`, `signIn`, `signOut`, and a `requireSession()` helper for
  route handlers that returns 401 JSON when absent, and `requireAdmin()`.

Add `src/middleware.ts` protecting everything except `/login`, `/api/auth`,
`/manifest.webmanifest`, `/sw.js`, `/icons/*`.
Build `/login` with one "Continue with Google" button and an error state that
says "Use your thinkvibes.com Google account".

Done when: a non-thinkvibes Google account is rejected with the error page;
a thinkvibes account lands on `/scan`; `ADMIN_EMAILS` user sees `/admin`.

## Task 3 — Shared schemas

`src/lib/schemas.ts`:

```ts
LeadFields = { firstName, lastName, company, title, email, phone, website,
               linkedin, street, city, state, postalCode, country }  // all strings, default ""
LeadSubmit = { clientId: uuid, fields: LeadFields, rawText: string,
               consent: { given: literal(true) },
               images: array({ side: "front"|"back", dataUrl: string }).min(1).max(2) }
ScanResponse, LeadsResponse, SalesforceResult, BackupResult  (as in CLAUDE.md)
```

Required-on-submit rule (client and server): `firstName`, `lastName`,
`email` **or** `phone`, and `company` (default `"[Not provided]"` if empty,
Salesforce requires it). Email validated with zod email; phone kept as
string but stripped of everything except `+ digits space - ( )`.

Add vitest tests for the required rules and the phone cleaner.

## Task 4 — `/api/scan` with Gemini

`src/lib/gemini.ts`: `extractCard(images: {mime, base64}[]) → { fields, rawText }`.
Use `@google/genai` `generateContent` with
`config: { responseMimeType: "application/json", responseSchema, temperature: 0 }`.
The response schema mirrors `LeadFields` plus `rawText`, all strings.
Prompt: business-card OCR; if two images, merge front/back; split name;
address into street/city/state/postalCode/country; website excludes
linkedin; linkedin URL into `linkedin`; empty string when absent; `rawText`
is all visible text with line breaks.

Route: `requireSession()` → rate limit 20/min per email (`src/lib/ratelimit.ts`,
in-memory Map with sliding window) → parse multipart, accept `image/jpeg`
or `image/png`, ≤ 2 MB each, max 2 files → call Gemini with a 25 s
`AbortSignal` → return `ScanResponse`. On Gemini error return 502
`{ error: "scan_failed" }`. Set `Cache-Control: no-store` (do this via a
shared `json()` helper used by all routes).

Done when: posting a card photo with curl returns populated fields; an
unauthenticated request returns 401; 21st request in a minute returns 429.

## Task 5 — Salesforce client and lead upsert

`src/lib/salesforce/client.ts`:

- Module-scope `{ token, instanceUrl, fetchedAt }` cache.
- `getToken()` does client-credentials POST to `${SF_LOGIN_URL}/services/oauth2/token`.
- `sfFetch(path, init)` adds bearer, 10 s timeout, and on 401 clears cache
  and retries **once**.
- `classifyError(status, body) → "retryable" | "duplicate" | "needs_review"`
  exactly as in CLAUDE.md. Unit-test this with fixture bodies.

`src/lib/salesforce/lead.ts`:

- `mapFields(submit, session) → Record<string, string>` producing the
  Salesforce field names in CLAUDE.md, including `SnapCard_*` fields and
  `LeadSource: "Event"`. Omit empty strings. Unit-test.
- `upsertLead(submit, session) → SalesforceResult`:
  PATCH by external id. 201 → `synced` with `id`. 200 → `synced`; fetch the
  Id with `GET /sobjects/Lead/SnapCard_Client_Id__c/{clientId}?fields=Id`.
  DUPLICATES_DETECTED → `duplicate` with `duplicateOf` = first match Id.
  Otherwise use `classifyError`.
- `attachImage(leadId, side, dataUrl)`: create `ContentVersion`
  (`Title`, `PathOnClient: card-front.jpg`, `VersionData` base64,
  `FirstPublishLocationId: leadId`). One call is enough — using
  `FirstPublishLocationId` links it to the Lead without a separate
  `ContentDocumentLink`.
- `addToCampaign(leadId)`: POST `CampaignMember { CampaignId, LeadId, Status: "Responded" }`;
  ignore `DUPLICATE_VALUE` errors.

Done when: `npm test` passes for classifyError and mapFields; a script
`scripts/sf-smoke.ts` (run with `tsx`) upserts a test lead twice with the
same clientId and prints the same Id both times, then deletes it.

## Task 6 — `BackupStore` interface + noop

`src/lib/backup/types.ts`:

```ts
export interface BackupStore {
  saveLead(input: { submit: LeadSubmit; capturedBy: string; salesforce: SalesforceResult }): Promise<BackupResult>;
  saveImages(clientId: string, images: LeadSubmit["images"]): Promise<void>;
}
```

`noop.ts` returns `{ status: "skipped" }` and resolves immediately.
`src/lib/backup/index.ts` exports `getBackupStore()` which returns the noop
store when `MONGODB_URI` is unset. Do not implement Mongo yet.

## Task 7 — `/api/leads`

Flow, in this order:

1. `requireSession()`, parse `LeadSubmit` (400 on failure), rate limit 60/min.
2. `salesforce = await upsertLead(submit, session)` — this is the only
   awaited external call before responding.
3. `backup = await getBackupStore().saveLead(...)` wrapped in try/catch;
   any throw becomes `{ status: "failed" }`. Never let it change `salesforce`.
4. If `salesforce.status` is `synced` or `duplicate`, schedule in `after()`
   from `next/server`: `attachImage` for each image, then `addToCampaign`.
   Errors there are logged with clientId only.
5. Respond 200 with `LeadsResponse`.

Done when: submitting from curl creates a Lead in Salesforce with the
external id, consent fields, an attached image, and a CampaignMember; a
second identical submit returns the same leadId and creates nothing new.

## Task 8 — Capture screen

`/scan` is a three-step client component: **Capture → Review → Saved**.

Capture:
- Two slots, "Front" (required) and "Back" (optional), each a big tappable
  area wrapping `<input type="file" accept="image/*" capture="environment" hidden>`.
  Also allow choosing from gallery (second, smaller button without `capture`).
- On selection, run `compressImage(file) → Blob` from
  `src/lib/client/compress.ts`: draw to canvas at max 1600 px on the long
  edge, export `image/jpeg` quality 0.8. Use `createImageBitmap` with
  `imageOrientation: "from-image"` so iPhone photos aren't rotated.
  Show the preview and file size.
- "Scan card" button posts to `/api/scan`, shows a spinner with "Reading
  card…", and on success moves to Review with fields pre-filled. On failure
  offer "Retry" and "Fill in manually".

Keep the layout single-column, 16 px+ text, buttons ≥ 48 px tall, safe-area
padding at the bottom (`env(safe-area-inset-bottom)`).

## Task 9 — Review and submit

Review form with react-hook-form + zod (`LeadFields`), all fields editable,
required ones marked, `rawText` in a collapsible textarea. Consent checkbox
with the exact text from `CONSENT_TEXT` constant and version
`CONSENT_TEXT_VERSION`. "Save lead" is disabled until consent is ticked and
the form is valid.

On submit:
1. Build `LeadSubmit` with `clientId = crypto.randomUUID()`, images as
   data URLs from the compressed blobs.
2. `await outbox.add(item)` (Task 10) **before** any network call.
3. Immediately show the **Saved** step with "Saved on phone" and a big
   "Scan next card" button. Start `processOutbox()` in the background.
4. When the outbox reports a result for this clientId, update the badge on
   the Saved step (and in `/leads`) to "In Salesforce" / "Duplicate — merged"
   / "Needs admin review" / "Retrying…".

## Task 10 — Outbox (Dexie)

`src/lib/client/outbox.ts`:

```ts
table outbox: { clientId (pk), payload: LeadSubmit, createdAt, attempts, nextAttemptAt,
                lastResult?: LeadsResponse, backupOnly?: boolean, salesforceLeadId?: string }
table history: { clientId (pk), fields: LeadFields, createdAt, salesforce: SalesforceResult }
```

`processOutbox()` applies the table in CLAUDE.md "Phone outbox rules".
Implement the decision as a pure function `nextAction(item, response)` and
unit-test it with every row of that table. Use a module-level `running`
flag so calls don't overlap. Register listeners: `visibilitychange`
(visible), `online`, and app start.

`/leads` page lists `history` (newest first) with status badges, and a
banner "N leads waiting to sync" when the outbox is non-empty, with a
"Sync now" button.

## Task 11 — PWA

- `app/manifest.ts`: name "SnapCard", short_name, `display: "standalone"`,
  `start_url: "/scan"`, theme/background colours, icons 192/512 + maskable,
  `orientation: "portrait"`.
- Serwist: precache app shell, `NetworkFirst` for pages, `NetworkOnly` for
  `/api/*`. Never cache API responses.
- Add `apple-touch-icon`, `apple-mobile-web-app-capable`, and a viewport
  with `viewport-fit=cover`.
- iOS install hint: if `navigator.standalone !== true` and user agent is
  iOS Safari, show a dismissible banner "Tap Share → Add to Home Screen".
- Android: capture `beforeinstallprompt` and show an "Install app" button.
- `next.config.ts` headers: `/api/:path*` → `no-store`; `/sw.js`,
  `/manifest.webmanifest` → `no-cache`.

Done when: Lighthouse PWA checks pass on the deployed URL; app installs on
both platforms and opens to `/scan`.

## Task 12 — Admin page (minimal)

`/admin` (admins only): a table of today's leads pulled live from
Salesforce via SOQL
(`SELECT Id, Name, Company, Email, SnapCard_Captured_By__c, CreatedDate FROM Lead WHERE SnapCard_Event__c = :event ORDER BY CreatedDate DESC LIMIT 200`),
a count per rep, and a "Download CSV" button. Nothing else in Phase 1.

## Task 13 — Hostinger deployment

- Create branch `production`. Add `.github/workflows/ci.yml` that runs
  typecheck/lint/test on every PR to `main` and `production`.
- Confirm `engines.node >= 20` in package.json and a plain `next start`
  start command (Hostinger reads `npm run build` / `npm run start`).
- Document in README: hPanel → Websites → Add Website → Node.js web app →
  Import Git repository → branch `production` → Node 20 → add all env vars
  → Deploy. Set `NEXT_PUBLIC_APP_URL` and the Google OAuth redirect URI to
  `https://scan.thinkvibes.com/api/auth/callback/google`.
- After deploy: verify HTTPS is forced, `/api/scan` returns 401 without a
  session, `sw.js` has `no-cache`, and purge the Hostinger CDN cache.

## Task 14 — Field test checklist (manual, not for Claude Code)

- Scan 30 real cards on an iPhone and 30 on an Android; note fields that
  needed editing.
- Submit 5 leads in airplane mode; go online; confirm they reach Salesforce
  once each.
- Double-tap "Save lead" — confirm one Lead.
- Kill the app mid-upload; reopen; confirm the outbox recovers.
- Confirm consent fields and card image show on the Lead in Salesforce.
