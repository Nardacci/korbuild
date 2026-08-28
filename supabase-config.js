window.KORBUILD_SUPABASE = {
  url: 'https://nowbohxeqwlddbfnukva.supabase.co',
  publishableKey: 'sb_publishable_OTGYzEhQxckBa_8Xqu4Uog_Dm3RmTtD'
};

// Single source for the product version. Every application page that loads
// this bootstrap inherits the same version and cache key.
if (!window.KORBUILD_APP) {
  const script = document.createElement('script');
  script.src = 'app-config.js?v=1.2.2';
  document.head.appendChild(script);
}

// Shared visual fixes. This does not alter page layout.
if (!document.querySelector('link[data-korbuild-ui-fixes]')) {
  const style = document.createElement('link');
  style.rel = 'stylesheet';
  style.href = 'ui-fixes.css?v=1.2.2';
  style.dataset.korbuildUiFixes = 'true';
  document.head.appendChild(style);
}

// Shared application navigation. All operational pages use the same menu;
// the Records group starts collapsed and expands only when clicked.
(function applyKORbuildNavigation(){
  const run = () => {
    const sidebar = document.querySelector('aside.sidebar');
    if (!sidebar) return;
    const nav = sidebar.querySelector('nav');
    if (!nav) return;

    const path = (location.pathname.split('/').pop() || 'home.html').toLowerCase();
    const is = (files) => files.includes(path);
    const active = {
      evaluations: is(['evaluations.html']),
      periods: is(['periods.html']),
      bonuses: is(['bonuses.html']),
      workUnits: is(['work-units.html','work-units-form.html']),
      teams: is(['teams.html','teams-form.html']),
      people: is(['people.html','people-form.html']),
      occurrences: is(['occurrences.html','occurrence-form.html']),
      reports: is(['reports.html'])
    };

    nav.innerHTML = `
      <a class="nav-item ${active.evaluations ? 'active' : ''}" href="evaluations.html"><span>✓</span>Evaluations</a>
      <a class="nav-item ${active.periods ? 'active' : ''}" href="periods.html"><span>◷</span>Periods</a>
      <a class="nav-item ${active.bonuses ? 'active' : ''}" href="bonuses.html"><span>★</span>Bonuses</a>
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
      <a class="nav-item ${active.reports ? 'active' : ''}" href="reports.html"><span>▥</span>Reports</a>`;

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

// Keep the setup page on the current setup script while GitHub Pages cache
// settles between prototype versions.
if (location.pathname.endsWith('/setup.html') || location.pathname.endsWith('/setup')) {
  const setupRefresh = document.createElement('script');
  setupRefresh.src = 'setup-v2.js?v=5';
  document.body.appendChild(setupRefresh);
}