import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/coming-soon";

export const Route = createFileRoute("/_authenticated/_crm/crm/decedents")({
  component: () => (
    <ComingSoon
      title="Decedents"
      description="Roster, check-in/out, in-house board — Phase 2."
    />
  ),
});
