import { createFileRoute } from "@tanstack/react-router";
import { useCrm } from "@/contexts/crm-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, UserSquare2, Flame, Activity } from "lucide-react";

export const Route = createFileRoute("/_authenticated/_crm/crm/dashboard")({
  component: CrmDashboard,
  head: () => ({ meta: [{ title: "CRM Dashboard — CareOne" }] }),
});

function CrmDashboard() {
  const { currentOrg } = useCrm();
  const tiles = [
    { label: "Decedents in-house", value: "—", icon: UserSquare2 },
    { label: "Cremations today", value: "—", icon: Flame },
    { label: "Funeral homes", value: "—", icon: Building2 },
    { label: "Updates", value: "—", icon: Activity },
  ];
  return (
    <div className="p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          {currentOrg?.organization_name}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {tiles.map(({ label, value, icon: Icon }) => (
          <Card key={label}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {label}
              </CardTitle>
              <Icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">{value}</div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Welcome</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>This is the CareOne CRM shell. Phase 1 ships the navigation, auth, organizations, and funeral homes directory.</p>
          <p>Decedents, cremation logs, updates, and reports arrive in the next phases.</p>
        </CardContent>
      </Card>
    </div>
  );
}
