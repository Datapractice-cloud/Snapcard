import type { Collection, Db } from "mongodb";
import { withMongo } from "./mongo";
import { hashPassword, suggestPassword, verifyPassword } from "./password";
import type { Role } from "./auth-rules";

/**
 * Accounts an admin creates by hand, for people who cannot sign in with a
 * thinkvibes.com Google account.
 *
 * This sits *alongside* Google sign-in rather than replacing it: Google remains
 * the way the team gets in, and the domain restriction that protects the app
 * stays exactly as it was.
 */

export type AppUser = {
  /** Lowercased. The identity, and the unique key. */
  email: string;
  name: string;
  passwordHash: string;
  role: Role;
  /** Set instead of deleting, so a lead's capturedBy still resolves to a person. */
  disabled?: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
};

/** Everything except the hash. What the admin screen is allowed to see. */
export type PublicUser = Omit<AppUser, "passwordHash">;

function collection(db: Db): Collection<AppUser> {
  return db.collection<AppUser>("app_users");
}

/** Emails are case-insensitive in practice; store one canonical form. */
export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

let indexReady = false;

/**
 * Created on first use rather than in the index script, so this feature is
 * self-contained. Unique, because two accounts for one email is an
 * authentication bug waiting to happen.
 */
async function ensureIndex(db: Db): Promise<void> {
  if (indexReady) return;
  await collection(db).createIndex({ email: 1 }, { unique: true, name: "email_unique" });
  indexReady = true;
}

export type CreateUserResult =
  | { ok: true; user: PublicUser }
  | { ok: false; reason: "duplicate" };

export async function createUser(input: {
  email: string;
  name: string;
  password: string;
  role: Role;
  createdBy: string;
}): Promise<CreateUserResult> {
  const email = normaliseEmail(input.email);
  // Hashed before the insert is attempted, so a duplicate email and a new one
  // cost the same time and neither reveals the other.
  const passwordHash = await hashPassword(input.password);
  const now = new Date();

  const doc: AppUser = {
    email,
    name: input.name.trim() || email.split("@")[0],
    passwordHash,
    role: input.role,
    createdBy: input.createdBy,
    createdAt: now,
    updatedAt: now,
  };

  try {
    await withMongo(async (db) => {
      await ensureIndex(db);
      return collection(db).insertOne(doc);
    });
  } catch (error) {
    // 11000 is the unique index rejecting a second account for this email.
    if ((error as { code?: number }).code === 11000) return { ok: false, reason: "duplicate" };
    throw error;
  }

  return { ok: true, user: toPublic(doc) };
}

export async function listUsers(): Promise<PublicUser[]> {
  const docs = await withMongo((db) =>
    collection(db)
      .find({}, { projection: { passwordHash: 0 } })
      .sort({ createdAt: -1 })
      .limit(200)
      .toArray(),
  );
  return docs as PublicUser[];
}

/**
 * The login check. Returns null for a wrong password, an unknown email, and a
 * disabled account alike — the caller must not be able to tell which.
 */
export async function authenticate(email: string, password: string): Promise<PublicUser | null> {
  const doc = await withMongo((db) => collection(db).findOne({ email: normaliseEmail(email) }));

  /*
   * Verify against a decoy hash when there is no such user, so that a missing
   * account costs the same as a real one. Without this, response time tells an
   * attacker which addresses are worth guessing passwords for.
   */
  const hash = doc?.passwordHash ?? (await decoyHash());
  const correct = await verifyPassword(password, hash);

  if (!doc || !correct || doc.disabled) return null;
  return toPublic(doc);
}

export async function setRole(email: string, role: Role): Promise<boolean> {
  const result = await withMongo((db) =>
    collection(db).updateOne(
      { email: normaliseEmail(email) },
      { $set: { role, updatedAt: new Date() } },
    ),
  );
  return result.matchedCount > 0;
}

export async function setDisabled(email: string, disabled: boolean): Promise<boolean> {
  const result = await withMongo((db) =>
    collection(db).updateOne(
      { email: normaliseEmail(email) },
      { $set: { disabled, updatedAt: new Date() } },
    ),
  );
  return result.matchedCount > 0;
}

export async function deleteUser(email: string): Promise<boolean> {
  const result = await withMongo((db) => collection(db).deleteOne({ email: normaliseEmail(email) }));
  return result.deletedCount > 0;
}

/** How many admin accounts are still enabled. Guards the last-admin rule. */
export async function enabledAdminCount(): Promise<number> {
  return withMongo((db) => collection(db).countDocuments({ role: "admin", disabled: { $ne: true } }));
}

function toPublic(user: AppUser): PublicUser {
  const { passwordHash: _hash, ...rest } = user;
  return rest;
}

let decoy: Promise<string> | undefined;

/**
 * A genuine hash of a password nobody knows, so verifying against it costs
 * exactly what verifying a real account costs.
 *
 * Generated rather than hard-coded: a literal has to match the current work
 * factor and key length byte for byte, and a hand-written one did not — it
 * returned in 251ms against a real hash's ~1s, which is precisely the timing
 * signal this exists to remove. Computed once, then reused.
 */
function decoyHash(): Promise<string> {
  decoy ??= hashPassword(suggestPassword());
  return decoy;
}
