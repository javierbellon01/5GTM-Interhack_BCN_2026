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
const fullscreenBtn = document.getElementById('fullscreenBtn');
const videoFeed = document.getElementById('videoFeed');
const videoPlaceholder = document.getElementById('videoPlaceholder');

const sensorUnits = { temp: '°C', humidity: '%', light: 'lux', person: 'pers.', trash_counter: 'items' };
const sensorLabels = {
  temp: 'Temperature',
  humidity: 'Humidity',
  light: 'Light',
  person: 'Person',
  trash_counter: 'Litter Detected'
};
const sensorColors = {
  temp: '#2d8fcb',
  humidity: '#2d8fcb',
  light: '#2d8fcb',
  person: '#2d8fcb',
  trash_counter: '#d2473f' // Red color to highlight trash
};
const metricHistory = {
  temp: [], humidity: [], light: [], person: [], trash_counter: []
};
const metricTrend = {
  temp: null, humidity: null, light: null, person: null, trash_counter: null
};
const sensorStatusState = {};
const sensorStatusLabels = [
  { key: 'temp', label: 'Temperature Sensor', icon: 'thermometer' },
  { key: 'humidity', label: 'Humidity Sensor', icon: 'droplet' },
  { key: 'light', label: 'Light Sensor', icon: 'sun' },
  { key: 'trash', label: 'Trash Sensor', icon: 'trash' },
  { key: 'camera', label: 'Central Camera', icon: 'camera' },
  { key: 'person', label: 'Person Sensor', icon: 'person'}
];

const state = {
  ws: null,
  reconnectTimer: null,
  connected: false,
  metrics: {},
  events: [],
  alerts: [],
  messages: []
};

function pushAlert(alert) {
  const item = {
    level: alert.level || 'warning',
    title: alert.title || 'Alert',
    detail: alert.detail || '',
    time: alert.time || new Date().toLocaleString()
  };
  state.alerts.unshift(item);
  // keep small
  state.alerts = state.alerts.slice(0, 8);
  // also push to events stream for UI visibility
  state.events.unshift({ level: item.level === 'critical' ? 'alert' : 'warning', title: item.title, zone: item.detail || 'System', time: item.time });
  state.events = state.events.slice(0, 6);
}

function evaluateThresholds(data) {
  // Temperature
  if (typeof data.temp !== 'undefined' && Number(data.temp) >= 33) {
    pushAlert({ level: 'alert', title: 'High Temperature', detail: 'Recommend avoiding prolonged outdoor exposure; suggest staying in shaded areas' });
  }

  // Humidity
  if (typeof data.humidity !== 'undefined') {
    const h = Number(data.humidity);
    if (h < 25) {
      pushAlert({ level: 'critical', title: 'Fire Risk Alert', detail: 'Critical: Recommend watering' });
    } else if (h >= 25 && h <= 39) {
      pushAlert({ level: 'warning', title: 'Low Humidity', detail: 'Recommend watering' });
    } else if (h >= 40 && h <= 70) {
      // optimal - internal log
      pushAlert({ level: 'info', title: 'Optimal Humidity', detail: 'No action required' });
    } else if (h >= 70 && h <= 85) {
      pushAlert({ level: 'warning', title: 'Slippery Conditions', detail: 'Monitor surfaces for safety' });
    } else if (h > 85) {
      pushAlert({ level: 'warning', title: 'High Fungal Risk', detail: 'Monitor vegetation for fungal growth' });
    }
  }

  // Trash
  if (typeof data.trash !== 'undefined') {
    const t = Number(data.trash);
    if (t >= 1 && t <= 2) {
      pushAlert({ level: 'info', title: 'Slightly Dirty', detail: 'Internal log entry' });
    } else if (t >= 3 && t <= 5) {
      pushAlert({ level: 'warning', title: 'Dirty', detail: 'Send notification to cleaning maintenance' });
    } else if (t > 5) {
      pushAlert({ level: 'alert', title: 'Highly Dirty', detail: 'Generate urgent priority alert' });
    }
  }

  // Noise
  if (typeof data.noise !== 'undefined') {
    const n = Number(data.noise);
    if (n >= 55 && n <= 65) {
      pushAlert({ level: 'info', title: 'High Noise', detail: 'Internal log entry' });
    } else if (n > 65 && n <= 75) {
      pushAlert({ level: 'warning', title: 'Ordinance Violation', detail: 'Send notification/warning' });
    } else if (n > 75) {
      pushAlert({ level: 'alert', title: 'Incident Alert', detail: 'Activate emergency response protocol' });
    }
  }
}
const cameraStreamUrl = `http://${window.location.hostname}:4912/embed`;
let cameraStreamRetryTimer = null;

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
  const trendClass = trend >= 0 ? 'trend-up' : 'trend-down';
  const trendArrow = trend >= 0 ? '↗' : '↘';
  return `
    <article class="metric-card" data-metric-card="${key}">
      <div class="metric-topline">
        <div class="metric-label">${sensorLabels[key]}</div>
      </div>
      <div class="metric-value-row">
        <div id="metricValue-${key}" class="metric-value">${formatMetricValue(key, value)}</div>
        <div class="metric-unit">${sensorUnits[key]}</div>
      </div>
      <svg class="metric-sparkline" viewBox="0 0 100 42" preserveAspectRatio="none" aria-hidden="true">
        <polyline class="spark-glow" points=""></polyline>
        <polyline id="spark-${key}" class="spark-line" points=""></polyline>
      </svg>
      <div id="metricTrend-${key}" class="metric-trend ${trendClass}">
        <span class="trend-arrow">${trendArrow}</span>
        <span>${formatTrend(trend)}</span>
      </div>
    </article>
  `;
}

