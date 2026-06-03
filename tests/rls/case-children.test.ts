import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  admin,
  anonClient,
  ensureUser,
  resetFixtures,
  signInAs,
} from "./helpers";
import type { Database } from "@/integrations/supabase/types";

const PW = "TestPassw0rd!";
const DRIVER_A_EMAIL = "rls-driver-a@test.local";
const DRIVER_B_EMAIL = "rls-driver-b@test.local";
const DISPATCHER_EMAIL = "rls-dispatcher@test.local";
const ADMIN_EMAIL = "rls-admin@test.local";
const VIEWER_EMAIL = "rls-viewer@test.local";

let driverAId: string;
let driverBId: string;
let dispatcherId: string;
let adminId: string;
let viewerId: string;

let caseAId: string;
let eventAId: string;
let sigAId: string;
let docAId: string;

let driverA: SupabaseClient<Database>;
let driverB: SupabaseClient<Database>;
let dispatcher: SupabaseClient<Database>;
let viewer: SupabaseClient<Database>;
let adminUser: SupabaseClient<Database>;

beforeAll(async () => {
  ({ userId: driverAId } = await ensureUser({
    email: DRIVER_A_EMAIL, password: PW, fullName: "RLS Driver A", roles: ["driver"],
  }));
  ({ userId: driverBId } = await ensureUser({
    email: DRIVER_B_EMAIL, password: PW, fullName: "RLS Driver B", roles: ["driver"],
  }));
  ({ userId: dispatcherId } = await ensureUser({
    email: DISPATCHER_EMAIL, password: PW, fullName: "RLS Dispatcher", roles: ["dispatcher"],
  }));
  ({ userId: adminId } = await ensureUser({
    email: ADMIN_EMAIL, password: PW, fullName: "RLS Admin", roles: ["admin"],
  }));
  ({ userId: viewerId } = await ensureUser({
    email: VIEWER_EMAIL, password: PW, fullName: "RLS Viewer", roles: ["viewer"],
  }));

  await resetFixtures();

  const { data: c, error: cErr } = await admin
    .from("cases")
    .insert({
      case_number: `TEST-CHILD-${Date.now()}`,
      status: "assigned",
      primary_driver_id: driverAId,
      created_by: dispatcherId,
      decedent_last_name: "Doe",
    })
    .select("id")
    .single();
  if (cErr) throw cErr;
  caseAId = c.id;

  const { data: e, error: eErr } = await admin
    .from("case_events")
    .insert({ case_id: caseAId, event_type: "created", actor_id: dispatcherId })
    .select("id").single();
  if (eErr) throw eErr;
  eventAId = e.id;

  const { data: s, error: sErr } = await admin
    .from("case_signatures")
    .insert({
      case_id: caseAId,
      signature_type: "pickup_released",
      signer_name: "Seed Signer",
      signature_data: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
      captured_by: dispatcherId,
    })
    .select("id").single();
  if (sErr) throw sErr;
  sigAId = s.id;

  const { data: d, error: dErr } = await admin
    .from("case_documents")
    .insert({
      case_id: caseAId,
      doc_type: "other",
      file_path: `${caseAId}/seed.pdf`,
      uploaded_by: dispatcherId,
    })
    .select("id").single();
  if (dErr) throw dErr;
  docAId = d.id;

  [driverA, driverB, dispatcher, viewer, adminUser] = await Promise.all([
    signInAs(DRIVER_A_EMAIL, PW),
    signInAs(DRIVER_B_EMAIL, PW),
    signInAs(DISPATCHER_EMAIL, PW),
    signInAs(VIEWER_EMAIL, PW),
    signInAs(ADMIN_EMAIL, PW),
  ]);
});

afterAll(async () => {
  await resetFixtures();
});

describe("case_events RLS", () => {
  it("anon blocked", async () => {
    const { data } = await anonClient().from("case_events").select("id").eq("id", eventAId);
    expect(data?.length ?? 0).toBe(0);
  });
  it("assigned driver can read", async () => {
    const { data, error } = await driverA.from("case_events").select("id").eq("id", eventAId);
    expect(error).toBeNull();
    expect(data?.length).toBe(1);
  });
  it("unassigned driver blocked", async () => {
    const { data } = await driverB.from("case_events").select("id").eq("id", eventAId);
    expect(data?.length ?? 0).toBe(0);
  });
  it("viewer can read", async () => {
    const { data, error } = await viewer.from("case_events").select("id").eq("id", eventAId);
    expect(error).toBeNull();
    expect(data?.length).toBe(1);
  });
  it("unassigned driver cannot insert event", async () => {
    const { error } = await driverB.from("case_events").insert({
      case_id: caseAId, event_type: "note_added", notes: "hax",
    });
    expect(error).not.toBeNull();
  });
});

describe("case_signatures RLS", () => {
  it("anon blocked", async () => {
    const { data } = await anonClient().from("case_signatures").select("id").eq("id", sigAId);
    expect(data?.length ?? 0).toBe(0);
  });
  it("assigned driver can read", async () => {
    const { data, error } = await driverA.from("case_signatures").select("id").eq("id", sigAId);
    expect(error).toBeNull();
    expect(data?.length).toBe(1);
  });
  it("unassigned driver blocked from read", async () => {
    const { data } = await driverB.from("case_signatures").select("id").eq("id", sigAId);
    expect(data?.length ?? 0).toBe(0);
  });
  it("unassigned driver cannot insert signature", async () => {
    const { error } = await driverB.from("case_signatures").insert({
      case_id: caseAId,
      signature_type: "driver_received",
      signer_name: "Mallory",
      signature_data: "data:image/png;base64,AAAA",
    });
    expect(error).not.toBeNull();
  });
  it("viewer cannot insert signature", async () => {
    const { error } = await viewer.from("case_signatures").insert({
      case_id: caseAId,
      signature_type: "driver_received",
      signer_name: "Viewer",
      signature_data: "data:image/png;base64,AAAA",
    });
    expect(error).not.toBeNull();
  });
  it("non-admin cannot delete", async () => {
    const { error, data } = await dispatcher
      .from("case_signatures").delete().eq("id", sigAId).select();
    expect(error || (data && data.length === 0)).toBeTruthy();
  });
});

