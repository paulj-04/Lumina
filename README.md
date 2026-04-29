# Lumina — AI Data Visualizer

Lumina is a browser-based data visualization tool that uses AI to analyze your dataset and automatically select the best chart types to represent it. Drop in a CSV or JSON file and get interactive, beautifully rendered charts with AI-written insights — instantly.

---

## Features

- **AI-powered chart selection** — Claude analyzes your data's column names, types, and values and picks the most meaningful visualization types
- **9 chart types** — Bar, Line, Pie, Doughnut, Scatter, Stacked Bar, Heatmap, Candlestick, and Geographic Map
- **Live geographic maps** — Choropleth and marker maps via Leaflet, with automatic scope detection (world, USA, Canada)
- **Manual chart picker** — Override AI defaults and select exactly which chart types you want rendered
- **AI insights** — Each chart comes with a data-specific 2–3 sentence interpretation referencing real values, not generic descriptions
- **Heuristic fallback** — Works entirely offline without an API key using built-in statistical analysis
- **Drag & drop upload** — Supports `.csv` and `.json` files up to 10 MB
- **Dark theme** — Clean, modern UI built for readability

---

## Supported Chart Types

| Type | Best For |
|---|---|
| Bar | Comparing values across categories |
| Line | Trends and progression over time |
| Pie / Doughnut | Proportional breakdown (≤12 categories) |
| Scatter | Correlations between two numeric columns |
| Stacked Bar | Composition per entity across multiple metrics |
| Heatmap | Multi-metric grids (e.g. students × assessments) |
| Candlestick | OHLC financial/price data |
| Geographic Map | Country, state, city, or lat/lon location data |

---

## Getting Started

### Prerequisites
- [Node.js](https://nodejs.org) (for the local dev server)
- An Anthropic API key (optional — heuristic fallback works without one)

### Run Locally

```bash
# Clone the repo
git clone https://github.com/YOUR_USERNAME/lumina.git
cd lumina

# Start a local server
npx serve .
```

Then open `http://localhost:3000` in your browser.

### Add Your API Key (Optional)

To enable AI-powered chart selection and insights, add your Anthropic API key to `js/ai.js`:

```js
const response = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': 'YOUR_API_KEY_HERE',
    'anthropic-version': '2023-06-01',
    'anthropic-dangerous-direct-browser-access': 'true'
  },
  ...
});
```

> ⚠️ Never commit your API key to a public repository. For production use, route API calls through a backend proxy instead.

Get a key at [console.anthropic.com](https://console.anthropic.com) — new accounts receive free credits.

---

## Project Structure

```
lumina/
├── index.html              # HTML shell, links all assets
├── css/
│   ├── base.css            # Design tokens, reset, typography, layout
│   ├── components.css      # Upload zone, chart picker, loading, results UI
│   └── charts.css          # Chart cards, badges, Leaflet map styles
└── js/
    ├── config.js           # Shared constants: palette, chart metadata
    ├── parser.js           # CSV/JSON parsing, type inference, validation
    ├── ai.js               # Anthropic API, heuristic fallback, insight generators
    ├── charts.js           # All chart renderers (Chart.js + Leaflet + SVG)
    └── app.js              # UI state, file handling, chart picker, orchestration
```

---

## Dependencies

All loaded via CDN — no install required.

| Library | Version | Purpose |
|---|---|---|
| [Chart.js](https://www.chartjs.org) | 4.4.1 | Bar, line, pie, scatter, stacked charts |
| [PapaParse](https://www.papaparse.com) | 5.4.1 | CSV parsing |
| [Leaflet](https://leafletjs.com) | 1.9.4 | Geographic maps |
| [DM Sans / DM Serif Display](https://fonts.google.com) | — | Typography |

---

## Usage

1. **Select chart types** (optional) — use the picker above the upload zone to choose specific chart types, or leave **Default** selected to let AI decide
2. **Upload a file** — drag and drop or click to browse for a `.csv` or `.json` file
3. **View results** — charts render automatically with AI-written insights beneath each one
4. **Upload again** — click **Upload new file** to reset and start over

### Supported Data Shapes

**Categorical + numeric** (bar, pie, line, stacked):
```csv
category,revenue
Electronics,45000
Clothing,28000
```

**Multi-numeric** (heatmap, stacked, line):
```csv
Student,Lab 1,Lab 2,Midterm,Final
Ava,92,85,79,91
```

**Geographic** (choropleth map):
```csv
country,revenue
United States,42000
Germany,18000
```

**Coordinates** (marker map):
```csv
city,lat,lon,sales
New York,40.71,-74.01,8200
```

**OHLC financial** (candlestick):
```csv
date,open,high,low,close
2024-01,142.0,148.5,138.2,145.3
```

---

## Roadmap

- [ ] Backend proxy for secure API key handling
- [ ] Download charts as PNG / SVG
- [ ] Excel (.xlsx) file support
- [ ] Column selector — click to change which columns are visualized
- [ ] Multi-file upload and dataset comparison
- [ ] Mobile layout improvements

---

## License

MIT