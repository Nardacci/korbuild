const {url,publishableKey}=window.KORBUILD_SUPABASE;
const db=window.supabase.createClient(url,publishableKey,{auth:{persistSession:true,autoRefreshToken:true}});
const $=id=>document.getElementById(id);
const state={empresaId:null,period:null,people:[],units:[],teams:[],launches:[],occurrenceTotals:{},current:null,currentRows:[]};

const fmtDate=s=>new Date(s+'T00:00:00').toLocaleDateString('en-US',{day:'2-digit',month:'short',year:'numeric'});
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function msg(text,error=false){const el=$('message');el.textContent=text;el.className='message'+(error?' error':'');}
function clearMsg(){$('message').className='message hidden';}
function personById(id){return state.people.find(p=>p.id===id)}
function teamById(id){return state.teams.find(t=>t.id===id)}
function unitById(id){return state.units.find(u=>u.id===id)}

async function loadProfile(){
 const {data:{session}}=await db.auth.getSession();
 if(!session?.user){location.href='index.html';return false;}
 const {data:u,error}=await db.from('usuarios').select('id,name,empresa_id').eq('id',session.user.id).maybeSingle();
 if(error||!u?.empresa_id){msg(error?.message||'Unable to load workspace profile.',true);return false;}
 state.empresaId=u.empresa_id;
 const name=u.name||session.user.user_metadata?.full_name||'Owner', initial=name.trim().charAt(0).toUpperCase()||'O';
 $('user-name').textContent=name;$('user-email').textContent=session.user.email||'';
 $('user-avatar').textContent=initial;$('menu-avatar').textContent=initial;$('menu-full-name').textContent=name;$('menu-full-email').textContent=session.user.email||'';
 return true;
}

async function loadData(){
 const [{data:openPeriods,error:pe},{data:people,error:peopleError},{data:units,error:unitsError},{data:teams,error:teamsError}]=await Promise.all([
  db.from('periodos').select('id,start_date,end_date,week_number,status').eq('empresa_id',state.empresaId).eq('status','ABERTO').order('start_date',{ascending:true}).limit(1),
  db.from('colaboradores').select('id,name,specialty,equipe_id,active').eq('empresa_id',state.empresaId).order('name'),
  db.from('unidades_trabalho').select('id,name,status').eq('empresa_id',state.empresaId).order('name'),
  db.from('equipes').select('id,name,unidade_trabalho_id,active').eq('empresa_id',state.empresaId).order('name')
 ]);
 if(pe||peopleError||unitsError||teamsError)throw(pe||peopleError||unitsError||teamsError);
 state.period=(openPeriods||[])[0]||null;
 state.people=people||[];state.units=units||[];state.teams=teams||[];
 if(!state.period){renderNoOpenPeriod();return;}
 const {data:launches,error:le}=await db.from('lancamentos').select('id,colaborador_id,equipe_id,unidade_trabalho_id,total_score').eq('periodo_id',state.period.id);
 if(le)throw le;
 state.launches=launches||[];
 const launchIds=state.launches.map(l=>l.id);
 state.occurrenceTotals={};
 if(launchIds.length){
  const {data:occurrences,error:oe}=await db.from('ocorrencias').select('lancamento_id,quantity').in('lancamento_id',launchIds);
  if(oe)throw oe;
  (occurrences||[]).forEach(o=>{
   state.occurrenceTotals[o.lancamento_id]=(state.occurrenceTotals[o.lancamento_id]||0)+(Math.max(0,Number(o.quantity)||0));
  });
 }
 const label='Week '+state.period.week_number+' · '+fmtDate(state.period.start_date)+' → '+fmtDate(state.period.end_date);
 $('current-period').textContent=label;$('detail-period').textContent=label;
 $('period-meta').textContent='Current evaluation window';
 renderList();
}

function renderNoOpenPeriod(){
 $('current-period').textContent='No open period';
 $('period-meta').textContent='Prepare the next period before recording occurrences.';
 $('people-body').innerHTML='';
 $('empty-state').classList.remove('hidden');
}

function renderList(){
 const q=($('search').value||'').trim().toLowerCase();
 const rows=state.launches.map(l=>{
   const p=personById(l.colaborador_id)||{};
   const team=teamById(l.equipe_id||p.equipe_id);
   const unit=unitById(l.unidade_trabalho_id||team?.unidade_trabalho_id);
   return {...l,person:p,team,unit};
 }).filter(r=>{
   const hay=[r.person.name,r.unit?.name,r.team?.name,r.person.specialty].filter(Boolean).join(' ').toLowerCase();
   return !q||hay.includes(q);
 });
 $('people-body').innerHTML=rows.map(r=>{
   const score=Number(r.total_score||0);
   const occurrenceCount=state.occurrenceTotals[r.id]||0;
   return '<tr>'+
    '<td><div class="person-name">'+esc(r.person.name||'—')+'</div></td>'+
    '<td>'+esc(r.unit?.name||'—')+'</td>'+
    '<td>'+esc(r.team?.name||'—')+'</td>'+
    '<td>'+esc(r.person.specialty||'—')+'</td>'+
    '<td class="occurrence-count">'+occurrenceCount+'</td>'+
    '<td class="score '+(score<0?'negative':'')+'">'+score.toLocaleString('en-US')+' pts</td>'+
    '<td><div class="row-actions"><button class="small-btn" data-action="edit" data-id="'+r.id+'">Edit</button></div></td>'+
   '</tr>';
 }).join('');
 $('empty-state').classList.toggle('hidden',rows.length>0);
}

