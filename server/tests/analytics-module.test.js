const assert = require("assert");
const fs = require("fs");
const path = require("path");

console.log("🧪 Running Analytics & Business Intelligence Module Tests...\n");

const analyticsControllerPath = path.resolve(__dirname, "../src/controllers/analyticsController.js");
const apiRoutesPath = path.resolve(__dirname, "../src/routes/api.js");
const appJsPath = path.resolve(__dirname, "../../js/app.js");
const styleCssPath = path.resolve(__dirname, "../../css/style.css");
const codeGsPath = path.resolve(__dirname, "../../apps-script/Code.gs");
const indexHtmlPath = path.resolve(__dirname, "../../index.html");

const analyticsControllerContent = fs.readFileSync(analyticsControllerPath, "utf8");
const apiRoutesContent = fs.readFileSync(apiRoutesPath, "utf8");
const appJsContent = fs.readFileSync(appJsPath, "utf8");
const styleCssContent = fs.readFileSync(styleCssPath, "utf8");
const codeGsContent = fs.readFileSync(codeGsPath, "utf8");
const indexHtmlContent = fs.readFileSync(indexHtmlPath, "utf8");

const { calculateDeltaPercent, getComparisonRange } = require("../src/controllers/analyticsController");

// Test 1: Unit tests on calculateDeltaPercent
console.log("Test 1: Testing calculateDeltaPercent math logic...");
assert.strictEqual(calculateDeltaPercent(120, 100), 20.0, "120 vs 100 should be +20.0%");
assert.strictEqual(calculateDeltaPercent(80, 100), -20.0, "80 vs 100 should be -20.0%");
assert.strictEqual(calculateDeltaPercent(100, 100), 0.0, "100 vs 100 should be 0.0%");
assert.strictEqual(calculateDeltaPercent(50, 0), 100.0, "50 vs 0 should handle div by zero cleanly as 100%");
assert.strictEqual(calculateDeltaPercent(0, 0), 0.0, "0 vs 0 should be 0%");
console.log("  ✓ PASS: calculateDeltaPercent calculates accurate delta percentages");

// Test 2: Unit tests on getComparisonRange
console.log("Test 2: Testing getComparisonRange shift calculations...");
// Single day previous_period shift
const range1 = getComparisonRange("2026-09-20", "2026-09-20", "previous_period");
assert.strictEqual(range1.durationDays, 1);
assert.strictEqual(range1.compareStartDate, "2026-09-19");
assert.strictEqual(range1.compareEndDate, "2026-09-19");

// Multi-day previous_period shift (e.g. 7-day range)
const range2 = getComparisonRange("2026-09-14", "2026-09-20", "previous_period");
assert.strictEqual(range2.durationDays, 7);
assert.strictEqual(range2.compareStartDate, "2026-09-07");
assert.strictEqual(range2.compareEndDate, "2026-09-13");

// Same day last week shift (7 days back)
const range3 = getComparisonRange("2026-09-20", "2026-09-20", "same_day_last_week");
assert.strictEqual(range3.compareStartDate, "2026-09-13");
assert.strictEqual(range3.compareEndDate, "2026-09-13");
console.log("  ✓ PASS: getComparisonRange accurately shifts dates for previous period and same day last week");

// Test 3: Verify backend route registration
console.log("Test 3: Verifying API routes registration...");
assert.ok(
  apiRoutesContent.includes("analyticsController"),
  "api.js must import analyticsController"
);
assert.ok(
  apiRoutesContent.includes("case 'getOperationalAnalytics':"),
  "api.js must register getOperationalAnalytics in actions"
);
console.log("  ✓ PASS: getOperationalAnalytics action is registered in Express API routes");

// Test 4: Verify Point 2 (Turnaround / Cleaning Idle Time) is excluded as per user explicit instruction
console.log("Test 4: Verifying user instruction exclusion of Point 2 (Turnaround / Cleaning Time)...");
assert.strictEqual(
  analyticsControllerContent.includes("roomTurnaroundTime"),
  false,
  "roomTurnaroundTime must NOT be in analyticsController"
);
assert.strictEqual(
  appJsContent.includes("roomTurnaroundTime"),
  false,
  "roomTurnaroundTime must NOT be in app.js"
);
console.log("  ✓ PASS: Point 2 (Turnaround / Cleaning Idle Time) is properly excluded");

// Test 5: Verify Google Apps Script implementation
console.log("Test 5: Verifying Google Apps Script integration in Code.gs...");
assert.ok(
  codeGsContent.includes("getOperationalAnalytics"),
  "Code.gs must handle getOperationalAnalytics action"
);
assert.ok(
  codeGsContent.includes("function getOperationalAnalytics_"),
  "Code.gs must define getOperationalAnalytics_ function"
);
console.log("  ✓ PASS: Google Apps Script fallback supports getOperationalAnalytics");

// Test 6: Verify frontend tab and permissions in js/app.js
console.log("Test 6: Verifying frontend tabs and role permissions in js/app.js...");
assert.ok(
  appJsContent.includes('{ key: "analytics", label: "Analisa" }'),
  "app.js must include analytics in DASHBOARD_TABS"
);
assert.ok(
  appJsContent.includes('"promosi", "analytics", "settings"'),
  "app.js must place analytics between promosi and settings for owner and manager"
);
assert.ok(
  appJsContent.includes('case "analytics":'),
  "app.js must handle analytics tab panel rendering"
);
assert.ok(
  appJsContent.includes("function createAnalyticsPanelElement"),
  "app.js must implement createAnalyticsPanelElement"
);
assert.ok(
  appJsContent.includes("function createAnalyticsPeakHoursChartElement"),
  "app.js must implement createAnalyticsPeakHoursChartElement"
);
console.log("  ✓ PASS: Frontend tabs, role permissions, and panel renderers are configured");

// Test 7: Verify CSS styling in css/style.css
console.log("Test 7: Verifying analytics styles in css/style.css...");
assert.ok(
  styleCssContent.includes(".analytics-workspace"),
  "style.css must define .analytics-workspace"
);
assert.ok(
  styleCssContent.includes(".analytics-kpi-grid"),
  "style.css must define .analytics-kpi-grid"
);
assert.ok(
  styleCssContent.includes(".analytics-curve-svg"),
  "style.css must define .analytics-curve-svg"
);
assert.ok(
  styleCssContent.includes(".analytics-chart-tooltip"),
  "style.css must define .analytics-chart-tooltip"
);
assert.ok(
  styleCssContent.includes(".analytics-delta-badge"),
  "style.css must define .analytics-delta-badge"
);
console.log("  ✓ PASS: Rich analytics CSS styles are present in css/style.css");

// Test 8: Verify cache buster in index.html
console.log("Test 8: Verifying cache buster version in index.html...");
assert.ok(
  indexHtmlContent.includes("analytics-v1"),
  "index.html must reference ?v=analytics-v1"
);
console.log("  ✓ PASS: index.html has updated cache buster version");

console.log("\n🎉 All Analytics & Business Intelligence Module Tests Passed Successfully!\n");
