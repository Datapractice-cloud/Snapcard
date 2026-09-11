import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { auth } from "@/lib/auth";

export default async function AdminPage() {
  // Middleware gates this route too; this is the check that cannot be bypassed
  // by a matcher gap or a prefetched payload.
  const session = await auth();
  if (session?.user?.role !== "admin") redirect("/scan");

  return (
    <>
      <PageHeader title="Admin" subtitle="Today's leads across the team." />
      <Card className="p-5 text-sm text-muted-foreground">
        The live Salesforce table and CSV export arrive in Task 12.
      </Card>
    </>
  );
}
