if(!window.KORBUILD_APP){const s=document.createElement('script');s.src='app-config.js?v=1.2.2';document.head.appendChild(s);}
const {url,publishableKey}=window.KORBUILD_SUPABASE;
const db=window.supabase.createClient(url,publishableKey,{auth:{persistSession:true,autoRefreshToken:true}});
const $=id=>document.getElementById(id);
const state={empresaId:null,currency:'BRL',categorias:[],rows:[],despesaById:new Map(),currentDetail:null,editingDespesaId:null};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=v=>new Intl.NumberFormat(state.currency==='BRL'?'pt-BR':'en-US',{style:'currency',currency:state.currency}).format(Number(v||0));
const fmtDate=s=>s?new Date(s+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):'—';
function isoDate(d){return d.toISOString().slice(0,10);}
function firstDayOfMonth(){const d=new Date();return isoDate(new Date(d.getFullYear(),d.getMonth(),1));}
function lastDayOfMonth(){const d=new Date();return isoDate(new Date(d.getFullYear(),d.getMonth()+1,0));}
function msg(text,type='success'){const e=$('message');e.textContent=text;e.className=`message ${type}`;e.classList.remove('hidden');}
function detailMsg(text,type='success'){const e=$('detail-message');e.textContent=text;e.className=`message ${type}`;e.classList.remove('hidden');}
function expenseMsg(text,type='success'){const e=$('expense-message');e.textContent=text;e.className=`message ${type}`;e.classList.remove('hidden');}
function categoriesMsg(text,type='success'){const e=$('categories-message');e.textContent=text;e.className=`message ${type}`;e.classList.remove('hidden');}
function closeMenu(){$('user-menu')?.classList.add('hidden');$('user-menu-btn')?.setAttribute('aria-expanded','false');}
const t=s=>window.KORbuildI18n?window.KORbuildI18n.t(s):s;
const STATUS_LABEL={
  'en-US':{provisionado:'Provisioned',pago:'Paid',cancelado:'Cancelled',pendente:'Pending',parcial:'Partial'},
  'pt-BR':{provisionado:'Provisionado',pago:'Pago',cancelado:'Cancelado',pendente:'Pendente',parcial:'Parcial'}
};
function statusLabel(status){const lang=window.KORbuildI18n?window.KORbuildI18n.language:'en-US';return (STATUS_LABEL[lang]||STATUS_LABEL['en-US'])[status]||status;}
const ORIGIN_LABEL={'en-US':{despesa:'Expense',folha:'Payroll'},'pt-BR':{despesa:'Despesa',folha:'Folha'}};
function originLabel(origem){const lang=window.KORbuildI18n?window.KORbuildI18n.language:'en-US';return (ORIGIN_LABEL[lang]||ORIGIN_LABEL['en-US'])[origem]||origem;}
// Local map, not routed through t()/DICT: "Active"/"Inactive" collide with
// an existing plural-context DICT entry elsewhere in the app ("Ativas"),
// and "Activate"/"Deactivate" have no DICT entry at all -- same safe
// pattern already used for status pills in schedule.js/loans.js.
const CATEGORY_ACTIVE_LABEL={'en-US':{active:'Active',inactive:'Inactive'},'pt-BR':{active:'Ativa',inactive:'Inativa'}};
const CATEGORY_TOGGLE_LABEL={'en-US':{active:'Deactivate',inactive:'Activate'},'pt-BR':{active:'Desativar',inactive:'Ativar'}};
function categoryActiveLabel(isActive){const lang=window.KORbuildI18n?window.KORbuildI18n.language:'en-US';return (CATEGORY_ACTIVE_LABEL[lang]||CATEGORY_ACTIVE_LABEL['en-US'])[isActive?'active':'inactive'];}
function categoryToggleLabel(isActive){const lang=window.KORbuildI18n?window.KORbuildI18n.language:'en-US';return (CATEGORY_TOGGLE_LABEL[lang]||CATEGORY_TOGGLE_LABEL['en-US'])[isActive?'active':'inactive'];}

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

async function loadCategorias(){
  const {data,error}=await db.rpc('obter_categorias_despesa',{p_empresa_id:state.empresaId});
  if(error)throw error;
  state.categorias=data||[];

  const active=state.categorias.filter(c=>c.ativo);
  $('expense-categoria').innerHTML='<option value="">'+t('No category')+'</option>'+active.map(c=>`<option value="${c.id}">${esc(c.nome)}</option>`).join('');
}

