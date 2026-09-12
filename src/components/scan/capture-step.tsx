"use client";

import { LockSimple } from "@phosphor-icons/react/dist/csr/LockSimple";
import { Sparkle } from "@phosphor-icons/react/dist/csr/Sparkle";
import { WarningCircle } from "@phosphor-icons/react/dist/csr/WarningCircle";
import { Button } from "@/components/ui/button";
import type { CardSide } from "@/lib/schemas";
import type { Shot } from "./types";
import { CardSlot } from "./card-slot";

type Props = {
  shots: Partial<Record<CardSide, Shot>>;
  compressing: CardSide | null;
  scanning: boolean;
  error: string | null;
  onPick: (side: CardSide, file: File) => void;
  onClear: (side: CardSide) => void;
  onScan: () => void;
  onSkipToManual: () => void;
};

export function CaptureStep({
  shots,
  compressing,
  scanning,
  error,
  onPick,
  onClear,
  onScan,
  onSkipToManual,
}: Props) {
  const ready = Boolean(shots.front) && compressing === null;

  return (
    <div className="fade-up grid gap-[18px] desk:grid-cols-2 desk:items-start">
      <div className="space-y-[14px]">
        <CardSlot
          label="Front"
          required
          hint="The side with the name and email."
          shot={shots.front}
          busy={compressing === "front"}
          onPick={(file) => onPick("front", file)}
          onClear={() => onClear("front")}
        />
        <CardSlot
          label="Back"
          hint="Optional — only if it has details the front does not."
          shot={shots.back}
          busy={compressing === "back"}
          onPick={(file) => onPick("back", file)}
          onClear={() => onClear("back")}
        />
      </div>

      <div className="rounded-[14px] border border-line bg-surface p-5 shadow-card">
        <h2 className="text-[15.5px] font-extrabold">Ready to scan</h2>
        <p className="mt-2 text-[13.5px] text-muted-foreground">
          {ready
            ? "We will read the card and fill in the contact for you to check."
            : "Add a photo of the front of the card to start."}
        </p>

        {error && (
          <div
            role="alert"
            className="mt-4 flex items-start gap-2.5 rounded-[10px] border border-bad/20 bg-bad-soft px-3.5 py-3 text-[13px] font-bold text-bad"
          >
            <WarningCircle size={17} weight="bold" className="mt-px shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <Button
          type="button"
          size="tap"
          className="mt-4 w-full"
          disabled={!ready || scanning}
          onClick={onScan}
        >
          <Sparkle size={18} weight="bold" />
          {error ? "Try again" : "Scan card"}
        </Button>

        <Button
          type="button"
          variant="ghost"
          className="mt-1.5 h-12 w-full text-[13px] font-bold text-muted-foreground"
          onClick={onSkipToManual}
          disabled={scanning}
        >
          Fill in manually instead
        </Button>

        <p className="mt-3.5 flex items-start gap-[7px] text-xs text-subtle">
          <LockSimple size={14} weight="bold" className="mt-0.5 shrink-0" />
          Photos are read for text only. Nothing is stored until you save the lead.
        </p>
      </div>
    </div>
  );
}
