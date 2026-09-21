/**
 * Luna Stream IPTV - Interactive Checkout & WhatsApp / Telegram Order Builder + Backend Integration
 */

const SUPPORT_WHATSAPP_NUMBER = "447413469398";
const SUPPORT_TELEGRAM_HANDLE = "LunaStreamOfficial";

const CHECKOUT_PRICING = {
  currencies: {
    GBP: { symbol: '£' },
    USD: { symbol: '$' },
    EUR: { symbol: '€' }
  },
  plans: {
    '3m': {
      title: '3 Months Pass',
      durationMonths: 3,
      pricing: {
        1: { GBP: 25, EUR: 30, USD: 35 },
        2: { GBP: 35, EUR: 40, USD: 49 },
        3: { GBP: 49, EUR: 59, USD: 69 },
        5: { GBP: 79, EUR: 95, USD: 109 }
      }
    },
    '6m': {
      title: '6 Months Pass',
      durationMonths: 6,
      pricing: {
        1: { GBP: 40, EUR: 47, USD: 55 },
        2: { GBP: 59, EUR: 69, USD: 79 },
        3: { GBP: 79, EUR: 95, USD: 109 },
        5: { GBP: 129, EUR: 149, USD: 179 }
      }
    },
    '12m': {
      title: '12 Months Ultimate Pass (Best Value)',
      durationMonths: 12,
      pricing: {
        1: { GBP: 65, EUR: 76, USD: 89 },
        2: { GBP: 99, EUR: 115, USD: 135 },
        3: { GBP: 129, EUR: 149, USD: 179 },
        5: { GBP: 199, EUR: 229, USD: 269 }
      }
    }
  }
};

let checkoutState = {
  planId: '12m',
  devices: 1,
  currency: 'GBP',
  adultIncluded: false,
  serverRegion: 'UK / Europe Supernode',
  deviceType: 'Amazon FireStick 4K',
  promoCode: '',
  discountPercent: 0
};

let appSettings = {
  paypal_email: 'wasifali740@gmail.com',
  paypal_client_id: 'sb',
  paypal_environment: 'live'
};

document.addEventListener('DOMContentLoaded', async () => {
  parseQueryParams();
  initCheckoutEvents();
  await loadAppSettings();
  updateOrderSummary();

  const urlParams = new URLSearchParams(window.location.search);
  const promoParam = urlParams.get('promo');
  const renewParam = urlParams.get('renew');
  const initialCode = promoParam ? promoParam.trim().toUpperCase() : (renewParam === 'true' ? 'VIP-RENEW-15' : '');
  if (initialCode) {
    await validateAndApplyCoupon(initialCode, false);
  }
});

async function validateAndApplyCoupon(code, isSilent = false) {
  const promoInput = document.getElementById('promo_code_input');
  if (!code || !code.trim()) {
    checkoutState.promoCode = '';
    checkoutState.discountPercent = 0;
    if (promoInput) promoInput.value = '';
    updateOrderSummary();
    return false;
  }

  const cleanCode = code.trim().toUpperCase();
  const plan = CHECKOUT_PRICING.plans[checkoutState.planId] || CHECKOUT_PRICING.plans['12m'];
  const devCount = [1, 2, 3, 5].includes(checkoutState.devices) ? checkoutState.devices : 1;
  const currCode = checkoutState.currency || 'GBP';
  const basePrice = (plan.pricing && plan.pricing[devCount] && plan.pricing[devCount][currCode])
    ? Number(plan.pricing[devCount][currCode]) : 65;

  try {
    const res = await fetch('/api/coupons/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: cleanCode,
        plan_id: checkoutState.planId,
        amount: basePrice
      })
    });
    const data = await res.json();
    if (res.ok && data.valid) {
      checkoutState.promoCode = data.code || cleanCode;
      if (data.discount_type === 'percentage') {
        checkoutState.discountPercent = Number(data.discount_value);
      } else {
        checkoutState.discountPercent = Math.round((Number(data.discount_amount) / basePrice) * 100);
      }
      if (promoInput) promoInput.value = checkoutState.promoCode;
      updateOrderSummary();
      if (!isSilent && window.showToast) {
        showToast(`🎉 Coupon "${checkoutState.promoCode}" applied! -${checkoutState.discountPercent}% Discount activated!`, 'success');
      }
      return true;
    } else {
      checkoutState.promoCode = '';
      checkoutState.discountPercent = 0;
      if (promoInput && !isSilent) promoInput.value = '';
      updateOrderSummary();
      const msg = data.message || 'Coupon code is invalid or inactive.';
      if (window.showToast) {
        showToast(`⚠️ Coupon "${cleanCode}" could not be applied: ${msg}`, 'error');
      }
      return false;
    }
  } catch (err) {
    console.warn('Coupon validation error:', err);
    checkoutState.promoCode = '';
    checkoutState.discountPercent = 0;
    updateOrderSummary();
    if (!isSilent && window.showToast) {
      showToast('Error validating coupon. Please try again.', 'error');
    }
    return false;
  }
}

async function loadAppSettings() {
  try {
    const res = await fetch('/api/public/config');
    if (res.ok) {
      const data = await res.json();
      appSettings = { ...appSettings, ...data };
    }
  } catch (e) {}

  try {
    const pRes = await fetch('/api/public/pricing');
    if (pRes.ok) {
      const pData = await pRes.json();
      if (pData && pData.plans) {
        if (pData.currencies) {
          CHECKOUT_PRICING.currencies = { ...CHECKOUT_PRICING.currencies, ...pData.currencies };
        }
        Object.keys(pData.plans).forEach(id => {
          const p = pData.plans[id];
          if (!CHECKOUT_PRICING.plans[id]) {
            CHECKOUT_PRICING.plans[id] = { durationMonths: p.duration_months || 12 };
          }
          const tgt = CHECKOUT_PRICING.plans[id];
          if (p.title) tgt.title = p.title;
          if (p.duration_months) tgt.durationMonths = parseInt(p.duration_months, 10);
          tgt.extra_months = p.extra_months !== undefined ? parseInt(p.extra_months, 10) : 0;
          if (p.pricing) tgt.pricing = p.pricing;
          if (p.previous_pricing) tgt.previous_pricing = p.previous_pricing;
          if (p.badge) tgt.badge = p.badge;
        });
        updateOrderSummary();
      }
    }
  } catch (e) {}
}

