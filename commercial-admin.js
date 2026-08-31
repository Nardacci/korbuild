(async()=>{const cfg=window.KORBUILD_SUPABASE;if(!cfg||!window.supabase)return;const c=window.supabase.createClient(cfg.url,cfg.publishableKey,{auth:{persistSession:true,autoRefreshToken:true}});const $=x=>document.getElementById(x);
function toast(message,type='success'){let el=document.querySelector('.kor-toast');if(!el){el=document.createElement('div');el.className='kor-toast';document.body.appendChild(el);}el.className='kor-toast show '+type;el.innerHTML='<span class="toast-icon">'+(type==='success'?'✓':'!')+'</span><span>'+message+'</span>';clearTimeout(window.__korToastTimer);window.__korToastTimer=setTimeout(()=>el.classList.remove('show'),3200);}
const money=(v,currency='USD')=>v==null?'Not defined':new Intl.NumberFormat('en-US',{style:'currency',currency}).format(Number(v));let data;
async function load(){const {data:d,error}=await c.rpc('get_korbuild_commercial_admin_data');if(error||!d){$('denied').classList.remove('hidden');return;}data=d;$('admin-content').classList.remove('hidden');const s=d.settings||{};$('base-setup-fee').value=s.base_setup_fee??'';$('monthly-price').value=s.monthly_price??'';$('currency').value=s.currency||'USD';$('base-preview').textContent='Base setup: '+money(s.base_setup_fee,s.currency);renderCompanies();renderAccessCompanies();loadPaymentInstructions();}
async function loadPaymentInstructions(){const {data:p,error}=await c.from('payment_instructions').select('*').eq('id',true).maybeSingle();if(error)return;const x=p||{};$('payment-method').value=x.method||'PIX';$('payment-account-holder-input').value=x.account_holder||'';$('payment-key-input').value=x.pix_key||'';$('payment-bank-input').value=x.bank_name||'';$('payment-contact-input').value=x.payment_contact||'';$('payment-instructions-notes').value=x.instructions||'';}
$('payment-instructions-form').onsubmit=async e=>{e.preventDefault();const user=(await c.auth.getUser()).data.user;const payload={id:true,method:$('payment-method').value,account_holder:$('payment-account-holder-input').value||null,pix_key:$('payment-key-input').value||null,bank_name:$('payment-bank-input').value||null,payment_contact:$('payment-contact-input').value||null,instructions:$('payment-instructions-notes').value||null,updated_at:new Date().toISOString(),updated_by:user?.id};const {error}=await c.from('payment_instructions').upsert(payload);if(error){toast(error.message,'error');return;}toast('Payment instructions updated successfully.');};
async function loadPaymentInstructions(){const {data:p,error}=await c.from('payment_instructions').select('*').eq('id',true).maybeSingle();if(error)return;const x=p||{};$('payment-method').value=x.method||'PIX';$('payment-account-holder-input').value=x.account_holder||'';$('payment-key-input').value=x.pix_key||'';$('payment-bank-input').value=x.bank_name||'';$('payment-contact-input').value=x.payment_contact||'';$('payment-instructions-notes').value=x.instructions||'';}
$('payment-instructions-form').onsubmit=async e=>{e.preventDefault();const user=(await c.auth.getUser()).data.user;const payload={id:true,method:$('payment-method').value,account_holder:$('payment-account-holder-input').value||null,pix_key:$('payment-key-input').value||null,bank_name:$('payment-bank-input').value||null,payment_contact:$('payment-contact-input').value||null,instructions:$('payment-instructions-notes').value||null,updated_at:new Date().toISOString(),updated_by:user?.id};const {error}=await c.from('payment_instructions').upsert(payload);if(error){toast(error.message,'error');return;}toast('Payment instructions updated successfully.');};
function renderCompanies(){const s=data.settings||{},base=s.base_setup_fee,cur=s.currency||'USD';$('companies-list').innerHTML=(data.companies||[]).map(x=>{const adj=Number(x.setup_adjustment_percent||0);const final=base==null?'Define base setup first':money(Number(base)*(1+adj/100),cur);return '<div class="company-row"><div class="company-name"><strong>'+escapeHtml(x.company_name)+'</strong><small>'+escapeHtml(x.country||'')+'</small></div><label>Setup adjustment %<input data-id="'+x.empresa_id+'" class="adjustment" type="number" min="-100" max="500" step="1" value="'+adj+'"></label><div class="final-price">Final setup<br>'+final+'</div><button class="save-term" data-id="'+x.empresa_id+'">Save</button></div>';}).join('')||'<p>No companies found.</p>';document.querySelectorAll('.save-term').forEach(b=>b.onclick=()=>saveTerm(b.dataset.id));}
function renderAccessCompanies(){
 const companies=data.companies||[];
 $('access-companies-list').innerHTML=companies.map(x=>{
   const status=String(x.subscription_status||'TRIALING').toUpperCase();
   const source=x.activation_source||'TRIAL';
   const enabled=x.trial_enabled!==false;
   return '<div class="access-row" data-company="'+x.empresa_id+'">'
    +'<div class="company-name"><strong>'+escapeHtml(x.company_name)+'</strong><small>'+escapeHtml(x.country||'')+'</small></div>'
    +'<label>Commercial status<select class="access-status"><option value="TRIALING" '+(status==='TRIALING'?'selected':'')+'>Trial</option><option value="ACTIVE" '+(status==='ACTIVE'?'selected':'')+'>Active</option><option value="SUSPENDED" '+(status==='SUSPENDED'?'selected':'')+'>Suspended</option><option value="CANCELLED" '+(status==='CANCELLED'?'selected':'')+'>Cancelled</option></select></label>'
    +'<label class="toggle-label"><span>Trial enabled</span><input class="trial-enabled" type="checkbox" '+(enabled?'checked':'')+'><i></i></label>'
    +'<label>Activation source<select class="activation-source"><option value="TRIAL" '+(source==='TRIAL'?'selected':'')+'>Trial</option><option value="MANUAL" '+(source==='MANUAL'?'selected':'')+'>Manual</option><option value="MERCADO_PAGO" '+(source==='MERCADO_PAGO'?'selected':'')+'>Mercado Pago</option><option value="STRIPE" '+(source==='STRIPE'?'selected':'')+'>Stripe</option><option value="OTHER" '+(source==='OTHER'?'selected':'')+'>Other</option></select></label>'
    +'<label class="reason-field">Reason / notes<input class="activation-reason" maxlength="250" value="'+escapeHtml(x.activation_reason||'')+'" placeholder="e.g. Manual payment received"></label>'
    +'<button class="save-access" data-id="'+x.empresa_id+'">Save access</button></div>';
 }).join('')||'<p>No companies found.</p>';
 document.querySelectorAll('.save-access').forEach(b=>b.onclick=()=>saveAccess(b.dataset.id));
}
async function saveAccess(id){
 const row=document.querySelector('.access-row[data-company="'+id+'"]');
 const status=row.querySelector('.access-status').value;
 const trialEnabled=row.querySelector('.trial-enabled').checked;
 const source=row.querySelector('.activation-source').value;
 const reason=row.querySelector('.activation-reason').value;
 const {error}=await c.rpc('update_company_access_control',{
   p_empresa_id:id,p_status:status,p_trial_enabled:trialEnabled,
   p_activation_source:source,p_activation_reason:reason
 });
 if(error){toast(error.message,'error');return;}
 await load();
 toast('Company access control updated successfully.');
}
function escapeHtml(v){return String(v||'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));}
$('settings-form').onsubmit=async e=>{e.preventDefault();const payload={id:true,base_setup_fee:$('base-setup-fee').value===''?null:Number($('base-setup-fee').value),monthly_price:$('monthly-price').value===''?null:Number($('monthly-price').value),currency:$('currency').value,updated_by:(await c.auth.getUser()).data.user?.id};const {error}=await c.from('commercial_pricing_settings').upsert(payload);if(error){toast(error.message,'error');return;}await load();toast('Standard pricing updated successfully.');};
async function saveTerm(id){const input=document.querySelector('.adjustment[data-id="'+id+'"]');const user=(await c.auth.getUser()).data.user;const payload={empresa_id:id,setup_adjustment_percent:Number(input.value||0),updated_by:user?.id};const {error}=await c.from('company_commercial_terms').upsert(payload,{onConflict:'empresa_id'});if(error){toast(error.message,'error');return;}await load();toast('Commercial adjustment updated.');}
await load();})();