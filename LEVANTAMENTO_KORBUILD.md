# Levantamento do Projeto — KORbuild

> Relatório de investigação gerado em 2026-09-16. Apenas leitura/documentação — nenhum código foi alterado.
>
> **Fonte dos dados:** o repositório não tem migrations completas para todas as tabelas (várias foram criadas direto no Supabase Studio). Por isso o schema abaixo foi reconstruído cruzando as 8 migrations existentes com todas as chamadas `.from()`/`.rpc()` feitas pelo frontend (`supabase-js`). Não houve acesso direto ao Postgres (sem CLI do Supabase instalado, sem senha do pooler no repo) — o schema é **inferido com alta confiança do uso real em produção**, não copiado de um `information_schema`. Colunas marcadas como "migration" são 100% confirmadas; as demais são "inferidas do código".

---

## 1. Estrutura de pastas

O repositório é **essencialmente plano** (SPA multi-página em HTML/CSS/JS puro, sem bundler, sem framework, sem `package.json`). Não há uma árvore de 3 níveis real de código-fonte — quase tudo vive na raiz. Estrutura relevante:

```
korbuild/                          (raiz do repo)
├── index.html / app.js            → login (decide destino: super-admin / setup / home)
├── signup.html / signup.js        → cadastro (Supabase Auth)
├── auth-service.js                → wrapper fino sobre supabase.auth (signUp/signIn/signOut)
├── provisioning-service.js        → chama RPC provision_tenant() após confirmação de e-mail
├── setup.html / setup.js          → onboarding legado (wizard V1)
├── setup-v2.js / index-v2.html    → onboarding V2 (wizard atual: cria workspace via RPC initialize_workspace)
├── home.html / home.js            → Dashboard (inclui o widget de IA flutuante)
├── people.html(+form)/.js         → CRUD de colaboradores
├── teams.html(+form)/.js          → CRUD de equipes
├── work-units.html(+form)/.js     → CRUD de unidades de trabalho (obras/frentes)
├── occurrences.html(+form)/.js    → CRUD de tipos de ocorrência (regras de pontuação)
├── evaluations.html/.js           → lançamento/avaliação de ocorrências por período
├── periods.html/.js               → abertura/fechamento de períodos de avaliação
├── bonus-settlement.html/.js      → fechamento/relatório de bônus (pontos → USD)
├── collaborator-movement.html/.js → relatório histórico de pontuação por colaborador
├── billing.html/.js               → tela de assinatura/pagamento do workspace (trial, setup fee, mensalidade)
├── super-admin.html/.js           → shell do super admin da plataforma (multi-tenant)
├── commercial-admin.html/.js      → administração comercial (preços, acesso, IA) — só para super admin
├── ai-gateway.js / ai-panel.css / ai-fab.css   → assistente de IA do Dashboard (produção)
├── ai-admin.js / ai-admin.css     → painel de administração de orçamento de IA (⚠ órfão, ver seção 3)
├── ai-debug.js                    → bootstrap de diagnóstico temporário do gateway de IA
├── i18n.js                        → dicionário de tradução EN/PT da UI
├── supabase-config.js             → client Supabase global + shell da sidebar + guarda de acesso/assinatura
├── app-config.js                  → versão/ambiente do app
├── style.css, ui-fixes.css, dashboard-v1.css, super-admin-menu.css, ... → estilos por tela
├── supabase/
│   ├── migrations/                → migrations "novas" (datadas), numeradas 002–005 + 2 datadas de IA financeira
│   └── .temp/                     → metadados do `supabase link` (project-ref nowbohxeqwlddbfnukva, pooler sa-east-1)
├── supabase-migrations/           → pasta de migrations "antiga" (paralela, não integrada à pasta supabase/), 2 arquivos sobre Teams
└── README.md
```

