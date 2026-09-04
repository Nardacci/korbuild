// Temporary V1.4.0 diagnostic bootstrap for Dashboard AI validation.
(function(){
  if(window.KORBUILD_AI_DEBUG_INSTALLED)return;
  window.KORBUILD_AI_DEBUG_INSTALLED=true;

  const setStatus=(text)=>{
    const el=document.querySelector('.kor-ai-footer');
    if(el)el.textContent='KORbuild AI · '+text;
  };

  const scrollToLatest=()=>requestAnimationFrame(()=>{
    const body=document.querySelector('.kor-ai-body');
    const messages=document.querySelector('.kor-ai-messages');
    if(body)body.scrollTop=body.scrollHeight;
    if(messages)messages.scrollTop=messages.scrollHeight;
  });

  const originalFetch=window.fetch.bind(window);
  window.fetch=async function(input,init){
    const url=typeof input==='string'?input:(input?.url||'');
    if(url.includes('/functions/v1/korbuild-ai')){
      setStatus('Gateway request started');
      console.log('[KORbuild AI DEBUG] gateway request started',url);
      try{
        const response=await originalFetch(input,init);
        console.log('[KORbuild AI DEBUG] gateway response',response.status);
        setStatus('Gateway response · HTTP '+response.status);
        scrollToLatest();
        return response;
      }catch(error){
        console.error('[KORbuild AI DEBUG] gateway network error',error);
        setStatus('Gateway network error · '+(error?.message||'fetch failed'));
        scrollToLatest();
        throw error;
      }
    }
    return originalFetch(input,init);
  };

  document.addEventListener('click',event=>{
    if(event.target.closest?.('#kor-ai-fab'))scrollToLatest();
  },true);

  const observer=new MutationObserver(()=>scrollToLatest());
  const startObserver=()=>{
    const messages=document.querySelector('#kor-ai-messages');
    if(messages)observer.observe(messages,{childList:true,subtree:true});
    scrollToLatest();
  };

  // The page previously loaded a cached gateway build. Remove that pending
  // script before the parser reaches it and load the current build explicitly.
  // This is development-only and prevents stale gateway code from competing
  // with the legacy local AI handler.
  const legacyGateway=document.querySelector('script[src*="ai-gateway.js"]');
  if(legacyGateway)legacyGateway.remove();
  const gateway=document.createElement('script');
  gateway.src='ai-gateway.js?v=1.4.0';
  gateway.onload=()=>setStatus('Gateway loaded · ready');
  gateway.onerror=()=>setStatus('Gateway script load error');
  document.head.appendChild(gateway);

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{
    setStatus('Diagnostic ready');
    startObserver();
  },{once:true});
  else{
    setStatus('Diagnostic ready');
    startObserver();
  }
})();
