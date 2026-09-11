import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";

export default function ScanPage() {
  return (
    <>
      <PageHeader
        title="Scan a business card"
        subtitle="Take a photo or pick one from your gallery. We read the card and pre-fill the contact for review."
      />
      <Card className="p-5 text-sm text-muted-foreground">
        Capture, review and save arrive in Tasks 8 and 9.
      </Card>
    </>
  );
}
