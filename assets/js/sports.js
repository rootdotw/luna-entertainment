/**
 * Luna Stream IPTV - Live Sports & PPV Match Countdown Controller
 * Real-time Dynamic & Rolling Sporting Events
 * Automatically rolls fixtures daily and synchronizes with /api/sports/fixtures
 */

let SPORTS_EVENTS = [];
let activeSportsCategory = 'all';
let sportsTimerInterval = null;

document.addEventListener('DOMContentLoaded', () => {
  initSportsFilters();
  loadSportsFixtures();

  // Periodically check countdowns and live transitions
  sportsTimerInterval = setInterval(updateAllCountdowns, 1000);
});

/* -------------------------------------------------------------
   1. Dynamic Fixtures Loader (API with Client-Side Rolling Fallback)
   ------------------------------------------------------------- */
async function loadSportsFixtures() {
  try {
    const res = await fetch('/api/sports/fixtures', { cache: 'no-cache' });
    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.fixtures) && data.fixtures.length > 0) {
        SPORTS_EVENTS = data.fixtures;
        renderSportsGrid();
        updateCategoryCounts();
        return;
      }
    }
  } catch (err) {
    console.warn('Backend sports API unavailable, using dynamic client-side calendar engine:', err);
  }

  // Fallback: Dynamic client-side engine aware of current real-time date
  SPORTS_EVENTS = generateDynamicFixturesClientSide();
  renderSportsGrid();
  updateCategoryCounts();
}

/**
 * Generates rolling same-day and upcoming fixtures based on real calendar clock.
 * Guarantees sports.html is NEVER stuck at static dates even offline.
 */
