if(!window.KORBUILD_APP){const s=document.createElement('script');s.src='app-config.js?v=1.2.2';document.head.appendChild(s);}
const {url,publishableKey}=window.KORBUILD_SUPABASE;
const db=window.supabase.createClient(url,publishableKey,{auth:{persistSession:true,autoRefreshToken:true}});
const $=id=>document.getElementById(id);
const state={empresaId:null,weekStartDay:1,currency:'BRL',weekStart:null,weekEnd:null,colaboradores:[],rows:new Map(),missingRateCount:0};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// The company's own configuracoes_folha.currency, not the interface
// language -- Payment is a real payroll record, so its currency must
// always show a currency code (never a bare number), matching whatever
// the company configured in Payroll Settings.
const money=v=>new Intl.NumberFormat(state.currency==='BRL'?'pt-BR':'en-US',{style:'currency',currency:state.currency}).format(Number(v||0));
const fmtDate=s=>s?new Date(s+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):'—';
function isoDate(d){return d.toISOString().slice(0,10);}
function addDays(dateStr,days){const d=new Date(dateStr+'T00:00:00');d.setDate(d.getDate()+days);return isoDate(d);}
function msg(text,type='success'){const e=$('message');e.textContent=text;e.className=`message ${type}`;e.classList.remove('hidden');}
function clearMsg(){$('message')?.classList.add('hidden');}
function closeMenu(){$('user-menu')?.classList.add('hidden');$('user-menu-btn')?.setAttribute('aria-expanded','false');}
const t=s=>window.KORbuildI18n?window.KORbuildI18n.t(s):s;
const PAY_STATUS_LABEL={
  'en-US':{pendente:'Pending',parcial:'Partial',pago:'Paid'},
  'pt-BR':{pendente:'Pendente',parcial:'Parcial',pago:'Pago'}
};
function payStatusLabel(status){const lang=window.KORbuildI18n?window.KORbuildI18n.language:'en-US';return (PAY_STATUS_LABEL[lang]||PAY_STATUS_LABEL['en-US'])[status]||status;}

function defaultWeekStart(targetDay){
  const d=new Date();d.setHours(0,0,0,0);
  const delta=(d.getDay()-targetDay+7)%7;
  d.setDate(d.getDate()-delta);
  return isoDate(d);
}

async function loadProfile(){
  const {data:{session},error}=await db.auth.getSession();
  if(error||!session?.user){location.href='index.html';return false;}
  const {data:profile,error:profileError}=await db.from('usuarios').select('id,name,empresa_id,empresas(name)').eq('id',session.user.id).maybeSingle();
  if(profileError||!profile?.empresa_id){msg(profileError?.message||t('Unable to load workspace profile.'),'error');return false;}
  state.empresaId=profile.empresa_id;
  const company=profile.empresas?.name||'KORbuild Demo';
  const name=profile.name?.trim()&&profile.name!=='Owner'?profile.name:session.user.user_metadata?.full_name||`${company} Owner`;
  const initial=name.trim().charAt(0).toUpperCase()||'O';
  $('user-name').textContent=name;$('user-email').textContent=session.user.email||'';
  $('user-avatar').textContent=initial;$('menu-avatar').textContent=initial;$('menu-full-name').textContent=name;$('menu-full-email').textContent=session.user.email||'';
  return true;
}

async function loadConfig(){
  const {data,error}=await db.rpc('obter_configuracoes_folha',{p_empresa_id:state.empresaId});
  if(error)throw error;
  const config=(data||[])[0];
  state.weekStartDay=config?config.dia_inicio_semana:1;
  state.currency=config?.currency||'BRL';
}

async function loadColaboradores(){
  const {data,error}=await db.from('colaboradores').select('id,name').eq('empresa_id',state.empresaId).eq('active',true).order('name');
  if(error)throw error;
  state.colaboradores=data||[];
}

// Which of the active colaboradores actually have an hourly rate effective
// for this specific week -- a single bulk read against historico_valor_hora
// mirroring the same date-window logic calcular_pagamento_semanal() and
// registrar_pagamento() already use internally, so eligibility here always
// agrees with what those RPCs would do.
async function loadEffectiveRates(weekStart){
  const {data,error}=await db.from('historico_valor_hora')
    .select('colaborador_id,valor_hora')
    .eq('empresa_id',state.empresaId)
    .lte('vigente_de',weekStart)
    .or(`vigente_ate.is.null,vigente_ate.gte.${weekStart}`);
  if(error)throw error;
  const map=new Map();
  (data||[]).forEach(r=>map.set(r.colaborador_id,Number(r.valor_hora)));
  return map;
}

