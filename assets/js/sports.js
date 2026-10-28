/**
 * Luna Stream IPTV - Real-Time Live Sports & PPV Match Center
 * Pulls live & upcoming fixtures automatically from official ESPN public scoreboard APIs
 * (Premier League, UEFA Champions League, LaLiga, Serie A, Bundesliga, UFC, F1, NBA, ATP Tennis)
 * with intelligent rolling fallback so every sport category is always fresh and never outdated.
 */

let SPORTS_EVENTS = [];
let activeSportsCategory = 'all';
let sportsTimerInterval = null;
let sportsAutoRefreshInterval = null;

const ESPN_ENDPOINTS = [
  {
    url: 'https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/scoreboard',
    category: 'football',
    league: '🏴󠁧󠁢󠁥󠁮󠁧󠁿 Premier League',
    league_color: 'from-purple-600 to-pink-600',
    channels: ['Sky Sports Premier League 4K', 'TNT Sports 1 4K', 'USA Network UHD'],
    quality: '4K UHD • 60 FPS • HDR'
  },
  {
    url: 'https://site.api.espn.com/apis/site/v2/sports/soccer/uefa.champions/scoreboard',
    category: 'football',
    league: '🏆 UEFA Champions League',
    league_color: 'from-blue-600 to-indigo-600',
    channels: ['TNT Sports Ultimate 4K', 'Paramount+ UHD', 'Canal+ Foot 4K'],
    quality: '4K UHD • 60 FPS • Dolby Atmos'
  },
  {
    url: 'https://site.api.espn.com/apis/site/v2/sports/soccer/esp.1/scoreboard',
    category: 'football',
    league: '🇪🇸 LaLiga EA Sports',
    league_color: 'from-red-600 to-amber-600',
    channels: ['Premier Sports 1 HD', 'Movistar LaLiga 4K', 'ESPN+ UHD'],
    quality: '4K UHD • 60 FPS'
  },
  {
    url: 'https://site.api.espn.com/apis/site/v2/sports/soccer/ita.1/scoreboard',
    category: 'football',
    league: '🇮🇹 Serie A Enilive',
    league_color: 'from-blue-700 to-cyan-600',
    channels: ['TNT Sports 2 4K', 'DAZN 1 4K', 'Paramount+ UHD'],
    quality: '4K UHD • 60 FPS'
  },
  {
    url: 'https://site.api.espn.com/apis/site/v2/sports/soccer/ger.1/scoreboard',
    category: 'football',
    league: '🇩🇪 Bundesliga',
    league_color: 'from-red-700 to-rose-600',
    channels: ['Sky Sports Football 4K', 'DAZN Bundesliga 4K', 'ESPN+ UHD'],
    quality: '4K UHD • 60 FPS'
  },
  {
    url: 'https://site.api.espn.com/apis/site/v2/sports/mma/ufc/scoreboard',
    category: 'ufc',
    league: '🥊 UFC Championship & Fight Night',
    league_color: 'from-red-600 to-amber-600',
    channels: ['TNT Sports Box Office 4K', 'ESPN+ PPV UHD', 'Sony LIV 4K'],
    quality: '4K UHD • PPV Included • Zero Delay'
  },
  {
    url: 'https://site.api.espn.com/apis/site/v2/sports/racing/f1/scoreboard',
    category: 'f1',
    league: '🏎️ Formula 1 World Championship',
    league_color: 'from-red-600 to-red-800',
    channels: ['Sky Sports F1 4K UHD', 'F1 TV Pro 60FPS', 'Canal+ F1 4K'],
    quality: '4K UHD • 60 FPS Direct Supernode'
  },
  {
    url: 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard',
    category: 'basketball',
    league: '🏀 NBA Basketball',
    league_color: 'from-orange-600 to-amber-500',
    channels: ['TNT Sports NBA 4K', 'ESPN UHD', 'NBA League Pass 60FPS'],
    quality: '4K UHD • 60 FPS'
  },
  {
    url: 'https://site.api.espn.com/apis/site/v2/sports/tennis/atp/scoreboard',
    category: 'tennis',
    league: '🎾 ATP Tour Tennis',
    league_color: 'from-emerald-600 to-teal-700',
    channels: ['Sky Sports Tennis 4K', 'Tennis TV UHD', 'Eurosport 4K'],
    quality: 'Native 4K UHD • 60 FPS'
  }
];

