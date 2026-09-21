/**
 * Luna Stream IPTV - Master Administrative Dashboard Controller (Phase 4 Overhaul)
 * Complete implementation: Auth, Sidebar Navigation, Today's Action Hub, CRM, Orders,
 * Subscriptions, Payments, Coupons, Trials, Leads, Settings, and Audit Trail.
 */

// Global State
let allOrders = [];
let allCustomers = [];
let allSubscriptions = [];
let allPayments = [];
let allCoupons = [];
let allTrials = [];
let allTickets = [];
let allLeads = [];
let allVisitors = [];
let appSettings = {
  brand_name: "Luna Stream IPTV",
  supplier_cost_per_credit: 2.50,
  supplier_panel_url: "https://panel.example.com",
  renewal_discount_percent: 15,
  paypal_email: "wasifali740@gmail.com",
  paypal_me_link: "paypal.me/adilfarooq909",
  paypal_mode: "paypal_me"
};

let currentTab = 'dashboard';
let activeOrderFilter = 'all';
let activeSubFilter = 'all';

document.addEventListener('DOMContentLoaded', () => {
  initAuth();
  initSidebar();
  initSearch();
  initOrderForm();
  initCustomerForm();
  initSubscriptionForm();
  initCouponForm();
  initTicketReplyForm();
  initSettingsForms();
  initExportButtons();
});

/* ==========================================================================
   1. AUTHENTICATION & API WRAPPER
   ========================================================================== */

function getAdminToken() {
  try {
    return sessionStorage.getItem('ps_admin_token') || localStorage.getItem('ps_admin_token') || '';
  } catch (e) {
    return '';
  }
}

function setAdminToken(tok) {
  try { sessionStorage.setItem('ps_admin_token', tok); } catch (e) {}
  try { localStorage.setItem('ps_admin_token', tok); } catch (e) {}
  document.documentElement.classList.add('admin-pre-authenticated');
}

function clearAdminToken() {
  try { sessionStorage.removeItem('ps_admin_token'); } catch (e) {}
  try { localStorage.removeItem('ps_admin_token'); } catch (e) {}
  document.documentElement.classList.remove('admin-pre-authenticated');
}

function adminFetch(url, options = {}) {
  const token = getAdminToken();
  if (!options.headers) options.headers = {};
  if (token) options.headers['Authorization'] = `Bearer ${token}`;
  if (!options.headers['Content-Type'] && options.body) {
    options.headers['Content-Type'] = 'application/json';
  }
  return fetch(url, options).then(res => {
    if (res.status === 401) {
      clearAdminToken();
      const gate = document.getElementById('admin-auth-gate');
      const root = document.getElementById('admin-dashboard-root');
      if (gate) gate.classList.remove('hidden');
      if (root) root.classList.add('hidden');
      showToast('Session expired. Please log in again.', 'error');
      throw new Error('Unauthorized');
    }
    return res;
  });
}

function initAuth() {
  const gate = document.getElementById('admin-auth-gate');
  const root = document.getElementById('admin-dashboard-root');
  const loginForm = document.getElementById('admin-login-form');
  const logoutBtn = document.getElementById('btn-admin-logout');

  const token = getAdminToken();
  if (token) {
    // Already authenticated: immediately ensure gate is hidden and root is displayed
    if (gate) gate.classList.add('hidden');
    if (root) root.classList.remove('hidden');
    document.documentElement.classList.add('admin-pre-authenticated');

    // Load dashboard data immediately
    refreshAllData();
    if (typeof startLiveVisitorPolling === 'function') startLiveVisitorPolling();

    // Verify token validity in background
    fetch('/api/auth/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: token })
    }).then(res => {
      if (!res.ok) {
        clearAdminToken();
        if (gate) gate.classList.remove('hidden');
        if (root) root.classList.add('hidden');
        showToast('Session expired. Please log in again.', 'error');
      }
    }).catch(() => {
      // Keep session intact during temporary network drops
    });
  } else {
    clearAdminToken();
    if (gate) gate.classList.remove('hidden');
    if (root) root.classList.add('hidden');
  }

  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const passwordInput = document.getElementById('admin-password-input');
      const password = passwordInput ? passwordInput.value : '';
      const submitBtn = document.getElementById('btn-admin-login');
      const originalText = submitBtn ? submitBtn.textContent : 'Unlock';
      if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Verifying...'; }

      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password })
        });
        const data = await res.json();
        if (data.success && data.token) {
          setAdminToken(data.token);
          if (gate) gate.classList.add('hidden');
          if (root) root.classList.remove('hidden');
          if (passwordInput) passwordInput.value = '';
          showToast('Welcome to Luna Stream Admin!', 'success');
          refreshAllData();
          if (typeof startLiveVisitorPolling === 'function') startLiveVisitorPolling();
        } else {
          showToast(data.message || 'Invalid administrative password.', 'error');
        }
      } catch (err) {
        showToast('Login failed. Server unavailable.', 'error');
      } finally {
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = originalText; }
      }
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      clearAdminToken();
      window.location.reload();
    });
  }
}

/* ==========================================================================
   2. SIDEBAR NAVIGATION & ROUTING
   ========================================================================== */

function initSidebar() {
  const links = document.querySelectorAll('.sidebar-link');
  const sidebar = document.getElementById('admin-sidebar');

  links.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const tab = link.getAttribute('data-tab');
      if (tab) switchTab(tab);
      if (window.innerWidth < 768 && sidebar && !sidebar.classList.contains('hidden')) {
        sidebar.classList.add('hidden');
      }
    });
  });

  const mobileToggle = document.getElementById('btn-toggle-sidebar');
  if (mobileToggle && sidebar) {
    mobileToggle.addEventListener('click', () => {
      sidebar.classList.toggle('hidden');
    });
  }

  const refreshBtn = document.getElementById('btn-refresh-data');
  if (refreshBtn) refreshBtn.addEventListener('click', refreshAllData);

  // Synchronize URL hash with active admin tab
  const handleAdminHash = () => {
    const rawHash = (window.location.hash || '').replace('#', '').trim();
    if (rawHash) {
      const cleanTab = rawHash.replace('tab-content-', '');
      const validTabs = ['dashboard', 'orders', 'customers', 'subscriptions', 'payments', 'coupons', 'pricing', 'trials', 'tickets', 'leads', 'visitors', 'settings'];
      if (validTabs.includes(cleanTab)) {
        switchTab(cleanTab);
      }
    }
  };
  window.addEventListener('hashchange', handleAdminHash);
  handleAdminHash();

  const quickOrderBtn = document.getElementById('btn-quick-new-order');
  if (quickOrderBtn) quickOrderBtn.addEventListener('click', openNewOrderModal);

  const quickCustomerBtn = document.getElementById('btn-quick-new-customer');
  if (quickCustomerBtn) quickCustomerBtn.addEventListener('click', openNewCustomerModal);

  // Order status filter buttons
  const orderFilters = document.querySelectorAll('.order-status-filter');
  orderFilters.forEach(btn => {
    btn.addEventListener('click', () => {
      orderFilters.forEach(b => {
        b.classList.remove('active', 'bg-slate-700', 'text-white');
        b.classList.add('bg-slate-800', 'text-slate-400');
      });
      btn.classList.remove('bg-slate-800', 'text-slate-400');
      btn.classList.add('active', 'bg-slate-700', 'text-white');
      activeOrderFilter = btn.getAttribute('data-filter') || 'all';
      renderOrders();
    });
  });

  // Subscription status filter dropdown
  const subFilterSelect = document.getElementById('subs-filter');
  if (subFilterSelect) {
    subFilterSelect.addEventListener('change', (e) => {
      activeSubFilter = e.target.value;
      renderSubscriptions();
    });
  }
}

function switchTab(tabName) {
  currentTab = tabName;
  const links = document.querySelectorAll('.sidebar-link');
  const tabs = document.querySelectorAll('.admin-tab-content');

  links.forEach(link => {
    const isTarget = link.getAttribute('data-tab') === tabName;
    if (isTarget) {
      link.classList.add('active', 'text-[#F8FAFC]', 'bg-blue-600/10', 'border-l-4', 'border-[#3B82F6]');
      link.classList.remove('text-[#94A3B8]', 'border-transparent');
    } else {
      link.classList.remove('active', 'text-[#F8FAFC]', 'bg-blue-600/10', 'border-l-4', 'border-[#3B82F6]');
      link.classList.add('text-[#94A3B8]', 'border-l-4', 'border-transparent');
    }
  });

  tabs.forEach(t => {
    t.classList.add('hidden');
    t.classList.remove('block');
  });

  const targetTab = document.getElementById(`tab-content-${tabName}`);
  if (history.replaceState) {
    history.replaceState(null, '', '#' + tabName);
  }
  if (targetTab) {
    targetTab.classList.remove('hidden');
    targetTab.classList.add('block');
  }

  if (tabName === 'pricing' && typeof loadAdminPricing === 'function') {
    loadAdminPricing();
  }

  // Close mobile sidebar if open
  const sidebar = document.getElementById('admin-sidebar');
  if (window.innerWidth < 768 && sidebar && !sidebar.classList.contains('hidden')) {
    sidebar.classList.add('hidden');
  }
}

/* ==========================================================================
   3. DATA REFRESH & SYNCHRONIZATION
   ========================================================================== */

async function refreshAllData() {
  try {
    const [ordersRes, custRes, subsRes, payRes, coupRes, trialsRes, ticketsRes, leadsRes, visRes, setRes] = await Promise.allSettled([
      adminFetch('/api/admin/orders'),
      adminFetch('/api/admin/customers'),
      adminFetch('/api/admin/subscriptions'),
      adminFetch('/api/admin/payments'),
      adminFetch('/api/admin/coupons'),
      adminFetch('/api/admin/trials'),
      adminFetch('/api/admin/tickets'),
      adminFetch('/api/admin/leads'),
      adminFetch('/api/admin/visitors'),
      adminFetch('/api/admin/settings')
    ]);

    if (ordersRes.status === 'fulfilled' && ordersRes.value.ok) allOrders = await ordersRes.value.json();
    if (custRes.status === 'fulfilled' && custRes.value.ok) allCustomers = await custRes.value.json();
    if (subsRes.status === 'fulfilled' && subsRes.value.ok) allSubscriptions = await subsRes.value.json();
    if (payRes.status === 'fulfilled' && payRes.value.ok) allPayments = await payRes.value.json();
    if (coupRes.status === 'fulfilled' && coupRes.value.ok) {
      const cData = await coupRes.value.json();
      allCoupons = Array.isArray(cData) ? cData : (cData ? [cData] : []);
    }
    if (trialsRes.status === 'fulfilled' && trialsRes.value.ok) allTrials = await trialsRes.value.json();
    if (ticketsRes.status === 'fulfilled' && ticketsRes.value.ok) allTickets = await ticketsRes.value.json();
    if (leadsRes.status === 'fulfilled' && leadsRes.value.ok) allLeads = await leadsRes.value.json();
    if (visRes.status === 'fulfilled' && visRes.value.ok) {
      const visData = await visRes.value.json();
      allVisitors = Array.isArray(visData) ? visData : (visData.visitors || []);
      if (typeof handleLiveVisitorUpdate === 'function') {
        handleLiveVisitorUpdate(visData);
      }
    }
    if (setRes.status === 'fulfilled' && setRes.value.ok) appSettings = await setRes.value.json();

    updateBadgeCounts();
    renderDashboard();
    renderOrders();
    renderCustomers();
    renderSubscriptions();
    renderPayments();
    renderCoupons();
    renderTrials();
    renderTickets();
    renderLeads();
    renderVisitors();
    if (typeof loadAdminPricing === 'function') loadAdminPricing();

    showToast('Dashboard synchronized with server.', 'info');
  } catch (err) {
    console.error('Data refresh error:', err);
  }
}

function updateBadgeCounts() {
  const setBadge = (id, count) => {
    const el = document.getElementById(id);
    if (el) el.textContent = count.toString();
  };
  setBadge('badge-count-orders', allOrders.length);
  setBadge('badge-count-customers', allCustomers.length);
  setBadge('badge-count-subs', allSubscriptions.length);
  setBadge('badge-count-payments', allPayments.length);
  setBadge('badge-count-coupons', allCoupons.length);
  setBadge('badge-count-trials', allTrials.filter(t => t.status === 'Pending').length);
  setBadge('badge-count-tickets', allTickets.filter(t => t.status === 'OPEN' || t.status === 'WAITING_ON_ADMIN').length);
  setBadge('badge-count-leads', allLeads.length);
  if (typeof updatePricingBadgeCount === 'function') updatePricingBadgeCount();
}

/* ==========================================================================
   4. DASHBOARD & TODAY'S ACTION HUB
   ========================================================================== */

function renderDashboard() {
  let grossRev = 0;
  let activeSubs = 0;
  let expiring7d = 0;
  const now = new Date();

  allOrders.forEach(o => {
    if (o.status === 'Active' || o.payment_status === 'PAID') {
      grossRev += parseFloat(o.total_amount || 0);
    }
  });

  allSubscriptions.forEach(s => {
    if (s.status === 'ACTIVE') {
      activeSubs++;
      if (s.end_date) {
        const end = new Date(s.end_date);
        const diffDays = Math.ceil((end - now) / (1000 * 60 * 60 * 24));
        if (diffDays >= 0 && diffDays <= 7) expiring7d++;
      }
    }
  });

  // Calculate costs & net profit
  const creditCost = parseFloat(appSettings.supplier_cost_per_credit || 2.50);
  let totalCost = 0;
  allOrders.forEach(o => {
    if (o.status === 'Active') {
      const months = parseInt(o.duration_months || 3);
      const credits = (months / 12) * parseInt(o.devices_count || 1);
      totalCost += credits * creditCost;
    }
  });
  const netProfit = Math.max(0, grossRev - totalCost);
  const marginPercent = grossRev > 0 ? Math.round((netProfit / grossRev) * 100) : 0;

  // Render Stats
  const setElText = (id, txt) => {
    const el = document.getElementById(id);
    if (el) el.textContent = txt;
  };

  setElText('stat-revenue', `£${grossRev.toFixed(2)}`);
  setElText('stat-supplier-cost', `£${totalCost.toFixed(2)}`);
  setElText('stat-credit-rate', `@ £${creditCost.toFixed(2)} / credit`);
  setElText('stat-net-profit', `£${netProfit.toFixed(2)}`);
  setElText('stat-margin', `${marginPercent}% Margin`);
  setElText('stat-active', activeSubs.toString());
  setElText('stat-expiring', expiring7d.toString());
  setElText('stat-visitors', allVisitors.length.toString());
  setElText('stat-leads', allLeads.length.toString());

  const convRate = allVisitors.length > 0 ? ((allOrders.length / allVisitors.length) * 100).toFixed(1) : 0;
  setElText('stat-conversion', `${convRate}%`);

  // Render Today's Action Hub Cards
  const hubContainer = document.getElementById('action-hub-cards');
  if (hubContainer) {
    hubContainer.innerHTML = '';

    // 1. Pending Unfulfilled Orders
    const pendingOrders = allOrders.filter(o => o.status === 'Pending' || o.payment_status === 'PENDING_VERIFICATION');
    const card1 = createHubCard(
      '📦 Unfulfilled Orders',
      `${pendingOrders.length} orders awaiting IPTV lines`,
      pendingOrders.length > 0 ? 'border-amber-500/50 bg-amber-950/20 text-amber-400' : 'border-slate-800 bg-slate-900/50 text-slate-400',
      () => switchTab('orders')
    );
    hubContainer.appendChild(card1);

    // 2. Subscriptions Expiring in 3 Days
    const expiringSoon = allSubscriptions.filter(s => {
      if (s.status !== 'ACTIVE' || !s.end_date) return false;
      const days = Math.ceil((new Date(s.end_date) - now) / (1000 * 60 * 60 * 24));
      return days >= 0 && days <= 3;
    });
    const card2 = createHubCard(
      '⏰ Expiring in ≤3 Days',
      `${expiringSoon.length} subscribers need renewal reminders`,
      expiringSoon.length > 0 ? 'border-red-500/50 bg-red-950/20 text-red-400' : 'border-slate-800 bg-slate-900/50 text-slate-400',
      () => {
        switchTab('subscriptions');
        const f = document.getElementById('subs-filter');
        if (f) { f.value = 'expiring-3d'; f.dispatchEvent(new Event('change')); }
      }
    );
    hubContainer.appendChild(card2);

    // 3. Pending Trials
    const pendingTrials = allTrials.filter(t => t.status === 'Pending');
    const card3 = createHubCard(
      '⚡ 24H Trial Requests',
      `${pendingTrials.length} pending free trial requests`,
      pendingTrials.length > 0 ? 'border-blue-500/50 bg-cyan-950/20 text-blue-400' : 'border-slate-800 bg-slate-900/50 text-slate-400',
      () => switchTab('trials')
    );
    hubContainer.appendChild(card3);

    // 4. Open Support Tickets
    const openTickets = allTickets.filter(t => t.status === 'OPEN' || t.status === 'WAITING_ON_ADMIN');
    const cardTickets = createHubCard(
      '🎫 Open Support Tickets',
      `${openTickets.length} ticket(s) awaiting response`,
      openTickets.length > 0 ? 'border-purple-500/50 bg-purple-950/20 text-purple-400' : 'border-slate-800 bg-slate-900/50 text-slate-400',
      () => switchTab('tickets')
    );
    hubContainer.appendChild(cardTickets);

    // 5. Hot Leads
    const hotLeads = allLeads.slice(0, 5);
    const card4 = createHubCard(
      '🎯 WhatsApp Carts / Leads',
      `${allLeads.length} total captured checkout intents`,
      allLeads.length > 0 ? 'border-emerald-500/50 bg-emerald-950/20 text-emerald-400' : 'border-slate-800 bg-slate-900/50 text-slate-400',
      () => switchTab('leads')
    );
    hubContainer.appendChild(card4);
  }

  // Render Dashboard Pending Orders preview
  const pendingTbody = document.getElementById('dashboard-pending-orders');
  if (pendingTbody) {
    pendingTbody.innerHTML = '';
    const pending = allOrders.filter(o => o.status === 'Pending').slice(0, 5);
    if (pending.length === 0) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 5;
      td.className = 'py-4 text-center text-slate-500 text-xs';
      td.textContent = 'All caught up! No pending orders awaiting fulfillment.';
      tr.appendChild(td);
      pendingTbody.appendChild(tr);
    } else {
      pending.forEach(o => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-800/40 transition-colors';

        const tdId = document.createElement('td');
        tdId.className = 'py-2.5 font-mono text-blue-400 font-bold';
        tdId.textContent = o.id || 'N/A';

        const tdCust = document.createElement('td');
        tdCust.className = 'py-2.5';
        tdCust.textContent = o.customer_name || o.customer_email || 'Customer';

        const tdPlan = document.createElement('td');
        tdPlan.className = 'py-2.5 text-slate-400';
        tdPlan.textContent = `${o.plan_title || o.plan_id || 'Plan'} (${o.devices_count || 1} screens)`;

        const tdAmt = document.createElement('td');
        tdAmt.className = 'py-2.5 font-mono text-emerald-400 font-bold';
        tdAmt.textContent = `${o.currency || '£'}${o.total_amount || 0}`;

        const tdAct = document.createElement('td');
        tdAct.className = 'py-2.5 text-right';
        const btn = document.createElement('button');
        btn.className = 'btn-primary px-2.5 py-1 rounded text-[11px] font-bold text-white bg-blue-600 hover:bg-blue-500';
        btn.textContent = 'Fulfill Line';
        btn.onclick = () => editOrder(o.id);
        tdAct.appendChild(btn);

        tr.append(tdId, tdCust, tdPlan, tdAmt, tdAct);
        pendingTbody.appendChild(tr);
      });
    }
  }
}

