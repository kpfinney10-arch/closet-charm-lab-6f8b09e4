import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/coming-soon";

export const Route = createFileRoute("/_authenticated/_crm/crm/cremation-logs")({
  component: () => (
    <ComingSoon title="Cremation Log" description="Start/stop tracking — Phase 3." />
  ),
});
