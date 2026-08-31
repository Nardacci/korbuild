window.KORBUILD_SUPABASE = {
  url: 'https://nowbohxeqwlddbfnukva.supabase.co',
  publishableKey: 'sb_publishable_OTGYzEhQxckBa_8Xqu4Uog_Dm3RmTtD'
};

const KORBUILD_VERSION = '1.2.8';
const KORBUILD_ENVIRONMENT = 'Development environment';
const applyKORbuildVersion = () => { document.querySelectorAll('.app-version, .demo-note').forEach(el => { el.textContent = `KORbuild V${KORBUILD_VERSION} · ${KORBUILD_ENVIRONMENT}`; }); };
window.KORBUILD_APP = Object.freeze({ version: KORBUILD_VERSION, environment: KORBUILD_ENVIRONMENT, cacheVersion: KORBUILD_VERSION });
if (!document.querySelector('link[data-korbuild-ui-fixes]')) { const style=document.createElement('link');style.rel='stylesheet';style.href='ui-fixes.css?v=1.2.8';style.dataset.korbuildUiFixes='true';document.head.appendChild(style); }
(function applyKORbuildShell(){
 const run=()=>{ applyKORbuildVersion(); const sidebar=document.querySelector('aside.sidebar'); if(!sidebar)return;
  const brand=sidebar.querySelector('.side-brand'); if(brand){brand.outerHTML=`<a class="side-brand" href="home.html" aria-label="KORbuild Dashboard"><div class="mini-mark">K</div><div>KOR<span>build</span></div><span class="demo-badge logo-demo">DEMO</span></a>`;}
  const workspaceCard=sidebar.querySelector('.company-switcher'); if(workspaceCard){const legacyCompany=document.createElement('span');legacyCompany.id='side-company';legacyCompany.style.display='none';workspaceCard.replaceWith(legacyCompany);}
  const nav=sidebar.querySelector('nav'); if(nav){const path=(location.pathname.split('/').pop()||'home.html').toLowerCase();const is=files=>files.includes(path);const active={dashboard:is(['home.html','']),evaluations:is(['evaluations.html']),periods:is(['periods.html']),bonusSettlement:is(['bonus-settlement.html']),collaboratorMovement:is(['collaborator-movement.html']),workUnits:is(['work-units.html','work-units-form.html']),teams:is(['teams.html','teams-form.html']),people:is(['people.html','people-form.html']),occurrences:is(['occurrences.html','occurrence-form.html'])};const recordsActive=active.workUnits||active.teams||active.people||active.occurrences;const reportsActive=active.bonusSettlement||active.collaboratorMovement;
   nav.innerHTML=`<a class="nav-item ${active.dashboard?'active':''}" href="home.html"><span>⌂</span>Dashboard</a><a class="nav-item ${active.evaluations?'active':''}" href="evaluations.html"><span>✓</span>Evaluations</a><a class="nav-item ${active.periods?'active':''}" href="periods.html"><span>◷</span>Periods</a><div id="records-group" class="nav-group" style="margin:2px 0"><button id="records-toggle" class="nav-group-title" type="button" aria-expanded="${recordsActive?'true':'false'}" style="width:100%;display:flex;align-items:center;gap:12px;padding:11px 12px;border:0;border-radius:9px;background:transparent;color:#40506a;font:500 13px Inter,system-ui,sans-serif;text-align:left;cursor:pointer"><span id="records-chevron" style="width:16px;text-align:center;font-size:12px;color:#6b7890">${recordsActive?'⌃':'⌄'}</span>Records</button><div id="records-items" class="nav-group-items" style="display:${recordsActive?'block':'none'};padding-left:8px"><a class="nav-item ${active.workUnits?'active':''}" href="work-units.html"><span>▣</span>Work Units</a><a class="nav-item ${active.teams?'active':''}" href="teams.html"><span>◇</span>Teams</a><a class="nav-item ${active.people?'active':''}" href="people.html"><span>◉</span>People</a><a class="nav-item ${active.occurrences?'active':''}" href="occurrences.html"><span>!</span>Occurrences</a></div></div><div class="nav-group" style="margin:2px 0"><button id="reports-toggle" class="nav-group-title" type="button" aria-expanded="${reportsActive?'true':'false'}" style="width:100%;display:flex;align-items:center;gap:12px;padding:11px 12px;border:0;border-radius:9px;background:transparent;color:#40506a;font:500 13px Inter,system-ui,sans-serif;text-align:left;cursor:pointer"><span id="reports-chevron" style="width:16px;text-align:center;font-size:12px;color:#6b7890">${reportsActive?'⌃':'⌄'}</span>Reports</button><div id="reports-items" class="nav-group-items" style="display:${reportsActive?'block':'none'};padding-left:8px"><a class="nav-item ${active.bonusSettlement?'active':''}" href="bonus-settlement.html"><span>▥</span>Bonus Settlement</a><a class="nav-item ${active.collaboratorMovement?'active':''}" href="collaborator-movement.html"><span>↕</span>Collaborator Movement</a></div></div>`;
   const toggle=document.getElementById('records-toggle'),items=document.getElementById('records-items'),chevron=document.getElementById('records-chevron');if(toggle&&items&&chevron){toggle.addEventListener('click',()=>{const open=toggle.getAttribute('aria-expanded')==='true';toggle.setAttribute('aria-expanded',String(!open));items.style.display=open?'none':'block';chevron.textContent=open?'⌄':'⌃';});}
     const reportsToggle=document.getElementById('reports-toggle'),reportsItems=document.getElementById('reports-items'),reportsChevron=document.getElementById('reports-chevron');if(reportsToggle&&reportsItems&&reportsChevron){reportsToggle.addEventListener('click',()=>{const open=reportsToggle.getAttribute('aria-expanded')==='true';reportsToggle.setAttribute('aria-expanded',String(!open));reportsItems.style.display=open?'none':'block';reportsChevron.textContent=open?'⌄':'⌃';});}
 }
  const wrap=document.querySelector('.user-menu-wrap');if(wrap){let menu=wrap.querySelector('#user-menu');if(!menu){menu=document.createElement('div');menu.id='user-menu';menu.className='user-menu hidden';wrap.appendChild(menu);}menu.innerHTML=`<div class="menu-header"><span class="avatar large" id="menu-avatar">O</span><div><b id="menu-full-name">Owner</b><small id="menu-full-email"></small></div></div><div class="menu-divider"></div><a class="menu-item" href="home.html">⌂ <span>Dashboard</span></a><a class="menu-item" href="setup.html">⚙ <span>Workspace Setup</span></a><a class="menu-item" href="billing.html">▣ <span>Billing & Subscription</span></a><button id="menu-logout" class="menu-item danger">↪ <span>Sign out</span></button>`;}
 }; if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run,{once:true});else run();})();
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',applyKORbuildVersion,{once:false});else applyKORbuildVersion();
// Central shell actions must use delegation because the shell replaces menu markup during initialization.
document.addEventListener('click', async (event) => {
 const logout = event.target.closest('#menu-logout');
 if (!logout) return;
 event.preventDefault();
 event.stopPropagation();
 try {
   const cfg = window.KORBUILD_SUPABASE;
   if (window.supabase && cfg) {
     const client = window.supabase.createClient(cfg.url, cfg.publishableKey, { auth:{persistSession:true,autoRefreshToken:true} });
     await client.auth.signOut();
   }
 } catch (err) { console.error('Sign out failed:', err); }
 window.location.href = 'index.html';
});




