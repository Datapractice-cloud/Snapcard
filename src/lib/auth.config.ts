import type { NextAuthConfig } from "next-auth";

/**
 * The half of the Auth.js config that is safe on the Edge runtime, because
 * `src/middleware.ts` builds its own NextAuth instance from it.
 *
 * Nothing here may import `src/lib/env.ts`: that module enumerates
 * `process.env`, which the Edge runtime does not expose the way Node does.
 * The provider and the environment-dependent callbacks live in `auth.ts`,
 * which only ever runs on the server.
 */
export const authConfig = {
  /*
   * Hostinger terminates TLS in front of the Node process, so Auth.js has to
   * be told to trust the forwarded host rather than guess the callback URL.
   *
   * Read straight off process.env rather than through env.ts: this module also
   * runs on the Edge runtime in middleware, where process.env is not
   * enumerable. A static member access is the form that works on both, and
   * env.ts still validates the value at server startup.
   */
  trustHost: process.env.AUTH_TRUST_HOST !== "false",
  providers: [],
  pages: {
    signIn: "/login",
    // Send rejections back to /login?error=… instead of the stock Auth.js page.
    error: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days — a rep signs in before travelling.
  },
  callbacks: {
    session({ session, token }) {
      if (session.user) {
        session.user.role = token.role ?? "rep";
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
