# SnapCard — project brief for Claude Code

Read this file fully before doing any task. It is the source of truth for
architecture decisions. Do not change a decision listed here without asking.

## What this is

A PWA for a sales team at events (first use: Dreamforce). A rep photographs a
business card, Gemini extracts the fields, the rep reviews and saves, and
the lead is created in Salesforce. Priority order:

1. **Salesforce is the system of record.** Every lead is written to Salesforce
   first and the rep sees that result.
2. **MongoDB Atlas is the live backup** (Phase 2). It mirrors leads and card
   images, holds leads Salesforce rejected, and must never block or slow the
   Salesforce write.
3. **A lead is never lost.** The phone keeps an outbox until a server confirms.

## Stack (fixed)

| Layer | Choice |
|---|---|
| App | Next.js 15, App Router, TypeScript strict, `src/` dir |
| UI | Tailwind, shadcn/ui, react-hook-form, zod (one schema shared client + server) |
| Auth | Auth.js v5 (`next-auth@beta`), Google provider, restricted to `thinkvibes.com`, JWT sessions, 30-day maxAge |
| OCR | `@google/genai`, model name from `GEMINI_MODEL` env, JSON response schema |
| CRM | Salesforce REST API, client-credentials OAuth, upsert by external ID |
| Phone storage | Dexie (IndexedDB) outbox |
| PWA | `@serwist/next`, `app/manifest.ts` |
| Backup (Phase 2) | MongoDB Atlas via official `mongodb` driver, images as BinData |
| Hosting | Hostinger Node.js web app, Node 20, deploys from `production` branch |
| Tests | vitest for pure logic (mapping, schemas, outbox reducer) |

Package manager: npm. No Prisma, no Mongoose, no tRPC, no Redux.

## Design

**Cobalt (`snapcard-prototypes/layout-1.html`) is the only visual reference.**
`layout-2.html` and `layout-3.html` are ignored. The `snapcard-prototypes/`
folder is a read-only reference — never edit it, never import from it.

Take the *look* only. The prototype's simulated card reading, fake Salesforce
sync and `localStorage` persistence are not the spec; real behaviour is defined
in this file and `PLAN-1-salesforce.md`. Build with Tailwind + shadcn/ui
components themed to match Cobalt — do not paste the prototype's HTML/CSS.

### View → route mapping

| Cobalt view | Our route |
|---|---|
| `scan` + `review` | `/scan` — one page, three steps: capture → review → saved |
| `contacts` | `/leads` |
| `admin` | `/admin` (admins only) |

In Phase 1 the admin scope is **only** what PLAN-1 Task 12 describes (today's
leads table, count per rep, Download CSV). Build just those parts of Cobalt's
admin design; leave the rest of that view out.

### Design tokens (from Cobalt `:root`)

```
bg #f7f8fa   surface #ffffff   surface-2 #f0f2f5
line #e4e7ec   line-strong #d0d5dd
text #16181d   text-2 #5b6472   text-3 #8b93a1
accent #1d4ed8   accent-strong #1e40af   accent-soft #eff4ff
ok #047857 / #ecfdf5   warn #b45309 / #fffbeb   bad #b91c1c / #fef2f2
radius 14px   radius-sm 10px   nav-h 64px
shadow 0 1px 2px rgba(22,28,45,.05), 0 4px 16px rgba(22,28,45,.06)
```

Base font size 15px, line-height 1.5. Headings are weight 800 with tight
letter-spacing (`-.02em`/`-.03em`).

### Typography

- **Manrope** (400/500/600/700/800) for everything.
- **JetBrains Mono** (500) for numerics — stat values, IDs, counts.

Load both with `next/font/google` (self-hosted), not a CDN `<link>` — the app
is a PWA and must render offline.

### Navigation

- **< 900px**: fixed bottom tab bar (Cobalt `#tabbar`), 64px + safe-area inset.
- **≥ 900px**: 232px left sidebar (Cobalt `#sidenav`), sticky under the app bar.

Both show Scan / Leads, plus Admin for admins only. A sticky translucent app
bar (blur, 1px bottom border) carries the brand mark and the user chip.

### Component styles

Buttons ≥ 48px tall, radius 12px; primary is `accent` with a soft blue shadow.
Inputs are `line-strong` bordered, radius 10px, min-height 48px, focus ring
`0 0 0 3px rgba(29,78,216,.14)`. Status badges are the pill `.chip` style in
ok/warn/bad. Cards are `surface` + `line` border + `radius` + `shadow`.

