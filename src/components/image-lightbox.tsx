"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CaretLeft } from "@phosphor-icons/react/dist/csr/CaretLeft";
import { CaretRight } from "@phosphor-icons/react/dist/csr/CaretRight";
import { X } from "@phosphor-icons/react/dist/csr/X";
import { stepIndex } from "@/lib/lightbox-nav";
import { cn } from "@/lib/utils";

export type LightboxImage = { src: string; label: string };

type Props = {
  images: LightboxImage[];
  /** Which side was tapped. null closes the lightbox. */
  startIndex: number | null;
  alt: string;
  onClose: () => void;
};

/** How far a pointer may travel and still count as a tap rather than a drag. */
const DRAG_SLOP = 8;
/** How far a horizontal swipe must travel before it changes sides. */
const SWIPE_THRESHOLD = 60;
/** How much larger than "fit to screen" the zoomed card is. */
const ZOOM = 2.5;

/**
 * The card photo, full size and readable.
 *
 * A thumbnail is enough to confirm the right card was photographed, but not to
 * read a phone number off it when a field looks wrong — which is the whole
 * reason the image is kept. A business card is landscape, so on a portrait
 * phone "fit to screen" means fitting to *width*: a thin band barely bigger
 * than the thumbnail that opened it. Hence tap-to-zoom, which is the feature
 * rather than a flourish.
 *
 * Zoom is a scroll container and one width change; panning is that container
 * scrolling. No gesture library, and native pinch still works on top of it.
 */
export function ImageLightbox({ images, startIndex, alt, onClose }: Props) {
  const [index, setIndex] = useState(0);
  const [zoom, setZoom] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  /** Pointer state for the current drag; null between gestures. */
  const drag = useRef<{ x: number; y: number; left: number; top: number; moved: boolean } | null>(null);

  const open = startIndex !== null && images.length > 0;
  const total = images.length;

  const go = useCallback(
    (delta: number) => {
      setIndex((current) => {
        const next = stepIndex(current, delta, total);
        // Changing side resets the magnification; carrying it over lands you
        // somewhere arbitrary on a card you have not seen yet.
        if (next !== current) setZoom(false);
        return next;
      });
    },
    [total],
  );

  // Seeded from the side that was tapped, not always the front.
  useEffect(() => {
    if (startIndex === null) return;
    setIndex(startIndex);
    setZoom(false);
  }, [startIndex]);

  useEffect(() => {
    if (!open) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowRight") go(1);
      if (event.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);

    // The page behind must not scroll while this is over it.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Focus moves in, and goes back to the thumbnail on the way out.
    const returnTo = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();

    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
      returnTo?.focus?.();
    };
  }, [open, onClose, go]);

  // Zooming from the middle: without this the view jumps to the top-left
  // corner, which is never the part of a card anyone wants.
  useEffect(() => {
    const box = scrollRef.current;
    if (!box) return;
    box.scrollLeft = (box.scrollWidth - box.clientWidth) / 2;
    box.scrollTop = (box.scrollHeight - box.clientHeight) / 2;
  }, [zoom, index]);

  if (!open) return null;

  const current = images[index];

  function onPointerDown(event: React.PointerEvent) {
    const box = scrollRef.current;
    drag.current = {
      x: event.clientX,
      y: event.clientY,
      left: box?.scrollLeft ?? 0,
      top: box?.scrollTop ?? 0,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: React.PointerEvent) {
    const state = drag.current;
    if (!state) return;

    const dx = event.clientX - state.x;
    const dy = event.clientY - state.y;
    if (Math.abs(dx) > DRAG_SLOP || Math.abs(dy) > DRAG_SLOP) state.moved = true;

    // Zoomed, a drag pans. Not zoomed, it is a swipe between sides and the
    // container has nothing to scroll anyway.
    if (zoom && scrollRef.current) {
      scrollRef.current.scrollLeft = state.left - dx;
      scrollRef.current.scrollTop = state.top - dy;
    }
  }

  function onPointerUp(event: React.PointerEvent) {
    const state = drag.current;
    drag.current = null;
    if (!state) return;

    const dx = event.clientX - state.x;

    // A drag is never also a tap, or letting go after panning would zoom out.
    if (!state.moved) {
      setZoom((on) => !on);
      return;
    }
    if (!zoom && Math.abs(dx) > SWIPE_THRESHOLD) go(dx < 0 ? 1 : -1);
  }

  return (
    <div
      role="dialog"
      aria-modal
      aria-label={alt}
      // Clicking the backdrop closes; the image stops the event itself.
      onClick={onClose}
      className={cn(
        "fixed inset-0 z-[60] flex flex-col bg-[var(--scrim)]/92 backdrop-blur-sm",
        "pt-[calc(12px+env(safe-area-inset-top))] pb-[calc(12px+env(safe-area-inset-bottom))]",
        "pl-[calc(16px+env(safe-area-inset-left))] pr-[calc(16px+env(safe-area-inset-right))]",
        "animate-in fade-in-0 duration-150 motion-reduce:animate-none",
      )}
    >
      {/* Chrome sits outside the picture, so nothing is ever laid over the card. */}
      <div className="flex shrink-0 items-center justify-between gap-3">
        <p className="text-[13px] font-extrabold text-white/80 capitalize">
          {current.label}
          {total > 1 && <span className="mono ml-2 text-white/45">{index + 1}/{total}</span>}
        </p>
        <button
          ref={closeRef}
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="press grid size-11 shrink-0 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20"
        >
          <X size={18} weight="bold" />
        </button>
      </div>

      <div
        ref={scrollRef}
        onClick={(event) => event.stopPropagation()}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (drag.current = null)}
        style={{ touchAction: zoom ? "none" : "pinch-zoom" }}
        className={cn(
          "my-3 flex min-h-0 flex-1 overflow-auto overscroll-contain",
          zoom ? "cursor-grab active:cursor-grabbing" : "cursor-zoom-in",
        )}
      >
        {/*
         * `m-auto` rather than justify-center: a flex item centred that way is
         * clipped at the start once it overflows, which is exactly the state
         * zooming puts it in.
         *
         * eslint-disable-next-line @next/next/no-img-element — these are
         * private, session-gated blobs from /api/images, not optimisable assets.
         */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={current.src}
          alt={alt}
          draggable={false}
          className={cn(
            "m-auto rounded-[10px] shadow-toast select-none",
            "animate-in fade-in-0 zoom-in-95 duration-200 motion-reduce:animate-none",
            zoom ? "max-w-none" : "max-h-full max-w-full object-contain",
          )}
          style={zoom ? { width: `${ZOOM * 100}%` } : undefined}
        />
      </div>

      <div className="flex shrink-0 items-center justify-between gap-3">
        <button
          type="button"
          aria-label="Previous side"
          onClick={(event) => {
            event.stopPropagation();
            go(-1);
          }}
          disabled={index === 0}
          className="press grid size-11 place-items-center rounded-full bg-white/10 text-white disabled:opacity-0 hover:bg-white/20"
        >
          <CaretLeft size={18} weight="bold" />
        </button>

        <p className="pointer-events-none text-center text-xs font-bold text-white/60">
          {zoom ? "Tap the card to zoom out" : "Tap the card to zoom · tap outside to close"}
        </p>

        <button
          type="button"
          aria-label="Next side"
          onClick={(event) => {
            event.stopPropagation();
            go(1);
          }}
          disabled={index >= total - 1}
          className="press grid size-11 place-items-center rounded-full bg-white/10 text-white disabled:opacity-0 hover:bg-white/20"
        >
          <CaretRight size={18} weight="bold" />
        </button>
      </div>
    </div>
  );
}