function createHubCard(title, subtitle, colorClasses, onClick) {
  const card = document.createElement('div');
  card.className = `p-4 rounded-2xl border cursor-pointer hover:scale-[1.02] transition-all ${colorClasses}`;
  card.onclick = onClick;

  const h4 = document.createElement('h4');
  h4.className = 'font-bold text-xs mb-1';
  h4.textContent = title;

  const p = document.createElement('p');
  p.className = 'text-[11px] opacity-90';
  p.textContent = subtitle;

  card.append(h4, p);
  return card;
}

/* ==========================================================================
   5. ORDERS CONTROLLER
   ========================================================================== */

function renderOrders() {
  const tbody = document.getElementById('orders-table-body');
  if (!tbody) return;
  tbody.innerHTML = '';

  let filtered = allOrders;
  if (activeOrderFilter !== 'all') {
    filtered = filtered.filter(o => o.status === activeOrderFilter);
  }

  if (filtered.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 7;
    td.className = 'p-6 text-center text-slate-500 text-xs';
    td.textContent = 'No orders matching the current filter.';
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  filtered.forEach(o => {
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-slate-800/40 transition-colors';

    // 1. Order ID & Date
    const tdId = document.createElement('td');
    tdId.className = 'p-3.5';
    const idDiv = document.createElement('div');
    idDiv.className = 'font-mono font-bold text-blue-400';
    idDiv.textContent = o.id || 'N/A';
    const dateDiv = document.createElement('div');
    dateDiv.className = 'text-[10px] text-slate-500 mt-0.5';
    dateDiv.textContent = o.created_at ? new Date(o.created_at).toLocaleDateString() : '';
    tdId.append(idDiv, dateDiv);

    // 2. Customer & Device
    const tdCust = document.createElement('td');
    tdCust.className = 'p-3.5';
    const nameDiv = document.createElement('div');
    nameDiv.className = 'font-bold text-white';
    nameDiv.textContent = o.customer_name || 'Guest';
    const emailDiv = document.createElement('div');
    emailDiv.className = 'text-[11px] text-slate-400';
    emailDiv.textContent = o.customer_email || '';
    const devDiv = document.createElement('div');
    devDiv.className = 'text-[10px] text-slate-500 mt-0.5';
    devDiv.textContent = o.device_type ? `📺 ${o.device_type}` : '';
    tdCust.append(nameDiv, emailDiv, devDiv);

    // 3. Plan & Screens
    const tdPlan = document.createElement('td');
    tdPlan.className = 'p-3.5';
    const pTitle = document.createElement('div');
    pTitle.className = 'font-semibold text-slate-300';
    pTitle.textContent = o.plan_title || `${o.duration_months || 3} Months Pass`;
    const pScreens = document.createElement('div');
    pScreens.className = 'text-[10px] text-slate-400';
    pScreens.textContent = `⚡ ${o.devices_count || 1} Screen(s)`;
    tdPlan.append(pTitle, pScreens);

    // 4. Amount & Payment Method
    const tdAmt = document.createElement('td');
    tdAmt.className = 'p-3.5 font-mono';
    const amtDiv = document.createElement('div');
    amtDiv.className = 'font-bold text-emerald-400';
    amtDiv.textContent = `${o.currency || '£'}${o.total_amount || 0}`;
    const pMethod = document.createElement('div');
    pMethod.className = 'text-[10px] text-slate-400';
    pMethod.textContent = o.payment_method || 'PayPal';
    tdAmt.append(amtDiv, pMethod);

    // 5. Status
    const tdStatus = document.createElement('td');
    tdStatus.className = 'p-3.5';
    const statusBadge = document.createElement('span');
    const st = o.status || 'Pending';
    statusBadge.className = `px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
      st === 'Active' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
      st === 'Pending' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
      st === 'Expired' ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
      'bg-slate-800 text-slate-400'
    }`;
    statusBadge.textContent = st;
    tdStatus.appendChild(statusBadge);

    // 6. IPTV Credentials
    const tdCreds = document.createElement('td');
    tdCreds.className = 'p-3.5 font-mono text-[11px]';
    if (o.xtream_username) {
      const uDiv = document.createElement('div');
      uDiv.textContent = `U: ${o.xtream_username}`;
      const pDiv = document.createElement('div');
      pDiv.textContent = `P: ${o.xtream_password ? '••••••••' : 'None'}`;
      tdCreds.append(uDiv, pDiv);
    } else {
      tdCreds.textContent = 'Not assigned';
      tdCreds.className += ' text-slate-500 italic';
    }

    // 7. Actions
    const tdAct = document.createElement('td');
    tdAct.className = 'p-3.5 text-right space-x-1';

    const btnEdit = document.createElement('button');
    btnEdit.className = 'px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded text-xs font-semibold border border-slate-700';
    btnEdit.textContent = 'Edit';
    btnEdit.onclick = () => editOrder(o.id);

    const btnDeliv = document.createElement('button');
    btnDeliv.className = 'px-2.5 py-1 bg-emerald-950/40 hover:bg-emerald-900/60 text-emerald-300 border border-emerald-500/30 rounded text-xs font-semibold';
    btnDeliv.textContent = 'Message';
    btnDeliv.onclick = () => openDeliveryModal(o.id);

    tdAct.append(btnEdit, btnDeliv);
    tr.append(tdId, tdCust, tdPlan, tdAmt, tdStatus, tdCreds, tdAct);
    tbody.appendChild(tr);
  });
}

function openNewOrderModal() {
  const modal = document.getElementById('order-edit-modal');
  const title = document.getElementById('modal-order-title');
  const form = document.getElementById('modal-order-form');
  if (form) form.reset();
  if (document.getElementById('edit-order-id')) document.getElementById('edit-order-id').value = '';
  if (title) title.textContent = 'Create New Subscriber Order';
  generateRandomCredentials();
  const paySection = document.getElementById('payment-confirm-section');
  if (paySection) paySection.classList.add('hidden');
  if (modal) modal.classList.remove('hidden');
}

function editOrder(orderId) {
  const o = allOrders.find(item => item.id === orderId);
  if (!o) return;
  const modal = document.getElementById('order-edit-modal');
  const title = document.getElementById('modal-order-title');
  if (title) title.textContent = `Edit Order: ${o.id}`;

  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val || '';
  };

  setVal('edit-order-id', o.id);
  setVal('edit-order-name', o.customer_name);
  setVal('edit-order-email', o.customer_email);
  setVal('edit-order-plan', o.plan_id || '3m');
  setVal('edit-order-devices', o.devices_count || 1);
  setVal('edit-order-status', o.status || 'Active');
  setVal('edit-order-user', o.xtream_username);
  setVal('edit-order-pass', o.xtream_password);
  setVal('edit-order-m3u', o.m3u_url);
  setVal('edit-order-notes', o.notes || '');

  // Payment Confirmation section in order fulfillment wizard
  const paySection = document.getElementById('payment-confirm-section');
  if (paySection) {
    if (o.payment_status === 'PAID') {
      paySection.classList.remove('hidden');
      paySection.innerHTML = '<div class="text-center text-emerald-400 text-xs font-bold py-1.5 bg-emerald-950/40 rounded-xl border border-emerald-500/30">✅ Payment Confirmed (PAID)</div>';
    } else {
      paySection.classList.remove('hidden');
      paySection.innerHTML = '<button type="button" onclick="confirmPaymentReceived()" class="w-full py-2.5 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-emerald-400 text-xs font-bold flex items-center justify-center gap-2 transition-all"><span>✅</span> <span>Confirm Payment Received (Mark as PAID)</span></button>';
    }
  }

  if (modal) modal.classList.remove('hidden');
}

function closeOrderModal() {
  const modal = document.getElementById('order-edit-modal');
  if (modal) modal.classList.add('hidden');
}

function generateRandomCredentials() {
  const randUser = 'luna_' + Math.random().toString(36).substring(2, 7);
  const randPass = 'tv_' + Math.random().toString(36).substring(2, 7);
  const uEl = document.getElementById('edit-order-user');
  const pEl = document.getElementById('edit-order-pass');
  const mEl = document.getElementById('edit-order-m3u');
  if (uEl) uEl.value = randUser;
  if (pEl) pEl.value = randPass;
  if (mEl) mEl.value = `http://line.lunaentertainment.online:8080/get.php?username=${randUser}&password=${randPass}&type=m3u_plus&output=ts`;
}

function initOrderForm() {
  const form = document.getElementById('modal-order-form');
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const orderId = document.getElementById('edit-order-id')?.value;
    const payload = {
      id: orderId,
      customer_name: document.getElementById('edit-order-name')?.value,
      customer_email: document.getElementById('edit-order-email')?.value,
      plan_id: document.getElementById('edit-order-plan')?.value,
      devices_count: parseInt(document.getElementById('edit-order-devices')?.value || 1),
      status: document.getElementById('edit-order-status')?.value,
      xtream_username: document.getElementById('edit-order-user')?.value,
      xtream_password: document.getElementById('edit-order-pass')?.value,
      m3u_url: document.getElementById('edit-order-m3u')?.value,
      notes: document.getElementById('edit-order-notes')?.value
    };

    try {
      const url = '/api/admin/orders';
      const method = orderId ? 'PATCH' : 'POST';
      const res = await adminFetch(url, { method, body: JSON.stringify(payload) });
      const data = await res.json();
      if (data.success) {
        showToast(orderId ? 'Order updated successfully!' : 'New order created!', 'success');
        closeOrderModal();
        refreshAllData();

        // Auto-transition to delivery modal if status is Active
        const savedStatus = payload.status;
        const targetId = orderId || (data.order && data.order.id);
        if (savedStatus === 'Active' && targetId) {
          setTimeout(() => {
            if (typeof openDeliveryModal === 'function') openDeliveryModal(targetId);
          }, 400);
        }
      } else {
        showToast(data.message || 'Failed to save order.', 'error');
      }
    } catch (err) {
      showToast('Error saving order.', 'error');
    }
  });
}

function openDeliveryModal(orderId) {
  currentDeliveryOrderId = orderId;
  const o = allOrders.find(item => item.id === orderId);
  if (!o) return;
  const modal = document.getElementById('customer-delivery-modal');
  const nameEl = document.getElementById('deliv-customer-name');
  const textEl = document.getElementById('deliv-message-text');
  const waBtn = document.getElementById('btn-deliv-send-whatsapp');

  if (nameEl) nameEl.textContent = o.customer_name || 'Customer';

  const planTitle = o.plan_title || `${o.duration_months || 3} Months Subscription`;
  const message = `✨ *LUNA STREAM IPTV — YOUR SUBSCRIPTION IS ACTIVE* ✨\n\n` +
    `Hello ${o.customer_name || 'Valued Customer'},\n` +
    `Thank you for choosing Luna Stream! Your 4K Ultra-HD streaming line is ready.\n\n` +
    `📦 *Order ID:* ${o.id}\n` +
    `⚡ *Package:* ${planTitle} (${o.devices_count || 1} Screen${o.devices_count > 1 ? 's' : ''})\n\n` +
    `🔐 *YOUR IPTV CREDENTIALS:*\n` +
    `• Server Portal: http://line.lunaentertainment.online:8080\n` +
    `• Username: ${o.xtream_username || 'Pending'}\n` +
    `• Password: ${o.xtream_password || 'Pending'}\n\n` +
    `🔗 *M3U Playlist URL:*\n${o.m3u_url || 'Available in client portal'}\n\n` +
    `📱 *Need Setup Assistance?*\n` +
    `Visit our setup guide or message us directly here for instant 24/7 support.\n\n` +
    `Enjoy your streams! ⚽🍿`;

  if (textEl) textEl.value = message;

  if (waBtn) {
    const encoded = encodeURIComponent(message);
    const phone = o.customer_phone ? o.customer_phone.replace(/[^0-9]/g, '') : '447413469398';
    waBtn.href = `https://wa.me/${phone}?text=${encoded}`;
  }

  if (modal) modal.classList.remove('hidden');
}

function closeDeliveryModal() {
  const modal = document.getElementById('customer-delivery-modal');
  if (modal) modal.classList.add('hidden');
}

function copyDeliveryMessage() {
  const textEl = document.getElementById('deliv-message-text');
  if (textEl) {
    navigator.clipboard.writeText(textEl.value).then(() => {
      showToast('Delivery message copied to clipboard!', 'success');
    });
  }
}

/* ==========================================================================
   6. CUSTOMERS CRM CONTROLLER
   ========================================================================== */

function renderCustomers() {
  const tbody = document.getElementById('customers-table-body');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (allCustomers.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 7;
    td.className = 'p-6 text-center text-slate-500 text-xs';
    td.textContent = 'No customers registered yet. Customers are automatically indexed on orders.';
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  allCustomers.forEach(c => {
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-slate-800/40 transition-colors';

    // 1. Customer ID
    const tdId = document.createElement('td');
    tdId.className = 'p-3.5 font-mono text-blue-400 font-bold';
    tdId.textContent = c.id || 'N/A';

    // 2. Name & Email
    const tdName = document.createElement('td');
    tdName.className = 'p-3.5';
    const nameDiv = document.createElement('div');
    nameDiv.className = 'font-bold text-white';
    nameDiv.textContent = c.name || 'Anonymous';
    const emailDiv = document.createElement('div');
    emailDiv.className = 'text-[11px] text-slate-400';
    emailDiv.textContent = c.email || '';
    tdName.append(nameDiv, emailDiv);

    // 3. Phone
    const tdPhone = document.createElement('td');
    tdPhone.className = 'p-3.5 font-mono text-slate-300';
    tdPhone.textContent = c.phone || '—';

    // 4. Lifetime Value
    const tdLtv = document.createElement('td');
    tdLtv.className = 'p-3.5 font-mono font-bold text-emerald-400';
    tdLtv.textContent = `£${(c.lifetime_value || 0).toFixed(2)}`;

    // 5. Tags
    const tdTags = document.createElement('td');
    tdTags.className = 'p-3.5';
    const tags = Array.isArray(c.tags) ? c.tags : (c.tags ? [c.tags] : []);
    if (tags.length > 0) {
      tags.forEach(t => {
        const badge = document.createElement('span');
        badge.className = 'inline-block mr-1 px-2 py-0.5 bg-cyan-950/40 text-slate-400 border border-blue-500/30 rounded text-[10px] font-bold';
        badge.textContent = t;
        tdTags.appendChild(badge);
      });
    } else {
      tdTags.textContent = '—';
      tdTags.className += ' text-slate-600';
    }

    // 6. Status
    const tdStatus = document.createElement('td');
    tdStatus.className = 'p-3.5';
    const sBadge = document.createElement('span');
    sBadge.className = 'px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-500/20 text-emerald-400 border border-emerald-500/30';
    sBadge.textContent = c.status || 'active';
    tdStatus.appendChild(sBadge);

    // 7. Actions
    const tdAct = document.createElement('td');
    tdAct.className = 'p-3.5 text-right';
    const btn = document.createElement('button');
    btn.className = 'px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded text-xs font-semibold border border-slate-700';
    btn.textContent = 'Edit Profile';
    btn.onclick = () => viewCustomer(c.id);
    tdAct.appendChild(btn);

    tr.append(tdId, tdName, tdPhone, tdLtv, tdTags, tdStatus, tdAct);
    tbody.appendChild(tr);
  });
}

function openNewCustomerModal() {
  const modal = document.getElementById('customer-modal');
  const title = document.getElementById('modal-customer-title');
  const form = document.getElementById('modal-customer-form');
  if (form) form.reset();
  if (document.getElementById('edit-customer-id')) document.getElementById('edit-customer-id').value = '';
  if (title) title.textContent = 'Create Customer Record';
  const crmSections = document.getElementById('crm-profile-sections');
  if (crmSections) crmSections.classList.add('hidden');
  if (modal) modal.classList.remove('hidden');
}

function viewCustomer(customerId) {
  const c = allCustomers.find(item => item.id === customerId);
  if (!c) return;
  const modal = document.getElementById('customer-modal');
  const title = document.getElementById('modal-customer-title');
  if (title) title.textContent = `Customer: ${c.name || c.email}`;

  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val || '';
  };

  setVal('edit-customer-id', c.id);
  setVal('edit-customer-name', c.name);
  setVal('edit-customer-email', c.email);
  setVal('edit-customer-phone', c.phone);
  setVal('edit-customer-tags', Array.isArray(c.tags) ? c.tags.join(', ') : c.tags);
  setVal('edit-customer-notes', c.notes);

  populateCrmProfile(c);

  if (modal) modal.classList.remove('hidden');
}

function closeCustomerModal() {
  const modal = document.getElementById('customer-modal');
  if (modal) modal.classList.add('hidden');
}

function initCustomerForm() {
  const form = document.getElementById('modal-customer-form');
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const custId = document.getElementById('edit-customer-id')?.value;
    const rawTags = document.getElementById('edit-customer-tags')?.value || '';
    const tags = rawTags.split(',').map(t => t.trim()).filter(Boolean);
    const payload = {
      id: custId,
      name: document.getElementById('edit-customer-name')?.value,
      email: document.getElementById('edit-customer-email')?.value,
      phone: document.getElementById('edit-customer-phone')?.value,
      tags: tags,
      notes: document.getElementById('edit-customer-notes')?.value
    };

    try {
      const url = '/api/admin/customers';
      const method = custId ? 'PATCH' : 'POST';
      const res = await adminFetch(url, { method, body: JSON.stringify(payload) });
      const data = await res.json();
      if (data.success) {
        showToast('Customer saved successfully!', 'success');
        closeCustomerModal();
        refreshAllData();
      } else {
        showToast(data.message || 'Failed to save customer.', 'error');
      }
    } catch (err) {
      showToast('Error saving customer.', 'error');
    }
  });
}

/* ==========================================================================
   7. SUBSCRIPTIONS CONTROLLER
   ========================================================================== */