document.addEventListener('DOMContentLoaded', () => {
  initSportsFilters();
  loadSportsFixtures();

  // Real-time 1-second countdown ticker
  sportsTimerInterval = setInterval(updateAllCountdowns, 1000);

  // Auto-refresh live scores & new fixtures every 60 seconds
  sportsAutoRefreshInterval = setInterval(() => {
    loadSportsFixtures(true);
  }, 60000);
});

window.refreshSportsManual = async function() {
  const btn = document.getElementById('btn-refresh-sports');
  if (btn) {
    btn.textContent = '⏳ Syncing Live Feed...';
    btn.disabled = true;
  }
  await loadSportsFixtures(false);
  if (btn) {
    btn.innerHTML = '<span>✅ Schedule Updated!</span>';
    btn.disabled = false;
    setTimeout(() => {
      btn.innerHTML = '<span>🔄 Refresh Live Schedule</span>';
    }, 2000);
  }
};

/* -------------------------------------------------------------
   1. Live ESPN Global Sports Fetcher + Rolling Calendar Engine
   ------------------------------------------------------------- */
async function loadSportsFixtures(isSilent = false) {
  const statusEl = document.getElementById('sports-sync-status');
  const timeEl = document.getElementById('sports-last-synced');

  // Render rolling fallback immediately on first load so grid is never blank
  if (SPORTS_EVENTS.length === 0) {
    SPORTS_EVENTS = generateDynamicFixturesClientSide();
    renderSportsGrid();
    updateCategoryCounts();
  }

  try {
    const liveEvents = await fetchRealLiveSportsFromESPN();
    if (liveEvents && liveEvents.length > 0) {
      // Merge live ESPN events with rolling fallback for any sport category that has 0 active ESPN events today
      const fallbackEvents = generateDynamicFixturesClientSide();
      const categories = ['football', 'ufc', 'f1', 'basketball', 'tennis'];
      const combined = [...liveEvents];

      categories.forEach(cat => {
        const hasCat = combined.some(e => e.category === cat);
        if (!hasCat) {
          const fbForCat = fallbackEvents.filter(e => e.category === cat);
          combined.push(...fbForCat);
        }
      });

      // Sort: LIVE matches first, then upcoming matches chronologically
      combined.sort((a, b) => {
        if (a.is_live && !b.is_live) return -1;
        if (!a.is_live && b.is_live) return 1;
        return a.start_time - b.start_time;
      });

      SPORTS_EVENTS = combined;
      renderSportsGrid();
      updateCategoryCounts();

      if (statusEl) statusEl.textContent = 'Live ESPN & Global Broadcast Feed Synced';
      if (timeEl) {
        const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        timeEl.textContent = `Updated at ${nowStr}`;
      }
      return;
    }
  } catch (err) {
    // Fallback to rolling calendar engine
  }

  SPORTS_EVENTS = generateDynamicFixturesClientSide();
  renderSportsGrid();
  updateCategoryCounts();
  if (timeEl) {
    const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    timeEl.textContent = `Updated at ${nowStr}`;
  }
}

