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
        (node.children || []).forEach(match);
      }
      (elem.children || []).forEach(match);
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

  return elem;
}

function runTest() {
  console.log("Running General F&B Collapsible Items UI Test...");
  const appPath = path.resolve(__dirname, "../../js/app.js");
  const appSource = fs.readFileSync(appPath, "utf8");

  const mockOrders = [
    {
      order_id: "FNB-001",
      general_bill_id: "GBILL-001",
      room_id: "FNB-GENERAL",
      customer_name: "Tamu VIP 5",
      order_total: 430000,
      created_at: "2026-09-10T00:23:23+07:00",
      items: [
        { menu_name: "Bir Bintang Pint", quantity: 4, price: 45000, subtotal: 180000, is_voided: false },
        { menu_name: "French Fries", quantity: 2, price: 25000, subtotal: 50000, is_voided: false },
        { menu_name: "Nasi Goreng Spesial", quantity: 2, price: 100000, subtotal: 200000, is_voided: false },
      ],
    },
    {
      order_id: "FNB-002",
      general_bill_id: "GBILL-001",
      room_id: "FNB-GENERAL",
      customer_name: "Tamu VIP 5",
      order_total: 120000,
      created_at: "2026-09-10T00:36:39+07:00",
      items: [
        { menu_name: "Ice Lemon Tea", quantity: 2, price: 35000, subtotal: 70000, is_voided: false },
        { menu_name: "Snack Sampler", quantity: 1, price: 50000, subtotal: 50000, is_voided: false },
      ],
    },
  ];

  const sandbox = {
    document: {
      createElement: (tag) => createMockElement(tag),
      createDocumentFragment: () => createMockElement("div"),
    },
    openFnbOrders: mockOrders,
    expandedGeneralFnbOrderIds: new Set(),
    selectedGeneralFnbBillId: "",
    generalFnbCustomerName: "",
    generalFnbBillPaymentMethods: {},
    isCancellingFnbOrder: false,
    isSettlingGeneralFnbBill: false,
    isSavingFnbOrder: false,
    formatCurrency: (n) => `Rp ${Number(n || 0).toLocaleString("id-ID")}`,
    formatDateTimeLabel: (d) => String(d || ""),
    formatDecimal: (n) => String(n),
    getSelectedFbRoom: () => null,
    resetFnbOrderIdempotencyKey: () => {},
    renderRooms: () => {},
    console,
    Map,
    Set,
    Array,
    Number,
    String,
    Boolean,
  };

  const codeSlice = `
    ${appSource.slice(
      appSource.indexOf("function getOpenGeneralFnbBills"),
      appSource.indexOf("function createFnbOrderIdempotencyKey")
    )}

    ${appSource.slice(
      appSource.indexOf("function createOpenGeneralFnbBillsElement"),
      appSource.indexOf("function requestCancelGeneralFnbBill")
    )}
  `;

  vm.createContext(sandbox);
  vm.runInContext(codeSlice, sandbox);

  const billsElement = sandbox.createOpenGeneralFnbBillsElement();
  assert(billsElement, "billsElement should be created");

  const orderGroups = billsElement.querySelectorAll(".general-fnb-order-group");
  assert.strictEqual(orderGroups.length, 2, "Must render 2 order groups");

  // Order 1: 3 items, 8 total qty
  const order1 = orderGroups[0];
  const toggleBtn1 = order1.querySelector(".general-fnb-toggle-btn");
  assert(toggleBtn1, "Order 1 must have toggle button");
  assert.strictEqual(toggleBtn1.dataset.itemCount, "8", "Order 1 item count must be 8 (4+2+2)");

  const details1 = order1.querySelector(".general-fnb-order-details");
  assert(details1, "Order 1 must have details container");
  assert(details1.className.includes("collapsed"), "Details 1 should be collapsed by default");

  const items1 = details1.querySelectorAll(".general-fnb-order-item");
  assert.strictEqual(items1.length, 3, "Order 1 must have 3 item rows");

  const nameElem = items1[0].querySelector(".general-fnb-item-name");
  assert.strictEqual(nameElem.textContent, "Bir Bintang Pint");

  // Order 2: 2 items, 3 total qty
  const order2 = orderGroups[1];
  const toggleBtn2 = order2.querySelector(".general-fnb-toggle-btn");
  assert(toggleBtn2, "Order 2 must have toggle button");
  assert.strictEqual(toggleBtn2.dataset.itemCount, "3", "Order 2 item count must be 3 (2+1)");

  const details2 = order2.querySelector(".general-fnb-order-details");
  const items2 = details2.querySelectorAll(".general-fnb-order-item");
  assert.strictEqual(items2.length, 2, "Order 2 must have 2 item rows");

  console.log("  ✓ PASS: Tagihan F&B Umum renders collapsible item details for every batch order");
  console.log("All General F&B Items UI Tests Passed Successfully! 🎉");
}

runTest();