Icons: `@phosphor-icons/react` at bold weight, matching the prototype.
(shadcn's own internals keep using `lucide-react`.)

## Hard rules

- All Gemini and Salesforce calls run server-side in route handlers. Never
  expose `GEMINI_API_KEY` or `SF_*` to the client.
- Every lead gets a `clientId` (`crypto.randomUUID()`) on the phone before any
  network call. It is sent to Salesforce as `SnapCard_Client_Id__c` and every
  Salesforce write is an **upsert** on that field. Never use plain `POST
  /sobjects/Lead`.
- `/api/scan` stores nothing. Images are persisted only on submit.
- Never log card contents, extracted fields, or images. Log `clientId`,
  status codes and error codes only.
- All `/api/*` responses set `Cache-Control: no-store`. `sw.js` and the
  manifest set `no-cache`.
- The save flow is written against the `BackupStore` interface in
  `src/lib/backup/types.ts`. In Phase 1 the implementation is `NoopBackupStore`.
  Do not put Mongo code anywhere else.
- Every route handler checks the session first. `/api/sync` and
  `/api/reconcile` check `SYNC_SECRET` instead.
- Prefer small, boring code. No abstractions for one call site.

## Repo layout

```
src/
  app/
    (auth)/login/page.tsx
    (app)/scan/page.tsx           capture → review → saved
    (app)/leads/page.tsx          my leads with status badges
    (app)/admin/page.tsx          admins only
    api/auth/[...nextauth]/route.ts
    api/scan/route.ts
    api/leads/route.ts
    api/leads/backup/route.ts     Phase 2
    api/sync/route.ts             Phase 2
    api/reconcile/route.ts        Phase 2
    manifest.ts
    sw.ts
  lib/
    auth.ts
    env.ts                        zod-validated process.env
    schemas.ts                    LeadFields, ScanResponse, LeadSubmit
    gemini.ts
    salesforce/client.ts          token cache, fetch wrapper, retry on 401
    salesforce/lead.ts            mapFields(), upsertLead(), attachImage()
    backup/types.ts               BackupStore interface
    backup/noop.ts                Phase 1
    backup/mongo.ts               Phase 2
    ratelimit.ts                  in-memory, per user
    client/compress.ts            resize to 1600px JPEG q0.8 in browser
    client/outbox.ts              Dexie db + processOutbox()
  components/                     shadcn + app components
.github/workflows/                sync.yml, reconcile.yml (Phase 2)
```

## Environment variables

See `.env.example`. `src/lib/env.ts` validates them at startup and fails fast.

```
AUTH_SECRET=
AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=
ALLOWED_EMAIL_DOMAIN=thinkvibes.com
ADMIN_EMAILS=someone@thinkvibes.com,other@thinkvibes.com
NEXT_PUBLIC_APP_URL=https://scan.thinkvibes.com
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.5-flash
SF_LOGIN_URL=https://<my-domain>.my.salesforce.com
SF_CLIENT_ID=
SF_CLIENT_SECRET=
SALESFORCE_ENABLED=true
SF_API_VERSION=v60.0
SYNC_SECRET=                     # Phase 2
MONGODB_URI=                     # Phase 2
MONGODB_DB=snapcard              # Phase 2
```

### Turning Salesforce off

`SALESFORCE_ENABLED=false` skips the integration entirely: `upsertLead` returns
`{ status: "skipped" }` without a network call, no images are attached, and the
sync cron is a no-op. The **backup store then becomes the system of record**, so
`MONGODB_URI` must be set — with both off, a lead exists only on the phone and
the outbox correctly refuses to drop it.

This is a switch, not a deletion. The mapping, upsert, error classification,
retry and attachment logic all remain correct and tested for when the org is
ready. It inverts priority 1 above for as long as it is set, and nothing else.

## Salesforce contract

One custom field on Lead (created by the admin, see SETUP.md):

- `SnapCard_Client_Id__c` Text(36), External ID, Unique — the phone UUID

Standard fields used: FirstName, LastName, Company, Title, Email, Phone,
Website, Street, City, State, PostalCode, Country, Description (raw OCR text),
LeadSource = "Event".

That is the whole mapping. Nothing else is written to Salesforce — no consent
fields, no capturing rep, no event, and no Campaign membership. Card images are
still attached as a ContentVersion.

Consent is no longer collected anywhere: the checkbox, the submit gate, the
`consent` field on the submit payload and the `consent` stamp on the Atlas
document were all removed at the user's request. Documents written before that
still carry the old stamp; nothing reads it.

Upsert call:

```
PATCH {instance_url}/services/data/{SF_API_VERSION}/sobjects/Lead/SnapCard_Client_Id__c/{clientId}
→ 201 created {id}, 200 updated (empty body; then query Id by external id, or use ?_HttpMethod override returning body)
→ 400 [{errorCode:"DUPLICATES_DETECTED", duplicateResult:{matchResults:[{matchRecords:[{record:{Id}}]}]}}]
→ 401 → refresh token once, retry once
```

Error classification (used by the phone outbox and Phase 2 retry):

- `retryable`: network error, timeout, 5xx, 429, 401 after refresh failed
- `duplicate`: DUPLICATES_DETECTED → treat as success with `duplicateOf`
- `needs_review`: any other 400/403 (validation rule, bad picklist, field-level security)

## API contract

`POST /api/scan` — multipart, 1–2 images ≤ 2 MB each.
Returns `{ fields: LeadFields, rawText: string, model: string }`.

`POST /api/leads` — JSON `{ clientId, fields, rawText, images: [{ side, dataUrl }] }`.
Returns:

```json
{
  "clientId": "…",
  "salesforce": { "status": "synced" | "duplicate" | "failed" | "needs_review", "leadId": "00Q…", "error": "…" },
  "backup":     { "status": "saved" | "skipped" | "failed" }
}
```

HTTP 200 whenever the request was understood, even if Salesforce failed;
the phone reads the body. 4xx only for auth, validation, rate limit.

## Phone outbox rules

An outbox item holds the full submit payload plus `salesforceLeadId?`.
After each `/api/leads` response:

| salesforce | backup | action |
|---|---|---|
| synced/duplicate | saved or skipped (Phase 1) | delete item |
| synced/duplicate | failed | keep, mark `backupOnly`, retry `POST /api/leads/backup` (Phase 2) |
| failed | saved | delete item — server owns the retry (Phase 2) |
| failed | skipped/failed | keep, retry `/api/leads` with backoff |
| needs_review | any | delete from outbox, show "needs admin review" badge |

`processOutbox()` runs on app open, on `online` event, and after every submit.
Backoff: 30s, 1m, 5m, 15m, then every 15m. Never more than one in-flight
request per item.

## Definition of done for any task

- `npm run typecheck`, `npm run lint`, `npm test` pass.
- No secrets in git. `.env.local` is ignored.
- The feature works in Chrome on Android and Safari on iOS (manual check
  noted in the PR description).
- Commit message explains *why*.
