const state = { buses: [], busStops: [] };
let adminEditingId = null;

function getPageName() {
  return window.location.pathname.replace(/\//g, '') || 'index';
}

async function loadData() {
  try {
    const response = await fetch('/api/buses');
    const data = await response.json();
    state.buses = data.buses || [];
    state.busStops = data.busStops || [];
    renderPage();
  } catch (error) {
    console.error('Unable to load bus data', error);
  }
}

function renderPage() {
  const page = getPageName();
  if (page === 'buses' || page === 'buses.html') {
    renderBuses();
  } else if (page === 'morning' || page === 'morning.html') {
    renderMorningRoutes();
  } else if (page === 'afternoon' || page === 'afternoon.html') {
    renderAfternoonRoutes();
  } else if (page === 'details' || page === 'details.html') {
    renderDetails();
  } else if (page === 'search' || page === 'search.html') {
    renderSearch();
  } else if (page === 'admin' || page === 'admin.html') {
    renderAdmin();
  }
}

function renderBuses() {
  const container = document.getElementById('buses-grid');
  if (!container) return;
  container.innerHTML = state.buses.map((bus) => `
    <article class="card">
      <div class="card-header">
        <h3>${bus.name}</h3>
        <span class="badge">${bus.routeType}</span>
      </div>
      <ul class="meta-list">
        <li>🆔 ${bus.id}</li>
        <li>🧑‍✈️ ${bus.driverName || 'TBD'}</li>
        <li>🕒 ${bus.departureTime}</li>
      </ul>
      <p><strong>Destination:</strong> ${bus.destination}</p>
      <p><strong>Region:</strong> ${bus.region}</p>
      <a class="link-btn" href="/details?id=${bus.id}">View Details</a>
    </article>
  `).join('');
}

function renderMorningRoutes() {
  const container = document.getElementById('morning-routes');
  if (!container) return;
  const morningRoutes = state.buses.filter((bus) => bus.routeType === 'Morning' || bus.routeType === 'Both');
  container.innerHTML = morningRoutes.map((bus) => `
    <article class="card">
      <div class="card-header">
        <h3>${bus.name}</h3>
        <span class="badge">Morning</span>
      </div>
      <p><strong>Destination:</strong> ${bus.destination}</p>
      <p><strong>Departure:</strong> ${bus.departureTime}</p>
      <ol>
        ${bus.stops.map((stop) => `<li>${stop.name} — ${stop.arrivalTime}</li>`).join('')}
      </ol>
      <a class="link-btn" href="/details?id=${bus.id}">View Full Schedule</a>
    </article>
  `).join('');
}

function renderAfternoonRoutes() {
  const container = document.getElementById('afternoon-routes');
  if (!container) return;
  const afternoonRoutes = state.buses.filter((bus) => bus.routeType === 'Afternoon' || bus.routeType === 'Both');
  container.innerHTML = afternoonRoutes.map((bus) => `
    <article class="card">
      <div class="card-header">
        <h3>${bus.name}</h3>
        <span class="badge">Afternoon</span>
      </div>
      <p><strong>Destination:</strong> ${bus.destination}</p>
      <p><strong>Departure:</strong> ${bus.departureTime}</p>
      <ol>
        ${bus.stops.map((stop) => `<li>${stop.name} — ${stop.arrivalTime}</li>`).join('')}
      </ol>
      <a class="link-btn" href="/details?id=${bus.id}">View Full Schedule</a>
    </article>
  `).join('');
}

function renderDetails() {
  const container = document.getElementById('bus-details');
  if (!container) return;
  const params = new URLSearchParams(window.location.search);
  const busId = params.get('id');
  const bus = state.buses.find((item) => item.id.toLowerCase() === busId?.toLowerCase());
  if (!bus) {
    container.innerHTML = '<div class="empty-state">No bus selected. Please choose one from the buses page.</div>';
    return;
  }

  const morningSchedule = bus.morningSchedule || [];
  const afternoonSchedule = bus.afternoonSchedule || [];

  container.innerHTML = `
    <div class="details-layout">
      <section class="panel">
        <div class="card-header">
          <h2>${bus.name}</h2>
          <span class="badge">${bus.routeType}</span>
        </div>
        <ul class="meta-list">
          <li>🆔 ${bus.id}</li>
          <li>🎯 ${bus.destination}</li>
          <li>🧑‍✈️ ${bus.driverName || 'TBD'}</li>
          <li>🕒 ${bus.departureTime}</li>
        </ul>
        <div class="route-map"></div>
        <h3>Official Bus Stops</h3>
        <ol>
          ${bus.stops.map((stop) => `<li>${stop.name} — ${stop.arrivalTime} (${stop.zone})</li>`).join('')}
        </ol>
        <h3>Notes</h3>
        <p>${bus.notes || 'No additional notes.'}</p>
      </section>
      <section class="grid">
        <div class="panel">
          <h3>Morning Schedule</h3>
          <ol>
            ${morningSchedule.map((item) => `<li>${item.time} — ${item.stop}</li>`).join('')}
          </ol>
        </div>
        <div class="panel">
          <h3>Afternoon Schedule</h3>
          <ol>
            ${afternoonSchedule.map((item) => `<li>${item.time} — ${item.stop}</li>`).join('')}
          </ol>
        </div>
      </section>
    </div>
  `;
}

function renderSearch() {
  const container = document.getElementById('search-results');
  const input = document.getElementById('search-input');
  const routeType = document.getElementById('route-type');
  const regionFilter = document.getElementById('region-filter');
  const button = document.getElementById('search-btn');

  if (!container || !input || !routeType || !regionFilter || !button) return;

  const applyFilter = () => {
    const term = input.value.trim().toLowerCase();
    const selectedRouteType = routeType.value;
    const selectedRegion = regionFilter.value;

    const filtered = state.buses.filter((bus) => {
      const matchesTerm = !term || [bus.id, bus.destination, bus.name, ...(bus.stops || []).map((stop) => stop.name)]
        .join(' ')
        .toLowerCase()
        .includes(term);
      const matchesRoute = !selectedRouteType || bus.routeType === selectedRouteType || (selectedRouteType === 'Both' && bus.routeType === 'Both');
      const matchesRegion = !selectedRegion || bus.region === selectedRegion;
      return matchesTerm && matchesRoute && matchesRegion;
    });

    if (!filtered.length) {
      container.innerHTML = '<div class="empty-state">No buses match that search.</div>';
      return;
    }

    container.innerHTML = filtered.map((bus) => `
      <article class="card">
        <div class="card-header">
          <h3>${bus.name}</h3>
          <span class="badge">${bus.routeType}</span>
        </div>
        <p><strong>Destination:</strong> ${bus.destination}</p>
        <p><strong>Stops:</strong> ${bus.stops.map((stop) => stop.name).join(', ')}</p>
        <a class="link-btn" href="/details?id=${bus.id}">View Details</a>
      </article>
    `).join('');
  };

  button.addEventListener('click', applyFilter);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      applyFilter();
    }
  });
  routeType.addEventListener('change', applyFilter);
  regionFilter.addEventListener('change', applyFilter);
  applyFilter();
}

