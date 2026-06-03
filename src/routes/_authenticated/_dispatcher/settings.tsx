import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Loader2, ShieldCheck, Users } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";

export const Route = createFileRoute("/_authenticated/_dispatcher/settings")({
  component: SettingsPage,
  head: () => ({
    meta: [{ title: "Settings — Transport Dispatch" }],
  }),
});

function SettingsPage() {
  const { hasRole } = useAuth();
  const isAdmin = hasRole("admin");

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">Profile, on-duty status, and (for admins) team management.</p>
      </div>

      <ProfileCard />

      {isAdmin ? (
        <AdminUsersHint />
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

function AdminUsersHint() {
  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-3 py-6">
        <div className="flex items-start gap-3">
          <Users className="mt-0.5 h-5 w-5 text-muted-foreground" />
          <div>
            <p className="font-medium">Manage users and roles</p>
            <p className="text-sm text-muted-foreground">
              Use the admin Users page for approvals, roles, password resets, and account status
              changes. Those actions run through audited server functions.
            </p>
          </div>
        </div>
        <Button asChild variant="outline">
          <Link to="/users">Open users</Link>
        </Button>
      </CardContent>
    </Card>
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
            After that, admins can grant roles from the Users page.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
