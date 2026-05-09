import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/coming-soon";

export const Route = createFileRoute("/_authenticated/_dispatcher/drivers")({
  component: () => <ComingSoon title="Drivers" description="Roster, on/off duty, current assignments." />,
});