// Fetches the full period (all statuses -- filtering by status now only
// happens inside the detail drill-down) plus the despesas' own categoria_id,
// since obter_contas_a_pagar_consolidado folds despesas and payroll into one
// shape and doesn't carry categoria_id along.
async function loadConsolidated(){
  const dataInicio=$('filter-data-inicio').value||null;
  const dataFim=$('filter-data-fim').value||null;

  const [{data:consolidated,error:consError},{data:despesas,error:despError}]=await Promise.all([
    db.rpc('obter_contas_a_pagar_consolidado',{p_empresa_id:state.empresaId,p_data_inicio:dataInicio,p_data_fim:dataFim,p_status:null}),
    db.rpc('obter_despesas',{p_empresa_id:state.empresaId,p_data_inicio:dataInicio,p_data_fim:dataFim})
  ]);
  if(consError)throw consError;
  if(despError)throw despError;

  state.rows=consolidated||[];
  state.despesaById=new Map((despesas||[]).map(d=>[d.id,d]));

  renderSummary();
  if(state.currentDetail)renderDetail();
}

// Groups the consolidated period into "Payroll" (all origem='folha' items,
// summed together) plus one group per despesa categoria (uncategorized
// despesas fall into their own "Uncategorized" bucket) -- this is the
// grouped, manager-facing view; the old item-by-item list now only shows up
// after drilling into one of these groups.
function computeGroups(){
  const groups=new Map();
  for(const r of state.rows){
    let key,kind,label;
    if(r.origem==='folha'){
      key='payroll';kind='payroll';label=originLabel('folha');
    }else{
      const d=state.despesaById.get(r.referencia_id);
      const categoriaId=d?.categoria_id||null;
      key=categoriaId||'uncategorized';
      kind='categoria';
      label=categoriaId?(d.categoria_nome||''):t('Uncategorized');
    }
    if(!groups.has(key))groups.set(key,{key,kind,label,pending:0,paid:0,count:0});
    const g=groups.get(key);
    g.count++;
    if(r.status==='provisionado'||r.status==='pendente'||r.status==='parcial')g.pending+=Number(r.valor);
    else if(r.status==='pago')g.paid+=Number(r.valor);
  }
  return [...groups.values()].sort((a,b)=>{
    if(a.kind!==b.kind)return a.kind==='payroll'?-1:1;
    return a.label.localeCompare(b.label);
  });
}

function renderSummary(){
  const rows=state.rows;
  const pending=rows.filter(r=>r.status==='provisionado'||r.status==='pendente'||r.status==='parcial');
  const paid=rows.filter(r=>r.status==='pago');
  $('summary-pending-count').textContent=pending.length;
  $('summary-pending-total').textContent=pending.length?money(pending.reduce((sum,r)=>sum+Number(r.valor),0)):'—';
  $('summary-paid-total').textContent=paid.length?money(paid.reduce((sum,r)=>sum+Number(r.valor),0)):'—';

  const groups=computeGroups();
  $('empty-state').classList.toggle('hidden',groups.length!==0);
  $('ap-groups-body').innerHTML=groups.map(g=>`<tr class="ap-group-row" data-kind="${g.kind}" data-key="${g.key}" data-label="${esc(g.label)}">
    <td><div class="team-name">${esc(g.label)}</div></td>
    <td class="pay-money">${g.pending?money(g.pending):'—'}</td>
    <td class="pay-money">${g.paid?money(g.paid):'—'}</td>
    <td>${g.count}</td>
    <td><button type="button" class="small-btn" data-action="view-group">${t('View')}</button></td>
  </tr>`).join('');
}

function groupKeyOf(row){
  if(row.origem==='folha')return 'payroll';
  const d=state.despesaById.get(row.referencia_id);
  return (d?.categoria_id)||'uncategorized';
}

function openDetail(kind,key,label){
  state.currentDetail={kind,key,label};
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
  let rows=state.rows.filter(r=>groupKeyOf(r)===state.currentDetail.key);
  if(statusFilter!=='ALL')rows=rows.filter(r=>r.status===statusFilter);

  $('detail-empty-state').classList.toggle('hidden',rows.length!==0);
  $('ap-detail-body').innerHTML=rows.map(r=>{
    // Payroll rows are never editable here -- a colaborador's payment data
    // has exactly one source of truth, weekly-payments.html, so no Edit
    // action is rendered for them at all (not just disabled).
    const canEdit=r.origem==='despesa';
    const canMarkPaid=r.origem==='despesa'&&r.status==='provisionado';
    return `<tr data-id="${r.referencia_id}" data-origem="${r.origem}">
      <td><div class="team-name">${esc(r.descricao)}</div></td>
      <td><span class="origin-tag ${r.origem}">${esc(originLabel(r.origem))}</span></td>
      <td>${fmtDate(r.data)}</td>
      <td class="pay-money">${money(r.valor)}</td>
      <td><span class="ap-status-tag ${r.status}">${esc(statusLabel(r.status))}</span></td>
      <td><div class="row-actions">${canEdit?`<button type="button" class="small-btn" data-action="edit-despesa">${t('Edit')}</button>`:''}${canMarkPaid?`<button type="button" class="small-btn" data-action="mark-paid">${t('Mark as Paid')}</button>`:''}</div></td>
    </tr>`;
  }).join('');
}

