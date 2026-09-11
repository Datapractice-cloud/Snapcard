/**
 * Pure access rules, kept apart from `auth.ts` so they can be unit-tested
 * without loading next-auth or a real environment, and so the edge-safe
 * `auth.config.ts` can share them.
 */

export type Role = "admin" | "rep";

/** The shape of the Google `profile` we care about. Fields may be absent. */
export type GoogleProfileLike = {
  email?: unknown;
  email_verified?: unknown;
  hd?: unknown;
};

/**
 * Who may sign in.
 *
 * All three checks matter: `hd` proves the account belongs to the Workspace
 * (a personal gmail.com account has no `hd`), the email suffix catches a
 * profile where `hd` was set by a flow we do not control, and
 * `email_verified` stops an unverified address being claimed.
 */
export function isAllowedProfile(profile: GoogleProfileLike | null | undefined, domain: string): boolean {
  if (!profile) return false;
  if (profile.email_verified !== true) return false;

  const allowed = domain.trim().toLowerCase();
  if (!allowed) return false;

  const hd = typeof profile.hd === "string" ? profile.hd.trim().toLowerCase() : "";
  if (hd !== allowed) return false;

  const email = typeof profile.email === "string" ? profile.email.trim().toLowerCase() : "";
  return email.endsWith(`@${allowed}`);
}

/** `ADMIN_EMAILS` is already lowercased and split by `env.ts`. */
export function isAdmin(email: string | null | undefined, adminEmails: readonly string[]): boolean {
  if (!email) return false;
  return adminEmails.includes(email.trim().toLowerCase());
}

export function roleFor(email: string | null | undefined, adminEmails: readonly string[]): Role {
  return isAdmin(email, adminEmails) ? "admin" : "rep";
}
