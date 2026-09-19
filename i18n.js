/* KORbuild i18n — UI-only translation layer.
   Data returned by the database is never translated.
   Languages: PT-BR / EN-US. Preference is persisted locally.
*/
(function () {
  "use strict";

  const DICT = {
    "TEAM OPERATIONS PLATFORM": "PLATAFORMA DE OPERAÇÕES DE EQUIPE",
    "WELCOME BACK": "BEM-VINDO DE VOLTA",
    "Sign in": "Entrar",
    "Access your company workspace.": "Acesse o workspace da sua empresa.",
    "Email": "E-mail",
    "Password": "Senha",
    "New to KORbuild?": "Novo no KORbuild?",
    "Create your workspace": "Criar seu workspace",
    "Dashboard": "Dashboard",
    "Overview of your current operational cycle and key performance indicators.": "Visão geral do seu ciclo operacional atual e dos principais indicadores de desempenho.",
    "Workspace Setup": "Configuração do Workspace",
    "CURRENT OPEN PERIOD": "PERÍODO ABERTO ATUAL",
    "No open period": "Nenhum período aberto",
    "View period details": "Ver detalhes do período",
    "WORKSPACE HEALTH": "SAÚDE DO WORKSPACE",
    "Complete your workspace": "Complete seu workspace",
    "These foundations are not required for setup, but you'll need them before running team operations.": "Essas bases não são obrigatórias para a configuração, mas serão necessárias antes de executar as operações da equipe.",
    "Create your first team": "Crie sua primeira equipe",
    "Organize your people before starting evaluations.": "Organize suas pessoas antes de iniciar as avaliações.",
    "Create team →": "Criar equipe →",
    "Add your people": "Adicione suas pessoas",
    "Build your organization and prepare your first operational cycle.": "Estruture sua organização e prepare seu primeiro ciclo operacional.",
    "Add people →": "Adicionar pessoas →",
    "ATTENTION REQUIRED": "ATENÇÃO NECESSÁRIA",
    "View all": "Ver todos",
    "Pending evaluations": "Avaliações pendentes",
    "Collaborators still need attention": "Colaboradores que ainda precisam de atenção",
    "Review now →": "Revisar agora →",
    "Prepare a period to start weekly operations": "Prepare um período para iniciar as operações semanais",
    "Go to periods →": "Ir para períodos →",
    "WEEKLY SNAPSHOT": "RESUMO SEMANAL",
    "Eligible People": "Pessoas elegíveis",
    "This period": "Neste período",
    "Evaluated": "Avaliados",
    "No data yet": "Ainda não há dados",
    "Pending": "Pendentes",
    "Total Occurrences": "Total de ocorrências",
    "Teams": "Equipes",
    "Active": "Ativas",
    "PERFORMANCE OVERVIEW": "VISÃO GERAL DO DESEMPENHO",
    "People": "Pessoas",
    "High Performance": "Alto desempenho",
    "On Track": "No ritmo esperado",
    "Attention Needed": "Atenção necessária",
    "Critical": "Crítico",
    "View evaluations →": "Ver avaliações →",
    "POINTS SUMMARY": "RESUMO DE PONTOS",
    "Positive Points": "Pontos positivos",
    "Negative Points": "Pontos negativos",
    "View detailed analysis →": "Ver análise detalhada →",
    "TOP POSITIVE PERFORMERS": "MELHORES DESEMPENHOS POSITIVOS",
    "No positive movements in this period.": "Nenhum movimento positivo neste período.",
    "ATTENTION NEEDED": "ATENÇÃO NECESSÁRIA",
    "No negative movements in this period.": "Nenhum movimento negativo neste período.",
    "QUICK ACTIONS": "AÇÕES RÁPIDAS",
    "Manage Occurrences": "Gerenciar ocorrências",
    "Configure evaluation events": "Configurar eventos de avaliação",
    "Manage People": "Gerenciar pessoas",
    "Add or edit collaborators": "Adicionar ou editar colaboradores",
    "View Evaluations": "Ver avaliações",
    "Browse current evaluations": "Consultar avaliações atuais",
    "Open Settlement": "Abrir fechamento",
    "Process period settlement": "Processar fechamento do período",
    "KORbuild AI": "KORbuild AI",
    "Your intelligent workspace assistant": "Seu assistente inteligente do workspace",
    "Close": "Fechar",
    "How can I help?": "Como posso ajudar?",
    "I understand your workspace and can help you navigate, analyze and manage your work.": "Entendo seu workspace e posso ajudar você a navegar, analisar e gerenciar seu trabalho.",
    "Dashboard context loaded": "Contexto do dashboard carregado",
    "Operational insights": "Insights operacionais",
    "Explain this dashboard": "Explique este dashboard",
    "What requires my attention?": "O que requer minha atenção?",
    "Summarize current performance": "Resuma o desempenho atual",
    "Ask KORbuild AI...": "Pergunte ao KORbuild AI...",
    "Send": "Enviar",
    "Context-aware assistance": "Assistência com contexto",
    "Evaluations": "Avaliações",
    "Record occurrences for collaborators in the current open period.": "Registre ocorrências para colaboradores no período aberto atual.",
    "Periods": "Períodos",
    "Bonuses": "Bônus",
    "Records": "Registros",
    "Work Units": "Unidades de trabalho",
    "Occurrences": "Ocorrências",
    "Reports": "Relatórios",
    "Sign out": "Sair",
    "OPEN PERIOD": "PERÍODO ABERTO",
    "Loading current period...": "Carregando período atual...",
    "Search by person, work unit, team or specialty...": "Pesquisar por pessoa, unidade de trabalho, equipe ou especialidade...",
    "PERSON": "PESSOA",
    "WORK UNIT": "UNIDADE DE TRABALHO",
    "TEAM": "EQUIPE",
    "SPECIALTY / FUNCTION": "ESPECIALIDADE / FUNÇÃO",
    "OCCURRENCES": "OCORRÊNCIAS",
    "TOTAL": "TOTAL",
    "No collaborators found": "Nenhum colaborador encontrado",
    "There are no prepared collaborators for the current open period.": "Não há colaboradores preparados para o período aberto atual.",
    "Back to collaborators": "Voltar para colaboradores",
    "Collaborator": "Colaborador",
    "Loading prepared occurrences...": "Carregando ocorrências preparadas...",
    "YOUR FREE TRIAL": "SEU TESTE GRATUITO",
    "Your KORbuild trial is active": "Seu teste do KORbuild está ativo",
    "You have full access to KORbuild.": "Você tem acesso completo ao KORbuild.",
    "days free": "dias grátis",
    "Subscribe now →": "Assinar agora →",
    "Ends today": "Termina hoje",
    "Ends in 1 day": "Termina em 1 dia",
    "Ends in {n} days": "Termina em {n} dias",
    "Period ends today": "O período termina hoje",
    "Period ends tomorrow": "O período termina amanhã",
    "Period ends in 1 day": "O período termina em 1 dia",
    "Period ends in {n} days": "O período termina em {n} dias",
    "Review all occurrences before settlement": "Revise todas as ocorrências antes do fechamento",
    "Period ended": "Período encerrado",
    "Review period settlement": "Revisar fechamento do período",
    "Check evaluations before closing the cycle": "Verifique as avaliações antes de fechar o ciclo",
    "Prepare your next evaluation period to start the operation.": "Prepare seu próximo período de avaliação para iniciar a operação.",
    "No movements in this period.": "Nenhum movimento neste período.",
    "6 of 6 days completed": "6 de 6 dias concluídos",
    "day remaining": "dia restante",
    "days remaining": "dias restantes",
    "day free": "dia grátis",
    "SETUP COMPLETE": "CONFIGURAÇÃO CONCLUÍDA",
    "Your setup is complete.": "Sua configuração está concluída.",
    "Your monthly subscription begins soon.": "Sua assinatura mensal começa em breve.",
    "View billing →": "Ver cobrança →",
    "SUBSCRIPTION ACTIVE": "ASSINATURA ATIVA",
    "Your monthly subscription is active.": "Sua assinatura mensal está ativa.",
    "Your KORbuild workspace has full access.": "Seu workspace do KORbuild tem acesso completo.",
    "active": "ativa",
    "PAYMENT FAILED": "PAGAMENTO FALHOU",
    "ACCESS PAUSED": "ACESSO PAUSADO",
    "Your last payment failed.": "Seu último pagamento falhou.",
    "Update your payment to avoid losing access to your workspace.": "Atualize seu pagamento para não perder o acesso ao seu workspace.",
    "Your KORbuild access is paused.": "Seu acesso ao KORbuild está pausado.",
    "Update your payment to restore access to your workspace.": "Atualize seu pagamento para restaurar o acesso ao seu workspace.",
    "payment required": "pagamento necessário",
    "Update payment →": "Atualizar pagamento →",
    "TRIAL ENDED · GRACE PERIOD": "TESTE ENCERRADO · PERÍODO DE TOLERÂNCIA",
    "Your trial has ended, but KORbuild is still available.": "Seu teste terminou, mas o KORbuild continua disponível.",
    "Choose a plan to keep your workspace active without interruption.": "Escolha um plano para manter seu workspace ativo sem interrupções.",
    "Choose a plan →": "Escolha um plano →",
    "TRIAL EXPIRED": "TESTE EXPIRADO",
    "Your KORbuild trial has expired.": "Seu teste do KORbuild expirou.",
    "Choose a plan to restore access to your workspace.": "Escolha um plano para restaurar o acesso ao seu workspace.",
    "Explore the platform and build your workspace with full access.": "Explore a plataforma e estruture seu workspace com acesso completo.",
    "View plans →": "Ver planos →",
    "Let's get your workspace ready.": "Vamos preparar seu workspace.",
    "We’ll configure the essentials before you start your first evaluation cycle.": "Vamos configurar o essencial antes de você iniciar seu primeiro ciclo de avaliação.",
    "We'll configure the essentials before you start your first evaluation cycle.": "Vamos configurar o essencial antes de você iniciar seu primeiro ciclo de avaliação.",
    "of 5": "de 5",
    "Company": "Empresa",
    "Evaluation": "Avaliação",
    "Bonus Cycle": "Ciclo de Bônus",
    "Evaluation Period": "Período de Avaliação",
    "Review": "Revisão",
    "STEP 1 · COMPANY": "ETAPA 1 · EMPRESA",
    "Tell us about your company.": "Conte-nos sobre sua empresa.",
    "This creates your KORbuild workspace. You can review and expand these details later.": "Isso cria seu workspace KORbuild. Você poderá revisar e ampliar esses dados depois.",
    "Company name": "Nome da empresa",
    "Your company": "Sua empresa",
    "The name of your KORbuild workspace.": "O nome do seu workspace KORbuild.",
    "Owner name": "Nome do responsável",
    "Your full name": "Seu nome completo",
    "The primary owner of this workspace.": "O responsável principal por este workspace.",
    "Your company workspace is created only after you confirm this step. Until then, your account remains independent and no company is provisioned.": "O workspace da sua empresa só será criado depois que você confirmar esta etapa. Até lá, sua conta permanece independente e nenhuma empresa é provisionada.",
    "STEP 2 · EVALUATION": "ETAPA 2 · AVALIAÇÃO",
    "How should KORbuild score your team?": "Como o KORbuild deve pontuar sua equipe?",
    "Define the starting points and the financial value represented by each point.": "Defina os pontos iniciais e o valor financeiro representado por cada ponto.",
    "Starting points per employee": "Pontos iniciais por colaborador",
    "Points assigned when the first Bonus Cycle is opened.": "Pontos atribuídos quando o primeiro Ciclo de Bônus for aberto.",
    "Value per point": "Valor por ponto",
    "Amount in USD represented by one point.": "Valor em USD representado por um ponto.",
    "STEP 3 · BONUS CYCLE": "ETAPA 3 · CICLO DE BÔNUS",
    "Define your Bonus Cycle.": "Defina seu Ciclo de Bônus.",
    "Cycle name": "Nome do ciclo",
    "Name this Bonus Cycle.": "Dê um nome a este Ciclo de Bônus.",
    "Year": "Ano",
    "Start month": "Mês inicial",
    "End month": "Mês final",
    "STEP 4 · EVALUATION PERIOD": "ETAPA 4 · PERÍODO DE AVALIAÇÃO",
    "Define your Evaluation Periods.": "Defina seus Períodos de Avaliação.",
    "Frequency": "Frequência",
    "Every 2 weeks": "A cada 2 semanas",
    "Monthly": "Mensal",
    "Weekly": "Semanal",
    "Period starts": "Início do período",
    "Period ends": "Fim do período",
    "Manual": "Manual",
    "Automatic": "Automático",
    "STEP 5 · REVIEW & CONFIRM": "ETAPA 5 · REVISÃO E CONFIRMAÇÃO",
    "Review your configuration.": "Revise sua configuração.",
    "Back": "Voltar",
    "Save & Continue": "Salvar e continuar",
    "Confirm & Start KORbuild": "Confirmar e iniciar KORbuild",
    "Setup completed": "Configuração concluída",
    "Saving...": "Salvando...",
    "Please try again.": "Tente novamente.",
    "Unable to load workspace setup.": "Não foi possível carregar a configuração do workspace.",
    "Sunday": "Domingo",
    "Monday": "Segunda-feira",
    "Tuesday": "Terça-feira",
    "Wednesday": "Quarta-feira",
    "Thursday": "Quinta-feira",
    "Friday": "Sexta-feira",
    "Saturday": "Sábado",
    "January": "Janeiro",
    "February": "Fevereiro",
    "March": "Março",
    "April": "Abril",
    "May": "Maio",
    "June": "Junho",
    "July": "Julho",
    "August": "Agosto",
    "September": "Setembro",
    "October": "Outubro",
    "November": "Novembro",
    "December": "Dezembro",
    "Schedule": "Escalas",
    "Payroll": "Folha de Pagamento",
    "Weekly Payments": "Pagamentos Semanais",
    "Payroll Settings": "Configurações de Folha",
    "Customer Service": "Atendimento ao Cliente",
    "Calendar": "Calendário",
    "Clients": "Clientes",
    "Reminders": "Lembretes",
    "Manage shifts, vacation, time off and commitments for your people.": "Gerencie turnos, férias, folgas e compromissos da sua equipe.",
    "PENDING APPROVAL": "AGUARDANDO APROVAÇÃO",
    "Entries waiting on an admin decision": "Registros aguardando decisão de um administrador",
    "THIS WEEK": "ESTA SEMANA",
    "Entries overlapping the selected range": "Registros que cruzam o período selecionado",
    "Entries in the selected range": "Registros no período selecionado",
    "Search by person...": "Buscar por pessoa...",
    "All people": "Todas as pessoas",
    "All status": "Todos os status",
    "Approved": "Aprovado",
    "Rejected": "Rejeitado",
    "Confirmed": "Confirmado",
    "From": "De",
    "To": "Até",
    "+ New Entry": "+ Novo Registro",
    "TYPE": "TIPO",
    "DATE RANGE": "PERÍODO",
    "TIME": "HORÁRIO",
    "STATUS": "STATUS",
    "No Schedule entries": "Nenhum registro de escala",
    "Create the first shift, vacation, day off or commitment for this range.": "Crie o primeiro turno, férias, folga ou compromisso para este período.",
    "Approve": "Aprovar",
    "Reject": "Rejeitar",
    "Unable to load workspace profile.": "Não foi possível carregar o perfil do workspace.",
    "Unable to update this entry.": "Não foi possível atualizar este registro.",
    "Entry approved.": "Registro aprovado.",
    "Entry rejected.": "Registro rejeitado.",
    "Unable to load Schedule.": "Não foi possível carregar as Escalas.",
    "New Schedule Entry": "Novo Registro de Escala",
    "Request a shift, vacation, day off or commitment for a person.": "Solicite um turno, férias, folga ou compromisso para uma pessoa.",
    "Person *": "Pessoa *",
    "Type *": "Tipo *",
    "Start date *": "Data de início *",
    "End date *": "Data de término *",
    "Start time": "Hora de início",
    "End time": "Hora de término",
    "Notes": "Observações",
    "Additional context for the approver, if any.": "Contexto adicional para quem for aprovar, se houver.",
    "This type requires admin approval before it becomes active.": "Este tipo exige aprovação de um administrador antes de ficar ativo.",
    "Cancel": "Cancelar",
    "Save Entry": "Salvar Registro",
    "Select a person": "Selecionar uma pessoa",
    "Select a type": "Selecionar um tipo",
    "Person, type and date range are required.": "Pessoa, tipo e período são obrigatórios.",
    "End date must be on or after the start date.": "A data de término deve ser igual ou posterior à data de início.",
    "Schedule entry created successfully.": "Registro de escala criado com sucesso.",
    "We couldn't save this entry.": "Não foi possível salvar este registro.",
    "Unable to load form options.": "Não foi possível carregar as opções do formulário.",
    "Configure the weekly boundaries used to calculate employee payments.": "Configure os limites semanais usados para calcular os pagamentos dos colaboradores.",
    "Week start day *": "Dia de início da semana *",
    "Standard hours / week *": "Horas padrão / semana *",
    "Overtime multiplier *": "Multiplicador de hora extra *",
    "Back to Weekly Payments": "Voltar para Pagamentos Semanais",
    "Save Settings": "Salvar Configurações",
    "Standard hours per week must be greater than zero.": "As horas padrão por semana devem ser maiores que zero.",
    "Overtime multiplier must be 1 or greater.": "O multiplicador de hora extra deve ser 1 ou maior.",
    "Payroll settings updated successfully.": "Configurações de folha atualizadas com sucesso.",
    "We couldn't save these settings.": "Não foi possível salvar estas configurações.",
    "Unable to load payroll settings.": "Não foi possível carregar as configurações de folha.",
    "Review the automatic calculation and register each collaborator's weekly payment.": "Revise o cálculo automático e registre o pagamento semanal de cada colaborador.",
    "Week starting": "Semana a partir de",
    "↻ Recalculate all": "↻ Recalcular tudo",
    "PEOPLE": "PESSOAS",
    "Active people in this workspace": "Pessoas ativas neste workspace",
    "MISSING RATE": "SEM VALOR/HORA",
    "Without an hourly rate registered": "Sem valor por hora registrado",
    "TOTAL NET": "TOTAL LÍQUIDO",
    "Sum of net pay for this week": "Soma do valor líquido desta semana",
    "HOURS": "HORAS",
    "RATE / HR": "VALOR/HORA",
    "GROSS": "BRUTO",
    "ADVANCE": "ADIANTAMENTO",
    "NET": "LÍQUIDO",
    "No active people": "Nenhuma pessoa ativa",
    "Add active people to this workspace before registering payments.": "Adicione pessoas ativas a este workspace antes de registrar pagamentos.",
    "No hourly rate registered": "Sem valor por hora registrado",
    "Register an hourly rate for this person before calculating a payment.": "Registre um valor por hora para esta pessoa antes de calcular um pagamento.",
    "$/hr": "$/h",
    "Set rate": "Definir valor",
    "Update": "Atualizar",
    "Register": "Registrar",
    "Unable to recalculate.": "Não foi possível recalcular.",
    "Enter a valid hourly rate.": "Informe um valor por hora válido.",
    "Unable to register the hourly rate.": "Não foi possível registrar o valor por hora.",
    "Hourly rate registered.": "Valor por hora registrado.",
    "Unable to register this payment.": "Não foi possível registrar este pagamento.",
    "Payment registered for": "Pagamento registrado para",
    "Unable to load Weekly Payments.": "Não foi possível carregar os Pagamentos Semanais.",
    "Customer Calendar": "Calendário de Clientes",
    "Drag an appointment to a new time to reschedule it.": "Arraste um agendamento para um novo horário para reagendá-lo.",
    "All collaborators": "Todos os colaboradores",
    "+ New Appointment": "+ Novo Agendamento",
    "Appointment": "Agendamento",
    "Client": "Cliente",
    "Service": "Serviço",
    "When": "Quando",
    "Status": "Status",
    "Cancel Appointment": "Cancelar Agendamento",
    "Unable to load appointments.": "Não foi possível carregar os agendamentos.",
    "Couldn't move this appointment.": "Não foi possível mover este agendamento.",
    "Appointment moved successfully.": "Agendamento reagendado com sucesso.",
    "Unable to cancel this appointment.": "Não foi possível cancelar este agendamento.",
    "Appointment cancelled.": "Agendamento cancelado.",
    "Cancel this appointment?": "Cancelar este agendamento?",
    "Unable to load the calendar.": "Não foi possível carregar o calendário.",
    "New Appointment": "Novo Agendamento",
    "Book a service appointment for a client.": "Agende um atendimento de serviço para um cliente.",
    "Client *": "Cliente *",
    "+ New client": "+ Novo cliente",
    "Name *": "Nome *",
    "Email *": "E-mail *",
    "Phone": "Telefone",
    "Service *": "Serviço *",
    "+ New service": "+ Novo serviço",
    "Duration (minutes) *": "Duração (minutos) *",
    "Default price *": "Preço padrão *",
    "Collaborator *": "Colaborador *",
    "Date *": "Data *",
    "Start time *": "Hora de início *",
    "End time *": "Hora de término *",
    "Save Appointment": "Salvar Agendamento",
    "Select a client": "Selecionar um cliente",
    "Select a service": "Selecionar um serviço",
    "Select a collaborator": "Selecionar um colaborador",
    "Use existing client": "Usar cliente existente",
    "Use existing service": "Usar serviço existente",
    "New client name and email are required.": "Nome e e-mail do novo cliente são obrigatórios.",
    "Select a client or create a new one.": "Selecione um cliente ou crie um novo.",
    "New service name is required.": "O nome do novo serviço é obrigatório.",
    "New service duration must be greater than zero.": "A duração do novo serviço deve ser maior que zero.",
    "New service price must be zero or greater.": "O preço do novo serviço deve ser zero ou maior.",
    "Select a service or create a new one.": "Selecione um serviço ou crie um novo.",
    "Collaborator, date and time are required.": "Colaborador, data e horário são obrigatórios.",
    "End time must be after the start time.": "O horário de término deve ser depois do horário de início.",
    "Appointment booked successfully.": "Agendamento realizado com sucesso.",
    "We couldn't save this appointment.": "Não foi possível salvar este agendamento.",
    "Manage the customers you book service appointments for.": "Gerencie os clientes para os quais você agenda atendimentos.",
    "CLIENTS": "CLIENTES",
    "Customers registered in this workspace": "Clientes cadastrados neste workspace",
    "Search by name or email...": "Buscar por nome ou e-mail...",
    "+ Add Client": "+ Adicionar Cliente",
    "NAME": "NOME",
    "EMAIL": "E-MAIL",
    "PHONE": "TELEFONE",
    "CREATED": "CRIADO",
    "No clients yet": "Nenhum cliente ainda",
    "Add your first client before scheduling an appointment.": "Adicione seu primeiro cliente antes de agendar um atendimento.",
    "Edit": "Editar",
    "Unable to load clients.": "Não foi possível carregar os clientes.",
    "New Client": "Novo Cliente",
    "Edit Client": "Editar Cliente",
    "Keep the contact details used for appointments and reminders.": "Mantenha os dados de contato usados para agendamentos e lembretes.",
    "e.g. Jane Cooper": "ex.: Maria Silva",
    "Address": "Endereço",
    "e.g. +1 555 0100": "ex.: +1 555 0100",
    "Optional": "Opcional",
    "Save Client": "Salvar Cliente",
    "Client not found.": "Cliente não encontrado.",
    "Name is required.": "O nome é obrigatório.",
    "Email is required.": "O e-mail é obrigatório.",
    "Client updated successfully.": "Cliente atualizado com sucesso.",
    "Client added successfully.": "Cliente adicionado com sucesso.",
    "We couldn't save this client.": "Não foi possível salvar este cliente.",
    "Save Changes": "Salvar Alterações",
    "Reminder Settings": "Configurações de Lembrete",
    "Configure the automatic email sent to clients before their appointment.": "Configure o e-mail automático enviado aos clientes antes do atendimento.",
    "Channel *": "Canal *",
    "SMS (coming soon)": "SMS (em breve)",
    "WhatsApp (coming soon)": "WhatsApp (em breve)",
    "Send hours before *": "Enviar horas antes *",
    "Enabled": "Ativado",
    "Email subject *": "Assunto do e-mail *",
    "Email body *": "Corpo do e-mail *",
    "Available variables:": "Variáveis disponíveis:",
    "Back to Calendar": "Voltar para o Calendário",
    "PREVIEW": "PRÉVIA",
    "Send hours before must be greater than zero.": "As horas de antecedência para envio devem ser maiores que zero.",
    "Email subject and body are required.": "Assunto e corpo do e-mail são obrigatórios.",
    "Reminder settings updated successfully.": "Configurações de lembrete atualizadas com sucesso.",
    "Unable to load reminder settings.": "Não foi possível carregar as configurações de lembrete.",
    "Collaborators": "Colaboradores",
    "Bonus": "Bônus",
    "Payment": "Pagamento",
    "Bonus Settlement": "Fechamento de Bônus",
    "Collaborator Movement": "Movimentação de Colaboradores"
  };

  const reverse = Object.fromEntries(Object.entries(DICT).map(([en, pt]) => [pt, en]));
  const KEY = "korbuild-language";
  let lang = localStorage.getItem(KEY) || "en-US";

  function formatDate(value) {
    const raw = String(value || "").trim();
    const date = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(raw + "T00:00:00") : new Date(raw);
    if (Number.isNaN(date.getTime())) return raw;
    return new Intl.DateTimeFormat(lang === "pt-BR" ? "pt-BR" : "en-US", { month: "short", day: "numeric", year: "numeric" }).format(date);
  }

  function translateDynamic(value) {
    if (!value) return value;
    if (lang === "en-US") return reverse[value] || value;
    if (DICT[value]) return DICT[value];
    let m = value.match(/^Ends in (\d+) days?$/);
    if (m) return Number(m[1]) === 1 ? "Termina em 1 dia" : `Termina em ${m[1]} dias`;
    m = value.match(/^Period ends in (\d+) days?$/);
    if (m) return Number(m[1]) === 1 ? "O período termina em 1 dia" : `O período termina em ${m[1]} dias`;
    m = value.match(/^(\d+) of (\d+) days completed$/);
    if (m) return `${m[1]} de ${m[2]} dias concluídos`;
    m = value.match(/^Week (\d+) · (.+?) → (.+)$/);
    if (m) return `Semana ${m[1]} · ${formatDate(m[2])} → ${formatDate(m[3])}`;
    return value;
  }

  function installHeaderStyles() {
    if (document.getElementById("korbuild-i18n-header-styles")) return;
    const style = document.createElement("style");
    style.id = "korbuild-i18n-header-styles";
    style.textContent = `.dashboard-topbar .topbar-page-context,.page-topbar .topbar-page-context{margin-right:auto;min-width:0;display:flex;flex-direction:column;justify-content:center;gap:3px}.dashboard-topbar .topbar-page-context strong,.page-topbar .topbar-page-context strong{display:block;font-size:16px;line-height:1.15}.dashboard-topbar .topbar-page-context small,.page-topbar .topbar-page-context small{display:block;font-size:10px;line-height:1.25;color:var(--muted,#69778b)}.dashboard-topbar #korbuild-language-toggle,.page-topbar #korbuild-language-toggle{width:34px;height:34px;min-width:34px;flex:0 0 34px;padding:0;margin:0 10px 0 auto;border:1px solid #dfe4ec;border-radius:50%;background:#fff;display:grid;place-items:center;cursor:pointer;box-shadow:0 2px 8px rgba(28,42,64,.06);transition:transform .15s,box-shadow .15s}#korbuild-language-toggle:hover{transform:translateY(-1px);box-shadow:0 5px 12px rgba(28,42,64,.12)}#korbuild-language-toggle:focus-visible{outline:2px solid var(--accent,#635bff);outline-offset:2px}.kor-ai-panel{z-index:1001!important}`;
    document.head.appendChild(style);
  }

  function translateNode(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const original = node.nodeValue;
      const trimmed = original.trim();
      if (trimmed) {
        const translated = translateDynamic(trimmed);
        if (translated !== trimmed) node.nodeValue = original.replace(trimmed, translated);
      }
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    ["placeholder", "title", "aria-label"].forEach(attr => {
      const value = node.getAttribute(attr);
      if (value) {
        const translated = translateDynamic(value);
        if (translated !== value) node.setAttribute(attr, translated);
      }
    });
    node.childNodes.forEach(translateNode);
  }

  function flagSvg(country) {
    if (country === "US") return '<svg viewBox="0 0 28 20" width="20" height="14" aria-hidden="true" focusable="false"><rect width="28" height="20" rx="2" fill="#fff"/><path d="M0 1h28v2H0zm0 4h28v2H0zm0 4h28v2H0zm0 4h28v2H0zm0 4h28v1H0z" fill="#c81e2b"/><path d="M0 0h12v11H0z" fill="#244a86"/><g fill="#fff"><circle cx="2" cy="2" r=".55"/><circle cx="5" cy="2" r=".55"/><circle cx="8" cy="2" r=".55"/><circle cx="11" cy="2" r=".55"/><circle cx="3.5" cy="4.5" r=".55"/><circle cx="6.5" cy="4.5" r=".55"/><circle cx="9.5" cy="4.5" r=".55"/><circle cx="2" cy="7" r=".55"/><circle cx="5" cy="7" r=".55"/><circle cx="8" cy="7" r=".55"/><circle cx="11" cy="7" r=".55"/><circle cx="3.5" cy="9.5" r=".55"/><circle cx="6.5" cy="9.5" r=".55"/><circle cx="9.5" cy="9.5" r=".55"/><circle cx="12" cy="9.5" r=".55"/></g></svg>';
    return '<svg viewBox="0 0 28 20" width="20" height="14" aria-hidden="true" focusable="false"><rect width="28" height="20" rx="2" fill="#6dbb45"/><path d="M14 2.5 25 10 14 17.5 3 10z" fill="#ffd84d"/><circle cx="14" cy="10" r="3.3" fill="#2854a0"/><path d="M10.9 10.1c2.2-.8 4.7-.4 6.3.8" fill="none" stroke="#fff" stroke-width=".7"/></svg>';
  }

  function updateToggle() {
    let btn = document.getElementById("korbuild-language-toggle");
    if (!btn) {
      btn = document.createElement("button");
      btn.id = "korbuild-language-toggle";
      btn.type = "button";
      const target = document.querySelector(".topbar .user-menu-wrap") || document.querySelector(".topbar");
      if (target) target.parentNode.insertBefore(btn, target);
      else document.body.appendChild(btn);
      btn.addEventListener("click", () => {
        lang = lang === "pt-BR" ? "en-US" : "pt-BR";
        localStorage.setItem(KEY, lang);
        location.reload();
      });
    }
    btn.innerHTML = flagSvg(lang === "pt-BR" ? "US" : "BR");
    btn.setAttribute("aria-label", lang === "pt-BR" ? "Switch to English" : "Mudar para português");
    btn.title = lang === "pt-BR" ? "English" : "Português (Brasil)";
  }

  let observerTimer = null;
  function scheduleDynamicTranslation() {
    clearTimeout(observerTimer);
    observerTimer = setTimeout(() => translateNode(document.body), 0);
  }

  function apply() {
    document.documentElement.lang = lang === "pt-BR" ? "pt-BR" : "en";
    installHeaderStyles();
    translateNode(document.documentElement);
    updateToggle();
  }

  window.KORbuildI18n = {
    get language() { return lang; },
    setLanguage(v) {
      if (v === "pt-BR" || v === "en-US") {
        lang = v;
        localStorage.setItem(KEY, v);
        location.reload();
      }
    },
    t: translateDynamic,
    apply
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", apply);
  else apply();

  new MutationObserver(scheduleDynamicTranslation).observe(document.body, { childList: true, subtree: true, characterData: true });
})();
