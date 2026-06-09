// ── FleetSentry Admin Dashboard JS ──
const API_BASE = 'https://nl3jlu9oe7.execute-api.eu-north-1.amazonaws.com';

// ─────────────────────────────
// STATE
// ─────────────────────────────
let currentUser   = null;
let currentTrip   = null;
let liveMap       = null;
let modalMap      = null;
let notifications = [];
let allDrivers    = [];
let allTrips      = [];
let allAlerts     = [];
let dashboardRefreshInterval = null;

// ─────────────────────────────
// TOKEN HELPER
// ─────────────────────────────
function getToken() {
  const user = JSON.parse(localStorage.getItem('fs_user'));
  return user.userId || user.user_id || localStorage.getItem('fs_token');
}

// ─────────────────────────────
// BFCACHE AUTH CHECK
// Prevents forward-navigation restoring dashboard after logout
// ─────────────────────────────
window.addEventListener('pageshow', (e) => {
  if (e.persisted) {
    const user = localStorage.getItem('fs_user');
    const role = localStorage.getItem('fs_role');
    if (!user || role !== 'admin') {
      window.location.replace('/Login/index.html');
    }
  }
});

// ─────────────────────────────
// INIT
// ─────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadUserFromStorage();
  startClock();
  setupNavigation();
  setupNotifications();
  setupModal();
  setupMobileMenu();
  loadDashboardData();

  // Auto-refresh every 30 seconds
  dashboardRefreshInterval = setInterval(() => {
    loadDashboardData();
  }, 30000);
});

function loadUserFromStorage() {
  const stored = localStorage.getItem('fs_user');
  const role   = localStorage.getItem('fs_role');

  if (!stored || role !== 'admin') {
    window.location.replace('/Login/index.html');
    return;
  }

  currentUser = JSON.parse(stored);

  const fullName    = `${currentUser.firstName} ${currentUser.lastName}`;
  const initials    = currentUser.firstName[0] + currentUser.lastName[0];
  const companyName = currentUser.companyName || currentUser.company_name || '';

  document.getElementById('sidebarName').textContent        = fullName;
  document.getElementById('sidebarAvatar').textContent      = initials;
  document.getElementById('topbarName').textContent         = fullName;
  document.getElementById('topbarAvatar').textContent       = initials;
  document.getElementById('companyNameDisplay').textContent = companyName;

  const sub = document.getElementById('overviewSub');
  if (sub) sub.textContent = `${companyName} fleet overview`;
}

// ─────────────────────────────
// CLOCK + GREETING
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
      const section = item.dataset.section;
      if (section) navigateTo(section);
    });
  });

  document.querySelectorAll('.card-link[data-section]').forEach(link => {
    link.addEventListener('click', () => navigateTo(link.dataset.section));
  });

  document.getElementById('logoutBtn').addEventListener('click', () => {
    Swal.fire({
      title: 'Logout?',
      text: 'Are you sure you want to logout?',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Yes, logout',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#6b7280',
    }).then((result) => {
      if (result.isConfirmed) {
        // Stop all intervals before clearing storage
        if (dashboardRefreshInterval) clearInterval(dashboardRefreshInterval);
        if (liveMapInterval) clearInterval(liveMapInterval);
        localStorage.clear();
        window.location.replace('/Login/index.html');
      }
    });
  });

  document.getElementById('refreshBtn').addEventListener('click', loadDashboardData);
}

function navigateTo(sectionId) {
  if (sectionId !== 'map' && liveMapInterval) {
    clearInterval(liveMapInterval);
    liveMapInterval = null;
    liveMarkers = {};
  }

  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  const target = document.getElementById(`section-${sectionId}`);
  if (target) target.classList.add('active');

  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.section === sectionId);
  });

  if (sectionId === 'map' && !liveMap) initLiveMap();
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
// NOTIFICATIONS
// ─────────────────────────────
function setupNotifications() {
  const btn    = document.getElementById('notifBtn');
  const drawer = document.getElementById('notifDrawer');
  const clear  = document.getElementById('clearNotifs');

  btn.addEventListener('click', e => {
    e.stopPropagation();
    drawer.classList.toggle('open');
  });
  document.addEventListener('click', e => {
    if (!drawer.contains(e.target) && e.target !== btn) {
      drawer.classList.remove('open');
    }
  });
  clear.addEventListener('click', () => {
    notifications = [];
    renderNotifications();
  });
}

function addNotification(type, msg) {
  notifications.unshift({ type, msg, time: 'Just now' });
  renderNotifications();
  document.getElementById('notifDot').classList.add('show');
}

