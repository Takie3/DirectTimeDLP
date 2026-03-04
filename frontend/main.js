import './style.css';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

const API_URL = import.meta.env.VITE_API_URL || '/api/attractions';
const POLL_INTERVAL_MS = 30000;

const PARK_NAMES = {
  'dae968d5-630d-4719-8b06-3d107e944401': 'Disneyland Park',
  'ca888437-ebb4-4d50-aed2-d227f7096968': 'Disney Adventure World'
};

// --- DATA ---
let previousData = {};
let allLiveAttractions = [];
let alertsArray = JSON.parse(localStorage.getItem('castpulse_tabs_alerts') || '[]');
let favoritesArray = JSON.parse(localStorage.getItem('castpulse_favorites') || '[]');

let currentSort = 'az'; // 'az', 'time'
let sortAzDirection = 'asc'; // 'asc' = A-Z, 'desc' = Z-A
let sortTimeDirection = 'asc'; // 'asc' = smallest first, 'desc' = largest first

let groupParks = true; // true = separated by park, false = merged into one list
let parkOrder = 'default'; // 'default' = DLP then WDS, 'inverted' = WDS then DLP

let filterAlertOnly = false;
let filterShowClosed = true; // Default to showing them

// Excluded Minor Attractions
const EXCLUDED_ATTRACTIONS = [
  "Disneyland Railroad Frontierland Depot",
  "Frontierland Playground",
  "La Tanière du Dragon",
  "Le Passage Enchanté d'Aladdin",
  "Pirate Galleon",
  "Pirates' Beach",
  "Rustler Roundup Shootin' Gallery"
];

// --- ELEMENTS ---
const viewList = document.getElementById('view-list');
const viewAlerts = document.getElementById('view-alerts');
const navBtns = document.querySelectorAll('.nav-btn');
const appContainer = document.getElementById('attractions-list');
const alertsContainer = document.getElementById('alerts-list');
const loadingEl = document.getElementById('loading');
const lastUpdatedEl = document.getElementById('last-updated');
const toastContainer = document.getElementById('toast-container');
const alertAttrSelect = document.getElementById('alert-attr-select');
// New Form Toggle Elements
const btnOpenAlertForm = document.getElementById('btn-open-alert-form');
const btnCloseAlertForm = document.getElementById('btn-close-alert-form');
const newAlertForm = document.getElementById('new-alert-form');
const formTitle = document.getElementById('form-title');

// Grid Options
const ui101 = document.getElementById('alert-101');
const ui102 = document.getElementById('alert-102');
const uiClosed = document.getElementById('alert-closed');

const alertTime = document.getElementById('alert-time');
const btnSaveAlert = document.getElementById('btn-save-alert');

// Top Controls
const btnToggleGroup = document.getElementById('btn-toggle-group');
const btnToggleOrder = document.getElementById('btn-toggle-order');
const btnSortAz = document.getElementById('btn-sort-az');
const btnSortTime = document.getElementById('btn-sort-time');
const btnFilterAlert = document.getElementById('btn-filter-alert');
const btnFilterClosed = document.getElementById('btn-filter-closed');

// Populate Wait Time Dropdown
alertTime.innerHTML = '<option value="0">Aucune alerte</option>';
for (let i = 5; i <= 120; i += 5) {
  const opt = document.createElement('option');
  opt.value = i;
  opt.textContent = `≤ ${i} min`;
  alertTime.appendChild(opt);
}

// --- TABS LOGIC ---
navBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    // UI Update
    navBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    // View Update
    const target = btn.dataset.target;
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active', 'hidden'));
    document.querySelectorAll('.view').forEach(v => {
      if (v.id === target) {
        v.classList.add('active');
      } else {
        v.classList.add('hidden');
      }
    });

    if (target === 'view-alerts') {
      renderAlertsList();
      populateSelect();
    }
  });
});

// --- FORM INTERACTIONS ---
btnOpenAlertForm.addEventListener('click', () => {
  openFormFor(''); // Open empty
});

btnCloseAlertForm.addEventListener('click', () => {
  newAlertForm.classList.add('hidden');
});

function toggleOptionBtn(btn) {
  btn.classList.toggle('active');
}

[ui101, ui102, uiClosed].forEach(btn => {
  btn.addEventListener('click', () => toggleOptionBtn(btn));
});

