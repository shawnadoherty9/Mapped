import AppLayout, { PageHeader } from "@/components/AppLayout";
import { useActiveCountry } from "@/store/useAppStore";
import ResiliencySection from "@/components/ResiliencySection";
import RiskSection from "@/components/RiskSection";

export default function RiskLensPage() {
  const country = useActiveCountry();
  return (
    <AppLayout>
      <div className="p-6 md:p-10 pb-24 md:pb-10 max-w-6xl">
        <PageHeader
          eyebrow="Module 02 · AI Risk Lens"
          title="Your resiliency in a shifting job market"
          sub={`Automation exposure, calibrated for ${country.name} labor market context`}
        />
        <ResiliencySection />
        <div className="mt-10">
          <RiskSection />
        </div>
      </div>
    </AppLayout>
  );
}
