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

Salesforce is **off** (`SALESFORCE_ENABLED=false`) but complete and tested — the org
still lacks `SnapCard_Client_Id__c` and hides eleven Lead fields behind FLS from the
integration user. Atlas is the system of record until that changes.

User management is **half built**: `src/lib/password.ts` (scrypt, 12 passing tests)
and `src/lib/users.ts` (the `app_users` collection) exist. Nothing wires them up yet.

Not deployed with the current code: `production` is well behind `main`, and merging
`main` into `production` **is** the deploy. It has not been asked for.

## Start here next time

Finish user management, in this order — each step is a commit:

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

- **Salesforce org** — needs `SnapCard_Client_Id__c` (Text(36), External ID, Unique)
  and FLS grants on eleven standard Lead fields for the integration user. Nobody could
  fix it in the week it was needed; not blocking anything now that Atlas is the store.
- **Hostinger** — env vars still to be set there, and a Google OAuth redirect URI for
  `snapcard.thinkvibes-exam.com`.
- **Security housekeeping** — the Atlas password was pasted into chat and should be
  rotated; Atlas network access is open to `0.0.0.0/0` and should be narrowed.
