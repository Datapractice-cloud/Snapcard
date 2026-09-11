import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth.config";

// Middleware runs on the Edge runtime, so it builds its own NextAuth instance
// from the env-free config. `src/lib/auth.ts` is deliberately not imported here.
const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const { nextUrl } = req;
  const session = req.auth;

  if (!session?.user) {
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
    "/((?!api/auth|login|manifest\.webmanifest|sw\.js|icons/|_next/static|_next/image|favicon\.ico).*)",
  ],
};
