-- KORbuild · People / Colaboradores RLS
-- Tenant isolation for the People CRUD. Deactivation is used instead of hard delete.

ALTER TABLE public.colaboradores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "usuarios podem visualizar colaboradores da sua empresa"
    ON public.colaboradores;

CREATE POLICY "usuarios podem visualizar colaboradores da sua empresa"
    ON public.colaboradores
    FOR SELECT
    TO authenticated
    USING (empresa_id = get_current_empresa_id());

DROP POLICY IF EXISTS "usuarios podem inserir colaboradores da sua empresa"
    ON public.colaboradores;

CREATE POLICY "usuarios podem inserir colaboradores da sua empresa"
    ON public.colaboradores
    FOR INSERT
    TO authenticated
    WITH CHECK (empresa_id = get_current_empresa_id());

DROP POLICY IF EXISTS "usuarios podem atualizar colaboradores da sua empresa"
    ON public.colaboradores;

CREATE POLICY "usuarios podem atualizar colaboradores da sua empresa"
    ON public.colaboradores
    FOR UPDATE
    TO authenticated
    USING (empresa_id = get_current_empresa_id())
    WITH CHECK (empresa_id = get_current_empresa_id());