async function fetchRealLiveSportsFromESPN() {
  const now = Date.now();
  const parsedFixtures = [];

  const results = await Promise.allSettled(
    ESPN_ENDPOINTS.map(cfg =>
      fetch(cfg.url, { cache: 'no-store' })
        .then(r => (r.ok ? r.json() : null))
        .then(data => ({ cfg, data }))
    )
  );

  results.forEach(res => {
    if (res.status !== 'fulfilled' || !res.value || !res.value.data) return;
    const { cfg, data } = res.value;
    const events = Array.isArray(data.events) ? data.events : [];

    if (cfg.category === 'football' || cfg.category === 'basketball') {
      let countForLeague = 0;
      events.forEach(ev => {
        if (countForLeague >= 4) return;
        const comp = ev.competitions && ev.competitions[0];
        if (!comp || !comp.competitors || comp.competitors.length < 2) return;

        const state = (ev.status && ev.status.type && ev.status.type.state) || 'pre';
        const startMs = new Date(ev.date).getTime();
        // Skip finished matches that started more than 3 hours ago
        if (state === 'post') return;
        if (startMs < now - 3 * 60 * 60 * 1000 && state !== 'in') return;

        const home = comp.competitors.find(c => c.homeAway === 'home') || comp.competitors[0];
        const away = comp.competitors.find(c => c.homeAway === 'away') || comp.competitors[1];

        const teamA = (home.team && (home.team.shortDisplayName || home.team.displayName)) || 'Home Team';
        const teamB = (away.team && (away.team.shortDisplayName || away.team.displayName)) || 'Away Team';
        const logoA = (home.team && home.team.logo) || '';
        const logoB = (away.team && away.team.logo) || '';
        const isLive = state === 'in';
        const detail = (ev.status && ev.status.type && ev.status.type.shortDetail) || 'Live Now';
        const scoreText = isLive ? `${home.score || 0} - ${away.score || 0}` : '';

        const venueName = comp.venue
          ? [comp.venue.fullName, comp.venue.address && comp.venue.address.city].filter(Boolean).join(', ')
          : '';

        parsedFixtures.push({
          id: `espn-${ev.id}`,
          category: cfg.category,
          league: `${cfg.league} • ${isLive ? 'Matchday Live' : 'Official Fixture'}`,
          league_color: cfg.league_color,
          is_live: isLive,
          live_status: isLive ? `${detail} (${scoreText}) • 4K Direct Feed` : '',
          live_score: scoreText,
          team_a: teamA,
          team_a_icon: cfg.category === 'basketball' ? '🏀' : '⚽',
          team_a_logo: logoA,
          team_b: teamB,
          team_b_icon: cfg.category === 'basketball' ? '🏀' : '⚽',
          team_b_logo: logoB,
          venue: venueName || 'Official Broadcast Arena',
          start_time: startMs,
          end_time: startMs + (135 * 60 * 1000),
          channels: cfg.channels,
          quality: isLive ? '4K UHD • 60 FPS • LIVE NOW' : cfg.quality
        });
        countForLeague++;
      });
    } else if (cfg.category === 'ufc') {
      events.slice(0, 2).forEach(ev => {
        const comps = Array.isArray(ev.competitions) ? ev.competitions : [];
        if (comps.length === 0) return;
        const eventState = (ev.status && ev.status.type && ev.status.type.state) || 'pre';
        if (eventState === 'post') return;

        // Take Main Event (last competition) and Co-Main Event (second to last)
        const mainBouts = comps.slice(-2).reverse();
        mainBouts.forEach((bout, idx) => {
          if (!bout.competitors || bout.competitors.length < 2) return;
          const f1 = bout.competitors[0];
          const f2 = bout.competitors[1];
          const name1 = (f1.athlete && f1.athlete.displayName) || 'Fighter 1';
          const name2 = (f2.athlete && f2.athlete.displayName) || 'Fighter 2';
          const flag1 = (f1.athlete && f1.athlete.flag && f1.athlete.flag.href) || '';
          const flag2 = (f2.athlete && f2.athlete.flag && f2.athlete.flag.href) || '';
          const boutState = (bout.status && bout.status.type && bout.status.type.state) || eventState;
          if (boutState === 'post') return;

          const startMs = new Date(bout.date || ev.date).getTime();
          const isLive = boutState === 'in';
          const venueName = bout.venue
            ? [bout.venue.fullName, bout.venue.address && bout.venue.address.city].filter(Boolean).join(', ')
            : 'UFC Apex / PPV Arena';

          parsedFixtures.push({
            id: `espn-ufc-${bout.id || ev.id}-${idx}`,
            category: 'ufc',
            league: `🥊 ${ev.name || 'UFC Fight Night'} (${idx === 0 ? 'Main Event' : 'Co-Main Event'})`,
            league_color: cfg.league_color,
            is_live: isLive,
            live_status: isLive ? 'Live Octagon Feed • 4K PPV' : '',
            team_a: name1,
            team_a_icon: '🥊',
            team_a_logo: flag1,
            team_b: name2,
            team_b_icon: '🥊',
            team_b_logo: flag2,
            venue: venueName,
            start_time: startMs,
            end_time: startMs + (180 * 60 * 1000),
            channels: cfg.channels,
            quality: cfg.quality
          });
        });
      });
    } else if (cfg.category === 'f1') {
      events.slice(0, 2).forEach(ev => {
        const comps = Array.isArray(ev.competitions) ? ev.competitions : [];
        // Find next upcoming or live session (Qualifying, Sprint, or Grand Prix Race)
        const activeSessions = comps.filter(c => {
          const st = (c.status && c.status.type && c.status.type.state) || 'pre';
          return st === 'in' || st === 'pre';
        });
        if (activeSessions.length === 0) return;

        // Pick the next immediate session and the final Race session
        const nextSess = activeSessions[0];
        const raceSess = activeSessions[activeSessions.length - 1];
        const sessionsToShow = nextSess.id === raceSess.id ? [raceSess] : [nextSess, raceSess];

        sessionsToShow.forEach((sess, idx) => {
          const st = (sess.status && sess.status.type && sess.status.type.state) || 'pre';
          const isLive = st === 'in';
          const startMs = new Date(sess.date || ev.date).getTime();
          const sessTitle = idx === sessionsToShow.length - 1 ? 'Grand Prix Main Race' : 'Qualifying / Sprint Session';
          const circuitName = (sess.circuit && sess.circuit.fullName) || ev.shortName || 'Grand Prix Circuit';

          parsedFixtures.push({
            id: `espn-f1-${sess.id || ev.id}-${idx}`,
            category: 'f1',
            league: `🏎️ ${ev.name || 'Formula 1 Grand Prix'}`,
            league_color: cfg.league_color,
            is_live: isLive,
            live_status: isLive ? `${sessTitle} • Live Track Feed` : '',
            team_a: ev.shortName || 'F1 Grand Prix',
            team_a_icon: '🏎️',
            team_b: sessTitle,
            team_b_icon: '🏁',
            venue: circuitName,
            start_time: startMs,
            end_time: startMs + (150 * 60 * 1000),
            channels: cfg.channels,
            quality: cfg.quality
          });
        });
      });
    } else if (cfg.category === 'tennis') {
      let tennisCount = 0;
      events.forEach(ev => {
        if (tennisCount >= 2) return;
        const groupings = Array.isArray(ev.groupings) ? ev.groupings : [];
        groupings.forEach(grp => {
          if (tennisCount >= 2) return;
          const comps = Array.isArray(grp.competitions) ? grp.competitions : [];
          comps.forEach(comp => {
            if (tennisCount >= 2) return;
            const st = (comp.status && comp.status.type && comp.status.type.state) || 'pre';
            if (st === 'post') return;
            if (!comp.competitors || comp.competitors.length < 2) return;
            const p1 = comp.competitors[0];
            const p2 = comp.competitors[1];
            const name1 = (p1.athlete && p1.athlete.displayName) || 'TBD';
            const name2 = (p2.athlete && p2.athlete.displayName) || 'TBD';
            if (name1 === 'TBD' || name2 === 'TBD') return;

            const flag1 = (p1.athlete && p1.athlete.flag && p1.athlete.flag.href) || '';
            const flag2 = (p2.athlete && p2.athlete.flag && p2.athlete.flag.href) || '';
            const startMs = new Date(comp.date || ev.date).getTime();
            const isLive = st === 'in';

            parsedFixtures.push({
              id: `espn-atp-${comp.id}`,
              category: 'tennis',
              league: `🎾 ${ev.name || 'ATP Tour'}`,
              league_color: cfg.league_color,
              is_live: isLive,
              live_status: isLive ? 'Center Court Live • 4K UHD' : '',
              team_a: name1,
              team_a_icon: '🎾',
              team_a_logo: flag1,
              team_b: name2,
              team_b_icon: '🎾',
              team_b_logo: flag2,
              venue: (comp.venue && comp.venue.fullName) || ev.name || 'Center Court',
              start_time: startMs,
              end_time: startMs + (150 * 60 * 1000),
              channels: cfg.channels,
              quality: cfg.quality
            });
            tennisCount++;
          });
        });
      });
    }
  });

  return parsedFixtures;
}

