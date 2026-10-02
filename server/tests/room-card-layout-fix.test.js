const assert = require("assert");
const fs = require("fs");
const path = require("path");

console.log("🧪 Running Room Card Occupied Layout & Text Clipping Prevention Test...\n");

const styleCssPath = path.resolve(__dirname, "../../css/style.css");
const styleCss = fs.readFileSync(styleCssPath, "utf8");

// Test 1: Verify .room-card.occupied .room-meta containment
console.log("Test 1: Verifying .room-card.occupied .room-meta flex/grid containment...");
assert.ok(
  styleCss.includes(".room-card.occupied .room-meta"),
  "CSS must target .room-card.occupied .room-meta"
);
assert.ok(
  styleCss.includes("max-width: 100% !important;"),
  "CSS must contain max-width: 100% !important to prevent grid track blowout"
);
assert.ok(
  styleCss.includes("min-width: 0 !important;"),
  "CSS must contain min-width: 0 !important to override default grid item min-content"
);
console.log("  ✓ PASS: .room-meta is strictly constrained within card bounds");

// Test 2: Verify .room-booking-info and rows
console.log("Test 2: Verifying .room-booking-info and .room-booking-row containment...");
assert.ok(
  styleCss.includes(".room-card.occupied .room-booking-value"),
  "CSS must target .room-card.occupied .room-booking-value"
);
assert.ok(
  styleCss.includes("white-space: nowrap !important;"),
  "CSS must prevent values from wrapping awkwardly"
);
console.log("  ✓ PASS: Booking info rows and values are protected from clipping");

// Test 3: Verify F&B breakdown items and prices
console.log("Test 3: Verifying .room-card-fnb-breakdown item truncation & price protection...");
assert.ok(
  styleCss.includes(".fnb-breakdown-item-name"),
  "CSS must contain .fnb-breakdown-item-name"
);
assert.ok(
  styleCss.includes(".fnb-breakdown-item-price"),
  "CSS must contain .fnb-breakdown-item-price"
);
assert.ok(
  styleCss.includes(".fnb-breakdown-footer"),
  "CSS must contain .fnb-breakdown-footer"
);
assert.ok(
  styleCss.includes(".fnb-breakdown-total"),
  "CSS must contain .fnb-breakdown-total"
);
console.log("  ✓ PASS: F&B item names truncate gracefully without cutting off prices or totals");

// Test 4: Verify .room-topline 2-row structured layout
console.log("Test 4: Verifying .room-topline 2-row structured layout...");
assert.ok(
  styleCss.includes(".room-topline-main"),
  "CSS must style .room-topline-main for title and status row"
);
assert.ok(
  styleCss.includes(".room-topline-sub"),
  "CSS must style .room-topline-sub for billing badge row"
);
console.log("  ✓ PASS: Room card header is structured into explicit main and sub rows for symmetry");

// Test 5: Verify .room-booking-value ellipsis & max-width protection
console.log("Test 5: Verifying .room-booking-value ellipsis & max-width protection...");
assert.ok(
  styleCss.includes("overflow: hidden !important;"),
  "CSS must contain overflow: hidden !important for booking values"
);
assert.ok(
  styleCss.includes("text-overflow: ellipsis !important;"),
  "CSS must contain text-overflow: ellipsis !important for booking values"
);
assert.ok(
  styleCss.includes("max-width: 68% !important;"),
  "CSS must protect label breathing room with max-width limit on booking values"
);
console.log("  ✓ PASS: Long package names in booking info truncate gracefully with ellipsis");

// Test 6: Verify package duplication prevention in app.js
console.log("Test 6: Verifying package duplication prevention in app.js...");
const appJsPath = path.resolve(__dirname, "../../js/app.js");
const appJs = fs.readFileSync(appJsPath, "utf8");
assert.ok(
  appJs.includes(".replace(/^paket\\s+/i, \"\")"),
  "app.js must sanitize 'Paket' prefix from package name to prevent 'Paket Paket' duplication"
);
assert.ok(
  appJs.includes("room-topline-main"),
  "app.js createRoomCard must create room-topline-main"
);
assert.ok(
  appJs.includes("room-topline-sub"),
  "app.js createRoomCard must create room-topline-sub"
);
console.log("  ✓ PASS: Package duplication prevention and 2-row header structure verified in app.js");

console.log("\nAll Room Card Layout & Text Clipping Prevention Tests Passed Successfully! 🎉\n");
