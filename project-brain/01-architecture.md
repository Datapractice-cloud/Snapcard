# 01 — Architecture

> How the project is built **right now**. Where this differs from `CLAUDE.md`,
> this file is the observed truth and `CLAUDE.md` is the older contract.

## Stack

| Layer | Choice |
|---|---|
| App | Next.js 15.5 (App Router), React 19, TypeScript strict, `src/` |
| UI | Tailwind v4, shadcn/ui, radix-ui, react-hook-form, zod 4 (one schema, both sides) |
| Icons | `@phosphor-icons/react`, bold weight, **deep imports only** (see Gotchas) |
| Fonts | Manrope + JetBrains Mono via `next/font/google`, self-hosted |
| Auth | Auth.js v5 (`next-auth@beta`), Google provider, thinkvibes.com only, JWT, 30-day |
| OCR | `@google/genai`, model from `GEMINI_MODEL` (`gemini-3.5-flash`), JSON schema |
| Store | **MongoDB Atlas** via the official `mongodb` driver, images as BinData |
| CRM | Salesforce REST, client-credentials OAuth, upsert by external ID — **switched off** |
| Phone | Dexie (IndexedDB) outbox |
| PWA | `@serwist/next`, `app/manifest.ts`, `src/app/sw.ts` |
| Hosting | Hostinger Node.js web app, Node 20, deploys from `production` |
| Tests | vitest, pure logic only — 150+ tests, no network, no database |

Package manager: npm. Node >= 20.6.

### Three places this diverges from `CLAUDE.md`

1. **Atlas is the system of record, not a Phase 2 backup.** `SALESFORCE_ENABLED=false`,
   so `upsertLead` short-circuits to `{ status: "skipped" }` and the outbox reducer
   reads that as "the backup owns it, let the item go."
2. **Salesforce is off, not deleted.** Mapping, upsert, error classification, retry
   and attachment logic are all intact and tested behind one env var.
3. **Auth is Google *plus* credentials.** `src/lib/password.ts` and `src/lib/users.ts`
   exist; the Credentials provider, the login form and the admin Users UI do not yet.
   `CLAUDE.md` still says Google-only — recording that override is an open task.

## Folder structure

```
src/
  app/
    (auth)/login        sign-in
    (app)/scan          capture -> review -> saved (one page, three steps)
    (app)/leads         a rep's own leads, status badges, detail sheet, delete
    (app)/admin         admins only — today's leads, count per rep, CSV
    api/scan            multipart -> Gemini, stores nothing
    api/leads           submit; api/leads/[clientId] for one lead
    api/images/[clientId]/[side]   card photos out of Atlas
    api/sync            cron, SYNC_SECRET — replays leads into Salesforce when it is on
    manifest.ts, sw.ts
  lib/
    auth.ts / auth.config.ts / auth-rules.ts   Edge-safe half is auth.config.ts
    env.ts             zod-validated process.env, parsed at startup
    schemas.ts         LeadFields, ScanResponse, LeadSubmit
    gemini.ts, csv.ts, http.ts, ratelimit.ts, initials.ts, utils.ts
    password.ts, users.ts                      scrypt hashing + app_users collection
    mongo.ts           withMongo() — the only way to touch the driver
    salesforce/        client.ts (token cache, retry on 401), lead.ts (map/upsert/attach)
    backup/            types.ts, index.ts (chooser + saveLeadSafely), mongo.ts, noop.ts, sync.ts
    client/            compress.ts, outbox.ts (Dexie), next-action.ts (outbox reducer)
  components/          app components + scan/ flow + ui/ (shadcn)
  middleware.ts        Edge auth gate
scripts/               sf-smoke.ts, mongo-indexes.ts, generate-icons.mts
.github/workflows/     ci.yml, sync.yml
snapcard-prototypes/   read-only visual reference — "Cobalt" is layout-1.html
```

## Key patterns & conventions

- **Every lead carries a `clientId`** (`crypto.randomUUID()`), minted on the phone
  before any network call. Salesforce writes are always an upsert on
  `SnapCard_Client_Id__c` — never a plain `POST /sobjects/Lead`.
- **All Gemini and Salesforce calls are server-side.** `GEMINI_API_KEY` and `SF_*`
  never reach the client.
- **`/api/scan` persists nothing.** Images are stored only on submit.
- **Never log card contents, extracted fields or images** — `clientId`, status codes
  and error codes only.
- **`no-store` on every `/api/*` response**; `no-cache` on `sw.js` and the manifest.
- **The backup can never change the Salesforce result** — `saveLeadSafely()` in
  `src/lib/backup/index.ts` swallows its own errors on purpose, and is tested for it.
- **Every route handler checks the session first**; `/api/sync` checks `SYNC_SECRET`.
- **Mongo is only ever reached through `withMongo()`** (`src/lib/mongo.ts`).
- Small, boring code. No abstraction for one call site.
- Design: Cobalt tokens (accent `#1d4ed8`, radius 14px), buttons >= 48px tall, tab bar
  below 900px and a 232px sidebar above it. Built in Tailwind + shadcn themed to
  Cobalt — the prototype's HTML/CSS was never pasted.

