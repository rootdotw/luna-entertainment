/**
 * Luna Stream IPTV - Main JavaScript & Interactive Features + Backend Trial Submission
 */

document.addEventListener('DOMContentLoaded', () => {
  initMobileNav();
  initStickyHeader();
  initAnnouncementBar();
  initFAQAccordion();
  initTrialModal();
  initContactForm();
  initCookieConsentBanner();
  initClipboardButtons();
  initSportsTicker();
});

/* -------------------------------------------------------------
   1. Mobile Drawer Navigation
   ------------------------------------------------------------- */
function initMobileNav() {
  const menuBtn = document.getElementById('mobile-menu-btn');
  const closeBtn = document.getElementById('mobile-menu-close');
  const drawer = document.getElementById('mobile-drawer');
  const backdrop = document.getElementById('drawer-backdrop');
  const drawerLinks = document.querySelectorAll('.drawer-link');

  if (!menuBtn || !drawer) return;

  function openMenu() {
    drawer.classList.remove('translate-x-full');
    backdrop.classList.remove('hidden');
    backdrop.classList.remove('opacity-0');
    backdrop.classList.add('opacity-100');
    document.body.style.overflow = 'hidden';
  }

  function closeMenu() {
    drawer.classList.add('translate-x-full');
    backdrop.classList.remove('opacity-100');
    backdrop.classList.add('opacity-0');
    setTimeout(() => {
      backdrop.classList.add('hidden');
    }, 300);
    document.body.style.overflow = '';
  }

  menuBtn.addEventListener('click', openMenu);
  if (closeBtn) closeBtn.addEventListener('click', closeMenu);
  if (backdrop) backdrop.addEventListener('click', closeMenu);

  drawerLinks.forEach(link => {
    link.addEventListener('click', closeMenu);
  });
}

/* -------------------------------------------------------------
   2. Sticky Header with Backdrop Blur
   ------------------------------------------------------------- */
function initStickyHeader() {
  const header = document.getElementById('site-header');
  if (!header) return;

  window.addEventListener('scroll', () => {
    if (window.scrollY > 20) {
      header.classList.add('shadow-2xl', 'shadow-black/60', 'bg-slate-950/95');
      header.classList.remove('bg-slate-950/80');
    } else {
      header.classList.remove('shadow-2xl', 'shadow-black/60', 'bg-slate-950/95');
      header.classList.add('bg-slate-950/80');
    }
  });
}

/* -------------------------------------------------------------
   3. FAQ Accordion (Accessible)
   ------------------------------------------------------------- */
function initFAQAccordion() {
  const accordionButtons = document.querySelectorAll('.faq-trigger');

  accordionButtons.forEach((btn, idx) => {
    const content = btn.nextElementSibling;
    if (content) {
      if (!content.id) content.id = `faq-panel-${idx}`;
      btn.setAttribute('aria-controls', content.id);
      btn.setAttribute('aria-expanded', 'false');
      content.setAttribute('aria-hidden', 'true');
    }

    btn.addEventListener('click', () => {
      const content = btn.nextElementSibling;
      const icon = btn.querySelector('.faq-icon');
      const isOpen = content.classList.contains('open');

      document.querySelectorAll('.faq-content').forEach(c => {
        c.classList.remove('open');
        c.setAttribute('aria-hidden', 'true');
      });
      document.querySelectorAll('.faq-trigger').forEach(b => {
        b.setAttribute('aria-expanded', 'false');
      });
      document.querySelectorAll('.faq-icon').forEach(ic => {
        ic.style.transform = 'rotate(0deg)';
      });

      if (!isOpen) {
        content.classList.add('open');
        content.setAttribute('aria-hidden', 'false');
        btn.setAttribute('aria-expanded', 'true');
        if (icon) icon.style.transform = 'rotate(180deg)';
      }
    });
  });
}

/* -------------------------------------------------------------
   4. Free 24h Trial Modal + Real API Post (Accessible)
   ------------------------------------------------------------- */
