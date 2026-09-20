if(!window.KORBUILD_APP){const s=document.createElement('script');s.src='app-config.js?v=1.2.2';document.head.appendChild(s);}
const {url,publishableKey}=window.KORBUILD_SUPABASE;
const db=window.supabase.createClient(url,publishableKey,{auth:{persistSession:true,autoRefreshToken:true}});
const $=id=>document.getElementById(id);
const state={empresaId:null,currency:'BRL',weekStartDay:1,colaboradores:[],loans:[]};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=v=>new Intl.NumberFormat(state.currency==='BRL'?'pt-BR':'en-US',{style:'currency',currency:state.currency}).format(Number(v||0));
const fmtDate=s=>s?new Date(s+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):'—';
function isoDate(d){return d.toISOString().slice(0,10);}
function msg(text,type='success'){const e=$('message');e.textContent=text;e.className=`message ${type}`;e.classList.remove('hidden');}
function loanMsg(text,type='success'){const e=$('loan-message');e.textContent=text;e.className=`message ${type}`;e.classList.remove('hidden');}
function closeMenu(){$('user-menu')?.classList.add('hidden');$('user-menu-btn')?.setAttribute('aria-expanded','false');}
const t=s=>window.KORbuildI18n?window.KORbuildI18n.t(s):s;
const STATUS_LABEL={
  'en-US':{pendente:'Pending',descontado:'Deducted'},
  'pt-BR':{pendente:'Pendente',descontado:'Descontado'}
};
function statusLabel(status){const lang=window.KORbuildI18n?window.KORbuildI18n.language:'en-US';return (STATUS_LABEL[lang]||STATUS_LABEL['en-US'])[status]||status;}

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
  state.currency=config?.currency||'BRL';
  state.weekStartDay=config?config.dia_inicio_semana:1;
}

async function loadColaboradores(){
  const {data,error}=await db.from('colaboradores').select('id,name').eq('empresa_id',state.empresaId).eq('active',true).order('name');
  if(error)throw error;
  state.colaboradores=data||[];
  const options='<option value="">'+t('Select a person')+'</option>'+state.colaboradores.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('');
  $('loan-colaborador').innerHTML=options;
  $('colaborador-filter').innerHTML='<option value="ALL">'+t('All people')+'</option>'+state.colaboradores.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('');
}

async function loadLoans(){
  const {data,error}=await db.rpc('obter_emprestimos',{p_empresa_id:state.empresaId});
  if(error)throw error;
  state.loans=data||[];
  render();
}

function render(){
  const colaboradorFilter=$('colaborador-filter').value;
  const statusFilter=$('status-filter').value;

  const activeLoanIds=new Set(state.loans.filter(r=>r.status_parcela==='pendente').map(r=>r.emprestimo_id));
  const pendingRows=state.loans.filter(r=>r.status_parcela==='pendente');
  $('summary-active').textContent=activeLoanIds.size;
  $('summary-pending').textContent=pendingRows.length;
  $('summary-total-pending').textContent=pendingRows.length?money(pendingRows.reduce((sum,r)=>sum+Number(r.valor_parcela),0)):'—';

  const rows=state.loans.filter(r=>
    (colaboradorFilter==='ALL'||r.colaborador_id===colaboradorFilter)&&
    (statusFilter==='ALL'||r.status_parcela===statusFilter)
  );

  let lastLoanId=null;
  $('loans-body').innerHTML=rows.map(r=>{
    const groupStart=r.emprestimo_id!==lastLoanId;
    lastLoanId=r.emprestimo_id;
    return `<tr class="${groupStart?'loan-group-start':''}">
      <td>${groupStart?`<div class="team-name">${esc(r.colaborador_nome)}</div>${r.observacoes?`<div style="font-size:10px;color:#6b7890;margin-top:2px">${esc(r.observacoes)}</div>`:''}`:''}</td>
      <td>${groupStart?fmtDate(r.data_concessao):''}</td>
      <td>${groupStart?money(r.valor_total):''}</td>
      <td>${r.numero_parcela} / ${r.numero_parcelas}</td>
      <td>${fmtDate(r.semana_desconto)}</td>
      <td class="pay-money">${money(r.valor_parcela)}</td>
      <td><span class="loan-status-tag ${r.status_parcela}">${esc(statusLabel(r.status_parcela))}</span></td>
    </tr>`;
  }).join('');
  $('empty-state').classList.toggle('hidden',rows.length!==0);
}

