"use client";

import { useId, useRef } from "react";
import { Camera } from "@phosphor-icons/react/dist/csr/Camera";
import { ImageSquare } from "@phosphor-icons/react/dist/csr/ImageSquare";
import { Spinner } from "@phosphor-icons/react/dist/csr/Spinner";
import { Trash } from "@phosphor-icons/react/dist/csr/Trash";
import { Button } from "@/components/ui/button";
import { formatBytes } from "@/lib/client/compress";
import { cn } from "@/lib/utils";
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
 * Camera first and gallery second, because at a booth the rep is holding the
 * card. `capture="environment"` opens the rear camera straight away on
 * Android and iOS; the second input omits it so an existing photo can still be
 * chosen, which is also the only route on desktop.
 */
export function CardSlot({ label, hint, required, shot, busy, onPick, onClear }: Props) {
  const cameraId = useId();
  const galleryId = useId();
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

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
              onClick={() => cameraRef.current?.click()}
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
            onClick={() => cameraRef.current?.click()}
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
    </div>
  );
}
