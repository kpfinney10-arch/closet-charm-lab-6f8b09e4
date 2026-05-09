import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/_dispatcher/cases/new")({
  component: NewCasePage,
});

const NONE = "__none__";

const schema = z.object({
  decedent_first_name: z.string().trim().max(80).optional().or(z.literal("")),
  decedent_last_name: z.string().trim().min(1, "Last name required").max(80),
  decedent_sex: z.string().optional(),
  decedent_dob: z.string().optional().or(z.literal("")),
  decedent_dod: z.string().optional().or(z.literal("")),
  decedent_weight_lbs: z.string().optional().or(z.literal("")),
  special_handling: z.string().max(500).optional().or(z.literal("")),
  status: z.enum(["new", "assigned"]),
  scheduled_at: z.string().optional().or(z.literal("")),

  pickup_facility_id: z.string().optional(),
  pickup_address: z.string().max(200).optional().or(z.literal("")),
  pickup_city: z.string().max(80).optional().or(z.literal("")),
  pickup_state: z.string().max(40).optional().or(z.literal("")),
  pickup_zip: z.string().max(20).optional().or(z.literal("")),
  pickup_contact_name: z.string().max(120).optional().or(z.literal("")),
  pickup_contact_phone: z.string().max(40).optional().or(z.literal("")),
  pickup_notes: z.string().max(500).optional().or(z.literal("")),

  dropoff_facility_id: z.string().optional(),
  dropoff_address: z.string().max(200).optional().or(z.literal("")),
  dropoff_city: z.string().max(80).optional().or(z.literal("")),
  dropoff_state: z.string().max(40).optional().or(z.literal("")),
  dropoff_zip: z.string().max(20).optional().or(z.literal("")),
  dropoff_notes: z.string().max(500).optional().or(z.literal("")),

  authorizing_party_name: z.string().max(120).optional().or(z.literal("")),
  authorizing_party_relation: z.string().max(80).optional().or(z.literal("")),
  authorizing_party_phone: z.string().max(40).optional().or(z.literal("")),
});

type FormValues = z.infer<typeof schema>;

type Facility = { id: string; name: string; type: string };

function NewCasePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState<Date | null>(null);
  const draftKey = user ? `case-intake-draft:${user.id}` : null;
  const restoredRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      decedent_first_name: "",
      decedent_last_name: "",
      decedent_sex: undefined,
      decedent_dob: "",
      decedent_dod: "",
      decedent_weight_lbs: "",
      special_handling: "",
      status: "new",
      scheduled_at: "",
      pickup_facility_id: NONE,
      pickup_address: "",
      pickup_city: "",
      pickup_state: "",
      pickup_zip: "",
      pickup_contact_name: "",
      pickup_contact_phone: "",
      pickup_notes: "",
      dropoff_facility_id: NONE,
      dropoff_address: "",
      dropoff_city: "",
      dropoff_state: "",
      dropoff_zip: "",
      dropoff_notes: "",
      authorizing_party_name: "",
      authorizing_party_relation: "",
      authorizing_party_phone: "",
    },
  });

  useEffect(() => {
    void supabase
      .from("facilities")
      .select("id, name, type")
      .eq("active", true)
      .order("name")
      .then(({ data, error }) => {
        if (error) {
          console.error(error);
          return;
        }
        setFacilities(data ?? []);
      });
  }, []);

  // Restore draft on mount
  useEffect(() => {
    if (!draftKey || restoredRef.current) return;
    restoredRef.current = true;
    try {
      const raw = localStorage.getItem(draftKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { values: Partial<FormValues>; savedAt: string };
      if (parsed?.values) {
        form.reset({ ...form.getValues(), ...parsed.values });
        setDraftSavedAt(new Date(parsed.savedAt));
        toast.info("Draft restored", { description: "Picked up where you left off." });
      }
    } catch (err) {
      console.error("Failed to restore draft", err);
    }
  }, [draftKey, form]);

  // Debounced autosave on any change
  useEffect(() => {
    if (!draftKey) return;
    const sub = form.watch((values) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        try {
          const savedAt = new Date();
          localStorage.setItem(
            draftKey,
            JSON.stringify({ values, savedAt: savedAt.toISOString() }),
          );
          setDraftSavedAt(savedAt);
        } catch (err) {
          console.error("Failed to save draft", err);
        }
      }, 600);
    });
    return () => {
      sub.unsubscribe();
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [draftKey, form]);

  const clearDraft = () => {
    if (draftKey) localStorage.removeItem(draftKey);
    setDraftSavedAt(null);
  };

  const discardDraft = () => {
    clearDraft();
    form.reset();
    toast.success("Draft discarded");
  };

  const onSubmit = async (values: FormValues) => {
    setSubmitting(true);
    try {
      const empty = (v?: string) => (v && v.trim() !== "" ? v : null);
      const payload = {
        decedent_first_name: empty(values.decedent_first_name),
        decedent_last_name: values.decedent_last_name.trim(),
        decedent_sex: empty(values.decedent_sex),
        decedent_dob: empty(values.decedent_dob),
        decedent_dod: values.decedent_dod ? new Date(values.decedent_dod).toISOString() : null,
        decedent_weight_lbs: values.decedent_weight_lbs
          ? parseInt(values.decedent_weight_lbs, 10)
          : null,
        special_handling: empty(values.special_handling),
        status: values.status,
        scheduled_at: values.scheduled_at ? new Date(values.scheduled_at).toISOString() : null,
        pickup_facility_id:
          values.pickup_facility_id && values.pickup_facility_id !== NONE
            ? values.pickup_facility_id
            : null,
        pickup_address: empty(values.pickup_address),
        pickup_city: empty(values.pickup_city),
        pickup_state: empty(values.pickup_state),
        pickup_zip: empty(values.pickup_zip),
        pickup_contact_name: empty(values.pickup_contact_name),
        pickup_contact_phone: empty(values.pickup_contact_phone),
        pickup_notes: empty(values.pickup_notes),
        dropoff_facility_id:
          values.dropoff_facility_id && values.dropoff_facility_id !== NONE
            ? values.dropoff_facility_id
            : null,
        dropoff_address: empty(values.dropoff_address),
        dropoff_city: empty(values.dropoff_city),
        dropoff_state: empty(values.dropoff_state),
        dropoff_zip: empty(values.dropoff_zip),
        dropoff_notes: empty(values.dropoff_notes),
        authorizing_party_name: empty(values.authorizing_party_name),
        authorizing_party_relation: empty(values.authorizing_party_relation),
        authorizing_party_phone: empty(values.authorizing_party_phone),
        created_by: user?.id ?? null,
      };

      const { data, error } = await supabase
        .from("cases")
        .insert(payload)
        .select("id, case_number")
        .single();

      if (error) throw error;

      clearDraft();
      toast.success(`Case ${data.case_number} created`);
      void navigate({ to: "/cases/$caseId", params: { caseId: data.id } });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to create case";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/cases">
            <ArrowLeft className="mr-1 h-4 w-4" /> Cases
          </Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold">New case</h1>
          <p className="text-sm text-muted-foreground">
            Intake a new transport. Required fields are marked with *.
          </p>
        </div>
        {draftSavedAt && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>
              Draft saved{" "}
              {draftSavedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
            <Button type="button" variant="ghost" size="sm" onClick={discardDraft}>
              Discard draft
            </Button>
          </div>
        )}
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Decedent</CardTitle>
              <CardDescription>Basic identifying info.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="decedent_first_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>First name</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="decedent_last_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Last name *</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="decedent_sex"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Sex</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value ?? ""}>
                      <FormControl>
                        <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="male">Male</SelectItem>
                        <SelectItem value="female">Female</SelectItem>
                        <SelectItem value="unknown">Unknown</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="decedent_weight_lbs"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Weight (lbs)</FormLabel>
                    <FormControl><Input type="number" min={0} {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="decedent_dob"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date of birth</FormLabel>
                    <FormControl><Input type="date" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="decedent_dod"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date/time of death</FormLabel>
                    <FormControl><Input type="datetime-local" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="special_handling"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>Special handling</FormLabel>
                    <FormControl>
                      <Textarea rows={2} placeholder="Bariatric, infectious, evidence hold, etc." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Pickup</CardTitle>
              <CardDescription>Where the driver will collect the decedent.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="pickup_facility_id"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>Facility</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value ?? NONE}>
                      <FormControl>
                        <SelectTrigger><SelectValue placeholder="Select a facility (optional)" /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={NONE}>None / custom address</SelectItem>
                        {facilities.map((f) => (
                          <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="pickup_address"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>Address</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="pickup_city"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>City</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="pickup_state"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>State</FormLabel>
                      <FormControl><Input {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="pickup_zip"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>ZIP</FormLabel>
                      <FormControl><Input {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="pickup_contact_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contact name</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="pickup_contact_phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contact phone</FormLabel>
                    <FormControl><Input type="tel" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="pickup_notes"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>Notes</FormLabel>
                    <FormControl><Textarea rows={2} {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Dropoff</CardTitle>
              <CardDescription>Destination for the transport.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="dropoff_facility_id"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>Facility</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value ?? NONE}>
                      <FormControl>
                        <SelectTrigger><SelectValue placeholder="Select a facility (optional)" /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={NONE}>None / custom address</SelectItem>
                        {facilities.map((f) => (
                          <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="dropoff_address"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>Address</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="dropoff_city"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>City</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="dropoff_state"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>State</FormLabel>
                      <FormControl><Input {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="dropoff_zip"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>ZIP</FormLabel>
                      <FormControl><Input {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="dropoff_notes"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>Notes</FormLabel>
                    <FormControl><Textarea rows={2} {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Authorization & scheduling</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="authorizing_party_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Authorizing party</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="authorizing_party_relation"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Relation</FormLabel>
                    <FormControl><Input placeholder="Spouse, NOK, ME office..." {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="authorizing_party_phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Authorizing phone</FormLabel>
                    <FormControl><Input type="tel" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="scheduled_at"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Scheduled pickup</FormLabel>
                    <FormControl><Input type="datetime-local" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Initial status *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="new">New (unassigned)</SelectItem>
                        <SelectItem value="assigned">Assigned</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <div className="flex items-center justify-end gap-3">
            <Button type="button" variant="outline" asChild>
              <Link to="/cases">Cancel</Link>
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Creating..." : "Create case"}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
