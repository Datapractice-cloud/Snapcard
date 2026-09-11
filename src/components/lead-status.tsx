"use client";

import { ArrowsClockwise } from "@phosphor-icons/react/dist/csr/ArrowsClockwise";
import { CheckCircle } from "@phosphor-icons/react/dist/csr/CheckCircle";
import { Clock } from "@phosphor-icons/react/dist/csr/Clock";
import { UsersThree } from "@phosphor-icons/react/dist/csr/UsersThree";
import { WarningCircle } from "@phosphor-icons/react/dist/csr/WarningCircle";
import type { SalesforceResult } from "@/lib/schemas";
import { cn } from "@/lib/utils";

/**
 * One place that turns a Salesforce outcome into words a rep understands,
 * shared by the Saved step and /leads so the two can never disagree about
 * what a lead's state means.
 *
 * `undefined` means the server has not answered yet — the lead is on the phone
 * and queued, which is a real state and not a failure.
 */

type Tone = "ok" | "warn" | "bad";

type Outcome = {
  chip: string;
  tone: Tone;
  headline: string;
  detail: string;
};

const QUEUED: Outcome = {
  chip: "Saved on phone",
  tone: "warn",
  headline: "Saved on phone",
  detail: "It is safe here and will reach Salesforce on its own, even if you close the app.",
};

const OUTCOMES: Record<SalesforceResult["status"], Outcome> = {
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
    detail: "This person was there already, so the existing lead was updated instead of a second one created.",
  },
  failed: {
    chip: "Retrying…",
    tone: "warn",
    headline: "Saved on phone",
    detail: "Salesforce could not be reached. The lead is kept here and will go through on its own.",
  },
  needs_review: {
    chip: "Needs admin review",
    tone: "bad",
    headline: "Salesforce refused this one",
    detail: "An admin has to look at it. Nothing more for you to do — keep scanning.",
  },
};

export function outcomeFor(salesforce: SalesforceResult | undefined): Outcome {
  return salesforce ? OUTCOMES[salesforce.status] : QUEUED;
}

const TONE: Record<Tone, string> = {
  ok: "bg-ok-soft text-ok",
  warn: "bg-warn-soft text-warn",
  bad: "bg-bad-soft text-bad",
};

const ICON = {
  synced: CheckCircle,
  duplicate: UsersThree,
  failed: ArrowsClockwise,
  needs_review: WarningCircle,
} as const;

/** Cobalt's `.chip`. */
export function StatusChip({
  salesforce,
  className,
}: {
  salesforce: SalesforceResult | undefined;
  className?: string;
}) {
  const outcome = outcomeFor(salesforce);
  const Icon = salesforce ? ICON[salesforce.status] : Clock;

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-extrabold",
        TONE[outcome.tone],
        className,
      )}
    >
      <Icon size={13} weight="fill" />
      {outcome.chip}
    </span>
  );
}
