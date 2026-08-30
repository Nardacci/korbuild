const { url, publishableKey } = window.KORBUILD_SUPABASE;
const db=window.supabase.createClient(url,publishableKey,{auth:{persistSession:true,autoRefreshToken:true}});
const $=id=>document.getElementById(id);
const state={step:1,maxPoints:500,pointValue:1,cycleName:'Annual Performance',cycleYear:2026,cycleStart:'January',cycleEnd:'December',frequency:'WEEKLY',startDay:'1',endDay:'6',preparation:'MANUAL',preparationDay:'6',preparationTime:'08:00',empresaId:null,companyName:'',ownerName:'',user:null};
const views=[...document.querySelectorAll('.step-view')],labels=[...document.querySelectorAll('.progress-labels span')];
const monthNumber=n=>({January:1,February:2,March:3,April:4,May:5,June:6,July:7,August:8,September:9,October:10,November:11,December:12}[n]);
const monthName=n=>({1:'January',2:'February',3:'March',4:'April',5:'May',6:'June',7:'July',8:'August',9:'September',10:'October',11:'November',12:'December'}[Number(n)]||'January');
const dayName=n=>({0:'Sunday',1:'Monday',2:'Tuesday',3:'Wednesday',4:'Thursday',5:'Friday',6:'Saturday'}[n]);
const freqName=n=>({WEEKLY:'Weekly',BIWEEKLY:'Every 2 weeks',MONTHLY:'Monthly'}[n]||n);
function collect(){
 if(state.step===1){state.companyName=$('company-name')?.value.trim()||state.companyName;state.ownerName=$('owner-name')?.value.trim()||state.ownerName}
 if(state.step===2){state.maxPoints=Number($('max-points').value);state.pointValue=Number($('point-value').value)}
 if(state.step===3){state.cycleName=$('cycle-name').value.trim()||'Annual Performance';state.cycleYear=Number($('cycle-year').value)||new Date().getFullYear();state.cycleStart=$('cycle-start').value;state.cycleEnd=$('cycle-end').value}
 if(state.step===4){state.frequency=$('frequency').value;state.startDay=$('start-day').value;state.endDay=$('end-day').value;state.preparation=document.querySelector('input[name="preparation"]:checked')?.value||'MANUAL';state.preparationDay=$('prep-day').value;state.preparationTime=$('prep-time').value}
}
function render(){
 views.forEach(v=>v.classList.toggle('hidden',Number(v.dataset.step)!==state.step));
 $('step-number').textContent=state.step;
 $('progress-bar').style.width=`${((state.step-1)/6)*100}%`;
 labels.forEach((l,i)=>{l.classList.toggle('done',i<state.step-1);l.classList.toggle('active',i===state.step-1)});
 $('back').disabled=state.step<=1;
 $('next').classList.toggle('hidden',state.step>=5);
 $('confirm').classList.toggle('hidden',state.step!==5);
 const automatic=document.querySelector('input[name="preparation"]:checked')?.value==='AUTOMATIC';
 $('automatic-options')?.classList.toggle('hidden',!automatic);
 if($('prep-day'))$('prep-day').disabled=!automatic;
 if($('prep-time'))$('prep-time').disabled=!automatic;
 if(state.step===5)updateSummary();
}
function updateSummary(){
 $('summary-evaluation').textContent=`${state.maxPoints} points · $${state.pointValue.toFixed(2)} / point`;
 $('summary-cycle').textContent=`${state.cycleName} ${state.cycleYear}`;
 $('summary-cycle-dates').textContent=`${state.cycleStart} → ${state.cycleEnd}`;
 $('summary-period').textContent=`${freqName(state.frequency)} · ${dayName(state.startDay)} → ${dayName(state.endDay)}`;
 $('summary-prep').textContent=state.preparation==='AUTOMATIC'?`Automatic · ${dayName(state.preparationDay)} at ${state.preparationTime}`:'Manual preparation';
}
function closeMenu(){$('user-menu')?.classList.add('hidden');$('user-menu-btn')?.setAttribute('aria-expanded','false')}
$('user-menu-btn')?.addEventListener('click',e=>{e.stopPropagation();const m=$('user-menu'),hidden=m.classList.toggle('hidden');$('user-menu-btn').setAttribute('aria-expanded',String(!hidden))});
document.addEventListener('click',e=>{if(!e.target.closest('.user-menu-wrap'))closeMenu()});
$('menu-logout')?.addEventListener('click',async()=>{await db.auth.signOut();location.href='index.html'});
document.querySelectorAll('input[name="preparation"]').forEach(i=>i.addEventListener('change',render));
document.querySelectorAll('.edit-btn[data-edit]').forEach(b=>b.addEventListener('click',()=>{collect();state.step=Number(b.dataset.edit);render()}));
async function loadUser(){
 const{data:{session},error}=await db.auth.getSession();
 if(error||!session?.user){location.href='index.html';return null}
 state.user=session.user;
 const metadata=session.user.user_metadata||{};
 // A new confirmed user intentionally has no row in public.usuarios yet.
 // Do not block onboarding if the profile does not exist.
 const{data:p,error:e}=await db.from('usuarios').select('id,name,empresa_id,active').eq('id',session.user.id).maybeSingle();
 if(e){console.warn('Profile lookup skipped during onboarding:',e.message); }
 let companyRecord=null;
 if(p?.empresa_id){
   const{data:empresa,error:empresaError}=await db.from('empresas').select('name').eq('id',p.empresa_id).maybeSingle();
   if(!empresaError)companyRecord=empresa;
 }
 const profileName=p?.name?.trim()||metadata.full_name||session.user.email?.split('@')[0]||'Owner';
 const company=companyRecord?.name||metadata.company_name||'Your company';
 state.companyName=company;
 state.ownerName=profileName;
 state.empresaId=p?.empresa_id||null;
 const initial=profileName.trim().charAt(0).toUpperCase()||'O';
 document.querySelectorAll('.user-avatar').forEach(el=>el.textContent=initial);
 $('menu-user-name').textContent=profileName;$('menu-full-name').textContent=profileName;$('menu-user-email').textContent=session.user.email||'';$('menu-full-email').textContent=session.user.email||'';
 if(!state.empresaId){
   state.step=1;
   if($('company-name'))$('company-name').value=metadata.company_name||'';
   if($('owner-name'))$('owner-name').value=metadata.full_name||profileName;
   $('workspace-name').textContent='New workspace';
   return session.user;
 }
 $('workspace-name').textContent=company;
 return session.user;
}
async function createWorkspace(){
 collect();
 if(!state.companyName)throw new Error('Company name is required.');
 if(!state.ownerName)throw new Error('Owner name is required.');
 const{data,error}=await db.rpc('initialize_workspace',{p_company_name:state.companyName,p_user_name:state.ownerName});
 if(error)throw error;
 if(!data)throw new Error('Workspace could not be created.');
 state.empresaId=data;
 $('workspace-name').textContent=state.companyName;
}
async function loadSetup(){
 const[{data:config,error:ce},{data:cycle,error:be}]=await Promise.all([
  db.from('configuracoes_operacionais').select('*').eq('empresa_id',state.empresaId).order('created_at',{ascending:false}).limit(1).maybeSingle(),
  db.from('bonus_cycles').select('*').eq('empresa_id',state.empresaId).order('created_at',{ascending:false}).limit(1).maybeSingle()
 ]);
 const firstError=ce||be;if(firstError){console.error('Workspace setup query failed',firstError);throw firstError}
 if(config){state.maxPoints=Number(config.starting_points??state.maxPoints);state.pointValue=Number(config.point_value??state.pointValue);state.frequency=config.evaluation_frequency||state.frequency;state.startDay=String(config.period_start_day??state.startDay);state.endDay=String(config.period_end_day??state.endDay);state.preparation=config.period_preparation_mode||state.preparation;state.preparationDay=String(config.period_preparation_day??state.preparationDay);state.preparationTime=(config.period_preparation_time||state.preparationTime).toString().slice(0,5)}
 if(cycle){state.cycleName=cycle.name||state.cycleName;state.cycleYear=Number(cycle.year)||state.cycleYear;state.cycleStart=monthName(cycle.start_month);state.cycleEnd=monthName(cycle.end_month)}
 const set=(id,v)=>{if($(id))$(id).value=v};
 set('max-points',state.maxPoints);set('point-value',state.pointValue.toFixed(2));set('cycle-name',state.cycleName);set('cycle-year',state.cycleYear);set('cycle-start',state.cycleStart);set('cycle-end',state.cycleEnd);set('frequency',state.frequency);set('start-day',state.startDay);set('end-day',state.endDay);set('prep-day',state.preparationDay);set('prep-time',state.preparationTime);
 const r=document.querySelector(`input[name="preparation"][value="${state.preparation}"]`);if(r)r.checked=true;
 const configReady=Boolean(config),cycleReady=Boolean(cycle);
 if(configReady&&cycleReady)state.step=5;
 else if(configReady)state.step=3;
 else state.step=2;
}
async function saveConfig(){
 collect();
 if(!state.empresaId)throw new Error('Workspace not loaded.');
 if(!Number.isFinite(state.maxPoints)||state.maxPoints<1)throw new Error('Starting points must be at least 1.');
 if(!Number.isFinite(state.pointValue)||state.pointValue<0)throw new Error('Value per point cannot be negative.');
 const config={empresa_id:state.empresaId,evaluation_frequency:state.frequency,period_start_day:Number(state.startDay),period_end_day:Number(state.endDay),evaluation_target:'ACTIVE_ONLY',period_preparation_mode:state.preparation,starting_points:state.maxPoints,point_value:state.pointValue,bonus_cycle_start_month:monthNumber(state.cycleStart),bonus_cycle_end_month:monthNumber(state.cycleEnd),period_preparation_day:Number(state.preparationDay),period_preparation_time:state.preparationTime};
 const{data:existing,error:er}=await db.from('configuracoes_operacionais').select('id').eq('empresa_id',state.empresaId).maybeSingle();if(er)throw er;
 if(existing?.id){const{error}=await db.from('configuracoes_operacionais').update(config).eq('id',existing.id);if(error)throw error}else{const{error}=await db.from('configuracoes_operacionais').insert(config);if(error)throw error}
}
async function saveCycle(){
 collect();
 if(!state.empresaId)throw new Error('Workspace not loaded.');
 const year=Number(state.cycleYear);if(!Number.isInteger(year)||year<2000||year>2100)throw new Error('Please enter a valid cycle year.');
 const{data:existing,error:er}=await db.from('bonus_cycles').select('id').eq('empresa_id',state.empresaId).eq('name',state.cycleName).eq('year',year).maybeSingle();if(er)throw er;
 if(existing?.id){const{error}=await db.from('bonus_cycles').update({name:state.cycleName,year,start_month:monthNumber(state.cycleStart),end_month:monthNumber(state.cycleEnd),starting_points:state.maxPoints,point_value:state.pointValue}).eq('id',existing.id);if(error)throw error}
 else{const{error}=await db.from('bonus_cycles').insert({empresa_id:state.empresaId,name:state.cycleName,year,start_month:monthNumber(state.cycleStart),end_month:monthNumber(state.cycleEnd),starting_points:state.maxPoints,point_value:state.pointValue,status:'OPEN',opened_at:new Date().toISOString()});if(error)throw error}
}
async function saveCurrentStep(){if(state.step===1)await createWorkspace();else if(state.step===2)await saveConfig();else if(state.step===3)await saveCycle();else if(state.step===4)await saveConfig()}
$('next').addEventListener('click',async()=>{
 const b=$('next');b.disabled=true;b.innerHTML='Saving...';
 try{await saveCurrentStep();if(state.step<5)state.step++;render()}
 catch(e){console.error(e);alert(`We couldn't save this step. ${e.message||'Please try again.'}`)}
 finally{b.disabled=false;b.innerHTML='Save & Continue <span>→</span>'}
});
$('back').addEventListener('click',()=>{collect();if(state.step>1){state.step--;render()}});
$('confirm').addEventListener('click',async()=>{const b=$('confirm');b.disabled=true;b.innerHTML='Saving...';try{await saveConfig();await saveCycle();location.href='home.html?setup=complete'}catch(e){console.error(e);alert(`We couldn't save the setup. ${e.message||'Please try again.'}`);b.disabled=false;b.innerHTML='Confirm & Start KORbuild <span>→</span>'}});
(async()=>{if(await loadUser()){if(state.empresaId){try{await loadSetup()}catch(e){alert(`Unable to load workspace setup. ${e.message||'Please try again.'}`)}}render()}})();