function renderNotifications() {
  const list = document.getElementById('notifList');
  const dot  = document.getElementById('notifDot');
  if (!notifications.length) {
    list.innerHTML = '<div class="notif-empty">No new notifications</div>';
    dot.classList.remove('show');
    return;
  }
  list.innerHTML = notifications.map(n => `
    <div class="notif-item">
      <div class="notif-dot-type ${n.type}"></div>
      <div>
        <div class="notif-msg">${n.msg}</div>
        <div class="notif-time">${n.time}</div>
      </div>
    </div>
  `).join('');
}

// ─────────────────────────────
// LOAD DASHBOARD DATA
// ─────────────────────────────
async function loadDashboardData() {
  try {
    const token = getToken();

    const res  = await fetch(`${API_BASE}/dashboard`, {
      headers: { 'Authorization': token }
    });
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || 'Failed to load dashboard');

    allDrivers = data.drivers || [];
    allTrips   = data.trips   || [];
    allAlerts  = data.alerts  || [];

    const stats = data.stats || {
      totalDrivers:      0,
      activeTrips:       0,
      pendingRequests:   0,
      monthlyFuelCost:   0,
      totalKm:           0,
      fuelPricePerLitre: 950,
    };

    renderStats(stats);
    renderTripRequests();
    renderAlerts();
    renderDriversTable();
    renderTripsTable();
    renderFuelTable(stats);
    renderAlertsSection();
    updateSidebarBadges();

    // If the live map is open, refresh markers too
    if (liveMap) renderLiveMarkers();

  } catch (err) {
    console.error('Dashboard load error:', err);
    addNotification('danger', `Failed to load dashboard: ${err.message}`);
  }
}

// ─────────────────────────────
// STATS
// ─────────────────────────────
function renderStats(stats) {
  animateNumber('statDrivers', stats.totalDrivers);
  animateNumber('statActive',  stats.activeTrips);
  animateNumber('statPending', stats.pendingRequests);

  const fuel = document.getElementById('statFuel');
  fuel.textContent = `₦${(stats.monthlyFuelCost || 0).toLocaleString()}`;

  const pending = allTrips.filter(t => t.status === 'pending').length;
  document.getElementById('trendPending').textContent  = pending > 0 ? `${pending} awaiting` : 'All clear';
  document.getElementById('pendingBadge').textContent  = `${pending} pending`;
  document.getElementById('alertBadge').textContent    = `${allAlerts.filter(a => a.type === 'danger').length} active`;
}

