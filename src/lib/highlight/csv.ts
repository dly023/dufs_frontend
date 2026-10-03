/**
 * Single-pass CSV/TSV parser (RFC 4180 quoting: "a, b", "line\nbreak", "say ""hi""").
 * Stops after `maxRows` rows so a huge file never builds a huge array.
 */
export interface CsvResult {
  rows: string[][];
  /** True when parsing stopped at maxRows with data left over. */
  capped: boolean;
  /** Columns whose non-empty cells are (almost) all numbers → right-aligned. */
  numeric: boolean[];
  columns: number;
}

const NUMBER = /^[-+]?(?:\d{1,3}(?:,\d{3})+|\d+)?(?:\.\d+)?(?:[eE][-+]?\d+)?%?$/;

export function parseCsv(src: string, delimiter: string, maxRows: number): CsvResult {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let i = 0;
  const n = src.length;
  let capped = false;

  const endRow = () => {
    row.push(field);
    field = "";
    // Skip fully blank lines (common trailing newline).
    if (!(row.length === 1 && row[0] === "")) rows.push(row);
    row = [];
  };

  while (i < n) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
      } else field += c;
      i += 1;
      continue;
    }
    if (c === '"' && field === "") quoted = true;
    else if (c === delimiter) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i += 1;
      endRow();
      if (rows.length >= maxRows) {
        capped = i + 1 < n;
        break;
      }
    } else field += c;
    i += 1;
  }
  if (!capped && (field !== "" || row.length)) endRow();

  const columns = rows.reduce((m, r) => Math.max(m, r.length), 0);
  const numeric: boolean[] = [];
  const sample = rows.slice(1, 201);
  for (let col = 0; col < columns; col += 1) {
    let filled = 0;
    let nums = 0;
    for (const r of sample) {
      const v = (r[col] ?? "").trim();
      if (!v) continue;
      filled += 1;
      if (NUMBER.test(v) && /\d/.test(v)) nums += 1;
    }
    numeric.push(filled > 0 && nums / filled >= 0.8);
  }
  return { rows, capped, numeric, columns };
}
