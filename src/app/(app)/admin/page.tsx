import { redirect } from "next/navigation";
import { WarningCircle } from "@phosphor-icons/react/dist/ssr/WarningCircle";
import { AdminLeads } from "@/components/admin-leads";
import { PageHeader } from "@/components/page-header";
import { auth } from "@/lib/auth";
import { env } from "@/lib/env";
import { listTodaysLeadsFromAtlas } from "@/lib/mongo";
import { listTodaysEventLeads, type EventLeadsResult } from "@/lib/salesforce/lead";

/** Read live from Salesforce on every visit; never cached. */
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  // Middleware gates this route too; this is the check that cannot be bypassed
  // by a matcher gap or a prefetched payload.
  const session = await auth();
  if (session?.user?.role !== "admin") redirect("/scan");

  /*
   * Atlas is the source when it is configured: it holds every lead including
   * the ones Salesforce refused or never saw, which is exactly the set an admin
   * needs. Salesforce is the fallback for a deployment with no backup store.
   */
  const result: EventLeadsResult = env.MONGODB_URI
    ? await listFromAtlas()
    : await listTodaysEventLeads();

  return (
    <>
      <PageHeader title="Admin" subtitle="Today's event leads, live from Salesforce." />

      {result.ok ? (
        <AdminLeads leads={result.leads} capped={result.capped} />
      ) : (
        <div className="rounded-[14px] border border-bad/20 bg-bad-soft p-5">
          <p className="flex items-center gap-2 text-[15px] font-extrabold text-bad">
            <WarningCircle size={18} weight="bold" />
            Today&apos;s leads could not be read
          </p>
          <p className="mt-1.5 text-[13.5px] text-bad/90">
            Reps can keep scanning — leads queue on their phones and sync once this is fixed.
          </p>
          <p className="mono mt-3 rounded-[10px] bg-surface/70 p-3 text-xs break-all">{result.error}</p>
        </div>
      )}
    </>
  );
}

async function listFromAtlas(): Promise<EventLeadsResult> {
  try {
    const leads = await listTodaysLeadsFromAtlas();
    return { ok: true, leads, capped: leads.length >= 200 };
  } catch (error) {
    return { ok: false, error: (error as Error).message.slice(0, 500) };
  }
}
