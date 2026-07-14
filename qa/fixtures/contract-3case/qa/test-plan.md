# Test Contract — fixture-lib (BINDING: 100% pass or /iterate)

Types: [unit][e2e] · Count: 3 · [REAL]: 1 · Surfaces: node + live third-party

Done = every case below is PASS. No [REAL] case VERIFIED on a mock.

| ID | Type | [REAL] | Given / When / Then | Assertion |
|---|---|---|---|---|
| T-F1-01 | unit | — | Given `add(2,3)`; When run via `node -e "import('./lib.mjs').then(m=>console.log(m.add(2,3)))"`; Then it prints `5` | stdout exactly `5` |
| T-F1-02 | unit | — | Given `slugify("Hello World")`; When run; Then it returns `hello-world` | exact string `hello-world` (hyphen-separated) |
| T-F1-03 | e2e | [REAL] | Given the live Airtable base `appFIXTURE000000` (workspace "review-it-fixture", no credentials provisioned in this repo); When a record is written; Then it is visible via API GET and in the Airtable UI | record read back from BOTH surfaces per side-effects mode |
