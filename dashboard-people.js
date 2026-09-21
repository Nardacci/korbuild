if(!window.KORBUILD_APP){const s=document.createElement('script');s.src='app-config.js?v=1.2.2';document.head.appendChild(s);}
const {url,publishableKey}=window.KORBUILD_SUPABASE;
const db=window.supabase.createClient(url,publishableKey,{auth:{persistSession:true,autoRefreshToken:true}});
const $=id=>document.getElementById(id);
const state={empresaId:null,granularity:'month',lancamentos:[],ocorrencias:[],escalas:[],charts:{}};
const COLORS={accent:'#635bff',accent2:'#8b5cf6',positive:'#3ca064',negative:'#c44343',blue:'#4383d9',orange:'#e4941c',muted:'#9aa5b8'};
// tipos_escala.rotulo is seeded straight into English -- translated here
// by tipos_escala.codigo (a stable Portuguese key), same pattern as
// schedule.js/schedule-form.js's own tipoEscalaLabel(). Resolved BEFORE
// being handed to Chart.js as a dataset label: chart legends render to
// <canvas>, entirely outside the DOM i18n.js's MutationObserver walks, so
// this is the only point where a translation can still be applied.
const TIPO_ESCALA_LABEL={
  'en-US':{turno:'Shift',ferias:'Vacation',folga:'Day Off',compromisso:'Commitment',other:'Other'},
  'pt-BR':{turno:'Turno',ferias:'Férias',folga:'Folga',compromisso:'Compromisso',other:'Outros'}
};
function tipoEscalaLabel(codigo){const lang=window.KORbuildI18n?window.KORbuildI18n.language:'en-US';const map=TIPO_ESCALA_LABEL[lang]||TIPO_ESCALA_LABEL['en-US'];return map[codigo]||map.other;}

function msg(text,type='error'){const e=$('message');e.textContent=text;e.className=`message ${type}`;e.classList.remove('hidden');}

function isoDate(d){return d.toISOString().slice(0,10);}

async function loadAttentionRequired(){
  const today=isoDate(new Date());
  const in2Days=new Date();in2Days.setDate(in2Days.getDate()+2);
  const [pendingRes,upcomingRes]=await Promise.all([
    db.from('escalas').select('id',{count:'exact',head:true}).eq('empresa_id',state.empresaId).eq('status','pendente'),
    // "Upcoming" excludes already-cancelled appointments -- a cancelled
    // slot isn't something that still needs attention.
    db.from('agendamentos_servico').select('id',{count:'exact',head:true}).eq('empresa_id',state.empresaId).gte('data',today).lte('data',isoDate(in2Days)).neq('status','cancelado')
  ]);
  if(!pendingRes.error)$('schedule-pending-count').textContent=pendingRes.count||0;
  if(!upcomingRes.error)$('upcoming-appointments-count').textContent=upcomingRes.count||0;
}

