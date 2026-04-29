/* ─── app.js — main application controller ───────────────────────────── */

// ─── Chart type picker ────────────────────────────────────────────────────

const pickerButtons = document.querySelectorAll('.chart-picker-button');

pickerButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    const type = btn.dataset.chartType;

    if (type === 'default') {
      // Default deselects everything else and selects only itself
      pickerButtons.forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
    } else {
      // Deselect Default when any specific type is chosen
      document.querySelector('[data-chart-type="default"]').classList.remove('selected');
      btn.classList.toggle('selected');

      // If nothing is selected, fall back to Default
      const anySelected = [...pickerButtons].some(b =>
        b.classList.contains('selected') && b.dataset.chartType !== 'default'
      );
      if (!anySelected) {
        document.querySelector('[data-chart-type="default"]').classList.add('selected');
      }
    }
  });
});

/** Returns the currently selected chart types, or [] if Default is active. */
function getSelectedTypes() {
  const selected = [...pickerButtons]
    .filter(b => b.classList.contains('selected'))
    .map(b => b.dataset.chartType);

  if (selected.includes('default') || selected.length === 0) return [];
  return selected;
}

// ─── File input wiring ────────────────────────────────────────────────────

document.getElementById('file-input').addEventListener('change', e => {
  handleFile(e.target.files[0]);
});

const zone = document.getElementById('upload-zone');
zone.addEventListener('dragover',  e => { e.preventDefault(); zone.classList.add('dragover'); });
zone.addEventListener('dragleave', ()  => zone.classList.remove('dragover'));
zone.addEventListener('drop',      e  => {
  e.preventDefault();
  zone.classList.remove('dragover');
  handleFile(e.dataTransfer.files[0]);
});

// ─── UI helpers ───────────────────────────────────────────────────────────

function showError(msg) {
  document.getElementById('error-text').textContent = msg;
  document.getElementById('error-box').classList.add('visible');
  document.getElementById('loading-state').classList.remove('visible');
}

function hideError() {
  document.getElementById('error-box').classList.remove('visible');
}

function showLoading() {
  document.getElementById('loading-state').classList.add('visible');
  ['step1', 'step2', 'step3', 'step4'].forEach(id => {
    document.getElementById(id).classList.remove('active');
  });
}

async function animateLoadingSteps() {
  for (const id of ['step1', 'step2', 'step3', 'step4']) {
    document.getElementById(id).classList.add('active');
    await sleep(600);
  }
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function resetApp() {
  document.getElementById('results').classList.remove('visible');
  document.getElementById('loading-state').classList.remove('visible');
  hideError();
  document.getElementById('charts-track').innerHTML = '';
  document.getElementById('selection-message').innerHTML = '';
  document.getElementById('file-input').value = '';
  if (typeof Chart !== 'undefined' && Chart.instances) {
    Object.values(Chart.instances).forEach(c => c.destroy());
  }
}

// ─── Main flow ────────────────────────────────────────────────────────────

async function handleFile(file) {
  if (!file) return;

  hideError();
  document.getElementById('results').classList.remove('visible');

  const ext = file.name.split('.').pop().toLowerCase();
  if (!['csv', 'json'].includes(ext)) {
    showError(`Unsupported file type ".${ext}". Please upload a .csv or .json file.`);
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    showError('File exceeds the 10 MB limit. Please upload a smaller dataset.');
    return;
  }

  showLoading();

  let parsed;
  try {
    const text = await readFileText(file);
    parsed = ext === 'json' ? parseJSON(text) : parseCSV(text);
    validateParsed(parsed);
  } catch (e) {
    showError('Could not parse file: ' + e.message);
    document.getElementById('loading-state').classList.remove('visible');
    return;
  }

  const colTypes      = inferColTypes(parsed.rows, parsed.cols);
  const preferredTypes = getSelectedTypes();

  const [result] = await Promise.all([
    selectCharts(parsed, colTypes, file.name, preferredTypes),
    animateLoadingSteps(),
  ]);

  document.getElementById('loading-state').classList.remove('visible');
  renderResults(result, parsed);
}

// ─── Results rendering ────────────────────────────────────────────────────

function renderResults(result, parsed) {
  // selectCharts may return a plain array (legacy) or a result object
  const charts      = Array.isArray(result) ? result : (result.charts || result);
  const invalidTypes   = Array.isArray(result) ? [] : (result.invalidTypes || []);
  const fallbackToDefault = Array.isArray(result) ? false : (result.fallbackToDefault || false);

  const track = document.getElementById('charts-track');
  track.innerHTML = '';
  document.getElementById('chart-count').textContent = charts.length;
  document.getElementById('results').classList.add('visible');

  // Show a message if some requested types couldn't be rendered
  const msgEl = document.getElementById('selection-message');
  msgEl.innerHTML = '';
  if (invalidTypes.length > 0) {
    const names = invalidTypes.map(t => CHART_META[t]?.label || t).join(', ');
    if (fallbackToDefault) {
      msgEl.innerHTML = `<div class="selection-notice warn">None of your selected types (${names}) were compatible with this dataset — showing AI-recommended charts instead.</div>`;
    } else {
      msgEl.innerHTML = `<div class="selection-notice">Some selected types weren't compatible with this data and were skipped: <strong>${names}</strong>.</div>`;
    }
  }

  charts.forEach((cfg, idx) => {
    track.appendChild(buildCard(cfg, parsed.rows, idx));
  });
}

function buildCard(cfg, rows, idx) {
  const meta   = CHART_META[cfg.type] || CHART_META['bar'];
  const wrapId = `wrap-${idx}`;

  const card = document.createElement('div');
  card.className = 'chart-card';
  card.innerHTML = `
    <div class="chart-card-header">
      <span class="chart-type-badge ${meta.badgeClass}">${meta.label}</span>
    </div>
    <div class="chart-canvas-wrap" id="${wrapId}"></div>
    <div class="chart-description">
      <div class="chart-description-label">AI Insight</div>
      <p>${cfg.insight || 'Visualizing data.'}</p>
    </div>`;

  setTimeout(() => drawChart(cfg, rows, wrapId, idx), 50);
  return card;
}