/**
 * Luna Stream IPTV - Real-Time Live Visitor & Navigation Telemetry Engine
 * Sends instant page visit pings, live heartbeats, and lead checkout intents.
 */

(function () {
  const API_BASE = window.location.origin;

  // 1. Persistent Browser Visitor ID (Unique across visits)
  function getVisitorId() {
    let vid = localStorage.getItem('luna_visitor_id');
    if (!vid) {
      if (window.crypto && typeof window.crypto.randomUUID === 'function') {
        vid = 'vis_' + window.crypto.randomUUID().substring(0, 8);
      } else {
        vid = 'vis_' + Math.random().toString(36).substring(2, 10);
      }
      localStorage.setItem('luna_visitor_id', vid);
    }
    return vid;
  }

  // 2. Session ID (Persists across tabs during current browser session)
  function getSessionId() {
    let sess = sessionStorage.getItem('luna_session_id');
    if (!sess) {
      if (window.crypto && typeof window.crypto.randomUUID === 'function') {
        sess = 'sess_' + window.crypto.randomUUID().substring(0, 10);
      } else {
        sess = 'sess_' + Math.random().toString(36).substring(2, 12);
      }
      sessionStorage.setItem('luna_session_id', sess);
    }
    return sess;
  }

  // 3. Detect Device Form Factor
  function getDeviceType() {
    const width = window.innerWidth;
    if (width < 640) return 'Mobile';
    if (width < 1024) return 'Tablet';
    return 'Desktop';
  }

  // 4. Send Real-Time Page Visit & Navigation Ping
  function sendPagePing(isHeartbeat = false) {
    const payload = {
      session_id: getSessionId(),
      visitor_id: getVisitorId(),
      page_path: window.location.pathname || '/index.html',
      page_title: document.title || 'Luna Stream IPTV',
      referrer: document.referrer || 'Direct',
      user_agent: navigator.userAgent,
      device_type: getDeviceType(),
      is_heartbeat: isHeartbeat,
      timestamp: new Date().toISOString()
    };

    try {
      fetch(`${API_BASE}/api/track/visit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true
      }).catch(() => {});
    } catch (e) {}
  }

  // 5. WhatsApp & Telegram Cart Lead Tracking
  function initIntentTracking() {
    document.addEventListener('click', function (e) {
      const target = e.target.closest('a');
      if (!target) return;

      const href = target.getAttribute('href') || '';
      const isWhatsApp = href.includes('wa.me') || href.includes('whatsapp.com') || target.classList.contains('btn-whatsapp');
      const isTelegram = href.includes('t.me') || target.classList.contains('btn-telegram');

      if (isWhatsApp || isTelegram) {
        let planTitle = '12 Months Ultimate';
        let devices = 1;
        let currency = 'GBP';

        if (window.checkoutState) {
          planTitle = window.checkoutState.planId || planTitle;
          devices = window.checkoutState.devices || devices;
          currency = window.checkoutState.currency || currency;
        }

        const leadPayload = {
          session_id: getSessionId(),
          customer_name: document.getElementById('order_name')?.value || 'Instant Chat Lead',
          customer_email: document.getElementById('order_email')?.value || '',
          selected_plan: planTitle,
          devices: devices,
          currency: currency,
          lead_source: isWhatsApp ? 'WhatsApp_Button_Click' : 'Telegram_Button_Click'
        };

        try {
          fetch(`${API_BASE}/api/track/intent`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(leadPayload),
            keepalive: true
          }).catch(() => {});
        } catch (err) {}
      }
    });
  }

  // 6. Global PulseTracker API
  window.PulseTracker = {
    getSessionId,
    getVisitorId,
    trackVisit: () => sendPagePing(false),
    trackIntent: function (data) {
      fetch(`${API_BASE}/api/track/intent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.assign({ session_id: getSessionId() }, data)),
        keepalive: true
      }).catch(() => {});
    }
  };

  // 7. Initialize Immediate Page Tracking & Active Heartbeat
  function startTracking() {
    // Immediate initial page ping on arrival
    sendPagePing(false);

    // Intent clicks
    initIntentTracking();

    // Heartbeat ping every 15s to maintain active presence in Admin Radar
    setInterval(() => {
      if (document.visibilityState === 'visible') {
        sendPagePing(true);
      }
    }, 15000);

    // Update on tab focus
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        sendPagePing(false);
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startTracking);
  } else {
    startTracking();
  }
})();
