-- Add account approval gating
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS approved boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid;

-- Grandfather existing accounts so current users keep access
UPDATE public.profiles SET approved = true, approved_at = now() WHERE approved = false;

-- New audit action for approvals
ALTER TYPE public.admin_audit_action ADD VALUE IF NOT EXISTS 'user_approved';
ALTER TYPE public.admin_audit_action ADD VALUE IF NOT EXISTS 'user_unapproved';