## Contracts and limits

Folded in from `PLAN-1-salesforce.md`, `PLAN-2-atlas.md` and `SETUP.md` on 2026-09-12,
then checked against the code. Where the two disagreed the code won, and the
divergence is noted.

### Who may sign in

`signIn` returns false unless **all three** hold: `profile.email_verified === true`,
`profile.hd === ALLOWED_EMAIL_DOMAIN`, and the email ends with `@<domain>`. All three
on purpose — `hd` alone can be spoofed by some flows, and the email domain alone does
not prove a Workspace account.

### Numbers, as they are in the code

| Limit | Value | Where |
|---|---|---|
| Scan rate limit | 20/min per email | `src/app/api/scan/route.ts` |
| Submit rate limit | 60/min per rep | `src/app/api/leads/route.ts` |
| Upload size | 2 MB per image, 2 images max | `src/app/api/scan/route.ts` |
| Client compression | long edge 1600 px, JPEG q0.8 | `src/lib/client/compress.ts` |
| Stored image cap | 1 MB after decode, else dropped | `src/lib/backup/mongo.ts` |
| Gemini | `temperature: 0`, JSON `responseSchema` | `src/lib/gemini.ts` |
| Mongo | `serverSelectionTimeoutMS: 30_000`, `maxPoolSize: 10`, **no** `socketTimeoutMS` | `src/lib/mongo.ts` |
| Session | JWT, 30 days | `src/lib/auth.config.ts` |

`PLAN-2` specified `serverSelectionTimeoutMS: 3000`; the code uses 30s. The plan lost
to a measurement — see the decision log.

### Required on submit

`firstName`, `lastName`, and **at least one of** `email` or `phone`. `company` is
optional in the form and defaults to `[Not provided]` on submit, because Salesforce
requires it. One zod schema in `src/lib/schemas.ts` serves the form and the route, so
the two cannot diverge — change the rule there, never in the form.

### Salesforce field mapping

`mapFields(submit)` is pure — no session, no env, no clock — and emits the standard
Lead fields plus `Description` (raw OCR text), `LeadSource: "Event"` and
`SnapCard_Client_Id__c`. Empty strings are omitted. The upsert is
`PATCH /sobjects/Lead/SnapCard_Client_Id__c/{clientId}`: 201 is created, 200 is updated
(then `GET …?fields=Id` for the Id), `DUPLICATES_DETECTED` is a success with
`duplicateOf`, anything else goes through `classifyError` into
`retryable` / `duplicate` / `needs_review`.

Card images attach as a single `ContentVersion` create carrying
`FirstPublishLocationId: leadId` — that links the file to the Lead on its own, with no
separate `ContentDocumentLink` call.

### Atlas shape

```
leads        { clientId: 1 } unique
             { "salesforce.status": 1, "salesforce.nextAttemptAt": 1 }
             { capturedBy: 1, createdAt: -1 }
             { "fields.email": 1 }
lead_images  { clientId: 1, side: 1 } unique
app_users    { email: 1 } unique
```

`leads` holds `{ clientId, capturedBy, fields, rawText, salesforce: { status, leadId?,
duplicateOf?, attempts, lastError?, nextAttemptAt?, syncedAt?, claimedUntil? },
backup: { source, savedAt }, createdAt, updatedAt }`. Documents written before
2026-09-12 also carry a `consent` object; nothing reads it. `PLAN-2` lists `consent` as
part of the shape — that part of the plan is dead.

Indexes are created by `npm run mongo:indexes`, once per environment.

### The sync cron

`POST /api/sync` with `Authorization: Bearer ${SYNC_SECRET}`, run every 15 minutes by
`.github/workflows/sync.yml`. It claims work atomically — `findOneAndUpdate` setting
`salesforce.claimedUntil = now + 60s` — and skips any lead whose claim returns null.
Backoff on a retryable failure is `min(15m, 30s * 2^attempts)`, capped at 5 attempts.
The live submit path deliberately has **no** such claim: it only ever upserts leads
Atlas has not seen, while the cron only touches `failed` ones, so the two never race.

With `SALESFORCE_ENABLED=false` the whole route is a no-op.

## External services & config

Google OAuth, Gemini API, MongoDB Atlas, Salesforce (off), Hostinger, GitHub Actions.

Variable **names** only — values live in `.env.local`, which is gitignored and has
never been committed:

`AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `AUTH_TRUST_HOST`,
`ALLOWED_EMAIL_DOMAIN`, `ADMIN_EMAILS`, `NEXT_PUBLIC_APP_URL`, `GEMINI_API_KEY`,
`GEMINI_MODEL`, `SALESFORCE_ENABLED`, `SF_LOGIN_URL`, `SF_CLIENT_ID`,
`SF_CLIENT_SECRET`, `SF_API_VERSION`, `SYNC_SECRET`, `MONGODB_URI`, `MONGODB_DB`.

Notes: the database is **`snapcard1`**, not `snapcard` — `snapcard` belongs to a
different project of the user's and a unique index cannot build over it. Locally the
Node DNS resolver is `127.0.0.1`, so `mongodb+srv://` fails and a direct-host URI is
needed.

