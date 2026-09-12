---
project: snapcard
status: active
last_log: 2026-09-12
---

# 03 — Progress

> The "you are here" map. Rewritten every session by /brain log. Keep the frontmatter above updated: `last_log` = date of the latest log, `status` = active | paused | done.

## Current state

The app works end to end on MongoDB Atlas. A rep signs in with Google, scans a card,
Gemini fills the fields in ~2s, the rep corrects and submits, and the lead is stored
with both card images; the Dexie outbox retries offline and only drops an item once a
server confirms. `/leads` shows a rep's own leads with status badges, a detail sheet
with the card photo, and delete-after-confirm. `/admin` shows today's leads, the count
per rep and a CSV download. It installs as a PWA. Typecheck, lint and 150+ vitest
tests pass.

**Salesforce now works.** Proven against `thinkvibessoftware3-dev-ed` on 2026-09-12:
two upserts with one `clientId` returned the same Lead Id, all 16 mapped fields landed,
and the card image attached. It took fixing field-level security (the grants were in a
permission set whose license excludes CRM objects) and a real bug in our own code — the
upsert key was being sent in the request body, which failed 100% of writes.

`SALESFORCE_ENABLED` is still **`false`** everywhere; it was set only inside one-off
verification scripts. Atlas remains the system of record until that flag is flipped
deliberately, which is a decision still to be made.

User management is **half built**: `src/lib/password.ts` (scrypt, 12 passing tests)
and `src/lib/users.ts` (the `app_users` collection) exist. Nothing wires them up yet.

Not deployed with the current code: `production` is well behind `main`, and merging
`main` into `production` **is** the deploy. It has not been asked for.

The planning docs (`PLAN-1-salesforce.md`, `PLAN-2-atlas.md`, `SETUP.md`, `README.md`)
have been folded into this brain and are no longer the place to look for current truth
— they describe a Salesforce-first app with consent, which this is not. They are still
in the repo; `02-decisions.md` records exactly where they are now wrong.

## Start here next time

**Salesforce, not user management.** Writes are proven; what remains is everything
between "it works on this laptop" and "it works at the event". In order:

1. **Relax or whitelist the IP** on the External Client App — it is set to *Enforce IP
   restrictions*, and Hostinger's outbound IP differs from the dev machine's, so the
   first production write fails auth in a way that looks like bad credentials.
2. `/limits` for DE **file** storage — card images are ContentVersions.
3. Duplicate rules (**Block + Report**), assignment rules (**View All** on Lead if any
   are active), validation rules.
4. **Decide what turning Salesforce on means for Atlas** — not yet discussed with the
   user, and it is not a default to pick silently.
5. `SALESFORCE_ENABLED=true` locally, full `sf:smoke`, then Hostinger env vars, deploy.

See Session 4 in `journal/2026-09-12.md` for the detail.

User management is paused mid-build — resume it after Salesforce, in this order,
each step a commit:

1. Add the **Credentials provider** to `src/lib/auth.ts` (Google stays; the
   thinkvibes.com domain restriction is untouched by it).
2. Add the **password form** to `src/app/(auth)/login/page.tsx`.
3. Build **`/api/admin/users`** (create, list, disable — never delete, so a lead's
   `capturedBy` still resolves to a person).
4. Build the **admin Users UI**.
5. Add a **rate limit on password login** (`src/lib/ratelimit.ts` already exists).

Both existing-file edits (1 and 2) are deliberately still unmade — the user asked for
nothing else to change while `password.ts` and `users.ts` went in.

## Milestones

- [x] Scan flow: capture -> review -> saved, with Gemini extraction
- [x] Offline outbox that never loses a lead
- [x] MongoDB Atlas storage, images included
- [x] Salesforce integration written, tested, and switchable
- [x] `/leads` with detail sheet and delete
- [x] `/admin` with today's leads, per-rep counts and CSV
- [x] PWA install + offline render
- [ ] Email/password accounts (half done — see "Start here next time")
- [ ] Deploy the current code to Hostinger (`main` -> `production`)
- [ ] Salesforce back on, once the org has the custom field and the FLS grants

## Blocked / waiting on

- **Salesforce org** — down to one thing: FLS grants on 11 standard Lead fields for
  `integration.user@thinkvibes.com`. `SnapCard_Client_Id__c` already exists and is
  writable, contrary to what this file said before 2026-09-12. In the user's hands now.
- **Hostinger** — env vars still to be set there, and a Google OAuth redirect URI for
  `snapcard.thinkvibes-exam.com`.
- **Security housekeeping** — the Atlas password was pasted into chat and should be
  rotated; Atlas network access is open to `0.0.0.0/0` and should be narrowed.
