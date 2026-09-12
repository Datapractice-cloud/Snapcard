import NextAuth, { type Session } from "next-auth";
import Google from "next-auth/providers/google";
import { authConfig } from "./auth.config";
import { isAllowedProfile } from "./auth-rules";
import { env } from "./env";
import { jsonError } from "./http";

/**
 * Server-side Auth.js instance. Imports `env.ts`, so this module must not be
 * pulled into the Edge middleware — that uses `auth.config.ts` instead.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  secret: env.AUTH_SECRET,
  providers: [
    Google({
      clientId: env.AUTH_GOOGLE_ID,
      clientSecret: env.AUTH_GOOGLE_SECRET,
      authorization: {
        params: {
          // `hd` makes Google's own account chooser hide non-Workspace
          // accounts. It is a convenience, not the check — see the signIn
          // callback for that.
          hd: env.ALLOWED_EMAIL_DOMAIN,
          // Reps share phones at a booth; never silently reuse the last account.
          prompt: "select_account",
        },
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    signIn({ profile }) {
      return isAllowedProfile(profile, env.ALLOWED_EMAIL_DOMAIN);
    },
  },
});

/**
 * For route handlers: `const session = await requireSession();`
 * `if (session instanceof Response) return session;`
 */
export async function requireSession(): Promise<Session | Response> {
  const session = await auth();
  if (!session?.user?.email) return jsonError("unauthorized", 401);
  return session;
}

/** As `requireSession`, but 403 for a signed-in rep who is not an admin. */
export async function requireAdmin(): Promise<Session | Response> {
  const session = await requireSession();
  if (session instanceof Response) return session;
  if (session.user.role !== "admin") return jsonError("forbidden", 403);
  return session;
}
