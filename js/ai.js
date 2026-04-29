/* ─── ai.js — AI chart selection via Anthropic API + heuristic fallback ─ */

async function selectCharts(parsed, colTypes, filename, preferredTypes = []) {
  const { rows, cols } = parsed;

  // ── When user has explicitly selected types, skip AI entirely ──────────
  // Build configs directly from the data for each requested type.
  // AI is only useful for *discovering* what to show — not for executing
  // a user's explicit request.
  if (preferredTypes.length > 0) {
    return buildExplicitCharts(preferredTypes, parsed, colTypes);
  }

  // ── Default mode: ask AI to pick the best 3 ────────────────────────────
  const sample = rows.slice(0, 12);

  const prompt = `You are a data visualization expert. Given the following dataset info, choose the best 3 chart types to visualize this data (or fewer if data doesn't support 3 distinct types). Also provide a short 2-3 sentence insight for each chart.

IMPORTANT: Insights must reference actual values, names, and patterns from the data. Do NOT write generic observations like "this chart makes it easy to spot highest and lowest values" or "revealing which categories dominate". Instead, name the actual top/bottom entries, quote real numbers, describe the actual distribution or trend you see, and note anything surprising or notable. Write as if you've read the data carefully.

The user selected Default, so choose the best chart types automatically based on the dataset.

Dataset: "${filename}"
Rows: ${rows.length}
Columns: ${JSON.stringify(cols)}
Column types: ${JSON.stringify(colTypes)}
Sample (first 12 rows): ${JSON.stringify(sample)}

Available chart types: bar, pie, doughnut, line, scatter, heatmap, stacked, candlestick, geo.

Rules:
- You MUST return exactly 3 chart types if the data can support them — only return fewer if it is genuinely impossible to find a third valid type.
- candlestick: only if columns named open/close/high/low or similar OHLC exist.
- geo: use when location data is present. You MUST also set geoType and scope.
- heatmap: ideal when there is one string/label column and MULTIPLE numeric columns (e.g. students × assessments, products × metrics). Do not limit this to "correlation matrices" — any multi-numeric grid works.
- stacked: use when there is one label column and 2+ numeric columns — shows composition per entity.
- scatter: needs 2+ numeric columns — use any two numeric columns, not just the first two.
- line: use when numeric columns have a natural order or progression (e.g. assessments in sequence, time points).
- pie/doughnut: best when <=12 categories; not both pie and doughnut together.
- bar: always valid when there is a label column + at least one numeric column.
- Priority for multi-numeric datasets (1 string col + 3+ numeric cols): prefer heatmap, stacked, and line over bar and pie — they show more of the data.

Geo chart rules (when type is "geo"):
- geoType: "choropleth" for country/state/province names, "markers" for city names or lat/lon coords
- scope: "world" for countries, "usa" for US states or cities, "canada" for Canadian provinces or cities
- locationCol: column containing the location name
- latCol/lonCol: columns with coordinates if they exist, otherwise null
- valueCol: the numeric column to color/size by

Respond ONLY with a valid JSON array (no markdown, no explanation):
[
  {
    "type": "bar",
    "xCol": "column_name_or_null",
    "yCol": "column_name_or_null",
    "yCols": ["col1","col2"],
    "insight": "2-3 sentence insight."
  },
  {
    "type": "geo",
    "geoType": "choropleth",
    "scope": "world",
    "locationCol": "country",
    "latCol": null,
    "lonCol": null,
    "valueCol": "revenue",
    "insight": "2-3 sentence insight."
  }
]`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1500,
        system: 'You are a data visualization expert. Respond only with valid JSON arrays, no markdown, no explanations.',
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const data = await response.json();
    const raw = data.content?.[0]?.text || '[]';
    const clean = raw.replace(/```json|```/g, '').trim();
    const charts = JSON.parse(clean);
    return { charts, invalidTypes: [], fallbackToDefault: false };

  } catch (e) {
    console.warn('AI API unavailable, using heuristic fallback.', e);
    const charts = heuristicCharts(cols, colTypes, rows);
    return { charts, invalidTypes: [], fallbackToDefault: false };
  }
}