function openFormFor(attrId) {
  // Reset form visually
  [ui101, ui102, uiClosed].forEach(b => b.classList.remove('active'));
  alertTime.value = "0";
  alertAttrSelect.value = attrId;

  if (attrId) {
    const existing = alertsArray.find(a => a.attrId === attrId);
    if (existing) {
      formTitle.textContent = "Modifier l'alerte";
      if (existing.on101) ui101.classList.add('active');
      if (existing.on102) ui102.classList.add('active');
      if (existing.onClosed) uiClosed.classList.add('active');
      // Set to string to match dropdown option values
      if (existing.timeLimit > 0) alertTime.value = String(existing.timeLimit);
    } else {
      formTitle.textContent = "Créer une alerte";
    }
  } else {
    formTitle.textContent = "Créer une alerte";
  }

  // Ensure button says Enregistrer
  btnSaveAlert.textContent = 'Enregistrer';
  btnSaveAlert.classList.remove('hidden');
  newAlertForm.classList.remove('hidden');
}

function openAlertsTabFor(attrId) {
  // Switch tab visually
  const alertsNavBtn = document.querySelector('[data-target="view-alerts"]');
  alertsNavBtn.click();

  // Open and pre-fill form
  openFormFor(attrId);
}

// --- SORT, GROUP & FILTER INTERACTION ---
btnToggleGroup.addEventListener('click', () => {
  groupParks = !groupParks;
  btnToggleGroup.classList.toggle('active');

  // If we mix parks, it doesn't make sense to keep the invert order button active
  btnToggleOrder.style.display = groupParks ? "inline-block" : "none";
  renderAttractions(allLiveAttractions);
});

btnToggleOrder.addEventListener('click', () => {
  parkOrder = parkOrder === 'default' ? 'inverted' : 'default';
  btnToggleOrder.innerHTML = parkOrder === 'default' ? "↕️" : "🔀"; // Visual queue
  renderAttractions(allLiveAttractions);
});

btnSortAz.addEventListener('click', () => {
  btnSortTime.classList.remove('active');
  btnSortAz.classList.add('active');

  if (currentSort === 'az') {
    sortAzDirection = sortAzDirection === 'asc' ? 'desc' : 'asc';
  } else {
    currentSort = 'az';
    // keep its current direction
  }
  btnSortAz.textContent = sortAzDirection === 'asc' ? 'A-Z' : 'Z-A';
  renderAttractions(allLiveAttractions);
});

btnSortTime.addEventListener('click', () => {
  btnSortAz.classList.remove('active');
  btnSortTime.classList.add('active');

  if (currentSort === 'time') {
    sortTimeDirection = sortTimeDirection === 'asc' ? 'desc' : 'asc';
  } else {
    currentSort = 'time';
    // keep its current direction
  }
  btnSortTime.textContent = sortTimeDirection === 'asc' ? '⏳▲' : '⏳▼';
  renderAttractions(allLiveAttractions);
});

btnFilterAlert.addEventListener('click', (e) => {
  filterAlertOnly = !filterAlertOnly;
  e.target.classList.toggle('active');
  renderAttractions(allLiveAttractions);
});

btnFilterClosed.addEventListener('click', (e) => {
  filterShowClosed = !filterShowClosed;
  e.target.classList.toggle('active');
  renderAttractions(allLiveAttractions);
});

// --- ALERTS CRUD ---
function generateId() {
  return Math.random().toString(36).substr(2, 9);
}

btnSaveAlert.addEventListener('click', () => {
  const attrId = alertAttrSelect.value;
  if (!attrId) return alert('Veuillez choisir une attraction');

  const on101 = ui101.classList.contains('active');
  const on102 = ui102.classList.contains('active');
  const onClosed = uiClosed.classList.contains('active');
  const timeLimit = parseInt(alertTime.value, 10) || 0;

  if (!on101 && !on102 && !onClosed && timeLimit <= 0) {
    return alert('Cochez au moins une condition d\'alerte');
  }

  // Find existing or create new
  let existingIndex = alertsArray.findIndex(a => a.attrId === attrId);
  const config = {
    id: existingIndex !== -1 ? alertsArray[existingIndex].id : generateId(),
    attrId: attrId,
    on101,
    on102,
    onClosed,
    timeLimit,
    isActive: true
  };

  if (existingIndex !== -1) {
    alertsArray[existingIndex] = config;
  } else {
    alertsArray.push(config);
  }

  saveAlerts();

  // Close and refresh
  newAlertForm.classList.add('hidden');
  renderAlertsList();
  renderAttractions(allLiveAttractions);
});

