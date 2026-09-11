"use client";

import { useMemo, useState } from "react";
import { Buildings } from "@phosphor-icons/react/dist/csr/Buildings";
import { CaretRight } from "@phosphor-icons/react/dist/csr/CaretRight";
import { DownloadSimple } from "@phosphor-icons/react/dist/csr/DownloadSimple";
import { EnvelopeSimple } from "@phosphor-icons/react/dist/csr/EnvelopeSimple";
import { UserCircle } from "@phosphor-icons/react/dist/csr/UserCircle";
import { Users } from "@phosphor-icons/react/dist/csr/Users";
import { Button } from "@/components/ui/button";
import { LeadDetailSheet } from "@/components/lead-detail-sheet";
import { toCsv, type CsvColumn } from "@/lib/csv";
import { cn } from "@/lib/utils";
import type { EventLead } from "@/lib/salesforce/lead";

type Props = {
  leads: EventLead[];
  capped: boolean;
};

const CSV_COLUMNS: CsvColumn<EventLead>[] = [
  { header: "Name", value: (lead) => lead.name },
  { header: "Company", value: (lead) => lead.company },
  { header: "Job title", value: (lead) => lead.title },
  { header: "Email", value: (lead) => lead.email },
  { header: "Phone", value: (lead) => lead.phone },
  { header: "Created", value: (lead) => lead.createdAt },
  { header: "Id", value: (lead) => lead.id },
  { header: "Status", value: (lead) => lead.status ?? "" },
  { header: "Captured by", value: (lead) => lead.capturedBy ?? "" },
];

/** The filters an admin actually wants, in the order they would ask for them. */
const FILTERS = [
  { key: "all", label: "All" },
  { key: "saved", label: "Saved" },
  { key: "attention", label: "Needs attention" },
] as const;

type Filter = (typeof FILTERS)[number]["key"];