function openExpenseModal(){
  state.editingDespesaId=null;
  $('expense-form').reset();
  $('expense-message').classList.add('hidden');
  $('expense-frequencia-wrap').classList.add('hidden');
  $('expense-recurring-section').classList.remove('hidden');
  $('expense-modal-title').textContent=t('New Expense');
  $('expense-save').textContent=t('Create Expense');
  $('expense-data-prevista').value=isoDate(new Date());
  $('expense-modal').classList.remove('hidden');
}

// Editing an existing occurrence only ever changes categoria/descricao/
// valor/data_prevista on that one row (atualizar_despesa's own scope) --
// tipo/frequencia_recorrencia are fixed at creation, so the whole
// recurring-expense section is hidden rather than shown in a state it
// can't actually act on. A despesa already marked 'pago' can still be
// edited (this isn't a payment reversal, just a record correction), but
// gets a visible, non-blocking warning first since changing a paid
// expense's amount or date has real audit implications.
function openEditExpenseModal(despesaId){
  const d=state.despesaById.get(despesaId);
  if(!d)return;
  state.editingDespesaId=despesaId;
  $('expense-form').reset();
  $('expense-message').classList.add('hidden');
  $('expense-recurring-section').classList.add('hidden');
  $('expense-modal-title').textContent=t('Edit Expense');
  $('expense-save').textContent=t('Save Changes');
  $('expense-categoria').value=d.categoria_id||'';
  $('expense-descricao').value=d.descricao||'';
  $('expense-valor').value=d.valor;
  $('expense-data-prevista').value=d.data_prevista;
  if(d.status==='pago'){
    expenseMsg(t('This expense is already marked as paid. Editing it here only corrects the record -- it does not reverse or reissue the payment.'),'warning');
  }
  $('expense-modal').classList.remove('hidden');
}

function closeExpenseModal(){$('expense-modal').classList.add('hidden');state.editingDespesaId=null;}

async function createExpense(event){
  event.preventDefault();
  const categoriaId=$('expense-categoria').value||null;
  const descricao=$('expense-descricao').value.trim();
  const valor=Number($('expense-valor').value);
  const dataPrevista=$('expense-data-prevista').value;
  const isRecorrente=state.editingDespesaId?false:$('expense-recorrente').checked;
  const frequencia=isRecorrente?$('expense-frequencia').value:null;

  if(!descricao){expenseMsg(t('Description is required.'),'error');return;}
  if(!Number.isFinite(valor)||valor<=0){expenseMsg(t('Enter a valid amount.'),'error');return;}
  if(!dataPrevista){expenseMsg(t('Select a due date.'),'error');return;}

  const btn=$('expense-save');btn.disabled=true;const original=btn.textContent;btn.textContent=t('Saving...');
  const {error}=state.editingDespesaId
    ?await db.rpc('atualizar_despesa',{
        p_despesa_id:state.editingDespesaId,
        p_categoria_id:categoriaId,
        p_descricao:descricao,
        p_valor:valor,
        p_data_prevista:dataPrevista
      })
    :await db.rpc('criar_despesa',{
        p_categoria_id:categoriaId,
        p_descricao:descricao,
        p_tipo:isRecorrente?'recorrente':'pontual',
        p_valor:valor,
        p_data_prevista:dataPrevista,
        p_frequencia_recorrencia:frequencia
      });
  btn.disabled=false;btn.textContent=original;
  if(error){
    expenseMsg(`${state.editingDespesaId?t('Unable to update this expense.'):t('Unable to create this expense.')} ${error.message}`,'error');
    return;
  }
  const wasEditing=!!state.editingDespesaId;
  closeExpenseModal();
  if(wasEditing)detailMsg(t('Expense updated successfully.'));
  else msg(isRecorrente?t('Recurring expense created (13 occurrences).'):t('Expense created successfully.'));
  await loadConsolidated();
}

async function markPaid(despesaId){
  const {error}=await db.rpc('marcar_despesa_paga',{p_despesa_id:despesaId,p_data_pagamento:isoDate(new Date())});
  if(error){detailMsg(`${t('Unable to mark this expense as paid.')} ${error.message}`,'error');return;}
  detailMsg(t('Expense marked as paid.'));
  await loadConsolidated();
}

