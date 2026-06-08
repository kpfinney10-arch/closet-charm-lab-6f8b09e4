CREATE TABLE public.report_export_presets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  opts jsonb NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.report_export_presets TO authenticated;
GRANT ALL ON public.report_export_presets TO service_role;

ALTER TABLE public.report_export_presets ENABLE ROW LEVEL SECURITY;

-- Any signed-in staff role can read shared presets.
CREATE POLICY "Staff can view export presets"
  ON public.report_export_presets FOR SELECT
  TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','dispatcher','viewer']::app_role[]));

-- Dispatchers and admins can create presets (must stamp themselves as creator).
CREATE POLICY "Dispatchers can create export presets"
  ON public.report_export_presets FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_any_role(auth.uid(), ARRAY['admin','dispatcher']::app_role[])
    AND created_by = auth.uid()
  );

-- Creator or admin can update.
CREATE POLICY "Creator or admin can update export presets"
  ON public.report_export_presets FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR (public.has_role(auth.uid(), 'dispatcher') AND created_by = auth.uid())
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR (public.has_role(auth.uid(), 'dispatcher') AND created_by = auth.uid())
  );

-- Creator or admin can delete.
CREATE POLICY "Creator or admin can delete export presets"
  ON public.report_export_presets FOR DELETE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR (public.has_role(auth.uid(), 'dispatcher') AND created_by = auth.uid())
  );

CREATE TRIGGER trg_report_export_presets_updated_at
  BEFORE UPDATE ON public.report_export_presets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();