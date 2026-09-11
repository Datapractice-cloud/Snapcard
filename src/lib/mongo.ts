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
     * PLAN-2 says 3s, on the reasoning that Atlas must never hold up the
     * response the phone is waiting for. That reasoning is right and the number
     * was wrong: the *first* connection includes DNS, TLS and the replica-set
     * handshake, measured here at up to 21s on a slow link, so a 3s budget
     * meant the pool could never warm up at all and every request failed.
     *
     * This is the ceiling for the cold case only: the pool opens on first use
     * and every request after that is immediate. It cannot be warmed at boot —
     * instrumentation.ts is compiled for Edge too, where this driver will not
     * resolve.
     */
    serverSelectionTimeoutMS: 30_000,
    // Give up on a single operation long before the connection budget.
    socketTimeoutMS: 20_000,
    maxPoolSize: 10,
  });

  return client.connect();
}

export function mongoClient(): Promise<MongoClient> {
  if (!globalThis.__snapcardMongo) {
    globalThis.__snapcardMongo = connect().catch((error: unknown) => {
      /*
       * Never cache a failure. `??=` alone would keep a rejected promise for
       * the life of the process, so one bad moment — Atlas asleep, a reset
       * socket, a DNS blip at boot — would mean every request afterwards
       * failed with the same stale error until someone restarted the server.
       */
      globalThis.__snapcardMongo = undefined;
      throw error;
    });
  }
  return globalThis.__snapcardMongo;
}

/**
 * Drops the cached client so the next call reconnects.
 *
 * Called when an operation fails at the socket level: the driver reconnects a
 * dropped pool on its own, but a topology that has actually closed will not
 * recover by itself.
 */
export async function resetMongoClient(): Promise<void> {
  const existing = globalThis.__snapcardMongo;
  globalThis.__snapcardMongo = undefined;
  if (!existing) return;
  await existing.then((client) => client.close()).catch(() => {});
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
    status: "synced" | "duplicate" | "failed" | "needs_review" | "skipped";
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

/** One row of the admin table, read from Atlas rather than Salesforce. */
export async function listTodaysLeadsFromAtlas(limit = 200) {
  const leads = await leadsCollection();
  const since = new Date();
  since.setHours(0, 0, 0, 0);

  const docs = await leads
    .find({ createdAt: { $gte: since } })
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();

  return docs.map((doc) => ({
    id: doc.clientId,
    name: [doc.fields.firstName, doc.fields.lastName].filter(Boolean).join(" "),
    company: doc.fields.company ?? "",
    title: doc.fields.title ?? "",
    email: doc.fields.email ?? "",
    phone: doc.fields.phone ?? "",
    createdAt: doc.createdAt.toISOString(),
    status: doc.salesforce?.status ?? "skipped",
    capturedBy: doc.capturedBy ?? "",
  }));
}

export type LeadDetail = {
  clientId: string;
  capturedBy: string;
  fields: Record<string, string>;
  rawText: string;
  consentAt: string | null;
  salesforce: LeadDoc["salesforce"];
  createdAt: string;
  sides: ("front" | "back")[];
};

/** The whole lead, plus which card sides have an image stored. */
export async function findLeadDetail(clientId: string): Promise<LeadDetail | null> {
  const leads = await leadsCollection();
  const doc = await leads.findOne({ clientId });
  if (!doc) return null;

  const images = await leadImagesCollection();
  const stored = await images.find({ clientId }, { projection: { side: 1 } }).toArray();

  return {
    clientId: doc.clientId,
    capturedBy: doc.capturedBy,
    fields: doc.fields,
    rawText: doc.rawText,
    consentAt: doc.consent?.at ? doc.consent.at.toISOString() : null,
    salesforce: doc.salesforce,
    createdAt: doc.createdAt.toISOString(),
    sides: stored.map((image) => image.side),
  };
}

/** The stored bytes for one side. Null when there is no such image. */
export async function findLeadImage(clientId: string, side: "front" | "back") {
  const images = await leadImagesCollection();
  const image = await images.findOne({ clientId, side });
  if (!image) return null;
  return { mimeType: image.mimeType, bytes: Buffer.from(image.data.buffer) };
}

/** Who captured a lead, for the access check. Cheap: one indexed field. */
export async function findLeadOwner(clientId: string): Promise<string | null> {
  const leads = await leadsCollection();
  const doc = await leads.findOne({ clientId }, { projection: { capturedBy: 1 } });
  return doc?.capturedBy ?? null;
}
