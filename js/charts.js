/* ─── charts.js — all chart rendering logic ──────────────────────────── */

// ─── Helpers ─────────────────────────────────────────────────────────────

/** Filter rows to only those where both xCol and yCol are present & numeric. */
function cleanRows(rows, xCol, yCol) {
  return rows.filter(
    r =>
      r[xCol] !== null && r[xCol] !== undefined &&
      r[yCol] !== null && r[yCol] !== undefined &&
      !isNaN(parseFloat(r[yCol]))
  );
}

// ─── Dispatch ─────────────────────────────────────────────────────────────

/**
 * Route a chart config to the correct draw function.
 * Special types (heatmap, geo, candlestick) receive the wrapper <div>;
 * Chart.js types receive a <canvas> context.
 *
 * @param {object}    cfg    — AI-selected chart config
 * @param {object[]}  rows   — parsed dataset rows
 * @param {string}    wrapId — DOM id of the .chart-canvas-wrap element
 * @param {number}    idx    — card index (used for canvas id)
 */
function drawChart(cfg, rows, wrapId, idx) {
  const wrap = document.getElementById(wrapId);
  if (!wrap) return;

  // Non-canvas chart types
  if (cfg.type === 'heatmap')     { drawHeatmap(cfg, rows, wrap);     return; }
  if (cfg.type === 'geo')         { drawGeo(cfg, rows, wrap);          return; }
  if (cfg.type === 'candlestick') { drawCandlestick(cfg, rows, wrap);  return; }

  // Chart.js types — create a <canvas> and hand off its context
  const canvas = document.createElement('canvas');
  canvas.id = `canvas-${idx}`;
  wrap.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  try {
    switch (cfg.type) {
      case 'bar':      drawBar(ctx, cfg, rows);          break;
      case 'line':     drawLine(ctx, cfg, rows);         break;
      case 'pie':      drawPie(ctx, cfg, rows, false);   break;
      case 'doughnut': drawPie(ctx, cfg, rows, true);    break;
      case 'scatter':  drawScatter(ctx, cfg, rows);      break;
      case 'stacked':  drawStacked(ctx, cfg, rows);      break;
      default:         drawBar(ctx, cfg, rows);
    }
  } catch (e) {
    wrap.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;
                  height:100%;color:var(--muted);font-size:13px;text-align:center;padding:20px;">
        Could not render this chart type for the current data.
      </div>`;
  }
}

// ─── Chart.js renderers ───────────────────────────────────────────────────

function drawBar(ctx, cfg, rows) {
  const MAX  = 30;
  const xCol = cfg.xCol || Object.keys(rows[0])[0];
  const yCol = cfg.yCol || Object.keys(rows[0])[1];
  const data = cleanRows(rows, xCol, yCol).slice(0, MAX);

  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: data.map(r => String(r[xCol]).slice(0, 18)),
      datasets: [{
        label: yCol,
        data: data.map(r => parseFloat(r[yCol])),
        backgroundColor: PALETTE.map(c => c + 'bb'),
        borderColor: PALETTE,
        borderWidth: 1,
        borderRadius: 4,
      }],
    },
    options: {
      ...CHART_DEFAULTS,
      responsive: true,
      maintainAspectRatio: false,
      scales: axisScales(),
    },
  });
}

function drawLine(ctx, cfg, rows) {
  const MAX  = 50;
  const xCol = cfg.xCol || Object.keys(rows[0])[0];
  const yCol = cfg.yCol || Object.keys(rows[0])[1];
  const data = cleanRows(rows, xCol, yCol).slice(0, MAX);

  new Chart(ctx, {
    type: 'line',
    data: {
      labels: data.map(r => String(r[xCol]).slice(0, 16)),
      datasets: [{
        label: yCol,
        data: data.map(r => parseFloat(r[yCol])),
        borderColor: PALETTE[1],
        backgroundColor: PALETTE[1] + '18',
        fill: true,
        tension: 0.35,
        pointBackgroundColor: PALETTE[1],
        pointRadius: 3,
      }],
    },
    options: {
      ...CHART_DEFAULTS,
      responsive: true,
      maintainAspectRatio: false,
      scales: axisScales(),
    },
  });
}

function drawPie(ctx, cfg, rows, isDoughnut) {
  const MAX  = 12;
  const xCol = cfg.xCol || Object.keys(rows[0])[0];
  const yCol = cfg.yCol || Object.keys(rows[0])[1];

  // Aggregate by label
  const agg = {};
  rows.forEach(r => {
    const k = String(r[xCol]);
    const v = parseFloat(r[yCol]);
    if (k && !isNaN(v)) agg[k] = (agg[k] || 0) + v;
  });
  const entries = Object.entries(agg).sort((a, b) => b[1] - a[1]).slice(0, MAX);

  new Chart(ctx, {
    type: isDoughnut ? 'doughnut' : 'pie',
    data: {
      labels: entries.map(e => e[0]),
      datasets: [{
        data: entries.map(e => e[1]),
        backgroundColor: PALETTE.map(c => c + 'cc'),
        borderColor: '#0a0a0f',
        borderWidth: 2,
      }],
    },
    options: {
      ...CHART_DEFAULTS,
      responsive: true,
      maintainAspectRatio: false,
      cutout: isDoughnut ? '55%' : 0,
    },
  });
}

function drawScatter(ctx, cfg, rows) {
  const MAX  = 200;
  const xCol = cfg.xCol || Object.keys(rows[0])[0];
  const yCol = cfg.yCol || Object.keys(rows[0])[1];
  const data = rows
    .slice(0, MAX)
    .map(r => ({ x: parseFloat(r[xCol]), y: parseFloat(r[yCol]) }))
    .filter(p => !isNaN(p.x) && !isNaN(p.y));

  new Chart(ctx, {
    type: 'scatter',
    data: {
      datasets: [{
        label: `${xCol} vs ${yCol}`,
        data,
        backgroundColor: PALETTE[0] + '88',
        borderColor: PALETTE[0],
        pointRadius: 4,
      }],
    },
    options: {
      ...CHART_DEFAULTS,
      responsive: true,
      maintainAspectRatio: false,
      scales: axisScales({ xTitle: xCol, yTitle: yCol }),
    },
  });
}

function drawStacked(ctx, cfg, rows) {
  const MAX  = 20;
  const xCol = cfg.xCol || Object.keys(rows[0])[0];
  const yCols = (cfg.yCols && cfg.yCols.length)
    ? cfg.yCols
    : Object.keys(rows[0])
        .filter(c => c !== xCol && !isNaN(parseFloat(rows[0][c])))
        .slice(0, 5);

  const sliced = rows.slice(0, MAX);

  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: sliced.map(r => String(r[xCol]).slice(0, 16)),
      datasets: yCols.map((col, i) => ({
        label: col,
        data: sliced.map(r => parseFloat(r[col]) || 0),
        backgroundColor: PALETTE[i % PALETTE.length] + 'bb',
        borderColor: PALETTE[i % PALETTE.length],
        borderWidth: 1,
      })),
    },
    options: {
      ...CHART_DEFAULTS,
      responsive: true,
      maintainAspectRatio: false,
      scales: axisScales({ stacked: true }),
    },
  });
}

// ─── Special / non-Chart.js renderers ────────────────────────────────────

function drawHeatmap(cfg, rows, wrap) {
  wrap.style.padding    = '16px';
  wrap.style.height     = 'auto';
  wrap.style.minHeight  = '200px';

  const MAX_R = 10, MAX_C = 8;
  const cols    = Object.keys(rows[0]).slice(0, MAX_C);
  const numCols = cols.filter(c => !isNaN(parseFloat(rows[0][c])));
  const subset  = rows.slice(0, MAX_R);

  const allVals = [];
  subset.forEach(r => numCols.forEach(c => {
    const v = parseFloat(r[c]);
    if (!isNaN(v)) allVals.push(v);
  }));
  const minV = Math.min(...allVals);
  const maxV = Math.max(...allVals);

  function heatColor(v) {
    const t = maxV === minV ? 0.5 : (v - minV) / (maxV - minV);
    return `rgb(${Math.round(30 + t * 170)},${Math.round(200 - t * 100)},${Math.round(240 - t * 180)})`;
  }

  const table = document.createElement('table');
  table.className = 'heatmap-table';

  // Header row
  const thead = document.createElement('thead');
  const hRow  = document.createElement('tr');
  [''].concat(numCols).forEach(h => {
    const th = document.createElement('th');
    th.textContent = String(h).slice(0, 14);
    hRow.appendChild(th);
  });
  thead.appendChild(hRow);
  table.appendChild(thead);

  // Data rows
  const tbody = document.createElement('tbody');
  subset.forEach(row => {
    const tr       = document.createElement('tr');
    const labelCol = cols.find(c => isNaN(parseFloat(row[c]))) || cols[0];
    const lTd      = document.createElement('td');
    lTd.textContent = String(row[labelCol]).slice(0, 14);
    lTd.style.color = 'var(--muted)';
    tr.appendChild(lTd);

    numCols.forEach(c => {
      const td = document.createElement('td');
      const v  = parseFloat(row[c]);
      td.textContent = isNaN(v) ? '–' : v.toFixed(1);
      if (!isNaN(v)) {
        td.style.background  = heatColor(v);
        td.style.color       = '#0a0a0f';
        td.style.fontWeight  = '500';
      }
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);

  const scrollWrap = document.createElement('div');
  scrollWrap.className = 'heatmap-table-wrap';
  scrollWrap.appendChild(table);
  wrap.appendChild(scrollWrap);
}

async function drawGeo(cfg, rows, wrap) {
  // Leaflet needs a sized container with an explicit id
  const mapId = `map-${Math.random().toString(36).slice(2, 8)}`;
  wrap.style.padding = '0';
  wrap.style.height  = '420px';
  wrap.innerHTML = `<div id="${mapId}" style="width:100%;height:100%;border-radius:0 0 0 0;"></div>`;

  // Wait a tick for the DOM to paint
  await new Promise(r => setTimeout(r, 80));

  if (typeof L === 'undefined') {
    wrap.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--muted);font-size:13px;">Leaflet failed to load. Check your internet connection.</div>`;
    return;
  }

  // ── Dark tile layer ────────────────────────────────────────────────
  const map = L.map(mapId, { zoomControl: true, scrollWheelZoom: false });
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '© OpenStreetMap © CARTO',
    subdomains: 'abcd',
    maxZoom: 19,
  }).addTo(map);

  const geoType     = cfg.geoType     || 'markers';
  const scope       = cfg.scope       || 'world';
  const locationCol = cfg.locationCol || null;
  const latCol      = cfg.latCol      || null;
  const lonCol      = cfg.lonCol      || null;
  const valueCol    = cfg.valueCol    || null;

  // ── MARKERS mode ──────────────────────────────────────────────────
  if (geoType === 'markers' && latCol && lonCol) {
    const values = rows.map(r => parseFloat(r[valueCol])).filter(v => !isNaN(v));
    const minV   = Math.min(...values);
    const maxV   = Math.max(...values);

    const markers = [];
    rows.forEach(r => {
      const lat = parseFloat(r[latCol]);
      const lng = parseFloat(r[lonCol]);
      const val = valueCol ? parseFloat(r[valueCol]) : null;
      if (isNaN(lat) || isNaN(lng)) return;

      const t      = (maxV > minV && val !== null) ? (val - minV) / (maxV - minV) : 0.5;
      const radius = 6 + t * 14;
      const color  = interpolateColor('#60b4f0', '#c8f060', t);

      const circle = L.circleMarker([lat, lng], {
        radius, color, fillColor: color,
        fillOpacity: 0.8, weight: 1, opacity: 0.9,
      });

      const label = locationCol ? r[locationCol] : '';
      const tipVal = val !== null ? `<br><strong>${valueCol}:</strong> ${val.toLocaleString()}` : '';
      circle.bindTooltip(`<div style="font-family:DM Sans,sans-serif;font-size:12px;">${label}${tipVal}</div>`, { sticky: true });
      markers.push(circle);
    });

    if (markers.length) {
      const group = L.featureGroup(markers).addTo(map);
      map.fitBounds(group.getBounds().pad(0.1));
    } else {
      map.setView([20, 0], 2);
    }
    return;
  }

  // ── MARKERS mode — city names (geocode from built-in lookup) ──────
  if (geoType === 'markers' && locationCol) {
    const cityCoords = getCityCoords();
    const values = rows.map(r => parseFloat(r[valueCol])).filter(v => !isNaN(v));
    const minV   = Math.min(...values);
    const maxV   = Math.max(...values);
    const placed = [];

    rows.forEach(r => {
      const name  = String(r[locationCol]).trim();
      const coord = cityCoords[name.toLowerCase()];
      if (!coord) return;
      const val = valueCol ? parseFloat(r[valueCol]) : null;
      const t   = (maxV > minV && val !== null) ? (val - minV) / (maxV - minV) : 0.5;
      const radius = 7 + t * 14;
      const color  = interpolateColor('#60b4f0', '#c8f060', t);

      const circle = L.circleMarker(coord, {
        radius, color, fillColor: color,
        fillOpacity: 0.85, weight: 1,
      });
      const tipVal = val !== null ? `<br><strong>${valueCol}:</strong> ${val.toLocaleString()}` : '';
      circle.bindTooltip(`<div style="font-family:DM Sans,sans-serif;font-size:12px;">${name}${tipVal}</div>`, { sticky: true });
      placed.push(circle);
    });

    if (placed.length) {
      const group = L.featureGroup(placed).addTo(map);
      map.fitBounds(group.getBounds().pad(0.2));
    } else {
      map.setView([20, 0], 2);
    }
    return;
  }

  // ── CHOROPLETH mode ───────────────────────────────────────────────
  if (geoType === 'choropleth') {
    const geoJsonUrl = getGeoJsonUrl(scope);

    // Build a lookup: canonical GeoJSON name → value
    // Each user value is normalized through the alias table so that
    // "United States", "USA", "US", "America" all resolve to "united states"
    // which matches what the GeoJSON feature names contain.
    const lookup = {};
    rows.forEach(r => {
      if (!locationCol || !valueCol) return;
      const raw = String(r[locationCol]).trim().toLowerCase();
      const k   = normalizeLocationName(raw);
      const v   = parseFloat(r[valueCol]);
      if (!isNaN(v)) lookup[k] = v;
    });

    const values  = Object.values(lookup);
    const minV    = Math.min(...values);
    const maxV    = Math.max(...values);

    try {
      const res     = await fetch(geoJsonUrl);
      const geoData = await res.json();

      L.geoJSON(geoData, {
        style: feature => {
          const name = getFeatureName(feature, scope);
          const val  = lookup[name];
          const t    = (val !== undefined && maxV > minV) ? (val - minV) / (maxV - minV) : null;
          return {
            fillColor:   t !== null ? choroplethColor(t) : '#2a2a3a',
            fillOpacity: t !== null ? 0.9 : 0.25,
            color:       'rgba(255,255,255,0.2)',
            weight:      0.8,
          };
        },
        onEachFeature: (feature, layer) => {
          const name    = getFeatureName(feature, scope);
          const val     = lookup[name];
          const display = val !== undefined
            ? `<strong>${valueCol}:</strong> ${val.toLocaleString()}`
            : 'No data';
          const label = feature.properties.name || feature.properties.NAME || name;
          layer.bindTooltip(
            `<div style="font-family:DM Sans,sans-serif;font-size:12px;"><strong>${label}</strong><br>${display}</div>`,
            { sticky: true }
          );
        },
      }).addTo(map);

      // Fit view based on scope
      const views = {
        world:  [[20, 0], 2],
        usa:    [[38, -97], 4],
        canada: [[60, -96], 3],
      };
      const [center, zoom] = views[scope] || views.world;
      map.setView(center, zoom);

    } catch (e) {
      console.error('GeoJSON fetch failed:', e);
      wrap.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--muted);font-size:13px;text-align:center;padding:20px;">Could not load map boundaries. Check your internet connection.</div>`;
    }
  }
}

