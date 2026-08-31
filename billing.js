(async function(){
  const cfg=window.KORBUILD_SUPABASE;if(!cfg||!window.supabase)return;
  const client=window.supabase.createClient(cfg.url,cfg.publishableKey,{auth:{persistSession:true,autoRefreshToken:true}});
  const $=id=>document.getElementById(id);
  let commercial=null;
  const fmt=v=>new Intl.NumberFormat('en-US',{style:'currency',currency:commercial?.currency||'USD'}).format(Number(v||0));

  function setOffer(access){
    const phase=access?.phase||access?.status||'UNKNOWN';
    const setupRequired=!!commercial?.setup_required;
    let amount=commercial?.monthly_price, suffix='/ month', button='Subscribe now →', context='Continue with the KORbuild monthly subscription.';

    if(phase==='TRIAL' || phase==='TRIALING'){
      if(setupRequired){amount=commercial.setup_fee;suffix=' one-time setup';button='View activation options →';context='After setup payment, your monthly subscription starts 30 days later.';}
      else {amount=commercial?.monthly_price;suffix='/ month';button='Subscribe when trial ends →';context='Your setup fee is waived. Your first monthly payment is due when your trial ends.';}
    } else if(phase==='SETUP_PAYMENT' || phase==='SETUP_PAYMENT_REQUIRED'){
      amount=commercial?.setup_fee;suffix=' one-time setup';button='Pay setup fee →';context='After setup payment, you keep full access and monthly billing starts 30 days later.';
    } else if(phase==='MONTHLY_PAYMENT' || phase==='PAYMENT_REQUIRED'){
      amount=commercial?.monthly_price;suffix='/ month';button='Start monthly subscription →';context='Your setup fee is waived. Your first monthly payment activates continued access.';
    } else if(phase==='POST_SETUP' || phase==='SETUP_ACTIVE'){
      amount=commercial?.monthly_price;suffix='/ month';button='Monthly subscription scheduled ✓';context='Your setup is complete. Monthly billing starts on '+new Date(access.monthly_starts_at).toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})+'.';
    } else if(access?.status==='ACTIVE' || phase==='ACTIVE'){
      amount=commercial?.monthly_price;suffix='/ month';button='Subscription active ✓';context='Your KORbuild subscription is active.';
    }
    $('price').textContent=amount!=null?fmt(amount):'Contact us';
    $('price-suffix').textContent=suffix;
    $('payment-context').textContent=context;
    $('subscribe-btn').textContent=button;
    $('subscribe-btn').disabled=false;
  }

  function renderStatus(access){
    const card=$('status-card');card.className='status-card';
    const phase=access?.phase||access?.status||'UNKNOWN';
    const days=Math.max(0,Number(access?.days_remaining||0));
    const metric=$('status-days'),label=$('status-days-label');
    metric.textContent=days||'—';label.textContent=days===1?'day remaining':'days remaining';

    if(phase==='TRIAL'){card.classList.add('active');$('status-icon').textContent='✦';$('status-eyebrow').textContent='YOUR FREE TRIAL';$('status-title').textContent='Your KORbuild trial is active';$('status-message').textContent='You have full access to every KORbuild feature during your trial.';$('billing-subtitle').textContent='You are currently exploring KORbuild with full access.';}
    else if(phase==='SETUP_PAYMENT'){card.classList.add('warning');$('status-icon').textContent='◷';$('status-eyebrow').textContent='ACTIVATION REQUIRED';$('status-title').textContent='Complete your one-time setup payment';$('status-message').textContent='After payment, you keep full access and monthly billing begins 30 days later.';}
    else if(phase==='POST_SETUP'){card.classList.add('active');$('status-icon').textContent='✓';$('status-eyebrow').textContent='SETUP COMPLETE';$('status-title').textContent='Your workspace is active';$('status-message').textContent='Your monthly subscription begins after the 30-day setup period.';}
    else if(phase==='MONTHLY_PAYMENT'){card.classList.add('blocked');$('status-icon').textContent='🔒';$('status-eyebrow').textContent='MONTHLY SUBSCRIPTION';$('status-title').textContent='Your first monthly payment is due';$('status-message').textContent='Your setup fee was waived. Start your monthly subscription to continue.';metric.textContent='—';label.textContent='payment required';}
    else if(access?.status==='ACTIVE'||phase==='ACTIVE'){card.classList.add('active');$('status-icon').textContent='✓';$('status-eyebrow').textContent='SUBSCRIPTION ACTIVE';$('status-title').textContent='Your KORbuild subscription is active';$('status-message').textContent='Your workspace has full access to KORbuild.';metric.textContent='✓';label.textContent='active';}
    else if(access?.access==='BLOCKED'){card.classList.add('blocked');$('status-icon').textContent='🔒';$('status-eyebrow').textContent='ACCESS PAUSED';$('status-title').textContent='Your KORbuild access is paused';$('status-message').textContent='Complete payment to reactivate your workspace.';}
    else {$('status-eyebrow').textContent='SUBSCRIPTION STATUS';$('status-title').textContent='We could not determine your subscription status';$('status-message').textContent='Please refresh the page or contact support.';}
    setOffer(access);
  }

  try{
    const {data:{session}}=await client.auth.getSession();if(!session?.user)return;
    $('user-email').textContent=session.user.email||'';
    const name=session.user.user_metadata?.full_name||session.user.email?.split('@')[0]||'Owner';
    $('user-name').textContent=name;$('user-avatar').textContent=name.charAt(0).toUpperCase();
    const [{data:price,error:priceError},{data:access,error:accessError}]=await Promise.all([
      client.rpc('get_company_commercial_price'),
      window.KORBUILD_ACCESS_READY?window.KORBUILD_ACCESS_READY:client.rpc('get_workspace_access_status').then(r=>r.data)
    ]);
    if(priceError)throw priceError;if(accessError)throw accessError;
    commercial=price||{};renderStatus(access);
    $('subscribe-btn').addEventListener('click',()=>{console.log('Checkout flow pending Mercado Pago integration');});
  }catch(error){console.error('Billing initialization failed',error);}
  const btn=$('user-menu-btn'),menu=$('user-menu');if(btn&&menu)btn.addEventListener('click',()=>menu.classList.toggle('hidden'));
})();