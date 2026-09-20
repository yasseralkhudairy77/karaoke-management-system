const assert = require("assert");
const fs = require("fs");
const path = require("path");

console.log("🧪 Running Room Card Action Button Icons & Label Tests...\n");

const appJsPath = path.resolve(__dirname, "../../js/app.js");
const styleCssPath = path.resolve(__dirname, "../../css/style.css");
const indexHtmlPath = path.resolve(__dirname, "../../index.html");

const appJsContent = fs.readFileSync(appJsPath, "utf8");
const styleCssContent = fs.readFileSync(styleCssPath, "utf8");
const indexHtmlContent = fs.readFileSync(indexHtmlPath, "utf8");

// Test 1: Verify ROOM_STATUS_CONFIG buttonIcon mapping in js/app.js
console.log("Test 1: Verifying buttonIcon mapping in ROOM_STATUS_CONFIG...");
assert.ok(
  appJsContent.includes('buttonIcon: "📖"'),
  'ROOM_STATUS_CONFIG available must specify buttonIcon: "📖"'
);
assert.ok(
  appJsContent.includes('buttonIcon: "🏁"'),
  'ROOM_STATUS_CONFIG occupied must specify buttonIcon: "🏁"'
);
assert.ok(
  appJsContent.includes('buttonIcon: "▶️"'),
  'ROOM_STATUS_CONFIG booked must specify buttonIcon: "▶️"'
);
assert.ok(
  appJsContent.includes('buttonIcon: "✨"'),
  'ROOM_STATUS_CONFIG cleaning must specify buttonIcon: "✨"'
);
console.log("  ✓ PASS: ROOM_STATUS_CONFIG defines intuitive status icons (📖 for available booking, 🏁 for occupied finish)");

// Test 2: Verify getSessionButtonIcon helper function exists
console.log("Test 2: Verifying getSessionButtonIcon helper in js/app.js...");
assert.ok(
  appJsContent.includes("function getSessionButtonIcon(status)"),
  "js/app.js must define getSessionButtonIcon helper"
);
console.log("  ✓ PASS: getSessionButtonIcon function is present");

// Test 3: Verify createRoomCard uses dynamic icon and Koreksi Jam label
console.log("Test 3: Verifying createRoomCard button rendering...");
assert.ok(
  appJsContent.includes('sessionButton.innerHTML = `<span class="room-btn-icon">${sessionButtonIcon}</span> <span>${sessionButtonLabel}</span>`;'),
  "sessionButton must use dynamic sessionButtonIcon"
);
assert.ok(
  appJsContent.includes('adjustTimeButton.title = "Koreksi Jam & Durasi Sesi";'),
  "adjustTimeButton must define informative title tooltip"
);
assert.ok(
  appJsContent.includes('adjustTimeButton.innerHTML = `<span class="room-btn-icon">⏳</span> <span>Koreksi Jam</span>`;'),
  "adjustTimeButton must use concise 'Koreksi Jam' label to avoid clipping"
);
console.log("  ✓ PASS: Room card rendering dynamically displays open book icon for booking and compact Koreksi Jam");

// Test 4: Verify CSS styling in css/style.css
console.log("Test 4: Verifying CSS padding for room-button-adjust-time...");
assert.ok(
  styleCssContent.includes(".room-actions-occupied .room-button-adjust-time"),
  "style.css must style .room-button-adjust-time"
);
assert.ok(
  styleCssContent.includes("padding-left: 6px !important;"),
  "style.css must have compact padding for adjust time button"
);
console.log("  ✓ PASS: CSS provides compact padding for Koreksi Jam button");

// Test 5: Verify cache buster in index.html
console.log("Test 5: Verifying cache buster version in index.html...");
assert.ok(
  indexHtmlContent.includes("analytics-v3"),
  "index.html must reference ?v=analytics-v3"
);
console.log("  ✓ PASS: index.html has updated cache buster version (analytics-v3)");

// Test 6: Antislop check (no em dash in room card button labels)
console.log("Test 6: Checking antislop copy rule (no em dash in button labels)...");
assert.strictEqual(
  appJsContent.includes("Buat Booking —"),
  false,
  "No em dash in Buat Booking"
);
assert.strictEqual(
  appJsContent.includes("Koreksi Jam —"),
  false,
  "No em dash in Koreksi Jam"
);
console.log("  ✓ PASS: Antislop copy hygiene verified");

console.log("\n🎉 All 6 Room Card Action Tests Passed Successfully!\n");