function openCategoriesModal(){
  renderCategories();
  $('categories-message').classList.add('hidden');
  $('new-category-name').value='';
  $('categories-modal').classList.remove('hidden');
}
function closeCategoriesModal(){$('categories-modal').classList.add('hidden');}

function renderCategories(){
  $('categories-body').innerHTML=state.categorias.length?state.categorias.map(c=>`<tr data-id="${c.id}">
    <td>${esc(c.nome)}</td>
    <td><span class="ap-status-tag ${c.ativo?'pago':'cancelado'}">${esc(categoryActiveLabel(c.ativo))}</span></td>
    <td><button type="button" class="small-btn" data-action="toggle-category">${esc(categoryToggleLabel(c.ativo))}</button></td>
  </tr>`).join(''):`<tr><td colspan="3">${t('No categories yet.')}</td></tr>`;
}

async function addCategory(){
  const nome=$('new-category-name').value.trim();
  if(!nome){categoriesMsg(t('Enter a category name.'),'error');return;}
  const {error}=await db.rpc('criar_categoria_despesa',{p_nome:nome});
  if(error){categoriesMsg(`${t('Unable to create this category.')} ${error.message}`,'error');return;}
  $('new-category-name').value='';
  await loadCategorias();
  renderCategories();
  categoriesMsg(t('Category created.'));
}

async function toggleCategory(categoriaId){
  const cat=state.categorias.find(c=>c.id===categoriaId);
  if(!cat)return;
  const {error}=await db.rpc('atualizar_categoria_despesa',{p_categoria_id:categoriaId,p_nome:cat.nome,p_ativo:!cat.ativo});
  if(error){categoriesMsg(`${t('Unable to update this category.')} ${error.message}`,'error');return;}
  await loadCategorias();
  renderCategories();
}

$('add-expense').addEventListener('click',openExpenseModal);
$('expense-modal-close').addEventListener('click',closeExpenseModal);
$('expense-cancel').addEventListener('click',closeExpenseModal);
$('expense-modal').addEventListener('click',e=>{if(e.target.id==='expense-modal')closeExpenseModal();});
$('expense-form').addEventListener('submit',createExpense);
$('expense-recorrente').addEventListener('change',e=>{$('expense-frequencia-wrap').classList.toggle('hidden',!e.target.checked);});

$('manage-categories').addEventListener('click',openCategoriesModal);
$('categories-modal-close').addEventListener('click',closeCategoriesModal);
$('categories-modal').addEventListener('click',e=>{if(e.target.id==='categories-modal')closeCategoriesModal();});
$('add-category-btn').addEventListener('click',addCategory);
$('categories-body').addEventListener('click',e=>{
  const btn=e.target.closest('button[data-action="toggle-category"]');if(!btn)return;
  toggleCategory(btn.closest('tr').dataset.id);
});

document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeExpenseModal();closeCategoriesModal();}});

$('ap-groups-body').addEventListener('click',e=>{
  const row=e.target.closest('tr[data-kind]');if(!row)return;
  openDetail(row.dataset.kind,row.dataset.key,row.dataset.label);
});
$('back-to-summary').addEventListener('click',closeDetail);
$('detail-filter-status').addEventListener('change',renderDetail);

$('ap-detail-body').addEventListener('click',e=>{
  const editBtn=e.target.closest('button[data-action="edit-despesa"]');
  if(editBtn){openEditExpenseModal(editBtn.closest('tr').dataset.id);return;}
  const btn=e.target.closest('button[data-action="mark-paid"]');if(!btn)return;
  markPaid(btn.closest('tr').dataset.id);
});
$('filter-data-inicio').addEventListener('change',()=>loadConsolidated().catch(e=>msg(e.message,'error')));
$('filter-data-fim').addEventListener('change',()=>loadConsolidated().catch(e=>msg(e.message,'error')));

$('user-menu-btn')?.addEventListener('click',e=>{e.stopPropagation();const menu=$('user-menu');const hidden=menu.classList.toggle('hidden');$('user-menu-btn').setAttribute('aria-expanded',String(!hidden));});
document.addEventListener('click',e=>{if(!e.target.closest('.user-menu-wrap'))closeMenu();});
$('menu-logout')?.addEventListener('click',async()=>{await db.auth.signOut();location.href='index.html';});

async function init(){
  if(!(await loadProfile()))return;
  $('filter-data-inicio').value=firstDayOfMonth();
  $('filter-data-fim').value=lastDayOfMonth();
  try{
    await loadConfig();
    await loadCategorias();
    await loadConsolidated();
    $('add-expense').disabled=false;
  }catch(e){console.error(e);msg(`${t('Unable to load Accounts Payable.')} ${e.message||''}`,'error');}
}
init();
