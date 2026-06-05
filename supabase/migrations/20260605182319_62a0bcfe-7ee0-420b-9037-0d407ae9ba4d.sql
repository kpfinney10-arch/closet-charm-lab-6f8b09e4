
CREATE TABLE public.crm_export_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  export_type text NOT NULL CHECK (export_type IN ('releases','cremations')),
  range_from timestamptz,
  range_to timestamptz,
  row_count integer NOT NULL DEFAULT 0,
  filename text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX crm_export_audit_org_created_idx
  ON public.crm_export_audit (organization_id, created_at DESC);

GRANT SELECT, INSERT ON public.crm_export_audit TO authenticated;
GRANT ALL ON public.crm_export_audit TO service_role;

ALTER TABLE public.crm_export_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can read export audit"
  ON public.crm_export_audit FOR SELECT
  TO authenticated
  USING (public.is_org_member(organization_id));

CREATE POLICY "Org members can insert their own export audit"
  ON public.crm_export_audit FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_org_member(organization_id)
    AND user_id = auth.uid()
  );
