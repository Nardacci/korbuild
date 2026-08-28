-- KORbuild · Bonus Cycles RLS
-- Allows authenticated users to create/update cycles belonging to their own workspace.

DROP POLICY IF EXISTS "usuarios podem inserir bonus cycles da sua empresa"
    ON public.bonus_cycles;

CREATE POLICY "usuarios podem inserir bonus cycles da sua empresa"
    ON public.bonus_cycles
    FOR INSERT
    TO authenticated
    WITH CHECK (empresa_id = get_current_empresa_id());

DROP POLICY IF EXISTS "usuarios podem atualizar bonus cycles da sua empresa"
    ON public.bonus_cycles;

CREATE POLICY "usuarios podem atualizar bonus cycles da sua empresa"
    ON public.bonus_cycles
    FOR UPDATE
    TO authenticated
    USING (empresa_id = get_current_empresa_id())
    WITH CHECK (empresa_id = get_current_empresa_id());
