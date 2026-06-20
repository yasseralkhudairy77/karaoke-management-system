/*
  Renderer utama dashboard.
  File ini memuat data ruangan, merender kartu, dan memperbarui timer ruangan terisi.

  TODO: Isi API_BASE_URL di config.js dengan URL Web App Google Apps Script
  agar action=getRooms menggantikan sumber data contoh di production.
*/

import { API_BASE_URL } from "./config.js";
import { rooms as mockRooms } from "./mock-data.js";

const roomsGrid = document.querySelector("#roomsGrid");
const dataSourceBadge = document.querySelector("#dataSourceBadge");
const currencyFormatter = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

let rooms = [];
let errorMessage = "";
let noticeMessage = "";
let noticeType = "info";
let lastTransaction = null;
let todayTransactions = [];
let todayTransactionSummary = null;
let transactionHistoryFilter = "all";
let cashierClosingPreviewVisible = false;
let cashierClosingCashActual = "";
let cashierClosingNote = "";
let lastCashierClosing = null;
let isSavingCashierClosing = false;
let todayCashierClosings = [];
let todayCashierClosingSummary = null;
let selectedClosingForPrint = null;
let closingPrintPreviewVisible = false;
let menuItems = [];
let menuSearchQuery = "";
let menuCategoryFilter = "all";
let menuErrorMessage = "";
let inventoryItems = [];
let inventorySummary = null;
let isLoadingInventory = false;
let stockWarningMessages = [];
let stockAdjustmentForm = {
  stock_item_id: "",
  adjustment_type: "restock",
  quantity: "",
  note: "",
};
let isSavingStockAdjustment = false;
let lastStockAdjustment = null;
let todayStockMovements = [];
let todayStockMovementSummary = null;
let stockMovementItemFilter = "all";
let stockMovementTypeFilter = "all";
let stockMovementReferenceFilter = "all";
let isLoadingStockMovements = false;
let roomsLoading = false;
let menuLoading = false;
let selectedFbRoomId = "";
let fbCartItems = [];
let lastFnbOrder = null;
let isSavingFnbOrder = false;
let isCancellingFnbOrder = false;
let fnbOrderNote = "";
let openFnbOrders = [];
let openFnbOrderSummary = null;
let isLoadingOpenFnbOrders = false;
let todayFnbOrders = [];
let todayFnbOrderSummary = null;
let todayFnbOrderStatusFilter = "all";
let todayFnbOrderRoomFilter = "all";
let isLoadingTodayFnbOrders = false;
let transactionFnbDetails = {};
let isLoadingTransactionFnbDetails = false;
let receiptPrintVisible = false;
let selectedReceiptTransaction = null;
let durationSelectionRoomId = "";
let customDurationMinutes = "";
let extendSelectionRoomId = "";
let customExtendMinutes = "";
let isExtendingSession = false;

async function loadRooms() {
  roomsLoading = true;
  renderRooms();
  setDataSourceBadge("Memuat Data");
  errorMessage = "";

  if (!API_BASE_URL.trim()) {
    rooms = normalizeRooms(mockRooms);
    syncSelectedFbRoomWithRooms();
    roomsLoading = false;
    setDataSourceBadge("Mode Data Contoh", "mock");
    console.info("Memakai data contoh karena API_BASE_URL masih kosong.");
    renderRooms();
    return;
  }

  try {
    rooms = normalizeRooms(await fetchRoomsFromApi());
    syncSelectedFbRoomWithRooms();
    roomsLoading = false;
    setDataSourceBadge("Terhubung ke Server", "live");
    console.info("Data ruangan berhasil dimuat dari Google Apps Script API.");
    renderRooms();
  } catch (error) {
    console.warn("Gagal memuat data ruangan dari API. Memakai data contoh sementara.", error);
    roomsLoading = false;
    setDataSourceBadge("Server Bermasalah", "error");
    showErrorState("Gagal memuat data dari server, sementara memakai data contoh.");
    rooms = normalizeRooms(mockRooms);
    syncSelectedFbRoomWithRooms();
    renderRooms();
  }
}

async function fetchRoomsFromApi() {
  const response = await fetch(`${API_BASE_URL}?action=getRooms`);

  if (!response.ok) {
    throw new Error(`API request failed with status ${response.status}`);
  }

  const data = await response.json();

  if (!data || data.ok !== true || !Array.isArray(data.rooms)) {
    throw new Error("API response is invalid.");
  }

  return data.rooms;
}

async function loadTodayTransactions() {
  if (!API_BASE_URL.trim()) {
    return;
  }

  try {
    const data = await fetchTodayTransactionsFromApi();

    todayTransactions = data.transactions;
    todayTransactionSummary = data.summary;
    renderRooms();
  } catch (error) {
    console.warn("Gagal memuat riwayat transaksi hari ini.", error);
    todayTransactions = [];
    todayTransactionSummary = null;
    renderRooms();
  }
}

async function fetchTodayTransactionsFromApi() {
  const response = await fetch(`${API_BASE_URL}?action=getTodayTransactions`);

  if (!response.ok) {
    throw new Error(`API request failed with status ${response.status}`);
  }

  const data = await response.json();

  if (!data || data.ok !== true || !Array.isArray(data.transactions)) {
    throw new Error("API response is invalid.");
  }

  return {
    transactions: data.transactions,
    summary: data.summary || null,
  };
}

async function loadTodayCashierClosings() {
  if (!API_BASE_URL.trim()) {
    return;
  }

  try {
    const data = await fetchTodayCashierClosingsFromApi();

    todayCashierClosings = data.closings;
    todayCashierClosingSummary = data.summary;
    lastCashierClosing = todayCashierClosings[0] || lastCashierClosing;
    renderRooms();
  } catch (error) {
    console.warn("Gagal memuat riwayat closing hari ini.", error);
    todayCashierClosings = [];
    todayCashierClosingSummary = null;
    renderRooms();
  }
}

async function fetchTodayCashierClosingsFromApi() {
  const response = await fetch(`${API_BASE_URL}?action=getTodayCashierClosings`);

  if (!response.ok) {
    throw new Error(`API request failed with status ${response.status}`);
  }

  const data = await response.json();

  if (!data || data.ok !== true || !Array.isArray(data.closings)) {
    throw new Error("API response is invalid.");
  }

  return {
    closings: data.closings,
    summary: data.summary || null,
  };
}

async function loadMenuItems() {
  menuErrorMessage = "";
  menuLoading = true;
  renderRooms();

  if (!API_BASE_URL.trim()) {
    menuItems = [];
    menuLoading = false;
    renderRooms();
    return;
  }

  try {
    const data = await fetchMenuItemsFromApi();

    menuItems = Array.isArray(data.menu_items) ? data.menu_items : [];
    console.log("Menu F&B dimuat:", menuItems.length);
    menuLoading = false;
    renderRooms();
  } catch (error) {
    console.warn("Gagal memuat Menu F&B.", error);
    menuItems = [];
    menuErrorMessage = "Gagal memuat menu F&B.";
    menuLoading = false;
    renderRooms();
  }
}

async function fetchMenuItemsFromApi() {
  const response = await fetch(`${API_BASE_URL}?action=getMenuItems`);

  if (!response.ok) {
    throw new Error(`API request failed with status ${response.status}`);
  }

  const data = await response.json();

  if (!data || data.ok !== true) {
    throw new Error("API response is invalid.");
  }

  const menuItems = Array.isArray(data.menu_items) ? data.menu_items : [];

  return {
    menu_items: menuItems.map((menuItem) => ({
      menu_id: menuItem.menu_id || "",
      menu_name: menuItem.menu_name || "",
      category: menuItem.category || "",
      price: Number(menuItem.price) || 0,
      status: menuItem.status || "",
      updated_at: menuItem.updated_at || "",
    })),
  };
}

async function loadInventoryItems() {
  if (!API_BASE_URL.trim()) {
    inventoryItems = [];
    inventorySummary = null;
    renderRooms();
    return;
  }

  isLoadingInventory = true;
  renderRooms();

  try {
    const data = await fetchInventoryItemsFromApi();

    inventoryItems = Array.isArray(data.items) ? data.items : [];
    inventorySummary = data.summary || null;
  } catch (error) {
    console.warn("Gagal memuat stok F&B.", error);
    inventoryItems = [];
    inventorySummary = null;
  } finally {
    isLoadingInventory = false;
    renderRooms();
  }
}

async function fetchInventoryItemsFromApi() {
  const response = await fetch(`${API_BASE_URL}?action=getInventoryItems`);

  if (!response.ok) {
    throw new Error(`API request failed with status ${response.status}`);
  }

  const data = await response.json();

  if (!data || data.ok !== true || !Array.isArray(data.items)) {
    throw new Error("API response is invalid.");
  }

  return {
    items: data.items,
    summary: data.summary || null,
  };
}

function updateStockAdjustmentForm(field, value) {
  if (!Object.prototype.hasOwnProperty.call(stockAdjustmentForm, field)) {
    return;
  }

  stockAdjustmentForm = {
    ...stockAdjustmentForm,
    [field]: value,
  };
  renderRooms();
}

function focusStockAdjustmentField(selector) {
  const field = roomsGrid.querySelector(selector);

  if (!field) {
    return;
  }

  field.focus();

  try {
    field.setSelectionRange(field.value.length, field.value.length);
  } catch (error) {
    // Select elements and number inputs do not always support selection range.
  }
}

function resetStockAdjustmentForm() {
  stockAdjustmentForm = {
    stock_item_id: "",
    adjustment_type: "restock",
    quantity: "",
    note: "",
  };
  renderRooms();
}

function buildStockAdjustmentPayload() {
  return {
    action: "adjustInventoryStock",
    stock_item_id: stockAdjustmentForm.stock_item_id,
    adjustment_type: stockAdjustmentForm.adjustment_type,
    quantity: Number(stockAdjustmentForm.quantity),
    note: stockAdjustmentForm.note,
    cashier_name: "Kasir",
  };
}

function isStockAdjustmentQuantityValid() {
  const quantity = Number(stockAdjustmentForm.quantity);

  if (!Number.isFinite(quantity)) {
    return false;
  }

  if (stockAdjustmentForm.adjustment_type === "restock") {
    return quantity > 0;
  }

  if (stockAdjustmentForm.adjustment_type === "set_stock") {
    return quantity >= 0;
  }

  return false;
}

function canSubmitStockAdjustment() {
  return (
    API_BASE_URL.trim() &&
    stockAdjustmentForm.stock_item_id &&
    isStockAdjustmentQuantityValid() &&
    !isSavingStockAdjustment
  );
}

async function submitStockAdjustment() {
  if (!API_BASE_URL.trim()) {
    showInlineNotice("API belum dikonfigurasi.", "error");
    return;
  }

  if (!stockAdjustmentForm.stock_item_id) {
    showInlineNotice("Pilih item stok terlebih dahulu.", "error");
    return;
  }

  if (!isStockAdjustmentQuantityValid()) {
    showInlineNotice(
      stockAdjustmentForm.adjustment_type === "restock"
        ? "Jumlah restock harus lebih dari 0."
        : "Stok aktual harus 0 atau lebih.",
      "error"
    );
    return;
  }

  if (isSavingStockAdjustment) {
    return;
  }

  isSavingStockAdjustment = true;
  renderRooms();

  try {
    const data = await postApiAction(buildStockAdjustmentPayload());

    if (!data || data.ok !== true) {
      throw new Error(data?.error || "Gagal memperbarui stok.");
    }

    lastStockAdjustment = data;
    showInlineNotice("Stok berhasil diperbarui.");
    stockAdjustmentForm = {
      stock_item_id: "",
      adjustment_type: "restock",
      quantity: "",
      note: "",
    };
    await loadInventoryItems();
    await loadTodayStockMovements();
  } catch (error) {
    showInlineNotice(error.message || "Gagal memperbarui stok.", "error");
  } finally {
    isSavingStockAdjustment = false;
    renderRooms();
  }
}

async function loadTodayStockMovements() {
  todayStockMovementSummary = null;

  if (!API_BASE_URL.trim()) {
    todayStockMovements = [];
    renderRooms();
    return;
  }

  isLoadingStockMovements = true;
  renderRooms();

  try {
    const data = await fetchTodayStockMovementsFromApi();

    todayStockMovements = Array.isArray(data.stock_movements) ? data.stock_movements : [];
    todayStockMovementSummary = data.summary || null;
  } catch (error) {
    console.warn("Gagal memuat riwayat mutasi stok hari ini.", error);
    todayStockMovements = [];
    todayStockMovementSummary = null;
  } finally {
    isLoadingStockMovements = false;
    renderRooms();
  }
}

async function fetchTodayStockMovementsFromApi() {
  if (!API_BASE_URL.trim()) {
    return {
      stock_movements: [],
      summary: null,
    };
  }

  const params = new URLSearchParams({ action: "getTodayStockMovements" });

  if (stockMovementItemFilter && stockMovementItemFilter !== "all") {
    params.set("stock_item_id", stockMovementItemFilter);
  }

  if (stockMovementTypeFilter && stockMovementTypeFilter !== "all") {
    params.set("movement_type", stockMovementTypeFilter);
  }

  if (stockMovementReferenceFilter && stockMovementReferenceFilter !== "all") {
    params.set("reference_type", stockMovementReferenceFilter);
  }

  const response = await fetch(`${API_BASE_URL}?${params.toString()}`);

  if (!response.ok) {
    throw new Error(`API request failed with status ${response.status}`);
  }

  const data = await response.json();

  if (!data || data.ok !== true || !Array.isArray(data.stock_movements)) {
    throw new Error(data?.error || "API response is invalid.");
  }

  return {
    stock_movements: data.stock_movements,
    summary: data.summary || null,
  };
}

function setStockMovementItemFilter(stockItemId) {
  stockMovementItemFilter = stockItemId || "all";
  loadTodayStockMovements();
}

function setStockMovementTypeFilter(movementType) {
  if (!["all", "in", "out", "adjustment"].includes(movementType)) {
    return;
  }

  stockMovementTypeFilter = movementType;
  loadTodayStockMovements();
}

function setStockMovementReferenceFilter(referenceType) {
  if (!["all", "transaction", "manual_adjustment"].includes(referenceType)) {
    return;
  }

  stockMovementReferenceFilter = referenceType;
  loadTodayStockMovements();
}

async function loadOpenFnbOrders() {
  openFnbOrderSummary = null;

  if (!API_BASE_URL.trim()) {
    openFnbOrders = [];
    renderRooms();
    return;
  }

  isLoadingOpenFnbOrders = true;
  renderRooms();

  try {
    const data = await fetchOpenFnbOrdersFromApi();

    openFnbOrders = Array.isArray(data.orders) ? data.orders : [];
    openFnbOrderSummary = data.summary || null;
  } catch (error) {
    console.warn("Gagal memuat open order F&B.", error);
    openFnbOrders = [];
    openFnbOrderSummary = null;
  } finally {
    isLoadingOpenFnbOrders = false;
    renderRooms();
  }
}

async function fetchOpenFnbOrdersFromApi(roomId = "", roomStartTime = "") {
  if (!API_BASE_URL.trim()) {
    return {
      orders: [],
      summary: null,
    };
  }

  const params = new URLSearchParams({ action: "getOpenFnbOrders" });

  if (roomId) {
    params.set("room_id", roomId);
  }

  if (roomStartTime) {
    params.set("room_start_time", roomStartTime);
  }

  const response = await fetch(`${API_BASE_URL}?${params.toString()}`);

  if (!response.ok) {
    throw new Error(`API request failed with status ${response.status}`);
  }

  const data = await response.json();

  if (!data || data.ok !== true) {
    throw new Error("API response is invalid.");
  }

  return {
    orders: Array.isArray(data.orders) ? data.orders : [],
    summary: data.summary || null,
  };
}

async function loadTodayFnbOrders() {
  todayFnbOrderSummary = null;

  if (!API_BASE_URL.trim()) {
    todayFnbOrders = [];
    renderRooms();
    return;
  }

  isLoadingTodayFnbOrders = true;
  renderRooms();

  try {
    const data = await fetchTodayFnbOrdersFromApi();

    todayFnbOrders = Array.isArray(data.orders) ? data.orders : [];
    todayFnbOrderSummary = data.summary || null;
  } catch (error) {
    console.warn("Gagal memuat riwayat order F&B hari ini.", error);
    todayFnbOrders = [];
    todayFnbOrderSummary = null;
  } finally {
    isLoadingTodayFnbOrders = false;
    renderRooms();
  }
}

async function fetchTodayFnbOrdersFromApi() {
  if (!API_BASE_URL.trim()) {
    return {
      orders: [],
      summary: null,
    };
  }

  const response = await fetch(`${API_BASE_URL}?action=getTodayFnbOrders`);

  if (!response.ok) {
    throw new Error(`API request failed with status ${response.status}`);
  }

  const data = await response.json();

  if (!data || data.ok !== true || !Array.isArray(data.orders)) {
    throw new Error(data?.error || "API response is invalid.");
  }

  return {
    orders: data.orders,
    summary: data.summary || null,
  };
}

async function fetchFnbOrdersByIds(orderIds) {
  if (!API_BASE_URL.trim() || orderIds.length === 0) {
    return [];
  }

  const params = new URLSearchParams({
    action: "getFnbOrdersByIds",
    order_ids: orderIds.join(","),
  });
  const response = await fetch(`${API_BASE_URL}?${params.toString()}`);

  if (!response.ok) {
    throw new Error(`API request failed with status ${response.status}`);
  }

  const data = await response.json();

  if (!data || data.ok !== true || !Array.isArray(data.orders)) {
    throw new Error("API response is invalid.");
  }

  return data.orders;
}

function setDataSourceBadge(label, type = "default") {
  if (!dataSourceBadge) {
    return;
  }

  dataSourceBadge.textContent = label;
  dataSourceBadge.className =
    type === "default" ? "app-badge" : `app-badge ${type}`;
}

function showErrorState(message) {
  errorMessage = message;
}

function showInlineNotice(message, type = "info") {
  noticeMessage = message;
  noticeType = type;
  renderRooms();
}

function showBillingSummary(transaction) {
  lastTransaction = transaction;
  renderRooms();
}

function clearBillingSummary() {
  lastTransaction = null;
  selectedReceiptTransaction = null;
  receiptPrintVisible = false;
  renderRooms();
}

function showReceiptPrint(transaction) {
  if (!transaction) {
    showInlineNotice("Belum ada transaksi untuk dicetak.", "error");
    return;
  }

  selectedReceiptTransaction = transaction;
  receiptPrintVisible = true;
  renderRooms();
}

function hideReceiptPrint() {
  selectedReceiptTransaction = null;
  receiptPrintVisible = false;
  renderRooms();
}

function printReceipt() {
  if (typeof window === "undefined" || typeof window.print !== "function") {
    showInlineNotice("Fitur cetak tidak tersedia di browser ini.", "error");
    return;
  }

  window.print();
}

function setTransactionHistoryFilter(filter) {
  if (!["all", "paid", "unpaid"].includes(filter)) {
    return;
  }

  transactionHistoryFilter = filter;
  renderRooms();
}

function getFilteredTodayTransactions() {
  if (transactionHistoryFilter === "all") {
    return todayTransactions;
  }

  return todayTransactions.filter((transaction) => {
    return transaction.payment_status === transactionHistoryFilter;
  });
}

function findTodayTransactionById(transactionId) {
  return todayTransactions.find((transaction) => transaction.transaction_id === transactionId) || null;
}