## Gotchas

Each one was paid for. Do not rediscover them.

- **Never run `npm run build` while the dev server is up.** It corrupts `.next`
  (`Cannot find module './873.js'`). Stop dev, build, clear `.next`, restart.
- **`instrumentation.ts` is compiled for Edge as well as Node.** A Mongo warm-up
  there broke every route with `Module not found: Can't resolve 'net'`. A dynamic
  import behind a `NEXT_RUNTIME` check does not save you, and `serverExternalPackages`
  does not cover it.
- **Mongo must go through `withMongo()`.** `resetMongoClient()` existed and was never
  called, so one `read ECONNRESET` poisoned the cached client for the life of the
  process and `/admin` stayed broken. `socketTimeoutMS: 20_000` made it worse by
  killing healthy operations on a link whose handshake can take 21s. 10.5s -> 0.15s.
- **The Phosphor barrel (~9000 icons) freezes the dev renderer.** Deep imports only:
  `@phosphor-icons/react/dist/csr/Camera`.
- **Middleware must not redirect `/api/*` to `/login`.** It returned HTML 200 and the
  outbox read that as a successful submit. It returns JSON 401 now.
- **`suppressHydrationWarning` goes on the element that owns the text**, not its
  parent — `/admin` timestamps needed it on `<time>`, not the `<td>`.
- **`promisify(scrypt)` drops the options overload**, and the options carry the work
  factor. `deriveKey()` is written out by hand for that reason.
- **`next/font` variables belong on `<html>`**, since `globals.css` applies
  `font-sans` there. On `<body>` everything silently renders serif.
- **Serwist precaching picks up Windows backslashes in URLs** and aborts the service
  worker install without a word. `globPublicPatterns: []`.
- **`gemini-3.5-flash-lite` measured 24-33s per scan**; `gemini-3.5-flash` is ~2s.
- **Nothing in `auth.config.ts` may import `env.ts`.** It runs on Edge, where
  `process.env` is not enumerable. Read `AUTH_TRUST_HOST` / `ADMIN_EMAILS` by static
  member access; `env.ts` still validates them on the server.
- **The service worker is disabled in development** — it fights HMR. To exercise the
  PWA locally: `npm run build && npm run start`.
- **The app sends no `Sforce-Auto-Assign` header, so Salesforce defaults it to TRUE.**
  Any *active* Lead Assignment Rule therefore runs on every upsert and reassigns the
  Lead away from the integration user — after which `/admin` and the reconcile job
  silently stop seeing leads unless that user has **View All** on Lead. Nothing errors;
  the list just goes quiet. Matters the moment Salesforce is switched back on.
- **`NEXT_PUBLIC_*` is baked into the browser bundle at build time.** Changing
  `NEXT_PUBLIC_APP_URL` needs a **redeploy**, not a restart, and the prefix ships the
  value to every browser — so nothing secret may ever carry it. It is the only
  build-time variable the app has.
- **`AUTH_TRUST_HOST=true` is required on Hostinger.** TLS terminates at their proxy,
  so without it every sign-in fails with `UntrustedHost` — which reads like a Google
  OAuth misconfiguration and is not.
- **Node 20.6 is the floor, not 20.0** — `npm run sf:smoke` uses `node --env-file`.
- **Hostinger needs a Business, Unlimited or Cloud plan.** Premium does not run Node
  apps at all.
- **Never put the external id in the body of an upsert that keys on it.** Salesforce
  answers `INVALID_FIELD: The SnapCard_Client_Id__c field should not be specified in
  the sobject data` and the write fails every time. The id goes in the URL path only.
  Cost a session to find, because the unit test asserted the opposite — a pure mapper's
  tests cannot catch a contract the remote API enforces, so anything shaped like "what
  Salesforce accepts" needs a real call against the org, not a fixture.
- **The integration user has no Delete on Lead.** Production never deletes, so this
  only affects `npm run sf:smoke`, whose final cleanup step fails with
  `INSUFFICIENT_ACCESS_OR_READONLY` and leaves its test Lead behind. Grant Delete in
  `Integration Permission Set` or tidy up by hand after each smoke run.
- **The External Client App has `IP Relaxation = Enforce IP restrictions`.** Auth
  succeeds from whichever IP has been added; **Hostinger's outbound IP is different**,
  so the first production write will fail auth until that IP is trusted or the setting
  is relaxed. Nothing in the app reports this as a config problem — it looks like
  broken credentials.
- **Two permission sets are assigned to the integration user and only one works.**
  `Integration Permission Set` carries the real Lead grants. `Snapcard Integration` was
  created under a license that excludes every CRM object, so it cannot grant Lead
  anything — its Object Settings list has no `Lead` row at all. Delete it.

### Serwist caching strategy

App shell precached, `NetworkFirst` for pages, `NetworkOnly` for `/api/*`. API
responses are never cached — the outbox is the offline story, not the cache.
