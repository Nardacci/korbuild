-- KORbuild · Customer Service Scheduling module
-- Separate tenant model from Schedule (tipos_escala/escalas): this is about
-- booking a service for a customer with a collaborator, not internal shifts.
-- Same tenant-isolation pattern as the rest of public.*.

-- Needed for the EXCLUDE constraint below (equality operator on uuid inside
-- a GIST index). Supabase pre-authorizes this extension for the postgres role.
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE IF NOT EXISTS public.clientes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    telefone TEXT,
    email TEXT NOT NULL,
    endereco TEXT,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_clientes_empresa
    ON public.clientes(empresa_id);

ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "usuarios podem visualizar clientes da sua empresa"
    ON public.clientes;
CREATE POLICY "usuarios podem visualizar clientes da sua empresa"
    ON public.clientes
    FOR SELECT
    TO authenticated
    USING (empresa_id = get_current_empresa_id());

DROP POLICY IF EXISTS "usuarios podem inserir clientes da sua empresa"
    ON public.clientes;
CREATE POLICY "usuarios podem inserir clientes da sua empresa"
    ON public.clientes
    FOR INSERT
    TO authenticated
    WITH CHECK (empresa_id = get_current_empresa_id());

DROP POLICY IF EXISTS "usuarios podem atualizar clientes da sua empresa"
    ON public.clientes;
CREATE POLICY "usuarios podem atualizar clientes da sua empresa"
    ON public.clientes
    FOR UPDATE
    TO authenticated
    USING (empresa_id = get_current_empresa_id())
    WITH CHECK (empresa_id = get_current_empresa_id());


