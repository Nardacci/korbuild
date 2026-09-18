-- KORbuild · Employee Payment module (hourly rate history + weekly payroll)
-- Same tenant-isolation pattern as the rest of public.*: RLS scoped by
-- empresa_id = get_current_empresa_id(), privileged/computed writes done
-- through security-definer RPCs (see pagamento_rpcs migration).

CREATE TABLE IF NOT EXISTS public.configuracoes_folha (
    empresa_id UUID PRIMARY KEY REFERENCES public.empresas(id) ON DELETE CASCADE,
    dia_inicio_semana SMALLINT NOT NULL DEFAULT 1 CHECK (dia_inicio_semana BETWEEN 0 AND 6),
    horas_padrao_semana NUMERIC NOT NULL DEFAULT 44 CHECK (horas_padrao_semana > 0),
    multiplicador_hora_extra NUMERIC NOT NULL DEFAULT 1.5 CHECK (multiplicador_hora_extra >= 1),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    atualizado_por UUID REFERENCES public.usuarios(id)
);

ALTER TABLE public.configuracoes_folha ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "usuarios podem visualizar configuracoes de folha da sua empresa"
    ON public.configuracoes_folha;
CREATE POLICY "usuarios podem visualizar configuracoes de folha da sua empresa"
    ON public.configuracoes_folha
    FOR SELECT
    TO authenticated
    USING (empresa_id = get_current_empresa_id());

DROP POLICY IF EXISTS "usuarios podem inserir configuracoes de folha da sua empresa"
    ON public.configuracoes_folha;
CREATE POLICY "usuarios podem inserir configuracoes de folha da sua empresa"
    ON public.configuracoes_folha
    FOR INSERT
    TO authenticated
    WITH CHECK (empresa_id = get_current_empresa_id());

DROP POLICY IF EXISTS "usuarios podem atualizar configuracoes de folha da sua empresa"
    ON public.configuracoes_folha;
CREATE POLICY "usuarios podem atualizar configuracoes de folha da sua empresa"
    ON public.configuracoes_folha
    FOR UPDATE
    TO authenticated
    USING (empresa_id = get_current_empresa_id())
    WITH CHECK (empresa_id = get_current_empresa_id());


CREATE TABLE IF NOT EXISTS public.historico_valor_hora (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    colaborador_id UUID NOT NULL REFERENCES public.colaboradores(id) ON DELETE CASCADE,
    valor_hora NUMERIC NOT NULL CHECK (valor_hora >= 0),
    vigente_de DATE NOT NULL,
    vigente_ate DATE,
    criado_por UUID REFERENCES public.usuarios(id),
    criado_em TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT historico_valor_hora_vigencia_check CHECK (vigente_ate IS NULL OR vigente_ate >= vigente_de)
);

CREATE INDEX IF NOT EXISTS idx_historico_valor_hora_colaborador
    ON public.historico_valor_hora(colaborador_id, vigente_de);

CREATE INDEX IF NOT EXISTS idx_historico_valor_hora_empresa
    ON public.historico_valor_hora(empresa_id);

-- At most one open-ended (vigente_ate IS NULL, i.e. "currently in effect")
-- rate per colaborador, enforced at the database level so registrar_valor_hora()
-- can never leave two competing "current" rates for the same person.
CREATE UNIQUE INDEX IF NOT EXISTS uq_historico_valor_hora_vigente
    ON public.historico_valor_hora(colaborador_id) WHERE (vigente_ate IS NULL);

ALTER TABLE public.historico_valor_hora ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "usuarios podem visualizar historico de valor hora da sua empresa"
    ON public.historico_valor_hora;
CREATE POLICY "usuarios podem visualizar historico de valor hora da sua empresa"
    ON public.historico_valor_hora
    FOR SELECT
    TO authenticated
    USING (empresa_id = get_current_empresa_id());

DROP POLICY IF EXISTS "usuarios podem inserir historico de valor hora da sua empresa"
    ON public.historico_valor_hora;