function renderSubscriptions() {
  const tbody = document.getElementById('subs-table-body');
  if (!tbody) return;
  tbody.innerHTML = '';

  const now = new Date();
  let filtered = allSubscriptions;

  if (activeSubFilter === 'ACTIVE') {
    filtered = filtered.filter(s => s.status === 'ACTIVE');
  } else if (activeSubFilter === 'EXPIRED') {
    filtered = filtered.filter(s => s.status === 'EXPIRED' || (s.end_date && new Date(s.end_date) < now));
  } else if (activeSubFilter === 'expiring-today') {
    filtered = filtered.filter(s => {
      if (!s.end_date) return false;
      const days = Math.ceil((new Date(s.end_date) - now) / (1000 * 60 * 60 * 24));
      return days === 0;
    });
  } else if (activeSubFilter === 'expiring-3d') {
    filtered = filtered.filter(s => {
      if (!s.end_date) return false;
      const days = Math.ceil((new Date(s.end_date) - now) / (1000 * 60 * 60 * 24));
      return days >= 0 && days <= 3;
    });
  } else if (activeSubFilter === 'expiring-7d') {
    filtered = filtered.filter(s => {
      if (!s.end_date) return false;
      const days = Math.ceil((new Date(s.end_date) - now) / (1000 * 60 * 60 * 24));
      return days >= 0 && days <= 7;
    });
  }

  if (filtered.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 7;
    td.className = 'p-6 text-center text-slate-500 text-xs';
    td.textContent = 'No subscriptions found matching the filter.';
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  filtered.forEach(s => {
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-slate-800/40 transition-colors';

    // 1. Sub ID & Order
    const tdId = document.createElement('td');
    tdId.className = 'p-3.5';
    const sId = document.createElement('div');
    sId.className = 'font-mono font-bold text-blue-400';
    sId.textContent = s.id || 'N/A';
    const oId = document.createElement('div');
    oId.className = 'text-[10px] text-slate-500 font-mono';
    oId.textContent = s.order_id ? `Order: ${s.order_id}` : '';
    tdId.append(sId, oId);

    // 2. Customer
    const tdCust = document.createElement('td');
    tdCust.className = 'p-3.5';
    const cust = allCustomers.find(c => c.id === s.customer_id);
    tdCust.textContent = cust ? (cust.name || cust.email) : (s.customer_id || '—');

    // 3. Plan & Screens
    const tdPlan = document.createElement('td');
    tdPlan.className = 'p-3.5';
    const pTitle = document.createElement('div');
    pTitle.className = 'font-semibold text-slate-300';
    pTitle.textContent = s.plan_title || `${s.plan_id || 'IPTV'} Pass`;
    const dev = document.createElement('div');
    dev.className = 'text-[10px] text-slate-400';
    dev.textContent = `📺 ${s.devices_count || 1} Screen(s)`;
    tdPlan.append(pTitle, dev);

    // 4. Duration & Expiry
    const tdDur = document.createElement('td');
    tdDur.className = 'p-3.5 text-xs';
    const end = s.end_date ? new Date(s.end_date) : null;
    const daysLeft = end ? Math.ceil((end - now) / (1000 * 60 * 60 * 24)) : 0;
    const endStr = end ? end.toLocaleDateString() : 'N/A';

    const endDiv = document.createElement('div');
    endDiv.className = 'font-mono text-white';
    endDiv.textContent = `Exp: ${endStr}`;

    const daysDiv = document.createElement('div');
    daysDiv.className = `text-[10px] font-bold ${daysLeft <= 3 ? 'text-red-400' : daysLeft <= 7 ? 'text-amber-400' : 'text-emerald-400'}`;
    daysDiv.textContent = daysLeft > 0 ? `${daysLeft} days remaining` : 'EXPIRED';
    tdDur.append(endDiv, daysDiv);

    // 5. Credentials
    const tdCreds = document.createElement('td');
    tdCreds.className = 'p-3.5 font-mono text-[11px]';
    const uSpan = document.createElement('div');
    uSpan.textContent = `U: ${s.xtream_username || 'N/A'}`;
    const pSpan = document.createElement('div');
    pSpan.textContent = `P: ${s.xtream_password ? '••••••••' : 'N/A'}`;
    tdCreds.append(uSpan, pSpan);

    // 6. Status
    const tdStatus = document.createElement('td');
    tdStatus.className = 'p-3.5';
    const sBadge = document.createElement('span');
    const isAct = s.status === 'ACTIVE' && daysLeft > 0;
    sBadge.className = `px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${isAct ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-red-500/20 text-red-400 border border-red-500/30'}`;
    sBadge.textContent = isAct ? 'ACTIVE' : 'EXPIRED';
    tdStatus.appendChild(sBadge);

    // 7. Actions
    const tdAct = document.createElement('td');
    tdAct.className = 'p-3.5 text-right';
    const btnEdit = document.createElement('button');
    btnEdit.className = 'px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded text-xs font-semibold border border-slate-700';
    btnEdit.textContent = 'Manage';
    btnEdit.onclick = () => editSubscription(s.id);
    tdAct.appendChild(btnEdit);

    tr.append(tdId, tdCust, tdPlan, tdDur, tdCreds, tdStatus, tdAct);
    tbody.appendChild(tr);
  });
}

function editSubscription(subId) {
  const s = allSubscriptions.find(item => item.id === subId);
  if (!s) return;
  const modal = document.getElementById('subscription-modal');

  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val || '';
  };

  setVal('edit-sub-id', s.id);
  setVal('edit-sub-status', s.status || 'ACTIVE');
  setVal('edit-sub-end-date', s.end_date ? s.end_date.split('T')[0] : '');
  setVal('edit-sub-user', s.xtream_username);
  setVal('edit-sub-pass', s.xtream_password);
  setVal('edit-sub-m3u', s.m3u_url);

  if (modal) modal.classList.remove('hidden');
}

function closeSubscriptionModal() {
  const modal = document.getElementById('subscription-modal');
  if (modal) modal.classList.add('hidden');
}

function extendSubscriptionDate(months) {
  const dateInput = document.getElementById('edit-sub-end-date');
  if (!dateInput) return;
  const current = dateInput.value ? new Date(dateInput.value) : new Date();
  current.setMonth(current.getMonth() + months);
  dateInput.value = current.toISOString().split('T')[0];
  showToast(`Extended expiry date by +${months} month(s)`, 'info');
}

function initSubscriptionForm() {
  const form = document.getElementById('modal-subscription-form');
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const subId = document.getElementById('edit-sub-id')?.value;
    const payload = {
      id: subId,
      status: document.getElementById('edit-sub-status')?.value,
      end_date: document.getElementById('edit-sub-end-date')?.value,
      xtream_username: document.getElementById('edit-sub-user')?.value,
      xtream_password: document.getElementById('edit-sub-pass')?.value,
      m3u_url: document.getElementById('edit-sub-m3u')?.value
    };

    try {
      const res = await adminFetch('/api/admin/subscriptions', {
        method: 'PATCH',
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        showToast('Subscription updated successfully!', 'success');
        closeSubscriptionModal();
        refreshAllData();
      } else {
        showToast(data.message || 'Failed to update subscription.', 'error');
      }
    } catch (err) {
      showToast('Error saving subscription.', 'error');
    }
  });
}

/* ==========================================================================
   8. PAYMENTS CONTROLLER
   ========================================================================== */

function renderPayments() {
  const tbody = document.getElementById('payments-table-body');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (allPayments.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 7;
    td.className = 'p-6 text-center text-slate-500 text-xs';
    td.textContent = 'No payment transactions recorded yet.';
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  allPayments.forEach(p => {
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-slate-800/40 transition-colors';

    const tdId = document.createElement('td');
    tdId.className = 'p-3.5 font-mono font-bold text-blue-400';
    tdId.textContent = p.id || 'N/A';

    const tdOrder = document.createElement('td');
    tdOrder.className = 'p-3.5 font-mono text-slate-300';
    tdOrder.textContent = p.order_id || '—';

    const tdCust = document.createElement('td');
    tdCust.className = 'p-3.5';
    tdCust.textContent = p.customer_id || '—';

    const tdProv = document.createElement('td');
    tdProv.className = 'p-3.5 text-xs';
    tdProv.textContent = p.provider === 'paypal_me' ? '🅿️ PayPal.Me' : (p.provider || 'PayPal');

    const tdAmt = document.createElement('td');
    tdAmt.className = 'p-3.5 font-mono font-bold text-emerald-400';
    tdAmt.textContent = `${p.currency || '£'}${p.amount || 0}`;

    const tdStatus = document.createElement('td');
    tdStatus.className = 'p-3.5';
    const sBadge = document.createElement('span');
    const st = p.status || 'PENDING';
    sBadge.className = `px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${st === 'CONFIRMED' || st === 'PAID' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'}`;
    sBadge.textContent = st;
    tdStatus.appendChild(sBadge);

    const tdDate = document.createElement('td');
    tdDate.className = 'p-3.5 text-right font-mono text-[11px] text-slate-400';
    tdDate.textContent = p.created_at ? new Date(p.created_at).toLocaleString() : '—';

    tr.append(tdId, tdOrder, tdCust, tdProv, tdAmt, tdStatus, tdDate);
    tbody.appendChild(tr);
  });
}

/* ==========================================================================
   9. COUPONS CONTROLLER
   ========================================================================== */

function renderCoupons() {
  const tbody = document.getElementById('coupons-table-body');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (allCoupons.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 7;
    td.className = 'p-6 text-center text-slate-500 text-xs';
    td.textContent = 'No promotional coupons active. Create one to run a sale!';
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  allCoupons.forEach(c => {
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-slate-800/40 transition-colors';

    const tdCode = document.createElement('td');
    tdCode.className = 'p-3.5 font-mono font-bold text-blue-400 text-sm';
    tdCode.textContent = c.code || 'N/A';

    const tdDisc = document.createElement('td');
    tdDisc.className = 'p-3.5 font-semibold text-emerald-400';
    tdDisc.textContent = c.discount_type === 'percentage' ? `${c.discount_value}% OFF` : `£${c.discount_value} OFF`;

    const tdUsage = document.createElement('td');
    tdUsage.className = 'p-3.5 font-mono text-xs';
    tdUsage.textContent = `${c.times_used || 0} / ${c.usage_limit || 'Unlimited'}`;

    const tdVal = document.createElement('td');
    tdVal.className = 'p-3.5 text-slate-400 text-xs font-mono';
    tdVal.textContent = `${c.valid_from || '—'} → ${c.valid_until || '—'}`;

    const tdPlans = document.createElement('td');
    tdPlans.className = 'p-3.5 text-xs';
    const plans = Array.isArray(c.allowed_plans) && c.allowed_plans.length > 0 ? c.allowed_plans.join(', ') : 'All Plans';
    tdPlans.textContent = plans;

    const tdStatus = document.createElement('td');
    tdStatus.className = 'p-3.5';
    const sBadge = document.createElement('span');
    sBadge.className = `px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${c.active ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-slate-800 text-slate-500'}`;
    sBadge.textContent = c.active ? 'ACTIVE' : 'INACTIVE';
    tdStatus.appendChild(sBadge);

    const tdAct = document.createElement('td');
    tdAct.className = 'p-3.5 text-right space-x-1';

    const btnToggle = document.createElement('button');
    btnToggle.className = `px-2.5 py-1 rounded text-xs font-semibold border transition-colors ${c.active ? 'bg-amber-950/40 hover:bg-amber-900/60 text-amber-300 border-amber-500/30' : 'bg-emerald-950/40 hover:bg-emerald-900/60 text-emerald-300 border-emerald-500/30'}`;
    btnToggle.textContent = c.active ? 'Deactivate' : 'Activate';
    btnToggle.onclick = () => toggleCouponActive(c.id, !c.active);

    const btnEdit = document.createElement('button');
    btnEdit.className = 'px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded text-xs font-semibold border border-slate-700';
    btnEdit.textContent = 'Edit';
    btnEdit.onclick = () => editCoupon(c.id);

    const btnDel = document.createElement('button');
    btnDel.className = 'px-2.5 py-1 bg-red-950/40 hover:bg-red-900/60 text-red-300 rounded text-xs font-semibold border border-red-500/30';
    btnDel.textContent = 'Delete';
    btnDel.onclick = () => deleteCoupon(c.id);

    tdAct.append(btnToggle, btnEdit, btnDel);
    tr.append(tdCode, tdDisc, tdUsage, tdVal, tdPlans, tdStatus, tdAct);
    tbody.appendChild(tr);
  });
}

async function toggleCouponActive(couponId, newStatus) {
  try {
    const res = await adminFetch('/api/admin/coupons', {
      method: 'PATCH',
      body: JSON.stringify({ id: couponId, active: newStatus })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`Coupon marked as ${newStatus ? 'ACTIVE' : 'INACTIVE'}.`, 'success');
      refreshAllData();
    } else {
      showToast(data.message || 'Failed to update coupon status.', 'error');
    }
  } catch (err) {
    showToast('Error updating coupon status.', 'error');
  }
}
window.toggleCouponActive = toggleCouponActive;

function openNewCouponModal() {
  const modal = document.getElementById('coupon-modal');
  const title = document.getElementById('modal-coupon-title');
  const form = document.getElementById('modal-coupon-form');
  if (form) form.reset();
  if (document.getElementById('edit-coupon-id')) document.getElementById('edit-coupon-id').value = '';
  if (title) title.textContent = 'Create New Promo Coupon';

  const today = new Date().toISOString().split('T')[0];
  const nextYear = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  if (document.getElementById('edit-coupon-from')) document.getElementById('edit-coupon-from').value = today;
  if (document.getElementById('edit-coupon-until')) document.getElementById('edit-coupon-until').value = nextYear;

  if (modal) modal.classList.remove('hidden');
}

function editCoupon(couponId) {
  const c = allCoupons.find(item => item.id === couponId);
  if (!c) return;
  const modal = document.getElementById('coupon-modal');
  const title = document.getElementById('modal-coupon-title');
  if (title) title.textContent = `Edit Coupon: ${c.code}`;

  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val || '';
  };

  setVal('edit-coupon-id', c.id);
  setVal('edit-coupon-code', c.code);
  setVal('edit-coupon-type', c.discount_type || 'percentage');
  setVal('edit-coupon-val', c.discount_value);
  setVal('edit-coupon-from', c.valid_from);
  setVal('edit-coupon-until', c.valid_until);
  setVal('edit-coupon-limit', c.usage_limit);

  const actCheckbox = document.getElementById('edit-coupon-active');
  if (actCheckbox) actCheckbox.checked = c.active !== false;

  if (modal) modal.classList.remove('hidden');
}

function closeCouponModal() {
  const modal = document.getElementById('coupon-modal');
  if (modal) modal.classList.add('hidden');
}

async function deleteCoupon(couponId) {
  if (!confirm('Are you sure you want to delete this coupon?')) return;
  try {
    const res = await adminFetch(`/api/admin/coupons?id=${couponId}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      showToast('Coupon deleted.', 'info');
      refreshAllData();
    } else {
      showToast('Failed to delete coupon.', 'error');
    }
  } catch (err) {
    showToast('Error deleting coupon.', 'error');
  }
}

function initCouponForm() {
  const form = document.getElementById('modal-coupon-form');
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const couponId = document.getElementById('edit-coupon-id')?.value;
    const payload = {
      id: couponId,
      code: document.getElementById('edit-coupon-code')?.value.toUpperCase().trim(),
      discount_type: document.getElementById('edit-coupon-type')?.value,
      discount_value: parseFloat(document.getElementById('edit-coupon-val')?.value || 0),
      valid_from: document.getElementById('edit-coupon-from')?.value,
      valid_until: document.getElementById('edit-coupon-until')?.value,
      usage_limit: parseInt(document.getElementById('edit-coupon-limit')?.value || 100),
      active: document.getElementById('edit-coupon-active')?.checked
    };

    try {
      const url = '/api/admin/coupons';
      const method = couponId ? 'PATCH' : 'POST';
      const res = await adminFetch(url, { method, body: JSON.stringify(payload) });
      const data = await res.json();
      if (data.success) {
        showToast('Coupon saved successfully!', 'success');
        closeCouponModal();
        refreshAllData();
      } else {
        showToast(data.message || 'Failed to save coupon.', 'error');
      }
    } catch (err) {
      showToast('Error saving coupon.', 'error');
    }
  });
}

/* ==========================================================================
   10. TRIALS, LEADS & TRAFFIC
   ========================================================================== */

function renderTrials() {
  const tbody = document.getElementById('trials-table-body');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (allTrials.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 6;
    td.className = 'p-6 text-center text-slate-500 text-xs';
    td.textContent = 'No trial requests submitted yet.';
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  allTrials.forEach(t => {
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-slate-800/40 transition-colors';

    const tdId = document.createElement('td');
    tdId.className = 'p-3.5 font-mono text-blue-400 font-bold';
    tdId.textContent = t.id || 'N/A';

    const tdEmail = document.createElement('td');
    tdEmail.className = 'p-3.5 font-bold text-white';
    tdEmail.textContent = t.email || 'N/A';

    const tdDev = document.createElement('td');
    tdDev.className = 'p-3.5 text-xs text-slate-300';
    tdDev.textContent = t.device || 'Smart TV';

    const tdNotes = document.createElement('td');
    tdNotes.className = 'p-3.5 text-xs text-slate-400 max-w-xs truncate';
    tdNotes.textContent = t.notes || '—';

    const tdStatus = document.createElement('td');
    tdStatus.className = 'p-3.5';
    const sBadge = document.createElement('span');
    sBadge.className = `px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${t.status === 'Approved' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'}`;
    sBadge.textContent = t.status || 'Pending';
    tdStatus.appendChild(sBadge);

    const tdAct = document.createElement('td');
    tdAct.className = 'p-3.5 text-right';
    if (t.status === 'Pending') {
      const btnApprove = document.createElement('button');
      btnApprove.className = 'btn-primary px-2.5 py-1 rounded text-xs font-bold text-white bg-blue-600 hover:bg-blue-500';
      btnApprove.textContent = 'Approve';
      btnApprove.onclick = () => updateTrialStatus(t.id, 'Approved');
      tdAct.appendChild(btnApprove);
    } else {
      tdAct.textContent = 'Completed';
      tdAct.className += ' text-slate-500 text-xs italic';
    }

    tr.append(tdId, tdEmail, tdDev, tdNotes, tdStatus, tdAct);
    tbody.appendChild(tr);
  });
}

async function updateTrialStatus(trialId, newStatus) {
  try {
    const res = await adminFetch('/api/admin/trials', {
      method: 'PATCH',
      body: JSON.stringify({ id: trialId, status: newStatus })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`Trial ${newStatus.toLowerCase()}!`, 'success');
      refreshAllData();
    }
  } catch (err) {
    showToast('Failed to update trial.', 'error');
  }
}

/* ==========================================================================
   10b. SUPPORT TICKETS CONTROLLER
   ========================================================================== */

let currentViewingTicketId = null;

function renderTickets() {
  const tbody = document.getElementById('tickets-table-body');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (allTickets.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 7;
    td.className = 'p-6 text-center text-slate-500 text-xs';
    td.textContent = 'No support tickets recorded. Inquiries submitted via the customer portal will show here.';
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  allTickets.forEach(t => {
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-slate-800/40 transition-colors';

    const tdId = document.createElement('td');
    tdId.className = 'p-3.5 font-mono text-blue-400 font-bold';
    tdId.textContent = t.id || 'N/A';

    const tdCust = document.createElement('td');
    tdCust.className = 'p-3.5';
    const cName = document.createElement('div');
    cName.className = 'font-bold text-white';
    cName.textContent = t.customer_name || 'Subscriber';
    const cEmail = document.createElement('div');
    cEmail.className = 'text-[11px] text-slate-400';
    cEmail.textContent = t.customer_email || '';
    tdCust.append(cName, cEmail);

    const tdSubj = document.createElement('td');
    tdSubj.className = 'p-3.5';
    const sTitle = document.createElement('div');
    sTitle.className = 'font-semibold text-white';
    sTitle.textContent = t.subject || 'Inquiry';
    const sCat = document.createElement('div');
    sCat.className = 'text-[10px] text-slate-400';
    sCat.textContent = `${t.category || 'General'} • Device: ${t.device || 'N/A'}`;
    tdSubj.append(sTitle, sCat);

    const tdPrio = document.createElement('td');
    tdPrio.className = 'p-3.5';
    const pBadge = document.createElement('span');
    const pColor = t.priority === 'URGENT' ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
                   t.priority === 'HIGH' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                   'bg-slate-800 text-slate-300';
    pBadge.className = `px-2 py-0.5 rounded text-[10px] font-bold uppercase ${pColor}`;
    pBadge.textContent = t.priority || 'MEDIUM';
    tdPrio.appendChild(pBadge);

    const tdStatus = document.createElement('td');
    tdStatus.className = 'p-3.5';
    const sBadge = document.createElement('span');
    const sColor = t.status === 'OPEN' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                   t.status === 'WAITING_ON_ADMIN' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                   t.status === 'WAITING_ON_CUSTOMER' ? 'bg-blue-600/10 text-blue-400 border border-blue-500/30' :
                   'bg-slate-800 text-slate-500';
    sBadge.className = `px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${sColor}`;
    sBadge.textContent = t.status || 'OPEN';
    tdStatus.appendChild(sBadge);

    const tdDate = document.createElement('td');
    tdDate.className = 'p-3.5 text-slate-400 text-xs font-mono';
    tdDate.textContent = t.updated_at ? new Date(t.updated_at).toLocaleDateString() : '—';

    const tdAct = document.createElement('td');
    tdAct.className = 'p-3.5 text-right';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn-primary px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 shadow-md transition-all cursor-pointer';
    btn.textContent = 'Open / Reply';
    btn.onclick = (e) => {
      e.stopPropagation();
      viewAdminTicket(t.id);
    };
    tdAct.appendChild(btn);

    tr.style.cursor = 'pointer';
    tr.title = 'Click to view conversation and reply';
    tr.onclick = (e) => {
      if (e.target.tagName !== 'BUTTON' && e.target.tagName !== 'SELECT' && e.target.tagName !== 'A') {
        viewAdminTicket(t.id);
      }
    };

    tr.append(tdId, tdCust, tdSubj, tdPrio, tdStatus, tdDate, tdAct);
    tbody.appendChild(tr);
  });
}

function viewAdminTicket(ticketId) {
  const t = allTickets.find(item => item.id === ticketId);
  if (!t) return;
  currentViewingTicketId = ticketId;

  const modal = document.getElementById('ticket-modal');
  const title = document.getElementById('ticket-modal-title');
  const subtitle = document.getElementById('ticket-modal-subtitle');
  const statusSel = document.getElementById('ticket-modal-status');
  const prioSel = document.getElementById('ticket-modal-priority');
  const container = document.getElementById('ticket-thread-container');
  const replyInput = document.getElementById('ticket-reply-message');

  if (title) title.textContent = `Ticket ${t.id}: ${t.subject}`;
  if (subtitle) subtitle.textContent = `Customer: ${t.customer_name} (${t.customer_email || 'No email'}) • Category: ${t.category} • Device: ${t.device}`;
  if (statusSel) statusSel.value = t.status || 'OPEN';
  if (prioSel) prioSel.value = t.priority || 'MEDIUM';
  if (replyInput) replyInput.value = '';

  if (container) {
    container.innerHTML = '';
    const msgs = Array.isArray(t.messages) ? t.messages : (t.messages ? [t.messages] : []);
    if (msgs.length === 0) {
      container.innerHTML = '<p class="text-slate-500 text-center py-4">No messages in this ticket.</p>';
    } else {
      msgs.forEach(m => {
        const msgDiv = document.createElement('div');
        const isAdmin = m.sender === 'admin';
        msgDiv.className = `p-3 rounded-xl max-w-md ${isAdmin ? 'ml-auto bg-cyan-950/60 border border-blue-500/30 text-cyan-200' : 'mr-auto bg-slate-800/80 border border-slate-700 text-slate-200'}`;

        const senderHeader = document.createElement('div');
        senderHeader.className = 'text-[10px] font-bold text-slate-400 mb-1 flex items-center justify-between';
        senderHeader.innerHTML = `<span>${m.sender_name || (isAdmin ? 'Support Agent' : 'Customer')}</span><span>${m.timestamp ? new Date(m.timestamp).toLocaleTimeString() : ''}</span>`;

        const bodyDiv = document.createElement('div');
        bodyDiv.className = 'text-xs whitespace-pre-wrap leading-relaxed';
        bodyDiv.textContent = m.text || '';

        msgDiv.append(senderHeader, bodyDiv);
        container.appendChild(msgDiv);
      });
      container.scrollTop = container.scrollHeight;
    }
  }

  if (modal) {
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
  }
}

function closeTicketModal() {
  const modal = document.getElementById('ticket-modal');
  if (modal) {
    modal.classList.add('hidden');
    modal.style.display = 'none';
  }
  currentViewingTicketId = null;
}

window.viewAdminTicket = viewAdminTicket;
window.closeTicketModal = closeTicketModal;
window.saveTicketStatusPriority = saveTicketStatusPriority;

async function saveTicketStatusPriority() {
  if (!currentViewingTicketId) return;
  const status = document.getElementById('ticket-modal-status')?.value;
  const priority = document.getElementById('ticket-modal-priority')?.value;

  try {
    const res = await adminFetch('/api/admin/tickets', {
      method: 'PATCH',
      body: JSON.stringify({ id: currentViewingTicketId, status, priority })
    });
    const data = await res.json();
    if (data.success) {
      showToast('Ticket status & priority updated!', 'success');
      refreshAllData();
    } else {
      showToast('Failed to update ticket.', 'error');
    }
  } catch (err) {
    showToast('Error updating ticket.', 'error');
  }
}

function initTicketReplyForm() {
  const form = document.getElementById('form-ticket-reply');
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentViewingTicketId) return;

    const message = document.getElementById('ticket-reply-message')?.value;
    const newStatus = document.getElementById('reply-set-status')?.value;

    try {
      const res = await adminFetch('/api/admin/tickets/reply', {
        method: 'POST',
        body: JSON.stringify({
          ticket_id: currentViewingTicketId,
          message: message,
          status: newStatus
        })
      });
      const data = await res.json();
      if (data.success) {
        showToast('Reply dispatched to customer!', 'success');
        document.getElementById('ticket-reply-message').value = '';
        await refreshAllData();
        viewAdminTicket(currentViewingTicketId);
      } else {
        showToast(data.message || 'Failed to send reply.', 'error');
      }
    } catch (err) {
      showToast('Error sending reply.', 'error');
    }
  });
}

