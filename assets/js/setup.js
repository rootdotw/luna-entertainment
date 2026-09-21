/**
 * Luna Stream IPTV - Device Setup Guides Interactive Tab & Copy Logic
 */

document.addEventListener('DOMContentLoaded', () => {
  initSetupTabs();
  initSetupTroubleshooting();
});

function initSetupTabs() {
  const tabButtons = document.querySelectorAll('.setup-tab-btn');
  const guideSections = document.querySelectorAll('.device-guide-content');

  if (!tabButtons.length || !guideSections.length) return;

  // Check URL hash for direct tab link e.g. setup.html#firestick
  function checkHashAndActivate() {
    const hash = window.location.hash.replace('#', '');
    if (hash) {
      const targetBtn = document.querySelector(`.setup-tab-btn[data-target="${hash}"]`);
      if (targetBtn) {
        activateTab(targetBtn, hash);
      }
    }
  }
  checkHashAndActivate();
  window.addEventListener('hashchange', checkHashAndActivate);

  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-target');
      activateTab(btn, targetId);
      window.location.hash = targetId;
    });
  });

  function activateTab(btn, targetId) {
    tabButtons.forEach(b => {
      b.classList.remove('active', 'border-blue-500', 'bg-blue-600/10', 'text-blue-400', 'border-cyan-400', 'bg-cyan-500/10', 'text-cyan-400', 'shadow-lg');
      b.classList.add('border-[#263247]', 'bg-[#101522]', 'text-slate-400');
    });

    btn.classList.remove('border-[#263247]', 'bg-[#101522]', 'text-slate-400');
    btn.classList.add('active', 'border-blue-500', 'bg-blue-600/10', 'text-blue-400', 'border-cyan-400', 'bg-cyan-500/10', 'text-cyan-400', 'shadow-lg');

    guideSections.forEach(section => {
      if (section.id === `guide-${targetId}`) {
        section.classList.remove('hidden');
        section.classList.add('block');
      } else {
        section.classList.add('hidden');
        section.classList.remove('block');
      }
    });
  }
}

function initSetupTroubleshooting() {
  const troubleButtons = document.querySelectorAll('.trouble-trigger');

  troubleButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const answer = btn.nextElementSibling;
      const icon = btn.querySelector('.trouble-icon');
      const isVisible = !answer.classList.contains('hidden');

      if (isVisible) {
        answer.classList.add('hidden');
        if (icon) icon.style.transform = 'rotate(0deg)';
      } else {
        answer.classList.remove('hidden');
        if (icon) icon.style.transform = 'rotate(180deg)';
      }
    });
  });
}

