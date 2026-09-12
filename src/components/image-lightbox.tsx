"use client";

import { useEffect } from "react";
import { X } from "@phosphor-icons/react/dist/csr/X";

type Props = {
  src: string | null;
  alt: string;
  onClose: () => void;
};

/**
 * The card photo, full size.
 *
 * A thumbnail is enough to confirm the right card was photographed, but not to
 * read a phone number off it when a field looks wrong — which is the whole
 * reason the image is kept.
 */
export function ImageLightbox({ src, alt, onClose }: Props) {
  useEffect(() => {
    if (!src) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);

    // The page behind must not scroll while this is over it.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [src, onClose]);

  if (!src) return null;

  return (
    <div
      role="dialog"
      aria-modal
      aria-label={alt}
      // Clicking the backdrop closes; clicking the image itself does not.
      onClick={onClose}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-[var(--scrim)]/92 p-4 backdrop-blur-sm"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="press absolute top-4 right-4 grid size-11 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20"
      >
        <X size={18} weight="bold" />
      </button>

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        onClick={(event) => event.stopPropagation()}
        className="max-h-full max-w-full rounded-[10px] object-contain shadow-toast"
      />

      <p className="pointer-events-none absolute inset-x-0 bottom-5 text-center text-xs font-bold text-white/70">
        Tap anywhere to close
      </p>
    </div>
  );
}
