// Main UI: Leaflet map, drawing, and orchestration.
/* global L, SolarGeo, SolarLayout, SolarPVGIS */

const map = L.map('map', { zoomControl: true }).setView([20.5937, 78.9629], 5);

// Esri World Imagery (free, no key) for satellite tiles.
const esriSat = L.tileLayer(
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  {
    maxZoom: 22,
    attribution:
      'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community'
  }
).addTo(map);

const labels = L.tileLayer(
  'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
  { maxZoom: 22, opacity: 0.85 }
).addTo(map);

const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap contributors'
});

L.control
  .layers({ Satellite: esriSat, 'Streets (OSM)': osm }, { Labels: labels })
  .addTo(map);

// Drawing: separate groups for Boundary and Exclusions
const boundaryGroup = new L.FeatureGroup().addTo(map);
const excludeGroup = new L.FeatureGroup().addTo(map);
const layoutGroup = new L.FeatureGroup().addTo(map);
const startGroup = new L.FeatureGroup().addTo(map);

let startMarker = null;        // L.marker for the chosen start point (lat/lng)
let pickingStart = false;      // user clicked "Pick Start Point" and is selecting on map

const drawControl = new L.Control.Draw({
  position: 'topleft',
  draw: {
    polygon: {
      allowIntersection: false,
      showArea: true,
      shapeOptions: { color: '#16a34a', weight: 2, fillOpacity: 0.1 }
    },
    rectangle: { shapeOptions: { color: '#16a34a', weight: 2, fillOpacity: 0.1 } },
    polyline: false,
    circle: false,
    marker: false,
    circlemarker: false
  },
  edit: { featureGroup: boundaryGroup, remove: true }
});
map.addControl(drawControl);

// Toggle for "Drawing exclusion" mode
const ExcludeControl = L.Control.extend({
  options: { position: 'topleft' },
  onAdd: function () {
    const div = L.DomUtil.create('div', 'leaflet-bar');
    div.innerHTML =
      '<a href="#" id="excToggle" title="Toggle exclusion drawing" ' +
      'style="background:#fff;width:auto;padding:0 8px;line-height:30px;font:12px/30px sans-serif;">' +
      'Exclude: OFF</a>';
    L.DomEvent.disableClickPropagation(div);
    div.querySelector('a').onclick = (e) => {
      e.preventDefault();
      drawingExclusion = !drawingExclusion;
      div.querySelector('a').textContent =
        'Exclude: ' + (drawingExclusion ? 'ON' : 'OFF');
      div.querySelector('a').style.background = drawingExclusion ? '#fee2e2' : '#fff';
    };
    return div;
  }
});
map.addControl(new ExcludeControl());

let drawingExclusion = false;

map.on(L.Draw.Event.CREATED, (e) => {
  const layer = e.layer;
  if (drawingExclusion) {
    layer.setStyle({ color: '#dc2626', weight: 2, fillOpacity: 0.15 });
    excludeGroup.addLayer(layer);
  } else {
    boundaryGroup.addLayer(layer);
    // Auto-fill site lat/lon from boundary centroid
    const c = layer.getBounds().getCenter();
    document.getElementById('lat').value = c.lat.toFixed(5);
    document.getElementById('lon').value = c.lng.toFixed(5);
  }
});

// Click on the map while in "pick start point" mode places/moves the start marker.
map.on('click', (e) => {
  if (!pickingStart) return;
  setStartPoint(e.latlng.lat, e.latlng.lng);
  pickingStart = false;
  document.getElementById('pickStartBtn').classList.remove('active');
  document.getElementById('map').style.cursor = '';
  setStatus(
    `Start point set at ${e.latlng.lat.toFixed(5)}, ${e.latlng.lng.toFixed(5)}.`,
    'ok'
  );
});

function setStartPoint(lat, lng) {
  startGroup.clearLayers();
  startMarker = L.circleMarker([lat, lng], {
    radius: 7,
    color: '#b45309',
    weight: 2,
    fillColor: '#fbbf24',
    fillOpacity: 1
  })
    .bindTooltip('Layout start point', { permanent: false })
    .addTo(startGroup);
}

