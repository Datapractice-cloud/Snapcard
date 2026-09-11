"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { AddressBook } from "@phosphor-icons/react/dist/csr/AddressBook";
import { ArrowsClockwise } from "@phosphor-icons/react/dist/csr/ArrowsClockwise";
import { MagnifyingGlass } from "@phosphor-icons/react/dist/csr/MagnifyingGlass";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusChip } from "@/components/lead-status";
import { LeadDetailSheet, type LocalLead } from "@/components/lead-detail-sheet";
import { outboxDb, processOutbox } from "@/lib/client/outbox";
import { initialsFor } from "@/lib/initials";
import type { HistoryItem } from "@/lib/client/outbox";

/** Cobalt's contact avatars, cycled so a long list stays scannable. */
const AVATAR_TONES = [
  "bg-brand-soft text-brand",
  "bg-ok-soft text-ok",
  "bg-[#fff7ed] text-[#c2410c]",
  "bg-[#fdf2f8] text-[#be185d]",
  "bg-[#f5f3ff] text-[#6d28d9]",
];

export function LeadsList() {
  const [query, setQuery] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [open, setOpen] = useState<{ clientId: string; local: LocalLead } | null>(null);

  const leads = useLiveQuery(
    () => outboxDb().history.orderBy("createdAt").reverse().limit(200).toArray(),
    [],
  );
  const waiting = useLiveQuery(() => outboxDb().outbox.count(), []) ?? 0;

  async function syncNow() {
    setSyncing(true);
    try {
      await processOutbox({ force: true });
    } finally {
      setSyncing(false);
    }
  }

  // undefined means Dexie has not answered yet; an empty array means no leads.
  if (leads === undefined) {
    return <p className="py-12 text-center text-[13.5px] text-subtle">Loading your leads…</p>;
  }

  const shown = filter(leads, query);

  return (
    <div>
      {waiting > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-[14px] border border-[#f3e4c4] bg-warn-soft px-4 py-3">
          <ArrowsClockwise size={18} weight="bold" className="shrink-0 text-warn" />
          <p className="flex-1 text-[13.5px] font-bold text-warn">
            {waiting} {waiting === 1 ? "lead is" : "leads are"} waiting to sync. They are safe on this phone.
          </p>
          <Button type="button" variant="outline" onClick={syncNow} disabled={syncing} className="h-10">
            {syncing ? "Syncing…" : "Sync now"}
          </Button>
        </div>
      )}

      {leads.length > 0 && (
        <div className="relative mb-4">
          <MagnifyingGlass
            size={17}
            weight="bold"
            className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-subtle"
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name or company"
            aria-label="Search your leads"
            className="rounded-xl border-line pl-10 shadow-card"
          />
        </div>
      )}

      {shown.length === 0 ? (
        <Empty searching={query.length > 0} />
      ) : (
        <ul className="space-y-2.5">
          {shown.map((lead, index) => (
            <li key={lead.clientId}>
              <button
                type="button"
                onClick={() =>
                  setOpen({
                    clientId: lead.clientId,
                    // Handed over so the sheet can still show the lead if the
                    // server has no record of it.
                    local: {
                      fields: lead.fields,
                      createdAt: lead.createdAt,
                      salesforce: lead.salesforce,
                    },
                  })
                }
                className="flex w-full items-center gap-[13px] rounded-[14px] border border-line bg-surface px-4 py-[15px] text-left shadow-card hover:bg-surface-2"
              >
              <span
                className={`grid size-[42px] shrink-0 place-items-center rounded-xl text-sm font-extrabold ${
                  AVATAR_TONES[index % AVATAR_TONES.length]
                }`}
                aria-hidden
              >
                {initialsFor(`${lead.fields.firstName} ${lead.fields.lastName}`, lead.fields.email)}
              </span>

              <div className="min-w-0 flex-1">
                <p className="truncate text-[14.5px] font-extrabold">
                  {[lead.fields.firstName, lead.fields.lastName].filter(Boolean).join(" ") || "No name"}
                </p>
                <p className="truncate text-[12.5px] text-muted-foreground">
                  {[lead.fields.title, lead.fields.company].filter(Boolean).join(" · ") || "No company"}
                </p>
              </div>

                <StatusChip salesforce={lead.salesforce} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <LeadDetailSheet
        clientId={open?.clientId ?? null}
        fallback={open?.local ?? null}
        onClose={() => setOpen(null)}
      />
    </div>
  );
}

function filter(leads: HistoryItem[], query: string): HistoryItem[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return leads;

  return leads.filter((lead) =>
    `${lead.fields.firstName} ${lead.fields.lastName} ${lead.fields.company} ${lead.fields.email}`
      .toLowerCase()
      .includes(needle),
  );
}

function Empty({ searching }: { searching: boolean }) {
  return (
    <div className="rounded-[14px] border border-line bg-surface px-5 py-[52px] text-center shadow-card">
      <AddressBook size={40} weight="duotone" className="mx-auto text-subtle" />
      <p className="mt-3 text-[15.5px] font-extrabold">{searching ? "No matches" : "No leads yet"}</p>
      <p className="mt-1 text-[13.5px] text-muted-foreground">
        {searching ? "Try a different search." : "Scan your first business card to get started."}
      </p>
    </div>
  );
}