// ── Geo helpers ───────────────────────────────────────────────────────────

/**
 * Normalizes a location string to its canonical GeoJSON name.
 * Handles common abbreviations, alternate spellings, and colloquial names
 * so that user data values reliably match GeoJSON feature names.
 * Input should already be lowercased and trimmed.
 */
function normalizeLocationName(name) {
  const ALIASES = {
    // ── Countries ────────────────────────────────────────────────────
    // United States
    'united states': 'united states of america',
    'united states of america': 'united states of america',
    'usa': 'united states of america',
    'us': 'united states of america',
    'u.s.': 'united states of america',
    'u.s.a.': 'united states of america',
    'america': 'united states of america',
    // United Kingdom
    'united kingdom': 'united kingdom',
    'uk': 'united kingdom',
    'u.k.': 'united kingdom',
    'great britain': 'united kingdom',
    'britain': 'united kingdom',
    'england': 'united kingdom',
    // Russia
    'russia': 'russia',
    'russian federation': 'russia',
    // South Korea
    'south korea': 'south korea',
    'korea, south': 'south korea',
    'republic of korea': 'south korea',
    // North Korea
    'north korea': 'north korea',
    'korea, north': 'north korea',
    // China
    'china': 'china',
    "people's republic of china": 'china',
    'prc': 'china',
    // Taiwan
    'taiwan': 'taiwan',
    'republic of china': 'taiwan',
    // Iran
    'iran': 'iran',
    'islamic republic of iran': 'iran',
    // Syria
    'syria': 'syria',
    'syrian arab republic': 'syria',
    // Bolivia
    'bolivia': 'bolivia',
    'plurinational state of bolivia': 'bolivia',
    // Venezuela
    'venezuela': 'venezuela',
    'bolivarian republic of venezuela': 'venezuela',
    // Tanzania
    'tanzania': 'tanzania',
    'united republic of tanzania': 'tanzania',
    // Congo (DRC)
    'democratic republic of the congo': 'democratic republic of the congo',
    'dr congo': 'democratic republic of the congo',
    'drc': 'democratic republic of the congo',
    'congo, the democratic republic of the': 'democratic republic of the congo',
    // Congo (Republic)
    'republic of the congo': 'republic of congo',
    'congo': 'republic of congo',
    // Czech Republic
    'czech republic': 'czech republic',
    'czechia': 'czech republic',
    // Slovakia
    'slovakia': 'slovakia',
    'slovak republic': 'slovakia',
    // Ivory Coast
    "ivory coast": "côte d'ivoire",
    "cote d'ivoire": "côte d'ivoire",
    "côte d'ivoire": "côte d'ivoire",
    // Myanmar
    'myanmar': 'myanmar',
    'burma': 'myanmar',
    // Vietnam
    'vietnam': 'vietnam',
    'viet nam': 'vietnam',
    // Laos
    'laos': 'laos',
    "lao people's democratic republic": 'laos',
    // Moldova
    'moldova': 'moldova',
    'republic of moldova': 'moldova',
    // Macedonia
    'north macedonia': 'north macedonia',
    'macedonia': 'north macedonia',
    'former yugoslav republic of macedonia': 'north macedonia',
    // Palestine
    'palestine': 'palestine',
    'state of palestine': 'palestine',
    'west bank': 'palestine',
    // South Sudan
    'south sudan': 'south sudan',
    // Cape Verde
    'cape verde': 'cape verde',
    'cabo verde': 'cape verde',
    // Eswatini
    'eswatini': 'swaziland',
    'swaziland': 'swaziland',
    // Timor-Leste
    'timor-leste': 'timor-leste',
    'east timor': 'timor-leste',
    // UAE
    'uae': 'united arab emirates',
    'united arab emirates': 'united arab emirates',
    // ── US States (abbreviations → full name) ─────────────────────
    'al': 'alabama', 'ak': 'alaska', 'az': 'arizona', 'ar': 'arkansas',
    'ca': 'california', 'co': 'colorado', 'ct': 'connecticut', 'de': 'delaware',
    'fl': 'florida', 'ga': 'georgia', 'hi': 'hawaii', 'id': 'idaho',
    'il': 'illinois', 'in': 'indiana', 'ia': 'iowa', 'ks': 'kansas',
    'ky': 'kentucky', 'la': 'louisiana', 'me': 'maine', 'md': 'maryland',
    'ma': 'massachusetts', 'mi': 'michigan', 'mn': 'minnesota', 'ms': 'mississippi',
    'mo': 'missouri', 'mt': 'montana', 'ne': 'nebraska', 'nv': 'nevada',
    'nh': 'new hampshire', 'nj': 'new jersey', 'nm': 'new mexico', 'ny': 'new york',
    'nc': 'north carolina', 'nd': 'north dakota', 'oh': 'ohio', 'ok': 'oklahoma',
    'or': 'oregon', 'pa': 'pennsylvania', 'ri': 'rhode island', 'sc': 'south carolina',
    'sd': 'south dakota', 'tn': 'tennessee', 'tx': 'texas', 'ut': 'utah',
    'vt': 'vermont', 'va': 'virginia', 'wa': 'washington', 'wv': 'west virginia',
    'wi': 'wisconsin', 'wy': 'wyoming', 'dc': 'district of columbia',
    // ── Canadian Provinces (abbreviations → full name) ─────────────
    'on': 'ontario', 'qc': 'quebec', 'bc': 'british columbia', 'ab': 'alberta',
    'mb': 'manitoba', 'sk': 'saskatchewan', 'ns': 'nova scotia', 'nb': 'new brunswick',
    'nl': 'newfoundland and labrador', 'pe': 'prince edward island',
    'nt': 'northwest territories', 'nu': 'nunavut', 'yt': 'yukon',
    'newfoundland': 'newfoundland and labrador',
    'pei': 'prince edward island',
  };

  return ALIASES[name] ?? name;
}

