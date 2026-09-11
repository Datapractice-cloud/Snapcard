# SnapCard

A PWA for photographing business cards at events. Gemini extracts the fields,
the rep reviews them and confirms consent, and the lead is upserted into
Salesforce. Leads queue on the phone, so a lost signal never loses one.

Read [`CLAUDE.md`](./CLAUDE.md) first — it is the source of truth for
architecture, the Salesforce contract, the API contract and the design.

- [`SETUP.md`](./SETUP.md) — one-time human setup (Google OAuth, Salesforce, hosting)
- [`PLAN-1-salesforce.md`](./PLAN-1-salesforce.md) — Phase 1, Salesforce only
- [`PLAN-2-atlas.md`](./PLAN-2-atlas.md) — Phase 2, MongoDB Atlas backup
- `snapcard-prototypes/` — read-only visual reference (`layout-1.html`, "Cobalt")

## Getting started

Requires Node 20.6 or newer.

```bash
npm install
cp .env.example .env.local   # then fill in the real values
npm run dev
```

`src/lib/env.ts` validates the environment at server startup and fails with a
message naming every variable that is missing or malformed.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Next dev server on http://localhost:3000 |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit`, for the app and the service worker |
| `npm test` | vitest, once |
| `npm run test:watch` | vitest, watching |
| `npm run icons` | Regenerate the PWA icons into `public/icons/` |
| `npm run sf:smoke` | Upsert a test lead into Salesforce twice, then delete it |

The service worker is **disabled in development** — it fights HMR and caches
the file you are editing. To exercise the PWA locally, run `npm run build &&
npm run start`.

## Branches

| Branch | Purpose |
|---|---|
| `main` | Where work lands |
| `production` | What Hostinger deploys. Nothing else watches it. |

Deploying is merging:

```bash
git checkout production
git merge main
git push
```

CI (`.github/workflows/ci.yml`) runs typecheck, lint, tests and a build on
every push and PR to both branches, on **Node 20** — the version Hostinger
runs, not the one you develop on.

## Deploying to Hostinger

Needs a Business, Unlimited or Cloud plan; Premium does not run Node apps.

1. **DNS** — point the `scan` subdomain at the hosting plan.
2. **hPanel** → Websites → Add Website → **Node.js web app** → Import Git
   repository → this repo → branch **`production`** → framework Next.js →
   **Node 20 or newer**.
   Build command `npm run build`, start command `npm run start`.
3. **Environment variables** — add every one from the table in
   [`SETUP.md` §3](./SETUP.md) **before the first build**. Two that are easy to
   miss:
   - `AUTH_TRUST_HOST=true` — TLS terminates at Hostinger's proxy. Without it
     every sign-in fails with `UntrustedHost`, which looks like a Google
     misconfiguration and is not.
   - `NEXT_PUBLIC_APP_URL=https://scan.thinkvibes.com` — compiled into the
     browser bundle, so changing it later needs a **redeploy**, not a restart.
4. **Google Cloud Console** → your OAuth client → add
   `https://scan.thinkvibes.com/api/auth/callback/google` to authorised
   redirect URIs and `https://scan.thinkvibes.com` to authorised origins.
   Google matches these exactly: no trailing slash, and the client ID is the
   bare `…apps.googleusercontent.com` value, not a URL.
5. **Deploy.** Then force HTTPS, confirm SSL is active, and purge the CDN cache.

Redeploy and purge the CDN cache again after any change to env vars or to
`production`.

### After the first deploy

Check these four in order; each one has bitten this app already.

```bash
# HTTPS is forced
curl -sI http://scan.thinkvibes.com | grep -i '^location'

# The API refuses anonymous callers with JSON, not a redirect
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://scan.thinkvibes.com/api/scan   # 401

# The service worker is revalidated, or the app sticks on an old build
curl -sI https://scan.thinkvibes.com/sw.js | grep -i 'cache-control'                    # no-cache

# The manifest is reachable without a session, or the app cannot be installed
curl -s -o /dev/null -w '%{http_code}\n' https://scan.thinkvibes.com/manifest.webmanifest  # 200
```

Then sign in with a `@thinkvibes.com` account, install the app to the home
screen, and run the Phase 1 Task 14 field test from `PLAN-1-salesforce.md`.
