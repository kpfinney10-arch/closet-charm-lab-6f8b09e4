-- Harden profile approval and driver-controlled case status updates.
--
-- These checks live in the database because client route gates and UI controls
-- are not security boundaries.

CREATE OR REPLACE FUNCTION public.restrict_profile_updates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  IF OLD.id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Users may only update their own profile';
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.approved IS DISTINCT FROM OLD.approved
     OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
     OR NEW.approved_by IS DISTINCT FROM OLD.approved_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'Only admins may update protected profile fields';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_restrict_updates ON public.profiles;
CREATE TRIGGER profiles_restrict_updates
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.restrict_profile_updates();

CREATE OR REPLACE FUNCTION public.restrict_driver_case_updates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  allowed_next public.case_status;
BEGIN
  -- Staff updates pass through unchanged.
  IF auth.role() = 'service_role'
     OR public.has_any_role(auth.uid(), ARRAY['admin','dispatcher']::app_role[]) THEN
    RETURN NEW;
  END IF;

  IF public.has_role(auth.uid(), 'driver') THEN
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
       OR NEW.pickup_notes IS DISTINCT FROM OLD.pickup_notes
       OR NEW.dropoff_facility_id IS DISTINCT FROM OLD.dropoff_facility_id
       OR NEW.dropoff_address IS DISTINCT FROM OLD.dropoff_address
       OR NEW.dropoff_city IS DISTINCT FROM OLD.dropoff_city
       OR NEW.dropoff_state IS DISTINCT FROM OLD.dropoff_state
       OR NEW.dropoff_zip IS DISTINCT FROM OLD.dropoff_zip
       OR NEW.dropoff_notes IS DISTINCT FROM OLD.dropoff_notes
       OR NEW.authorizing_party_name IS DISTINCT FROM OLD.authorizing_party_name
       OR NEW.authorizing_party_relation IS DISTINCT FROM OLD.authorizing_party_relation
       OR NEW.authorizing_party_phone IS DISTINCT FROM OLD.authorizing_party_phone
       OR NEW.primary_driver_id IS DISTINCT FROM OLD.primary_driver_id
       OR NEW.secondary_driver_id IS DISTINCT FROM OLD.secondary_driver_id
       OR NEW.vehicle_id IS DISTINCT FROM OLD.vehicle_id
       OR NEW.scheduled_at IS DISTINCT FROM OLD.scheduled_at
       OR NEW.created_by IS DISTINCT FROM OLD.created_by
    THEN
      RAISE EXCEPTION 'Drivers may only update allowed workflow fields';
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status THEN
      allowed_next := CASE OLD.status
        WHEN 'new' THEN 'en_route_pickup'::public.case_status
        WHEN 'assigned' THEN 'en_route_pickup'::public.case_status
        WHEN 'en_route_pickup' THEN 'on_scene'::public.case_status
        WHEN 'on_scene' THEN 'in_custody'::public.case_status
        WHEN 'in_custody' THEN 'en_route_dropoff'::public.case_status
        WHEN 'en_route_dropoff' THEN 'delivered'::public.case_status
        ELSE NULL
      END;

      IF allowed_next IS NULL OR NEW.status IS DISTINCT FROM allowed_next THEN
        RAISE EXCEPTION 'Invalid driver status transition from % to %', OLD.status, NEW.status;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cases_restrict_driver_updates ON public.cases;
CREATE TRIGGER cases_restrict_driver_updates
  BEFORE UPDATE ON public.cases
  FOR EACH ROW EXECUTE FUNCTION public.restrict_driver_case_updates();

REVOKE EXECUTE ON FUNCTION public.restrict_profile_updates() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.restrict_driver_case_updates() FROM public, anon, authenticated;
