
ALTER TABLE public.cremation_logs
  ADD COLUMN IF NOT EXISTS retort text,
  ADD COLUMN IF NOT EXISTS weight_lbs numeric,
  ADD COLUMN IF NOT EXISTS ash_weight_lbs numeric;

DROP TRIGGER IF EXISTS set_cremation_logs_updated_at ON public.cremation_logs;
CREATE TRIGGER set_cremation_logs_updated_at
BEFORE UPDATE ON public.cremation_logs
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.log_cremation_workflow()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.decedent_events (organization_id, decedent_id, event_type, actor_id, message)
    VALUES (
      NEW.organization_id,
      NEW.decedent_id,
      'workflow',
      auth.uid(),
      'Cremation started' ||
        COALESCE(' on retort ' || NEW.retort, '') ||
        COALESCE(' by operator', '')
    );
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.end_time IS NULL AND NEW.end_time IS NOT NULL THEN
    INSERT INTO public.decedent_events (organization_id, decedent_id, event_type, actor_id, message)
    VALUES (
      NEW.organization_id,
      NEW.decedent_id,
      'workflow',
      auth.uid(),
      'Cremation completed' ||
        COALESCE(' on retort ' || NEW.retort, '')
    );

    UPDATE public.decedents
       SET status = 'cremated'
     WHERE id = NEW.decedent_id
       AND status IS DISTINCT FROM 'cremated'
       AND status IS DISTINCT FROM 'released'
       AND status IS DISTINCT FROM 'checked_out';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cremation_logs_workflow_insert ON public.cremation_logs;
CREATE TRIGGER cremation_logs_workflow_insert
AFTER INSERT ON public.cremation_logs
FOR EACH ROW EXECUTE FUNCTION public.log_cremation_workflow();

DROP TRIGGER IF EXISTS cremation_logs_workflow_update ON public.cremation_logs;
CREATE TRIGGER cremation_logs_workflow_update
AFTER UPDATE ON public.cremation_logs
FOR EACH ROW EXECUTE FUNCTION public.log_cremation_workflow();
