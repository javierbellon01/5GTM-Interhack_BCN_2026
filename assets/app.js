const wsStatus = document.getElementById('wsStatus');
const wsStatusText = document.getElementById('wsStatusText');
const liveIndicator = document.getElementById('liveIndicator');
const liveIndicatorText = document.getElementById('liveIndicatorText');
const ambientGrid = document.getElementById('ambientGrid');
const eventList = document.getElementById('eventList');
const sensorList = document.getElementById('sensorList');
const chatThread = document.getElementById('chatThread');
const chatForm = document.getElementById('chatForm');
const chatInput = document.getElementById('chatInput');
const reportBtn = document.getElementById('reportBtn');
const captureBtn = document.getElementById('captureBtn');
const micBtn = document.getElementById('micBtn');
const micIcon = document.getElementById('micIcon');
const fullscreenBtn = document.getElementById('fullscreenBtn');
const videoFeed = document.getElementById('videoFeed');

const sensorUnits = { temp: '°C', humidity: '%', light: 'lux', trash: '%', noise: 'dB', people: 'pers.' };
const sensorLabels = {
  temp: 'Temperature',
  humidity: 'Humidity',
  light: 'Light',
  trash: 'Trash',
  noise: 'Noise',
  people: 'People'
};
const sensorColors = {
  temp: '#2d8fcb',
  humidity: '#2d8fcb',
  light: '#2d8fcb',
  trash: '#8b5e34',
  noise: '#2d8fcb',
  people: '#2d8fcb'
};
const metricKeys = ['temp', 'humidity', 'light', 'noise', 'people', 'trash'];
const metricHistory = {
  temp: [],
  humidity: [],
  light: [],
  trash: [],
  noise: [],
  people: []
};
const metricTrend = {
  temp: null,
  humidity: null,
  light: null,
  trash: null,
  noise: null,
  people: null
};
const metricStatusState = {
  temp: false,
  humidity: false,
  light: false,
  trash: false
};
const metricLastSeenAt = {
  temp: null,
  humidity: null,
  light: null,
  trash: null
};

// add noise and people to status/lastSeen
metricStatusState.noise = false;
metricStatusState.people = false;
metricLastSeenAt.noise = null;
metricLastSeenAt.people = null;
const metricHeartbeatTimeoutMs = 2500;
const sensorStatusState = {};
const sensorStatusLabels = [
  { key: 'temp', label: 'Temperature Sensor', icon: 'thermometer' },
  { key: 'humidity', label: 'Humidity Sensor', icon: 'droplet' },
  { key: 'light', label: 'Light Sensor', icon: 'sun' },
  { key: 'noise', label: 'Noise Sensor', icon: 'volume' },
  { key: 'people', label: 'People Sensor', icon: 'people' },
  { key: 'camera', label: 'Central Camera', icon: 'camera' },
  { key: 'microphone', label: 'Microphone', icon: 'mic' }
];

const state = {
  ws: null,
  reconnectTimer: null,
  connected: false,
  microphoneEnabled: true,
  metrics: {},
  events: [],
  messages: []
};

function setSensorStatus(key, connected) {
  sensorStatusState[key] = Boolean(connected);
  renderSensors();
}

function escapeHtml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatMetricValue(key, value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return '—';
  }
  if (key === 'temp') {
    return Number(value).toFixed(1);
  }
  return String(Math.round(Number(value)));
}

function formatTrend(delta) {
  const value = Math.abs(Number(delta)).toFixed(Number.isInteger(Math.abs(delta)) ? 0 : 1);
  return `${Number(delta) >= 0 ? '+' : '-'}${value}`;
}