function renderLeads() {
  const tbody = document.getElementById('leads-table-body');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (allLeads.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 6;
    td.className = 'p-6 text-center text-slate-500 text-xs';
    td.textContent = 'No leads captured yet.';
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  allLeads.slice(0, 50).forEach(l => {
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-slate-800/40 transition-colors';

    const tdId = document.createElement('td');
    tdId.className = 'p-3.5 font-mono text-blue-400 font-bold';
    tdId.textContent = l.id || 'N/A';

    const tdEvent = document.createElement('td');
    tdEvent.className = 'p-3.5 text-xs text-amber-300 font-bold';
    tdEvent.textContent = l.event || 'checkout_intent';

    const tdCust = document.createElement('td');
    tdCust.className = 'p-3.5 text-xs text-white';
    tdCust.textContent = l.customer_name || l.customer_email || 'Visitor';

    const tdPkg = document.createElement('td');
    tdPkg.className = 'p-3.5 text-xs text-slate-400';
    tdPkg.textContent = l.plan_id || '3m';

    const tdTime = document.createElement('td');
    tdTime.className = 'p-3.5 text-xs font-mono text-slate-500';
    tdTime.textContent = l.timestamp ? new Date(l.timestamp).toLocaleString() : '—';

    const tdAct = document.createElement('td');
    tdAct.className = 'p-3.5 text-right';
    const link = document.createElement('a');
    link.className = 'text-xs text-emerald-400 font-bold hover:underline';
    link.textContent = 'WhatsApp →';
    link.target = '_blank';
    link.href = `https://wa.me/447413469398?text=${encodeURIComponent(`Hi, following up on your Luna Stream enquiry!`)}`;
    tdAct.appendChild(link);

    tr.append(tdId, tdEvent, tdCust, tdPkg, tdTime, tdAct);
    tbody.appendChild(tr);
  });
}

function renderVisitors() {
  const tbody = document.getElementById('visitors-table-body');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (allVisitors.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 7;
    td.className = 'p-6 text-center text-slate-500 text-xs';
    td.textContent = 'No website traffic logged yet. Waiting for live visitors...';
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  allVisitors.slice(0, 100).forEach(v => {
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-slate-800/40 transition-colors text-xs';

    const tdId = document.createElement('td');
    tdId.className = 'p-3.5 font-mono text-blue-400';
    tdId.textContent = v.id || 'N/A';

    const tdSession = document.createElement('td');
    tdSession.className = 'p-3.5 font-mono text-slate-400';
    tdSession.textContent = (v.session_id || '').substring(0, 12);

    const tdPage = document.createElement('td');
    tdPage.className = 'p-3.5 font-semibold text-white';
    const pageVal = v.page || v.page_path || '/index.html';
    tdPage.innerHTML = `<span class="px-2 py-0.5 rounded bg-blue-600/10 text-blue-400 border border-blue-500/20 font-mono text-[11px]">${pageVal}</span>`;

    const tdTitle = document.createElement('td');
    tdTitle.className = 'p-3.5 text-slate-300 truncate max-w-xs';
    tdTitle.textContent = v.page_title || formatPageName(pageVal);

    const tdDev = document.createElement('td');
    tdDev.className = 'p-3.5 text-slate-400';
    const dev = v.device || v.device_type || 'Desktop';
    const devIcon = dev === 'Mobile' ? '📱' : (dev === 'Tablet' ? '📟' : '💻');
    tdDev.textContent = `${devIcon} ${dev}`;

    const tdRef = document.createElement('td');
    tdRef.className = 'p-3.5 text-slate-500 truncate max-w-xs';
    tdRef.textContent = v.referrer || 'Direct';

    const tdTime = document.createElement('td');
    tdTime.className = 'p-3.5 text-right font-mono text-slate-400';
    tdTime.textContent = v.timestamp ? new Date(v.timestamp).toLocaleTimeString() : '—';

    tr.append(tdId, tdSession, tdPage, tdTitle, tdDev, tdRef, tdTime);
    tbody.appendChild(tr);
  });
}

/* ==========================================================================
   11. SETTINGS & CONFIGURATION FORMS
   ========================================================================== */

function initSettingsForms() {
  // Profit Settings Form
  const profitForm = document.getElementById('profit-settings-form');
  if (profitForm) {
    profitForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        supplier_cost_per_credit: parseFloat(document.getElementById('cfg-cost-per-credit')?.value || 2.50),
        renewal_discount_percent: parseInt(document.getElementById('cfg-renewal-discount')?.value || 15)
      };
      await saveSettings(payload, 'Profit settings saved!', closeProfitSettingsModal);
    });
  }

  // Supplier Form
  const supplierForm = document.getElementById('supplier-panel-form');
  if (supplierForm) {
    supplierForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        supplier_panel_url: document.getElementById('cfg-supplier-url')?.value
      };
      await saveSettings(payload, 'Supplier URL updated!', closeSupplierModal);
    });
  }

  // Announcement Form
  const annForm = document.getElementById('announcement-settings-form');
  if (annForm) {
    annForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const discountVal = parseInt(document.getElementById('ann-discount')?.value || 20);
      const promoVal = (document.getElementById('ann-promo')?.value || 'LUNA20').trim().toUpperCase();
      const payload = {
        announcement_enabled: document.getElementById('ann-enabled')?.checked,
        announcement_discount_percent: discountVal,
        announcement_promo_code: promoVal,
        announcement_badge: document.getElementById('ann-badge')?.value,
        announcement_text: document.getElementById('ann-text')?.value,
        announcement_link_text: `Claim ${discountVal}% OFF →`,
        announcement_link_url: `checkout.html?plan=12m&promo=${encodeURIComponent(promoVal)}&discount=${discountVal}`
      };
      await saveSettings(payload, 'Announcement banner updated!', closeAnnouncementModal);
      await refreshAllData();
    });
  }

  // PayPal Settings Form
  const ppForm = document.getElementById('paypal-settings-form');
  if (ppForm) {
    ppForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        paypal_mode: document.getElementById('set-paypal-mode')?.value,
        paypal_email: document.getElementById('set-paypal-email')?.value,
        paypal_me_link: document.getElementById('set-paypal-me-link')?.value,
        paypal_client_id: document.getElementById('set-paypal-client-id')?.value,
        paypal_instructions: document.getElementById('set-paypal-instructions')?.value
      };
      await saveSettings(payload, 'PayPal settings saved!', closePayPalSettingsModal);
    });
  }

  // Change Password Form
  const pwForm = document.getElementById('change-password-form');
  if (pwForm) {
    pwForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const curr = document.getElementById('pw-current')?.value;
      const newP = document.getElementById('pw-new')?.value;
      const conf = document.getElementById('pw-confirm')?.value;

      if (newP !== conf) {
        showToast('New passwords do not match!', 'error');
        return;
      }

      try {
        const res = await adminFetch('/api/admin/change-password', {
          method: 'POST',
          body: JSON.stringify({ current_password: curr, new_password: newP })
        });
        const data = await res.json();
        if (data.success) {
          showToast('Master password updated successfully!', 'success');
          closeChangePasswordModal();
        } else {
          showToast(data.message || 'Failed to update password.', 'error');
        }
      } catch (err) {
        showToast('Error changing password.', 'error');
      }
    });
  }

  // Audit Log loader
  const auditBtn = document.getElementById('btn-load-audit');
  if (auditBtn) {
    auditBtn.addEventListener('click', loadAuditLog);
  }
}

async function saveSettings(payload, successMsg, closeFn) {
  try {
    const res = await adminFetch('/api/admin/settings', {
      method: 'PATCH',
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      showToast(successMsg, 'success');
      if (closeFn) closeFn();
      refreshAllData();
    } else {
      showToast('Failed to save settings.', 'error');
    }
  } catch (err) {
    showToast('Network error saving settings.', 'error');
  }
}

async function loadAuditLog() {
  const list = document.getElementById('audit-log-list');
  if (!list) return;
  list.innerHTML = '<li class="text-slate-500">Loading audit trail...</li>';

  try {
    const res = await adminFetch('/api/admin/audit-log');
    if (res.ok) {
      const logs = await res.json();
      list.innerHTML = '';
      if (!logs || logs.length === 0) {
        list.innerHTML = '<li class="text-slate-500">No events logged yet.</li>';
        return;
      }
      logs.forEach(l => {
        const li = document.createElement('li');
        li.className = 'border-b border-slate-800/60 pb-1';
        li.textContent = `[${l.timestamp ? new Date(l.timestamp).toLocaleTimeString() : 'time'}] ${l.actor || 'System'}: ${l.action || 'ACTION'} — ${l.details || ''}`;
        list.appendChild(li);
      });
    }
  } catch (err) {
    list.innerHTML = '<li class="text-red-400">Failed to load audit trail.</li>';
  }
}

// Modal Toggle Functions
function openProfitSettingsModal() {
  const modal = document.getElementById('profit-settings-modal');
  if (document.getElementById('cfg-cost-per-credit')) document.getElementById('cfg-cost-per-credit').value = appSettings.supplier_cost_per_credit || 2.50;
  if (document.getElementById('cfg-renewal-discount')) document.getElementById('cfg-renewal-discount').value = appSettings.renewal_discount_percent || 15;
  if (modal) modal.classList.remove('hidden');
}
function closeProfitSettingsModal() {
  const modal = document.getElementById('profit-settings-modal');
  if (modal) modal.classList.add('hidden');
}

function openSupplierModal() {
  const modal = document.getElementById('supplier-panel-modal');
  const urlEl = document.getElementById('cfg-supplier-url');
  const launchBtn = document.getElementById('btn-supplier-modal-launch');
  if (urlEl) urlEl.value = appSettings.supplier_panel_url || "https://panel.example.com";
  if (launchBtn) launchBtn.href = appSettings.supplier_panel_url || "https://panel.example.com";
  if (modal) modal.classList.remove('hidden');
}
function closeSupplierModal() {
  const modal = document.getElementById('supplier-panel-modal');
  if (modal) modal.classList.add('hidden');
}

function openAnnouncementModal() {
  const modal = document.getElementById('announcement-settings-modal');
  if (document.getElementById('ann-enabled')) document.getElementById('ann-enabled').checked = appSettings.announcement_enabled !== false;
  if (document.getElementById('ann-discount')) document.getElementById('ann-discount').value = appSettings.announcement_discount_percent || 20;
  if (document.getElementById('ann-promo')) document.getElementById('ann-promo').value = appSettings.announcement_promo_code || "LUNA20";
  if (document.getElementById('ann-badge')) document.getElementById('ann-badge').value = appSettings.announcement_badge || "🔥 FLASH SALE";
  if (document.getElementById('ann-text')) document.getElementById('ann-text').value = appSettings.announcement_text || "";
  if (modal) modal.classList.remove('hidden');
}
function closeAnnouncementModal() {
  const modal = document.getElementById('announcement-settings-modal');
  if (modal) modal.classList.add('hidden');
}

function openPayPalSettingsModal() {
  const modal = document.getElementById('paypal-settings-modal');
  if (document.getElementById('set-paypal-mode')) document.getElementById('set-paypal-mode').value = appSettings.paypal_mode || "paypal_me";
  if (document.getElementById('set-paypal-email')) document.getElementById('set-paypal-email').value = appSettings.paypal_email || "wasifali740@gmail.com";
  if (document.getElementById('set-paypal-me-link')) document.getElementById('set-paypal-me-link').value = appSettings.paypal_me_link || "paypal.me/adilfarooq909";
  if (document.getElementById('set-paypal-client-id')) document.getElementById('set-paypal-client-id').value = appSettings.paypal_client_id || "";
  if (document.getElementById('set-paypal-instructions')) document.getElementById('set-paypal-instructions').value = appSettings.paypal_instructions || "";
  if (modal) modal.classList.remove('hidden');
}
function closePayPalSettingsModal() {
  const modal = document.getElementById('paypal-settings-modal');
  if (modal) modal.classList.add('hidden');
}

function openChangePasswordModal() {
  const modal = document.getElementById('change-password-modal');
  const form = document.getElementById('change-password-form');
  if (form) form.reset();
  if (modal) modal.classList.remove('hidden');
}
function closeChangePasswordModal() {
  const modal = document.getElementById('change-password-modal');
  if (modal) modal.classList.add('hidden');
}

/* ==========================================================================
   12. SEARCH & CSV EXPORT
   ========================================================================== */

function debounce(func, timeout = 250) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => { func.apply(this, args); }, timeout);
  };
}

function initSearch() {
  const searchInput = document.getElementById('global-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', debounce((e) => {
      const q = e.target.value.toLowerCase().trim();
      if (!q) {
        renderOrders();
        renderCustomers();
        renderSubscriptions();
        return;
      }
      // Filter currently visible tab
      if (currentTab === 'orders') {
        const tbody = document.getElementById('orders-table-body');
        if (tbody) {
          const matched = allOrders.filter(o =>
            (o.id && o.id.toLowerCase().includes(q)) ||
            (o.customer_name && o.customer_name.toLowerCase().includes(q)) ||
            (o.customer_email && o.customer_email.toLowerCase().includes(q))
          );
          renderFilteredOrders(matched);
        }
      } else if (currentTab === 'customers') {
        const tbody = document.getElementById('customers-table-body');
        if (tbody) {
          const matched = allCustomers.filter(c =>
            (c.id && c.id.toLowerCase().includes(q)) ||
            (c.name && c.name.toLowerCase().includes(q)) ||
            (c.email && c.email.toLowerCase().includes(q))
          );
          renderFilteredCustomers(matched);
        }
      }
    }, 250));
  }
}