function generateDynamicFixturesClientSide() {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 = Sun, 1 = Mon, 2 = Tue, 3 = Wed, 4 = Thu, 5 = Fri, 6 = Sat
  const currentHour = now.getHours();

  function getEpochMs(daysAhead, hour, minute) {
    const d = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);
    d.setHours(hour, minute, 0, 0);
    return d.getTime();
  }

  // Calculate upcoming Saturday and Sunday
  let daysUntilSat = (6 - dayOfWeek + 7) % 7;
  if (daysUntilSat === 0 && currentHour >= 23) daysUntilSat = 7;

  let daysUntilSun = (0 - dayOfWeek + 7) % 7;
  if (daysUntilSun === 0 && currentHour >= 20) daysUntilSun = 7;

  const fixtures = [];

  // 1. Live Match Today
  const liveStart = now.getTime() - (38 * 60 * 1000);
  const liveEnd = now.getTime() + (70 * 60 * 1000);

  if (dayOfWeek === 1) { // Monday
    fixtures.push({
      id: 'evt-live-' + dayOfWeek,
      category: 'football',
      league: '🏴󠁧󠁢󠁥󠁮󠁧󠁿 Premier League • Matchday Live',
      league_color: 'from-purple-600 to-pink-600',
      is_live: true,
      live_status: "1st Half (38') • 4K Direct Feed",
      team_a: 'Newcastle United',
      team_a_icon: '⚪',
      team_b: 'West Ham United',
      team_b_icon: '⚒️',
      venue: "St. James' Park, Newcastle",
      start_time: liveStart,
      end_time: liveEnd,
      channels: ['Sky Sports Premier League 4K', 'USA Network UHD', 'Canal+ Foot 4K'],
      quality: '4K UHD • 60 FPS • LIVE NOW'
    });
  } else if (dayOfWeek === 2 || dayOfWeek === 3) { // Tuesday / Wednesday UCL
    fixtures.push({
      id: 'evt-live-' + dayOfWeek,
      category: 'football',
      league: '🏆 UEFA Champions League • Matchday Live',
      league_color: 'from-blue-600 to-indigo-600',
      is_live: true,
      live_status: "1st Half (38') • 4K Direct Feed",
      team_a: 'Real Madrid',
      team_a_icon: '⚪',
      team_b: 'Bayern Munich',
      team_b_icon: '🔴',
      venue: 'Santiago Bernabéu, Madrid',
      start_time: liveStart,
      end_time: liveEnd,
      channels: ['TNT Sports Ultimate 4K', 'Canal+ UHD', 'Paramount+ 4K'],
      quality: '4K UHD • 60 FPS • LIVE NOW'
    });
  } else if (dayOfWeek === 4) { // Thursday UEL
    fixtures.push({
      id: 'evt-live-' + dayOfWeek,
      category: 'football',
      league: '🏆 UEFA Europa League • Matchday Live',
      league_color: 'from-orange-600 to-amber-600',
      is_live: true,
      live_status: "1st Half (35') • 4K Feed",
      team_a: 'Manchester United',
      team_a_icon: '🔴',
      team_b: 'AS Roma',
      team_b_icon: '🐺',
      venue: 'Old Trafford, Manchester',
      start_time: liveStart,
      end_time: liveEnd,
      channels: ['TNT Sports 1 4K', 'DAZN 1 4K', 'Movistar Liga 4K'],
      quality: '4K UHD • 60 FPS • LIVE NOW'
    });
  } else if (dayOfWeek === 5) { // Friday
    fixtures.push({
      id: 'evt-live-' + dayOfWeek,
      category: 'football',
      league: '🏴󠁧󠁢󠁥󠁮󠁧󠁿 Premier League • Friday Night Football',
      league_color: 'from-purple-600 to-pink-600',
      is_live: true,
      live_status: "1st Half (34') • 4K Feed",
      team_a: 'Aston Villa',
      team_a_icon: '🦁',
      team_b: 'Brighton & Hove Albion',
      team_b_icon: '🔵',
      venue: 'Villa Park, Birmingham',
      start_time: liveStart,
      end_time: liveEnd,
      channels: ['Sky Sports Main Event 4K', 'Peacock UHD', 'beIN Sports 1 4K'],
      quality: '4K UHD • 60 FPS • LIVE NOW'
    });
  } else if (dayOfWeek === 6) { // Saturday
    fixtures.push({
      id: 'evt-live-' + dayOfWeek,
      category: 'football',
      league: '🏴󠁧󠁢󠁥󠁮󠁧󠁿 Premier League • Super Saturday 4K',
      league_color: 'from-purple-600 to-pink-600',
      is_live: true,
      live_status: "1st Half (38') • 4K Direct Feed",
      team_a: 'Manchester City',
      team_a_icon: '🔵',
      team_b: 'Arsenal FC',
      team_b_icon: '🔴',
      venue: 'Etihad Stadium, Manchester',
      start_time: liveStart,
      end_time: liveEnd,
      channels: ['Sky Sports Premier League 4K', 'TNT Sports 1 4K', 'Peacock 4K'],
      quality: '4K UHD • 60 FPS • LIVE NOW'
    });
  } else { // Sunday (dayOfWeek === 0)
    fixtures.push({
      id: 'evt-live-' + dayOfWeek,
      category: 'football',
      league: '🏴󠁧󠁢󠁥󠁮󠁧󠁿 Premier League • Super Sunday Derby',
      league_color: 'from-purple-600 to-pink-600',
      is_live: true,
      live_status: "1st Half (35') • 4K Feed",
      team_a: 'Liverpool FC',
      team_a_icon: '🔴',
      team_b: 'Manchester United',
      team_b_icon: '🔴',
      venue: 'Anfield, Liverpool',
      start_time: liveStart,
      end_time: liveEnd,
      channels: ['Sky Sports Premier League 4K', 'USA Network UHD', 'DAZN 4K'],
      quality: '4K UHD • 60 FPS • LIVE NOW'
    });
  }

  // 2. Later Today / Tonight Match
  const tonightHour = currentHour < 20 ? 20 : 21;
  const tonightStart = getEpochMs(0, tonightHour, 0);

  if (dayOfWeek === 1) {
    fixtures.push({
      id: 'evt-today-tonight',
      category: 'football',
      league: '🇮🇹 Serie A • Monday Night Primetime',
      league_color: 'from-blue-700 to-cyan-600',
      is_live: false,
      team_a: 'Lazio',
      team_a_icon: '🦅',
      team_b: 'Fiorentina',
      team_b_icon: '💜',
      venue: 'Stadio Olimpico, Rome',
      start_time: tonightStart,
      end_time: tonightStart + (110 * 60 * 1000),
      channels: ['TNT Sports 2 4K', 'DAZN 2 4K', 'Paramount+ UHD'],
      quality: '4K UHD • 60 FPS • Dolby 5.1'
    });
  } else if (dayOfWeek === 2 || dayOfWeek === 3) {
    fixtures.push({
      id: 'evt-today-tonight',
      category: 'football',
      league: '🏆 UEFA Champions League • Matchday Primetime',
      league_color: 'from-blue-600 to-indigo-600',
      is_live: false,
      team_a: 'Arsenal FC',
      team_a_icon: '🔴',
      team_b: 'Juventus',
      team_b_icon: '⚪',
      venue: 'Emirates Stadium, London',
      start_time: tonightStart,
      end_time: tonightStart + (110 * 60 * 1000),
      channels: ['TNT Sports 1 4K', 'Canal+ Foot 4K', 'Movistar Liga 4K'],
      quality: '4K UHD • 60 FPS • Dolby Atmos'
    });
  } else if (dayOfWeek === 4) {
    fixtures.push({
      id: 'evt-today-tonight',
      category: 'football',
      league: '🏆 UEFA Europa League • Primetime',
      league_color: 'from-orange-600 to-amber-600',
      is_live: false,
      team_a: 'Tottenham Hotspur',
      team_a_icon: '⚪',
      team_b: 'Galatasaray',
      team_b_icon: '🦁',
      venue: 'Tottenham Hotspur Stadium, London',
      start_time: tonightStart,
      end_time: tonightStart + (110 * 60 * 1000),
      channels: ['TNT Sports 2 4K', 'Sony LIV 4K', 'beIN Sports 2 4K'],
      quality: '4K UHD • 60 FPS • Ultra HDR'
    });
  } else if (dayOfWeek === 5) {
    fixtures.push({
      id: 'evt-today-tonight',
      category: 'football',
      league: '🇪🇸 La Liga EA Sports • Friday Showcase',
      league_color: 'from-red-600 to-yellow-600',
      is_live: false,
      team_a: 'Sevilla FC',
      team_a_icon: '⚪',
      team_b: 'Real Sociedad',
      team_b_icon: '🔵',
      venue: 'Ramón Sánchez-Pizjuán, Seville',
      start_time: tonightStart,
      end_time: tonightStart + (110 * 60 * 1000),
      channels: ['Movistar La Liga 4K', 'Viaplay Sports 1 4K', 'ESPN+ UHD'],
      quality: '4K UHD • 60 FPS'
    });
  } else if (dayOfWeek === 6) {
    const satPpvStart = getEpochMs(0, 22, 0);
    fixtures.push({
      id: 'evt-today-tonight',
      category: 'ufc',
      league: '🥊 UFC World Championship PPV Main Card',
      league_color: 'from-red-600 to-amber-600',
      is_live: false,
      team_a: 'Alexandre Pantoja',
      team_a_icon: '👑',
      team_b: 'Joshua Van',
      team_b_icon: '🥊',
      venue: 'T-Mobile Arena, Las Vegas, NV',
      start_time: satPpvStart,
      end_time: satPpvStart + (180 * 60 * 1000),
      channels: ['ESPN+ PPV UHD', 'TNT Sports Box Office 4K', 'Sony LIV 4K'],
      quality: '4K UHD • PPV Included • Zero Delay'
    });
  } else {
    fixtures.push({
      id: 'evt-today-tonight',
      category: 'football',
      league: '🇪🇸 La Liga • El Clásico Primetime',
      league_color: 'from-red-600 to-amber-600',
      is_live: false,
      team_a: 'Real Madrid',
      team_a_icon: '⚪',
      team_b: 'FC Barcelona',
      team_b_icon: '🔵',
      venue: 'Santiago Bernabéu, Madrid',
      start_time: tonightStart,
      end_time: tonightStart + (110 * 60 * 1000),
      channels: ['Movistar La Liga 4K', 'ITV 4K UHD', 'ESPN+ UHD'],
      quality: '4K UHD • 60 FPS • Dolby Atmos'
    });
  }

  // 3. Tomorrow Marquee Fixture
  const tomorrowStart = getEpochMs(1, 20, 0);
  if (dayOfWeek === 1) { // Mon -> Tue
    fixtures.push({
      id: 'evt-tomorrow-clash',
      category: 'football',
      league: '🏆 UEFA Champions League • Matchday Marquee',
      league_color: 'from-blue-600 to-indigo-600',
      is_live: false,
      team_a: 'Real Madrid',
      team_a_icon: '⚪',
      team_b: 'Bayern Munich',
      team_b_icon: '🔴',
      venue: 'Santiago Bernabéu, Madrid',
      start_time: tomorrowStart,
      end_time: tomorrowStart + (110 * 60 * 1000),
      channels: ['TNT Sports 1 4K', 'Canal+ UHD', 'Paramount+ 4K'],
      quality: '4K UHD • 60 FPS • Ultra HDR'
    });
  } else if (dayOfWeek === 2) { // Tue -> Wed
    fixtures.push({
      id: 'evt-tomorrow-clash',
      category: 'football',
      league: '🏆 UEFA Champions League • Matchday Marquee',
      league_color: 'from-blue-600 to-indigo-600',
      is_live: false,
      team_a: 'Barcelona',
      team_a_icon: '🔵',
      team_b: 'Paris Saint-Germain',
      team_b_icon: '🔴',
      venue: 'Camp Nou, Barcelona',
      start_time: tomorrowStart,
      end_time: tomorrowStart + (110 * 60 * 1000),
      channels: ['TNT Sports Ultimate 4K', 'RMC Sport 1 4K', 'Movistar Liga 4K'],
      quality: '4K UHD • 60 FPS'
    });
  } else if (dayOfWeek === 5) { // Fri -> Sat
    fixtures.push({
      id: 'evt-tomorrow-clash',
      category: 'football',
      league: '🏴󠁧󠁢󠁥󠁮󠁧󠁿 Premier League • Saturday Derby',
      league_color: 'from-purple-600 to-pink-600',
      is_live: false,
      team_a: 'Arsenal FC',
      team_a_icon: '🔴',
      team_b: 'Chelsea FC',
      team_b_icon: '🔵',
      venue: 'Emirates Stadium, London',
      start_time: getEpochMs(1, 17, 30),
      end_time: getEpochMs(1, 17, 30) + (110 * 60 * 1000),
      channels: ['Sky Sports Premier League 4K', 'Peacock UHD', 'Canal+ Foot 4K'],
      quality: '4K UHD • 60 FPS • Ultra HDR'
    });
  } else {
    fixtures.push({
      id: 'evt-tomorrow-clash',
      category: 'football',
      league: '🏆 Continental Championship • Clash of Giants',
      league_color: 'from-blue-600 to-indigo-600',
      is_live: false,
      team_a: 'Inter Milan',
      team_a_icon: '🔵',
      team_b: 'Atlético de Madrid',
      team_b_icon: '⚪',
      venue: 'San Siro, Milan',
      start_time: tomorrowStart,
      end_time: tomorrowStart + (110 * 60 * 1000),
      channels: ['TNT Sports 2 4K', 'DAZN 1 4K', 'Canal+ UHD'],
      quality: '4K UHD • 60 FPS'
    });
  }

  // 4. Upcoming Saturday UFC / Boxing Title PPV
  const satTime = getEpochMs(daysUntilSat, 22, 0);
  fixtures.push({
    id: 'evt-upcoming-ufc-ppv',
    category: 'ufc',
    league: '🥊 WBC World Welterweight Championship PPV',
    league_color: 'from-amber-600 to-yellow-500',
    is_live: false,
    team_a: 'Ryan Garcia',
    team_a_icon: '🥊',
    team_b: 'Conor Benn',
    team_b_icon: '🇬🇧',
    venue: 'T-Mobile Arena, Las Vegas, NV',
    start_time: satTime,
    end_time: satTime + (180 * 60 * 1000),
    channels: ['DAZN PPV VIP 4K', 'TNT Sports Box Office', 'Sky Sports Box Office'],
    quality: '4K UHD • PPV Included at No Extra Cost'
  });

  // 5. Upcoming Sunday Premier League Derby
  const sunTime = getEpochMs(daysUntilSun, 16, 30);
  fixtures.push({
    id: 'evt-upcoming-epl-derby',
    category: 'football',
    league: '🏴󠁧󠁢󠁥󠁮󠁧󠁿 Premier League • The Manchester Derby',
    league_color: 'from-purple-600 to-pink-600',
    is_live: false,
    team_a: 'Manchester United',
    team_a_icon: '🔴',
    team_b: 'Manchester City',
    team_b_icon: '🔵',
    venue: 'Old Trafford, Manchester',
    start_time: sunTime,
    end_time: sunTime + (110 * 60 * 1000),
    channels: ['Sky Sports Premier League 4K', 'Peacock Premium UHD', 'USA Network 4K'],
    quality: '4K UHD • 60 FPS • Ultra HDR'
  });

  // 6. Formula 1 Grand Prix Raceday
  const f1Time = getEpochMs(daysUntilSun, 14, 0);
  fixtures.push({
    id: 'evt-upcoming-f1',
    category: 'f1',
    league: '🏎️ Formula 1 Grand Prix World Championship',
    league_color: 'from-red-600 to-red-800',
    is_live: false,
    team_a: 'Max Verstappen (Red Bull)',
    team_a_icon: '🏎️',
    team_b: 'Lando Norris (McLaren)',
    team_b_icon: '🏎️',
    venue: 'Grand Prix Circuit • Lights Out 15:00 CEST',
    start_time: f1Time,
    end_time: f1Time + (130 * 60 * 1000),
    channels: ['Sky Sports F1 4K UHD', 'F1 TV Pro Native 60FPS', 'Canal+ F1 4K'],
    quality: '4K UHD • 60 FPS Direct Satellite Supernode'
  });

  // 7. Tennis Championship Final
  const tennisOffset = dayOfWeek <= 3 ? (3 - dayOfWeek) : (6 - dayOfWeek);
  const tennisTime = getEpochMs(tennisOffset, 19, 0);
  fixtures.push({
    id: 'evt-upcoming-tennis',
    category: 'tennis',
    league: '🎾 ATP Masters 1000 Championship Final',
    league_color: 'from-emerald-600 to-teal-700',
    is_live: false,
    team_a: 'Carlos Alcaraz',
    team_a_icon: '🇪🇸',
    team_b: 'Jannik Sinner',
    team_b_icon: '🇮🇹',
    venue: 'Center Court • 4K Native HDR Feed',
    start_time: tennisTime,
    end_time: tennisTime + (150 * 60 * 1000),
    channels: ['Sky Sports Tennis 4K', 'ESPN+ UHD', 'Eurosport 4K UHD'],
    quality: 'Native 4K UHD • 60 FPS'
  });

  // 8. Basketball Primetime
  const bballOffset = dayOfWeek % 2 === 0 ? 1 : 2;
  const bballTime = getEpochMs(bballOffset, 20, 0);
  fixtures.push({
    id: 'evt-upcoming-basketball',
    category: 'basketball',
    league: '🏀 NBA Primetime Blockbuster',
    league_color: 'from-orange-600 to-amber-500',
    is_live: false,
    team_a: 'Boston Celtics',
    team_a_icon: '🍀',
    team_b: 'Denver Nuggets',
    team_b_icon: '🏔️',
    venue: 'TD Garden, Boston, MA',
    start_time: bballTime,
    end_time: bballTime + (140 * 60 * 1000),
    channels: ['ESPN 4K', 'ABC HD 60FPS', 'NBA TV UHD'],
    quality: '4K UHD 60FPS'
  });

  return fixtures;
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
   3. Render Match Grid
   ------------------------------------------------------------- */
