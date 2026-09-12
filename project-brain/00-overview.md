# 00 — Project Overview

> Identity of the project — what and why. Update only when direction changes.
>
> Seeded on 2026-09-12 from the repo's own `context.md`, which was the informal
> version of this brain. `CLAUDE.md` stays the contract; this folder is the story.

## What is being built

**SnapCard** — a PWA for photographing business cards at events (first outing:
Dreamforce). A rep photographs a card, Gemini extracts the fields, the rep
corrects them and submits, and the lead is stored. It has to work on a phone, on
a bad conference network, and offline.

## Who is it for / what problem does it solve

The thinkvibes.com sales team, working a trade-show floor. Typing a card into a
CRM on a phone between conversations does not happen; cards go in a pocket and
are lost. SnapCard makes capture a photo and a glance, and guarantees the lead
survives a dead signal — the phone keeps an outbox until a server confirms.

## What does "done" look like

- Sign in with a thinkvibes.com account, scan a card, review, submit.
- The lead lands in the store and is visible in `/leads` with a status badge.
- Nothing is lost offline: the outbox retries and only then drops the item.
- An admin can see today's leads per rep and download a CSV.
- Installs to the home screen and renders offline.

## Explicitly OUT of scope

Cut deliberately, by the user. Do not reintroduce without asking:

- **Consent** — the checkbox, the submit gate, the `consent` field on the submit
  payload and the `consent` stamp on the Atlas document are all gone. Old Atlas
  documents still carry the stamp; nothing reads it.
- **Salesforce extras** — Campaign / CampaignMember, `SnapCard_Event__c`,
  `SnapCard_Captured_By__c`, the three consent fields, `LinkedIn__c`.
- **`linkedin`** — dropped everywhere: schema, Gemini prompt, mapping, tests, docs.
- **The other prototypes** — `layout-2.html` and `layout-3.html` are ignored.
  `snapcard-prototypes/` is read-only reference; never edit it, never import from it.
- **Heavy tooling** — no Prisma, no Mongoose, no tRPC, no Redux.