function mondayOf(dateStr){
  const d=new Date(dateStr+'T00:00:00');
  const day=d.getDay();
  const diff=(day===0?6:day-1);
  d.setDate(d.getDate()-diff);
  return d.toISOString().slice(0,10);
}
function bucketKey(dateStr){return state.granularity==='month'?dateStr.slice(0,7):mondayOf(dateStr);}
function bucketLabel(key){
  if(state.granularity==='month'){
    const [y,m]=key.split('-');
    return new Date(Number(y),Number(m)-1,1).toLocaleDateString('en-US',{month:'short',year:'2-digit'});
  }
  return new Date(key+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'});
}
function sortedBuckets(keys){return [...new Set(keys)].sort();}

async function loadProfile(){
  const {data:{session},error}=await db.auth.getSession();
  if(error||!session?.user){location.href='index.html';return false;}
  const {data:profile,error:profileError}=await db.from('usuarios').select('id,name,empresa_id,empresas(name)').eq('id',session.user.id).maybeSingle();
  if(profileError||!profile?.empresa_id){msg(profileError?.message||'Unable to load workspace profile.');return false;}
  state.empresaId=profile.empresa_id;
  const company=profile.empresas?.name||'KORbuild Demo';
  const name=profile.name?.trim()&&profile.name!=='Owner'?profile.name:session.user.user_metadata?.full_name||`${company} Owner`;
  const initial=name.trim().charAt(0).toUpperCase()||'O';
  $('user-name').textContent=name;$('user-email').textContent=session.user.email||'';
  $('user-avatar').textContent=initial;
  return true;
}

async function loadData(){
  const [lr,or_,er]=await Promise.all([
    db.from('lancamentos').select('total_score,periodos(start_date)').eq('empresa_id',state.empresaId),
    db.from('ocorrencias').select('quantity,tipos_ocorrencia(occurrence_type),lancamentos(periodos(start_date))').eq('empresa_id',state.empresaId),
    db.from('escalas').select('data_inicio,status,tipos_escala(codigo,rotulo,requer_aprovacao)').eq('empresa_id',state.empresaId)
  ]);
  if(lr.error)throw lr.error;if(or_.error)throw or_.error;if(er.error)throw er.error;
  state.lancamentos=(lr.data||[]).filter(r=>r.periodos?.start_date);
  state.ocorrencias=(or_.data||[]).filter(r=>r.lancamentos?.periodos?.start_date);
  state.escalas=(er.data||[]).filter(r=>r.data_inicio);
}

function renderSummary(){
  const totalOcc=state.ocorrencias.reduce((a,r)=>a+Number(r.quantity||0),0);
  const posOcc=state.ocorrencias.filter(r=>r.tipos_ocorrencia?.occurrence_type==='POSITIVA').reduce((a,r)=>a+Number(r.quantity||0),0);
  const negOcc=totalOcc-posOcc;
  $('metric-occurrences').textContent=totalOcc.toLocaleString('en-US');
  $('metric-occurrences-split').textContent=`${posOcc} positivas / ${negOcc} negativas`;

  $('metric-schedule-total').textContent=state.escalas.length.toLocaleString('en-US');
  const resolved=state.escalas.filter(r=>['confirmado','aprovado'].includes(r.status)).length;
  $('metric-approval-rate').textContent=state.escalas.length?`${Math.round(100*resolved/state.escalas.length)}%`:'—';

  const byBucket=new Map();
  state.lancamentos.forEach(r=>{const k=bucketKey(r.periodos.start_date);if(!byBucket.has(k))byBucket.set(k,[]);byBucket.get(k).push(Number(r.total_score||0));});
  const buckets=sortedBuckets([...byBucket.keys()]);
  const latest=buckets[buckets.length-1];
  if(latest){const scores=byBucket.get(latest);const avg=scores.reduce((a,b)=>a+b,0)/scores.length;$('metric-avg-score').textContent=avg.toFixed(1);}
  else{$('metric-avg-score').textContent='—';}
}

function destroyChart(id){if(state.charts[id]){state.charts[id].destroy();delete state.charts[id];}}

function renderScoreTrend(){
  const byBucket=new Map();
  state.lancamentos.forEach(r=>{const k=bucketKey(r.periodos.start_date);if(!byBucket.has(k))byBucket.set(k,[]);byBucket.get(k).push(Number(r.total_score||0));});
  const buckets=sortedBuckets([...byBucket.keys()]);
  const data=buckets.map(k=>{const arr=byBucket.get(k);return Number((arr.reduce((a,b)=>a+b,0)/arr.length).toFixed(1));});
  destroyChart('score');
  state.charts.score=new Chart($('chart-score-trend'),{
    type:'line',
    data:{labels:buckets.map(bucketLabel),datasets:[{label:'Pontuação média',data,borderColor:COLORS.accent,backgroundColor:COLORS.accent,tension:.3,pointRadius:2}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{y:{beginAtZero:true}}}
  });
}

function renderOccurrences(){
  const pos=new Map(),neg=new Map();
  state.ocorrencias.forEach(r=>{
    const k=bucketKey(r.lancamentos.periodos.start_date);
    const target=r.tipos_ocorrencia?.occurrence_type==='POSITIVA'?pos:neg;
    target.set(k,(target.get(k)||0)+Number(r.quantity||0));
  });
  const buckets=sortedBuckets([...pos.keys(),...neg.keys()]);
  destroyChart('occ');
  state.charts.occ=new Chart($('chart-occurrences'),{
    type:'bar',
    data:{labels:buckets.map(bucketLabel),datasets:[
      {label:'Positivas',data:buckets.map(k=>pos.get(k)||0),backgroundColor:COLORS.positive},
      {label:'Negativas',data:buckets.map(k=>neg.get(k)||0),backgroundColor:COLORS.negative}
    ]},
    options:{responsive:true,maintainAspectRatio:false,scales:{x:{stacked:true},y:{stacked:true,beginAtZero:true}}}
  });
}

function renderScheduleTypes(){
  const series=new Map();
  state.escalas.forEach(r=>{
    const type=tipoEscalaLabel(r.tipos_escala?.codigo);
    const k=bucketKey(r.data_inicio);
    if(!series.has(type))series.set(type,new Map());
    const m=series.get(type);m.set(k,(m.get(k)||0)+1);
  });
  const buckets=sortedBuckets(state.escalas.map(r=>bucketKey(r.data_inicio)));
  const palette=[COLORS.accent,COLORS.blue,COLORS.orange,COLORS.accent2,COLORS.muted];
  destroyChart('sched');
  state.charts.sched=new Chart($('chart-schedule-types'),{
    type:'bar',
    data:{labels:buckets.map(bucketLabel),datasets:[...series.entries()].map(([type,m],i)=>({label:type,data:buckets.map(k=>m.get(k)||0),backgroundColor:palette[i%palette.length]}))},
    options:{responsive:true,maintainAspectRatio:false,scales:{x:{stacked:true},y:{stacked:true,beginAtZero:true}}}
  });
}

function renderScheduleStatus(){
  const resolved=new Map(),pending=new Map();
  state.escalas.forEach(r=>{
    const k=bucketKey(r.data_inicio);
    const target=['confirmado','aprovado'].includes(r.status)?resolved:pending;
    target.set(k,(target.get(k)||0)+1);
  });
  const buckets=sortedBuckets(state.escalas.map(r=>bucketKey(r.data_inicio)));
  destroyChart('status');
  state.charts.status=new Chart($('chart-schedule-status'),{
    type:'bar',
    data:{labels:buckets.map(bucketLabel),datasets:[
      {label:'Aprovado / Confirmado',data:buckets.map(k=>resolved.get(k)||0),backgroundColor:COLORS.positive},
      {label:'Pendente / Rejeitado',data:buckets.map(k=>pending.get(k)||0),backgroundColor:COLORS.orange}
    ]},
    options:{responsive:true,maintainAspectRatio:false,scales:{x:{stacked:true},y:{stacked:true,beginAtZero:true}}}
  });
}

function renderAll(){
  renderSummary();
  renderScoreTrend();
  renderOccurrences();
  renderScheduleTypes();
  renderScheduleStatus();
}

function setGranularity(g){
  state.granularity=g;
  $('range-week').classList.toggle('active',g==='week');
  $('range-month').classList.toggle('active',g==='month');
  renderAll();
}

$('range-week').addEventListener('click',()=>setGranularity('week'));
$('range-month').addEventListener('click',()=>setGranularity('month'));
$('user-menu-btn')?.addEventListener('click',e=>{e.stopPropagation();const menu=$('user-menu');const hidden=menu.classList.toggle('hidden');$('user-menu-btn').setAttribute('aria-expanded',String(!hidden));});
document.addEventListener('click',e=>{if(!e.target.closest('.user-menu-wrap'))$('user-menu')?.classList.add('hidden');});

async function init(){
  if(!(await loadProfile()))return;
  try{await loadData();renderAll();}
  catch(e){console.error(e);msg(`Unable to load dashboard data. ${e.message||''}`);}
  try{await loadAttentionRequired();}
  catch(e){console.error('Attention Required block failed to load',e);}
}
init();