function renderSportsGrid() {
  const container = document.getElementById('sports-events-grid');
  if (!container) return;

  const filtered = SPORTS_EVENTS.filter(e => {
    return activeSportsCategory === 'all' || e.category === activeSportsCategory;
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="col-span-full py-12 text-center text-slate-500 glass-panel rounded-3xl border border-[#263247]">
        No matches scheduled in this category right now. Check back soon!
      </div>
    `;
    return;
  }

  const now = Date.now();

  container.innerHTML = filtered.map(evt => {
    const isCurrentlyLive = evt.is_live || (evt.start_time <= now && (!evt.end_time || evt.end_time > now));
    
    // Day label calculation
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
          <div class="flex items-center justify-between font-heading font-extrabold text-sm sm:text-base text-white">
            <div class="flex items-center gap-2">
              <span class="text-xl">${evt.team_a_icon}</span>
              <span>${evt.team_a}</span>
            </div>
            <span class="text-xs px-2 py-0.5 rounded bg-[#161D2D] text-slate-400 font-sans font-bold border border-[#263247]">VS</span>
            <div class="flex items-center gap-2 text-right">
              <span>${evt.team_b}</span>
              <span class="text-xl">${evt.team_b_icon}</span>
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
            ${evt.channels.map(ch => `
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
      
      // Update data model if not already live
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
    // Re-render to reflect new red border, LIVE NOW badge, and CTA text
    renderSportsGrid();
  }
}
