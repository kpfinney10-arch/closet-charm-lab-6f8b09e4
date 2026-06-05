
CREATE OR REPLACE FUNCTION public.list_cremation_logs(
  p_organization_id uuid,
  p_scope text DEFAULT 'all',
  p_search text DEFAULT NULL,
  p_retort text DEFAULT NULL,
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_sort text DEFAULT 'start',
  p_dir text DEFAULT 'desc',
  p_limit int DEFAULT 25,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  organization_id uuid,
  decedent_id uuid,
  operator_id uuid,
  retort text,
  container_type text,
  weight_lbs numeric,
  ash_weight_lbs numeric,
  start_time timestamptz,
  end_time timestamptz,
  comment text,
  created_at timestamptz,
  updated_at timestamptz,
  decedent_first_name text,
  decedent_last_name text,
  decedent_status text,
  operator_name text,
  total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_sort text := lower(coalesce(p_sort, 'start'));
  v_dir text := CASE WHEN lower(coalesce(p_dir, 'desc')) = 'asc' THEN 'asc' ELSE 'desc' END;
  v_search text := CASE WHEN p_search IS NULL OR length(trim(p_search)) = 0 THEN NULL ELSE '%' || lower(trim(p_search)) || '%' END;
BEGIN
  RETURN QUERY
  WITH base AS (
    SELECT
      cl.id, cl.organization_id, cl.decedent_id, cl.operator_id,
      cl.retort, cl.container_type, cl.weight_lbs, cl.ash_weight_lbs,
      cl.start_time, cl.end_time, cl.comment, cl.created_at, cl.updated_at,
      d.first_name AS decedent_first_name,
      d.last_name AS decedent_last_name,
      d.status AS decedent_status,
      p.full_name AS operator_name,
      CASE WHEN cl.end_time IS NOT NULL AND cl.start_time IS NOT NULL
           THEN EXTRACT(EPOCH FROM (cl.end_time - cl.start_time))
           ELSE NULL END AS duration_seconds
    FROM cremation_logs cl
    LEFT JOIN decedents d ON d.id = cl.decedent_id
    LEFT JOIN profiles p ON p.id = cl.operator_id
    WHERE cl.organization_id = p_organization_id
      AND (p_scope <> 'active' OR cl.end_time IS NULL)
      AND (p_scope <> 'completed' OR cl.end_time IS NOT NULL)
      AND (p_retort IS NULL OR cl.retort = p_retort)
      AND (p_from IS NULL OR cl.start_time >= p_from)
      AND (p_to IS NULL OR cl.start_time <= p_to)
      AND (
        v_search IS NULL
        OR lower(coalesce(d.last_name, '')) LIKE v_search
        OR lower(coalesce(d.first_name, '')) LIKE v_search
        OR lower(coalesce(d.last_name, '') || ', ' || coalesce(d.first_name, '')) LIKE v_search
        OR lower(coalesce(cl.retort, '')) LIKE v_search
        OR lower(coalesce(p.full_name, '')) LIKE v_search
      )
  ), counted AS (
    SELECT b.*, count(*) OVER () AS total_count FROM base b
  )
  SELECT
    c.id, c.organization_id, c.decedent_id, c.operator_id,
    c.retort, c.container_type, c.weight_lbs, c.ash_weight_lbs,
    c.start_time, c.end_time, c.comment, c.created_at, c.updated_at,
    c.decedent_first_name, c.decedent_last_name, c.decedent_status,
    c.operator_name, c.total_count
  FROM counted c
  ORDER BY
    CASE WHEN v_sort = 'name' AND v_dir = 'asc' THEN lower(c.decedent_last_name || ', ' || c.decedent_first_name) END ASC NULLS LAST,
    CASE WHEN v_sort = 'name' AND v_dir = 'desc' THEN lower(c.decedent_last_name || ', ' || c.decedent_first_name) END DESC NULLS LAST,
    CASE WHEN v_sort = 'retort' AND v_dir = 'asc' THEN lower(c.retort) END ASC NULLS LAST,
    CASE WHEN v_sort = 'retort' AND v_dir = 'desc' THEN lower(c.retort) END DESC NULLS LAST,
    CASE WHEN v_sort = 'operator' AND v_dir = 'asc' THEN lower(c.operator_name) END ASC NULLS LAST,
    CASE WHEN v_sort = 'operator' AND v_dir = 'desc' THEN lower(c.operator_name) END DESC NULLS LAST,
    CASE WHEN v_sort = 'start' AND v_dir = 'asc' THEN c.start_time END ASC NULLS LAST,
    CASE WHEN v_sort = 'start' AND v_dir = 'desc' THEN c.start_time END DESC NULLS LAST,
    CASE WHEN v_sort = 'end' AND v_dir = 'asc' THEN c.end_time END ASC NULLS LAST,
    CASE WHEN v_sort = 'end' AND v_dir = 'desc' THEN c.end_time END DESC NULLS LAST,
    CASE WHEN v_sort = 'duration' AND v_dir = 'asc' THEN c.duration_seconds END ASC NULLS LAST,
    CASE WHEN v_sort = 'duration' AND v_dir = 'desc' THEN c.duration_seconds END DESC NULLS LAST,
    c.created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_cremation_logs(uuid, text, text, text, timestamptz, timestamptz, text, text, int, int) TO authenticated, service_role;
