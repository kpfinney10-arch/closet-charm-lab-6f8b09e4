import { Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  LayoutDashboard,
  Users as UsersIcon,
  Building2,
  BarChart3,
  Settings,
  LogOut,
  Flame,
  UserSquare2,
  Activity,
  Truck,
  ShieldCheck,
  FileClock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";
import type { ReactNode } from "react";

const NAV = [
  { to: "/crm/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/crm/decedents", label: "Decedents", icon: UserSquare2 },
  { to: "/crm/updates", label: "Updates", icon: Activity },
  { to: "/crm/cremation-logs", label: "Cremation", icon: Flame },
  { to: "/crm/funeral-homes", label: "Funeral homes", icon: Building2 },
  { to: "/crm/reports", label: "Reports", icon: BarChart3 },
  { to: "/crm/export-audit", label: "Export audit", icon: FileClock, adminOnly: true },
  { to: "/crm/users", label: "Users", icon: ShieldCheck, adminOnly: true },
] as const;


export function CrmShell({ children, isAdmin }: { children?: ReactNode; isAdmin: boolean }) {
  const { user, signOut, hasAnyRole } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const nav = NAV.filter((n) => !("adminOnly" in n && n.adminOnly) || isAdmin);
  const initials = (user?.email ?? "U").slice(0, 2).toUpperCase();

  return (
    <div className="flex min-h-screen w-full bg-muted/20">
      <aside className="hidden w-60 flex-col border-r bg-background md:flex">
        <div className="flex h-14 items-center gap-2 border-b px-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Flame className="h-4 w-4" />
          </div>
          <span className="font-semibold">CareOne CRM</span>
        </div>

        <nav className="flex-1 space-y-1 p-2">
          {nav.map(({ to, label, icon: Icon }) => {
            const active = location.pathname.startsWith(to);
            return (
              <Link
                key={to}
                to={to}
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-accent text-accent-foreground font-medium"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            );
          })}
        </nav>

        {hasAnyRole(["admin", "dispatcher"]) ? (
          <div className="border-t p-2">
            <Button
              variant="outline"
              className="w-full justify-start gap-2"
              size="sm"
              onClick={() => navigate({ to: "/dashboard" })}
            >
              <Truck className="h-4 w-4" />
              Switch to Dispatch
            </Button>
          </div>
        ) : null}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b bg-background px-4">
          <div className="flex items-center gap-2 md:hidden">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Flame className="h-4 w-4" />
            </div>
            <span className="font-semibold">CareOne CRM</span>
          </div>

          <div className="flex items-center gap-2">
            <Badge variant="default" className="text-xs">
              Acting as CRM
            </Badge>
          </div>

          <div className="flex items-center gap-1">
            <ThemeToggle />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-full">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="truncate">{user?.email}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {hasAnyRole(["admin", "dispatcher"]) ? (
                  <DropdownMenuItem onClick={() => navigate({ to: "/dashboard" })}>
                    <Truck className="mr-2 h-4 w-4" />
                    Switch to Dispatch
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuItem onClick={() => navigate({ to: "/crm/dashboard" })}>
                  <Settings className="mr-2 h-4 w-4" />
                  CRM Home
                </DropdownMenuItem>
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

        <nav className="order-2 grid grid-cols-5 border-t bg-background md:hidden">
          {nav.slice(0, 5).map(({ to, label, icon: Icon }) => {
            const active = location.pathname.startsWith(to);
            return (
              <Link
                key={to}
                to={to}
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 py-2 text-[10px]",
                  active ? "text-primary" : "text-muted-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            );
          })}
        </nav>

        <main className="flex-1 overflow-auto">{children ?? <Outlet />}</main>
      </div>
    </div>
  );
}