function clearStartPoint() {
  startGroup.clearLayers();
  startMarker = null;
}

// ----- Sidebar wiring -----
const $ = (id) => document.getElementById(id);

function readConfig() {
  const orient = $('orient').value;
  const latVal = parseFloat($('lat').value);
  const tiltInput = $('tilt').value;
  const tilt = tiltInput === '' ? Math.abs(latVal || 20) : parseFloat(tiltInput);
  return {
    capMode: $('capMode').value,
    targetMW: parseFloat($('targetMW').value),
    modW: parseFloat($('modW').value),
    modH: parseFloat($('modH').value),
    modWatt: parseFloat($('modWatt').value),
    orient,
    latitude: latVal,
    longitude: parseFloat($('lon').value),
    tilt,
    azimuth: parseFloat($('az').value),
    setoff: parseFloat($('setoff').value),
    loss: parseFloat($('loss').value),
    modPerRow: parseInt($('modRow').value, 10),
    modPerStack: parseInt($('modStack').value, 10),
    gapV: parseFloat($('gapV').value),
    gapH: parseFloat($('gapH').value),
    tableGapH: parseFloat($('tGapH').value),
    hRoadW: parseFloat($('hRoadW').value),
    hRoadFreq: parseInt($('hRoadFreq').value, 10),
    vRoadW: parseFloat($('vRoadW').value),
    vRoadFreq: parseInt($('vRoadFreq').value, 10),
    panelColor: $('panelColor').value || '#3b82f6',
    panelOpacity: parseFloat($('panelOpacity').value)
  };
}

// ---- Required-field validation -----------------------------------------
// Spec: id -> { label, integer?, allowZero? }
const REQUIRED_FIELDS = {
  targetMW:  { label: 'Target Capacity (MWp)' },
  modW:      { label: 'Module Width' },
  modH:      { label: 'Module Height' },
  modWatt:   { label: 'Module Wattage' },
  lat:       { label: 'Latitude' },
  lon:       { label: 'Longitude' },
  az:        { label: 'Azimuth', allowZero: true, allowNegative: true },
  setoff:    { label: 'Boundary Set-off', allowZero: true },
  loss:      { label: 'PVGIS Loss (%)', allowZero: true },
  modRow:    { label: 'Modules per Row', integer: true },
  modStack:  { label: 'Modules per Stack', integer: true },
  gapV:      { label: 'Gap between stacked rows', allowZero: true },
  gapH:      { label: 'Gap between stacked cols', allowZero: true },
  tGapH:     { label: 'Gap between tables', allowZero: true },
  hRoadW:    { label: 'Horizontal Road Width', allowZero: true },
  hRoadFreq: { label: 'Horizontal Road every N rows', integer: true, allowZero: true },
  vRoadW:    { label: 'Vertical Road Width', allowZero: true },
  vRoadFreq: { label: 'Vertical Road every N tables', integer: true, allowZero: true }
};

function clearValidation() {
  for (const id in REQUIRED_FIELDS) $(id).classList.remove('invalid');
}

function validateInputs() {
  clearValidation();
  const errs = [];
  for (const id in REQUIRED_FIELDS) {
    const spec = REQUIRED_FIELDS[id];
    const el = $(id);
    const raw = el.value.trim();
    let bad = false;
    if (raw === '') {
      bad = true;
      errs.push(`"${spec.label}" is required.`);
    } else {
      const v = spec.integer ? parseInt(raw, 10) : parseFloat(raw);
      if (!isFinite(v)) {
        bad = true;
        errs.push(`"${spec.label}" must be a number.`);
      } else if (spec.integer && !Number.isInteger(v)) {
        bad = true;
        errs.push(`"${spec.label}" must be a whole number.`);
      } else if (!spec.allowNegative && v < 0) {
        bad = true;
        errs.push(`"${spec.label}" cannot be negative.`);
      } else if (!spec.allowZero && v === 0) {
        bad = true;
        errs.push(`"${spec.label}" must be greater than zero.`);
      }
    }
    if (bad) el.classList.add('invalid');
  }
  // Capacity-mode-specific: targetMW only required when mode = target
  if ($('capMode').value === 'max') {
    $('targetMW').classList.remove('invalid');
    // remove any error referring to it
    const idx = errs.findIndex((e) => e.includes('Target Capacity'));
    if (idx >= 0) errs.splice(idx, 1);
  }
  return errs;
}

