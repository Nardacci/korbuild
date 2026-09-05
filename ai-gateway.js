(function(){
  if(window.KORBUILD_AI_GATEWAY_INSTALLED)return;
  const cfg=window.KORBUILD_SUPABASE;
  if(!cfg||!cfg.url||!cfg.publishableKey||!window.supabase||typeof window.supabase.createClient!=='function'){
    console.error('[KORbuild AI] invalid Supabase configuration',cfg);return;
  }
  window.KORBUILD_AI_GATEWAY_INSTALLED=true;
  const client=window.supabase.createClient(cfg.url,cfg.publishableKey,{auth:{persistSession:true,autoRefreshToken:true}});
  const $=id=>document.getElementById(id);
  const setStatus=text=>{const el=document.querySelector('.kor-ai-footer');if(el)el.textContent='KORbuild AI · '+text;};
  const waitForDom=()=>new Promise(resolve=>{if(document.getElementById('kor-ai-messages'))return resolve();document.addEventListener('DOMContentLoaded',resolve,{once:true});});
  let messages=null;
  const escapeHtml=value=>String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  function renderAssistantMarkdown(text){
    const source=String(text??'').replace(/\r\n/g,'\n').trim();
    if(!source)return '';
    const lines=source.split('\n');
    const blocks=[];let paragraph=[];let list=[];
    const flushParagraph=()=>{if(paragraph.length){blocks.push('<p>'+paragraph.join(' ')+'</p>');paragraph=[];}};
    const flushList=()=>{if(list.length){blocks.push('<ul>'+list.map(item=>'<li>'+item+'</li>').join('')+'</ul>');list=[];}};
    const inline=value=>escapeHtml(value)
      .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
      .replace(/__(.+?)__/g,'<strong>$1</strong>')
      .replace(/`([^`]+)`/g,'<code>$1</code>')
      .replace(/(^|\s)\*([^*\n]+)\*(?=\s|[.,!?;:]|$)/g,'$1<em>$2</em>');
    lines.forEach(raw=>{
      const line=raw.trim();
      if(!line){flushParagraph();flushList();return;}
      const bullet=line.match(/^[-*•]\s+(.+)$/);
      if(bullet){flushParagraph();list.push(inline(bullet[1]));return;}
      const heading=line.match(/^#{1,3}\s+(.+)$/);
      if(heading){flushParagraph();flushList();blocks.push('<h4>'+inline(heading[1])+'</h4>');return;}
      flushList();paragraph.push(inline(line));
    });
    flushParagraph();flushList();
    return blocks.join('');
  }
  function installAnswerStyles(){
    if(document.getElementById('kor-ai-answer-format-styles'))return;
    const style=document.createElement('style');style.id='kor-ai-answer-format-styles';style.textContent=`
      .kor-ai-message.assistant,.kor-ai-message.ai{line-height:1.55;text-align:left;white-space:normal;overflow-wrap:anywhere}
      .kor-ai-message.assistant p,.kor-ai-message.ai p{margin:0 0 9px}
      .kor-ai-message.assistant p:last-child,.kor-ai-message.ai p:last-child{margin-bottom:0}
      .kor-ai-message.assistant ul,.kor-ai-message.ai ul{margin:6px 0 9px;padding-left:19px}
      .kor-ai-message.assistant li,.kor-ai-message.ai li{margin:5px 0;padding-left:2px}
      .kor-ai-message.assistant h4,.kor-ai-message.ai h4{margin:0 0 7px;font-size:12px;line-height:1.35}
      .kor-ai-message.assistant strong,.kor-ai-message.ai strong{font-weight:800}
      .kor-ai-message.assistant code,.kor-ai-message.ai code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.9em;padding:1px 4px;border-radius:4px;background:rgba(99,91,255,.08)}
    `;document.head.appendChild(style);
  }
  const addMessage=(text,role)=>{const el=document.createElement('div');el.className='kor-ai-message '+role;if(role==='assistant'||role==='ai')el.innerHTML=renderAssistantMarkdown(text);else el.textContent=text;messages.appendChild(el);messages.scrollTop=messages.scrollHeight;return el;};
  const addTyping=()=>{const el=document.createElement('div');el.className='kor-ai-message assistant typing';el.textContent='KORbuild AI is thinking…';messages.appendChild(el);messages.scrollTop=messages.scrollHeight;return el;};
  const openPanel=()=>{$('kor-ai-panel')?.classList.remove('hidden');$('kor-ai-input')?.focus();};

  function classifyIntent(q){
    const text=String(q||'').toLowerCase().trim();
    if(/\b(next|next step|do next|should i do|what should i do|o que devo fazer|próximo passo|proxima ação|próxima ação|o que fazer agora)\b/.test(text))return'next_action';
    if(/\b(attention|require|pending|urgent|problem|issue|wrong|atenção|pendente|urgente|problema|prioridade)\b/.test(text))return'attention';
    if(/\b(performance|summarize|summary|progress|how are we doing|desempenho|resumo|progresso|como estamos)\b/.test(text))return'performance';
    if(/\b(period|week|deadline|ends|ending|remaining|período|semana|prazo|termina|restante)\b/.test(text))return'period';
    if(/\b(team|teams|equipe|equipes)\b/.test(text))return'teams';
    if(/\b(people|person|collaborator|employee|employees|staff|pessoas|colaborador|colaboradores|funcionários)\b/.test(text))return'people';
    if(/\b(dashboard|explain|picture|overview|what is happening|painel|explique|visão geral|o que está acontecendo)\b/.test(text))return'dashboard';
    return'general';
  }
  function buildPeriod(period){
    if(!period)return null;
    const start=new Date(period.start_date+'T00:00:00'),end=new Date(period.end_date+'T00:00:00');const today=new Date();today.setHours(0,0,0,0);
    const total=Math.max(1,Math.round((end-start)/86400000)+1),elapsed=Math.max(0,Math.min(total,Math.round((today-start)/86400000)+1));
    return{week:period.week_number,start:period.start_date,end:period.end_date,progress:Math.round(elapsed/total*100),daysRemaining:Math.max(0,Math.round((end-today)/86400000))};
  }
  async function buildAuthorizedContext(){
    let stage='session';
    try{
      const {data:sessionData,error:sessionError}=await client.auth.getSession();
      if(sessionError)throw new Error('session: '+sessionError.message);
      const uid=sessionData?.session?.user?.id;if(!uid)throw new Error('session: no authenticated user');
      stage='profile';
      const {data:profile,error:profileError}=await client.from('usuarios').select('id,name,empresa_id,empresas(name)').eq('id',uid).maybeSingle();
      if(profileError)throw new Error('profile: '+profileError.message);if(!profile?.empresa_id)throw new Error('profile: empresa_id not found');
      const empresaId=profile.empresa_id;
      stage='detector';
      try{await client.rpc('detect_ai_performance_declines');}catch(detectorError){console.warn('[KORbuild AI] detector refresh skipped',detectorError);}
      stage='workspace queries';
      const [peopleRes,teamsRes,periodRes,insightRes]=await Promise.all([
        client.from('colaboradores').select('id,name,specialty,equipe_id,active').eq('empresa_id',empresaId).order('name'),
        client.from('equipes').select('id,name,active').eq('empresa_id',empresaId).order('name'),
        client.from('periodos').select('id,start_date,end_date,week_number,status').eq('empresa_id',empresaId).eq('status','ABERTO').order('start_date',{ascending:true}).limit(1),
        client.from('ai_insights').select('id,tipo,titulo,descricao,severidade,confidence,status,evidencias,created_at').eq('empresa_id',empresaId).eq('status','active').order('created_at',{ascending:false}).limit(10)
      ]);
      if(peopleRes.error)throw new Error('people: '+peopleRes.error.message);if(teamsRes.error)throw new Error('teams: '+teamsRes.error.message);if(periodRes.error)throw new Error('period: '+periodRes.error.message);if(insightRes.error)throw new Error('insights: '+insightRes.error.message);
      const people=peopleRes.data||[],teams=teamsRes.data||[],period=periodRes.data?.[0]||null;let launches=[],scores=new Map();
      if(period){
        stage='launches';const {data,error}=await client.from('lancamentos').select('id,colaborador_id,equipe_id').eq('empresa_id',empresaId).eq('periodo_id',period.id);if(error)throw new Error('launches: '+error.message);launches=data||[];
        const ids=launches.map(x=>x.id);if(ids.length){stage='occurrences';const {data:occ,error:oe}=await client.from('ocorrencias').select('lancamento_id,quantity,points,tipos_ocorrencia(occurrence_type)').eq('empresa_id',empresaId).in('lancamento_id',ids);if(oe)throw new Error('occurrences: '+oe.message);
          (occ||[]).forEach(o=>{const qty=Math.max(0,Number(o.quantity)||0),sign=o.tipos_ocorrencia?.occurrence_type==='NEGATIVA'?-1:1,score=sign*Math.abs(Number(o.points)||0)*qty,cur=scores.get(o.lancamento_id)||{score:0,count:0};cur.score+=score;cur.count+=qty;scores.set(o.lancamento_id,cur);});
        }
      }
      stage='context assembly';const rows=[],byPerson=new Map();people.filter(p=>p.active===true).forEach(p=>{const row={person:p,score:0,count:0};rows.push(row);byPerson.set(p.id,row);});
      launches.forEach(l=>{const row=byPerson.get(l.colaborador_id);if(!row)return;const s=scores.get(l.id)||{score:0,count:0};row.score+=s.score;row.count+=s.count;});
      const eligible=rows.length,evaluated=rows.filter(r=>r.count>0).length,pending=Math.max(0,eligible-evaluated),occurrences=rows.reduce((s,r)=>s+r.count,0),activeTeams=teams.filter(t=>t.active===true).length,positivePoints=rows.reduce((s,r)=>s+Math.max(0,r.score),0),negativePoints=rows.reduce((s,r)=>s+Math.min(0,r.score),0),p=buildPeriod(period),operational=[];
      if(!p)operational.push({level:'attention',type:'no_open_period',message:'There is no open evaluation period. Create the next period to start operations.'});
      if(pending>0)operational.push({level:'attention',type:'pending_evaluations',message:pending+' evaluation'+(pending===1?' is':'s are')+' still pending.'});
      if(p&&p.daysRemaining<=1)operational.push({level:'attention',type:'deadline',message:p.daysRemaining===0?'The current period ends today.':'The current period ends tomorrow.'});
      if(activeTeams===0)operational.push({level:'setup',type:'no_teams',message:'No active teams are configured yet.'});
      if(eligible===0)operational.push({level:'setup',type:'no_people',message:'No eligible people are configured yet.'});
      if(!operational.length)operational.push({level:'healthy',type:'all_clear',message:'No critical operational attention points were detected.'});
      return{version:'3.1',page:'dashboard',generatedAt:new Date().toISOString(),workspace:{companyId:empresaId,companyName:profile.empresas?.name||'KORbuild workspace',userName:profile.name||'User'},period:p,metrics:{eligible,evaluated,pending,occurrences,activeTeams,positivePoints,negativePoints},signals:{health:pending===0?'healthy':'attention',evaluationRate:eligible?Math.round(evaluated/eligible*100):0,hasOpenPeriod:!!p},insights:operational,learningLoop:{version:'1.0',tenantScoped:true,insights:insightRes.data||[]}};
    }catch(error){setStatus('Context error · '+stage);console.error('[KORbuild AI] authorized context failed at '+stage,error);throw error;}
  }
  function recommend(c){const dbInsights=c.learningLoop?.insights||[],performance=dbInsights.find(i=>i.tipo==='PERFORMANCE_DECLINE'&&i.status==='active');if(performance)return'Prioritize a review of '+(performance.evidencias?.collaborator_name||'the affected collaborator')+' and compare the recent evaluation trend before taking corrective action.';const i=(c.insights||[]).find(x=>x.level==='attention');if(i?.type==='pending_evaluations')return'Review the pending evaluations and follow up with the responsible managers.';if(i?.type==='deadline')return'Prioritize closing pending evaluations before the period deadline.';if(i?.type==='no_open_period')return'Create the next evaluation period and define its dates before operations begin.';if(i?.type==='no_teams')return'Create at least one active team so people and evaluations can be organized.';if(i?.type==='no_people')return'Add eligible people to the workspace before starting evaluations.';return'Review the current period performance and keep the evaluation cycle moving.';}
  function localAnswer(q,c){const m=c.metrics,p=c.period,intent=classifyIntent(q),periodText=p?'Week '+p.week+' is '+p.progress+'% complete, with '+p.daysRemaining+' day'+(p.daysRemaining===1?'':'s')+' remaining.':'There is no open period right now.',attention=(c.insights||[]).filter(i=>i.level==='attention'),learned=c.learningLoop?.insights||[];if(intent==='next_action')return'Your next best step is: '+recommend(c)+' '+periodText;if(intent==='dashboard')return'Here is the current picture: '+c.workspace.companyName+' workspace. '+periodText+' '+m.eligible+' eligible people, '+m.evaluated+' evaluated and '+m.pending+' pending. '+m.occurrences+' occurrences and '+m.activeTeams+' active team'+(m.activeTeams===1?'':'s')+'.';if(intent==='attention')return attention.length?'Here is what deserves attention: '+attention.map(i=>i.message).join(' ')+' Recommended next step: '+recommend(c)+' '+periodText:'Everything looks under control right now. '+periodText+' Recommended next step: '+recommend(c);if(intent==='performance')return'Current performance summary: '+m.evaluated+' of '+m.eligible+' eligible people evaluated ('+c.signals.evaluationRate+'%). '+m.occurrences+' occurrence'+(m.occurrences===1?'':'s')+' recorded. Points balance: +'+m.positivePoints+' positive and '+m.negativePoints+' negative. '+(learned.length?'The Learning Loop has '+learned.length+' active insight'+(learned.length===1?'':'s')+' available for analysis. ':'')+periodText;if(intent==='period')return periodText;if(intent==='teams')return'You currently have '+m.activeTeams+' active team'+(m.activeTeams===1?'':'s')+' in this workspace.';if(intent==='people')return'There are '+m.eligible+' eligible people. '+m.evaluated+' have been evaluated and '+m.pending+' remain pending.';return'Based on the current authorized context: '+c.workspace.companyName+' workspace. '+periodText+' '+m.eligible+' eligible people, '+m.activeTeams+' active team'+(m.activeTeams===1?'':'s')+'. '+(learned[0]?.descricao||c.insights?.[0]?.message||'No critical attention points detected.');}
  async function askViaGateway(text){
    const {data:{session}}=await client.auth.getSession();if(!session?.access_token)throw new Error('unauthorized');
    const context=await buildAuthorizedContext();setStatus('Gateway request started');
    const response=await fetch(cfg.url+'/functions/v1/korbuild-ai',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+session.access_token},body:JSON.stringify({message:text,context,intent:classifyIntent(text),feature:'dashboard_ai'})});
    const payload=await response.json().catch(()=>({}));if(!response.ok){setStatus('Gateway response · HTTP '+response.status);throw new Error(payload.error||'gateway_error');}if(!payload.answer)throw new Error('empty_ai_response');setStatus('Gateway response · HTTP '+response.status);return payload;
  }
  async function answer(text){openPanel();addMessage(text,'user');const typing=addTyping();try{const result=await askViaGateway(text);typing.remove();addMessage(result.answer,'assistant');}catch(error){console.warn('KORbuild AI gateway unavailable; using protected local context fallback',error?.message||error);try{const context=await buildAuthorizedContext();typing.remove();addMessage(localAnswer(text,context),'ai');}catch(fallbackError){typing.remove();setStatus('AI error · '+(fallbackError?.message||error?.message||'unknown error'));addMessage('A IA está temporariamente indisponível. Verifique o diagnóstico no rodapé.','assistant');}}}
  async function init(){await waitForDom();installAnswerStyles();messages=$('kor-ai-messages');if(!messages){setStatus('AI DOM error · messages not found');return;}setStatus('Gateway initialized · ready');
    const form=$('kor-ai-form');if(form&&!form.dataset.gatewayOwned){const fresh=form.cloneNode(true);form.replaceWith(fresh);fresh.dataset.gatewayOwned='true';const input=fresh.querySelector('#kor-ai-input');fresh.addEventListener('submit',event=>{event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();const text=String(input?.value||'').trim();if(!text)return;if(input)input.value='';answer(text);});}
    document.querySelectorAll('[data-prompt]').forEach(button=>{if(button.dataset.gatewayOwned)return;const fresh=button.cloneNode(true);button.replaceWith(fresh);fresh.dataset.gatewayOwned='true';fresh.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();const text=fresh.dataset.prompt;if(text)answer(text);});});
  }
  init().catch(error=>{setStatus('Gateway init error · '+(error?.message||'unknown'));console.error('[KORbuild AI] init failed',error);});
})();
