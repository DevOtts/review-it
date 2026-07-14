// DERIVED test harness for src/csv.mjs — provenance: DERIVED (R11).
// The expected values below were reconstructed FROM the implementation itself
// (no plan-it Test Contract, no PRD, no issue, no README existed in this repo).
// A green here means "self-consistent", NEVER "obeys the plan" (CB-9).
// Run stamp: DERIVED-UNCONFIRMED (authored under autonomy, no human ack).
import { parseRow, toRecord } from "../src/csv.mjs";

let pass = 0, fail = 0;
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function check(id, note, got, want) {
  const ok = eq(got, want);
  console.log(`${ok ? "PASS" : "FAIL"} ${id} | ${note} | got=${JSON.stringify(got)} want=${JSON.stringify(want)}`);
  ok ? pass++ : fail++;
}

// --- parseRow: pure logic, enumerated + property (test-type = pure logic) ---
check("D-01", "basic comma split", parseRow("a,b,c"), ["a", "b", "c"]);
check("D-02", "trims each cell", parseRow(" a , b ,c "), ["a", "b", "c"]);
check("D-03", "trailing comma -> empty tail cell", parseRow("a,"), ["a", ""]);
check("D-04", "empty input -> single empty cell", parseRow(""), [""]);

// property: cell count === comma count + 1 for quote-free lines
let propOk = true;
for (const s of ["x", "x,y", "a,b,c,d", " p , q ", ",", ",,"]) {
  const commas = (s.match(/,/g) || []).length;
  if (parseRow(s).length !== commas + 1) propOk = false;
}
check("D-05", "property: cells === commas+1 (quote-free)", propOk, true);

// --- toRecord: header/cell zip with "" fill (test-type = pure logic) ---
check("D-06", "zips header to cells", toRecord(["id", "name"], "1,bob"), { id: "1", name: "bob" });
check("D-07", "missing cell -> empty string", toRecord(["id", "name", "email"], "1,bob"), { id: "1", name: "bob", email: "" });
check("D-08", "extra cells are dropped", toRecord(["id"], "1,extra"), { id: "1" });
check("D-09", "empty header -> empty record", toRecord([], "a,b"), {});

// --- D-10: external-anchor CANDIDATE (RFC 4180), NOT an authored contract ---
// The code is a naive split; it does NOT honor RFC-4180 quoting.
// We assert the DERIVED (implementation) behavior only; the RFC disagreement
// is recorded in the report's accepted-gaps register, NOT graded as FAIL here.
check("D-10", "quoted field split naively (DERIVED behavior; RFC-4180 would differ)", parseRow('"a,b",c'), ['"a', 'b"', 'c']);

console.log(`\nSUMMARY pass=${pass} fail=${fail}`);
process.exit(fail === 0 ? 0 : 1);
