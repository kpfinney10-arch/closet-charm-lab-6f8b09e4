import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/coming-soon";

export const Route = createFileRoute("/_authenticated/_crm/crm/updates")({
  component: () => (
    <ComingSoon title="Updates" description="Live status board — Phase 3." />
  ),
});
