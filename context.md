# SnapCard — working context

A scratch record of *why* this app looks the way it does: decisions taken, decisions
reversed, and the mistakes worth not repeating. `CLAUDE.md` is the contract and stays
authoritative; this file is the story behind it.

Last updated: 2026-09-12.

---

## What it is

A PWA for scanning business cards at events. A rep photographs a card, Gemini reads
it, the rep corrects the fields and submits. It has to work on a phone, on a bad
conference network, and offline.

Stack: Next.js 15 App Router, TypeScript strict, Tailwind v4 + shadcn/ui, Auth.js v5,
Gemini via `@google/genai`, MongoDB Atlas, Dexie (IndexedDB) for the offline outbox,
Serwist for the service worker. Vitest covers pure logic only — 150+ tests, no
network, no database.

Routes: `/scan`, `/leads`, `/admin`, `/login`, plus `/api/{scan,leads,images,sync}`.

## Design

`snapcard-prototypes/layout-1.html` ("Cobalt") is the **only** visual reference —
layout-2 and layout-3 are ignored. Manrope + JetBrains Mono, `#sidenav` above 900px
and `#tabbar` below. The prototype folder is read-only reference and stays untouched.

Design is taken from it; behaviour is not. The prototype's simulated card reading,
fake Salesforce sync and localStorage were never copied. It was rebuilt in
Tailwind + shadcn themed to Cobalt rather than by pasting its HTML.

Icons are deep-imported (`@phosphor-icons/react/dist/csr/Camera`), never from the
barrel — see Gotchas.

## Where the data goes

**MongoDB Atlas is the store.** Salesforce is written but switched off
(`SALESFORCE_ENABLED=false`), and `upsertLead` short-circuits to
`{ status: "skipped" }`, which the outbox reducer treats as "the backup saved it, so
let the item go."

This was a pivot. The app was built Salesforce-first against `PLAN-1-salesforce.md`.
Salesforce sign-off never came: the org is missing `SnapCard_Client_Id__c` and hides
eleven standard Lead fields behind FLS from the integration user. Rather than keep
leads hostage to an org nobody could fix that week, Atlas became the store
(`PLAN-2-atlas.md`). The Salesforce path is intact and reachable by flipping one env
var — it is off, not deleted.

Scope was cut twice along the way, both times by the user:

- Campaign/CampaignMember, `SnapCard_Event__c`, `SnapCard_Captured_By__c`, the three
  consent fields and `LinkedIn__c` all removed. Consent stayed as a **UI gate only** —
  the checkbox blocks submit and is stamped server-side, but is not sent to Salesforce.
- `linkedin` dropped completely: schema, Gemini prompt, field mapping, tests, docs.

The review form is exactly: First Name\*, Last Name\*, Company, Email\*, Phone\*,
Job Title, Website, Address, Description. Card images are kept.

## Current work — user management

The admin panel is getting **email + password accounts** (chosen over invite links or
a Google allow-list).

Two deliberate deviations, both stated before starting:

1. Passwords sit **alongside** Google, not instead of it. Replacing Google would break
   everyone's current sign-in and throw away the thinkvibes.com domain restriction
   that protects the app.
2. Hashing is Node's built-in `scrypt`, not bcrypt or argon2 — memory-hard, and no
   native module to compile on Hostinger.

Done: `src/lib/password.ts` (+12 passing tests) and `src/lib/users.ts`.
Not yet done: the Credentials provider, the login form, the admin Users UI,
`/api/admin/users`, and a rate limit on password login.

Both existing-file edits this needs (`src/lib/auth.ts` and the login page) are still
unmade, because the user asked for nothing else to change.

**A bug worth remembering.** `authenticate()` verifies against a decoy hash when no
such user exists, so a missing account costs the same as a real one — otherwise
response time tells an attacker which addresses are worth attacking. The first decoy
was a hand-written base64 constant, and it returned in **251ms against a real hash's
~300ms**: the literal did not match the current work factor, so it bailed out cheap
and leaked exactly the signal it existed to hide. It is now generated at first use
with the real `hashPassword()`. Measured after: 306ms vs 300ms.

## Gotchas, each one paid for

- **Never run `npm run build` while the dev server is up.** It corrupts `.next`
  (`Cannot find module './873.js'`). Stop dev, build, clear `.next`, restart.
- **`instrumentation.ts` is compiled for Edge as well as Node.** Adding a Mongo warm-up
  there broke every route with `Module not found: Can't resolve 'net'`. A dynamic
  import behind a `NEXT_RUNTIME` check does not save you, and `serverExternalPackages`
  does not cover it.
- **Mongo needs `withMongo()`.** `resetMongoClient()` existed and was never called, so
  a single `read ECONNRESET` poisoned the cached client for the life of the process and
  `/admin` stayed broken. `socketTimeoutMS: 20_000` made it worse by killing healthy
  operations on a link whose handshake can take 21s. After the fix: 10.5s → 0.15s.
- **The Phosphor barrel (~9000 icons) freezes the dev renderer.** Deep imports only.
- **Middleware must not redirect `/api/*` to `/login`.** It returned HTML 200 and the
  outbox read that as a successful submit. It returns JSON 401 now.
- **`suppressHydrationWarning` goes on the element that owns the text**, not its parent
  — timestamps on `/admin` needed it on `<time>`, not the `<td>`.
- **`promisify(scrypt)` drops the options overload**, and the options carry the work
  factor. `deriveKey()` is written out by hand for that reason.
- `next/font` variables belong on `<html>`, since `globals.css` applies `font-sans`
  there. On `<body>` everything silently renders serif.
- Serwist precaching picks up Windows backslashes in URLs and aborts the service worker
  install without a word. `globPublicPatterns: []`.
- `gemini-3.5-flash-lite` measured 24–33s per scan against `gemini-3.5-flash` at ~2s.

## Environment

`.env.local` holds the real values, is gitignored, and has never been committed
(verified before the repo was pushed). The user sets all secrets personally.

`AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `ALLOWED_EMAIL_DOMAIN`,
`AUTH_TRUST_HOST`, `ADMIN_EMAILS`, `NEXT_PUBLIC_APP_URL`, `GEMINI_API_KEY`,
`GEMINI_MODEL`, `SALESFORCE_ENABLED`, `SF_*`, `SYNC_SECRET`, `MONGODB_URI`,
`MONGODB_DB`.

Notes: `.env` spells "not set" as `FOO=`, so `env.ts` preprocesses empty strings away.
The database is `snapcard1`, not `snapcard` — the latter belongs to a different project
of the user's and a unique index cannot build over it. Locally the Node DNS resolver is
`127.0.0.1`, so `mongodb+srv://` fails and a direct-host URI is needed.

## Open

- Finish user management (list above).
- Record the auth override in `CLAUDE.md`: Google-only → Google + credentials.
- `production` is 19 commits behind `main`. Merging **is** the deploy; not yet asked for.
- Hostinger env vars, and a Google OAuth redirect URI for `snapcard.thinkvibes-exam.com`.
- Three seeded fake leads (Meera Iyer, Daniel Okafor, Sofia Rossi) still in Atlas.
- **The Atlas password was pasted into chat — rotate it.** `0.0.0.0/0` is open to the
  whole internet and should be narrowed.
- Salesforce org still needs the custom field and the FLS grants, whenever it matters.

## How work runs here

One task at a time: say what is about to happen, implement it, run `npm run typecheck`,
`npm run lint` and `npm test`, report what was verified versus what needs the user,
commit with a message explaining *why*, then stop. Nothing is mocked to get past a
missing credential — the user is asked instead.