/** Returns the correct GeoJSON source URL for the given scope. */
function getGeoJsonUrl(scope) {
  const urls = {
    world:  'https://raw.githubusercontent.com/holtzy/D3-graph-gallery/master/DATA/world.geojson',
    usa:    'https://raw.githubusercontent.com/PublicaMundi/MappingAPI/master/data/geojson/us-states.json',
    canada: 'https://raw.githubusercontent.com/codeforamerica/click_that_hood/master/public/data/canada.geojson',
  };
  return urls[scope] || urls.world;
}

/** Extracts a normalised name string from a GeoJSON feature for lookup. */
function getFeatureName(feature, scope) {
  const props = feature.properties;
  const raw = props.name || props.NAME || props.admin || props.ADMIN ||
              props.NAME_1 || props.name_1 || '';
  return normalizeLocationName(raw.toLowerCase().trim());
}

/** Linear colour interpolation between two hex colours. */
function interpolateColor(hex1, hex2, t) {
  const c1 = hexToRgb(hex1);
  const c2 = hexToRgb(hex2);
  const r  = Math.round(c1.r + (c2.r - c1.r) * t);
  const g  = Math.round(c1.g + (c2.g - c1.g) * t);
  const b  = Math.round(c1.b + (c2.b - c1.b) * t);
  return `rgb(${r},${g},${b})`;
}

