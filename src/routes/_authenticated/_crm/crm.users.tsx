import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/coming-soon";

export const Route = createFileRoute("/_authenticated/_crm/crm/users")({
  component: () => (
    <ComingSoon
      title="Users"
      description="Invite teammates and assign CRM roles — Phase 1.5."
    />
  ),
});
