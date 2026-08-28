window.KORBUILD_SUPABASE = {
  url: 'https://nowbohxeqwlddbfnukva.supabase.co',
  publishableKey: 'sb_publishable_OTGYzEhQxckBa_8Xqu4Uog_Dm3RmTtD'
};

// Every application page already loads this file.
// Load the single product-version source automatically so new pages
// inherit the same version without duplicating it in their HTML.
if (!window.KORBUILD_APP) {
  const script = document.createElement('script');
  script.src = 'app-config.js?v=1.2.1';
  document.head.appendChild(script);
}

// Shared visual fixes. This does not alter page layout.
if (!document.querySelector('link[data-korbuild-ui-fixes]')) {
  const style = document.createElement('link');
  style.rel = 'stylesheet';
  style.href = 'ui-fixes.css?v=1.2.1';
  style.dataset.korbuildUiFixes = 'true';
  document.head.appendChild(style);
}