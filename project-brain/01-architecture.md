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
