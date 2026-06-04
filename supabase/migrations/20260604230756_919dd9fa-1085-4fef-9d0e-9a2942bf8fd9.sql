
-- Decedent events feed
CREATE TYPE public.decedent_event_type AS ENUM ('created','status_changed','note','document','workflow');

CREATE TABLE public.decedent_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  decedent_id UUID NOT NULL REFERENCES public.decedents(id) ON DELETE CASCADE,
  event_type public.decedent_event_type NOT NULL,
  from_status public.decedent_status,
  to_status public.decedent_status,
  message TEXT,
  actor_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX decedent_events_org_created_idx ON public.decedent_events(organization_id, created_at DESC);
CREATE INDEX decedent_events_decedent_idx ON public.decedent_events(decedent_id, created_at DESC);

GRANT SELECT, INSERT ON public.decedent_events TO authenticated;
GRANT ALL ON public.decedent_events TO service_role;

ALTER TABLE public.decedent_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members read decedent events"
  ON public.decedent_events FOR SELECT
  TO authenticated
  USING (public.is_org_member(organization_id));

CREATE POLICY "org members insert decedent events"
  ON public.decedent_events FOR INSERT
  TO authenticated
  WITH CHECK (public.is_org_member(organization_id) AND (actor_id = auth.uid() OR actor_id IS NULL));

-- Auto-log status changes + creation
CREATE OR REPLACE FUNCTION public.log_decedent_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.decedent_events (organization_id, decedent_id, event_type, to_status, actor_id, message)
    VALUES (NEW.organization_id, NEW.id, 'created', NEW.status, auth.uid(), 'Checked in');
    RETURN NEW;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.decedent_events (organization_id, decedent_id, event_type, from_status, to_status, actor_id)
    VALUES (NEW.organization_id, NEW.id, 'status_changed', OLD.status, NEW.status, auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_decedent_created
  AFTER INSERT ON public.decedents
  FOR EACH ROW EXECUTE FUNCTION public.log_decedent_change();

CREATE TRIGGER trg_decedent_updated
  AFTER UPDATE ON public.decedents
  FOR EACH ROW EXECUTE FUNCTION public.log_decedent_change();

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.decedent_events;
ALTER TABLE public.decedent_events REPLICA IDENTITY FULL;
