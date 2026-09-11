"use client";

/** Cobalt's `.scanning-overlay`: the whole screen waits while Gemini reads. */
export function ScanningOverlay() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-50 grid place-items-center bg-background/90 backdrop-blur-[6px]"
    >
      <div className="text-center">
        <div className="mx-auto mb-[18px] size-16 animate-spin rounded-full border-4 border-brand-soft border-t-brand motion-reduce:animate-none" />
        <p className="text-base font-extrabold">Reading card…</p>
        <p className="mt-1 text-[13px] text-muted-foreground">This usually takes a few seconds.</p>
      </div>
    </div>
  );
}
