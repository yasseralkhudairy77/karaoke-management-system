const assert = require("assert");
const fs = require("fs");
const path = require("path");

console.log("🧪 Running Reports Subnav Symmetrical Grid & Card Layout Tests...\n");

const styleCssPath = path.resolve(__dirname, "../../css/style.css");
const appJsPath = path.resolve(__dirname, "../../js/app.js");

const styleCss = fs.readFileSync(styleCssPath, "utf8");
const appJs = fs.readFileSync(appJsPath, "utf8");

// Test 1: Verify .reports-subnav grid container definition
console.log("Test 1: Verifying .reports-subnav grid container definition in CSS...");
assert.ok(
  styleCss.includes(".reports-subnav {"),
  "CSS must define base .reports-subnav class"
);
assert.ok(
  styleCss.includes("grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));"),
  "CSS must configure grid-template-columns with equal-width fractions"
);
assert.ok(
  styleCss.includes('.reports-subnav[data-tab-count="3"]'),
  "CSS must support data-tab-count='3' for Manager 3-column layout"
);
assert.ok(
  styleCss.includes('.reports-subnav[data-tab-count="4"]'),
  "CSS must support data-tab-count='4' for Owner 4-column layout"
);
console.log("  ✓ PASS: .reports-subnav grid container is properly defined with dynamic column counts");

// Test 2: Verify .reports-subnav-button card styling and states
console.log("Test 2: Verifying .reports-subnav-button card styling, active state, and badge...");
assert.ok(
  styleCss.includes(".reports-subnav-button {"),
  "CSS must style .reports-subnav-button"
);
assert.ok(
  styleCss.includes(".reports-subnav-button.active {"),
  "CSS must have dedicated distinct styling for .reports-subnav-button.active"
);
assert.ok(
  styleCss.includes(".reports-subnav-active-badge {"),
  "CSS must style .reports-subnav-active-badge"
);
assert.ok(
  styleCss.includes(".reports-subnav-header {"),
  "CSS must include .reports-subnav-header for label and badge alignment"
);
console.log("  ✓ PASS: Card styling, active state, and badges are properly defined");

// Test 3: Verify responsive breakpoints
console.log("Test 3: Verifying responsive media queries for mobile and tablet...");
assert.ok(
  styleCss.includes("@media (max-width: 767px)"),
  "CSS must include mobile breakpoint"
);
assert.ok(
  styleCss.includes("@media (min-width: 768px) and (max-width: 1023px)"),
  "CSS must include tablet breakpoint"
);
console.log("  ✓ PASS: Breakpoints properly reflow columns for mobile and tablet");

// Test 4: Verify JS implementation in app.js
console.log("Test 4: Verifying createReportsSubNavElement implementation in app.js...");
assert.ok(
  appJs.includes("wrapper.dataset.tabCount = String(visibleTabs.length);"),
  "app.js must attach data-tab-count to reports subnav wrapper"
);
assert.ok(
  appJs.includes('badge.className = "reports-subnav-active-badge";'),
  "app.js must render active status badge for selected tab"
);
console.log("  ✓ PASS: JS properly attaches tab counts and active badges");

console.log("\nAll Reports Subnav Layout Tests Passed Successfully! 🎉\n");
