"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { AddressBook } from "@phosphor-icons/react/dist/csr/AddressBook";
import { ArrowsClockwise } from "@phosphor-icons/react/dist/csr/ArrowsClockwise";
import { CloudSlash } from "@phosphor-icons/react/dist/csr/CloudSlash";
import { MagnifyingGlass } from "@phosphor-icons/react/dist/csr/MagnifyingGlass";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusChip } from "@/components/lead-status";
import { LeadDetailSheet, type LocalLead } from "@/components/lead-detail-sheet";
import { outboxDb, processOutbox } from "@/lib/client/outbox";
import { initialsFor } from "@/lib/initials";
import { cn } from "@/lib/utils";
import type { HistoryItem } from "@/lib/client/outbox";

/** Cobalt's contact avatars, cycled so a long list stays scannable. */
const AVATAR_TONES = [
  "bg-brand-soft text-brand",
  "bg-ok-soft text-ok",
  "bg-[#fff7ed] text-[#c2410c]",
  "bg-[#fdf2f8] text-[#be185d]",
  "bg-[#f5f3ff] text-[#6d28d9]",
];

/**
 * How far back the list reaches.
 *
 * "All" is first and is the default on purpose: this screen exists because
 * leads appeared to have gone missing, and a filter that quietly hid anything
 * older than a week would look like exactly that bug.
 */
const RANGES = [
  { key: "all", label: "All" },
  { key: "today", label: "Today" },
  { key: "7", label: "7 days" },
  { key: "30", label: "30 days" },
] as const;

type RangeKey = (typeof RANGES)[number]["key"];

const DAY_MS = 24 * 60 * 60 * 1000;

/** The epoch millisecond a range begins at, or null for everything. */
function startOf(range: RangeKey): number | null {
  if (range === "all") return null;
  if (range === "today") {
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    return midnight.getTime();
  }
  return Date.now() - Number(range) * DAY_MS;
}