/**
 * Build chart configs directly for each user-selected type.
 * Returns { charts, invalidTypes, fallbackToDefault }.
 * Does not call the AI — column assignment is done heuristically
 * but insights are computed from real data stats.
 */
function buildExplicitCharts(preferredTypes, parsed, colTypes) {
  const { rows, cols } = parsed;
  const numCols = cols.filter(c => colTypes[c] === 'number');
  const strCols = cols.filter(c => colTypes[c] === 'string');

  const charts      = [];
  const invalidTypes = [];

  for (const type of preferredTypes) {
    const cfg = buildChartConfig(type, rows, cols, numCols, strCols, colTypes);
    if (cfg) {
      charts.push(cfg);
    } else {
      invalidTypes.push(type);
    }
  }

  // If every selected type failed, fall back to heuristics
  if (charts.length === 0) {
    const fallback = heuristicCharts(cols, colTypes, rows);
    return { charts: fallback, invalidTypes, fallbackToDefault: true };
  }

  return { charts, invalidTypes, fallbackToDefault: false };
}

/**
 * Build a single chart config for the given type.
 * Returns null if the data doesn't support this chart type.
 */
function buildChartConfig(type, rows, cols, numCols, strCols, colTypes) {
  switch (type) {

    case 'bar': {
      if (!strCols.length || !numCols.length) return null;
      const xCol = strCols[0], yCol = numCols[0];
      return { type, xCol, yCol, insight: barInsight(rows, xCol, yCol) };
    }

    case 'line': {
      if (!strCols.length || !numCols.length) return null;
      const xCol = strCols[0], yCol = numCols[0];
      return { type, xCol, yCol, insight: barInsight(rows, xCol, yCol) };
    }

    case 'pie': {
      if (!strCols.length || !numCols.length) return null;
      const xCol = strCols[0], yCol = numCols[0];
      const uniq = [...new Set(rows.map(r => r[xCol]))];
      if (uniq.length > 12) return null;
      return { type, xCol, yCol, insight: pieInsight(rows, xCol, yCol) };
    }

    case 'doughnut': {
      if (!strCols.length || !numCols.length) return null;
      const xCol = strCols[0], yCol = numCols[0];
      const uniq = [...new Set(rows.map(r => r[xCol]))];
      if (uniq.length > 12) return null;
      return { type, xCol, yCol, insight: pieInsight(rows, xCol, yCol) };
    }

    case 'scatter': {
      if (numCols.length < 2) return null;
      const xCol = numCols[0], yCol = numCols[1];
      return { type, xCol, yCol, insight: scatterInsight(rows, xCol, yCol) };
    }

    case 'stacked': {
      if (!strCols.length || numCols.length < 2) return null;
      const xCol  = strCols[0];
      const yCols = numCols.slice(0, 8);
      return { type, xCol, yCols, insight: stackedInsight(rows, xCol, yCols) };
    }

    case 'heatmap': {
      if (!strCols.length || numCols.length < 2) return null;
      const xCol  = strCols[0];
      const yCols = numCols.slice(0, 8);
      return { type, xCol, yCols, insight: heatmapInsight(rows, xCol, yCols) };
    }

    case 'candlestick': {
      const oKey = cols.find(k => /open/i.test(k));
      const cKey = cols.find(k => /close/i.test(k));
      const hKey = cols.find(k => /high/i.test(k));
      const lKey = cols.find(k => /low/i.test(k));
      if (!oKey || !cKey || !hKey || !lKey) return null;
      const dKey = cols.find(k => /date|time|period|month/i.test(k));
      return {
        type,
        insight: candlestickInsight(rows, oKey, cKey, hKey, lKey),
      };
    }

    case 'geo': {
      // Prefer lat/lon if available
      const latCol = cols.find(c => /^lat(itude)?$/i.test(c));
      const lonCol = cols.find(c => /^lo?ng?(itude)?$/i.test(c));
      const valueCol = numCols.find(c => c !== latCol && c !== lonCol) || numCols[0];

      if (latCol && lonCol) {
        return {
          type, geoType: 'markers', scope: 'world',
          locationCol: strCols[0] || null, latCol, lonCol, valueCol,
          insight: `This map plots ${rows.length} locations by coordinate, sized by ${valueCol}. The spread of markers reveals geographic concentration and regional patterns across the dataset.`,
        };
      }
      // Fall back to location column
      const locationCol = cols.find(c =>
        /country|nation|state|province|city|region|location|place|territory/i.test(c)
      );
      if (!locationCol) return null;
      const sampleVals = rows.slice(0, 20).map(r => String(r[locationCol]).trim());
      const scope   = inferGeoScope(sampleVals);
      const geoType = isCityLike(sampleVals) ? 'markers' : 'choropleth';
      return {
        type, geoType, scope,
        locationCol, latCol: null, lonCol: null, valueCol,
        insight: `This map visualizes ${valueCol} across ${locationCol} regions. Geographic clusters and outliers become immediately apparent when values are mapped spatially.`,
      };
    }

    default:
      return null;
  }
}



