
CREATE TABLE IF NOT EXISTS public.decedent_releases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  decedent_id uuid NOT NULL REFERENCES public.decedents(id) ON DELETE CASCADE,
  item_type text NOT NULL CHECK (item_type IN ('body','cremains')),
  released_to_name text NOT NULL,
  released_to_relation text,
  released_to_phone text,
  id_type text,
  id_number text,
  signer_name text NOT NULL,
  signature_data text NOT NULL,
  witnessed_by text,
  released_by uuid,
  released_at timestamptz NOT NULL DEFAULT now(),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.decedent_releases TO authenticated;
GRANT ALL ON public.decedent_releases TO service_role;

ALTER TABLE public.decedent_releases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members read releases"
  ON public.decedent_releases FOR SELECT
  USING (public.is_org_member(organization_id));

CREATE POLICY "CRM admins/users write releases"
  ON public.decedent_releases FOR ALL
  USING (
    public.has_crm_role(organization_id, 'crm_admin'::crm_role) OR
    public.has_crm_role(organization_id, 'crm_user'::crm_role)
  )
  WITH CHECK (
    public.has_crm_role(organization_id, 'crm_admin'::crm_role) OR
    public.has_crm_role(organization_id, 'crm_user'::crm_role)
  );

CREATE INDEX IF NOT EXISTS decedent_releases_decedent_idx
  ON public.decedent_releases(decedent_id);
CREATE INDEX IF NOT EXISTS decedent_releases_org_idx
  ON public.decedent_releases(organization_id, released_at DESC);

DROP TRIGGER IF EXISTS set_decedent_releases_updated_at ON public.decedent_releases;
CREATE TRIGGER set_decedent_releases_updated_at
BEFORE UPDATE ON public.decedent_releases
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.log_decedent_release()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.decedent_events (organization_id, decedent_id, event_type, actor_id, message)
  VALUES (
    NEW.organization_id,
    NEW.decedent_id,
    'workflow',
    auth.uid(),
    'Released ' || NEW.item_type || ' to ' || NEW.released_to_name
  );

  UPDATE public.decedents
     SET status = 'released'
   WHERE id = NEW.decedent_id
     AND status IS DISTINCT FROM 'released'
     AND status IS DISTINCT FROM 'checked_out';

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS decedent_releases_log ON public.decedent_releases;
CREATE TRIGGER decedent_releases_log
AFTER INSERT ON public.decedent_releases
FOR EACH ROW EXECUTE FUNCTION public.log_decedent_release();

CREATE OR REPLACE FUNCTION public.log_decedent_checkout()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'checked_out' AND OLD.status IS DISTINCT FROM 'checked_out' THEN
    INSERT INTO public.decedent_events (organization_id, decedent_id, event_type, actor_id, message)
    VALUES (NEW.organization_id, NEW.id, 'workflow', auth.uid(), 'Checked out of facility');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS decedents_checkout_log ON public.decedents;
CREATE TRIGGER decedents_checkout_log
AFTER UPDATE OF status ON public.decedents
FOR EACH ROW EXECUTE FUNCTION public.log_decedent_checkout();

ALTER PUBLICATION supabase_realtime ADD TABLE public.decedent_releases;
