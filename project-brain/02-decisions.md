# 02 — Decision Log

> Append-only. Newest entry at the TOP. Never edit old entries — if a decision is reversed, add a new entry linking back.
>
> Entries below were reconstructed on 2026-09-12 from `context.md`, `CLAUDE.md` and
> the commit history. Each is dated and anchored to the commit that carried it, so the
> ordering is real even though the writing is after the fact.

## 2026-09-12 — Hostinger deploys from `main`, and the docs are wrong

- **Decision / fact:** Hostinger is connected to **`main`**. Pushing to `main` is a
  production deploy to a live, in-use app. `production` (`efab334`) deploys nothing.
- **Why it is recorded here:** `README.md`'s Branches table and `SETUP.md` §3 both say
  Hostinger deploys `production`. This brain inherited that and produced a plan built on
  it. The user corrected it. Believing the docs costs a wrong deployment plan every time.
- **Impact:** every merge to `main` needs the care of a release, not a merge. The safe
  gate is a **pull request** into `main` — `ci.yml` fires on `pull_request: [main]`, so
  the full Node 20 suite runs with nothing merged and nothing deployed. Worth knowing
  that local development is Node **v24.16.0** against Hostinger's **Node 20**, and CI
  had never run on `salesforce-connect` at all.
- **Left undecided:** whether to point Hostinger at `production` as the docs intend, or
  keep `main` and update the docs. The docs now describe reality either way.

## 2026-09-12 — Salesforce file storage is not a constraint (corrects Session 5)

- **Decision:** keep attaching card images to Salesforce Leads. No code change.
- **Why:** measured, after an earlier recommendation based on a guess. Real images in
  Atlas are a median of **65 KB** and **58 KB per lead**, not the 150-400 KB assumed —
  so 17.8 MB of free file storage holds roughly **315 leads**, not ~35.
- **Corrects:** the Session 5 advice to stop calling `attachImage`. That was wrong and
  was withdrawn before anything was changed.
- **Impact:** none in code. The lesson is the point — an estimate was about to drive a
  design change, and one query against real data replaced it. Data Storage sits at 67%
  but that is Developer Edition sample data; 6 Leads account for ~12 KB of it.

## 2026-09-12 — `/api/leads/backup` is unnecessary, not missing

- **Decision:** do not build it. Remove it from the backlog as a gap.
- **Why:** the `synced` + backup-`failed` case was recorded as depending on a route that
  was never built. It does not. `outbox.ts` re-posts the whole payload to `/api/leads`,
  and because the Salesforce upsert keys on `clientId` it cannot create a duplicate — so
  Atlas gets another attempt and the item clears. It self-heals on the 15 minute timer.
- **Rejected:** building the dedicated route — it would only save one redundant
  Salesforce round trip on a path that is already rare and already correct.
- **Impact:** one fewer thing standing between this app and the event. `PLAN-2` Task 3
  can be ignored.

## 2026-09-12 — Google sign-in is the only way in; password accounts deleted

- **Decision:** SnapCard has exactly one sign-in path — Google, restricted to
  `thinkvibes.com`. `src/lib/password.ts`, `src/lib/password.test.ts` and
  `src/lib/users.ts` (357 lines, scrypt hashing and an `app_users` collection) were
  **deleted**. Recover with `git show 0bcd834` if ever needed.
- **Why:** the user's call, and the reasoning holds. `ADMIN_EMAILS` already decides who
  sees `/admin`, and the `thinkvibes.com` restriction already decides who gets in at
  all. Anyone in the company who signs in gets Scan and My Leads. The feature solved a
  problem the app does not have.
- **Rejected:** finishing it (Credentials provider, login form, `/api/admin/users`,
  admin Users UI, login rate limit) — real work for no need; and leaving it in place,
  which is worse than either, because tested code with zero call sites reads as
  finished to every future session while quietly drifting out of date.
- **Impact:** reverses the 2026-09-12 "Email + password accounts, alongside Google"
  decision above — that entry stays as the record of why it was tried. `CLAUDE.md`'s
  Google-only description is now simply true again, so the "record the auth override"
  task is dropped rather than done. `app_users` was never indexed by
  `scripts/mongo-indexes.ts` and nothing else referenced it.

## 2026-09-12 — The upsert key must never appear in the request body (`4afc396`)

- **Decision:** `mapFields()` does **not** emit `SnapCard_Client_Id__c`. The external
  id travels in the URL path only.
- **Why:** Salesforce rejects the write outright when an upsert names its own external
  id in the sobject data — `INVALID_FIELD: The SnapCard_Client_Id__c field should not
  be specified in the sobject data`. It is a 100% failure, not an edge case: every
  lead came back `needs_review`, and the first real card at the event would have hit it.
- **Rejected:** stripping the field inside `upsertLead` and leaving `mapFields`
  emitting it — that leaves a pure function whose output cannot legally be PATCHed,
  which is a trap for the next caller. `mapFields` has exactly one production caller.