function showTransactionFromHistory(transactionId) {
  const transaction = findTodayTransactionById(transactionId);

  if (!transaction) {
    showInlineNotice("Transaksi tidak ditemukan.", "error");
    return;
  }

  lastTransaction = transaction;
  showInlineNotice("Ringkasan transaksi ditampilkan.");
  loadFnbDetailsForTransaction(transaction);
}

function getEmptyTransactionMessage() {
  if (transactionHistoryFilter === "paid") {
    return "Belum ada transaksi lunas hari ini.";
  }

  if (transactionHistoryFilter === "unpaid") {
    return "Tidak ada transaksi yang belum dibayar.";
  }

  return "Belum ada transaksi hari ini.";
}

function toggleCashierClosingPreview() {
  cashierClosingPreviewVisible = !cashierClosingPreviewVisible;
  renderRooms();
}

function showCashierClosingPreview() {
  cashierClosingPreviewVisible = true;
  renderRooms();
}

function hideCashierClosingPreview() {
  cashierClosingPreviewVisible = false;
  renderRooms();
}

function updateCashierClosingCashActual(value) {
  cashierClosingCashActual = value;
  renderRooms();

  const cashInput = roomsGrid.querySelector("#cashierClosingCashActual");

  if (cashInput) {
    cashInput.focus();

    try {
      cashInput.setSelectionRange(cashInput.value.length, cashInput.value.length);
    } catch (error) {
      // Input number tidak selalu mendukung selection range.
    }
  }
}

function updateCashierClosingNote(value) {
  cashierClosingNote = value;
}

function hasTodayCashierClosing() {
  return todayCashierClosings.length > 0;
}

function findTodayClosingById(closingId) {
  return todayCashierClosings.find((closing) => closing.closing_id === closingId) || null;
}

function showClosingPrintPreview(closingId) {
  const closing = findTodayClosingById(closingId);

  if (!closing) {
    showInlineNotice("Data closing tidak ditemukan.", "error");
    return;
  }

  selectedClosingForPrint = closing;
  closingPrintPreviewVisible = true;
  renderRooms();
}

function hideClosingPrintPreview() {
  selectedClosingForPrint = null;
  closingPrintPreviewVisible = false;
  renderRooms();
}

function printSelectedClosing() {
  if (typeof window === "undefined" || typeof window.print !== "function") {
    showInlineNotice("Fitur cetak tidak tersedia di browser ini.", "error");
    return;
  }

  window.print();
}

function createStateMessage(message, type = "") {
  const stateMessage = document.createElement("p");
  stateMessage.className = type ? `state-message ${type}` : "state-message";
  stateMessage.textContent = message;
  return stateMessage;
}

function createStockWarningListElement(warnings) {
  const list = document.createElement("div");
  list.className = "stock-warning-list";

  warnings.forEach((warning) => {
    const item = document.createElement("p");
    item.className = "stock-warning-item";
    item.textContent = warning;
    list.appendChild(item);
  });

  return list;
}

function normalizeRoomStatus(status) {
  return String(status || "available").trim().toLowerCase();
}

function isFbOrderRoomSelectable(room) {
  return normalizeRoomStatus(room?.status) === "occupied";
}

function syncSelectedFbRoomWithRooms() {
  if (!selectedFbRoomId) {
    return;
  }

  const selectedRoom = rooms.find((room) => room.room_id === selectedFbRoomId);

  if (!selectedRoom || !isFbOrderRoomSelectable(selectedRoom)) {
    selectedFbRoomId = "";
  }
}

function normalizeRooms(rawRooms) {
  return rawRooms.map((room) => {
    const ratePerHour = Number(room.rate_per_hour);

    return {
      room_id: room.room_id || "",
      room_name: room.room_name || "Ruangan Tanpa Nama",
      status: normalizeRoomStatus(room.status),
      start_time: room.start_time || null,
      booked_duration_minutes: Number(room.booked_duration_minutes) || 0,
      scheduled_end_time: room.scheduled_end_time || null,
      rate_per_hour: Number.isNaN(ratePerHour) ? 0 : ratePerHour,
      tv_device_id: room.tv_device_id || "",
      updated_at: room.updated_at || null,
    };
  });
}

function getFilteredMenuItems() {
  const normalizedSearch = menuSearchQuery.trim().toLowerCase();

  return menuItems.filter((menuItem) => {
    const category = menuItem.category || "";
    const matchesCategory =
      menuCategoryFilter === "all" || category === menuCategoryFilter;
    const matchesSearch =
      !normalizedSearch ||
      `${menuItem.menu_name || ""} ${category}`.toLowerCase().includes(normalizedSearch);

    return matchesCategory && matchesSearch;
  });
}

function setMenuSearchQuery(value) {
  menuSearchQuery = value;
  renderRooms();

  const searchInput = roomsGrid.querySelector(".menu-search");

  if (searchInput) {
    searchInput.focus();

    try {
      searchInput.setSelectionRange(searchInput.value.length, searchInput.value.length);
    } catch (error) {
      // Search input should support selection range, but keep typing safe if not.
    }
  }
}

function setMenuCategoryFilter(category) {
  menuCategoryFilter = category || "all";
  renderRooms();
}

function getMenuCategories() {
  return [...new Set(menuItems.map((menuItem) => menuItem.category).filter(Boolean))].sort();
}

function setSelectedFbRoom(roomId) {
  const nextRoomId = roomId || "";
  const room = rooms.find((item) => item.room_id === nextRoomId);

  if (nextRoomId && (!room || !isFbOrderRoomSelectable(room))) {
    selectedFbRoomId = "";
  } else {
    selectedFbRoomId = nextRoomId;
  }

  renderRooms();
}

function addMenuItemToCart(menuId) {
  const menuItem = findMenuItemById(menuId);

  if (!menuItem || menuItem.status !== "active") {
    showInlineNotice("Menu tidak aktif dan tidak bisa ditambahkan.", "error");
    return;
  }

  const existingItem = fbCartItems.find((item) => item.menu_id === menuItem.menu_id);

  if (existingItem) {
    existingItem.quantity += 1;
    existingItem.subtotal = existingItem.price * existingItem.quantity;
  } else {
    const price = Number(menuItem.price) || 0;

    fbCartItems.push({
      menu_id: menuItem.menu_id,
      menu_name: menuItem.menu_name,
      category: menuItem.category,
      price,
      quantity: 1,
      subtotal: price,
    });
  }

  showInlineNotice("Menu ditambahkan ke keranjang.");
}

function increaseCartItemQuantity(menuId) {
  const cartItem = fbCartItems.find((item) => item.menu_id === menuId);

  if (!cartItem) {
    return;
  }

  cartItem.quantity += 1;
  cartItem.subtotal = cartItem.price * cartItem.quantity;
  renderRooms();
}

function decreaseCartItemQuantity(menuId) {
  const cartItem = fbCartItems.find((item) => item.menu_id === menuId);

  if (!cartItem) {
    return;
  }

  if (cartItem.quantity <= 1) {
    removeCartItem(menuId);
    return;
  }

  cartItem.quantity -= 1;
  cartItem.subtotal = cartItem.price * cartItem.quantity;
  renderRooms();
}

function removeCartItem(menuId) {
  fbCartItems = fbCartItems.filter((item) => item.menu_id !== menuId);
  renderRooms();
}

function clearFbCart() {
  fbCartItems = [];
  renderRooms();
}

function calculateFbCartTotal() {
  return fbCartItems.reduce((total, item) => total + (Number(item.subtotal) || 0), 0);
}

function findMenuItemById(menuId) {
  return menuItems.find((menuItem) => menuItem.menu_id === menuId) || null;
}

function getSelectedFbRoom() {
  return rooms.find((room) => room.room_id === selectedFbRoomId) || null;
}

function getSelectedFbRoomStartTime() {
  const selectedRoom = getSelectedFbRoom();

  if (!isFbOrderRoomSelectable(selectedRoom)) {
    return "";
  }

  return formatJakartaIsoString(selectedRoom.start_time);
}

function getSelectedRoomOpenFnbOrders() {
  const selectedRoom = getSelectedFbRoom();

  if (!selectedRoom) {
    return openFnbOrders;
  }

  if (!isFbOrderRoomSelectable(selectedRoom)) {
    return [];
  }

  const roomStartTime = getSelectedFbRoomStartTime();

  return openFnbOrders.filter((order) => {
    return (
      order.room_id === selectedRoom.room_id &&
      formatJakartaIsoString(order.room_start_time) === roomStartTime &&
      order.order_status === "open"
    );
  });
}