function heuristicCharts(cols, colTypes, rows) {
  const numCols = cols.filter(c => colTypes[c] === 'number');
  const strCols = cols.filter(c => colTypes[c] === 'string');
  const charts  = [];

  // Geo takes priority if detected
  const geoResult = detectGeoHeuristic(cols, colTypes, rows);
  if (geoResult) charts.push(geoResult);

  const isMultiNumeric = strCols.length >= 1 && numCols.length >= 3;

  if (isMultiNumeric) {
    // Multi-numeric dataset (e.g. grades, sales by region/quarter):
    // heatmap + stacked + line tell a much richer story than bar + pie

    const xCol  = strCols[0];
    const yCols = numCols.slice(0, 8);

    // 1. Heatmap — shows all values at once as a color grid
    if (charts.length < 3) {
      charts.push({
        type: 'heatmap', xCol, yCols,
        insight: heatmapInsight(rows, xCol, yCols),
      });
    }

    // 2. Stacked bar — shows total + composition per entity
    if (charts.length < 3) {
      charts.push({
        type: 'stacked', xCol, yCols,
        insight: stackedInsight(rows, xCol, yCols),
      });
    }

    // 3. Line — shows trend/progression across the numeric columns
    if (charts.length < 3) {
      charts.push({
        type: 'line', xCol: xCol, yCol: yCols[0],
        yCols,
        insight: lineMultiInsight(rows, xCol, yCols),
      });
    }

  } else {
    // Standard dataset: label + 1-2 numeric columns

    if (strCols.length && numCols.length && charts.length < 3) {
      const xCol = strCols[0], yCol = numCols[0];
      charts.push({ type: 'bar', xCol, yCol, insight: barInsight(rows, xCol, yCol) });
    }

    if (strCols.length && numCols.length && charts.length < 3) {
      const xCol = strCols[0], yCol = numCols[0];
      const uniq = [...new Set(rows.map(r => r[xCol]))];
      if (uniq.length <= 12) {
        charts.push({ type: 'pie', xCol, yCol, insight: pieInsight(rows, xCol, yCol) });
      }
    }

    if (numCols.length >= 2 && charts.length < 3) {
      const xCol = numCols[0], yCol = numCols[1];
      charts.push({ type: 'scatter', xCol, yCol, insight: scatterInsight(rows, xCol, yCol) });
    }
  }

  if (!charts.length) {
    charts.push({ type: 'bar', xCol: cols[0], yCol: cols[1] || cols[0], insight: 'This chart provides a visual overview of the dataset values.' });
  }

  return charts.slice(0, 3);
}

// ─── Heuristic insight generators ────────────────────────────────────────

function colStats(rows, col) {
  const vals = rows.map(r => parseFloat(r[col])).filter(v => !isNaN(v));
  if (!vals.length) return null;
  const sum  = vals.reduce((a, b) => a + b, 0);
  const avg  = sum / vals.length;
  const min  = Math.min(...vals);
  const max  = Math.max(...vals);
  const sorted = [...vals].sort((a, b) => a - b);
  const median = sorted.length % 2 === 0
    ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
    : sorted[Math.floor(sorted.length / 2)];
  return { vals, sum, avg, min, max, median, count: vals.length };
}

