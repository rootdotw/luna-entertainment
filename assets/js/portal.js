/**
 * Luna Stream IPTV - Customer Portal Controller
 */

// Utility: customerFetch
async function customerFetch(url, options = {}) {
  const token = sessionStorage.getItem('luna_customer_token');
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  options.headers = headers;
  const response = await fetch(url, options);
  
  if (response.status === 401) {
    sessionStorage.removeItem('luna_customer_token');
    showLoginView();
    if (window.showToast) window.showToast('Session expired, please login again.', 'error');
    throw new Error('Unauthorized');
  }
  
  return response.json();
}

// Session Management
document.addEventListener('DOMContentLoaded', () => {
  setupTabs();
  setupForms();
  checkSession();
});

function setupTabs() {
  const loginTabBtn = document.getElementById('tab-btn-login');
  const registerTabBtn = document.getElementById('tab-btn-register');
  const loginView = document.getElementById('login-view');
  const registerView = document.getElementById('register-view');
  
  if (loginTabBtn && registerTabBtn) {
    loginTabBtn.addEventListener('click', () => {
      loginTabBtn.classList.add('text-blue-500', 'border-b-2', 'border-blue-500');
      loginTabBtn.classList.remove('text-slate-400');
      registerTabBtn.classList.remove('text-blue-500', 'border-b-2', 'border-blue-500');
      registerTabBtn.classList.add('text-slate-400');
      loginView.classList.remove('hidden');
      registerView.classList.add('hidden');
    });
    
    registerTabBtn.addEventListener('click', () => {
      registerTabBtn.classList.add('text-blue-500', 'border-b-2', 'border-blue-500');
      registerTabBtn.classList.remove('text-slate-400');
      loginTabBtn.classList.remove('text-blue-500', 'border-b-2', 'border-blue-500');
      loginTabBtn.classList.add('text-slate-400');
      registerView.classList.remove('hidden');
      loginView.classList.add('hidden');
    });
  }

  const forgotBtn = document.getElementById('btn-forgot-password');
  const loginForm = document.getElementById('login-form-container');
  const forgotForm = document.getElementById('forgot-form-container');
  const backToLoginBtn = document.getElementById('btn-back-to-login');

  if (forgotBtn) {
    forgotBtn.addEventListener('click', (e) => {
      e.preventDefault();
      loginForm.classList.add('hidden');
      forgotForm.classList.remove('hidden');
    });
  }

  if (backToLoginBtn) {
    backToLoginBtn.addEventListener('click', (e) => {
      e.preventDefault();
      forgotForm.classList.add('hidden');
      loginForm.classList.remove('hidden');
    });
  }
}

function setupForms() {
  const loginForm = document.getElementById('form-login');
  if (loginForm) loginForm.addEventListener('submit', handleLogin);
  
  const registerForm = document.getElementById('form-register');
  if (registerForm) registerForm.addEventListener('submit', handleRegister);
  
  const forgotForm = document.getElementById('form-forgot-password');
  if (forgotForm) forgotForm.addEventListener('submit', handleForgotPassword);

  const resetForm = document.getElementById('form-reset-password');
  if (resetForm) resetForm.addEventListener('submit', handleResetPassword);

  setupTicketForm();
  setupCustomerReplyForm();
}

async function checkSession() {
  const token = sessionStorage.getItem('luna_customer_token');
  if (!token) {
    showLoginView();
    return;
  }
  
  try {
    const data = await customerFetch('/api/customer/dashboard');
    if (data.customer) {
      showDashboardView();
      renderDashboard(data);
    } else {
      showLoginView();
    }
  } catch (err) {
    console.error('Session check failed', err);
    showLoginView();
  }
}

function showLoginView() {
  document.getElementById('auth-section').classList.remove('hidden');
  document.getElementById('dashboard-section').classList.add('hidden');
}

function showDashboardView() {
  document.getElementById('auth-section').classList.add('hidden');
  document.getElementById('dashboard-section').classList.remove('hidden');
}