function parseQueryParams() {
  const urlParams = new URLSearchParams(window.location.search);
  const planParam = urlParams.get('plan');
  const devicesParam = urlParams.get('devices');
  const currParam = urlParams.get('curr');
  const promoParam = urlParams.get('promo');
  const discountParam = urlParams.get('discount');
  const renewParam = urlParams.get('renew');

  if (planParam && CHECKOUT_PRICING.plans[planParam]) {
    checkoutState.planId = planParam;
  }
  if (devicesParam && [1, 2, 3, 5].includes(parseInt(devicesParam, 10))) {
    checkoutState.devices = parseInt(devicesParam, 10);
  }
  if (currParam && CHECKOUT_PRICING.currencies[currParam.toUpperCase()]) {
    checkoutState.currency = currParam.toUpperCase();
  }

  // Handle return from PayPal
  const paymentStatus = urlParams.get('payment');
  const returnEmail = urlParams.get('email');
  const returnOrdId = urlParams.get('orderID');
  if (paymentStatus === 'success') {
    localStorage.setItem('ps_payment_status', JSON.stringify({ status: 'success', orderID: returnOrdId, email: returnEmail, time: Date.now() }));
    fetch('/api/orders/confirm-direct', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderID: returnOrdId, email: returnEmail })
    }).then(r => r.json()).then(data => {
      if (data.success && data.status === 'PAID') {
        showOrderSuccessModal('Valued Subscriber', returnEmail || '', 'PayPal Live Direct');
        if (window.showToast) showToast('🎉 Payment Confirmed! Your IPTV Line is Active.', 'success');
      } else {
        if (window.showToast) showToast('❌ Payment Failed - Please try again', 'error');
      }
    }).catch(() => {
      if (window.showToast) showToast('❌ Payment Failed - Please try again', 'error');
    });
  } else if (paymentStatus === 'cancelled') {
    localStorage.setItem('ps_payment_status', JSON.stringify({ status: 'cancelled', time: Date.now() }));
    if (window.showToast) showToast('❌ Payment Failed - Please try again (Payment was cancelled)', 'error');
    setTimeout(() => {
      try { window.close(); } catch(e) {}
    }, 1000);
  }

  const initialCode = promoParam ? promoParam.trim().toUpperCase() : (renewParam === 'true' ? 'VIP-RENEW-15' : '');
  const promoInput = document.getElementById('promo_code_input');
  if (promoInput && initialCode) {
    promoInput.value = initialCode;
  }

  const planRadio = document.querySelector(`input[name="checkout_plan"][value="${checkoutState.planId}"]`);
  if (planRadio) planRadio.checked = true;

  const deviceSelect = document.getElementById('checkout_devices');
  if (deviceSelect) deviceSelect.value = checkoutState.devices.toString();

  const currSelect = document.getElementById('checkout_currency');
  if (currSelect) currSelect.value = checkoutState.currency;
}

function initCheckoutEvents() {
  document.querySelectorAll('input[name="checkout_plan"]').forEach(radio => {
    radio.addEventListener('change', async (e) => {
      checkoutState.planId = e.target.value;
      updateOrderSummary();
      if (checkoutState.promoCode) {
        await validateAndApplyCoupon(checkoutState.promoCode, true);
      }
    });
  });

  // Promo Code Apply Button
  const btnApplyPromo = document.getElementById('btn_apply_promo');
  const promoInput = document.getElementById('promo_code_input');
  if (btnApplyPromo && promoInput) {
    btnApplyPromo.addEventListener('click', async () => {
      const code = promoInput.value.trim().toUpperCase();
      if (!code) {
        if (window.showToast) showToast('Please enter a valid coupon code.', 'error');
        return;
      }
      btnApplyPromo.disabled = true;
      try {
        await validateAndApplyCoupon(code, false);
      } finally {
        btnApplyPromo.disabled = false;
      }
    });

    promoInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        btnApplyPromo.click();
      }
    });
  }

  const devSelect = document.getElementById('checkout_devices');
  if (devSelect) {
    devSelect.addEventListener('change', async (e) => {
      checkoutState.devices = parseInt(e.target.value, 10);
      updateOrderSummary();
      if (checkoutState.promoCode) {
        await validateAndApplyCoupon(checkoutState.promoCode, true);
      }
    });
  }

  const currSelect = document.getElementById('checkout_currency');
  if (currSelect) {
    currSelect.addEventListener('change', async (e) => {
      checkoutState.currency = e.target.value;
      updateOrderSummary();
      if (checkoutState.promoCode) {
        await validateAndApplyCoupon(checkoutState.promoCode, true);
      }
    });
  }

  const adultToggle = document.getElementById('checkout_adult_toggle');
  if (adultToggle) {
    adultToggle.addEventListener('change', (e) => {
      checkoutState.adultIncluded = e.target.checked;
      updateOrderSummary();
    });
  }

  const regionSelect = document.getElementById('checkout_server_region');
  if (regionSelect) {
    regionSelect.addEventListener('change', (e) => {
      checkoutState.serverRegion = e.target.value;
      updateOrderSummary();
    });
  }

  const devTypeSelect = document.getElementById('checkout_device_type');
  if (devTypeSelect) {
    devTypeSelect.addEventListener('change', (e) => {
      checkoutState.deviceType = e.target.value;
      updateOrderSummary();
    });
  }

  const webOrderForm = document.getElementById('web-order-form');
  if (webOrderForm) {
    webOrderForm.addEventListener('submit', handleWebOrderSubmit);
  }

  const paypalForm = document.getElementById('paypal-instant-form');
  if (paypalForm) {
    paypalForm.addEventListener('submit', handlePayPalOrderSubmit);
  }
}

