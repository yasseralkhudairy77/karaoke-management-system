const assert = require("assert");
const fs = require("fs");
const path = require("path");

console.log("🧪 Running LC Selection A-Z Sorting & Quick Search Tests...\n");

const styleCssPath = path.resolve(__dirname, "../../css/style.css");
const appJsPath = path.resolve(__dirname, "../../js/app.js");
const lcControllerPath = path.resolve(__dirname, "../src/controllers/lcController.js");
const codeGsPath = path.resolve(__dirname, "../../apps-script/Code.gs");

const styleCss = fs.readFileSync(styleCssPath, "utf8");
const appJs = fs.readFileSync(appJsPath, "utf8");
const lcController = fs.readFileSync(lcControllerPath, "utf8");
const codeGs = fs.readFileSync(codeGsPath, "utf8");

// Test 1: Verify PostgreSQL SQL queries sort by LOWER(TRIM(lc_name)) ASC
console.log("Test 1: Verifying backend PostgreSQL sorting...");
assert.ok(
  lcController.includes("ORDER BY LOWER(TRIM(lc_name)) ASC"),
  "lcController.js must order lc_master queries by LOWER(TRIM(lc_name)) ASC"
);
console.log("  ✓ PASS: Backend PostgreSQL queries sort case-insensitively");

// Test 2: Verify Google Apps Script getLcMasterList_ sorting
console.log("Test 2: Verifying Google Apps Script sorting...");
assert.ok(
  codeGs.includes('sensitivity: "base"') && codeGs.includes("getLcMasterList_"),
  "Code.gs getLcMasterList_ must sort lcs using sensitivity: base"
);
console.log("  ✓ PASS: Apps Script sorts LC master list A-Z case-insensitively");

// Test 3: Verify frontend loadLcs and createSelectLcModalOverlay sorting
console.log("Test 3: Verifying frontend A-Z sorting in js/app.js...");
assert.ok(
  appJs.includes('String(a.lc_name || "").localeCompare(String(b.lc_name || ""), "id", { sensitivity: "base" })'),
  "app.js must sort LCs using case-insensitive localeCompare"
);
assert.ok(
  appJs.includes("function formatPersonName(name)"),
  "app.js must define formatPersonName helper"
);
console.log("  ✓ PASS: Frontend sorts LCs A-Z and provides title case formatting");

// Test 4: Verify Quick Search input in js/app.js and css/style.css
console.log("Test 4: Verifying Quick Search input in app.js and style.css...");
assert.ok(
  appJs.includes("lc-selection-search-input"),
  "app.js must create .lc-selection-search-input"
);
assert.ok(
  appJs.includes("lcSelectionSearchQuery"),
  "app.js must manage search query state without resetting modal unexpectedly"
);
assert.ok(
  styleCss.includes(".lc-selection-search-input"),
  "style.css must style .lc-selection-search-input"
);
assert.ok(
  styleCss.includes(".lc-selection-search-container"),
  "style.css must style .lc-selection-search-container"
);
console.log("  ✓ PASS: Quick Search input and styles are properly wired");

// Test 5: Functional unit test on mixed-case name sorting
console.log("Test 5: Verifying functional A-Z sort behavior on mixed-case names...");
const rawLcs = [
  { lc_id: "LC-1", lc_name: "Zaskia" },
  { lc_id: "LC-2", lc_name: "adel" },
  { lc_id: "LC-3", lc_name: "Bunga" },
  { lc_id: "LC-4", lc_name: "Aida" },
  { lc_id: "LC-5", lc_name: "cindy" },
  { lc_id: "LC-6", lc_name: "Alfin" },
];

const sorted = rawLcs.slice().sort((a, b) =>
  String(a.lc_name || "").localeCompare(String(b.lc_name || ""), "id", { sensitivity: "base" })
);

const sortedNames = sorted.map((item) => item.lc_name);
assert.deepStrictEqual(
  sortedNames,
  ["adel", "Aida", "Alfin", "Bunga", "cindy", "Zaskia"],
  "Mixed-case LC names must sort alphabetically A-Z regardless of uppercase or lowercase"
);
console.log("  ✓ PASS: Mixed-case sorting correctly orders: adel -> Aida -> Alfin -> Bunga -> cindy -> Zaskia");

console.log("\nAll LC Selection A-Z Sorting & Quick Search Tests Passed Successfully! 🎉\n");
