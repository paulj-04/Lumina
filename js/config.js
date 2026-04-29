/* ─── config.js — shared constants ───────────────────────────────────── */

const PALETTE = [
  '#c8f060', '#60b4f0', '#f060a8', '#f0c860', '#b460f0',
  '#60f0b4', '#f09660', '#60f060', '#60d4f0', '#f06060'
];

const CHART_META = {
  bar:          { label: 'Bar Chart',      badgeClass: 'badge-bar' },
  pie:          { label: 'Pie Chart',      badgeClass: 'badge-pie' },
  doughnut:     { label: 'Doughnut',       badgeClass: 'badge-doughnut' },
  line:         { label: 'Line Chart',     badgeClass: 'badge-line' },
  scatter:      { label: 'Scatter Plot',   badgeClass: 'badge-scatter' },
  heatmap:      { label: 'Heat Map',       badgeClass: 'badge-heatmap' },
  stacked:      { label: 'Stacked Bar',    badgeClass: 'badge-stacked' },
  candlestick:  { label: 'Candlestick',    badgeClass: 'badge-candlestick' },
  geo:          { label: 'Geographic Map', badgeClass: 'badge-geo' },
};

// Shared Chart.js defaults applied to every chart instance
const CHART_DEFAULTS = {
  plugins: {
    legend: {
      labels: {
        color: 'rgba(232,232,240,0.6)',
        font: { family: 'DM Sans', size: 11 },
        boxWidth: 10,
        padding: 16,
      }
    },
    tooltip: {
      backgroundColor: '#1a1a24',
      borderColor: 'rgba(255,255,255,0.08)',
      borderWidth: 1,
      titleColor: '#e8e8f0',
      bodyColor: 'rgba(232,232,240,0.7)',
      padding: 10,
      cornerRadius: 8,
      titleFont: { family: 'DM Sans', size: 12 },
      bodyFont:  { family: 'DM Sans', size: 11 },
    }
  },
  animation: { duration: 700, easing: 'easeOutQuart' }
};
