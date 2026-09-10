const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

function createMockElement(tagName = "div") {
  const children = [];
  const classList = new Set();
  const attributes = {};
  const dataset = {};

  const elem = {
    tagName: tagName.toUpperCase(),
    dataset,
    children,
    parentElement: null,
    className: "",
    type: "",
    textContent: "",
    title: "",
    innerHTML: "",
    value: "",
    setAttribute(name, val) {
      attributes[name] = String(val);
    },
    getAttribute(name) {
      return attributes[name] || null;
    },
    appendChild(child) {
      child.parentElement = elem;
      children.push(child);
      return child;
    },
    append(...newChildren) {
      newChildren.forEach((c) => {
        if (typeof c === "string") {
          elem.textContent += c;
        } else if (c) {
          elem.appendChild(c);
        }
      });
    },
    querySelector(selector) {
      return elem.querySelectorAll(selector)[0] || null;
    },
    querySelectorAll(selector) {
      const results = [];
      function match(node) {
        let isMatch = false;
        if (selector.startsWith(".")) {
          const cls = selector.slice(1);
          if ((node.className || "").split(" ").includes(cls)) isMatch = true;
        } else if (selector.startsWith("[")) {
          const attr = selector.slice(1, -1).split("=");
          const key = attr[0];
          const val = attr[1] ? attr[1].replace(/['"]/g, "") : null;
          if (val === null && (node.getAttribute(key) !== null || node.dataset[key.replace("data-", "")])) isMatch = true;
          if (val !== null && (node.getAttribute(key) === val || node.dataset[key.replace("data-", "")] === val)) isMatch = true;
        } else {
          if (node.tagName === selector.toUpperCase()) isMatch = true;
        }
        if (isMatch) results.push(node);
        node.children.forEach(match);
      }
      nodeChildren(elem).forEach(match);
      return results;
    },
    closest(selector) {
      let cur = elem;
      while (cur) {
        if (selector.startsWith(".")) {
          const cls = selector.slice(1);
          if ((cur.className || "").split(" ").includes(cls)) return cur;
        }
        cur = cur.parentElement;
      }
      return null;
    },
  };

  function nodeChildren(node) {
    return node.children || [];
  }

  return elem;
}

function loadTransactionActionsSandbox() {
  const appPath = path.resolve(__dirname, "../../js/app.js");
  const appSource = fs.readFileSync(appPath, "utf8");

  let mockRole = "owner";
  let mockCommission = 100000;
  let mockHasPackage = false;
  let mockFnbTotal = 50000;
  let mockFnbOrderIds = ["FNB-1"];

  const mockDocument = {
    createElement(tag) {
      return createMockElement(tag);
    },
    querySelectorAll(selector) {
      return [];
    },
  };

  const sandbox = {
    document: mockDocument,
    getCurrentOperatorRole: () => mockRole,
    setOperatorRole: (role) => {
      mockRole = role;
    },
    getTransactionSalesCommissionAmount: () => mockCommission,
    setCommission: (val) => {
      mockCommission = val;
    },
    transactionHasPackage: () => mockHasPackage,
    getTransactionFnbTotal: () => mockFnbTotal,
    getTransactionFnbOrderIds: () => mockFnbOrderIds,
    canOpenLcDurationEditor: (tx) => Boolean(tx && Number(tx?.lc_total || 0) > 0),
    console,
    Array,
    String,
    Number,
    Boolean,
  };

  const functionStart = appSource.indexOf("function closeAllTransactionActionMenus");
  const functionEnd = appSource.indexOf("function createStockSubNavElement");
  const codeToRun = appSource.slice(functionStart, functionEnd);

  vm.createContext(sandbox);
  vm.runInContext(codeToRun, sandbox);

  return sandbox;
}

function runTests() {
  console.log("Running Transaction Action Menu UI Tests...");
  const sandbox = loadTransactionActionsSandbox();

  // Test 1: Owner Role, Paid Transaction with Commission and F&B
  sandbox.setOperatorRole("owner");
  sandbox.setCommission(75000);
  const transactionPaid = {
    transaction_id: "TRX-101",
    payment_status: "paid",
    payment_method: "transfer",
  };

  const actionsElem = sandbox.createTransactionActionsElement(transactionPaid);
  assert(actionsElem, "actions element should be created");
  assert.strictEqual(actionsElem.className, "transaction-actions");

  const primaryActions = actionsElem.querySelector(".transaction-primary-actions");
  assert(primaryActions, ".transaction-primary-actions should exist");

  const buttons = primaryActions.querySelectorAll(".transaction-action-button");
  const summaryBtn = buttons.find((b) => b.dataset.action === "show-transaction-summary");
  const printBtn = buttons.find((b) => b.dataset.action === "show-receipt-print");
  const triggerBtn = buttons.find((b) => b.dataset.action === "toggle-transaction-menu");

  assert(summaryBtn, "Summary (Lihat) button must exist in primary actions");
  assert.strictEqual(summaryBtn.textContent, "Lihat");
  assert.strictEqual(summaryBtn.dataset.transactionId, "TRX-101");

  assert(printBtn, "Print (Cetak) button must exist in primary actions");
  assert.strictEqual(printBtn.textContent, "Cetak");
  assert.strictEqual(printBtn.dataset.transactionId, "TRX-101");

  assert(triggerBtn, "Dropdown trigger (Opsi ▾) button must exist in primary actions");
  assert.strictEqual(triggerBtn.getAttribute("aria-haspopup"), "true");
  assert.strictEqual(triggerBtn.getAttribute("aria-expanded"), "false");

  const dropdown = actionsElem.querySelector(".transaction-menu-dropdown");
  assert(dropdown, ".transaction-menu-dropdown should exist");

  const menuItems = dropdown.querySelectorAll(".transaction-menu-item");
  const actionNames = menuItems.map((item) => item.dataset.action);

  assert(actionNames.includes("open-change-payment-method"), "Menu must contain Ubah Metode Bayar");
  assert(actionNames.includes("reprint-sales-commission"), "Menu must contain Cetak Slip Komisi");
  assert(actionNames.includes("open-transaction-manual-discount"), "Menu must contain Tambah Diskon");
  assert(actionNames.includes("open-transaction-package-correction"), "Menu must contain Koreksi Paket");
  assert(actionNames.includes("open-transaction-free-room-correction"), "Menu must contain Free Room");
  assert(actionNames.includes("open-transaction-fnb-void"), "Menu must contain Void F&B");
  assert(actionNames.includes("open-delete-transaction"), "Menu must contain Hapus Transaksi");

  const deleteBtn = menuItems.find((item) => item.dataset.action === "open-delete-transaction");
  assert(deleteBtn.className.includes("menu-item-danger"), "Delete button must have menu-item-danger class");

  const commissionBtn = menuItems.find((item) => item.dataset.action === "reprint-sales-commission");
  assert(commissionBtn.className.includes("menu-item-commission"), "Commission button must have menu-item-commission class");

  console.log("  ✓ PASS: Owner role renders primary buttons & full dropdown items with correct classes");

  // Test 2: Cashier Role (non-owner, non-manager)
  sandbox.setOperatorRole("cashier");
  const cashierActions = sandbox.createTransactionActionsElement(transactionPaid);
  const cashierDropdown = cashierActions.querySelector(".transaction-menu-dropdown");
  assert(cashierDropdown, "Cashier should have dropdown for secondary actions (Ubah Metode)");
  const cashierMenuItems = cashierDropdown.querySelectorAll(".transaction-menu-item");
  const cashierActionsList = cashierMenuItems.map((item) => item.dataset.action);

  assert(cashierActionsList.includes("open-change-payment-method"), "Cashier has Ubah Metode");
  assert(!cashierActionsList.includes("open-delete-transaction"), "Cashier cannot delete transactions");
  assert(!cashierActionsList.includes("open-transaction-package-correction"), "Cashier cannot correct packages");

  console.log("  ✓ PASS: Cashier role does not see owner/manager administrative actions");

  // Test 3: Unpaid Transaction contains pay control
  const transactionUnpaid = {
    transaction_id: "TRX-102",
    payment_status: "unpaid",
    payment_method: "cash",
  };
  const unpaidActions = sandbox.createTransactionActionsElement(transactionUnpaid);
  const payControl = unpaidActions.querySelector(".transaction-pay-control");
  assert(payControl, "Unpaid transaction must contain .transaction-pay-control");
  const payBtn = payControl.querySelector(".transaction-pay-button");
  assert(payBtn, "Tandai Lunas button must exist");
  assert.strictEqual(payBtn.dataset.action, "mark-history-paid");

  console.log("  ✓ PASS: Unpaid transaction renders payment control properly");

  console.log("\nAll Transaction Action Menu UI Tests Passed Successfully! 🎉");
}

runTests();
