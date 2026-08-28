-- KORbuild · Bonus Extras
-- Adds positive point awards without changing the existing occurrence model.

CREATE TABLE IF NOT EXISTS public.bonus_extras (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    bonus_cycle_id UUID NOT NULL REFERENCES public.bonus_cycles(id) ON DELETE RESTRICT,
    periodo_id UUID REFERENCES public.periodos(id) ON DELETE RESTRICT,
    colaborador_id UUID NOT NULL REFERENCES public.colaboradores(id) ON DELETE RESTRICT,
    points INTEGER NOT NULL CHECK (points > 0),
    reason TEXT NOT NULL,
    granted_by UUID NOT NULL REFERENCES public.usuarios(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_bonus_extras_empresa
    ON public.bonus_extras(empresa_id);

CREATE INDEX IF NOT EXISTS idx_bonus_extras_cycle_employee
    ON public.bonus_extras(bonus_cycle_id, colaborador_id);

CREATE INDEX IF NOT EXISTS idx_bonus_extras_periodo
    ON public.bonus_extras(periodo_id);

-- RLS: same tenant isolation pattern already used by the application.
ALTER TABLE public.bonus_extras ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "usuarios podem visualizar bonus extras da sua empresa"
    ON public.bonus_extras;

CREATE POLICY "usuarios podem visualizar bonus extras da sua empresa"
    ON public.bonus_extras
    FOR SELECT
    TO authenticated
    USING (empresa_id = get_current_empresa_id());

DROP POLICY IF EXISTS "usuarios podem inserir bonus extras da sua empresa"
    ON public.bonus_extras;

CREATE POLICY "usuarios podem inserir bonus extras da sua empresa"
    ON public.bonus_extras
    FOR INSERT
    TO authenticated
    WITH CHECK (empresa_id = get_current_empresa_id());

DROP POLICY IF EXISTS "usuarios podem atualizar bonus extras da sua empresa"
    ON public.bonus_extras;

CREATE POLICY "usuarios podem atualizar bonus extras da sua empresa"
    ON public.bonus_extras
    FOR UPDATE
    TO authenticated
    USING (empresa_id = get_current_empresa_id())
    WITH CHECK (empresa_id = get_current_empresa_id());