function formatJakartaIsoString(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value).trim();
  }

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date).reduce((result, part) => {
    result[part.type] = part.value;
    return result;
  }, {});

  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}+07:00`;
}

function calculateOpenFnbOrdersSummary(orders) {
  return orders.reduce((summary, order) => {
    summary.total_orders += 1;
    summary.total_amount += Number(order.order_total) || 0;
    summary.total_items += (order.items || []).reduce((total, item) => {
      return total + (Number(item.quantity) || 0);
    }, 0);

    return summary;
  }, {
    total_orders: 0,
    total_items: 0,
    total_amount: 0,
  });
}

function setTodayFnbOrderStatusFilter(status) {
  if (!["all", "open", "billed", "cancelled"].includes(status)) {
    return;
  }

  todayFnbOrderStatusFilter = status;
  renderRooms();
}

function setTodayFnbOrderRoomFilter(roomId) {
  todayFnbOrderRoomFilter = roomId || "all";
  renderRooms();
}

function getFilteredTodayFnbOrders() {
  return todayFnbOrders.filter((order) => {
    const matchesStatus =
      todayFnbOrderStatusFilter === "all" || order.order_status === todayFnbOrderStatusFilter;
    const matchesRoom =
      todayFnbOrderRoomFilter === "all" || order.room_id === todayFnbOrderRoomFilter;

    return matchesStatus && matchesRoom;
  });
}

function calculateTodayFnbOrderSummary(orders) {
  return orders.reduce((summary, order) => {
    const orderTotal = Number(order.order_total) || 0;

    summary.total_orders += 1;
    summary.total_items += (order.items || []).reduce((total, item) => {
      return total + (Number(item.quantity) || 0);
    }, 0);
    summary.total_amount += orderTotal;

    if (order.order_status === "open") {
      summary.open_orders += 1;
      summary.open_amount += orderTotal;
    } else if (order.order_status === "billed") {
      summary.billed_orders += 1;
      summary.billed_amount += orderTotal;
    } else if (order.order_status === "cancelled") {
      summary.cancelled_orders += 1;
      summary.cancelled_amount += orderTotal;
    }

    return summary;
  }, {
    total_orders: 0,
    open_orders: 0,
    billed_orders: 0,
    cancelled_orders: 0,
    total_items: 0,
    open_amount: 0,
    billed_amount: 0,
    cancelled_amount: 0,
    total_amount: 0,
  });
}

function updateFnbOrderNote(value) {
  fnbOrderNote = value;
}

function buildFnbOrderPayload() {
  return {
    action: "saveFnbOrder",
    room_id: selectedFbRoomId,
    items: fbCartItems.map((item) => ({
      menu_id: item.menu_id,
      quantity: item.quantity,
    })),
    cashier_name: "Kasir",
    note: fnbOrderNote,
  };
}

async function saveFnbOrder() {
  if (!API_BASE_URL.trim()) {
    showInlineNotice("API belum dikonfigurasi. Isi URL server dulu di config.js.", "error");
    return;
  }

  const selectedRoom = getSelectedFbRoom();

  if (!selectedRoom) {
    showInlineNotice("Pilih ruangan terlebih dahulu.", "error");
    return;
  }

  if (!isFbOrderRoomSelectable(selectedRoom)) {
    showInlineNotice("Order F&B hanya bisa disimpan untuk ruangan yang sedang terisi.", "error");
    return;
  }

  if (fbCartItems.length === 0) {
    showInlineNotice("Keranjang F&B masih kosong.", "error");
    return;
  }

  if (isSavingFnbOrder) {
    return;
  }

  isSavingFnbOrder = true;
  renderRooms();

  try {
    const data = await postApiAction(buildFnbOrderPayload());

    if (!data || data.ok !== true) {
      throw new Error(data?.error || "Gagal menyimpan order F&B.");
    }

    lastFnbOrder = {
      order: data.order || null,
      items: Array.isArray(data.items) ? data.items : [],
    };
    fbCartItems = [];
    fnbOrderNote = "";
    showInlineNotice("Order F&B berhasil disimpan.");
    await loadOpenFnbOrders();
    await loadTodayFnbOrders();
  } catch (error) {
    showInlineNotice(error.message || "Gagal menyimpan order F&B.", "error");
  } finally {
    isSavingFnbOrder = false;
    renderRooms();
  }
}

function findFnbOrderById(orderId) {
  return (
    todayFnbOrders.find((order) => order.order_id === orderId) ||
    openFnbOrders.find((order) => order.order_id === orderId) ||
    null
  );
}

function getFnbOrderCanCancel(order) {
  return order?.order_status === "open";
}

function getFnbOrderCancelButtonLabel(order) {
  if (order?.order_status === "billed") {
    return "Sudah Ditagihkan";
  }

  if (order?.order_status === "cancelled") {
    return "Sudah Dibatalkan";
  }

  return "Batalkan";
}

function requestCancelFnbOrder(orderId) {
  const order = findFnbOrderById(orderId);

  if (!order) {
    showInlineNotice("Order F&B tidak ditemukan.", "error");
    return;
  }

  if (!getFnbOrderCanCancel(order)) {
    showInlineNotice("Hanya order F&B open yang bisa dibatalkan.", "error");
    return;
  }

  const reasonInput = window.prompt("Masukkan alasan pembatalan order F&B:");

  if (reasonInput === null) {
    return;
  }

  const reason = reasonInput.trim() || "Tanpa alasan";
  const confirmed = window.confirm("Batalkan order F&B ini? Tindakan ini tidak bisa dibatalkan.");

  if (!confirmed) {
    return;
  }

  cancelFnbOrder(orderId, reason);
}

async function cancelFnbOrder(orderId, reason) {
  if (!API_BASE_URL.trim()) {
    showInlineNotice("API belum dikonfigurasi.", "error");
    return;
  }

  if (isCancellingFnbOrder) {
    return;
  }

  isCancellingFnbOrder = true;
  renderRooms();

  try {
    const data = await postApiAction({
      action: "cancelFnbOrder",
      order_id: orderId,
      cancel_reason: reason,
      cancelled_by: "Kasir",
    });

    if (!data || data.ok !== true) {
      throw new Error(data?.error || "Gagal membatalkan order F&B.");
    }

    showInlineNotice("Order F&B berhasil dibatalkan.");
    await loadOpenFnbOrders();
    await loadTodayFnbOrders();
  } catch (error) {
    showInlineNotice(error.message || "Gagal membatalkan order F&B.", "error");
  } finally {
    isCancellingFnbOrder = false;
    renderRooms();
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatDuration(totalSeconds) {
  const safeSeconds = Math.max(0, totalSeconds);
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  return [hours, minutes, seconds]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
}

function formatDurationMinutes(minutes) {
  const totalMinutes = Number(minutes) || 0;

  if (totalMinutes <= 0) {
    return "Durasi belum diset";
  }

  const hours = Math.floor(totalMinutes / 60);
  const remainingMinutes = totalMinutes % 60;

  if (hours > 0 && remainingMinutes > 0) {
    return `${hours} jam ${remainingMinutes} menit`;
  }

  if (hours > 0) {
    return `${hours} jam`;
  }

  return `${remainingMinutes} menit`;
}

const ROOM_TIME_WARNING_MS = 10 * 60 * 1000;

function formatRemainingCountdown(ms) {
  if (!Number.isFinite(ms) || ms <= 0) {
    return "00:00:00";
  }

  return formatDuration(Math.ceil(ms / 1000));
}

function getRemainingTimeStatus(remainingMs) {
  if (!Number.isFinite(remainingMs)) {
    return "legacy";
  }

  if (remainingMs <= 0) {
    return "expired";
  }

  if (remainingMs <= ROOM_TIME_WARNING_MS) {
    return "warning";
  }

  return "normal";
}

function getRoomRemainingTime(room) {
  if (!room?.scheduled_end_time) {
    return null;
  }

  const endTime = new Date(room.scheduled_end_time).getTime();

  if (Number.isNaN(endTime)) {
    return null;
  }

  return endTime - Date.now();
}

function getRoomTimeState(room) {
  const remainingMs = getRoomRemainingTime(room);

  if (remainingMs === null) {
    return {
      status: "legacy",
      remainingMs: null,
    };
  }

  return {
    status: getRemainingTimeStatus(remainingMs),
    remainingMs,
  };
}

function getRoomTimeBadgeText(status) {
  if (status === "warning") {
    return "⚠️ 10 Menit Lagi";
  }

  if (status === "expired") {
    return "⏰ Waktu Habis";
  }

  return "";
}

function getRoomCountdownDisplayText(room) {
  const { status, remainingMs } = getRoomTimeState(room);

  if (status === "legacy") {
    return room?.start_time
      ? formatDuration(getElapsedSeconds(room.start_time))
      : "Durasi belum diset";
  }

  return formatRemainingCountdown(remainingMs);
}

function getRoomCountdownLabel(room) {
  return getRoomTimeState(room).status === "legacy" ? "Berjalan:" : "Sisa:";
}

function applyRoomTimeVisualState(card, status) {
  card.classList.remove("time-warning", "time-expired");

  if (status === "warning") {
    card.classList.add("time-warning");
  } else if (status === "expired") {
    card.classList.add("time-expired");
  }
}

function updateRoomTimeBadge(badge, status) {
  if (!badge) {
    return;
  }

  const badgeText = getRoomTimeBadgeText(status);

  badge.textContent = badgeText;
  badge.hidden = !badgeText;
  badge.className = badgeText ? `room-time-badge room-time-badge-${status}` : "room-time-badge";
}

function getRoomTimeLabel(value) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value).trim();
  }

  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function getElapsedSeconds(startTime) {
  if (!startTime) {
    return 0;
  }

  return Math.floor((Date.now() - new Date(startTime).getTime()) / 1000);
}

function getStatusLabel(status) {
  if (status === "available") {
    return "Kosong";
  }

  if (status === "occupied") {
    return "Terisi";
  }

  if (status === "maintenance") {
    return "Perbaikan";
  }

  return "Tidak Dikenal";
}

function getStatusClass(status) {
  return ["available", "occupied", "maintenance"].includes(status) ? status : "unknown";
}

function getSessionButtonLabel(status) {
  if (status === "available") {
    return "Mulai Sesi";
  }

  if (status === "occupied") {
    return "Selesaikan Sesi";
  }

  if (status === "maintenance") {
    return "Tidak Tersedia";
  }

  return "Cek Status";
}

function getPaymentStatusLabel(status) {
  if (status === "unpaid") {
    return "Belum Dibayar";
  }

  if (status === "paid") {
    return "Lunas";
  }

  return "Tidak Dikenal";
}

function getPaymentMethodLabel(method) {
  if (method === "cash") {
    return "Cash";
  }

  if (method === "transfer") {
    return "Transfer";
  }

  return "Tidak Dikenal";
}

function formatPaymentStatusLabel(status) {
  if (status === "paid") {
    return "Lunas";
  }

  if (status === "unpaid") {
    return "Belum Dibayar";
  }

  return "Tidak Dikenal";
}

function formatPaymentMethodLabel(method) {
  if (!method) {
    return "-";
  }

  if (method === "cash") {
    return "Cash";
  }

  if (method === "transfer") {
    return "Transfer";
  }

  return "Tidak Dikenal";
}

function getTransactionFinalTotal(transaction) {
  const grandTotal = Number(transaction?.grand_total) || 0;

  if (grandTotal > 0) {
    return grandTotal;
  }

  return Number(transaction?.room_total) || 0;
}

function getTransactionRoomTotal(transaction) {
  return Number(transaction?.room_total) || 0;
}

function getTransactionFnbTotal(transaction) {
  return Number(transaction?.fnb_total) || 0;
}

function getTransactionFnbOrderIds(transaction) {
  if (!transaction?.fnb_order_ids) {
    return [];
  }

  return String(transaction.fnb_order_ids)
    .split(",")
    .map((orderId) => orderId.trim())
    .filter(Boolean)
    .filter((orderId, index, orderIds) => orderIds.indexOf(orderId) === index);
}

function getReceiptFnbOrders(transaction) {
  const transactionId = transaction?.transaction_id || "";

  if (transactionId && transactionFnbDetails[transactionId]) {
    return transactionFnbDetails[transactionId];
  }

  if (Array.isArray(transaction?.fnb_orders)) {
    return transaction.fnb_orders;
  }

  return [];
}

async function loadFnbDetailsForTransaction(transaction) {
  const transactionId = transaction?.transaction_id || "";
  const orderIds = getTransactionFnbOrderIds(transaction);

  if (!transactionId || orderIds.length === 0 || transactionFnbDetails[transactionId]) {
    return;
  }

  isLoadingTransactionFnbDetails = true;
  renderRooms();

  try {
    transactionFnbDetails[transactionId] = await fetchFnbOrdersByIds(orderIds);
  } catch (error) {
    console.warn("Gagal memuat detail F&B transaksi.", error);
    transactionFnbDetails[transactionId] = [];
  } finally {
    isLoadingTransactionFnbDetails = false;
    renderRooms();
  }
}

function calculateCashierRevenueSummary(transactions) {
  return transactions.reduce((summary, transaction) => {
    const transactionTotal = getTransactionFinalTotal(transaction);
    const paymentStatus = transaction?.payment_status || "";
    const paymentMethod = transaction?.payment_method || "";

    summary.totalRevenue += transactionTotal;

    if (paymentStatus === "paid") {
      summary.paidRevenue += transactionTotal;
      summary.paidCount += 1;

      if (paymentMethod === "cash") {
        summary.cashRevenue += transactionTotal;
        summary.cashCount += 1;
      }

      if (paymentMethod === "transfer") {
        summary.transferRevenue += transactionTotal;
        summary.transferCount += 1;
      }
    }

    if (paymentStatus === "unpaid") {
      summary.unpaidRevenue += transactionTotal;
      summary.unpaidCount += 1;
    }

    return summary;
  }, {
    paidRevenue: 0,
    cashRevenue: 0,
    transferRevenue: 0,
    unpaidRevenue: 0,
    totalRevenue: 0,
    paidCount: 0,
    unpaidCount: 0,
    cashCount: 0,
    transferCount: 0,
  });
}

function createCashierRevenueSummaryElement(summary) {
  const revenue = document.createElement("section");
  revenue.className = "cashier-revenue";
  revenue.setAttribute("aria-labelledby", "cashier-revenue-title");

  const header = document.createElement("div");
  header.className = "cashier-revenue-header";

  const title = document.createElement("h3");
  title.className = "cashier-revenue-title";
  title.id = "cashier-revenue-title";
  title.textContent = "Rekap Omzet Kasir";

  header.appendChild(title);

  const grid = document.createElement("div");
  grid.className = "cashier-revenue-grid";

  [
    [
      "Omzet Lunas",
      formatCurrency(summary.paidRevenue),
      `${summary.paidCount} transaksi lunas`,
      "highlight",
    ],
    ["Cash", formatCurrency(summary.cashRevenue), `${summary.cashCount} transaksi`],
    ["Transfer", formatCurrency(summary.transferRevenue), `${summary.transferCount} transaksi`],
    [
      "Belum Dibayar",
      formatCurrency(summary.unpaidRevenue),
      `${summary.unpaidCount} transaksi`,
      "warning",
    ],
    ["Total Tagihan", formatCurrency(summary.totalRevenue), "Semua transaksi hari ini"],
  ].forEach(([labelText, valueText, noteText, modifierClass]) => {
    const card = document.createElement("div");
    card.className = modifierClass
      ? `cashier-revenue-card ${modifierClass}`
      : "cashier-revenue-card";

    const label = document.createElement("p");
    label.className = "cashier-revenue-label";
    label.textContent = labelText;

    const value = document.createElement("p");
    value.className = "cashier-revenue-value";
    value.textContent = valueText;

    const note = document.createElement("p");
    note.className = "cashier-revenue-note";
    note.textContent = noteText;

    card.append(label, value, note);
    grid.appendChild(card);
  });

  revenue.append(header, grid);

  return revenue;
}

function calculateCashierClosingPreview(transactions) {
  const preview = transactions.reduce((result, transaction) => {
    const transactionTotal = getTransactionFinalTotal(transaction);
    const paymentStatus = transaction?.payment_status || "";
    const paymentMethod = transaction?.payment_method || "";

    result.totalTransactions += 1;
    result.totalRevenue += transactionTotal;

    if (paymentStatus === "paid") {
      result.paidTransactions += 1;
      result.paidRevenue += transactionTotal;

      if (paymentMethod === "cash") {
        result.cashTransactions += 1;
        result.cashExpected += transactionTotal;
      }

      if (paymentMethod === "transfer") {
        result.transferTransactions += 1;
        result.transferRevenue += transactionTotal;
      }
    }

    if (paymentStatus === "unpaid") {
      result.unpaidTransactions += 1;
      result.unpaidRevenue += transactionTotal;
    }

    return result;
  }, {
    totalTransactions: 0,
    paidTransactions: 0,
    unpaidTransactions: 0,
    cashTransactions: 0,
    transferTransactions: 0,
    paidRevenue: 0,
    cashExpected: 0,
    transferRevenue: 0,
    unpaidRevenue: 0,
    totalRevenue: 0,
    cashActual: 0,
    cashDifference: 0,
    note: "",
  });

  preview.cashActual = Number(cashierClosingCashActual) || 0;
  preview.cashDifference = preview.cashActual - preview.cashExpected;
  preview.note = cashierClosingNote;

  return preview;
}

function createCashierClosingPreviewElement(preview) {
  const closing = document.createElement("section");
  closing.className = "cashier-closing";
  closing.setAttribute("aria-labelledby", "cashier-closing-title");

  const header = document.createElement("div");
  header.className = "cashier-closing-header";

  const titleGroup = document.createElement("div");

  const title = document.createElement("h3");
  title.className = "cashier-closing-title";
  title.id = "cashier-closing-title";
  title.textContent = "Preview Tutup Kasir";

  const subtitle = document.createElement("p");
  subtitle.className = "cashier-closing-subtitle";
  subtitle.textContent = "Rekap sementara berdasarkan transaksi hari ini.";

  titleGroup.append(title, subtitle);
  header.appendChild(titleGroup);

  const grid = document.createElement("div");
  grid.className = "cashier-closing-grid";

  [
    ["Total Transaksi", `${preview.totalTransactions} transaksi`],
    ["Transaksi Lunas", `${preview.paidTransactions} transaksi`],
    ["Belum Dibayar", `${preview.unpaidTransactions} transaksi`],
    ["Omzet Lunas", formatCurrency(preview.paidRevenue)],
    ["Cash Sistem", formatCurrency(preview.cashExpected)],
    ["Transfer", formatCurrency(preview.transferRevenue)],
    ["Sisa Belum Dibayar", formatCurrency(preview.unpaidRevenue)],
    ["Total Semua Tagihan", formatCurrency(preview.totalRevenue)],
  ].forEach(([labelText, valueText]) => {
    const card = document.createElement("div");
    card.className = "cashier-closing-card";

    const label = document.createElement("p");
    label.className = "cashier-closing-label";
    label.textContent = labelText;

    const value = document.createElement("p");
    value.className = "cashier-closing-value";
    value.textContent = valueText;

    card.append(label, value);
    grid.appendChild(card);
  });

  const cashSection = document.createElement("div");
  cashSection.className = "cashier-closing-section";

  const cashLabel = document.createElement("label");
  cashLabel.className = "cashier-closing-label";
  cashLabel.htmlFor = "cashierClosingCashActual";
  cashLabel.textContent = "Uang Cash Aktual";

  const cashInput = document.createElement("input");
  cashInput.className = "cashier-closing-input";
  cashInput.id = "cashierClosingCashActual";
  cashInput.type = "number";
  cashInput.min = "0";
  cashInput.inputMode = "numeric";
  cashInput.placeholder = "Masukkan uang cash di laci";
  cashInput.dataset.action = "update-cash-actual";
  cashInput.value = cashierClosingCashActual;

  const cashCheck = document.createElement("div");
  cashCheck.className = "cashier-closing-grid";

  [
    ["Cash Sistem", formatCurrency(preview.cashExpected)],
    ["Cash Aktual", formatCurrency(preview.cashActual)],
    ["Selisih Cash", formatCurrency(preview.cashDifference), getCashDifferenceClass(preview.cashDifference)],
  ].forEach(([labelText, valueText, modifierClass]) => {
    const card = document.createElement("div");
    card.className = modifierClass
      ? `cashier-closing-card ${modifierClass}`
      : "cashier-closing-card";

    const label = document.createElement("p");
    label.className = "cashier-closing-label";
    label.textContent = labelText;

    const value = document.createElement("p");
    value.className = "cashier-closing-value";
    value.textContent = valueText;

    card.append(label, value);
    cashCheck.appendChild(card);
  });

  const difference = document.createElement("p");
  difference.className = `cashier-closing-difference ${getCashDifferenceClass(preview.cashDifference)}`;
  difference.textContent = getCashDifferenceLabel(preview.cashDifference);

  cashSection.append(cashLabel, cashInput, cashCheck, difference);

  const noteSection = document.createElement("div");
  noteSection.className = "cashier-closing-section";

  const noteLabel = document.createElement("label");
  noteLabel.className = "cashier-closing-label";
  noteLabel.htmlFor = "cashierClosingNote";
  noteLabel.textContent = "Catatan Kasir";

  const noteInput = document.createElement("textarea");
  noteInput.className = "cashier-closing-textarea";
  noteInput.id = "cashierClosingNote";
  noteInput.placeholder = "Contoh: ada pelanggan transfer manual, pending pembayaran, atau catatan operasional.";
  noteInput.rows = 3;
  noteInput.dataset.action = "update-closing-note";
  noteInput.value = preview.note;

  noteSection.append(noteLabel, noteInput);

  const actions = document.createElement("div");
  actions.className = "cashier-closing-actions";

  const closeButton = document.createElement("button");
  closeButton.className = "cashier-closing-button secondary";
  closeButton.type = "button";
  closeButton.dataset.action = "hide-closing-preview";
  closeButton.textContent = "Tutup Preview";

  const saveButton = document.createElement("button");
  saveButton.className =
    hasTodayCashierClosing() || isSavingCashierClosing
      ? "cashier-closing-button primary disabled"
      : "cashier-closing-button primary";
  saveButton.type = "button";
  saveButton.dataset.action = "save-cashier-closing";
  saveButton.disabled = hasTodayCashierClosing() || isSavingCashierClosing;
  saveButton.textContent = isSavingCashierClosing ? "Menyimpan..." : "Simpan Closing";

  actions.append(closeButton, saveButton);

  closing.append(header, grid, cashSection, noteSection);

  if (lastCashierClosing) {
    closing.appendChild(createLastClosingSavedElement(lastCashierClosing));
  }

  if (hasTodayCashierClosing()) {
    const locked = document.createElement("p");
    locked.className = "cashier-closing-locked";
    locked.textContent = "Closing kasir hari ini sudah tersimpan.";
    closing.appendChild(locked);
  }

  if (preview.unpaidTransactions > 0) {
    const warning = document.createElement("p");
    warning.className = "cashier-closing-warning";
    warning.textContent = "Masih ada transaksi belum dibayar. Closing tetap bisa disimpan, tapi pastikan sudah diketahui kasir.";
    closing.appendChild(warning);
  }

  closing.appendChild(actions);

  return closing;
}

function getCashDifferenceClass(difference) {
  if (difference > 0) {
    return "positive";
  }

  if (difference < 0) {
    return "negative";
  }

  return "equal";
}

function getCashDifferenceLabel(difference) {
  if (difference > 0) {
    return "Lebih";
  }

  if (difference < 0) {
    return "Kurang";
  }

  return "Cash sesuai";
}

function getClosingDifferenceLabel(difference) {
  return getCashDifferenceLabel(difference);
}

function createLastClosingSavedElement(closing) {
  const saved = document.createElement("section");
  saved.className = "cashier-closing-saved";
  saved.setAttribute("aria-labelledby", "cashier-closing-saved-title");

  const title = document.createElement("h4");
  title.className = "cashier-closing-saved-title";
  title.id = "cashier-closing-saved-title";
  title.textContent = "Closing terakhir tersimpan";

  const grid = document.createElement("div");
  grid.className = "cashier-closing-saved-grid";

  [
    ["ID Closing", closing?.closing_id || "-"],
    ["Waktu", closing?.created_at || "-"],
    ["Cash Sistem", formatCurrency(closing?.cash_expected)],
    ["Cash Aktual", formatCurrency(closing?.cash_actual)],
    [
      "Selisih Cash",
      `${formatCurrency(closing?.cash_difference)} - ${getClosingDifferenceLabel(Number(closing?.cash_difference) || 0)}`,
    ],
  ].forEach(([labelText, valueText]) => {
    const item = document.createElement("div");
    item.className = "cashier-closing-saved-item";

    const label = document.createElement("p");
    label.className = "cashier-closing-saved-label";
    label.textContent = labelText;

    const value = document.createElement("p");
    value.className = "cashier-closing-saved-value";
    value.textContent = valueText;

    item.append(label, value);
    grid.appendChild(item);
  });

  saved.append(title, grid);

  return saved;
}

function createPaymentControlElement(transaction) {
  const payment = document.createElement("div");
  payment.className = "billing-payment";

  if (transaction?.payment_status === "paid") {
    const label = document.createElement("p");
    label.className = "billing-payment-label";
    label.textContent = "Metode Pembayaran";

    const method = document.createElement("p");
    method.className = "billing-payment-method";
    method.textContent = getPaymentMethodLabel(transaction?.payment_method);

    payment.append(label, method);
    return payment;
  }

  const label = document.createElement("label");
  label.className = "billing-payment-label";
  label.htmlFor = "paymentMethodSelect";
  label.textContent = "Metode Pembayaran";

  const control = document.createElement("div");
  control.className = "billing-payment-control";

  const select = document.createElement("select");
  select.className = "billing-payment-select";
  select.id = "paymentMethodSelect";

  [
    ["cash", "Cash"],
    ["transfer", "Transfer"],
  ].forEach(([value, text]) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = text;
    select.appendChild(option);
  });

  const button = document.createElement("button");
  button.className = "billing-payment-button";
  button.type = "button";
  button.dataset.action = "mark-paid";
  button.dataset.transactionId = transaction?.transaction_id || "";
  button.textContent = "Tandai Lunas";

  control.append(select, button);
  payment.append(label, control);

  return payment;
}

function getBillingBasisLabel(basis) {
  if (basis === "booked_duration") {
    return "Durasi Booking";
  }

  if (basis === "actual_duration") {
    return "Durasi Aktual";
  }

  return "";
}

function createBillingBasisNoteElement(transaction) {
  const basisLabel = getBillingBasisLabel(transaction?.billing_basis);

  if (!basisLabel) {
    return document.createDocumentFragment();
  }

  const note = document.createElement("p");
  note.className = "billing-basis-note";
  note.textContent = `Dasar tagihan: ${basisLabel}`;

  return note;
}

function createBillingSummaryElement(transaction) {
  const summary = document.createElement("section");
  summary.className = "billing-summary";
  summary.dataset.transactionId = transaction?.transaction_id || "";
  summary.setAttribute("aria-labelledby", "billing-summary-title");

  const header = document.createElement("div");
  header.className = "billing-summary-header";

  const title = document.createElement("h2");
  title.className = "billing-summary-title";
  title.id = "billing-summary-title";
  title.textContent = "Ringkasan Tagihan";

  const actions = document.createElement("div");
  actions.className = "billing-summary-actions";

  const closeButton = document.createElement("button");
  closeButton.className = "billing-summary-close";
  closeButton.type = "button";
  closeButton.dataset.action = "close-billing-summary";
  closeButton.textContent = "Tutup Ringkasan";

  const printButton = document.createElement("button");
  printButton.className = "billing-summary-close";
  printButton.type = "button";
  printButton.dataset.action = "show-receipt-print";
  printButton.dataset.transactionId = transaction?.transaction_id || "";
  printButton.textContent = "Cetak Struk";

  actions.append(printButton, closeButton);
  header.append(title, actions);

  const grid = document.createElement("div");
  grid.className = "billing-summary-grid";

  const items = [
    ["ID Transaksi", transaction?.transaction_id || "-"],
    ["Ruangan", transaction?.room_name || transaction?.room_id || "-"],
    ["Waktu Mulai", transaction?.start_time || "-"],
    ["Waktu Selesai", transaction?.end_time || "-"],
    ["Durasi", `${Number(transaction?.duration_minutes) || 0} menit`],
    ["Tarif per Jam", formatCurrency(transaction?.rate_per_hour)],
    [
      "Status Pembayaran",
      getPaymentStatusLabel(transaction?.payment_status),
      transaction?.payment_status === "paid" ? "billing-status-paid" : "billing-status-unpaid",
    ],
  ];

  items.forEach(([labelText, valueText, modifierClass]) => {
    const item = document.createElement("div");
    item.className = modifierClass
      ? `billing-summary-item ${modifierClass}`
      : "billing-summary-item";

    const label = document.createElement("p");
    label.className = "billing-summary-label";
    label.textContent = labelText;

    const value = document.createElement("p");
    value.className = "billing-summary-value";
    value.textContent = valueText;

    item.append(label, value);
    grid.appendChild(item);
  });

  summary.append(
    header,
    createBillingBasisNoteElement(transaction),
    grid,
    createBillingBreakdownElement(transaction),
    createBillingFnbDetailsElement(transaction),
    createBillingStockInfoElement(transaction),
    createPaymentControlElement(transaction)
  );

  return summary;
}

function createBillingStockInfoElement(transaction) {
  const movements = Array.isArray(transaction?.stock_movements) ? transaction.stock_movements : [];

  if (movements.length === 0) {
    return document.createDocumentFragment();
  }

  const info = document.createElement("p");
  info.className = "billing-fnb-orders";
  info.textContent = `Stok F&B diperbarui: ${movements.length} item`;

  return info;
}

function createBillingBreakdownElement(transaction) {
  const breakdown = document.createElement("div");
  breakdown.className = "billing-breakdown";

  [
    ["Biaya Room", formatCurrency(getTransactionRoomTotal(transaction))],
    ["Total F&B", formatCurrency(getTransactionFnbTotal(transaction))],
    ["Total Tagihan Akhir", formatCurrency(getTransactionFinalTotal(transaction)), "total"],
  ].forEach(([labelText, valueText, type]) => {
    const row = document.createElement("div");
    row.className = type === "total"
      ? "billing-breakdown-row billing-breakdown-total"
      : "billing-breakdown-row";

    const label = document.createElement("p");
    label.className = "billing-breakdown-label";
    label.textContent = labelText;

    const value = document.createElement("p");
    value.className = "billing-breakdown-value";
    value.textContent = valueText;

    row.append(label, value);
    breakdown.appendChild(row);
  });

  const orderIds = transaction?.fnb_order_ids || "";
  const fnbOrders = Array.isArray(transaction?.fnb_orders) ? transaction.fnb_orders : [];

  if (orderIds || fnbOrders.length > 0) {
    const orders = document.createElement("p");
    orders.className = "billing-fnb-orders";
    orders.textContent = fnbOrders.length > 0
      ? `${fnbOrders.length} order F&B masuk tagihan: ${fnbOrders.map((order) => order.order_id).join(", ")}`
      : `Order F&B masuk tagihan: ${orderIds}`;
    breakdown.appendChild(orders);
  }

  return breakdown;
}

function createBillingFnbDetailsElement(transaction) {
  const detail = document.createElement("section");
  detail.className = "billing-fnb-detail";

  if (getTransactionFnbTotal(transaction) <= 0) {
    return document.createDocumentFragment();
  }

  const title = document.createElement("h3");
  title.className = "billing-fnb-detail-title";
  title.textContent = "Detail F&B";

  const transactionId = transaction?.transaction_id || "";
  const orders = transactionFnbDetails[transactionId] || transaction?.fnb_orders || [];

  detail.appendChild(title);

  if (isLoadingTransactionFnbDetails && !orders.length) {
    detail.appendChild(createStateMessage("Memuat detail F&B..."));
    return detail;
  }

  if (!orders.length) {
    detail.appendChild(createStateMessage("Detail F&B belum tersedia."));
    return detail;
  }

  orders.forEach((order) => {
    detail.appendChild(createBillingFnbOrderElement(order));
  });

  return detail;
}

function createBillingFnbOrderElement(order) {
  const orderElement = document.createElement("article");
  orderElement.className = "billing-fnb-order";

  const header = document.createElement("div");
  header.className = "billing-fnb-order-header";

  const orderId = document.createElement("p");
  orderId.className = "billing-fnb-order-id";
  orderId.textContent = order?.order_id || "-";

  const total = document.createElement("p");
  total.className = "billing-fnb-order-total";
  total.textContent = formatCurrency(order?.order_total);

  header.append(orderId, total);

  const items = document.createElement("div");
  items.className = "billing-fnb-items";

  (order?.items || []).forEach((item) => {
    const itemElement = document.createElement("div");
    itemElement.className = "billing-fnb-item";

    const info = document.createElement("div");

    const name = document.createElement("p");
    name.className = "billing-fnb-item-name";
    name.textContent = item?.menu_name || "-";

    const meta = document.createElement("p");
    meta.className = "billing-fnb-item-meta";
    meta.textContent = `${Number(item?.quantity) || 0} x ${formatCurrency(item?.price)} = ${formatCurrency(item?.subtotal)}`;

    info.append(name, meta);
    itemElement.appendChild(info);
    items.appendChild(itemElement);
  });

  orderElement.append(header, items);

  if (order?.note) {
    const note = document.createElement("p");
    note.className = "billing-fnb-note";
    note.textContent = order.note;
    orderElement.appendChild(note);
  }

  return orderElement;
}

function createReceiptPrintElement(transaction) {
  const receipt = document.createElement("section");
  receipt.className = "receipt-print";
  receipt.setAttribute("aria-labelledby", "receipt-print-title");

  const header = document.createElement("header");
  header.className = "receipt-print-header";

  const brand = document.createElement("p");
  brand.className = "receipt-print-brand";
  brand.textContent = "Karaoke POS";

  const title = document.createElement("h2");
  title.className = "receipt-print-title";
  title.id = "receipt-print-title";
  title.textContent = "Struk Tagihan";

  const meta = document.createElement("p");
  meta.className = "receipt-print-meta";
  meta.textContent = `ID Transaksi: ${transaction?.transaction_id || "-"} | Waktu: ${transaction?.created_at || transaction?.end_time || "-"} | Kasir: ${transaction?.cashier_name || "-"}`;

  header.append(brand, title, meta);

  const roomRows = [
    ["Nama Ruangan", transaction?.room_name || transaction?.room_id || "-"],
    ["Waktu Mulai", transaction?.start_time || "-"],
    ["Waktu Selesai", transaction?.end_time || "-"],
    ["Durasi", `${Number(transaction?.duration_minutes) || 0} menit`],
    ["Tarif per Jam", formatCurrency(transaction?.rate_per_hour)],
  ];
  const basisLabel = getBillingBasisLabel(transaction?.billing_basis);

  if (basisLabel) {
    roomRows.push(["Dasar Tagihan", basisLabel]);
  }

  const roomSection = createReceiptSection("Informasi Ruangan", roomRows);

  const billingSection = createReceiptSection("Rincian Tagihan", [
    ["Biaya Room", formatCurrency(getTransactionRoomTotal(transaction))],
    ["Total F&B", formatCurrency(getTransactionFnbTotal(transaction))],
    ["Total Tagihan Akhir", formatCurrency(getTransactionFinalTotal(transaction)), "total"],
  ]);

  const paymentSection = createReceiptSection("Status Pembayaran", [
    ["Status", getPaymentStatusLabel(transaction?.payment_status)],
    ["Metode Pembayaran", formatPaymentMethodLabel(transaction?.payment_method)],
  ]);

  const footer = document.createElement("footer");
  footer.className = "receipt-print-footer";

  const thanks = document.createElement("p");
  thanks.textContent = "Terima kasih.";

  const source = document.createElement("p");
  source.textContent = "Dicetak dari Dashboard Kasir Karaoke";

  footer.append(thanks, source);

  const actions = document.createElement("div");
  actions.className = "receipt-print-actions";

  const printButton = document.createElement("button");
  printButton.className = "receipt-print-button";
  printButton.type = "button";
  printButton.dataset.action = "print-receipt";
  printButton.textContent = "Cetak";

  const closeButton = document.createElement("button");
  closeButton.className = "receipt-print-button secondary";
  closeButton.type = "button";
  closeButton.dataset.action = "hide-receipt-print";
  closeButton.textContent = "Tutup Preview";

  actions.append(printButton, closeButton);
  receipt.append(
    header,
    roomSection,
    billingSection,
    createReceiptFnbDetailElement(transaction),
    paymentSection,
    footer,
    actions
  );

  return receipt;
}

function createReceiptSection(titleText, rows) {
  const section = document.createElement("section");
  section.className = "receipt-print-section";

  const title = document.createElement("h3");
  title.className = "receipt-print-section-title";
  title.textContent = titleText;

  section.appendChild(title);

  rows.forEach(([labelText, valueText, type]) => {
    const row = document.createElement("div");
    row.className = type === "total"
      ? "receipt-print-row receipt-print-total"
      : "receipt-print-row";

    const label = document.createElement("p");
    label.className = "receipt-print-label";
    label.textContent = labelText;

    const value = document.createElement("p");
    value.className = "receipt-print-value";
    value.textContent = valueText;

    row.append(label, value);
    section.appendChild(row);
  });

  return section;
}

function createReceiptFnbDetailElement(transaction) {
  const section = document.createElement("section");
  section.className = "receipt-print-section receipt-print-fnb";

  const title = document.createElement("h3");
  title.className = "receipt-print-section-title";
  title.textContent = "Detail F&B";

  section.appendChild(title);

  if (getTransactionFnbTotal(transaction) <= 0) {
    const empty = document.createElement("p");
    empty.className = "receipt-print-note";
    empty.textContent = "Tidak ada pesanan F&B.";
    section.appendChild(empty);
    return section;
  }

  const orders = getReceiptFnbOrders(transaction);

  if (!orders.length) {
    const unavailable = document.createElement("p");
    unavailable.className = "receipt-print-note";
    unavailable.textContent = "Detail F&B belum tersedia. Buka ringkasan transaksi terlebih dahulu.";
    section.appendChild(unavailable);
    return section;
  }

  orders.forEach((order) => {
    const orderElement = document.createElement("article");
    orderElement.className = "receipt-print-fnb-order";

    const orderTitle = document.createElement("p");
    orderTitle.className = "receipt-print-fnb-order-title";
    orderTitle.textContent = `${order?.order_id || "-"} - ${formatCurrency(order?.order_total)}`;

    orderElement.appendChild(orderTitle);

    if (order?.note) {
      const note = document.createElement("p");
      note.className = "receipt-print-note";
      note.textContent = order.note;
      orderElement.appendChild(note);
    }

    (order?.items || []).forEach((item) => {
      const row = document.createElement("div");
      row.className = "receipt-print-fnb-item";

      const name = document.createElement("p");
      name.className = "receipt-print-value";
      name.textContent = item?.menu_name || "-";

      const meta = document.createElement("p");
      meta.className = "receipt-print-meta";
      meta.textContent = `${Number(item?.quantity) || 0} x ${formatCurrency(item?.price)} = ${formatCurrency(item?.subtotal)}`;

      row.append(name, meta);
      orderElement.appendChild(row);
    });

    section.appendChild(orderElement);
  });

  return section;
}

function createRoomCard(room) {
  const card = document.createElement("article");
  card.className = `room-card ${getStatusClass(room.status)}`;
  card.dataset.roomId = room.room_id;

  if (room.status === "occupied" && room.scheduled_end_time) {
    applyRoomTimeVisualState(card, getRoomTimeState(room).status);
  }

  const statusLabel = getStatusLabel(room.status);
  const sessionButtonLabel = getSessionButtonLabel(room.status);

  const topLine = document.createElement("div");
  topLine.className = "room-topline";

  const name = document.createElement("h2");
  name.className = "room-name";
  name.textContent = room.room_name;

  const status = document.createElement("span");
  status.className = "room-status";
  status.textContent = statusLabel;

  topLine.append(name, status);

  const meta = document.createElement("div");
  meta.className = "room-meta";

  if (room.status === "occupied") {
    meta.appendChild(createRoomBookingInfoElement(room));
  } else {
    const durationLabel = document.createElement("p");
    durationLabel.className = "meta-label";
    durationLabel.textContent = "Durasi sesi";

    const timer = document.createElement("p");
    timer.className = "timer";
    timer.textContent = "00:00:00";

    meta.append(durationLabel, timer);
  }

  const rate = document.createElement("p");
  rate.className = "rate";
  rate.textContent = `${currencyFormatter.format(room.rate_per_hour)} / jam`;

  meta.appendChild(rate);

  const actions = document.createElement("div");
  actions.className = "room-actions";

  const sessionButton = document.createElement("button");
  sessionButton.className = "room-button";
  sessionButton.type = "button";
  sessionButton.dataset.action = "toggle-session";
  sessionButton.textContent = sessionButtonLabel;

  const tvButton = document.createElement("button");
  tvButton.className = "room-button";
  tvButton.type = "button";
  tvButton.dataset.action = "turn-off-tv";
  tvButton.textContent = "Matikan TV";

  if (room.status === "occupied") {
    actions.classList.add("room-actions-occupied");

    const extendButton = document.createElement("button");
    extendButton.className = "room-button room-button-extend";
    extendButton.type = "button";
    extendButton.dataset.action = "show-extend-selection";
    extendButton.textContent = isExtendingSession ? "Menambah..." : "Tambah Waktu";

    tvButton.classList.add("room-button-full");
    actions.append(sessionButton, extendButton, tvButton);
  } else {
    actions.append(sessionButton, tvButton);
  }

  card.append(topLine, meta, actions);

  if (durationSelectionRoomId === room.room_id && room.status === "available") {
    card.appendChild(createDurationSelectionElement(room));
  }

  if (extendSelectionRoomId === room.room_id && room.status === "occupied") {
    card.appendChild(createExtendSelectionElement(room));
  }

  return card;
}

function createRoomBookingInfoElement(room) {
  const info = document.createElement("div");
  info.className = "room-booking-info";
  const timeState = getRoomTimeState(room);

  [
    ["Durasi", formatDurationMinutes(room.booked_duration_minutes)],
    ["Mulai", getRoomTimeLabel(room.start_time)],
    ["Selesai", getRoomTimeLabel(room.scheduled_end_time)],
  ].forEach(([labelText, valueText]) => {
    const row = document.createElement("p");
    row.className = "room-booking-row";

    const label = document.createElement("span");
    label.className = "room-booking-label";
    label.textContent = `${labelText}:`;

    const value = document.createElement("span");
    value.className = "room-booking-value";
    value.textContent = valueText;

    row.append(label, value);
    info.appendChild(row);
  });

  const badge = document.createElement("p");
  badge.className = "room-time-badge";
  badge.dataset.role = "time-status-badge";
  updateRoomTimeBadge(badge, timeState.status);
  info.appendChild(badge);

  const countdown = document.createElement("p");
  countdown.className = "room-booking-row room-countdown";

  const countdownLabel = document.createElement("span");
  countdownLabel.className = "room-booking-label";
  countdownLabel.textContent = getRoomCountdownLabel(room);

  const countdownValue = document.createElement("span");
  countdownValue.className = "timer room-countdown-value";
  countdownValue.dataset.startTime = room.start_time ?? "";
  countdownValue.dataset.scheduledEndTime = room.scheduled_end_time ?? "";
  countdownValue.textContent = getRoomCountdownDisplayText(room);

  if (timeState.status === "expired") {
    countdownValue.classList.add("expired");
  } else if (timeState.status === "warning") {
    countdownValue.classList.add("warning");
  }

  countdown.append(countdownLabel, countdownValue);
  info.appendChild(countdown);

  return info;
}

function createDurationSelectionElement(room) {
  const panel = document.createElement("div");
  panel.className = "duration-selection";

  const title = document.createElement("p");
  title.className = "duration-selection-title";
  title.textContent = `Pilih durasi untuk ${room.room_name}`;

  const options = document.createElement("div");
  options.className = "duration-options";

  [
    [60, "1 jam"],
    [120, "2 jam"],
    [180, "3 jam"],
  ].forEach(([minutes, labelText]) => {
    const button = document.createElement("button");
    button.className = "duration-option-button";
    button.type = "button";
    button.dataset.action = "start-session-duration";
    button.dataset.roomId = room.room_id;
    button.dataset.durationMinutes = String(minutes);
    button.textContent = labelText;
    options.appendChild(button);
  });

  const custom = document.createElement("div");
  custom.className = "duration-custom";

  const input = document.createElement("input");
  input.className = "duration-custom-input";
  input.type = "number";
  input.min = "15";
  input.step = "1";
  input.placeholder = "Custom menit";
  input.dataset.action = "update-custom-duration";
  input.value = customDurationMinutes;

  const customButton = document.createElement("button");
  customButton.className = "duration-custom-button";
  customButton.type = "button";
  customButton.dataset.action = "start-session-custom-duration";
  customButton.dataset.roomId = room.room_id;
  customButton.textContent = "Mulai Custom";

  custom.append(input, customButton);

  const cancelButton = document.createElement("button");
  cancelButton.className = "duration-cancel-button";
  cancelButton.type = "button";
  cancelButton.dataset.action = "cancel-duration-selection";
  cancelButton.textContent = "Batal";

  panel.append(title, options, custom, cancelButton);

  return panel;
}

function createExtendSelectionElement(room) {
  const panel = document.createElement("div");
  panel.className = "extend-selection";

  const title = document.createElement("p");
  title.className = "extend-selection-title";
  title.textContent = `Tambah waktu untuk ${room.room_name}`;

  const options = document.createElement("div");
  options.className = "extend-options";

  [
    [30, "+30 menit"],
    [60, "+1 jam"],
    [120, "+2 jam"],
  ].forEach(([minutes, labelText]) => {
    const button = document.createElement("button");
    button.className = "extend-option-button";
    button.type = "button";
    button.dataset.action = "extend-session-duration";
    button.dataset.roomId = room.room_id;
    button.dataset.addMinutes = String(minutes);
    button.textContent = labelText;
    options.appendChild(button);
  });

  const custom = document.createElement("div");
  custom.className = "extend-custom";

  const input = document.createElement("input");
  input.className = "extend-custom-input";
  input.type = "number";
  input.min = "15";
  input.step = "1";
  input.placeholder = "Custom menit";
  input.dataset.action = "update-custom-extend";
  input.value = customExtendMinutes;

  const customButton = document.createElement("button");
  customButton.className = "extend-custom-button";
  customButton.type = "button";
  customButton.dataset.action = "extend-session-custom-duration";
  customButton.dataset.roomId = room.room_id;
  customButton.textContent = "Tambah Custom";

  custom.append(input, customButton);

  const cancelButton = document.createElement("button");
  cancelButton.className = "extend-cancel-button";
  cancelButton.type = "button";
  cancelButton.dataset.action = "cancel-extend-selection";
  cancelButton.textContent = "Batal";

  panel.append(title, options, custom, cancelButton);

  return panel;
}

function createMenuPanelElement() {
  const panel = document.createElement("section");
  panel.className = "menu-panel";
  panel.setAttribute("aria-labelledby", "menu-panel-title");

  const header = document.createElement("div");
  header.className = "menu-panel-header";

  const titleGroup = document.createElement("div");

  const title = document.createElement("h2");
  title.className = "menu-panel-title";
  title.id = "menu-panel-title";
  title.textContent = "Menu F&B";

  const subtitle = document.createElement("p");
  subtitle.className = "menu-panel-subtitle";
  subtitle.textContent = "Daftar makanan dan minuman dari Google Sheets.";

  titleGroup.append(title, subtitle);
  header.appendChild(titleGroup);

  const toolbar = document.createElement("div");
  toolbar.className = "menu-toolbar";

  const search = document.createElement("input");
  search.className = "menu-search";
  search.type = "search";
  search.placeholder = "Cari menu...";
  search.value = menuSearchQuery;
  search.dataset.action = "search-menu";
  search.setAttribute("aria-label", "Cari menu F&B");

  toolbar.append(search, createMenuCategoryFilterElement());

  const list = document.createElement("div");
  list.className = "menu-list";

  if (!API_BASE_URL.trim()) {
    list.appendChild(createStateMessage("Menu F&B hanya tersedia saat terhubung ke server."));
  } else if (menuLoading) {
    list.appendChild(createStateMessage("Memuat menu F&B..."));
  } else if (menuErrorMessage) {
    list.appendChild(createStateMessage(menuErrorMessage, "error"));
  } else if (menuItems.length === 0) {
    list.appendChild(createStateMessage("Belum ada menu F&B."));
  } else {
    const filteredMenuItems = getFilteredMenuItems();

    if (filteredMenuItems.length === 0) {
      list.appendChild(createStateMessage("Menu tidak ditemukan."));
    } else {
      filteredMenuItems.forEach((menuItem) => {
        list.appendChild(createMenuCardElement(menuItem));
      });
    }
  }

  panel.append(header, toolbar, list);

  return panel;
}

function createMenuCategoryFilterElement() {
  const filter = document.createElement("div");
  filter.className = "menu-category-filter";
  filter.setAttribute("aria-label", "Filter kategori Menu F&B");

  [["all", "Semua"], ...getMenuCategories().map((category) => [category, category])].forEach(
    ([value, labelText]) => {
      const button = document.createElement("button");
      button.className =
        value === menuCategoryFilter
          ? "menu-category-button active"
          : "menu-category-button";
      button.type = "button";
      button.dataset.action = "filter-menu-category";
      button.dataset.category = value;
      button.textContent = labelText;
      filter.appendChild(button);
    }
  );

  return filter;
}

function createMenuCardElement(menuItem) {
  const card = document.createElement("article");
  card.className =
    menuItem.status === "inactive" ? "menu-card inactive" : "menu-card";

  const info = document.createElement("div");

  const name = document.createElement("h3");
  name.className = "menu-name";
  name.textContent = menuItem.menu_name || "-";

  const meta = document.createElement("p");
  meta.className = "menu-meta";
  meta.textContent = menuItem.category || "Tanpa kategori";

  info.append(name, meta);

  const price = document.createElement("p");
  price.className = "menu-price";
  price.textContent = formatCurrency(menuItem.price);

  const status = document.createElement("span");
  const statusClass = menuItem.status === "active" ? "active" : "inactive";
  status.className = `menu-status ${statusClass}`;
  status.textContent = getMenuStatusLabel(menuItem.status);

  const addButton = document.createElement("button");
  const isActive = menuItem.status === "active";
  addButton.className = isActive ? "menu-add-button" : "menu-add-button disabled";
  addButton.type = "button";
  addButton.dataset.action = "add-menu-to-cart";
  addButton.dataset.menuId = menuItem.menu_id || "";
  addButton.disabled = !isActive;
  addButton.textContent = isActive ? "Tambah ke Keranjang" : "Tidak Aktif";

  card.append(info, price, status, addButton);

  return card;
}

function getMenuStatusLabel(status) {
  if (status === "active") {
    return "Aktif";
  }

  if (status === "inactive") {
    return "Tidak Aktif";
  }

  return "Tidak Dikenal";
}

function createFbOrderPanelElement() {
  const panel = document.createElement("section");
  panel.className = "fb-order-panel";
  panel.setAttribute("aria-labelledby", "fb-order-title");

  const header = document.createElement("div");
  header.className = "fb-order-header";

  const titleGroup = document.createElement("div");

  const title = document.createElement("h2");
  title.className = "fb-order-title";
  title.id = "fb-order-title";
  title.textContent = "Order F&B";

  const subtitle = document.createElement("p");
  subtitle.className = "fb-order-subtitle";
  subtitle.textContent = "Keranjang sementara untuk pesanan makanan dan minuman.";

  titleGroup.append(title, subtitle);
  header.appendChild(titleGroup);

  panel.append(
    header,
    createFbRoomControlElement(),
    createFbRoomInfoElement(),
    createFbCartElement(),
    createFbCartTotalElement(),
    createFnbOrderNoteElement(),
    lastFnbOrder
      ? createLastFnbOrderElement(lastFnbOrder.order, lastFnbOrder.items)
      : document.createDocumentFragment(),
    createFbOrderActionsElement()
  );

  return panel;
}

function createFbRoomControlElement() {
  const control = document.createElement("div");
  control.className = "fb-room-control";

  const label = document.createElement("label");
  label.className = "transaction-label";
  label.setAttribute("for", "fbRoomSelect");
  label.textContent = "Pilih Ruangan";

  const select = document.createElement("select");
  select.className = "fb-room-select";
  select.id = "fbRoomSelect";

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Belum memilih ruangan";
  select.appendChild(placeholder);

  rooms.forEach((room) => {
    const option = document.createElement("option");
    const isSelectable = isFbOrderRoomSelectable(room);

    option.value = room.room_id;
    option.textContent = `${room.room_name} - ${getStatusLabel(room.status)}`;
    option.disabled = !isSelectable;

    if (isSelectable && room.room_id === selectedFbRoomId) {
      option.selected = true;
    }

    select.appendChild(option);
  });

  const selectedRoom = getSelectedFbRoom();

  if (!selectedRoom || !isFbOrderRoomSelectable(selectedRoom)) {
    placeholder.selected = true;
  }

  control.append(label, select);

  return control;
}

function createFbRoomInfoElement() {
  const info = document.createElement("div");
  info.className = "fb-room-info";

  const selectedRoom = getSelectedFbRoom();

  const roomName = document.createElement("p");
  roomName.className = "fb-cart-name";
  roomName.textContent = selectedRoom ? selectedRoom.room_name : "Belum ada ruangan dipilih.";

  const roomStatus = document.createElement("p");
  roomStatus.className = "fb-cart-meta";
  roomStatus.textContent = selectedRoom
    ? `Status: ${getStatusLabel(selectedRoom.status)}`
    : "Pilih ruangan untuk mengaitkan keranjang ini.";

  info.append(roomName, roomStatus);

  if (selectedRoom && !isFbOrderRoomSelectable(selectedRoom)) {
    const warning = document.createElement("p");
    warning.className = "fb-room-warning";
    warning.textContent = "Ruangan belum memiliki sesi aktif.";
    info.appendChild(warning);
  }

  return info;
}

function createFbCartElement() {
  const cart = document.createElement("div");
  cart.className = "fb-cart";

  if (fbCartItems.length === 0) {
    const empty = document.createElement("p");
    empty.className = "fb-cart-empty";
    empty.textContent = "Keranjang F&B masih kosong.";
    cart.appendChild(empty);
    return cart;
  }

  const list = document.createElement("div");
  list.className = "fb-cart-list";

  fbCartItems.forEach((item) => {
    list.appendChild(createFbCartRowElement(item));
  });

  cart.appendChild(list);

  return cart;
}

function createFbCartRowElement(item) {
  const row = document.createElement("article");
  row.className = "fb-cart-row";

  const info = document.createElement("div");

  const name = document.createElement("h3");
  name.className = "fb-cart-name";
  name.textContent = item.menu_name || "-";

  const meta = document.createElement("p");
  meta.className = "fb-cart-meta";
  meta.textContent = item.category || "Tanpa kategori";

  info.append(name, meta);

  const price = document.createElement("p");
  price.className = "fb-cart-price";
  price.textContent = formatCurrency(item.price);

  const quantity = document.createElement("div");
  quantity.className = "fb-cart-quantity";

  const decreaseButton = createFbCartButton("-", "decrease-cart-item", item.menu_id);

  const qtyValue = document.createElement("span");
  qtyValue.textContent = String(item.quantity);

  const increaseButton = createFbCartButton("+", "increase-cart-item", item.menu_id);

  quantity.append(decreaseButton, qtyValue, increaseButton);

  const subtotal = document.createElement("p");
  subtotal.className = "fb-cart-price";
  subtotal.textContent = formatCurrency(item.subtotal);

  const removeButton = document.createElement("button");
  removeButton.className = "fb-cart-remove";
  removeButton.type = "button";
  removeButton.dataset.action = "remove-cart-item";
  removeButton.dataset.menuId = item.menu_id;
  removeButton.textContent = "Hapus";

  row.append(info, price, quantity, subtotal, removeButton);

  return row;
}

function createFbCartButton(label, action, menuId) {
  const button = document.createElement("button");
  button.className = "fb-cart-button";
  button.type = "button";
  button.dataset.action = action;
  button.dataset.menuId = menuId;
  button.textContent = label;

  return button;
}

function createFbCartTotalElement() {
  const total = document.createElement("div");
  total.className = "fb-cart-total";

  const label = document.createElement("p");
  label.textContent = "Total Order F&B";

  const value = document.createElement("strong");
  value.textContent = formatCurrency(calculateFbCartTotal());

  total.append(label, value);

  return total;
}

function createFnbOrderNoteElement() {
  const control = document.createElement("div");
  control.className = "fb-room-control";

  const label = document.createElement("label");
  label.className = "transaction-label";
  label.setAttribute("for", "fbOrderNote");
  label.textContent = "Catatan Order";

  const note = document.createElement("textarea");
  note.className = "fb-order-note";
  note.id = "fbOrderNote";
  note.dataset.action = "update-fnb-order-note";
  note.placeholder = "Contoh: pedas sedikit, antar ke ruangan, tanpa es.";
  note.value = fnbOrderNote;

  control.append(label, note);

  return control;
}

function createLastFnbOrderElement(order, items) {
  const saved = document.createElement("section");
  saved.className = "fb-order-saved";
  saved.setAttribute("aria-labelledby", "fb-order-saved-title");

  const title = document.createElement("h3");
  title.className = "fb-order-saved-title";
  title.id = "fb-order-saved-title";
  title.textContent = "Order F&B Terakhir Tersimpan";

  const grid = document.createElement("div");
  grid.className = "fb-order-saved-grid";

  [
    ["ID Order", order?.order_id || "-"],
    ["Ruangan", order?.room_name || order?.room_id || "-"],
    ["Total Order", formatCurrency(order?.order_total)],
    ["Jumlah Item", `${Array.isArray(items) ? items.length : 0} item`],
    ["Status", getFnbOrderStatusLabel(order?.order_status)],
    ["Catatan", order?.note || "-"],
  ].forEach(([labelText, valueText]) => {
    const item = document.createElement("div");
    item.className = "fb-order-saved-item";

    const label = document.createElement("p");
    label.className = "fb-order-saved-label";
    label.textContent = labelText;

    const value = document.createElement("p");
    value.className = "fb-order-saved-value";
    value.textContent = valueText;

    item.append(label, value);
    grid.appendChild(item);
  });

  saved.append(title, grid);

  return saved;
}

function getFnbOrderStatusLabel(status) {
  if (status === "open") {
    return "Open";
  }

  if (status === "billed") {
    return "Billed";
  }

  if (status === "cancelled") {
    return "Dibatalkan";
  }

  return "Tidak Dikenal";
}

function getFnbOrderStatusClass(status) {
  if (status === "open" || status === "billed" || status === "cancelled") {
    return status;
  }

  return "unknown";
}

function createFbOrderActionsElement() {
  const actions = document.createElement("div");
  actions.className = "fb-order-actions";
  const selectedRoom = getSelectedFbRoom();
  const canSave =
    Boolean(selectedRoom) &&
    isFbOrderRoomSelectable(selectedRoom) &&
    fbCartItems.length > 0 &&
    !isSavingFnbOrder;

  const clearButton = document.createElement("button");
  clearButton.className = "fb-order-button";
  clearButton.type = "button";
  clearButton.dataset.action = "clear-fb-cart";
  clearButton.disabled = fbCartItems.length === 0;
  clearButton.textContent = "Kosongkan Keranjang";

  const saveButton = document.createElement("button");
  saveButton.className = canSave
    ? "fb-order-button primary"
    : "fb-order-button primary disabled";
  saveButton.type = "button";
  saveButton.dataset.action = "save-fnb-order";
  saveButton.disabled = !canSave;
  saveButton.textContent = isSavingFnbOrder ? "Menyimpan..." : "Simpan Order";

  actions.append(clearButton, saveButton);

  return actions;
}

function createOpenFnbOrdersPanelElement() {
  const panel = document.createElement("section");
  panel.className = "open-fnb-panel";
  panel.setAttribute("aria-labelledby", "open-fnb-title");

  const header = document.createElement("div");
  header.className = "open-fnb-header";

  const titleGroup = document.createElement("div");

  const title = document.createElement("h2");
  title.className = "open-fnb-title";
  title.id = "open-fnb-title";
  title.textContent = "Open Order F&B";

  const subtitle = document.createElement("p");
  subtitle.className = "open-fnb-subtitle";
  subtitle.textContent = "Pesanan makanan dan minuman yang belum masuk tagihan akhir.";

  titleGroup.append(title, subtitle);
  header.appendChild(titleGroup);

  const orders = getSelectedRoomOpenFnbOrders();
  const summary = calculateOpenFnbOrdersSummary(orders);
  const list = document.createElement("div");
  list.className = "open-fnb-list";

  if (isLoadingOpenFnbOrders) {
    list.appendChild(createStateMessage("Memuat open order F&B..."));
  } else if (orders.length === 0) {
    const empty = document.createElement("p");
    empty.className = "open-fnb-empty";
    empty.textContent = getOpenFnbEmptyMessage();
    list.appendChild(empty);
  } else {
    orders.forEach((order) => {
      list.appendChild(createOpenFnbOrderCardElement(order));
    });
  }

  panel.append(
    header,
    createOpenFnbSummaryElement(summary),
    createOpenFnbFilterNoteElement(),
    createOpenFnbActionsElement(),
    list
  );

  return panel;
}

function createOpenFnbSummaryElement(summary) {
  const grid = document.createElement("div");
  grid.className = "open-fnb-summary";

  [
    ["Total Order", Number(summary.total_orders) || 0],
    ["Total Item", Number(summary.total_items) || 0],
    ["Total F&B Open", formatCurrency(summary.total_amount)],
  ].forEach(([labelText, valueText]) => {
    const card = document.createElement("div");
    card.className = "open-fnb-summary-card";

    const label = document.createElement("p");
    label.className = "transaction-label";
    label.textContent = labelText;

    const value = document.createElement("p");
    value.className = "transaction-value";
    value.textContent = valueText;

    card.append(label, value);
    grid.appendChild(card);
  });

  return grid;
}

function createOpenFnbFilterNoteElement() {
  const note = document.createElement("p");
  note.className = "open-fnb-filter-note";

  const selectedRoom = getSelectedFbRoom();

  if (!selectedRoom) {
    note.textContent = "Menampilkan semua order F&B yang masih open.";
  } else if (isFbOrderRoomSelectable(selectedRoom)) {
    note.textContent = `Menampilkan order untuk sesi: ${selectedRoom.room_name}`;
  } else {
    note.textContent = "Ruangan belum memiliki sesi aktif.";
  }

  return note;
}

function createOpenFnbActionsElement() {
  const actions = document.createElement("div");
  actions.className = "open-fnb-actions";

  const refreshButton = document.createElement("button");
  refreshButton.className = "open-fnb-button";
  refreshButton.type = "button";
  refreshButton.dataset.action = "refresh-open-fnb-orders";
  refreshButton.disabled = isLoadingOpenFnbOrders;
  refreshButton.textContent = isLoadingOpenFnbOrders ? "Memuat..." : "Refresh Order F&B";

  actions.appendChild(refreshButton);

  return actions;
}

function createOpenFnbOrderCardElement(order) {
  const card = document.createElement("article");
  card.className = "open-fnb-card";

  const header = document.createElement("div");
  header.className = "open-fnb-card-header";

  const titleGroup = document.createElement("div");

  const orderId = document.createElement("h3");
  orderId.className = "open-fnb-order-id";
  orderId.textContent = order.order_id || "-";

  const meta = document.createElement("p");
  meta.className = "open-fnb-meta";
  meta.textContent = `${order.room_name || order.room_id || "-"} - Order: ${order.created_at || "-"} - Sesi: ${order.room_start_time || "-"}`;

  titleGroup.append(orderId, meta);

  const status = document.createElement("span");
  status.className = `open-fnb-status ${getFnbOrderStatusClass(order.order_status)}`;
  status.textContent = getFnbOrderStatusLabel(order.order_status);

  header.append(titleGroup, status);

  const actions = createFnbOrderCancelActionsElement(order);
  const total = document.createElement("p");
  total.className = "open-fnb-total";
  total.textContent = formatCurrency(order.order_total);

  const items = document.createElement("div");
  items.className = "open-fnb-items";

  (order.items || []).forEach((item) => {
    items.appendChild(createOpenFnbOrderItemElement(item));
  });

  card.append(header, actions, total);

  if (order.note) {
    const note = document.createElement("p");
    note.className = "open-fnb-note";
    note.textContent = order.note;
    card.appendChild(note);
  }

  card.appendChild(items);

  return card;
}

function createFnbOrderCancelActionsElement(order) {
  const actions = document.createElement("div");
  actions.className = "fnb-cancel-actions";

  const button = document.createElement("button");
  const canCancel = getFnbOrderCanCancel(order) && !isCancellingFnbOrder;

  button.className = canCancel
    ? "fnb-cancel-button"
    : "fnb-cancel-button disabled";
  button.type = "button";
  button.dataset.action = "cancel-fnb-order";
  button.dataset.orderId = order.order_id || "";
  button.disabled = !canCancel;
  button.textContent = isCancellingFnbOrder && getFnbOrderCanCancel(order)
    ? "Membatalkan..."
    : getFnbOrderCancelButtonLabel(order);

  actions.appendChild(button);

  return actions;
}

function createOpenFnbOrderItemElement(item) {
  const row = document.createElement("div");
  row.className = "open-fnb-item";

  const info = document.createElement("div");

  const name = document.createElement("p");
  name.className = "open-fnb-item-name";
  name.textContent = item.menu_name || "-";

  const meta = document.createElement("p");
  meta.className = "open-fnb-item-meta";
  meta.textContent = `${Number(item.quantity) || 0} x ${formatCurrency(item.price)}`;

  info.append(name, meta);

  const subtotal = document.createElement("p");
  subtotal.className = "open-fnb-total";
  subtotal.textContent = formatCurrency(item.subtotal);

  row.append(info, subtotal);

  return row;
}

function createTodayFnbOrdersPanelElement() {
  const panel = document.createElement("section");
  panel.className = "today-fnb-panel";
  panel.setAttribute("aria-labelledby", "today-fnb-title");

  const header = document.createElement("div");
  header.className = "today-fnb-header";

  const titleGroup = document.createElement("div");

  const title = document.createElement("h2");
  title.className = "today-fnb-title";
  title.id = "today-fnb-title";
  title.textContent = "Riwayat Order F&B Hari Ini";

  const subtitle = document.createElement("p");
  subtitle.className = "today-fnb-subtitle";
  subtitle.textContent = "Daftar pesanan makanan dan minuman hari ini.";

  titleGroup.append(title, subtitle);
  header.appendChild(titleGroup);

  const filteredOrders = getFilteredTodayFnbOrders();
  const summary = todayFnbOrderStatusFilter === "all" && todayFnbOrderRoomFilter === "all"
    ? todayFnbOrderSummary || calculateTodayFnbOrderSummary(filteredOrders)
    : calculateTodayFnbOrderSummary(filteredOrders);
  const list = document.createElement("div");
  list.className = "today-fnb-list";

  if (isLoadingTodayFnbOrders) {
    list.appendChild(createStateMessage("Memuat riwayat order F&B hari ini..."));
  } else if (filteredOrders.length === 0) {
    const empty = document.createElement("p");
    empty.className = "today-fnb-empty";
    empty.textContent = getTodayFnbEmptyMessage();
    list.appendChild(empty);
  } else {
    filteredOrders.forEach((order) => {
      list.appendChild(createTodayFnbOrderCardElement(order));
    });
  }

  panel.append(
    header,
    createTodayFnbSummaryElement(summary),
    createTodayFnbToolbarElement(),
    list
  );

  return panel;
}

function createTodayFnbSummaryElement(summary) {
  const grid = document.createElement("div");
  grid.className = "today-fnb-summary";

  [
    ["Total Order", Number(summary.total_orders) || 0],
    ["Open", Number(summary.open_orders) || 0],
    ["Billed", Number(summary.billed_orders) || 0],
    ["Dibatalkan", Number(summary.cancelled_orders) || 0],
    ["Nilai Batal", formatCurrency(summary.cancelled_amount)],
    ["Total F&B", formatCurrency(summary.total_amount)],
  ].forEach(([labelText, valueText]) => {
    const card = document.createElement("div");
    card.className = "today-fnb-summary-card";

    const label = document.createElement("p");
    label.className = "transaction-label";
    label.textContent = labelText;

    const value = document.createElement("p");
    value.className = "transaction-value";
    value.textContent = valueText;

    card.append(label, value);
    grid.appendChild(card);
  });

  return grid;
}

function createTodayFnbToolbarElement() {
  const toolbar = document.createElement("div");
  toolbar.className = "today-fnb-toolbar";

  const statusFilter = document.createElement("div");
  statusFilter.className = "today-fnb-filter";

  [
    ["all", "Semua"],
    ["open", "Open"],
    ["billed", "Billed"],
    ["cancelled", "Dibatalkan"],
  ].forEach(([status, labelText]) => {
    const button = document.createElement("button");
    button.className = status === todayFnbOrderStatusFilter
      ? "today-fnb-filter-button active"
      : "today-fnb-filter-button";
    button.type = "button";
    button.dataset.action = "filter-today-fnb-status";
    button.dataset.status = status;
    button.textContent = labelText;
    statusFilter.appendChild(button);
  });

  const roomFilter = document.createElement("select");
  roomFilter.className = "today-fnb-room-filter";
  roomFilter.dataset.action = "filter-today-fnb-room";

  const allRoomsOption = document.createElement("option");
  allRoomsOption.value = "all";
  allRoomsOption.textContent = "Semua Ruangan";
  roomFilter.appendChild(allRoomsOption);

  getTodayFnbRoomFilterOptions().forEach((room) => {
    const option = document.createElement("option");
    option.value = room.room_id;
    option.textContent = room.room_name || room.room_id;
    roomFilter.appendChild(option);
  });

  roomFilter.value = todayFnbOrderRoomFilter;

  const actions = document.createElement("div");
  actions.className = "today-fnb-actions";

  const refreshButton = document.createElement("button");
  refreshButton.className = "today-fnb-button";
  refreshButton.type = "button";
  refreshButton.dataset.action = "refresh-today-fnb-orders";
  refreshButton.disabled = isLoadingTodayFnbOrders;
  refreshButton.textContent = isLoadingTodayFnbOrders ? "Memuat..." : "Refresh Riwayat F&B";

  actions.appendChild(refreshButton);
  toolbar.append(statusFilter, roomFilter, actions);

  return toolbar;
}

function getTodayFnbRoomFilterOptions() {
  const roomMap = new Map();

  rooms.forEach((room) => {
    if (room.room_id) {
      roomMap.set(room.room_id, room.room_name || room.room_id);
    }
  });

  todayFnbOrders.forEach((order) => {
    if (order.room_id && !roomMap.has(order.room_id)) {
      roomMap.set(order.room_id, order.room_name || order.room_id);
    }
  });

  return [...roomMap.entries()]
    .map(([room_id, room_name]) => ({ room_id, room_name }))
    .sort((first, second) => first.room_name.localeCompare(second.room_name, "id"));
}

function createTodayFnbOrderCardElement(order) {
  const card = document.createElement("article");
  card.className = "today-fnb-card";

  const header = document.createElement("div");
  header.className = "today-fnb-card-header";

  const titleGroup = document.createElement("div");

  const orderId = document.createElement("h3");
  orderId.className = "today-fnb-order-id";
  orderId.textContent = order.order_id || "-";

  const meta = document.createElement("p");
  meta.className = "today-fnb-meta";
  meta.textContent = `${order.room_name || order.room_id || "-"} - Order: ${order.created_at || "-"} - Sesi: ${order.room_start_time || "-"}`;

  titleGroup.append(orderId, meta);

  const status = document.createElement("span");
  status.className = `today-fnb-status ${getFnbOrderStatusClass(order.order_status)}`;
  status.textContent = getFnbOrderStatusLabel(order.order_status);

  header.append(titleGroup, status);

  const actions = createFnbOrderCancelActionsElement(order);
  const total = document.createElement("p");
  total.className = "today-fnb-total";
  total.textContent = formatCurrency(order.order_total);

  const items = document.createElement("div");
  items.className = "today-fnb-items";

  (order.items || []).forEach((item) => {
    items.appendChild(createTodayFnbOrderItemElement(item));
  });

  card.append(header, actions, total);

  if (order.note) {
    const note = document.createElement("p");
    note.className = "today-fnb-note";
    note.textContent = order.note;
    card.appendChild(note);
  }

  if (order.order_status === "cancelled") {
    card.appendChild(createFnbCancelInfoElement(order));
  }

  card.appendChild(items);

  return card;
}

function createFnbCancelInfoElement(order) {
  const info = document.createElement("div");
  info.className = "fnb-cancel-info";

  const reason = document.createElement("p");
  reason.className = "fnb-cancel-reason";
  reason.textContent = `Alasan: ${order.cancel_reason || "Tanpa alasan"}`;

  const meta = document.createElement("p");
  meta.className = "fnb-cancel-meta";
  meta.textContent = `Dibatalkan oleh: ${order.cancelled_by || "-"} - Waktu batal: ${order.cancelled_at || "-"}`;

  info.append(reason, meta);

  return info;
}

function createTodayFnbOrderItemElement(item) {
  const row = document.createElement("div");
  row.className = "today-fnb-item";

  const info = document.createElement("div");

  const name = document.createElement("p");
  name.className = "today-fnb-item-name";
  name.textContent = item.menu_name || "-";

  const meta = document.createElement("p");
  meta.className = "today-fnb-item-meta";
  meta.textContent = `${Number(item.quantity) || 0} x ${formatCurrency(item.price)}`;

  info.append(name, meta);

  const subtotal = document.createElement("p");
  subtotal.className = "today-fnb-total";
  subtotal.textContent = formatCurrency(item.subtotal);

  row.append(info, subtotal);

  return row;
}

function getTodayFnbEmptyMessage() {
  if (todayFnbOrderStatusFilter === "open") {
    return "Tidak ada order F&B yang masih open.";
  }

  if (todayFnbOrderStatusFilter === "billed") {
    return "Belum ada order F&B yang sudah masuk tagihan.";
  }

  if (todayFnbOrderStatusFilter === "cancelled") {
    return "Belum ada order F&B yang dibatalkan.";
  }

  return "Belum ada order F&B hari ini.";
}

function createInventoryPanelElement() {
  const panel = document.createElement("section");
  panel.className = "inventory-panel";
  panel.setAttribute("aria-labelledby", "inventory-title");

  const header = document.createElement("div");
  header.className = "inventory-header";

  const titleGroup = document.createElement("div");

  const title = document.createElement("h2");
  title.className = "inventory-title";
  title.id = "inventory-title";
  title.textContent = "Stok F&B";

  const subtitle = document.createElement("p");
  subtitle.className = "inventory-subtitle";
  subtitle.textContent = "Pantauan stok dasar menu makanan dan minuman.";

  titleGroup.append(title, subtitle);

  const actions = document.createElement("div");
  actions.className = "inventory-actions";

  const refreshButton = document.createElement("button");
  refreshButton.className = "inventory-button";
  refreshButton.type = "button";
  refreshButton.dataset.action = "refresh-inventory";
  refreshButton.disabled = isLoadingInventory || !API_BASE_URL.trim();
  refreshButton.textContent = isLoadingInventory ? "Memuat..." : "Refresh Stok";

  actions.appendChild(refreshButton);
  header.append(titleGroup, actions);

  const list = document.createElement("div");
  list.className = "inventory-list";

  if (!API_BASE_URL.trim()) {
    list.appendChild(createStateMessage("Stok F&B hanya tersedia saat terhubung ke server."));
  } else if (isLoadingInventory) {
    list.appendChild(createStateMessage("Memuat stok F&B..."));
  } else if (inventoryItems.length === 0) {
    const empty = document.createElement("p");
    empty.className = "inventory-empty";
    empty.textContent = "Belum ada data stok F&B.";
    list.appendChild(empty);
  } else {
    inventoryItems.forEach((item) => {
      list.appendChild(createInventoryItemRowElement(item));
    });
  }

  panel.append(
    header,
    createInventorySummaryElement(),
    list,
    createStockAdjustmentPanelElement(),
    lastStockAdjustment ? createLastStockAdjustmentElement(lastStockAdjustment) : document.createDocumentFragment()
  );

  return panel;
}

function createInventorySummaryElement() {
  const summary = inventorySummary || {
    total_items: 0,
    safe_items: 0,
    low_items: 0,
    negative_items: 0,
  };
  const grid = document.createElement("div");
  grid.className = "inventory-summary";

  [
    ["Total Item", Number(summary.total_items) || 0],
    ["Aman", Number(summary.safe_items) || 0],
    ["Stok Rendah", Number(summary.low_items) || 0],
    ["Minus", Number(summary.negative_items) || 0],
  ].forEach(([labelText, valueText]) => {
    const card = document.createElement("div");
    card.className = "inventory-summary-card";

    const label = document.createElement("p");
    label.className = "transaction-label";
    label.textContent = labelText;

    const value = document.createElement("p");
    value.className = "transaction-value";
    value.textContent = valueText;

    card.append(label, value);
    grid.appendChild(card);
  });

  return grid;
}

function createInventoryItemRowElement(item) {
  const row = document.createElement("article");
  row.className = "inventory-row";

  const info = document.createElement("div");

  const name = document.createElement("h3");
  name.className = "inventory-name";
  name.textContent = item.stock_item_name || item.stock_item_id || "-";

  const meta = document.createElement("p");
  meta.className = "inventory-meta";
  meta.textContent = `${item.category || "-"} - Min stok: ${Number(item.min_stock) || 0}`;

  info.append(name, meta);

  const qty = document.createElement("p");
  qty.className = "inventory-qty";
  qty.textContent = `${Number(item.stock_qty) || 0} ${item.unit || ""}`.trim();

  const status = document.createElement("span");
  status.className = `inventory-status ${getInventoryStockStatusClass(item.stock_status)}`;
  status.textContent = getInventoryStockStatusLabel(item.stock_status);

  row.append(info, qty, status);

  return row;
}

function getInventoryStockStatusLabel(status) {
  if (status === "safe") {
    return "Aman";
  }

  if (status === "low") {
    return "Rendah";
  }

  if (status === "negative") {
    return "Minus";
  }

  return "Tidak Dikenal";
}

function getInventoryStockStatusClass(status) {
  if (status === "safe" || status === "low" || status === "negative") {
    return status;
  }

  return "unknown";
}

function createStockAdjustmentPanelElement() {
  const panel = document.createElement("section");
  panel.className = "stock-adjustment-panel";
  panel.setAttribute("aria-labelledby", "stock-adjustment-title");

  const title = document.createElement("h3");
  title.className = "stock-adjustment-title";
  title.id = "stock-adjustment-title";
  title.textContent = "Tambah / Koreksi Stok";

  const form = document.createElement("div");
  form.className = "stock-adjustment-form";

  const itemField = createStockAdjustmentFieldElement("Item Stok");
  const itemSelect = document.createElement("select");
  itemSelect.className = "stock-adjustment-select stock-adjustment-item";
  itemSelect.dataset.action = "update-stock-adjustment-item";
  itemSelect.disabled = !API_BASE_URL.trim() || isSavingStockAdjustment || inventoryItems.length === 0;

  const emptyItemOption = document.createElement("option");
  emptyItemOption.value = "";
  emptyItemOption.textContent = "Pilih item stok";
  itemSelect.appendChild(emptyItemOption);

  inventoryItems.forEach((item) => {
    const option = document.createElement("option");
    option.value = item.stock_item_id;
    option.textContent = `${item.stock_item_name || item.stock_item_id} (${Number(item.stock_qty) || 0} ${item.unit || ""})`.trim();
    itemSelect.appendChild(option);
  });

  itemSelect.value = stockAdjustmentForm.stock_item_id;
  itemField.appendChild(itemSelect);

  const typeField = createStockAdjustmentFieldElement("Jenis Perubahan");
  const typeSelect = document.createElement("select");
  typeSelect.className = "stock-adjustment-select stock-adjustment-type";
  typeSelect.dataset.action = "update-stock-adjustment-type";
  typeSelect.disabled = !API_BASE_URL.trim() || isSavingStockAdjustment;

  [
    ["restock", "Tambah Stok"],
    ["set_stock", "Koreksi Stok"],
  ].forEach(([value, labelText]) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = labelText;
    typeSelect.appendChild(option);
  });

  typeSelect.value = stockAdjustmentForm.adjustment_type;
  typeField.appendChild(typeSelect);

  const quantityField = createStockAdjustmentFieldElement(
    stockAdjustmentForm.adjustment_type === "restock" ? "Jumlah Ditambahkan" : "Stok Aktual"
  );
  const quantityInput = document.createElement("input");
  quantityInput.className = "stock-adjustment-input stock-adjustment-quantity";
  quantityInput.type = "number";
  quantityInput.min = stockAdjustmentForm.adjustment_type === "restock" ? "1" : "0";
  quantityInput.step = "1";
  quantityInput.dataset.action = "update-stock-adjustment-quantity";
  quantityInput.value = stockAdjustmentForm.quantity;
  quantityInput.disabled = !API_BASE_URL.trim() || isSavingStockAdjustment;
  quantityField.appendChild(quantityInput);

  const noteField = createStockAdjustmentFieldElement("Catatan");
  const noteInput = document.createElement("input");
  noteInput.className = "stock-adjustment-input stock-adjustment-note";
  noteInput.type = "text";
  noteInput.placeholder = "Contoh: Pembelian stok hari ini / Koreksi hasil cek fisik";
  noteInput.dataset.action = "update-stock-adjustment-note";
  noteInput.value = stockAdjustmentForm.note;
  noteInput.disabled = !API_BASE_URL.trim() || isSavingStockAdjustment;
  noteField.appendChild(noteInput);

  form.append(itemField, typeField, quantityField, noteField);

  const help = document.createElement("p");
  help.className = "stock-adjustment-help";
  help.textContent = stockAdjustmentForm.adjustment_type === "restock"
    ? "Jumlah akan ditambahkan ke stok saat ini."
    : "Stok akan disetel menjadi jumlah aktual yang diisi.";

  const actions = document.createElement("div");
  actions.className = "stock-adjustment-actions";

  const submitButton = document.createElement("button");
  submitButton.className = "stock-adjustment-button";
  submitButton.type = "button";
  submitButton.dataset.action = "submit-stock-adjustment";
  submitButton.disabled = !canSubmitStockAdjustment();
  submitButton.textContent = isSavingStockAdjustment ? "Menyimpan..." : "Simpan Perubahan Stok";

  const resetButton = document.createElement("button");
  resetButton.className = "stock-adjustment-button secondary";
  resetButton.type = "button";
  resetButton.dataset.action = "reset-stock-adjustment";
  resetButton.disabled = isSavingStockAdjustment;
  resetButton.textContent = "Reset";

  actions.append(submitButton, resetButton);
  panel.append(title, form, help, actions);

  return panel;
}

function createStockAdjustmentFieldElement(labelText) {
  const field = document.createElement("label");
  field.className = "stock-adjustment-field";

  const label = document.createElement("span");
  label.className = "stock-adjustment-label";
  label.textContent = labelText;

  field.appendChild(label);

  return field;
}

function createLastStockAdjustmentElement(adjustment) {
  const panel = document.createElement("section");
  panel.className = "last-stock-adjustment";
  panel.setAttribute("aria-labelledby", "last-stock-adjustment-title");

  const title = document.createElement("h3");
  title.className = "last-stock-adjustment-title";
  title.id = "last-stock-adjustment-title";
  title.textContent = "Perubahan Stok Terakhir";

  const grid = document.createElement("div");
  grid.className = "last-stock-adjustment-grid";
  const item = adjustment.stock_item || adjustment.item || {};
  const movement = adjustment.stock_movement || adjustment.movement || {};

  [
    ["Item Stok", item.stock_item_name || item.stock_item_id || "-"],
    ["Stok Sebelum", Number(movement.stock_before) || 0],
    ["Stok Sesudah", Number(movement.stock_after) || 0],
    ["Perubahan", Number(movement.qty_change) || 0],
    ["Jenis Movement", getStockMovementTypeLabel(movement.movement_type)],
    ["Catatan", movement.note || "-"],
  ].forEach(([labelText, valueText]) => {
    const card = document.createElement("div");
    card.className = "last-stock-adjustment-item";

    const label = document.createElement("p");
    label.className = "last-stock-adjustment-label";
    label.textContent = labelText;

    const value = document.createElement("p");
    value.className = "last-stock-adjustment-value";
    value.textContent = valueText;

    card.append(label, value);
    grid.appendChild(card);
  });

  panel.append(title, grid);

  return panel;
}

function getStockMovementTypeLabel(type) {
  if (type === "in") {
    return "Tambah Stok";
  }

  if (type === "adjustment") {
    return "Koreksi Stok";
  }

  return type || "-";
}

function getTodayStockMovementTypeLabel(type) {
  if (type === "in") {
    return "Masuk";
  }

  if (type === "out") {
    return "Keluar";
  }

  if (type === "adjustment") {
    return "Koreksi";
  }

  return type || "-";
}

function getTodayStockMovementReferenceLabel(referenceType) {
  if (referenceType === "transaction") {
    return "Transaksi";
  }

  if (referenceType === "manual_adjustment") {
    return "Manual";
  }

  return referenceType || "-";
}

function getTodayStockMovementTypeClass(type) {
  if (type === "in" || type === "out" || type === "adjustment") {
    return type;
  }

  return "unknown";
}

function getTodayStockMovementEmptyMessage() {
  if (!API_BASE_URL.trim()) {
    return "Riwayat mutasi stok hanya tersedia saat terhubung ke server.";
  }

  if (
    stockMovementItemFilter !== "all" ||
    stockMovementTypeFilter !== "all" ||
    stockMovementReferenceFilter !== "all"
  ) {
    return "Tidak ada mutasi stok hari ini untuk filter yang dipilih.";
  }

  return "Belum ada mutasi stok hari ini.";
}

function getStockMovementItemFilterOptions() {
  const itemMap = new Map();

  inventoryItems.forEach((item) => {
    if (item.stock_item_id) {
      itemMap.set(item.stock_item_id, item.stock_item_name || item.stock_item_id);
    }
  });

  todayStockMovements.forEach((movement) => {
    if (movement.stock_item_id && !itemMap.has(movement.stock_item_id)) {
      itemMap.set(movement.stock_item_id, movement.stock_item_name || movement.stock_item_id);
    }
  });

  return [...itemMap.entries()]
    .map(([stock_item_id, stock_item_name]) => ({ stock_item_id, stock_item_name }))
    .sort((first, second) => first.stock_item_name.localeCompare(second.stock_item_name, "id"));
}

function createTodayStockMovementsPanelElement() {
  const panel = document.createElement("section");
  panel.className = "stock-movements-panel";
  panel.setAttribute("aria-labelledby", "stock-movements-title");

  const header = document.createElement("div");
  header.className = "stock-movements-header";

  const titleGroup = document.createElement("div");

  const title = document.createElement("h2");
  title.className = "stock-movements-title";
  title.id = "stock-movements-title";
  title.textContent = "Riwayat Mutasi Stok Hari Ini";

  const subtitle = document.createElement("p");
  subtitle.className = "stock-movements-subtitle";
  subtitle.textContent = "Semua perubahan stok dari transaksi F&B, restock, dan koreksi manual.";

  titleGroup.append(title, subtitle);
  header.appendChild(titleGroup);

  const summary = todayStockMovementSummary || {
    total_movements: 0,
    total_in_qty: 0,
    total_out_qty: 0,
    total_adjustment_abs_qty: 0,
  };
  const list = document.createElement("div");
  list.className = "stock-movements-list";

  if (isLoadingStockMovements) {
    list.appendChild(createStateMessage("Memuat riwayat mutasi stok hari ini..."));
  } else if (todayStockMovements.length === 0) {
    const empty = document.createElement("p");
    empty.className = "stock-movements-empty";
    empty.textContent = getTodayStockMovementEmptyMessage();
    list.appendChild(empty);
  } else {
    todayStockMovements.forEach((movement) => {
      list.appendChild(createTodayStockMovementRowElement(movement));
    });
  }

  panel.append(
    header,
    createTodayStockMovementSummaryElement(summary),
    createTodayStockMovementToolbarElement(),
    list
  );

  return panel;
}

function createTodayStockMovementSummaryElement(summary) {
  const grid = document.createElement("div");
  grid.className = "stock-movements-summary";

  [
    ["Total Mutasi", Number(summary.total_movements) || 0],
    ["Total Masuk", Number(summary.total_in_qty) || 0],
    ["Total Keluar", Number(summary.total_out_qty) || 0],
    ["Total Koreksi", Number(summary.total_adjustment_abs_qty) || 0],
  ].forEach(([labelText, valueText]) => {
    const card = document.createElement("div");
    card.className = "stock-movements-summary-card";

    const label = document.createElement("p");
    label.className = "transaction-label";
    label.textContent = labelText;

    const value = document.createElement("p");
    value.className = "transaction-value";
    value.textContent = valueText;

    card.append(label, value);
    grid.appendChild(card);
  });

  return grid;
}

function createTodayStockMovementToolbarElement() {
  const toolbar = document.createElement("div");
  toolbar.className = "stock-movements-toolbar";

  const itemFilter = document.createElement("select");
  itemFilter.className = "stock-movements-item-filter";
  itemFilter.dataset.action = "filter-stock-movement-item";

  const allItemsOption = document.createElement("option");
  allItemsOption.value = "all";
  allItemsOption.textContent = "Semua Item";
  itemFilter.appendChild(allItemsOption);

  getStockMovementItemFilterOptions().forEach((item) => {
    const option = document.createElement("option");
    option.value = item.stock_item_id;
    option.textContent = item.stock_item_name || item.stock_item_id;
    itemFilter.appendChild(option);
  });

  itemFilter.value = stockMovementItemFilter;
  itemFilter.disabled = isLoadingStockMovements || !API_BASE_URL.trim();

  const typeFilter = document.createElement("div");
  typeFilter.className = "stock-movements-filter";

  [
    ["all", "Semua Jenis Mutasi"],
    ["in", "Masuk"],
    ["out", "Keluar"],
    ["adjustment", "Koreksi"],
  ].forEach(([movementType, labelText]) => {
    const button = document.createElement("button");
    button.className = movementType === stockMovementTypeFilter
      ? "stock-movements-filter-button active"
      : "stock-movements-filter-button";
    button.type = "button";
    button.dataset.action = "filter-stock-movement-type";
    button.dataset.movementType = movementType;
    button.textContent = labelText;
    typeFilter.appendChild(button);
  });

  const referenceFilter = document.createElement("div");
  referenceFilter.className = "stock-movements-filter";

  [
    ["all", "Semua Referensi"],
    ["transaction", "Transaksi"],
    ["manual_adjustment", "Manual Adjustment"],
  ].forEach(([referenceType, labelText]) => {
    const button = document.createElement("button");
    button.className = referenceType === stockMovementReferenceFilter
      ? "stock-movements-filter-button active"
      : "stock-movements-filter-button";
    button.type = "button";
    button.dataset.action = "filter-stock-movement-reference";
    button.dataset.referenceType = referenceType;
    button.textContent = labelText;
    referenceFilter.appendChild(button);
  });

  const actions = document.createElement("div");
  actions.className = "stock-movements-actions";

  const refreshButton = document.createElement("button");
  refreshButton.className = "stock-movements-button";
  refreshButton.type = "button";
  refreshButton.dataset.action = "refresh-stock-movements";
  refreshButton.disabled = isLoadingStockMovements || !API_BASE_URL.trim();
  refreshButton.textContent = isLoadingStockMovements ? "Memuat..." : "Refresh Mutasi Stok";

  actions.appendChild(refreshButton);
  toolbar.append(itemFilter, typeFilter, referenceFilter, actions);

  return toolbar;
}

function createTodayStockMovementRowElement(movement) {
  const row = document.createElement("article");
  row.className = "stock-movements-row";

  const header = document.createElement("div");
  header.className = "stock-movements-row-header";

  const titleGroup = document.createElement("div");

  const itemName = document.createElement("h3");
  itemName.className = "stock-movements-item-name";
  itemName.textContent = movement.stock_item_name || movement.stock_item_id || "-";

  const meta = document.createElement("p");
  meta.className = "stock-movements-meta";
  meta.textContent = `${movement.created_at || "-"} - ${movement.movement_id || "-"}`;

  titleGroup.append(itemName, meta);

  const badge = document.createElement("span");
  badge.className = `stock-movements-badge ${getTodayStockMovementTypeClass(movement.movement_type)}`;
  badge.textContent = getTodayStockMovementTypeLabel(movement.movement_type);

  header.append(titleGroup, badge);

  const details = document.createElement("div");
  details.className = "stock-movements-details";

  [
    ["Perubahan", String(Number(movement.qty_change) || 0)],
    ["Stok Sebelum", String(Number(movement.stock_before) || 0)],
    ["Stok Sesudah", String(Number(movement.stock_after) || 0)],
    ["Referensi", getTodayStockMovementReferenceLabel(movement.reference_type)],
    ["ID Referensi", movement.reference_id || "-"],
    ["Kasir", movement.cashier_name || "-"],
  ].forEach(([labelText, valueText]) => {
    const item = document.createElement("div");
    item.className = "stock-movements-detail-item";

    const label = document.createElement("p");
    label.className = "stock-movements-detail-label";
    label.textContent = labelText;

    const value = document.createElement("p");
    value.className = "stock-movements-detail-value";
    value.textContent = valueText;

    item.append(label, value);
    details.appendChild(item);
  });

  row.append(header, details);

  if (movement.note) {
    const note = document.createElement("p");
    note.className = "stock-movements-note";
    note.textContent = movement.note;
    row.appendChild(note);
  }

  return row;
}

function getOpenFnbEmptyMessage() {
  const selectedRoom = getSelectedFbRoom();

  if (!selectedRoom) {
    return "Belum ada open order F&B.";
  }

  if (!isFbOrderRoomSelectable(selectedRoom)) {
    return "Tidak ada sesi aktif untuk ruangan ini.";
  }

  return "Belum ada open order F&B untuk sesi ruangan ini.";
}

function renderTransactionHistory() {
  return createTransactionHistoryElement();
}

function createTransactionHistoryElement() {
  const history = document.createElement("section");
  history.className = "transaction-history";
  history.setAttribute("aria-labelledby", "transaction-history-title");

  const header = document.createElement("div");
  header.className = "transaction-history-header";

  const title = document.createElement("h2");
  title.id = "transaction-history-title";
  title.textContent = "Riwayat Transaksi Hari Ini";

  header.appendChild(title);

  const summary = todayTransactionSummary || {
    total_transactions: 0,
    paid_transactions: 0,
    unpaid_transactions: 0,
    total_revenue_paid: 0,
  };

  const summaryGrid = document.createElement("div");
  summaryGrid.className = "transaction-summary";

  [
    ["Total Transaksi", Number(summary.total_transactions) || 0],
    ["Sudah Lunas", Number(summary.paid_transactions) || 0],
    ["Belum Dibayar", Number(summary.unpaid_transactions) || 0],
    ["Omzet Lunas", formatCurrency(summary.total_revenue_paid)],
  ].forEach(([labelText, valueText]) => {
    const card = document.createElement("div");
    card.className = "transaction-summary-card";

    const label = document.createElement("p");
    label.className = "transaction-label";
    label.textContent = labelText;

    const value = document.createElement("p");
    value.className = "transaction-value";
    value.textContent = valueText;

    card.append(label, value);
    summaryGrid.appendChild(card);
  });

  const list = document.createElement("div");
  list.className = "transaction-list";
  const filteredTransactions = getFilteredTodayTransactions();

  if (filteredTransactions.length === 0) {
    const empty = document.createElement("p");
    empty.className = "state-message";
    empty.textContent = getEmptyTransactionMessage();
    list.appendChild(empty);
  } else {
    filteredTransactions.forEach((transaction) => {
      list.appendChild(createTransactionRowElement(transaction));
    });
  }

  history.append(
    header,
    summaryGrid,
    createCashierRevenueSummaryElement(calculateCashierRevenueSummary(todayTransactions)),
    createCashierClosingTriggerElement(),
    cashierClosingPreviewVisible
      ? createCashierClosingPreviewElement(calculateCashierClosingPreview(todayTransactions))
      : document.createDocumentFragment(),
    renderCashierClosingHistory(),
    closingPrintPreviewVisible && selectedClosingForPrint
      ? createClosingPrintPreviewElement(selectedClosingForPrint)
      : document.createDocumentFragment(),
    createTransactionFilterElement(),
    list
  );

  return history;
}

function createCashierClosingTriggerElement() {
  const actions = document.createElement("div");
  actions.className = "cashier-closing-actions";

  const button = document.createElement("button");
  button.className = "cashier-closing-button";
  button.type = "button";
  button.dataset.action = "show-closing-preview";
  button.textContent = "Preview Tutup Kasir";

  actions.appendChild(button);

  return actions;
}

function renderCashierClosingHistory() {
  return createCashierClosingHistoryElement();
}

function createCashierClosingHistoryElement() {
  const history = document.createElement("section");
  history.className = "cashier-closing-history";
  history.setAttribute("aria-labelledby", "cashier-closing-history-title");

  const header = document.createElement("div");
  header.className = "cashier-closing-history-header";

  const title = document.createElement("h3");
  title.className = "cashier-closing-history-title";
  title.id = "cashier-closing-history-title";
  title.textContent = "Riwayat Closing Hari Ini";

  header.appendChild(title);

  const list = document.createElement("div");
  list.className = "cashier-closing-history-list";

  if (todayCashierClosings.length === 0) {
    const empty = document.createElement("p");
    empty.className = "state-message";
    empty.textContent = "Belum ada closing kasir hari ini.";
    list.appendChild(empty);
  } else {
    todayCashierClosings.forEach((closing) => {
      list.appendChild(createCashierClosingRowElement(closing));
    });
  }

  history.append(header, list);

  return history;
}

function createClosingPrintPreviewElement(closing) {
  const print = document.createElement("section");
  print.className = "closing-print";
  print.setAttribute("aria-labelledby", "closing-print-title");

  const header = document.createElement("div");
  header.className = "closing-print-header";

  const title = document.createElement("h2");
  title.className = "closing-print-title";
  title.id = "closing-print-title";
  title.textContent = "Rekap Closing Kasir";

  const subtitle = document.createElement("p");
  subtitle.className = "closing-print-subtitle";
  subtitle.textContent = "Karaoke POS";

  header.append(title, subtitle);

  const identity = createClosingPrintSection("Data Closing", [
    ["ID Closing", closing?.closing_id || "-"],
    ["Tanggal Closing", closing?.closing_date || "-"],
    ["Waktu Closing", closing?.created_at || "-"],
    ["Kasir", closing?.cashier_name || "-"],
  ]);

  const transactionSummary = createClosingPrintSection("Ringkasan Transaksi", [
    ["Total Transaksi", `${Number(closing?.total_transactions) || 0} transaksi`],
    ["Transaksi Lunas", `${Number(closing?.paid_transactions) || 0} transaksi`],
    ["Belum Dibayar", `${Number(closing?.unpaid_transactions) || 0} transaksi`],
    ["Omzet Lunas", formatCurrency(closing?.paid_revenue)],
    ["Total Tagihan", formatCurrency(closing?.total_revenue)],
  ]);

  const paymentSummary = createClosingPrintSection("Pembayaran", [
    ["Cash Sistem", formatCurrency(closing?.cash_expected)],
    ["Cash Aktual", formatCurrency(closing?.cash_actual)],
    [
      "Selisih Cash",
      `${formatCurrency(closing?.cash_difference)} - ${getClosingHistoryDifferenceLabel(Number(closing?.cash_difference) || 0)}`,
    ],
    ["Transfer", formatCurrency(closing?.transfer_revenue)],
    ["Sisa Belum Dibayar", formatCurrency(closing?.unpaid_revenue)],
  ]);

  const noteSection = document.createElement("section");
  noteSection.className = "closing-print-section";

  const noteTitle = document.createElement("h3");
  noteTitle.textContent = "Catatan Kasir";

  const note = document.createElement("p");
  note.className = "closing-print-note";
  note.textContent = closing?.note || "-";

  noteSection.append(noteTitle, note);

  const footer = document.createElement("p");
  footer.className = "closing-print-note";
  footer.textContent = "Dicetak dari Dashboard Kasir Karaoke";

  const actions = document.createElement("div");
  actions.className = "closing-print-actions";

  const printButton = document.createElement("button");
  printButton.className = "closing-print-button";
  printButton.type = "button";
  printButton.dataset.action = "print-closing";
  printButton.textContent = "Cetak";

  const closeButton = document.createElement("button");
  closeButton.className = "closing-print-button secondary";
  closeButton.type = "button";
  closeButton.dataset.action = "hide-closing-print";
  closeButton.textContent = "Tutup Preview Cetak";

  actions.append(printButton, closeButton);
  print.append(header, identity, transactionSummary, paymentSummary, noteSection, footer, actions);

  return print;
}

function createClosingPrintSection(titleText, rows) {
  const section = document.createElement("section");
  section.className = "closing-print-section";

  const title = document.createElement("h3");
  title.textContent = titleText;

  const grid = document.createElement("div");
  grid.className = "closing-print-grid";

  rows.forEach(([labelText, valueText]) => {
    const row = document.createElement("div");
    row.className = "closing-print-row";

    const label = document.createElement("p");
    label.className = "closing-print-label";
    label.textContent = labelText;

    const value = document.createElement("p");
    value.className = "closing-print-value";
    value.textContent = valueText;

    row.append(label, value);
    grid.appendChild(row);
  });

  section.append(title, grid);

  return section;
}

function createCashierClosingRowElement(closing) {
  const row = document.createElement("article");
  row.className = "cashier-closing-history-row";

  [
    ["ID Closing", closing?.closing_id || "-"],
    ["Waktu Closing", closing?.created_at || "-"],
    ["Kasir", closing?.cashier_name || "-"],
    ["Omzet Lunas", formatCurrency(closing?.paid_revenue)],
    ["Cash Sistem", formatCurrency(closing?.cash_expected)],
    ["Cash Aktual", formatCurrency(closing?.cash_actual)],
    [
      "Selisih Cash",
      `${formatCurrency(closing?.cash_difference)} - ${getClosingHistoryDifferenceLabel(Number(closing?.cash_difference) || 0)}`,
    ],
    ["Transfer", formatCurrency(closing?.transfer_revenue)],
    ["Belum Dibayar", formatCurrency(closing?.unpaid_revenue)],
    ["Total Tagihan", formatCurrency(closing?.total_revenue)],
  ].forEach(([labelText, valueText]) => {
    const item = document.createElement("div");

    const label = document.createElement("p");
    label.className = "cashier-closing-history-label";
    label.textContent = labelText;

    const value = document.createElement("p");
    value.className = "cashier-closing-history-value";
    value.textContent = valueText;

    item.append(label, value);
    row.appendChild(item);
  });

  const noteItem = document.createElement("div");
  noteItem.className = "cashier-closing-history-note";

  const noteLabel = document.createElement("p");
  noteLabel.className = "cashier-closing-history-label";
  noteLabel.textContent = "Catatan";

  const noteValue = document.createElement("p");
  noteValue.className = "cashier-closing-history-value";
  noteValue.textContent = closing?.note || "-";

  noteItem.append(noteLabel, noteValue);
  row.appendChild(noteItem);

  const actionItem = document.createElement("div");
  actionItem.className = "cashier-closing-history-note";

  const actionButton = document.createElement("button");
  actionButton.className = "transaction-action-button";
  actionButton.type = "button";
  actionButton.dataset.action = "show-closing-print";
  actionButton.dataset.closingId = closing?.closing_id || "";
  actionButton.textContent = "Lihat / Cetak";

  actionItem.appendChild(actionButton);
  row.appendChild(actionItem);

  return row;
}

function getClosingHistoryDifferenceLabel(difference) {
  if (difference > 0) {
    return "Lebih";
  }

  if (difference < 0) {
    return "Kurang";
  }

  return "Sesuai";
}

function createTransactionFilterElement() {
  const filter = document.createElement("div");
  filter.className = "transaction-filter";
  filter.setAttribute("aria-label", "Filter riwayat transaksi");

  [
    ["all", "Semua"],
    ["paid", "Lunas"],
    ["unpaid", "Belum Dibayar"],
  ].forEach(([value, labelText]) => {
    const button = document.createElement("button");
    button.className =
      value === transactionHistoryFilter
        ? "transaction-filter-button active"
        : "transaction-filter-button";
    button.type = "button";
    button.dataset.action = "filter-transactions";
    button.dataset.filter = value;
    button.textContent = labelText;
    filter.appendChild(button);
  });

  return filter;
}

function createTransactionRowElement(transaction) {
  const row = document.createElement("article");
  row.className = "transaction-row";
  row.dataset.transactionId = transaction?.transaction_id || "";

  const statusClass =
    transaction?.payment_status === "paid"
      ? "transaction-status-paid"
      : "transaction-status-unpaid";

  [
    ["ID Transaksi", transaction?.transaction_id || "-"],
    ["Ruangan", transaction?.room_name || transaction?.room_id || "-"],
    ["Durasi", `${Number(transaction?.duration_minutes) || 0} menit`],
    ["Biaya Room", formatCurrency(getTransactionRoomTotal(transaction))],
    ["F&B", formatCurrency(getTransactionFnbTotal(transaction))],
    ["Total Akhir", formatCurrency(getTransactionFinalTotal(transaction)), getTransactionFnbTotal(transaction) > 0 ? "transaction-has-fnb" : ""],
    ["Status", formatPaymentStatusLabel(transaction?.payment_status), statusClass],
    ["Metode Bayar", formatPaymentMethodLabel(transaction?.payment_method)],
    ["Aksi", "", "transaction-actions-cell"],
  ].forEach(([labelText, valueText, modifierClass]) => {
    const item = document.createElement("div");
    item.className = modifierClass
      ? `transaction-cell ${modifierClass}`
      : "transaction-cell";

    const label = document.createElement("p");
    label.className = "transaction-label";
    label.textContent = labelText;

    if (modifierClass === "transaction-actions-cell") {
      item.append(label, createTransactionActionsElement(transaction));
    } else {
      const value = document.createElement("p");
      value.className = "transaction-value";
      value.textContent = valueText;
      item.append(label, value);

      if (modifierClass === "transaction-has-fnb") {
        const badge = document.createElement("span");
        badge.className = "transaction-fnb-badge";
        badge.textContent = "Termasuk F&B";
        item.appendChild(badge);
      }
    }

    row.appendChild(item);
  });

  return row;
}

function createTransactionActionsElement(transaction) {
  const actions = document.createElement("div");
  actions.className = "transaction-actions";

  const summaryButton = document.createElement("button");
  summaryButton.className = "transaction-action-button";
  summaryButton.type = "button";
  summaryButton.dataset.action = "show-transaction-summary";
  summaryButton.dataset.transactionId = transaction?.transaction_id || "";
  summaryButton.textContent = "Lihat Ringkasan";
  actions.appendChild(summaryButton);

  if (transaction?.payment_status !== "unpaid") {
    return actions;
  }

  const payControl = document.createElement("div");
  payControl.className = "transaction-pay-control";

  const select = document.createElement("select");
  select.className = "transaction-pay-select";

  [
    ["cash", "Cash"],
    ["transfer", "Transfer"],
  ].forEach(([value, text]) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = text;
    select.appendChild(option);
  });

  const payButton = document.createElement("button");
  payButton.className = "transaction-pay-button";
  payButton.type = "button";
  payButton.dataset.action = "mark-history-paid";
  payButton.dataset.transactionId = transaction?.transaction_id || "";
  payButton.textContent = "Tandai Lunas";

  payControl.append(select, payButton);
  actions.appendChild(payControl);

  return actions;
}

function renderRooms() {
  const fragment = document.createDocumentFragment();

  if (errorMessage) {
    fragment.appendChild(createStateMessage(errorMessage, "error"));
  }

  if (noticeMessage) {
    fragment.appendChild(createStateMessage(noticeMessage, noticeType));
  }

  if (stockWarningMessages.length > 0) {
    fragment.appendChild(createStockWarningListElement(stockWarningMessages));
  }

  if (lastTransaction) {
    fragment.appendChild(createBillingSummaryElement(lastTransaction));
  }

  if (receiptPrintVisible && selectedReceiptTransaction) {
    fragment.appendChild(createReceiptPrintElement(selectedReceiptTransaction));
  }

  if (roomsLoading) {
    fragment.appendChild(createStateMessage("Memuat data ruangan..."));
  } else {
    rooms.forEach((room) => {
      fragment.appendChild(createRoomCard(room));
    });
  }

  fragment.appendChild(createMenuPanelElement());
  fragment.appendChild(createFbOrderPanelElement());
  fragment.appendChild(createOpenFnbOrdersPanelElement());
  fragment.appendChild(createTodayFnbOrdersPanelElement());
  fragment.appendChild(createInventoryPanelElement());
  fragment.appendChild(createTodayStockMovementsPanelElement());

  try {
    fragment.appendChild(renderTransactionHistory());
  } catch (error) {
    console.warn("Gagal merender riwayat transaksi.", error);
    fragment.appendChild(createStateMessage("Riwayat transaksi gagal ditampilkan.", "error"));
  }

  roomsGrid.replaceChildren(fragment);
}

function updateRunningTimers() {
  const occupiedCards = roomsGrid.querySelectorAll(".room-card.occupied");

  occupiedCards.forEach((card) => {
    const timer = card.querySelector(".room-countdown-value");

    if (!timer) {
      return;
    }

    const badge = card.querySelector("[data-role='time-status-badge']");

    if (timer.dataset.scheduledEndTime) {
      const remainingTime = new Date(timer.dataset.scheduledEndTime).getTime() - Date.now();
      const status = getRemainingTimeStatus(remainingTime);

      timer.textContent = formatRemainingCountdown(remainingTime);
      timer.classList.toggle("expired", status === "expired");
      timer.classList.toggle("warning", status === "warning");
      applyRoomTimeVisualState(card, status);
      updateRoomTimeBadge(badge, status);
      return;
    }

    applyRoomTimeVisualState(card, "legacy");
    updateRoomTimeBadge(badge, "legacy");
    timer.classList.remove("expired", "warning");
    timer.textContent = timer.dataset.startTime
      ? formatDuration(getElapsedSeconds(timer.dataset.startTime))
      : "Durasi belum diset";
  });
}

function showDurationSelection(roomId) {
  durationSelectionRoomId = roomId;
  customDurationMinutes = "";
  renderRooms();
}

function cancelDurationSelection() {
  durationSelectionRoomId = "";
  customDurationMinutes = "";
  renderRooms();
}

function updateCustomDuration(value) {
  customDurationMinutes = value;
}

function showExtendSelection(roomId) {
  extendSelectionRoomId = roomId;
  customExtendMinutes = "";
  renderRooms();
}

function cancelExtendSelection() {
  extendSelectionRoomId = "";
  customExtendMinutes = "";
  renderRooms();
}

function updateCustomExtendMinutes(value) {
  customExtendMinutes = value;
}

function getExtendSuccessMessage(roomName, addMinutes) {
  const minutes = Number(addMinutes) || 0;

  if (minutes === 30) {
    return `Waktu ${roomName} berhasil ditambah 30 menit.`;
  }

  if (minutes === 60) {
    return `Waktu ${roomName} berhasil ditambah 1 jam.`;
  }

  if (minutes === 120) {
    return `Waktu ${roomName} berhasil ditambah 2 jam.`;
  }

  return `Waktu ${roomName} berhasil ditambah ${formatDurationMinutes(minutes)}.`;
}

async function extendSession(roomId, addMinutes) {
  if (!API_BASE_URL.trim()) {
    showInlineNotice("API belum dikonfigurasi. Isi URL server dulu di config.js.", "error");
    return;
  }

  const selectedMinutes = Number(addMinutes);

  if (!Number.isFinite(selectedMinutes) || selectedMinutes <= 0) {
    showInlineNotice("Tambahan waktu wajib berupa angka positif.", "error");
    return;
  }

  if (selectedMinutes < 15) {
    showInlineNotice("Tambahan waktu minimal 15 menit.", "error");
    return;
  }

  const room = rooms.find((item) => item.room_id === roomId);
  const roomName = room?.room_name || "ruangan";

  isExtendingSession = true;
  setActionButtonsDisabled(true);
  renderRooms();

  try {
    const data = await postApiAction({
      action: "extendSession",
      room_id: roomId,
      add_minutes: selectedMinutes,
      cashier_name: "Kasir",
    });

    if (!data || data.ok !== true) {
      throw new Error(data?.error || "Gagal menambah waktu sesi.");
    }

    showInlineNotice(getExtendSuccessMessage(roomName, selectedMinutes));
    extendSelectionRoomId = "";
    customExtendMinutes = "";
    await loadRooms();
  } catch (error) {
    showInlineNotice(error.message || "Gagal menambah waktu sesi.", "error");
  } finally {
    isExtendingSession = false;
    setActionButtonsDisabled(false);
  }
}

async function startSession(roomId, durationMinutes) {
  if (!API_BASE_URL.trim()) {
    showInlineNotice("API belum dikonfigurasi. Isi URL server dulu di config.js.", "error");
    return;
  }

  const selectedDuration = Number(durationMinutes);

  if (!Number.isFinite(selectedDuration) || selectedDuration <= 0) {
    showInlineNotice("Durasi wajib berupa angka positif.", "error");
    return;
  }

  if (selectedDuration < 15) {
    showInlineNotice("Durasi minimal 15 menit.", "error");
    return;
  }

  setActionButtonsDisabled(true);

  try {
    const data = await postApiAction({
      action: "startSession",
      room_id: roomId,
      duration_minutes: selectedDuration,
    });

    if (!data || data.ok !== true) {
      throw new Error(data?.error || "Gagal memulai sesi.");
    }

    showInlineNotice("Sesi berhasil dimulai.");
    durationSelectionRoomId = "";
    customDurationMinutes = "";
    await loadRooms();
  } catch (error) {
    showInlineNotice(error.message || "Gagal memulai sesi.", "error");
  } finally {
    setActionButtonsDisabled(false);
  }
}

async function closeSession(roomId) {
  if (!API_BASE_URL.trim()) {
    showInlineNotice("API belum dikonfigurasi. Isi URL server dulu di config.js.", "error");
    return;
  }

  setActionButtonsDisabled(true);

  try {
    const data = await postApiAction({
      action: "closeSession",
      room_id: roomId,
      cashier_name: "Kasir",
    });

    if (!data || data.ok !== true) {
      throw new Error(data?.error || "Gagal menyelesaikan sesi.");
    }

    const transaction = {
      ...(data.transaction || {}),
      fnb_orders: Array.isArray(data.fnb_orders) ? data.fnb_orders : [],
      stock_movements: Array.isArray(data.stock_movements) ? data.stock_movements : [],
    };
    stockWarningMessages = Array.isArray(data.stock_warnings) ? data.stock_warnings : [];

    if (transaction.transaction_id && transaction.fnb_orders.length > 0) {
      transactionFnbDetails[transaction.transaction_id] = transaction.fnb_orders;
    }

    showInlineNotice("Sesi berhasil diselesaikan.");
    showBillingSummary(transaction);
    await loadRooms();
    await loadOpenFnbOrders();
    await loadTodayFnbOrders();
    await loadInventoryItems();
    await loadTodayTransactions();
  } catch (error) {
    showInlineNotice(error.message || "Gagal menyelesaikan sesi.", "error");
  } finally {
    setActionButtonsDisabled(false);
  }
}

async function markTransactionPaid(transactionId, paymentMethod, options = {}) {
  if (!API_BASE_URL.trim()) {
    showInlineNotice("API belum dikonfigurasi. Isi URL server dulu di config.js.", "error");
    return;
  }

  setActionButtonsDisabled(true);

  try {
    const data = await postApiAction({
      action: "markTransactionPaid",
      transaction_id: transactionId,
      payment_method: paymentMethod,
    });

    if (!data || data.ok !== true) {
      throw new Error(data?.error || "Gagal menandai pembayaran lunas.");
    }

    if (
      options.updateBillingSummary ||
      lastTransaction?.transaction_id === data.transaction?.transaction_id
    ) {
      lastTransaction = data.transaction || lastTransaction;
    }

    showInlineNotice("Pembayaran berhasil ditandai lunas.");
    await loadTodayTransactions();
  } catch (error) {
    showInlineNotice(error.message || "Gagal menandai pembayaran lunas.", "error");
  } finally {
    setActionButtonsDisabled(false);
  }
}

async function saveCashierClosing() {
  if (!API_BASE_URL.trim()) {
    showInlineNotice("API belum dikonfigurasi. Isi URL server dulu di config.js.", "error");
    return;
  }

  if (hasTodayCashierClosing()) {
    showInlineNotice("Closing kasir hari ini sudah tersimpan.", "error");
    return;
  }

  if (isSavingCashierClosing) {
    return;
  }

  isSavingCashierClosing = true;
  renderRooms();

  try {
    const data = await postApiAction({
      action: "saveCashierClosing",
      cash_actual: Number(cashierClosingCashActual || 0),
      note: cashierClosingNote,
      cashier_name: "Kasir",
    });

    if (!data || data.ok !== true) {
      throw new Error(data?.error || "Gagal menyimpan closing kasir.");
    }

    lastCashierClosing = data.closing || null;
    showInlineNotice("Closing kasir berhasil disimpan.");
    await loadTodayCashierClosings();
  } catch (error) {
    showInlineNotice(error.message || "Gagal menyimpan closing kasir.", "error");
  } finally {
    isSavingCashierClosing = false;
    renderRooms();
  }
}

async function postApiAction(payload) {
  const response = await fetch(API_BASE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=utf-8",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Permintaan gagal dengan status ${response.status}.`);
  }

  return response.json();
}

