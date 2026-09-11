"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";

type Props = {
  label: string;
  required?: boolean;
  error?: string;
  help?: string;
  className?: string;
  children: (props: { id: string; "aria-invalid": boolean; "aria-describedby"?: string }) => React.ReactNode;
};

/**
 * Cobalt's `.field`: bold 12.5px label, the control, then help or an error.
 *
 * Takes a render prop so the id and the aria wiring are produced once here
 * rather than repeated at every input — a form of this length is exactly where
 * a missing `aria-describedby` slips through.
 */
export function Field({ label, required, error, help, className, children }: Props) {
  const id = useId();
  const messageId = `${id}-message`;
  const message = error ?? help;

  return (
    <div className={cn("min-w-0", className)}>
      <label htmlFor={id} className="mb-1.5 block text-[12.5px] font-extrabold">
        {label} {required && <span className="text-bad">*</span>}
      </label>

      {children({
        id,
        "aria-invalid": Boolean(error),
        "aria-describedby": message ? messageId : undefined,
      })}

      {message && (
        <p
          id={messageId}
          className={cn("mt-1.5 text-xs", error ? "font-bold text-bad" : "text-subtle")}
        >
          {message}
        </p>
      )}
    </div>
  );
}
