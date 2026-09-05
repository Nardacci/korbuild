/* KORbuild i18n — UI-only translation layer.
   Data returned by the database is never translated.
   Default language: EN-US. Preference is persisted locally.
*/
(function(){
  'use strict';
  const DICT = {
    'TEAM OPERATIONS PLATFORM': 'PLATAFORMA DE OPERAÇÕES DE EQUIPE',
    'WELCOME BACK': 'BEM-VINDO DE VOLTA',
    'Sign in': 'Entrar',
    'Access your company workspace.': 'Acesse o workspace da sua empresa.',
    'Email': 'E-mail',
    'Password': 'Senha',
    'Sign in': 'Entrar',
    'New to KORbuild?': 'Novo no KORbuild?',
    'Create your workspace': 'Criar seu workspace',
    'Dashboard': 'Dashboard',
    'Overview of your current operational cycle and key performance indicators.': 'Visão geral do seu ciclo operacional atual e dos principais indicadores de desempenho.',
    'Workspace Setup': 'Configuração do Workspace',
    'CURRENT OPEN PERIOD': 'PERÍODO ABERTO ATUAL',
    'No open period': 'Nenhum período aberto',
    'View period details': 'Ver detalhes do período',
    'WORKSPACE HEALTH': 'SAÚDE DO WORKSPACE',
    'Complete your workspace': 'Complete seu workspace',
    "These foundations are not required for setup, but you'll need them before running team operations.": 'Essas bases não são obrigatórias para a configuração, mas serão necessárias antes de executar as operações da equipe.',
    'Create your first team': 'Crie sua primeira equipe',
    'Organize your people before starting evaluations.': 'Organize suas pessoas antes de iniciar as avaliações.',
    'Create team →': 'Criar equipe →',
    'Add your people': 'Adicione suas pessoas',
    'Build your organization and prepare your first operational cycle.': 'Estruture sua organização e prepare seu primeiro ciclo operacional.',
    'Add people →': 'Adicionar pessoas →',
    'ATTENTION REQUIRED': 'ATENÇÃO NECESSÁRIA',
    'View all': 'Ver todos',
    'Pending evaluations': 'Avaliações pendentes',
    'Collaborators still need attention': 'Colaboradores que ainda precisam de atenção',
    'Review now →': 'Revisar agora →',
    'Prepare a period to start weekly operations': 'Prepare um período para iniciar as operações semanais',
    'Go to periods →': 'Ir para períodos →',
    'WEEKLY SNAPSHOT': 'RESUMO SEMANAL',
    'Eligible People': 'Pessoas elegíveis',
    'This period': 'Neste período',
    'Evaluated': 'Avaliados',
    'No data yet': 'Ainda não há dados',
    'Pending': 'Pendentes',
    'Total Occurrences': 'Total de ocorrências',
    'Teams': 'Equipes',
    'Active': 'Ativas',
    'PERFORMANCE OVERVIEW': 'VISÃO GERAL DO DESEMPENHO',
    'People': 'Pessoas',
    'High Performance': 'Alto desempenho',
    'On Track': 'No ritmo esperado',
    'Attention Needed': 'Atenção necessária',
    'Critical': 'Crítico',
    'View evaluations →': 'Ver avaliações →',
    'POINTS SUMMARY': 'RESUMO DE PONTOS',
    'Positive Points': 'Pontos positivos',
    'Negative Points': 'Pontos negativos',
    'View detailed analysis →': 'Ver análise detalhada →',
    'TOP POSITIVE PERFORMERS': 'MELHORES DESEMPENHOS POSITIVOS',
    'No positive movements in this period.': 'Nenhum movimento positivo neste período.',
    'ATTENTION NEEDED': 'ATENÇÃO NECESSÁRIA',
    'No negative movements in this period.': 'Nenhum movimento negativo neste período.',
    'QUICK ACTIONS': 'AÇÕES RÁPIDAS',
    'Manage Occurrences': 'Gerenciar ocorrências',
    'Configure evaluation events': 'Configurar eventos de avaliação',
    'Manage People': 'Gerenciar pessoas',
    'Add or edit collaborators': 'Adicionar ou editar colaboradores',
    'View Evaluations': 'Ver avaliações',
    'Browse current evaluations': 'Consultar avaliações atuais',
    'Open Settlement': 'Abrir fechamento',
    'Process period settlement': 'Processar fechamento do período',
    'KORbuild AI': 'KORbuild AI',
    'Your intelligent workspace assistant': 'Seu assistente inteligente do workspace',
    'Close': 'Fechar',
    'How can I help?': 'Como posso ajudar?',
    'I understand your workspace and can help you navigate, analyze and manage your work.': 'Entendo seu workspace e posso ajudar você a navegar, analisar e gerenciar seu trabalho.',
    'Dashboard context loaded': 'Contexto do dashboard carregado',
    'Operational insights': 'Insights operacionais',
    'Explain this dashboard': 'Explique este dashboard',
    'What requires my attention?': 'O que requer minha atenção?',
    'Summarize current performance': 'Resuma o desempenho atual',
    'Ask KORbuild AI...': 'Pergunte ao KORbuild AI...',
    'Send': 'Enviar',
    'Context-aware assistance': 'Assistência com contexto',
    'Evaluations': 'Avaliações',
    'Record occurrences for collaborators in the current open period.': 'Registre ocorrências para colaboradores no período aberto atual.',
    'Periods': 'Períodos',
    'Bonuses': 'Bônus',
    'Records': 'Registros',
    'Work Units': 'Unidades de trabalho',
    'Teams': 'Equipes',
    'People': 'Pessoas',
    'Occurrences': 'Ocorrências',
    'Reports': 'Relatórios',
    'Sign out': 'Sair',
    'OPEN PERIOD': 'PERÍODO ABERTO',
    'Loading current period...': 'Carregando período atual...',
    'Search by person, work unit, team or specialty...': 'Pesquisar por pessoa, unidade de trabalho, equipe ou especialidade...',
    'PERSON': 'PESSOA',
    'WORK UNIT': 'UNIDADE DE TRABALHO',
    'TEAM': 'EQUIPE',
    'SPECIALTY / FUNCTION': 'ESPECIALIDADE / FUNÇÃO',
    'OCCURRENCES': 'OCORRÊNCIAS',
    'TOTAL': 'TOTAL',
    'No collaborators found': 'Nenhum colaborador encontrado',
    'There are no prepared collaborators for the current open period.': 'Não há colaboradores preparados para o período aberto atual.',
    'Back to collaborators': 'Voltar para colaboradores',
    'Collaborator': 'Colaborador',
    'Loading prepared occurrences...': 'Carregando ocorrências preparadas...',
    'YOUR FREE TRIAL': 'SEU TESTE GRATUITO',
    'Your KORbuild trial is active': 'Seu teste do KORbuild está ativo',
    'You have full access to KORbuild.': 'Você tem acesso completo ao KORbuild.',
    'days free': 'dias grátis',
    'Subscribe now →': 'Assinar agora →'
  };

  const reverse = Object.fromEntries(Object.entries(DICT).map(([en,pt])=>[pt,en]));
  const KEY = 'korbuild-language';
  let lang = localStorage.getItem(KEY) || 'en-US';
  const translate = value => {
    if (!value) return value;
    if (lang === 'pt-BR') return DICT[value] || value;
    return reverse[value] || value;
  };

  function translateNode(node){
    if (node.nodeType === Node.TEXT_NODE) {
      const original = node.nodeValue;
      const trimmed = original.trim();
      if (trimmed && (DICT[trimmed] || reverse[trimmed])) {
        node.nodeValue = original.replace(trimmed, translate(trimmed));
      }
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    ['placeholder','title','aria-label'].forEach(attr=>{
      const value=node.getAttribute(attr);
      if (value && (DICT[value] || reverse[value])) node.setAttribute(attr, translate(value));
    });
    node.childNodes.forEach(translateNode);
  }

  function apply(){
    document.documentElement.lang = lang === 'pt-BR' ? 'pt-BR' : 'en';
    translateNode(document.body);
    updateToggle();
  }

  function updateToggle(){
    let btn=document.getElementById('korbuild-language-toggle');
    if(!btn){
      btn=document.createElement('button');
      btn.id='korbuild-language-toggle';
      btn.type='button';
      btn.style.cssText='position:fixed;right:18px;bottom:18px;z-index:99999;border:1px solid rgba(127,127,127,.28);border-radius:999px;padding:8px 12px;background:var(--surface,#fff);color:inherit;font:600 12px Inter,system-ui,sans-serif;cursor:pointer;box-shadow:0 8px 24px rgba(0,0,0,.12)';
      btn.addEventListener('click',()=>{lang=lang==='pt-BR'?'en-US':'pt-BR';localStorage.setItem(KEY,lang);apply();});
      document.body.appendChild(btn);
    }
    btn.textContent=lang==='pt-BR'?'EN':'PT-BR';
    btn.setAttribute('aria-label',lang==='pt-BR'?'Switch to English':'Mudar para português');
  }

  window.KORbuildI18n={get language(){return lang;}, setLanguage(v){if(v==='pt-BR'||v==='en-US'){lang=v;localStorage.setItem(KEY,v);apply();}}, t:translate, apply};
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',apply); else apply();
})();
