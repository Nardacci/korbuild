(async function(){
  const cfg=window.KORBUILD_SUPABASE;if(!cfg||!window.supabase)return;
  const client=window.supabase.createClient(cfg.url,cfg.publishableKey,{auth:{persistSession:true,autoRefreshToken:true}});
  const $=id=>document.getElementById(id);
  let commercial=null;let currentOffer=null;let paymentInstructions=null;let exchangeRate=null;
  const fmt=v=>new Intl.NumberFormat('en-US',{style:'currency',currency:commercial?.currency||'USD'}).format(Number(v||0));
  const fmtBRL=v=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(v||0));
  // Informational only, mirrors mercadopago-checkout's own convertToBrl() --
  // shown so the customer sees the real BRL amount before clicking pay, but
  // the SERVER always recomputes and charges based on its own latest cached
  // rate (this is never trusted as the source of truth for the charge).
  function updateBrlPreview(amount){
    const currency=(commercial?.currency||'USD').toUpperCase();
    if(currency==='BRL'||!exchangeRate?.found||!amount){
      $('price-brl')?.classList.add('hidden');
      return;
    }
    const brl=Number(amount)*Number(exchangeRate.rate);
    $('price-brl-amount').textContent=fmtBRL(brl);
    $('price-brl')?.classList.remove('hidden');
  }
  function updateMonthlyFollowupBrlPreview(amount){
    const currency=(commercial?.currency||'USD').toUpperCase();
    const el=$('monthly-followup-price-brl');
    if(!el)return;
    if(currency==='BRL'||!exchangeRate?.found||!amount){el.classList.add('hidden');return;}
    const brl=Number(amount)*Number(exchangeRate.rate);
    $('monthly-followup-price-brl-amount').textContent=fmtBRL(brl);
    el.classList.remove('hidden');
  }

  function setOffer(access){
    const phase=String(access?.phase||access?.status||'UNKNOWN').toUpperCase();
    const setupStatus=String(access?.setup_status||'PENDING').toUpperCase();
    const setupFee=Number(commercial?.setup_fee ?? access?.setup_fee ?? 0);
    const setupRequired=setupFee>0 && !['PAID','WAIVED'].includes(setupStatus);

    let amount=commercial?.monthly_price, suffix='/ month', button='Subscribe now →', context='Continue with the KORbuild monthly subscription.';

    // Commercial rule: while setup is still pending, the setup fee always takes precedence.
    // This intentionally also covers SETUP_REQUIRED and any pre-activation state.
    if(setupRequired && !['MONTHLY_PAYMENT','PAYMENT_REQUIRED','POST_SETUP','SETUP_ACTIVE','ACTIVE'].includes(phase)){
      amount=setupFee;
      suffix=' one-time setup';
      button='Continue with setup →';
      context='After setup payment, your monthly subscription starts 30 days later.';
    } else if(phase==='MONTHLY_PAYMENT' || phase==='PAYMENT_REQUIRED'){
      amount=commercial?.monthly_price;
      suffix='/ month';
      button='Start monthly subscription →';
      context='Your setup fee is waived. Your first monthly payment activates continued access.';
    } else if(phase==='POST_SETUP' || phase==='SETUP_ACTIVE'){
      // The button is a real, active call to action here -- clicking it
      // calls mercadopago-checkout, which already treats setup_status=PAID
      // as "create the monthly preapproval now" (previous copy, "Monthly
      // subscription scheduled ✓", wrongly read as a passive status with
      // nothing left to click).
      amount=commercial?.monthly_price;
      suffix='/ month';
      button='Subscribe now →';
      context='Your setup is complete. You can start your monthly subscription now, or wait until '+new Date(access.monthly_starts_at).toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})+', when it would normally begin.';
    } else if(phase==='ACTIVE'){
      amount=commercial?.monthly_price;
      suffix='/ month';
      button='Subscription active ✓';
      context='Your KORbuild subscription is active.';
    } else if(phase==='TRIAL' || phase==='TRIALING'){
      amount=commercial?.monthly_price;
      suffix='/ month';
      button='Subscribe when trial ends →';
      context='Your setup fee is waived. Your first monthly payment is due when your trial ends.';
    } else if(access?.status==='PAST_DUE'){
      amount=commercial?.monthly_price;
      suffix='/ month';
      button='Update payment →';
      context='Your last monthly payment could not be processed. Pay now to keep your KORbuild access active.';
    }

    currentOffer={amount,suffix,button,context,phase};
    $('price').textContent=amount!=null?fmt(amount):'Contact us';
    $('price-suffix').textContent=suffix;
    $('payment-context').textContent=context;
    updateBrlPreview(amount);

    // Always make the complete commercial journey explicit when setup is pending:
    // pay setup now, then the standard monthly subscription starts 30 days later.
    const monthlyFollowup=$('monthly-followup');
    if(monthlyFollowup){
      if(setupRequired){
        monthlyFollowup.classList.remove('hidden');
        $('monthly-followup-price').textContent=fmt(commercial?.monthly_price);
        updateMonthlyFollowupBrlPreview(commercial?.monthly_price);
      } else {
        monthlyFollowup.classList.add('hidden');
      }
    }

    $('subscribe-btn').textContent=button;
    $('subscribe-btn').disabled=false;
  }

  function renderStatus(access){
    const card=$('status-card');card.className='status-card';
    const phase=String(access?.phase||access?.status||'UNKNOWN').toUpperCase();
    const days=Math.max(0,Number(access?.days_remaining||0));
    const metric=$('status-days'),label=$('status-days-label');
    metric.textContent=days||'—';label.textContent=days===1?'day remaining':'days remaining';

    if(phase==='TRIAL' || phase==='TRIALING'){card.classList.add('active');$('status-icon').textContent='✦';$('status-eyebrow').textContent='YOUR FREE TRIAL';$('status-title').textContent='Your KORbuild trial is active';$('status-message').textContent='You have full access to every KORbuild feature during your trial.';$('billing-subtitle').textContent='You are currently exploring KORbuild with full access.';}
    else if(phase==='SETUP_PAYMENT' || phase==='SETUP_PAYMENT_REQUIRED' || phase==='SETUP_REQUIRED'){card.classList.add('warning');$('status-icon').textContent='◷';$('status-eyebrow').textContent='ACTIVATION REQUIRED';$('status-title').textContent='Complete your one-time setup payment';$('status-message').textContent='After payment, you keep full access and monthly billing begins 30 days later.';}
    else if(phase==='POST_SETUP'){card.classList.add('active');$('status-icon').textContent='✓';$('status-eyebrow').textContent='SETUP COMPLETE';$('status-title').textContent='Your workspace is active';$('status-message').textContent='Your monthly subscription begins after the 30-day setup period.';}
    else if(phase==='MONTHLY_PAYMENT'){card.classList.add('blocked');$('status-icon').textContent='🔒';$('status-eyebrow').textContent='MONTHLY SUBSCRIPTION';$('status-title').textContent='Your first monthly payment is due';$('status-message').textContent='Your setup fee was waived. Start your monthly subscription to continue.';metric.textContent='—';label.textContent='payment required';}
    else if(access?.status==='ACTIVE'||phase==='ACTIVE'){card.classList.add('active');$('status-icon').textContent='✓';$('status-eyebrow').textContent='SUBSCRIPTION ACTIVE';$('status-title').textContent='Your KORbuild subscription is active';$('status-message').textContent='Your workspace has full access to KORbuild.';metric.textContent='✓';label.textContent='active';}
    else if(access?.status==='PAST_DUE'){
      const inGrace=access?.access==='ALLOWED';
      card.classList.add(inGrace?'warning':'blocked');
      $('status-icon').textContent='!';
      $('status-eyebrow').textContent=inGrace?'PAYMENT FAILED':'ACCESS PAUSED';
      $('status-title').textContent=inGrace?'Your last payment failed':'Your KORbuild access is paused';
      $('status-message').textContent=inGrace
        ? 'Update your payment within '+days+' '+(days===1?'day':'days')+' to avoid losing access.'
        : 'Your subscription payment could not be completed. Update your payment to restore access.';
      if(!inGrace){metric.textContent='—';label.textContent='payment required';}
    }
    else if(access?.access==='BLOCKED'){card.classList.add('blocked');$('status-icon').textContent='🔒';$('status-eyebrow').textContent='ACCESS PAUSED';$('status-title').textContent='Your KORbuild access is paused';$('status-message').textContent='Complete payment to reactivate your workspace.';}
    else {$('status-eyebrow').textContent='SUBSCRIPTION STATUS';$('status-title').textContent='We could not determine your subscription status';$('status-message').textContent='Please refresh the page or contact support.';}
    setOffer(access);
  }

  try{
    const {data:{session}}=await client.auth.getSession();if(!session?.user)return;
    $('user-email').textContent=session.user.email||'';
    const name=session.user.user_metadata?.full_name||session.user.email?.split('@')[0]||'Owner';
    $('user-name').textContent=name;$('user-avatar').textContent=name.charAt(0).toUpperCase();
    const [priceResult, accessResult, rateResult] = await Promise.all([
      client.rpc('get_company_commercial_price'),
      window.KORBUILD_ACCESS_READY
        ? window.KORBUILD_ACCESS_READY
        : client.rpc('get_workspace_access_status'),
      // Best-effort only: a missing/failed rate hides the BRL preview line
      // (see updateBrlPreview) but never blocks the page -- the price in
      // the company's own currency is still shown either way.
      client.rpc('obter_cotacao_atual').catch(()=>({data:null}))
    ]);

    const price = priceResult?.data ?? priceResult;
    const priceError = priceResult?.error || null;

    // KORBUILD_ACCESS_READY resolves the access object directly,
    // while Supabase RPC resolves { data, error }. Normalize both shapes.
    const access = accessResult?.data ?? accessResult;
    const accessError = accessResult?.error || null;

    if(priceError)throw priceError;
    if(accessError)throw accessError;

    exchangeRate=rateResult?.data||null;
    commercial=price||{};
    renderStatus(access);
    $('subscribe-btn').addEventListener('click',startMercadoPagoCheckout);
    $('manual-pix-btn').addEventListener('click',openPaymentInstructions);
    $('payment-close').addEventListener('click',closePaymentInstructions);
    $('payment-modal').addEventListener('click',e=>{if(e.target.id==='payment-modal')closePaymentInstructions();});
    $('copy-payment-key').addEventListener('click',copyPaymentKey);
    document.addEventListener('keydown',e=>{if(e.key==='Escape')closePaymentInstructions();});
  async function startMercadoPagoCheckout(){
    if(!currentOffer)return;
    const btn=$('subscribe-btn');
    const original=btn.textContent;
    btn.disabled=true;btn.textContent='Redirecting to Mercado Pago...';
    try{
      const {data:{session}}=await client.auth.getSession();
      if(!session?.access_token)throw new Error('Your session expired. Please sign in again.');
      const res=await fetch(cfg.url+'/functions/v1/mercadopago-checkout',{
        method:'POST',
        headers:{'Content-Type':'application/json','Authorization':'Bearer '+session.access_token,'apikey':cfg.publishableKey}
      });
      const body=await res.json().catch(()=>null);
      if(!res.ok||!body?.init_point){
        throw new Error(body?.error==='already_subscribed'?'You already have an active subscription.':(body?.error||('Mercado Pago checkout failed (HTTP '+res.status+').')));
      }
      window.location.href=body.init_point;
    }catch(error){
      console.error('Mercado Pago checkout failed',error);
      alert('We could not start the Mercado Pago checkout. '+(error?.message||'Please try again, or use the manual PIX option below.'));
      btn.disabled=false;btn.textContent=original;
    }
  }
  async function openPaymentInstructions(){
    if(!currentOffer)return;
    if(!paymentInstructions){
      const r=await client.rpc('get_payment_instructions');
      if(r.error){console.error(r.error);alert('Payment instructions are temporarily unavailable. Please contact KORbuild.');return;}
      paymentInstructions=r.data||{};
    }
    const p=paymentInstructions;
    // PIX only settles in BRL -- showing the USD/EUR list price here would
    // tell the customer to transfer the wrong number. Same conversion the
    // Mercado Pago checkout applies server-side, shown here since this
    // manual flow has no server round-trip to do it for us.
    const currency=(commercial?.currency||'USD').toUpperCase();
    if(currency==='BRL'){
      $('payment-modal-amount').textContent=fmt(currentOffer.amount);
    } else if(exchangeRate?.found){
      $('payment-modal-amount').textContent=fmtBRL(Number(currentOffer.amount)*Number(exchangeRate.rate))+' ('+fmt(currentOffer.amount)+')';
    } else {
      $('payment-modal-amount').textContent='Contact KORbuild for the exact amount';
    }
    $('payment-modal-intro').textContent=currentOffer.suffix.includes('setup')
      ? 'This is your one-time setup payment. Your monthly subscription begins 30 days later.'
      : 'This payment keeps your KORbuild workspace active.';
    $('payment-method-badge').textContent=p.method||'PAYMENT';
    $('payment-account-holder').textContent=p.account_holder||'Payment details';
    $('payment-bank').textContent=p.bank_name||'';
    $('payment-key-label').textContent=(p.method||'PAYMENT')+' KEY';
    $('payment-key').textContent=p.pix_key||'Contact KORbuild for payment details';
    $('payment-after-text').textContent=p.instructions||'After completing payment, send your confirmation so we can activate or update your workspace access.';
    $('payment-contact').textContent=p.payment_contact?'Send confirmation to: '+p.payment_contact:'';
    $('payment-modal').classList.remove('hidden');
  }
  function closePaymentInstructions(){$('payment-modal')?.classList.add('hidden');}
  async function copyPaymentKey(){
    const key=$('payment-key').textContent;
    if(!key||key==='—')return;
    try{await navigator.clipboard.writeText(key);const b=$('copy-payment-key');const old=b.textContent;b.textContent='Copied ✓';setTimeout(()=>b.textContent=old,1800);}catch(e){console.error(e);}
  }
  }catch(error){console.error('Billing initialization failed',error);}
  const btn=$('user-menu-btn'),menu=$('user-menu');if(btn&&menu)btn.addEventListener('click',()=>menu.classList.toggle('hidden'));
})();