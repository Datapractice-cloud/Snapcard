# 04 — Tasks

> Now = this/next session. Next = soon. Later = someday. Done = finished (newest on top, with date).

## Now

- [ ] Credentials provider in `src/lib/auth.ts` — alongside Google, not replacing it
- [ ] Password form on `src/app/(auth)/login/page.tsx`
- [ ] `/api/admin/users` — create, list, disable (never delete)
- [ ] Admin Users UI
- [ ] Rate limit password login (reuse `src/lib/ratelimit.ts`)
- [ ] **Rotate the Atlas password** — it was pasted into chat
- [ ] Narrow Atlas network access — `0.0.0.0/0` is open to the whole internet

## Next

- [ ] Record the auth override in `CLAUDE.md`: Google-only -> Google + credentials
- [ ] Delete the three seeded fake leads still in Atlas (Meera Iyer, Daniel Okafor,
      Sofia Rossi)
- [ ] Deploy: merge `main` into `production`. `production` is well behind `main`, and
      merging **is** the deploy — only when the user asks.
- [ ] Set the Hostinger environment variables (every one in `SETUP.md` §3, before the
      first build — `AUTH_TRUST_HOST=true` and `NEXT_PUBLIC_APP_URL` are the two that
      get missed)
- [ ] Add the Google OAuth redirect URI for `snapcard.thinkvibes-exam.com`

## Later

- [ ] Salesforce back on: the org needs `SnapCard_Client_Id__c` and FLS grants on
      eleven standard Lead fields, then flip `SALESFORCE_ENABLED=true`
- [ ] Decide the fate of `context.md` now that `project-brain/` exists — replace it
      with a pointer, or keep both
- [ ] Run the Phase 1 Task 14 field test from `PLAN-1-salesforce.md` against the
      deployed app (Chrome on Android, Safari on iOS)

## Done

<!-- - [x] YYYY-MM-DD — task -->

- [x] 2026-09-12 — Initialised `project-brain/`, seeded from `context.md`
