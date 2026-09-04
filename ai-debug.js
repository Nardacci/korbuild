// Temporary V1.3.1 diagnostic + AI panel scroll behavior for Dashboard validation.
(function(){
  if(window.KORBUILD_AI_DEBUG_INSTALLED)return;
  window.KORBUILD_AI_DEBUG_INSTALLED=true;

  const setStatus=(text)=>{
    const el=document.querySelector('.kor-ai-footer');
    if(el)el.textContent='KORbuild AI · '+text;
  };

  // Keep the assistant viewport at the latest content whenever the panel opens
  // or a message/typing indicator is added. The scrollable container is the
  // panel body, not only the messages list.
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

  const observer=new MutationObserver(mutations=>{
    if(mutations.some(m=>m.target?.id==='kor-ai-messages'||m.target?.closest?.('#kor-ai-messages')))scrollToLatest();
  });

  const startObserver=()=>{
    const messages=document.querySelector('#kor-ai-messages');
    if(messages)observer.observe(messages,{childList:true,subtree:true});
    scrollToLatest();
  };

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{
    setStatus('Diagnostic ready');
    startObserver();
  },{once:true});
  else{
    setStatus('Diagnostic ready');
    startObserver();
  }
})();
