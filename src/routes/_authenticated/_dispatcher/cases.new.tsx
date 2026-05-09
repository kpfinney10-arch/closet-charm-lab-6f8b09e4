import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/coming-soon";

export const Route = createFileRoute("/_authenticated/_dispatcher/cases/new")({
  component: () => <ComingSoon title="New case" description="Intake form for a new transport." />,
});
