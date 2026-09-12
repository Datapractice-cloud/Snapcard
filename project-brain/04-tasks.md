# 04 — Tasks

> Now = this/next session. Next = soon. Later = someday. Done = finished (newest on top, with date).

## Now

### Salesforce — the active thread

- [ ] **User:** permission set granting Read + Edit on `Title`, `Email`, `Phone`,
      `Website`, `Description`, `LeadSource` and the compound `Address` row, assigned
      to `integration.user@thinkvibes.com`. ContentVersion needs nothing.
- [ ] Re-run `checkLeadFieldAccess()` — expect `0 of 15 blocked`
- [ ] `SALESFORCE_ENABLED=true` **locally only**, then `npm run sf:smoke -- --full`
- [ ] Query `/limits` — DE **file** storage is the ceiling card images will hit. If
      tight, keep images in Atlas and skip `attachImage`.
- [ ] Confirm duplicate rules are **Block + Report** — on "Allow" the `duplicate`
      branch goes dead and the event makes silent duplicates
- [ ] If any Lead Assignment Rule is active, give the integration user **View All** on
      Lead, or `/admin` silently empties as leads are reassigned
- [ ] Check Lead validation rules that would reject event data
- [ ] **Decide what turning Salesforce on means for Atlas** — the flag does not turn
      Atlas off, and `skipped` is currently what lets an outbox item drop. Needs a real
      decision with the user, not a default.
- [ ] Add a permanent read-only `npm run sf:check` (wraps `checkLeadFieldAccess` +
      object describe) so this is one command before every event

### User management — paused mid-build, resume after Salesforce

- [ ] Credentials provider in `src/lib/auth.ts` — alongside Google, not replacing it
- [ ] Password form on `src/app/(auth)/login/page.tsx`
- [ ] `/api/admin/users` — create, list, disable (never delete)
- [ ] Admin Users UI
- [ ] Rate limit password login (reuse `src/lib/ratelimit.ts`)
- [ ] **Rotate the Atlas password** — it was pasted into chat, and it is the exact
      control `SETUP.md` §4 relies on to justify `0.0.0.0/0`
- [ ] Narrow Atlas network access once the password is rotated

## Next

- [ ] Record the auth override in `CLAUDE.md`: Google-only -> Google + credentials
- [ ] Fix `SETUP.md`: §3 and §4 both say `MONGODB_DB=snapcard` and scope the Atlas user
      to database `snapcard`. The real database is `snapcard1` — following §4 as
      written builds a working user pointed at the wrong database.
- [ ] Fix `README.md`: it still says the rep "confirms consent". Consent was removed.
- [ ] Delete the three seeded fake leads still in Atlas (Meera Iyer, Daniel Okafor,
      Sofia Rossi)
- [ ] Deploy: merge `main` into `production`. `production` is well behind `main`, and
      merging **is** the deploy — only when the user asks.
- [ ] Set the Hostinger environment variables (every one in `SETUP.md` §3, before the
      first build — `AUTH_TRUST_HOST=true` and `NEXT_PUBLIC_APP_URL` are the two that
      get missed)
- [ ] Add the Google OAuth redirect URI for `snapcard.thinkvibes-exam.com`

## Later

### Admin, from `PLAN-2` Task 6 — buildable today

- [ ] Storage meter on `/admin`: `db.stats()` -> `dataSize + indexSize` against the
      512 MB free-tier ceiling, warn at 80%
- [ ] Filter the admin lead list by status

### Tests from `PLAN-2` Task 7 still worth adding

- [ ] A throwing `BackupStore` still yields `salesforce.status: "synced"` in the
      `/api/leads` response
- [ ] Sync route: a claimed lead is skipped; a retryable failure increments `attempts`
      with the right backoff; `needs_review` stops retrying

### Field tests (manual, need a deployed URL)

- [ ] `PLAN-1` Task 14: 30 real cards on iPhone + 30 on Android noting edits, 5 leads
      submitted in airplane mode reaching the store exactly once, double-tapped save
      producing one lead, app killed mid-upload and recovering, card image visible on
      the saved lead
- [ ] `PLAN-2` Task 8: break Atlas and confirm the phone retries; break Salesforce and
      confirm the sync workflow drains with no duplicates (needs Salesforce on)

### Blocked on Salesforce coming back

Gated on the org getting `SnapCard_Client_Id__c` and the FLS grants, then
`SALESFORCE_ENABLED=true`. None of these can be tested before that.

- [ ] Confirm with the org admin that Lead duplicate rules are "Block" + "Report" — on
      "Allow", the `duplicate` branch goes dead and the event makes silent duplicates
- [ ] Give the integration user **View All** on Lead if any Lead Assignment Rule is
      active, or `/admin` and reconcile will silently stop seeing reassigned leads
- [ ] `POST /api/reconcile` + `.github/workflows/reconcile.yml` (`PLAN-2` Task 5) —
      Salesforce -> Atlas backfill
- [ ] `POST /api/leads/backup` (`PLAN-2` Task 3) — the phone's `backupOnly` retry path,
      reachable only when Salesforce succeeds and Atlas fails
- [ ] Per-lead "Retry now" button + `POST /api/leads/[clientId]/retry` (`PLAN-2` Task 6)

## Done

<!-- - [x] YYYY-MM-DD — task -->

- [x] 2026-09-12 — Folded `PLAN-1`, `PLAN-2`, `SETUP.md` and `README.md` into the brain
- [x] 2026-09-12 — Initialised `project-brain/`, seeded from `context.md`, then
      deleted `context.md` so there is one place to read and one place to update