function calculateCurrentPrice() {
  const plan = CHECKOUT_PRICING.plans[checkoutState.planId] || CHECKOUT_PRICING.plans['12m'];
  const devCount = [1, 2, 3, 5].includes(checkoutState.devices) ? checkoutState.devices : 1;
  const currCode = checkoutState.currency || 'GBP';
  const curr = CHECKOUT_PRICING.currencies[currCode] || CHECKOUT_PRICING.currencies.GBP;

  const basePrice = (plan.pricing && plan.pricing[devCount] && plan.pricing[devCount][currCode])
    ? Number(plan.pricing[devCount][currCode])
    : (plan.pricing && plan.pricing[1] && plan.pricing[1][currCode] ? Number(plan.pricing[1][currCode]) : 65);
  const singlePrice = (plan.pricing && plan.pricing[1] && plan.pricing[1][currCode]) ? Number(plan.pricing[1][currCode]) : basePrice;
  
  let originalPrice = singlePrice * devCount;
  let hasCutPrice = false;

  if (plan.previous_pricing && plan.previous_pricing[devCount] && plan.previous_pricing[devCount][currCode]) {
    const prevCut = Number(plan.previous_pricing[devCount][currCode]);
    if (prevCut > basePrice) {
      originalPrice = prevCut;
      hasCutPrice = true;
    }
  }

  let finalTotal = basePrice;
  if (checkoutState.discountPercent > 0) {
    finalTotal = basePrice * (1 - (checkoutState.discountPercent / 100));
  }

  const hasMultiScreenDiscount = devCount > 1 && (singlePrice * devCount) > basePrice;
  const hasAnyDiscount = (checkoutState.discountPercent > 0) || hasMultiScreenDiscount || hasCutPrice;
  const originalDisplayTotal = (checkoutState.discountPercent > 0) ? (originalPrice > basePrice ? originalPrice : basePrice) : originalPrice;
  const totalSavings = originalDisplayTotal - finalTotal;

  const extraMonths = plan.extra_months ? Number(plan.extra_months) : 0;
  const baseMonths = plan.durationMonths || 12;
  const totalMonths = baseMonths + extraMonths;
  const monthlyBreakdown = totalMonths > 0 ? (finalTotal / totalMonths) : (finalTotal / baseMonths);

  return {
    symbol: curr.symbol,
    totalRaw: parseFloat(finalTotal.toFixed(2)),
    total: (finalTotal % 1 === 0) ? finalTotal.toFixed(0) : finalTotal.toFixed(2),
    originalTotal: (originalDisplayTotal % 1 === 0) ? originalDisplayTotal.toFixed(0) : originalDisplayTotal.toFixed(2),
    savings: (totalSavings % 1 === 0) ? totalSavings.toFixed(0) : totalSavings.toFixed(2),
    monthly: monthlyBreakdown.toFixed(2),
    planTitle: plan.title,
    durationMonths: plan.durationMonths,
    extraMonths: extraMonths,
    baseMonths: baseMonths,
    totalMonths: totalMonths,
    hasDiscount: hasAnyDiscount,
    hasMultiScreenDiscount: hasMultiScreenDiscount,
    hasCutPrice: hasCutPrice,
    hasPromoDiscount: checkoutState.discountPercent > 0,
    discountPercent: checkoutState.discountPercent,
    promoCode: checkoutState.promoCode
  };
}

function updateOrderSummary() {
  const pricing = calculateCurrentPrice();

  const summaryPlanTitle = document.getElementById('summary_plan_title');
  const summaryDevices = document.getElementById('summary_devices');
  const summaryTotal = document.getElementById('summary_total');
  const summaryMonthly = document.getElementById('summary_monthly');
  const summaryAdult = document.getElementById('summary_adult');
  const summaryRegion = document.getElementById('summary_region');

  if (summaryPlanTitle) {
    if (pricing.extraMonths > 0) {
      summaryPlanTitle.innerHTML = `${pricing.planTitle} <span class="block text-[11px] text-amber-400 font-bold mt-0.5">🎁 Includes +${pricing.extraMonths} Extra Months Free (${pricing.totalMonths} Months Total)</span>`;
    } else {
      summaryPlanTitle.textContent = pricing.planTitle;
    }
  }
  if (summaryDevices) summaryDevices.textContent = `${checkoutState.devices} Active Screen${checkoutState.devices > 1 ? 's' : ''}`;
  
  if (summaryTotal) {
    if (pricing.hasDiscount) {
      let promoTag = '';
      if (pricing.hasPromoDiscount) {
        let safePromoCode = pricing.promoCode ? pricing.promoCode.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') : '';
        promoTag = `<span class="block text-[11px] text-emerald-400 font-bold mt-0.5">🎁 Promo ${safePromoCode} (-${pricing.discountPercent}%) Applied</span>`;
      } else if (pricing.hasMultiScreenDiscount) {
        promoTag = `<span class="block text-[11px] text-emerald-400 font-bold mt-0.5">✨ Multi-Screen Bundle Savings: Save ${pricing.symbol}${pricing.savings}</span>`;
      }
      summaryTotal.innerHTML = `
        <span class="line-through text-slate-500 text-sm mr-2">${pricing.symbol}${pricing.originalTotal}</span>
        <span class="text-emerald-400 font-black">${pricing.symbol}${pricing.total} ${checkoutState.currency}</span>
        ${promoTag}
      `;
    } else {
      summaryTotal.textContent = `${pricing.symbol}${pricing.total} ${checkoutState.currency}`;
    }
  }

  if (summaryMonthly) summaryMonthly.textContent = `(${pricing.symbol}${pricing.monthly}/mo)`;
  if (summaryAdult) summaryAdult.textContent = checkoutState.adultIncluded ? '✅ Included (PIN Protected)' : '❌ Excluded (Safe Family Mode)';
  if (summaryRegion) summaryRegion.textContent = checkoutState.serverRegion;

  const waBtn = document.getElementById('btn_order_whatsapp');
  if (waBtn) {
    const promoNote = pricing.hasDiscount ? `🎁 Promo Code Applied: ${pricing.promoCode} (-${pricing.discountPercent}% Discount)\n` : '';
    const waText = encodeURIComponent(
      `👋 Hello Luna Stream Support Team!\n\n` +
      `I would like to order an IPTV Subscription with the following options:\n` +
      `📦 Package: ${pricing.planTitle}\n` +
      `📺 Connections: ${checkoutState.devices} Device(s)\n` +
      `💰 Total Price: ${pricing.symbol}${pricing.total} ${checkoutState.currency}\n` +
      promoNote +
      `🔞 18+ Adult Channels: ${checkoutState.adultIncluded ? 'Yes, Include' : 'No, Exclude'}\n` +
      `🌍 Preferred Server: ${checkoutState.serverRegion}\n` +
      `📱 My Device Type: ${checkoutState.deviceType}\n\n` +
      `Please provide payment details (Crypto, Card, or PayPal) and activation credentials. Thank you!`
    );
    waBtn.href = `https://wa.me/${SUPPORT_WHATSAPP_NUMBER}?text=${waText}`;
  }

  const tgBtn = document.getElementById('btn_order_telegram');
  if (tgBtn) {
    const tgText = encodeURIComponent(
      `Hello Luna Stream! I want to order: ${pricing.planTitle} (${checkoutState.devices} Dev, ${pricing.symbol}${pricing.total} ${checkoutState.currency}). Server: ${checkoutState.serverRegion}. Device: ${checkoutState.deviceType}.`
    );
    tgBtn.href = `https://t.me/${SUPPORT_TELEGRAM_HANDLE}?text=${tgText}`;
  }
}

