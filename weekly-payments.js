if(!window.KORBUILD_APP){const s=document.createElement('script');s.src='app-config.js?v=1.2.2';document.head.appendChild(s);}
const {url,publishableKey}=window.KORBUILD_SUPABASE;
const db=window.supabase.createClient(url,publishableKey,{auth:{persistSession:true,autoRefreshToken:true}});
const $=id=>document.getElementById(id);
const state={empresaId:null,weekStartDay:1,colaboradores:[],rows:new Map()};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=v=>'$'+Number(v||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
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
}

async function loadColaboradores(){
  const {data,error}=await db.from('colaboradores').select('id,name').eq('empresa_id',state.empresaId).eq('active',true).order('name');
  if(error)throw error;
  state.colaboradores=data||[];
}

function weekEnd(){return addDays($('week-start').value,6);}

async function loadPayments(){
  clearMsg();
  const weekStart=$('week-start').value;
  const weekEndDate=weekEnd();
  $('week-range').textContent=`${fmtDate(weekStart)} → ${fmtDate(weekEndDate)}`;
  state.rows=new Map();

  const {data:existing,error:existingError}=await db.rpc('obter_pagamentos_semanais',{p_empresa_id:state.empresaId,p_semana_inicio:weekStart,p_semana_fim:weekEndDate});
  if(existingError)throw existingError;
  const existingMap=new Map((existing||[]).filter(p=>p.semana_inicio===weekStart).map(p=>[p.colaborador_id,p]));

  const previewTargets=state.colaboradores.filter(c=>!existingMap.has(c.id));
  const previews=await Promise.allSettled(previewTargets.map(c=>
    db.rpc('calcular_pagamento_semanal',{p_empresa_id:state.empresaId,p_colaborador_id:c.id,p_semana_inicio:weekStart})
  ));

  state.colaboradores.forEach(c=>{
    const existingRow=existingMap.get(c.id);
    if(existingRow){
      state.rows.set(c.id,{
        colaboradorId:c.id,name:c.name,
        horas:Number(existingRow.horas_trabalhadas),
        valorHora:Number(existingRow.valor_hora_aplicado),
        adiantamento:Number(existingRow.adiantamento),
        status:existingRow.status_pagamento,
        registered:true,rateMissing:false,error:null
      });
      return;
    }
    const idx=previewTargets.indexOf(c);
    const result=previews[idx];
    if(result?.status==='fulfilled'&&!result.value.error&&result.value.data?.[0]){
      const p=result.value.data[0];
      state.rows.set(c.id,{
        colaboradorId:c.id,name:c.name,
        horas:Number(p.horas_trabalhadas),
        valorHora:Number(p.valor_hora_aplicado),
        adiantamento:0,status:'pendente',
        registered:false,rateMissing:false,error:null
      });
    }else{
      const errorMessage=result?.value?.error?.message||result?.reason?.message||'No hourly rate registered';
      state.rows.set(c.id,{
        colaboradorId:c.id,name:c.name,
        horas:0,valorHora:0,adiantamento:0,status:'pendente',
        registered:false,rateMissing:true,error:errorMessage
      });
    }
  });

  render();
}

function rowTotals(row){
  const bruto=row.horas*row.valorHora;
  const liquido=bruto-row.adiantamento;
  return {bruto,liquido};
}

