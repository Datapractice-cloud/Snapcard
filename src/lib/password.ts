import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

/**
 * Password hashing.
 *
 * scrypt rather than bcrypt or argon2 because it is memory-hard, it is in
 * Node's standard library, and it needs no native module to compile on the
 * host. A password is never stored, logged, or compared with `===`.
 */

/*
 * Written out rather than `promisify(scrypt)`: the promisified type drops the
 * options overload, and the options are the entire point — they carry the work
 * factor.
 */
function deriveKey(password: string, salt: Buffer, length: number, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, length, options, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

/*
 * OWASP's floor for scrypt is N=2^17, r=8, p=1. N is the work factor and the
 * memory cost: 2^17 with r=8 is about 128 MB per hash, which is the point —
 * it is what makes a stolen table expensive to attack offline.
 */
const N = 2 ** 17;
const R = 8;
const P = 1;
const KEY_BYTES = 64;
const SALT_BYTES = 16;

/** Stored as `scrypt$N$r$p$salt$hash`, so the parameters travel with the hash. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await deriveKey(password.normalize("NFKC"), salt, KEY_BYTES, {
    N,
    r: R,
    p: P,
    // Node caps scrypt memory at 32MB by default and throws above it.
    maxmem: 256 * 1024 * 1024,
  });

  return ["scrypt", N, R, P, salt.toString("base64"), key.toString("base64")].join("$");
}

/**
 * Always does the full derivation, even for a hash it cannot parse, so the
 * time taken says nothing about whether the account exists.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");

  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const n = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) return false;

  const salt = Buffer.from(parts[4], "base64");
  const expected = Buffer.from(parts[5], "base64");
  if (salt.length === 0 || expected.length === 0) return false;

  let derived: Buffer;
  try {
    derived = await deriveKey(password.normalize("NFKC"), salt, expected.length, {
      N: n,
      r,
      p,
      maxmem: 256 * 1024 * 1024,
    });
  } catch {
    return false;
  }

  // Constant time: a byte-by-byte comparison leaks how much of the hash matched.
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

/** What a password must be before it is accepted. */
export const MIN_PASSWORD_LENGTH = 12;

/**
 * Length over composition rules. Forcing a symbol and a digit reliably
 * produces "Password1!"; length is what actually costs an attacker.
 */
export function passwordProblem(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (password.length > 200) return "That is too long to be a password.";
  if (!password.trim()) return "A password cannot be only spaces.";
  return null;
}

/** A password to hand someone, when an admin creates their account. */
export function suggestPassword(): string {
  // Base64url of 12 bytes: 16 characters, ~72 bits of entropy, no ambiguity
  // about which symbols are allowed.
  return randomBytes(12).toString("base64url");
}