function initTrialModal() {
  const modal = document.getElementById('trial-modal');
  const openButtons = document.querySelectorAll('.open-trial-modal');
  const closeBtn = document.getElementById('close-trial-modal');
  const form = document.getElementById('trial-form');
  const backdrop = document.getElementById('trial-backdrop');

  if (!modal) return;

  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', '24-Hour Free Trial Registration');

  function openModal() {
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    const firstInput = modal.querySelector('input, select, button');
    if (firstInput) firstInput.focus();
  }

  function closeModal() {
    modal.classList.add('hidden');
    document.body.style.overflow = '';
  }

  openButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      openModal();
    });
  });

  if (closeBtn) closeBtn.addEventListener('click', closeModal);
  if (backdrop) backdrop.addEventListener('click', closeModal);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
      closeModal();
    }
  });

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const emailInput = form.querySelector('input[type="email"]');
      const deviceSelect = form.querySelector('select[name="device"]');
      const email = emailInput ? emailInput.value.trim() : '';
      const device = deviceSelect ? deviceSelect.value : 'Smart TV';

      if (!email) {
        showToast('Please enter a valid email address.', 'error');
        return;
      }

      const submitBtn = form.querySelector('button[type="submit"]');
      const originalText = submitBtn.innerHTML;
      submitBtn.disabled = true;
      submitBtn.innerHTML = `
        <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white inline" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        Dispatching 24H Trial Line in DB...
      `;

      try {
        const trialRes = await fetch('/api/trials', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ customer_name: 'Trial Applicant', email: email, device_type: device, country: 'Global' })
        });
        if (!trialRes.ok) throw new Error('Trial API failed');

        await fetch('/api/track/intent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_id: window.TRACKER_SESSION_ID || 'sess_modal',
            customer_name: 'Trial Applicant',
            customer_email: email,
            selected_plan: `24H Free Trial (${device})`,
            devices: 1,
            currency: 'USD',
            lead_source: 'Popup_Trial_Modal'
          })
        });
      } catch (err) {
        console.warn('API Trial log fallback:', err);
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
        showToast('Error requesting trial. Please try again.', 'error');
        return;
      }

      setTimeout(() => {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
        closeModal();
        form.reset();

        showToast(`🎉 24-Hour Free Trial line registered for ${email}! Credentials dispatched.`, 'success');
      }, 900);
    });
  }
}

/* -------------------------------------------------------------
   5. Support Desk Page Form Submission (contact.html)
   ------------------------------------------------------------- */
function initContactForm() {
  const form = document.getElementById('contact-trial-form') || document.getElementById('contact_form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('contact_name')?.value.trim() || 'Valued Visitor';
    const email = document.getElementById('contact_email')?.value.trim() || '';
    const device = document.getElementById('contact_device')?.value || 'Amazon FireStick 4K';
    const country = document.getElementById('contact_country')?.value.trim() || 'Global';
    const message = document.getElementById('contact_message')?.value.trim() || '';

    if (!email) {
      showToast('Please enter your delivery email address.', 'error');
      return;
    }

    const submitBtn = document.getElementById('btn_submit_contact');
    const origText = submitBtn ? submitBtn.innerHTML : 'Send Trial Credentials';
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = `
        <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white inline" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        Saving to Support & Trial Queue...
      `;
    }

    try {
      // 1. Write to Trials database
      const trialRes = await fetch('/api/trials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_name: name,
          email: email,
          device_type: device,
          country: country,
          message: message
        })
      });
      if (!trialRes.ok) throw new Error('Trial API failed');

      // 2. Also record in Leads & Inquiries database
      await fetch('/api/track/intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: window.TRACKER_SESSION_ID || 'sess_contact',
          customer_name: name,
          customer_email: email,
          selected_plan: `24H Free Trial (${device})`,
          devices: 1,
          currency: 'USD',
          lead_source: `Support_Page_Form (${country})`
        })
      });
    } catch (err) {
      console.warn('Contact submission fallback:', err);
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = origText;
      }
      showToast('Error sending message. Please try again.', 'error');
      return;
    }

    setTimeout(() => {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = origText;
      }
      form.reset();
      showToast(`🎉 24-Hour Trial request registered for ${email}! Check inbox in 2 minutes.`, 'success');
    }, 900);
  });
}

