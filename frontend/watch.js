const API_URL = import.meta.env.VITE_API_URL || '/api/attractions';
const carousel = document.getElementById('watch-carousel');
const loading = document.getElementById('loading');

let attractions = [];
let currentIndex = 0;

// Get favorites from the main app
let favoritesArray = JSON.parse(localStorage.getItem('castpulse_favorites') || '[]');

async function initWatch() {
    try {
        const res = await fetch(API_URL);
        if (!res.ok) throw new Error('API Error');
        const data = await res.json();

        // On a watch, only show favorites if they exist. Otherwise show all.
        if (favoritesArray.length > 0) {
            attractions = data.filter(a => favoritesArray.includes(a.id));
        } else {
            attractions = data;
        }

        // Sort A-Z for predictability
        attractions.sort((a, b) => a.name.localeCompare(b.name));

        loading.style.display = 'none';
        renderCarousel();

        // Refresh every 30s transparently
        setInterval(refreshData, 30000);
    } catch (err) {
        loading.textContent = "Erreur Serveur";
    }
}

async function refreshData() {
    try {
        const res = await fetch(API_URL);
        if (!res.ok) return;
        const data = await res.json();

        if (favoritesArray.length > 0) {
            attractions = data.filter(a => favoritesArray.includes(a.id));
        } else {
            attractions = data;
        }
        attractions.sort((a, b) => a.name.localeCompare(b.name));

        // Update live without losing position
        renderCarousel(true);
    } catch (e) {
        console.error(e);
    }
}

function renderCarousel(isRefresh = false) {
    carousel.innerHTML = '';

    if (attractions.length === 0) {
        carousel.innerHTML = '<div class="slide active"><div class="attr-name">Aucune attraction</div></div>';
        return;
    }

    attractions.forEach((attr, index) => {
        const slide = document.createElement('div');
        slide.className = `slide ${index === currentIndex ? 'active' : ''}`;

        let statusHTML = '';
        let statusClass = `status-${attr.status}`;

        if (attr.status === 'OPERATING') {
            statusHTML = attr.wait_time != null ? `${attr.wait_time}'` : `0'`;
        } else if (attr.status === 'DOWN') {
            statusHTML = '101';
        } else if (attr.status === 'CLOSED') {
            statusHTML = 'FERMÉ';
        } else {
            statusHTML = 'RÉHAB';
        }

        let parkStr = attr.park_id === 'dae968d5-630d-4719-8b06-3d107e944401' ? 'Disneyland Park' : 'WDS';

        slide.innerHTML = `
      <div class="attr-name">${attr.name}</div>
      <div class="attr-status ${statusClass}">${statusHTML}</div>
      <div class="park-name">${parkStr}</div>
      ${index === currentIndex ? '<div class="instructions">Tap pour Suivant</div>' : ''}
    `;

        carousel.appendChild(slide);
    });
}

// Interaction: Tap anywhere to go to next
document.body.addEventListener('click', () => {
    if (attractions.length <= 1) return;

    currentIndex++;
    if (currentIndex >= attractions.length) currentIndex = 0;

    // Re-render to show active
    renderCarousel();
});

initWatch();
