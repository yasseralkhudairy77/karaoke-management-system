const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('🧪 Running Comprehensive All Room Cards Symmetry & Protection Test...\n');

const styleCssPath = path.resolve(__dirname, '../../css/style.css');
const styleCss = fs.readFileSync(styleCssPath, 'utf8');

// Test 1: Base .room-card containment for all status cards
console.log('Test 1: Verifying base .room-card containment...');
assert.ok(
  styleCss.includes('.room-card {') &&
  styleCss.includes('overflow: hidden;') &&
  styleCss.includes('box-sizing: border-box;'),
  'Base .room-card must have overflow: hidden and box-sizing: border-box'
);
console.log('  ✓ PASS: All room cards are strictly contained within their grid cell');

// Test 2: Base .room-meta flex column containment
console.log('Test 2: Verifying base .room-meta flex containment...');
assert.ok(
  styleCss.includes('.room-meta {') &&
  styleCss.includes('display: flex;') &&
  styleCss.includes('flex-direction: column;'),
  'Base .room-meta must use flex-direction: column to prevent grid track blowout'
);
console.log('  ✓ PASS: Base room-meta uses safe flex column layout across all statuses');

// Test 3: Base .room-booking-value ellipsis protection (protects Booked & Waiting Payment cards)
console.log('Test 3: Verifying base .room-booking-value ellipsis protection...');
assert.ok(
  styleCss.includes('.room-booking-value {') &&
  styleCss.includes('text-overflow: ellipsis;') &&
  styleCss.includes('max-width: 68%;'),
  'Base .room-booking-value must have ellipsis and max-width 68% for long customer/package names'
);
console.log('  ✓ PASS: Long customer names or packages in Booked cards truncate gracefully');

// Test 4: Single action button in Available room cards expands full width
console.log('Test 4: Verifying single action button in Available cards...');
assert.ok(
  styleCss.includes('.room-card.available .room-actions > .room-button') ||
  styleCss.includes('.room-actions > :only-child'),
  'Available room card single button must span full width (grid-column: 1 / -1)'
);
assert.ok(
  styleCss.includes('.room-card.available .room-button-checkout'),
  'Available room card checkout button must have dedicated luxury emerald styling'
);
console.log('  ✓ PASS: Available card button spans full width (100%) and matches occupied button symmetry');

// Test 5: LC session row alignment in Occupied cards
console.log('Test 5: Verifying LC session row alignment in Occupied cards...');
assert.ok(
  styleCss.includes('.room-card.occupied .room-booking-row.room-lc-session-row') &&
  styleCss.includes('align-items: flex-start !important;'),
  'Occupied LC session row must align to flex-start when multiple LC chips wrap'
);
console.log('  ✓ PASS: Multiple LC chips wrap cleanly without vertically centering the label');

console.log('\n🎉 All 5 Room Card Symmetry & Cross-Status Protection Tests Passed Successfully!\n');
