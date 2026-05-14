import { createFileRoute, Navigate, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/contexts/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, ShieldCheck, RefreshCw, LogOut } from "lucide-react";

export const Route = createFileRoute("/pending-approval")({
  component: PendingApprovalPage,
  head: () => ({ meta: [{ title: "Pending approval — Transport Dispatch" }] }),
});

function PendingApprovalPage() {
  const { session, loading, approved, user, signOut, refreshApproval } = useAuth();
  const navigate = useNavigate();

  // Re-check approval periodically in case admin approves while user waits
  useEffect(() => {
    if (!session) return;
    const id = setInterval(() => {
      void refreshApproval();
    }, 15000);
    return () => clearInterval(id);
  }, [session, refreshApproval]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!session) return <Navigate to="/login" />;
  if (approved) return <Navigate to="/" />;

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/20 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <CardTitle>Waiting for admin approval</CardTitle>
          <CardDescription>
            Your account ({user?.email}) was created and is pending review by an administrator.
            You'll get access as soon as someone on the team approves you.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Button
            className="w-full"
            variant="outline"
            onClick={() => void refreshApproval()}
          >
            <RefreshCw className="mr-2 h-4 w-4" /> Check again
          </Button>
          <Button
            className="w-full"
            variant="ghost"
            onClick={async () => {
              await signOut();
              navigate({ to: "/login" });
            }}
          >
            <LogOut className="mr-2 h-4 w-4" /> Sign out
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
