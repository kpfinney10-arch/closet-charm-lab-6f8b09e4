import { createFileRoute, Navigate, Outlet } from "@tanstack/react-router";
import { useAuth } from "@/contexts/auth-context";
import { DispatcherShell } from "@/components/layout/dispatcher-shell";
import { Card, CardContent } from "@/components/ui/card";
import { ShieldAlert } from "lucide-react";

export const Route = createFileRoute("/_authenticated/_dispatcher")({
  component: DispatcherLayout,
});

function DispatcherLayout() {
  const { hasAnyRole, roles } = useAuth();

  // Drivers shouldn't be here
  if (roles.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="max-w-md">
          <CardContent className="space-y-3 pt-6 text-center">
            <ShieldAlert className="mx-auto h-10 w-10 text-muted-foreground" />
            <h2 className="text-lg font-semibold">Account pending</h2>
            <p className="text-sm text-muted-foreground">
              Your account doesn't have a role assigned yet. Ask an admin to grant you access.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!hasAnyRole(["admin", "dispatcher", "viewer"])) {
    return <Navigate to="/driver" />;
  }

  return (
    <DispatcherShell>
      <Outlet />
    </DispatcherShell>
  );
}
