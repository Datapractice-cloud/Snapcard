"use server";

import { signIn, signOut } from "@/lib/auth";

/**
 * `?next=` comes from the URL, so only a same-site path is ever honoured —
 * a value like `//evil.com` would otherwise be a redirect out of the app.
 */
function safeNext(next: unknown): string {
  if (typeof next !== "string") return "/scan";
  if (!next.startsWith("/") || next.startsWith("//")) return "/scan";
  return next;
}

export async function signInWithGoogle(formData: FormData) {
  await signIn("google", { redirectTo: safeNext(formData.get("next")) });
}

export async function signOutEverywhere() {
  await signOut({ redirectTo: "/login" });
}
