"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { compressImage, toDataUrl } from "@/lib/client/compress";
import { addToOutbox, processOutbox } from "@/lib/client/outbox";
import { EMPTY_LEAD_FIELDS, leadSubmitSchema, type CardSide, type LeadFields } from "@/lib/schemas";
import { CaptureStep } from "./capture-step";
import { ReviewStep } from "./review-step";
import { SavedStep } from "./saved-step";
import { ScanningOverlay } from "./scanning-overlay";
import type { ScanResult, Shot } from "./types";

type Step = "capture" | "review" | "saved";

type Saved = { clientId: string; name: string };

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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanned, setScanned] = useState<ScanResult | null>(null);
  const [fromScan, setFromScan] = useState(false);
  const [saved, setSaved] = useState<Saved | null>(null);

  /*
   * Minted once per lead and reused by every retry of it. It is the Salesforce
   * external id, so re-sending the same submission updates the same Lead
   * rather than creating a second one — which is what makes a double-tapped
   * Save, or a reply lost to a dead signal, harmless. Cleared by "Scan next".
   */
  const clientId = useRef<string | null>(null);

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
        setError(scanMessageFor(response.status));
        return;
      }

      const result = (await response.json()) as ScanResult;
      setScanned({ fields: result.fields, rawText: result.rawText });
      setFromScan(true);
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
    setFromScan(false);
    setStep("review");
  }, []);

  const submit = useCallback(
    async (fields: LeadFields, rawText: string) => {
      setSaving(true);
      setError(null);

      try {
        clientId.current ??= crypto.randomUUID();

        const images = await Promise.all(
          (["front", "back"] as const)
            .map((side) => shots[side])
            .filter((shot): shot is Shot => Boolean(shot))
            .map(async (shot) => ({ side: shot.side, dataUrl: await toDataUrl(shot.blob) })),
        );

        // Parsed here too, so a payload the server would reject is caught while
        // the rep is still looking at the form rather than in a queue overnight.
        const payload = leadSubmitSchema.parse({
          clientId: clientId.current,
          fields,
          rawText,
          consent: { given: true },
          images,
        });

        /*
         * Durable before the network, as CLAUDE.md requires. Once this resolves
         * the lead survives a closed app, a dead battery and a lost signal, so
         * the rep can be handed straight back to the camera.
         */
        await addToOutbox(payload);

        setSaved({
          clientId: payload.clientId,
          name: [fields.firstName, fields.lastName].filter(Boolean).join(" ") || "This lead",
        });
        setStep("saved");

        // Not awaited: the Saved step subscribes to the result and updates the
        // badge in place whenever it lands.
        void processOutbox();
      } catch {
        setError("The lead could not be stored on this phone. Try saving again.");
      } finally {
        setSaving(false);
      }
    },
    [shots],
  );

  const scanNext = useCallback(() => {
    for (const side of ["front", "back"] as const) {
      const shot = shots[side];
      if (shot) URL.revokeObjectURL(shot.previewUrl);
    }
    // A new card is a new lead, so a new external id.
    clientId.current = null;
    setShots({});
    setScanned(null);
    setSaved(null);
    setFromScan(false);
    setError(null);
    setStep("capture");
  }, [shots]);

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
        <ReviewStep
          initialFields={scanned.fields}
          rawText={scanned.rawText}
          fromScan={fromScan}
          saving={saving}
          error={error}
          onBack={() => {
            setError(null);
            setStep("capture");
          }}
          onSubmit={submit}
        />
      )}

      {step === "saved" && saved && (
        <SavedStep clientId={saved.clientId} name={saved.name} onScanNext={scanNext} />
      )}

      {scanning && <ScanningOverlay />}
    </>
  );
}

function scanMessageFor(status: number): string {
  if (status === 401) return "Your session expired. Reload the page and sign in again.";
  if (status === 429) return "Too many scans in a row. Wait a moment and try again.";
  if (status === 413 || status === 400) return "That photo was not usable. Try taking it again.";
  return "We could not read that card. Try again, or fill it in manually.";
}
