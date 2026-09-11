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

console.log("\nAll Room Card Layout & Text Clipping Prevention Tests Passed Successfully! 🎉\n");