function toggleAlertPause(alertId) {
  const alert = alertsArray.find(a => a.id === alertId);
  if (alert) {
    alert.isActive = !alert.isActive;
    saveAlerts();
    renderAlertsList();
    renderAttractions(allLiveAttractions);
  }
}

function deleteAlert(alertId) {
  alertsArray = alertsArray.filter(a => a.id !== alertId);
  saveAlerts();
  renderAlertsList();
  renderAttractions(allLiveAttractions);
}

function saveAlerts() {
  localStorage.setItem('castpulse_tabs_alerts', JSON.stringify(alertsArray));
}

function toggleFavorite(attrId) {
  if (favoritesArray.includes(attrId)) {
    favoritesArray = favoritesArray.filter(f => f !== attrId);
  } else {
    favoritesArray.push(attrId);
  }
  localStorage.setItem('castpulse_favorites', JSON.stringify(favoritesArray));
  renderAttractions(allLiveAttractions);
}

// --- RENDERING ---
function formatDowntimeSince(isoString) {
  if (!isoString) return '101';
  const date = new Date(isoString);
  const startHours = date.getHours().toString().padStart(2, '0');
  const startMins = date.getMinutes().toString().padStart(2, '0');

  const diffMs = Date.now() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  return `101 (${startHours}:${startMins}) - ${diffMins}m`;
}

// Fix "it's a small world" format so it sorts as "I"
function resolveName(name) {
  if (name === '"it\'s a small world"') return "It's a small world";
  return name;
}

function getBadgesHTML(attrId) {
  const alert = alertsArray.find(a => a.attrId === attrId);

  // Default states for the 4 badges
  let b101 = 'paused';
  let b102 = 'paused';
  let bClosed = 'paused';
  let bTime = 'paused';
  let timeStr = 'Temps';

  if (alert && alert.isActive) {
    if (alert.on101) b101 = 'active';
    if (alert.on102) b102 = 'active';
    if (alert.onClosed) bClosed = 'active';
    if (alert.timeLimit > 0) {
      bTime = 'active';
      timeStr = `${alert.timeLimit}'`;
    }
  }

  let badges = `
    <span class="alert-pill ${b101}">🚨<span>101</span></span>
    <span class="alert-pill ${b102}">✅<span>102</span></span>
    <span class="alert-pill ${bClosed}">🔴<span>Fermée</span></span>
    <span class="alert-pill ${bTime}">⏳<span>${timeStr}</span></span>
  `;

  return `<div class="alert-inline-icons">${badges}</div>`;
}

