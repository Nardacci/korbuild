const {url,publishableKey}=window.KORBUILD_SUPABASE;
const db=window.supabase.createClient(url,publishableKey,{auth:{persistSession:true,autoRefreshToken:true}});
const $=id=>document.getElementById(id);
const state={empresaId:null,people:[],teams:[],units:[],periods:[],launches:[],occurrences:[]};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtDate=s=>new Date(s+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
const pts=n=>(n>0?'+':'')+Number(n||0).toLocaleString('en-US')+' pts';
const initials=n=>(String(n||'?').trim().split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase());
function showError(text){const e=$('message');e.textContent=text;e.className='message error';}
function periodLabel(p){return 'Week '+p.week_number+' · '+fmtDate(p.start_date)+' → '+fmtDate(p.end_date);}
async function profile(){
 const {data:{session}}=await db.auth.getSession();if(!session?.user){location.href='index.html';return false}
 const {data:u,error}=await db.from('usuarios').select('id,name,empresa_id').eq('id',session.user.id).maybeSingle();
 if(error||!u?.empresa_id){showError(error?.message||'Unable to load workspace profile.');return false}
 state.empresaId=u.empresa_id;const name=u.name||session.user.user_metadata?.full_name||'Owner',initial=name.trim().charAt(0).toUpperCase()||'O';
 ['user-name','menu-full-name'].forEach(id=>$(id)&&( $(id).textContent=name));['user-email','menu-full-email'].forEach(id=>$(id)&&( $(id).textContent=session.user.email||''));['user-avatar','menu-avatar'].forEach(id=>$(id)&&( $(id).textContent=initial));
 return true;
}
async function load(){
 const [peopleR,teamsR,unitsR,periodsR]=await Promise.all([
  db.from('colaboradores').select('id,name,specialty,equipe_id,active').eq('empresa_id',state.empresaId).order('name'),
  db.from('equipes').select('id,name,unidade_trabalho_id').eq('empresa_id',state.empresaId),
  db.from('unidades_trabalho').select('id,name').eq('empresa_id',state.empresaId),
  db.from('periodos').select('id,week_number,start_date,end_date,status').eq('empresa_id',state.empresaId).order('start_date',{ascending:false})
 ]);
 const err=peopleR.error||teamsR.error||unitsR.error||periodsR.error;if(err)throw err;
 state.people=peopleR.data||[];state.teams=teamsR.data||[];state.units=unitsR.data||[];state.periods=periodsR.data||[];
 const periodIds=state.periods.map(x=>x.id);
 if(periodIds.length){const {data,error}=await db.from('lancamentos').select('id,periodo_id,colaborador_id,equipe_id,unidade_trabalho_id').in('periodo_id',periodIds);if(error)throw error;state.launches=data||[];}
 const launchIds=state.launches.map(x=>x.id);
 if(launchIds.length){const {data,error}=await db.from('ocorrencias').select('lancamento_id,tipo_ocorrencia_id,quantity,points,tipos_ocorrencia(name,occurrence_type)').in('lancamento_id',launchIds).gt('quantity',0);if(error)throw error;state.occurrences=data||[];}
 populatePeriods();render();
}
function populatePeriods(){
 const sel=$('period-filter');sel.innerHTML='<option value="ALL">All periods</option>'+state.periods.map(p=>'<option value="'+p.id+'">'+esc(periodLabel(p))+'</option>').join('');
}
function buildRows(){
 const launchMap=new Map(state.launches.map(l=>[l.id,l])),personMap=new Map(state.people.map(p=>[p.id,p])),periodMap=new Map(state.periods.map(p=>[p.id,p]));
 const grouped=new Map();
 state.occurrences.forEach(o=>{
  const l=launchMap.get(o.lancamento_id);if(!l)return;const person=personMap.get(l.colaborador_id);const period=periodMap.get(l.periodo_id);if(!person||!period)return;
  const key=person.id+'|'+period.id;let row=grouped.get(key);
  if(!row){const teamId=l.equipe_id||person.equipe_id;const team=state.teams.find(t=>t.id===teamId);const unit=state.units.find(u=>u.id===(l.unidade_trabalho_id||team?.unidade_trabalho_id));row={person,period,team,unit,occurrences:new Map(),total:0};grouped.set(key,row);}
  const type=o.tipos_ocorrencia||{},typeKey=o.tipo_ocorrencia_id||type.name||'unknown',qty=Math.max(0,Number(o.quantity)||0),sign=type.occurrence_type==='NEGATIVA'?-1:1,point=sign*Math.abs(Number(o.points)||0),total=point*qty;
  const existing=row.occurrences.get(typeKey)||{name:type.name||'Occurrence',quantity:0,points:point,total:0};existing.quantity+=qty;existing.total+=total;row.occurrences.set(typeKey,existing);row.total+=total;
 });
 const people=new Map();
 [...grouped.values()].forEach(r=>{if(!people.has(r.person.id))people.set(r.person.id,{person:r.person,team:r.team,unit:r.unit,periods:[],total:0});const p=people.get(r.person.id);p.periods.push(r);p.total+=r.total;});
 return [...people.values()].map(p=>{p.periods.sort((a,b)=>new Date(b.period.start_date)-new Date(a.period.start_date));return p;}).sort((a,b)=>a.person.name.localeCompare(b.person.name));
}
function render(){
 const query=($('search').value||'').trim().toLowerCase(),selected=$('period-filter').value;let rows=buildRows();
 if(selected!=='ALL')rows=rows.map(p=>({...p,periods:p.periods.filter(x=>x.period.id===selected)})).filter(p=>p.periods.length);
 if(query)rows=rows.filter(p=>[p.person.name,p.person.specialty,p.team?.name,p.unit?.name].filter(Boolean).join(' ').toLowerCase().includes(query));
 setText('summary-people',rows.length);
 const box=$('movement-list');if(!rows.length){box.innerHTML='<div class="empty">No collaborator movement found for the selected filters.</div>';return}
 box.innerHTML=rows.map(renderPerson).join('');
}
function setText(id,v){const e=$(id);if(e)e.textContent=v}
function renderPerson(p){
 const meta=[p.unit?.name,p.team?.name,p.person.specialty].filter(Boolean).join(' · ')||'—';
 return '<article class="collaborator-card"><div class="collaborator-head"><div class="person-avatar">'+esc(initials(p.person.name))+'</div><div class="collaborator-info"><h2>'+esc(p.person.name)+'</h2><p>'+esc(meta)+'</p></div><div class="movement-total"><small>TOTAL MOVEMENT</small><strong class="'+(p.total<0?'negative':'positive')+'">'+pts(p.total)+'</strong></div></div>'+p.periods.map(renderPeriod).join('')+'</article>';
}
function renderPeriod(r){
 const movementClass=r.total<0?'negative':'positive';
 const occ=[...r.occurrences.values()].sort((a,b)=>a.name.localeCompare(b.name));
 return '<div class="period-block"><div class="period-head"><div class="period-label"><small>EVALUATION PERIOD</small><strong>'+esc(periodLabel(r.period))+'</strong></div><div class="period-movement '+movementClass+'">'+pts(r.total)+'</div></div><table class="occurrence-table"><thead><tr><th>OCCURRENCE</th><th>QUANTITY</th><th>MOVEMENT</th></tr></thead><tbody>'+occ.map(o=>'<tr><td class="occ-name">'+esc(o.name)+'</td><td>'+o.quantity+'</td><td class="occ-points '+(o.total<0?'negative':'positive')+'">'+pts(o.total)+'</td></tr>').join('')+'</tbody></table></div>';
}
$('search').addEventListener('input',render);$('period-filter').addEventListener('change',render);
$('user-menu-btn').addEventListener('click',e=>{e.stopPropagation();$('user-menu').classList.toggle('hidden')});document.addEventListener('click',e=>{if(!e.target.closest('.user-menu-wrap'))$('user-menu').classList.add('hidden')});$('menu-logout')?.addEventListener('click',async()=>{await db.auth.signOut();location.href='index.html'});
(async()=>{if(await profile())try{await load()}catch(e){console.error(e);showError('Unable to load collaborator movement. '+(e.message||''));}})();