function renderFilteredOrders(list) {
  const tbody = document.getElementById('orders-table-body');
  if (!tbody) return;
  tbody.innerHTML = '';
  list.forEach(o => {
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-slate-800/40 border-b border-slate-800/50';
    tr.innerHTML = `<td class="p-3 font-mono text-blue-400 font-bold">${o.id}</td><td class="p-3">${o.customer_name || 'Customer'}<div class="text-[10px] text-slate-500">${o.customer_email || ''}</div></td><td class="p-3">${o.plan_title || o.plan_id}</td><td class="p-3 font-mono text-emerald-400">${o.currency || '£'}${o.total_amount}</td><td class="p-3 font-bold">${o.status}</td><td class="p-3 font-mono text-xs">${o.xtream_username || 'None'}</td><td class="p-3 text-right"><button onclick="editOrder('${o.id}')" class="px-2 py-1 bg-slate-800 text-white rounded text-xs">Edit</button></td>`;
    tbody.appendChild(tr);
  });
}

function renderFilteredCustomers(list) {
  const tbody = document.getElementById('customers-table-body');
  if (!tbody) return;
  tbody.innerHTML = '';
  list.forEach(c => {
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-slate-800/40 border-b border-slate-800/50';
    tr.innerHTML = `<td class="p-3 font-mono text-blue-400 font-bold">${c.id}</td><td class="p-3">${c.name || 'Anonymous'}<div class="text-[10px] text-slate-500">${c.email || ''}</div></td><td class="p-3 font-mono">${c.phone || '—'}</td><td class="p-3 font-mono font-bold text-emerald-400">£${(c.lifetime_value || 0).toFixed(2)}</td><td class="p-3">${Array.isArray(c.tags) ? c.tags.join(', ') : '—'}</td><td class="p-3 font-bold">${c.status || 'active'}</td><td class="p-3 text-right"><button onclick="viewCustomer('${c.id}')" class="px-2 py-1 bg-slate-800 text-white rounded text-xs">Profile</button></td>`;
    tbody.appendChild(tr);
  });
}

function initExportButtons() {
  document.getElementById('btn-export-orders')?.addEventListener('click', () => exportCSV('orders.csv', allOrders));
  document.getElementById('btn-export-customers')?.addEventListener('click', () => exportCSV('customers.csv', allCustomers));
  document.getElementById('btn-export-subs')?.addEventListener('click', () => exportCSV('subscriptions.csv', allSubscriptions));
  document.getElementById('btn-export-payments')?.addEventListener('click', () => exportCSV('payments.csv', allPayments));
}

function exportCSV(filename, dataArray) {
  if (!dataArray || !dataArray.length) {
    showToast('No data available to export.', 'info');
    return;
  }
  const keys = Object.keys(dataArray[0]);
  let csvContent = "data:text/csv;charset=utf-8," + keys.join(",") + "\n";
  dataArray.forEach(row => {
    csvContent += keys.map(k => JSON.stringify(row[k] || "")).join(",") + "\n";
  });
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast(`Exported ${filename}`, 'success');
}

/* ==========================================================================
   13. TOAST NOTIFICATIONS
   ========================================================================== */

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  const colors = {
    success: 'bg-emerald-950/90 border-emerald-500 text-emerald-300',
    error: 'bg-red-950/90 border-red-500 text-red-300',
    info: 'bg-slate-900/90 border-blue-500 text-slate-400'
  };

  toast.className = `p-3 px-4 rounded-xl border backdrop-blur-md text-xs font-semibold shadow-2xl flex items-center gap-2 transform transition-all duration-300 opacity-0 translate-y-2 ${colors[type] || colors.info}`;
  
  const icon = type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ';
  toast.textContent = `${icon} ${message}`;

  container.appendChild(toast);
  requestAnimationFrame(() => {
    toast.classList.remove('opacity-0', 'translate-y-2');
  });

  setTimeout(() => {
    toast.classList.add('opacity-0', 'translate-y-2');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

/* -------------------------------------------------------------
   Email Notification Templates & Expiry Scanner Handlers
   ------------------------------------------------------------- */
let cachedEmailTemplates = {};

async function openEmailTemplatesModal() {
  const modal = document.getElementById('email-templates-modal');
  if (!modal) return;
  modal.classList.remove('hidden');

  try {
    const res = await adminFetch('/api/admin/email-templates');
    if (res.ok) {
      cachedEmailTemplates = await res.json();
      const select = document.getElementById('email-template-select');
      const curKey = select ? select.value : 'ORDER_RECEIVED';
      onSelectEmailTemplate(curKey);
    }
  } catch (err) {
    showToast('Failed to load email templates', 'error');
  }
}

function closeEmailTemplatesModal() {
  const modal = document.getElementById('email-templates-modal');
  if (modal) modal.classList.add('hidden');
}

function onSelectEmailTemplate(key) {
  const tmpl = cachedEmailTemplates[key];
  if (!tmpl) return;

  const subjEl = document.getElementById('email-template-subject');
  const bodyEl = document.getElementById('email-template-body');
  const varsEl = document.getElementById('email-template-vars');

  if (subjEl) subjEl.value = tmpl.subject || '';
  if (bodyEl) bodyEl.value = tmpl.body_text || '';
  if (varsEl && tmpl.variables) {
    varsEl.textContent = 'Variables: ' + tmpl.variables.map(v => `{{${v}}}`).join(', ');
  }
}

async function saveCurrentEmailTemplate(e) {
  if (e) e.preventDefault();
  const select = document.getElementById('email-template-select');
  const key = select ? select.value : '';
  const subj = document.getElementById('email-template-subject')?.value;
  const body = document.getElementById('email-template-body')?.value;

  if (!key) return;

  try {
    const res = await adminFetch('/api/admin/email-templates', {
      method: 'PATCH',
      body: JSON.stringify({
        template_key: key,
        subject: subj,
        body_text: body
      })
    });

    if (res.ok) {
      const data = await res.json();
      if (data.success) {
        cachedEmailTemplates[key] = data.template;
        showToast(`Template "${key}" updated successfully!`, 'success');
      }
    } else {
      showToast('Error saving template', 'error');
    }
  } catch (err) {
    showToast('Failed to save template', 'error');
  }
}

async function previewEmailTemplate() {
  const select = document.getElementById('email-template-select');
  const key = select ? select.value : '';
  if (!key) return;

  const sampleVars = {
    customer_name: 'John Smith',
    order_id: 'LUNA-20260908-10482',
    plan_title: '12 Months Ultimate Pass',
    devices_count: 2,
    total_amount: 89.00,
    amount: 89.00,
    currency: 'USD',
    end_date: '2027-09-08',
    subscription_id: 'SUB-2026-10482',
    server_url: 'http://line.lunaentertainment.online:8080',
    xtream_username: 'luna_demo_user',
    xtream_password: 'tv_demo_pass',
    m3u_url: 'http://line.lunaentertainment.online:8080/get.php?username=demo&password=demo&type=m3u_plus',
    device_type: 'Amazon FireStick 4K',
    reset_token: '849201'
  };

  try {
    const res = await adminFetch('/api/admin/email-templates/preview', {
      method: 'POST',
      body: JSON.stringify({
        template_key: key,
        variables: sampleVars
      })
    });

    if (res.ok) {
      const data = await res.json();
      const modal = document.getElementById('email-preview-modal');
      const subjEl = document.getElementById('email-preview-rendered-subject');
      const bodyEl = document.getElementById('email-preview-rendered-body');
      if (modal && subjEl && bodyEl) {
        subjEl.textContent = data.rendered_subject || '';
        bodyEl.textContent = data.rendered_body || '';
        modal.classList.remove('hidden');
      } else {
        showToast('Template preview generated successfully', 'success');
      }
    }
  } catch (err) {
    showToast('Error generating preview', 'error');
  }
}

async function triggerManualExpiryCheck() {
  try {
    showToast('Running subscription expiry check...', 'info');
    const res = await adminFetch('/api/admin/subscriptions/check-expiry', { method: 'POST' });
    if (res.ok) {
      const data = await res.json();
      const r = data.result || {};
      showToast(`Audit Complete! Checked: ${r.checked || 0}, Expired: ${r.expired || 0}, Expiring Soon: ${r.expiring_soon || 0}`, 'success');
      loadSubscriptions();
      loadDashboardKPIs();
    } else {
      showToast('Expiry check returned error', 'error');
    }
  } catch (err) {
    showToast('Failed to execute expiry check', 'error');
  }
}

// Global window helpers for inline onclicks
window.switchTab = switchTab;
window.refreshDashboardData = refreshAllData;
window.refreshAllData = refreshAllData;
window.editOrder = editOrder;
window.openNewOrderModal = openNewOrderModal;
window.closeOrderModal = closeOrderModal;
window.openDeliveryModal = openDeliveryModal;
window.closeDeliveryModal = closeDeliveryModal;
window.copyDeliveryMessage = copyDeliveryMessage;
window.viewCustomer = viewCustomer;
window.openNewCustomerModal = openNewCustomerModal;
window.closeCustomerModal = closeCustomerModal;
window.editSubscription = editSubscription;
window.closeSubscriptionModal = closeSubscriptionModal;
window.extendSubscriptionDate = extendSubscriptionDate;
window.openNewCouponModal = openNewCouponModal;
window.editCoupon = editCoupon;
window.deleteCoupon = deleteCoupon;
window.closeCouponModal = closeCouponModal;
window.openProfitSettingsModal = openProfitSettingsModal;
window.closeProfitSettingsModal = closeProfitSettingsModal;
window.openSupplierModal = openSupplierModal;
window.closeSupplierModal = closeSupplierModal;
window.openAnnouncementModal = openAnnouncementModal;
window.closeAnnouncementModal = closeAnnouncementModal;
window.openPayPalSettingsModal = openPayPalSettingsModal;
window.closePayPalSettingsModal = closePayPalSettingsModal;
window.openChangePasswordModal = openChangePasswordModal;
window.closeChangePasswordModal = closeChangePasswordModal;
window.openEmailTemplatesModal = openEmailTemplatesModal;
window.closeEmailTemplatesModal = closeEmailTemplatesModal;
window.onSelectEmailTemplate = onSelectEmailTemplate;
window.saveCurrentEmailTemplate = saveCurrentEmailTemplate;
window.previewEmailTemplate = previewEmailTemplate;
window.triggerManualExpiryCheck = triggerManualExpiryCheck;
window.viewAdminTicket = viewAdminTicket;
window.closeTicketModal = closeTicketModal;
window.saveTicketStatusPriority = saveTicketStatusPriority;
window.generateRandomCredentials = generateRandomCredentials;
window.showToast = showToast;


/* -------------------------------------------------------------
   SMTP Server & Email Dispatch Functions
   ------------------------------------------------------------- */
let currentDeliveryOrderId = null;

function openSMTPSettingsModal() {
  const modal = document.getElementById('smtp-settings-modal');
  if (!modal) return;

  adminFetch('/api/admin/settings')
    .then(res => res.json())
    .then(data => {
      document.getElementById('set-smtp-enabled').checked = !!data.smtp_enabled;
      document.getElementById('set-smtp-server').value = data.smtp_server || '';
      document.getElementById('set-smtp-port').value = data.smtp_port || 587;
      document.getElementById('set-smtp-user').value = data.smtp_user || '';
      document.getElementById('set-smtp-from').value = data.smtp_from || 'support@lunaentertainment.online';
      document.getElementById('set-smtp-ssl').checked = data.smtp_ssl !== false;

      const indicator = document.getElementById('smtp-pass-indicator');
      if (indicator) {
        if (data.has_smtp_pass) {
          indicator.classList.remove('hidden');
        } else {
          indicator.classList.add('hidden');
        }
      }

      const resDiv = document.getElementById('smtp-test-result');
      if (resDiv) resDiv.classList.add('hidden');

      modal.classList.remove('hidden');
    })
    .catch(() => {
      showToast('Failed to load SMTP settings.', 'error');
    });
}

function closeSMTPSettingsModal() {
  const modal = document.getElementById('smtp-settings-modal');
  if (modal) modal.classList.add('hidden');
}

async function saveSMTPSettings(e) {
  e.preventDefault();
  const enabled = document.getElementById('set-smtp-enabled').checked;
  const server = document.getElementById('set-smtp-server').value.trim();
  const port = parseInt(document.getElementById('set-smtp-port').value, 10) || 587;
  const user = document.getElementById('set-smtp-user').value.trim();
  const pass = document.getElementById('set-smtp-pass').value;
  const fromEmail = document.getElementById('set-smtp-from').value.trim();
  const ssl = document.getElementById('set-smtp-ssl').checked;

  const payload = {
    smtp_enabled: enabled,
    smtp_server: server,
    smtp_port: port,
    smtp_user: user,
    smtp_from: fromEmail,
    smtp_ssl: ssl
  };

  if (pass.trim()) {
    payload.smtp_pass = pass;
  }

  try {
    const res = await adminFetch('/api/admin/settings', {
      method: 'PATCH',
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      showToast('SMTP settings saved successfully!', 'success');
      const indicator = document.getElementById('smtp-pass-indicator');
      if (indicator && pass.trim()) indicator.classList.remove('hidden');
      document.getElementById('set-smtp-pass').value = '';
    } else {
      showToast(data.message || 'Failed to save SMTP settings.', 'error');
    }
  } catch (err) {
    showToast('Network error saving SMTP settings.', 'error');
  }
}

async function sendTestEmail() {
  const recipient = document.getElementById('smtp-test-recipient').value.trim();
  if (!recipient) {
    showToast('Please enter a recipient email address.', 'error');
    return;
  }

  const btn = document.getElementById('btn-send-test-email');
  const resDiv = document.getElementById('smtp-test-result');

  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Testing...';
  }

  try {
    const res = await adminFetch('/api/admin/test-email', {
      method: 'POST',
      body: JSON.stringify({ to_email: recipient })
    });
    const data = await res.json();

    if (resDiv) {
      resDiv.classList.remove('hidden');
      if (data.success) {
        resDiv.className = 'text-[11px] p-2.5 rounded-xl border border-emerald-500/40 bg-emerald-950/30 text-emerald-300';
        resDiv.textContent = '✅ ' + data.message;
        showToast('Test email sent successfully!', 'success');
      } else {
        resDiv.className = 'text-[11px] p-2.5 rounded-xl border border-red-500/40 bg-red-950/30 text-red-300';
        resDiv.textContent = '❌ ' + (data.message || 'SMTP Test Failed');
        showToast(data.message || 'SMTP Connection failed.', 'error');
      }
    }
  } catch (err) {
    if (resDiv) {
      resDiv.classList.remove('hidden');
      resDiv.className = 'text-[11px] p-2.5 rounded-xl border border-red-500/40 bg-red-950/30 text-red-300';
      resDiv.textContent = '❌ Network connection failure to test endpoint.';
    }
    showToast('Error communicating with server.', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Send Test';
    }
  }
}

async function resendOrderCredentialsEmail() {
  if (!currentDeliveryOrderId) {
    showToast('No active order selected.', 'error');
    return;
  }

  const btn = document.getElementById('btn-deliv-send-email');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span>⏳ Sending Email...</span>';
  }

  try {
    const res = await adminFetch('/api/admin/orders/resend-email', {
      method: 'POST',
      body: JSON.stringify({
        order_id: currentDeliveryOrderId,
        template_key: 'CREDENTIALS_DELIVERED'
      })
    });
    const data = await res.json();
    if (data.success) {
      showToast('Line credentials email sent successfully!', 'success');
    } else {
      showToast(data.message || 'Failed to resend credentials email.', 'error');
    }
  } catch (err) {
    showToast('Network error dispatching email.', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<span>📧 Resend Line Credentials via Email</span>';
    }
  }
}


/* -------------------------------------------------------------
   Database Backups & Snapshot Controller
   ------------------------------------------------------------- */
function openBackupsModal() {
  const modal = document.getElementById('backups-modal');
  if (modal) modal.classList.remove('hidden');
  loadBackupsList();
}

function closeBackupsModal() {
  const modal = document.getElementById('backups-modal');
  if (modal) modal.classList.add('hidden');
}

async function loadBackupsList() {
  const tbody = document.getElementById('backups-table-body');
  const countEl = document.getElementById('backups-total-count');
  if (!tbody) return;

  try {
    const res = await adminFetch('/api/admin/backups');
    const backups = await res.json();

    if (countEl) countEl.textContent = backups.length;

    if (!backups || backups.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" class="p-6 text-center text-slate-500">No database backups found. Click "Create Instant Backup" above.</td></tr>';
      return;
    }

    tbody.innerHTML = '';
    backups.forEach(b => {
      const tr = document.createElement('tr');
      tr.className = 'hover:bg-slate-800/40 transition-colors';

      const tdFile = document.createElement('td');
      tdFile.className = 'p-3 font-mono font-bold text-white flex items-center gap-2';
      tdFile.innerHTML = `<span>📦</span> <span>${b.filename}</span>`;

      const tdDate = document.createElement('td');
      tdDate.className = 'p-3 text-slate-400';
      tdDate.textContent = b.created_at ? new Date(b.created_at).toLocaleString() : 'N/A';

      const tdSize = document.createElement('td');
      tdSize.className = 'p-3 text-emerald-400 font-mono font-semibold';
      tdSize.textContent = b.size_formatted || `${Math.round(b.size_bytes / 1024)} KB`;

      const tdAct = document.createElement('td');
      tdAct.className = 'p-3 text-right space-x-1';

      const btnDl = document.createElement('button');
      btnDl.className = 'px-2.5 py-1 bg-emerald-950/40 hover:bg-emerald-900/60 text-emerald-300 border border-emerald-500/30 rounded text-xs font-semibold cursor-pointer';
      btnDl.textContent = '⬇️ Download';
      btnDl.onclick = () => downloadBackupArchive(b.filename);

      const btnDel = document.createElement('button');
      btnDel.className = 'px-2.5 py-1 bg-red-950/40 hover:bg-red-900/60 text-red-300 border border-red-500/30 rounded text-xs font-semibold cursor-pointer';
      btnDel.textContent = '🗑️ Delete';
      btnDel.onclick = () => deleteBackupArchive(b.filename);

      tdAct.append(btnDl, btnDel);
      tr.append(tdFile, tdDate, tdSize, tdAct);
      tbody.appendChild(tr);
    });
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="4" class="p-6 text-center text-red-400">Failed to load backups list.</td></tr>';
  }
}

async function createManualBackup() {
  const btn = document.getElementById('btn-create-backup');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span>⏳ Creating ZIP Snapshot...</span>';
  }

  try {
    const res = await adminFetch('/api/admin/backups/create', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showToast(`Backup created successfully: ${data.filename} (${data.size_kb} KB)`, 'success');
      loadBackupsList();
    } else {
      showToast(data.message || 'Failed to create backup.', 'error');
    }
  } catch (err) {
    showToast('Network error creating backup.', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<span>⚡ Create Instant Backup</span>';
    }
  }
}
window.createBackupNow = createManualBackup;

async function downloadBackupArchive(filename) {
  try {
    showToast('Preparing backup download...', 'info');
    const res = await adminFetch(`/api/admin/backups/download?file=${encodeURIComponent(filename)}`);
    if (!res.ok) throw new Error('Download failed');
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
    showToast('Backup download started!', 'success');
  } catch (err) {
    showToast('Failed to download backup.', 'error');
  }
}

