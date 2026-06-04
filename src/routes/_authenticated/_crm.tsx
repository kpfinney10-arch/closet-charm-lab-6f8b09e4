import { createFileRoute, Outlet } from "@tanstack/react-router";
import { CrmProvider, useCrm } from "@/contexts/crm-context";
import { CrmShell } from "@/components/layout/crm-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, ShieldAlert } from "lucide-react";

export const Route = createFileRoute("/_authenticated/_crm")({
  component: CrmLayout,
});

function CrmLayout() {
  return (
    <CrmProvider>
      <CrmGate />
    </CrmProvider>
  );
}

function CrmGate() {
  const { loading, currentOrg, isAdmin } = useCrm();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!currentOrg) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="max-w-md">
          <CardContent className="space-y-3 pt-6 text-center">
            <ShieldAlert className="mx-auto h-10 w-10 text-muted-foreground" />
            <h2 className="text-lg font-semibold">No CRM access</h2>
            <p className="text-sm text-muted-foreground">
              You are not yet a member of a CareOne organization. Ask an admin to invite you.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <CrmShell isAdmin={isAdmin}>
      <Outlet />
    </CrmShell>
  );
}