// Handlers
async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const btn = document.getElementById('btn-submit-login');
  
  try {
    btn.disabled = true;
    btn.innerHTML = 'Logging in...';
    
    const res = await fetch('/api/customer/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    
    const data = await res.json();
    if (data.success && data.token) {
      sessionStorage.setItem('luna_customer_token', data.token);
      if (window.showToast) window.showToast('Login successful', 'success');
      checkSession();
    } else {
      if (window.showToast) window.showToast(data.message || 'Login failed', 'error');
    }
  } catch (err) {
    if (window.showToast) window.showToast('Network error', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Login &rarr;';
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const name = document.getElementById('reg-name').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-password').value;
  const confirmPassword = document.getElementById('reg-confirm-password').value;
  const phone = document.getElementById('reg-phone').value.trim();
  
  if (password !== confirmPassword) {
    if (window.showToast) window.showToast('Passwords do not match', 'error');
    return;
  }

  const btn = document.getElementById('btn-submit-register');
  
  try {
    btn.disabled = true;
    btn.innerHTML = 'Registering...';
    
    const res = await fetch('/api/customer/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password, phone })
    });
    
    const data = await res.json();
    if (data.success) {
      if (window.showToast) window.showToast('Account created! Please login.', 'success');
      document.getElementById('tab-btn-login').click();
    } else {
      if (window.showToast) window.showToast(data.message || 'Registration failed', 'error');
    }
  } catch (err) {
    if (window.showToast) window.showToast('Network error', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Register &rarr;';
  }
}

async function handleForgotPassword(e) {
  e.preventDefault();
  const email = document.getElementById('forgot-email').value.trim();
  const btn = document.getElementById('btn-submit-forgot');
  
  try {
    btn.disabled = true;
    btn.innerHTML = 'Sending...';
    
    const res = await fetch('/api/customer/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    
    const data = await res.json();
    if (data.success) {
      if (window.showToast) window.showToast(data.message || 'Reset code sent to email', 'success');
      document.getElementById('form-forgot-password').classList.add('hidden');
      document.getElementById('form-reset-password').classList.remove('hidden');
      document.getElementById('reset-email').value = email;
    } else {
      if (window.showToast) window.showToast(data.message || 'Error', 'error');
    }
  } catch (err) {
    if (window.showToast) window.showToast('Network error', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Send Reset Link &rarr;';
  }
}

async function handleResetPassword(e) {
  e.preventDefault();
  const email = document.getElementById('reset-email').value.trim();
  const reset_token = document.getElementById('reset-code').value.trim();
  const new_password = document.getElementById('reset-password').value;
  const confirmPassword = document.getElementById('reset-confirm-password').value;
  const btn = document.getElementById('btn-submit-reset');
  
  if (new_password !== confirmPassword) {
    if (window.showToast) window.showToast('Passwords do not match', 'error');
    return;
  }
  
  try {
    btn.disabled = true;
    btn.innerHTML = 'Resetting...';
    
    const res = await fetch('/api/customer/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, reset_token, new_password })
    });
    
    const data = await res.json();
    if (data.success) {
      if (window.showToast) window.showToast('Password reset successful. Please login.', 'success');
      document.getElementById('form-reset-password').classList.add('hidden');
      document.getElementById('form-forgot-password').classList.remove('hidden');
      document.getElementById('btn-back-to-login').click();
    } else {
      if (window.showToast) window.showToast(data.message || 'Reset failed', 'error');
    }
  } catch (err) {
    if (window.showToast) window.showToast('Network error', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Reset Password &rarr;';
  }
}

function handleLogout() {
  sessionStorage.removeItem('luna_customer_token');
  showLoginView();
  if (window.showToast) window.showToast('Logged out successfully', 'success');
}

window.handleLogout = handleLogout;

// Dashboard Rendering
function renderDashboard(data) {
  const { customer, subscriptions = [], orders = [], payments = [] } = data;
  
  document.getElementById('dashboard-customer-name').textContent = customer.name || 'User';
  document.getElementById('renew-btn').href = `checkout.html?plan=12m&email=${encodeURIComponent(customer.email || '')}`;
  
  renderSubscriptions(subscriptions, customer);
  renderOrders(orders);
  renderPayments(payments);
  loadCustomerTickets();
}

function renderSubscriptions(subscriptions, customer) {
  const container = document.getElementById('dashboard-subscriptions');
  container.innerHTML = '';
  
  if (subscriptions.length === 0) {
    const emptyDiv = document.createElement('div');
    emptyDiv.className = 'glass-panel rounded-2xl p-6 border border-[#263247] text-center text-slate-400';
    emptyDiv.textContent = 'No active subscriptions found.';
    container.appendChild(emptyDiv);
    return;
  }
  
  subscriptions.forEach(sub => {
    const card = document.createElement('div');
    card.className = 'glass-panel rounded-3xl p-6 sm:p-8 border border-[#263247] shadow-2xl relative overflow-hidden mb-6';
    
    let badgeClass = '';
    let badgeText = '';
    if (sub.status === 'ACTIVE') {
      badgeClass = 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/25';
      badgeText = '✓ ACTIVE';
    } else if (sub.status === 'EXPIRING_SOON') {
      badgeClass = 'bg-amber-500/10 text-amber-400 border border-amber-500/25';
      badgeText = '! EXPIRING';
    } else {
      badgeClass = 'bg-red-500/10 text-red-400 border border-red-500/25';
      badgeText = '× EXPIRED';
    }
    
    const startDate = new Date(sub.start_date).toLocaleDateString();
    const endDate = new Date(sub.end_date).toLocaleDateString();
    
    const now = new Date();
    const end = new Date(sub.end_date);
    const diff = end.getTime() - now.getTime();
    let daysRemaining = 'Expired';
    if (diff > 0) {
      daysRemaining = `${Math.ceil(diff / (1000 * 60 * 60 * 24))} Days Remaining`;
    }
    
    card.innerHTML = `
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-[#263247]">
        <div>
          <div class="flex items-center gap-2.5">
            <span class="px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider border flex items-center gap-1.5 ${badgeClass}">
              <span>${badgeText}</span>
            </span>
            <span class="text-sm font-bold text-slate-300">${sub.plan_name || 'Plan'}</span>
          </div>
          <p class="text-xs text-slate-400 mt-2">${sub.duration_months || 0} Months, ${sub.devices_count || 1} Devices</p>
        </div>
        <div class="bg-[#0C111D]/90 rounded-2xl p-4 border border-blue-500/20 text-center sm:text-right min-w-[200px]">
          <span class="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Expiration Status</span>
          <div class="text-sm sm:text-base font-black ${diff > 0 ? 'text-blue-400' : 'text-red-400'} font-mono">${daysRemaining}</div>
          <span class="text-[11px] text-slate-500 block mt-0.5">Valid: ${startDate} to ${endDate}</span>
        </div>
      </div>
      
      <!-- Credentials Section -->
      <div class="pt-6 space-y-4">
        <div class="flex items-center justify-between">
          <h3 class="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
            <span>🔑 Credentials</span>
          </h3>
          <span class="text-[11px] text-blue-400">Masked for security</span>
        </div>
        
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs font-mono">
          <div class="bg-[#0C111D] p-3 rounded-xl border border-[#263247]">
            <span class="text-[10px] text-slate-500 block mb-1 uppercase font-bold">Server URL</span>
            <div class="flex items-center justify-between">
              <span class="text-white truncate" id="server-${sub.id}">Masked</span>
              <button onclick="copyToClipboard('server-${sub.id}')" class="text-blue-500 text-xs hover:underline ml-2">Copy</button>
            </div>
          </div>
          <div class="bg-[#0C111D] p-3 rounded-xl border border-[#263247]">
            <span class="text-[10px] text-slate-500 block mb-1 uppercase font-bold">Username</span>
            <div class="flex items-center justify-between">
              <span class="text-blue-400 font-bold truncate" id="user-${sub.id}">Masked</span>
              <button onclick="copyToClipboard('user-${sub.id}')" class="text-blue-500 text-xs hover:underline ml-2">Copy</button>
            </div>
          </div>
          <div class="bg-[#0C111D] p-3 rounded-xl border border-[#263247]">
            <span class="text-[10px] text-slate-500 block mb-1 uppercase font-bold">Password</span>
            <div class="flex items-center justify-between">
              <span class="text-emerald-300 font-bold truncate" id="pass-${sub.id}">••••••••</span>
              <button onclick="copyToClipboard('pass-${sub.id}')" class="text-blue-500 text-xs hover:underline ml-2">Copy</button>
            </div>
          </div>
          <div class="bg-[#0C111D] p-3 rounded-xl border border-[#263247] flex items-center justify-center">
            <button onclick="revealCredentials('${sub.id}')" class="btn-primary px-4 py-2 rounded-lg text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 w-full" id="btn-reveal-${sub.id}">Reveal</button>
          </div>
        </div>
        
        <div class="bg-[#0C111D] p-3.5 rounded-xl border border-[#263247] text-xs font-mono hidden" id="m3u-container-${sub.id}">
          <span class="text-[10px] text-slate-500 uppercase font-bold block mb-1">M3U Plus Playlist Download URL</span>
          <div class="flex items-center justify-between">
            <div id="m3u-${sub.id}" class="text-slate-300 truncate text-[11px]"></div>
            <div class="flex gap-2">
              <button onclick="copyToClipboard('m3u-${sub.id}')" class="text-blue-500 text-xs font-semibold hover:underline">Copy</button>
              <button onclick="downloadM3UFromDiv('m3u-${sub.id}')" class="text-emerald-400 text-xs font-semibold hover:underline">Download</button>
            </div>
          </div>
        </div>
      </div>
    `;
    container.appendChild(card);
  });
}

function renderOrders(orders) {
  const tbody = document.getElementById('dashboard-orders-body');
  if (!tbody) return;
  tbody.innerHTML = '';
  
  if (orders.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="px-4 py-4 text-center text-slate-400 text-sm">No orders found.</td></tr>';
    return;
  }
  
  orders.forEach(order => {
    const tr = document.createElement('tr');
    tr.className = 'border-b border-[#263247] hover:bg-slate-800/30 transition-colors text-xs text-slate-300';
    tr.innerHTML = `
      <td class="px-4 py-3 font-mono text-blue-500">${order.id || '-'}</td>
      <td class="px-4 py-3">${order.plan_name || '-'}</td>
      <td class="px-4 py-3">${order.amount || 0}</td>
      <td class="px-4 py-3">${order.currency || 'USD'}</td>
      <td class="px-4 py-3">
        <span class="px-2 py-1 rounded text-[10px] font-bold ${order.status === 'Completed' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-700 text-slate-300'}">${order.status || 'Pending'}</span>
      </td>
      <td class="px-4 py-3">${order.date ? new Date(order.date).toLocaleDateString() : '-'}</td>
    `;
    tbody.appendChild(tr);
  });
}

function renderPayments(payments) {
  const tbody = document.getElementById('dashboard-payments-body');
  if (!tbody) return;
  tbody.innerHTML = '';
  
  if (payments.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="px-4 py-4 text-center text-slate-400 text-sm">No payments found.</td></tr>';
    return;
  }
  
  payments.forEach(payment => {
    const tr = document.createElement('tr');
    tr.className = 'border-b border-[#263247] hover:bg-slate-800/30 transition-colors text-xs text-slate-300';
    tr.innerHTML = `
      <td class="px-4 py-3 font-mono text-blue-500">${payment.id || '-'}</td>
      <td class="px-4 py-3">${payment.amount || 0}</td>
      <td class="px-4 py-3">
        <span class="px-2 py-1 rounded text-[10px] font-bold ${payment.status === 'Paid' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-700 text-slate-300'}">${payment.status || 'Pending'}</span>
      </td>
      <td class="px-4 py-3">${payment.provider || '-'}</td>
      <td class="px-4 py-3">${payment.date ? new Date(payment.date).toLocaleDateString() : '-'}</td>
    `;
    tbody.appendChild(tr);
  });
}

// Reveal Credentials
async function revealCredentials(subId) {
  const btn = document.getElementById(`btn-reveal-${subId}`);
  try {
    btn.disabled = true;
    btn.textContent = 'Revealing...';
    
    const data = await customerFetch('/api/customer/reveal-credentials', {
      method: 'POST',
      body: JSON.stringify({ subscription_id: subId })
    });
    
    if (data.xtream_username) {
      document.getElementById(`server-${subId}`).textContent = data.server_url;
      document.getElementById(`user-${subId}`).textContent = data.xtream_username;
      document.getElementById(`pass-${subId}`).textContent = data.xtream_password;
      
      const m3uUrl = data.m3u_url || `${data.server_url}/get.php?username=${data.xtream_username}&password=${data.xtream_password}&type=m3u_plus`;
      document.getElementById(`m3u-${subId}`).textContent = m3uUrl;
      document.getElementById(`m3u-container-${subId}`).classList.remove('hidden');
      
      btn.textContent = 'Revealed (30s)';
      
      // Auto-hide after 30 seconds
      setTimeout(() => {
        document.getElementById(`server-${subId}`).textContent = 'Masked';
        document.getElementById(`user-${subId}`).textContent = 'Masked';
        document.getElementById(`pass-${subId}`).textContent = '••••••••';
        document.getElementById(`m3u-container-${subId}`).classList.add('hidden');
        btn.textContent = 'Reveal';
        btn.disabled = false;
      }, 30000);
      
    } else {
      btn.textContent = 'Reveal';
      btn.disabled = false;
      if (window.showToast) window.showToast('Could not reveal credentials', 'error');
    }
  } catch (err) {
    btn.textContent = 'Reveal';
    btn.disabled = false;
    if (window.showToast) window.showToast('Error revealing credentials', 'error');
  }
}
window.revealCredentials = revealCredentials;

function copyToClipboard(elementId) {
  const el = document.getElementById(elementId);
  if (!el) return;
  const text = el.textContent.trim();
  navigator.clipboard.writeText(text).then(() => {
    if (window.showToast) window.showToast(`Copied!`, 'success');
  });
}
window.copyToClipboard = copyToClipboard;

function downloadM3UFromDiv(elementId) {
  const el = document.getElementById(elementId);
  if (!el) return;
  const url = el.textContent.trim();
  
  // Extract user info from URL
  let user = 'user';
  let pass = 'pass';
  let server = 'http://line.luna.stream';
  
  try {
    const urlObj = new URL(url);
    user = urlObj.searchParams.get('username') || 'user';
    pass = urlObj.searchParams.get('password') || 'pass';
    server = urlObj.origin;
  } catch(e) {}
  
  downloadM3UFile(user, pass, server);
}
window.downloadM3UFromDiv = downloadM3UFromDiv;

function downloadM3UFile(user, pass, server) {
  const m3uContent = 
`#EXTM3U url-tvg="${server}/epg.xml.gz"
#EXTINF:-1 tvg-id="SkySportsMainEvent.uk" tvg-name="UK: Sky Sports Main Event 4K UHD" tvg-logo="https://raw.githubusercontent.com/Luna Stream/logos/main/sky_main.png" group-title="🇬🇧 UK | SPORTS VIP UHD",UK: Sky Sports Main Event 4K UHD
${server}/live/${user}/${pass}/101.ts
#EXTINF:-1 tvg-id="TNT1.uk" tvg-name="UK: TNT Sports 1 Ultimate 4K" tvg-logo="https://raw.githubusercontent.com/Luna Stream/logos/main/tnt1.png" group-title="🇬🇧 UK | SPORTS VIP UHD",UK: TNT Sports 1 Ultimate 4K
${server}/live/${user}/${pass}/102.ts
#EXTINF:-1 tvg-id="ESPN.us" tvg-name="US: ESPN+ UHD 60FPS" tvg-logo="https://raw.githubusercontent.com/Luna Stream/logos/main/espn.png" group-title="🇺🇸 USA | SPORTS & PPV",US: ESPN+ UHD 60FPS
${server}/live/${user}/${pass}/201.ts
#EXTINF:-1 tvg-id="UFCPPV.us" tvg-name="PPV: UFC Main Event UHD" tvg-logo="https://raw.githubusercontent.com/Luna Stream/logos/main/ufc.png" group-title="🥊 PPV & EVENTS VIP",PPV: UFC Main Event UHD
${server}/live/${user}/${pass}/301.ts
#EXTINF:-1 tvg-id="HBOHD.us" tvg-name="US: HBO Max VIP Cinema 4K" tvg-logo="https://raw.githubusercontent.com/Luna Stream/logos/main/hbo.png" group-title="🎬 USA | CINEMA & HBO",US: HBO Max VIP Cinema 4K
${server}/live/${user}/${pass}/401.ts
`;

  const blob = new Blob([m3uContent], { type: 'audio/x-mpegurl;charset=utf-8' });
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = `Luna_Stream_${user}_playlist.m3u`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(blobUrl);

  if (window.showToast) window.showToast(`📥 Playlist downloaded!`, 'success');
}
window.downloadM3UFile = downloadM3UFile;

// Support Tickets Functions
function setupTicketForm() {
  const toggleBtn = document.getElementById('btn-toggle-ticket-form');
  const cancelBtn = document.getElementById('btn-cancel-ticket');
  const form = document.getElementById('form-new-ticket');

  if (toggleBtn && form) {
    toggleBtn.addEventListener('click', () => {
      form.classList.toggle('hidden');
    });
  }

  if (cancelBtn && form) {
    cancelBtn.addEventListener('click', () => {
      form.classList.add('hidden');
    });
  }

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        category: document.getElementById('ticket-category')?.value,
        device: document.getElementById('ticket-device')?.value,
        subject: document.getElementById('ticket-subject')?.value,
        message: document.getElementById('ticket-message')?.value
      };

      try {
        const data = await customerFetch('/api/customer/tickets', {
          method: 'POST',
          body: JSON.stringify(payload)
        });

        if (data.success) {
          if (window.showToast) window.showToast('Support ticket submitted! Our team will respond shortly.', 'success');
          form.reset();
          form.classList.add('hidden');
          loadCustomerTickets();
        } else {
          if (window.showToast) window.showToast(data.message || 'Failed to submit ticket', 'error');
        }
      } catch (err) {
        if (window.showToast) window.showToast('Error submitting ticket', 'error');
      }
    });
  }
}