describe("case_documents RLS", () => {
  it("anon blocked", async () => {
    const { data } = await anonClient().from("case_documents").select("id").eq("id", docAId);
    expect(data?.length ?? 0).toBe(0);
  });
  it("assigned driver can read", async () => {
    const { data, error } = await driverA.from("case_documents").select("id").eq("id", docAId);
    expect(error).toBeNull();
    expect(data?.length).toBe(1);
  });
  it("unassigned driver blocked from read", async () => {
    const { data } = await driverB.from("case_documents").select("id").eq("id", docAId);
    expect(data?.length ?? 0).toBe(0);
  });
  it("unassigned driver cannot insert document", async () => {
    const { error } = await driverB.from("case_documents").insert({
      case_id: caseAId, doc_type: "other", file_path: `${caseAId}/evil.pdf`,
    });
    expect(error).not.toBeNull();
  });
  it("dispatcher cannot delete (admin-only)", async () => {
    const { error, data } = await dispatcher
      .from("case_documents").delete().eq("id", docAId).select();
    expect(error || (data && data.length === 0)).toBeTruthy();
  });
});

describe("driver_locations RLS", () => {
  beforeAll(async () => {
    await admin.from("driver_locations").upsert({
      user_id: driverAId, lat: 40.0, lng: -75.0,
    });
  });

  it("driver can read own location", async () => {
    const { data, error } = await driverA.from("driver_locations")
      .select("user_id").eq("user_id", driverAId);
    expect(error).toBeNull();
    expect(data?.length).toBe(1);
  });
  it("other driver cannot read someone else's location", async () => {
    const { data } = await driverB.from("driver_locations")
      .select("user_id").eq("user_id", driverAId);
    expect(data?.length ?? 0).toBe(0);
  });
  it("dispatcher can read any driver location", async () => {
    const { data, error } = await dispatcher.from("driver_locations")
      .select("user_id").eq("user_id", driverAId);
    expect(error).toBeNull();
    expect(data?.length).toBe(1);
  });
  it("driver cannot insert a location for another user", async () => {
    const { error } = await driverA.from("driver_locations").insert({
      user_id: driverBId, lat: 1, lng: 1,
    });
    expect(error).not.toBeNull();
  });
});

describe("push_subscriptions RLS", () => {
  beforeAll(async () => {
    await admin.from("push_subscriptions").insert({
      user_id: driverAId,
      endpoint: `https://push.test/${driverAId}`,
      p256dh: "x", auth: "y",
    });
  });

  it("user sees only their own subscriptions", async () => {
    const { data, error } = await driverA.from("push_subscriptions").select("id,user_id");
    expect(error).toBeNull();
    expect(data?.every((r) => r.user_id === driverAId)).toBe(true);
  });
  it("other driver cannot read someone else's subscription", async () => {
    const { data } = await driverB.from("push_subscriptions")
      .select("id").eq("user_id", driverAId);
    expect(data?.length ?? 0).toBe(0);
  });
  it("dispatcher can read any subscription (for sending pushes)", async () => {
    const { data, error } = await dispatcher.from("push_subscriptions")
      .select("id").eq("user_id", driverAId);
    expect(error).toBeNull();
    expect((data?.length ?? 0) >= 1).toBe(true);
  });
  it("user cannot insert a subscription for another user", async () => {
    const { error } = await driverA.from("push_subscriptions").insert({
      user_id: driverBId,
      endpoint: "https://push.test/forged",
      p256dh: "x", auth: "y",
    });
    expect(error).not.toBeNull();
  });
});

describe("admin_audit_logs RLS", () => {
  beforeAll(async () => {
    await admin.from("admin_audit_logs").insert({
      action: "user_approved", actor_id: adminId, target_user_id: driverAId,
    });
  });

  it("admin can read", async () => {
    const { data, error } = await adminUser.from("admin_audit_logs").select("id").limit(1);
    expect(error).toBeNull();
    expect((data?.length ?? 0) >= 1).toBe(true);
  });
  it("dispatcher cannot read", async () => {
    const { data } = await dispatcher.from("admin_audit_logs").select("id").limit(1);
    expect(data?.length ?? 0).toBe(0);
  });
  it("driver cannot insert audit log", async () => {
    const { error } = await driverA.from("admin_audit_logs").insert({
      action: "user_approved", actor_id: driverAId,
    });
    expect(error).not.toBeNull();
  });
});

describe("case-documents storage bucket", () => {
  const filePath = `rls-test/${Date.now()}.txt`;
  beforeAll(async () => {
    await admin.storage.from("case-documents").upload(filePath, new Blob(["hi"]), {
      upsert: true, contentType: "text/plain",
    });
  });
  afterAll(async () => {
    await admin.storage.from("case-documents").remove([filePath]);
  });

  it("anon cannot download from private bucket", async () => {
    const { data, error } = await anonClient().storage.from("case-documents").download(filePath);
    expect(error || !data).toBeTruthy();
  });
  it("service-role can mint a signed URL", async () => {
    const { data, error } = await admin.storage
      .from("case-documents").createSignedUrl(filePath, 60);
    expect(error).toBeNull();
    expect(data?.signedUrl).toContain("token=");
  });
});
