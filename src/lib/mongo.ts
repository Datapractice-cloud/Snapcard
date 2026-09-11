import { MongoClient, type Binary, type Db } from "mongodb";
import { env } from "./env";

/**
 * One MongoClient for the whole process.
 *
 * Cached on globalThis rather than a module variable because Next reloads
 * modules in development on every edit, and a fresh connection pool per reload
 * exhausts an Atlas free tier's connection limit within a few minutes. The
 * Hostinger process is long-lived, so one pool is what we want in production
 * too.
 */

declare global {
  var __snapcardMongo: Promise<MongoClient> | undefined;
}

function connect(): Promise<MongoClient> {
  const uri = env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set.");

  const client = new MongoClient(uri, {
    /*
     * Three seconds, not the 30s default. Atlas being unreachable must never
     * hold up the Salesforce write or the response the phone is waiting for —
     * the backup is a mirror, not the system of record.
     */
    serverSelectionTimeoutMS: 3000,
    maxPoolSize: 10,
  });

  return client.connect();
}

export function mongoClient(): Promise<MongoClient> {
  globalThis.__snapcardMongo ??= connect();
  return globalThis.__snapcardMongo;
}

export async function mongoDb(): Promise<Db> {
  const client = await mongoClient();
  return client.db(env.MONGODB_DB);
}

/** The lead as Atlas holds it. See the document shape in PLAN-2 Task 1. */
export type LeadDoc = {
  clientId: string;
  capturedBy: string;
  fields: Record<string, string>;
  rawText: string;
  consent: { given: true; at: Date };
  salesforce: {
    status: "synced" | "duplicate" | "failed" | "needs_review";
    leadId?: string;
    duplicateOf?: string;
    attempts: number;
    lastError?: string;
    nextAttemptAt?: Date;
    syncedAt?: Date;
    /** Held by whichever sync run is currently working on this lead. */
    claimedUntil?: Date;
  };
  backup: { source: "live" | "phone-retry" | "reconciled"; savedAt: Date };
  createdAt: Date;
  updatedAt: Date;
};

export type LeadImageDoc = {
  clientId: string;
  side: "front" | "back";
  mimeType: string;
  sizeBytes: number;
  data: Binary;
  createdAt: Date;
};

export async function leadsCollection() {
  return (await mongoDb()).collection<LeadDoc>("leads");
}

export async function leadImagesCollection() {
  return (await mongoDb()).collection<LeadImageDoc>("lead_images");
}