/* -------------------------------------------------------------
   5. Cookie Consent Banner (GDPR & Privacy Compliance)
   ------------------------------------------------------------- */
function initCookieConsentBanner() {
  const consent = localStorage.getItem('luna_cookie_consent');
  if (consent) return;

  const banner = document.createElement('div');
  banner.id = 'cookie-consent-banner';
  banner.className = 'fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:max-w-md z-50 p-4 rounded-2xl glass-panel border border-[#263247] bg-[#101522] shadow-2xl backdrop-blur-xl transition-all duration-300 transform translate-y-0 text-xs text-slate-300';
  banner.setAttribute('role', 'region');
  banner.setAttribute('aria-label', 'Cookie Consent Notice');

  banner.innerHTML = `
    <div class="flex items-start gap-3">
      <div class="text-xl flex-shrink-0">🍪</div>
      <div class="flex-1 space-y-2">
        <p class="font-medium text-white">We value your privacy</p>
        <p class="text-slate-400 leading-relaxed text-[11px]">
          We use functional cookies and anonymous analytics to improve video streaming and optimize server routing. No personal data is sold.
        </p>
        <div class="flex items-center gap-2 pt-1">
          <button id="cookie-accept-all" class="btn-primary px-3 py-1.5 rounded-lg font-bold text-[11px] text-white bg-blue-600 hover:bg-blue-500 transition-transform hover:scale-105">
            Accept All
          </button>
          <button id="cookie-essential" class="px-3 py-1.5 rounded-lg font-semibold text-[11px] bg-[#161D2D] text-slate-300 hover:text-white border border-[#263247] transition-colors">
            Essential Only
          </button>
          <a href="privacy.html" class="text-[11px] text-blue-400 hover:underline ml-auto">
            Privacy Policy
          </a>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(banner);

  const acceptBtn = banner.querySelector('#cookie-accept-all');
  const essentialBtn = banner.querySelector('#cookie-essential');

  const closeBanner = (type) => {
    localStorage.setItem('luna_cookie_consent', type);
    banner.classList.add('opacity-0', 'translate-y-4');
    setTimeout(() => banner.remove(), 300);
    window.dispatchEvent(new CustomEvent('luna_cookie_consent_updated', { detail: { consent: type } }));
  };

  if (acceptBtn) acceptBtn.addEventListener('click', () => closeBanner('accepted'));
  if (essentialBtn) essentialBtn.addEventListener('click', () => closeBanner('essential'));
}

/* -------------------------------------------------------------
   6. Copy-to-Clipboard Buttons
   ------------------------------------------------------------- */
function initClipboardButtons() {
  const copyButtons = document.querySelectorAll('.btn-copy');

  copyButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetText = btn.getAttribute('data-copy');
      if (!targetText) return;

      navigator.clipboard.writeText(targetText).then(() => {
        showToast(`Copied to clipboard: "${targetText}"`, 'success');
        const originalHtml = btn.innerHTML;
        btn.innerHTML = `<svg class="w-4 h-4 text-emerald-400 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg> Copied!`;
        setTimeout(() => {
          btn.innerHTML = originalHtml;
        }, 2000);
      }).catch(() => {
        showToast('Failed to copy. Please select text manually.', 'error');
      });
    });
  });
}

/* -------------------------------------------------------------
   7. Toast Notification Utility
   ------------------------------------------------------------- */
