import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, type AppRole } from "@/contexts/auth-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Trash2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";

export const Route = createFileRoute("/_authenticated/_dispatcher/settings")({
  component: SettingsPage,
  head: () => ({
    meta: [{ title: "Settings — Transport Dispatch" }],
  }),
});

const ROLES: AppRole[] = ["admin", "dispatcher", "driver", "viewer"];

function SettingsPage() {
  const { user, hasRole, refreshRoles } = useAuth();
  const isAdmin = hasRole("admin");

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">Profile, on-duty status, and (for admins) team management.</p>
      </div>

      <ProfileCard />

      {isAdmin ? (
        <TeamCard onChange={refreshRoles} currentUserId={user?.id ?? null} />
      ) : (
        <NoAdminHint />
      )}
    </div>
  );
}

function ProfileCard() {
  const { user, refreshRoles } = useAuth();
  const qc = useQueryClient();

  const profile = useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user!.id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");

  // Sync once loaded
  if (profile.data && fullName === "" && phone === "") {
    if (profile.data.full_name) setFullName(profile.data.full_name);
    if (profile.data.phone) setPhone(profile.data.phone);
  }

  const save = useMutation({
    mutationFn: async (vals: { full_name: string; phone: string }) => {
      const { error } = await supabase
        .from("profiles")
        .update({ full_name: vals.full_name, phone: vals.phone })
        .eq("id", user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Profile saved");
      void qc.invalidateQueries({ queryKey: ["profile"] });
      void refreshRoles();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleOnDuty = useMutation({
    mutationFn: async (next: boolean) => {
      const { error } = await supabase
        .from("profiles")
        .update({ on_duty: next })
        .eq("id", user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["profile"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your profile</CardTitle>
        <CardDescription>{user?.email}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="full_name">Full name</Label>
            <Input id="full_name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Phone</Label>
            <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
        </div>

        <div className="flex items-center justify-between rounded-md border p-3">
          <div>
            <div className="font-medium">On duty</div>
            <div className="text-xs text-muted-foreground">
              When on, dispatchers can assign you and your live location is shared.
            </div>
          </div>
          <Switch
            checked={profile.data?.on_duty ?? false}
            onCheckedChange={(v) => toggleOnDuty.mutate(v)}
          />
        </div>

        <div className="flex justify-end">
          <Button
            onClick={() => save.mutate({ full_name: fullName, phone })}
            disabled={save.isPending}
          >
            {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save profile"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function TeamCard({ onChange, currentUserId }: { onChange: () => void; currentUserId: string | null }) {
  const qc = useQueryClient();

  const team = useQuery({
    queryKey: ["team"],
    queryFn: async () => {
      const [{ data: profiles, error: pe }, { data: roles, error: re }] = await Promise.all([
        supabase.from("profiles").select("id, full_name, phone, on_duty").order("full_name"),
        supabase.from("user_roles").select("user_id, role, id"),
      ]);
      if (pe) throw pe;
      if (re) throw re;
      const rolesByUser = new Map<string, { id: string; role: AppRole }[]>();
      (roles ?? []).forEach((r) => {
        const list = rolesByUser.get(r.user_id) ?? [];
        list.push({ id: r.id, role: r.role as AppRole });
        rolesByUser.set(r.user_id, list);
      });
      return (profiles ?? []).map((p) => ({
        ...p,
        roles: rolesByUser.get(p.id) ?? [],
      }));
    },
  });

  const addRole = useMutation({
    mutationFn: async (vars: { userId: string; role: AppRole }) => {
      const { error } = await supabase
        .from("user_roles")
        .insert({ user_id: vars.userId, role: vars.role });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Role added");
      void qc.invalidateQueries({ queryKey: ["team"] });
      onChange();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeRole = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("user_roles").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Role removed");
      void qc.invalidateQueries({ queryKey: ["team"] });
      onChange();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Team & roles</CardTitle>
        <CardDescription>Grant access to dispatchers, drivers, and view-only users.</CardDescription>
      </CardHeader>
      <CardContent>
        {team.isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="divide-y">
            {(team.data ?? []).map((member) => (
              <TeamRow
                key={member.id}
                member={member}
                isSelf={member.id === currentUserId}
                onAdd={(role) => addRole.mutate({ userId: member.id, role })}
                onRemove={(id) => removeRole.mutate(id)}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

type TeamMember = {
  id: string;
  full_name: string | null;
  phone: string | null;
  on_duty: boolean;
  roles: { id: string; role: AppRole }[];
};

function TeamRow({
  member,
  isSelf,
  onAdd,
  onRemove,
}: {
  member: TeamMember;
  isSelf: boolean;
  onAdd: (role: AppRole) => void;
  onRemove: (id: string) => void;
}) {
  const [pending, setPending] = useState<AppRole | "">("");
  const existing = new Set(member.roles.map((r) => r.role));
  const available = ROLES.filter((r) => !existing.has(r));

  return (
    <div className="flex flex-wrap items-center gap-3 py-3">
      <div className="min-w-0 flex-1">
        <div className="font-medium">
          {member.full_name || "(no name)"}
          {isSelf ? <span className="ml-2 text-xs text-muted-foreground">(you)</span> : null}
        </div>
        <div className="text-xs text-muted-foreground">{member.phone || "—"}</div>
      </div>

      <div className="flex flex-wrap items-center gap-1">
        {member.roles.length === 0 ? (
          <span className="text-xs text-muted-foreground">No roles</span>
        ) : (
          member.roles.map((r) => (
            <Badge key={r.id} variant="secondary" className="capitalize">
              {r.role}
              <button
                onClick={() => onRemove(r.id)}
                className="ml-1 -mr-1 rounded p-0.5 hover:bg-destructive/20 hover:text-destructive"
                aria-label={`Remove ${r.role}`}
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </Badge>
          ))
        )}
      </div>

      {available.length > 0 ? (
        <div className="flex items-center gap-2">
          <Select value={pending} onValueChange={(v) => setPending(v as AppRole)}>
            <SelectTrigger className="h-8 w-32">
              <SelectValue placeholder="Add role" />
            </SelectTrigger>
            <SelectContent>
              {available.map((r) => (
                <SelectItem key={r} value={r} className="capitalize">
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            variant="outline"
            disabled={!pending}
            onClick={() => {
              if (pending) {
                onAdd(pending);
                setPending("");
              }
            }}
          >
            Add
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function NoAdminHint() {
  return (
    <Card>
      <CardContent className="flex items-start gap-3 py-6">
        <ShieldCheck className="mt-0.5 h-5 w-5 text-muted-foreground" />
        <div>
          <p className="font-medium">Want to manage your team?</p>
          <p className="text-sm text-muted-foreground">
            Only admins can grant roles. If you're the first user, ask the developer to grant you the
            admin role from Lovable Cloud (Cloud → Database → user_roles → insert <code>admin</code> for your user_id).
            After that, you'll be able to grant roles to others from this page.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