async function loadCustomerTickets() {
  const tbody = document.getElementById('dashboard-tickets-body');
  if (!tbody) return;

  try {
    const tickets = await customerFetch('/api/customer/tickets');
    tbody.innerHTML = '';

    if (!tickets || tickets.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="px-4 py-6 text-center text-slate-500">No support tickets found. If you experience any issues, submit a ticket above.</td></tr>';
      return;
    }

    window.loadedCustomerTickets = tickets;

    tickets.forEach(t => {
      const tr = document.createElement('tr');
      tr.className = 'hover:bg-slate-800/40 transition-colors border-b border-[#263247]/50';

      const statusColors = {
        'OPEN': 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30',
        'WAITING_ON_ADMIN': 'bg-amber-500/10 text-amber-400 border border-amber-500/30',
        'WAITING_ON_CUSTOMER': 'bg-cyan-500/10 text-blue-500 border border-blue-500/30',
        'RESOLVED': 'bg-slate-800 text-slate-400',
        'CLOSED': 'bg-slate-800 text-slate-500'
      };

      tr.innerHTML = `
        <td class="px-4 py-3 font-mono font-bold text-blue-500">${t.id}</td>
        <td class="px-4 py-3 font-semibold text-white">${t.subject}</td>
        <td class="px-4 py-3 text-slate-400">${t.category}</td>
        <td class="px-4 py-3"><span class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${statusColors[t.status] || 'bg-slate-800 text-slate-400'}">${t.status}</span></td>
        <td class="px-4 py-3 font-mono text-[11px] text-slate-400">${t.updated_at ? new Date(t.updated_at).toLocaleDateString() : '-'}</td>
        <td class="px-4 py-3 text-right"><button onclick="viewCustomerTicket('${t.id}')" class="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold border border-[#263247]">View Details</button></td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="6" class="px-4 py-6 text-center text-red-400">Failed to load tickets.</td></tr>';
  }
}

let currentCustomerViewingTicketId = null;

function setupCustomerReplyForm() {
  const form = document.getElementById('form-customer-ticket-reply');
  if (!form) return;
  
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentCustomerViewingTicketId) return;
    
    const replyInput = document.getElementById('customer-ticket-reply-text');
    const message = replyInput?.value.trim();
    if (!message) return;
    
    const btn = document.getElementById('btn-customer-send-reply');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Sending...';
    }
    
    try {
      const data = await customerFetch('/api/customer/tickets/reply', {
        method: 'POST',
        body: JSON.stringify({
          ticket_id: currentCustomerViewingTicketId,
          message: message
        })
      });
      
      if (data.success) {
        if (window.showToast) window.showToast('Reply submitted to support team!', 'success');
        if (replyInput) replyInput.value = '';
        await loadCustomerTickets();
        viewCustomerTicket(currentCustomerViewingTicketId);
      } else {
        if (window.showToast) window.showToast(data.message || 'Failed to send reply', 'error');
      }
    } catch (err) {
      if (window.showToast) window.showToast('Error sending reply', 'error');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Send Reply';
      }
    }
  });
}

window.viewCustomerTicket = function(id) {
  const tickets = window.loadedCustomerTickets || [];
  const t = tickets.find(x => x.id === id);
  if (!t) return;

  currentCustomerViewingTicketId = id;
  const replyInput = document.getElementById('customer-ticket-reply-text');
  if (replyInput) replyInput.value = '';

  const modal = document.getElementById('ticket-modal');
  const idEl = document.getElementById('ticket-modal-id');
  const statusEl = document.getElementById('ticket-modal-status');
  const subjEl = document.getElementById('ticket-modal-subject');
  const msgsEl = document.getElementById('ticket-modal-messages');

  if (!modal || !idEl || !subjEl || !msgsEl) return;

  idEl.textContent = t.id;
  subjEl.textContent = t.subject;
  if (statusEl) {
    statusEl.textContent = t.status;
    statusEl.className = 'px-2 py-0.5 rounded-full font-bold uppercase text-[10px] bg-blue-500/10 text-blue-400 border border-blue-500/30';
  }

  msgsEl.innerHTML = '';
  if (t.messages && t.messages.length > 0) {
    t.messages.forEach(m => {
      const msgDiv = document.createElement('div');
      msgDiv.className = 'p-2.5 rounded-xl bg-[#101522] border border-[#263247] space-y-1';
      const senderSpan = document.createElement('span');
      senderSpan.className = 'text-[10px] font-bold text-slate-400 block';
      senderSpan.textContent = (m.sender_name || (m.sender === 'admin' ? 'Support Agent' : 'You')) + ' • ' + (m.timestamp ? new Date(m.timestamp).toLocaleString() : '');
      const textP = document.createElement('p');
      textP.className = 'text-xs text-white whitespace-pre-wrap';
      textP.textContent = m.text || '';
      msgDiv.append(senderSpan, textP);
      msgsEl.appendChild(msgDiv);
    });
  } else {
    msgsEl.innerHTML = '<p class="text-slate-500 italic">No messages found.</p>';
  }

  modal.classList.remove('hidden');
};

window.closeCustomerTicketModal = function() {
  const modal = document.getElementById('ticket-modal');
  if (modal) modal.classList.add('hidden');
  currentCustomerViewingTicketId = null;
};


