-- KORbuild · Schedule module (work shifts, vacation, time off, commitments)
-- Mirrors the tipos_ocorrencia / colaboradores tenant-isolation pattern:
-- tipos_escala is the configurable-category table (like tipos_ocorrencia),
-- escalas is the event table (like ocorrencias/lancamentos).

CREATE TABLE IF NOT EXISTS public.tipos_escala (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    codigo TEXT NOT NULL CHECK (codigo IN ('turno','ferias','folga','compromisso')),
    rotulo TEXT NOT NULL,
    cor TEXT,
    requer_aprovacao BOOLEAN NOT NULL DEFAULT false,
    conta_como_ausencia BOOLEAN NOT NULL DEFAULT false,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_tipos_escala_empresa
    ON public.tipos_escala(empresa_id);

ALTER TABLE public.tipos_escala ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "usuarios podem visualizar tipos de escala da sua empresa"
    ON public.tipos_escala;
CREATE POLICY "usuarios podem visualizar tipos de escala da sua empresa"
    ON public.tipos_escala
    FOR SELECT
    TO authenticated
    USING (empresa_id = get_current_empresa_id());

DROP POLICY IF EXISTS "usuarios podem inserir tipos de escala da sua empresa"
    ON public.tipos_escala;
CREATE POLICY "usuarios podem inserir tipos de escala da sua empresa"
    ON public.tipos_escala
    FOR INSERT
    TO authenticated
    WITH CHECK (empresa_id = get_current_empresa_id());

DROP POLICY IF EXISTS "usuarios podem atualizar tipos de escala da sua empresa"
    ON public.tipos_escala;
CREATE POLICY "usuarios podem atualizar tipos de escala da sua empresa"
    ON public.tipos_escala
    FOR UPDATE
    TO authenticated
    USING (empresa_id = get_current_empresa_id())
    WITH CHECK (empresa_id = get_current_empresa_id());


CREATE TABLE IF NOT EXISTS public.escalas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    colaborador_id UUID NOT NULL REFERENCES public.colaboradores(id) ON DELETE CASCADE,
    tipo_escala_id UUID NOT NULL REFERENCES public.tipos_escala(id) ON DELETE RESTRICT,
    data_inicio DATE NOT NULL,
    data_fim DATE NOT NULL,
    hora_inicio TIME,
    hora_fim TIME,
    status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','aprovado','rejeitado','confirmado')),
    observacoes TEXT,
    criado_por UUID NOT NULL REFERENCES public.usuarios(id) ON DELETE RESTRICT,
    aprovado_por UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT escalas_periodo_check CHECK (data_fim >= data_inicio)
);

CREATE INDEX IF NOT EXISTS idx_escalas_empresa
    ON public.escalas(empresa_id);

CREATE INDEX IF NOT EXISTS idx_escalas_colaborador_periodo
    ON public.escalas(colaborador_id, data_inicio);

CREATE INDEX IF NOT EXISTS idx_escalas_empresa_status
    ON public.escalas(empresa_id, status);

ALTER TABLE public.escalas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "usuarios podem visualizar escalas da sua empresa"
    ON public.escalas;
CREATE POLICY "usuarios podem visualizar escalas da sua empresa"
    ON public.escalas
    FOR SELECT
    TO authenticated
    USING (empresa_id = get_current_empresa_id());

DROP POLICY IF EXISTS "usuarios podem inserir escalas da sua empresa"
    ON public.escalas;
CREATE POLICY "usuarios podem inserir escalas da sua empresa"
    ON public.escalas
    FOR INSERT
    TO authenticated
    WITH CHECK (empresa_id = get_current_empresa_id() AND status = 'pendente');

-- Direct table updates are limited to still-pending entries and cannot
-- change status themselves. Approving/rejecting/confirming a Schedule entry
-- always goes through aprovar_escala() (see schedule_rpcs migration), which
-- is security definer and enforces is_empresa_admin() before changing
-- status. This keeps privilege checking server-side instead of trusting the
-- frontend to only show the approve action to admins.
DROP POLICY IF EXISTS "usuarios podem atualizar escalas pendentes da sua empresa"
    ON public.escalas;
CREATE POLICY "usuarios podem atualizar escalas pendentes da sua empresa"
    ON public.escalas
    FOR UPDATE
    TO authenticated
    USING (empresa_id = get_current_empresa_id() AND status = 'pendente')
    WITH CHECK (empresa_id = get_current_empresa_id() AND status = 'pendente');

-- Seed the four default Schedule categories for every existing company, so
-- the module is immediately usable without a dedicated "manage types" screen
-- (mirrors how tipos_ocorrencia is otherwise the only configurable-category
-- table with its own CRUD screen; Schedule intentionally ships with sane
-- defaults instead). New companies get the same defaults lazily via
-- garantir_tipos_escala_padrao() (see schedule_rpcs migration).
INSERT INTO public.tipos_escala (empresa_id, codigo, rotulo, cor, requer_aprovacao, conta_como_ausencia)
SELECT e.id, v.codigo, v.rotulo, v.cor, v.requer_aprovacao, v.conta_como_ausencia
FROM public.empresas e
CROSS JOIN (VALUES
    ('turno','Shift','#635bff', false, false),
    ('ferias','Vacation','#2e7a57', true, true),
    ('folga','Day Off','#b36b13', true, true),
    ('compromisso','Commitment','#5b53d8', false, false)
) AS v(codigo, rotulo, cor, requer_aprovacao, conta_como_ausencia)
WHERE NOT EXISTS (SELECT 1 FROM public.tipos_escala t WHERE t.empresa_id = e.id);
