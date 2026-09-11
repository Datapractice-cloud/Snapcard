import { PageHeader } from "@/components/page-header";
import { LeadsList } from "@/components/leads-list";

export default function LeadsPage() {
  return (
    <>
      <PageHeader
        title="My leads"
        subtitle="Every card you have scanned on this phone, newest first."
      />
      <LeadsList />
    </>
  );
}
