(function(){
  const cfg=window.KORBUILD_SUPABASE;
  if(!cfg||!window.supabase)return;
  const client=window.supabase.createClient(cfg.url,cfg.publishableKey,{auth:{persistSession:true,autoRefreshToken:true}});
  const $=id=>document.getElementById(id);
  const messages=$('kor-ai-messages');
  if(!messages)return;
  const addMessage=(text,role)=>{const el=document.createElement('div');el.className='kor-ai-message '+role;el.textContent=text;messages.appendChild(el);messages.scrollTop=messages.scrollHeight;return el;};
  const addTyping=()=>{const el=document.createElement('div');el.className='kor-ai-message assistant typing';el.textContent='KORbuild AI is thinking…';messages.appendChild(el);messages.scrollTop=messages.scrollHeight;return el;};
  const intentFor=(text)=>{try{return typeof classifyAIIntent==='function'?classifyAIIntent(text):'general'}catch{return'general'}};
  const contextFor=()=>{try{return typeof buildAIContext==='function'?buildAIContext():{page:'dashboard'}}catch{return{page:'dashboard'}}};
  const localFallback=window.askKORbuildAI;

  async function learningLoopContext(base){
    try{
      // The detector executes in the authenticated user's tenant context.
      await client.rpc('detect_ai_performance_declines');
      const {data:sessionData}=await client.auth.getSession();
      const uid=sessionData?.session?.user?.id;
      if(!uid)return base;
      const {data:profile}=await client.from('usuarios').select('empresa_id').eq('id',uid).maybeSingle();
      const empresaId=profile?.empresa_id;
      if(!empresaId)return base;
      // Explicit tenant filter in addition to RLS: an AI context must never
      // aggregate or expose another company's learning data.
      const {data:insights}=await client.from('ai_insights').select('id,tipo,titulo,descricao,severidade,confidence,status,evidencias,created_at').eq('empresa_id',empresaId).eq('status','active').order('created_at',{ascending:false}).limit(10);
      return {...base,learningLoop:{version:'1.0',tenantScoped:true,insights:insights||[]}};
    }catch(error){
      console.warn('Learning Loop context unavailable',error?.message||error);
      return base;
    }
  }

  async function askViaGateway(text){
    const {data:{session}}=await client.auth.getSession();
    if(!session?.access_token)throw new Error('unauthorized');
    const base= contextFor();
    const context=await learningLoopContext(base);
    const response=await fetch(cfg.url+'/functions/v1/korbuild-ai',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+session.access_token},body:JSON.stringify({message:text,context,intent:intentFor(text),feature:'dashboard_ai'})});
    const payload=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(payload.error||'gateway_error');
    if(!payload.answer)throw new Error('empty_ai_response');
    return payload;
  }

  document.addEventListener('submit',async event=>{
    const form=event.target;
    if(form?.id!=='kor-ai-form')return;
    event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
    const input=$('kor-ai-input');const text=String(input?.value||'').trim();if(!text)return;
    if(input)input.value='';
    addMessage(text,'user');
    const typing=addTyping();
    try{
      const result=await askViaGateway(text);
      typing.remove();
      addMessage(result.answer,'assistant');
    }catch(error){
      typing.remove();
      if(typeof localFallback==='function'){
        try{await localFallback(text);return;}catch{}
      }
      addMessage('A IA está temporariamente indisponível. Seus dados e limites de consumo continuam protegidos.','assistant');
    }
  },true);
})();