// Re-validate as the user edits, removing the red highlight when fixed.
Object.keys(REQUIRED_FIELDS).forEach((id) => {
  $(id).addEventListener('input', () => $(id).classList.remove('invalid'));
});

function setStatus(msg, kind = '') {
  const el = $('status');
  el.textContent = msg;
  el.className = 'panel ' + kind;
}

function getBoundaryLatLngs() {
  const layers = boundaryGroup.getLayers();
  if (!layers.length) return null;
  const layer = layers[0]; // first drawn polygon is the main boundary
  const ll = layer.getLatLngs();
  // Leaflet returns nested arrays; flatten the outer ring
  const ring = Array.isArray(ll[0]) ? ll[0] : ll;
  return ring.map((p) => [p.lat, p.lng]);
}

function getExclusionsLatLngs() {
  return excludeGroup.getLayers().map((l) => {
    const ll = l.getLatLngs();
    const ring = Array.isArray(ll[0]) ? ll[0] : ll;
    return ring.map((p) => [p.lat, p.lng]);
  });
}

async function generate() {
  // 1. Validate required inputs first - block on any error.
  const errs = validateInputs();
  // Boundary is also "required"
  const boundaryLL = getBoundaryLatLngs();
  if (!boundaryLL || boundaryLL.length < 3) {
    errs.unshift('Draw a boundary polygon on the map first.');
  }
  if (errs.length) {
    setStatus(
      'Cannot generate layout. Please fix the following:\n  • ' + errs.join('\n  • '),
      'error'
    );
    return;
  }

  layoutGroup.clearLayers();
  $('report').innerHTML = '';

  const cfg = readConfig();
  if (!isFinite(cfg.latitude) || !isFinite(cfg.longitude)) {
    setStatus('Latitude/Longitude missing - draw boundary first.', 'error');
    return;
  }

  setStatus('Generating layout...');

  // Build local ENU projection at boundary centroid
  const proj = SolarGeo.makeProjection(cfg.latitude, cfg.longitude);
  const boundaryXY = boundaryLL.map(([la, lo]) => proj.toXY(la, lo));
  const exclusionsXY = getExclusionsLatLngs().map((poly) =>
    poly.map(([la, lo]) => proj.toXY(la, lo))
  );

  // Rotate so that "table-row" axis is aligned with X. Azimuth 0 = south-facing
  // rows running E-W (no rotation needed). Positive azimuth rotates clockwise.
  const rot = -cfg.azimuth;
  const rotBoundary = SolarGeo.rotatePoly(boundaryXY, rot);
  const rotExclusions = exclusionsXY.map((p) => SolarGeo.rotatePoly(p, rot));

  // Optional anchor (start point) -> project + rotate into the same frame
  let rotStart = null;
  if (startMarker) {
    const ll = startMarker.getLatLng();
    const xy = proj.toXY(ll.lat, ll.lng);
    const r = SolarGeo.rotate(xy, rot);
    rotStart = { x: r[0], y: r[1] };
  }

  // Target modules
  const targetModules =
    cfg.capMode === 'max'
      ? Number.POSITIVE_INFINITY
      : Math.floor((cfg.targetMW * 1_000_000) / cfg.modWatt);

  const result = SolarLayout.generateLayout(rotBoundary, rotExclusions, {
    ...cfg,
    targetModules,
    startPoint: rotStart
  });

  // PVGIS lookup (async)
  let pv = { ok: false, E_d: null };
  try {
    pv = await SolarPVGIS.getYield({
      lat: cfg.latitude,
      lon: cfg.longitude,
      tilt: cfg.tilt,
      azimuth: cfg.azimuth,
      loss: cfg.loss
    });
  } catch (e) {
    pv = { ok: false, error: String(e) };
  }
  const yieldPerDay = pv.ok && pv.E_d ? pv.E_d / 365 : (pv.E_y ? pv.E_y / 365 : 4.5);

  const prod = SolarLayout.calcProduction(result.counts.panels, cfg.modWatt, yieldPerDay);

  // Draw tables back on the map - outline + individual modules within each table.
  const actualW = result.params.actualW;
  const actualH = result.params.actualH;
  const cosT = Math.cos(cfg.tilt * SolarGeo.DEG);
  const moduleStepY = actualH * cosT + cfg.gapV; // projected per-stack-row pitch
  const moduleProjH = actualH * cosT;            // projected single-module height
  const moduleStepX = actualW + cfg.gapH;

  const fillCol = cfg.panelColor;
  const strokeCol = darken(fillCol, 0.45);

  function rectLatLng(x, y, w, h) {
    const c = [
      [x, y],
      [x + w, y],
      [x + w, y + h],
      [x, y + h]
    ];
    return SolarGeo.rotatePoly(c, -rot).map(([X, Y]) => proj.toLatLon(X, Y));
  }

  for (const t of result.tables) {
    // Table outline
    L.polygon(rectLatLng(t.x, t.y, t.w, t.h), {
      color: strokeCol,
      weight: 1.2,
      fill: false,
      interactive: false
    }).addTo(layoutGroup);

    // Individual modules: cols across, modPerStack stacked rows
    for (let r = 0; r < cfg.modPerStack; r++) {
      for (let c = 0; c < t.cols; c++) {
        const mx = t.x + c * moduleStepX;
        const my = t.y + r * moduleStepY;
        L.polygon(rectLatLng(mx, my, actualW, moduleProjH), {
          color: strokeCol,
          weight: 0.6,
          fillColor: fillCol,
          fillOpacity: cfg.panelOpacity,
          interactive: false
        }).addTo(layoutGroup);
      }
    }
  }

  // Render report
  const areaM2 = SolarGeo.polyAreaM2(boundaryXY);
  const areaAcres = areaM2 / 4046.86;
  const sizeRows = [...result.counts.perSize.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([cols, qty]) => [`Table ${cols}x${cfg.modPerStack}`, String(qty)]);

  renderReport({
    summary: [
      ['Boundary Area', `${areaAcres.toFixed(3)} ac (${areaM2.toFixed(0)} m²)`],
      ['Total Modules', String(result.counts.panels)],
      ['System Capacity', `${prod.capMW.toFixed(3)} MWp`],
      ['Total Tables', String(result.counts.tables)],
      ['End Clamps (Qty)', String(result.counts.endClamps)],
      ['Mid Clamps (Qty)', String(result.counts.midClamps)],
      ...sizeRows,
      ['Orientation', cfg.orient],
      ['Tilt Angle', `${cfg.tilt.toFixed(1)}°`],
      ['Azimuth', `${cfg.azimuth.toFixed(0)}°`],
      ['Inter-row Pitch', `${result.params.rowPitch.toFixed(2)} m`],
      ['Design Solar Alt.', `${result.params.solarAltDesign.toFixed(2)}°`],
      ['Location', `${cfg.latitude.toFixed(4)}, ${cfg.longitude.toFixed(4)}`]
    ],
    energy: [
      ['PVGIS Status', pv.ok ? 'OK (v5.2)' : `Fallback (${pv.error || 'no data'})`],
      ['Specific Yield', `${yieldPerDay.toFixed(3)} kWh/kWp/day`],
      ['Daily Generation', `${prod.daily.toFixed(0)} kWh`],
      ['Monthly Energy', `${(prod.annual / 12).toFixed(0)} kWh`],
      ['Annual Energy', `${prod.annual.toFixed(0)} kWh`]
    ]
  });

  // Fit map to show all
  if (layoutGroup.getLayers().length) {
    map.fitBounds(boundaryGroup.getBounds().pad(0.1));
  }

  setStatus(
    `Placed ${result.counts.panels} modules in ${result.counts.tables} tables ` +
      `(${prod.capMW.toFixed(3)} MWp).`,
    'ok'
  );

  lastReport = { cfg, result, prod, pv, areaM2, areaAcres };
}

