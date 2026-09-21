window.KORBUILD_SUPABASE = {
  url: 'https://nowbohxeqwlddbfnukva.supabase.co',
  publishableKey: 'sb_publishable_OTGYzEhQxckBa_8Xqu4Uog_Dm3RmTtD'
};

const KORBUILD_VERSION = '1.2.9';
// Environment gating: the "DEMO" badge and the "Development environment" footer
// suffix are only shown on the GitHub Pages test site (and local dev / file://).
// Any other hostname -- e.g. the Hostinger production domain -- is treated as
// production and hides both. app-config.js carries the same one-line check.
window.KORBUILD_IS_TEST_ENV = window.KORBUILD_IS_TEST_ENV ?? /(^|[.])github[.]io$|^(localhost|127[.]0[.]0[.]1|)$/i.test(location.hostname);
const KORBUILD_ENVIRONMENT = window.KORBUILD_IS_TEST_ENV ? 'Development environment' : '';
const applyKORbuildVersion = () => { document.querySelectorAll('.app-version, .demo-note').forEach(el => { el.textContent = `KORbuild V${KORBUILD_VERSION}` + (KORBUILD_ENVIRONMENT ? ` · ${KORBUILD_ENVIRONMENT}` : ''); }); if (!window.KORBUILD_IS_TEST_ENV) document.querySelectorAll('.demo-badge').forEach(el => el.remove()); };
window.KORBUILD_APP = Object.freeze({ version: KORBUILD_VERSION, environment: KORBUILD_ENVIRONMENT || 'Production', isTestEnvironment: window.KORBUILD_IS_TEST_ENV, cacheVersion: KORBUILD_VERSION });
if (!document.querySelector('link[data-korbuild-ui-fixes]')) { const style=document.createElement('link');style.rel='stylesheet';style.href='ui-fixes.css?v=1.2.8';style.dataset.korbuildUiFixes='true';document.head.appendChild(style); }
(function applyKORbuildShell(){
 const run=()=>{ applyKORbuildVersion(); const sidebar=document.querySelector('aside.sidebar'); if(!sidebar)return;
  const brand=sidebar.querySelector('.side-brand'); if(brand){brand.outerHTML=`<a class="side-brand" href="home.html" aria-label="KORbuild Dashboard"><div class="mini-mark">K</div><div>KOR<span>build</span></div>${window.KORBUILD_IS_TEST_ENV?'<span class="demo-badge logo-demo">DEMO</span>':''}</a>`;}
  const workspaceCard=sidebar.querySelector('.company-switcher'); if(workspaceCard){const legacyCompany=document.createElement('span');legacyCompany.id='side-company';legacyCompany.style.display='none';workspaceCard.replaceWith(legacyCompany);}
  const nav=sidebar.querySelector('nav'); if(nav){const path=(location.pathname.split('/').pop()||'home.html').toLowerCase();const is=files=>files.includes(path);const active={dashboard:is(['home.html','','dashboard-people.html','dashboard-financial.html']),evaluations:is(['evaluations.html']),periods:is(['periods.html']),schedule:is(['schedule.html','schedule-form.html']),bonusSettlement:is(['bonus-settlement.html']),collaboratorMovement:is(['collaborator-movement.html']),workUnits:is(['work-units.html','work-units-form.html']),teams:is(['teams.html','teams-form.html']),people:is(['people.html','people-form.html']),occurrences:is(['occurrences.html','occurrence-form.html']),payrollSettings:is(['payroll-settings.html']),weeklyPayments:is(['weekly-payments.html']),loans:is(['loans.html']),accountsPayable:is(['accounts-payable.html']),accountsReceivable:is(['accounts-receivable.html']),customerCalendar:is(['customer-schedule.html','customer-appointment-form.html']),customers:is(['customers.html','customer-form.html']),services:is(['services.html','service-form.html']),reminderSettings:is(['reminder-settings.html'])};
   const groupActive={records:active.people||active.teams||active.workUnits||active.customers||active.services,bonus:active.evaluations||active.periods||active.occurrences||active.bonusSettlement||active.collaboratorMovement,payment:active.weeklyPayments||active.payrollSettings||active.loans,financial:active.accountsPayable||active.accountsReceivable};
   // Schedule/Customer Service nav-group is paused below (see comment
   // there) -- these flags stay so restoring it needs no recomputation.
   groupActive.customerService=active.customerCalendar||active.reminderSettings;
   groupActive.schedule=active.schedule||groupActive.customerService;
   const groupBtn=(id,label,open)=>`<button id="${id}-toggle" class="nav-group-title" type="button" aria-expanded="${open?'true':'false'}" style="width:100%;display:flex;align-items:center;gap:12px;padding:11px 12px;border:0;border-radius:9px;background:transparent;color:#40506a;font:500 13px Inter,system-ui,sans-serif;text-align:left;cursor:pointer"><span id="${id}-chevron" style="width:16px;text-align:center;font-size:12px;color:#6b7890">${open?'⌃':'⌄'}</span>${label}</button>`;
   const navItem=(isActive,href,icon,label)=>`<a class="nav-item ${isActive?'active':''}" href="${href}"><span>${icon}</span>${label}</a>`;
   // Schedule + Customer Service (Calendar, Reminders) intentionally not
   // rendered below -- paused while the calendar module is on hold, not
   // removed (see git history 2026-09-20 for the prior nav-group markup).
   // Clients and Services moved into Records.
   nav.innerHTML=`${navItem(active.dashboard,'home.html','⌂','Dashboard')}
<div id="records-group" class="nav-group" style="margin:2px 0">${groupBtn('records','Records',groupActive.records)}<div id="records-items" class="nav-group-items" style="display:${groupActive.records?'block':'none'};padding-left:8px">${navItem(active.people,'people.html','◉','People')}${navItem(active.teams,'teams.html','◇','Teams')}${navItem(active.workUnits,'work-units.html','▣','Work Units')}${navItem(active.customers,'customers.html','☺','Clients')}${navItem(active.services,'services.html','◆','Services')}</div></div>
<div id="bonus-group" class="nav-group" style="margin:2px 0">${groupBtn('bonus','Bonus',groupActive.bonus)}<div id="bonus-items" class="nav-group-items" style="display:${groupActive.bonus?'block':'none'};padding-left:8px">${navItem(active.evaluations,'evaluations.html','✓','Evaluations')}${navItem(active.periods,'periods.html','◷','Periods')}${navItem(active.occurrences,'occurrences.html','!','Occurrences')}${navItem(active.bonusSettlement,'bonus-settlement.html','▥','Bonus Settlement')}${navItem(active.collaboratorMovement,'collaborator-movement.html','↕','Collaborator Movement')}</div></div>
<div id="payment-group" class="nav-group" style="margin:2px 0">${groupBtn('payment','Payment',groupActive.payment)}<div id="payment-items" class="nav-group-items" style="display:${groupActive.payment?'block':'none'};padding-left:8px">${navItem(active.weeklyPayments,'weekly-payments.html','$','Weekly Payments')}${navItem(active.loans,'loans.html','¤','Loans')}${navItem(active.payrollSettings,'payroll-settings.html','⚙','Payroll Settings')}</div></div>
<div id="financial-group" class="nav-group" style="margin:2px 0">${groupBtn('financial','Financial',groupActive.financial)}<div id="financial-items" class="nav-group-items" style="display:${groupActive.financial?'block':'none'};padding-left:8px">${navItem(active.accountsPayable,'accounts-payable.html','▾','Accounts Payable')}${navItem(active.accountsReceivable,'accounts-receivable.html','▴','Accounts Receivable')}</div></div>`;
   ['records','bonus','payment','financial'].forEach(id=>{const toggle=document.getElementById(id+'-toggle'),items=document.getElementById(id+'-items'),chevron=document.getElementById(id+'-chevron');if(toggle&&items&&chevron){toggle.addEventListener('click',()=>{const open=toggle.getAttribute('aria-expanded')==='true';toggle.setAttribute('aria-expanded',String(!open));items.style.display=open?'none':'block';chevron.textContent=open?'⌄':'⌃';});}});
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

// Private KORbuild commercial administration entry — rendered only for SUPER_ADMIN.
(function initCommercialAdminEntry(){
 const add=async()=>{try{const cfg=window.KORBUILD_SUPABASE;if(!cfg||!window.supabase)return;const c=window.supabase.createClient(cfg.url,cfg.publishableKey,{auth:{persistSession:true,autoRefreshToken:true}});const {data}=await c.rpc('is_korbuild_super_admin');if(!data)return;const menu=document.getElementById('user-menu');if(menu&&!menu.querySelector('[href="commercial-admin.html"]')){const link=document.createElement('a');link.className='menu-item';link.href='commercial-admin.html';link.textContent='🔐 Commercial Administration';const logout=menu.querySelector('#menu-logout');menu.insertBefore(link,logout||null);}}catch(e){console.warn('Commercial admin check failed',e);}};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(add,50),{once:true});else setTimeout(add,50);
})();