function renderAttractions(attractions) {
  appContainer.innerHTML = '';
  loadingEl.style.display = 'none';

  // 1. Apply Filters
  const filtered = attractions.filter(attr => {
    if (EXCLUDED_ATTRACTIONS.includes(attr.name)) return false;

    if (!filterShowClosed && attr.status === 'CLOSED') return false;

    if (filterAlertOnly) {
      const hasConfig = alertsArray.some(a => a.attrId === attr.id);
      if (!hasConfig) return false;
    }

    return true;
  });

  if (filtered.length === 0) {
    appContainer.innerHTML = '<p style="text-align:center; padding: 2rem; color: var(--text-secondary);">Aucune attraction ne correspond à ces critères.</p>';
    return;
  }

  // Pre-sort function based on UI state
  const sortFunc = (a, b) => {
    if (currentSort === 'az') {
      const cmp = resolveName(a.name).localeCompare(resolveName(b.name));
      return sortAzDirection === 'asc' ? cmp : -cmp;
    } else {
      const wa = a.wait_time != null ? a.wait_time : (a.status === 'OPERATING' ? 0 : 999);
      const wb = b.wait_time != null ? b.wait_time : (b.status === 'OPERATING' ? 0 : 999);
      if (wa !== wb) {
        return sortTimeDirection === 'asc' ? wa - wb : wb - wa;
      }
      // Fallback to name inside wait time chunks
      return resolveName(a.name).localeCompare(resolveName(b.name));
    }
  };

  // Helper to draw an array of attractions
  const paintCards = (attrs) => {
    // Favorites Bubbling
    const favs = attrs.filter(a => favoritesArray.includes(a.id));
    const others = attrs.filter(a => !favoritesArray.includes(a.id));

    // Sort subsets
    favs.sort(sortFunc);
    others.sort(sortFunc);

    const combined = [...favs, ...others];

    combined.forEach(attr => {
      const card = document.createElement('div');
      card.className = `attraction-card status-${attr.status}`;

      const shortName = resolveName(attr.name);

      let badgeText = '';

      if (attr.status === 'OPERATING') {
        badgeText = attr.wait_time != null ? `${attr.wait_time}'` : '0\'';
      } else if (attr.status === 'DOWN') {
        badgeText = `101`;
        if (attr.last_status_change) {
          badgeText = formatDowntimeSince(attr.last_status_change);
        }
      } else if (attr.status === 'CLOSED') {
        badgeText = 'FERMÉ';
      } else if (attr.status === 'REFURBISHMENT') {
        badgeText = 'RÉHAB';
      }

      const badgesHTML = getBadgesHTML(attr.id);
      const isFav = favoritesArray.includes(attr.id);

      card.innerHTML = `
        <div class="attraction-info">
          <div class="flex-row-center">
             <button class="fav-btn ${isFav ? 'active' : ''}" onclick="toggleFavorite('${attr.id}')">${isFav ? '⭐' : '☆'}</button>
             <span class="attraction-name">${shortName}</span>
             ${badgesHTML}
          </div>
        </div>
        <div class="status-action-group">
           <button class="alert-btn" onclick="openAlertsTabFor('${attr.id}')">+</button>
           <div class="status-badge">${badgeText}</div>
        </div>
      `;

      appContainer.appendChild(card);
    });
  };

  // Render Strategy
  if (!groupParks) {
    // Mixed rendering
    paintCards(filtered);
  } else {
    // Grouped by park rendering
    const parks = {};
    filtered.forEach(attr => {
      if (!parks[attr.park_id]) parks[attr.park_id] = [];
      parks[attr.park_id].push(attr);
    });

    let parkIdsToRender = Object.keys(parks).filter(id => PARK_NAMES[id]);

    if (parkOrder === 'inverted') {
      parkIdsToRender = parkIdsToRender.reverse(); // Standard is DLP then WDS usually if DLP is parsed first. Reversing flips them.
    }

    parkIdsToRender.forEach(parkId => {
      const parkHeader = document.createElement('h2');
      parkHeader.className = 'park-header';
      parkHeader.textContent = PARK_NAMES[parkId];
      appContainer.appendChild(parkHeader);

      paintCards(parks[parkId]);
    });
  }

  const now = new Date();
  lastUpdatedEl.textContent = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
}

function populateSelect() {
  const currentVal = alertAttrSelect.value;
  alertAttrSelect.innerHTML = '<option value="">-- Choisir une attraction --</option>';

  // Filter out excluded attractions and sort alphabetically
  const sorted = [...allLiveAttractions]
    .filter(attr => !EXCLUDED_ATTRACTIONS.includes(attr.name))
    .sort((a, b) => resolveName(a.name).localeCompare(resolveName(b.name)));

  sorted.forEach(attr => {
    const opt = document.createElement('option');
    opt.value = attr.id;
    opt.textContent = resolveName(attr.name); // Use full resolved name
    alertAttrSelect.appendChild(opt);
  });

  // Restore if possible
  if (currentVal) alertAttrSelect.value = currentVal;
}