let lastReport = null;

function renderReport({ summary, energy }) {
  const html =
    '<h3>Layout Summary</h3><table>' +
    summary.map((r) => `<tr><td>${r[0]}</td><td>${r[1]}</td></tr>`).join('') +
    '</table>' +
    '<h3>Energy (PVGIS 5.2)</h3><table>' +
    energy.map((r) => `<tr><td>${r[0]}</td><td>${r[1]}</td></tr>`).join('') +
    '</table>';
  $('report').innerHTML = html;
}

// ----- Search (Nominatim) with autocomplete -----
const searchBox = $('searchBox');
const suggestionsEl = $('searchSuggestions');
let suggestDebounce = null;
let activeSuggestIdx = -1;
let currentSuggestions = [];

function isLatLon(q) {
  const parts = q.split(',').map((s) => parseFloat(s.trim()));
  return parts.length === 2 && isFinite(parts[0]) && isFinite(parts[1]) ? parts : null;
}

async function fetchSuggestions(q) {
  const url =
    `https://nominatim.openstreetmap.org/search?format=json&limit=6&addressdetails=1&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error('Search HTTP ' + res.status);
  return await res.json();
}

function renderSuggestions(items) {
  currentSuggestions = items;
  activeSuggestIdx = -1;
  if (!items.length) {
    suggestionsEl.hidden = true;
    suggestionsEl.innerHTML = '';
    return;
  }
  suggestionsEl.innerHTML = items
    .map((it, i) => `<li data-idx="${i}">${escapeHtml(it.display_name)}</li>`)
    .join('');
  suggestionsEl.hidden = false;
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

function pickSuggestion(idx) {
  const it = currentSuggestions[idx];
  if (!it) return;
  searchBox.value = it.display_name;
  suggestionsEl.hidden = true;
  goTo(parseFloat(it.lat), parseFloat(it.lon), it.display_name);
}

function goTo(lat, lon, label) {
  map.setView([lat, lon], 19);
  setStatus(`Centered at ${label || `${lat.toFixed(4)}, ${lon.toFixed(4)}`}.`, 'ok');
}

searchBox.addEventListener('input', () => {
  const q = searchBox.value.trim();
  clearTimeout(suggestDebounce);
  if (q.length < 3 || isLatLon(q)) {
    suggestionsEl.hidden = true;
    return;
  }
  suggestDebounce = setTimeout(async () => {
    try {
      const items = await fetchSuggestions(q);
      renderSuggestions(items);
    } catch (e) {
      // silently fail; search button still works
    }
  }, 300);
});

searchBox.addEventListener('keydown', (e) => {
  if (suggestionsEl.hidden) {
    if (e.key === 'Enter') $('searchBtn').click();
    return;
  }
  const items = suggestionsEl.querySelectorAll('li');
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    activeSuggestIdx = Math.min(items.length - 1, activeSuggestIdx + 1);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    activeSuggestIdx = Math.max(0, activeSuggestIdx - 1);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (activeSuggestIdx >= 0) pickSuggestion(activeSuggestIdx);
    else $('searchBtn').click();
    return;
  } else if (e.key === 'Escape') {
    suggestionsEl.hidden = true;
    return;
  } else {
    return;
  }
  items.forEach((li, i) => li.classList.toggle('active', i === activeSuggestIdx));
});

suggestionsEl.addEventListener('mousedown', (e) => {
  const li = e.target.closest('li');
  if (!li) return;
  pickSuggestion(parseInt(li.dataset.idx, 10));
});

document.addEventListener('click', (e) => {
  if (!e.target.closest('.search-wrap')) suggestionsEl.hidden = true;
});

$('searchBtn').onclick = async () => {
  const q = searchBox.value.trim();
  if (!q) return;
  const ll = isLatLon(q);
  if (ll) {
    goTo(ll[0], ll[1]);
    return;
  }
  try {
    setStatus('Searching...');
    const items = await fetchSuggestions(q);
    if (!items.length) {
      setStatus('No results.', 'error');
      return;
    }
    renderSuggestions(items);
    pickSuggestion(0);
  } catch (e) {
    setStatus('Search failed: ' + e.message, 'error');
  }
};

// ----- Pick start point -----
$('pickStartBtn').onclick = () => {
  pickingStart = !pickingStart;
  $('pickStartBtn').classList.toggle('active', pickingStart);
  document.getElementById('map').style.cursor = pickingStart ? 'crosshair' : '';
  setStatus(
    pickingStart
      ? 'Click anywhere on the map to set the layout start point.'
      : 'Start-point picking cancelled.'
  );
};

$('generateBtn').onclick = () => {
  generate().catch((e) => setStatus('Error: ' + e.message, 'error'));
};
$('clearLayoutBtn').onclick = () => {
  layoutGroup.clearLayers();
  $('report').innerHTML = '';
  setStatus('Layout cleared.');
};
$('clearAllBtn').onclick = () => {
  boundaryGroup.clearLayers();
  excludeGroup.clearLayers();
  layoutGroup.clearLayers();
  clearStartPoint();
  $('report').innerHTML = '';
  setStatus('Cleared all drawings.');
};

$('exportBtn').onclick = () => {
  if (!lastReport) {
    setStatus('Generate a layout first.', 'error');
    return;
  }
  const html =
    '<!doctype html><meta charset="utf-8"><title>SolarPro Report</title>' +
    '<style>body{font-family:Segoe UI,Arial,sans-serif;margin:24px;color:#111}' +
    'table{border-collapse:collapse;margin:8px 0}td{border:1px solid #ddd;padding:4px 10px}' +
    'h1{color:#0f766e}h2{color:#0f766e;margin-top:24px}</style>' +
    '<h1>SolarPro Layout Report</h1>' +
    document.getElementById('report').innerHTML;
  const blob = new Blob([html], { type: 'text/html' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `SolarPro-Report-${new Date().toISOString().slice(0, 10)}.html`;
  a.click();
  URL.revokeObjectURL(a.href);
};

setStatus('Ready. Search a location, then draw the boundary polygon.');

// ----- Color helpers + live recolor -----
function darken(hex, factor) {
  const m = /^#([\da-f]{6})$/i.exec(hex || '');
  if (!m) return '#1e3a8a';
  let n = parseInt(m[1], 16);
  let r = (n >> 16) & 0xff, g = (n >> 8) & 0xff, b = n & 0xff;
  r = Math.max(0, Math.round(r * (1 - factor)));
  g = Math.max(0, Math.round(g * (1 - factor)));
  b = Math.max(0, Math.round(b * (1 - factor)));
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
}

// Preset dropdown -> color picker (and back, when picker is touched)
$('panelPreset').addEventListener('change', () => {
  $('panelColor').value = $('panelPreset').value;
  recolorLayout();
});
$('panelColor').addEventListener('input', recolorLayout);
$('panelOpacity').addEventListener('input', recolorLayout);

function recolorLayout() {
  const fill = $('panelColor').value;
  const stroke = darken(fill, 0.45);
  const op = parseFloat($('panelOpacity').value);
  layoutGroup.eachLayer((layer) => {
    if (!(layer instanceof L.Polygon)) return;
    const opts = layer.options;
    if (opts.fill === false) {
      // Table outline
      layer.setStyle({ color: stroke });
    } else {
      layer.setStyle({ color: stroke, fillColor: fill, fillOpacity: op });
    }
  });
}