function sparklinePoints(values, width, height) {
  if (!values.length) {
    return '';
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(max - min, 0.0001);
  const stepX = values.length === 1 ? width : width / (values.length - 1);
  return values.map((value, index) => {
    const x = index * stepX;
    const y = height - ((value - min) / range) * (height - 6) - 3;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
}

function metricCardTemplate(key) {
  const value = state.metrics[key];
  const trend = metricTrend[key];
  const connected = metricStatusState[key] === true;
  const trendClass = connected ? (trend >= 0 ? 'trend-up' : 'trend-down') : '';
  const trendArrow = connected ? (trend >= 0 ? '↗' : '↘') : '—';
  return `
    <article class="metric-card ${connected ? '' : 'is-disconnected'}" data-metric-card="${key}">
      <div class="metric-topline">
        <div class="metric-label">${sensorLabels[key]}</div>
        <div id="metricStatus-${key}" class="metric-status ${connected ? 'status-ok' : 'status-error'}">${connected ? 'Connected' : 'No conectado'}</div>
      </div>
      <div class="metric-value-row">
        <div id="metricValue-${key}" class="metric-value">${connected ? formatMetricValue(key, value) : '—'}</div>
        <div class="metric-unit">${sensorUnits[key]}</div>
      </div>
      <svg class="metric-sparkline" viewBox="0 0 100 42" preserveAspectRatio="none" aria-hidden="true">
        <polyline class="spark-glow" points=""></polyline>
        <polyline id="spark-${key}" class="spark-line" points=""></polyline>
      </svg>
      <div id="metricTrend-${key}" class="metric-trend ${trendClass}">
        <span class="trend-arrow">${trendArrow}</span>
        <span>${connected ? formatTrend(trend) : 'No conectado'}</span>
      </div>
    </article>
  `;
}

function renderMetricCards() {
  ambientGrid.innerHTML = metricKeys.map(metricCardTemplate).join('');
  metricKeys.forEach((key) => updateMetricVisuals(key, state.metrics[key], false));
}

function updateMetricVisuals(key, value, pulse = true) {
  const valueNode = document.getElementById(`metricValue-${key}`);
  const trendNode = document.getElementById(`metricTrend-${key}`);
  const lineNode = document.getElementById(`spark-${key}`);
  const statusNode = document.getElementById(`metricStatus-${key}`);
  const cardNode = valueNode?.closest('[data-metric-card]');
  if (!valueNode || !trendNode || !lineNode || !statusNode || !cardNode) return;

  const connected = metricStatusState[key] === true;

  valueNode.textContent = connected ? formatMetricValue(key, value) : '—';
  statusNode.textContent = connected ? 'Connected' : 'No conectado';
  statusNode.classList.toggle('status-ok', connected);
  statusNode.classList.toggle('status-error', !connected);
  cardNode.classList.toggle('is-disconnected', !connected);
  trendNode.textContent = connected ? 'Waiting for backend data' : 'No conectado';
  valueNode.classList.remove('flash');
  if (pulse) {
    valueNode.classList.add('flash');
    window.setTimeout(() => valueNode.classList.remove('flash'), 220);
  }

  if (!connected || value === null || value === undefined || Number.isNaN(Number(value))) {
    lineNode.setAttribute('points', '');
    lineNode.previousElementSibling?.setAttribute('points', '');
    return;
  }

  const history = metricHistory[key] || [];
  const points = sparklinePoints(history, 100, 42);
  lineNode.setAttribute('points', points);
  lineNode.setAttribute('stroke', sensorColors[key]);
  lineNode.previousElementSibling?.setAttribute('points', points);
  lineNode.previousElementSibling?.setAttribute('stroke', sensorColors[key]);

  const delta = metricTrend[key];
  if (delta === null || delta === undefined) {
    trendNode.classList.remove('trend-up', 'trend-down');
    trendNode.textContent = 'Waiting for backend data';
    return;
  }

  trendNode.classList.toggle('trend-up', delta >= 0);
  trendNode.classList.toggle('trend-down', delta < 0);
  trendNode.innerHTML = `<span class="trend-arrow">${delta >= 0 ? '↗' : '↘'}</span><span>${formatTrend(delta)}</span>`;
}

function syncMetricConnectivity() {
  let changed = false;
  const now = Date.now();

  metricKeys.forEach((key) => {
    const lastSeen = metricLastSeenAt[key];
    const connected = typeof lastSeen === 'number' && now - lastSeen <= metricHeartbeatTimeoutMs;
    if (metricStatusState[key] !== connected) {
      metricStatusState[key] = connected;
      changed = true;
    }
  });

  if (changed) {
    renderMetricCards();
  }
}

function renderEvents() {
  if (!state.events.length) {
    eventList.innerHTML = '<div class="events-empty">No events have been received from the backend yet.</div>';
    return;
  }
  eventList.innerHTML = state.events.slice(0, 5).map((event) => {
    const levelClass = event.level === 'alert' ? 'event-alert' : event.level === 'warning' ? 'event-warning' : 'event-normal';
    return `
      <article class="event-item ${levelClass}">
        <span class="event-icon" aria-hidden="true"></span>
        <div>
          <div class="event-title">${escapeHtml(event.title)}</div>
          <div class="event-zone">${escapeHtml(event.zone)}</div>
        </div>
        <div class="event-time">${escapeHtml(event.time)}</div>
      </article>
    `;
  }).join('');
}

function renderSensors() {
  sensorList.innerHTML = sensorStatusLabels.map((sensor) => {
    const rawStatus = sensorStatusState[sensor.key];
    const connected = rawStatus === true;
    const disconnected = rawStatus === false;
    const pending = typeof rawStatus === 'undefined';
    return `
      <div class="sensor-row" data-sensor-row="${sensor.key}">
        <span class="sensor-mark ${pending ? 'is-pending' : connected ? 'is-connected' : 'is-disconnected'}" aria-hidden="true">${sensorIcon(sensor.icon)}</span>
        <div class="sensor-name">${escapeHtml(sensor.label)}</div>
        <div class="sensor-status ${pending ? 'status-pending' : connected ? 'status-ok' : 'status-error'}">${pending ? 'Pending' : connected ? 'Connected' : 'Disconnected'}</div>
      </div>
    `;
  }).join('');
}

function sensorIcon(name) {
  const icons = {
    thermometer: '<svg viewBox="0 0 24 24"><path d="M12 4a2 2 0 0 1 2 2v6.2a4 4 0 1 1-4 0V6a2 2 0 0 1 2-2z"></path></svg>',
    droplet: '<svg viewBox="0 0 24 24"><path d="M12 3s6 6.3 6 10a6 6 0 0 1-12 0c0-3.7 6-10 6-10z"></path></svg>',
    sun: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2"></path><path d="M12 20v2"></path><path d="M4.9 4.9l1.4 1.4"></path><path d="M17.7 17.7l1.4 1.4"></path><path d="M2 12h2"></path><path d="M20 12h2"></path><path d="M4.9 19.1l1.4-1.4"></path><path d="M17.7 6.3l1.4-1.4"></path></svg>',
    volume: '<svg viewBox="0 0 24 24"><path d="M4 10v4h4l5 4V6l-5 4z"></path><path d="M16 9a4 4 0 0 1 0 6"></path><path d="M18.5 6.5a7 7 0 0 1 0 11"></path></svg>',
    people: '<svg viewBox="0 0 24 24"><circle cx="8" cy="8" r="3"></circle><circle cx="16" cy="8" r="3"></circle><path d="M8 11a3 3 0 0 0-3 3v4h2v-4a1 1 0 0 1 1-1h2v-2H8z"></path><path d="M16 11a3 3 0 0 1 3 3v4h-2v-4a1 1 0 0 0-1-1h-2v-2h2z"></path><path d="M12 11a2 2 0 0 0-2 2v4h4v-4a2 2 0 0 0-2-2z"></path></svg>',
    camera: '<svg viewBox="0 0 24 24"><path d="M4 7h8l2 3h6v9H4z"></path><circle cx="12" cy="14" r="3"></circle></svg>',
    mic: '<svg viewBox="0 0 24 24"><path d="M12 15a3 3 0 0 0 3-3V8a3 3 0 1 0-6 0v4a3 3 0 0 0 3 3z"></path><path d="M5 12a7 7 0 0 0 14 0"></path><path d="M12 19v3"></path></svg>'
  };
  return icons[name] || icons.camera;
}

function setConnected(connected) {
  state.connected = connected;
  wsStatus.classList.toggle('is-offline', !connected);
  liveIndicator.classList.toggle('is-offline', !connected);
  wsStatusText.textContent = connected ? 'Connected' : 'Disconnected';
  liveIndicatorText.textContent = connected ? 'Live' : 'Waiting for backend';
}

let latestMetricsTimer = null;
let metricHeartbeatTimer = null;

async function refreshLatestMetrics() {
  try {
    const response = await fetch('/api/latest', { cache: 'no-store' });
    if (!response.ok) {
      throw new Error('No s\'han pogut llegir les dades més recents');
    }

    const payload = await response.json();
    applySensorPayload(payload);
    setConnected(true);
    syncMetricConnectivity();
  } catch (error) {
    setConnected(false);
  }
}

function applySensorPayload(data) {
  const now = Date.now();

  metricKeys.forEach((key) => {
    if (typeof data[key] !== 'undefined' && data[key] !== null) {
      const numericValue = Number(data[key]);
      if (!Number.isNaN(numericValue)) {
        metricLastSeenAt[key] = now;
        metricStatusState[key] = true;
        state.metrics[key] = numericValue;
        metricHistory[key].push(numericValue);
        if (metricHistory[key].length > 18) {
          metricHistory[key].shift();
        }
        const previous = metricHistory[key][metricHistory[key].length - 2];
        metricTrend[key] = typeof previous === 'number' ? numericValue - previous : null;
        updateMetricVisuals(key, numericValue, true);
      }
    }
  });

  
  renderSensors();
}

function applySensorStatus(data) {
  Object.entries(data).forEach(([key, value]) => {
    if (key in sensorStatusState || sensorStatusLabels.some((sensor) => sensor.key === key)) {
      sensorStatusState[key] = value === true || value === 'connected';
    }
    if (key in metricStatusState) {
      metricStatusState[key] = value === true || value === 'connected';
      if (metricStatusState[key]) {
        metricLastSeenAt[key] = Date.now();
      }
    }
  });
  renderMetricCards();
  renderSensors();
}

function pushEvent(eventData) {
  state.events.unshift({
    level: eventData.level || 'normal',
    title: eventData.title || 'Nou esdeveniment',
    zone: eventData.zone || 'Zona desconeguda',
    time: eventData.time || 'Ara mateix'
  });
  state.events = state.events.slice(0, 5);
  renderEvents();
}

function addMessage(role, text) {
  state.messages.push({ role, text });
  renderMessages();
}

function renderMessages() {
  if (!state.messages.length) {
    chatThread.innerHTML = '';
    return;
  }
  chatThread.innerHTML = state.messages.map((message) => {
    return `
      <div class="message-row ${message.role}">
        <div class="message-bubble">${escapeHtml(message.text)}</div>
      </div>
    `;
  }).join('');
  chatThread.scrollTop = chatThread.scrollHeight;
}

async function sendChatMessage(text) {
  const trimmed = text.trim();
  if (!trimmed) return;

  addMessage('user', trimmed);
  chatInput.value = '';

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: trimmed })
    });

    if (!response.ok) {
      throw new Error('Resposta no vàlida');
    }

    const contentType = response.headers.get('content-type') || '';
    let replyText = 'He rebut la teva petició i l’estic processant.';
    if (contentType.includes('application/json')) {
      const data = await response.json();
      replyText = data.reply || data.text || data.message || replyText;
    } else {
      replyText = await response.text();
    }

    addMessage('bot', replyText);
  } catch (error) {
    addMessage('bot', 'No he pogut contactar amb el servei de xat en aquest moment.');
  }
}

