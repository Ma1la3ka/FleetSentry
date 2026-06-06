const API_BASE = 'https://nl3jlu9oe7.execute-api.eu-north-1.amazonaws.com';

function getToken() {
  const user = JSON.parse(localStorage.getItem('fs_user'));
  return user.user_id || user.userId || localStorage.getItem('fs_token');
}

// ─────────────────────────────
// STATE
// ─────────────────────────────
let currentUser   = null;
let tripMap       = null;
let startMarker   = null;
let endMarker     = null;
let startLatLng   = null;
let endLatLng     = null;
let mapStep       = 1;
let allTrips      = [];
let allNotifs     = [];
let activeTrip    = null;
let watchId       = null; // geolocation watcher

// ─────────────────────────────
// INIT
// ─────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadUserFromStorage();
});

// ─────────────────────────────
// USER + STATUS CHECK
// ─────────────────────────────
function loadUserFromStorage() {
  const stored = localStorage.getItem('fs_user');
  const role   = localStorage.getItem('fs_role');

  if (!stored || role !== 'worker') {
    window.location.href = '../Login/index.html';
    return;
  }

  currentUser = JSON.parse(stored);

  if (currentUser.status === 'pending') {
    showPendingScreen();
  } else {
    showDashboard();
  }
}

// ─────────────────────────────
// PENDING SCREEN
// ─────────────────────────────
function showPendingScreen() {
  document.getElementById('pendingScreen').style.display = 'flex';
  document.getElementById('dashboardWrap').style.display = 'none';

  document.getElementById('pendingName').textContent    = `${currentUser.firstName} ${currentUser.lastName}`;
  document.getElementById('pendingCompany').textContent = currentUser.companyName;
  document.getElementById('pendingVehicle').textContent = currentUser.vehicleType;
  document.getElementById('pendingPlate').textContent   = currentUser.plateNo;

  document.getElementById('pendingLogout').addEventListener('click', () => {
    localStorage.clear();
    window.location.href = '../Login/index.html';
  });
}

// ─────────────────────────────
// APPROVED DASHBOARD
// ─────────────────────────────
function showDashboard() {
  document.getElementById('pendingScreen').style.display = 'none';
  document.getElementById('dashboardWrap').style.display = 'flex';

  populateUserUI();
  startClock();
  setupNavigation();
  setupMobileMenu();
  loadData();
}

function populateUserUI() {
  const fullName    = `${currentUser.firstName} ${currentUser.lastName}`;
  const initials    = currentUser.firstName[0] + currentUser.lastName[0];
  const vehicleType = currentUser.vehicleType || '—';
  const plateNo     = currentUser.plateNo     || '—';

  document.getElementById('sidebarName').textContent       = fullName;
  document.getElementById('sidebarAvatar').textContent     = initials;
  document.getElementById('sidebarVehicle').textContent    = `${vehicleType} · ${plateNo}`;
  document.getElementById('topbarName').textContent        = currentUser.firstName;
  document.getElementById('topbarAvatar').textContent      = initials;
  document.getElementById('companyNameDisplay').textContent = currentUser.companyName || '—';
  document.getElementById('plateDisplay').textContent      = plateNo;
  document.getElementById('tripVehicle').value             = `${vehicleType} — ${plateNo}`;

  const sub = document.getElementById('overviewSub');
  if (sub) sub.textContent = `${currentUser.companyName || ''} · ${vehicleType}`;
}

// ─────────────────────────────
// CLOCK
// ─────────────────────────────
function startClock() {
  function tick() {
    const now = new Date();
    const h   = String(now.getHours()).padStart(2, '0');
    const m   = String(now.getMinutes()).padStart(2, '0');
    document.getElementById('topbarClock').textContent = `${h}:${m}`;
    const hour = now.getHours();
    let greeting = 'morning';
    if (hour >= 12 && hour < 17) greeting = 'afternoon';
    else if (hour >= 17)         greeting = 'evening';
    document.getElementById('greetingTime').textContent = greeting;
  }
  tick();
  setInterval(tick, 30000);
}

