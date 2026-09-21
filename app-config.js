// Environment gating -- same check as supabase-config.js (see comment there).
window.KORBUILD_IS_TEST_ENV = window.KORBUILD_IS_TEST_ENV ?? /(^|[.])github[.]io$|^(localhost|127[.]0[.]0[.]1|)$/i.test(location.hostname);

window.KORBUILD_APP = Object.freeze({
  version: '1.2.2',
  environment: window.KORBUILD_IS_TEST_ENV ? 'Development environment' : '',
  cacheVersion: '1.2.2'
});

(function applyKORbuildVersion(){
  const apply = () => document.querySelectorAll('.app-version, .demo-note').forEach(el => {
    el.textContent = `KORbuild V${window.KORBUILD_APP.version}` + (window.KORBUILD_APP.environment ? ` · ${window.KORBUILD_APP.environment}` : '');
  });
  if (!window.KORBUILD_IS_TEST_ENV) document.querySelectorAll('.demo-badge').forEach(el => el.remove());
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply, { once:true });
  else apply();
})();