// V1.3.0 — Central workspace access guard.
// Subscription access is checked before protected application pages are revealed.
// Setup remains accessible so a new user can complete provisioning; Billing remains
// accessible so a blocked user can regularize the subscription.
(function initKORbuildAccessGuard(){
  const publicPages=new Set([
    'index.html','index-v2.html','signup.html','signup-complete.html','check-email.html'
  ]);
  const allowedPages=new Set(['setup.html','billing.html']);
  const currentPage=(location.pathname.split('/').pop()||'index.html').toLowerCase();
  if(publicPages.has(currentPage)||!window.supabase||!window.KORBUILD_SUPABASE)return;

  document.documentElement.style.visibility='hidden';

  const check=async()=>{
    const client=window.supabase.createClient(
      window.KORBUILD_SUPABASE.url,
      window.KORBUILD_SUPABASE.publishableKey,
      {auth:{persistSession:true,autoRefreshToken:true}}
    );

    const {data:{session},error:sessionError}=await client.auth.getSession();
    if(sessionError||!session?.user){
      location.replace('index.html');
      return {status:'UNAUTHENTICATED',access:'BLOCKED'};
    }

    const {data:access,error:accessError}=await client.rpc('get_workspace_access_status');
    if(accessError){
      console.error('KORbuild access check failed',accessError);
      document.documentElement.style.visibility='visible';
      return null;
    }

    window.KORBUILD_ACCESS_STATUS=access;
    document.dispatchEvent(new CustomEvent('korbuild:access-status',{detail:access}));

    if(access?.access==='BLOCKED' && !allowedPages.has(currentPage)){
      location.replace('billing.html');
      return access;
    }

    document.documentElement.style.visibility='visible';
    return access;
  };

  window.KORBUILD_ACCESS_READY=check().catch(error=>{
    console.error('KORbuild access guard failed',error);
    document.documentElement.style.visibility='visible';
    return null;
  });
})();

