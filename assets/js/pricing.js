/**
 * Luna Stream IPTV - Dynamic Pricing Calculator & Currency Selector Logic (GBP Primary)
 * Supports live dynamic catalog fetching from /api/public/pricing, strikethrough cut prices,
 * and promotional extra bonus months configured in the Admin Dashboard.
 */

const PRICING_DATA = {
  currencies: {
    GBP: { symbol: '£', suffix: 'GBP' },
    USD: { symbol: '$', suffix: 'USD' },
    EUR: { symbol: '€', suffix: 'EUR' }
  },
  plans: {
    '3m': {
      id: '3m',
      title: '3 Months Pass',
      duration: '3 Months',
      durationMonths: 3,
      extra_months: 0,
      badge: 'Starter Saver',
      popular: false,
      active: true,
      channels: '20,000+ 4K & UHD Channels',
      vod: '60,000+ Movies & Series',
      pricing: {
        1: { GBP: 25, EUR: 30, USD: 35 },
        2: { GBP: 35, EUR: 40, USD: 49 },
        3: { GBP: 49, EUR: 59, USD: 69 },
        5: { GBP: 79, EUR: 95, USD: 109 }
      },
      previous_pricing: {}
    },
    '6m': {
      id: '6m',
      title: '6 Months Pass',
      duration: '6 Months',
      durationMonths: 6,
      extra_months: 0,
      badge: 'Extended Saver',
      popular: false,
      active: true,
      channels: '20,000+ 4K & UHD Channels',
      vod: '60,000+ Movies & Series',
      pricing: {
        1: { GBP: 40, EUR: 47, USD: 55 },
        2: { GBP: 59, EUR: 69, USD: 79 },
        3: { GBP: 79, EUR: 95, USD: 109 },
        5: { GBP: 129, EUR: 149, USD: 179 }
      },
      previous_pricing: {}
    },
    '12m': {
      id: '12m',
      title: '12 Months Ultimate Pass',
      duration: '12 Months',
      durationMonths: 12,
      extra_months: 0,
      badge: '⭐ BEST VALUE',
      popular: true,
      active: true,
      channels: '20,000+ 4K & UHD Channels',
      vod: '60,000+ Movies & Series',
      pricing: {
        1: { GBP: 65, EUR: 76, USD: 89 },
        2: { GBP: 99, EUR: 115, USD: 135 },
        3: { GBP: 129, EUR: 149, USD: 179 },
        5: { GBP: 199, EUR: 229, USD: 269 }
      },
      previous_pricing: {}
    }
  }
};

let currentCurrency = 'GBP';
let currentDevices = 1;

document.addEventListener('DOMContentLoaded', () => {
  initPricingControls();
  renderAllPricing();
  fetchDynamicPricing();
});

async function fetchDynamicPricing() {
  try {
    const res = await fetch('/api/public/pricing');
    if (res.ok) {
      const data = await res.json();
      if (data && data.plans) {
        if (data.currencies) {
          PRICING_DATA.currencies = { ...PRICING_DATA.currencies, ...data.currencies };
        }
        Object.keys(data.plans).forEach(id => {
          const p = data.plans[id];
          if (!PRICING_DATA.plans[id]) {
            PRICING_DATA.plans[id] = { id: id };
          }
          const existing = PRICING_DATA.plans[id];
          existing.id = id;
          if (p.title) existing.title = p.title;
          if (p.duration_months) {
            existing.durationMonths = parseInt(p.duration_months, 10);
            existing.duration = `${p.duration_months} Months`;
          }
          existing.extra_months = p.extra_months !== undefined ? parseInt(p.extra_months, 10) : 0;
          if (p.badge) existing.badge = p.badge;
          if (p.popular !== undefined) existing.popular = p.popular;
          if (p.active !== undefined) existing.active = p.active;
          if (p.pricing) existing.pricing = p.pricing;
          if (p.previous_pricing) existing.previous_pricing = p.previous_pricing;
        });
        renderAllPricing();
      }
    }
  } catch (e) {
    // Offline or network error: fallback to default embedded catalog
  }
}

function initPricingControls() {
  // Currency buttons
  const currencyBtns = document.querySelectorAll('.currency-btn');
  currencyBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      currencyBtns.forEach(b => {
        b.classList.remove('active', 'bg-blue-600', 'text-white', 'shadow-sm', 'bg-cyan-500', 'text-black', 'shadow-cyan-500/50');
        b.classList.add('bg-[#101522]', 'border', 'border-[#263247]', 'text-slate-300');
      });
      
      btn.classList.remove('bg-[#101522]', 'border-[#263247]', 'text-slate-300', 'bg-slate-800');
      btn.classList.add('active', 'bg-blue-600', 'text-white', 'font-bold', 'shadow-sm');

      currentCurrency = btn.getAttribute('data-currency') || 'GBP';
      renderAllPricing();
      if (window.showToast) {
        showToast(`Currency updated to ${currentCurrency} (${PRICING_DATA.currencies[currentCurrency].symbol})`);
      }
    });
  });

  // Device selectors
  const deviceBtns = document.querySelectorAll('.device-btn');
  deviceBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      deviceBtns.forEach(b => {
        b.classList.remove('active', 'border-blue-500', 'bg-blue-600/10', 'text-blue-400', 'border-cyan-400', 'bg-cyan-500/10', 'text-cyan-400');
        b.classList.add('border-[#263247]', 'bg-[#101522]', 'text-slate-400');
      });

      btn.classList.remove('border-[#263247]', 'border-slate-700', 'bg-[#101522]', 'bg-slate-800/60', 'text-slate-400');
      btn.classList.add('active', 'border-blue-500', 'bg-blue-600/10', 'text-blue-400');

      currentDevices = parseInt(btn.getAttribute('data-devices') || '1', 10);
      renderAllPricing();
      if (window.showToast) {
        showToast(`Selected ${currentDevices} simultaneous connection${currentDevices > 1 ? 's' : ''}`);
      }
    });
  });
}

