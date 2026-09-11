"use client";

import { ArrowCounterClockwise } from "@phosphor-icons/react/dist/csr/ArrowCounterClockwise";
import { CheckCircle } from "@phosphor-icons/react/dist/csr/CheckCircle";
import { Plus } from "@phosphor-icons/react/dist/csr/Plus";
import { Warning } from "@phosphor-icons/react/dist/csr/Warning";
import { Button } from "@/components/ui/button";
import type { SalesforceResult } from "@/lib/schemas";
import { cn } from "@/lib/utils";

type Props = {
  name: string;
  salesforce: SalesforceResult;
  saving: boolean;
  onScanNext: () => void;
  /** Re-sends with the same clientId, so a retry updates rather than duplicates. */
  onRetry: () => void;
};

/** How each Salesforce outcome reads to a rep who is not a Salesforce admin. */
const OUTCOME = {
  synced: {
    chip: "In Salesforce",
    tone: "ok",
    headline: "Lead saved",
    detail: "It is in Salesforce now.",
  },
  duplicate: {
    chip: "Duplicate — merged",
    tone: "ok",
    headline: "Already in Salesforce",
    detail: "This person was there already, so we updated the existing lead instead of creating a second one.",
  },
  /*
   * Phase 1 has no outbox and no backup, so a failed write means the lead is
   * not stored anywhere — saying otherwise would send a rep away from a card
   * they still need. Task 10 puts the outbox behind this and the wording
   * becomes "kept, syncing shortly", which will then be true.
   */
  failed: {
    chip: "Not saved",
    tone: "bad",
    headline: "Could not reach Salesforce",
    detail: "The lead is not stored yet. Keep the card and try again — retrying is safe and will not create a duplicate.",
  },
  needs_review: {
    chip: "Needs admin review",
    tone: "bad",
    headline: "Saved, but Salesforce refused it",
    detail: "An admin has to look at this one. Nothing more for you to do.",
  },
} as const;

const TONE = {
  ok: "bg-ok-soft text-ok",
  warn: "bg-warn-soft text-warn",
  bad: "bg-bad-soft text-bad",
} as const;

export function SavedStep({ name, salesforce, saving, onScanNext, onRetry }: Props) {
  const outcome = OUTCOME[salesforce.status];
  const good = salesforce.status === "synced" || salesforce.status === "duplicate";
  const unsaved = salesforce.status === "failed";

  return (
    <div className="rounded-[14px] border border-line bg-surface p-6 text-center shadow-card">
      <div
        className={cn(
          "mx-auto grid size-14 place-items-center rounded-full",
          good ? "bg-ok-soft text-ok" : "bg-warn-soft text-warn",
        )}
      >
        {good ? <CheckCircle size={30} weight="bold" /> : <Warning size={30} weight="bold" />}
      </div>

      <h2 className="mt-4 text-xl tracking-[-0.02em]">{outcome.headline}</h2>
      <p className="mt-1 text-[14px] font-bold">{name}</p>

      <span
        className={cn(
          "mt-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-extrabold",
          TONE[outcome.tone],
        )}
      >
        {outcome.chip}
      </span>

      <p className="mx-auto mt-3 max-w-[44ch] text-[13.5px] text-muted-foreground">{outcome.detail}</p>

      {unsaved ? (
        <div className="mt-6 flex flex-col gap-2">
          <Button type="button" size="tap" onClick={onRetry} disabled={saving} autoFocus>
            <ArrowCounterClockwise size={18} weight="bold" />
            {saving ? "Trying again…" : "Try again"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="h-11 text-[13px] font-bold text-muted-foreground"
            onClick={onScanNext}
            disabled={saving}
          >
            Give up and scan the next card
          </Button>
        </div>
      ) : (
        /* The only action that matters here: the next person is already waiting. */
        <Button type="button" size="tap" className="mt-6 w-full" onClick={onScanNext} autoFocus>
          <Plus size={18} weight="bold" />
          Scan next card
        </Button>
      )}
    </div>
  );
}