function openLoanModal(){
  $('loan-form').reset();
  $('loan-message').classList.add('hidden');
  $('loan-numero-parcelas').value='1';
  $('loan-semana-inicio').value=defaultWeekStart(state.weekStartDay);
  $('loan-modal').classList.remove('hidden');
}
function closeLoanModal(){$('loan-modal').classList.add('hidden');}

async function createLoan(event){
  event.preventDefault();
  const colaboradorId=$('loan-colaborador').value;
  const valorTotal=Number($('loan-valor-total').value);
  const numeroParcelas=Number($('loan-numero-parcelas').value);
  const semanaInicio=$('loan-semana-inicio').value;
  const observacoes=$('loan-observacoes').value.trim()||null;
  if(!colaboradorId){loanMsg(t('Select a person.'),'error');return;}
  if(!Number.isFinite(valorTotal)||valorTotal<=0){loanMsg(t('Enter a valid total amount.'),'error');return;}
  if(!Number.isInteger(numeroParcelas)||numeroParcelas<1){loanMsg(t('Number of installments must be at least 1.'),'error');return;}
  if(!semanaInicio){loanMsg(t('Select the first deduction week.'),'error');return;}

  const btn=$('loan-save');btn.disabled=true;const original=btn.textContent;btn.textContent=t('Saving...');
  const {error}=await db.rpc('criar_emprestimo',{
    p_colaborador_id:colaboradorId,
    p_valor_total:valorTotal,
    p_numero_parcelas:numeroParcelas,
    p_semana_inicio_desconto:semanaInicio,
    p_observacoes:observacoes
  });
  btn.disabled=false;btn.textContent=original;
  if(error){loanMsg(`${t('Unable to create this loan.')} ${error.message}`,'error');return;}
  closeLoanModal();
  msg(t('Loan created successfully.'));
  await loadLoans();
}

$('add-loan').addEventListener('click',openLoanModal);
$('loan-modal-close').addEventListener('click',closeLoanModal);
$('loan-cancel').addEventListener('click',closeLoanModal);
$('loan-modal').addEventListener('click',e=>{if(e.target.id==='loan-modal')closeLoanModal();});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeLoanModal();});
$('loan-form').addEventListener('submit',createLoan);
$('colaborador-filter').addEventListener('change',render);
$('status-filter').addEventListener('change',render);

$('user-menu-btn')?.addEventListener('click',e=>{e.stopPropagation();const menu=$('user-menu');const hidden=menu.classList.toggle('hidden');$('user-menu-btn').setAttribute('aria-expanded',String(!hidden));});
document.addEventListener('click',e=>{if(!e.target.closest('.user-menu-wrap'))closeMenu();});
$('menu-logout')?.addEventListener('click',async()=>{await db.auth.signOut();location.href='index.html';});

async function init(){
  if(!(await loadProfile()))return;
  try{
    await loadConfig();
    await loadColaboradores();
    await loadLoans();
    // Only enabled once state.currency/weekStartDay are actually loaded --
    // opening the modal earlier would pre-fill "First deduction week" from
    // the still-default weekStartDay (1) instead of the company's real
    // setting (caught by tests/payment.spec.ts's Loans suite, which clicks
    // faster than the config fetch on a fresh page load).
    $('add-loan').disabled=false;
  }catch(e){console.error(e);msg(`${t('Unable to load Loans.')} ${e.message||''}`,'error');}
}
init();
