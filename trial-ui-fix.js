/* KORbuild Trial UI fix — presentation and dynamic trial copy only. */
(function(){
  'use strict';

  function installStyles(){
    if(document.getElementById('korbuild-trial-ui-fix')) return;
    const style=document.createElement('style');
    style.id='korbuild-trial-ui-fix';
    style.textContent=`
      .trial-status-card{background:#fff;border:1px solid #dce3ec;border-radius:16px;box-shadow:0 10px 28px rgba(28,42,64,.06);padding:14px 18px;display:flex;align-items:center;gap:14px;margin:0 0 14px;min-height:72px;width:100%;}
      .trial-status-card.hidden{display:none!important;}
      .trial-status-icon{width:40px;height:40px;flex:0 0 40px;border-radius:12px;background:#eeecff;color:#5d54e8;display:grid;place-items:center;font-size:18px;font-weight:800;}
      .trial-status-copy{min-width:0;flex:1;}
      .trial-status-copy small{display:block;font-size:9px;font-weight:800;letter-spacing:.13em;color:#66758a;line-height:1.2;margin-bottom:3px;}
      .trial-status-copy strong{display:block;font-size:14px;line-height:1.25;color:#24344a;}
      .trial-status-copy p{margin:3px 0 0;font-size:10px;line-height:1.35;color:#69778b;}
      .trial-countdown{min-width:78px;text-align:center;padding:2px 12px;border-left:1px solid #eef0f4;border-right:1px solid #eef0f4;}
      .trial-countdown strong{display:block;font-size:24px;line-height:1;font-weight:800;color:#5d54e8;letter-spacing:-.03em;}
      .trial-countdown span{display:block;margin-top:4px;font-size:9px;color:#69778b;white-space:nowrap;}
      .trial-action{border:1px solid #dfe2f4;border-radius:9px;padding:9px 12px;font-size:10px;font-weight:700;color:#5364bf;white-space:nowrap;background:#fafaff;}
      .trial-action:hover{background:#f4f3ff;border-color:#c9c8ef;}
      .trial-status-card.grace .trial-status-icon,.trial-status-card.blocked .trial-status-icon{background:#fff0f0;color:#c44343;}
      .trial-status-card.grace .trial-countdown strong{color:#bc7c16;}
      .trial-status-card.blocked .trial-countdown strong{color:#c44343;}
      .logo-demo{display:none;}
      body.trial-active .logo-demo{display:inline-flex;}
      @media(max-width:700px){
        .trial-status-card{align-items:flex-start;flex-wrap:wrap;padding:13px 14px;}
        .trial-status-copy{flex-basis:calc(100% - 54px);}
        .trial-countdown{margin-left:54px;border-left:0;padding-left:0;text-align:left;min-width:70px;}
        .trial-action{margin-left:auto;}
      }
    `;
    document.head.appendChild(style);
  }

  function fixDynamicCopy(){
    const card=document.getElementById('trial-status-card');
    if(!card || card.classList.contains('hidden')) return;
    const lang=window.KORbuildI18n?.language || localStorage.getItem('korbuild-language') || 'en-US';
    if(lang!=='pt-BR') return;
    const title=document.getElementById('trial-title');
    if(title && title.textContent==='Your KORbuild trial is active.') title.textContent='Seu teste do KORbuild está ativo.';
    const message=document.getElementById('trial-message');
    if(message && message.textContent==='Explore the platform and build your workspace with full access.') message.textContent='Explore a plataforma e estruture seu workspace com acesso completo.';
    const label=document.getElementById('trial-days-label');
    if(label && label.textContent==='day free') label.textContent='dia grátis';
    const action=document.getElementById('trial-action');
    if(action && action.textContent==='View plans →') action.textContent='Ver planos →';
  }

  function boot(){
    installStyles();
    fixDynamicCopy();
    const observer=new MutationObserver(()=>fixDynamicCopy());
    observer.observe(document.body,{childList:true,subtree:true,characterData:true});
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot);
  else boot();
})();
