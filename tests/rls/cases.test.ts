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

let driverAId: string;
let driverBId: string;
let dispatcherId: string;

let caseAId: string;

let driverA: SupabaseClient<Database>;
let driverB: SupabaseClient<Database>;
let dispatcher: SupabaseClient<Database>;

beforeAll(async () => {
  ({ userId: driverAId } = await ensureUser({
    email: DRIVER_A_EMAIL,
    password: PW,
    fullName: "RLS Driver A",
    roles: ["driver"],
  }));
  ({ userId: driverBId } = await ensureUser({
    email: DRIVER_B_EMAIL,
    password: PW,
    fullName: "RLS Driver B",
    roles: ["driver"],
  }));
  ({ userId: dispatcherId } = await ensureUser({
    email: DISPATCHER_EMAIL,
    password: PW,
    fullName: "RLS Dispatcher",
    roles: ["dispatcher"],
  }));

  await resetFixtures();

  // Seed Case A assigned to driver A only.
  const { data, error } = await admin
    .from("cases")
    .insert({
      case_number: `TEST-${Date.now()}`,
      status: "assigned",
      primary_driver_id: driverAId,
      created_by: dispatcherId,
      decedent_last_name: "Doe",
    })
    .select("id")
    .single();
  if (error) throw error;
  caseAId = data.id;

  [driverA, driverB, dispatcher] = await Promise.all([
    signInAs(DRIVER_A_EMAIL, PW),
    signInAs(DRIVER_B_EMAIL, PW),
    signInAs(DISPATCHER_EMAIL, PW),
  ]);
});

afterAll(async () => {
  await resetFixtures();
});

describe("cases RLS", () => {
  it("anon cannot read any case", async () => {
    const { data, error } = await anonClient().from("cases").select("id");
    // Either an error or an empty array is acceptable; both mean "blocked".
    expect(error || (data && data.length === 0)).toBeTruthy();
  });

  it("driver A can read their assigned case", async () => {
    const { data, error } = await driverA.from("cases").select("id").eq("id", caseAId);
    expect(error).toBeNull();
    expect(data?.length).toBe(1);
  });

  it("driver B cannot read a case they are not assigned to", async () => {
    const { data } = await driverB.from("cases").select("id").eq("id", caseAId);
    expect(data?.length ?? 0).toBe(0);
  });

  it("dispatcher can read all cases", async () => {
    const { data, error } = await dispatcher.from("cases").select("id").eq("id", caseAId);
    expect(error).toBeNull();
    expect(data?.length).toBe(1);
  });
});

describe("driver status transitions (restrict_driver_case_updates trigger)", () => {
  it("rejects a backward transition (assigned -> new)", async () => {
    const { error } = await driverA
      .from("cases")
      .update({ status: "new" })
      .eq("id", caseAId);
    expect(error).not.toBeNull();
  });

  it("rejects a skipped transition (assigned -> in_custody)", async () => {
    const { error } = await driverA
      .from("cases")
      .update({ status: "in_custody" })
      .eq("id", caseAId);
    expect(error).not.toBeNull();
  });

  it("allows the next forward transition (assigned -> en_route_pickup)", async () => {
    const { error } = await driverA
      .from("cases")
      .update({ status: "en_route_pickup" })
      .eq("id", caseAId);
    expect(error).toBeNull();

    // Reset for any subsequent tests.
    await admin.from("cases").update({ status: "assigned" }).eq("id", caseAId);
  });

  it("rejects driver edits to protected fields (e.g. decedent_last_name)", async () => {
    const { error } = await driverA
      .from("cases")
      .update({ decedent_last_name: "Hacked" })
      .eq("id", caseAId);
    expect(error).not.toBeNull();
  });
});

describe("profiles RLS (restrict_profile_updates trigger)", () => {
  it("non-admin cannot self-approve", async () => {
    // Driver B starts approved=true; flip to false via admin to make the test meaningful.
    await admin.from("profiles").update({ approved: false }).eq("id", driverBId);
    const drvB = await signInAs(DRIVER_B_EMAIL, PW);
    const { error } = await drvB
      .from("profiles")
      .update({ approved: true })
      .eq("id", driverBId);
    expect(error).not.toBeNull();
    // Restore.
    await admin.from("profiles").update({ approved: true }).eq("id", driverBId);
  });

  it("user cannot update another user's profile", async () => {
    const { error, data } = await driverA
      .from("profiles")
      .update({ full_name: "Pwned" })
      .eq("id", driverBId)
      .select();
    // Either RLS blocks the row (empty result) or the trigger raises.
    expect(error || (data && data.length === 0)).toBeTruthy();
  });
});

describe("user_roles RLS", () => {
  it("driver cannot grant themselves admin", async () => {
    const { error } = await driverA
      .from("user_roles")
      .insert({ user_id: driverAId, role: "admin" });
    expect(error).not.toBeNull();
  });
});
