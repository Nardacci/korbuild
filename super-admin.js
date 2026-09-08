(() => {
  const SUPABASE_URL = 'https://nowbohxeqwlddbfnukva.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_OTGYzEhQxckBa_8Xqu4Uog_Dm3RmTtD';

  const init = async () => {
    if (!window.supabase) return;
    const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true }
    });

    const { data: { session } } = await client.auth.getSession();
    if (!session?.user) {
      window.location.replace('index.html');
      return;
    }

    const { data: isAdmin, error: adminError } = await client.rpc('is_korbuild_super_admin');
    if (adminError || !isAdmin) {
      window.location.replace('home.html');
      return;
    }

    const userButton = document.getElementById('user-menu-btn');
    const menu = document.getElementById('user-menu');
    if (!userButton || !menu) return;

    const user = session.user;
    const email = user.email || '';
    const name = user.user_metadata?.full_name || user.user_metadata?.name || 'Super Admin';
    const initial = name.trim().charAt(0).toUpperCase() || 'S';

    document.getElementById('user-name').textContent = name;
    document.getElementById('user-email').textContent = email;
    document.getElementById('user-avatar').textContent = initial;

    menu.innerHTML = `
      <div class="menu-header">
        <span class="avatar large">${initial}</span>
        <div><b>${escapeHtml(name)}</b><small>${escapeHtml(email)}</small></div>
      </div>
      <div class="menu-divider"></div>
      <a class="menu-item" href="super-admin.html">⌂ <span>Dashboard</span></a>
      <a class="menu-item" href="commercial-admin.html">⚙ <span>Configurações</span></a>
      <button id="menu-logout" class="menu-item danger" type="button">↪ <span>Sair</span></button>
    `;

    userButton.addEventListener('click', (event) => {
      event.stopPropagation();
      const open = menu.classList.toggle('open');
      userButton.setAttribute('aria-expanded', String(open));
    });

    document.addEventListener('click', (event) => {
      if (!menu.contains(event.target) && !userButton.contains(event.target)) {
        menu.classList.remove('open');
        userButton.setAttribute('aria-expanded', 'false');
      }
    });

    menu.querySelector('#menu-logout')?.addEventListener('click', async () => {
      await client.auth.signOut();
      window.location.replace('index.html');
    });
  };

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  }[char]));

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
