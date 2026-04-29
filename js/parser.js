/* ─── parser.js — file reading, CSV & JSON parsing ───────────────────── */

/**
 * Read a File object and return its text content.
 * @param {File} file
 * @returns {Promise<string>}
 */
function readFileText(file) {
  return file.text();
}

/**
 * Parse a CSV string using PapaParse.
 * @param {string} text
 * @returns {{ rows: object[], cols: string[] }}
 */
function parseCSV(text) {
  const result = Papa.parse(text.trim(), {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: true,
  });

  if (result.errors.length && !result.data.length) {
    throw new Error(result.errors[0].message);
  }

  return { rows: result.data, cols: result.meta.fields };
}

/**
 * Parse a JSON string — accepts a top-level array or { data: [] } shape.
 * @param {string} text
 * @returns {{ rows: object[], cols: string[] }}
 */
function parseJSON(text) {
  const raw = JSON.parse(text);
  const arr = Array.isArray(raw)
    ? raw
    : Array.isArray(raw.data)
      ? raw.data
      : null;

  if (!arr) throw new Error('JSON must be an array of objects.');

  const cols = arr.length ? Object.keys(arr[0]) : [];
  return { rows: arr, cols };
}

/**
 * Infer column types from parsed rows.
 * Returns a map of { colName: 'number' | 'string' }.
 * @param {object[]} rows
 * @param {string[]} cols
 * @returns {object}
 */
function inferColTypes(rows, cols) {
  const colTypes = {};
  cols.forEach(c => {
    const vals = rows
      .map(r => r[c])
      .filter(v => v !== null && v !== undefined && v !== '');
    const numCount = vals.filter(
      v => typeof v === 'number' || (!isNaN(parseFloat(v)) && isFinite(v))
    ).length;
    colTypes[c] = numCount > vals.length * 0.6 ? 'number' : 'string';
  });
  return colTypes;
}

/**
 * Validate a parsed dataset — throws a user-readable error if invalid.
 * @param {{ rows: object[], cols: string[] }} parsed
 */
function validateParsed(parsed) {
  if (!parsed || !parsed.rows || parsed.rows.length < 2) {
    throw new Error(
      'Dataset appears empty or has fewer than 2 rows. Please check your file.'
    );
  }
}
