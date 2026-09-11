"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Camera } from "@phosphor-icons/react/dist/csr/Camera";
import { ImageSquare } from "@phosphor-icons/react/dist/csr/ImageSquare";
import { Spinner } from "@phosphor-icons/react/dist/csr/Spinner";
import { Trash } from "@phosphor-icons/react/dist/csr/Trash";
import { Button } from "@/components/ui/button";
import { formatBytes } from "@/lib/client/compress";
import { cn } from "@/lib/utils";
import { CameraSheet } from "./camera-sheet";
import type { Shot } from "./types";

type Props = {
  label: string;
  hint: string;
  required?: boolean;
  shot?: Shot;
  busy?: boolean;
  onPick: (file: File) => void;
  onClear: () => void;
};

/**
 * One side of the card: Cobalt's dashed dropzone until a photo exists, then
 * the preview.
 *
 * "Take photo" opens a live camera. On a phone it hands straight over to the
 * OS camera app, which focuses and exposes a small card far better than a
 * <video> element does; on a laptop there is no camera app to hand over to, so
 * it opens the in-page viewfinder instead. Gallery is always available.
 */
export function CardSlot({ label, hint, required, shot, busy, onPick, onClear }: Props) {
  const cameraId = useId();
  const galleryId = useId();
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [viewfinder, setViewfinder] = useState(false);

  /*
   * A touch device almost certainly has a camera app behind
   * `capture="environment"`. A laptop does not — the same input just opens a
   * file picker, which is what made "Take photo" look broken on desktop.
   */
  const [preferDeviceCamera, setPreferDeviceCamera] = useState(false);
  useEffect(() => {
    setPreferDeviceCamera(window.matchMedia("(pointer: coarse)").matches);
  }, []);

  const takePhoto = useCallback(() => {
    if (preferDeviceCamera) cameraRef.current?.click();
    else setViewfinder(true);
  }, [preferDeviceCamera]);

  function handle(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Reset first: picking the same file twice in a row fires no change event
    // otherwise, so a retake of an identical shot would look like a dead tap.
    event.target.value = "";
    if (file) onPick(file);
  }

  return (
    <div className="rounded-[14px] border border-line bg-surface p-4 shadow-card">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-[15px] font-extrabold">
          {label} {required && <span className="text-bad">*</span>}
        </h2>
        {shot && <span className="mono text-xs text-subtle">{formatBytes(shot.bytes)}</span>}
      </div>

      {shot ? (
        <div className="space-y-3">
          <div className="relative aspect-[16/10] overflow-hidden rounded-[10px] border border-line bg-surface-2">
            {/* Blob URL, so next/image would add nothing but a loader. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={shot.previewUrl} alt={`${label} of the card`} className="size-full object-cover" />
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="tap"
              className="flex-1"
              onClick={takePhoto}
              disabled={busy}
            >
              <Camera size={18} weight="bold" />
              Retake
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon-tap"
              aria-label={`Remove the ${label.toLowerCase()}`}
              onClick={onClear}
              disabled={busy}
            >
              <Trash size={18} weight="bold" />
            </Button>
          </div>
        </div>
      ) : (
        <div
          className={cn(
            "rounded-[10px] border-[1.5px] border-dashed border-line-strong px-5 py-8 text-center",
            busy && "opacity-60",
          )}
        >
          {busy ? (
            <Spinner size={30} weight="bold" className="mx-auto animate-spin text-brand" />
          ) : (
            <ImageSquare size={30} weight="duotone" className="mx-auto text-brand" />
          )}
          <p className="mt-2 text-[13px] text-muted-foreground">{busy ? "Shrinking the photo…" : hint}</p>

          <Button
            type="button"
            size="tap"
            className="mt-4 w-full"
            onClick={takePhoto}
            disabled={busy}
          >
            <Camera size={18} weight="bold" />
            Take photo
          </Button>

          <Button
            type="button"
            variant="ghost"
            className="mt-1.5 h-10 w-full text-[13px] font-bold text-muted-foreground"
            onClick={() => galleryRef.current?.click()}
            disabled={busy}
          >
            Choose from gallery
          </Button>
        </div>
      )}

      <input
        ref={cameraRef}
        id={cameraId}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={handle}
      />
      <input ref={galleryRef} id={galleryId} type="file" accept="image/*" hidden onChange={handle} />

      {viewfinder && (
        <CameraSheet
          label={label}
          onCapture={(file) => {
            setViewfinder(false);
            onPick(file);
          }}
          onClose={() => setViewfinder(false)}
          onUseDeviceCamera={
            preferDeviceCamera
              ? () => {
                  setViewfinder(false);
                  cameraRef.current?.click();
                }
              : undefined
          }
        />
      )}
    </div>
  );
}
