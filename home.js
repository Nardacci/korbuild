const {url,publishableKey}=window.KORBUILD_SUPABASE;
const db=window.supabase.createClient(url,publishableKey,{auth:{persistSession:true,autoRefreshToken:true}});
const $=id=>document.getElementById(id);
const state={companyId:null,people:[],teams:[],period:null,launches:[],scores:new Map()};
const fmtDate=s=>new Date(s+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
const fmtPts=n=>Number(n||0).toLocaleString('en-US')+' pts';
const pct=(n,total)=>total?Math.round(n/total*100):0;
function setText(id,value){const el=$(id);if(el)el.textContent=value}
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function renderTrialStatus(data){
 const card=$('trial-status-card');if(!card)return;
 if(!data){console.warn('Trial status returned no data');card.classList.add('hidden');card.style.display='none';return}
 // Trial is a commercial setting per company. When disabled, the dashboard must
 // show no trial countdown, warning or trial CTA at all.
 if(data.trial_enabled===false || data.phase==='NO_TRIAL' || data.status==='ACTIVE'){
   card.classList.add('hidden');
   card.style.display='none';
   return;
 }
 card.classList.remove('hidden');
 card.style.display='flex';
 const status=data.status||'TRIALING',days=Math.max(0,Number(data.days_remaining)||0);
 const icon=$('trial-status-icon'),eyebrow=$('trial-eyebrow'),title=$('trial-title'),message=$('trial-message'),count=$('trial-days'),label=$('trial-days-label'),action=$('trial-action');
 card.classList.remove('grace','blocked');
 if(status==='GRACE_PERIOD'){
   card.classList.add('grace');icon.textContent='!';
   setText('trial-eyebrow','TRIAL ENDED · GRACE PERIOD');
   setText('trial-title','Your trial has ended, but KORbuild is still available.');
   setText('trial-message','Choose a plan to keep your workspace active without interruption.');
   setText('trial-days',days);setText('trial-days-label',days===1?'day remaining':'days remaining');
   if(action){action.textContent='Choose a plan →';action.href='billing.html'}
 }else if(status==='BLOCKED'){
   card.classList.add('blocked');icon.textContent='!';
   setText('trial-eyebrow','TRIAL EXPIRED');
   setText('trial-title','Your KORbuild trial has expired.');
   setText('trial-message','Choose a plan to restore access to your workspace.');
   setText('trial-days','0');setText('trial-days-label','days remaining');
   if(action){action.textContent='Choose a plan →';action.href='billing.html'}
 }else{
   icon.textContent='✦';
   setText('trial-eyebrow','YOUR 14-DAY FREE TRIAL');
   setText('trial-title','Your KORbuild trial is active.');
   setText('trial-message','Explore the platform and build your workspace with full access.');
   setText('trial-days',days);setText('trial-days-label',days===1?'day free':'days free');
   if(action){action.textContent='View plans →';action.href='billing.html'}
 }
}
function setDemoBadgeVisible(visible){
 // Global fail-closed branding state: DEMO is a Trial indicator, never a static label.
 const show=visible===true;
 document.body.classList.toggle('trial-active',show);
 document.querySelectorAll('.logo-demo').forEach(badge=>{
   badge.classList.toggle('hidden',!show);
   badge.style.display=show?'inline-flex':'none';
 });
}

async function loadProfile(){
 const {data:{session},error}=await db.auth.getSession();
 if(error||!session?.user){location.href='index.html';return null}
 const {data:profile,error:pe}=await db.from('usuarios').select('id,name,empresa_id,empresas(name)').eq('id',session.user.id).maybeSingle();
 if(pe||!profile?.empresa_id)throw(pe||new Error('Workspace profile not found'));
 const name=profile.name||session.user.user_metadata?.full_name||'Owner',initial=name.trim().charAt(0).toUpperCase()||'O';
 ['user-name','menu-full-name'].forEach(id=>setText(id,name));
 ['user-email','menu-full-email'].forEach(id=>setText(id,session.user.email||''));
 ['user-avatar','menu-avatar'].forEach(id=>setText(id,initial));
 state.companyId=profile.empresa_id;
 return profile;
}

async function loadTrialStatus(){
 // Fail closed: never show DEMO or trial UI until the authoritative company state confirms Trial.
 setDemoBadgeVisible(false);
 // Keep the card hidden until the authoritative company commercial state is resolved.
 // This prevents stale/default trial UI from surviving a failed or delayed request.
 $('trial-status-card')?.classList.add('hidden');
 // Single authoritative server-side source for the logged-in user's company.
 // This bypasses client-side RLS ambiguity and prevents trial UI from appearing
 // when Super Admin has explicitly disabled trial or activated the company.
 const {data:commercial,error:commercialError}=await db.rpc('get_company_commercial_state',{p_empresa_id:state.companyId});

 if(!commercialError && commercial?.found){
   console.info('KORbuild commercial state',commercial);   // DEMO is a trial indicator, not a company label.
   setDemoBadgeVisible(commercial.trial_enabled===true && ['TRIAL','TRIALING'].includes(String(commercial.status||'').toUpperCase()));
   if(commercial.status==='ACTIVE' || commercial.trial_enabled===false){
     renderTrialStatus({
       status:commercial.status,
       phase:commercial.trial_enabled===false?'NO_TRIAL':'ACTIVE',
       trial_enabled:commercial.trial_enabled,
       activation_source:commercial.activation_source
     });
     return;
   }
 }else{
   console.warn('Commercial state unavailable',commercialError?.message,commercial);
 }

 // Only companies still participating in the standard lifecycle reach this RPC.
 const {data,error}=await db.rpc('get_workspace_access_status');
 if(error){console.warn('Trial status unavailable',error.message,error);setDemoBadgeVisible(false);return}
 console.info('KORbuild trial status',data);
 setDemoBadgeVisible(['TRIAL','TRIALING'].includes(String(data?.status||'').toUpperCase()));
 renderTrialStatus(data);
}
function renderPeriod(){
 if(!state.period){setText('current-period','No open period');setText('period-progress-label','—');setText('period-days','Prepare your next evaluation period to start the operation.');$('period-progress').style.width='0%';setText('days-remaining','—');setText('deadline-title','No open period');setText('deadline-copy','Prepare a period to start weekly operations');return}
 const p=state.period,start=new Date(p.start_date+'T00:00:00'),end=new Date(p.end_date+'T00:00:00');
 setText('current-period','Week '+p.week_number+' · '+fmtDate(p.start_date)+' → '+fmtDate(p.end_date));
 const today=new Date();today.setHours(0,0,0,0);const total=Math.max(1,Math.round((end-start)/86400000)+1),elapsed=Math.max(0,Math.min(total,Math.round((today-start)/86400000)+1)),progress=Math.round(elapsed/total*100),remaining=Math.max(0,Math.round((end-today)/86400000));
 $('period-progress').style.width=progress+'%';setText('period-progress-label',progress+'%');setText('period-days',Math.min(elapsed,total)+' of '+total+' days completed');
 if(today>end){setText('days-remaining','Period ended');setText('deadline-title','Review period settlement');setText('deadline-copy','Check evaluations before closing the cycle');}
 else{setText('days-remaining',remaining===0?'Ends today':remaining===1?'Ends in 1 day':'Ends in '+remaining+' days');setText('deadline-title',remaining===0?'Period ends today':remaining===1?'Period ends tomorrow':'Period ends in '+remaining+' days');setText('deadline-copy','Review all occurrences before settlement');}
}
function scoreRows(){
 const map=new Map();state.people.forEach(p=>map.set(p.id,{person:p,score:0,count:0}));
 state.launches.forEach(l=>{if(!map.has(l.colaborador_id))return;const s=state.scores.get(l.id)||{score:0,count:0},row=map.get(l.colaborador_id);row.score+=s.score;row.count+=s.count;});
 return [...map.values()].filter(r=>r.person.active===true);
}
function renderPerformance(rows){
 const g={high:0,track:0,attention:0,critical:0};rows.forEach(r=>{if(r.score>=50)g.high++;else if(r.score>=0)g.track++;else if(r.score>-50)g.attention++;else g.critical++;});
 const total=rows.length;setText('performance-total',total);const vals=[g.high,g.track,g.attention,g.critical],colors=['#51ad70','#4b83db','#f0a01c','#e65656'];let acc=0,stops=[];vals.forEach((v,i)=>{const next=acc+(total?v/total*100:0);stops.push(colors[i]+' '+acc+'% '+next+'%');acc=next});$('performance-donut').style.background=total?'conic-gradient('+stops.join(',')+')':'#e7eaf0';
 [['high-count',g.high],['track-count',g.track],['attention-count',g.attention],['critical-count',g.critical]].forEach(x=>setText(x[0],x[1]+' ('+pct(x[1],total)+'%)'));
}
function teamName(person){const launch=state.launches.find(l=>l.colaborador_id===person.id),teamId=launch?.equipe_id||person.equipe_id;return state.teams.find(t=>t.id===teamId)?.name||person.specialty||'—'}
function renderWorkspaceHealth(){
 const activeTeams=state.teams.filter(t=>t.active===true).length;
 const activePeople=state.people.filter(p=>p.active===true).length;
 const section=$('workspace-health');if(!section)return;
 const teamsCard=$('health-teams'),peopleCard=$('health-people');
 if(teamsCard)teamsCard.classList.toggle('hidden',activeTeams>0);
 if(peopleCard)peopleCard.classList.toggle('hidden',activePeople>0);
 section.classList.toggle('hidden',activeTeams>0&&activePeople>0);
}
function renderList(id,rows,type){
 const el=$(id);if(!rows.length){el.innerHTML='<div class="empty-row">No movements in this period.</div>';return}
 el.innerHTML=rows.slice(0,3).map((r,i)=>'<div class="person-row"><span class="rank '+(i===0?(type==='positive'?'first':'danger'):(type==='negative'?'danger':''))+'">'+(i+1)+'</span><div><b>'+esc(r.person.name)+'</b><small>'+esc(teamName(r.person))+'</small></div><strong class="person-score '+type+'">'+(r.score>0?'+':'')+fmtPts(r.score)+'</strong></div>').join('');
}
function renderSnapshot(rows){
 const eligible=rows.length,evaluated=rows.filter(r=>r.count>0).length,pending=Math.max(0,eligible-evaluated),occ=rows.reduce((a,r)=>a+r.count,0),activeTeams=state.teams.filter(t=>t.active===true).length;
 [['employees',eligible],['evaluated',evaluated],['pending',pending],['occurrences',occ],['teams',activeTeams],['attention-pending',pending]].forEach(x=>setText(x[0],x[1]));
 setText('evaluated-meta',eligible?pct(evaluated,eligible)+'% of eligible':'No data yet');setText('pending-meta',eligible?pct(pending,eligible)+'% remaining':'No data yet');
 const positive=rows.reduce((a,r)=>a+Math.max(0,r.score),0),negative=rows.reduce((a,r)=>a+Math.min(0,r.score),0);setText('positive-points','+'+positive.toLocaleString('en-US'));setText('negative-points',negative.toLocaleString('en-US'));
 renderPerformance(rows);renderList('positive-list',rows.filter(r=>r.score>0).sort((a,b)=>b.score-a.score),'positive');renderList('negative-list',rows.filter(r=>r.score<0).sort((a,b)=>a.score-b.score),'negative');
}
async function loadData(){
 const [peopleRes,teamsRes,periodRes]=await Promise.all([db.from('colaboradores').select('id,name,specialty,equipe_id,active').eq('empresa_id',state.companyId).order('name'),db.from('equipes').select('id,name,active').eq('empresa_id',state.companyId).order('name'),db.from('periodos').select('id,start_date,end_date,week_number,status').eq('empresa_id',state.companyId).eq('status','ABERTO').order('start_date',{ascending:true}).limit(1)]);
 if(peopleRes.error||teamsRes.error||periodRes.error)throw(peopleRes.error||teamsRes.error||periodRes.error);
 state.people=peopleRes.data||[];state.teams=teamsRes.data||[];state.period=(periodRes.data||[])[0]||null;renderWorkspaceHealth();renderPeriod();
 if(!state.period){renderSnapshot([]);return}
 const {data:launches,error:le}=await db.from('lancamentos').select('id,colaborador_id,equipe_id').eq('periodo_id',state.period.id);if(le)throw le;state.launches=launches||[];
 const ids=state.launches.map(x=>x.id);state.scores=new Map();
 if(ids.length){const {data:occ,error:oe}=await db.from('ocorrencias').select('lancamento_id,quantity,points,tipos_ocorrencia(occurrence_type)').in('lancamento_id',ids);if(oe)throw oe;(occ||[]).forEach(o=>{const id=o.lancamento_id,qty=Math.max(0,Number(o.quantity)||0),sign=o.tipos_ocorrencia?.occurrence_type==='NEGATIVA'?-1:1,score=sign*Math.abs(Number(o.points)||0)*qty,cur=state.scores.get(id)||{score:0,count:0};cur.score+=score;cur.count+=qty;state.scores.set(id,cur);});}
 renderSnapshot(scoreRows());
}
function initMenu(){$('user-menu-btn')?.addEventListener('click',e=>{e.stopPropagation();$('user-menu')?.classList.toggle('hidden')});document.addEventListener('click',e=>{if(!e.target.closest('.user-menu-wrap'))$('user-menu')?.classList.add('hidden')});$('menu-logout')?.addEventListener('click',async()=>{await db.auth.signOut();location.href='index.html'});}
(async()=>{try{const p=await loadProfile();if(p){initMenu();await Promise.all([loadData(),loadTrialStatus()])}}catch(e){console.error('Dashboard load failed',e);}})();
function initKORbuildAI(){
 const fab=$('kor-ai-fab'),panel=$('kor-ai-panel'),close=$('kor-ai-close'),form=$('kor-ai-form'),input=$('kor-ai-input'),messages=$('kor-ai-messages');
 if(!fab||!panel)return;
 const open=()=>{panel.classList.remove('hidden');input?.focus()};
 const shut=()=>panel.classList.add('hidden');
 fab.addEventListener('click',open);close?.addEventListener('click',shut);
 document.querySelectorAll('[data-prompt]').forEach(b=>b.addEventListener('click',()=>askKORbuildAI(b.dataset.prompt)));
 form?.addEventListener('submit',e=>{e.preventDefault();const q=input?.value.trim();if(q){askKORbuildAI(q);input.value='';}});
 function add(text,type){const el=document.createElement('div');el.className='kor-ai-message '+type;el.textContent=text;messages?.appendChild(el);messages?.scrollTo({top:messages.scrollHeight,behavior:'smooth'});}
 function askKORbuildAI(q){
   open();add(q,'user');
   // Phase 1 UI intelligence. The real model/backend connector will replace this responder.
   const p=String(q).toLowerCase();
   let answer='I’m ready to help. In the next phase I’ll connect to your authorized KORbuild data so I can provide contextual analysis and actionable insights.';
   if(p.includes('dashboard')) answer='This dashboard summarizes your current open period: people, evaluations, pending items, occurrences and performance distribution. I’ll soon be able to explain each indicator using your live workspace data.';
   else if(p.includes('attention')) answer='I can help identify pending evaluations, negative movements and other items that require attention. The next phase will connect this assistant to authorized workspace data.';
   else if(p.includes('performance')||p.includes('summarize')) answer='I can summarize performance patterns and highlight trends. For now this is the KORbuild AI experience layer; live analytical answers come with the backend connection.';
   setTimeout(()=>add(answer,'ai'),350);
 }
}
const __korInit=document.querySelector('#kor-ai-fab'); if(__korInit) initKORbuildAI();