async function deleteBackupArchive(filename) {
  if (!confirm(`Are you sure you want to permanently delete backup archive: ${filename}?`)) {
    return;
  }

  try {
    const res = await adminFetch('/api/admin/backups', {
      method: 'DELETE',
      body: JSON.stringify({ filename })
    });
    const data = await res.json();
    if (data.success) {
      showToast('Backup deleted successfully.', 'success');
      loadBackupsList();
    } else {
      showToast(data.message || 'Failed to delete backup.', 'error');
    }
  } catch (err) {
    showToast('Error deleting backup.', 'error');
  }
}


// ==========================================
// STEP 3: IPTV RESELLER PANEL (andy-pro.uk)
// ==========================================
window.openIptvPanelModal = function() {
  const modal = document.getElementById('iptv-panel-modal');
  if (modal) modal.classList.remove('hidden');
};

window.closeIptvPanelModal = function() {
  const modal = document.getElementById('iptv-panel-modal');
  if (modal) modal.classList.add('hidden');
};

// Also keep openSupplierModal as an alias for backwards compatibility
window.openSupplierModal = window.openIptvPanelModal;
window.closeSupplierModal = window.closeIptvPanelModal;

window.testIptvPanelConnection = async function() {
  const btn = document.getElementById('btn-test-panel-conn');
  const display = document.getElementById('panel-balance-display');
  if (btn) btn.innerHTML = '<span>⏳ Connecting...</span>';

  try {
    const res = await adminFetch('/api/admin/iptv-panel/test', {
      method: 'POST',
      body: JSON.stringify({
        url: document.getElementById('cfg-panel-url')?.value,
        username: document.getElementById('cfg-panel-username')?.value
      })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      if (display) {
        display.textContent = `${data.credits} Credits`;
        display.className = 'font-mono font-bold text-emerald-400 text-sm';
      }
      showToast(`Connected to andy-pro.uk! Credits: ${data.credits}`, 'success');
    } else {
      if (display) {
        display.textContent = 'Connection Failed';
        display.className = 'font-mono font-bold text-rose-400 text-sm';
      }
      showToast(data.message || 'Connection to panel failed.', 'error');
    }
  } catch (err) {
    if (display) {
      display.textContent = 'Error';
      display.className = 'font-mono font-bold text-rose-400 text-sm';
    }
    showToast(err.message || 'Network error connecting to panel.', 'error');
  } finally {
    if (btn) btn.innerHTML = '<span>⚡ Test Connection</span>';
  }
};

window.fetchIptvPanelPackages = async function() {
  try {
    showToast('Fetching packages from andy-pro.uk...', 'info');
    const res = await adminFetch('/api/admin/iptv-panel/packages', { method: 'POST' });
    const data = await res.json();
    if (res.ok && data.success) {
      showToast('Retrieved package catalog from panel!', 'success');
    } else {
      showToast(data.message || 'Unable to fetch packages automatically.', 'error');
    }
  } catch (err) {
    showToast('Error querying panel packages: ' + err.message, 'error');
  }
};

window.provisionOrderViaPanelModal = async function() {
  const plan = document.getElementById('edit-order-plan')?.value || '12m';
  const devices = parseInt(document.getElementById('edit-order-devices')?.value || '1');
  const email = document.getElementById('edit-order-email')?.value || '';
  const orderId = document.getElementById('edit-order-id')?.value || '';

  showToast('Provisioning line on andy-pro.uk panel...', 'info');
  try {
    const res = await adminFetch('/api/admin/subscriptions/provision-panel', {
      method: 'POST',
      body: JSON.stringify({
        plan_id: plan,
        devices_count: devices,
        customer_email: email,
        order_id: orderId
      })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      if (document.getElementById('edit-order-user')) document.getElementById('edit-order-user').value = data.xtream_username;
      if (document.getElementById('edit-order-pass')) document.getElementById('edit-order-pass').value = data.xtream_password;
      if (document.getElementById('edit-order-m3u')) document.getElementById('edit-order-m3u').value = data.m3u_url;
      showToast(`Line provisioned! Username: ${data.xtream_username} (${data.mode})`, 'success');
    } else {
      showToast(data.message || 'Panel provisioning failed', 'error');
    }
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
};


/* ==========================================================================
   PHASE 4 OVERHAUL ENHANCEMENTS: SECURITY, CRM & WORKFLOW CONTROLLERS
   ========================================================================== */

// 1. Password Visibility Toggle
function togglePasswordVisibility(inputId, btn) {
  const input = document.getElementById(inputId);
  if (!input) return;
  if (input.type === 'password') {
    input.type = 'text';
    btn.textContent = '🙈';
    btn.title = 'Hide password';
  } else {
    input.type = 'password';
    btn.textContent = '👁';
    btn.title = 'Show password';
  }
}

// 2. Password Strength & Complexity Indicator
function updatePasswordStrength(val) {
  const barContainer = document.getElementById('pw-strength-bar');
  const label = document.getElementById('pw-strength-label');
  if (!barContainer || !label) return;

  if (!val || val.length === 0) {
    barContainer.classList.add('hidden');
    label.textContent = 'Min 8 chars, mix of uppercase, lowercase & numbers';
    label.className = 'text-[10px] text-slate-500';
    return;
  }

  barContainer.classList.remove('hidden');

  let score = 0;
  if (val.length >= 8) score++;
  if (/[A-Z]/.test(val)) score++;
  if (/[a-z]/.test(val)) score++;
  if (/[0-9]/.test(val)) score++;

  const colors = ['bg-red-500', 'bg-amber-500', 'bg-yellow-400', 'bg-emerald-500'];
  const labels = ['Weak', 'Fair', 'Good', 'Strong'];
  const textColors = ['text-red-400', 'text-amber-400', 'text-yellow-300', 'text-emerald-400'];

  for (let i = 1; i <= 4; i++) {
    const bar = document.getElementById('pw-bar-' + i);
    if (bar) {
      bar.className = 'h-1 flex-1 rounded-full ' + (i <= score ? colors[Math.max(0, score - 1)] : 'bg-[#263247]');
    }
  }

  const idx = Math.max(0, Math.min(score - 1, 3));
  label.textContent = labels[idx] + (score < 4 ? ' — Min 8 chars, mix of uppercase, lowercase & numbers' : ' — Secure password');
  label.className = 'text-[10px] ' + textColors[idx];
}

// 3. One-Click Payment Confirmation Action
async function confirmPaymentReceived() {
  const orderId = document.getElementById('edit-order-id')?.value;
  if (!orderId) {
    showToast('No active order selected.', 'error');
    return;
  }

  try {
    const res = await adminFetch('/api/admin/orders', {
      method: 'PATCH',
      body: JSON.stringify({
        id: orderId,
        payment_status: 'PAID'
      })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`Payment confirmed for order ${orderId}!`, 'success');
      const paySection = document.getElementById('payment-confirm-section');
      if (paySection) {
        paySection.innerHTML = '<div class="text-center text-emerald-400 text-xs font-bold py-1.5 bg-emerald-950/40 rounded-xl border border-emerald-500/30">✅ Payment Confirmed (PAID)</div>';
      }
      refreshAllData();
    } else {
      showToast(data.message || 'Failed to confirm payment.', 'error');
    }
  } catch (err) {
    showToast('Network error confirming payment.', 'error');
  }
}

// 4. Rich CRM Profile Viewer Population
function populateCrmProfile(c) {
  const sections = document.getElementById('crm-profile-sections');
  if (!sections || !c) return;

  sections.classList.remove('hidden');
  const email = (c.email || '').toLowerCase().trim();
  const custId = c.id;

  // Lifetime Value
  const ltvEl = document.getElementById('crm-ltv');
  if (ltvEl) {
    const ltv = parseFloat(c.lifetime_value || 0);
    ltvEl.textContent = '£' + ltv.toFixed(2);
  }

  // Linked Subscriptions
  const subsContainer = document.getElementById('crm-subscriptions-list');
  if (subsContainer) {
    const linkedSubs = allSubscriptions.filter(s =>
      (s.customer_id && s.customer_id === custId) ||
      (s.customer_email && s.customer_email.toLowerCase().trim() === email) ||
      (s.email && s.email.toLowerCase().trim() === email)
    );

    if (linkedSubs.length === 0) {
      subsContainer.innerHTML = '<p class="text-slate-500 text-xs py-1">No subscriptions linked to this customer yet.</p>';
    } else {
      subsContainer.innerHTML = linkedSubs.map(s => {
        const isAct = s.status === 'ACTIVE';
        const badgeColor = isAct ? 'emerald' : (s.status === 'EXPIRED' ? 'red' : 'amber');
        return `
          <div class="p-2.5 rounded-xl bg-[#0C111D] border border-[#263247] space-y-1.5">
            <div class="flex items-center justify-between">
              <span class="font-bold text-white">${s.plan_title || s.plan_id || 'IPTV Plan'} (${s.devices_count || 1} screens)</span>
              <span class="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase bg-${badgeColor}-500/20 text-${badgeColor}-400 border border-${badgeColor}-500/30">${s.status || 'ACTIVE'}</span>
            </div>
            <div class="grid grid-cols-2 gap-2 text-[10px] font-mono text-slate-400">
              <div>U: <span class="text-blue-400">${s.xtream_username || 'N/A'}</span></div>
              <div>P: <span class="text-slate-300">••••••••</span></div>
            </div>
            <div class="text-[10px] text-slate-500">Expires: <span class="text-slate-300">${s.end_date || 'N/A'}</span></div>
          </div>
        `;
      }).join('');
    }
  }

  // Order History
  const ordersTbody = document.getElementById('crm-orders-list');
  if (ordersTbody) {
    const linkedOrders = allOrders.filter(o =>
      (o.customer_id && o.customer_id === custId) ||
      (o.customer_email && o.customer_email.toLowerCase().trim() === email) ||
      (o.email && o.email.toLowerCase().trim() === email)
    );

    if (linkedOrders.length === 0) {
      ordersTbody.innerHTML = '<tr><td colspan="5" class="py-3 text-center text-slate-500">No orders placed yet.</td></tr>';
    } else {
      ordersTbody.innerHTML = linkedOrders.map(o => {
        const statusColor = o.status === 'Active' ? 'text-emerald-400' : (o.status === 'Pending' ? 'text-amber-400' : 'text-slate-400');
        const payStatusColor = o.payment_status === 'PAID' ? 'text-emerald-400' : 'text-amber-400';
        return `
          <tr class="border-b border-[#263247]/50 hover:bg-slate-800/30">
            <td class="py-2 pr-2 font-mono text-blue-400 font-bold">${o.id || o.order_id}</td>
            <td class="py-2 pr-2 text-slate-400">${o.created_at ? o.created_at.substring(0, 10) : '—'}</td>
            <td class="py-2 pr-2 text-white">${o.plan_title || o.plan_id || 'Plan'}</td>
            <td class="py-2 pr-2 font-mono font-bold text-slate-200">${o.currency || '£'}${o.total_amount || 0}</td>
            <td class="py-2 font-bold ${statusColor}">${o.status} <span class="text-[9px] ${payStatusColor}">(${o.payment_status || 'UNPAID'})</span></td>
          </tr>
        `;
      }).join('');
    }
  }

  // Payment History
  const paymentsTbody = document.getElementById('crm-payments-list');
  if (paymentsTbody) {
    const linkedPayments = allPayments.filter(p =>
      (p.customer_id && p.customer_id === custId) ||
      (p.customer_email && p.customer_email.toLowerCase().trim() === email)
    );

    if (linkedPayments.length === 0) {
      paymentsTbody.innerHTML = '<tr><td colspan="4" class="py-3 text-center text-slate-500">No payment records found.</td></tr>';
    } else {
      paymentsTbody.innerHTML = linkedPayments.map(p => {
        const stColor = p.status === 'CONFIRMED' || p.status === 'PAID' ? 'text-emerald-400' : 'text-amber-400';
        return `
          <tr class="border-b border-[#263247]/50 hover:bg-slate-800/30">
            <td class="py-2 pr-2 text-slate-400">${p.created_at ? p.created_at.substring(0, 10) : (p.confirmed_at ? p.confirmed_at.substring(0, 10) : '—')}</td>
            <td class="py-2 pr-2 text-slate-300 font-semibold uppercase text-[10px]">${p.provider || p.payment_method || 'PayPal'}</td>
            <td class="py-2 pr-2 font-mono font-bold text-emerald-400">${p.currency || '£'}${p.amount || 0}</td>
            <td class="py-2 font-mono text-[10px] text-slate-400">${p.provider_transaction_id || p.id || '—'} <span class="${stColor}">(${p.status})</span></td>
          </tr>
        `;
      }).join('');
    }
  }
}


/* ==========================================================================
   REAL-TIME VISITOR RADAR, PAGE TRACKING & AUDIO NOTIFICATION CONTROLLER
   ========================================================================== */

let isVisitorAudioMuted = localStorage.getItem('luna_admin_sound_muted') === 'true';
let audioCtx = null;
let knownVisitorIds = new Set();
let visitorLastPages = {}; // sessionId -> last known page_path
let livePollingInterval = null;
let hasUserInteracted = false;

// Format nice human-readable page name
function formatPageName(path) {
  if (!path || path === '/' || path.includes('index')) return 'Homepage (Live Stream)';
  if (path.includes('pricing')) return 'Subscription Plans & Pricing';
  if (path.includes('sports')) return 'Live Sports & PPV Hub';
  if (path.includes('channels')) return 'Channel Explorer & 4K VOD';
  if (path.includes('checkout')) return 'Public Checkout & Order';
  if (path.includes('setup')) return 'Device Installation Guides';
  if (path.includes('contact')) return '24/7 Support Desk & Free Trial';
  if (path.includes('portal')) return 'Customer Subscriber Portal';
  if (path.includes('terms')) return 'Terms of Service';
  if (path.includes('privacy')) return 'Privacy Policy';
  if (path.includes('refund')) return 'Refund Policy';
  return path;
}

// 1. Web Audio API Synthesis Engine (Zero external dependencies)
function getAudioContext() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended' && hasUserInteracted) {
    audioCtx.resume();
  }
  return audioCtx;
}

// Unlock audio on first user click/touch anywhere in dashboard
function unlockAudioOnInteraction() {
  hasUserInteracted = true;
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}
document.addEventListener('click', unlockAudioOnInteraction, { once: true });
document.addEventListener('keydown', unlockAudioOnInteraction, { once: true });

// Play notification sound
function playVisitorChime(isNewVisitor = false) {
  if (isVisitorAudioMuted) return;

  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    const now = ctx.currentTime;

    const createTone = (freq, startTime, duration, gainLevel, type = 'sine') => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, startTime);
      gain.gain.setValueAtTime(0.0001, startTime);
      gain.gain.linearRampToValueAtTime(gainLevel, startTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + duration);
    };

    if (isNewVisitor) {
      // 🔔 New Visitor: Bright, pleasant 2-tone chime (E5: 659.25Hz -> A5: 880Hz)
      createTone(659.25, now, 0.40, 0.25, 'sine');
      createTone(880.00, now + 0.12, 0.60, 0.28, 'sine');
    } else {
      // 📍 Page Navigation: Crisp high-tech ping (B5: 987.77Hz)
      createTone(987.77, now, 0.35, 0.20, 'sine');
    }
  } catch (err) {
    console.warn('Audio synthesis notice:', err);
  }
}

// Audio Mute/Unmute Toggle
function toggleVisitorAudio() {
  hasUserInteracted = true;
  isVisitorAudioMuted = !isVisitorAudioMuted;
  localStorage.setItem('luna_admin_sound_muted', isVisitorAudioMuted.toString());

  const iconEl = document.getElementById('sound-icon');
  const labelEl = document.getElementById('sound-label');

  if (isVisitorAudioMuted) {
    if (iconEl) iconEl.textContent = '🔇';
    if (labelEl) labelEl.textContent = 'Sound: OFF';
    showToast('Visitor sound notifications muted.', 'info');
  } else {
    if (iconEl) iconEl.textContent = '🔊';
    if (labelEl) labelEl.textContent = 'Sound: ON';
    playVisitorChime(false); // Play sample confirmation ping
    showToast('Visitor sound notifications active!', 'success');
  }
}

function testChimeSound() {
  hasUserInteracted = true;
  if (isVisitorAudioMuted) {
    toggleVisitorAudio();
  } else {
    playVisitorChime(true);
    showToast('Testing: New visitor chime played 🔔', 'info');
  }
}

// Live Visitor Floating Alert Banner
function showVisitorLiveAlert(title, message, isNew = false) {
  const container = document.getElementById('live-visitor-toast-container');
  if (!container) return;

  const card = document.createElement('div');
  card.className = `p-3.5 rounded-2xl border shadow-2xl backdrop-blur-md transition-all transform duration-300 flex items-start gap-3 pointer-events-auto ${
    isNew 
      ? 'bg-blue-950/90 border-blue-500/50 text-white' 
      : 'bg-emerald-950/90 border-emerald-500/50 text-white'
  }`;

  card.innerHTML = `
    <div class="text-xl shrink-0 mt-0.5">${isNew ? '🔔' : '📍'}</div>
    <div class="flex-1 min-w-0">
      <div class="font-bold text-xs flex items-center justify-between">
        <span>${title}</span>
        <span class="text-[10px] text-slate-400 font-normal">Just now</span>
      </div>
      <p class="text-[11px] text-slate-200 mt-0.5 break-words">${message}</p>
    </div>
  `;

  container.appendChild(card);

  setTimeout(() => {
    card.classList.add('opacity-0', 'translate-y-2');
    setTimeout(() => card.remove(), 400);
  }, 5000);
}

// 2. Handle Live Visitor Data & State Detection
function handleLiveVisitorUpdate(data) {
  if (!data) return;

  const activeVisitors = data.active_visitors || [];
  const recentLogs = data.visitors || [];

  // Update Header & Radar Counters
  const countStr = activeVisitors.length.toString();
  const hCount = document.getElementById('header-active-count');
  if (hCount) hCount.textContent = countStr;

  const rCount = document.getElementById('radar-active-counter');
  if (rCount) rCount.textContent = `${countStr} Active Visitor${activeVisitors.length === 1 ? '' : 's'}`;

  const tCount = document.getElementById('tab-active-counter');
  if (tCount) tCount.textContent = `${countStr} Online`;

  // Detect New Visits and Page Transitions
  activeVisitors.forEach(vis => {
    const sId = vis.session_id || vis.visitor_id;
    const curPage = vis.current_page || '/index.html';
    const pageName = vis.page_title || formatPageName(curPage);
    const dev = vis.device_type || 'Desktop';
    const devIcon = dev === 'Mobile' ? '📱' : '💻';

    // 1. Is this a brand new visitor?
    if (!knownVisitorIds.has(sId)) {
      knownVisitorIds.add(sId);
      visitorLastPages[sId] = curPage;

      // Play arrival sound & show banner
      playVisitorChime(true);
      showVisitorLiveAlert('New Customer Onsite!', `${devIcon} Landed on ${pageName} (${curPage})`, true);
    } 
    // 2. Has the visitor moved to another page?
    else if (visitorLastPages[sId] && visitorLastPages[sId] !== curPage) {
      const oldPage = visitorLastPages[sId];
      visitorLastPages[sId] = curPage;

      // Play navigation ping & show banner
      playVisitorChime(false);
      showVisitorLiveAlert('Customer Moved Page', `${devIcon} Navigated to ${pageName} (${curPage})`, false);
    }
  });

  // Render Real-Time Visitor Radar Display on Dashboard
  renderDashboardRadar(activeVisitors);

  // Render Active Browsers on Visitors Tab
  renderVisitorsTabRadar(activeVisitors);
}