// =========================================================================
// BULLETPROOF PAYMENT SYSTEM: NATIVE DARK CARD & PAYPAL WALLET
// =========================================================================
let currentPayPalSDKCurrency = '';
let currentPayPalSDKClientId = '';
let currentPaymentTab = 'card';

window.switchPaymentTab = function(tab) {
  currentPaymentTab = tab;
  const tabCard = document.getElementById('tab-btn-card');
  const tabPaypal = document.getElementById('tab-btn-paypal');
  const contentCard = document.getElementById('tab-content-card');
  const contentPaypal = document.getElementById('tab-content-paypal');

  if (tab === 'card') {
    tabCard.className = 'flex-1 py-2.5 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all bg-blue-600/10 text-blue-400 border border-blue-500/30';
    tabPaypal.className = 'flex-1 py-2.5 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all text-slate-400 hover:text-white';
    contentCard.classList.remove('hidden');
    contentPaypal.classList.add('hidden');
  } else {
    tabPaypal.className = 'flex-1 py-2.5 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all bg-[#003087]/20 text-blue-300 border border-blue-500/30';
    tabCard.className = 'flex-1 py-2.5 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all text-slate-400 hover:text-white';
    contentPaypal.classList.remove('hidden');
    contentCard.classList.add('hidden');
    updateModalPricing();
  }
};

window.triggerPayPalCheckout = function() {
  openPayPalCheckoutModal();
};

window.resetPayPalModalToForm = function() {
  if (paypalPollingInterval) {
    clearInterval(paypalPollingInterval);
    paypalPollingInterval = null;
  }
  if (window._cleanupPayPalListeners) {
    window._cleanupPayPalListeners();
  }

  const formView = document.getElementById('paypal_form_view');
  const processingView = document.getElementById('paypal_processing_view');
  const failureView = document.getElementById('paypal_failure_view');
  const ssView = document.getElementById('paypal_whatsapp_ss_view');

  if (formView) formView.classList.remove('hidden');
  if (processingView) processingView.classList.add('hidden');
  if (failureView) failureView.classList.add('hidden');
  if (ssView) ssView.classList.add('hidden');

  showCardError('');
  initCardFormatters();
  updateModalPricing();
};

function updateModalPricing() {
  const modal = document.getElementById('paypal-checkout-modal');
  if (!modal) return;

  const pricing = calculateCurrentPrice();
  const planEl = modal.querySelector('#paypal_modal_plan');
  const devicesEl = modal.querySelector('#paypal_modal_devices');
  const totalEl = modal.querySelector('#paypal_modal_total');
  const cardBtnAmount = modal.querySelector('#card_btn_amount_display');
  const ppTabAmount = modal.querySelector('#paypal_tab_amount_display');

  if (planEl) planEl.textContent = pricing.planTitle;
  if (devicesEl) devicesEl.textContent = `${checkoutState.devices} Active Screen${checkoutState.devices > 1 ? 's' : ''}`;
  if (totalEl) totalEl.textContent = `${pricing.symbol}${pricing.total} ${checkoutState.currency}`;
  if (cardBtnAmount) cardBtnAmount.textContent = `${pricing.symbol}${pricing.total} ${checkoutState.currency}`;
  if (ppTabAmount) ppTabAmount.textContent = `${pricing.symbol}${pricing.total} ${checkoutState.currency}`;
}

window.openPayPalCheckoutModal = async function() {
  const modal = document.getElementById('paypal-checkout-modal');
  if (!modal) return;

  resetPayPalModalToForm();

  // Pre-fill name and email from main form
  const orderName = document.getElementById('order_name')?.value;
  const orderEmail = document.getElementById('order_email')?.value;
  const custNameInp = modal.querySelector('#paypal_cust_name');
  const custEmailInp = modal.querySelector('#paypal_cust_email');
  const cardHolderInp = modal.querySelector('#card_holder_name');

  if (custNameInp && orderName && !custNameInp.value) custNameInp.value = orderName;
  if (custEmailInp && orderEmail && !custEmailInp.value) custEmailInp.value = orderEmail;
  if (cardHolderInp && orderName && !cardHolderInp.value) cardHolderInp.value = orderName;

  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';

  loadPayPalWalletSDK();
};

window.closePayPalModal = function() {
  if (paypalPollingInterval) {
    clearInterval(paypalPollingInterval);
    paypalPollingInterval = null;
  }
  if (window._cleanupPayPalListeners) {
    window._cleanupPayPalListeners();
  }
  const modal = document.getElementById('paypal-checkout-modal');
  if (modal) {
    modal.classList.add('hidden');
    document.body.style.overflow = '';
  }
};

// -------------------------------------------------------------------------
// 1. NATIVE DEBIT / CREDIT CARD FORMATTERS & SUBMISSION
// -------------------------------------------------------------------------
function initCardFormatters() {
}

window.handleDirectCardPaymentSubmit = function() {
    showToast('Card payments are not currently available. Please use PayPal.', 'error');
};

function showCardError(msg) {
  const errBox = document.getElementById('card-field-errors');
  if (!errBox) return;
  if (!msg) {
    errBox.textContent = '';
    errBox.classList.add('hidden');
  } else {
    errBox.textContent = msg;
    errBox.classList.remove('hidden');
  }
}

function setCardButtonLoading(isLoading) {
  const btn = document.getElementById('btn_submit_card_pay');
  const spinner = document.getElementById('btn_card_spinner');
  const text = document.getElementById('btn_card_text');

  if (!btn) return;
  btn.disabled = isLoading;
  if (isLoading) {
    btn.classList.add('opacity-80', 'cursor-not-allowed');
    spinner?.classList.remove('hidden');
    if (text) text.innerHTML = '🔒 Contacting Bank Gateway...';
  } else {
    btn.classList.remove('opacity-80', 'cursor-not-allowed');
    spinner?.classList.add('hidden');
    const pricing = calculateCurrentPrice();
    if (text) text.innerHTML = `🔒 Pay <span id="card_btn_amount_display">${pricing.symbol}${pricing.total} ${checkoutState.currency}</span> with Card`;
  }
}

