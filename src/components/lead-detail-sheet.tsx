"use client";

import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { StatusChip } from "@/components/lead-status";
import type { SalesforceResult } from "@/lib/schemas";

type LeadDetail = {
  clientId: string;
  capturedBy: string;
  fields: Record<string, string>;
  rawText: string;
  consentAt: string | null;
  salesforce: SalesforceResult & { attempts?: number; lastError?: string };
  createdAt: string;
  sides: ("front" | "back")[];
};

type Props = {
  clientId: string | null;
  onClose: () => void;
};

/** The review form's fields, in the order the form shows them. */
const FIELD_LABELS: [string, string][] = [
  ["firstName", "First name"],
  ["lastName", "Last name"],
  ["company", "Company"],
  ["title", "Job title"],
  ["email", "Email"],
  ["phone", "Phone"],
  ["website", "Website"],
  ["street", "Street"],
  ["city", "City"],
  ["state", "State"],
  ["postalCode", "Postal code"],
  ["country", "Country"],
];

export function LeadDetailSheet({ clientId, onClose }: Props) {
  const [lead, setLead] = useState<LeadDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!clientId) return;

    let cancelled = false;
    setLead(null);
    setError(null);

    fetch(`/api/leads/${clientId}`)
      .then(async (response) => {
        if (!response.ok) throw new Error(messageFor(response.status));
        return (await response.json()) as LeadDetail;
      })
      .then((data) => {
        if (!cancelled) setLead(data);
      })
      .catch((cause: Error) => {
        if (!cancelled) setError(cause.message);
      });

    return () => {
      cancelled = true;
    };
  }, [clientId]);

  const name = lead
    ? [lead.fields.firstName, lead.fields.lastName].filter(Boolean).join(" ") || "No name"
    : "Lead";

  return (
    <Sheet open={clientId !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto sm:max-w-[520px]">
        <SheetHeader>
          <SheetTitle>{name}</SheetTitle>
          <SheetDescription>
            {lead
              ? [lead.fields.title, lead.fields.company].filter(Boolean).join(" · ") || "No company"
              : "Loading…"}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-5 px-4 pb-8">
          {error && (
            <p className="rounded-[10px] border border-bad/20 bg-bad-soft px-3.5 py-3 text-[13px] font-bold text-bad">
              {error}
            </p>
          )}

          {lead && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <StatusChip salesforce={lead.salesforce} />
                <span className="text-xs text-subtle">
                  Scanned {new Date(lead.createdAt).toLocaleString()}
                </span>
              </div>

              {lead.sides.length > 0 && (
                <section>
                  <h3 className="mb-2 text-[12.5px] font-extrabold">Card</h3>
                  <div className="grid gap-2.5 sm:grid-cols-2">
                    {lead.sides.map((side) => (
                      <figure key={side}>
                        {/* Served by /api/images, private and never cached. */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`/api/images/${lead.clientId}/${side}`}
                          alt={`${side} of ${name}'s card`}
                          className="w-full rounded-[10px] border border-line bg-surface-2"
                        />
                        <figcaption className="mt-1 text-[11.5px] font-bold text-subtle capitalize">
                          {side}
                        </figcaption>
                      </figure>
                    ))}
                  </div>
                </section>
              )}

              <section>
                <h3 className="mb-2 text-[12.5px] font-extrabold">Contact details</h3>
                <dl className="divide-y divide-line rounded-[10px] border border-line">
                  {FIELD_LABELS.map(([key, label]) => (
                    <div key={key} className="flex gap-4 px-3.5 py-2.5 text-[13px]">
                      <dt className="w-[7.5rem] shrink-0 font-bold text-muted-foreground">{label}</dt>
                      <dd className={lead.fields[key] ? "min-w-0 break-words" : "text-subtle"}>
                        {lead.fields[key] || "—"}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>

              <section>
                <h3 className="mb-2 text-[12.5px] font-extrabold">Captured</h3>
                <dl className="divide-y divide-line rounded-[10px] border border-line">
                  <Row label="By" value={lead.capturedBy} />
                  <Row
                    label="Consent"
                    value={lead.consentAt ? `Given ${new Date(lead.consentAt).toLocaleString()}` : "—"}
                  />
                  {lead.salesforce.leadId && <Row label="Salesforce Id" value={lead.salesforce.leadId} mono />}
                  {lead.salesforce.lastError && <Row label="Last error" value={lead.salesforce.lastError} />}
                </dl>
              </section>

              {lead.rawText && (
                <section>
                  <h3 className="mb-2 text-[12.5px] font-extrabold">Card text</h3>
                  <pre className="mono rounded-[10px] bg-surface-2 p-3 text-xs whitespace-pre-wrap">
                    {lead.rawText}
                  </pre>
                </section>
              )}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex gap-4 px-3.5 py-2.5 text-[13px]">
      <dt className="w-[7.5rem] shrink-0 font-bold text-muted-foreground">{label}</dt>
      <dd className={`min-w-0 break-words ${mono ? "mono" : ""}`}>{value}</dd>
    </div>
  );
}

function messageFor(status: number): string {
  if (status === 404) return "That lead is not stored here.";
  if (status === 503) return "No backup database is configured, so there is nothing to show.";
  if (status === 401) return "Your session expired. Reload the page.";
  return "The lead could not be loaded.";
}
