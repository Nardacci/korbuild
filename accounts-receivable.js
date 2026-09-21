if(!window.KORBUILD_APP){const s=document.createElement('script');s.src='app-config.js?v=1.2.2';document.head.appendChild(s);}
const {url,publishableKey}=window.KORBUILD_SUPABASE;
const db=window.supabase.createClient(url,publishableKey,{auth:{persistSession:true,autoRefreshToken:true}});
const $=id=>document.getElementById(id);
const state={empresaId:null,currency:'BRL',clientes:[],rows:[],currentDetail:null,editingRecebimentoId:null};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=v=>new Intl.NumberFormat(state.currency==='BRL'?'pt-BR':'en-US',{style:'currency',currency:state.currency}).format(Number(v||0));
const fmtDate=s=>s?new Date(s+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):'—';
function isoDate(d){return d.toISOString().slice(0,10);}
function firstDayOfMonth(){const d=new Date();return isoDate(new Date(d.getFullYear(),d.getMonth(),1));}
function lastDayOfMonth(){const d=new Date();return isoDate(new Date(d.getFullYear(),d.getMonth()+1,0));}
function msg(text,type='success'){const e=$('message');e.textContent=text;e.className=`message ${type}`;e.classList.remove('hidden');}
function detailMsg(text,type='success'){const e=$('detail-message');e.textContent=text;e.className=`message ${type}`;e.classList.remove('hidden');}
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
}

// Fetches the full period, all statuses -- status filtering now only
// happens inside the client drill-down, same reasoning as Accounts
// Payable's own despesa/payroll groups: a group already shows pending and
// received side by side, so a status filter at that level would fight
// against showing both at once.
async function loadReceivables(){
  const dataInicio=$('filter-data-inicio').value||null;
  const dataFim=$('filter-data-fim').value||null;

  const {data,error}=await db.rpc('obter_recebimentos',{
    p_empresa_id:state.empresaId,
    p_data_inicio:dataInicio,
    p_data_fim:dataFim,
    p_status:null,
    p_cliente_id:null
  });
  if(error)throw error;
  state.rows=data||[];

  renderSummary();
  if(state.currentDetail)renderDetail();
}

function computeGroups(){
  const groups=new Map();
  for(const r of state.rows){
    const key=r.cliente_id;
    if(!groups.has(key))groups.set(key,{key,label:r.cliente_nome,pending:0,received:0,count:0});
    const g=groups.get(key);
    g.count++;
    if(r.status==='pendente')g.pending+=Number(r.valor);
    else if(r.status==='recebido')g.received+=Number(r.valor);
  }
  return [...groups.values()].sort((a,b)=>a.label.localeCompare(b.label));
}

function renderSummary(){
  const rows=state.rows;
  const pending=rows.filter(r=>r.status==='pendente');
  const received=rows.filter(r=>r.status==='recebido');
  $('summary-pending-count').textContent=pending.length;
  $('summary-pending-total').textContent=pending.length?money(pending.reduce((sum,r)=>sum+Number(r.valor),0)):'—';
  $('summary-received-total').textContent=received.length?money(received.reduce((sum,r)=>sum+Number(r.valor),0)):'—';

  const groups=computeGroups();
  $('empty-state').classList.toggle('hidden',groups.length!==0);
  $('ar-groups-body').innerHTML=groups.map(g=>`<tr class="ap-group-row" data-key="${g.key}" data-label="${esc(g.label)}">
    <td><div class="team-name">${esc(g.label)}</div></td>
    <td class="pay-money">${g.pending?money(g.pending):'—'}</td>
    <td class="pay-money">${g.received?money(g.received):'—'}</td>
    <td>${g.count}</td>
    <td><button type="button" class="small-btn" data-action="view-group">${t('View')}</button></td>
  </tr>`).join('');
}

function openDetail(clienteId,label){
  state.currentDetail={clienteId,label};
  $('detail-heading').textContent=label;
  const dataInicio=$('filter-data-inicio').value;
  const dataFim=$('filter-data-fim').value;
  $('detail-subheading').textContent=`${fmtDate(dataInicio)} → ${fmtDate(dataFim)}`;
  $('detail-filter-status').value='ALL';
  $('summary-view').classList.add('hidden');
  $('detail-view').classList.remove('hidden');
  renderDetail();
}

function closeDetail(){
  state.currentDetail=null;
  $('detail-view').classList.add('hidden');
  $('summary-view').classList.remove('hidden');
}

function renderDetail(){
  if(!state.currentDetail)return;
  const statusFilter=$('detail-filter-status').value;
  let rows=state.rows.filter(r=>r.cliente_id===state.currentDetail.clienteId);
  if(statusFilter!=='ALL')rows=rows.filter(r=>r.status===statusFilter);

  $('detail-empty-state').classList.toggle('hidden',rows.length!==0);
  $('ar-detail-body').innerHTML=rows.map(r=>{
    const canMarkReceived=r.status==='pendente';
    return `<tr data-id="${r.id}">
      <td><div class="team-name">${esc(r.descricao)}</div></td>
      <td>${fmtDate(r.data_prevista)}</td>
      <td class="pay-money">${money(r.valor)}</td>
      <td><span class="ap-status-tag ${r.status}">${esc(statusLabel(r.status))}</span></td>
      <td><div class="row-actions"><button type="button" class="small-btn" data-action="edit-receivable">${t('Edit')}</button>${canMarkReceived?`<button type="button" class="small-btn" data-action="mark-received">${t('Mark as Received')}</button>`:''}</div></td>
    </tr>`;
  }).join('');
}

