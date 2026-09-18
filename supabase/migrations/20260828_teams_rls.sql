-- KORbuild V1.2
-- Fix RLS for Teams create/update operations.
-- A logged-in user may manage Teams only inside their own company.

ALTER TABLE public.equipes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "usuarios podem inserir equipes da sua empresa" ON public.equipes;
CREATE POLICY "usuarios podem inserir equipes da sua empresa"
ON public.equipes
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.usuarios u
    WHERE u.id = auth.uid()
      AND u.empresa_id = equipes.empresa_id
      AND u.active = true
  )
);

DROP POLICY IF EXISTS "usuarios podem atualizar equipes da sua empresa" ON public.equipes;
CREATE POLICY "usuarios podem atualizar equipes da sua empresa"
ON public.equipes
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.usuarios u
    WHERE u.id = auth.uid()
      AND u.empresa_id = equipes.empresa_id
      AND u.active = true
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.usuarios u
    WHERE u.id = auth.uid()
      AND u.empresa_id = equipes.empresa_id
      AND u.active = true
  )
);