function renderMetricCards() {
  ambientGrid.innerHTML = ['temp', 'humidity', 'light', 'person', 'trash_counter'].map(metricCardTemplate).join('');
  ['temp', 'humidity', 'light', 'person', 'trash_counter'].forEach((key) => updateMetricVisuals(key, state.metrics[key], false));
}

function updateMetricVisuals(key, value, pulse = true) {
  const valueNode = document.getElementById(`metricValue-${key}`);
  const trendNode = document.getElementById(`metricTrend-${key}`);
  const lineNode = document.getElementById(`spark-${key}`);
  if (!valueNode || !trendNode || !lineNode) return;

  valueNode.textContent = formatMetricValue(key, value);
  trendNode.textContent = 'Waiting for backend data';
  valueNode.classList.remove('flash');
  if (pulse) {
    valueNode.classList.add('flash');
    window.setTimeout(() => valueNode.classList.remove('flash'), 220);
  }

  if (value === null || value === undefined || Number.isNaN(Number(value))) {
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
    people: '<svg viewBox="0 0 24 24"><circle cx="8" cy="8" r="3"></circle><circle cx="16" cy="8" r="3"></circle><path d="M8 11a3 3 0 0 0-3 3v4h2v-4a1 1 0 0 1 1-1h2v-2H8z"></path><path d="M16 11a3 3 0 0 1 3 3v4h-2v-4a1 1 0 0 0-1-1h-2v-2h2z"></path><path d="M12 11a2 2 0 0 0-2 2v4h4v-4a2 2 0 0 0-2-2z"></path></svg>',
    trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16"></path><path d="M8 7V5h8v2"></path><path d="M6 7l1 13h10l1-13"></path><path d="M10 11v5"></path><path d="M14 11v5"></path></svg>',
    person: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3"></circle><path d="M8 20v-3a4 4 0 0 1 8 0v3"></path></svg>',
    camera: '<svg viewBox="0 0 24 24"><path d="M4 7h8l2 3h6v9H4z"></path><circle cx="12" cy="14" r="3"></circle></svg>',
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

async function refreshLatestMetrics() {
  try {
    const response = await fetch('/api/latest', { cache: 'no-store' });
    if (!response.ok) {
      throw new Error('No s\'han pogut llegir les dades més recents');
    }

    const payload = await response.json();
    applySensorPayload(payload);
    setConnected(true);
  } catch (error) {
    setConnected(false);
  }
}

function applySensorPayload(data) {
  ['temp', 'humidity', 'light', 'person', 'trash_counter'].forEach((key) => {
    if (typeof data[key] !== 'undefined') {
      sensorStatusState[key] = true;
      state.metrics[key] = Number(data[key]);
      metricHistory[key].push(Number(data[key]));
      if (metricHistory[key].length > 18) {
        metricHistory[key].shift();
      }
      const previous = metricHistory[key][metricHistory[key].length - 2];
      metricTrend[key] = typeof previous === 'number' ? Number(data[key]) - previous : null;
      updateMetricVisuals(key, data[key], true);
    }
  });
    // Evaluate thresholds and push alerts/logs
    try {
      evaluateThresholds(data);
    } catch (err) {
      console.error('Threshold evaluation error', err);
    }
  renderSensors();
}

function applySensorStatus(data) {
  Object.entries(data).forEach(([key, value]) => {
    if (key in sensorStatusState || sensorStatusLabels.some((sensor) => sensor.key === key)) {
      sensorStatusState[key] = value === true || value === 'connected';
    }
  });
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

function buildReportData() {
  return {
    generatedAt: new Date(),
    connected: state.connected,
    metrics: { ...state.metrics },
    history: Object.fromEntries(Object.entries(metricHistory).map(([key, values]) => [key, values.slice()])),
    events: state.events.slice(0, 4),
    sensors: sensorStatusLabels.map((sensor) => {
      const rawStatus = sensorStatusState[sensor.key];
      return {
        key: sensor.key,
        label: sensor.label,
        status: typeof rawStatus === 'undefined' ? 'Pending' : rawStatus ? 'Connected' : 'Disconnected'
      };
    }),
    alerts: state.alerts ? state.alerts.slice(0, 4) : [],
    llmSummary: ''
  };
}

function formatSensorDataForStatus() {
  const metrics = state.metrics;
  return [
    `Temp: ${metrics.temp || '?'}`,
    `Humidity: ${metrics.humidity || '?'}`,
    `Light: ${metrics.light || '?'}`,
    `Noise: ${metrics.noise || '?'}`,
    `People: ${metrics.people || '?'}`,
    `Trash: ${metrics.trash || '?'}`
  ].join(', ');
}

function formatSensorDataForReport() {
  const reportData = buildReportData();
  let data = formatSensorDataForStatus();
  
  if (reportData.events && reportData.events.length) {
    data += '\n\nRecent Events:\n';
    reportData.events.forEach(event => {
      data += `- ${event.title} (${event.zone}) at ${event.time}\n`;
    });
  }
  
  if (reportData.alerts && reportData.alerts.length) {
    data += '\n\nActive Alerts:\n';
    reportData.alerts.forEach(alert => {
      data += `- [${alert.level}] ${alert.title}: ${alert.detail}\n`;
    });
  }
  
  return data;
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
      throw new Error('API response not ok');
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
    if (typeof window.createParkReportPdf !== 'function') {
      throw new Error('PDF generator is not available');
    }

    const reportData = buildReportData();

    try {
      const sensorData = formatSensorDataForReport();
      const llmResponse = await fetch('/api/report', {
        method: 'GET'
      });

      if (llmResponse.ok) {
        const llmData = await llmResponse.json();
        reportData.llmSummary = llmData.message || llmData.response || '';
      }
    } catch (error) {
      console.log('LLM summary not available:', error);
    }

    window.createParkReportPdf(reportData);
  } catch (error) {
    addMessage('bot', 'The report could not be generated right now.');
  }
}


function captureCameraFrame() {
  window.open(cameraStreamUrl, '_blank', 'noreferrer');
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
fullscreenBtn.addEventListener('click', openFullscreen);

function startCameraStream() {
  if (!videoFeed || !videoPlaceholder) {
    return;
  }

  videoPlaceholder.style.display = 'flex';
  videoFeed.style.display = 'none';
  videoFeed.src = cameraStreamUrl;

  if (cameraStreamRetryTimer) {
    window.clearInterval(cameraStreamRetryTimer);
  }

  cameraStreamRetryTimer = window.setInterval(() => {
    if (videoFeed.style.display === 'none') {
      videoFeed.src = cameraStreamUrl;
    }
  }, 1000);
}

videoFeed.addEventListener('load', () => {
  if (videoPlaceholder) {
    videoPlaceholder.style.display = 'none';
  }
  videoFeed.style.display = 'block';
  setSensorStatus('camera', true);
  if (cameraStreamRetryTimer) {
    window.clearInterval(cameraStreamRetryTimer);
    cameraStreamRetryTimer = null;
  }
});

videoFeed.addEventListener('error', () => {
  if (videoPlaceholder) {
    videoPlaceholder.style.display = 'flex';
  }
  videoFeed.style.display = 'none';
  setSensorStatus('camera', false);
});

renderMetricCards();
renderEvents();
renderSensors();
renderMessages();
setConnected(false);
startCameraStream();
refreshLatestMetrics();
latestMetricsTimer = window.setInterval(refreshLatestMetrics, 1000);

window.addEventListener('beforeunload', () => {
  if (latestMetricsTimer) {
    clearInterval(latestMetricsTimer);
  }
  if (cameraStreamRetryTimer) {
    clearInterval(cameraStreamRetryTimer);
  }
  if (state.ws) {
    try { state.ws.close(); } catch (error) {}
  }
});