function calculatePlanPrice(planId, devices, currency) {
  const plan = PRICING_DATA.plans[planId] || PRICING_DATA.plans['12m'];
  const currInfo = PRICING_DATA.currencies[currency] || PRICING_DATA.currencies.GBP;
  const dev = [1, 2, 3, 5].includes(devices) ? devices : 1;

  const finalPrice = (plan.pricing && plan.pricing[dev] && plan.pricing[dev][currency] !== undefined)
    ? Number(plan.pricing[dev][currency])
    : (plan.pricing && plan.pricing[1] && plan.pricing[1][currency] !== undefined ? Number(plan.pricing[1][currency]) : 65);

  const singleScreenPrice = (plan.pricing && plan.pricing[1] && plan.pricing[1][currency] !== undefined)
    ? Number(plan.pricing[1][currency])
    : finalPrice;

  // Strikethrough / Cut price calculation
  let originalPrice = singleScreenPrice * dev;
  let hasCutPrice = false;

  if (plan.previous_pricing && plan.previous_pricing[dev] && plan.previous_pricing[dev][currency]) {
    const prevCut = Number(plan.previous_pricing[dev][currency]);
    if (prevCut > finalPrice) {
      originalPrice = prevCut;
      hasCutPrice = true;
    }
  }

  const hasMultiScreenDiscount = dev > 1 && (singleScreenPrice * dev) > finalPrice;
  const hasDiscount = hasCutPrice || hasMultiScreenDiscount;
  const savings = Math.max(0, originalPrice - finalPrice);
  const discountPercent = (hasDiscount && originalPrice > 0) ? Math.round((savings / originalPrice) * 100) : 0;

  const extraMonths = plan.extra_months ? Number(plan.extra_months) : 0;
  const baseMonths = plan.durationMonths || 12;
  const totalMonths = baseMonths + extraMonths;
  const perMonth = totalMonths > 0 ? (finalPrice / totalMonths) : (finalPrice / baseMonths);

  return {
    raw: finalPrice,
    formatted: `${currInfo.symbol}${finalPrice.toFixed(finalPrice % 1 === 0 ? 0 : 2)}`,
    originalRaw: originalPrice,
    originalFormatted: `${currInfo.symbol}${originalPrice.toFixed(originalPrice % 1 === 0 ? 0 : 2)}`,
    hasDiscount: hasDiscount,
    savingsFormatted: `${currInfo.symbol}${savings.toFixed(savings % 1 === 0 ? 0 : 2)}`,
    discountPercent: discountPercent,
    extraMonths: extraMonths,
    baseMonths: baseMonths,
    totalMonths: totalMonths,
    perMonthRaw: perMonth,
    perMonthFormatted: `${currInfo.symbol}${perMonth.toFixed(2)}`,
    symbol: currInfo.symbol,
    currencyCode: currency,
    badge: plan.badge || ''
  };
}

function renderAllPricing() {
  const planKeys = Object.keys(PRICING_DATA.plans);

  planKeys.forEach(planId => {
    const calc = calculatePlanPrice(planId, currentDevices, currentCurrency);

    // Update total price element (with crossed-out previous price)
    const priceEl = document.querySelector(`[data-plan-price="${planId}"]`);
    if (priceEl) {
      if (calc.hasDiscount) {
        priceEl.innerHTML = `
          <span class="line-through text-slate-500 text-lg sm:text-xl font-bold mr-1.5">${calc.originalFormatted}</span>
          <span>${calc.formatted}</span>
          <span class="ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-black uppercase bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">Save ${calc.savingsFormatted} (-${calc.discountPercent}%)</span>
        `;
      } else {
        priceEl.textContent = calc.formatted;
      }
    }

    // Update per-month breakdown element
    const perMonthEl = document.querySelector(`[data-plan-permonth="${planId}"]`);
    if (perMonthEl) {
      perMonthEl.textContent = `${calc.perMonthFormatted}/mo`;
    }

    // Update extra bonus months container
    const extraEl = document.querySelector(`[data-plan-extra="${planId}"]`);
    if (extraEl) {
      if (calc.extraMonths > 0) {
        extraEl.innerHTML = `🎁 +${calc.extraMonths} Extra Months Free (${calc.totalMonths} Months Total)`;
        extraEl.classList.remove('hidden');
      } else {
        extraEl.classList.add('hidden');
      }
    }

    // Update connection count text
    const connEl = document.querySelector(`[data-plan-conn="${planId}"]`);
    if (connEl) {
      connEl.textContent = `${currentDevices} Simultaneous Screen${currentDevices > 1 ? 's' : ''}`;
    }

    // Update Checkout Button Links
    const urlParams = new URLSearchParams(window.location.search);
    const promo = urlParams.get('promo') || urlParams.get('discount') || '';
    const buyBtns = document.querySelectorAll(`[data-buy-plan="${planId}"]`);
    buyBtns.forEach(btn => {
      let href = `checkout.html?plan=${planId}&devices=${currentDevices}&curr=${currentCurrency}`;
      if (promo) href += `&promo=${encodeURIComponent(promo)}`;
      btn.href = href;
    });
  });
}

// Export for other scripts if required
window.PRICING_DATA = PRICING_DATA;
window.calculatePlanPrice = calculatePlanPrice;
window.renderAllPricing = renderAllPricing;
