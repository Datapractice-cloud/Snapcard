import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth.config";
import { jsonError } from "@/lib/http";

// Middleware runs on the Edge runtime, so it builds its own NextAuth instance
// from the env-free config. `src/lib/auth.ts` is deliberately not imported here.
const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const { nextUrl } = req;
  const session = req.auth;

  if (!session?.user) {
    // A phone calling /api/* wants an answer it can parse. Redirecting it to
    // the login page hands `fetch` a page of HTML and a 200, which the outbox
    // would read as success.
    if (nextUrl.pathname.startsWith("/api/")) return jsonError("unauthorized", 401);

    const login = new URL("/login", nextUrl);
    // Come back to where they were headed once they have signed in.
    login.searchParams.set("next", nextUrl.pathname + nextUrl.search);
    return NextResponse.redirect(login);
  }

  if (nextUrl.pathname.startsWith("/admin") && session.user.role !== "admin") {
    return NextResponse.redirect(new URL("/scan", nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  /*
   * Everything is protected except the login page, the Auth.js endpoints, and
   * the files the browser fetches before there is a session: the service
   * worker, the manifest and the icons.
   */
  matcher: [
    /*
     * api/sync and api/reconcile are excluded because they are called by cron
     * with a SYNC_SECRET bearer token and no session (Phase 2); a session check
     * here would reject them before their own handler ever runs.
     */
    "/((?!api/auth|api/sync|api/reconcile|login|manifest\.webmanifest|sw\.js|icons/|_next/static|_next/image|favicon\.ico).*)",
  ],
};