function showToast(message, type = 'info') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = 'toast';

  let icon = `
    <div class="w-6 h-6 rounded-full bg-blue-600/20 text-blue-400 flex items-center justify-center flex-shrink-0">
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
    </div>
  `;

  if (type === 'success') {
    toast.style.borderColor = '#22C55E';
    icon = `
      <div class="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center flex-shrink-0">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
      </div>
    `;
  } else if (type === 'error') {
    toast.style.borderColor = '#EF4444';
    icon = `
      <div class="w-6 h-6 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center flex-shrink-0">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
      </div>
    `;
  }

  toast.innerHTML = `
    ${icon}
    <div class="text-sm font-medium text-slate-100 flex-1 message-container"></div>
  `;
  toast.querySelector('.message-container').textContent = message;

  container.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('show');
  });

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => {
      toast.remove();
    }, 300);
  }, 4000);
}

window.showToast = showToast;

/* -------------------------------------------------------------
   7. Live Sale & Announcement Ticker (Running Line)
   ------------------------------------------------------------- */
async function initAnnouncementBar() {
  try {
    const res = await fetch('/api/announcement');
    if (!res.ok) return;
    const data = await res.json();
    if (!data.enabled || !data.text) {
      const existing = document.getElementById('site-announcement-bar');
      if (existing) existing.remove();
      document.body.classList.remove('has-announcement');
      return;
    }

    let bar = document.getElementById('site-announcement-bar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'site-announcement-bar';
      const header = document.getElementById('site-header');
      if (header && header.parentNode) {
        header.parentNode.insertBefore(bar, header.nextSibling);
      } else {
        document.body.prepend(bar);
      }
    }

    document.body.classList.add('has-announcement');

    let badge = data.badge || '🔥 SALE';
    if (!badge.includes('🔥') && !badge.includes('⚡') && !badge.includes('🏷️')) {
      badge = `🔥 ${badge}`;
    }
    const text = data.text;
    const disc = data.discount_percent || 20;
    const linkText = (data.link_text && !data.link_text.toLowerCase().includes('claim')) ? data.link_text : `Claim ${disc}% OFF →`;
    const linkUrl = data.link_url || `checkout.html?plan=12m&promo=${encodeURIComponent(data.promo_code || 'LUNA20')}&discount=${disc}`;

    bar.innerHTML = '';
    const container = document.createElement('div');
    container.className = 'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full flex items-center justify-between gap-3 text-xs';
    
    const leftDiv = document.createElement('div');
    leftDiv.className = 'flex items-center gap-2.5 overflow-hidden flex-1';
    
    const badgeSpan = document.createElement('span');
    badgeSpan.className = 'shrink-0 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-blue-600 text-white font-bold text-[10px] tracking-wider uppercase shadow-sm';
    badgeSpan.textContent = badge;
    
    const marqueeContainer = document.createElement('div');
    marqueeContainer.className = 'marquee-container flex-1';
    
    for (let i = 0; i < 2; i++) {
        const content = document.createElement('div');
        content.className = 'marquee-content font-semibold text-slate-200';
        if (i === 1) content.setAttribute('aria-hidden', 'true');
        
        const span1 = document.createElement('span');
        span1.textContent = text;
        const spanDot = document.createElement('span');
        spanDot.textContent = '•';
        const span2 = document.createElement('span');
        span2.textContent = text;
        
        content.append(span1, spanDot, span2);
        marqueeContainer.appendChild(content);
    }
    
    leftDiv.append(badgeSpan, marqueeContainer);
    
    const link = document.createElement('a');
    link.className = 'shrink-0 font-bold text-blue-400 hover:text-blue-300 hover:underline flex items-center gap-1 transition-all text-xs';
    link.href = linkUrl;
    
    const linkSpan = document.createElement('span');
    linkSpan.textContent = linkText;
    link.appendChild(linkSpan);
    
    container.append(leftDiv, link);
    bar.appendChild(container);
  } catch (err) {
    console.debug('Announcement check skipped');
  }
}

/* -------------------------------------------------------------
   9. Live Sports Ticker Dynamic Populator
   ------------------------------------------------------------- */
