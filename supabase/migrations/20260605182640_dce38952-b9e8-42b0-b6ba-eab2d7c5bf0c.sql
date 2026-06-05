
DROP POLICY IF EXISTS "Org members can read export audit" ON public.crm_export_audit;

CREATE POLICY "CRM admins can read export audit"
  ON public.crm_export_audit FOR SELECT
  TO authenticated
  USING (public.has_crm_role(organization_id, 'crm_admin'));