function animateNumber(id, target) {
  const el    = document.getElementById(id);
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
// TRIP REQUESTS (overview card)
// ─────────────────────────────
function renderTripRequests() {
  const pending = allTrips.filter(t => t.status === 'pending');
  const list    = document.getElementById('tripRequestsList');

  if (!pending.length) {
    list.innerHTML = `
      <div class="empty-state">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.3">
          <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
        </svg>
        <p>No pending trip requests</p>
      </div>`;
    return;
  }

  list.innerHTML = pending.map(trip => `
    <div class="trip-item" data-id="${trip.id}">
      <div class="trip-avatar">${trip.driverName.split(' ').map(n => n[0]).join('')}</div>
      <div class="trip-info">
        <div class="trip-driver">${trip.driverName}</div>
        <div class="trip-route">${trip.fromName || trip.from} → ${trip.toName || trip.to}</div>
      </div>
      <div class="trip-actions">
        <button class="trip-btn reject"  onclick="quickAction('${trip.id}','rejected')">✕</button>
        <button class="trip-btn approve" onclick="quickAction('${trip.id}','approved')">✓</button>
      </div>
    </div>
  `).join('');

  list.querySelectorAll('.trip-item').forEach(item => {
    item.addEventListener('click', e => {
      if (e.target.closest('.trip-actions')) return;
      openTripModal(item.dataset.id);
    });
  });
}

// ─────────────────────────────
// ALERTS (overview card)
// ─────────────────────────────
function renderAlerts() {
  const list = document.getElementById('alertsList');
  if (!allAlerts.length) {
    list.innerHTML = `
      <div class="empty-state">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.3">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>
        <p>No active alerts</p>
      </div>`;
    return;
  }
  list.innerHTML = allAlerts.slice(0, 4).map(a => `
    <div class="alert-item">
      <div class="alert-dot ${a.type}"></div>
      <div class="alert-msg">
        ${a.desc}
        <div class="alert-time">${a.time}</div>
      </div>
    </div>
  `).join('');
}

// ─────────────────────────────
// DRIVERS TABLE
// ─────────────────────────────
function renderDriversTable(filter = '') {
  const tbody = document.getElementById('driversTableBody');
  const rows  = filter
    ? allDrivers.filter(d =>
        `${d.firstName} ${d.lastName} ${d.vehicleType} ${d.plateNo}`
          .toLowerCase().includes(filter.toLowerCase()))
    : allDrivers;

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="table-empty">No drivers found</td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map(d => `
    <tr>
      <td>
        <div class="driver-cell">
          <div class="driver-cell-avatar">${d.firstName[0]}${d.lastName[0]}</div>
          <div>
            <div class="driver-cell-name">${d.firstName} ${d.lastName}</div>
            <div class="driver-cell-email">${d.email}</div>
          </div>
        </div>
      </td>
      <td>${d.vehicleType || '—'}</td>
      <td><code style="font-size:.78rem;background:var(--bg);padding:2px 6px;border-radius:4px;">${d.plateNo || '—'}</code></td>
      <td>
        ${d.status === 'pending'
          ? `<div style="display:flex;gap:6px;">
               <button class="trip-btn reject"  onclick="actionWorker('${d.id}','reject')">Reject</button>
               <button class="trip-btn approve" onclick="actionWorker('${d.id}','approve')">Approve</button>
             </div>`
          : `<span class="badge badge-${d.status}">${capitalise(d.status)}</span>`
        }
      </td>
      <td>${d.totalTrips || 0}</td>
      <td style="color:var(--muted);font-size:.78rem;">${d.lastActive || 'N/A'}</td>
    </tr>
  `).join('');
}

document.addEventListener('DOMContentLoaded', () => {
  const search = document.getElementById('driverSearch');
  if (search) search.addEventListener('input', e => renderDriversTable(e.target.value));
});

// ─────────────────────────────
// APPROVE / REJECT WORKER
// ─────────────────────────────
async function actionWorker(workerId, action) {
  const token = getToken();
  try {
    const res  = await fetch(`${API_BASE}/workers/${workerId}/${action}`, {
      method: 'PUT',
      headers: { 'Authorization': token }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Action failed');
    addNotification(
      action === 'approve' ? 'success' : 'warn',
      data.message || `Worker ${action}d successfully`
    );
    loadDashboardData();
  } catch (err) {
    addNotification('danger', `Failed: ${err.message}`);
  }
}

// ─────────────────────────────
// TRIPS TABLE
// ─────────────────────────────
function renderTripsTable(filter = 'all') {
  const tbody = document.getElementById('tripsTableBody');
  const rows  = filter === 'all' ? allTrips : allTrips.filter(t => t.status === filter);

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="table-empty">No trips found</td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map(t => `
    <tr>
      <td><strong style="font-size:.82rem;">${t.driverName}</strong></td>
      <td style="font-size:.78rem;">${t.fromName || t.from}</td>
      <td style="font-size:.78rem;">${t.toName   || t.to}</td>
      <td>${t.vehicleType || '—'}</td>
      <td style="color:var(--muted);font-size:.76rem;">${t.requestedAt}</td>
      <td><span class="badge badge-${t.status}">${capitalise(t.status)}</span></td>
      <td>
        ${t.status === 'pending' ? `
          <div style="display:flex;gap:6px;">
            <button class="trip-btn reject"  onclick="quickAction('${t.id}','rejected')">Reject</button>
            <button class="trip-btn approve" onclick="quickAction('${t.id}','approved')">Approve</button>
          </div>
        ` : `<span style="color:var(--muted);font-size:.76rem;">—</span>`}
      </td>
    </tr>
  `).join('');
}

document.addEventListener('DOMContentLoaded', () => {
  const sel = document.getElementById('tripFilter');
  if (sel) sel.addEventListener('change', e => renderTripsTable(e.target.value));
});

// ─────────────────────────────
// FUEL TABLE
// ─────────────────────────────
function renderFuelTable(stats) {
  document.getElementById('fuelTotalCost').textContent = `₦${(stats.monthlyFuelCost || 0).toLocaleString()}`;
  document.getElementById('fuelTotalKm').textContent   = `${(stats.totalKm || 0).toLocaleString()} km`;
  document.getElementById('fuelPricePerL').textContent = `₦${stats.fuelPricePerLitre || 0}/L`;

  const completed = allTrips.filter(t => t.status === 'completed' || t.status === 'approved');
  const tbody = document.getElementById('fuelTableBody');

  if (!completed.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="table-empty">No fuel data yet</td></tr>`;
    return;
  }

  tbody.innerHTML = completed.map(t => {
    const litres = ((t.fuelCost || 0) / (stats.fuelPricePerLitre || 950)).toFixed(1);
    return `
      <tr>
        <td><strong style="font-size:.82rem;">${t.driverName}</strong></td>
        <td style="font-size:.76rem;">${t.fromName || t.from} → ${t.toName || t.to}</td>
        <td>${t.distanceKm || 0} km</td>
        <td>${litres} L</td>
        <td>₦${(t.fuelCost || 0).toLocaleString()}</td>
        <td style="color:var(--muted);font-size:.76rem;">${t.requestedAt}</td>
      </tr>
    `;
  }).join('');
}

// ─────────────────────────────
// ALERTS SECTION (full page)
// ─────────────────────────────
function renderAlertsSection() {
  const container = document.getElementById('alertsFullList');
  if (!allAlerts.length) {
    container.innerHTML = `
      <div class="empty-state large">
        <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" opacity="0.25">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>
        <p>No alerts at the moment</p>
        <span>Your fleet is operating normally</span>
      </div>`;

    // Re-attach clear button listener safely
    const clearBtn = document.getElementById('clearAlertsBtn');
    if (clearBtn) {
      clearBtn.replaceWith(clearBtn.cloneNode(true));
      document.getElementById('clearAlertsBtn').addEventListener('click', () => {
        allAlerts = [];
        renderAlertsSection();
        renderAlerts();
        updateSidebarBadges();
      });
    }
    return;
  }

  const icons = {
    danger: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
    warn:   `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
    info:   `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
  };

  container.innerHTML = allAlerts.map(a => `
    <div class="alert-full-item">
      <div class="alert-full-icon ${a.type}">${icons[a.type] || ''}</div>
      <div class="alert-full-body">
        <div class="alert-full-title">${a.title}</div>
        <div class="alert-full-desc">${a.desc}</div>
      </div>
      <div class="alert-full-time">${a.time}</div>
    </div>
  `).join('');

  // Clone to remove any duplicate listeners before re-attaching
  const clearBtn = document.getElementById('clearAlertsBtn');
  if (clearBtn) {
    const newBtn = clearBtn.cloneNode(true);
    clearBtn.replaceWith(newBtn);
    newBtn.addEventListener('click', () => {
      allAlerts = [];
      renderAlertsSection();
      renderAlerts();
      updateSidebarBadges();
    });
  }
}

// ─────────────────────────────
// SIDEBAR BADGES
// ─────────────────────────────
function updateSidebarBadges() {
  const pending = allTrips.filter(t => t.status === 'pending').length;
  const alerts  = allAlerts.filter(a => a.type === 'danger').length;

  document.getElementById('sidebarDriverCount').textContent  = allDrivers.length;
  document.getElementById('sidebarPendingCount').textContent = pending;
  document.getElementById('sidebarAlertCount').textContent   = alerts;
}

// ─────────────────────────────
// LIVE MAP
// ─────────────────────────────
let liveMarkers    = {};
let liveMapInterval = null;

function initLiveMap() {
  liveMap = L.map('liveMap').setView([9.082, 8.675], 6);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
    maxZoom: 18,
  }).addTo(liveMap);

  renderLiveMarkers();

  if (liveMapInterval) clearInterval(liveMapInterval);
  liveMapInterval = setInterval(async () => {
    await loadDashboardData();
    renderLiveMarkers();
  }, 15000);
}

function renderLiveMarkers() {
  const driverListEl = document.getElementById('mapDriverList');
  driverListEl.innerHTML = '';

  const activeTrips = allTrips.filter(t =>
    t.status === 'started' && t.currentLat && t.currentLng
  );

  Object.keys(liveMarkers).forEach(id => {
    if (!activeTrips.find(t => t.id === id)) {
      liveMap.removeLayer(liveMarkers[id]);
      delete liveMarkers[id];
    }
  });

  if (!activeTrips.length) {
    driverListEl.innerHTML = `
      <div style="padding:16px;color:var(--muted);font-size:.83rem;text-align:center;">
        No drivers currently on a trip
      </div>`;
    return;
  }

  const now = Date.now();

  activeTrips.forEach(trip => {
    const lat = parseFloat(trip.currentLat);
    const lng = parseFloat(trip.currentLng);

    const lastUpdate  = trip.locationUpdatedAt ? new Date(trip.locationUpdatedAt).getTime() : null;
    const minsAgo     = lastUpdate ? (now - lastUpdate) / 60000 : 999;
    const isIdle      = minsAgo > 5;
    const dotColor    = isIdle ? '#f59e0b' : '#10b981';
    const statusLabel = isIdle ? `Idle (${Math.floor(minsAgo)}m ago)` : 'On route';
    const dotClass    = isIdle ? 'idle' : 'active';

    const icon = L.divIcon({
      className: '',
      html: `<div style="width:14px;height:14px;background:${dotColor};border-radius:50%;border:2px solid #fff;box-shadow:0 0 0 3px ${dotColor}40;"></div>`,
      iconSize: [14, 14], iconAnchor: [7, 7],
    });

    const popup = `
      <strong>${trip.driverName}</strong><br>
      ${trip.from} → ${trip.to}<br>
      <span style="color:${dotColor};">● ${statusLabel}</span>
    `;

    if (liveMarkers[trip.id]) {
      liveMarkers[trip.id].setLatLng([lat, lng]);
      liveMarkers[trip.id].setIcon(icon);
      liveMarkers[trip.id].getPopup().setContent(popup);
    } else {
      liveMarkers[trip.id] = L.marker([lat, lng], { icon })
        .addTo(liveMap).bindPopup(popup);
    }

    const item = document.createElement('div');
    item.className = 'map-driver-item';
    item.style.cursor = 'pointer';
    item.innerHTML = `
      <div class="map-driver-dot ${dotClass}"></div>
      <div class="map-driver-info">
        <div class="map-driver-name">${trip.driverName}</div>
        <div class="map-driver-loc" style="color:${isIdle ? '#f59e0b' : 'var(--muted)'}">
          ${statusLabel}
        </div>
      </div>`;
    item.addEventListener('click', () => {
      liveMap.setView([lat, lng], 14);
      liveMarkers[trip.id].openPopup();
    });
    driverListEl.appendChild(item);
  });

  if (activeTrips.length > 1) {
    liveMap.fitBounds(activeTrips.map(t => [parseFloat(t.currentLat), parseFloat(t.currentLng)]), { padding: [40, 40] });
  } else if (activeTrips.length === 1) {
    liveMap.setView([parseFloat(activeTrips[0].currentLat), parseFloat(activeTrips[0].currentLng)], 13);
  }
}

// ─────────────────────────────
// TRIP MODAL
// ─────────────────────────────
function setupModal() {
  document.getElementById('closeModal').addEventListener('click', closeTripModal);
  document.getElementById('tripModal').addEventListener('click', e => {
    if (e.target === document.getElementById('tripModal')) closeTripModal();
  });
  document.getElementById('approveTripBtn').addEventListener('click', () => {
    if (currentTrip) { quickAction(currentTrip.id, 'approved'); closeTripModal(); }
  });
  document.getElementById('rejectTripBtn').addEventListener('click', () => {
    if (currentTrip) { quickAction(currentTrip.id, 'rejected'); closeTripModal(); }
  });
}

function openTripModal(tripId) {
  const trip = allTrips.find(t => t.id === tripId);
  if (!trip) return;
  currentTrip = trip;

  document.getElementById('modalDriver').textContent   = trip.driverName;
  document.getElementById('modalVehicle').textContent  = `${trip.vehicleType} — ${trip.plateNo}`;
  document.getElementById('modalFrom').textContent = trip.fromName || trip.from;
  document.getElementById('modalTo').textContent   = trip.toName   || trip.to;
  document.getElementById('modalDistance').textContent = `${trip.distanceKm} km`;
  document.getElementById('modalFuelCost').textContent = `₦${(trip.fuelCost || 0).toLocaleString()}`;

  const footer    = document.querySelector('.modal-footer');
  const isPending = trip.status === 'pending';
  footer.style.display = isPending ? 'flex' : 'none';

  document.getElementById('tripModal').classList.add('open');

  setTimeout(() => {
    if (modalMap) { modalMap.remove(); modalMap = null; }
    modalMap = L.map('modalMap').setView([6.524, 3.379], 10);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
    }).addTo(modalMap);
  }, 100);
}

function closeTripModal() {
  document.getElementById('tripModal').classList.remove('open');
  currentTrip = null;
}

// ─────────────────────────────
// QUICK APPROVE / REJECT TRIP
// ─────────────────────────────
async function quickAction(tripId, newStatus) {
  const token  = getToken();
  const action = newStatus === 'approved' ? 'approve' : 'reject';

  try {
    const res  = await fetch(`${API_BASE}/trips/${tripId}/${action}`, {
      method: 'PUT',
      headers: { 'Authorization': token }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Action failed');

    const verb = newStatus === 'approved' ? 'approved' : 'rejected';
    addNotification(
      newStatus === 'approved' ? 'success' : 'warn',
      `Trip has been ${verb}.`
    );
    loadDashboardData();

  } catch (err) {
    addNotification('danger', `Failed: ${err.message}`);
  }
}

// ─────────────────────────────
// UTILS
// ─────────────────────────────
function capitalise(str) {
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
}