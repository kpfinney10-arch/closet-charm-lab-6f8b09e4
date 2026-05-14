import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, UserPlus, KeyRound, Ban, CheckCircle2, Trash2, ShieldAlert, ShieldCheck, ShieldX } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  listAdminUsers, createAdminUser, disableAdminUser, enableAdminUser,
  resetAdminUserPassword, setAdminUserRole, deleteAdminUser,
  approveAdminUser, unapproveAdminUser,
} from "@/lib/admin-users.functions";

export const Route = createFileRoute("/_authenticated/_dispatcher/users")({
  component: UsersAdminPage,
});

type Role = "admin" | "dispatcher" | "driver" | "viewer";

function UsersAdminPage() {
  const { hasRole, user: me, loading } = useAuth();
  const qc = useQueryClient();

  const list = useServerFn(listAdminUsers);
  const create = useServerFn(createAdminUser);
  const disable = useServerFn(disableAdminUser);
  const enable = useServerFn(enableAdminUser);
  const reset = useServerFn(resetAdminUserPassword);
  const setRole = useServerFn(setAdminUserRole);
  const remove = useServerFn(deleteAdminUser);
  const approve = useServerFn(approveAdminUser);
  const unapprove = useServerFn(unapproveAdminUser);

  const usersQuery = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => list(),
    enabled: !loading && hasRole("admin"),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin-users"] });

  const createMut = useMutation({
    mutationFn: (data: { email: string; password: string; full_name?: string; phone?: string; role: Role }) =>
      create({ data }),
    onSuccess: () => { toast.success("User created"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const disableMut = useMutation({
    mutationFn: (user_id: string) => disable({ data: { user_id } }),
    onSuccess: () => { toast.success("User disabled"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const enableMut = useMutation({
    mutationFn: (user_id: string) => enable({ data: { user_id } }),
    onSuccess: () => { toast.success("User enabled"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const resetMut = useMutation({
    mutationFn: (vars: { user_id: string; new_password: string }) => reset({ data: vars }),
    onSuccess: () => toast.success("Password reset"),
    onError: (e: Error) => toast.error(e.message),
  });
  const roleMut = useMutation({
    mutationFn: (vars: { user_id: string; role: Role }) => setRole({ data: vars }),
    onSuccess: () => { toast.success("Role updated"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const removeMut = useMutation({
    mutationFn: (user_id: string) => remove({ data: { user_id } }),
    onSuccess: () => { toast.success("User deleted"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (loading) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  }
  if (!hasRole("admin")) {
    return <Navigate to="/dashboard" />;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Users</h1>
          <p className="text-sm text-muted-foreground">Create, disable, and reset accounts. Admin only.</p>
        </div>
        <CreateUserDialog onCreate={(d) => createMut.mutateAsync(d)} pending={createMut.isPending} />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">All users</CardTitle>
          <CardDescription>{usersQuery.data?.length ?? 0} accounts</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {usersQuery.isLoading ? (
            <div className="flex h-32 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : usersQuery.error ? (
            <div className="flex items-center gap-2 p-6 text-sm text-destructive">
              <ShieldAlert className="h-4 w-4" /> {(usersQuery.error as Error).message}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last sign-in</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(usersQuery.data ?? []).map((u) => {
                  const disabled = !!u.banned_until && new Date(u.banned_until) > new Date();
                  const isMe = u.id === me?.id;
                  const role = (u.roles[0] ?? "viewer") as Role;
                  return (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">
                        {u.email} {isMe && <Badge variant="outline" className="ml-1 text-[10px]">you</Badge>}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{u.profile?.full_name ?? "—"}</TableCell>
                      <TableCell>
                        <Select
                          value={role}
                          onValueChange={(v) => roleMut.mutate({ user_id: u.id, role: v as Role })}
                          disabled={isMe}
                        >
                          <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="admin">Admin</SelectItem>
                            <SelectItem value="dispatcher">Dispatcher</SelectItem>
                            <SelectItem value="driver">Driver</SelectItem>
                            <SelectItem value="viewer">Viewer</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        {disabled ? (
                          <Badge variant="destructive">Disabled</Badge>
                        ) : (
                          <Badge variant="secondary">Active</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleString() : "Never"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <ResetPasswordButton
                            onReset={(pw) => resetMut.mutateAsync({ user_id: u.id, new_password: pw })}
                          />
                          {disabled ? (
                            <Button size="sm" variant="outline" onClick={() => enableMut.mutate(u.id)}>
                              <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Enable
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => disableMut.mutate(u.id)}
                              disabled={isMe}
                            >
                              <Ban className="mr-1 h-3.5 w-3.5" /> Disable
                            </Button>
                          )}
                          <DeleteUserButton
                            email={u.email}
                            disabled={isMe}
                            onConfirm={() => removeMut.mutateAsync(u.id)}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {(usersQuery.data ?? []).length === 0 && (
                  <TableRow><TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">No users</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function CreateUserDialog({
  onCreate, pending,
}: {
  onCreate: (data: { email: string; password: string; full_name?: string; phone?: string; role: Role }) => Promise<unknown>;
  pending: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<Role>("dispatcher");

  const submit = async () => {
    if (!email || password.length < 8) {
      toast.error("Email and 8+ char password required");
      return;
    }
    try {
      await onCreate({ email, password, full_name: fullName || undefined, phone: phone || undefined, role });
      setOpen(false);
      setEmail(""); setPassword(""); setFullName(""); setPhone(""); setRole("dispatcher");
    } catch { /* toast handled by caller */ }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><UserPlus className="mr-1 h-4 w-4" /> New user</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create user</DialogTitle>
          <DialogDescription>The account is confirmed immediately and ready to sign in.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={255} />
          </div>
          <div className="grid gap-1.5">
            <Label>Initial password</Label>
            <Input type="text" value={password} onChange={(e) => setPassword(e.target.value)} maxLength={72} placeholder="At least 8 characters" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Full name</Label>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={120} />
            </div>
            <div className="grid gap-1.5">
              <Label>Phone</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={40} />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as Role)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="dispatcher">Dispatcher</SelectItem>
                <SelectItem value="driver">Driver</SelectItem>
                <SelectItem value="viewer">Viewer</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} disabled={pending}>
            {pending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />} Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ResetPasswordButton({ onReset }: { onReset: (pw: string) => Promise<unknown> }) {
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline"><KeyRound className="mr-1 h-3.5 w-3.5" /> Reset</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reset password</DialogTitle>
          <DialogDescription>Set a new password for this user. Share it through a secure channel.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5">
          <Label>New password</Label>
          <Input type="text" value={pw} onChange={(e) => setPw(e.target.value)} maxLength={72} placeholder="At least 8 characters" />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            disabled={busy || pw.length < 8}
            onClick={async () => {
              setBusy(true);
              try { await onReset(pw); setOpen(false); setPw(""); }
              finally { setBusy(false); }
            }}
          >
            {busy && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />} Set password
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteUserButton({
  email, disabled, onConfirm,
}: { email: string; disabled: boolean; onConfirm: () => Promise<unknown> }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="ghost" className="text-destructive" disabled={disabled}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {email}?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently removes the user and their roles. Cases they created stay.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => { void onConfirm(); }}>Delete</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