function render(){
  const rows=[...state.rows.values()];
  $('summary-people').textContent=rows.length;
  $('summary-missing').textContent=rows.filter(r=>r.rateMissing).length;
  $('summary-net').textContent=money(rows.reduce((sum,r)=>sum+rowTotals(r).liquido,0));
  $('empty-state').classList.toggle('hidden',rows.length!==0);

  $('payments-body').innerHTML=rows.map(r=>{
    if(r.rateMissing){
      return `<tr data-id="${r.colaboradorId}">
        <td><div class="team-name">${esc(r.name)}</div><div class="pay-rate-missing">No hourly rate registered</div></td>
        <td colspan="5" class="pay-rate-missing">Register an hourly rate for this person before calculating a payment.</td>
        <td><div class="pay-row-actions"><input type="number" min="0" step="0.01" class="pay-new-rate" placeholder="$/hr" style="width:70px"><button type="button" class="pay-save-btn" data-action="set-rate">Set rate</button></div></td>
      </tr>`;
    }
    const {bruto,liquido}=rowTotals(r);
    return `<tr data-id="${r.colaboradorId}">
      <td><div class="team-name">${esc(r.name)}</div>${r.registered?'<div class="pay-status-tag '+r.status+'">'+esc(payStatusLabel(r.status))+'</div>':''}</td>
      <td><input type="number" min="0" step="0.25" class="pay-horas" value="${r.horas}"></td>
      <td class="pay-money">${money(r.valorHora)}</td>
      <td class="pay-money pay-bruto">${money(bruto)}</td>
      <td><input type="number" min="0" step="0.01" class="pay-adiantamento" value="${r.adiantamento}"></td>
      <td class="pay-money net pay-liquido">${money(liquido)}</td>
      <td><select class="pay-status">
        <option value="pendente" ${r.status==='pendente'?'selected':''}>${esc(payStatusLabel('pendente'))}</option>
        <option value="parcial" ${r.status==='parcial'?'selected':''}>${esc(payStatusLabel('parcial'))}</option>
        <option value="pago" ${r.status==='pago'?'selected':''}>${esc(payStatusLabel('pago'))}</option>
      </select></td>
      <td><div class="pay-row-actions"><button type="button" class="pay-recalc-btn" data-action="recalc">↻</button><button type="button" class="pay-save-btn" data-action="save">${r.registered?'Update':'Register'}</button></div></td>
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
  const weekStart=$('week-start').value;
  const {data,error}=await db.rpc('calcular_pagamento_semanal',{p_empresa_id:state.empresaId,p_colaborador_id:colaboradorId,p_semana_inicio:weekStart});
  if(error){msg(`${t("Unable to recalculate.")} ${error.message}`,'error');return;}
  const preview=data?.[0];
  const row=state.rows.get(colaboradorId);
  if(row&&preview){
    row.horas=Number(preview.horas_trabalhadas);
    row.valorHora=Number(preview.valor_hora_aplicado);
    row.rateMissing=false;
  }
  render();
}

async function setRate(tr){
  const colaboradorId=tr.dataset.id;
  const input=tr.querySelector('.pay-new-rate');
  const value=Number(input?.value);
  if(!Number.isFinite(value)||value<0){msg('Enter a valid hourly rate.','error');return;}
  const {error}=await db.rpc('registrar_valor_hora',{
    p_empresa_id:state.empresaId,
    p_colaborador_id:colaboradorId,
    p_valor_hora:value,
    p_vigente_de:$('week-start').value
  });
  if(error){msg(`${t("Unable to register the hourly rate.")} ${error.message}`,'error');return;}
  msg(t('Hourly rate registered.'));
  await loadPayments();
}

async function saveRow(colaboradorId){
  const weekStart=$('week-start').value;
  const weekEndDate=weekEnd();
  const row=state.rows.get(colaboradorId);
  if(!row)return;
  const {error}=await db.rpc('registrar_pagamento',{
    p_empresa_id:state.empresaId,
    p_colaborador_id:colaboradorId,
    p_semana_inicio:weekStart,
    p_semana_fim:weekEndDate,
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
  const {bruto,liquido}=rowTotals(state.rows.get(tr.dataset.id));
  tr.querySelector('.pay-bruto')&&(tr.querySelector('.pay-bruto').textContent=money(bruto));
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
  if(btn.dataset.action==='set-rate')setRate(tr);
});

$('user-menu-btn')?.addEventListener('click',e=>{e.stopPropagation();const menu=$('user-menu');const hidden=menu.classList.toggle('hidden');$('user-menu-btn').setAttribute('aria-expanded',String(!hidden));});
document.addEventListener('click',e=>{if(!e.target.closest('.user-menu-wrap'))closeMenu();});
$('menu-logout')?.addEventListener('click',async()=>{await db.auth.signOut();location.href='index.html';});
$('week-start').addEventListener('change',()=>loadPayments().catch(e=>msg(e.message,'error')));
$('reload-btn').addEventListener('click',()=>loadPayments().catch(e=>msg(e.message,'error')));

async function init(){
  if(!(await loadProfile()))return;
  try{
    await loadConfig();
    $('week-start').value=defaultWeekStart(state.weekStartDay);
    await loadColaboradores();
    await loadPayments();
  }catch(e){console.error(e);msg(`${t("Unable to load Weekly Payments.")} ${e.message||''}`,'error');}
}
init();
