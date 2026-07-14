// Fixture: legacy module with NO plan artifact, NO PRD, NO issue text anywhere.
// (T-E1-07 — the only available oracle is this implementation itself.)
export function parseRow(line) {
  return line.split(",").map((cell) => cell.trim());
}

export function toRecord(header, line) {
  const cells = parseRow(line);
  const rec = {};
  header.forEach((h, i) => (rec[h] = cells[i] ?? ""));
  return rec;
}
