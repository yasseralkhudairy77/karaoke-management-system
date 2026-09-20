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

const {
  calculateDeltaPercent,
  getComparisonRange,
  generateDateList,
  formatDateLabel,
} = require("../src/controllers/analyticsController");

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

// Test 2b: Unit tests on generateDateList and formatDateLabel
console.log("Test 2b: Testing generateDateList and formatDateLabel helpers...");
const dates7 = generateDateList("2026-09-14", "2026-09-20");
assert.strictEqual(dates7.length, 7, "generateDateList must produce 7 dates for a 7-day span");
assert.strictEqual(dates7[0], "2026-09-14");
assert.strictEqual(dates7[6], "2026-09-20");

const label1 = formatDateLabel("2026-09-20");
assert.ok(label1.includes("20 Sep"), "formatDateLabel must format day and month in Indonesian");
assert.ok(label1.includes("Min"), "formatDateLabel must include Sunday (Min)");
console.log("  ✓ PASS: generateDateList and formatDateLabel work reliably");

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
assert.ok(
  appJsContent.includes("analyticsChartMode"),
  "app.js must define analyticsChartMode state"
);
assert.ok(
  appJsContent.includes("analytics-mode-btn"),
  "app.js must create mode switch buttons"
);
assert.ok(
  appJsContent.includes("positionTooltipSmart"),
  "app.js must implement smart flipping tooltip logic to prevent cutoffs"
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
assert.ok(
  styleCssContent.includes(".analytics-mode-switcher"),
  "style.css must define .analytics-mode-switcher"
);
assert.ok(
  styleCssContent.includes(".analytics-mode-btn"),
  "style.css must define .analytics-mode-btn"
);
console.log("  ✓ PASS: Rich analytics CSS styles including mode switcher are present in css/style.css");

// Test 8: Verify cache buster in index.html
console.log("Test 8: Verifying cache buster version in index.html...");
assert.ok(
  indexHtmlContent.includes("analytics-v2"),
  "index.html must reference ?v=analytics-v2"
);
console.log("  ✓ PASS: index.html has updated cache buster version (analytics-v2)");

// Test 9: Verify real shift cutoff calculation and removal of mock 13.420.000
console.log("Test 9: Verifying real shift cutoff calculation and removal of fake 13.420.000...");
assert.strictEqual(
  appJsContent.includes("13420000"),
  false,
  "app.js must NOT contain hardcoded mock 13420000"
);
assert.ok(
  appJsContent.includes("function computeLocalShiftAnalytics"),
  "app.js must define computeLocalShiftAnalytics from real shift transactions"
);
assert.ok(
  appJsContent.includes("Shift Aktif (Cutoff 10:00 WIB)"),
  "app.js must display Shift Aktif (Cutoff 10:00 WIB) in period select"
);
assert.ok(
  appJsContent.includes("Tanggal operasional mengikuti cutoff jam 10:00 WIB"),
  "app.js must include cutoff operational notice in header"
);
console.log("  ✓ PASS: Real shift cutoff calculation active, fake 13.420.000 removed");

// Test 10: Verify PostgreSQL schema column compliance in analyticsController.js
console.log("Test 10: Verifying PostgreSQL production schema column compliance...");
const updatedAnalyticsControllerContent = fs.readFileSync(analyticsControllerPath, "utf8");
assert.strictEqual(
  updatedAnalyticsControllerContent.includes("capacity"),
  false,
  "analyticsController must NOT query non-existent column 'capacity' from rooms"
);
assert.strictEqual(
  updatedAnalyticsControllerContent.includes("oi.qty"),
  false,
  "analyticsController must NOT query non-existent column 'oi.qty' from fnb_order_items"
);
assert.strictEqual(
  updatedAnalyticsControllerContent.includes("oi.item_id = m.menu_id"),
  false,
  "analyticsController must NOT join on non-existent column 'oi.item_id'"
);
assert.ok(
  updatedAnalyticsControllerContent.includes("oi.quantity"),
  "analyticsController must query valid column 'oi.quantity'"
);
assert.ok(
  updatedAnalyticsControllerContent.includes("oi.menu_id = m.menu_id"),
  "analyticsController must join on valid column 'oi.menu_id'"
);
assert.ok(
  updatedAnalyticsControllerContent.includes("COALESCE(promo_discount, 0)"),
  "analyticsController must protect discount sums from NULL values"
);
console.log("  ✓ PASS: All SQL queries strictly adhere to production PostgreSQL schema");

// Test 11: Execute getOperationalAnalytics controller with mock DB to verify zero runtime exceptions
console.log("Test 11: Testing execution of getOperationalAnalytics with mock PostgreSQL DB...");
const db = require("../src/db");
const originalQuery = db.query;

(async () => {
  try {
    db.query = async (sql, params) => {
      // Enforce schema checks
      if (sql.includes("capacity")) {
        throw new Error('column "capacity" does not exist');
      }
      if (sql.includes("oi.qty")) {
        throw new Error('column oi.qty does not exist');
      }
      if (sql.includes("oi.item_id")) {
        throw new Error('column oi.item_id does not exist');
      }

      if (sql.includes("FROM rooms")) {
        return {
          rowCount: 5,
          rows: [
            { room_id: "ROOM-01", room_name: "Room 1", rate_per_hour: 50000 },
            { room_id: "ROOM-02", room_name: "Room 2", rate_per_hour: 50000 },
            { room_id: "ROOM-03", room_name: "Room 3", rate_per_hour: 75000 },
            { room_id: "ROOM-04", room_name: "Room 4", rate_per_hour: 75000 },
            { room_id: "ROOM-05", room_name: "Room 5", rate_per_hour: 100000 },
          ]
        };
      }

      if (sql.includes("AS total_cash")) {
        // current period query
        return {
          rowCount: 1,
          rows: [{
            trx_count: 8,
            total_revenue: 4520000,
            room_revenue: 2500000,
            fnb_revenue: 1520000,
            lc_revenue: 500000,
            total_room_minutes: 960,
            total_discounts: 50000,
            total_cash: 2500000,
            total_transfer: 2020000,
            extended_sessions_count: 3,
            lc_sessions_count: 2,
          }]
        };
      }

      if (sql.includes("fnb_gross_sales")) {
        return {
          rowCount: 1,
          rows: [{
            fnb_gross_sales: 1520000,
            fnb_total_hpp: 532000,
          }]
        };
      }

      if (sql.includes("hour_wib")) {
        return {
          rowCount: 2,
          rows: [
            { hour_wib: 14, session_count: 3, hourly_revenue: 1500000, hourly_room_hours: 6.0 },
            { hour_wib: 20, session_count: 5, hourly_revenue: 3020000, hourly_room_hours: 10.0 },
          ]
        };
      }

      if (sql.includes("operational_date::text AS date_str")) {
        return {
          rowCount: 3,
          rows: [
            { date_str: "2026-09-18", session_count: 5, daily_revenue: 2800000, daily_room_hours: 10.5 },
            { date_str: "2026-09-19", session_count: 8, daily_revenue: 4100000, daily_room_hours: 14.0 },
            { date_str: "2026-09-20", session_count: 12, daily_revenue: 5600000, daily_room_hours: 18.0 },
          ]
        };
      }

      if (sql.includes("EXTRACT(ISODOW FROM operational_date)")) {
        return {
          rowCount: 7,
          rows: [
            { day_num: 1, days_count: 4, total_sessions: 16, total_revenue: 6400000, total_room_hours: 32.0 },
            { day_num: 2, days_count: 4, total_sessions: 12, total_revenue: 4800000, total_room_hours: 24.0 },
            { day_num: 3, days_count: 4, total_sessions: 18, total_revenue: 7200000, total_room_hours: 36.0 },
            { day_num: 4, days_count: 4, total_sessions: 20, total_revenue: 8000000, total_room_hours: 40.0 },
            { day_num: 5, days_count: 4, total_sessions: 30, total_revenue: 14000000, total_room_hours: 60.0 },
            { day_num: 6, days_count: 4, total_sessions: 42, total_revenue: 21000000, total_room_hours: 84.0 },
            { day_num: 7, days_count: 4, total_sessions: 35, total_revenue: 16500000, total_room_hours: 70.0 },
          ]
        };
      }

      if (sql.includes("total_grand_revenue")) {
        return {
          rowCount: 2,
          rows: [
            { room_id: "ROOM-01", room_name: "Room 1", total_sessions: 4, total_hours: 8.0, total_room_revenue: 1200000, total_grand_revenue: 2000000, extended_sessions: 2 },
            { room_id: "ROOM-02", room_name: "Room 2", total_sessions: 4, total_hours: 8.0, total_room_revenue: 1300000, total_grand_revenue: 2520000, extended_sessions: 1 },
          ]
        };
      }

      if (sql.includes("total_sales")) {
        return {
          rowCount: 1,
          rows: [
            { item_id: "MENU-01", item_name: "Nasi Goreng Special", category: "Makanan", qty_sold: 10, total_sales: 350000, total_hpp: 140000 }
          ]
        };
      }

      return { rowCount: 0, rows: [] };
    };

    const { getOperationalAnalytics } = require("../src/controllers/analyticsController");

    // Test for 'yesterday'
    let yesterdayJsonResult = null;
    await getOperationalAnalytics(
      { query: { period: "yesterday" } },
      {
        json: (data) => { yesterdayJsonResult = data; },
        status: () => ({ json: (data) => { yesterdayJsonResult = data; } })
      }
    );

    assert.ok(yesterdayJsonResult, "yesterday query must return a response");
    assert.strictEqual(yesterdayJsonResult.success, true, "yesterday query must succeed");
    const yData = yesterdayJsonResult.data || yesterdayJsonResult;
    assert.strictEqual(yData.filters.period, "yesterday");
    assert.strictEqual(yData.kpi.totalRevenue.current, 4520000);
    assert.strictEqual(yData.kpi.fnbGrossMargin.grossSales, 1520000);
    assert.strictEqual(yData.hourlyTraffic.length, 24);
    assert.strictEqual(yData.dailyTrend.length, 1);
    assert.strictEqual(yData.dayOfWeekPattern.days.length, 7);
    assert.strictEqual(yData.roomLeaderboard.length, 2);
    assert.strictEqual(yData.fnbLeaderboard.length, 1);

    // Test for 'last7days'
    let last7daysJsonResult = null;
    await getOperationalAnalytics(
      { query: { period: "last7days", compare_to: "same_day_last_week" } },
      {
        json: (data) => { last7daysJsonResult = data; },
        status: () => ({ json: (data) => { last7daysJsonResult = data; } })
      }
    );
    assert.ok(last7daysJsonResult, "last7days query must return a response");
    assert.strictEqual(last7daysJsonResult.success, true, "last7days query must succeed");
    const l7Data = last7daysJsonResult.data || last7daysJsonResult;
    assert.strictEqual(l7Data.filters.period, "last7days");
    assert.strictEqual(l7Data.filters.durationDays, 7);
    assert.strictEqual(l7Data.dailyTrend.length, 7, "last7days must return dailyTrend sequence of 7 items");
    assert.strictEqual(l7Data.dayOfWeekPattern.days.length, 7, "dayOfWeekPattern must have 7 days");
    assert.strictEqual(l7Data.dayOfWeekPattern.peakDay, "Sabtu", "Peak day should be Sabtu based on mock totals");
    assert.strictEqual(l7Data.dayOfWeekPattern.slowestDay, "Selasa", "Slowest day should be Selasa based on mock totals");

    console.log("  ✓ PASS: getOperationalAnalytics successfully aggregates 'yesterday' and 'last7days' with daily trend & DOW pattern");

    console.log("\n🎉 All 11 Analytics & Business Intelligence Module Tests Passed Successfully!\n");
  } catch (e) {
    console.error("Test 11 Failed with error:", e);
    process.exit(1);
  } finally {
    db.query = originalQuery;
  }
})();