function renderAdmin() {
  const adminBuses = document.getElementById('admin-buses');
  const form = document.getElementById('admin-form');
  if (!adminBuses || !form) return;

  const renderAdminList = () => {
    adminBuses.innerHTML = state.buses.map((bus) => `
      <article class="card">
        <div class="card-header">
          <h3>${bus.id}</h3>
          <span class="badge">${bus.routeType}</span>
        </div>
        <p><strong>${bus.name}</strong></p>
        <p>${bus.destination}</p>
        <div style="display:flex;gap:8px;margin-top:8px;">
          <button class="btn btn-secondary" onclick="startEditing('${bus.id}')">Edit</button>
        </div>
      </article>
    `).join('');
  };

  // Expose startEditing globally for inline onclick handlers
  window.startEditing = function (id) {
    const bus = state.buses.find((b) => (b.id || '').toLowerCase() === (id || '').toLowerCase());
    if (!bus) return;
    document.getElementById('bus-id').value = bus.id;
    document.getElementById('bus-name').value = bus.name || '';
    document.getElementById('driver-name').value = bus.driverName || '';
    document.getElementById('departure-time').value = bus.departureTime || '';
    document.getElementById('destination').value = bus.destination || '';
    document.getElementById('route-type-input').value = bus.routeType || 'Morning';
    document.getElementById('region').value = bus.region || '';
    document.getElementById('notes').value = bus.notes || '';
    document.getElementById('bus-id').disabled = true;
    adminEditingId = bus.id;

    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.textContent = 'Update Bus';

    if (!document.getElementById('admin-cancel')) {
      const cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.id = 'admin-cancel';
      cancel.className = 'btn';
      cancel.textContent = 'Cancel';
      cancel.style.marginLeft = '8px';
      cancel.addEventListener('click', cancelEditing);
      submitBtn.insertAdjacentElement('afterend', cancel);
    }
  };

  function cancelEditing() {
    form.reset();
    document.getElementById('bus-id').disabled = false;
    adminEditingId = null;
    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.textContent = 'Save Bus';
    const cancelEl = document.getElementById('admin-cancel');
    if (cancelEl) cancelEl.remove();
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const payload = {
      id: document.getElementById('bus-id').value,
      name: document.getElementById('bus-name').value,
      driverName: document.getElementById('driver-name').value,
      departureTime: document.getElementById('departure-time').value,
      destination: document.getElementById('destination').value,
      routeType: document.getElementById('route-type-input').value,
      region: document.getElementById('region').value,
      notes: document.getElementById('notes').value
    };

    let response;
    if (adminEditingId) {
      response = await fetch(`/api/admin/buses/${encodeURIComponent(adminEditingId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } else {
      response = await fetch('/api/admin/buses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    }

    const result = await response.json();
    if (response.ok) {
      cancelEditing();
      await loadData();
      renderAdminList();
      alert(`${adminEditingId ? 'Updated' : 'Saved'} ${result.bus.name}`);
    } else {
      alert(result.error || 'Unable to save bus');
    }
  });

  renderAdminList();
}

window.addEventListener('DOMContentLoaded', loadData);
