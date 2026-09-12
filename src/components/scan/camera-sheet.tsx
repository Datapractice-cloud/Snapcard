"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera } from "@phosphor-icons/react/dist/csr/Camera";
import { WarningCircle } from "@phosphor-icons/react/dist/csr/WarningCircle";
import { X } from "@phosphor-icons/react/dist/csr/X";
import { Button } from "@/components/ui/button";

type Props = {
  /** "Front" or "Back", shown in the hint. */
  label: string;
  onCapture: (file: File) => void;
  onClose: () => void;
  /** Offered on touch devices, where the OS camera app takes a better photo. */
  onUseDeviceCamera?: () => void;
};

type State = { kind: "starting" } | { kind: "ready" } | { kind: "error"; message: string };

/**
 * Cobalt's camera pane, full screen.
 *
 * Full screen rather than inline because the rep is aligning a small card and
 * needs to see the print well enough to know it is in focus.
 */
export function CameraSheet({ label, onCapture, onClose, onUseDeviceCamera }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [state, setState] = useState<State>({ kind: "starting" });

  useEffect(() => {
    let cancelled = false;

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setState({ kind: "error", message: messageForMissingApi() });
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            // The rear camera on a phone; ignored where there is only one.
            facingMode: { ideal: "environment" },
            // Ask for detail: small print on a card is the whole job.
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });

        if (cancelled) {
          for (const track of stream.getTracks()) track.stop();
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setState({ kind: "ready" });
      } catch (error) {
        if (!cancelled) setState({ kind: "error", message: messageForError(error) });
      }
    }

    void start();

    return () => {
      cancelled = true;
      // Release the camera, or the indicator light stays on and the device
      // holds the camera against the next app that wants it.
      for (const track of streamRef.current?.getTracks() ?? []) track.stop();
      streamRef.current = null;
    };
  }, []);

  const shoot = useCallback(() => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;

    // Full sensor resolution; compressImage does the resizing afterwards.
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const context = canvas.getContext("2d");
    if (!context) return;
    context.drawImage(video, 0, 0);

    canvas.toBlob(
      (blob) => {
        if (blob) onCapture(new File([blob], `card-${Date.now()}.jpg`, { type: "image/jpeg" }));
      },
      "image/jpeg",
      0.92,
    );
  }, [onCapture]);

  // Escape closes, as it would any other full-screen layer.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div role="dialog" aria-modal aria-label={`Photograph the ${label.toLowerCase()} of the card`} className="fixed inset-0 z-50 flex flex-col bg-[var(--scrim)]">
      <div className="flex items-center justify-between px-4 pt-[calc(12px+env(safe-area-inset-top))] pb-3">
        <p className="text-[14px] font-extrabold text-white">{label} of the card</p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close the camera"
          className="grid size-10 place-items-center rounded-full bg-white/10 text-white"
        >
          <X size={18} weight="bold" />
        </button>
      </div>

      <div className="relative min-h-0 flex-1">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="size-full object-cover"
          // Safari will not start the stream without this having been set.
          onLoadedMetadata={(event) => void event.currentTarget.play().catch(() => {})}
        />

        {state.kind === "ready" && (
          <>
            {/* Cobalt's `.cam-frame`: a card-shaped hole in a dimmed overlay. */}
            <div className="pointer-events-none absolute inset-y-[12%] inset-x-[8%] rounded-xl border-2 border-white/85 shadow-[0_0_0_999px_rgba(0,0,0,0.32)]" />
            <p className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-[12.5px] font-bold text-white [text-shadow:0_1px_4px_rgba(0,0,0,0.6)]">
              Fill the frame with the card, then tap the button
            </p>
          </>
        )}

        {state.kind === "starting" && (
          <p className="absolute inset-0 grid place-items-center text-[13.5px] font-bold text-white/80">
            Starting the camera…
          </p>
        )}

        {state.kind === "error" && (
          <div className="absolute inset-0 grid place-items-center px-6">
            <div className="max-w-[46ch] text-center">
              <WarningCircle size={34} weight="bold" className="mx-auto text-white/70" />
              <p className="mt-3 text-[14px] font-bold text-white">{state.message}</p>
              {onUseDeviceCamera && (
                <Button type="button" size="tap" className="mt-5" onClick={onUseDeviceCamera}>
                  <Camera size={18} weight="bold" />
                  Use the camera app instead
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-center gap-6 px-4 pt-4 pb-[calc(20px+env(safe-area-inset-bottom))]">
        {onUseDeviceCamera && state.kind === "ready" && (
          <button
            type="button"
            onClick={onUseDeviceCamera}
            className="absolute left-6 text-[12.5px] font-bold text-white/70"
          >
            Camera app
          </button>
        )}

        {/* Cobalt's `.cam-shutter`. */}
        <button
          type="button"
          onClick={shoot}
          disabled={state.kind !== "ready"}
          aria-label="Take the photo"
          className="size-[58px] rounded-full border-4 border-white/45 bg-white bg-clip-padding disabled:opacity-40"
        />
      </div>
    </div>
  );
}

function messageForMissingApi(): string {
  // getUserMedia is only exposed on a secure origin. A phone pointed at a LAN
  // IP over plain http is the usual way to hit this.
  if (typeof window !== "undefined" && !window.isSecureContext) {
    return "The camera needs a secure connection. Open the app over https, or on localhost.";
  }
  return "This browser will not give the page a camera.";
}

function messageForError(error: unknown): string {
  const name = error instanceof Error ? error.name : "";

  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Camera access was blocked. Allow it for this site in your browser settings, then try again.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return "No camera was found on this device.";
  }
  if (name === "NotReadableError") {
    return "The camera is already in use by another app.";
  }
  return "The camera could not be started.";
}
