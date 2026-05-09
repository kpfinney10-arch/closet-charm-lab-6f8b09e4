import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/coming-soon";

export const Route = createFileRoute("/_authenticated/_dispatcher/reports")({
  component: () => <ComingSoon title="Reports" description="Daily run sheets and case volume." />,
});
