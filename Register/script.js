// FleetSentry — auth.js v2
// Replace API_BASE with your real AWS API Gateway URL when ready.

const API_BASE = 'https://nl3jlu9oe7.execute-api.eu-north-1.amazonaws.com';

// ─────────────────────────────
// UTILITIES
// ─────────────────────────────

function togglePass(inputId, btn) {
  const input = document.getElementById(inputId);
  const hidden = input.type === 'password';
  input.type = hidden ? 'text' : 'password';
  btn.textContent = hidden ? '🙈' : '👁';
}

function showError(id, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.style.display = 'flex';
}
function hideError(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = 'none';
}

function setLoading(btnId, loading) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.disabled = loading;
  btn.querySelector('.btn-text').style.display   = loading ? 'none'   : 'inline';
  btn.querySelector('.btn-spinner').style.display = loading ? 'inline' : 'none';
}

// Password strength indicator
function checkStrength(input, barId, labelId) {
  const val = input.value;
  const segs = document.querySelectorAll(`#${barId} .strength-seg`);
  const label = document.getElementById(labelId);
  let score = 0;
  if (val.length >= 8) score++;
  if (/[A-Z]/.test(val)) score++;
  if (/[0-9]/.test(val)) score++;
  if (/[^A-Za-z0-9]/.test(val)) score++;

  const classes = ['', 'weak', 'medium', 'medium', 'strong'];
  const labels  = ['', 'Weak', 'Fair', 'Good', 'Strong ✓'];
  const colors  = { weak:'#f87171', medium:'#fbbf24', strong:'#10b981' };

  segs.forEach((s, i) => {
    s.className = 'strength-seg';
    if (i < score) s.classList.add(classes[score]);
  });
  if (label) {
    label.textContent = val.length ? labels[score] : '';
    label.style.color = colors[classes[score]] || '#94a3b8';
  }
}

// Load companies from backend
async function loadCompanies(selectId) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  try {
    const res  = await fetch(`${API_BASE}/companies`);
    const data = await res.json();
    sel.innerHTML = '<option value="" disabled selected>Select your company</option>';
    (data.companies || []).forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.name;
      sel.appendChild(opt);
    });
  } catch {
    sel.innerHTML = '<option value="" disabled selected>Could not load — check connection</option>';
  }
}

// ─────────────────────────────
// REGISTER PAGE
// ─────────────────────────────

function switchRole(role) {
  const adminForm = document.getElementById('adminForm');
  const workerForm = document.getElementById('workerForm');
  const tabAdmin  = document.getElementById('tabAdmin');
  const tabWorker = document.getElementById('tabWorker');
  if (!adminForm) return;

  const isAdmin = role === 'admin';
  adminForm.style.display  = isAdmin ? 'block' : 'none';
  workerForm.style.display = isAdmin ? 'none'  : 'block';
  tabAdmin.classList.toggle('active',  isAdmin);
  tabWorker.classList.toggle('active', !isAdmin);

  if (!isAdmin) loadCompanies('workerCompany');

  const url = new URL(window.location);
  url.searchParams.set('role', role);
  window.history.replaceState({}, '', url);
}

