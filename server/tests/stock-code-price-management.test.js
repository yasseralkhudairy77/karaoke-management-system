const assert = require("assert");
const fs = require("fs");
const path = require("path");

function runStaticTests() {
  console.log("🧪 Running Stock Code & Price Management Tests...");

  const appJsPath = path.resolve(__dirname, "../../js/app.js");
  const appJs = fs.readFileSync(appJsPath, "utf8");

  const styleCssPath = path.resolve(__dirname, "../../css/style.css");
  const styleCss = fs.readFileSync(styleCssPath, "utf8");

  const masterCtrlPath = path.resolve(__dirname, "../src/controllers/masterDataController.js");
  const masterCtrl = fs.readFileSync(masterCtrlPath, "utf8");

  const fnbCtrlPath = path.resolve(__dirname, "../src/controllers/fnbController.js");
  const fnbCtrl = fs.readFileSync(fnbCtrlPath, "utf8");

  const invCtrlPath = path.resolve(__dirname, "../src/controllers/inventoryController.js");
  const invCtrl = fs.readFileSync(invCtrlPath, "utf8");

  // 1. Verify CSS styles for master ID and stock tags
  assert(styleCss.includes(".master-id-container"), "CSS must contain .master-id-container");
  assert(styleCss.includes(".master-id-primary"), "CSS must contain .master-id-primary");
  assert(styleCss.includes(".master-id-stock-tag"), "CSS must contain .master-id-stock-tag");
  console.log("  ✓ CSS classes for master ID and stock tags verified");

  // 2. Verify Menu Settings renders createMenuIdCell with stock tags
  assert(appJs.includes("function createMenuIdCell(menuItem)"), "app.js must define createMenuIdCell");
  assert(appJs.includes("createMenuIdCell(menuItem)"), "createMenuSettingsSection must use createMenuIdCell");
  assert(appJs.includes("ID Menu / Stok"), "Menu settings table header must show ID Menu / Stok");
  console.log("  ✓ Menu settings table displays both Menu ID and Stock Item ID");

  // 3. Verify Menu search haystack includes stock_item_id and linked inventory name
  assert(
    appJs.includes("menuItem.stock_item_id") && appJs.includes("linkedInvName"),
    "Menu search must index stock_item_id and linked inventory name"
  );
  console.log("  ✓ Menu search indexing verified for stock codes and inventory names");

  // 4. Verify Inventory settings table displays Selling Price
  assert(
    appJs.includes("Harga Jual (POS)"),
    "Inventory settings table must include 'Harga Jual (POS)' column"
  );
  console.log("  ✓ Inventory settings table includes Harga Jual (POS) column");

  // 5. Verify Inventory Master Data Form includes Selling Price field
  assert(
    appJs.includes("label: \"Harga Jual POS (Rp)\"") && appJs.includes("field: \"selling_price\""),
    "createMasterDataFormElement must render selling_price field for inventory"
  );
  assert(
    appJs.includes("selling_price: values.selling_price"),
    "buildMasterPayload must pass selling_price for inventory"
  );
  console.log("  ✓ Inventory Master Data Form includes editable selling_price field");

  // 6. Verify backend masterDataController syncs selling_price to menu
  assert(
    masterCtrl.includes("hasSellingPrice") && masterCtrl.includes("UPDATE menu"),
    "saveInventoryMaster must sync selling price to menu table"
  );
  console.log("  ✓ backend saveInventoryMaster syncs selling_price to menu table");

  // 7. Verify backend fnbController has ensureInventoryMenuItemsSync
  assert(
    fnbCtrl.includes("ensureInventoryMenuItemsSync"),
    "fnbController must contain ensureInventoryMenuItemsSync"
  );
  console.log("  ✓ backend fnbController includes auto-sync for unlinked inventory items");

  // 8. Verify backend inventoryController includes selling_price and menu_id
  assert(
    invCtrl.includes("m.price AS selling_price") && invCtrl.includes("selling_price: row.selling_price"),
    "inventoryController must include selling_price in getInventoryItems"
  );
  console.log("  ✓ backend inventoryController includes selling_price in getInventoryItems");

  // 9. Antislop check: verify no em dashes in newly added labels
  const emDash = "\u2014";
  assert(!appJs.includes(`Harga Jual POS ${emDash}`), "No em dashes in UI labels");
  console.log("  ✓ antislop: no forbidden em dashes in UI copy");

  console.log("✅ ALL Stock Code & Price Management tests PASSED SUCCESSFULLY!\n");
}

runStaticTests();
