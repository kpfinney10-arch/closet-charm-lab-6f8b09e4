import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { ArrowLeft, Check, CloudOff, Loader2, TriangleAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
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

// US-ish formats; permissive enough for real-world entry.
const PHONE_RE = /^[+()\-\s\d.]{10,20}$/;
const ZIP_RE = /^\d{5}(-\d{4})?$/;
const STATE_RE = /^[A-Za-z]{2}$/;

const optStr = (max: number) => z.string().trim().max(max).optional().or(z.literal(""));
const phone = (max = 40) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .or(z.literal(""))
    .refine((v) => !v || PHONE_RE.test(v), "Enter a valid phone number");

const schema = z
  .object({
    decedent_first_name: optStr(80),
    decedent_last_name: z.string().trim().min(1, "Last name required").max(80),
    decedent_sex: z.string().optional(),
    decedent_dob: optStr(20),
    decedent_dod: optStr(40),
    decedent_weight_lbs: z
      .string()
      .optional()
      .or(z.literal(""))
      .refine((v) => !v || (/^\d+$/.test(v) && Number(v) > 0 && Number(v) < 1000), "Enter weight in lbs (1–999)"),
    special_handling: optStr(500),
    status: z.enum(["new", "assigned"]),
    scheduled_at: z.string().min(1, "Scheduled pickup is required"),

    pickup_facility_id: z.string().optional(),
    pickup_address: optStr(200),
    pickup_city: optStr(80),
    pickup_state: optStr(40).refine((v) => !v || STATE_RE.test(v), "Use 2-letter state code"),
    pickup_zip: optStr(20).refine((v) => !v || ZIP_RE.test(v), "Use ZIP (12345 or 12345-6789)"),
    pickup_contact_name: optStr(120),
    pickup_contact_phone: phone(),
    pickup_notes: optStr(500),

    dropoff_facility_id: z.string().optional(),
    dropoff_address: optStr(200),
    dropoff_city: optStr(80),
    dropoff_state: optStr(40).refine((v) => !v || STATE_RE.test(v), "Use 2-letter state code"),
    dropoff_zip: optStr(20).refine((v) => !v || ZIP_RE.test(v), "Use ZIP (12345 or 12345-6789)"),
    dropoff_notes: optStr(500),

    authorizing_party_name: z.string().trim().min(1, "Authorizing party is required").max(120),
    authorizing_party_relation: optStr(80),
    authorizing_party_phone: z
      .string()
      .trim()
      .min(1, "Authorizing phone is required")
      .max(40)
      .refine((v) => PHONE_RE.test(v), "Enter a valid phone number"),
  })
  .superRefine((v, ctx) => {
    const hasFacility = (id?: string) => !!id && id !== NONE;
    const hasFullAddress = (a?: string, c?: string, s?: string, z?: string) =>
      !!(a && c && s && z);

    // Pickup: facility OR full address
    if (!hasFacility(v.pickup_facility_id) && !hasFullAddress(v.pickup_address, v.pickup_city, v.pickup_state, v.pickup_zip)) {
      for (const field of ["pickup_address", "pickup_city", "pickup_state", "pickup_zip"] as const) {
        if (!v[field]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [field],
            message: "Pick a facility or fill the full pickup address",
          });
        }
      }
    }

    // Dropoff: facility OR full address
    if (!hasFacility(v.dropoff_facility_id) && !hasFullAddress(v.dropoff_address, v.dropoff_city, v.dropoff_state, v.dropoff_zip)) {
      for (const field of ["dropoff_address", "dropoff_city", "dropoff_state", "dropoff_zip"] as const) {
        if (!v[field]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [field],
            message: "Pick a facility or fill the full dropoff address",
          });
        }
      }
    }

    const now = Date.now();

    // DOB sanity
    if (v.decedent_dob) {
      const dob = new Date(v.decedent_dob).getTime();
      if (Number.isNaN(dob)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["decedent_dob"], message: "Invalid date" });
      } else if (dob > now) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["decedent_dob"], message: "DOB cannot be in the future" });
      }
    }

    // DOD sanity + must be after DOB
    if (v.decedent_dod) {
      const dod = new Date(v.decedent_dod).getTime();
      if (Number.isNaN(dod)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["decedent_dod"], message: "Invalid date/time" });
      } else {
        if (dod > now + 60_000) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["decedent_dod"], message: "Date of death cannot be in the future" });
        }
        if (v.decedent_dob) {
          const dob = new Date(v.decedent_dob).getTime();
          if (!Number.isNaN(dob) && dod < dob) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["decedent_dod"], message: "Date of death must be after DOB" });
          }
        }
      }
    }

    // Scheduled pickup must parse
    if (v.scheduled_at) {
      const t = new Date(v.scheduled_at).getTime();
      if (Number.isNaN(t)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["scheduled_at"], message: "Invalid date/time" });
      }
    }
  });

