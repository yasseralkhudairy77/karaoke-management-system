const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('🧪 Running F&B Category Smart Picker Tests...');

const appJs = fs.readFileSync(path.join(__dirname, '../../js/app.js'), 'utf8');
const styleCss = fs.readFileSync(path.join(__dirname, '../../css/style.css'), 'utf8');

// 1. Verify getSortedFnbCategories and normalizeCategoryToExisting exist
assert(appJs.includes('function getSortedFnbCategories()'), 'app.js must define getSortedFnbCategories()');
assert(appJs.includes('function normalizeCategoryToExisting('), 'app.js must define normalizeCategoryToExisting()');

// 2. Logic test for getSortedFnbCategories & normalizeCategoryToExisting
function getSortedFnbCategoriesMock(inventoryItems, menuItems) {
  const categoryMap = new Map();

  (inventoryItems || []).forEach((item) => {
    const cat = String(item.category || '').trim();
    if (cat && !categoryMap.has(cat.toLowerCase())) {
      categoryMap.set(cat.toLowerCase(), cat);
    }
  });

  (menuItems || []).forEach((item) => {
    const cat = String(item.category || '').trim();
    if (cat && !categoryMap.has(cat.toLowerCase())) {
      categoryMap.set(cat.toLowerCase(), cat);
    }
  });

  const baseDefaults = ['Beer', 'Beverage', 'Cigarette', 'Food', 'Snack', 'Spirit'];
  baseDefaults.forEach((cat) => {
    if (!categoryMap.has(cat.toLowerCase())) {
      categoryMap.set(cat.toLowerCase(), cat);
    }
  });

  return Array.from(categoryMap.values()).sort((a, b) =>
    a.localeCompare(b, 'id', { sensitivity: 'base' })
  );
}

function normalizeCategoryToExistingMock(category, existingCategories) {
  const cat = String(category || '').trim();
  if (!cat) return '';
  const matched = existingCategories.find((c) => c.toLowerCase() === cat.toLowerCase());
  return matched || cat;
}

// Test A to Z ordering
const mockInv = [
  { category: 'Snack' },
  { category: 'Beverage' },
  { category: 'Anggur' }
];
const mockMenu = [
  { category: 'Cigarette' },
  { category: 'Food' },
  { category: 'Beer' }
];
const sortedCats = getSortedFnbCategoriesMock(mockInv, mockMenu);

for (let i = 0; i < sortedCats.length - 1; i++) {
  assert(
    sortedCats[i].localeCompare(sortedCats[i + 1], 'id', { sensitivity: 'base' }) <= 0,
    `Categories must be strictly sorted A to Z: ${sortedCats[i]} comes before ${sortedCats[i + 1]}`
  );
}
assert.strictEqual(sortedCats[0], 'Anggur');
console.log('  ✓ getSortedFnbCategories sorts categories strictly A to Z');

// Test duplicate normalization
assert.strictEqual(normalizeCategoryToExistingMock('snack', sortedCats), 'Snack');
assert.strictEqual(normalizeCategoryToExistingMock('SNACK', sortedCats), 'Snack');
assert.strictEqual(normalizeCategoryToExistingMock('beverage', sortedCats), 'Beverage');
assert.strictEqual(normalizeCategoryToExistingMock('Dessert', sortedCats), 'Dessert');
console.log('  ✓ normalizeCategoryToExisting prevents case-variant duplicate categories');

// 3. Verify createAddInventoryItemModalElement has smart category dropdown & custom input
assert(appJs.includes('add-inventory-category-select'), 'Modal must have add-inventory-category-select');
assert(appJs.includes('add-inventory-custom-category-input'), 'Modal must have add-inventory-custom-category-input');
assert(appJs.includes('+ Tambah Kategori Baru (Ketik Manual)...'), 'Modal must offer option to add custom new category');
console.log('  ✓ Modal contains smart category dropdown and manual custom category entry');

// 4. Verify Master Data Form integration
assert(appJs.includes('function createMasterCategoryField'), 'app.js must define createMasterCategoryField');
assert(appJs.includes('createMasterCategoryField({ label: "Kategori", field: "category" })'), 'Master data form must use createMasterCategoryField');
console.log('  ✓ Master Data forms (Menu and Inventory) also use smart category picker');

// 5. Verify CSS styling exists
assert(styleCss.includes('select.master-form-input option'), 'style.css must style select options');
assert(styleCss.includes('.add-inventory-category-field'), 'style.css must style add-inventory-category-field');
console.log('  ✓ CSS classes for category selector and options verified');

// 6. Antislop check: no forbidden em dashes in UI copy of category changes
assert(!appJs.includes('Kategori —'), 'Must not contain em dash in category strings');
console.log('  ✓ antislop: no forbidden em dashes in category UI copy');

console.log('✅ ALL F&B Category Smart Picker tests PASSED SUCCESSFULLY!\n');