**Achados sobre a estrutura:**
- **Sem `package.json`, sem build step** — é servido como HTML/JS/CSS estático (provavelmente GitHub Pages, ver `APP_BASE_URL = 'https://nardacci.github.io/korbuild/'` em `auth-service.js`).
- **Duas pastas de migrations não relacionadas**: `supabase/migrations/` (formato novo, com timestamp) e `supabase-migrations/` (2 arquivos antigos sobre `equipes`). Isso indica que o fluxo de migrations foi trocado no meio do projeto e nunca foi unificado — vale consolidar em uma só pasta.
- **Não existe migration para as tabelas centrais** (`empresas`, `usuarios`, `colaboradores` em si, `equipes`, `unidades_trabalho`, `periodos`, `bonus_cycles`, `tipos_ocorrencia`, `ocorrencias`, `lancamentos`, `configuracoes_operacionais`, `commercial_pricing_settings`, `company_commercial_terms`, `payment_instructions`, `korbuild_admins`, `ai_insights`). Foram criadas manualmente no Supabase Studio. As migrations existentes só fazem *alterações incrementais* (RLS, rename de coluna, novas tabelas pontuais). **Recomendação:** rodar `supabase db pull` (ou dump manual) para gerar uma migration baseline com o schema real antes de continuar evoluindo o banco.
- Há uma **pasta `korbuild/` aninhada dentro do próprio repositório** (`C:\...\korbuild\korbuild\`), não rastreada pelo git (aparece como `??` no `git status`) e com seu próprio `.git` — parece um clone acidental dentro do working directory. Não foi tocada nesta investigação; vale o usuário confirmar se pode ser removida.

---

## 2. Schema do banco (Supabase)

Projeto Supabase vinculado: `nowbohxeqwlddbfnukva` (região `sa-east-1`, Postgres 17.6). Duas "famílias" de tenant coexistem no mesmo banco:
- **`public.*` scoped por `empresa_id`** — é o modelo do KORbuild HR/RH (RLS via `get_current_empresa_id()`).
- **`finances.*` scoped por `workspace_id`** — pertence a um produto irmão ("KORbuild Finances", repo separado) e é **intencionalmente independente** do `empresa_id` (comentário explícito na migration `20260914150000`). Só é tocado aqui pelas telas de administração comercial (limites de IA).

### 2.1 Tabelas de RH (`public` schema, isoladas por `empresa_id`)

| Tabela | Colunas (tipo/observação) | PK / FK | RLS / RPC |
|---|---|---|---|
| **empresas** | `id` (uuid, PK), `name` (text) | PK `id` | Referenciada por FK de várias tabelas (`ON DELETE CASCADE` em `bonus_extras`); não foi vista sua própria política RLS no código investigado |
| **usuarios** | `id` (uuid, PK = `auth.users.id`), `name`, `empresa_id` (FK empresas), `active` (bool) | PK `id`, FK `empresa_id → empresas` | Usada dentro de políticas RLS de outras tabelas (ex.: `equipes`) para checar `u.empresa_id = ... AND u.active = true` |
| **colaboradores** | `id` (PK), `empresa_id` (FK empresas), `name`, `specialty` (renomeada de `role` na migration 005), `equipe_id` (FK equipes), `active`, `created_at`, `updated_at` | PK `id`, FK `empresa_id`, FK `equipe_id → equipes` | RLS (migration 004): SELECT/INSERT/UPDATE restritos a `empresa_id = get_current_empresa_id()`. Sem hard delete (usa `active`) |
| **equipes** | `id` (PK), `empresa_id` (FK), `unidade_trabalho_id` (FK unidades_trabalho), `name`, `active` (migration `20260828_teams_active`), `created_at` | PK `id`, FK `empresa_id`, FK `unidade_trabalho_id` | RLS (migration `20260828_teams_rls`): INSERT/UPDATE exigem `usuarios.empresa_id = equipes.empresa_id AND usuarios.active = true`. (SELECT não coberto pela migration — provavelmente definido manualmente no Studio) |
| **unidades_trabalho** | `id` (PK), `empresa_id` (FK), `name`, `code`, `description`, `status` (`ATIVA`/`INATIVA`), `created_at`, `updated_at` | PK `id`, FK `empresa_id` | Não há migration de RLS no repo; presumivelmente definida manualmente (mesmo padrão `empresa_id = get_current_empresa_id()`) |
| **periodos** | `id` (PK), `empresa_id` (FK), `bonus_cycle_id` (FK bonus_cycles), `start_date`, `end_date`, `year`, `week_number`, `status` (`ABERTO`/`FECHADO`/`CANCELADO`), `created_at` | PK `id`, FK `empresa_id`, FK `bonus_cycle_id` | Sem migration própria de RLS no repo |
| **bonus_cycles** | `id` (PK), `empresa_id` (FK), `name`, `year`, `start_month`, `end_month`, `starting_points`, `point_value` (numeric, USD por ponto), `status` (`OPEN`/...), `opened_at`, `created_at` | PK `id`, FK `empresa_id` | RLS (migration 003): INSERT/UPDATE restritos a `empresa_id = get_current_empresa_id()` |
| **bonus_extras** | `id` (PK, uuid), `empresa_id` (FK, cascade), `bonus_cycle_id` (FK, restrict), `periodo_id` (FK periodos, restrict, nullable), `colaborador_id` (FK colaboradores, restrict), `points` (int, `CHECK > 0`), `reason` (text), `granted_by` (FK usuarios, restrict), `created_at`, `updated_at` | PK `id` | **100% via migration 002.** RLS completa: SELECT/INSERT/UPDATE por `empresa_id = get_current_empresa_id()`. Índices em `empresa_id`, `(bonus_cycle_id, colaborador_id)`, `periodo_id` |
| **configuracoes_operacionais** | `id` (PK), `empresa_id` (FK), `evaluation_frequency` (`WEEKLY`/...), `period_start_day`, `period_end_day` (0-6), `evaluation_target` (`ACTIVE_ONLY`), `period_preparation_mode` (`MANUAL`/`AUTOMATIC`), `starting_points`, `point_value`, `bonus_cycle_start_month`, `bonus_cycle_end_month`, `period_preparation_day`, `period_preparation_time`, `created_at` | PK `id`, FK `empresa_id` | Sem migration própria no repo |
| **lancamentos** | `id` (PK), `empresa_id` (FK), `periodo_id` (FK periodos), `colaborador_id` (FK colaboradores), `equipe_id` (FK equipes), `unidade_trabalho_id` (FK unidades_trabalho), `total_score` (numeric), `penalty_value` (numeric), `updated_at` | PK `id` | É o "lançamento" de avaliação de um colaborador em um período (1 linha por pessoa/período). Sem migration própria no repo |
| **tipos_ocorrencia** | `id` (PK), `empresa_id` (FK), `name`, `description`, `occurrence_type` (`POSITIVA`/`NEGATIVA`), `points` (sempre positivo, sinal aplicado no app), `active`, `sort_order`, `created_at` | PK `id`, FK `empresa_id` | Cadastro de regras de pontuação (tabela de configuração, não de eventos) |
| **ocorrencias** | `id` (PK), `empresa_id` (FK), `lancamento_id` (FK lancamentos), `tipo_ocorrencia_id` (FK tipos_ocorrencia), `quantity` (int), `points` (numeric, herdado do tipo no momento do preparo), `notes`, `updated_at` | PK `id` | São os eventos reais dentro de um `lancamento` (uma linha por tipo de ocorrência aplicável, com `quantity` editável na avaliação) |
| **ai_insights** | `id` (PK), `empresa_id` (FK), `tipo` (ex.: `PERFORMANCE_DECLINE`), `titulo`, `descricao`, `severidade`, `confidence`, `status` (`active`/...), `evidencias` (jsonb, ex.: `collaborator_name`), `created_at` | PK `id`, FK `empresa_id` | "Learning Loop" da IA — populada pela RPC `detect_ai_performance_declines()` |
| **korbuild_admins** | `user_id` (FK `auth.users`), `active` (bool) | provável PK `user_id` | **Allowlist de super admins da plataforma** (não tem `empresa_id` — é nível plataforma, não tenant) |
| **commercial_pricing_settings** | `id` (singleton, usado sempre com `id: true`), `base_setup_fee`, `monthly_price`, `currency`, `updated_by` (FK auth.users), `updated_at` | PK `id` (booleano fixo) | Preço-base padrão da plataforma, editável só por super admin |
| **company_commercial_terms** | `empresa_id` (FK empresas, `onConflict: 'empresa_id'`), `setup_adjustment_percent` (numeric, pode ser negativo), `updated_by`, `updated_at` | PK/UNIQUE `empresa_id` | Ajuste comercial por empresa sobre o preço-base |
| **payment_instructions** | `id` (singleton, `id: true`), `method` (`PIX`/...), `account_holder`, `pix_key`, `bank_name`, `payment_contact`, `instructions`, `updated_at`, `updated_by` | PK `id` (booleano fixo) | Dados bancários exibidos na tela de Billing para pagamento manual |

### 2.2 Tabelas do schema `finances` (produto irmão, tenant separado por `workspace_id`)

| Tabela | Colunas conhecidas | Observação |
|---|---|---|
| **finances.user_workspaces** | `id` (PK), `display_name`, `country` | Definida no repo "KORbuildFinances" (externo); aqui só é lida via `LEFT JOIN` |
| **finances.ai_workspace_limits** | `workspace_id` (PK, FK `user_workspaces`), `monthly_request_limit` (int, default 100), `enabled` (bool, default true), `updated_at`, `updated_by` (FK `auth.users`) | **100% via migration `20260914150000`.** RLS habilitada **sem policies** — só acessível via RPC `security definer` |
| **finances.ai_usage_log** | `workspace_id`, `status` (`success`/...), `created_at` | Definida no repo externo (`20260914160000_ai_usage_log.sql`); usada aqui só em subquery de contagem |

### 2.3 Funções RPC (`security definer` / auxiliares de RLS)

| Função | Assinatura | Propósito |
|---|---|---|
| `get_current_empresa_id()` | `()` | Resolve o `empresa_id` do usuário logado; usada em quase toda policy RLS de `public.*` |
| `is_korbuild_super_admin()` | `()` | Checa `korbuild_admins` (ou equivalente); porta de entrada para telas de super admin |
| `get_workspace_access_status()` | `()` | Retorna `{access, status/phase, days_remaining, setup_status, monthly_starts_at, ...}` — guarda global de bloqueio por assinatura (chamada em toda página protegida) |
| `provision_tenant()` | `()` | Cria `empresas`/`usuarios` após confirmação de e-mail no signup legado |
| `initialize_workspace(p_company_name, p_user_name)` | retorna `empresa_id` | Cria o workspace no onboarding V2 (`setup-v2.js`) |
| `activate_workspace_trial()` | `()` | Ativa o trial comercial ao concluir o onboarding |
| `get_company_commercial_price()` | `()` | Preço final (base + ajuste da empresa) exibido no Billing |
| `get_payment_instructions()` | `()` | Retorna dados bancários (mesma tabela `payment_instructions`, via RPC para não expor por PostgREST direto) |
| `update_company_access_control(p_empresa_id, p_status, p_trial_enabled, p_activation_source, p_activation_reason)` | | Super admin altera status comercial/trial de uma empresa |
| `get_korbuild_commercial_admin_data()` | `()` | Payload agregado da tela `commercial-admin.html` (settings + companies) |
| `prepare_period_evaluations(p_period_id, p_empresa_id, p_avaliador_id)` | | Gera `lancamentos` + `ocorrencias` para todo colaborador ativo ao abrir um novo período |
| `delete_latest_open_period(p_period_id, p_empresa_id)` | | Permite excluir **apenas** o período `ABERTO` mais recente |
| `detect_ai_performance_declines()` | `()` | Roda antes de montar o contexto de IA; popula `ai_insights` |
| `get_korbuild_ai_admin_data()` / `update_korbuild_ai_global_settings(...)` / `update_korbuild_ai_company_limit(...)` | | Sistema **antigo** de orçamento de IA em USD por empresa (ver seção 3 — parece órfão) |
| `get_finances_ai_limits()` (v2, migration `20260915153000`) | retorna também `used_this_month` | Lê `finances.ai_workspace_limits` + `finances.ai_usage_log`; usada por `commercial-admin.js` |
| `update_finances_ai_limit(p_workspace_id, p_monthly_request_limit, p_enabled)` | | Grava limite de IA por workspace financeiro |

---

## 3. Arquivos de IA existentes

| Arquivo | Função | Como se conecta |
|---|---|---|
| **`ai-gateway.js`** | Motor do assistente de IA do Dashboard (único incluído em `home.html`). Monta um "contexto autorizado" (`buildAuthorizedContext`) lendo `usuarios`→`empresa_id`, `colaboradores`, `equipes`, `periodos` (período `ABERTO`), `ai_insights`, `lancamentos` e `ocorrencias`; roda `detect_ai_performance_declines()` antes de montar o contexto. Envia a pergunta + contexto para o Edge Function `POST {supabaseUrl}/functions/v1/korbuild-ai` (com `Authorization: Bearer <access_token>`); se o gateway falhar, cai num fallback local (`localAnswer`) que responde por regras (`classifyIntent`) usando só os dados já carregados. Renderiza a resposta como markdown simplificado. | Tudo é escopado por `empresa_id` do usuário logado (nunca chama nada fora do tenant); depende de sessão Supabase Auth válida |
| **`ai-panel.css`** | Estiliza o painel flutuante de chat (`#kor-ai-panel`, mensagens, cabeçalho, input, sugestões). | Puramente visual, consumido pelo DOM que `ai-gateway.js` manipula em `home.html` |
| **`ai-fab.css`** | Estiliza o botão flutuante (FAB) que abre o painel de IA (canto inferior direito). | Visual; o clique nele é tratado dentro de `ai-gateway.js`/`home.js` |
| **`ai-debug.js`** | Bootstrap de diagnóstico "temporário" (comentário no próprio arquivo: "Temporary V1.4.0 diagnostic bootstrap"). Intercepta `window.fetch` para logar/mostrar status das chamadas ao Edge Function `korbuild-ai`, remove uma tag `<script>` cacheada de `ai-gateway.js` e a recarrega com um query-string de versão (`?v=1.4.0`) para forçar bypass de cache. | Só faz sentido junto de `ai-gateway.js`; parece código de debug esquecido em produção — candidato a remoção/limpeza |
| **`ai-admin.js`** | Painel de administração de **orçamento de IA em USD por empresa**: carrega `get_korbuild_ai_admin_data()` (config global + lista de empresas com `monthly_budget_usd`, `monthly_used_usd`, `warn_percent`, `hard_limit`, `max_requests_per_minute`, limites diário/mensal de requisições, custo máx. por request); permite editar via `update_korbuild_ai_global_settings` e `update_korbuild_ai_company_limit`. | **⚠ Não está incluído em nenhum HTML do repo** (`commercial-admin.html`/`super-admin.html` não referenciam `ai-admin.js`/`ai-admin.css`). Parece ser uma versão **anterior/substituída** do controle de IA — o controle atual, vivo em produção, é o bloco "AI Consumption" dentro de `commercial-admin.js` (que usa `get_finances_ai_limits`/`update_finances_ai_limit`, escopado por `workspace_id` do produto Finances, não por `empresa_id`). |
| **`ai-admin.css`** | Estilos do painel acima (`.ai-global`, `.ai-company-row`, `.ai-modal`, barras de uso etc.). | Mesmo status órfão do `ai-admin.js` |

**Observação importante:** existem **dois sistemas de governança de IA em paralelo**:
1. **Antigo, órfão:** `ai-admin.js/css` + RPCs `get_korbuild_ai_admin_data`/`update_korbuild_ai_*` — orçamento em **USD por empresa** (`empresa_id`), não referenciado em nenhuma tela ativa.
2. **Atual, em produção:** bloco "AI Consumption" dentro de `commercial-admin.js/html` + RPCs `get_finances_ai_limits`/`update_finances_ai_limit` (migrations `20260914150000` e `20260915153000`) — limite de **quantidade de requisições por mês** por `workspace_id` do produto KORbuild Finances (schema `finances`, deliberadamente desacoplado de `empresa_id`).

Vale confirmar com o time se `ai-admin.js/css` pode ser removido, ou se é um WIP para reativar o controle de orçamento em USD por empresa de RH (que hoje não tem nenhum limite/gate ativo — o `ai-gateway.js` não faz nenhuma checagem de orçamento antes de chamar o Edge Function `korbuild-ai`).

---

## 4. Telas/fluxos de jornada, horário, escala, férias, folga ou ponto

**Não existe nada disso hoje.** Busca por `jornada`, `horário`, `escala`, `férias`, `folga`, `ponto`, `timesheet`, `clock-in` em todo o código (JS/HTML) não encontrou nenhuma tela, componente, tabela ou lógica relacionada a controle de jornada/ponto/escala/férias. O único "falso positivo" é a palavra **"pontos" (points)**, que se refere ao sistema de pontuação de bônus (positivo/negativo), não a ponto de trabalho.

O que existe de mais próximo, conceitualmente, é o sistema de **períodos de avaliação** (`periodos`, semanal/quinzenal/mensal, com datas de início/fim configuráveis em `configuracoes_operacionais`) — mas isso é um ciclo de avaliação de desempenho/bônus, não um controle de horário trabalhado.

---

## 5. Módulo de pagamento/folha de funcionários

**Não existe payroll/folha de pagamento de salários.** Nenhuma tabela, tela ou lógica sobre salário, valor/hora, adiantamento ou cálculo de folha foi encontrada (busca por `salary/salário`, `payroll/folha`, `wage`, `valor-hora`, `adiantamento` não retornou nenhum resultado).

O que existe, e é o mais próximo funcionalmente, é o **sistema de Bônus por Pontos** (não é folha de pagamento de salário — é um bônus variável calculado sobre um saldo de pontos):

- **Configuração** (`configuracoes_operacionais` / `bonus_cycles`): `starting_points` (pontos iniciais por colaborador a cada ciclo) e `point_value` (valor em USD por ponto).
- **Ciclo de bônus** (`bonus_cycles`): período anual/custom (`start_month`→`end_month`) dentro do qual rodam vários `periodos` semanais.
- **Ocorrências** (`tipos_ocorrencia` + `ocorrencias`): cada colaborador começa o ciclo com `starting_points`; ocorrências negativas **descontam** pontos (positivas ainda não implicam em nada no fechamento — ver abaixo), aplicadas por período via `lancamentos`.
- **Bônus extra** (`bonus_extras`, migration 002): pontos positivos avulsos concedidos manualmente a um colaborador (com `reason` e `granted_by`), fora do fluxo normal de ocorrências — mas **este arquivo `bonus_extras` não é lido em nenhum lugar do frontend investigado** (só existe a tabela + RLS; nenhuma tela consome ou grava nela). Pode ser um recurso implementado no banco mas ainda sem UI, ou UI removida.
- **Fechamento/Settlement** (`bonus-settlement.js`): para cada colaborador ativo, soma as deduções (`min(0, score)` de todas as ocorrências do ciclo) sobre `starting_points`, calcula `final = max(0, starting + deductions)` e `bonus = final * point_value`. **O cálculo é feito 100% no frontend**, direto das tabelas `ocorrencias`/`lancamentos` — não há função de banco nem trigger que persista o valor final do bônus; o comentário no código é explícito: "Calculate directly from occurrence records... Do not depend on lancamentos.total_score, which can be stale".
- **Sem integração de pagamento real**: não há geração de boleto/PIX para o colaborador, não há registro de "bônus pago", nem valor/hora, nem adiantamento — é puramente um relatório de cálculo e impressão (`window.print()`).

O único "pagamento" com lógica de fato é o da **assinatura do workspace** (`billing.js` + `commercial-admin.js`): setup fee único + mensalidade, com instruções de PIX/transferência manuais (`payment_instructions`) — isso é cobrança da plataforma para o cliente (SaaS), não folha de pagamento de funcionários.

---

## Resumo executivo

| Item | Situação |
|---|---|
| Estrutura | SPA estática sem build, ~33 JS / 23 HTML / 23 CSS na raiz; duas pastas de migrations paralelas e não unificadas; pasta `korbuild/` duplicada e não versionada dentro do repo |
| Schema RH | ~18 tabelas em `public` (empresas, usuários, colaboradores, equipes, unidades de trabalho, períodos, ciclos de bônus, ocorrências, lançamentos, ai_insights, comercial/billing) + 3 tabelas em `finances` (produto irmão, tenant `workspace_id`). Só ~5 tabelas têm migration confirmada; o resto foi criado manualmente no Supabase Studio — falta uma migration baseline |
| IA | 6 arquivos de frontend; **2 sistemas de governança de IA coexistindo** — um ativo (`finances.ai_workspace_limits`, por workspace) e um órfão/não referenciado em HTML (`ai-admin.js/css`, orçamento em USD por empresa) |
| Jornada/horário/escala/férias/folga/ponto | **Inexistente** — nenhum vestígio no código |
| Pagamento/folha de salário | **Inexistente como folha de salário.** Existe um sistema completo de **bônus por pontos** (ciclos, ocorrências, fechamento), calculado no cliente, mais a cobrança de assinatura SaaS do workspace (setup fee + mensalidade) |