/**
 * Rolling Calendar Engine (Fallback for any category without an active ESPN event today)
 * Always calculates future timestamps relative to the visitor's current clock so no event is ever stale.
 */
function generateDynamicFixturesClientSide() {
  const now = new Date();
  const nowMs = now.getTime();
  const dayOfWeek = now.getDay();

  function getFutureSlotMs(hoursFromNow, roundedMinute = 0) {
    const d = new Date(nowMs + hoursFromNow * 60 * 60 * 1000);
    d.setMinutes(roundedMinute, 0, 0);
    if (d.getTime() <= nowMs) {
      d.setHours(d.getHours() + 2);
    }
    return d.getTime();
  }

  return [
    {
      id: 'roll-football-1',
      category: 'football',
      league: '🏴󠁧󠁢󠁥󠁮󠁧󠁿 Premier League • Matchday Showcase',
      league_color: 'from-purple-600 to-pink-600',
      is_live: false,
      team_a: 'Arsenal FC',
      team_a_icon: '🔴',
      team_b: 'Liverpool FC',
      team_b_icon: '🔴',
      venue: 'Emirates Stadium, London',
      start_time: getFutureSlotMs(3, 30),
      end_time: getFutureSlotMs(5, 30),
      channels: ['Sky Sports Main Event 4K', 'TNT Sports Ultimate 4K', 'Peacock UHD'],
      quality: '4K UHD • 60 FPS • HDR'
    },
    {
      id: 'roll-football-2',
      category: 'football',
      league: '🇪🇸 LaLiga EA Sports • Primetime',
      league_color: 'from-red-600 to-amber-600',
      is_live: false,
      team_a: 'Real Madrid',
      team_a_icon: '⚪',
      team_b: 'FC Barcelona',
      team_b_icon: '🔵',
      venue: 'Santiago Bernabéu, Madrid',
      start_time: getFutureSlotMs(6, 0),
      end_time: getFutureSlotMs(8, 0),
      channels: ['Premier Sports 1 HD', 'Movistar LaLiga 4K', 'ESPN+ UHD'],
      quality: '4K UHD • 60 FPS • Dolby Atmos'
    },
    {
      id: 'roll-ufc-1',
      category: 'ufc',
      league: '🥊 UFC Championship PPV Main Card',
      league_color: 'from-red-600 to-amber-600',
      is_live: false,
      team_a: 'Main Event Title Bout',
      team_a_icon: '👑',
      team_b: '5-Round Championship',
      team_b_icon: '🥊',
      venue: 'T-Mobile Arena, Las Vegas',
      start_time: getFutureSlotMs(8, 0),
      end_time: getFutureSlotMs(11, 0),
      channels: ['TNT Sports Box Office 4K', 'ESPN+ PPV UHD', 'DAZN PPV 4K'],
      quality: '4K UHD • PPV Included at No Extra Cost'
    },
    {
      id: 'roll-f1-1',
      category: 'f1',
      league: '🏎️ Formula 1 World Championship',
      league_color: 'from-red-600 to-red-800',
      is_live: false,
      team_a: 'Red Bull / McLaren / Ferrari',
      team_a_icon: '🏎️',
      team_b: 'Grand Prix Main Race',
      team_b_icon: '🏁',
      venue: 'FIA Formula 1 International Circuit',
      start_time: getFutureSlotMs(18, 0),
      end_time: getFutureSlotMs(20, 30),
      channels: ['Sky Sports F1 4K UHD', 'F1 TV Pro Native 60FPS', 'Canal+ F1 4K'],
      quality: '4K UHD • 60 FPS Direct Supernode'
    },
    {
      id: 'roll-basketball-1',
      category: 'basketball',
      league: '🏀 NBA Primetime Showcase',
      league_color: 'from-orange-600 to-amber-500',
      is_live: false,
      team_a: 'Los Angeles Lakers',
      team_a_icon: '🏀',
      team_b: 'Boston Celtics',
      team_b_icon: '🍀',
      venue: 'Crypto.com Arena, Los Angeles',
      start_time: getFutureSlotMs(5, 0),
      end_time: getFutureSlotMs(7, 30),
      channels: ['TNT Sports NBA 4K', 'ESPN 4K', 'NBA TV UHD'],
      quality: '4K UHD • 60 FPS'
    },
    {
      id: 'roll-tennis-1',
      category: 'tennis',
      league: '🎾 ATP Tour Masters 1000',
      league_color: 'from-emerald-600 to-teal-700',
      is_live: false,
      team_a: 'Carlos Alcaraz',
      team_a_icon: '🇪🇸',
      team_b: 'Jannik Sinner',
      team_b_icon: '🇮🇹',
      venue: 'Center Court • 4K HDR Feed',
      start_time: getFutureSlotMs(10, 0),
      end_time: getFutureSlotMs(12, 30),
      channels: ['Sky Sports Tennis 4K', 'Tennis TV UHD', 'Eurosport 4K'],
      quality: 'Native 4K UHD • 60 FPS'
    }
  ];
}

