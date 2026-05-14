
-- 1. Profiles: replace overly-broad SELECT
DROP POLICY IF EXISTS profiles_select_authenticated ON public.profiles;

CREATE POLICY profiles_select_own ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid());

CREATE POLICY profiles_select_staff ON public.profiles
  FOR SELECT TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['admin','dispatcher','viewer']::app_role[]));

-- 2. Cases: add WITH CHECK + column-restricting trigger for drivers
DROP POLICY IF EXISTS cases_update_assigned_driver ON public.cases;
CREATE POLICY cases_update_assigned_driver ON public.cases
  FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(),'driver')
    AND (primary_driver_id = auth.uid() OR secondary_driver_id = auth.uid())
  )
  WITH CHECK (
    has_role(auth.uid(),'driver')
    AND (primary_driver_id = auth.uid() OR secondary_driver_id = auth.uid())
  );

CREATE OR REPLACE FUNCTION public.restrict_driver_case_updates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Staff updates pass through unchanged
  IF has_any_role(auth.uid(), ARRAY['admin','dispatcher']::app_role[]) THEN
    RETURN NEW;
  END IF;

  IF has_role(auth.uid(),'driver') THEN
    IF NEW.case_number IS DISTINCT FROM OLD.case_number
       OR NEW.decedent_first_name IS DISTINCT FROM OLD.decedent_first_name
       OR NEW.decedent_last_name IS DISTINCT FROM OLD.decedent_last_name
       OR NEW.decedent_dob IS DISTINCT FROM OLD.decedent_dob
       OR NEW.decedent_dod IS DISTINCT FROM OLD.decedent_dod
       OR NEW.decedent_sex IS DISTINCT FROM OLD.decedent_sex
       OR NEW.decedent_weight_lbs IS DISTINCT FROM OLD.decedent_weight_lbs
       OR NEW.special_handling IS DISTINCT FROM OLD.special_handling
       OR NEW.pickup_facility_id IS DISTINCT FROM OLD.pickup_facility_id
       OR NEW.pickup_address IS DISTINCT FROM OLD.pickup_address
       OR NEW.pickup_city IS DISTINCT FROM OLD.pickup_city
       OR NEW.pickup_state IS DISTINCT FROM OLD.pickup_state
       OR NEW.pickup_zip IS DISTINCT FROM OLD.pickup_zip
       OR NEW.pickup_contact_name IS DISTINCT FROM OLD.pickup_contact_name
       OR NEW.pickup_contact_phone IS DISTINCT FROM OLD.pickup_contact_phone
       OR NEW.dropoff_facility_id IS DISTINCT FROM OLD.dropoff_facility_id
       OR NEW.dropoff_address IS DISTINCT FROM OLD.dropoff_address
       OR NEW.dropoff_city IS DISTINCT FROM OLD.dropoff_city
       OR NEW.dropoff_state IS DISTINCT FROM OLD.dropoff_state
       OR NEW.dropoff_zip IS DISTINCT FROM OLD.dropoff_zip
       OR NEW.authorizing_party_name IS DISTINCT FROM OLD.authorizing_party_name
       OR NEW.authorizing_party_relation IS DISTINCT FROM OLD.authorizing_party_relation
       OR NEW.authorizing_party_phone IS DISTINCT FROM OLD.authorizing_party_phone
       OR NEW.primary_driver_id IS DISTINCT FROM OLD.primary_driver_id
       OR NEW.secondary_driver_id IS DISTINCT FROM OLD.secondary_driver_id
       OR NEW.vehicle_id IS DISTINCT FROM OLD.vehicle_id
       OR NEW.scheduled_at IS DISTINCT FROM OLD.scheduled_at
       OR NEW.created_by IS DISTINCT FROM OLD.created_by
    THEN
      RAISE EXCEPTION 'Drivers may only update case status, notes, and location fields';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cases_restrict_driver_updates ON public.cases;
CREATE TRIGGER cases_restrict_driver_updates
  BEFORE UPDATE ON public.cases
  FOR EACH ROW EXECUTE FUNCTION public.restrict_driver_case_updates();

-- 3. Storage: scope case-documents driver access by case folder
DROP POLICY IF EXISTS case_docs_select_staff ON storage.objects;
DROP POLICY IF EXISTS case_docs_insert_staff ON storage.objects;

CREATE POLICY case_docs_select_staff ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'case-documents'
    AND has_any_role(auth.uid(), ARRAY['admin','dispatcher','viewer']::app_role[])
  );

CREATE POLICY case_docs_insert_staff ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'case-documents'
    AND has_any_role(auth.uid(), ARRAY['admin','dispatcher']::app_role[])
  );

CREATE POLICY case_docs_select_driver ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'case-documents'
    AND has_role(auth.uid(),'driver')
    AND is_case_driver(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );

CREATE POLICY case_docs_insert_driver ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'case-documents'
    AND has_role(auth.uid(),'driver')
    AND is_case_driver(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );
