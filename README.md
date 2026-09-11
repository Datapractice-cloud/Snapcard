# SnapCard

A PWA for photographing business cards at events. Gemini extracts the fields,
the rep reviews them and confirms consent, and the lead is upserted into
Salesforce.

Read [`CLAUDE.md`](./CLAUDE.md) first — it is the source of truth for
architecture, the Salesforce contract, the API contract and the design.

- [`SETUP.md`](./SETUP.md) — one-time human setup (Google OAuth, Salesforce, hosting)
- [`PLAN-1-salesforce.md`](./PLAN-1-salesforce.md) — Phase 1, Salesforce only
- [`PLAN-2-atlas.md`](./PLAN-2-atlas.md) — Phase 2, MongoDB Atlas backup
- `snapcard-prototypes/` — read-only visual reference (`layout-1.html`, "Cobalt")

## Getting started

Requires Node 20 or newer.

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
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | vitest, once |
| `npm run test:watch` | vitest, watching |

Deployment notes live in `SETUP.md` §3.