CREATE TABLE IF NOT EXISTS public.servicos_catalogo (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    duracao_padrao_minutos INTEGER NOT NULL CHECK (duracao_padrao_minutos > 0),
    preco_padrao NUMERIC NOT NULL DEFAULT 0 CHECK (preco_padrao >= 0),
    ativo BOOLEAN NOT NULL DEFAULT true,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_servicos_catalogo_empresa
    ON public.servicos_catalogo(empresa_id);

ALTER TABLE public.servicos_catalogo ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "usuarios podem visualizar servicos da sua empresa"
    ON public.servicos_catalogo;
CREATE POLICY "usuarios podem visualizar servicos da sua empresa"
    ON public.servicos_catalogo
    FOR SELECT
    TO authenticated
    USING (empresa_id = get_current_empresa_id());

DROP POLICY IF EXISTS "usuarios podem inserir servicos da sua empresa"
    ON public.servicos_catalogo;
CREATE POLICY "usuarios podem inserir servicos da sua empresa"
    ON public.servicos_catalogo
    FOR INSERT
    TO authenticated
    WITH CHECK (empresa_id = get_current_empresa_id());

DROP POLICY IF EXISTS "usuarios podem atualizar servicos da sua empresa"
    ON public.servicos_catalogo;
CREATE POLICY "usuarios podem atualizar servicos da sua empresa"
    ON public.servicos_catalogo
    FOR UPDATE
    TO authenticated
    USING (empresa_id = get_current_empresa_id())
    WITH CHECK (empresa_id = get_current_empresa_id());


CREATE TABLE IF NOT EXISTS public.agendamentos_servico (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE RESTRICT,
    colaborador_id UUID NOT NULL REFERENCES public.colaboradores(id) ON DELETE RESTRICT,
    servico_id UUID NOT NULL REFERENCES public.servicos_catalogo(id) ON DELETE RESTRICT,
    data DATE NOT NULL,
    hora_inicio TIME NOT NULL,
    hora_fim TIME NOT NULL,
    status TEXT NOT NULL DEFAULT 'agendado' CHECK (status IN ('agendado','confirmado','em_andamento','concluido','cancelado','no_show')),
    observacoes TEXT,
    criado_por UUID REFERENCES public.usuarios(id),
    criado_em TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT agendamentos_servico_horario_check CHECK (hora_fim > hora_inicio),
    -- Guarantees no double-booking for the same collaborator at the database
    -- level, unconditionally — not just inside criar_agendamento/mover_agendamento.
    -- This holds even under concurrent writes or a direct table write that
    -- bypasses the RPCs. Cancelled appointments free up the slot.
    CONSTRAINT agendamentos_servico_sem_sobreposicao
        EXCLUDE USING gist (
            colaborador_id WITH =,
            tsrange((data + hora_inicio), (data + hora_fim), '[)') WITH &&
        ) WHERE (status <> 'cancelado')
);

CREATE INDEX IF NOT EXISTS idx_agendamentos_servico_empresa_data
    ON public.agendamentos_servico(empresa_id, data);

CREATE INDEX IF NOT EXISTS idx_agendamentos_servico_colaborador_data
    ON public.agendamentos_servico(colaborador_id, data);

CREATE INDEX IF NOT EXISTS idx_agendamentos_servico_cliente
    ON public.agendamentos_servico(cliente_id);

ALTER TABLE public.agendamentos_servico ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "usuarios podem visualizar agendamentos da sua empresa"
    ON public.agendamentos_servico;
CREATE POLICY "usuarios podem visualizar agendamentos da sua empresa"
    ON public.agendamentos_servico
    FOR SELECT
    TO authenticated
    USING (empresa_id = get_current_empresa_id());

DROP POLICY IF EXISTS "usuarios podem inserir agendamentos da sua empresa"
    ON public.agendamentos_servico;
CREATE POLICY "usuarios podem inserir agendamentos da sua empresa"
    ON public.agendamentos_servico
    FOR INSERT
    TO authenticated
    WITH CHECK (empresa_id = get_current_empresa_id());

DROP POLICY IF EXISTS "usuarios podem atualizar agendamentos da sua empresa"
    ON public.agendamentos_servico;
CREATE POLICY "usuarios podem atualizar agendamentos da sua empresa"
    ON public.agendamentos_servico
    FOR UPDATE
    TO authenticated
    USING (empresa_id = get_current_empresa_id())
    WITH CHECK (empresa_id = get_current_empresa_id());


CREATE TABLE IF NOT EXISTS public.configuracoes_lembrete (
    empresa_id UUID PRIMARY KEY REFERENCES public.empresas(id) ON DELETE CASCADE,
    -- Declared wider than "email only" now so sms/whatsapp can be turned on
    -- later without a schema migration — only the Edge Function needs to
    -- learn how to send through the new channel.
    canal TEXT NOT NULL DEFAULT 'email' CHECK (canal IN ('email','sms','whatsapp')),
    horas_antes INTEGER NOT NULL DEFAULT 24 CHECK (horas_antes > 0),
    template_assunto TEXT NOT NULL DEFAULT 'Reminder: your appointment on {{data}} at {{hora}}',
    template_corpo TEXT NOT NULL DEFAULT 'Hi {{cliente_nome}}, this is a reminder for your {{servico_nome}} appointment on {{data}} at {{hora}}.',
    ativo BOOLEAN NOT NULL DEFAULT true,
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    atualizado_por UUID REFERENCES public.usuarios(id)
);

ALTER TABLE public.configuracoes_lembrete ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "usuarios podem visualizar config de lembrete da sua empresa"
    ON public.configuracoes_lembrete;
CREATE POLICY "usuarios podem visualizar config de lembrete da sua empresa"
    ON public.configuracoes_lembrete
    FOR SELECT
    TO authenticated
    USING (empresa_id = get_current_empresa_id());

DROP POLICY IF EXISTS "usuarios podem inserir config de lembrete da sua empresa"
    ON public.configuracoes_lembrete;
CREATE POLICY "usuarios podem inserir config de lembrete da sua empresa"
    ON public.configuracoes_lembrete
    FOR INSERT
    TO authenticated
    WITH CHECK (empresa_id = get_current_empresa_id());

DROP POLICY IF EXISTS "usuarios podem atualizar config de lembrete da sua empresa"
    ON public.configuracoes_lembrete;
CREATE POLICY "usuarios podem atualizar config de lembrete da sua empresa"
    ON public.configuracoes_lembrete
    FOR UPDATE
    TO authenticated
    USING (empresa_id = get_current_empresa_id())
    WITH CHECK (empresa_id = get_current_empresa_id());


-- No empresa_id column here by design (spec'd shape); tenancy is derived by
-- joining to agendamentos_servico. Writes are intentionally left to the
-- send-appointment-reminders Edge Function, which uses the service role key
-- and therefore bypasses RLS entirely — mirrors the finances.ai_workspace_limits
-- pattern (RLS enabled, no write policy, so this is unreachable via direct
-- PostgREST access even by a tenant admin). Only a SELECT policy is defined,
-- so the frontend can show reminder history if needed.
CREATE TABLE IF NOT EXISTS public.lembretes_enviados (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agendamento_id UUID NOT NULL REFERENCES public.agendamentos_servico(id) ON DELETE CASCADE,
    canal TEXT NOT NULL,
    status_envio TEXT NOT NULL DEFAULT 'pendente' CHECK (status_envio IN ('pendente','enviado','falhou')),
    enviado_em TIMESTAMPTZ,
    erro_detalhe TEXT,
    provedor_message_id TEXT,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_lembretes_enviados_agendamento
    ON public.lembretes_enviados(agendamento_id, status_envio);

ALTER TABLE public.lembretes_enviados ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "usuarios podem visualizar lembretes da sua empresa"
    ON public.lembretes_enviados;
CREATE POLICY "usuarios podem visualizar lembretes da sua empresa"
    ON public.lembretes_enviados
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.agendamentos_servico a
            WHERE a.id = lembretes_enviados.agendamento_id
              AND a.empresa_id = get_current_empresa_id()
        )
    );
