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
    /*
     * No socketTimeoutMS. A 20s limit was killing healthy operations on a link
     * where the handshake alone takes 21s; server selection already bounds how
     * long anything waits, and `withMongo` below recovers a reset socket.
     */
    maxPoolSize: 10,
    retryReads: true,
    retryWrites: true,
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

/**
 * True for failures that mean "this connection is gone", as opposed to
 * "the database said no".
 *
 * A reset socket, a closed topology or a selection timeout are all recoverable
 * by throwing the pool away and opening a new one. A duplicate key is not, and
 * retrying it would just fail twice.
 */
function isConnectionError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  const name = error.name;
  if (
    name === "MongoNetworkError" ||
    name === "MongoNotConnectedError" ||
    name === "MongoTopologyClosedError" ||
    name === "MongoServerSelectionError"
  ) {
    return true;
  }

  const code = (error as { code?: unknown }).code;
  const causeCode = (error.cause as { code?: unknown } | undefined)?.code;
  const socketCodes = ["ECONNRESET", "EPIPE", "ETIMEDOUT", "ENOTFOUND", "ECONNREFUSED"];
  return socketCodes.includes(String(code)) || socketCodes.includes(String(causeCode));
}

/**
 * Runs a database operation, and on a connection-level failure throws the pool
 * away and tries once more.
 *
 * Without this, a single reset socket poisoned the process: the broken client
 * stayed cached, so every later request failed with the same ECONNRESET until
 * somebody restarted the server. That is exactly what the admin page was
 * showing.
 *
 * One retry, not a loop — if a fresh connection fails too, the database really
 * is unreachable and the caller should hear about it rather than hang.
 */
export async function withMongo<T>(operation: (db: Db) => Promise<T>): Promise<T> {
  try {
    return await operation(await mongoDb());
  } catch (error) {
    if (!isConnectionError(error)) throw error;

    console.warn("mongo_reconnecting", { reason: (error as Error).name || "socket" });
    await resetMongoClient();
    return operation(await mongoDb());
  }
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
  const since = new Date();
  since.setHours(0, 0, 0, 0);

  const docs = await withMongo((db) =>
    db
      .collection<LeadDoc>("leads")
      .find({ createdAt: { $gte: since } })
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray(),
  );

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
  salesforce: LeadDoc["salesforce"];
  createdAt: string;
  sides: ("front" | "back")[];
};

/** The whole lead, plus which card sides have an image stored. */
export async function findLeadDetail(clientId: string): Promise<LeadDetail | null> {
  const doc = await withMongo((db) => db.collection<LeadDoc>("leads").findOne({ clientId }));
  if (!doc) return null;

  const stored = await withMongo((db) =>
    db.collection<LeadImageDoc>("lead_images").find({ clientId }, { projection: { side: 1 } }).toArray(),
  );

  return {
    clientId: doc.clientId,
    capturedBy: doc.capturedBy,
    fields: doc.fields,
    rawText: doc.rawText,
    salesforce: doc.salesforce,
    createdAt: doc.createdAt.toISOString(),
    sides: stored.map((image) => image.side),
  };
}

/** The stored bytes for one side. Null when there is no such image. */
export async function findLeadImage(clientId: string, side: "front" | "back") {
  const image = await withMongo((db) =>
    db.collection<LeadImageDoc>("lead_images").findOne({ clientId, side }),
  );
  if (!image) return null;
  return { mimeType: image.mimeType, bytes: Buffer.from(image.data.buffer) };
}

/** Who captured a lead, for the access check. Cheap: one indexed field. */
export async function findLeadOwner(clientId: string): Promise<string | null> {
  const doc = await withMongo((db) =>
    db.collection<LeadDoc>("leads").findOne({ clientId }, { projection: { capturedBy: 1 } }),
  );
  return doc?.capturedBy ?? null;
}