// -------------------------------------------------------------------------
// 2. OFFICIAL PAYPAL WALLET SDK INTEGRATION
// -------------------------------------------------------------------------
async function loadPayPalWalletSDK() {
  const curr = (checkoutState.currency || 'GBP').toUpperCase();
  let clientId = (appSettings?.paypal_client_id || '').trim();
  
  // Use official public client ID if not configured yet
  if (!clientId || clientId === 'sb') {
    clientId = 'test';
  }

  // If already loaded with exact configuration
  if (window.paypal && window.paypal.Buttons && currentPayPalSDKCurrency === curr && currentPayPalSDKClientId === clientId) {
    renderPayPalWalletButtons();
    return;
  }

  // Fast Fallback Timer: if network/SDK takes > 1.5s, provide instant direct button
  const fallbackTimer = setTimeout(() => {
    const loadingEl = document.getElementById('paypal-button-loading');
    if (loadingEl && (!window.paypal || !window.paypal.Buttons)) {
      const pricing = calculateCurrentPrice();
      loadingEl.innerHTML = `
        <button type="button" onclick="executeDirectPayPalWalletPay()" class="w-full py-4 rounded-xl bg-[#ffc439] hover:bg-[#f2ba36] text-[#003087] font-black text-sm flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(255,196,57,0.35)] transition-all transform active:scale-98 cursor-pointer">
          <span class="text-xl">🅿️</span>
          <span class="font-extrabold text-base">Pay with PayPal (${pricing.symbol}${pricing.total} ${curr})</span>
        </button>
      `;
    }
  }, 1500);

  const existingScript = document.getElementById('paypal-sdk-script');
  if (existingScript) existingScript.remove();

  const script = document.createElement('script');
  script.id = 'paypal-sdk-script';
  script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&currency=${encodeURIComponent(curr)}&intent=capture&components=buttons,funding-eligibility`;
  script.async = true;

  script.onload = () => {
    clearTimeout(fallbackTimer);
    currentPayPalSDKCurrency = curr;
    currentPayPalSDKClientId = clientId;
    renderPayPalWalletButtons();
  };

  script.onerror = () => {
    clearTimeout(fallbackTimer);
    console.warn('PayPal JS SDK failed to load.');
    const container = document.getElementById('paypal-button-container');
    if (container) {
      const pricing = calculateCurrentPrice();
      container.innerHTML = `
        <button type="button" onclick="executePayPalDirectLoginCheckout()" class="w-full py-4 rounded-xl bg-[#ffc439] hover:bg-[#f2ba36] text-[#003087] font-black text-sm flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(255,196,57,0.35)] transition-all transform active:scale-98 cursor-pointer">
          <span class="text-xl">🅿️</span>
          <span class="font-extrabold text-base">Pay with PayPal (${pricing.symbol}${pricing.total} ${curr})</span>
        </button>
      `;
    }
  };

  document.head.appendChild(script);
}

function renderPayPalWalletButtons() {
  const container = document.getElementById('paypal-button-container');
  if (!container) return;

  if (!window.paypal || !window.paypal.Buttons) {
    loadPayPalWalletSDK();
    return;
  }

  container.innerHTML = '';

  try {
    window.paypal.Buttons({
      style: {
        layout: 'vertical',
        color: 'gold',
        shape: 'rect',
        label: 'paypal',
        height: 44,
        tagline: false
      },
      onClick: (data, actions) => {
        const emailInp = document.getElementById('paypal_cust_email');
        const emailVal = emailInp?.value.trim();

        if (!emailVal || !emailVal.includes('@')) {
          if (window.showToast) showToast('⚠️ Please enter a delivery email above before continuing.', 'error');
          emailInp?.focus();
          return actions.reject();
        }
        return actions.resolve();
      },
      createOrder: async (data, actions) => {
        const name = document.getElementById('paypal_cust_name')?.value.trim() || 'Valued Customer';
        const email = document.getElementById('paypal_cust_email')?.value.trim() || '';
        const pricing = calculateCurrentPrice();
        const curr = (checkoutState.currency || 'GBP').toUpperCase();

        return actions.order.create({
          intent: 'CAPTURE',
          purchase_units: [{
            description: `${pricing.planTitle} (${checkoutState.devices} Active Screen${checkoutState.devices > 1 ? 's' : ''}) - Luna Stream IPTV`,
            amount: {
              currency_code: curr,
              value: pricing.total.toString()
            }
          }],
          application_context: {
            brand_name: appSettings?.brand_name || 'Luna Stream IPTV',
            shipping_preference: 'NO_SHIPPING',
            user_action: 'PAY_NOW'
          }
        });
      },
      onApprove: async (data, actions) => {
        const name = document.getElementById('paypal_cust_name')?.value.trim() || 'Valued Customer';
        const email = document.getElementById('paypal_cust_email')?.value.trim() || '';

        try {
          // Capture the real charge from the card / PayPal account
          const details = await actions.order.capture();

          if (details.status === 'COMPLETED') {
            // Update order database on backend
            try {
              await fetch(`/api/orders/${details.id}/capture`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  orderID: details.id,
                  customer_name: name,
                  customer_email: email,
                  capture_details: details
                })
              });
            } catch (e) {}

            closePayPalModal();
            showOrderSuccessModal(name, email, `Payment Verified (#${details.id})`);
            if (window.showToast) {
              showToast('🎉 Payment captured and verified! IPTV line credentials generated.', 'success');
            }
          } else {
            showToast('⚠️ Payment could not be completed. Please check your card details.', 'error');
          }
        } catch (err) {
          console.error('Capture error:', err);
          showToast('❌ Payment declined or could not be captured. Please check card balance.', 'error');
        }
      },
      onCancel: () => {
        showPayPalProcessingFailure('Payment was cancelled. You were not charged.', 'Payment Cancelled', { showAlreadyPaid: false });
      },
      onError: (err) => {
        console.warn('PayPal Smart Button API notice:', err);
        executePayPalDirectLoginCheckout();
      }
    }).render('#paypal-button-container');
  } catch (err) {
    console.error('Error rendering PayPal Buttons:', err);
  }
}

let paypalPollingInterval = null;