/**
 * Multi-stop choropleth color scale.
 * Low  → deep blue  (#1a3a6b)
 * Mid  → teal/cyan  (#1a9a8a)
 * High → lime green (#c8f060)
 * Makes low values clearly visible on a dark map instead of blending in.
 */
function choroplethColor(t) {
  // Three-stop gradient: blue → teal → lime
  const stops = [
    { t: 0.0,  r: 26,  g: 58,  b: 107 },  // deep blue
    { t: 0.35, r: 26,  g: 130, b: 138 },  // teal
    { t: 0.65, r: 96,  g: 200, b: 120 },  // green
    { t: 1.0,  r: 200, g: 240, b: 96  },  // lime
  ];

  // Find the two stops t falls between
  let lo = stops[0], hi = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (t >= stops[i].t && t <= stops[i + 1].t) {
      lo = stops[i];
      hi = stops[i + 1];
      break;
    }
  }

  const range = hi.t - lo.t || 1;
  const u = (t - lo.t) / range;
  return `rgb(${Math.round(lo.r + (hi.r - lo.r) * u)},${Math.round(lo.g + (hi.g - lo.g) * u)},${Math.round(lo.b + (hi.b - lo.b) * u)})`;
}

function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/** Built-in city coordinate lookup for marker mode without lat/lon columns. */
function getCityCoords() {
  return {
    // US cities
    'new york': [40.71, -74.01], 'los angeles': [34.05, -118.24],
    'chicago': [41.88, -87.63], 'houston': [29.76, -95.37],
    'phoenix': [33.45, -112.07], 'philadelphia': [39.95, -75.17],
    'san antonio': [29.42, -98.49], 'san diego': [32.72, -117.16],
    'dallas': [32.78, -96.80], 'san jose': [37.34, -121.89],
    'austin': [30.27, -97.74], 'jacksonville': [30.33, -81.66],
    'san francisco': [37.77, -122.42], 'seattle': [47.61, -122.33],
    'denver': [39.74, -104.98], 'boston': [42.36, -71.06],
    'nashville': [36.17, -86.78], 'baltimore': [39.29, -76.61],
    'louisville': [38.25, -85.76], 'portland': [45.52, -122.68],
    'las vegas': [36.17, -115.14], 'milwaukee': [43.04, -87.91],
    'albuquerque': [35.08, -106.65], 'atlanta': [33.75, -84.39],
    'miami': [25.77, -80.19], 'minneapolis': [44.98, -93.27],
    'cleveland': [41.50, -81.69], 'raleigh': [35.78, -78.64],
    'omaha': [41.26, -95.94], 'charlotte': [35.23, -80.84],
    'sacramento': [38.58, -121.49], 'columbus': [39.96, -82.99],
    'indianapolis': [39.77, -86.16], 'fort worth': [32.75, -97.33],
    'memphis': [35.15, -90.05], 'detroit': [42.33, -83.05],
    'washington': [38.91, -77.04], 'washington dc': [38.91, -77.04],
    'new orleans': [29.95, -90.07], 'tampa': [27.95, -82.46],
    'tucson': [32.22, -110.93], 'fresno': [36.75, -119.77],
    'mesa': [33.42, -111.83], 'kansas city': [39.10, -94.58],
    'virginia beach': [36.85, -75.98], 'colorado springs': [38.83, -104.82],
    'tulsa': [36.15, -95.99], 'wichita': [37.69, -97.34],
    'arlington': [32.74, -97.11],
    // Canadian cities
    'toronto': [43.65, -79.38], 'montreal': [45.50, -73.57],
    'vancouver': [49.25, -123.12], 'calgary': [51.05, -114.07],
    'edmonton': [53.55, -113.49], 'ottawa': [45.42, -75.69],
    'winnipeg': [49.90, -97.14], 'quebec city': [46.81, -71.21],
    'hamilton': [43.26, -79.87], 'kitchener': [43.45, -80.49],
    'london': [42.98, -81.23], 'victoria': [48.43, -123.37],
    'halifax': [44.65, -63.58], 'saskatoon': [52.13, -106.67],
    'regina': [50.45, -104.62], 'kelowna': [49.89, -119.50],
    // World capitals / major cities
    'beijing': [39.91, 116.39], 'shanghai': [31.23, 121.47],
    'tokyo': [35.69, 139.69], 'delhi': [28.61, 77.21],
    'mumbai': [19.08, 72.88], 'london': [51.51, -0.13],
    'paris': [48.85, 2.35], 'berlin': [52.52, 13.40],
    'madrid': [40.42, -3.70], 'rome': [41.90, 12.50],
    'moscow': [55.75, 37.62], 'sydney': [-33.87, 151.21],
    'melbourne': [-37.81, 144.96], 'dubai': [25.20, 55.27],
    'singapore': [1.35, 103.82], 'seoul': [37.57, 126.98],
    'jakarta': [-6.21, 106.85], 'bangkok': [13.75, 100.52],
    'cairo': [30.06, 31.25], 'lagos': [6.45, 3.40],
    'nairobi': [-1.29, 36.82], 'johannesburg': [-26.20, 28.04],
    'buenos aires': [-34.60, -58.38], 'sao paulo': [-23.55, -46.63],
    'rio de janeiro': [-22.91, -43.17], 'mexico city': [19.43, -99.13],
    'bogota': [4.71, -74.07], 'lima': [-12.05, -77.04],
    'santiago': [-33.46, -70.65], 'istanbul': [41.01, 28.95],
    'karachi': [24.86, 67.01], 'dhaka': [23.72, 90.41],
  };
}