function renderAlertsList() {
  alertsContainer.innerHTML = '';

  if (alertsArray.length === 0) {
    alertsContainer.innerHTML = '<p style="color:var(--text-secondary); text-align:center;">Aucune alerte configurée.</p>';
    return;
  }

  alertsArray.forEach(al => {
    // Find attraction to get its name
    const attr = allLiveAttractions.find(a => a.id === al.attrId);
    if (!attr) return; // Wait for data

    const attrName = resolveName(attr.name); // Use full name as per instruction
    let conditions = [];
    if (al.on101) conditions.push('Panne (101)');
    if (al.on102) conditions.push('Réouverture (102)');
    if (al.onClosed) conditions.push('Fermeture');
    if (al.timeLimit > 0) conditions.push(`Attente ≤ ${al.timeLimit}m`);

    const card = document.createElement('div');
    card.className = `alert-card ${al.isActive ? '' : 'paused'}`;
    card.innerHTML = `
      <div class="alert-meta">
        <strong>${attrName}</strong>
        <span style="font-size:0.8rem; color:var(--text-secondary)">Surveiller: ${conditions.join(', ')}</span>
      </div>
      <div class="alert-actions">
        <button class="action-btn" title="Modifier" onclick="openAlertsTabFor('${attr.id}')">✏️</button>
        <button class="action-btn" title="${al.isActive ? 'Pause' : 'Activer'}" onclick="toggleAlertPause('${al.id}')">${al.isActive ? '⏸️' : '▶️'}</button>
        <button class="action-btn" title="Supprimer" onclick="deleteAlert('${al.id}')">🗑️</button>
      </div>
    `;
    alertsContainer.appendChild(card);
  });
}

async function showToast(message, type = '101') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <div style="font-size: 1.5rem;">${type === '101' ? '🚨' : '✅'}</div>
    <div style="flex:1; font-weight: 600;">${message}</div>
  `;
  toastContainer.appendChild(toast);
  setTimeout(() => toast.remove(), 5500);

  // Native Background Notification (If installed as APK via Capacitor)
  if (Capacitor.isNativePlatform()) {
    try {
      const permStatus = await LocalNotifications.checkPermissions();
      if (permStatus.display !== 'granted') {
        await LocalNotifications.requestPermissions();
      }

      await LocalNotifications.schedule({
        notifications: [
          {
            title: type === '101' ? 'Alerte DirectTimeDLP 🚨' : 'Alerte DirectTimeDLP ✅',
            body: message,
            id: Math.floor(Math.random() * 1000000),
            schedule: { at: new Date(Date.now() + 500) } // Fire basically immediately
          }
        ]
      });
    } catch (e) {
      console.error('Erreur Notification Native:', e);
    }
  }
}

// --- FETCH & CHECK CONDITIONS ---
async function fetchLive() {
  try {
    const res = await fetch(API_URL);
    if (!res.ok) throw new Error('Network error');
    const data = await res.json();

    allLiveAttractions = data;

    // Trigger Toasts for Active Alerts
    data.forEach(attr => {
      const prev = previousData[attr.id];
      if (prev) {
        // Find triggers for this attr
        const triggers = alertsArray.filter(a => a.attrId === attr.id && a.isActive);

        triggers.forEach(config => {
          if (config.on101 && prev.status !== 'DOWN' && attr.status === 'DOWN') {
            showToast(`L'attraction ${resolveName(attr.name)} vient de passer 101 !`, '101');
          }
          if (config.on102 && prev.status === 'DOWN' && attr.status === 'OPERATING') {
            showToast(`L'attraction ${resolveName(attr.name)} est repassée en 102 !`, '102');
          }
          if (config.onClosed && prev.status !== 'CLOSED' && attr.status === 'CLOSED') {
            showToast(`L'attraction ${resolveName(attr.name)} vient de fermer !`, '101');
          }
          if (config.timeLimit > 0 && attr.status === 'OPERATING' && prev.wait_time != null && attr.wait_time != null) {
            if (prev.wait_time > config.timeLimit && attr.wait_time <= config.timeLimit) {
              showToast(`Bonne nouvelle ! ${resolveName(attr.name)} est descendue à ${attr.wait_time} min !`, '102');
            }
          }
        });
      }
      previousData[attr.id] = attr;
    });

    renderAttractions(data);

    // Refresh alerts list internally if we are on that tab (fixes names if missing at first)
    if (document.getElementById('view-alerts').classList.contains('active')) {
      renderAlertsList();
    }
  } catch (err) {
    console.error('Failed to fetch data', err);
    if (appContainer.children.length === 0) {
      loadingEl.textContent = 'Erreur de connexion serveur';
      loadingEl.style.color = 'var(--color-closed)';
    }
  }
}

// Global exposure for inline onclick events
window.openAlertsTabFor = openAlertsTabFor;
window.toggleAlertPause = toggleAlertPause;
window.deleteAlert = deleteAlert;
window.toggleFavorite = toggleFavorite;

// Initial fetch
fetchLive();
setInterval(fetchLive, POLL_INTERVAL_MS);
