window.KORBUILD_APP = Object.freeze({
  version: '1.2.1',
  environment: 'Development environment',
  cacheVersion: '1.2.1'
});

(function applyKORbuildVersion(){
  const apply = () => document.querySelectorAll('.app-version, .demo-note').forEach(el => {
    el.textContent = `KORbuild V${window.KORBUILD_APP.version} · ${window.KORBUILD_APP.environment}`;
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply, { once:true });
  else apply();
})();