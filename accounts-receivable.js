if(!window.KORBUILD_APP){const s=document.createElement('script');s.src='app-config.js?v=1.2.2';document.head.appendChild(s);}
const {url,publishableKey}=window.KORBUILD_SUPABASE;
const db=window.supabase.createClient(url,publishableKey,{auth:{persistSession:true,autoRefreshToken:true}});
const $=id=>document.getElementById(id);
const state={empresaId:null,currency:'BRL',clientes:[],rows:[]};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=v=>new Intl.NumberFormat(state.currency==='BRL'?'pt-BR':'en-US',{style:'currency',currency:state.currency}).format(Number(v||0));
const fmtDate=s=>s?new Date(s+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):'—';
function isoDate(d){return d.toISOString().slice(0,10);}
function firstDayOfMonth(){const d=new Date();return isoDate(new Date(d.getFullYear(),d.getMonth(),1));}
function lastDayOfMonth(){const d=new Date();return isoDate(new Date(d.getFullYear(),d.getMonth()+1,0));}
function msg(text,type='success'){const e=$('message');e.textContent=text;e.className=`message ${type}`;e.classList.remove('hidden');}
function receivableMsg(text,type='success'){const e=$('receivable-message');e.textContent=text;e.className=`message ${type}`;e.classList.remove('hidden');}
function closeMenu(){$('user-menu')?.classList.add('hidden');$('user-menu-btn')?.setAttribute('aria-expanded','false');}
const t=s=>window.KORbuildI18n?window.KORbuildI18n.t(s):s;
const STATUS_LABEL={
  'en-US':{pendente:'Pending',recebido:'Received',cancelado:'Cancelled'},
  'pt-BR':{pendente:'Pendente',recebido:'Recebido',cancelado:'Cancelado'}
};
function statusLabel(status){const lang=window.KORbuildI18n?window.KORbuildI18n.language:'en-US';return (STATUS_LABEL[lang]||STATUS_LABEL['en-US'])[status]||status;}

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
  state.currency=(data||[])[0]?.currency||'BRL';
}

async function loadClientes(){
  const {data,error}=await db.rpc('obter_clientes',{p_empresa_id:state.empresaId});
  if(error)throw error;
  state.clientes=data||[];
  const options=state.clientes.map(c=>`<option value="${c.id}">${esc(c.nome)}</option>`).join('');
  $('receivable-cliente').innerHTML='<option value="">'+t('Select a client')+'</option>'+options;
  $('filter-cliente').innerHTML='<option value="ALL">'+t('All clients')+'</option>'+options;
}

async function loadReceivables(){
  const dataInicio=$('filter-data-inicio').value||null;
  const dataFim=$('filter-data-fim').value||null;
  const statusFilter=$('filter-status').value;
  const clienteFilter=$('filter-cliente').value;

  const {data,error}=await db.rpc('obter_recebimentos',{
    p_empresa_id:state.empresaId,
    p_data_inicio:dataInicio,
    p_data_fim:dataFim,
    p_status:statusFilter==='ALL'?null:statusFilter,
    p_cliente_id:clienteFilter==='ALL'?null:clienteFilter
  });
  if(error)throw error;
  state.rows=data||[];
  render();
}

function render(){
  const rows=state.rows;
  const pending=rows.filter(r=>r.status==='pendente');
  const received=rows.filter(r=>r.status==='recebido');
  $('summary-pending-count').textContent=pending.length;
  $('summary-pending-total').textContent=pending.length?money(pending.reduce((sum,r)=>sum+Number(r.valor),0)):'—';
  $('summary-received-total').textContent=received.length?money(received.reduce((sum,r)=>sum+Number(r.valor),0)):'—';
  $('empty-state').classList.toggle('hidden',rows.length!==0);

  $('ar-body').innerHTML=rows.map(r=>{
    const canMarkReceived=r.status==='pendente';
    return `<tr data-id="${r.id}">
      <td><div class="team-name">${esc(r.descricao)}</div></td>
      <td>${esc(r.cliente_nome)}</td>
      <td>${fmtDate(r.data_prevista)}</td>
      <td class="pay-money">${money(r.valor)}</td>
      <td><span class="ap-status-tag ${r.status}">${esc(statusLabel(r.status))}</span></td>
      <td>${canMarkReceived?`<button type="button" class="small-btn" data-action="mark-received">${t('Mark as Received')}</button>`:''}</td>
    </tr>`;
  }).join('');
}

