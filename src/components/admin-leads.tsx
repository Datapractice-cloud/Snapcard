"use client";

import { DownloadSimple } from "@phosphor-icons/react/dist/csr/DownloadSimple";
import { Users } from "@phosphor-icons/react/dist/csr/Users";
import { Button } from "@/components/ui/button";
import { toCsv, type CsvColumn } from "@/lib/csv";
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
  { header: "Salesforce Id", value: (lead) => lead.id },
];

export function AdminLeads({ leads, capped }: Props) {
  function download() {
    const csv = toCsv(CSV_COLUMNS, leads);
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
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div className="rounded-[14px] border border-line bg-surface px-[18px] py-4 shadow-card">
          <p className="flex items-center gap-1.5 text-xs font-extrabold text-muted-foreground">
            <Users size={15} weight="bold" className="text-brand" />
            Leads today
          </p>
          <p className="mono mt-1.5 text-[26px] font-extrabold tracking-[-0.03em]">{leads.length}</p>
          {capped && <p className="mt-1 text-[11.5px] font-bold text-warn">Most recent 200 shown</p>}
        </div>

        <Button type="button" variant="outline" size="tap" onClick={download} disabled={leads.length === 0}>
          <DownloadSimple size={18} weight="bold" />
          Download CSV
        </Button>
      </div>

      {leads.length === 0 ? (
        <div className="rounded-[14px] border border-line bg-surface px-5 py-[52px] text-center shadow-card">
          <Users size={40} weight="duotone" className="mx-auto text-subtle" />
          <p className="mt-3 text-[15.5px] font-extrabold">No leads yet today</p>
          <p className="mt-1 text-[13.5px] text-muted-foreground">
            Leads appear here as soon as reps start scanning.
          </p>
        </div>
      ) : (
        // Cobalt `.tbl-wrap`: the table keeps its own scroll so the page never
        // scrolls sideways on a phone.
        <div className="overflow-x-auto rounded-[14px] border border-line bg-surface shadow-card">
          <table className="w-full min-w-[640px] border-collapse text-[13.5px]">
            <thead>
              <tr>
                {["Name", "Email", "Phone", "Created"].map((header) => (
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
              {leads.map((lead) => (
                <tr key={lead.id} className="border-b border-line last:border-b-0">
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Reads in whatever timezone the admin is actually sitting in. */
function formatTime(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "—";
  return at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
