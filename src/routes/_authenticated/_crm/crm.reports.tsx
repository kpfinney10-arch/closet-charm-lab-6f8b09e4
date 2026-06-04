import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/coming-soon";

export const Route = createFileRoute("/_authenticated/_crm/crm/reports")({
  component: () => (
    <ComingSoon title="Reports" description="Cremation, decedent, daily logs — Phase 4." />
  ),
});