async function downloadReport() {
  try {
    const response = await fetch('/api/report');
    if (!response.ok) {
      throw new Error('The report could not be generated');
    }

    const blob = await response.blob();
    const contentType = response.headers.get('content-type') || '';
    const filename = contentType.includes('pdf') ? 'park-report.pdf' : 'park-report.json';
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  } catch (error) {
    addMessage('bot', 'The report could not be downloaded right now.');
  }
}

function captureCameraFrame() {
  const image = videoFeed;
  if (!image.complete || !image.naturalWidth) {
    return;
  }

  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d');
  context.drawImage(image, 0, 0);
  const url = canvas.toDataURL('image/png');
  const link = document.createElement('a');
  link.href = url;
  link.download = `captura-camara-${Date.now()}.png`;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function toggleMicrophone() {
  state.microphoneEnabled = !state.microphoneEnabled;
  micBtn.setAttribute('aria-pressed', String(state.microphoneEnabled));
  micBtn.title = state.microphoneEnabled ? 'Microphone enabled' : 'Microphone disabled';
  micBtn.style.borderColor = state.microphoneEnabled ? 'var(--border)' : 'rgba(192, 57, 43, 0.6)';
  micBtn.style.background = state.microphoneEnabled ? 'rgba(255, 255, 255, 0.02)' : 'rgba(192, 57, 43, 0.12)';
  micIcon.innerHTML = state.microphoneEnabled
    ? '<path d="M12 15a3 3 0 0 0 3-3V8a3 3 0 1 0-6 0v4a3 3 0 0 0 3 3z"></path><path d="M5 12a7 7 0 0 0 14 0"></path><path d="M12 19v3"></path>'
    : '<path d="M7 11v1a5 5 0 0 0 8 3.9"></path><path d="M12 15a3 3 0 0 1-3-3V8"></path><path d="M5 5l14 14"></path><path d="M12 19v3"></path>';
  setSensorStatus('microphone', state.microphoneEnabled);
}

async function openFullscreen() {
  const element = document.querySelector('.camera-frame');
  if (!document.fullscreenElement && element.requestFullscreen) {
    await element.requestFullscreen();
  } else if (document.exitFullscreen) {
    await document.exitFullscreen();
  }
}

document.querySelectorAll('.quick-chip').forEach((button) => {
  button.addEventListener('click', () => {
    chatInput.value = button.dataset.question || '';
    chatInput.focus();
  });
});

chatForm.addEventListener('submit', (event) => {
  event.preventDefault();
  sendChatMessage(chatInput.value);
});

reportBtn.addEventListener('click', downloadReport);
captureBtn.addEventListener('click', captureCameraFrame);
micBtn.addEventListener('click', toggleMicrophone);
fullscreenBtn.addEventListener('click', openFullscreen);

videoFeed.addEventListener('load', () => setSensorStatus('camera', true));
videoFeed.addEventListener('error', () => setSensorStatus('camera', false));

renderMetricCards();
renderEvents();
renderSensors();
renderMessages();
setConnected(false);
refreshLatestMetrics();
latestMetricsTimer = window.setInterval(refreshLatestMetrics, 1000);
metricHeartbeatTimer = window.setInterval(syncMetricConnectivity, 500);

window.addEventListener('beforeunload', () => {
  if (latestMetricsTimer) {
    clearInterval(latestMetricsTimer);
  }
  if (metricHeartbeatTimer) {
    clearInterval(metricHeartbeatTimer);
  }
  if (state.ws) {
    try { state.ws.close(); } catch (error) {}
  }
});