CREATE POLICY "usuarios podem inserir historico de valor hora da sua empresa"
    ON public.historico_valor_hora
    FOR INSERT
    TO authenticated
    WITH CHECK (empresa_id = get_current_empresa_id());

DROP POLICY IF EXISTS "usuarios podem atualizar historico de valor hora da sua empresa"
    ON public.historico_valor_hora;
CREATE POLICY "usuarios podem atualizar historico de valor hora da sua empresa"
    ON public.historico_valor_hora
    FOR UPDATE
    TO authenticated
    USING (empresa_id = get_current_empresa_id())
    WITH CHECK (empresa_id = get_current_empresa_id());


CREATE TABLE IF NOT EXISTS public.pagamentos_semanais (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    colaborador_id UUID NOT NULL REFERENCES public.colaboradores(id) ON DELETE RESTRICT,
    semana_inicio DATE NOT NULL,
    semana_fim DATE NOT NULL,
    horas_trabalhadas NUMERIC NOT NULL DEFAULT 0 CHECK (horas_trabalhadas >= 0),
    valor_hora_aplicado NUMERIC NOT NULL CHECK (valor_hora_aplicado >= 0),
    valor_bruto NUMERIC NOT NULL CHECK (valor_bruto >= 0),
    adiantamento NUMERIC NOT NULL DEFAULT 0 CHECK (adiantamento >= 0),
    valor_liquido NUMERIC NOT NULL,
    status_pagamento TEXT NOT NULL DEFAULT 'pendente' CHECK (status_pagamento IN ('pendente','pago','parcial')),
    pago_em TIMESTAMPTZ,
    observacoes TEXT,
    criado_por UUID REFERENCES public.usuarios(id),
    criado_em TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT pagamentos_semanais_periodo_check CHECK (semana_fim >= semana_inicio),
    -- One payment row per colaborador per week; registrar_pagamento() upserts
    -- on this so re-registering the same week updates it instead of
    -- duplicating it.
    CONSTRAINT pagamentos_semanais_unico UNIQUE (empresa_id, colaborador_id, semana_inicio)
);

CREATE INDEX IF NOT EXISTS idx_pagamentos_semanais_empresa_semana
    ON public.pagamentos_semanais(empresa_id, semana_inicio);

CREATE INDEX IF NOT EXISTS idx_pagamentos_semanais_colaborador
    ON public.pagamentos_semanais(colaborador_id);

ALTER TABLE public.pagamentos_semanais ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "usuarios podem visualizar pagamentos semanais da sua empresa"
    ON public.pagamentos_semanais;
CREATE POLICY "usuarios podem visualizar pagamentos semanais da sua empresa"
    ON public.pagamentos_semanais
    FOR SELECT
    TO authenticated
    USING (empresa_id = get_current_empresa_id());

-- Direct inserts/updates stay tenant-scoped as a backstop, but the intended
-- write path is registrar_pagamento() (security definer), which recomputes
-- valor_bruto/valor_liquido server-side so the persisted amounts can never
-- drift from horas_trabalhadas x valor_hora_aplicado.
DROP POLICY IF EXISTS "usuarios podem inserir pagamentos semanais da sua empresa"
    ON public.pagamentos_semanais;
CREATE POLICY "usuarios podem inserir pagamentos semanais da sua empresa"
    ON public.pagamentos_semanais
    FOR INSERT
    TO authenticated
    WITH CHECK (empresa_id = get_current_empresa_id());

DROP POLICY IF EXISTS "usuarios podem atualizar pagamentos semanais da sua empresa"
    ON public.pagamentos_semanais;
CREATE POLICY "usuarios podem atualizar pagamentos semanais da sua empresa"
    ON public.pagamentos_semanais
    FOR UPDATE
    TO authenticated
    USING (empresa_id = get_current_empresa_id())
    WITH CHECK (empresa_id = get_current_empresa_id());