window.executePayPalDirectLoginCheckout = window.executePayPalPayment = window.executeDirectPayPalWalletPay = async function() {
  const emailInp = document.getElementById('paypal_cust_email');
  const nameInp = document.getElementById('paypal_cust_name');
  let email = emailInp?.value.trim() || '';
  const name = nameInp?.value.trim() || 'Valued Customer';

  // If email is empty, highlight field with red border
  if (!email || !email.includes('@')) {
    if (emailInp) {
      emailInp.classList.add('border-rose-500', 'ring-2', 'ring-rose-500/30');
      emailInp.focus();
      setTimeout(() => {
        emailInp.classList.remove('border-rose-500', 'ring-2', 'ring-rose-500/30');
      }, 3000);
    }
    if (window.showToast) showToast('⚠️ Please enter your delivery email address above first.', 'error');
    return;
  }

  const pricing = calculateCurrentPrice();
  const recipientEmail = (appSettings?.paypal_email || 'wasifali740@gmail.com').trim();
  const curr = (checkoutState.currency || 'GBP').toUpperCase();
  let localOrderId = 'ORD-' + Date.now();

  // Save pending order draft on server
  try {
    const res = await fetch('/api/orders/create-paypal-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer_name: name,
        customer_email: email,
        plan_id: checkoutState.planId,
        plan_title: pricing.planTitle,
        duration_months: pricing.totalMonths,
        devices_count: checkoutState.devices,
        currency: curr,
        total_amount: pricing.totalRaw,
        coupon_code: checkoutState.promoCode,
        adult_included: checkoutState.adultIncluded,
        server_region: checkoutState.serverRegion,
        device_type: checkoutState.deviceType
      })
    });
    const orderData = await res.json();
    if (orderData.localOrderId || orderData.orderID) {
      localOrderId = orderData.localOrderId || orderData.orderID;
    }
  } catch (e) {}

  let paypalUrl = '';
  let paypalMe = (appSettings?.paypal_me_link || 'https://paypal.me/adilfarooq909').trim();
  if (paypalMe) {
    if (!paypalMe.startsWith('http://') && !paypalMe.startsWith('https://')) {
      paypalMe = 'https://' + paypalMe;
    }
    paypalMe = paypalMe.replace(/\/+$/, '');
    paypalUrl = `${paypalMe}/${pricing.total}${curr}`;
  } else {
    const itemTitle = `Luna Stream IPTV - ${pricing.planTitle} (${checkoutState.devices} Screen${checkoutState.devices > 1 ? 's' : ''})`;
    const returnUrl = encodeURIComponent(`${window.location.origin}/checkout.html?payment=success&email=${encodeURIComponent(email)}&orderID=${encodeURIComponent(localOrderId)}`);
    const cancelUrl = encodeURIComponent(`${window.location.origin}/checkout.html?payment=cancelled`);
    paypalUrl = `https://www.paypal.com/cgi-bin/webscr?cmd=_xclick&business=${encodeURIComponent(recipientEmail)}&item_name=${encodeURIComponent(itemTitle)}&amount=${encodeURIComponent(pricing.total)}&currency_code=${encodeURIComponent(curr)}&custom=${encodeURIComponent(localOrderId)}&no_shipping=1&no_note=1&return=${returnUrl}&cancel_return=${cancelUrl}`;
  }

  // 1. OPEN PAYPAL IN A NEW TAB & TRACK WINDOW
  const paypalWindow = window.open(paypalUrl, '_blank');
  window._currentActivePaypalWindow = paypalWindow;
  window._currentPayPalOrderId = localOrderId;

  if (paypalWindow) {
    if (window.showToast) showToast('🚀 PayPal opened in a new tab!', 'info');
  } else {
    if (window.showToast) showToast('⚠️ Pop-up blocked! Please click Re-open to open PayPal.', 'warning');
  }

  // 2. Show Processing Sub-View
  const formView = document.getElementById('paypal_form_view');
  const processingView = document.getElementById('paypal_processing_view');
  const failureView = document.getElementById('paypal_failure_view');
  const reopenBtn = document.getElementById('btn_reopen_paypal_tab');

  if (formView) formView.classList.add('hidden');
  if (failureView) failureView.classList.add('hidden');
  if (processingView) processingView.classList.remove('hidden');
  if (reopenBtn) {
    reopenBtn.onclick = () => {
      const w = window.open(paypalUrl, '_blank');
      window._currentActivePaypalWindow = w;
    };
  }

  // Helper to query order status from server
  const checkServerPaymentStatus = async () => {
    try {
      const chk = await fetch(`/api/orders/check-status?orderID=${encodeURIComponent(localOrderId)}&email=${encodeURIComponent(email)}`);
      if (chk.ok) {
        const chkData = await chk.json();
        const isPaid = chkData.paid === true || chkData.status === 'PAID' || (chkData.order && (chkData.order.payment_status === 'PAID' || chkData.order.status === 'Active'));
        if (isPaid) {
          if (window._cleanupPayPalListeners) window._cleanupPayPalListeners();
          closePayPalModal();
          showOrderSuccessModal(name, email, 'PayPal Live Direct');
          if (window.showToast) showToast('🎉 Payment verified! Your IPTV line is generated.', 'success');
          return true;
        }
      }
    } catch (e) {}
    return false;
  };

  // Cross-Tab Cancellation Signal Listener (via localStorage)
  const storageListener = (e) => {
    if (e.key === 'ps_payment_status') {
      try {
        const data = JSON.parse(e.newValue || '{}');
        if (data.status === 'cancelled') {
          if (window._cleanupPayPalListeners) window._cleanupPayPalListeners();
          showPayPalProcessingFailure(
            'Payment was cancelled on PayPal. If you already sent the payment directly, click "I Completed Payment" below to send your screenshot on WhatsApp.',
            'Payment Cancelled',
            { showAlreadyPaid: true, orderId: localOrderId, email: email, name: name }
          );
        } else if (data.status === 'success') {
          if (window._cleanupPayPalListeners) window._cleanupPayPalListeners();
          closePayPalModal();
          showOrderSuccessModal(name, email, 'PayPal Live Direct');
          if (window.showToast) showToast('🎉 Payment verified! Your IPTV line is generated.', 'success');
        }
      } catch (err) {}
    }
  };

  // Focus & Visibility Return Listener: detect window closure when customer returns to checkout tab
  let focusCheckTimer = null;
  const onWindowReturn = () => {
    if (window._currentActivePaypalWindow && window._currentActivePaypalWindow.closed) {
      if (focusCheckTimer) clearTimeout(focusCheckTimer);
      focusCheckTimer = setTimeout(async () => {
        const paid = await checkServerPaymentStatus();
        if (paid) return;

        if (window._cleanupPayPalListeners) window._cleanupPayPalListeners();
        showPayPalProcessingFailure(
          'The PayPal window was closed before completing payment. If you already sent the payment, click "I Completed Payment" below to send your screenshot on WhatsApp.',
          'Payment Incomplete / Cancelled',
          { showAlreadyPaid: true, orderId: localOrderId, email: email, name: name }
        );
      }, 500);
    }
  };

  window._cleanupPayPalListeners = () => {
    if (paypalPollingInterval) {
      clearInterval(paypalPollingInterval);
      paypalPollingInterval = null;
    }
    if (focusCheckTimer) clearTimeout(focusCheckTimer);
    window.removeEventListener('storage', storageListener);
    window.removeEventListener('focus', onWindowReturn);
    document.removeEventListener('visibilitychange', onWindowReturn);
  };

  window.addEventListener('storage', storageListener);
  window.addEventListener('focus', onWindowReturn);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') onWindowReturn();
  });

  // 3. Start Live Poller checking order status + Tab Closed Detector
  let pollCount = 0;
  let closedWindowTicks = 0;
  if (paypalPollingInterval) clearInterval(paypalPollingInterval);

  paypalPollingInterval = setInterval(async () => {
    pollCount++;

    // 1. Check server status first
    const paid = await checkServerPaymentStatus();
    if (paid) return;

    // 2. Active Tab Closed Detector: detects if customer closed the PayPal tab
    if (window._currentActivePaypalWindow && window._currentActivePaypalWindow.closed) {
      closedWindowTicks++;
      if (closedWindowTicks >= 2) {
        if (window._cleanupPayPalListeners) window._cleanupPayPalListeners();
        const finalPaid = await checkServerPaymentStatus();
        if (finalPaid) return;

        showPayPalProcessingFailure(
          'The PayPal window was closed before completing payment. If you already sent the payment, click "I Completed Payment" below to send your screenshot on WhatsApp.',
          'Payment Incomplete / Cancelled',
          { showAlreadyPaid: true, orderId: localOrderId, email: email, name: name }
        );
        return;
      }
    }

    // 3. Timeout safety after 5 minutes (250 polls * 1.2s = 300s)
    if (pollCount > 250) {
      if (window._cleanupPayPalListeners) window._cleanupPayPalListeners();
      showPayPalProcessingFailure(
        'Payment confirmation timed out. If you sent the payment, click "I Completed Payment" below to send your screenshot.',
        'Payment Incomplete',
        { showAlreadyPaid: true, orderId: localOrderId, email: email, name: name }
      );
    }
  }, 1200);
};

