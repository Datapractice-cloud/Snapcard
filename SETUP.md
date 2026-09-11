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
5. **Lead Assignment Rules**: the app does **not** send the
   `Sforce-Auto-Assign` header, so Salesforce applies its default of TRUE and
   any *active* Lead Assignment Rule will run on every upsert. Decide with the
   admin which you want:
   - **Rules active** (normal): leads are routed to real owners, not left on
     the integration user. This is usually what you want, but it means the
     integration user stops owning the records it just created — so give it
     **View All** on Lead, or the `/admin` table and the Phase 2 reconcile job
     will silently stop seeing leads once they are reassigned.
   - **No rules**: every Lead stays owned by the integration user. Nothing
     extra to configure.

   Either way, check that no rule reassigns `LeadSource = 'Event'` to a queue
   nobody watches during the event.
6. Confirm any **validation rules** on Lead that could reject event data
   (e.g. required Industry). Either relax them for `LeadSource = 'Event'`
   or make the app collect that field.

## 3. Hostinger

Requires a Business, Unlimited, or Cloud plan (Node.js web apps). Premium
does not run Node apps.

1. DNS: add `scan` subdomain pointing at the hosting plan.
2. hPanel → Websites → Add Website → Node.js web app → Import Git repository
   → select the repo → branch `production` → framework Next.js → Node 20 or
   newer. `package.json` declares `engines.node >= 20.6.0`; 20.6 is the floor
   because `npm run sf:smoke` uses `node --env-file`.
   Build command `npm run build`, start command `npm run start`.
3. Add **every** variable below in the app settings **before** the first
   deploy. Anything named `NEXT_PUBLIC_*` is compiled into the JavaScript the
   browser downloads, so it is fixed at build time — changing one later needs a
   redeploy, not a restart, and it must never hold a secret.
4. Deploy. Then: force HTTPS, confirm SSL is active, purge CDN cache.
5. After any change to env vars or the `production` branch: Redeploy, then
   purge CDN cache again.
6. For Phase 2 cron you can use GitHub Actions (default) or hPanel cron with
   `curl -fsS -X POST -H "Authorization: Bearer <SYNC_SECRET>" https://scan.thinkvibes.com/api/sync`.

### Environment variables production needs

Phase 1 will not start without every variable in the first table.
`src/lib/env.ts` validates them when the server boots and names the ones that
are wrong.

| Variable | Baked in at build? | Secret? | Value |
|---|---|---|---|
| `AUTH_SECRET` | no | **yes** | `openssl rand -base64 32`. Changing it signs everyone out. |
| `AUTH_GOOGLE_ID` | no | no | Google OAuth client id, ending `.apps.googleusercontent.com` — no scheme, no trailing slash |
| `AUTH_GOOGLE_SECRET` | no | **yes** | Google OAuth client secret, `GOCSPX-…` |
| `AUTH_TRUST_HOST` | no | no | `true` on Hostinger — TLS terminates at the proxy. Sign-in fails with UntrustedHost if this is `false`. |
| `ALLOWED_EMAIL_DOMAIN` | no | no | `thinkvibes.com` |
| `ADMIN_EMAILS` | no | no | Comma-separated. These users see `/admin`. |
| `NEXT_PUBLIC_APP_URL` | **yes** | no | `https://scan.thinkvibes.com` |
| `GEMINI_API_KEY` | no | **yes** | Google AI Studio key |
| `GEMINI_MODEL` | no | no | `gemini-3.5-flash`. Not `flash-lite`: measured at 25-33s per card, past the route timeout. |
| `SF_LOGIN_URL` | no | no | The org My Domain URL **with** `https://`, not `login.salesforce.com` |
| `SF_CLIENT_ID` | no | no | Connected App consumer key |
| `SF_CLIENT_SECRET` | no | **yes** | Connected App consumer secret |
| `SF_API_VERSION` | no | no | `v60.0` |

Phase 2 only — leave unset until the Atlas work lands:

| Variable | Baked in at build? | Secret? | Value |
|---|---|---|---|
| `SYNC_SECRET` | no | **yes** | `openssl rand -hex 32`. Also add to GitHub repo secrets. |
| `MONGODB_URI` | no | **yes** | Atlas SRV connection string |
| `MONGODB_DB` | no | no | `snapcard` |

`NEXT_PUBLIC_APP_URL` is the only build-time variable, and it holds nothing
secret — which is the rule: if a value must stay private, it must not be
`NEXT_PUBLIC_*`, because that prefix ships it to every browser.

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
