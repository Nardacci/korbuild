(async function(){
  const cfg=window.KORBUILD_SUPABASE;
  if(!cfg||!window.supabase)return;
  const client=window.supabase.createClient(cfg.url,cfg.publishableKey,{auth:{persistSession:true,autoRefreshToken:true}});
  const $=id=>document.getElementById(id);

  function renderStatus(access){
    const card=$('status-card');card.className='status-card';
    const phase=access?.phase||access?.status||'UNKNOWN';
    const days=Math.max(0,Number(access?.days_remaining||0));
    const metric=$('status-days'), metricLabel=$('status-days-label');
    metric.textContent=days||'—'; metricLabel.textContent=days===1?'day remaining':'days remaining';
    if(phase==='TRIAL'){
      card.classList.add('active');
      $('status-icon').textContent='✦';$('status-eyebrow').textContent='YOUR FREE TRIAL';
      $('status-title').textContent='Your KORbuild trial is active';
      $('status-message').textContent='You have full access to every KORbuild feature during your trial.';
      $('billing-subtitle').textContent='You are currently exploring KORbuild with full access.';
    }else if(phase==='GRACE_PERIOD'){
      card.classList.add('warning');
      $('status-icon').textContent='!';$('status-eyebrow').textContent='TRIAL HAS ENDED';
      $('status-title').textContent='Your trial has ended — access is still available';
      $('status-message').textContent='Subscribe now to keep your workspace active without interruption.';
      $('billing-subtitle').textContent='Your access is temporarily extended while you complete your subscription.';
    }else if(access?.access==='BLOCKED'||phase==='PAYMENT_REQUIRED'){
      card.classList.add('blocked');
      $('status-icon').textContent='🔒';$('status-eyebrow').textContent='ACCESS PAUSED';
      $('status-title').textContent='Your KORbuild access is paused';
      $('status-message').textContent='Subscribe to reactivate your workspace and continue where you left off.';
      metric.textContent='—';metricLabel.textContent='payment required';
      $('billing-subtitle').textContent='Your workspace data is preserved and ready to continue after subscription activation.';
    }else if(access?.status==='ACTIVE'||phase==='ACTIVE'){
      card.classList.add('active');
      $('status-icon').textContent='✓';$('status-eyebrow').textContent='SUBSCRIPTION ACTIVE';
      $('status-title').textContent='Your KORbuild subscription is active';
      $('status-message').textContent='Your workspace has full access to KORbuild.';
      metric.textContent='✓';metricLabel.textContent='active';
      $('subscribe-btn').textContent='Subscription active ✓';
    }else{
      $('status-eyebrow').textContent='SUBSCRIPTION STATUS';
      $('status-title').textContent='We could not determine your subscription status';
      $('status-message').textContent='Please refresh the page or contact support.';
    }
    $('subscribe-btn').disabled=false;
  }

  try{
    const {data:{session}}=await client.auth.getSession();
    if(!session?.user)return;
    $('user-email').textContent=session.user.email||'';
    const name=session.user.user_metadata?.full_name||session.user.email?.split('@')[0]||'Owner';
    $('user-name').textContent=name;$('user-avatar').textContent=name.charAt(0).toUpperCase();

    const access=window.KORBUILD_ACCESS_READY?await window.KORBUILD_ACCESS_READY:(await client.rpc('get_workspace_access_status')).data;
    renderStatus(access);

    $('subscribe-btn').addEventListener('click',()=>{
      alert('Mercado Pago checkout will be connected in the next step. This page is ready for the backend integration.');
    });
  }catch(error){console.error('Billing initialization failed',error);document.documentElement.style.visibility='visible';}

  const btn=$('user-menu-btn'),menu=$('user-menu');
  if(btn&&menu)btn.addEventListener('click',()=>menu.classList.toggle('hidden'));
})();