function openReceivableModal(){
  $('receivable-form').reset();
  $('receivable-message').classList.add('hidden');
  $('receivable-data-prevista').value=isoDate(new Date());
  $('receivable-modal').classList.remove('hidden');
}
function closeReceivableModal(){$('receivable-modal').classList.add('hidden');}

async function createReceivable(event){
  event.preventDefault();
  const clienteId=$('receivable-cliente').value;
  const descricao=$('receivable-descricao').value.trim();
  const valor=Number($('receivable-valor').value);
  const dataPrevista=$('receivable-data-prevista').value;

  if(!clienteId){receivableMsg(t('Select a client.'),'error');return;}
  if(!descricao){receivableMsg(t('Description is required.'),'error');return;}
  if(!Number.isFinite(valor)||valor<=0){receivableMsg(t('Enter a valid amount.'),'error');return;}
  if(!dataPrevista){receivableMsg(t('Select a due date.'),'error');return;}

  const btn=$('receivable-save');btn.disabled=true;const original=btn.textContent;btn.textContent=t('Saving...');
  const {error}=await db.rpc('criar_recebimento',{p_cliente_id:clienteId,p_descricao:descricao,p_valor:valor,p_data_prevista:dataPrevista});
  btn.disabled=false;btn.textContent=original;
  if(error){receivableMsg(`${t('Unable to create this receivable.')} ${error.message}`,'error');return;}
  closeReceivableModal();
  msg(t('Receivable created successfully.'));
  await loadReceivables();
}

async function markReceived(recebimentoId){
  const {error}=await db.rpc('marcar_recebimento_recebido',{p_recebimento_id:recebimentoId,p_data_recebimento:isoDate(new Date())});
  if(error){msg(`${t('Unable to mark this receivable as received.')} ${error.message}`,'error');return;}
  msg(t('Receivable marked as received.'));
  await loadReceivables();
}

$('add-receivable').addEventListener('click',openReceivableModal);
$('receivable-modal-close').addEventListener('click',closeReceivableModal);
$('receivable-cancel').addEventListener('click',closeReceivableModal);
$('receivable-modal').addEventListener('click',e=>{if(e.target.id==='receivable-modal')closeReceivableModal();});
$('receivable-form').addEventListener('submit',createReceivable);
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeReceivableModal();});

$('ar-body').addEventListener('click',e=>{
  const btn=e.target.closest('button[data-action="mark-received"]');if(!btn)return;
  markReceived(btn.closest('tr').dataset.id);
});
$('filter-data-inicio').addEventListener('change',()=>loadReceivables().catch(e=>msg(e.message,'error')));
$('filter-data-fim').addEventListener('change',()=>loadReceivables().catch(e=>msg(e.message,'error')));
$('filter-status').addEventListener('change',()=>loadReceivables().catch(e=>msg(e.message,'error')));
$('filter-cliente').addEventListener('change',()=>loadReceivables().catch(e=>msg(e.message,'error')));

$('user-menu-btn')?.addEventListener('click',e=>{e.stopPropagation();const menu=$('user-menu');const hidden=menu.classList.toggle('hidden');$('user-menu-btn').setAttribute('aria-expanded',String(!hidden));});
document.addEventListener('click',e=>{if(!e.target.closest('.user-menu-wrap'))closeMenu();});
$('menu-logout')?.addEventListener('click',async()=>{await db.auth.signOut();location.href='index.html';});

async function init(){
  if(!(await loadProfile()))return;
  $('filter-data-inicio').value=firstDayOfMonth();
  $('filter-data-fim').value=lastDayOfMonth();
  try{
    await loadConfig();
    await loadClientes();
    await loadReceivables();
    $('add-receivable').disabled=false;
  }catch(e){console.error(e);msg(`${t('Unable to load Accounts Receivable.')} ${e.message||''}`,'error');}
}
init();
