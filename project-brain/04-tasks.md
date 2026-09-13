# 04 — Tasks

> Now = this/next session. Next = soon. Later = someday. Done = finished (newest on top, with date).

## Now

### Security — do these first

- [ ] **Make the GitHub repo private.** `project-brain/` is committed to a public repo and
      states that Atlas accepts `0.0.0.0/0` and that its password may be compromised. No
      credentials are exposed, but it is a map.
- [ ] Merge the `admin-date-range` branch via a PR into `main` (CI runs on PRs; merging
      deploys)

### Salesforce — the active thread

- [ ] **User:** delete the test Lead `00QQy00000nmzY2MAI` ("SnapCard Proof 15:20") from
      the UI — the integration user has no Delete on Lead, so the API could not
- [ ] Grant Delete on Lead in `Integration Permission Set`, or accept that
      `npm run sf:smoke` leaves its test Lead behind every run
- [ ] Delete the `Snapcard Integration` permission set — it is assigned but its license
      excludes every CRM object, so it grants nothing and will mislead the next person
- [ ] `SALESFORCE_ENABLED=true` **locally only**, then `npm run sf:smoke -- --full`
- [ ] **User:** read Setup -> Storage Usage -> **File Storage**. The API cannot: the
      integration user lacks "View Setup and Configuration", so `/limits` answers 403
      `API_DISABLED_FOR_ORG`. Card images run ~150-400 KB each, up to 2 per lead, so a
      small DE allowance fills in roughly 25-60 cards. If tight, keep images in Atlas
      and skip `attachImage` — one line, and the images stay viewable in SnapCard.
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

- [ ] **Rotate the Atlas password** — it was pasted into chat, and it is the exact
      control `SETUP.md` §4 relies on to justify `0.0.0.0/0`
- [ ] Narrow Atlas network access once the password is rotated

## Next

- [ ] Delete the three seeded fake leads still in Atlas (Meera Iyer, Daniel Okafor,
      Sofia Rossi)
- [ ] **User:** confirm `MONGODB_URI` is set in hPanel. If it is unset while Salesforce
      is off, the live app stores leads nowhere and they pile up in reps' outboxes.
- [ ] **Deploy = merge to `main`** (Hostinger deploys `main`, not `production`). Open a
      PR from the feature branch first so `ci.yml` runs the Node 20 suite without
      deploying, then merge on green.
- [ ] After deploying: set `SALESFORCE_ENABLED=true` in hPanel and **restart** —
      `env.ts` caches at first read — then read the sync workflow's curl response body.
      `{"skipped":"salesforce_disabled"}` means the flag did not take.
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
- [ ] Per-lead "Retry now" button + `POST /api/leads/[clientId]/retry` (`PLAN-2` Task 6)

## Done

<!-- - [x] YYYY-MM-DD — task -->

- [x] 2026-09-13 — **Admin can see past today** — shared `lead-range.ts` gives `/admin`
      and `/leads` the same Today / 7 days / All pills, filtered in the browser so the
      day boundary is the viewer's rather than Hostinger's UTC (`1e4979d`)
- [x] 2026-09-12 — Corrected the deploy topology in `README.md` and `SETUP.md`
      (Hostinger deploys `main`), fixed the `snapcard1` database name and dropped the
      stale consent line
- [x] 2026-09-12 — `SYNC_SECRET` generated and `/api/sync` verified (401 / 200); the
      server-side retry the outbox depends on now actually works
- [x] 2026-09-12 — Set `IP Relaxation` to "Relax IP restrictions" on the External
      Client App, so the first write from Hostinger is not refused as bad credentials.
      Unverifiable from the dev machine, whose IP was already allowed.
- [x] 2026-09-12 — **Dropped email/password accounts and deleted the 357 lines** —
      `ADMIN_EMAILS` plus the Google domain restriction already cover who gets in and
      who sees `/admin`, so the feature solved a problem the app does not have
- [x] 2026-09-12 — **Salesforce writes a real Lead end to end** — FLS fixed in
      `Integration Permission Set`, and `mapFields` stopped sending the upsert key in
      the body (`4afc396`), which had been failing 100% of writes
- [x] 2026-09-12 — Folded `PLAN-1`, `PLAN-2`, `SETUP.md` and `README.md` into the brain
- [x] 2026-09-12 — Initialised `project-brain/`, seeded from `context.md`, then
      deleted `context.md` so there is one place to read and one place to update
