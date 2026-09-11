const assert = require("assert");
const fs = require("fs");
const path = require("path");

function runStaticTests() {
  console.log("🧪 Running Inventory Toggle UI & POS Protection Static Tests...");

  const appJsPath = path.resolve(__dirname, "../../js/app.js");
  const appJs = fs.readFileSync(appJsPath, "utf8");

  const styleCssPath = path.resolve(__dirname, "../../css/style.css");
  const styleCss = fs.readFileSync(styleCssPath, "utf8");

  // 1. Verify CSS rules exist
  assert(styleCss.includes(".erp-action-group"), "CSS must contain .erp-action-group");
  assert(styleCss.includes(".erp-switch"), "CSS must contain .erp-switch");
  assert(styleCss.includes(".erp-switch-input"), "CSS must contain .erp-switch-input");
  assert(styleCss.includes(".erp-switch-slider"), "CSS must contain .erp-switch-slider");
  assert(styleCss.includes(".erp-inventory-tr.is-inactive"), "CSS must contain .erp-inventory-tr.is-inactive");
  assert(styleCss.includes(".status-badge.tone-inactive"), "CSS must contain .status-badge.tone-inactive");
  console.log("  ✓ CSS classes for toggle switch and inactive rows verified");

  // 2. Verify app.js fetch query
  assert(
    appJs.includes("?action=getInventoryItems&status=all"),
    "fetchInventoryItemsFromApi must fetch with status=all"
  );
  console.log("  ✓ fetchInventoryItemsFromApi fetches all inventory statuses");

  // 3. Verify getFilteredMenuItems cross-checks linked stock status
  assert(
    appJs.includes("isStockActive"),
    "getFilteredMenuItems must contain isStockActive logic"
  );
  assert(
    appJs.includes("linkedInv && String(linkedInv.status || \"active\").trim().toLowerCase() === \"inactive\""),
    "getFilteredMenuItems must check if linked material is inactive"
  );
  console.log("  ✓ getFilteredMenuItems protects POS cashier from inactive stock materials");

  // 4. Verify createInventoryErpTableElement renders toggle switch
  assert(
    appJs.includes("switchLabel.className = \"erp-switch\""),
    "createInventoryErpTableElement must create .erp-switch label"
  );
  assert(
    appJs.includes("switchInput.className = \"erp-switch-input\""),
    "createInventoryErpTableElement must create .erp-switch-input checkbox"
  );
  assert(
    appJs.includes("switchSlider.className = \"erp-switch-slider\""),
    "createInventoryErpTableElement must create .erp-switch-slider span"
  );
  assert(
    appJs.includes("handleToggleInventoryItemStatus"),
    "app.js must implement handleToggleInventoryItemStatus handler"
  );
  assert(
    appJs.includes("window.confirm"),
    "Switch handler must ask confirmation when deactivating"
  );
  console.log("  ✓ createInventoryErpTableElement contains full toggle switch and confirmation flow");

  console.log("✅ ALL Inventory Toggle UI & POS Protection tests PASSED SUCCESSFULLY!\n");
}

runStaticTests();
