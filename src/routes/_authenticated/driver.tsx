import { createFileRoute, Link, Outlet, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/contexts/auth-context";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Truck, LogOut, LayoutDashboard, MoreVertical } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/driver")({
  component: DriverLayout,
});

function DriverLayout() {
  const { user, signOut, hasRole, hasAnyRole } = useAuth();
  const navigate = useNavigate();

  if (!hasRole("driver") && !hasRole("admin")) {
    navigate({ to: "/" });
    return null;
  }

  const canSwitchToDispatch = hasAnyRole(["admin", "dispatcher"]);

  return (
    <div className="flex min-h-screen flex-col bg-muted/20">
      <header className="flex h-14 items-center justify-between border-b bg-background px-4">
        <Link to="/driver" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Truck className="h-4 w-4" />
          </div>
          <span className="font-semibold">My runs</span>
          <Badge variant="default" className="ml-1 text-xs">
            Acting as Driver
          </Badge>
        </Link>
        <div className="flex items-center gap-1">
          <span className="hidden text-xs text-muted-foreground sm:inline">{user?.email}</span>
          <ThemeToggle />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Account menu">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="truncate">{user?.email}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {canSwitchToDispatch ? (
                <DropdownMenuItem onClick={() => navigate({ to: "/dashboard" })}>
                  <LayoutDashboard className="mr-2 h-4 w-4" />
                  Switch to dispatch view
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem
                onClick={async () => {
                  await signOut();
                  navigate({ to: "/login" });
                }}
              >
                <LogOut className="mr-2 h-4 w-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