// 3. Render Dashboard Overview Radar Widget
function renderDashboardRadar(activeVisitors) {
  const listEl = document.getElementById('radar-active-visitors-list');
  if (!listEl) return;

  if (!activeVisitors || activeVisitors.length === 0) {
    listEl.innerHTML = `
      <div class="text-center py-5 text-slate-500 text-xs flex flex-col items-center justify-center gap-1.5">
        <span class="text-lg">🛰️</span>
        <span>No visitors on site right now. Open <a href="index.html" target="_blank" class="text-blue-400 underline font-semibold">Luna Stream</a> in another tab or mobile device to see live radar tracking.</span>
      </div>
    `;
    return;
  }

  listEl.innerHTML = activeVisitors.map(vis => {
    const dev = vis.device_type || 'Desktop';
    const devIcon = dev === 'Mobile' ? '📱' : (dev === 'Tablet' ? '📟' : '💻');
    const curPage = vis.current_page || '/index.html';
    const pageName = vis.page_title || formatPageName(curPage);
    const historyList = (vis.history || []).map(h => h.page).filter((p, i, a) => a.indexOf(p) === i);
    const trailHtml = historyList.length > 1 ? historyList.join(' ➔ ') : '';

    return `
      <div class="p-3.5 rounded-xl bg-[#0C111D] border border-blue-500/20 hover:border-blue-500/40 transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div class="flex items-center gap-3 min-w-0">
          <div class="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-sm shrink-0">
            ${devIcon}
          </div>
          <div class="min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="font-bold text-white text-xs">${vis.visitor_id || vis.session_id}</span>
              <span class="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span> ACTIVE NOW
              </span>
              <span class="text-slate-500 text-[10px]">${dev} • ${vis.ip || 'Local'}</span>
            </div>
            <div class="text-xs text-slate-300 mt-0.5 flex items-center gap-1.5 flex-wrap">
              <span class="text-slate-400">Currently Viewing:</span>
              <span class="font-bold text-blue-400 bg-blue-950/40 px-2 py-0.5 rounded border border-blue-500/30 font-mono text-[11px]">${curPage}</span>
              <span class="text-slate-400 text-[11px]">(${pageName})</span>
            </div>
            ${trailHtml ? `<div class="text-[10px] text-slate-500 font-mono mt-1 truncate">Journey: ${trailHtml}</div>` : ''}
          </div>
        </div>

        <div class="shrink-0 self-end sm:self-center text-right text-[10px] font-mono text-slate-400">
          <span class="text-emerald-400 font-bold">🟢 Live on page</span>
        </div>
      </div>
    `;
  }).join('');
}

// 4. Render Active Browsers Grid on Visitors Tab
function renderVisitorsTabRadar(activeVisitors) {
  const container = document.getElementById('tab-active-visitors-container');
  if (!container) return;

  if (!activeVisitors || activeVisitors.length === 0) {
    container.innerHTML = `
      <div class="col-span-full text-center py-6 text-slate-500 text-xs">
        No active visitors detected in the last 2 minutes. Open the site in another browser to test live tracking.
      </div>
    `;
    return;
  }

  container.innerHTML = activeVisitors.map(vis => {
    const dev = vis.device_type || 'Desktop';
    const devIcon = dev === 'Mobile' ? '📱' : '💻';
    const curPage = vis.current_page || '/index.html';
    const pageName = vis.page_title || formatPageName(curPage);

    return `
      <div class="p-3.5 rounded-xl bg-[#0C111D] border border-blue-500/30 space-y-2">
        <div class="flex items-center justify-between">
          <span class="font-bold text-white text-xs">${devIcon} ${vis.visitor_id || vis.session_id}</span>
          <span class="px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">ONLINE</span>
        </div>
        <div>
          <span class="text-[10px] text-slate-400 block">Browsing Page:</span>
          <span class="text-xs font-bold text-blue-400 font-mono">${curPage}</span>
          <p class="text-[11px] text-slate-300">${pageName}</p>
        </div>
        <div class="text-[10px] text-slate-500 border-t border-[#263247] pt-2 flex justify-between">
          <span>${dev}</span>
          <span>${vis.referrer || 'Direct'}</span>
        </div>
      </div>
    `;
  }).join('');
}

// 5. Polling Loop for Live Visitors (Every 2.5s)
async function pollLiveVisitors() {
  const token = sessionStorage.getItem('ps_admin_token');
  if (!token) return;

  try {
    const res = await adminFetch('/api/admin/visitors');
    if (res.ok) {
      const data = await res.json();
      allVisitors = Array.isArray(data) ? data : (data.visitors || []);
      handleLiveVisitorUpdate(data);

      // Refresh visitors table if currently on visitors tab
      if (currentTab === 'visitors') {
        renderVisitors();
      }
    }
  } catch (e) {}
}

function startLiveVisitorPolling() {
  if (livePollingInterval) clearInterval(livePollingInterval);
  // Initial poll
  pollLiveVisitors();
  // Poll every 2.5 seconds
  livePollingInterval = setInterval(pollLiveVisitors, 2500);
}

// Start polling on DOM ready and after login
document.addEventListener('DOMContentLoaded', () => {
  // Sync sound toggle UI with stored preference
  const iconEl = document.getElementById('sound-icon');
  const labelEl = document.getElementById('sound-label');
  if (isVisitorAudioMuted) {
    if (iconEl) iconEl.textContent = '🔇';
    if (labelEl) labelEl.textContent = 'Sound: OFF';
  }

  // Start polling if already authenticated
  if (getAdminToken()) {
    startLiveVisitorPolling();
  }
});

/* ==========================================================================
   14. PLANS, PRICING & DISCOUNTS ENGINE CONTROLLER
   ========================================================================== */

const DEFAULT_ADMIN_PRICING = {
  currencies: {
    GBP: { symbol: '£', suffix: 'GBP' },
    USD: { symbol: '$', suffix: 'USD' },
    EUR: { symbol: '€', suffix: 'EUR' }
  },
  plans: {
    '3m': {
      id: '3m',
      title: '3 Months Pass',
      name: '3 Months Pass',
      duration_months: 3,
      months: 3,
      extra_months: 0,
      badge: 'STARTER SAVER',
      active: true,
      popular: false,
      channels: '20,000+ 4K & UHD Channels',
      vod: '60,000+ Movies & Series',
      pricing: {
        '1': { GBP: 25, USD: 35, EUR: 30 },
        '2': { GBP: 35, USD: 49, EUR: 40 },
        '3': { GBP: 49, USD: 69, EUR: 59 },
        '5': { GBP: 79, USD: 109, EUR: 95 }
      },
      previous_pricing: {}
    },
    '6m': {
      id: '6m',
      title: '6 Months Pass',
      name: '6 Months Pass',
      duration_months: 6,
      months: 6,
      extra_months: 0,
      badge: 'EXTENDED SAVER',
      active: true,
      popular: false,
      channels: '20,000+ 4K & UHD Channels',
      vod: '60,000+ Movies & Series',
      pricing: {
        '1': { GBP: 40, USD: 55, EUR: 47 },
        '2': { GBP: 59, USD: 79, EUR: 69 },
        '3': { GBP: 79, USD: 109, EUR: 95 },
        '5': { GBP: 129, USD: 179, EUR: 149 }
      },
      previous_pricing: {}
    },
    '12m': {
      id: '12m',
      title: '12 Months Ultimate Pass',
      name: '12 Months Ultimate Pass',
      duration_months: 12,
      months: 12,
      extra_months: 2,
      badge: '⭐ BEST VALUE',
      active: true,
      popular: true,
      channels: '20,000+ 4K & UHD Channels',
      vod: '60,000+ Movies & Series',
      pricing: {
        '1': { GBP: 65, USD: 89, EUR: 76 },
        '2': { GBP: 99, USD: 135, EUR: 115 },
        '3': { GBP: 129, USD: 179, EUR: 149 },
        '5': { GBP: 199, USD: 269, EUR: 229 }
      },
      previous_pricing: {}
    }
  }
};

let adminPricingCatalog = null;
let activePricingCurrencyFilter = 'ALL'; // 'ALL', 'GBP', 'EUR', 'USD'

function getAdminPricingCurrencies() {
  if (!adminPricingCatalog || !adminPricingCatalog.currencies) {
    return ['GBP', 'EUR', 'USD'];
  }
  if (Array.isArray(adminPricingCatalog.currencies)) {
    return adminPricingCatalog.currencies;
  }
  if (typeof adminPricingCatalog.currencies === 'object') {
    return Object.keys(adminPricingCatalog.currencies);
  }
  return ['GBP', 'EUR', 'USD'];
}

function getCurrencySymbol(curr) {
  if (adminPricingCatalog && adminPricingCatalog.currencies && typeof adminPricingCatalog.currencies === 'object') {
    if (adminPricingCatalog.currencies[curr] && adminPricingCatalog.currencies[curr].symbol) {
      return adminPricingCatalog.currencies[curr].symbol;
    }
  }
  const defaults = { GBP: '£', EUR: '€', USD: '$' };
  return defaults[curr] || curr;
}

function escapeAdminHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function loadAdminPricing() {
  const container = document.getElementById('admin-pricing-cards-container');
  try {
    const res = await adminFetch('/api/admin/pricing');
    if (res.ok) {
      const data = await res.json();
      if (data && data.pricing && data.pricing.plans && Object.keys(data.pricing.plans).length > 0) {
        adminPricingCatalog = data.pricing;
        renderAdminPricing();
        updatePricingBadgeCount();
        return;
      }
    }
    // Server catalog missing or empty: seamlessly initialize with default catalog
    adminPricingCatalog = JSON.parse(JSON.stringify(DEFAULT_ADMIN_PRICING));
    renderAdminPricing();
    updatePricingBadgeCount();

    // Auto-save to server in background so server creates data/pricing.json
    try {
      await adminFetch('/api/admin/pricing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pricing: adminPricingCatalog })
      });
    } catch (saveErr) {}
  } catch (err) {
    // Graceful fallback to guarantee pricing cards render reliably
    adminPricingCatalog = JSON.parse(JSON.stringify(DEFAULT_ADMIN_PRICING));
    renderAdminPricing();
    updatePricingBadgeCount();
  }
}

function updatePricingBadgeCount() {
  const badge = document.getElementById('badge-count-pricing');
  if (badge && adminPricingCatalog && adminPricingCatalog.plans) {
    const planCount = Object.keys(adminPricingCatalog.plans).length;
    badge.textContent = `${planCount} Plans`;
  }
}

function switchPricingCurrencyTab(curr) {
  syncInputsToPricingCatalog();
  activePricingCurrencyFilter = curr;
  const tabs = document.querySelectorAll('.pricing-cur-tab');
  tabs.forEach(tab => {
    if (tab.id === `cur-tab-${curr}`) {
      tab.classList.remove('bg-transparent', 'text-slate-400');
      tab.classList.add('bg-blue-600', 'text-white');
    } else {
      tab.classList.remove('bg-blue-600', 'text-white');
      tab.classList.add('bg-transparent', 'text-slate-400');
    }
  });
  renderAdminPricing();
}

function syncInputsToPricingCatalog() {
  if (!adminPricingCatalog || !adminPricingCatalog.plans) return;

  const planKeys = Object.keys(adminPricingCatalog.plans);
  const currencyCodes = getAdminPricingCurrencies();
  const screens = ['1', '2', '3', '5'];

  planKeys.forEach(pKey => {
    const plan = adminPricingCatalog.plans[pKey];
    if (!plan.pricing) plan.pricing = {};
    if (!plan.previous_pricing) plan.previous_pricing = {};

    const nameInput = document.getElementById(`input-name-${pKey}`);
    if (nameInput) {
      const val = nameInput.value.trim();
      plan.title = val;
      plan.name = val;
    }

    const extraInput = document.getElementById(`input-extra-${pKey}`);
    if (extraInput) {
      plan.extra_months = Math.max(0, parseInt(extraInput.value) || 0);
    }

    const badgeInput = document.getElementById(`input-badge-${pKey}`);
    if (badgeInput) {
      plan.badge = badgeInput.value.trim();
    }

    const activeCheck = document.getElementById(`check-active-${pKey}`);
    if (activeCheck) {
      plan.active = activeCheck.checked;
    }

    const popularCheck = document.getElementById(`check-popular-${pKey}`);
    if (popularCheck) {
      plan.popular = popularCheck.checked;
    }

    screens.forEach(scr => {
      if (!plan.pricing[scr]) plan.pricing[scr] = {};
      if (!plan.previous_pricing[scr]) plan.previous_pricing[scr] = {};

      currencyCodes.forEach(curr => {
        const saleInput = document.getElementById(`price-sale-${pKey}-${scr}-${curr}`);
        if (saleInput) {
          const sVal = parseFloat(saleInput.value);
          if (!isNaN(sVal)) {
            plan.pricing[scr][curr] = parseFloat(sVal.toFixed(2));
          }
        }

        const prevInput = document.getElementById(`price-prev-${pKey}-${scr}-${curr}`);
        if (prevInput) {
          const pVal = parseFloat(prevInput.value);
          if (!isNaN(pVal) && pVal > 0) {
            plan.previous_pricing[scr][curr] = parseFloat(pVal.toFixed(2));
          } else if (prevInput.value.trim() === '' || pVal === 0) {
            delete plan.previous_pricing[scr][curr];
          }
        }
      });
    });
  });
}

