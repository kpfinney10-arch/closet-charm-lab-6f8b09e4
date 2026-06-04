
-- Enums
CREATE TYPE public.crm_role AS ENUM ('crm_admin','crm_user','crm_viewer');
CREATE TYPE public.decedent_status AS ENUM ('checked_in','prepped','cremated','released','checked_out');

-- Organizations
CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  timezone text NOT NULL DEFAULT 'America/New_York',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organizations TO authenticated;
GRANT ALL ON public.organizations TO service_role;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- Organization members
CREATE TABLE public.organization_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  crm_role public.crm_role NOT NULL DEFAULT 'crm_user',
  approved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_members TO authenticated;
GRANT ALL ON public.organization_members TO service_role;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

-- Helper: is current user an approved member of org?
CREATE OR REPLACE FUNCTION public.is_org_member(_org_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = _org_id
      AND user_id = auth.uid()
      AND approved = true
  );
$$;

CREATE OR REPLACE FUNCTION public.has_crm_role(_org_id uuid, _role public.crm_role)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = _org_id
      AND user_id = auth.uid()
      AND approved = true
      AND crm_role = _role
  );
$$;

-- Organizations RLS
CREATE POLICY "Members can view their org"
  ON public.organizations FOR SELECT TO authenticated
  USING (public.is_org_member(id));

CREATE POLICY "CRM admins can update their org"
  ON public.organizations FOR UPDATE TO authenticated
  USING (public.has_crm_role(id, 'crm_admin'))
  WITH CHECK (public.has_crm_role(id, 'crm_admin'));

-- Organization members RLS
CREATE POLICY "Members can view membership rows in their org"
  ON public.organization_members FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id) OR user_id = auth.uid());

CREATE POLICY "CRM admins manage memberships"
  ON public.organization_members FOR ALL TO authenticated
  USING (public.has_crm_role(organization_id, 'crm_admin'))
  WITH CHECK (public.has_crm_role(organization_id, 'crm_admin'));

-- Funeral homes
CREATE TABLE public.funeral_homes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  contact_name text,
  phone text,
  email text,
  address text,
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.funeral_homes TO authenticated;
GRANT ALL ON public.funeral_homes TO service_role;
ALTER TABLE public.funeral_homes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members read funeral homes"
  ON public.funeral_homes FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

CREATE POLICY "CRM admins/users write funeral homes"
  ON public.funeral_homes FOR ALL TO authenticated
  USING (public.has_crm_role(organization_id, 'crm_admin') OR public.has_crm_role(organization_id, 'crm_user'))
  WITH CHECK (public.has_crm_role(organization_id, 'crm_admin') OR public.has_crm_role(organization_id, 'crm_user'));

-- Decedents (schema only — UI in later phase)
CREATE TABLE public.decedents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  first_name text NOT NULL,
  last_name text NOT NULL,
  date_of_birth date,
  date_of_death date,
  sex text,
  weight_lbs numeric,
  funeral_home_id uuid REFERENCES public.funeral_homes(id) ON DELETE SET NULL,
  status public.decedent_status NOT NULL DEFAULT 'checked_in',
  location text,
  rack text,
  check_in_at timestamptz,
  check_out_at timestamptz,
  dispatch_case_id uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.decedents TO authenticated;
GRANT ALL ON public.decedents TO service_role;
ALTER TABLE public.decedents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members read decedents"
  ON public.decedents FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

CREATE POLICY "CRM admins/users write decedents"
  ON public.decedents FOR ALL TO authenticated
  USING (public.has_crm_role(organization_id, 'crm_admin') OR public.has_crm_role(organization_id, 'crm_user'))
  WITH CHECK (public.has_crm_role(organization_id, 'crm_admin') OR public.has_crm_role(organization_id, 'crm_user'));

-- Cremation logs (schema only)
CREATE TABLE public.cremation_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  decedent_id uuid NOT NULL REFERENCES public.decedents(id) ON DELETE CASCADE,
  operator_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  container_type text,
  start_time timestamptz,
  end_time timestamptz,
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cremation_logs TO authenticated;
GRANT ALL ON public.cremation_logs TO service_role;
ALTER TABLE public.cremation_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members read cremation logs"
  ON public.cremation_logs FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

CREATE POLICY "CRM admins/users write cremation logs"
  ON public.cremation_logs FOR ALL TO authenticated
  USING (public.has_crm_role(organization_id, 'crm_admin') OR public.has_crm_role(organization_id, 'crm_user'))
  WITH CHECK (public.has_crm_role(organization_id, 'crm_admin') OR public.has_crm_role(organization_id, 'crm_user'));

-- updated_at triggers
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_org_updated BEFORE UPDATE ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_fh_updated BEFORE UPDATE ON public.funeral_homes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_dec_updated BEFORE UPDATE ON public.decedents FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_cl_updated BEFORE UPDATE ON public.cremation_logs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Helpful indexes
CREATE INDEX idx_org_members_user ON public.organization_members(user_id);
CREATE INDEX idx_funeral_homes_org ON public.funeral_homes(organization_id);
CREATE INDEX idx_decedents_org ON public.decedents(organization_id);
CREATE INDEX idx_decedents_status ON public.decedents(organization_id, status);
CREATE INDEX idx_cremation_logs_org ON public.cremation_logs(organization_id);