function formatCurrency(value) {
  return currencyFormatter.format(Number(value) || 0);
}

function setActionButtonsDisabled(isDisabled) {
  roomsGrid
    .querySelectorAll(
      ".room-button, .billing-payment-button, .transaction-filter-button, .transaction-action-button, .transaction-pay-button"
        + ", .cashier-closing-button, .today-fnb-button, .today-fnb-filter-button, .fnb-cancel-button, .inventory-button"
        + ", .stock-adjustment-button, .duration-option-button, .duration-custom-button, .duration-cancel-button"
        + ", .room-button-extend, .extend-option-button, .extend-custom-button, .extend-cancel-button"
    )
    .forEach((button) => {
      button.disabled = isDisabled;
    });
}

async function handleRoomAction(event) {
  const button = event.target.closest("[data-action]");

  if (!button) {
    return;
  }

  const card = button.closest(".room-card");
  const action = button.dataset.action;
  const roomId = card?.dataset.roomId;

  if (action === "close-billing-summary") {
    clearBillingSummary();
    return;
  }

  if (action === "show-receipt-print") {
    showReceiptPrint(lastTransaction);
    return;
  }

  if (action === "hide-receipt-print") {
    hideReceiptPrint();
    return;
  }

  if (action === "print-receipt") {
    printReceipt();
    return;
  }

  if (action === "show-closing-preview") {
    showCashierClosingPreview();
    return;
  }

  if (action === "hide-closing-preview") {
    hideCashierClosingPreview();
    return;
  }

  if (action === "show-closing-print") {
    showClosingPrintPreview(button.dataset.closingId || "");
    return;
  }

  if (action === "hide-closing-print") {
    hideClosingPrintPreview();
    return;
  }

  if (action === "print-closing") {
    printSelectedClosing();
    return;
  }

  if (action === "save-cashier-closing") {
    await saveCashierClosing();
    return;
  }

  if (action === "mark-paid") {
    const summary = button.closest(".billing-summary");
    const transactionId = button.dataset.transactionId || summary?.dataset.transactionId || "";
    const paymentMethod = summary?.querySelector(".billing-payment-select")?.value || "";

    await markTransactionPaid(transactionId, paymentMethod, { updateBillingSummary: true });
    return;
  }

  if (action === "filter-transactions") {
    setTransactionHistoryFilter(button.dataset.filter || "all");
    return;
  }

  if (action === "filter-menu-category") {
    setMenuCategoryFilter(button.dataset.category || "all");
    return;
  }

  if (action === "add-menu-to-cart") {
    addMenuItemToCart(button.dataset.menuId || "");
    return;
  }

  if (action === "increase-cart-item") {
    increaseCartItemQuantity(button.dataset.menuId || "");
    return;
  }

  if (action === "decrease-cart-item") {
    decreaseCartItemQuantity(button.dataset.menuId || "");
    return;
  }

  if (action === "remove-cart-item") {
    removeCartItem(button.dataset.menuId || "");
    return;
  }

  if (action === "clear-fb-cart") {
    clearFbCart();
    return;
  }

  if (action === "save-fnb-order") {
    await saveFnbOrder();
    return;
  }

  if (action === "refresh-open-fnb-orders") {
    await loadOpenFnbOrders();
    return;
  }

  if (action === "refresh-today-fnb-orders") {
    await loadTodayFnbOrders();
    return;
  }

  if (action === "refresh-inventory") {
    await loadInventoryItems();
    return;
  }

  if (action === "refresh-stock-movements") {
    await loadTodayStockMovements();
    return;
  }

  if (action === "submit-stock-adjustment") {
    await submitStockAdjustment();
    return;
  }

  if (action === "reset-stock-adjustment") {
    resetStockAdjustmentForm();
    return;
  }

  if (action === "cancel-fnb-order") {
    requestCancelFnbOrder(button.dataset.orderId || "");
    return;
  }

  if (action === "filter-today-fnb-status") {
    setTodayFnbOrderStatusFilter(button.dataset.status || "all");
    return;
  }

  if (action === "filter-stock-movement-type") {
    setStockMovementTypeFilter(button.dataset.movementType || "all");
    return;
  }

  if (action === "filter-stock-movement-reference") {
    setStockMovementReferenceFilter(button.dataset.referenceType || "all");
    return;
  }

  if (action === "show-transaction-summary") {
    showTransactionFromHistory(button.dataset.transactionId || "");
    return;
  }

  if (action === "mark-history-paid") {
    const row = button.closest(".transaction-row");
    const transactionId = button.dataset.transactionId || row?.dataset.transactionId || "";
    const paymentMethod = row?.querySelector(".transaction-pay-select")?.value || "";

    await markTransactionPaid(transactionId, paymentMethod);
    return;
  }

  if (action === "start-session-duration") {
    await startSession(button.dataset.roomId || "", Number(button.dataset.durationMinutes));
    return;
  }

  if (action === "start-session-custom-duration") {
    const selectedDuration = Number(customDurationMinutes);

    if (!Number.isFinite(selectedDuration) || selectedDuration <= 0) {
      showInlineNotice("Isi durasi custom terlebih dahulu.", "error");
      return;
    }

    if (selectedDuration < 15) {
      showInlineNotice("Durasi minimal 15 menit.", "error");
      return;
    }

    await startSession(button.dataset.roomId || "", selectedDuration);
    return;
  }

  if (action === "cancel-duration-selection") {
    cancelDurationSelection();
    return;
  }

  if (action === "show-extend-selection") {
    showExtendSelection(button.dataset.roomId || roomId || "");
    return;
  }

  if (action === "extend-session-duration") {
    await extendSession(button.dataset.roomId || "", Number(button.dataset.addMinutes));
    return;
  }

  if (action === "extend-session-custom-duration") {
    const selectedMinutes = Number(customExtendMinutes);

    if (!Number.isFinite(selectedMinutes) || selectedMinutes <= 0) {
      showInlineNotice("Isi tambahan waktu custom terlebih dahulu.", "error");
      return;
    }

    if (selectedMinutes < 15) {
      showInlineNotice("Tambahan waktu minimal 15 menit.", "error");
      return;
    }

    await extendSession(button.dataset.roomId || "", selectedMinutes);
    return;
  }

  if (action === "cancel-extend-selection") {
    cancelExtendSelection();
    return;
  }

  console.log("Aksi ruangan:", {
    action,
    room_id: roomId,
  });

  if (action !== "toggle-session") {
    return;
  }

  const room = rooms.find((item) => item.room_id === roomId);

  if (!room) {
    showInlineNotice("Ruangan tidak ditemukan.", "error");
    return;
  }

  if (room.status === "available") {
    showDurationSelection(roomId);
    return;
  }

  if (room.status === "occupied") {
    await closeSession(roomId);
    return;
  }

  if (room.status === "maintenance") {
    showInlineNotice("Ruangan sedang dalam perbaikan.", "error");
    return;
  }

  showInlineNotice("Status ruangan tidak dikenal.", "error");
}