function fmt(n) {
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (Math.abs(n) >= 1_000)     return (n / 1_000).toFixed(1) + 'K';
  return Number.isInteger(n) ? n.toString() : n.toFixed(2);
}

function barInsight(rows, xCol, yCol) {
  const stats = colStats(rows, yCol);
  if (!stats) return `Bar chart of ${yCol} by ${xCol}.`;

  const topRow = rows.reduce((best, r) => {
    const v = parseFloat(r[yCol]);
    return (!isNaN(v) && (best === null || v > parseFloat(best[yCol]))) ? r : best;
  }, null);
  const botRow = rows.reduce((best, r) => {
    const v = parseFloat(r[yCol]);
    return (!isNaN(v) && (best === null || v < parseFloat(best[yCol]))) ? r : best;
  }, null);

  const topName = topRow ? String(topRow[xCol]) : '—';
  const botName = botRow ? String(botRow[xCol]) : '—';
  const spread  = ((stats.max - stats.min) / (stats.avg || 1) * 100).toFixed(0);

  return `${topName} leads with ${fmt(stats.max)}, nearly ${Math.round(stats.max / stats.min)}× higher than ${botName} at ${fmt(stats.min)}. The average ${yCol} is ${fmt(stats.avg)}, with a ${spread}% spread between the top and bottom — suggesting ${Number(spread) > 100 ? 'high' : 'moderate'} disparity across ${xCol} categories.`;
}

function pieInsight(rows, xCol, yCol) {
  const stats = colStats(rows, yCol);
  if (!stats) return `Proportional breakdown of ${yCol} by ${xCol}.`;

  // Aggregate
  const agg = {};
  rows.forEach(r => {
    const k = String(r[xCol]);
    const v = parseFloat(r[yCol]);
    if (!isNaN(v)) agg[k] = (agg[k] || 0) + v;
  });
  const entries = Object.entries(agg).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return `Proportional breakdown of ${yCol} by ${xCol}.`;

  const total     = entries.reduce((s, [, v]) => s + v, 0);
  const topName   = entries[0][0];
  const topPct    = ((entries[0][1] / total) * 100).toFixed(1);
  const top2Pct   = entries.length > 1 ? (((entries[0][1] + entries[1][1]) / total) * 100).toFixed(1) : null;
  const secondName = entries.length > 1 ? entries[1][0] : null;

  let insight = `${topName} accounts for ${topPct}% of total ${yCol}`;
  if (secondName && top2Pct) {
    insight += `, followed by ${secondName}. Together they represent ${top2Pct}% of the whole`;
  }
  insight += `. The remaining ${entries.length - (secondName ? 2 : 1)} ${xCol} entr${entries.length - 2 === 1 ? 'y' : 'ies'} share the rest.`;
  return insight;
}

function scatterInsight(rows, xCol, yCol) {
  const xStats = colStats(rows, xCol);
  const yStats = colStats(rows, yCol);
  if (!xStats || !yStats) return `Scatter plot of ${xCol} vs ${yCol}.`;

  // Compute Pearson correlation
  const n    = Math.min(xStats.vals.length, yStats.vals.length);
  const xAvg = xStats.avg, yAvg = yStats.avg;
  let num = 0, dx2 = 0, dy2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = xStats.vals[i] - xAvg;
    const dy = yStats.vals[i] - yAvg;
    num += dx * dy;
    dx2 += dx * dx;
    dy2 += dy * dy;
  }
  const r = (dx2 && dy2) ? num / Math.sqrt(dx2 * dy2) : 0;
  const rAbs = Math.abs(r);
  const strength = rAbs > 0.7 ? 'strong' : rAbs > 0.4 ? 'moderate' : 'weak';
  const direction = r > 0 ? 'positive' : 'negative';

  return `There is a ${strength} ${direction} correlation (r = ${r.toFixed(2)}) between ${xCol} and ${yCol}. ${xCol} ranges from ${fmt(xStats.min)} to ${fmt(xStats.max)}, while ${yCol} spans ${fmt(yStats.min)} to ${fmt(yStats.max)}. ${rAbs > 0.5 ? `Higher ${xCol} values tend to ${r > 0 ? 'coincide with higher' : 'coincide with lower'} ${yCol} values.` : `No strong predictive relationship is apparent from the data.`}`;
}

