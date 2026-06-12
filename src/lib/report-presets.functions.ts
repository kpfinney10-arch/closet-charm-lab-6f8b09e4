import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const OptsSchema = z.object({
  includeHeader: z.boolean(),
  includePercent: z.boolean(),
  includeZeroRows: z.boolean(),
  includeMetadata: z.boolean(),
});

export type ExportPresetOpts = z.infer<typeof OptsSchema>;

export type ExportPreset = {
  id: string;
  name: string;
  opts: ExportPresetOpts;
  createdBy: string | null;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
};

export const listExportPresets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ExportPreset[]> => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("report_export_presets")
      .select(
        "id, name, opts, created_by, created_at, updated_at, profiles:created_by(full_name)",
      )
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []).map((r: any) => ({
      id: r.id,
      name: r.name,
      opts: r.opts as ExportPresetOpts,
      createdBy: r.created_by,
      createdByName: r.profiles?.full_name ?? null,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  });

export const upsertExportPreset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { name: string; opts: ExportPresetOpts }) =>
    z
      .object({
        name: z.string().min(1).max(60).trim(),
        opts: OptsSchema,
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<ExportPreset> => {
    const { supabase, userId } = context;
    const { data: existing, error: findErr } = await supabase
      .from("report_export_presets")
      .select("id")
      .eq("name", data.name)
      .maybeSingle();
    if (findErr) throw new Error(findErr.message);

    if (existing) {
      const { data: updated, error } = await supabase
        .from("report_export_presets")
        .update({ opts: data.opts })
        .eq("id", existing.id)
        .select("id, name, opts, created_by, created_at, updated_at")
        .single();
      if (error) throw new Error(error.message);
      return {
        id: updated.id,
        name: updated.name,
        opts: updated.opts as ExportPresetOpts,
        createdBy: updated.created_by,
        createdByName: null,
        createdAt: updated.created_at,
        updatedAt: updated.updated_at,
      };
    }

    const { data: inserted, error } = await supabase
      .from("report_export_presets")
      .insert({ name: data.name, opts: data.opts, created_by: userId })
      .select("id, name, opts, created_by, created_at, updated_at")
      .single();
    if (error) throw new Error(error.message);
    return {
      id: inserted.id,
      name: inserted.name,
      opts: inserted.opts as ExportPresetOpts,
      createdBy: inserted.created_by,
      createdByName: null,
      createdAt: inserted.created_at,
      updatedAt: inserted.updated_at,
    };
  });

export const deleteExportPreset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) =>
    z.object({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("report_export_presets")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

// Build up to `limit` candidate names derived from `base`.
// If base ends with " (N)", increment from N+1; otherwise start at " (2)".
function buildNameCandidates(base: string, limit = 50): string[] {
  const m = base.match(/^(.*?)(?:\s\((\d+)\))?$/);
  const stem = (m?.[1] ?? base).trim() || base;
  const startN = m?.[2] ? parseInt(m[2], 10) + 1 : 2;
  const out: string[] = [];
  for (let i = 0; i < limit; i++) {
    const candidate = `${stem} (${startN + i})`;
    if (candidate.length <= 60) out.push(candidate);
  }
  return out;
}

export class PresetNameTakenError extends Error {
  code = "name_taken" as const;
  suggestion: string | null;
  constructor(name: string, suggestion: string | null) {
    super(
      JSON.stringify({
        code: "name_taken",
        message: `A preset named "${name}" already exists`,
        suggestion,
      }),
    );
    this.suggestion = suggestion;
  }
}

export const renameExportPreset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; name: string }) =>
    z
      .object({
        id: z.string().uuid(),
        name: z.string().min(1).max(60).trim(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<ExportPreset> => {
    const { supabase } = context;

    // Guard against name collisions with a different preset
    const { data: clash, error: clashErr } = await supabase
      .from("report_export_presets")
      .select("id")
      .eq("name", data.name)
      .neq("id", data.id)
      .maybeSingle();
    if (clashErr) throw new Error(clashErr.message);
    if (clash) {
      const candidates = buildNameCandidates(data.name);
      let suggestion: string | null = null;
      if (candidates.length) {
        const { data: taken, error: takenErr } = await supabase
          .from("report_export_presets")
          .select("name")
          .in("name", candidates);
        if (takenErr) throw new Error(takenErr.message);
        const takenSet = new Set((taken ?? []).map((r: any) => r.name));
        suggestion = candidates.find((c) => !takenSet.has(c)) ?? null;
      }
      throw new PresetNameTakenError(data.name, suggestion);
    }

    const { data: updated, error } = await supabase
      .from("report_export_presets")
      .update({ name: data.name })
      .eq("id", data.id)
      .select("id, name, opts, created_by, created_at, updated_at")
      .single();
    if (error) throw new Error(error.message);
    return {
      id: updated.id,
      name: updated.name,
      opts: updated.opts as ExportPresetOpts,
      createdBy: updated.created_by,
      createdByName: null,
      createdAt: updated.created_at,
      updatedAt: updated.updated_at,
    };
  });
