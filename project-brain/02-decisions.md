# 02 — Decision Log

> Append-only. Newest entry at the TOP. Never edit old entries — if a decision is reversed, add a new entry linking back.
>
> Entries below were reconstructed on 2026-09-12 from `context.md`, `CLAUDE.md` and
> the commit history. Each is dated and anchored to the commit that carried it, so the
> ordering is real even though the writing is after the fact.

## 2026-09-12 — Project brain replaces `context.md`

- **Decision:** persistent memory lives in `project-brain/`, committed with the code.
  `context.md` was seeded into it and then **deleted** — `git show 784b16d:context.md`
  is the original if it is ever wanted.
- **Why:** `context.md` was already doing this job informally and was growing without
  structure; a cold session had to read it whole to find the resume point. Two files
  claiming to be the story is how both go stale — the next session updates whichever
  one it happens to open.
- **Rejected:** keeping `context.md` alongside the brain (guaranteed drift); cutting
  it down to a pointer file (an extra hop for no gain, since git keeps the original).
- **Impact:** `CLAUDE.md` stays the contract. `project-brain/03-progress.md` + the
  newest journal file are what a session reads first, and the brain is now the single
  place work gets recorded.

## 2026-09-12 — Consent removed entirely (`c177f44`, `6d1fcf8`)

- **Decision:** stop collecting consent. The checkbox, the submit gate, the `consent`
  field on the submit payload and the `consent` stamp on the Atlas document are gone.
- **Why:** the user asked for it. It was never sent to Salesforce anyway — it had
  become a UI gate protecting nothing.
- **Rejected:** keeping it as a UI-only gate (the state it was in) — friction with no
  downstream consumer.
- **Impact:** documents written before this still carry the old stamp; nothing reads it.

## 2026-09-12 — Email + password accounts, alongside Google (`0bcd834`)

- **Decision:** admins can create email/password accounts for people without a
  thinkvibes.com Google account. Passwords hash with Node's built-in `scrypt`.
- **Why:** Google sign-in cannot cover everyone who needs in. `scrypt` is memory-hard
  and ships with Node — no native module to compile on Hostinger.
- **Rejected:** invite links and a Google allow-list (neither solves "no Google
  account at all"); bcrypt and argon2 (native builds on Hostinger);
  replacing Google outright (breaks everyone's current sign-in and throws away the
  domain restriction that protects the app).
- **Impact:** `src/lib/password.ts`, `src/lib/users.ts`, the `app_users` collection.
  Still to build: the Credentials provider, the login form, `/api/admin/users`, the
  admin Users UI, and a rate limit on password login. `CLAUDE.md` still says
  Google-only and needs updating.
- **Bug worth remembering:** `authenticate()` verifies against a decoy hash when no
  such user exists, so a missing account costs the same as a real one. The first decoy
  was a hand-written base64 constant and returned in **251ms against a real hash's
  ~300ms** — it did not match the current work factor, bailed out cheap, and leaked
  exactly the signal it existed to hide. It is now generated at first use with the
  real `hashPassword()`. Measured after: 306ms vs 300ms.

## 2026-09-11 — MongoDB Atlas became the system of record; Salesforce switched off (`1703562`, `888dde7`)

- **Decision:** `SALESFORCE_ENABLED=false`. `upsertLead` short-circuits to
  `{ status: "skipped" }`, no images are attached, the sync cron is a no-op, and the
  outbox reducer treats "skipped" as "the backup saved it, let the item go."
- **Why:** the Salesforce org was never signed off — it is missing
  `SnapCard_Client_Id__c` and hides eleven standard Lead fields behind field-level
  security from the integration user (found by `9a9c5e3`, which checks Lead field
  access before trying to write one).
- **Rejected:** waiting for the org (blocks the event); deleting the Salesforce code
  (throws away correct, tested work for a reversible problem).
- **Impact:** inverts priority 1 in `CLAUDE.md` for as long as it is set, and nothing
  else. `MONGODB_URI` must be set, or a lead exists only on the phone. Flipping the
  env var back turns Salesforce on with the mapping, upsert, retry and attachment
  logic intact.

## 2026-09-11 — `gemini-3.5-flash`, not flash-lite (`4a47dac`)

- **Decision:** `GEMINI_MODEL=gemini-3.5-flash`.
- **Why:** measured. flash-lite took 24-33s per scan and timed out mid-scan;
  flash is ~2s.
- **Rejected:** `gemini-3.5-flash-lite`, on cost grounds — it lost on latency.
- **Impact:** the model name stays an env var, so this is one line to revisit.

## 2026-09-11 — Salesforce field scope cut twice (`e9622e9`, `b8ffb71`)

- **Decision:** nothing is written to Salesforce beyond the standard Lead fields plus
  `SnapCard_Client_Id__c`. Card images are still attached as a ContentVersion.
- **Why:** the user cut it, twice, to shrink what the org had to be configured for.
- **Rejected:** Campaign / CampaignMember membership, `SnapCard_Event__c`,
  `SnapCard_Captured_By__c`, the three consent fields, `LinkedIn__c`.
- **Impact:** `linkedin` was dropped completely — schema, Gemini prompt, field
  mapping, tests and docs. The review form is exactly: First Name*, Last Name*,
  Company, Email*, Phone*, Job Title, Website, Address, Description.

## 2026-09-11 — Cobalt is the only visual reference (`f4b38f9`)

- **Decision:** `snapcard-prototypes/layout-1.html` ("Cobalt") is the sole design
  source. Rebuilt in Tailwind + shadcn themed to its tokens.
- **Why:** one reference, one language. The prototype folder stays read-only —
  never edited, never imported from.
- **Rejected:** `layout-2.html` and `layout-3.html`; pasting the prototype's HTML/CSS
  (it carries simulated scanning, fake Salesforce sync and `localStorage`, none of
  which is the spec).
- **Impact:** design comes from the prototype, behaviour comes from `CLAUDE.md`.
