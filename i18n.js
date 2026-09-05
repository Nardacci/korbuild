/* KORbuild i18n — UI-only translation layer.
   Data returned by the database is never translated.
   Languages: PT-BR / EN-US. Preference is persisted locally.
*/
(function(){
  'use strict';
  const DICT={
    'TEAM OPERATIONS PLATFORM':'PLATAFORMA DE OPERAÇÕES DE EQUIPE','WELCOME BACK':'BEM-VINDO DE VOLTA','Sign in':'Entrar','Access your company workspace.':'Acesse o workspace da sua empresa.','Email':'E-mail','Password':'Senha','New to KORbuild?':'Novo no KORbuild?','Create your workspace':'Criar seu workspace','Dashboard':'Dashboard','Overview of your current operational cycle and key performance indicators.':'Visão geral do seu ciclo operacional atual e dos principais indicadores de desempenho.','Workspace Setup':'Configuração do Workspace','CURRENT OPEN PERIOD':'PERÍODO ABERTO ATUAL','No open period':'Nenhum período aberto','View period details':'Ver detalhes do período','WORKSPACE HEALTH':'SAÚDE DO WORKSPACE','Complete your workspace':'Complete seu workspace',"These foundations are not required for setup, but you'll need them before running team operations.":'Essas bases não são obrigatórias para a configuração, mas serão necessárias antes de executar as operações da equipe.','Create your first team':'Crie sua primeira equipe','Organize your people before starting evaluations.':'Organize suas pessoas antes de iniciar as avaliações.','Create team →':'Criar equipe →','Add your people':'Adicione suas pessoas','Build your organization and prepare your first operational cycle.':'Estruture sua organização e prepare seu primeiro ciclo operacional.','Add people →':'Adicionar pessoas →','ATTENTION REQUIRED':'ATENÇÃO NECESSÁRIA','View all':'Ver todos','Pending evaluations':'Avaliações pendentes','Collaborators still need attention':'Colaboradores que ainda precisam de atenção','Review now →':'Revisar agora →','Prepare a period to start weekly operations':'Prepare um período para iniciar as operações semanais','Go to periods →':'Ir para períodos →','WEEKLY SNAPSHOT':'RESUMO SEMANAL','Eligible People':'Pessoas elegíveis','This period':'Neste período','Evaluated':'Avaliados','No data yet':'Ainda não há dados','Pending':'Pendentes','Total Occurrences':'Total de ocorrências','Teams':'Equipes','Active':'Ativas','PERFORMANCE OVERVIEW':'VISÃO GERAL DO DESEMPENHO','People':'Pessoas','High Performance':'Alto desempenho','On Track':'No ritmo esperado','Attention Needed':'Atenção necessária','Critical':'Crítico','View evaluations →':'Ver avaliações →','POINTS SUMMARY':'RESUMO DE PONTOS','Positive Points':'Pontos positivos','Negative Points':'Pontos negativos','View detailed analysis →':'Ver análise detalhada →','TOP POSITIVE PERFORMERS':'MELHORES DESEMPENHOS POSITIVOS','No positive movements in this period.':'Nenhum movimento positivo neste período.','ATTENTION NEEDED':'ATENÇÃO NECESSÁRIA','No negative movements in this period.':'Nenhum movimento negativo neste período.','QUICK ACTIONS':'AÇÕES RÁPIDAS','Manage Occurrences':'Gerenciar ocorrências','Configure evaluation events':'Configurar eventos de avaliação','Manage People':'Gerenciar pessoas','Add or edit collaborators':'Adicionar ou editar colaboradores','View Evaluations':'Ver avaliações','Browse current evaluations':'Consultar avaliações atuais','Open Settlement':'Abrir fechamento','Process period settlement':'Processar fechamento do período','KORbuild AI':'KORbuild AI','Your intelligent workspace assistant':'Seu assistente inteligente do workspace','Close':'Fechar','How can I help?':'Como posso ajudar?','I understand your workspace and can help you navigate, analyze and manage your work.':'Entendo seu workspace e posso ajudar você a navegar, analisar e gerenciar seu trabalho.','Dashboard context loaded':'Contexto do dashboard carregado','Operational insights':'Insights operacionais','Explain this dashboard':'Explique este dashboard','What requires my attention?':'O que requer minha atenção?','Summarize current performance':'Resuma o desempenho atual','Ask KORbuild AI...':'Pergunte ao KORbuild AI...','Send':'Enviar','Context-aware assistance':'Assistência com contexto','Evaluations':'Avaliações','Record occurrences for collaborators in the current open period.':'Registre ocorrências para colaboradores no período aberto atual.','Periods':'Períodos','Bonuses':'Bônus','Records':'Registros','Work Units':'Unidades de trabalho','Occurrences':'Ocorrências','Reports':'Relatórios','Sign out':'Sair','OPEN PERIOD':'PERÍODO ABERTO','Loading current period...':'Carregando período atual...','Search by person, work unit, team or specialty...':'Pesquisar por pessoa, unidade de trabalho, equipe ou especialidade...','PERSON':'PESSOA','WORK UNIT':'UNIDADE DE TRABALHO','TEAM':'EQUIPE','SPECIALTY / FUNCTION':'ESPECIALIDADE / FUNÇÃO','OCCURRENCES':'OCORRÊNCIAS','TOTAL':'TOTAL','No collaborators found':'Nenhum colaborador encontrado','There are no prepared collaborators for the current open period.':'Não há colaboradores preparados para o período aberto atual.','Back to collaborators':'Voltar para colaboradores','Collaborator':'Colaborador','Loading prepared occurrences...':'Carregando ocorrências preparadas...','YOUR FREE TRIAL':'SEU TESTE GRATUITO','Your KORbuild trial is active':'Seu teste do KORbuild está ativo','You have full access to KORbuild.':'Você tem acesso completo ao KORbuild.','days free':'dias grátis','Subscribe now →':'Assinar agora →',
    'Ends today':'Termina hoje','Ends in 1 day':'Termina em 1 dia','Ends in {n} days':'Termina em {n} dias','Period ends today':'O período termina hoje','Period ends tomorrow':'O período termina amanhã','Period ends in 1 day':'O período termina em 1 dia','Period ends in {n} days':'O período termina em {n} dias','Review all occurrences before settlement':'Revise todas as ocorrências antes do fechamento','Period ended':'Período encerrado','Review period settlement':'Revisar fechamento do período','Check evaluations before closing the cycle':'Verifique as avaliações antes de fechar o ciclo','Prepare your next evaluation period to start the operation.':'Prepare seu próximo período de avaliação para iniciar a operação.','No movements in this period.':'Nenhum movimento neste período.','6 of 6 days completed':'6 de 6 dias concluídos','day remaining':'dia restante','days remaining':'dias restantes','day free':'dia grátis','TRIAL ENDED · GRACE PERIOD':'TESTE ENCERRADO · PERÍODO DE TOLERÂNCIA','Your trial has ended, but KORbuild is still available.':'Seu teste terminou, mas o KORbuild continua disponível.','Choose a plan to keep your workspace active without interruption.':'Escolha um plano para manter seu workspace ativo sem interrupções.','Choose a plan →':'Escolha um plano →','TRIAL EXPIRED':'TESTE EXPIRADO','Your KORbuild trial has expired.':'Seu teste do KORbuild expirou.','Choose a plan to restore access to your workspace.':'Escolha um plano para restaurar o acesso ao seu workspace.','Explore the platform and build your workspace with full access.':'Explore a plataforma e estruture seu workspace com acesso completo.','View plans →':'Ver planos →'
  };
  const reverse=Object.fromEntries(Object.entries(DICT).map(([en,pt])=>[pt,en]));
  const KEY='korbuild-language';
  let lang=localStorage.getItem(KEY)||'en-US';

  const formatDate=value=>{
    const date=new Date(value+'T00:00:00');
    if(Number.isNaN(date.getTime()))return value;
    return new Intl.DateTimeFormat(lang==='pt-BR'?'pt-BR':'en-US',{month:'short',day:'numeric',year:'numeric'}).format(date);
  };

  const translateDynamic=value=>{
    if(!value)return value;
    if(lang==='en-US')return reverse[value]||value;
    if(DICT[value])return DICT[value];

    let m=value.match(/^Ends in (\d+) days?$/);
    if(m)return Number(m[1])===1?'Termina em 1 dia':`Termina em ${m[1]} dias`;
    m=value.match(/^Period ends in (\d+) days?$/);
    if(m)return Number(m[1])===1?'O período termina em 1 dia':`O período termina em ${m[1]} dias`;
    m=value.match(/^(\d+) of (\d+) days completed$/);
    if(m)return `${m[1]} de ${m[2]} dias concluídos`;
    m=value.match(/^Week (\d+) · (.+?) → (.+)$/);
    if(m)return `Semana ${m[1]} · ${formatDate(m[2])} → ${formatDate(m[3])}`;
    m=value.match(/^Week (\d+) · ([A-Z][a-z]{2} \d{1,2}, \d{4}) → ([A-Z][a-z]{2} \d{1,2}, \d{4})$/);
    if(m)return `Semana ${m[1]} · ${formatDate(m[2])} → ${formatDate(m[3])}`;
    m=value.match(/^Ends in (\d+) days?$/);
    if(m)return `Termina em ${m[1]} dias`;
    return value;
  };

  const translate=value=>translateDynamic(value);

  function installHeaderStyles(){
    if(document.getElementById('korbuild-i18n-header-styles'))return;
    const style=document.createElement('style');
    style.id='korbuild-i18n-header-styles';
    style.textContent='.dashboard-topbar .topbar-page-context,.page-topbar .topbar-page-context{margin-right:auto;min-width:0;display:flex;flex-direction:column;justify-content:center;gap:3px}.dashboard-topbar .topbar-page-context strong,.page-topbar .topbar-page-context strong{display:block;font-size:16px;line-height:1.15}.dashboard-topbar .topbar-page-context small,.page-topbar .topbar-page-context small{display:block;font-size:10px;line-height:1.25;color:var(--muted,#69778b)}.dashboard-topbar #korbuild-language-toggle,.page-topbar #korbuild-language-toggle{width:34px;height:34px;min-width:34px;flex:0 0 34px;padding:0;margin:0 10px 0 auto;border:1px solid #dfe4ec;border-radius:50%;background:#fff;display:grid;place-items:center;cursor:pointer;box-shadow:0 2px 8px rgba(28,42,64,.06);transition:transform .15s,box-shadow .15s}#korbuild-language-toggle:hover{transform:translateY(-1px);box-shadow:0 5px 12px rgba(28,42,64,.12)}#korbuild-language-toggle:focus-visible{outline:2px solid var(--accent,#635bff);outline-offset:2px}.kor-ai-panel{z-index:1001!important}';
    document.head.appendChild(style);
  }

  function translateNode(node){
    if(node.nodeType===Node.TEXT_NODE){
      const original=node.nodeValue,trimmed=original.trim();
      if(trimmed){
        const translated=translate(trimmed);
        if(translated!==trimmed)node.nodeValue=original.replace(trimmed,translated);
      }
      return;
    }
    if(node.nodeType!==Node.ELEMENT_NODE)return;
    ['placeholder','title','aria-label'].forEach(attr=>{
      const value=node.getAttribute(attr);
      if(value){const translated=translate(value);if(translated!==value)node.setAttribute(attr,translated);}
    });
    node.childNodes.forEach(translateNode);
  }

  function flagSvg(country){
    if(country==='US')return '<svg viewBox="0 0 28 20" width="20" height="14" aria-hidden="true" focusable="false"><rect width="28" height="20" rx="2" fill="#fff"/><path d="M0 1h28v2H0zm0 4h28v2H0zm0 4h28v2H0zm0 4h28v2H0zm0 4h28v1H0z" fill="#c81e2b"/><path d="M0 0h12v11H0z" fill="#244a86"/><g fill="#fff"><circle cx="2" cy="2" r=".55"/><circle cx="5" cy="2" r=".55"/><circle cx="8" cy="2" r=".55"/><circle cx="11" cy="2" r=".55"/><circle cx="3.5" cy="4.5" r=".55"/><circle cx="6.5" cy="4.5" r=".55"/><circle cx="9.5" cy="4.5" r=".55"/><circle cx="2" cy="7" r=".55"/><circle cx="5" cy="7" r=".55"/><circle cx="8" cy="7" r=".55"/><circle cx="11" cy="7" r=".55"/><circle cx="3.5" cy="9.5" r=".55"/><circle cx="6.5" cy="9.5" r=".55"/><circle cx="9.5" cy="9.5" r=".55"/></g></svg>';
    return '<svg viewBox="0 0 28 20" width="20" height="14" aria-hidden="true" focusable="false"><rect width="28" height="20" rx="2" fill="#6dbb45"/><path d="M14 2.5 25 10 14 17.5 3 10z" fill="#ffd84d"/><circle cx="14" cy="10" r="3.3" fill="#2854a0"/><path d="M10.9 10.1c2.2-.8 4.7-.4 6.3.8" fill="none" stroke="#fff" stroke-width=".7"/></svg>';
  }

  function updateToggle(){
    let btn=document.getElementById('korbuild-language-toggle');
    if(!btn){
      btn=document.createElement('button');btn.id='korbuild-language-toggle';btn.type='button';
      const target=document.querySelector('.topbar .user-menu-wrap')||document.querySelector('.topbar');
      if(target)target.parentNode.insertBefore(btn,target);else document.body.appendChild(btn);
      btn.addEventListener('click',()=>{lang=lang==='pt-BR'?'en-US':'pt-BR';localStorage.setItem(KEY,lang);location.reload();});
    }
    btn.innerHTML=flagSvg(lang==='pt-BR'?'US':'BR');
    btn.setAttribute('aria-label',lang==='pt-BR'?'Switch to English':'Mudar para português');
    btn.title=lang==='pt-BR'?'English':'Português (Brasil)';
  }

  let observerTimer=null;
  function scheduleDynamicTranslation(){
    clearTimeout(observerTimer);
    observerTimer=setTimeout(()=>translateNode(document.body),0);
  }

  function apply(){
    document.documentElement.lang=lang==='pt-BR'?'pt-BR':'en';
    installHeaderStyles();
    translateNode(document.documentElement);
    updateToggle();
  }

  window.KORbuildI18n={get language(){return lang;},setLanguage(v){if(v==='pt-BR'||v==='en-US'){lang=v;localStorage.setItem(KEY,v);location.reload();}},t:translate,apply};

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',apply);else apply();
  new MutationObserver(scheduleDynamicTranslation).observe(document.body,{childList:true,subtree:true});
})();