function initSportsTicker() {
  const tickerTrack = document.querySelector('.ticker-track');
  if (!tickerTrack) return;

  fetch('/api/sports/fixtures', { cache: 'no-cache' })
    .then(res => {
      if (!res.ok) throw new Error('Network response not ok');
      return res.json();
    })
    .then(data => {
      if (data && Array.isArray(data.fixtures) && data.fixtures.length > 0) {
        renderSportsTickerTrack(tickerTrack, data.fixtures);
      }
    })
    .catch(err => {
      console.debug('Sports ticker dynamic fetch deferred, keeping initial fixtures:', err);
    });
}

function renderSportsTickerTrack(track, fixtures) {
  const now = Date.now();
  const getEmoji = (cat) => {
    switch (cat) {
      case 'football': return '⚽';
      case 'ufc': return '🥊';
      case 'f1': return '🏎️';
      case 'tennis': return '🎾';
      case 'basketball': return '🏀';
      default: return '🏆';
    }
  };

  const getPrefix = (f) => {
    const l = (f.league || '').toLowerCase();
    if (l.includes('premier league')) return 'Premier League';
    if (l.includes('champions league')) return 'UCL';
    if (l.includes('europa league')) return 'UEL';
    if (l.includes('serie a')) return 'Serie A';
    if (l.includes('la liga')) return 'La Liga';
    if (l.includes('ufc')) return 'UFC PPV';
    if (l.includes('boxing') || l.includes('wbc')) return 'Boxing PPV';
    if (l.includes('formula 1')) return 'Formula 1';
    if (l.includes('tennis') || l.includes('atp') || l.includes('us open')) return 'Tennis';
    if (l.includes('nba') || l.includes('wnba') || l.includes('basketball')) return 'NBA';
    return 'Live';
  };

  const cardsHtml = fixtures.map(evt => {
    const isLive = evt.is_live || (evt.start_time <= now && (!evt.end_time || evt.end_time > now));
    const emoji = evt.team_a_icon || getEmoji(evt.category);
    const prefix = getPrefix(evt);
    const matchName = `${prefix}: ${evt.team_a} vs ${evt.team_b}`;

    const evtDate = new Date(evt.start_time);
    const nowDate = new Date();
    const isToday = evtDate.toDateString() === nowDate.toDateString();
    
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const isTomorrow = evtDate.toDateString() === tomorrow.toDateString();

    const timeStr = evtDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    let statusSnippet = '';
    let borderClass = 'border-[#263247]';

    if (isLive) {
      borderClass = 'border-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.15)]';
      statusSnippet = `
        <div class="text-[11px] text-red-400 font-bold flex items-center gap-1">
          <span class="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping"></span>
          <span>🔴 STREAMING LIVE NOW • 4K UHD</span>
        </div>
      `;
    } else if (isToday) {
      statusSnippet = `<div class="text-[11px] text-blue-400 font-semibold">Tonight, ${timeStr} • 4K UHD</div>`;
    } else if (isTomorrow) {
      statusSnippet = `<div class="text-[11px] text-emerald-400 font-semibold">Tomorrow, ${timeStr} • 4K UHD</div>`;
    } else {
      const dayStr = evtDate.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
      statusSnippet = `<div class="text-[11px] text-amber-400 font-semibold">${dayStr} • ${timeStr} • 4K UHD</div>`;
    }

    return `
      <a href="sports.html" class="glass-panel px-4 py-2.5 rounded-xl flex items-center gap-3 min-w-[300px] border ${borderClass} hover:border-blue-500/60 transition-all group shrink-0">
        <span class="text-xl group-hover:scale-110 transition-transform">${emoji}</span>
        <div>
          <div class="text-xs font-bold text-white group-hover:text-blue-300 transition-colors">${matchName}</div>
          ${statusSnippet}
        </div>
      </a>
    `;
  }).join('');

  // Duplicate cards for seamless -50% CSS translate loop
  track.innerHTML = cardsHtml + cardsHtml;
}


