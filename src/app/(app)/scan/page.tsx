import { PageHeader } from "@/components/page-header";
import { ScanFlow } from "@/components/scan/scan-flow";

export default function ScanPage() {
  return (
    <>
      <PageHeader
        title="Scan a business card"
        subtitle="Take a photo of the card. We read it and fill in the contact for you to check."
      />
      <ScanFlow />
    </>
  );
}