- **Impact:** `PLAN-1` Task 5 specifies `mapFields` as producing
  `SnapCard_Client_Id__c`; that instruction is wrong and must not be followed back in.
  The unit test asserted the id **was** in the body, so the suite confirmed the bug
  instead of catching it — the assertion is now inverted into a regression test.
- **How it hid for so long:** Salesforce has been off since the code was written, so no
  real upsert ever ran. Unit tests over a pure mapper cannot catch a contract the
  remote API enforces. The lesson is in `01-architecture.md` under Gotchas.

## 2026-09-12 — Lead field grants live in `Integration Permission Set`

- **Decision:** the integration user's Lead object and field permissions come from
  **`Integration Permission Set`**. The permission set named `Snapcard Integration` is
  assigned but grants nothing on Lead.
- **Why:** `Snapcard Integration` was created with a license that excludes every core
  CRM object — `Lead`, `Account`, `Contact`, `Opportunity` and `Case` are all absent
  from its Object Settings list, so Lead permissions can never be added to it. This is
  a licensing constraint, not a missing checkbox.
- **Rejected:** granting the fields in `Snapcard Integration` (impossible); recreating
  it with a different license (slower, and the working permission set already existed).
- **Impact:** two similarly-named permission sets are assigned to the integration user
  and only one does anything. **`Snapcard Integration` should be deleted** once leads
  are flowing — an empty permission set with the obvious name is exactly what sent this
  session down an hour-long false trail.

## 2026-09-12 — The Developer Edition org is the production target

- **Decision:** event leads land in the existing `…develop.my.salesforce.com`
  Developer Edition org. There is no separate production org to migrate to.
- **Why:** the user's call, stated directly when asked. It is the org the team has.
- **Rejected:** standing up a sandbox or a production org and redoing the custom field,
  Connected App and permissions there.
- **Impact:** `SETUP.md` §2 says "do this in a sandbox first, then production" and
  warns off throwaway orgs — that instruction no longer describes the plan. DE orgs
  carry small data and **file** storage limits, no uptime SLA, and can be deactivated
  for inactivity. Card images attach as ContentVersion, so **file storage is the limit
  most likely to bite**; if `/limits` shows it is tight, keep images in Atlas only and
  skip `attachImage`. Measure before the event, not during it.

## 2026-09-12 — Salesforce is blocked only by field-level security (corrects an earlier diagnosis)

- **Decision:** treat the org as configured except for FLS. Fix is a permission set
  granting **Read + Edit** on 11 Lead fields to `integration.user@thinkvibes.com`.
- **Why:** measured, not assumed. A read-only describe reports
  `SnapCard_Client_Id__c` **writable** and `Lead.createable = true`,
  `ContentVersion.createable = true`, with `v60.0` reachable — while `Title`, `Email`,
  `Phone`, `Website`, `Street`, `City`, `State`, `PostalCode`, `Country`,
  `Description` and `LeadSource` come back hidden. Those are *standard* fields and
  cannot be absent, so FLS is the only explanation.
- **Corrects:** the brain and `context.md` before it both said the org **is missing**
  `SnapCard_Client_Id__c`. That is false — it exists and is writable. The FLS half of
  that diagnosis was accurate, including the count of eleven.
- **Rejected:** the hypothesis that the user's `Analytics Cloud Integration User`
  license was the blocker. It looks wrong next to the `Minimum Access - API Only
  Integrations` profile, which is conventionally paired with the `Salesforce
  Integration` license — but the object describe disproves it. Noted because the
  mismatch will look alarming to the next person who spots it.
- **Impact:** the Salesforce work is far smaller than the brain implied. Nothing needs
  building; one permission set stands between the app and a working integration.

## 2026-09-12 — Planning docs folded into the brain

- **Decision:** `PLAN-1-salesforce.md`, `PLAN-2-atlas.md`, `SETUP.md` and `README.md`
  were read and their durable content distributed into this brain. The source files
  were **not** deleted.
- **Why:** they were written as forward plans, and the code has since diverged from
  them in ways a future session would otherwise trust the wrong side of.
- **Impact:** where a doc and the code disagreed, the code won and the disagreement is
  recorded below rather than quietly dropped. Four conflicts and two stale
  instructions came out of it — see the next four entries.

## 2026-09-12 — Where the planning docs are now wrong

Recorded rather than silently overwritten, per the fold above.

- **Per-rep attribution.** `PLAN-1` Task 12 says the admin page cannot break leads down
  by rep, and gives a sound reason: the app does not write the capturing rep to
  Salesforce and every Lead is owned by the integration user, so the org has nothing to
  group by. That reasoning held for a Salesforce-only world. Atlas keeps `capturedBy`,
  so `2f5f58d` made per-rep counts real and `/admin` ships them. The plan is not wrong,
  it stopped applying.
- **`0.0.0.0/0` on Atlas network access.** `SETUP.md` §4 sanctions it and names the
  control it relies on: "the strong password + scoped user". **That control is
  compromised** — the Atlas password was pasted into chat. Until it is rotated, the
  open CIDR is protected by a credential of unknown reach. Rotate first, then narrow.