function heatmapInsight(rows, xCol, yCols) {
  // Find the entity+metric with the highest value, and the lowest
  let topVal = -Infinity, topEntity = '', topMetric = '';
  let botVal =  Infinity, botEntity = '', botMetric = '';

  rows.forEach(r => {
    yCols.forEach(c => {
      const v = parseFloat(r[c]);
      if (isNaN(v)) return;
      if (v > topVal) { topVal = v; topEntity = String(r[xCol]); topMetric = c; }
      if (v < botVal) { botVal = v; botEntity = String(r[xCol]); botMetric = c; }
    });
  });

  // Find the entity with the highest average across all metrics
  const entityAvgs = rows.map(r => {
    const vals = yCols.map(c => parseFloat(r[c])).filter(v => !isNaN(v));
    const avg  = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    return { name: String(r[xCol]), avg };
  }).sort((a, b) => b.avg - a.avg);

  const topOverall = entityAvgs[0];
  const botOverall = entityAvgs[entityAvgs.length - 1];

  return `${topOverall.name} performs strongest overall with an average of ${fmt(topOverall.avg)} across all ${yCols.length} metrics, while ${botOverall.name} averages ${fmt(botOverall.avg)}. The single highest individual value is ${topEntity}'s ${topMetric} at ${fmt(topVal)}, and the lowest is ${botEntity}'s ${botMetric} at ${fmt(botVal)}.`;
}

function stackedInsight(rows, xCol, yCols) {
  // Compute totals per entity
  const totals = rows.map(r => {
    const total = yCols.reduce((s, c) => s + (parseFloat(r[c]) || 0), 0);
    return { name: String(r[xCol]), total };
  }).sort((a, b) => b.total - a.total);

  const highest = totals[0];
  const lowest  = totals[totals.length - 1];
  const grandTotal = totals.reduce((s, t) => s + t.total, 0);
  const topPct = ((highest.total / grandTotal) * 100).toFixed(1);

  // Find which metric contributes most overall
  const metricTotals = yCols.map(c => ({
    name: c,
    total: rows.reduce((s, r) => s + (parseFloat(r[c]) || 0), 0),
  })).sort((a, b) => b.total - a.total);

  return `${highest.name} has the highest total across all ${yCols.length} metrics at ${fmt(highest.total)} (${topPct}% of the grand total), compared to ${lowest.name}'s ${fmt(lowest.total)}. ${metricTotals[0].name} is the largest contributing metric overall at ${fmt(metricTotals[0].total)}.`;
}

function lineMultiInsight(rows, xCol, yCols) {
  // For each metric, compute the range to find the most variable one
  const metricVariance = yCols.map(c => {
    const stats = colStats(rows, c);
    return stats ? { name: c, range: stats.max - stats.min, min: stats.min, max: stats.max, avg: stats.avg } : null;
  }).filter(Boolean).sort((a, b) => b.range - a.range);

  const mostVariable = metricVariance[0];
  const leastVariable = metricVariance[metricVariance.length - 1];

  // Find the entity with the steepest change between first and last metric
  const firstCol = yCols[0], lastCol = yCols[yCols.length - 1];
  const changes = rows.map(r => ({
    name: String(r[xCol]),
    change: (parseFloat(r[lastCol]) || 0) - (parseFloat(r[firstCol]) || 0),
  })).sort((a, b) => b.change - a.change);

  const mostImproved  = changes[0];
  const mostDeclined  = changes[changes.length - 1];

  return `${mostVariable.name} shows the widest variation across entries (${fmt(mostVariable.min)}–${fmt(mostVariable.max)}), while ${leastVariable.name} remains the most consistent. ${mostImproved.change > 0 ? `${mostImproved.name} improved the most from ${firstCol} to ${lastCol} (+${fmt(mostImproved.change)})` : `No entries improved from ${firstCol} to ${lastCol}`}${mostDeclined.change < 0 ? `, whereas ${mostDeclined.name} dropped the most (${fmt(mostDeclined.change)})` : ''}.`;
}