// Sum of that week's still-pending loan installments, per collaborator --
// used only to pre-fill "Loan" on a freshly auto-created row (see loans.js
// for how installments are created; registrar_pagamento() marks them
// descontado once folded into a payment here).
async function loadPendingLoanInstallments(weekStart){
  const {data,error}=await db.rpc('obter_parcelas_da_semana',{p_empresa_id:state.empresaId,p_semana_inicio:weekStart});
  if(error)throw error;
  const map=new Map();
  (data||[]).forEach(r=>map.set(r.colaborador_id,Number(r.valor_parcelas)));
  return map;
}

function rowTotals(row){
  const bruto=row.horas*row.valorHora;
  const liquido=bruto-row.adiantamento;
  return {bruto,liquido};
}

async function loadPayments(){
  clearMsg();
  state.weekStart=defaultWeekStart(state.weekStartDay);
  state.weekEnd=addDays(state.weekStart,6);
  $('week-range').textContent=`${t('Week of')} ${fmtDate(state.weekStart)} → ${fmtDate(state.weekEnd)}`;
  state.rows=new Map();

  const ratesMap=await loadEffectiveRates(state.weekStart);
  const eligible=state.colaboradores.filter(c=>ratesMap.has(c.id));
  const missing=state.colaboradores.filter(c=>!ratesMap.has(c.id));
  state.missingRateCount=missing.length;
  renderMissingRateBanner();
  const loansMap=await loadPendingLoanInstallments(state.weekStart);

  const {data:existing,error:existingError}=await db.rpc('obter_pagamentos_semanais',{p_empresa_id:state.empresaId,p_semana_inicio:state.weekStart,p_semana_fim:state.weekEnd});
  if(existingError)throw existingError;
  const existingMap=new Map((existing||[]).filter(p=>p.semana_inicio===state.weekStart).map(p=>[p.colaborador_id,p]));

  // Eligible people with no row yet for this week get one created now --
  // this is the whole point of the redesign: opening the screen is what
  // makes the week ready, instead of a manual "open/close week" step.
  const toCreate=eligible.filter(c=>!existingMap.has(c.id));
  const created=await Promise.allSettled(toCreate.map(async c=>{
    let horas=0,valorHora=ratesMap.get(c.id);
    try{
      const {data,error}=await db.rpc('calcular_pagamento_semanal',{p_empresa_id:state.empresaId,p_colaborador_id:c.id,p_semana_inicio:state.weekStart});
      if(!error&&data?.[0]){horas=Number(data[0].horas_trabalhadas);valorHora=Number(data[0].valor_hora_aplicado);}
    }catch{/* schedule preview is best-effort -- still register the row below with horas=0 for manual entry */}
    const adiantamento=loansMap.get(c.id)||0;
    const {error:regError}=await db.rpc('registrar_pagamento',{
      p_empresa_id:state.empresaId,p_colaborador_id:c.id,
      p_semana_inicio:state.weekStart,p_semana_fim:state.weekEnd,
      p_horas_trabalhadas:horas,p_valor_hora_aplicado:valorHora,
      p_adiantamento:adiantamento,p_status_pagamento:'pendente'
    });
    if(regError)throw regError;
    return {colaboradorId:c.id,name:c.name,horas,valorHora,adiantamento};
  }));

  let creationErrors=0;
  created.forEach((result,i)=>{
    if(result.status==='fulfilled'){
      const r=result.value;
      state.rows.set(r.colaboradorId,{colaboradorId:r.colaboradorId,name:r.name,horas:r.horas,valorHora:r.valorHora,adiantamento:r.adiantamento,status:'pendente',registered:true});
    }else{
      creationErrors++;
      console.error('Unable to create payment row for',toCreate[i]?.name,result.reason);
    }
  });
  if(creationErrors)msg(t("Unable to create this week's payment rows."),'error');

  eligible.forEach(c=>{
    const existingRow=existingMap.get(c.id);
    if(!existingRow)return; // already handled above (created or failed)
    state.rows.set(c.id,{
      colaboradorId:c.id,name:c.name,
      horas:Number(existingRow.horas_trabalhadas),
      valorHora:Number(existingRow.valor_hora_aplicado),
      adiantamento:Number(existingRow.adiantamento),
      status:existingRow.status_pagamento,
      registered:true
    });
  });

  render();
}

function renderMissingRateBanner(){
  const banner=$('missing-rate-banner');
  if(!state.missingRateCount){banner.classList.add('hidden');return;}
  $('missing-rate-text').textContent=`${state.missingRateCount} ${state.missingRateCount===1?'person':'people'} without an hourly rate registered`;
  banner.classList.remove('hidden');
}