// ─────────────────────────────
// NAVIGATION
// ─────────────────────────────
function setupNavigation() {
  document.querySelectorAll('.nav-item[data-section]').forEach(item => {
    item.addEventListener('click', e => {
      e.preventDefault();
      const sec = item.dataset.section;
      if (sec) navigateTo(sec);
    });
  });

  document.querySelectorAll('.card-link[data-section]').forEach(link => {
    link.addEventListener('click', () => navigateTo(link.dataset.section));
  });

  document.getElementById('ctNewTripBtn')?.addEventListener('click', () => navigateTo('request'));

  document.getElementById('logoutBtn').addEventListener('click', () => {
    if (watchId) navigator.geolocation.clearWatch(watchId);
    localStorage.clear();
    window.location.href = '../Login/index.html';
  });
}

function navigateTo(sectionId) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  const target = document.getElementById(`section-${sectionId}`);
  if (target) target.classList.add('active');

  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.section === sectionId);
  });

  if (sectionId === 'request' && !tripMap) initTripMap();
  document.getElementById('sidebar').classList.remove('open');
}

// ─────────────────────────────
// MOBILE MENU
// ─────────────────────────────
function setupMobileMenu() {
  document.getElementById('menuToggle').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
  });
}

// ─────────────────────────────
// LOAD DATA
// ─────────────────────────────
async function loadData() {
  try {
    const token = getToken();
    const res   = await fetch(`${API_BASE}/dashboard`, {
      headers: { 'Authorization': token }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to load data');

    allTrips   = data.trips || [];
    allNotifs  = [];
    activeTrip = data.activeTrip || null;

    const stats = data.stats || {
      totalTrips:      0,
      totalKm:         0,
      pendingRequests: 0,
      completedTrips:  0,
    };

    renderCurrentTrip(activeTrip);
    renderStats(stats);
    renderRecentTrips();
    renderRecentNotifs();
    renderHistoryTable();
    renderNotifsSection();
    updateSidebarBadges();

  } catch (err) {
    console.error('Worker dashboard load error:', err);
  }
}

// ─────────────────────────────
// CURRENT TRIP CARD
// ─────────────────────────────
function renderCurrentTrip(trip) {
  const statusText  = document.getElementById('ctStatusText');
  const dot         = document.getElementById('ctDot');
  const route       = document.getElementById('ctRoute');
  const ctFrom      = document.getElementById('ctFrom');
  const ctTo        = document.getElementById('ctTo');
  const ctActionArea = document.getElementById('ctActionArea');

  if (!trip) {
    statusText.textContent = 'No active trip';
    dot.className          = 'ct-dot none';
    route.style.display    = 'none';
    ctActionArea.innerHTML = `
      <button class="btn-new-trip" id="ctNewTripBtn">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Request Trip
      </button>`;
    document.getElementById('ctNewTripBtn')?.addEventListener('click', () => navigateTo('request'));
    return;
  }

  route.style.display = 'flex';
  ctFrom.textContent  = trip.from;
  ctTo.textContent    = trip.to;

  if (trip.status === 'pending') {
    statusText.textContent = 'Awaiting admin approval';
    dot.className          = 'ct-dot pending';
    ctActionArea.innerHTML = `<span style="font-size:13px;color:var(--muted);">Waiting for approval…</span>`;

  } else if (trip.status === 'approved') {
    statusText.textContent = 'Trip approved — tap Start Journey when ready';
    dot.className          = 'ct-dot active';
    ctActionArea.innerHTML = `
      <button class="btn-new-trip" id="startJourneyBtn" style="background:#10b981;">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        Start Journey
      </button>`;
    document.getElementById('startJourneyBtn').addEventListener('click', () => startJourney(trip));

  } else if (trip.status === 'started') {
    statusText.textContent = 'Journey in progress';
    dot.className          = 'ct-dot active';
    ctActionArea.innerHTML = `
      <button class="btn-new-trip" id="completeJourneyBtn" 
        style="background:#2563eb;opacity:0.4;cursor:not-allowed;" disabled>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        Complete Journey
      </button>
      <div id="distanceHint" style="font-size:12px;color:var(--muted);margin-top:6px;text-align:center;">
        Checking your location…
      </div>`;

    startLocationTracking(trip);
}
}

// ─────────────────────────────
// START JOURNEY
// ─────────────────────────────
async function startJourney(trip) {
  const btn = document.getElementById('startJourneyBtn');
  if (btn) { btn.textContent = 'Checking location…'; btn.disabled = true; }

  if (!navigator.geolocation) {
    alert('Geolocation is not supported on this device.');
    if (btn) { btn.textContent = 'Start Journey'; btn.disabled = false; }
    return;
  }

  navigator.geolocation.getCurrentPosition(
    async (position) => {
      const currentLat = position.coords.latitude;
      const currentLng = position.coords.longitude;

      // Check if worker is within 500m of the start point
      if (trip.start_lat && trip.start_lng) {
        const distToStart = haversineKm(
          currentLat, currentLng,
          parseFloat(trip.start_lat),
          parseFloat(trip.start_lng)
        ) * 1000; // convert to metres

        if (distToStart > 500) {
          const distText = distToStart > 1000
            ? `${(distToStart / 1000).toFixed(1)} km`
            : `${Math.round(distToStart)} metres`;

          alert(
            `You are ${distText} away from your start location.\n\n` +
            `Please move closer to your start point before beginning the journey.`
          );
          if (btn) { btn.textContent = 'Start Journey'; btn.disabled = false; }
          return;
        }
      }

      // Within range — start the trip
      if (btn) { btn.textContent = 'Starting…'; }

      try {
        const token = getToken();
        const res   = await fetch(`${API_BASE}/trips/${trip.id}/start`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': token
          },
          body: JSON.stringify({ currentLat, currentLng })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to start journey');

        activeTrip = { ...trip, status: 'started' };
        renderCurrentTrip(activeTrip);
        startLocationTracking(activeTrip);

      } catch (err) {
        alert(`Could not start journey: ${err.message}`);
        if (btn) { btn.textContent = 'Start Journey'; btn.disabled = false; }
      }
    },
    (err) => {
      alert('Could not get your location. Please enable location access and try again.');
      if (btn) { btn.textContent = 'Start Journey'; btn.disabled = false; }
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
}
// ─────────────────────────────
// LOCATION TRACKING (during journey)
// ─────────────────────────────
function startLocationTracking(trip) {
  if (!navigator.geolocation) return;
  if (watchId) navigator.geolocation.clearWatch(watchId);

  watchId = navigator.geolocation.watchPosition(
    async (position) => {
      const currentLat = position.coords.latitude;
      const currentLng = position.coords.longitude;

      // ── Check proximity to destination ──
      const btn         = document.getElementById('completeJourneyBtn');
      const hint        = document.getElementById('distanceHint');
      const endLat      = parseFloat(trip.endLat || trip.end_lat);
      const endLng      = parseFloat(trip.endLng || trip.end_lng);

      if (btn && !isNaN(endLat) && !isNaN(endLng)) {
        const distM = haversineKm(currentLat, currentLng, endLat, endLng) * 1000;

        if (distM <= 500) {
          // Within range — enable button
          btn.disabled       = false;
          btn.style.opacity  = '1';
          btn.style.cursor   = 'pointer';
          if (hint) hint.textContent = '✓ You have arrived — you can complete the journey';
          if (hint) hint.style.color = '#10b981';
          btn.onclick = () => completeJourney(trip, currentLat, currentLng);
        } else {
          // Too far — keep disabled
          btn.disabled       = true;
          btn.style.opacity  = '0.4';
          btn.style.cursor   = 'not-allowed';
          const distText = distM > 1000
            ? `${(distM / 1000).toFixed(1)} km`
            : `${Math.round(distM)} m`;
          if (hint) hint.textContent = `${distText} away from destination`;
          if (hint) hint.style.color = 'var(--muted)';
        }
      }

      // Send location update to backend
      try {
        const token = getToken();
        await fetch(`${API_BASE}/trips/${trip.id}/location`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'Authorization': token },
          body: JSON.stringify({ currentLat, currentLng })
        });
      } catch (e) {
        // Silent fail
      }
    },
    (err) => console.warn('Location watch error:', err),
    { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
  );
}

// ─────────────────────────────
// ARRIVAL PROMPT
// ─────────────────────────────
let arrivalPromptShown = false;
function showArrivalPrompt(trip, currentLat, currentLng) {
  if (arrivalPromptShown) return;
  arrivalPromptShown = true;

  const confirm = window.confirm(
    `You appear to have arrived at your destination!\n\nTap OK to complete this journey.`
  );
  if (confirm) completeJourney(trip, currentLat, currentLng);
}

// ─────────────────────────────
// COMPLETE JOURNEY
// ─────────────────────────────
async function completeJourney(trip, currentLat = null, currentLng = null) {
  const btn = document.getElementById('completeJourneyBtn');
  if (btn) { btn.textContent = 'Completing…'; btn.disabled = true; }

  if (watchId) { navigator.geolocation.clearWatch(watchId); watchId = null; }
  arrivalPromptShown = false;

  // Get current position if not passed in
  const doComplete = async (lat, lng) => {
    try {
      const token = getToken();
      const res   = await fetch(`${API_BASE}/trips/${trip.id}/complete`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token
        },
        body: JSON.stringify({ currentLat: lat, currentLng: lng, deviationM: 0 })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to complete journey');

      activeTrip = null;
      loadData();

    } catch (err) {
      alert(`Could not complete journey: ${err.message}`);
      if (btn) { btn.textContent = 'Complete Journey'; btn.disabled = false; }
    }
  };

  if (currentLat && currentLng) {
    doComplete(currentLat, currentLng);
  } else {
    navigator.geolocation.getCurrentPosition(
      (pos) => doComplete(pos.coords.latitude, pos.coords.longitude),
      ()    => doComplete(0, 0)
    );
  }
}

// ─────────────────────────────
// STATS
// ─────────────────────────────
function renderStats(stats) {
  animateNumber('statTotal',     stats.totalTrips     || 0);
  animateNumber('statPending',   stats.pendingRequests || 0);
  animateNumber('statCompleted', stats.completedTrips  || 0);
  const km = stats.totalKm || 0;
  document.getElementById('statKm').textContent = `${km.toLocaleString()} km`;
}

function animateNumber(id, target) {
  const el = document.getElementById(id);
  if (!el) return;
  const dur   = 600;
  const start = performance.now();
  function step(now) {
    const p = Math.min((now - start) / dur, 1);
    el.textContent = Math.round(p * target);
    if (p < 1) requestAnimationFrame(step);
    else el.textContent = target;
  }
  requestAnimationFrame(step);
}

// ─────────────────────────────
// RECENT TRIPS
// ─────────────────────────────
function renderRecentTrips() {
  const container = document.getElementById('recentTripsList');
  const recent    = allTrips.slice(0, 4);

  if (!recent.length) {
    container.innerHTML = `
      <div class="empty-state">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.3"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        <p>No trips yet</p>
      </div>`;
    return;
  }

  const icons = {
    completed: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
    approved:  `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
    pending:   `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
    rejected:  `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
  };

  container.innerHTML = recent.map(t => `
    <div class="recent-trip-item">
      <div class="recent-trip-icon">${icons[t.status] || ''}</div>
      <div class="recent-trip-info">
        <div class="recent-trip-route">${t.from} → ${t.to}</div>
        <div class="recent-trip-meta">${t.distanceKm} km · ₦${(t.fuelCost || 0).toLocaleString()} · ${t.date}</div>
      </div>
      <span class="badge badge-${t.status}">${capitalise(t.status)}</span>
    </div>
  `).join('');
}

// ─────────────────────────────
// RECENT NOTIFS
// ─────────────────────────────
function renderRecentNotifs() {
  const container = document.getElementById('recentNotifList');
  const badge     = document.getElementById('notifBadge');

  if (!allNotifs.length) {
    container.innerHTML = `
      <div class="empty-state">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.3"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
        <p>No notifications yet</p>
      </div>`;
    badge.style.display = 'none';
    return;
  }

  const unread = allNotifs.filter(n => n.type === 'success' || n.type === 'warn').length;
  if (unread > 0) { badge.textContent = `${unread} new`; badge.style.display = 'inline-flex'; }

  container.innerHTML = allNotifs.slice(0, 3).map(n => `
    <div class="notif-preview-item">
      <div class="notif-type-dot ${n.type}"></div>
      <div>
        <div class="notif-preview-msg"><strong>${n.title}:</strong> ${n.desc}</div>
        <div class="notif-preview-time">${n.time}</div>
      </div>
    </div>
  `).join('');
}

// ─────────────────────────────
// HISTORY TABLE
// ─────────────────────────────
function renderHistoryTable(filter = 'all') {
  const tbody = document.getElementById('historyTableBody');
  const rows  = filter === 'all' ? allTrips : allTrips.filter(t => t.status === filter);

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="table-empty">No trips found</td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map(t => `
    <tr>
      <td style="font-size:.82rem;">${t.from}</td>
      <td style="font-size:.82rem;">${t.to}</td>
      <td>${t.distanceKm} km</td>
      <td>${t.fuelCost ? `₦${t.fuelCost.toLocaleString()}` : '—'}</td>
      <td><span class="badge badge-${t.status}">${capitalise(t.status)}</span></td>
      <td style="color:var(--muted);font-size:.76rem;">${t.date}</td>
    </tr>
  `).join('');
}

document.addEventListener('DOMContentLoaded', () => {
  const sel = document.getElementById('historyFilter');
  if (sel) sel.addEventListener('change', e => renderHistoryTable(e.target.value));
});

// ─────────────────────────────
// NOTIFICATIONS SECTION
// ─────────────────────────────
function renderNotifsSection() {
  const container = document.getElementById('notifsFullList');

  if (!allNotifs.length) {
    container.innerHTML = `
      <div class="empty-state large">
        <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" opacity="0.25"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
        <p>No notifications yet</p>
        <span>You'll see updates from your fleet manager here</span>
      </div>`;
    return;
  }

  const icons = {
    success: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
    warn:    `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
    info:    `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
  };

  container.innerHTML = allNotifs.map(n => `
    <div class="notif-full-item">
      <div class="notif-full-icon ${n.type}">${icons[n.type] || ''}</div>
      <div class="notif-full-body">
        <div class="notif-full-title">${n.title}</div>
        <div class="notif-full-desc">${n.desc}</div>
        <div class="notif-full-time">${n.time}</div>
      </div>
    </div>
  `).join('');

  document.getElementById('clearNotifsBtn').addEventListener('click', () => {
    allNotifs = [];
    renderNotifsSection();
    renderRecentNotifs();
    updateSidebarBadges();
  });
}

// ─────────────────────────────
// SIDEBAR BADGES
// ─────────────────────────────
function updateSidebarBadges() {
  document.getElementById('sidebarTripCount').textContent = allTrips.length;
  const notifBadge  = document.getElementById('sidebarNotifCount');
  const notifCount  = allNotifs.filter(n => n.type === 'success' || n.type === 'warn').length;
  if (notifCount > 0) { notifBadge.textContent = notifCount; notifBadge.style.display = 'inline-flex'; }
  else notifBadge.style.display = 'none';
}

// ─────────────────────────────
// TRIP MAP
// ─────────────────────────────
function initTripMap() {
  tripMap = L.map('tripMap').setView([6.524, 3.379], 11);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
    maxZoom: 18,
  }).addTo(tripMap);

  tripMap.on('click', handleMapClick);
  setupLocationSearch('startSearchInput', 'startSuggestions', 'start');
  setupLocationSearch('endSearchInput',   'endSuggestions',   'end');
}


// ─────────────────────────────
// USE MY LOCATION BUTTON
// ─────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('useMyLocationBtn')?.addEventListener('click', useMyLocation);
});

function useMyLocation() {
  const btn = document.getElementById('useMyLocationBtn');
  if (!navigator.geolocation) {
    alert('Geolocation is not supported on this device.');
    return;
  }

  btn.textContent = '📍 Getting location…';
  btn.disabled    = true;

  navigator.geolocation.getCurrentPosition(
    async (position) => {
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;

      // Place marker on map
      if (startMarker) tripMap.removeLayer(startMarker);
      startMarker = L.marker([lat, lng], { icon: createMarkerIcon('green') })
        .addTo(tripMap).bindPopup('Your location').openPopup();
      startLatLng = { lat, lng };

      // Reverse geocode to get a readable name
      try {
        const res  = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=en`
        );
        const data = await res.json();
        const name = shortName(data.display_name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`);
        document.getElementById('startSearchInput').value = name;
      } catch {
        document.getElementById('startSearchInput').value = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
      }

      document.getElementById('startLocation').value = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
      tripMap.setView([lat, lng], 14);

      btn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/><circle cx="12" cy="12" r="9" stroke-dasharray="3 3"/></svg>
        Use my current location`;
      btn.disabled = false;

      if (!endLatLng) setMapStep(2); else tryDrawRoute();
    },
    (err) => {
      alert('Could not get your location. Please enable location access in your browser settings.');
      btn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/><circle cx="12" cy="12" r="9" stroke-dasharray="3 3"/></svg>
        Use my current location`;
      btn.disabled = false;
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
}


function setupLocationSearch(inputId, suggestionsId, role) {
  const input       = document.getElementById(inputId);
  const suggestions = document.getElementById(suggestionsId);
  if (!input || !suggestions) return;

  let debounceTimer = null;
  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    const query = input.value.trim();
    if (query.length < 3) { hideSuggestions(suggestions); return; }
    debounceTimer = setTimeout(() => geocodeSearch(query, suggestions, input, role), 350);
  });

  document.addEventListener('click', e => {
    if (!input.contains(e.target) && !suggestions.contains(e.target)) hideSuggestions(suggestions);
  });
  input.addEventListener('keydown', e => { if (e.key === 'Escape') hideSuggestions(suggestions); });
}

async function geocodeSearch(query, suggestionsEl, inputEl, role) {
  try {
    const url  = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&countrycodes=ng&accept-language=en`;
    const res  = await fetch(url, { headers: { 'Accept-Language': 'en' } });
    const data = await res.json();

    if (!data.length) {
      suggestionsEl.innerHTML = `<div class="loc-suggestion-empty">No results found</div>`;
      showSuggestions(suggestionsEl);
      return;
    }

    suggestionsEl.innerHTML = data.map((place, i) => `
      <div class="loc-suggestion-item" data-index="${i}" data-lat="${place.lat}" data-lon="${place.lon}" data-name="${escHtml(place.display_name)}">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;opacity:.5"><circle cx="12" cy="10" r="3"/><path d="M12 2a8 8 0 0 0-8 8c0 5.25 8 14 8 14s8-8.75 8-14a8 8 0 0 0-8-8z"/></svg>
        <div class="loc-suggestion-text">
          <div class="loc-suggestion-name">${shortName(place.display_name)}</div>
          <div class="loc-suggestion-full">${escHtml(place.display_name)}</div>
        </div>
      </div>
    `).join('');

    showSuggestions(suggestionsEl);
    suggestionsEl.querySelectorAll('.loc-suggestion-item').forEach(item => {
      item.addEventListener('click', () => {
        selectLocation(parseFloat(item.dataset.lat), parseFloat(item.dataset.lon), item.dataset.name, role, inputEl, suggestionsEl);
      });
    });
  } catch (err) { console.error('Geocode error:', err); }
}

function selectLocation(lat, lon, displayName, role, inputEl, suggestionsEl) {
  hideSuggestions(suggestionsEl);
  inputEl.value = shortName(displayName);
  const latlng  = { lat, lng: lon };

  if (role === 'start') {
    if (startMarker) tripMap.removeLayer(startMarker);
    startMarker = L.marker([lat, lon], { icon: createMarkerIcon('green') }).addTo(tripMap).bindPopup('Start').openPopup();
    startLatLng = latlng;
    document.getElementById('startLocation').value = `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
    if (!endLatLng) setMapStep(2); else tryDrawRoute();
    tripMap.setView([lat, lon], 13);
  } else {
    if (endMarker) tripMap.removeLayer(endMarker);
    endMarker = L.marker([lat, lon], { icon: createMarkerIcon('red') }).addTo(tripMap).bindPopup('Destination').openPopup();
    endLatLng = latlng;
    document.getElementById('endLocation').value = `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
    if (!startLatLng) tripMap.setView([lat, lon], 13); else tryDrawRoute();
  }
}

function tryDrawRoute() {
  if (!startLatLng || !endLatLng) return;
  setMapStep(3);
  if (window._routeLine) tripMap.removeLayer(window._routeLine);
  window._routeLine = L.polyline(
    [[startLatLng.lat, startLatLng.lng], [endLatLng.lat, endLatLng.lng]],
    { color: '#2563eb', weight: 3, dashArray: '8 6', opacity: .8 }
  ).addTo(tripMap);
  tripMap.fitBounds([[startLatLng.lat, startLatLng.lng], [endLatLng.lat, endLatLng.lng]], { padding: [40, 40] });

  const dist = haversineKm(startLatLng.lat, startLatLng.lng, endLatLng.lat, endLatLng.lng);
  const fuel  = Math.round(dist * 950 * 0.12);
  document.getElementById('estDistance').textContent = `${dist.toFixed(1)} km`;
  document.getElementById('estFuelCost').textContent = `₦${fuel.toLocaleString()} (estimated)`;
  document.getElementById('tripEstimate').style.display = 'block';
  document.getElementById('mapResetBar').style.display  = 'flex';
  document.getElementById('mapRouteText').textContent   = `${dist.toFixed(1)} km route selected`;
  document.getElementById('submitTripBtn').disabled     = false;
}

function handleMapClick(e) {
  const { lat, lng } = e.latlng;
  if (mapStep === 1) {
    if (startMarker) tripMap.removeLayer(startMarker);
    startMarker = L.marker([lat, lng], { icon: createMarkerIcon('green') }).addTo(tripMap).bindPopup('Start').openPopup();
    startLatLng = { lat, lng };
    document.getElementById('startLocation').value    = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    document.getElementById('startSearchInput').value = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    setMapStep(2);
  } else if (mapStep === 2) {
    if (endMarker) tripMap.removeLayer(endMarker);
    endMarker = L.marker([lat, lng], { icon: createMarkerIcon('red') }).addTo(tripMap).bindPopup('Destination').openPopup();
    endLatLng = { lat, lng };
    document.getElementById('endLocation').value    = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    document.getElementById('endSearchInput').value = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    tryDrawRoute();
  }
}

function setMapStep(step) {
  mapStep = step;
  document.querySelectorAll('.map-instr-step').forEach((el, i) => {
    el.classList.remove('active', 'done');
    if (i + 1 < step) el.classList.add('done');
    if (i + 1 === step) el.classList.add('active');
  });
}

function createMarkerIcon(color) {
  const c = color === 'green' ? '#10b981' : '#ef4444';
  return L.divIcon({
    className: '',
    html: `<div style="width:16px;height:16px;background:${c};border-radius:50%;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.3);"></div>`,
    iconSize: [16, 16], iconAnchor: [8, 8],
  });
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const R    = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a    = Math.sin(dLat/2)**2 +
               Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) *
               Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('resetMapBtn')?.addEventListener('click', resetMap);
  document.getElementById('submitTripBtn')?.addEventListener('click', submitTrip);
  document.getElementById('anotherTripBtn')?.addEventListener('click', () => {
    document.getElementById('tripSuccessCard').style.display = 'none';
    document.getElementById('tripVehicle').value = `${currentUser?.vehicleType} — ${currentUser?.plateNo}`;
    resetMap();
  });
});

function resetMap() {
  if (startMarker) { tripMap.removeLayer(startMarker); startMarker = null; }
  if (endMarker)   { tripMap.removeLayer(endMarker);   endMarker   = null; }
  if (window._routeLine) { tripMap.removeLayer(window._routeLine); window._routeLine = null; }
  startLatLng = null; endLatLng = null; mapStep = 1;
  setMapStep(1);
  document.getElementById('startLocation').value    = '';
  document.getElementById('endLocation').value      = '';
  document.getElementById('startSearchInput').value = '';
  document.getElementById('endSearchInput').value   = '';
  document.getElementById('tripEstimate').style.display = 'none';
  document.getElementById('mapResetBar').style.display  = 'none';
  document.getElementById('submitTripBtn').disabled     = true;
  document.getElementById('tripError').style.display    = 'none';
  tripMap.setView([6.524, 3.379], 11);
}

async function submitTrip() {
  const startLoc = document.getElementById('startLocation').value;
  const endLoc   = document.getElementById('endLocation').value;
  const notes    = document.getElementById('tripNotes').value;

  if (!startLoc || !endLoc) { showTripError('Please select both start and destination on the map.'); return; }

  const btn = document.getElementById('submitTripBtn');
  btn.querySelector('.btn-text').style.display    = 'none';
  btn.querySelector('.btn-spinner').style.display = 'inline';
  btn.disabled = true;

  try {
    const token = getToken();
    const res   = await fetch(`${API_BASE}/trips`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': token },
      body: JSON.stringify({
        startLocation: startLoc, endLocation: endLoc,
        startLat: startLatLng.lat, startLng: startLatLng.lng,
        endLat:   endLatLng.lat,   endLng:   endLatLng.lng,
        notes,
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to submit trip');

    btn.querySelector('.btn-text').style.display    = 'inline';
    btn.querySelector('.btn-spinner').style.display = 'none';
    document.getElementById('tripSuccessCard').style.display = 'block';
    document.getElementById('tripVehicle').value = '';
    resetMap();
    loadData();

  } catch (err) {
    btn.querySelector('.btn-text').style.display    = 'inline';
    btn.querySelector('.btn-spinner').style.display = 'none';
    btn.disabled = false;
    showTripError(err.message);
  }
}

function showTripError(msg) {
  const el = document.getElementById('tripError');
  el.textContent   = msg;
  el.style.display = 'block';
}

function showSuggestions(el) { el.style.display = 'block'; }
function hideSuggestions(el) { el.style.display = 'none'; el.innerHTML = ''; }

function shortName(displayName) {
  return displayName.split(',').slice(0, 2).join(',').trim();
}

function escHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function capitalise(str) {
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
}