if(!window.KORBUILD_APP){const s=document.createElement('script');s.src='app-config.js?v=1.2.2';document.head.appendChild(s);}
const {url,publishableKey}=window.KORBUILD_SUPABASE;
const db=window.supabase.createClient(url,publishableKey,{auth:{persistSession:true,autoRefreshToken:true}});
const $=id=>document.getElementById(id);
const state={empresaId:null,granularity:'month',payments:[],appointments:[],charts:{}};
const COLORS={accent:'#635bff',accent2:'#8b5cf6',positive:'#3ca064',negative:'#c44343',blue:'#4383d9',orange:'#e4941c'};
const money=v=>'$'+Number(v||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});

function msg(text,type='error'){const e=$('message');e.textContent=text;e.className=`message ${type}`;e.classList.remove('hidden');}

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
  const [pr,ar]=await Promise.all([
    db.from('pagamentos_semanais').select('semana_inicio,horas_trabalhadas,valor_liquido').eq('empresa_id',state.empresaId),
    db.from('agendamentos_servico').select('data,status,servicos_catalogo(preco_padrao)').eq('empresa_id',state.empresaId)
  ]);
  if(pr.error)throw pr.error;if(ar.error)throw ar.error;
  state.payments=pr.data||[];
  state.appointments=ar.data||[];
}

function renderSummary(){
  const totalNet=state.payments.reduce((a,r)=>a+Number(r.valor_liquido||0),0);
  const totalHours=state.payments.reduce((a,r)=>a+Number(r.horas_trabalhadas||0),0);
  $('metric-payroll-total').textContent=money(totalNet);
  $('metric-hours-total').textContent=Math.round(totalHours).toLocaleString('en-US');

  const totalAppts=state.appointments.length;
  const cancelled=state.appointments.filter(r=>r.status==='cancelado').length;
  $('metric-appointments-total').textContent=totalAppts.toLocaleString('en-US');
  $('metric-cancel-rate').textContent=totalAppts?`${Math.round(100*cancelled/totalAppts)}% cancelados`:'—';

  const revenue=state.appointments.filter(r=>r.status==='concluido').reduce((a,r)=>a+Number(r.servicos_catalogo?.preco_padrao||0),0);
  $('metric-revenue-total').textContent=money(revenue);
}

function destroyChart(id){if(state.charts[id]){state.charts[id].destroy();delete state.charts[id];}}

function renderPayrollCost(){
  const byBucket=new Map();
  state.payments.forEach(r=>{const k=bucketKey(r.semana_inicio);byBucket.set(k,(byBucket.get(k)||0)+Number(r.valor_liquido||0));});
  const buckets=sortedBuckets([...byBucket.keys()]);
  destroyChart('cost');
  state.charts.cost=new Chart($('chart-payroll-cost'),{
    type:'line',
    data:{labels:buckets.map(bucketLabel),datasets:[{label:'Custo líquido',data:buckets.map(k=>Number(byBucket.get(k).toFixed(2))),borderColor:COLORS.accent,backgroundColor:COLORS.accent,tension:.3,pointRadius:2}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{y:{beginAtZero:true}}}
  });
}

function renderHours(){
  const byBucket=new Map();
  state.payments.forEach(r=>{const k=bucketKey(r.semana_inicio);byBucket.set(k,(byBucket.get(k)||0)+Number(r.horas_trabalhadas||0));});
  const buckets=sortedBuckets([...byBucket.keys()]);
  destroyChart('hours');
  state.charts.hours=new Chart($('chart-hours'),{
    type:'bar',
    data:{labels:buckets.map(bucketLabel),datasets:[{label:'Horas',data:buckets.map(k=>Math.round(byBucket.get(k))),backgroundColor:COLORS.blue}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{y:{beginAtZero:true}}}
  });
}

function renderAppointments(){
  const done=new Map(),cancelled=new Map();
  state.appointments.forEach(r=>{
    const k=bucketKey(r.data);
    const target=r.status==='cancelado'?cancelled:done;
    target.set(k,(target.get(k)||0)+1);
  });
  const buckets=sortedBuckets(state.appointments.map(r=>bucketKey(r.data)));
  destroyChart('appts');
  state.charts.appts=new Chart($('chart-appointments'),{
    type:'bar',
    data:{labels:buckets.map(bucketLabel),datasets:[
      {label:'Realizados/Confirmados',data:buckets.map(k=>done.get(k)||0),backgroundColor:COLORS.positive},
      {label:'Cancelados',data:buckets.map(k=>cancelled.get(k)||0),backgroundColor:COLORS.negative}
    ]},
    options:{responsive:true,maintainAspectRatio:false,scales:{x:{stacked:true},y:{stacked:true,beginAtZero:true}}}
  });
}

function renderRevenue(){
  const byBucket=new Map();
  state.appointments.filter(r=>r.status==='concluido').forEach(r=>{
    const k=bucketKey(r.data);
    byBucket.set(k,(byBucket.get(k)||0)+Number(r.servicos_catalogo?.preco_padrao||0));
  });
  const buckets=sortedBuckets([...byBucket.keys()]);
  destroyChart('rev');
  state.charts.rev=new Chart($('chart-revenue'),{
    type:'bar',
    data:{labels:buckets.map(bucketLabel),datasets:[{label:'Receita estimada',data:buckets.map(k=>Number(byBucket.get(k).toFixed(2))),backgroundColor:COLORS.orange}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{y:{beginAtZero:true}}}
  });
}

function renderAll(){
  renderSummary();
  renderPayrollCost();
  renderHours();
  renderAppointments();
  renderRevenue();
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
}
init();