function render(){
  const rows=state.colaboradores.filter(c=>state.rows.has(c.id)).map(c=>state.rows.get(c.id));
  $('summary-people').textContent=rows.length;
  $('summary-net').textContent=money(rows.reduce((sum,r)=>sum+rowTotals(r).liquido,0));
  $('empty-state').classList.toggle('hidden',rows.length!==0);

  $('payments-body').innerHTML=rows.map(r=>{
    const {liquido}=rowTotals(r);
    return `<tr data-id="${r.colaboradorId}">
      <td><div class="team-name">${esc(r.name)}</div><div class="pay-rate-hint">${money(r.valorHora)}/hr</div><div class="pay-status-tag ${r.status}">${esc(payStatusLabel(r.status))}</div></td>
      <td><input type="number" min="0" step="0.25" class="pay-horas" value="${r.horas}"></td>
      <td><input type="number" min="0" step="0.01" class="pay-adiantamento" value="${r.adiantamento}"></td>
      <td class="pay-money net pay-liquido">${money(liquido)}</td>
      <td><select class="pay-status">
        <option value="pendente" ${r.status==='pendente'?'selected':''}>${esc(payStatusLabel('pendente'))}</option>
        <option value="parcial" ${r.status==='parcial'?'selected':''}>${esc(payStatusLabel('parcial'))}</option>
        <option value="pago" ${r.status==='pago'?'selected':''}>${esc(payStatusLabel('pago'))}</option>
      </select></td>
      <td><div class="pay-row-actions"><button type="button" class="pay-recalc-btn" data-action="recalc">↻</button><button type="button" class="pay-save-btn" data-action="save">${t('Update')}</button></div></td>
    </tr>`;
  }).join('');
}

function readRowInputs(tr){
  const row=state.rows.get(tr.dataset.id);
  row.horas=Math.max(0,Number(tr.querySelector('.pay-horas')?.value)||0);
  row.adiantamento=Math.max(0,Number(tr.querySelector('.pay-adiantamento')?.value)||0);
  row.status=tr.querySelector('.pay-status')?.value||'pendente';
  return row;
}

async function recalc(colaboradorId){
  const {data,error}=await db.rpc('calcular_pagamento_semanal',{p_empresa_id:state.empresaId,p_colaborador_id:colaboradorId,p_semana_inicio:state.weekStart});
  if(error){msg(`${t("Unable to recalculate.")} ${error.message}`,'error');return;}
  const preview=data?.[0];
  const row=state.rows.get(colaboradorId);
  if(row&&preview){
    row.horas=Number(preview.horas_trabalhadas);
    row.valorHora=Number(preview.valor_hora_aplicado);
  }
  render();
}

async function saveRow(colaboradorId){
  const row=state.rows.get(colaboradorId);
  if(!row)return;
  const {error}=await db.rpc('registrar_pagamento',{
    p_empresa_id:state.empresaId,
    p_colaborador_id:colaboradorId,
    p_semana_inicio:state.weekStart,
    p_semana_fim:state.weekEnd,
    p_horas_trabalhadas:row.horas,
    p_adiantamento:row.adiantamento,
    p_status_pagamento:row.status
  });
  if(error){msg(`${t("Unable to register this payment.")} ${error.message}`,'error');return;}
  row.registered=true;
  msg(`${t("Payment registered for")} ${row.name}.`);
  await loadPayments();
}

$('payments-body').addEventListener('input',e=>{
  const tr=e.target.closest('tr[data-id]');if(!tr)return;
  readRowInputs(tr);
  const {liquido}=rowTotals(state.rows.get(tr.dataset.id));
  tr.querySelector('.pay-liquido')&&(tr.querySelector('.pay-liquido').textContent=money(liquido));
  $('summary-net').textContent=money([...state.rows.values()].reduce((sum,r)=>sum+rowTotals(r).liquido,0));
});
$('payments-body').addEventListener('change',e=>{
  const tr=e.target.closest('tr[data-id]');if(!tr)return;
  readRowInputs(tr);
});
$('payments-body').addEventListener('click',e=>{
  const btn=e.target.closest('button[data-action]');if(!btn)return;
  const tr=btn.closest('tr[data-id]');if(!tr)return;
  readRowInputs(tr);
  if(btn.dataset.action==='recalc')recalc(tr.dataset.id);
  if(btn.dataset.action==='save')saveRow(tr.dataset.id);
});

$('user-menu-btn')?.addEventListener('click',e=>{e.stopPropagation();const menu=$('user-menu');const hidden=menu.classList.toggle('hidden');$('user-menu-btn').setAttribute('aria-expanded',String(!hidden));});
document.addEventListener('click',e=>{if(!e.target.closest('.user-menu-wrap'))closeMenu();});
$('menu-logout')?.addEventListener('click',async()=>{await db.auth.signOut();location.href='index.html';});
$('reload-btn').addEventListener('click',()=>loadPayments().catch(e=>msg(e.message,'error')));

async function init(){
  if(!(await loadProfile()))return;
  try{
    await loadConfig();
    await loadColaboradores();
    await loadPayments();
  }catch(e){console.error(e);msg(`${t("Unable to load Weekly Payments.")} ${e.message||''}`,'error');}
}
init();