type FormValues = z.infer<typeof schema>;

type Facility = { id: string; name: string; type: string };

function NewCasePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState<Date | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [restoredFields, setRestoredFields] = useState<Set<string>>(new Set());
  const [restoredAt, setRestoredAt] = useState<Date | null>(null);
  const draftKey = user ? `case-intake-draft:${user.id}` : null;
  const restoredRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: "onTouched",
    reValidateMode: "onChange",
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
        const defaults = form.getValues();
        const restored = new Set<string>();
        for (const [k, v] of Object.entries(parsed.values)) {
          const def = (defaults as Record<string, unknown>)[k];
          const isEmpty = v === undefined || v === null || v === "" || v === NONE;
          if (!isEmpty && v !== def) restored.add(k);
        }
        form.reset({ ...defaults, ...parsed.values });
        const savedAt = new Date(parsed.savedAt);
        setDraftSavedAt(savedAt);
        setRestoredAt(savedAt);
        setRestoredFields(restored);
        toast.info("Draft restored", {
          description: `${restored.size} field${restored.size === 1 ? "" : "s"} from ${savedAt.toLocaleString()}`,
        });
      }
    } catch (err) {
      console.error("Failed to restore draft", err);
    }
  }, [draftKey, form]);

  // Clear a field's restored highlight when the user edits it
  useEffect(() => {
    if (restoredFields.size === 0) return;
    const sub = form.watch((_values, { name, type }) => {
      if (!name || type !== "change") return;
      setRestoredFields((prev) => {
        if (!prev.has(name)) return prev;
        const next = new Set(prev);
        next.delete(name);
        return next;
      });
    });
    return () => sub.unsubscribe();
  }, [form, restoredFields.size]);

  const hl = (name: string) =>
    restoredFields.has(name)
      ? "rounded-md ring-2 ring-amber-400/70 ring-offset-2 ring-offset-background p-2 -m-2"
      : "";

  const dismissHighlights = () => setRestoredFields(new Set());

  // Debounced autosave on any change
  useEffect(() => {
    if (!draftKey) return;
    const sub = form.watch((values) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      setSaveStatus("saving");
      saveTimerRef.current = setTimeout(() => {
        try {
          const savedAt = new Date();
          localStorage.setItem(
            draftKey,
            JSON.stringify({ values, savedAt: savedAt.toISOString() }),
          );
          setDraftSavedAt(savedAt);
          setSaveError(null);
          setSaveStatus("saved");
        } catch (err) {
          console.error("Failed to save draft", err);
          setSaveError(err instanceof Error ? err.message : "Unknown error");
          setSaveStatus("error");
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
    setSaveStatus("idle");
    setSaveError(null);
    setRestoredFields(new Set());
    setRestoredAt(null);
  };

  const discardDraft = () => {
    clearDraft();
    form.reset();
    toast.success("Draft discarded");
  };

  const saveDraftNow = () => {
    if (!draftKey) {
      toast.error("Sign in required to save drafts");
      return;
    }
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    try {
      const savedAt = new Date();
      localStorage.setItem(
        draftKey,
        JSON.stringify({ values: form.getValues(), savedAt: savedAt.toISOString() }),
      );
      setDraftSavedAt(savedAt);
      setSaveError(null);
      setSaveStatus("saved");
      toast.success("Draft saved");
    } catch (err) {
      console.error("Failed to save draft", err);
      const msg = err instanceof Error ? err.message : "Unknown error";
      setSaveError(msg);
      setSaveStatus("error");
      toast.error("Failed to save draft", { description: msg });
    }
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

  const onInvalid = (errors: Record<string, { message?: string } | undefined>) => {
    const keys = Object.keys(errors);
    const count = keys.length;
    toast.error(
      count === 1
        ? "Please fix 1 field before submitting"
        : `Please fix ${count} fields before submitting`,
    );
    const first = keys[0];
    if (first) {
      const el = document.querySelector<HTMLElement>(`[name="${first}"]`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        setTimeout(() => el.focus({ preventScroll: true }), 250);
      }
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
        <div
          className="flex items-center gap-2 text-xs"
          role="status"
          aria-live="polite"
        >
          {saveStatus === "saving" && (
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Saving draft…
            </span>
          )}
          {saveStatus === "saved" && draftSavedAt && (
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Check className="h-3.5 w-3.5 text-emerald-600" />
              Draft saved{" "}
              {draftSavedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          {saveStatus === "error" && (
            <span className="flex items-center gap-1.5 text-destructive" title={saveError ?? undefined}>
              <TriangleAlert className="h-3.5 w-3.5" />
              Autosave failed
            </span>
          )}
          {saveStatus === "idle" && !draftSavedAt && (
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <CloudOff className="h-3.5 w-3.5" />
              No draft yet
            </span>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={saveDraftNow}
            disabled={saveStatus === "saving"}
          >
            Save draft now
          </Button>
          {draftSavedAt && (
            <Button type="button" variant="ghost" size="sm" onClick={discardDraft}>
              Discard draft
            </Button>
          )}
        </div>
      </div>

      {restoredAt && restoredFields.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-amber-400/60 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          <span className="flex-1">
            Restored a draft from <strong>{restoredAt.toLocaleString()}</strong>.{" "}
            {restoredFields.size} field{restoredFields.size === 1 ? "" : "s"} highlighted below.
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={dismissHighlights}
            className="border-amber-400/60"
          >
            Dismiss highlights
          </Button>
        </div>
      )}

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit, onInvalid)} className="space-y-6" noValidate>
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
                  <FormItem className={hl(field.name)}>
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
                  <FormItem className={hl(field.name)}>
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
                  <FormItem className={hl(field.name)}>
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
                  <FormItem className={hl(field.name)}>
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
                  <FormItem className={hl(field.name)}>
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
                  <FormItem className={hl(field.name)}>
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
                  <FormItem className={cn("md:col-span-2", hl(field.name))}>
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
                  <FormItem className={cn("md:col-span-2", hl(field.name))}>
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
                  <FormItem className={cn("md:col-span-2", hl(field.name))}>
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
                  <FormItem className={hl(field.name)}>
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
                    <FormItem className={hl(field.name)}>
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
                    <FormItem className={hl(field.name)}>
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
                  <FormItem className={hl(field.name)}>
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
                  <FormItem className={hl(field.name)}>
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
                  <FormItem className={cn("md:col-span-2", hl(field.name))}>
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
                  <FormItem className={cn("md:col-span-2", hl(field.name))}>
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
                  <FormItem className={cn("md:col-span-2", hl(field.name))}>
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
                  <FormItem className={hl(field.name)}>
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
                    <FormItem className={hl(field.name)}>
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
                    <FormItem className={hl(field.name)}>
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
                  <FormItem className={cn("md:col-span-2", hl(field.name))}>
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
                  <FormItem className={hl(field.name)}>
                    <FormLabel>Authorizing party *</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="authorizing_party_relation"
                render={({ field }) => (
                  <FormItem className={hl(field.name)}>
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
                  <FormItem className={hl(field.name)}>
                    <FormLabel>Authorizing phone *</FormLabel>
                    <FormControl><Input type="tel" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="scheduled_at"
                render={({ field }) => (
                  <FormItem className={hl(field.name)}>
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
                  <FormItem className={hl(field.name)}>
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
