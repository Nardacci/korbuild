-- KORbuild V1.2
-- Teams are first-class master data. Keep status consistent with People.
-- Run this migration in Supabase SQL Editor before using the Active Team toggle.

ALTER TABLE public.equipes
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_equipes_empresa_active
  ON public.equipes (empresa_id, active);

COMMENT ON COLUMN public.equipes.active IS 'Whether the Team can receive active People assignments.';
