CREATE TABLE public.audit_log_views (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 80),
  filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.audit_log_views TO authenticated;
GRANT ALL ON public.audit_log_views TO service_role;

ALTER TABLE public.audit_log_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own audit log views"
  ON public.audit_log_views
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER audit_log_views_set_updated_at
  BEFORE UPDATE ON public.audit_log_views
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX audit_log_views_user_idx
  ON public.audit_log_views (user_id, name);