function drawCandlestick(cfg, rows, wrap) {
  const MAX   = 30;
  const keys  = rows[0] ? Object.keys(rows[0]) : [];
  const oKey  = keys.find(k => /open/i.test(k));
  const cKey  = keys.find(k => /close/i.test(k));
  const hKey  = keys.find(k => /high/i.test(k));
  const lKey  = keys.find(k => /low/i.test(k));
  const dKey  = keys.find(k => /date|time|period/i.test(k));

  if (!oKey || !cKey || !hKey || !lKey) {
    wrap.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;
                  height:100%;color:var(--muted);font-size:13px;text-align:center;padding:20px;">
        Could not find OHLC columns (open/high/low/close) in the dataset.
      </div>`;
    return;
  }

  const data = rows.slice(0, MAX).map(r => ({
    date: dKey ? String(r[dKey]).slice(0, 10) : '',
    o: parseFloat(r[oKey]),
    c: parseFloat(r[cKey]),
    h: parseFloat(r[hKey]),
    l: parseFloat(r[lKey]),
  })).filter(d => !isNaN(d.o) && !isNaN(d.c) && !isNaN(d.h) && !isNaN(d.l));

  const W      = wrap.clientWidth || 600;
  const H      = 280;
  const pad    = { top: 20, right: 20, bottom: 30, left: 50 };
  const chartW = W - pad.left - pad.right;
  const chartH = H - pad.top  - pad.bottom;

  const allPrices  = data.flatMap(d => [d.h, d.l]);
  const minP       = Math.min(...allPrices);
  const maxP       = Math.max(...allPrices);
  const priceRange = maxP - minP || 1;

  const py   = price => pad.top + chartH - ((price - minP) / priceRange) * chartH;
  const barW = Math.max(4, Math.min(14, chartW / data.length - 3));
  const step = chartW / data.length;

  let svg = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" class="candlestick-wrap">`;

  // Grid lines + Y labels
  for (let i = 0; i <= 4; i++) {
    const y   = pad.top + (chartH / 4) * i;
    const val = (maxP - (priceRange / 4) * i).toFixed(2);
    svg += `<line x1="${pad.left}" y1="${y}" x2="${W - pad.right}" y2="${y}" stroke="rgba(255,255,255,0.05)" stroke-width="1"/>`;
    svg += `<text x="${pad.left - 6}" y="${y + 4}" text-anchor="end" font-size="9" fill="rgba(232,232,240,0.35)" font-family="DM Sans">${val}</text>`;
  }

  // Candles
  data.forEach((d, i) => {
    const cx      = pad.left + i * step + step / 2;
    const bull    = d.c >= d.o;
    const color   = bull ? '#c8f060' : '#f060a8';
    const bodyTop = py(Math.max(d.o, d.c));
    const bodyBot = py(Math.min(d.o, d.c));
    const bodyH   = Math.max(1, bodyBot - bodyTop);

    svg += `<line x1="${cx}" y1="${py(d.h)}" x2="${cx}" y2="${py(d.l)}" stroke="${color}" stroke-width="1.2" opacity="0.7"/>`;
    svg += `<rect x="${cx - barW / 2}" y="${bodyTop}" width="${barW}" height="${bodyH}" fill="${color}" rx="1" opacity="0.85"/>`;
  });

  // X-axis labels
  data.forEach((d, i) => {
    if (i % Math.ceil(data.length / 6) === 0 && d.date) {
      const cx = pad.left + i * step + step / 2;
      svg += `<text x="${cx}" y="${H - 6}" text-anchor="middle" font-size="9" fill="rgba(232,232,240,0.35)" font-family="DM Sans">${d.date}</text>`;
    }
  });

  svg += `</svg>`;
  wrap.innerHTML = svg;
}

// ─── Axis scale factory ───────────────────────────────────────────────────

/**
 * Returns Chart.js `scales` config with consistent dark-theme styling.
 * @param {{ xTitle?, yTitle?, stacked? }} opts
 */
function axisScales({ xTitle, yTitle, stacked = false } = {}) {
  const base = {
    ticks: { color: 'rgba(232,232,240,0.45)', font: { family: 'DM Sans', size: 10 } },
    grid:  { color: 'rgba(255,255,255,0.06)' },
  };
  return {
    x: {
      ...base,
      stacked,
      grid: { color: 'rgba(255,255,255,0.04)' },
      ticks: { ...base.ticks, maxRotation: 45 },
      ...(xTitle ? { title: { display: true, text: xTitle, color: 'rgba(232,232,240,0.4)', font: { size: 11 } } } : {}),
    },
    y: {
      ...base,
      stacked,
      ...(yTitle ? { title: { display: true, text: yTitle, color: 'rgba(232,232,240,0.4)', font: { size: 11 } } } : {}),
    },
  };
}