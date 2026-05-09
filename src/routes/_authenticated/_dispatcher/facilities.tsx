import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/coming-soon";

export const Route = createFileRoute("/_authenticated/_dispatcher/facilities")({
  component: () => <ComingSoon title="Facilities" description="Hospitals, residences, ME's office, crematories." />,
});