function renderAdminPricing() {
  const container = document.getElementById('admin-pricing-cards-container');
  if (!container) return;

  if (!adminPricingCatalog || !adminPricingCatalog.plans) {
    container.innerHTML = '<div class="p-8 text-center text-slate-500 text-xs">No plans loaded. Click Reset or refresh.</div>';
    return;
  }

  const plans = adminPricingCatalog.plans;
  const planKeys = Object.keys(plans);
  const currencies = getAdminPricingCurrencies();

  const visibleCurrencies = activePricingCurrencyFilter === 'ALL'
    ? currencies
    : [activePricingCurrencyFilter];

  const screens = ['1', '2', '3', '5'];

  let html = '';

  planKeys.forEach(pKey => {
    const plan = plans[pKey];
    const isPopular = !!plan.popular;
    const isActive = plan.active !== false;
    const extraMonths = Math.max(0, parseInt(plan.extra_months) || 0);
    const baseMonths = parseInt(plan.duration_months || plan.months) || 1;
    const totalMonths = baseMonths + extraMonths;
    const badgeText = plan.badge || '';

    const previewCur = visibleCurrencies[0] || 'GBP';
    const previewSym = getCurrencySymbol(previewCur);
    const samplePrev = (plan.previous_pricing && plan.previous_pricing['1'] && plan.previous_pricing['1'][previewCur]) || 0;
    const sampleSale = (plan.pricing && plan.pricing['1'] && plan.pricing['1'][previewCur]) || 0;

    html += `
      <div class="glass-panel rounded-2xl border ${isPopular ? 'border-purple-500/50 bg-[#101522]/95 shadow-xl shadow-purple-950/20' : 'border-[#263247] bg-[#101522]/80'} p-5 sm:p-6 space-y-6 transition-all" id="admin-plan-card-${pKey}">
        
        <!-- Top Bar: Plan Info, Badges, Toggles -->
        <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-[#263247]">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl ${isPopular ? 'bg-gradient-to-tr from-purple-600 to-blue-600' : 'bg-slate-800 border border-slate-700'} flex items-center justify-center text-lg font-bold text-white shrink-0">
              ${pKey === '12m' ? '👑' : (pKey === '6m' ? '🔥' : '⚡')}
            </div>
            <div>
              <div class="flex items-center gap-2">
                <input type="text" value="${escapeAdminHtml(plan.title || plan.name || pKey)}" 
                  id="input-name-${pKey}"
                  class="bg-[#0C111D] border border-[#263247] hover:border-blue-500/50 focus:border-blue-500 rounded-lg px-2.5 py-1 text-sm font-bold text-white focus:outline-none transition-colors"
                  title="Plan Title"
                  oninput="updateAdminPlanPreview('${pKey}')">
                <span class="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">ID: ${pKey}</span>
              </div>
              <p class="text-[11px] text-slate-400 mt-1">Base Plan Duration: <strong class="text-white">${baseMonths} Months</strong></p>
            </div>
          </div>

          <!-- Controls: Bonus Extra Months, Active/Popular Toggles -->
          <div class="flex flex-wrap items-center gap-3">
            
            <!-- Extra Months Given -->
            <div class="flex items-center gap-2 bg-[#0C111D] border border-blue-500/40 px-3 py-1.5 rounded-xl shadow-sm">
              <label class="text-[11px] font-bold text-blue-400 whitespace-nowrap" for="input-extra-${pKey}">🎁 Bonus Extra Months:</label>
              <input type="number" min="0" max="24" value="${extraMonths}" 
                id="input-extra-${pKey}"
                class="w-14 bg-[#080B14] border border-[#263247] focus:border-blue-500 rounded-lg px-2 py-1 text-xs font-bold text-center text-emerald-400 focus:outline-none font-mono"
                oninput="updateAdminPlanPreview('${pKey}')">
              <span class="text-[10px] text-slate-300 font-mono" id="label-total-months-${pKey}">(= ${totalMonths} mo total)</span>
            </div>

            <!-- Active Toggle -->
            <label class="flex items-center gap-2 bg-[#0C111D] border border-[#263247] px-3 py-1.5 rounded-xl cursor-pointer hover:border-slate-600 transition-colors">
              <input type="checkbox" id="check-active-${pKey}" ${isActive ? 'checked' : ''} class="rounded border-slate-700 text-blue-600 focus:ring-0">
              <span class="text-xs font-bold text-slate-300">Active</span>
            </label>

            <!-- Popular Highlight Toggle -->
            <label class="flex items-center gap-2 bg-[#0C111D] border ${isPopular ? 'border-purple-500/50 text-purple-300' : 'border-[#263247] text-slate-300'} px-3 py-1.5 rounded-xl cursor-pointer hover:border-purple-400 transition-colors">
              <input type="checkbox" id="check-popular-${pKey}" ${isPopular ? 'checked' : ''} class="rounded border-slate-700 text-purple-600 focus:ring-0" onchange="updateAdminPlanPreview('${pKey}')">
              <span class="text-xs font-bold">Featured / Popular</span>
            </label>
          </div>
        </div>

        <!-- Promo Badge / Ribbon Text & Quick Cut Tools -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="space-y-1.5">
            <label class="text-xs font-bold text-slate-300 flex items-center justify-between" for="input-badge-${pKey}">
              <span>🏷️ Plan Ribbon / Promo Badge Text:</span>
              <span class="text-[10px] text-slate-500 font-normal">Displayed at top of card</span>
            </label>
            <input type="text" value="${escapeAdminHtml(badgeText)}" 
              id="input-badge-${pKey}"
              placeholder="e.g. BEST VALUE - SAVE 60% or MOST POPULAR"
              class="w-full bg-[#0C111D] border border-[#263247] focus:border-blue-500 rounded-xl px-3 py-2 text-xs text-amber-300 placeholder-slate-600 focus:outline-none transition-colors"
              oninput="updateAdminPlanPreview('${pKey}')">
          </div>

          <!-- Quick Strikethrough Helper Tool for this plan -->
          <div class="space-y-1.5">
            <div class="text-xs font-bold text-slate-300 flex items-center justify-between">
              <span>⚡ Quick Strikethrough Tool (This Plan):</span>
              <span class="text-[10px] text-slate-500 font-normal">Auto-compute cut prices</span>
            </div>
            <div class="flex items-center gap-2">
              <button type="button" onclick="autoSetPlanCutPrices('${pKey}', 1.25)" class="px-2.5 py-2 rounded-xl bg-[#0C111D] hover:bg-slate-800 border border-[#263247] text-[11px] font-semibold text-slate-300 transition-colors cursor-pointer" title="Set Previous Price 25% higher than Sale Price">
                +25% Strikethrough
              </button>
              <button type="button" onclick="autoSetPlanCutPrices('${pKey}', 1.35)" class="px-2.5 py-2 rounded-xl bg-[#0C111D] hover:bg-slate-800 border border-[#263247] text-[11px] font-semibold text-slate-300 transition-colors cursor-pointer" title="Set Previous Price 35% higher than Sale Price">
                +35% Strikethrough
              </button>
              <button type="button" onclick="clearPlanCutPrices('${pKey}')" class="px-2.5 py-2 rounded-xl bg-[#0C111D] hover:bg-red-950/30 border border-red-500/20 text-[11px] font-semibold text-red-400 hover:text-red-300 transition-colors cursor-pointer" title="Clear all previous prices for this plan">
                Remove Cuts
              </button>
            </div>
          </div>
        </div>

        <!-- Prices Matrix Table -->
        <div class="space-y-3">
          <div class="flex items-center justify-between">
            <h4 class="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
              <span>📺 Connection & Price Matrix</span>
              <span class="text-[10px] font-normal text-slate-500 lowercase">(sale price vs. crossed-out cut price)</span>
            </h4>
            <span class="text-[10px] text-slate-500">Live Server-Validated</span>
          </div>

          <div class="overflow-x-auto rounded-xl border border-[#263247]">
            <table class="w-full text-left text-xs border-collapse">
              <thead>
                <tr class="bg-[#0C111D] text-slate-400 border-b border-[#263247]">
                  <th class="p-3 font-semibold w-28">Connections</th>
                  ${visibleCurrencies.map(curr => `
                    <th class="p-3 font-semibold border-l border-[#263247]/60">
                      <div class="flex items-center gap-1.5 text-white font-bold">
                        <span>${curr === 'GBP' ? '🇬🇧' : (curr === 'EUR' ? '🇪🇺' : '🇺🇸')}</span>
                        <span>${curr} (${getCurrencySymbol(curr)})</span>
                      </div>
                      <div class="grid grid-cols-2 gap-2 text-[10px] font-normal text-slate-400 mt-1">
                        <span class="text-emerald-400">Sale Price (Now)</span>
                        <span class="text-slate-400">Cut Price (Was)</span>
                      </div>
                    </th>
                  `).join('')}
                  <th class="p-3 font-semibold text-right w-44 border-l border-[#263247]/60">Discount Badge</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-[#263247]/60 bg-[#080B14]/60">
                ${screens.map(scr => {
                  return `
                    <tr class="hover:bg-[#0C111D]/40 transition-colors">
                      <td class="p-3 font-bold text-white whitespace-nowrap">
                        <span class="inline-flex items-center gap-1.5">
                          <span class="text-blue-400">📺</span>
                          <span>${scr} Screen${scr > '1' ? 's' : ''}</span>
                        </span>
                      </td>

                      ${visibleCurrencies.map(curr => {
                        const saleVal = (plan.pricing && plan.pricing[scr] && plan.pricing[scr][curr] !== undefined)
                          ? plan.pricing[scr][curr]
                          : '';
                        const prevVal = (plan.previous_pricing && plan.previous_pricing[scr] && plan.previous_pricing[scr][curr] !== undefined)
                          ? plan.previous_pricing[scr][curr]
                          : '';
                        const curSym = getCurrencySymbol(curr);

                        return `
                          <td class="p-2.5 border-l border-[#263247]/60">
                            <div class="grid grid-cols-2 gap-2">
                              <!-- Sale Price Input -->
                              <div class="relative">
                                <span class="absolute left-2.5 top-2 text-slate-500 font-mono text-[11px]">${curSym}</span>
                                <input type="number" step="0.01" min="0" 
                                  value="${saleVal}"
                                  id="price-sale-${pKey}-${scr}-${curr}"
                                  placeholder="0.00"
                                  class="w-full bg-[#0C111D] border border-emerald-500/30 focus:border-emerald-400 rounded-lg pl-6 pr-2 py-1.5 text-xs font-bold text-emerald-400 font-mono focus:outline-none"
                                  oninput="updateAdminPriceRow('${pKey}', '${scr}')">
                              </div>

                              <!-- Previous Strikethrough Price Input -->
                              <div class="relative">
                                <span class="absolute left-2.5 top-2 text-slate-500 font-mono text-[11px]">${curSym}</span>
                                <input type="number" step="0.01" min="0" 
                                  value="${prevVal}"
                                  id="price-prev-${pKey}-${scr}-${curr}"
                                  placeholder="none"
                                  class="w-full bg-[#0C111D] border border-[#263247] hover:border-slate-500 focus:border-blue-400 rounded-lg pl-6 pr-2 py-1.5 text-xs font-semibold text-slate-400 font-mono focus:outline-none"
                                  oninput="updateAdminPriceRow('${pKey}', '${scr}')">
                              </div>
                            </div>
                          </td>
                        `;
                      }).join('')}

                      <!-- Savings Badge Preview -->
                      <td class="p-3 text-right border-l border-[#263247]/60 whitespace-nowrap" id="savings-badge-${pKey}-${scr}">
                        ${computeSavingsBadgeHtml(plan, scr, visibleCurrencies[0] || 'GBP')}
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Live Visual Preview Snippet -->
        <div class="bg-[#0C111D] rounded-xl p-3 border border-[#263247] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs" id="plan-preview-box-${pKey}">
          <div class="flex items-center gap-3">
            <span class="text-slate-400 font-bold">Live Card Preview:</span>
            <div class="flex items-center gap-2">
              <span id="preview-badge-${pKey}" class="text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full ${isPopular ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white' : 'bg-blue-600/20 text-blue-400 border border-blue-500/30'}">
                ${escapeAdminHtml(badgeText) || 'STANDARD PLAN'}
              </span>
              <span id="preview-title-${pKey}" class="font-bold text-white">${escapeAdminHtml(plan.title || plan.name || pKey)}</span>
            </div>
          </div>

          <div class="flex items-center gap-3">
            <div id="preview-bonus-pill-${pKey}">
              ${extraMonths > 0 ? `<span class="px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">🎁 +${extraMonths} Months Free (${totalMonths} Mo Total)</span>` : ''}
            </div>
            <div class="text-right" id="preview-price-box-${pKey}">
              ${samplePrev > sampleSale ? `<span class="line-through text-slate-500 text-xs mr-1 font-mono">${previewSym}${Number(samplePrev).toFixed(2)}</span>` : ''}
              <span class="font-extrabold text-white text-sm font-mono">${previewSym}${Number(sampleSale).toFixed(2)}</span>
            </div>
          </div>
        </div>

      </div>
    `;
  });

  container.innerHTML = html;
}

function computeSavingsBadgeHtml(plan, scr, curr) {
  const pId = plan.id || plan;
  const pObj = (adminPricingCatalog && adminPricingCatalog.plans && adminPricingCatalog.plans[pId]) || plan;

  const saleInput = document.getElementById(`price-sale-${pId}-${scr}-${curr}`);
  const prevInput = document.getElementById(`price-prev-${pId}-${scr}-${curr}`);

  let sale = saleInput ? parseFloat(saleInput.value) : (pObj.pricing && pObj.pricing[scr] && pObj.pricing[scr] && pObj.pricing[scr][curr]);
  let prev = prevInput ? parseFloat(prevInput.value) : (pObj.previous_pricing && pObj.previous_pricing[scr] && pObj.previous_pricing[scr] && pObj.previous_pricing[scr][curr]);

  sale = parseFloat(sale) || 0;
  prev = parseFloat(prev) || 0;

  const sym = getCurrencySymbol(curr);

  if (prev > sale && sale > 0) {
    const pct = Math.round(((prev - sale) / prev) * 100);
    return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
      <span>-${pct}% OFF</span>
      <span class="text-slate-400 font-mono line-through font-normal">was ${sym}${prev.toFixed(2)}</span>
    </span>`;
  } else if (sale > 0) {
    return `<span class="text-slate-500 text-[10px]">Standard Price</span>`;
  } else {
    return `<span class="text-slate-600 text-[10px]">Not Set</span>`;
  }
}

function updateAdminPriceRow(pKey, scr) {
  const visibleCur = activePricingCurrencyFilter === 'ALL' ? 'GBP' : activePricingCurrencyFilter;

  const badgeEl = document.getElementById(`savings-badge-${pKey}-${scr}`);
  if (badgeEl && adminPricingCatalog && adminPricingCatalog.plans && adminPricingCatalog.plans[pKey]) {
    badgeEl.innerHTML = computeSavingsBadgeHtml(pKey, scr, visibleCur);
  }

  if (scr === '1') {
    updateAdminPlanPreview(pKey);
  }
}

function updateAdminPlanPreview(pKey) {
  if (!adminPricingCatalog || !adminPricingCatalog.plans || !adminPricingCatalog.plans[pKey]) return;

  const plan = adminPricingCatalog.plans[pKey];
  const nameInput = document.getElementById(`input-name-${pKey}`);
  const extraInput = document.getElementById(`input-extra-${pKey}`);
  const badgeInput = document.getElementById(`input-badge-${pKey}`);
  const popularCheck = document.getElementById(`check-popular-${pKey}`);

  const name = nameInput ? nameInput.value.trim() : (plan.title || plan.name);
  const extraMonths = extraInput ? Math.max(0, parseInt(extraInput.value) || 0) : (plan.extra_months || 0);
  const baseMonths = parseInt(plan.duration_months || plan.months) || 1;
  const totalMonths = baseMonths + extraMonths;
  const badgeText = badgeInput ? badgeInput.value.trim() : (plan.badge || '');
  const isPopular = popularCheck ? popularCheck.checked : !!plan.popular;

  const totalLabel = document.getElementById(`label-total-months-${pKey}`);
  if (totalLabel) {
    totalLabel.textContent = `(= ${totalMonths} mo total)`;
  }

  const prevTitle = document.getElementById(`preview-title-${pKey}`);
  if (prevTitle) prevTitle.textContent = name;

  const prevBadge = document.getElementById(`preview-badge-${pKey}`);
  if (prevBadge) {
    prevBadge.textContent = badgeText || 'STANDARD PLAN';
    if (isPopular) {
      prevBadge.className = 'text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full bg-gradient-to-r from-blue-600 to-purple-600 text-white';
    } else {
      prevBadge.className = 'text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full bg-blue-600/20 text-blue-400 border border-blue-500/30';
    }
  }

  const bonusContainer = document.getElementById(`preview-bonus-pill-${pKey}`);
  if (bonusContainer) {
    bonusContainer.innerHTML = extraMonths > 0
      ? `<span class="px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">🎁 +${extraMonths} Months Free (${totalMonths} Mo Total)</span>`
      : '';
  }

  const previewCur = activePricingCurrencyFilter === 'ALL' ? 'GBP' : activePricingCurrencyFilter;
  const previewSym = getCurrencySymbol(previewCur);

  const saleInput = document.getElementById(`price-sale-${pKey}-1-${previewCur}`);
  const prevInput = document.getElementById(`price-prev-${pKey}-1-${previewCur}`);
  let sale = saleInput ? parseFloat(saleInput.value) : (plan.pricing && plan.pricing['1'] && plan.pricing['1'][previewCur]);
  let prev = prevInput ? parseFloat(prevInput.value) : (plan.previous_pricing && plan.previous_pricing['1'] && plan.previous_pricing['1'][previewCur]);

  sale = parseFloat(sale) || 0;
  prev = parseFloat(prev) || 0;

  const priceBox = document.getElementById(`preview-price-box-${pKey}`);
  if (priceBox) {
    priceBox.innerHTML = `
      ${prev > sale ? `<span class="line-through text-slate-500 text-xs mr-1 font-mono">${previewSym}${prev.toFixed(2)}</span>` : ''}
      <span class="font-extrabold text-white text-sm font-mono">${previewSym}${sale.toFixed(2)}</span>
    `;
  }
}

function autoSetPlanCutPrices(pKey, multiplier) {
  if (!adminPricingCatalog || !adminPricingCatalog.plans || !adminPricingCatalog.plans[pKey]) {
    showToast('Plan not found', 'error');
    return;
  }
  const plan = adminPricingCatalog.plans[pKey];
  if (!plan.previous_pricing) plan.previous_pricing = {};

  const currencies = getAdminPricingCurrencies();
  const screens = ['1', '2', '3', '5'];

  screens.forEach(scr => {
    if (!plan.previous_pricing[scr]) plan.previous_pricing[scr] = {};

    currencies.forEach(curr => {
      const saleInput = document.getElementById(`price-sale-${pKey}-${scr}-${curr}`);
      const prevInput = document.getElementById(`price-prev-${pKey}-${scr}-${curr}`);

      let sale = saleInput ? parseFloat(saleInput.value) : (plan.pricing && plan.pricing[scr] && plan.pricing[scr][curr]);
      sale = parseFloat(sale) || 0;

      if (sale > 0) {
        const cut = Math.round(sale * multiplier);
        const cutVal = cut > sale ? cut : parseFloat((sale * multiplier).toFixed(2));
        plan.previous_pricing[scr][curr] = cutVal;
        if (prevInput) {
          prevInput.value = cutVal.toFixed(2);
        }
      }
    });
    updateAdminPriceRow(pKey, scr);
  });
  updateAdminPlanPreview(pKey);
  showToast(`Auto-set cut prices for ${plan.name || plan.title || pKey} (+${Math.round((multiplier - 1) * 100)}%)`, 'info');
}

function clearPlanCutPrices(pKey) {
  if (!adminPricingCatalog || !adminPricingCatalog.plans || !adminPricingCatalog.plans[pKey]) {
    showToast('Plan not found', 'error');
    return;
  }
  const plan = adminPricingCatalog.plans[pKey];
  plan.previous_pricing = {};

  const currencies = getAdminPricingCurrencies();
  const screens = ['1', '2', '3', '5'];

  screens.forEach(scr => {
    currencies.forEach(curr => {
      const prevInput = document.getElementById(`price-prev-${pKey}-${scr}-${curr}`);
      if (prevInput) {
        prevInput.value = '';
      }
    });
    updateAdminPriceRow(pKey, scr);
  });
  updateAdminPlanPreview(pKey);
  showToast(`Removed all cut prices for ${plan.name || plan.title || pKey}`, 'info');
}

function autoSetAllPlansCutPrices(multiplier) {
  if (!adminPricingCatalog || !adminPricingCatalog.plans) return;
  Object.keys(adminPricingCatalog.plans).forEach(pKey => {
    autoSetPlanCutPrices(pKey, multiplier);
  });
  showToast(`Applied +${Math.round((multiplier - 1) * 100)}% strikethrough cut to all plans!`, 'success');
}

function clearAllPlansCutPrices() {
  if (!adminPricingCatalog || !adminPricingCatalog.plans) return;
  Object.keys(adminPricingCatalog.plans).forEach(pKey => {
    clearPlanCutPrices(pKey);
  });
  showToast('Removed all strikethrough cut prices across all plans.', 'info');
}

async function saveAdminPricing() {
  const saveBtn = document.getElementById('btn-save-pricing');
  const originalHtml = saveBtn ? saveBtn.innerHTML : 'Save';
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.innerHTML = `<span>⏳</span><span>Saving All Pricing Changes...</span>`;
  }

  try {
    if (!adminPricingCatalog || !adminPricingCatalog.plans) {
      throw new Error('Pricing catalog not loaded.');
    }

    // 1. Sync current DOM inputs into in-memory catalog
    syncInputsToPricingCatalog();

    const currencyCodes = getAdminPricingCurrencies();
    const screens = ['1', '2', '3', '5'];
    const updatedPlans = {};

    for (const pKey of Object.keys(adminPricingCatalog.plans)) {
      const p = adminPricingCatalog.plans[pKey];
      const baseMonths = parseInt(p.duration_months || p.months) || 1;
      const extraMonths = Math.max(0, parseInt(p.extra_months) || 0);

      const planClean = {
        id: pKey,
        title: p.title || p.name || pKey,
        name: p.name || p.title || pKey,
        duration_months: baseMonths,
        months: baseMonths,
        extra_months: extraMonths,
        badge: (p.badge || '').trim(),
        active: p.active !== false,
        popular: !!p.popular,
        channels: p.channels || "20,000+ 4K & UHD Channels",
        vod: p.vod || "60,000+ Movies & Series",
        pricing: {},
        previous_pricing: {}
      };

      for (const scr of screens) {
        planClean.pricing[scr] = {};
        let screenHasPrev = false;
        const screenPrev = {};

        for (const curr of currencyCodes) {
          const sVal = (p.pricing && p.pricing[scr] && p.pricing[scr][curr] !== undefined)
            ? parseFloat(p.pricing[scr][curr])
            : 0;
          planClean.pricing[scr][curr] = isNaN(sVal) ? 0 : parseFloat(Number(sVal).toFixed(2));

          if (p.previous_pricing && p.previous_pricing[scr] && p.previous_pricing[scr][curr] !== undefined) {
            const pVal = parseFloat(p.previous_pricing[scr][curr]);
            if (!isNaN(pVal) && pVal > 0) {
              screenPrev[curr] = parseFloat(Number(pVal).toFixed(2));
              screenHasPrev = true;
            }
          }
        }

        if (screenHasPrev) {
          planClean.previous_pricing[scr] = screenPrev;
        }
      }

      updatedPlans[pKey] = planClean;
    }

    // Preserve original currencies dictionary if present
    let currenciesToSave = adminPricingCatalog.currencies;
    if (!currenciesToSave || Array.isArray(currenciesToSave)) {
      currenciesToSave = {
        GBP: { symbol: '£', suffix: 'GBP' },
        USD: { symbol: '$', suffix: 'USD' },
        EUR: { symbol: '€', suffix: 'EUR' }
      };
    }

    const payload = {
      pricing: {
        currencies: currenciesToSave,
        plans: updatedPlans
      }
    };

    const res = await adminFetch('/api/admin/pricing', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      const data = await res.json();
      if (data.success) {
        adminPricingCatalog = data.pricing || payload.pricing;
        renderAdminPricing();
        updatePricingBadgeCount();
        showToast('Pricing catalog, cuts, and bonus months saved successfully!', 'success');
      } else {
        showToast(data.message || 'Error saving pricing catalog.', 'error');
      }
    } else {
      const errData = await res.json().catch(() => ({}));
      showToast(errData.message || 'Failed to save pricing catalog.', 'error');
    }
  } catch (err) {
    console.error('Error saving pricing:', err);
    showToast(err.message || 'Network error saving pricing catalog.', 'error');
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.innerHTML = originalHtml;
    }
  }
}

// Attach all pricing functions globally to window
window.loadAdminPricing = loadAdminPricing;
window.saveAdminPricing = saveAdminPricing;
window.switchPricingCurrencyTab = switchPricingCurrencyTab;
window.autoSetPlanCutPrices = autoSetPlanCutPrices;
window.clearPlanCutPrices = clearPlanCutPrices;
window.autoSetAllPlansCutPrices = autoSetAllPlansCutPrices;
window.clearAllPlansCutPrices = clearAllPlansCutPrices;
window.updateAdminPriceRow = updateAdminPriceRow;
window.updateAdminPlanPreview = updateAdminPlanPreview;

