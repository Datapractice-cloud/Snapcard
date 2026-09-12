"use client";

import { useEffect, useState } from "react";
import { DeviceMobile } from "@phosphor-icons/react/dist/csr/DeviceMobile";
import { Export } from "@phosphor-icons/react/dist/csr/Export";
import { X } from "@phosphor-icons/react/dist/csr/X";
import { Button } from "@/components/ui/button";

/**
 * Nudges a rep to install the app before the event.
 *
 * Worth the screen space: installed, the app keeps its session, opens straight
 * to the camera without browser chrome, and — the part that matters — cannot
 * lose the outbox to a tab someone closed.
 *
 * Dismissal is per-browser and remembered, so this is asked once.
 */

const DISMISSED_KEY = "snapcard:install-dismissed";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function InstallPrompt() {
  const [dismissed, setDismissed] = useState(true);
  const [androidPrompt, setAndroidPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHint, setShowIosHint] = useState(false);

  useEffect(() => {
    if (isInstalled() || wasDismissed()) return;

    setDismissed(false);
    setShowIosHint(isIosSafari());

    // Chrome fires this when the app is installable; it must be captured or
    // the chance to call prompt() is gone.
    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setAndroidPrompt(event as BeforeInstallPromptEvent);
    };

    const onInstalled = () => dismiss(setDismissed);

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  // Nothing to say unless iOS needs instructions or Chrome offered a prompt.
  if (dismissed || (!androidPrompt && !showIosHint)) return null;

  return (
    <div className="mb-4 flex items-start gap-3 rounded-[14px] border border-[var(--brand-line)] bg-brand-soft px-4 py-3.5">
      <DeviceMobile size={20} weight="bold" className="mt-0.5 shrink-0 text-brand" />

      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] font-extrabold text-[var(--brand-deep)]">Install SnapCard</p>

        {androidPrompt ? (
          <>
            <p className="mt-0.5 text-[13px] text-[var(--brand-deep)]">
              Keeps you signed in and works when the venue wifi does not.
            </p>
            <Button
              type="button"
              size="tap"
              className="mt-2.5"
              onClick={async () => {
                await androidPrompt.prompt();
                await androidPrompt.userChoice;
                dismiss(setDismissed);
              }}
            >
              Install app
            </Button>
          </>
        ) : (
          <p className="mt-0.5 flex flex-wrap items-center gap-1 text-[13px] text-[var(--brand-deep)]">
            Tap
            <Export size={15} weight="bold" className="inline shrink-0" />
            Share, then <span className="font-bold">Add to Home Screen</span>.
          </p>
        )}
      </div>

      <button
        type="button"
        aria-label="Dismiss the install prompt"
        onClick={() => dismiss(setDismissed)}
        className="-m-1 shrink-0 p-1 text-[var(--brand-deep)]/60 hover:text-[var(--brand-deep)]"
      >
        <X size={16} weight="bold" />
      </button>
    </div>
  );
}

function dismiss(setDismissed: (value: boolean) => void) {
  try {
    localStorage.setItem(DISMISSED_KEY, "1");
  } catch {
    // Private mode, or storage is full. Hiding it for this session is enough.
  }
  setDismissed(true);
}

function wasDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

function isInstalled(): boolean {
  // `standalone` is the iOS signal; the media query is everyone else's.
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return iosStandalone || window.matchMedia("(display-mode: standalone)").matches;
}

function isIosSafari(): boolean {
  const ua = navigator.userAgent;
  const isIos = /iPad|iPhone|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
  // Chrome and Firefox on iOS cannot add to the home screen at all, so the
  // hint would only mislead.
  const isSafari = !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
  return isIos && isSafari;
}