function candlestickInsight(rows, oKey, cKey, hKey, lKey) {
  const closes = rows.map(r => parseFloat(r[cKey])).filter(v => !isNaN(v));
  const highs  = rows.map(r => parseFloat(r[hKey])).filter(v => !isNaN(v));
  const lows   = rows.map(r => parseFloat(r[lKey])).filter(v => !isNaN(v));
  if (!closes.length) return 'Candlestick chart showing price movement over time.';

  const first  = parseFloat(rows[0][oKey]);
  const last   = closes[closes.length - 1];
  const maxH   = Math.max(...highs);
  const minL   = Math.min(...lows);
  const change = ((last - first) / first * 100).toFixed(1);
  const bullish = rows.filter(r => parseFloat(r[cKey]) >= parseFloat(r[oKey])).length;
  const bearish = rows.length - bullish;

  return `Price moved from ${fmt(first)} to ${fmt(last)} (${change > 0 ? '+' : ''}${change}%) over the ${rows.length} periods shown. The overall range spanned ${fmt(minL)} to ${fmt(maxH)}, with ${bullish} bullish and ${bearish} bearish candles — indicating a ${bullish > bearish ? 'generally upward' : 'generally downward'} trend.`;
}

function detectGeoHeuristic(cols, colTypes, rows) {
  const numCols = cols.filter(c => colTypes[c] === 'number');
  const latCol = cols.find(c => /^lat(itude)?$/i.test(c));
  const lonCol = cols.find(c => /^lo?ng?(itude)?$/i.test(c));

  if (latCol && lonCol && numCols.length) {
    return {
      type: 'geo', geoType: 'markers', scope: 'world',
      locationCol: null, latCol, lonCol,
      valueCol: numCols.find(c => c !== latCol && c !== lonCol) || null,
      insight: 'This map plots each data point by its geographic coordinates, revealing spatial distribution patterns across the dataset.',
    };
  }

  const locationCol = cols.find(c =>
    /country|nation|state|province|city|region|location|place|territory/i.test(c)
  );
  if (!locationCol || !numCols.length) return null;

  const sampleVals = rows.slice(0, 20).map(r => String(r[locationCol]).trim());
  const scope = inferGeoScope(sampleVals);
  const geoType = (scope === 'usa' && isCityLike(sampleVals)) ? 'markers' : 'choropleth';

  return {
    type: 'geo', geoType, scope,
    locationCol, latCol: null, lonCol: null, valueCol: numCols[0],
    insight: `This map visualizes ${numCols[0]} across different ${locationCol} regions, making geographic patterns and concentrations immediately visible.`,
  };
}

