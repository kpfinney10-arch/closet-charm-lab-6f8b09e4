import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useAuth } from "@/contexts/auth-context";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/")({
  component: IndexRedirect,
});

function IndexRedirect() {
  const { session, loading, hasAnyRole, hasRole } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!session) return <Navigate to="/login" />;

  // Drivers go straight to their queue; everyone else lands on the dispatch board
  if (hasRole("driver") && !hasAnyRole(["admin", "dispatcher"])) {
    return <Navigate to="/driver" />;
  }

  return <Navigate to="/dashboard" />;
}