async function handleRegister(event, role) {
  event.preventDefault();
  const errorId = role === 'admin' ? 'adminError' : 'workerError';
  const btnId   = role === 'admin' ? 'adminSubmit' : 'workerSubmit';
  hideError(errorId);

  let payload = { role };

  if (role === 'admin') {
    const pass  = document.getElementById('adminPass').value;
    const pass2 = document.getElementById('adminPass2').value;
    if (pass !== pass2) { showError(errorId, 'Passwords do not match.'); return; }
    Object.assign(payload, {
      firstName:   document.getElementById('adminFirst').value.trim(),
      lastName:    document.getElementById('adminLast').value.trim(),
      companyName: document.getElementById('adminCompany').value.trim(),
      email:       document.getElementById('adminEmail').value.trim(),
      phone:       document.getElementById('adminPhone').value.trim(),
      fleetSize:   document.getElementById('adminFleet').value,
      fuelPrice:   parseFloat(document.getElementById('adminFuel').value),
      password:    pass,
    });
  } else {
    const pass  = document.getElementById('workerPass').value;
    const pass2 = document.getElementById('workerPass2').value;
    if (pass !== pass2) { showError(errorId, 'Passwords do not match.'); return; }
    Object.assign(payload, {
      firstName:   document.getElementById('workerFirst').value.trim(),
      lastName:    document.getElementById('workerLast').value.trim(),
      companyId:   document.getElementById('workerCompany').value,
      email:       document.getElementById('workerEmail').value.trim(),
      phone:       document.getElementById('workerPhone').value.trim(),
      licenseNo:   document.getElementById('workerLicense').value.trim(),
      vehicleType: document.getElementById('workerVehicle').value,
      plateNo:     document.getElementById('workerPlate').value.trim(),
      password:    pass,
    });
  }

  setLoading(btnId, true);
  try {
    const res  = await fetch(`${API_BASE}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Registration failed. Please try again.');
    localStorage.setItem('fs_token', String(data.user.user_id));
    localStorage.setItem('fs_role',  data.user.role);
    localStorage.setItem('fs_user',  JSON.stringify(data.user));
    window.location.href = role === 'admin' ? '../dashboard-admin/index.html' : '../Worker-dashboard/index.html';
  } catch (err) {
    showError(errorId, err.message);
  } finally {
    setLoading(btnId, false);
  }
}

// ─────────────────────────────
// LOGIN PAGE
// ─────────────────────────────

let currentLoginRole = 'admin';

function switchLoginRole(role) {
  currentLoginRole = role;
  document.getElementById('tabAdmin').classList.toggle('active', role === 'admin');
  document.getElementById('tabWorker').classList.toggle('active', role === 'worker');

  const titleEl    = document.getElementById('loginTitle');
  const subEl      = document.getElementById('loginSub');
  const companyGrp = document.getElementById('companyGroup');

  if (role === 'admin') {
    if (titleEl) titleEl.textContent = 'Admin Sign In';
    if (subEl)   subEl.textContent   = 'Access your fleet management dashboard.';
    if (companyGrp) companyGrp.style.display = 'none';
  } else {
    if (titleEl) titleEl.textContent = 'Driver Sign In';
    if (subEl)   subEl.textContent   = 'Access your trip and delivery dashboard.';
    if (companyGrp) companyGrp.style.display = 'flex';
    loadCompanies('loginCompany');
  }
}

async function handleLogin(event) {
  event.preventDefault();
  hideError('loginError');

  const payload = {
    role:     currentLoginRole,
    email:    document.getElementById('loginEmail').value.trim(),
    password: document.getElementById('loginPass').value,
  };
  if (currentLoginRole === 'worker') {
    payload.companyId = document.getElementById('loginCompany')?.value || '';
  }

  setLoading('loginSubmit', true);
  try {
    const res  = await fetch(`${API_BASE}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Incorrect email or password.');
    localStorage.setItem('fs_token', String(data.user.user_id));
    localStorage.setItem('fs_role',  data.user.role);
    localStorage.setItem('fs_user',  JSON.stringify(data.user));
    window.location.href = data.role === 'admin' ? '../dashboard-admin/index.html' : '../Worker-dashboard/index.html';
  } catch (err) {
    showError('loginError', err.message);
  } finally {
    setLoading('loginSubmit', false);
  }
}

// ─────────────────────────────
// INIT
// ─────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  const params    = new URLSearchParams(window.location.search);
  const roleParam = params.get('role');

  if (document.getElementById('adminForm')) {
    switchRole(roleParam === 'worker' ? 'worker' : 'admin');
  }
  if (document.getElementById('loginForm')) {
    switchLoginRole(roleParam === 'worker' ? 'worker' : 'admin');
  }
});