- **`/leads` is server-backed, not Dexie-backed.** `PLAN-1` Task 10 has `/leads` render
  a local `history` table. `2f5f58d` tied a rep's leads to their account instead, so
  they follow the person rather than the handset. The Dexie outbox remains, for
  in-flight items only.
- **Consent is gone.** It runs through `PLAN-1` Tasks 3 and 9 and the `PLAN-2` document
  shape. All of it is dead — see the consent entry below. Do not reinstate it from the
  plans.
- **Stale instructions in `SETUP.md`, worth fixing before the next environment:**
  §4 says `MONGODB_DB=snapcard` and scopes the Atlas user to database `snapcard`; the
  real database is `snapcard1`, and following §4 as written gives a working user
  pointed at the wrong database. §3's env table repeats `snapcard`.

## 2026-09-12 — Salesforce upsert by external id, never a plain POST

- **Decision:** every Salesforce write is
  `PATCH /sobjects/Lead/SnapCard_Client_Id__c/{clientId}`. `POST /sobjects/Lead` is
  never used. The `clientId` is minted on the phone before any network call.
- **Why:** **not stated in the docs.** `CLAUDE.md` gives it as a hard rule and
  `PLAN-1` Task 5 gives the observable test — upsert twice with the same clientId and
  get the same Id both times, creating nothing new. The rationale itself was never
  written down, so it is not reconstructed here.
- **Rejected:** not recorded.
- **Impact:** the outbox can retry freely, and a double-tapped "Save lead" cannot
  produce two Leads.

## 2026-09-12 — Salesforce org setup choices (`SETUP.md` §2)

- **Decision:** one custom field only (`SnapCard_Client_Id__c`, Text(36), External ID,
  Unique). A dedicated integration user. A Connected App with the client-credentials
  flow, Run As that user. Duplicate rules set to action "Block" with "Report". Set up
  in a sandbox first, then production.
- **Why:** "Block" + "Report" is specifically what makes Salesforce return
  `DUPLICATES_DETECTED` *with the matching records attached*, which is what lets the
  app report `duplicateOf` instead of just failing. Sandbox-not-scratch-org because
  scratch orgs expire and the event would outlive one. The single-custom-field rule
  keeps the org's configuration burden to the minimum that still makes upsert possible.
- **Rejected:** duplicate rules set to "Allow" — duplicates would simply be created,
  with the app unable to tell. Scratch orgs, for the expiry above.
- **Impact:** if the rule is ever set to "Allow", the `duplicate` branch of
  `classifyError` goes dead and the event produces silent duplicates. Worth confirming
  with the admin before the org is switched back on.

## 2026-09-12 — Mongo client cached on `globalThis`, 30s server selection

- **Decision:** one `MongoClient`, cached on `globalThis`, `maxPoolSize: 10`,
  `serverSelectionTimeoutMS: 30_000`, and no `socketTimeoutMS` at all.
- **Why:** the Hostinger process is long-lived, so a pool per request is waste; caching
  on `globalThis` rather than a module variable survives Next's module reloads.
  `PLAN-2` Task 1 specified a 3s selection timeout — that lost to measurement, on a
  link whose handshake can take 21s. The removed `socketTimeoutMS` is the same story
  from the other end: at 20s it was killing healthy operations.
- **Rejected:** `PLAN-2`'s 3s budget, and the 20s socket timeout that replaced it.
- **Impact:** paired with `withMongo()` and `resetMongoClient()`, which exist because a
  single `read ECONNRESET` used to poison the cached client for the life of the
  process. 10.5s -> 0.15s after the fix.

## 2026-09-12 — Atomic claim in the cron only, not on the live path

- **Decision:** `/api/sync` claims each lead with a `findOneAndUpdate` setting
  `claimedUntil = now + 60s`; the live `/api/leads` path has no claim.
- **Why:** stated in `PLAN-2` Task 4 — the live path only upserts leads Atlas has never
  seen, and the cron only touches leads already marked `failed`, so the two cannot
  contend for the same document.
- **Rejected:** adding the same claim to the live path, as unnecessary cost on the
  latency-sensitive route.
- **Impact:** two cron runs overlapping is safe; a lead is processed once.

## 2026-09-12 — Google OAuth consent screen set to Internal

- **Decision:** the OAuth consent screen is User type **Internal**, and the app *also*
  checks `hd`, `email_verified` and the email domain.
- **Why:** Internal already limits sign-in to the Workspace; the in-app checks are
  belt-and-braces. Why Internal was chosen over External-plus-checks is **not stated**
  in `SETUP.md`.
- **Rejected:** not recorded.
- **Impact:** the OAuth client lives in a project owned by the thinkvibes.com org, and
  must stay there for Internal to mean anything.

## 2026-09-12 — Gemini API on the paid tier

- **Decision:** enable billing on the Gemini API project before the event.
- **Why:** stated in `SETUP.md` §5 — the paid tier carries higher rate limits, and
  prompts are not used to improve Google products. Card contents are other people's
  personal data, so the second reason matters as much as the first. Cost at booth
  volume is negligible.
- **Rejected:** the free tier, on rate limits and data use.
- **Impact:** a booth-day burst of scans will not hit a quota wall.

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