function inferGeoScope(values) {
  // Expand common aliases before scoring so "USA", "US", "United States" all
  // count as US entries rather than falling through to worldScore.
  const SCOPE_ALIASES = {
    'usa': 'united states of america', 'us': 'united states of america',
    'u.s.': 'united states of america', 'u.s.a.': 'united states of america',
    'america': 'united states of america',
    'united states': 'united states of america',
    'uk': 'united kingdom', 'u.k.': 'united kingdom',
    'great britain': 'united kingdom', 'britain': 'united kingdom',
    'england': 'united kingdom',
    'russian federation': 'russia',
    'uae': 'united arab emirates',
    'czechia': 'czech republic',
    'burma': 'myanmar',
    'viet nam': 'vietnam',
    "ivory coast": "côte d'ivoire",
    'newfoundland': 'newfoundland and labrador',
    'pei': 'prince edward island',
    // state abbreviations → full name (so 'CA', 'TX' etc. score as US)
    'al':'alabama','ak':'alaska','az':'arizona','ar':'arkansas','ca':'california',
    'co':'colorado','ct':'connecticut','de':'delaware','fl':'florida','ga':'georgia',
    'hi':'hawaii','id':'idaho','il':'illinois','in':'indiana','ia':'iowa','ks':'kansas',
    'ky':'kentucky','la':'louisiana','me':'maine','md':'maryland','ma':'massachusetts',
    'mi':'michigan','mn':'minnesota','ms':'mississippi','mo':'missouri','mt':'montana',
    'ne':'nebraska','nv':'nevada','nh':'new hampshire','nj':'new jersey',
    'nm':'new mexico','ny':'new york','nc':'north carolina','nd':'north dakota',
    'oh':'ohio','ok':'oklahoma','or':'oregon','pa':'pennsylvania','ri':'rhode island',
    'sc':'south carolina','sd':'south dakota','tn':'tennessee','tx':'texas','ut':'utah',
    'vt':'vermont','va':'virginia','wa':'washington','wv':'west virginia',
    'wi':'wisconsin','wy':'wyoming',
    // province abbreviations → full name
    'on':'ontario','qc':'quebec','bc':'british columbia','ab':'alberta',
    'mb':'manitoba','sk':'saskatchewan','ns':'nova scotia','nb':'new brunswick',
    'nl':'newfoundland and labrador','pe':'prince edward island',
    'nt':'northwest territories','nu':'nunavut','yt':'yukon',
  };

  const US_STATES = new Set([
    'alabama','alaska','arizona','arkansas','california','colorado','connecticut',
    'delaware','florida','georgia','hawaii','idaho','illinois','indiana','iowa',
    'kansas','kentucky','louisiana','maine','maryland','massachusetts','michigan',
    'minnesota','mississippi','missouri','montana','nebraska','nevada',
    'new hampshire','new jersey','new mexico','new york','north carolina',
    'north dakota','ohio','oklahoma','oregon','pennsylvania','rhode island',
    'south carolina','south dakota','tennessee','texas','utah','vermont',
    'virginia','washington','west virginia','wisconsin','wyoming',
  ]);
  const CA_PROVINCES = new Set([
    'ontario','quebec','british columbia','alberta','manitoba','saskatchewan',
    'nova scotia','new brunswick','newfoundland and labrador','prince edward island',
    'northwest territories','nunavut','yukon',
  ]);
  const US_CITIES = new Set([
    'new york','los angeles','chicago','houston','phoenix','philadelphia',
    'san antonio','san diego','dallas','san jose','austin','jacksonville',
    'fort worth','columbus','charlotte','indianapolis','san francisco',
    'seattle','denver','boston','nashville','baltimore','louisville',
    'portland','las vegas','milwaukee','albuquerque','tucson','fresno',
    'sacramento','mesa','atlanta','omaha','colorado springs','raleigh',
    'miami','minneapolis','tulsa','cleveland','wichita','arlington',
  ]);
  const CA_CITIES = new Set([
    'toronto','montreal','vancouver','calgary','edmonton','ottawa',
    'winnipeg','quebec city','hamilton','kitchener','london','victoria',
    'halifax','oshawa','windsor','saskatoon','regina','kelowna',
  ]);

  let usScore = 0, caScore = 0, worldScore = 0;
  values.forEach(v => {
    const raw        = v.toLowerCase().trim();
    const normalized = SCOPE_ALIASES[raw] ?? raw;

    if (normalized === 'united states of america') { usScore++; return; }
    if (normalized === 'united kingdom')            { worldScore++; return; }

    if (US_STATES.has(normalized) || US_CITIES.has(normalized)) usScore++;
    else if (CA_PROVINCES.has(normalized) || CA_CITIES.has(normalized)) caScore++;
    else worldScore++;
  });

  if (caScore > usScore && caScore > worldScore) return 'canada';
  if (usScore > worldScore) return 'usa';
  return 'world';
}

function isCityLike(values) {
  const CITY_HINTS = new Set([
    'new york','los angeles','chicago','houston','phoenix','philadelphia',
    'san antonio','san diego','dallas','san jose','austin','boston',
    'seattle','denver','miami','atlanta','portland','las vegas',
    'toronto','montreal','vancouver','calgary','edmonton','ottawa',
  ]);
  return values.some(v => CITY_HINTS.has(v.toLowerCase()));
}