function openReceivableModal(){
  state.editingRecebimentoId=null;
  $('receivable-form').reset();
  $('receivable-message').classList.add('hidden');
  $('receivable-cliente').disabled=false;
  $('receivable-modal-title').textContent=t('New Receivable');
  $('receivable-save').textContent=t('Create Receivable');
  $('receivable-data-prevista').value=isoDate(new Date());
  $('receivable-modal').classList.remove('hidden');
}

// The client a receivable is owed by isn't editable here -- changing it
// would change whose debt this is, not just correct a record. The RPC
// (atualizar_recebimento) does accept a p_cliente_id and would honor a
// change, but the dropdown is locked in the UI and the original id is
// always the one sent back, regardless of what the (disabled) select's
// value reads.
function openEditReceivableModal(recebimentoId){
  const r=state.rows.find(x=>x.id===recebimentoId);
  if(!r)return;
  state.editingRecebimentoId=recebimentoId;
  $('receivable-form').reset();
  $('receivable-message').classList.add('hidden');
  $('receivable-modal-title').textContent=t('Edit Receivable');
  $('receivable-save').textContent=t('Save Changes');
  $('receivable-cliente').value=r.cliente_id;
  $('receivable-cliente').disabled=true;
  $('receivable-descricao').value=r.descricao||'';
  $('receivable-valor').value=r.valor;
  $('receivable-data-prevista').value=r.data_prevista;
  $('receivable-modal').classList.remove('hidden');
}

function closeReceivableModal(){$('receivable-modal').classList.add('hidden');state.editingRecebimentoId=null;$('receivable-cliente').disabled=false;}

async function createReceivable(event){
  event.preventDefault();
  const editing=state.editingRecebimentoId;
  const original=editing?state.rows.find(x=>x.id===editing):null;
  const clienteId=editing?original.cliente_id:$('receivable-cliente').value;
  const descricao=$('receivable-descricao').value.trim();
  const valor=Number($('receivable-valor').value);
  const dataPrevista=$('receivable-data-prevista').value;

  if(!clienteId){receivableMsg(t('Select a client.'),'error');return;}
  if(!descricao){receivableMsg(t('Description is required.'),'error');return;}
  if(!Number.isFinite(valor)||valor<=0){receivableMsg(t('Enter a valid amount.'),'error');return;}
  if(!dataPrevista){receivableMsg(t('Select a due date.'),'error');return;}

  const btn=$('receivable-save');btn.disabled=true;const originalLabel=btn.textContent;btn.textContent=t('Saving...');
  const {error}=editing
    ?await db.rpc('atualizar_recebimento',{p_recebimento_id:editing,p_cliente_id:clienteId,p_descricao:descricao,p_valor:valor,p_data_prevista:dataPrevista})
    :await db.rpc('criar_recebimento',{p_cliente_id:clienteId,p_descricao:descricao,p_valor:valor,p_data_prevista:dataPrevista});
  btn.disabled=false;btn.textContent=originalLabel;
  if(error){
    receivableMsg(`${editing?t('Unable to update this receivable.'):t('Unable to create this receivable.')} ${error.message}`,'error');
    return;
  }
  closeReceivableModal();
  if(editing)detailMsg(t('Receivable updated successfully.'));
  else msg(t('Receivable created successfully.'));
  await loadReceivables();
}

async function markReceived(recebimentoId){
  const {error}=await db.rpc('marcar_recebimento_recebido',{p_recebimento_id:recebimentoId,p_data_recebimento:isoDate(new Date())});
  if(error){detailMsg(`${t('Unable to mark this receivable as received.')} ${error.message}`,'error');return;}
  detailMsg(t('Receivable marked as received.'));
  await loadReceivables();
}

$('add-receivable').addEventListener('click',openReceivableModal);
$('receivable-modal-close').addEventListener('click',closeReceivableModal);
$('receivable-cancel').addEventListener('click',closeReceivableModal);
$('receivable-modal').addEventListener('click',e=>{if(e.target.id==='receivable-modal')closeReceivableModal();});
$('receivable-form').addEventListener('submit',createReceivable);
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeReceivableModal();});

$('ar-groups-body').addEventListener('click',e=>{
  const row=e.target.closest('tr[data-key]');if(!row)return;
  openDetail(row.dataset.key,row.dataset.label);
});
$('back-to-summary').addEventListener('click',closeDetail);
$('detail-filter-status').addEventListener('change',renderDetail);

$('ar-detail-body').addEventListener('click',e=>{
  const editBtn=e.target.closest('button[data-action="edit-receivable"]');
  if(editBtn){openEditReceivableModal(editBtn.closest('tr').dataset.id);return;}
  const btn=e.target.closest('button[data-action="mark-received"]');if(!btn)return;
  markReceived(btn.closest('tr').dataset.id);
});
$('filter-data-inicio').addEventListener('change',()=>loadReceivables().catch(e=>msg(e.message,'error')));
$('filter-data-fim').addEventListener('change',()=>loadReceivables().catch(e=>msg(e.message,'error')));

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