/* -------------------------------------------------------------
   2. Category Filtering
   ------------------------------------------------------------- */
function initSportsFilters() {
  const filterBtns = document.querySelectorAll('.sports-filter-btn');

  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => {
        b.classList.remove('active', 'bg-blue-600', 'text-white');
        b.classList.add('bg-[#101522]', 'border', 'border-[#263247]', 'text-slate-300');
      });

      btn.classList.remove('bg-[#101522]', 'border-[#263247]', 'text-slate-300');
      btn.classList.add('active', 'bg-blue-600', 'text-white', 'font-bold');

      activeSportsCategory = btn.getAttribute('data-category') || 'all';
      renderSportsGrid();
    });
  });
}

function updateCategoryCounts() {
  const setEl = (id, count) => {
    const el = document.getElementById(id);
    if (el) el.textContent = count;
  };
  setEl('count-all', SPORTS_EVENTS.length);
  setEl('count-football', SPORTS_EVENTS.filter(e => e.category === 'football').length);
  setEl('count-ufc', SPORTS_EVENTS.filter(e => e.category === 'ufc').length);
  setEl('count-f1', SPORTS_EVENTS.filter(e => e.category === 'f1').length);
  setEl('count-basketball', SPORTS_EVENTS.filter(e => e.category === 'basketball').length);
  setEl('count-tennis', SPORTS_EVENTS.filter(e => e.category === 'tennis').length);
}

