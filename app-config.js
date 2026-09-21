// Single source of truth for the app version and environment. Loaded BEFORE
// supabase-config.js on every page that uses either (supabase-config.js reads
// window.KORBUILD_APP / window.KORBUILD_IS_TEST_ENV instead of keeping its own
// copy). Bump the version here and nowhere else.
(function initKORbuildApp(){
  const VERSION = '1.2.9';

  // Environment gating: the "DEMO" badge and the "Development environment"
  // footer suffix are only shown on the GitHub Pages test site (and local dev /
  // file://). Any other hostname -- e.g. the Hostinger production domain -- is
  // treated as production and hides both.
  const isTest = /(^|[.])github[.]io$|^(localhost|127[.]0[.]0[.]1|)$/i.test(location.hostname);

  window.KORBUILD_IS_TEST_ENV = isTest;
  window.KORBUILD_APP = Object.freeze({
    version: VERSION,
    environment: isTest ? 'Development environment' : 'Production',
    isTestEnvironment: isTest,
    cacheVersion: VERSION
  });

  const apply = () => {
    document.querySelectorAll('.app-version, .demo-note').forEach(el => {
      el.textContent = `KORbuild V${VERSION}` + (isTest ? ` · ${window.KORBUILD_APP.environment}` : '');
    });
    if (!isTest) document.querySelectorAll('.demo-badge').forEach(el => el.remove());
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply, { once:true });
  else apply();
})();
