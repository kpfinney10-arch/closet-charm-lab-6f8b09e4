import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/coming-soon";

export const Route = createFileRoute("/_authenticated/_dispatcher/cases")({
  component: () => <ComingSoon title="Cases" description="Full case list with filters." />,
});