/* -------------------------------------------------------------
   3. Render Match Grid (With Real Team Logos & Live Scoreboards)
   ------------------------------------------------------------- */
function renderTeamBadge(logoUrl, fallbackIcon, name) {
  if (logoUrl) {
    return `<img src="${logoUrl}" alt="${name}" class="w-6 h-6 sm:w-7 sm:h-7 object-contain shrink-0" loading="lazy" onerror="this.style.display='none'">`;
  }
  return `<span class="text-xl shrink-0">${fallbackIcon || '🏆'}</span>`;
}

function renderSportsGrid() {
  const container = document.getElementById('sports-events-grid');
  if (!container) return;

  const now = Date.now();
  // Filter out any event that ended in the past
  const activeEvents = SPORTS_EVENTS.filter(e => !e.end_time || e.end_time > now);

  const filtered = activeEvents.filter(e => {
    return activeSportsCategory === 'all' || e.category === activeSportsCategory;
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="col-span-full py-12 text-center text-slate-500 glass-panel rounded-3xl border border-[#263247]">
        No matches scheduled in this category right now. Click Refresh Live Schedule above!
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(evt => {
    const isCurrentlyLive = evt.is_live || (evt.start_time <= now && (!evt.end_time || evt.end_time > now));
    
    const evtDate = new Date(evt.start_time);
    const nowDate = new Date();
    const isSameDay = evtDate.toDateString() === nowDate.toDateString();
    
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const isTomorrow = evtDate.toDateString() === tomorrow.toDateString();

    const formattedTime = evtDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    let dateLabel = '';
    if (isCurrentlyLive) {
      dateLabel = '🔴 ' + (evt.live_status || 'Streaming Live Now');
    } else if (isSameDay) {
      dateLabel = '📅 Today at ' + formattedTime;
    } else if (isTomorrow) {
      dateLabel = '📅 Tomorrow at ' + formattedTime;
    } else {
      const formattedDate = evtDate.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
      dateLabel = '📅 ' + formattedDate + ' at ' + formattedTime;
    }

    const vsOrScoreBadge = (isCurrentlyLive && evt.live_score)
      ? `<span class="text-xs px-2.5 py-1 rounded-lg bg-red-600/20 text-red-400 font-mono font-black border border-red-500/40 shrink-0">${evt.live_score}</span>`
      : `<span class="text-xs px-2 py-0.5 rounded bg-[#161D2D] text-slate-400 font-sans font-bold border border-[#263247] shrink-0">VS</span>`;

    return `
      <div class="glass-panel rounded-3xl p-6 border ${isCurrentlyLive ? 'border-red-500/60 shadow-[0_0_30px_rgba(239,68,68,0.15)]' : 'border-[#263247] hover:border-blue-500/50'} bg-[#101522] transition-all flex flex-col justify-between space-y-5 shadow-xl relative overflow-hidden group">
        
        <!-- League Header Badge -->
        <div class="flex items-center justify-between gap-2">
          <span class="px-3 py-1 rounded-full text-[11px] font-extrabold uppercase tracking-wider bg-gradient-to-r ${evt.league_color} text-white shadow truncate">
            ${evt.league}
          </span>
          ${isCurrentlyLive ? `
            <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-red-600 text-white text-[10px] font-black uppercase tracking-wider shrink-0 animate-pulse shadow-sm">
              <span class="w-1.5 h-1.5 rounded-full bg-white animate-ping"></span>LIVE NOW
            </span>
          ` : `
            <span class="text-[10px] text-emerald-400 font-bold px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 shrink-0">
              ${evt.quality}
            </span>
          `}
        </div>

        <!-- Match Versus Card -->
        <div class="bg-[#0C111D] rounded-2xl p-4 border border-[#263247] space-y-3">
          <div class="flex items-center justify-between gap-2 font-heading font-extrabold text-xs sm:text-sm text-white">
            <div class="flex items-center gap-2 min-w-0 flex-1">
              ${renderTeamBadge(evt.team_a_logo, evt.team_a_icon, evt.team_a)}
              <span class="truncate">${evt.team_a}</span>
            </div>
            ${vsOrScoreBadge}
            <div class="flex items-center justify-end gap-2 text-right min-w-0 flex-1">
              <span class="truncate">${evt.team_b}</span>
              ${renderTeamBadge(evt.team_b_logo, evt.team_b_icon, evt.team_b)}
            </div>
          </div>
          
          <div class="text-[11px] text-slate-400 text-center flex items-center justify-center gap-1.5 pt-1 border-t border-[#263247]">
            <span class="${isCurrentlyLive ? 'text-red-400 font-semibold' : 'text-slate-300'}">${dateLabel}</span>
            ${evt.venue ? `<span class="text-slate-600">•</span><span class="text-slate-400 truncate">${evt.venue}</span>` : ''}
          </div>
        </div>

        <!-- Live Countdown Timer or Live Status Box -->
        <div class="bg-[#0C111D] rounded-2xl p-3 border border-[#263247] text-center countdown-container" data-event-id="${evt.id}">
          ${isCurrentlyLive ? `
            <span class="text-[10px] font-bold uppercase tracking-wider text-red-400 block mb-1">Live Match Center</span>
            <div class="text-sm sm:text-base font-black text-red-400 font-mono flex items-center justify-center gap-2 py-0.5">
              <span class="w-2 h-2 rounded-full bg-red-500 animate-ping"></span>
              <span>STREAMING LIVE IN 4K UHD</span>
            </div>
          ` : `
            <span class="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Kick-off / Event Countdown</span>
            <div class="text-lg font-black text-white font-mono match-countdown" data-timestamp="${evt.start_time}" data-event-id="${evt.id}">
              Calculating...
            </div>
          `}
        </div>

        <!-- Broadcast Channels -->
        <div>
          <span class="text-[10px] text-slate-500 font-bold uppercase tracking-wider block mb-1.5">Broadcast 4K Feeds:</span>
          <div class="flex flex-wrap gap-1.5">
            ${(evt.channels || []).map(ch => `
              <span class="text-[10px] px-2 py-0.5 rounded bg-[#0C111D] border border-[#263247] text-slate-300 font-medium">
                📺 ${ch}
              </span>
            `).join('')}
          </div>
        </div>

        <!-- CTA Order Button -->
        <div class="pt-2">
          <a href="checkout.html?event=${encodeURIComponent(evt.team_a + ' vs ' + evt.team_b)}" class="btn-primary w-full py-2.5 rounded-xl text-xs uppercase font-bold text-white ${isCurrentlyLive ? 'bg-red-600 hover:bg-red-500 shadow-red-600/30' : 'bg-blue-600 hover:bg-blue-500'} block text-center shadow-md group-hover:scale-[1.02] transition-transform">
            ${isCurrentlyLive ? '⚡ Watch Live Stream Now &rarr;' : '⚡ Get 4K Match Pass &rarr;'}
          </a>
        </div>

      </div>
    `;
  }).join('');

  updateAllCountdowns();
}

/* -------------------------------------------------------------
   4. Real-Time Countdown Clocks & Auto Live Transition
   ------------------------------------------------------------- */
function updateAllCountdowns() {
  const clocks = document.querySelectorAll('.match-countdown');
  const now = Date.now();
  let hasTransitionedToLive = false;

  clocks.forEach(clock => {
    const target = parseInt(clock.getAttribute('data-timestamp'), 10);
    const eventId = clock.getAttribute('data-event-id');
    const diff = target - now;

    if (diff <= 0) {
      clock.innerHTML = `<span class="text-red-400 animate-pulse font-extrabold">🔴 STREAMING LIVE NOW</span>`;
      
      const matchObj = SPORTS_EVENTS.find(e => e.id === eventId);
      if (matchObj && !matchObj.is_live) {
        matchObj.is_live = true;
        matchObj.live_status = 'Live Now • 4K Direct Feed';
        hasTransitionedToLive = true;
      }
      return;
    }

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
    const mins = Math.floor((diff / (1000 * 60)) % 60);
    const secs = Math.floor((diff / 1000) % 60);

    const pad = (n) => n < 10 ? '0' + n : n;

    if (days > 0) {
      clock.textContent = `${days}d ${pad(hours)}h : ${pad(mins)}m : ${pad(secs)}s`;
    } else {
      clock.textContent = `${pad(hours)}h : ${pad(mins)}m : ${pad(secs)}s`;
    }
  });

  if (hasTransitionedToLive) {
    renderSportsGrid();
  }
}
