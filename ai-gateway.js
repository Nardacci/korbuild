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
  async function askViaGateway(text){
    const {data:{session}}=await client.auth.getSession();
    if(!session?.access_token)throw new Error('unauthorized');
    const response=await fetch(cfg.url+'/functions/v1/korbuild-ai',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+session.access_token},body:JSON.stringify({message:text,context:contextFor(),intent:intentFor(text),feature:'dashboard_ai'})});
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