export function AdminLeads({ leads, capped }: Props) {
  const [open, setOpen] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

  const stats = useMemo(() => {
    const reps = new Set(leads.map((lead) => lead.capturedBy).filter(Boolean));
    return {
      total: leads.length,
      // A lead nobody can contact is the one an admin has to chase.
      contactable: leads.filter((lead) => lead.email || lead.phone).length,
      companies: new Set(leads.map((lead) => lead.company).filter(Boolean)).size,
      reps: reps.size,
      attention: leads.filter((lead) => lead.status === "failed" || lead.status === "needs_review").length,
    };
  }, [leads]);

  const shown = useMemo(() => {
    if (filter === "saved") {
      return leads.filter((lead) => lead.status !== "failed" && lead.status !== "needs_review");
    }
    if (filter === "attention") {
      return leads.filter((lead) => lead.status === "failed" || lead.status === "needs_review");
    }
    return leads;
  }, [leads, filter]);

  function download() {
    // Exports what is on screen, so a filtered view exports the filtered set.
    const csv = toCsv(CSV_COLUMNS, shown);
    // A BOM, or Excel reads an accented name as mojibake.
    const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = `snapcard-leads-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();

    URL.revokeObjectURL(url);
  }

  return (
    <div>
      {/* Cobalt's `.stats` grid: two up on a phone, four on a desktop. */}
      <div className="mb-5 grid grid-cols-2 gap-3 desk:grid-cols-4">
        <Stat icon={<Users size={15} weight="bold" />} label="Leads today" value={stats.total}>
          {capped && <span className="text-warn">Most recent 200</span>}
        </Stat>
        <Stat
          icon={<EnvelopeSimple size={15} weight="bold" />}
          label="Contactable"
          value={stats.contactable}
        >
          {stats.total > 0 && stats.contactable < stats.total && (
            <span className="text-warn">{stats.total - stats.contactable} with no email or phone</span>
          )}
        </Stat>
        <Stat icon={<Buildings size={15} weight="bold" />} label="Companies" value={stats.companies} />
        <Stat icon={<UserCircle size={15} weight="bold" />} label="Reps" value={stats.reps} />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {/* Cobalt's `.admin-tabs` pills. */}
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((option) => {
            const count =
              option.key === "all"
                ? stats.total
                : option.key === "attention"
                  ? stats.attention
                  : stats.total - stats.attention;
            return (
              <button
                key={option.key}
                type="button"
                onClick={() => setFilter(option.key)}
                aria-pressed={filter === option.key}
                className={cn(
                  "press rounded-full border px-4 py-2 text-[13px] font-bold whitespace-nowrap",
                  filter === option.key
                    ? "border-foreground bg-foreground text-white"
                    : "border-line bg-surface text-muted-foreground hover:bg-surface-2",
                )}
              >
                {option.label}
                <span className="mono ml-1.5 opacity-70">{count}</span>
              </button>
            );
          })}
        </div>

        <div className="hidden flex-1 sm:block" />

        <Button
          type="button"
          variant="outline"
          size="tap"
          onClick={download}
          disabled={shown.length === 0}
          className="w-full sm:w-auto"
        >
          <DownloadSimple size={18} weight="bold" />
          Download CSV
        </Button>
      </div>

      {shown.length === 0 ? (
        <div className="rounded-[14px] border border-line bg-surface px-5 py-[52px] text-center shadow-card">
          <Users size={40} weight="duotone" className="mx-auto text-subtle" />
          <p className="mt-3 text-[15.5px] font-extrabold">
            {filter === "all" ? "No leads yet today" : "Nothing in this view"}
          </p>
          <p className="mt-1 text-[13.5px] text-muted-foreground">
            {filter === "all"
              ? "Leads appear here as soon as reps start scanning."
              : "Try another filter."}
          </p>
        </div>
      ) : (
        // Cobalt `.tbl-wrap`: the table keeps its own scroll so the page never
        // scrolls sideways on a phone.
        <div className="overflow-x-auto rounded-[14px] border border-line bg-surface shadow-card">
          <table className="w-full min-w-[640px] border-collapse text-[13.5px]">
            <thead>
              <tr>
                {["Name", "Email", "Phone", "Created", ""].map((header) => (
                  <th
                    key={header}
                    className="border-b border-line bg-surface-2 px-4 py-3 text-left text-[11px] font-extrabold tracking-[0.06em] text-subtle uppercase"
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((lead) => (
                <tr
                  key={lead.id}
                  onClick={() => setOpen(lead.id)}
                  className="cursor-pointer border-b border-line transition-colors last:border-b-0 hover:bg-surface-2"
                >
                  <td className="px-4 py-[13px] align-middle">
                    <p className="font-extrabold">{lead.name || "No name"}</p>
                    <p className="text-xs text-muted-foreground">
                      {[lead.title, lead.company].filter(Boolean).join(" · ") || "No company"}
                    </p>
                  </td>
                  <td className="px-4 py-[13px] align-middle break-all">{lead.email || "—"}</td>
                  <td className="mono px-4 py-[13px] align-middle whitespace-nowrap">{lead.phone || "—"}</td>
                  <td className="px-4 py-[13px] align-middle whitespace-nowrap text-muted-foreground">
                    {/*
                      * The server formats in its own locale and timezone (UTC on
                      * Hostinger), the browser in the admin's. React treats that
                      * as a hydration mismatch and throws the whole tree away.
                      * The attribute has to sit on the element that owns the
                      * text, not on its parent.
                      */}
                    <time dateTime={lead.createdAt} suppressHydrationWarning>
                      {formatTime(lead.createdAt)}
                    </time>
                  </td>
                  <td className="px-4 py-[13px] text-right align-middle">
                    <CaretRight size={15} weight="bold" className="inline text-subtle" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <LeadDetailSheet clientId={open} onClose={() => setOpen(null)} />
    </div>
  );
}

/** Reads in whatever timezone the admin is actually sitting in. */
function formatTime(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "—";
  return at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/** Cobalt's `.stat` card: small bold label, a big mono number, a note. */
function Stat({
  icon,
  label,
  value,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-[14px] border border-line bg-surface px-[18px] py-4 shadow-card">
      <p className="flex items-center gap-1.5 text-xs font-extrabold text-muted-foreground">
        <span className="shrink-0 text-brand">{icon}</span>
        <span className="truncate">{label}</span>
      </p>
      <p className="mono mt-1.5 text-[26px] font-extrabold tracking-[-0.03em]">{value}</p>
      <p className="mt-1 min-h-4 text-[11.5px] font-bold">{children}</p>
    </div>
  );
}