function handleDashboardInput(event) {
  const field = event.target.closest("[data-action]");

  if (!field) {
    return;
  }

  const action = field.dataset.action;

  if (action === "update-cash-actual") {
    updateCashierClosingCashActual(field.value);
    return;
  }

  if (action === "update-closing-note") {
    updateCashierClosingNote(field.value);
    return;
  }

  if (action === "search-menu") {
    setMenuSearchQuery(field.value);
    return;
  }

  if (action === "update-fnb-order-note") {
    updateFnbOrderNote(field.value);
    return;
  }

  if (action === "update-custom-duration") {
    updateCustomDuration(field.value);
    return;
  }

  if (action === "update-custom-extend") {
    updateCustomExtendMinutes(field.value);
    return;
  }

  if (action === "update-stock-adjustment-quantity") {
    updateStockAdjustmentForm("quantity", field.value);
    focusStockAdjustmentField(".stock-adjustment-quantity");
    return;
  }

  if (action === "update-stock-adjustment-note") {
    updateStockAdjustmentForm("note", field.value);
    focusStockAdjustmentField(".stock-adjustment-note");
  }
}

function handleDashboardChange(event) {
  const roomSelect = event.target.closest(".fb-room-select");

  if (roomSelect) {
    setSelectedFbRoom(roomSelect.value);
    return;
  }

  const todayFnbRoomSelect = event.target.closest(".today-fnb-room-filter");

  if (todayFnbRoomSelect) {
    setTodayFnbOrderRoomFilter(todayFnbRoomSelect.value);
    return;
  }

  const stockAdjustmentItem = event.target.closest(".stock-adjustment-item");

  if (stockAdjustmentItem) {
    updateStockAdjustmentForm("stock_item_id", stockAdjustmentItem.value);
    return;
  }

  const stockAdjustmentType = event.target.closest(".stock-adjustment-type");

  if (stockAdjustmentType) {
    updateStockAdjustmentForm("adjustment_type", stockAdjustmentType.value);
    return;
  }

  const stockMovementItemFilterSelect = event.target.closest(".stock-movements-item-filter");

  if (stockMovementItemFilterSelect) {
    setStockMovementItemFilter(stockMovementItemFilterSelect.value);
  }
}

roomsGrid.addEventListener("click", handleRoomAction);
roomsGrid.addEventListener("input", handleDashboardInput);
roomsGrid.addEventListener("change", handleDashboardChange);
initializeDashboard();
setInterval(updateRunningTimers, 1000);

async function initializeDashboard() {
  renderRooms();
  loadMenuItems();
  loadOpenFnbOrders();
  loadInventoryItems();
  await loadRooms();
  await Promise.all([
    loadTodayFnbOrders(),
    loadTodayStockMovements(),
    loadTodayTransactions(),
    loadTodayCashierClosings(),
  ]);
}