async function openEvaluation(launchId){
 clearMsg();
 const launch=state.launches.find(l=>l.id===launchId);if(!launch)return;
 state.current=launch;
 const p=personById(launch.colaborador_id)||{};
 const team=teamById(launch.equipe_id||p.equipe_id);
 const unit=unitById(launch.unidade_trabalho_id||team?.unidade_trabalho_id);
 $('person-name').textContent=p.name||'Collaborator';
 $('person-meta').textContent=[unit?.name,team?.name,p.specialty].filter(Boolean).join(' · ')||'—';
 $('list-view').classList.add('hidden');$('detail-view').classList.remove('hidden');
 $('evaluation-area').innerHTML='<div class="empty">Loading prepared occurrences...</div>';
 const {data:rows,error}=await db.from('ocorrencias').select('id,lancamento_id,tipo_ocorrencia_id,points,quantity,notes,tipos_ocorrencia(name,occurrence_type)').eq('lancamento_id',launch.id).order('id');
 if(error){msg(error.message,true);return;}
 state.currentRows=rows||[];renderEvaluation();
}

function renderEvaluation(){
 const rows=state.currentRows;
 if(!rows.length){$('evaluation-area').innerHTML='<div class="empty">No prepared occurrences found for this collaborator.</div>';return;}
 const total=rows.reduce((a,r)=>a+(Number(r.points)||0)*(Number(r.quantity)||0),0);
 $('evaluation-area').innerHTML='<table class="eval-table"><thead><tr><th>Occurrence</th><th>Points</th><th>Quantity</th><th>Total</th></tr></thead><tbody>'+
 rows.map(r=>{
   const points=Number(r.points||0), qty=Number(r.quantity||0), rowTotal=points*qty;
   return '<tr><td>'+esc(r.tipos_ocorrencia?.name||'—')+'</td><td class="points">'+points.toLocaleString('en-US')+' pts</td><td><input class="qty" type="number" min="0" step="1" data-id="'+r.id+'" value="'+qty+'"></td><td class="points row-total">'+rowTotal.toLocaleString('en-US')+' pts</td></tr>';
 }).join('')+
 '</tbody></table><div class="eval-footer"><div class="total">Total Score: <span id="total-score">'+total.toLocaleString('en-US')+' pts</span></div><div class="eval-actions"><button class="cancel-btn" id="cancel-btn">Cancel</button><button class="save-btn" id="save-btn">Save Evaluation</button></div></div>';
 document.querySelectorAll('.qty').forEach(i=>i.addEventListener('input',updateTotals));
 $('save-btn').addEventListener('click',save);
 $('cancel-btn').addEventListener('click',backToList);
}

function updateTotals(){
 let total=0;
 document.querySelectorAll('.eval-table tbody tr').forEach(tr=>{
  const q=Math.max(0,Number(tr.querySelector('.qty').value)||0);
  const p=Number(tr.children[1].textContent.replace(/[^0-9.-]/g,''))||0;
  const value=p*q;tr.querySelector('.row-total').textContent=value.toLocaleString('en-US')+' pts';total+=value;
 });
 $('total-score').textContent=total.toLocaleString('en-US')+' pts';
}

async function save(){
 const btn=$('save-btn');btn.disabled=true;btn.textContent='Saving...';
 try{
  for(const input of document.querySelectorAll('.qty')){
   const q=Math.max(0,parseInt(input.value||'0',10)||0);
   const row=state.currentRows.find(r=>r.id===input.dataset.id);
   if(row&&q!==Number(row.quantity||0)){
    const {error}=await db.from('ocorrencias').update({quantity:q,updated_at:new Date().toISOString()}).eq('id',row.id);
    if(error)throw error;
    row.quantity=q;
   }
  }
  const score=state.currentRows.reduce((a,r)=>a+(Number(r.points)||0)*(Number(r.quantity)||0),0);
  const {error}=await db.from('lancamentos').update({total_score:score,penalty_value:Math.abs(Math.min(0,score)),updated_at:new Date().toISOString()}).eq('id',state.current.id);
  if(error)throw error;
  state.current.total_score=score;
  msg('Evaluation saved successfully.');
  backToList(false);renderList();
 }catch(e){console.error(e);msg(e.message||'Unable to save evaluation.',true);}
 finally{btn.disabled=false;btn.textContent='Save Evaluation';}
}

function backToList(clear=true){$('detail-view').classList.add('hidden');$('list-view').classList.remove('hidden');if(clear)clearMsg();}

$('search').addEventListener('input',renderList);
$('people-body').addEventListener('click',e=>{const b=e.target.closest('button[data-action="edit"]');if(b)openEvaluation(b.dataset.id)});
$('back-to-list').addEventListener('click',()=>backToList());
$('user-menu-btn').addEventListener('click',e=>{e.stopPropagation();$('user-menu').classList.toggle('hidden')});
document.addEventListener('click',e=>{if(!e.target.closest('.user-menu-wrap'))$('user-menu').classList.add('hidden')});
$('menu-logout').addEventListener('click',async()=>{await db.auth.signOut();location.href='index.html'});
$('records-toggle').addEventListener('click',()=>{const items=$('records-items'),open=items.style.display!=='none';items.style.display=open?'none':'block';$('records-toggle').setAttribute('aria-expanded',String(!open));$('records-chevron').textContent=open?'⌄':'⌃'});
(async()=>{if(await loadProfile())try{await loadData()}catch(e){console.error(e);msg('Unable to load evaluations. '+(e.message||''),true)}})();