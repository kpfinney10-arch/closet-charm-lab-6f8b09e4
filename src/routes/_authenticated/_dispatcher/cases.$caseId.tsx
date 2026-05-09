import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/coming-soon";

export const Route = createFileRoute("/_authenticated/_dispatcher/cases/$caseId")({
  component: CaseDetail,
});

function CaseDetail() {
  const { caseId } = Route.useParams();
  return <ComingSoon title="Case detail" description={`Case ${caseId}`} />;
}
