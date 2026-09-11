# SnapCard — one-time setup (humans, not Claude Code)

Do §1–3 before Phase 1 Task 5. Do §4 before Phase 2.

## 1. Google OAuth (thinkvibes.com Workspace)

1. Google Cloud Console → a project owned by the thinkvibes.com org →
   APIs & Services → OAuth consent screen → User type **Internal**.
   (Internal already limits sign-in to your Workspace; the app checks `hd`
   and the email domain as well.)
2. Credentials → Create OAuth client ID → Web application.
   Authorised JavaScript origins: `http://localhost:3000`, `https://scan.thinkvibes.com`.
   Authorised redirect URIs: `http://localhost:3000/api/auth/callback/google`,
   `https://scan.thinkvibes.com/api/auth/callback/google`.
3. Copy client ID/secret → `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`.
   Generate `AUTH_SECRET` with `openssl rand -base64 32`.
4. Put admin emails in `ADMIN_EMAILS`.

## 2. Salesforce (ask the org admin)

Do this in a sandbox first, then production. Do **not** use a scratch org
for the event — they expire.

1. **Custom field on Lead** (Setup → Object Manager → Lead → Fields):
   - `SnapCard_Client_Id__c` — Text(36), ✔ External ID, ✔ Unique (case-sensitive)

   That is the only one. Everything else the app writes is a standard Lead
   field; see the Salesforce contract in CLAUDE.md.
2. **Integration user**: a dedicated user (API Only permission if licensed),
   profile/permission set with Create/Edit on Lead, Create on
   ContentVersion (for the card image), and field-level access to
   `SnapCard_Client_Id__c` and to every standard field in the contract.
3. **Connected App / External Client App** with OAuth enabled,
   ✔ "Enable Client Credentials Flow", Run As = the integration user,
   scopes `api`, `refresh_token`. Copy consumer key/secret → `SF_CLIENT_ID`,
   `SF_CLIENT_SECRET`. `SF_LOGIN_URL` = the org's My Domain URL
   (`https://xxx.my.salesforce.com`), not `login.salesforce.com`.
4. **Duplicate rules**: decide with the admin. Recommended for events:
   keep existing Lead, allow the app to read the match (rule action
   "Block" with "Report" is what returns `DUPLICATES_DETECTED` with match
   records). If the rule is set to "Allow", duplicates will simply be
   created — tell the dev team which it is.
5. Confirm any **validation rules** on Lead that could reject event data
   (e.g. required Industry). Either relax them for `LeadSource = 'Event'`
   or make the app collect that field.

## 3. Hostinger

Requires a Business, Unlimited, or Cloud plan (Node.js web apps). Premium
does not run Node apps.

1. DNS: add `scan` subdomain pointing at the hosting plan.
2. hPanel → Websites → Add Website → Node.js web app → Import Git repository
   → select repo → branch `production` → framework Next.js → Node 20.
3. Add every variable from `.env.example` in the app settings **before** the
   first deploy (`NEXT_PUBLIC_*` values are baked in at build time).
4. Deploy. Then: force HTTPS, confirm SSL is active, purge CDN cache.
5. After any change to env vars or the `production` branch: Redeploy, then
   purge CDN cache again.
6. For Phase 2 cron you can use GitHub Actions (default) or hPanel cron with
   `curl -fsS -X POST -H "Authorization: Bearer <SYNC_SECRET>" https://scan.thinkvibes.com/api/sync`.

## 4. MongoDB Atlas (Phase 2)

1. Create a project and a **Free** cluster in the region closest to the
   Hostinger server (check the server location in hPanel).
2. Database Access: user `snapcard_app`, role **readWrite** on database
   `snapcard` only, long random password.
3. Network Access: try the Hostinger outbound IP first; if connections
   fail, use `0.0.0.0/0` (the strong password + scoped user is the control).
4. Copy the SRV connection string → `MONGODB_URI`, set `MONGODB_DB=snapcard`.
5. Generate `SYNC_SECRET` with `openssl rand -hex 32`; add it to hPanel env
   and to GitHub repo secrets along with `APP_URL`.

## 5. Before the event

- Enable billing on the Gemini API project (paid tier: higher rate limits,
  and prompts aren't used to improve Google products). Cost at booth
  volume is negligible.
- Every rep: install the app to their home screen and sign in **before**
  travelling. Sessions last 30 days.
- Run `npm run sf:smoke -- --full` against the production org, then the
  Phase 1 Task 14 and Phase 2 Task 8 field tests on the production URL.
  Delete the test Leads afterwards.