export function LeadsList() {
  const [query, setQuery] = useState("");
  const [range, setRange] = useState<RangeKey>("all");
  const [syncing, setSyncing] = useState(false);
  const [open, setOpen] = useState<{ clientId: string; local: LocalLead } | null>(null);

  // null until the server answers; `offline` once it could not be reached.
  const [server, setServer] = useState<HistoryItem[] | null>(null);
  const [offline, setOffline] = useState(false);

  const local = useLiveQuery(
    () => outboxDb().history.orderBy("createdAt").reverse().limit(500).toArray(),
    [],
  );
  const queued = useLiveQuery(() => outboxDb().outbox.toArray(), []);

  /*
   * The account owns the leads, not the handset.
   *
   * This list used to be whatever this browser's IndexedDB happened to hold,
   * so signing in on a second phone — or after the browser evicted its storage
   * — showed a rep nothing while their leads sat safely in Atlas.
   */
  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/leads", { cache: "no-store" });
      if (!response.ok) {
        setOffline(true);
        return;
      }
      const body = (await response.json()) as { leads: HistoryItem[] };
      setServer(body.leads);
      setOffline(false);
    } catch {
      // No signal, or the server is down. The phone's own copy still shows.
      setOffline(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function syncNow() {
    setSyncing(true);
    try {
      await processOutbox({ force: true });
      // Whatever just drained is now the server's, so ask it again.
      await load();
    } finally {
      setSyncing(false);
    }
  }

  /*
   * The server's list, plus anything this phone has not managed to send yet.
   *
   * Only queued items are added back. A lead the server does not have is, by
   * definition, still in the outbox; taking the whole local history instead
   * would resurrect the leads of whoever used this phone before.
   */
  const leads = useMemo(() => {
    if (local === undefined) return undefined;
    if (server === null) return offline ? local : undefined;

    const pending = new Set((queued ?? []).map((item) => item.clientId));
    const merged = new Map(server.map((lead) => [lead.clientId, lead]));

    for (const item of local) {
      if (!merged.has(item.clientId) && pending.has(item.clientId)) merged.set(item.clientId, item);
    }

    return [...merged.values()].sort((a, b) => b.createdAt - a.createdAt);
  }, [local, server, offline, queued]);

  const waiting = queued?.length ?? 0;

  const counts = useMemo(() => {
    const all = leads ?? [];
    const entries = RANGES.map((option) => {
      const from = startOf(option.key);
      return [option.key, from === null ? all.length : all.filter((l) => l.createdAt >= from).length];
    });
    return Object.fromEntries(entries) as Record<RangeKey, number>;
  }, [leads]);

  // undefined means nothing has answered yet; an empty array means no leads.
  if (leads === undefined) {
    return <p className="py-12 text-center text-[13.5px] text-subtle">Loading your leads…</p>;
  }

  const from = startOf(range);
  const inRange = from === null ? leads : leads.filter((lead) => lead.createdAt >= from);
  const shown = filter(inRange, query);

  return (
    <div>
      {waiting > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-[14px] border border-[var(--warn-line)] bg-warn-soft px-4 py-3">
          <ArrowsClockwise size={18} weight="bold" className="shrink-0 text-warn" />
          <p className="flex-1 text-[13.5px] font-bold text-warn">
            {waiting} {waiting === 1 ? "lead is" : "leads are"} waiting to sync. They are safe on this phone.
          </p>
          <Button type="button" variant="outline" onClick={syncNow} disabled={syncing} className="h-12">
            {syncing ? "Syncing…" : "Sync now"}
          </Button>
        </div>
      )}

      {offline && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-[14px] border border-[var(--warn-line)] bg-warn-soft px-4 py-3">
          <CloudSlash size={18} weight="bold" className="shrink-0 text-warn" />
          <p className="flex-1 text-[13.5px] font-bold text-warn">
            Showing only what is saved on this phone. Your full history appears once the server can
            be reached.
          </p>
          <Button type="button" variant="outline" onClick={() => void load()} className="h-12">
            Retry
          </Button>
        </div>
      )}

      {leads.length > 0 && (
        <>
          {/* Cobalt's `.admin-tabs` pills, the same control the admin table uses. */}
          <div className="mb-3 flex flex-wrap gap-2">
            {RANGES.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => setRange(option.key)}
                aria-pressed={range === option.key}
                className={cn(
                  "press rounded-full border px-4 py-2 text-[13px] font-bold whitespace-nowrap",
                  range === option.key
                    ? "border-foreground bg-foreground text-white"
                    : "border-line bg-surface text-muted-foreground hover:bg-surface-2",
                )}
              >
                {option.label}
                <span className="mono ml-1.5 opacity-70">{counts[option.key]}</span>
              </button>
            ))}
          </div>

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
        </>
      )}

      {shown.length === 0 ? (
        <Empty searching={query.length > 0} filtered={range !== "all"} />
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
                className="press flex w-full items-center gap-[13px] rounded-[14px] border border-line bg-surface px-4 py-[15px] text-left shadow-card hover:bg-surface-2"
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
        // Dexie's live query drops the local row on its own; the server list
        // is a snapshot and has to be asked again.
        onDeleted={() => void load()}
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

function Empty({ searching, filtered }: { searching: boolean; filtered: boolean }) {
  const [title, hint] = searching
    ? ["No matches", "Try a different search."]
    : filtered
      ? ["Nothing in this range", "Choose All to see every lead you have saved."]
      : ["No leads yet", "Scan your first business card to get started."];

  return (
    <div className="rounded-[14px] border border-line bg-surface px-5 py-[52px] text-center shadow-card">
      <AddressBook size={40} weight="duotone" className="mx-auto text-subtle" />
      <p className="mt-3 text-[15.5px] font-extrabold">{title}</p>
      <p className="mt-1 text-[13.5px] text-muted-foreground">{hint}</p>
    </div>
  );
}
