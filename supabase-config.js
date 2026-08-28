window.KORBUILD_SUPABASE = {
  url: 'https://nowbohxeqwlddbfnukva.supabase.co',
  publishableKey: 'sb_publishable_OTGYzEhQxckBa_8Xqu4Uog_Dm3RmTtD'
};

// KORbuild V1.2.2 — single shared UI/bootstrap source.
// The version is intentionally enforced here as well as in app-config.js so
// pages carrying an older cached app-config URL cannot revert the footer.
const KORBUILD_VERSION = '1.2.2';
const KORBUILD_ENVIRONMENT = 'Development environment';
const applyKORbuildVersion = () => {
  document.querySelectorAll('.app-version, .demo-note').forEach(el => {
    el.textContent = `KORbuild V${KORBUILD_VERSION} · ${KORBUILD_ENVIRONMENT}`;
  });
};
window.KORBUILD_APP = Object.freeze({ version: KORBUILD_VERSION, environment: KORBUILD_ENVIRONMENT, cacheVersion: KORBUILD_VERSION });

if (!document.querySelector('link[data-korbuild-ui-fixes]')) {
  const style = document.createElement('link');
  style.rel = 'stylesheet';
  style.href = 'ui-fixes.css?v=1.2.2';
  style.dataset.korbuildUiFixes = 'true';
  document.head.appendChild(style);
}

// One navigation definition for every operational page.
// Dashboard is reached from the logo/user menu. Records is collapsed by default.
(function applyKORbuildNavigation(){
  const run = () => {
    applyKORbuildVersion();
    const sidebar = document.querySelector('aside.sidebar');
    if (!sidebar) return;
    const nav = sidebar.querySelector('nav');
    if (!nav) return;

    const path = (location.pathname.split('/').pop() || 'home.html').toLowerCase();
    const is = files => files.includes(path);
    const active = {
      periods: is(['periods.html']),
      workUnits: is(['work-units.html','work-units-form.html']),
      teams: is(['teams.html','teams-form.html']),
      people: is(['people.html','people-form.html']),
      occurrences: is(['occurrences.html','occurrence-form.html'])
    };

    nav.innerHTML = `
      <a class="nav-item" href="#"><span>✓</span>Evaluations</a>
      <a class="nav-item ${active.periods ? 'active' : ''}" href="periods.html"><span>◷</span>Periods</a>
      <a class="nav-item" href="#"><span>★</span>Bonuses</a>
      <div id="records-group" class="nav-group" style="margin:2px 0">
        <button id="records-toggle" class="nav-group-title" type="button" aria-expanded="false" style="width:100%;display:flex;align-items:center;gap:12px;padding:11px 12px;border:0;border-radius:9px;background:transparent;color:#40506a;font:500 13px Inter,system-ui,sans-serif;text-align:left;cursor:pointer">
          <span id="records-chevron" style="width:16px;text-align:center;font-size:12px;color:#6b7890">⌄</span>Records
        </button>
        <div id="records-items" class="nav-group-items" style="display:none;padding-left:8px">
          <a class="nav-item ${active.workUnits ? 'active' : ''}" href="work-units.html"><span>▣</span>Work Units</a>
          <a class="nav-item ${active.teams ? 'active' : ''}" href="teams.html"><span>◇</span>Teams</a>
          <a class="nav-item ${active.people ? 'active' : ''}" href="people.html"><span>◉</span>People</a>
          <a class="nav-item ${active.occurrences ? 'active' : ''}" href="occurrences.html"><span>⚠</span>Occurrences</a>
        </div>
      </div>
      <a class="nav-item" href="#"><span>▥</span>Reports</a>`;

    const toggle = document.getElementById('records-toggle');
    const items = document.getElementById('records-items');
    const chevron = document.getElementById('records-chevron');
    if (toggle && items && chevron) {
      toggle.addEventListener('click', () => {
        const open = toggle.getAttribute('aria-expanded') === 'true';
        toggle.setAttribute('aria-expanded', String(!open));
        items.style.display = open ? 'none' : 'block';
        chevron.textContent = open ? '⌄' : '⌃';
      });
    }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once:true });
  else run();
})();

// Re-apply after any older cached app-config callback fires.
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', applyKORbuildVersion, { once:false });
else applyKORbuildVersion();

if (location.pathname.endsWith('/setup.html') || location.pathname.endsWith('/setup')) {
  const setupRefresh = document.createElement('script');
  setupRefresh.src = 'setup-v2.js?v=5';
  document.body.appendChild(setupRefresh);
}