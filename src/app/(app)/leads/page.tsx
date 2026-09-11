import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";

export default function LeadsPage() {
  return (
    <>
      <PageHeader title="My leads" subtitle="Every card you have scanned, newest first." />
      <Card className="p-5 text-sm text-muted-foreground">The lead list arrives in Task 10.</Card>
    </>
  );
}
