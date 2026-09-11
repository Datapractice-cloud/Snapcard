"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { compressImage } from "@/lib/client/compress";
import { EMPTY_LEAD_FIELDS, type CardSide } from "@/lib/schemas";
import { CaptureStep } from "./capture-step";
import { ScanningOverlay } from "./scanning-overlay";
import type { ScanResult, Shot } from "./types";

type Step = "capture" | "review" | "saved";

/**
 * Capture → Review → Saved, all on /scan.
 *
 * One component owns the shots and the scan result because the rep moves
 * backwards as often as forwards — a bad crop is noticed on the review screen,
 * and going back must not lose the photo that was already compressed.
 */
export function ScanFlow() {
  const [step, setStep] = useState<Step>("capture");
  const [shots, setShots] = useState<Partial<Record<CardSide, Shot>>>({});
  const [compressing, setCompressing] = useState<CardSide | null>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanned, setScanned] = useState<ScanResult | null>(null);

  // Object URLs are not garbage collected. Revoking on unmount keeps a long
  // booth session from leaking a blob per card.
  const urls = useRef<string[]>([]);
  useEffect(() => {
    const created = urls.current;
    return () => {
      for (const url of created) URL.revokeObjectURL(url);
    };
  }, []);

  const pick = useCallback(async (side: CardSide, file: File) => {
    setError(null);
    setCompressing(side);
    try {
      const blob = await compressImage(file);
      const previewUrl = URL.createObjectURL(blob);
      urls.current.push(previewUrl);

      setShots((current) => {
        const replaced = current[side];
        if (replaced) URL.revokeObjectURL(replaced.previewUrl);
        return { ...current, [side]: { side, blob, previewUrl, bytes: blob.size } };
      });
    } catch {
      setError("That photo could not be read. Try taking it again.");
    } finally {
      setCompressing(null);
    }
  }, []);

  const clear = useCallback((side: CardSide) => {
    setShots((current) => {
      const dropped = current[side];
      if (dropped) URL.revokeObjectURL(dropped.previewUrl);
      const next = { ...current };
      delete next[side];
      return next;
    });
  }, []);

  const scan = useCallback(async () => {
    const front = shots.front;
    if (!front) return;

    setScanning(true);
    setError(null);

    const body = new FormData();
    body.append("front", front.blob, "front.jpg");
    if (shots.back) body.append("back", shots.back.blob, "back.jpg");

    try {
      const response = await fetch("/api/scan", { method: "POST", body });

      if (!response.ok) {
        setError(messageFor(response.status));
        return;
      }

      const result = (await response.json()) as ScanResult;
      setScanned({ fields: result.fields, rawText: result.rawText });
      setStep("review");
    } catch {
      // Offline, or the request died mid-flight.
      setError("No connection. Check your signal, or fill the card in manually.");
    } finally {
      setScanning(false);
    }
  }, [shots]);

  const skipToManual = useCallback(() => {
    setScanned({ fields: { ...EMPTY_LEAD_FIELDS }, rawText: "" });
    setStep("review");
  }, []);

  return (
    <>
      {step === "capture" && (
        <CaptureStep
          shots={shots}
          compressing={compressing}
          scanning={scanning}
          error={error}
          onPick={pick}
          onClear={clear}
          onScan={scan}
          onSkipToManual={skipToManual}
        />
      )}

      {step === "review" && scanned && (
        <ReviewPlaceholder scanned={scanned} onBack={() => setStep("capture")} />
      )}

      {scanning && <ScanningOverlay />}
    </>
  );
}

function messageFor(status: number): string {
  if (status === 401) return "Your session expired. Reload the page and sign in again.";
  if (status === 429) return "Too many scans in a row. Wait a moment and try again.";
  if (status === 413 || status === 400) return "That photo was not usable. Try taking it again.";
  return "We could not read that card. Try again, or fill it in manually.";
}

/** Replaced by the real form in Task 9. Kept here so the flow is walkable now. */
function ReviewPlaceholder({ scanned, onBack }: { scanned: ScanResult; onBack: () => void }) {
  const filled = Object.entries(scanned.fields).filter(([, value]) => value);

  return (
    <div className="rounded-[14px] border border-line bg-surface p-5 shadow-card">
      <h2 className="text-[15.5px] font-extrabold">Review &amp; save</h2>
      <p className="mt-1 text-[13.5px] text-muted-foreground">
        The editable form, consent checkbox and Save arrive in Task 9. Below is what was read from the card.
      </p>

      <dl className="mt-4 divide-y divide-line border-y border-line">
        {filled.length === 0 && <p className="py-3 text-[13.5px] text-subtle">Nothing was read from the card.</p>}
        {filled.map(([name, value]) => (
          <div key={name} className="flex justify-between gap-4 py-2.5 text-[13.5px]">
            <dt className="font-bold">{name}</dt>
            <dd className="text-right text-muted-foreground">{value}</dd>
          </div>
        ))}
      </dl>

      {scanned.rawText && (
        <details className="mt-4">
          <summary className="cursor-pointer text-[13px] font-bold text-muted-foreground">Raw card text</summary>
          <pre className="mono mt-2 rounded-[10px] bg-surface-2 p-3 text-xs whitespace-pre-wrap">
            {scanned.rawText}
          </pre>
        </details>
      )}

      <button
        type="button"
        onClick={onBack}
        className="mt-5 text-[13px] font-bold text-brand underline-offset-4 hover:underline"
      >
        Back to capture
      </button>
    </div>
  );
}
