// Temporary V1.3.1 diagnostic for Dashboard AI gateway validation.
// Development-only: exposes whether the browser actually reaches the Edge Function.
(function(){
  if(window.KORBUILD_AI_DEBUG_INSTALLED)return;
  window.KORBUILD_AI_DEBUG_INSTALLED=true;
  const setStatus=(text)=>{
    const el=document.querySelector('.kor-ai-footer');
    if(el)el.textContent='KORbuild AI · '+text;
  };
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
        return response;
      }catch(error){
        console.error('[KORbuild AI DEBUG] gateway network error',error);
        setStatus('Gateway network error · '+(error?.message||'fetch failed'));
        throw error;
      }
    }
    return originalFetch(input,init);
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setStatus('Diagnostic ready'),{once:true});
  else setStatus('Diagnostic ready');
})();