window.showPayPalScreenshotView = function(orderId, email, name) {
  if (paypalPollingInterval) {
    clearInterval(paypalPollingInterval);
    paypalPollingInterval = null;
  }
  if (window._cleanupPayPalListeners) {
    window._cleanupPayPalListeners();
  }

  const formView = document.getElementById('paypal_form_view');
  const processingView = document.getElementById('paypal_processing_view');
  const failureView = document.getElementById('paypal_failure_view');
  const ssView = document.getElementById('paypal_whatsapp_ss_view');

  if (formView) formView.classList.add('hidden');
  if (processingView) processingView.classList.add('hidden');
  if (failureView) failureView.classList.add('hidden');
  if (ssView) ssView.classList.remove('hidden');

  const ordId = orderId || window._currentPayPalOrderId || '';
  const eml = email || document.getElementById('paypal_cust_email')?.value || '';

  const orderIdEl = document.getElementById('ss_view_order_id');
  const emailEl = document.getElementById('ss_view_email');
  const waBtn = document.getElementById('btn_send_ss_whatsapp');

  if (orderIdEl) orderIdEl.textContent = ordId || 'LUNA-ORDER';
  if (emailEl) emailEl.textContent = eml || 'your email';

  const waNumber = (appSettings?.support_whatsapp || SUPPORT_WHATSAPP_NUMBER || '447413469398').replace(/[^0-9]/g, '');
  const waMsg = `Hello Luna Stream! I completed my PayPal payment for Order: ${ordId} (${eml}). Here is my payment screenshot for instant activation:`;
  const waUrl = `https://wa.me/${waNumber}?text=${encodeURIComponent(waMsg)}`;

  if (waBtn) {
    waBtn.href = waUrl;
  }
};

window.confirmManualDirectPayment = async function(orderId, email, name) {
  if (paypalPollingInterval) {
    clearInterval(paypalPollingInterval);
    paypalPollingInterval = null;
  }
  if (window._cleanupPayPalListeners) {
    window._cleanupPayPalListeners();
  }

  const custEmail = email || document.getElementById('paypal_cust_email')?.value || '';
  const custName = name || document.getElementById('paypal_cust_name')?.value || 'Valued Subscriber';
  const targetOrdId = orderId || window._currentPayPalOrderId || '';

  // Background notify server to set order to PENDING_VERIFICATION
  try {
    fetch('/api/orders/confirm-direct', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderID: targetOrdId, email: custEmail })
    });
  } catch (e) {}

  // Immediately present the WhatsApp screenshot verification view
  showPayPalScreenshotView(targetOrdId, custEmail, custName);

  if (window.showToast) {
    showToast('📸 Please send your PayPal payment screenshot on WhatsApp.', 'info');
  }
};

window.showPayPalProcessingFailure = function(msg, title, options = {}) {
  if (paypalPollingInterval) {
    clearInterval(paypalPollingInterval);
    paypalPollingInterval = null;
  }
  if (window._cleanupPayPalListeners) {
    window._cleanupPayPalListeners();
  }

  const formView = document.getElementById('paypal_form_view');
  const processingView = document.getElementById('paypal_processing_view');
  const failureView = document.getElementById('paypal_failure_view');
  const ssView = document.getElementById('paypal_whatsapp_ss_view');
  const failTitleEl = document.getElementById('paypal_failure_title');
  const failMsgEl = document.getElementById('paypal_failure_message');
  const failIconEl = document.getElementById('paypal_failure_icon');
  const alreadyPaidBtn = document.getElementById('btn_failure_already_paid');

  if (formView) formView.classList.add('hidden');
  if (processingView) processingView.classList.add('hidden');
  if (ssView) ssView.classList.add('hidden');
  if (failureView) failureView.classList.remove('hidden');

  if (failTitleEl) {
    failTitleEl.textContent = title || 'Payment Incomplete';
  }
  if (failMsgEl) {
    failMsgEl.textContent = msg || 'Payment was cancelled or closed before completion.';
  }

  // Always make "I Completed Payment" accessible so the user can send their screenshot
  if (alreadyPaidBtn) {
    alreadyPaidBtn.classList.remove('hidden');
    const ordId = (options && options.orderId) || window._currentPayPalOrderId || '';
    const eml = (options && options.email) || document.getElementById('paypal_cust_email')?.value || '';
    const nm = (options && options.name) || document.getElementById('paypal_cust_name')?.value || '';
    alreadyPaidBtn.onclick = () => {
      confirmManualDirectPayment(ordId, eml, nm);
    };
  }

  if (failIconEl) {
    if (title && title.toLowerCase().includes('cancelled')) {
      failIconEl.textContent = '❌';
      failIconEl.className = 'w-16 h-16 rounded-2xl bg-rose-500/20 text-rose-400 flex items-center justify-center text-3xl mx-auto border border-rose-500/30';
    } else {
      failIconEl.textContent = '⚠️';
      failIconEl.className = 'w-16 h-16 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center text-3xl mx-auto border border-amber-500/30';
    }
  }

  if (window.showToast) {
    showToast(msg || 'Payment was cancelled or not completed', 'warning');
  }
};

