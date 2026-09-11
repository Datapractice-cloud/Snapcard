"use client";

import { useState } from "react";
import { SignOut } from "@phosphor-icons/react/dist/csr/SignOut";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { signOutEverywhere } from "@/app/auth-actions";

type Props = {
  name: string;
  email: string;
  initials: string;
  role: "admin" | "rep";
};

/**
 * Cobalt's app-bar chip. In the prototype it switched roles; here it shows who
 * is signed in and is the only way out, kept behind a sheet so a mis-tap at a
 * booth cannot sign a rep out mid-scan.
 */
export function UserChip({ name, email, initials, role }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-[7px] rounded-full border border-line bg-surface py-[5px] pr-3 pl-1.5 text-[12.5px] font-bold text-muted-foreground shadow-card"
        >
          <span className="grid size-[22px] place-items-center rounded-full bg-brand-soft text-[11px] font-extrabold text-brand">
            {initials}
          </span>
          <span className="max-w-[12ch] truncate">{name}</span>
        </button>
      </SheetTrigger>

      {/* A bottom sheet is right on a phone; on desktop it stays centred and narrow. */}
      <SheetContent side="bottom" className="rounded-t-[14px] pb-[calc(16px+env(safe-area-inset-bottom))]">
        <div className="mx-auto w-full max-w-[420px]">
          <SheetHeader className="px-0">
            <SheetTitle>{name}</SheetTitle>
            <SheetDescription>
              {email} · signed in as {role === "admin" ? "an admin" : "a sales rep"}
            </SheetDescription>
          </SheetHeader>
          <SheetFooter className="px-0">
            <form action={signOutEverywhere}>
              <Button type="submit" variant="outline" className="h-12 w-full">
                <SignOut size={18} weight="bold" />
                Sign out
              </Button>
            </form>
          </SheetFooter>
        </div>
      </SheetContent>
    </Sheet>
  );
}