// V1.2.8 — operational readiness gate for Periods.
// Periods require at least one active Team and one active Person.
async function applyPeriodReadiness(){
  try{
    const cfg=window.KORBUILD_SUPABASE;
    if(!window.supabase||!cfg)return;
    const client=window.supabase.createClient(cfg.url,cfg.publishableKey,{auth:{persistSession:true,autoRefreshToken:true}});
    const {data:{session}}=await client.auth.getSession();
    if(!session?.user)return;

    const {data:profile,error:profileError}=await client
      .from('usuarios').select('empresa_id').eq('id',session.user.id).maybeSingle();
    if(profileError||!profile?.empresa_id)return;

    const empresaId=profile.empresa_id;
    const [teamsRes,peopleRes]=await Promise.all([
      client.from('equipes').select('*',{count:'exact',head:true}).eq('empresa_id',empresaId).eq('active',true),
      client.from('colaboradores').select('*',{count:'exact',head:true}).eq('empresa_id',empresaId).eq('active',true)
    ]);
    if(teamsRes.error||peopleRes.error)return;

    const teams=teamsRes.count||0;
    const people=peopleRes.count||0;
    const ready=teams>0&&people>0;
    window.KORBUILD_PERIODS_READY=ready;
    window.KORBUILD_PERIODS_READINESS={ready,teams,people};

    const missing=[];
    if(!teams)missing.push('at least one active Team');
    if(!people)missing.push('at least one active Person');
    const reason=ready?'Periods are ready to use.':'Create '+missing.join(' and ')+' before managing Periods.';

    document.querySelectorAll('a[href="periods.html"]').forEach(link=>{
      link.classList.toggle('period-locked',!ready);
      link.setAttribute('aria-disabled',String(!ready));
      link.title=reason;
      if(!ready&&!link.dataset.periodLockBound){
        link.dataset.periodLockBound='true';
        link.addEventListener('click',event=>{
          event.preventDefault();
          event.stopPropagation();
          const msg=window.KORBUILD_PERIODS_READINESS;
          const missingNow=[];
          if(!(msg?.teams>0))missingNow.push('create your first Team');
          if(!(msg?.people>0))missingNow.push('add your first Person');
          alert('Periods is not available yet. Please '+missingNow.join(' and ')+' first.');
        });
      }
    });

    document.dispatchEvent(new CustomEvent('korbuild:period-readiness',{detail:window.KORBUILD_PERIODS_READINESS}));
  }catch(error){
    console.warn('Period readiness check failed',error);
  }
}
window.applyKORbuildPeriodReadiness=applyPeriodReadiness;
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(applyPeriodReadiness,0),{once:true});
else setTimeout(applyPeriodReadiness,0);
