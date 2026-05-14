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
  ClipboardList,
  Users,
  Building2,
  BarChart3,
  Settings,
  LogOut,
  Truck,
  Plus,
  ShieldCheck,
  ScrollText,
  Map as MapIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";
import type { ReactNode } from "react";

const NAV = [
  { to: "/dashboard", label: "Dispatch", icon: LayoutDashboard, adminOnly: false },
  { to: "/map", label: "Live map", icon: MapIcon, adminOnly: false },
  { to: "/cases", label: "Cases", icon: ClipboardList, adminOnly: false },
  { to: "/drivers", label: "Drivers", icon: Users, adminOnly: false },
  { to: "/facilities", label: "Facilities", icon: Building2, adminOnly: false },
  { to: "/vehicles", label: "Vehicles", icon: Truck, adminOnly: false },
  { to: "/reports", label: "Reports", icon: BarChart3, adminOnly: false },
  { to: "/users", label: "Users", icon: ShieldCheck, adminOnly: true },
  { to: "/audit-log", label: "Audit log", icon: ScrollText, adminOnly: true },
  { to: "/settings", label: "Settings", icon: Settings, adminOnly: false },
] as const;

export function DispatcherShell({ children }: { children?: ReactNode }) {
  const { user, roles, signOut, hasRole } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const nav = NAV.filter((n) => !n.adminOnly || hasRole("admin"));

  const initials = (user?.email ?? "U").slice(0, 2).toUpperCase();

  return (
    <div className="flex min-h-screen w-full bg-muted/20">
      {/* Sidebar */}
      <aside className="hidden w-60 flex-col border-r bg-background md:flex">
        <div className="flex h-14 items-center gap-2 border-b px-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Truck className="h-4 w-4" />
          </div>
          <span className="font-semibold">Dispatch</span>
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

        <div className="border-t p-2">
          <Button
            className="w-full justify-start gap-2"
            size="sm"
            onClick={() => navigate({ to: "/cases/new" })}
          >
            <Plus className="h-4 w-4" />
            New case
          </Button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b bg-background px-4">
          <div className="flex items-center gap-2 md:hidden">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Truck className="h-4 w-4" />
            </div>
            <span className="font-semibold">Dispatch</span>
          </div>

          <div className="flex items-center gap-2">
            <Badge variant="default" className="text-xs">
              Acting as Dispatcher
            </Badge>
            {roles.map((r) => (
              <Badge key={r} variant="secondary" className="text-xs capitalize">
                {r}
              </Badge>
            ))}
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
              {hasRole("driver") ? (
                <DropdownMenuItem onClick={() => navigate({ to: "/driver" })}>
                  <Truck className="mr-2 h-4 w-4" />
                  Switch to driver view
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem onClick={() => navigate({ to: "/settings" })}>
                <Settings className="mr-2 h-4 w-4" />
                Settings
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

        {/* Mobile bottom nav */}
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
