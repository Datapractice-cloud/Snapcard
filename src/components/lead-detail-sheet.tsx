"use client";

import { useEffect, useRef, useState } from "react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { StatusChip } from "@/components/lead-status";
import { ImageLightbox } from "@/components/image-lightbox";
import type { SalesforceResult } from "@/lib/schemas";

type LeadDetail = {
  clientId: string;
  capturedBy: string;
  fields: Record<string, string>;
  rawText: string;
  salesforce: SalesforceResult & { attempts?: number; lastError?: string };
  createdAt: string;
  sides: ("front" | "back")[];
};

/**
 * What the phone already knows, used when the server has no record.
 *
 * /leads is a list of what this browser scanned, and a lead scanned before the
 * backup store was configured — or while it was down — exists only here. The
 * rep should still see their own lead rather than an error.
 */
export type LocalLead = {
  fields: Record<string, string>;
  createdAt: number;
  salesforce?: SalesforceResult;
};

type Props = {
  clientId: string | null;
  fallback?: LocalLead | null;
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

export function LeadDetailSheet({ clientId, fallback, onClose }: Props) {
  const [lead, setLead] = useState<LeadDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [localOnly, setLocalOnly] = useState(false);
  const [zoomed, setZoomed] = useState<string | null>(null);

  /*
   * Read through a ref rather than a dependency: the caller builds this object
   * inline, so it is a new reference every render and listing it in the deps
   * would refetch in a loop. Only the clientId should retrigger the fetch.
   */
  const latestFallback = useRef(fallback);
  latestFallback.current = fallback;

  useEffect(() => {
    if (!clientId) return;

    let cancelled = false;
    setLead(null);
    setError(null);
    setLocalOnly(false);

    fetch(`/api/leads/${clientId}`)
      .then(async (response) => {
        if (!response.ok) throw new Error(messageFor(response.status));
        return (await response.json()) as LeadDetail;
      })
      .then((data) => {
        if (!cancelled) setLead(data);
      })
      .catch((cause: Error) => {
        if (cancelled) return;
        // Fall back to the phone's own copy rather than showing nothing.
        if (latestFallback.current) setLocalOnly(true);
        else setError(cause.message);
      });

    return () => {
      cancelled = true;
    };
  }, [clientId]);

  const shown = lead ?? (localOnly && fallback ? toDetail(fallback) : null);

  const name = shown
    ? [shown.fields.firstName, shown.fields.lastName].filter(Boolean).join(" ") || "No name"
    : "Lead";

  return (
    <Sheet open={clientId !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto sm:max-w-[520px]">
        <SheetHeader>
          <SheetTitle>{name}</SheetTitle>
          <SheetDescription>
            {shown
              ? [shown.fields.title, shown.fields.company].filter(Boolean).join(" · ") || "No company"
              : "Loading…"}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-5 px-4 pb-8">
          {error && (
            <p className="rounded-[10px] border border-bad/20 bg-bad-soft px-3.5 py-3 text-[13px] font-bold text-bad">
              {error}
            </p>
          )}

          {localOnly && (
            <p className="rounded-[10px] border border-[#f3e4c4] bg-warn-soft px-3.5 py-3 text-[13px] font-bold text-warn">
              This lead is only on this phone — it was scanned before the database was
              connected, so there is no stored card image.
            </p>
          )}

          {shown && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <StatusChip salesforce={shown.salesforce} />
                <span className="text-xs text-subtle">
                  Scanned {new Date(shown.createdAt).toLocaleString()}
                </span>
              </div>

              {shown.sides.length > 0 && (
                <section>
                  <h3 className="mb-2 text-[12.5px] font-extrabold">Card</h3>
                  <div className="grid gap-2.5 sm:grid-cols-2">
                    {shown.sides.map((side) => (
                      <figure key={side}>
                        <button
                          type="button"
                          onClick={() => setZoomed(`/api/images/${shown.clientId}/${side}`)}
                          aria-label={`Enlarge the ${side} of the card`}
                          className="press block w-full overflow-hidden rounded-[10px] border border-line bg-surface-2 hover:border-line-strong"
                        >
                          {/* Served by /api/images, private and never cached. */}
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={`/api/images/${shown.clientId}/${side}`}
                            alt={`${side} of ${name}'s card`}
                            className="w-full"
                          />
                        </button>
                        <figcaption className="mt-1 flex items-center gap-1 text-[11.5px] font-bold text-subtle">
                          <span className="capitalize">{side}</span>
                          <span aria-hidden>· tap to enlarge</span>
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
                      <dd className={shown.fields[key] ? "min-w-0 break-words" : "text-subtle"}>
                        {shown.fields[key] || "—"}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>

              <section>
                <h3 className="mb-2 text-[12.5px] font-extrabold">Captured</h3>
                <dl className="divide-y divide-line rounded-[10px] border border-line">
                  {shown.capturedBy && <Row label="By" value={shown.capturedBy} />}
                  {shown.salesforce.leadId && <Row label="Salesforce Id" value={shown.salesforce.leadId} mono />}
                  {shown.salesforce.lastError && <Row label="Last error" value={shown.salesforce.lastError} />}
                </dl>
              </section>

              {shown.rawText && (
                <section>
                  <h3 className="mb-2 text-[12.5px] font-extrabold">Notes</h3>
                  <pre className="mono rounded-[10px] bg-surface-2 p-3 text-xs whitespace-pre-wrap">
                    {shown.rawText}
                  </pre>
                </section>
              )}
            </>
          )}
        </div>
      </SheetContent>

      <ImageLightbox src={zoomed} alt={`Card for ${name}`} onClose={() => setZoomed(null)} />
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

/** Shapes the phone's local copy like a stored one, minus what it cannot know. */
function toDetail(local: LocalLead): LeadDetail {
  return {
    clientId: "",
    capturedBy: "",
    fields: local.fields,
    rawText: "",
    salesforce: local.salesforce ?? { status: "skipped" },
    createdAt: new Date(local.createdAt).toISOString(),
    sides: [],
  };
}
