// KORbuild notification bell -- self-injecting global component, same
// insertion pattern as i18n.js's language toggle: finds .topbar
// .user-menu-wrap (falling back to .topbar) and inserts itself right
// before it. Only covers non-blocking BILLING alerts (subscription
// renewal approaching, payment failed / PAST_DUE) -- Schedule/Payment
// domain alerts live in their own dashboards' "Attention Required"
// blocks, not here. No realtime: alerts are recomputed once per page load.
(function () {
  "use strict";

  const RENEWAL_THRESHOLD_DAYS = 7;
  const SEEN_KEY = "korbuild_notif_seen";
  const t = (s) => (window.KORbuildI18n ? window.KORbuildI18n.t(s) : s);

  function loadSeen() {
    try {
      return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || "[]"));
    } catch (e) {
      return new Set();
    }
  }
  function saveSeen(set) {
    try {
      localStorage.setItem(SEEN_KEY, JSON.stringify([...set]));
    } catch (e) {}
  }

  function buildAlerts(access) {
    const alerts = [];
    if (!access) return alerts;
    const days = Number(access.days_remaining);

    if (access.phase === "POST_SETUP" && Number.isFinite(days) && days <= RENEWAL_THRESHOLD_DAYS) {
      alerts.push({
        type: "renewal_post_setup",
        icon: "warning",
        message: `Your monthly subscription starts in ${days} ${days === 1 ? "day" : "days"}.`,
        href: "billing.html",
      });
    }
    if (access.status === "ACTIVE" && access.provider === "mercadopago" && Number.isFinite(days) && days <= RENEWAL_THRESHOLD_DAYS) {
      alerts.push({
        type: "renewal_active",
        icon: "warning",
        message: `Your subscription renews in ${days} ${days === 1 ? "day" : "days"}.`,
        href: "billing.html",
      });
    }
    if (access.status === "PAST_DUE") {
      if (access.access === "ALLOWED" && Number.isFinite(days)) {
        alerts.push({
          type: "past_due_grace",
          icon: "danger",
          message: `Your last payment failed. ${days} ${days === 1 ? "day" : "days"} left to update.`,
          href: "billing.html",
        });
      } else {
        alerts.push({
          type: "past_due_blocked",
          icon: "danger",
          message: "Your payment failed and access was paused.",
          href: "billing.html",
        });
      }
    }
    return alerts;
  }

  function render(wrap, alerts) {
    const badge = wrap.querySelector(".kor-notif-badge");
    const list = wrap.querySelector(".kor-notif-list");
    const seen = loadSeen();
    const unseenCount = alerts.filter((a) => !seen.has(a.type)).length;
    badge.textContent = String(unseenCount);
    badge.classList.toggle("hidden", unseenCount === 0);

    if (!alerts.length) {
      list.innerHTML = `<div class="kor-notif-empty">${t("No alerts right now.")}</div>`;
      return;
    }
    list.innerHTML = alerts
      .map(
        (a) =>
          `<a class="kor-notif-item" href="${a.href}"><span class="kor-notif-icon ${a.icon}">!</span><span class="kor-notif-copy"><strong>${t(a.message)}</strong></span></a>`
      )
      .join("");
  }

  async function init() {
    const target = document.querySelector(".topbar .user-menu-wrap") || document.querySelector(".topbar");
    if (!target) return;
    const cfg = window.KORBUILD_SUPABASE;
    if (!cfg || !window.supabase) return;

    if (!document.querySelector('link[data-korbuild-notif-bell]')) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "notification-bell.css?v=1.0.0";
      link.dataset.korbuildNotifBell = "true";
      document.head.appendChild(link);
    }

    // autoRefreshToken is deliberately OFF here: this client only reads the
    // session once at load and is never touched again. Every page already
    // creates its OWN long-lived client with autoRefreshToken:true; a
    // second auto-refreshing client sharing the same localStorage session
    // key can rotate the refresh token out from under the page's own
    // client mid-request, turning a legitimate authenticated call into an
    // RLS failure. persistSession stays on so getSession() can still read
    // the session the page's own client already established.
    const db = window.supabase.createClient(cfg.url, cfg.publishableKey, { auth: { persistSession: true, autoRefreshToken: false } });
    const { data: { session } } = await db.auth.getSession();
    if (!session?.user) return;

    const wrap = document.createElement("div");
    wrap.className = "kor-notif-wrap";
    wrap.innerHTML = `
      <button type="button" class="kor-notif-btn" id="kor-notif-btn" aria-label="Notifications" aria-expanded="false">
        🔔<span class="kor-notif-badge hidden">0</span>
      </button>
      <div class="kor-notif-panel hidden" id="kor-notif-panel">
        <div class="kor-notif-title">${t("NOTIFICATIONS")}</div>
        <div class="kor-notif-list"></div>
      </div>`;
    target.parentNode.insertBefore(wrap, target);

    const btn = wrap.querySelector("#kor-notif-btn");
    const panel = wrap.querySelector("#kor-notif-panel");
    let currentAlerts = [];

    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const opening = panel.classList.contains("hidden");
      panel.classList.toggle("hidden", !opening);
      btn.setAttribute("aria-expanded", String(opening));
      if (opening && currentAlerts.length) {
        const seen = loadSeen();
        currentAlerts.forEach((a) => seen.add(a.type));
        saveSeen(seen);
        wrap.querySelector(".kor-notif-badge").classList.add("hidden");
      }
    });
    document.addEventListener("click", (e) => {
      if (!wrap.contains(e.target)) panel.classList.add("hidden");
    });

    try {
      const { data: profile } = await db.from("usuarios").select("empresa_id").eq("id", session.user.id).maybeSingle();
      if (!profile?.empresa_id) return;
      const { data: access, error } = await db.rpc("get_workspace_access_status");
      if (error) { console.warn("KORbuild notification bell: access status unavailable", error.message); return; }
      currentAlerts = buildAlerts(access);
      render(wrap, currentAlerts);
    } catch (e) {
      console.warn("KORbuild notification bell failed to load", e);
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
