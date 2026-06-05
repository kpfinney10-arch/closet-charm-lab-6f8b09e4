import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useCrm } from "@/contexts/crm-context";
import {
  listCrmMembers,
  setCrmMemberApproved,
  setCrmMemberRole,
  removeCrmMember,
  inviteCrmMember,
  type CrmRole,
} from "@/lib/crm-members.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, Plus, Trash2, ShieldCheck, Check } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/auth-context";

export const Route = createFileRoute("/_authenticated/_crm/crm/users")({
  component: CrmUsersPage,
  head: () => ({ meta: [{ title: "Users — CareOne CRM" }] }),
});

const ROLE_LABEL: Record<CrmRole, string> = {
  crm_admin: "Admin",
  crm_user: "User",
  crm_viewer: "Viewer",
};

function CrmUsersPage() {
  const { currentOrg, isAdmin, loading } = useCrm();
  const { user: me } = useAuth();
  const qc = useQueryClient();

  const fetchMembers = useServerFn(listCrmMembers);
  const approveFn = useServerFn(setCrmMemberApproved);
  const roleFn = useServerFn(setCrmMemberRole);
  const removeFn = useServerFn(removeCrmMember);
  const inviteFn = useServerFn(inviteCrmMember);

  const { data: members, isLoading } = useQuery({
    queryKey: ["crm", "members", currentOrg?.organization_id],
    queryFn: () =>
      fetchMembers({ data: { organizationId: currentOrg!.organization_id } }),
    enabled: !!currentOrg && isAdmin,
  });

  const invalidate = () =>
    qc.invalidateQueries({
      queryKey: ["crm", "members", currentOrg?.organization_id],
    });

  const approveMut = useMutation({
    mutationFn: (v: { memberId: string; approved: boolean }) =>
      approveFn({
        data: { organizationId: currentOrg!.organization_id, ...v },
      }),
    onSuccess: () => {
      toast.success("Membership updated");
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Update failed"),
  });

  const roleMut = useMutation({
    mutationFn: (v: { memberId: string; role: CrmRole }) =>
      roleFn({ data: { organizationId: currentOrg!.organization_id, ...v } }),
    onSuccess: () => {
      toast.success("Role updated");
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Update failed"),
  });

  const removeMut = useMutation({
    mutationFn: (memberId: string) =>
      removeFn({
        data: { organizationId: currentOrg!.organization_id, memberId },
      }),
    onSuccess: () => {
      toast.success("Member removed");
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not remove"),
  });

  const [inviteOpen, setInviteOpen] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<{ id: string; label: string } | null>(null);
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<CrmRole>("crm_user");

  const inviteMut = useMutation({
    mutationFn: () =>
      inviteFn({
        data: {
          organizationId: currentOrg!.organization_id,
          email,
          role: inviteRole,
        },
      }),
    onSuccess: () => {
      toast.success("Member added");
      setInviteOpen(false);
      setEmail("");
      setInviteRole("crm_user");
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not invite"),
  });

  if (loading || !currentOrg) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!isAdmin) return <Navigate to="/crm/dashboard" />;

  const pending = (members ?? []).filter((m) => !m.approved);
  const approved = (members ?? []).filter((m) => m.approved);

  return (
    <div className="space-y-6 p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <ShieldCheck className="h-6 w-6 text-primary" />
            Users
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage members of {currentOrg.organization_name}.
          </p>
        </div>
        <Button size="sm" onClick={() => setInviteOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> Invite
        </Button>
      </header>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {pending.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Pending approval ({pending.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Requested</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pending.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell className="font-medium">
                          {m.full_name ?? "—"}
                        </TableCell>
                        <TableCell className="text-sm">{m.email ?? "—"}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{ROLE_LABEL[m.crm_role]}</Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {new Date(m.created_at).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="space-x-2 text-right">
                          <Button
                            size="sm"
                            onClick={() =>
                              approveMut.mutate({
                                memberId: m.id,
                                approved: true,
                              })
                            }
                            disabled={approveMut.isPending}
                          >
                            <Check className="mr-1 h-3.5 w-3.5" /> Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              setConfirmRemove({
                                id: m.id,
                                label: m.full_name ?? m.email ?? "this user",
                              })
                            }
                          >
                            Decline
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Active members ({approved.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {approved.length === 0 ? (
                <p className="p-6 text-sm text-muted-foreground">
                  No active members.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {approved.map((m) => {
                      const isSelf = me?.id === m.user_id;
                      return (
                        <TableRow key={m.id}>
                          <TableCell className="font-medium">
                            {m.full_name ?? "—"}
                            {isSelf && (
                              <Badge variant="secondary" className="ml-2 text-xs">
                                You
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-sm">{m.email ?? "—"}</TableCell>
                          <TableCell>
                            <Select
                              value={m.crm_role}
                              onValueChange={(v) =>
                                roleMut.mutate({
                                  memberId: m.id,
                                  role: v as CrmRole,
                                })
                              }
                              disabled={isSelf}
                            >
                              <SelectTrigger className="h-8 w-32">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="crm_admin">Admin</SelectItem>
                                <SelectItem value="crm_user">User</SelectItem>
                                <SelectItem value="crm_viewer">Viewer</SelectItem>
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="icon"
                              variant="ghost"
                              disabled={isSelf}
                              onClick={() =>
                                setConfirmRemove({
                                  id: m.id,
                                  label: m.full_name ?? m.email ?? "this user",
                                })
                              }
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite member</DialogTitle>
            <DialogDescription>
              Add an existing account to this organization. They must have signed
              up first.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select
                value={inviteRole}
                onValueChange={(v) => setInviteRole(v as CrmRole)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="crm_admin">Admin</SelectItem>
                  <SelectItem value="crm_user">User</SelectItem>
                  <SelectItem value="crm_viewer">Viewer</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setInviteOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => inviteMut.mutate()}
              disabled={!email || inviteMut.isPending}
            >
              {inviteMut.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!confirmRemove}
        onOpenChange={(o) => !o && setConfirmRemove(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove member?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmRemove
                ? `${confirmRemove.label} will lose access to this organization. They can be re-invited later.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmRemove) {
                  removeMut.mutate(confirmRemove.id);
                  setConfirmRemove(null);
                }
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
