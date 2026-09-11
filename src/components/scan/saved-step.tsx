"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { ArrowsClockwise } from "@phosphor-icons/react/dist/csr/ArrowsClockwise";
import { CheckCircle } from "@phosphor-icons/react/dist/csr/CheckCircle";
import { DeviceMobile } from "@phosphor-icons/react/dist/csr/DeviceMobile";
import { Plus } from "@phosphor-icons/react/dist/csr/Plus";
import { Warning } from "@phosphor-icons/react/dist/csr/Warning";
import { Button } from "@/components/ui/button";
import { outboxDb } from "@/lib/client/outbox";
import { StatusChip, outcomeFor } from "@/components/lead-status";
import { cn } from "@/lib/utils";

type Props = {
  clientId: string;
  name: string;
  onScanNext: () => void;
};

/**
 * Shown the instant the lead is in the outbox, before the server has seen it.
 *
 * The badge then updates in place as the queue drains — the rep does not wait
 * for it, because the next person is already standing there.
 */
export function SavedStep({ clientId, name, onScanNext }: Props) {
  const record = useLiveQuery(() => outboxDb().history.get(clientId), [clientId]);
  const outcome = outcomeFor(record?.salesforce);

  const Icon = outcome.tone === "ok" ? CheckCircle : outcome.tone === "bad" ? Warning : DeviceMobile;

  return (
    <div className="rounded-[14px] border border-line bg-surface p-6 text-center shadow-card">
      <div
        className={cn(
          "mx-auto grid size-14 place-items-center rounded-full",
          outcome.tone === "ok" && "bg-ok-soft text-ok",
          outcome.tone === "warn" && "bg-warn-soft text-warn",
          outcome.tone === "bad" && "bg-bad-soft text-bad",
        )}
      >
        <Icon size={30} weight="bold" />
      </div>

      <h2 className="mt-4 text-xl tracking-[-0.02em]">{outcome.headline}</h2>
      <p className="mt-1 text-[14px] font-bold">{name}</p>

      <div className="mt-3 flex justify-center">
        <StatusChip salesforce={record?.salesforce} />
      </div>

      <p className="mx-auto mt-3 max-w-[44ch] text-[13.5px] text-muted-foreground">{outcome.detail}</p>

      {/* The only action that matters here: the next person is already waiting. */}
      <Button type="button" size="tap" className="mt-6 w-full" onClick={onScanNext} autoFocus>
        <Plus size={18} weight="bold" />
        Scan next card
      </Button>

      {outcome.tone === "warn" && (
        <p className="mt-2.5 flex items-center justify-center gap-1.5 text-xs text-subtle">
          <ArrowsClockwise size={13} weight="bold" />
          Syncing happens on its own. You can keep scanning.
        </p>
      )}
    </div>
  );
}