window.cancelPayPalWaiting = function() {
  if (window._currentActivePaypalWindow && !window._currentActivePaypalWindow.closed) {
    try { window._currentActivePaypalWindow.close(); } catch (e) {}
  }
  const email = document.getElementById('paypal_cust_email')?.value || '';
  const name = document.getElementById('paypal_cust_name')?.value || '';
  showPayPalProcessingFailure(
    'Payment was cancelled. If you already sent the payment directly, click "I Completed Payment" below to send your screenshot on WhatsApp.',
    'Payment Cancelled',
    { showAlreadyPaid: true, orderId: window._currentPayPalOrderId, email: email, name: name }
  );
};

async function handleWebOrderSubmit(e) {
  e.preventDefault();
  const form = e.target;
  const email = form.querySelector('#order_email')?.value || '';
  const fullName = form.querySelector('#order_name')?.value || 'Valued Customer';
  const paymentMethod = form.querySelector('input[name="payment_method"]:checked')?.value || 'PayPal';

  if (!email) {
    if (window.showToast) window.showToast('Please enter your delivery email address.', 'error');
    return;
  }

  const pricing = calculateCurrentPrice();
  const submitBtn = form.querySelector('#btn_submit_order');
  const originalHtml = submitBtn.innerHTML;
  submitBtn.disabled = true;
  submitBtn.innerHTML = `
    <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-black inline" fill="none" viewBox="0 0 24 24">
      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
    Reserving High-Speed Port in Database...
  `;

  const orderPayload = {
    customer_name: fullName,
    customer_email: email,
    plan_id: checkoutState.planId,
    plan_title: pricing.planTitle,
    duration_months: pricing.totalMonths,
    devices_count: checkoutState.devices,
    currency: checkoutState.currency,
    total_amount: pricing.totalRaw,
    coupon_code: checkoutState.promoCode,
    payment_method: paymentMethod,
    adult_included: checkoutState.adultIncluded,
    server_region: checkoutState.serverRegion,
    device_type: checkoutState.deviceType
  };

  try {
    const response = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(orderPayload)
    });
    const result = await response.json();
  } catch (err) {
    console.warn('Backend order recording fallback:', err);
  }

  setTimeout(() => {
    submitBtn.disabled = false;
    submitBtn.innerHTML = originalHtml;
    showOrderSuccessModal(fullName, email, paymentMethod);
  }, 1000);
}

function showOrderSuccessModal(fullName, email, paymentMethod, orderId) {
  const modal = document.getElementById('order-success-modal');
  if (!modal) {
    if (window.showToast) window.showToast(`Order received for ${email}! Check email for payment invoice & M3U credentials.`, 'success');
    return;
  }

  const nameEl = modal.querySelector('#modal_customer_name');
  const emailEl = modal.querySelector('#modal_customer_email');
  const payEl = modal.querySelector('#modal_pay_method');
  const titleEl = modal.querySelector('#order_success_title');
  const statusEl = modal.querySelector('#modal_status_text');
  const ssBanner = modal.querySelector('#order_success_ss_banner');
  const waBtn = modal.querySelector('#btn_modal_whatsapp');
  const waBtnText = modal.querySelector('#btn_modal_whatsapp_text');

  if (nameEl) nameEl.textContent = fullName;
  if (emailEl) emailEl.textContent = email;
  if (payEl) payEl.textContent = paymentMethod;

  const targetOrdId = orderId || window._currentPayPalOrderId || '';
  const waNumber = (appSettings?.support_whatsapp || SUPPORT_WHATSAPP_NUMBER || '447413469398').replace(/[^0-9]/g, '');

  const isManualVerification = paymentMethod && (paymentMethod.includes('Verification') || paymentMethod.includes('Pending') || paymentMethod.includes('Manual'));

  if (isManualVerification) {
    if (titleEl) titleEl.textContent = 'Order Placed - Screenshot Required';
    if (ssBanner) ssBanner.classList.remove('hidden');
    if (statusEl) {
      statusEl.textContent = 'Awaiting Screenshot on WhatsApp';
      statusEl.className = 'text-amber-400 font-bold';
    }
    const waMsg = `Hello Luna Stream! I completed my PayPal payment for Order: ${targetOrdId} (${email}). Here is my payment screenshot for instant activation:`;
    if (waBtn) waBtn.href = `https://wa.me/${waNumber}?text=${encodeURIComponent(waMsg)}`;
    if (waBtnText) waBtnText.textContent = '📲 Send Screenshot on WhatsApp';
  } else {
    if (titleEl) titleEl.textContent = 'Order Received & Port Reserved!';
    if (ssBanner) ssBanner.classList.add('hidden');
    if (statusEl) {
      statusEl.textContent = 'Dispatching M3U & Xtream API...';
      statusEl.className = 'text-blue-400 font-bold';
    }
    const waMsg = `Hello Luna Stream! I just paid via PayPal for Order: ${targetOrdId} (${email}) and want to speed up my line credentials.`;
    if (waBtn) waBtn.href = `https://wa.me/${waNumber}?text=${encodeURIComponent(waMsg)}`;
    if (waBtnText) waBtnText.textContent = 'Speed Up via WhatsApp';
  }

  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';

  startActivationTimer();
}

function startActivationTimer() {
  const timerEl = document.getElementById('activation-countdown');
  if (!timerEl) return;

  let secondsLeft = 300;
  const interval = setInterval(() => {
    secondsLeft--;
    if (secondsLeft <= 0) {
      clearInterval(interval);
      timerEl.textContent = "00:00 - Ready!";
      return;
    }
    const mins = Math.floor(secondsLeft / 60);
    const secs = secondsLeft % 60;
    timerEl.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }, 1000);
}

window.closeOrderModal = function() {
  const modal = document.getElementById('order-success-modal');
  if (modal) {
    modal.classList.add('hidden');
    document.body.style.overflow = '';
  }
};

