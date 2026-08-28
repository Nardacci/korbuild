const {url,publishableKey}=window.KORBUILD_SUPABASE;
const db=window.supabase.createClient(url,publishableKey,{auth:{persistSession:true,autoRefreshToken:true}});
const $=id=>document.getElementById(id);
const state={empresaId:null,companyName:'Workspace',cycles:[],selected:null,config:null};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=v=>'$'+Number(v||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const month=v=>new Date(2026,Number(v)-1,1).toLocaleDateString('en-US',{month:'long'});
function showError(t){const e=$('cycles-message');e.textContent=t;e.classList.remove('hidden')}
async function profile(){
 const {data:{session}}=await db.auth.getSession();if(!session?.user){location.href='index.html';return false}
 const {data:u,error}=await db.from('usuarios').select('id,name,empresa_id,empresas(name)').eq('id',session.user.id).maybeSingle();
 if(error||!u?.empresa_id){showError(error?.message||'Unable to load workspace profile.');return false}
 state.empresaId=u.empresa_id;state.companyName=u.empresas?.name||'Workspace';
 const name=u.name||session.user.user_metadata?.full_name||'Owner',initial=name.trim().charAt(0).toUpperCase()||'O';
 $('user-name').textContent=name;$('user-email').textContent=session.user.email||'';$('user-avatar').textContent=initial;$('menu-avatar').textContent=initial;$('menu-full-name').textContent=name;$('menu-full-email').textContent=session.user.email||'';
 return true
}
async function loadCycles(){
 const [{data:cycles,error},{data:config,error:ce}]=await Promise.all([
  db.from('bonus_cycles').select('*').eq('empresa_id',state.empresaId).order('year',{ascending:false}).order('created_at',{ascending:false}),
  db.from('configuracoes_operacionais').select('*').eq('empresa_id',state.empresaId).order('created_at',{ascending:false}).limit(1).maybeSingle()
 ]);
 if(error||ce)throw(error||ce);state.cycles=cycles||[];state.config=config||null;renderCycles()
}
function renderCycles(){
 const box=$('cycle-list');
 if(!state.cycles.length){box.innerHTML='<div class="empty">No Bonus Cycles available yet.</div>';return}
 box.innerHTML=state.cycles.map(c=>'<div class="cycle-row"><div class="cycle-name">'+esc(c.name)+'<small>'+month(c.start_month)+' → '+month(c.end_month)+'</small></div><div>'+esc(c.year)+'</div><div>'+month(c.start_month)+' → '+month(c.end_month)+' '+esc(c.year)+'</div><div><span class="status-pill '+String(c.status||'').toLowerCase()+'">'+esc(c.status||'OPEN')+'</span></div><button class="open-report-btn" data-id="'+c.id+'">Open report →</button></div>').join('')
}
async function openReport(id){
 const cycle=state.cycles.find(c=>String(c.id)===String(id));if(!cycle)return;
 state.selected=cycle;$('cycles-view').classList.add('hidden');$('report-view').classList.remove('hidden');
 $('report-cycle-name').textContent=cycle.name;$('report-cycle-meta').textContent=cycle.year+' · '+month(cycle.start_month)+' → '+month(cycle.end_month);
 $('report-status').textContent=cycle.status||'OPEN';$('company-name').textContent=state.companyName;
 const pointValue=Number(cycle.point_value??state.config?.point_value??0);
 $('point-rule').textContent='Final balance × '+money(pointValue)+' per point';
 $('settlement-body').innerHTML='<tr><td colspan="7" class="empty">Calculating settlement...</td></tr>';
 try{
  const {data:periods,error:pe}=await db.from('periodos').select('id').eq('empresa_id',state.empresaId).eq('bonus_cycle_id',cycle.id);
  if(pe)throw pe;const ids=(periods||[]).map(p=>p.id);
  const [{data:people,error:peopleError},{data:units,error:unitError},{data:teams,error:teamError},{data:launches,error:launchError}]=await Promise.all([
   db.from('colaboradores').select('id,name,specialty,equipe_id,active').eq('empresa_id',state.empresaId).order('name'),
   db.from('unidades_trabalho').select('id,name').eq('empresa_id',state.empresaId).order('name'),
   db.from('equipes').select('id,name,unidade_trabalho_id').eq('empresa_id',state.empresaId).order('name'),
   ids.length?db.from('lancamentos').select('id,colaborador_id,equipe_id,unidade_trabalho_id,total_score').in('periodo_id',ids):Promise.resolve({data:[],error:null})
  ]);
  if(peopleError||unitError||teamError||launchError)throw(peopleError||unitError||teamError||launchError);
  const launchIds=(launches||[]).map(l=>l.id);let occurrenceTotals={};
  if(launchIds.length){
   const {data:occ,error:oe}=await db.from('ocorrencias').select('lancamento_id,quantity,points,tipos_ocorrencia(occurrence_type)').in('lancamento_id',launchIds);
   if(oe)throw oe;
   (occ||[]).forEach(o=>{
    const id=o.lancamento_id,qty=Math.max(0,Number(o.quantity)||0);
    const sign=o.tipos_ocorrencia?.occurrence_type==='NEGATIVA'?-1:1;
    const score=sign*Math.abs(Number(o.points)||0)*qty;
    if(!occurrenceTotals[id])occurrenceTotals[id]={count:0,score:0};
    occurrenceTotals[id].count+=qty;
    occurrenceTotals[id].score+=score;
   });
  }
  const unitMap=Object.fromEntries((units||[]).map(x=>[x.id,x]));const teamMap=Object.fromEntries((teams||[]).map(x=>[x.id,x]));
  const rows=(people||[]).map(p=>{
   const pl=(launches||[]).filter(l=>l.colaborador_id===p.id);const last=pl[pl.length-1]||{};
   // Calculate directly from occurrence records, matching the Evaluations rule.
   // Do not depend on lancamentos.total_score, which can be stale until an evaluation is saved.
   const deductions=pl.reduce((a,l)=>a+Math.min(0,Number(occurrenceTotals[l.id]?.score)||0),0);
   const occurrences=pl.reduce((a,l)=>a+(occurrenceTotals[l.id]?.count||0),0);
   const starting=Number(cycle.starting_points??state.config?.starting_points??0);
   const final=Math.max(0,starting+deductions);const bonus=final*pointValue;
   const team=teamMap[last.equipe_id||p.equipe_id];const unit=unitMap[last.unidade_trabalho_id||team?.unidade_trabalho_id];
   return {person:p,unit,team,starting,deductions,occurrences,final,bonus,evaluated:pl.length>0,eligible:p.active||pl.length>0}
  }).filter(r=>r.eligible);
  renderSettlement(rows)
 }catch(e){console.error(e);$('settlement-body').innerHTML='<tr><td colspan="7" class="empty">Unable to calculate settlement: '+esc(e.message||'Unknown error')+'</td></tr>'}
}
function renderSettlement(rows){
 const eligible=rows.length,evaluated=rows.filter(r=>r.evaluated).length,deductions=rows.reduce((a,r)=>a+r.deductions,0),bonus=rows.reduce((a,r)=>a+r.bonus,0);
 $('metric-eligible').textContent=eligible;$('metric-evaluated').textContent=evaluated;$('metric-deductions').textContent=deductions.toLocaleString('en-US')+' pts';$('metric-bonus').textContent=money(bonus);$('grand-total').querySelector('strong').textContent=money(bonus);
 const grouped={};rows.forEach(r=>{const u=r.unit?.name||'No Work Unit';const t=r.team?.name||'No Team';((grouped[u]??={})[t]??=[]).push(r)});
 let html='';Object.keys(grouped).sort().forEach(u=>{html+='<tr class="group-row"><td colspan="7">Work Unit · '+esc(u)+'</td></tr>';Object.keys(grouped[u]).sort().forEach(t=>{html+='<tr class="group-row team"><td colspan="7">Team · '+esc(t)+'</td></tr>';grouped[u][t].forEach(r=>{html+='<tr><td class="person">'+esc(r.person.name)+'</td><td>'+esc(r.person.specialty||'—')+'</td><td>'+r.starting.toLocaleString('en-US')+' pts</td><td>'+r.occurrences+'</td><td class="deduction">'+r.deductions.toLocaleString('en-US')+' pts</td><td class="balance">'+r.final.toLocaleString('en-US')+' pts</td><td class="bonus">'+money(r.bonus)+'</td></tr>'})})});
 $('settlement-body').innerHTML=html||'<tr><td colspan="7" class="empty">No eligible people found for this settlement.</td></tr>'
}
$('cycle-list').addEventListener('click',e=>{const b=e.target.closest('[data-id]');if(b)openReport(b.dataset.id)});
$('back-cycles').addEventListener('click',()=>{$('report-view').classList.add('hidden');$('cycles-view').classList.remove('hidden')});
$('print-report').addEventListener('click',()=>window.print());
$('user-menu-btn').addEventListener('click',e=>{e.stopPropagation();$('user-menu').classList.toggle('hidden')});
document.addEventListener('click',e=>{if(!e.target.closest('.user-menu-wrap'))$('user-menu').classList.add('hidden')});
$('menu-logout').addEventListener('click',async()=>{await db.auth.signOut();location.href='index.html'});
$('records-toggle').addEventListener('click',()=>{const items=$('records-items'),open=items.style.display!=='none';items.style.display=open?'none':'block';$('records-chevron').textContent=open?'⌄':'⌃'});
(async()=>{if(await profile())try{await loadCycles()}catch(e){console.error(e);showError(e.message||'Unable to load Bonus Cycles.')}})();