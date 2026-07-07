/*
  Renderer utama dashboard.
  File ini memuat data ruangan, merender kartu, dan memperbarui timer ruangan terisi.

  TODO: Isi API_BASE_URL di config.js dengan URL Web App Google Apps Script
  agar action=getRooms menggantikan sumber data contoh di production.
*/

import { API_BASE_URL } from "./config.js";
import { rooms as mockRooms } from "./mock-data.js";

const dashboardShell = document.querySelector(".dashboard-shell");
const dashboardGlobal = document.querySelector("#dashboardGlobal");
const appTabsNav = document.querySelector("#appTabs");
const dashboardPanels = document.querySelector("#dashboardPanels");
const appHeader = document.querySelector(".app-header");
const DASHBOARD_TAB_STORAGE_KEY = "karaoke_active_dashboard_tab";
const OPERATOR_SESSION_STORAGE_KEY = "karaoke_operator_session";
const DASHBOARD_TABS = [
  { key: "rooms", label: "Ruangan" },
  { key: "fnb", label: "F&B" },
  { key: "stock", label: "Stok" },
  { key: "reports", label: "Laporan" },
  { key: "transactions", label: "Transaksi" },
  { key: "audit", label: "Audit" },
  { key: "settings", label: "Pengaturan" },
];
const dataSourceBadge = document.querySelector("#dataSourceBadge");
const currencyFormatter = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});
const ROOM_WARNING_SOUND_DURATION_MS = 180;
const ROOM_WARNING_SOUND_FREQUENCY_HZ = 880;

let rooms = [];
let errorMessage = "";
let noticeMessage = "";
let noticeType = "info";
let lastTransaction = null;
let todayTransactions = [];
let todayTransactionSummary = null;
let transactionHistoryFilter = "all";
let transactionPeriodFilter = "today";
let transactionCustomStartDate = "";
let transactionCustomEndDate = "";
let transactionPeriodNotice = "";
let roomWarningStateInitialized = false;
let previousWarningRoomIds = new Set();
let roomWarningAudioContext = null;
let roomWarningAudioUnlocked = false;
let pendingRoomWarningSound = false;
let hasWarnedRoomWarningAudio = false;
const TRANSACTION_PERIOD_OPTIONS = [
  ["today", "Shift Aktif"],
  ["yesterday", "Shift Kemarin"],
  ["last7days", "7 Shift"],
  ["thisMonth", "Bulan Ini"],
  ["all", "Semua"],
  ["custom", "Custom"],
];

const OPERATIONAL_SHIFT_NOTE =
  "Tanggal operasional mengikuti cutoff jam 10:00. Transaksi sebelum pukul 10:00 masuk shift hari sebelumnya.";

function loadOperatorSession() {
  try {
    const savedOperator = sessionStorage.getItem(OPERATOR_SESSION_STORAGE_KEY);

    if (!savedOperator) {
      return null;
    }

    const parsedOperator = JSON.parse(savedOperator);

    if (!parsedOperator || !parsedOperator.employee_id || !parsedOperator.employee_name || !parsedOperator.role) {
      sessionStorage.removeItem(OPERATOR_SESSION_STORAGE_KEY);
      return null;
    }

    return {
      employee_id: String(parsedOperator.employee_id),
      employee_name: String(parsedOperator.employee_name),
      role: String(parsedOperator.role),
    };
  } catch (error) {
    sessionStorage.removeItem(OPERATOR_SESSION_STORAGE_KEY);
    return null;
  }
}

function saveOperatorSession(operator) {
  const safeOperator = {
    employee_id: String(operator?.employee_id || ""),
    employee_name: String(operator?.employee_name || ""),
    role: String(operator?.role || ""),
  };

  sessionStorage.setItem(OPERATOR_SESSION_STORAGE_KEY, JSON.stringify(safeOperator));
  currentOperator = safeOperator;
}

function clearOperatorSession() {
  sessionStorage.removeItem(OPERATOR_SESSION_STORAGE_KEY);
  currentOperator = null;
  loginPin = "";
  loginErrorMessage = "";
  dashboardDataInitialized = false;
}

function isOperatorLoggedIn() {
  return Boolean(currentOperator?.employee_id && currentOperator?.employee_name && currentOperator?.role);
}

function getLoggedInOperatorName() {
  const currentName = String(currentOperator?.employee_name || "").trim();

  if (currentName) {
    return currentName;
  }

  const savedOperator = loadOperatorSession();
  const savedName = String(savedOperator?.employee_name || "").trim();

  if (savedName) {
    currentOperator = savedOperator;
    return savedName;
  }

  return "Kasir";
}

function buildActiveShiftQueryParams() {
  const params = new URLSearchParams();
  params.set("period", "today");
  return params;
}

function createOperationalShiftNoteElement(className = "operational-date-note") {
  const note = document.createElement("p");
  note.className = className;
  note.textContent = OPERATIONAL_SHIFT_NOTE;
  return note;
}

function withStatusBadge(baseClass, tone = "neutral") {
  const tones = new Set(["success", "warning", "danger", "info", "neutral"]);
  const safeTone = tones.has(tone) ? tone : "neutral";

  return `${baseClass} status-badge ${safeTone}`;
}

function getRoomStatusTone(status) {
  if (status === "available") {
    return "success";
  }

  if (status === "occupied") {
    return "danger";
  }

  if (status === "maintenance") {
    return "warning";
  }

  return "neutral";
}

function getPaymentStatusTone(status) {
  if (status === "paid") {
    return "success";
  }

  if (status === "unpaid") {
    return "warning";
  }

  return "neutral";
}

function getFnbOrderStatusTone(status) {
  if (status === "open") {
    return "warning";
  }

  if (status === "billed") {
    return "info";
  }

  if (status === "cancelled") {
    return "danger";
  }

  return "neutral";
}

function getInventoryStockStatusTone(status) {
  if (status === "safe") {
    return "success";
  }

  if (status === "low") {
    return "warning";
  }

  if (status === "negative") {
    return "danger";
  }

  return "neutral";
}

function getStockMovementTypeTone(type) {
  if (type === "in") {
    return "success";
  }

  if (type === "out") {
    return "danger";
  }

  if (type === "adjustment") {
    return "warning";
  }

  return "neutral";
}

function getRoomTimeBadgeTone(status) {
  if (status === "warning") {
    return "warning";
  }

  if (status === "expired") {
    return "danger";
  }

  return "neutral";
}
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
let isLoadingSettingsData = false;
let isSavingMasterData = false;
let masterDataForm = null;
let masterAuditLogs = [];
let isLoadingMasterAuditLogs = false;
let masterAuditEntityFilter = "all";
let masterAuditActionFilter = "all";
let deleteMasterConfirmation = null;
let isDeletingMasterData = false;
let employees = [];
let adminPinModal = null;
let isValidatingAdminPin = false;
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
let todayFnbSalesSummary = null;
let todayFnbMenuSales = [];
let lowStockReportItems = [];
let isLoadingFnbSalesReport = false;
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
let extendSessionNote = "";
let isExtendingSession = false;
let isSendingTvCommand = false;
let tvOffConfirmation = null;
let roomRecoveryCandidates = [];
let roomRecoverySummary = null;
let isLoadingRoomRecovery = false;
let isRecoveringRoom = false;
let roomRecoveryConfirmation = null;
let roomRecoveryLoadStarted = false;
let tvDevicesList = [];
let tvControlLogs = [];
let isLoadingTvDevices = false;
let isLoadingTvControlLogs = false;
let tvDeviceForm = null;
let isSavingTvDevice = false;
let isTogglingTvDeviceStatus = false;
let activeDashboardTab = loadActiveDashboardTab();
let currentOperator = loadOperatorSession();
let loginPin = "";
let loginErrorMessage = "";
let isLoggingIn = false;
let dashboardDataInitialized = false;
const PAGINATION_PAGE_SIZE = 15;
const paginationState = {};
const OPERATIONAL_OPEN_HOUR = 17;
const OPERATIONAL_CLOSE_HOUR = 10;
const OPERATIONAL_WINDOW_MINUTES = 1020;
let todayRoomTimeLogs = [];
let todayRoomTimeLogSummary = null;
let roomTimeLogRoomFilter = "all";
let isLoadingRoomTimeLogs = false;
let roomUsagePeriodFilter = "today";
let roomUsageCustomStartDate = "";
let roomUsageCustomEndDate = "";
let roomUsagePeriodNotice = "";
let roomUsageSummary = null;
let roomUsageItems = [];
let roomUsageTransactions = [];
let isLoadingRoomUsageReport = false;
let isLoadingOwnerDashboard = false;
let ownerRoomUsageSummary = null;
const ROOM_USAGE_PERIOD_OPTIONS = [
  ["today", "Shift Aktif"],
  ["yesterday", "Shift Kemarin"],
  ["last7days", "7 Shift"],
  ["thisMonth", "Bulan Ini"],
  ["all", "Semua"],
  ["custom", "Custom"],
];

async function loadRooms() {
  roomsLoading = true;
  renderRooms();
  setDataSourceBadge("Memuat Data");
  errorMessage = "";

  if (!API_BASE_URL.trim()) {
    rooms = normalizeRooms(mockRooms);
    roomRecoveryCandidates = [];
    roomRecoverySummary = null;
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
    await loadRoomRecoveryCandidates();
  } catch (error) {
    console.warn("Gagal memuat data ruangan dari API. Memakai data contoh sementara.", error);
    roomsLoading = false;
    setDataSourceBadge("Server Bermasalah", "error");
    showErrorState("Gagal memuat data dari server, sementara memakai data contoh.");
    rooms = normalizeRooms(mockRooms);
    roomRecoveryCandidates = [];
    roomRecoverySummary = null;
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

async function loadRoomRecoveryCandidates() {
  if (!API_BASE_URL.trim()) {
    roomRecoveryCandidates = [];
    roomRecoverySummary = null;
    roomRecoveryLoadStarted = false;
    return;
  }

  if (isLoadingRoomRecovery) {
    return;
  }

  roomRecoveryLoadStarted = true;
  isLoadingRoomRecovery = true;
  renderRooms();

  try {
    const data = await postApiAction({
      action: "getExpiredRoomRecoveryList",
      grace_minutes: 5,
      include_invalid_end_time: true,
    });

    const candidates = Array.isArray(data?.candidates) ? data.candidates : [];

    if (!data || data.ok !== true || !Array.isArray(data.candidates)) {
      throw new Error(data?.error || "Gagal memuat daftar room bermasalah.");
    }

    roomRecoveryCandidates = candidates;
    roomRecoverySummary = {
      expired_count: Number(data.expired_count) || 0,
      invalid_count: Number(data.invalid_count) || 0,
      total_rooms_checked: Number(data.total_rooms_checked) || 0,
    };
    console.info("Daftar room recovery dimuat.", {
      candidates: roomRecoveryCandidates.length,
      expired_count: roomRecoverySummary.expired_count,
      invalid_count: roomRecoverySummary.invalid_count,
    });
  } catch (error) {
    console.warn("Gagal memuat daftar room recovery.", error);
    roomRecoveryCandidates = [];
    roomRecoverySummary = null;
    showInlineNotice(error.message || "Gagal memuat daftar room bermasalah.", "error");
  } finally {
    isLoadingRoomRecovery = false;
    renderRooms();
  }
}

function normalizeTransactionPeriodForApi(period) {
  if (period === "thisMonth") {
    return "thismonth";
  }

  return period;
}

function buildTransactionPeriodQueryParams() {
  const params = new URLSearchParams();

  params.set("period", normalizeTransactionPeriodForApi(transactionPeriodFilter));

  if (transactionPeriodFilter === "custom") {
    if (transactionCustomStartDate) {
      params.set("start_date", transactionCustomStartDate);
    }

    if (transactionCustomEndDate) {
      params.set("end_date", transactionCustomEndDate);
    }
  }

  return params;
}

function canFetchTransactionPeriodData() {
  if (transactionPeriodFilter !== "custom") {
    return true;
  }

  return Boolean(transactionCustomStartDate && transactionCustomEndDate);
}

async function loadTodayTransactions() {
  if (!API_BASE_URL.trim()) {
    return;
  }

  if (!canFetchTransactionPeriodData()) {
    renderRooms();
    return;
  }

  try {
    const data = await fetchTodayTransactionsFromApi();

    todayTransactions = data.transactions;
    todayTransactionSummary = data.summary;
    renderRooms();
  } catch (error) {
    console.warn("Gagal memuat riwayat transaksi.", error);
    showInlineNotice(error.message || "Gagal memuat riwayat transaksi.", "error");
    todayTransactions = [];
    todayTransactionSummary = null;
    renderRooms();
  }
}

async function fetchTodayTransactionsFromApi() {
  const params = buildTransactionPeriodQueryParams();
  const response = await fetch(`${API_BASE_URL}?action=getTodayTransactions&${params.toString()}`);

  if (!response.ok) {
    throw new Error(`API request failed with status ${response.status}`);
  }

  const data = await response.json();

  if (!data || data.ok !== true || !Array.isArray(data.transactions)) {
    throw new Error(data?.error || "API response is invalid.");
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

  if (!canFetchTransactionPeriodData()) {
    renderRooms();
    return;
  }

  try {
    const data = await fetchTodayCashierClosingsFromApi();

    todayCashierClosings = data.closings;
    todayCashierClosingSummary = data.summary;
    lastCashierClosing = todayCashierClosings[0] || lastCashierClosing;
    renderRooms();
  } catch (error) {
    console.warn("Gagal memuat riwayat closing.", error);
    showInlineNotice(error.message || "Gagal memuat riwayat closing.", "error");
    todayCashierClosings = [];
    todayCashierClosingSummary = null;
    renderRooms();
  }
}

async function fetchTodayCashierClosingsFromApi() {
  const params = buildTransactionPeriodQueryParams();
  const response = await fetch(`${API_BASE_URL}?action=getTodayCashierClosings&${params.toString()}`);

  if (!response.ok) {
    throw new Error(`API request failed with status ${response.status}`);
  }

  const data = await response.json();

  if (!data || data.ok !== true || !Array.isArray(data.closings)) {
    throw new Error(data?.error || "API response is invalid.");
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

async function fetchEmployeesFromApi() {
  const response = await fetch(`${API_BASE_URL}?action=getEmployees`);

  if (!response.ok) {
    throw new Error(`API request failed with status ${response.status}`);
  }

  const data = await response.json();

  if (!data || (data.ok !== true && data.success !== true) || !Array.isArray(data.employees)) {
    throw new Error(data?.message || data?.error || "Gagal memuat data akses.");
  }

  return data.employees;
}

async function loadSettingsData() {
  if (!API_BASE_URL.trim()) {
    return;
  }

  isLoadingSettingsData = true;
  renderRooms();

  try {
    const [latestRooms, menuData, inventoryData, employeeData] = await Promise.all([
      fetchRoomsFromApi(),
      fetchMenuItemsFromApi(),
      fetchInventoryItemsFromApi(),
      fetchEmployeesFromApi(),
    ]);

    rooms = normalizeRooms(latestRooms);
    menuItems = Array.isArray(menuData.menu_items) ? menuData.menu_items : [];
    inventoryItems = Array.isArray(inventoryData.items) ? inventoryData.items : [];
    inventorySummary = inventoryData.summary || null;
    employees = Array.isArray(employeeData) ? employeeData : [];
    syncSelectedFbRoomWithRooms();
  } catch (error) {
    console.warn("Gagal memuat data pengaturan.", error);
    showInlineNotice(error.message || "Gagal memuat data pengaturan.", "error");
  } finally {
    isLoadingSettingsData = false;
    renderRooms();
  }
}

async function loadTvDevices() {
  if (!API_BASE_URL.trim()) {
    return;
  }

  isLoadingTvDevices = true;
  renderRooms();

  try {
    const response = await fetch(`${API_BASE_URL}?action=getTvDevices`);

    if (!response.ok) {
      throw new Error(`API request failed with status ${response.status}`);
    }

    const data = await response.json();

    if (!data || (data.ok !== true && data.success !== true)) {
      throw new Error(data?.message || data?.error || "Gagal memuat daftar TV device.");
    }

    tvDevicesList = Array.isArray(data.tv_devices) ? data.tv_devices : [];
  } catch (error) {
    console.warn("Gagal memuat daftar TV device.", error);
    tvDevicesList = [];
    showInlineNotice(error.message || "Gagal memuat daftar TV device.", "error");
  } finally {
    isLoadingTvDevices = false;
    renderRooms();
  }
}

async function loadTvControlLogs() {
  if (!API_BASE_URL.trim()) {
    return;
  }

  isLoadingTvControlLogs = true;
  renderRooms();

  try {
    const params = new URLSearchParams();
    params.set("action", "getTvControlLogs");
    params.set("limit", "100");
    const response = await fetch(`${API_BASE_URL}?${params.toString()}`);

    if (!response.ok) {
      throw new Error(`API request failed with status ${response.status}`);
    }

    const data = await response.json();

    if (!data || (data.ok !== true && data.success !== true)) {
      throw new Error(data?.message || data?.error || "Gagal memuat TV control logs.");
    }

    tvControlLogs = Array.isArray(data.tv_control_logs)
      ? data.tv_control_logs
      : Array.isArray(data.logs)
        ? data.logs
        : [];
    resetPaginationPage("tvControlLogs");
  } catch (error) {
    console.warn("Gagal memuat TV control logs.", error);
    tvControlLogs = [];
    showInlineNotice(error.message || "Gagal memuat TV control logs.", "error");
  } finally {
    isLoadingTvControlLogs = false;
    renderRooms();
  }
}

function getRoomNameById(roomId) {
  const room = rooms.find((item) => item.room_id === roomId);
  return room?.room_name || roomId || "-";
}

function buildLatestTvLogByDeviceMap() {
  return tvControlLogs.reduce((map, log) => {
    const tvDeviceId = String(log.tv_device_id || "").trim();

    if (!tvDeviceId) {
      return map;
    }

    const currentLog = map[tvDeviceId];

    if (!currentLog || String(log.created_at || "").localeCompare(String(currentLog.created_at || "")) > 0) {
      map[tvDeviceId] = log;
    }

    return map;
  }, {});
}

function findTvDeviceItem(tvDeviceId) {
  return tvDevicesList.find((device) => device.tv_device_id === tvDeviceId) || null;
}

function getTvDeviceFormTitle() {
  if (!tvDeviceForm) {
    return "";
  }

  return `${tvDeviceForm.mode === "edit" ? "Edit" : "Tambah"} Mapping TV`;
}

function getTvMiddlewareUrlHelper() {
  const controlType = String(tvDeviceForm?.values?.control_type || "").trim().toLowerCase();

  if (controlType === "middleware") {
    return "Wajib untuk middleware. Gunakan URL publik (mis. ngrok/cloudflared) ke endpoint /tv-command. Apps Script production tidak bisa mengakses localhost.";
  }

  return "Opsional kecuali control_type middleware. Tidak ditampilkan di card room.";
}

function truncateTvLogRawResponse(value, maxLength = 120) {
  const text = String(value || "").trim();

  if (!text) {
    return "-";
  }

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength)}...`;
}

function openTvDeviceForm(mode, item = null) {
  if (!canManageTvMapping()) {
    showInlineNotice("Hanya owner/admin yang boleh mengelola mapping TV.", "error");
    return;
  }

  tvDeviceForm = {
    mode,
    values: {
      tv_device_id: item?.tv_device_id || "",
      room_id: item?.room_id || "",
      device_name: item?.device_name || "",
      control_type: item?.control_type || "mock",
      status: item?.status || "active",
      middleware_url: item?.middleware_url || "",
      device_identifier: item?.device_identifier || "",
    },
  };
  renderRooms();
}

function closeTvDeviceForm() {
  tvDeviceForm = null;
  renderRooms();
}

function updateTvDeviceForm(field, value) {
  if (!tvDeviceForm) {
    return;
  }

  tvDeviceForm = {
    ...tvDeviceForm,
    values: {
      ...tvDeviceForm.values,
      [field]: value,
    },
  };
}

function createTvDeviceField({ label, field, type = "text", options = null, disabled = false, helper = "" }) {
  const wrapper = document.createElement("label");
  wrapper.className = "master-form-field";

  const labelElement = document.createElement("span");
  labelElement.className = "master-form-label";
  labelElement.textContent = label;

  let input;

  if (options) {
    input = document.createElement("select");
    options.forEach(([value, text]) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = text;
      input.appendChild(option);
    });
  } else {
    input = document.createElement("input");
    input.type = type;
  }

  input.className = "master-form-input";
  input.dataset.action = "update-tv-device-form";
  input.dataset.field = field;
  input.disabled = disabled;
  input.value = tvDeviceForm?.values?.[field] ?? "";

  wrapper.append(labelElement, input);

  if (helper) {
    const helperElement = document.createElement("span");
    helperElement.className = "master-form-helper";
    helperElement.textContent = helper;
    wrapper.appendChild(helperElement);
  }

  return wrapper;
}

function createTvDeviceFormModalElement() {
  if (!tvDeviceForm) {
    return null;
  }

  const overlay = document.createElement("section");
  overlay.className = "master-delete-modal tv-device-modal";
  overlay.setAttribute("aria-labelledby", "tv-device-form-title");

  const dialog = document.createElement("div");
  dialog.className = "master-delete-dialog tv-device-dialog";

  const title = document.createElement("h3");
  title.className = "master-delete-title";
  title.id = "tv-device-form-title";
  title.textContent = getTvDeviceFormTitle();

  const grid = document.createElement("div");
  grid.className = "master-form-grid";

  const roomOptions = rooms.map((room) => [room.room_id, `${room.room_id} - ${room.room_name}`]);

  grid.append(
    createTvDeviceField({
      label: "TV Device ID",
      field: "tv_device_id",
      disabled: tvDeviceForm.mode === "edit",
      helper: tvDeviceForm.mode === "edit" ? "ID device tidak bisa diubah." : "",
    }),
    createTvDeviceField({
      label: "Room",
      field: "room_id",
      options: [["", "Pilih room"], ...roomOptions],
    }),
    createTvDeviceField({ label: "Device Name", field: "device_name" }),
    createTvDeviceField({
      label: "Control Type",
      field: "control_type",
      options: [
        ["mock", "Mock"],
        ["middleware", "Middleware"],
        ["home_assistant", "Home Assistant"],
        ["manual", "Manual"],
      ],
    }),
    createTvDeviceField({
      label: "Status",
      field: "status",
      options: [
        ["active", "Active"],
        ["inactive", "Inactive"],
      ],
    }),
    createTvDeviceField({
      label: "Middleware URL",
      field: "middleware_url",
      helper: getTvMiddlewareUrlHelper(),
    }),
    createTvDeviceField({
      label: "Device Identifier",
      field: "device_identifier",
      helper: "Identifier teknis perangkat, tidak ditampilkan di card room.",
    })
  );

  const actions = document.createElement("div");
  actions.className = "master-delete-actions";

  const cancelButton = document.createElement("button");
  cancelButton.className = "master-button secondary";
  cancelButton.type = "button";
  cancelButton.dataset.action = "close-tv-device-form";
  cancelButton.textContent = "Batal";

  const saveButton = document.createElement("button");
  saveButton.className = "master-button primary";
  saveButton.type = "button";
  saveButton.dataset.action = "submit-tv-device-form";
  saveButton.disabled = isSavingTvDevice;
  saveButton.textContent = isSavingTvDevice ? "Menyimpan..." : "Simpan";

  actions.append(cancelButton, saveButton);
  dialog.append(title, grid, actions);
  overlay.appendChild(dialog);

  return overlay;
}

function createTvDeviceActionButtons(device) {
  const actions = document.createElement("div");
  actions.className = "master-row-actions";

  if (!canManageTvMapping()) {
    const note = document.createElement("span");
    note.className = "settings-section-subtitle";
    note.textContent = "Hanya owner/admin";
    actions.appendChild(note);
    return actions;
  }

  const editButton = document.createElement("button");
  editButton.className = "master-button";
  editButton.type = "button";
  editButton.dataset.action = "edit-tv-device-mapping";
  editButton.dataset.tvDeviceId = device.tv_device_id || "";
  editButton.textContent = "Edit";

  const testButton = document.createElement("button");
  testButton.className = "master-button";
  testButton.type = "button";
  testButton.dataset.action = "send-tv-test-from-settings";
  testButton.dataset.roomId = device.room_id || "";
  testButton.dataset.tvDeviceId = device.tv_device_id || "";
  testButton.disabled = isSendingTvCommand || device.status !== "active" || !API_BASE_URL.trim();
  testButton.textContent = isSendingTvCommand ? "Kirim..." : "Test";

  const toggleButton = document.createElement("button");
  toggleButton.className = "master-button";
  toggleButton.type = "button";
  toggleButton.dataset.action = "toggle-tv-device-status";
  toggleButton.dataset.tvDeviceId = device.tv_device_id || "";
  toggleButton.disabled = isTogglingTvDeviceStatus || !API_BASE_URL.trim();
  toggleButton.textContent = device.status === "active" ? "Nonaktifkan" : "Aktifkan";

  actions.append(editButton, testButton, toggleButton);
  return actions;
}

function createTvIntegrationSection() {
  const section = document.createElement("section");
  section.className = "settings-section tv-integration-section";

  const header = document.createElement("div");
  header.className = "settings-section-header";

  const titleGroup = document.createElement("div");
  const title = document.createElement("h3");
  title.className = "settings-section-title";
  title.textContent = "TV Integration";
  const subtitle = document.createElement("p");
  subtitle.className = "settings-section-subtitle";
  subtitle.textContent = "Kelola mapping TV per room dari dashboard. Satu room hanya boleh punya satu device aktif.";
  titleGroup.append(title, subtitle);

  const actions = document.createElement("div");
  actions.className = "tv-integration-header-actions";

  const refreshButton = document.createElement("button");
  refreshButton.className = "master-button";
  refreshButton.type = "button";
  refreshButton.dataset.action = "refresh-tv-integration";
  refreshButton.disabled = isLoadingTvDevices || isLoadingTvControlLogs || !API_BASE_URL.trim();
  refreshButton.textContent = isLoadingTvDevices || isLoadingTvControlLogs ? "Memuat..." : "Refresh TV";

  actions.appendChild(refreshButton);

  if (canManageTvMapping()) {
    const addButton = document.createElement("button");
    addButton.className = "master-button primary";
    addButton.type = "button";
    addButton.dataset.action = "add-tv-device-mapping";
    addButton.textContent = "Tambah Mapping TV";
    actions.appendChild(addButton);
  }

  header.append(titleGroup, actions);

  if (isLoadingTvDevices) {
    section.append(header, createStateMessage("Memuat daftar TV device..."));
    return section;
  }

  const latestLogByDevice = buildLatestTvLogByDeviceMap();
  const deviceRows = tvDevicesList.map((device) => {
    const latestLog = latestLogByDevice[device.tv_device_id] || null;

    return [
      getRoomNameById(device.room_id),
      device.device_name || "-",
      device.control_type || "-",
      getMasterStatusBadge(device.status),
      getTvActionLabel(latestLog?.tv_action),
      latestLog?.result || "-",
      device.updated_at || "-",
      createTvDeviceActionButtons(device),
    ];
  });

  const logsPanel = document.createElement("div");
  logsPanel.className = "tv-control-logs-panel";

  const logsTitle = document.createElement("h4");
  logsTitle.className = "tv-control-logs-title";
  logsTitle.textContent = "TV Control Logs";

  const logsSubtitle = document.createElement("p");
  logsSubtitle.className = "settings-section-subtitle";
  logsSubtitle.textContent = "Riwayat command TV read-only. Data terbaru 100 log.";

  if (isLoadingTvControlLogs) {
    logsPanel.append(logsTitle, logsSubtitle, createStateMessage("Memuat TV control logs..."));
  } else {
    const paginatedLogs = getPaginatedSlice("tvControlLogs", tvControlLogs);
    const logRows = paginatedLogs.items.map((log) => [
      log.created_at || "-",
      getRoomNameById(log.room_id),
      log.tv_device_id || "-",
      getTvActionLabel(log.tv_action),
      log.control_type || "-",
      log.trigger_source || "-",
      log.result || "-",
      log.success ? "true" : "false",
      log.block_reason || "-",
      log.message || "-",
      truncateTvLogRawResponse(log.raw_response),
    ]);

    logsPanel.append(
      logsTitle,
      logsSubtitle,
      createMasterTable(
        ["Waktu", "Room", "Device", "Action", "Type", "Source", "Result", "Success", "Block Reason", "Message", "Raw Response"],
        logRows,
        "Belum ada TV control log."
      ),
      createPaginationControlsElement("tvControlLogs", paginatedLogs.totalItems)
    );
  }

  section.append(
    header,
    createMasterTable(
      ["Room", "Device Name", "Control Type", "Status", "Last Command", "Last Result", "Updated At", "Aksi"],
      deviceRows,
      "Belum ada mapping TV device."
    ),
    logsPanel
  );

  return section;
}

async function submitTvDeviceForm() {
  if (!tvDeviceForm || isSavingTvDevice) {
    return;
  }

  if (!canManageTvMapping()) {
    showInlineNotice("Hanya owner/admin yang boleh mengelola mapping TV.", "error");
    return;
  }

  if (!API_BASE_URL.trim()) {
    showInlineNotice("API belum dikonfigurasi.", "error");
    return;
  }

  const values = tvDeviceForm.values || {};
  const isEdit = tvDeviceForm.mode === "edit";
  const controlType = String(values.control_type || "").trim().toLowerCase();
  const middlewareUrl = String(values.middleware_url || "").trim();

  if (controlType === "middleware" && !middlewareUrl) {
    showInlineNotice("middleware_url wajib diisi untuk control_type middleware.", "error");
    return;
  }

  isSavingTvDevice = true;
  renderRooms();

  try {
    const data = await postApiAction({
      action: isEdit ? "updateTvDevice" : "saveTvDevice",
      tv_device_id: values.tv_device_id || "",
      room_id: values.room_id || "",
      device_name: values.device_name || "",
      control_type: values.control_type || "mock",
      status: values.status || "active",
      middleware_url: values.middleware_url || "",
      device_identifier: values.device_identifier || "",
    });

    if (!data || (data.ok !== true && data.success !== true)) {
      throw new Error(data?.message || data?.error || "Gagal menyimpan mapping TV.");
    }

    showInlineNotice(data.message || "Mapping TV berhasil disimpan.");
    tvDeviceForm = null;
    await loadTvDevices();
    await loadTvControlLogs();
    await loadRooms();
  } catch (error) {
    showInlineNotice(error.message || "Gagal menyimpan mapping TV.", "error");
  } finally {
    isSavingTvDevice = false;
    renderRooms();
  }
}

async function toggleTvDeviceStatus(tvDeviceId) {
  if (!canManageTvMapping()) {
    showInlineNotice("Hanya owner/admin yang boleh mengelola mapping TV.", "error");
    return;
  }

  const device = findTvDeviceItem(tvDeviceId);

  if (!device) {
    showInlineNotice("TV device tidak ditemukan.", "error");
    return;
  }

  if (!API_BASE_URL.trim()) {
    showInlineNotice("API belum dikonfigurasi.", "error");
    return;
  }

  const nextStatus = device.status === "active" ? "inactive" : "active";

  isTogglingTvDeviceStatus = true;
  renderRooms();

  try {
    const data = await postApiAction({
      action: "updateTvDevice",
      tv_device_id: device.tv_device_id,
      room_id: device.room_id,
      device_name: device.device_name,
      control_type: device.control_type,
      status: nextStatus,
      middleware_url: device.middleware_url || "",
      device_identifier: device.device_identifier || "",
    });

    if (!data || (data.ok !== true && data.success !== true)) {
      throw new Error(data?.message || data?.error || "Gagal mengubah status TV device.");
    }

    showInlineNotice(data.message || `TV device berhasil di${nextStatus === "active" ? "aktifkan" : "nonaktifkan"}.`);
    await loadTvDevices();
    await loadTvControlLogs();
    await loadRooms();
  } catch (error) {
    showInlineNotice(error.message || "Gagal mengubah status TV device.", "error");
  } finally {
    isTogglingTvDeviceStatus = false;
    renderRooms();
  }
}

async function sendTvCommandFromSettings(roomId, tvDeviceId) {
  if (!canManageTvMapping()) {
    showInlineNotice("Hanya owner/admin yang boleh test TV dari Pengaturan.", "error");
    return;
  }

  if (!API_BASE_URL.trim()) {
    showInlineNotice("API belum dikonfigurasi. Isi URL server dulu di config.js.", "error");
    return;
  }

  if (!tvDeviceId) {
    showInlineNotice("TV device tidak ditemukan.", "error");
    return;
  }

  isSendingTvCommand = true;
  renderRooms();

  try {
    const data = await postApiAction({
      action: "sendTvCommand",
      room_id: roomId,
      tv_device_id: tvDeviceId,
      tv_action: "test",
      trigger_source: "settings_page",
      cashier_name: getLoggedInOperatorName(),
    });

    if (!data || data.success !== true) {
      throw new Error(data?.message || "Perintah TV gagal dikirim.");
    }

    showInlineNotice("Perintah TV berhasil dikirim.");
    await loadTvControlLogs();
    await loadRooms();
  } catch (error) {
    showInlineNotice(error.message || "Perintah TV gagal dikirim.", "error");
    await loadTvControlLogs();
    await loadRooms();
  } finally {
    isSendingTvCommand = false;
    renderRooms();
  }
}

function buildMasterAuditQueryParams() {
  const params = new URLSearchParams();
  params.set("action", "getMasterDataAuditLogs");
  params.set("limit", "100");

  if (masterAuditEntityFilter && masterAuditEntityFilter !== "all") {
    params.set("entity_type", masterAuditEntityFilter);
  }

  if (masterAuditActionFilter && masterAuditActionFilter !== "all") {
    params.set("action_type", masterAuditActionFilter);
  }

  return params;
}

async function loadMasterDataAuditLogs() {
  if (!API_BASE_URL.trim()) {
    masterAuditLogs = [];
    return;
  }

  isLoadingMasterAuditLogs = true;
  renderRooms();

  try {
    const params = buildMasterAuditQueryParams();
    const response = await fetch(`${API_BASE_URL}?${params.toString()}`);

    if (!response.ok) {
      throw new Error(`API request failed with status ${response.status}`);
    }

    const data = await response.json();

    if (!data || (data.ok !== true && data.success !== true)) {
      throw new Error(data?.message || data?.error || "Gagal memuat audit log master data.");
    }

    masterAuditLogs = Array.isArray(data.data) ? data.data : Array.isArray(data.logs) ? data.logs : [];
  } catch (error) {
    console.warn("Gagal memuat audit log master data.", error);
    masterAuditLogs = [];
    showInlineNotice(error.message || "Gagal memuat audit log master data.", "error");
  } finally {
    isLoadingMasterAuditLogs = false;
    renderRooms();
  }
}

async function loadSettingsTabData() {
  await Promise.all([
    loadSettingsData(),
    loadMasterDataAuditLogs(),
    loadTvDevices(),
    loadTvControlLogs(),
  ]);
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
  const field = queryDashboard(selector);

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
    cashier_name: getLoggedInOperatorName(),
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
    await loadTodayFnbSalesReport();
  } catch (error) {
    showInlineNotice(error.message || "Gagal memperbarui stok.", "error");
  } finally {
    isSavingStockAdjustment = false;
    renderRooms();
  }
}

function normalizeRoomUsagePeriodForApi(period) {
  if (period === "thisMonth") {
    return "thismonth";
  }

  return period;
}

function buildRoomUsagePeriodQueryParams() {
  const params = new URLSearchParams();

  params.set("period", normalizeRoomUsagePeriodForApi(roomUsagePeriodFilter));

  if (roomUsagePeriodFilter === "custom") {
    if (roomUsageCustomStartDate) {
      params.set("start_date", roomUsageCustomStartDate);
    }

    if (roomUsageCustomEndDate) {
      params.set("end_date", roomUsageCustomEndDate);
    }
  }

  return params;
}

function canFetchRoomUsagePeriodData() {
  if (roomUsagePeriodFilter !== "custom") {
    return true;
  }

  return Boolean(roomUsageCustomStartDate && roomUsageCustomEndDate);
}

function getRoomUsagePeriodTitleSuffix() {
  const labels = {
    today: "Shift Aktif",
    yesterday: "Shift Kemarin",
    last7days: "7 Shift",
    thisMonth: "Bulan Ini",
    all: "Semua",
    custom: "Custom",
  };

  return labels[roomUsagePeriodFilter] || "Shift Aktif";
}

function setRoomUsagePeriodFilter(period) {
  if (!ROOM_USAGE_PERIOD_OPTIONS.some(([value]) => value === period)) {
    return;
  }

  roomUsagePeriodFilter = period;
  resetPaginationPage("roomUsage");
  resetPaginationPage("roomUsageTransactions");

  if (period !== "custom") {
    roomUsageCustomStartDate = "";
    roomUsageCustomEndDate = "";
    roomUsagePeriodNotice = "";
    loadRoomUsageReport();
    return;
  }

  roomUsagePeriodNotice = "Pilih tanggal operasional mulai dan akhir, lalu klik Terapkan.";
  renderRooms();
}

function updateRoomUsageCustomStartDate(value) {
  roomUsageCustomStartDate = value || "";
}

function updateRoomUsageCustomEndDate(value) {
  roomUsageCustomEndDate = value || "";
}

async function applyRoomUsageCustomPeriod() {
  if (!roomUsageCustomStartDate || !roomUsageCustomEndDate) {
    roomUsagePeriodNotice = "Pilih tanggal operasional mulai dan akhir, lalu klik Terapkan.";
    renderRooms();
    return;
  }

  if (roomUsageCustomStartDate > roomUsageCustomEndDate) {
    roomUsagePeriodNotice = "Tanggal mulai tidak boleh lebih besar dari tanggal akhir.";
    renderRooms();
    return;
  }

  roomUsagePeriodNotice = "";
  resetPaginationPage("roomUsage");
  resetPaginationPage("roomUsageTransactions");
  await loadRoomUsageReport();
}

async function loadRoomUsageReport() {
  roomUsageSummary = null;

  if (!API_BASE_URL.trim()) {
    roomUsageItems = [];
    roomUsageTransactions = [];
    renderRooms();
    return;
  }

  if (!canFetchRoomUsagePeriodData()) {
    renderRooms();
    return;
  }

  isLoadingRoomUsageReport = true;
  renderRooms();

  try {
    const data = await fetchRoomUsageReportFromApi();

    roomUsageSummary = data.summary || null;
    roomUsageItems = Array.isArray(data.room_usage) ? data.room_usage : [];
    roomUsageTransactions = Array.isArray(data.transactions) ? data.transactions : [];
  } catch (error) {
    console.warn("Gagal memuat laporan pemakaian room.", error);
    showInlineNotice(error.message || "Gagal memuat laporan pemakaian room.", "error");
    roomUsageSummary = null;
    roomUsageItems = [];
    roomUsageTransactions = [];
  } finally {
    isLoadingRoomUsageReport = false;
    renderRooms();
  }
}

async function fetchRoomUsageReportFromApi() {
  if (!API_BASE_URL.trim()) {
    return {
      summary: null,
      room_usage: [],
      transactions: [],
    };
  }

  const params = buildRoomUsagePeriodQueryParams();
  const response = await fetch(`${API_BASE_URL}?action=getRoomUsageReport&${params.toString()}`);

  if (!response.ok) {
    throw new Error(`API request failed with status ${response.status}`);
  }

  const data = await response.json();

  if (!data || data.ok !== true) {
    throw new Error(data?.error || "API response is invalid.");
  }

  return {
    summary: data.summary || null,
    room_usage: Array.isArray(data.room_usage) ? data.room_usage : [],
    transactions: Array.isArray(data.transactions) ? data.transactions : [],
  };
}

async function fetchActiveShiftRoomUsageReportFromApi() {
  if (!API_BASE_URL.trim()) {
    return {
      summary: null,
      room_usage: [],
      transactions: [],
    };
  }

  const params = buildActiveShiftQueryParams();
  const response = await fetch(`${API_BASE_URL}?action=getRoomUsageReport&${params.toString()}`);

  if (!response.ok) {
    throw new Error(`API request failed with status ${response.status}`);
  }

  const data = await response.json();

  if (!data || data.ok !== true) {
    throw new Error(data?.error || "API response is invalid.");
  }

  return {
    summary: data.summary || null,
    room_usage: Array.isArray(data.room_usage) ? data.room_usage : [],
    transactions: Array.isArray(data.transactions) ? data.transactions : [],
  };
}

function getOwnerLowStockItems() {
  return inventoryItems.filter((item) => {
    const status = String(item?.status || "").trim().toLowerCase();
    const stockQty = Number(item?.stock_qty) || 0;
    const minStock = Number(item?.min_stock) || 0;

    return stockQty <= minStock && status !== "inactive";
  });
}

function getOwnerActiveSessions() {
  return rooms.filter((room) => normalizeRoomStatus(room?.status) === "occupied");
}

async function loadOwnerDashboardSummary() {
  if (!API_BASE_URL.trim()) {
    return;
  }

  isLoadingOwnerDashboard = true;
  renderRooms();

  try {
    const roomUsageData = await fetchActiveShiftRoomUsageReportFromApi();
    const inventoryData = await fetchInventoryItemsFromApi();
    const latestRooms = await fetchRoomsFromApi();

    ownerRoomUsageSummary = roomUsageData.summary || null;
    inventoryItems = Array.isArray(inventoryData.items) ? inventoryData.items : [];
    inventorySummary = inventoryData.summary || null;
    rooms = normalizeRooms(latestRooms);
    syncSelectedFbRoomWithRooms();
  } catch (error) {
    console.warn("Gagal memuat dashboard owner.", error);
    showInlineNotice(error.message || "Gagal memuat dashboard owner.", "error");
  } finally {
    isLoadingOwnerDashboard = false;
    renderRooms();
  }
}

async function loadTodayFnbSalesReport() {
  todayFnbSalesSummary = null;

  if (!API_BASE_URL.trim()) {
    todayFnbMenuSales = [];
    lowStockReportItems = [];
    renderRooms();
    return;
  }

  isLoadingFnbSalesReport = true;
  renderRooms();

  try {
    const data = await fetchTodayFnbSalesReportFromApi();

    todayFnbSalesSummary = data.summary || null;
    todayFnbMenuSales = Array.isArray(data.menu_sales) ? data.menu_sales : [];
    lowStockReportItems = Array.isArray(data.low_stock_items) ? data.low_stock_items : [];
  } catch (error) {
    console.warn("Gagal memuat laporan penjualan F&B.", error);
    todayFnbSalesSummary = null;
    todayFnbMenuSales = [];
    lowStockReportItems = [];
  } finally {
    isLoadingFnbSalesReport = false;
    renderRooms();
  }
}

async function fetchTodayFnbSalesReportFromApi() {
  if (!API_BASE_URL.trim()) {
    return {
      summary: null,
      menu_sales: [],
      low_stock_items: [],
    };
  }

  const params = buildActiveShiftQueryParams();
  const response = await fetch(`${API_BASE_URL}?action=getTodayFnbSalesReport&${params.toString()}`);

  if (!response.ok) {
    throw new Error(`API request failed with status ${response.status}`);
  }

  const data = await response.json();

  if (!data || data.ok !== true) {
    throw new Error(data?.error || "API response is invalid.");
  }

  return {
    summary: data.summary || null,
    menu_sales: Array.isArray(data.menu_sales) ? data.menu_sales : [],
    low_stock_items: Array.isArray(data.low_stock_items) ? data.low_stock_items : [],
  };
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
  buildActiveShiftQueryParams().forEach((value, key) => {
    params.set(key, value);
  });

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
  resetPaginationPage("stockMovements");
  loadTodayStockMovements();
}

function setStockMovementTypeFilter(movementType) {
  if (!["all", "in", "out", "adjustment"].includes(movementType)) {
    return;
  }

  stockMovementTypeFilter = movementType;
  resetPaginationPage("stockMovements");
  loadTodayStockMovements();
}

function setStockMovementReferenceFilter(referenceType) {
  if (!["all", "transaction", "manual_adjustment"].includes(referenceType)) {
    return;
  }

  stockMovementReferenceFilter = referenceType;
  resetPaginationPage("stockMovements");
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

  const params = buildActiveShiftQueryParams();
  const response = await fetch(`${API_BASE_URL}?action=getTodayFnbOrders&${params.toString()}`);

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
  resetPaginationPage("transactions");
  renderRooms();
}

function getTransactionPeriodTitleSuffix() {
  const labels = {
    today: "Shift Aktif",
    yesterday: "Shift Kemarin",
    last7days: "7 Shift",
    thisMonth: "Bulan Ini",
    all: "Semua",
    custom: "Custom",
  };

  return labels[transactionPeriodFilter] || "Shift Aktif";
}

function getTransactionPeriodRevenueNote() {
  if (transactionPeriodFilter === "custom" && transactionCustomStartDate && transactionCustomEndDate) {
    return `Semua transaksi shift ${transactionCustomStartDate} s/d ${transactionCustomEndDate}`;
  }

  return `Semua transaksi ${getTransactionPeriodTitleSuffix().toLowerCase()}`;
}

function setTransactionPeriodFilter(period) {
  if (!TRANSACTION_PERIOD_OPTIONS.some(([value]) => value === period)) {
    return;
  }

  transactionPeriodFilter = period;
  resetPaginationPage("transactions");
  resetPaginationPage("cashierClosings");

  if (period !== "custom") {
    transactionCustomStartDate = "";
    transactionCustomEndDate = "";
    transactionPeriodNotice = "";
    loadTodayTransactions();
    loadTodayCashierClosings();
    return;
  }

  transactionPeriodNotice = "Pilih tanggal mulai dan tanggal akhir, lalu klik Terapkan.";
  renderRooms();
}

function updateTransactionCustomStartDate(value) {
  transactionCustomStartDate = value || "";
}

function updateTransactionCustomEndDate(value) {
  transactionCustomEndDate = value || "";
}

async function applyTransactionCustomPeriod() {
  if (!transactionCustomStartDate || !transactionCustomEndDate) {
    transactionPeriodNotice = "Pilih tanggal mulai dan tanggal akhir, lalu klik Terapkan.";
    renderRooms();
    return;
  }

  if (transactionCustomStartDate > transactionCustomEndDate) {
    transactionPeriodNotice = "Tanggal mulai tidak boleh lebih besar dari tanggal akhir.";
    renderRooms();
    return;
  }

  transactionPeriodNotice = "";
  resetPaginationPage("transactions");
  resetPaginationPage("cashierClosings");
  await loadTodayTransactions();
  await loadTodayCashierClosings();
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
    return "Belum ada transaksi lunas pada shift/periode ini.";
  }

  if (transactionHistoryFilter === "unpaid") {
    return "Tidak ada transaksi yang belum dibayar pada shift/periode ini.";
  }

  return "Belum ada transaksi pada shift/periode ini.";
}

function getEmptyCashierClosingMessage() {
  return "Belum ada closing kasir pada shift/periode ini.";
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

  const cashInput = queryDashboard("#cashierClosingCashActual");

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
      tv_device: normalizeRoomTvDevice(room.tv_device),
      updated_at: room.updated_at || null,
    };
  });
}

function normalizeRoomTvDevice(tvDevice) {
  if (!tvDevice || tvDevice.configured === false) {
    return {
      configured: false,
      status: "not_configured",
      status_label: "TV belum disetting",
      last_command: "",
      last_command_at: null,
    };
  }

  return {
    configured: true,
    room_id: tvDevice.room_id || "",
    tv_device_id: tvDevice.tv_device_id || "",
    device_name: tvDevice.device_name || "",
    control_type: tvDevice.control_type || "mock",
    device_status: tvDevice.device_status || "active",
    status: tvDevice.status || "unchecked",
    status_label: tvDevice.status_label || getTvStatusLabel(tvDevice.status),
    last_command: tvDevice.last_command || "",
    last_command_result: tvDevice.last_command_result || "",
    last_command_at: tvDevice.last_command_at || null,
  };
}

function getFilteredMenuItems() {
  const normalizedSearch = menuSearchQuery.trim().toLowerCase();

  return menuItems.filter((menuItem) => {
    const category = menuItem.category || "";
    const isActive = String(menuItem.status || "").trim().toLowerCase() === "active";
    const matchesCategory =
      menuCategoryFilter === "all" || category === menuCategoryFilter;
    const matchesSearch =
      !normalizedSearch ||
      `${menuItem.menu_name || ""} ${category}`.toLowerCase().includes(normalizedSearch);

    return isActive && matchesCategory && matchesSearch;
  });
}

function setMenuSearchQuery(value) {
  menuSearchQuery = value;
  renderRooms();

  const searchInput = queryDashboard(".menu-search");

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
  return [...new Set(menuItems
    .filter((menuItem) => String(menuItem.status || "").trim().toLowerCase() === "active")
    .map((menuItem) => menuItem.category)
    .filter(Boolean))].sort();
}

function setSelectedFbRoom(roomId) {
  const nextRoomId = roomId || "";
  const room = rooms.find((item) => item.room_id === nextRoomId);

  if (nextRoomId && (!room || !isFbOrderRoomSelectable(room))) {
    selectedFbRoomId = "";
  } else {
    selectedFbRoomId = nextRoomId;
  }

  resetPaginationPage("openFnbOrders");
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
  resetPaginationPage("todayFnbOrders");
  renderRooms();
}

function setTodayFnbOrderRoomFilter(roomId) {
  todayFnbOrderRoomFilter = roomId || "all";
  resetPaginationPage("todayFnbOrders");
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
    cashier_name: getLoggedInOperatorName(),
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

function getRoomsTimeWarningRoomIds() {
  return rooms.reduce((roomIds, room) => {
    if (normalizeRoomStatus(room?.status) !== "occupied") {
      return roomIds;
    }

    const status = getRemainingTimeStatus(getRoomRemainingTime(room));

    if (status === "warning" || status === "expired") {
      roomIds.push(room.room_id);
    }

    return roomIds;
  }, []);
}

function getRoomsTimeWarningCount() {
  return getRoomsTimeWarningRoomIds().length;
}

function updateRoomsTabWarningBadge(count = getRoomsTimeWarningCount()) {
  if (!appTabsNav) {
    return;
  }

  const badge = appTabsNav.querySelector("[data-role='rooms-warning-badge']");

  if (!badge) {
    return;
  }

  if (count > 0) {
    badge.textContent = String(count);
    badge.hidden = false;
    badge.setAttribute("aria-label", `${count} room perlu perhatian`);
    return;
  }

  badge.textContent = "";
  badge.hidden = true;
  badge.removeAttribute("aria-label");
}

function getRoomWarningAudioContext() {
  if (roomWarningAudioContext) {
    return roomWarningAudioContext;
  }

  const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;

  if (!AudioContextConstructor) {
    return null;
  }

  roomWarningAudioContext = new AudioContextConstructor();
  return roomWarningAudioContext;
}

function logRoomWarningAudioFailure(error) {
  if (hasWarnedRoomWarningAudio) {
    return;
  }

  console.warn("Notifikasi suara room warning tidak bisa diputar.", error);
  hasWarnedRoomWarningAudio = true;
}

function playRoomWarningSound() {
  try {
    const audioContext = getRoomWarningAudioContext();

    if (!audioContext || audioContext.state !== "running") {
      pendingRoomWarningSound = true;
      return;
    }

    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const now = audioContext.currentTime;
    const durationSeconds = ROOM_WARNING_SOUND_DURATION_MS / 1000;

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(ROOM_WARNING_SOUND_FREQUENCY_HZ, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.18, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSeconds);

    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(now);
    oscillator.stop(now + durationSeconds);
    pendingRoomWarningSound = false;
  } catch (error) {
    pendingRoomWarningSound = false;
    logRoomWarningAudioFailure(error);
  }
}

function unlockRoomWarningAudio() {
  if (roomWarningAudioUnlocked) {
    return;
  }

  try {
    const audioContext = getRoomWarningAudioContext();

    if (!audioContext) {
      return;
    }

    audioContext.resume()
      .then(() => {
        roomWarningAudioUnlocked = audioContext.state === "running";

        if (roomWarningAudioUnlocked && pendingRoomWarningSound) {
          playRoomWarningSound();
        }
      })
      .catch(logRoomWarningAudioFailure);
  } catch (error) {
    logRoomWarningAudioFailure(error);
  }
}

function updateRoomsTimeWarningAwareness({ playSound = false } = {}) {
  const warningRoomIds = new Set(getRoomsTimeWarningRoomIds());
  const hasNewWarningRoom = Array.from(warningRoomIds).some(
    (roomId) => !previousWarningRoomIds.has(roomId)
  );

  updateRoomsTabWarningBadge(warningRoomIds.size);

  if (roomsLoading && !roomWarningStateInitialized) {
    return;
  }

  if (!roomWarningStateInitialized) {
    previousWarningRoomIds = warningRoomIds;
    roomWarningStateInitialized = true;
    return;
  }

  if (playSound && hasNewWarningRoom) {
    playRoomWarningSound();
  }

  previousWarningRoomIds = warningRoomIds;
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
  badge.className = badgeText
    ? withStatusBadge(`room-time-badge room-time-badge-${status}`, getRoomTimeBadgeTone(status))
    : "room-time-badge";
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

function getCurrentOperatorRole() {
  try {
    return String(
      localStorage.getItem("karaoke_current_role")
        || localStorage.getItem("karaoke_user_role")
        || "cashier"
    ).trim().toLowerCase();
  } catch (error) {
    return "cashier";
  }
}

function canControlTv() {
  return ["owner", "admin", "cashier"].includes(getCurrentOperatorRole());
}

function canManageTvMapping() {
  return ["owner", "admin"].includes(getCurrentOperatorRole());
}

function getTvStatusLabel(status) {
  if (status === "active") {
    return "TV: Aktif";
  }

  if (status === "failed") {
    return "TV: Gagal";
  }

  if (status === "timeout") {
    return "TV: Timeout";
  }

  if (status === "not_configured") {
    return "TV belum disetting";
  }

  return "TV: Belum dicek";
}

function getTvStatusBadgeText(tvDevice) {
  if (!tvDevice || tvDevice.configured === false || tvDevice.status === "not_configured") {
    return "⚫ TV belum disetting";
  }

  if (tvDevice.status === "active") {
    return "🟢 TV: Aktif";
  }

  if (tvDevice.status === "failed") {
    return "🔴 TV: Gagal";
  }

  if (tvDevice.status === "timeout") {
    return "🟡 TV: Timeout";
  }

  return "⚪ TV: Belum dicek";
}

function getTvStatusTone(tvDevice) {
  if (!tvDevice || tvDevice.configured === false || tvDevice.status === "not_configured") {
    return "neutral";
  }

  if (tvDevice.status === "active") {
    return "success";
  }

  if (tvDevice.status === "failed") {
    return "danger";
  }

  if (tvDevice.status === "timeout") {
    return "warning";
  }

  return "neutral";
}

function getTvActionLabel(tvAction) {
  if (tvAction === "power_on") {
    return "TV ON";
  }

  if (tvAction === "power_off") {
    return "TV OFF";
  }

  if (tvAction === "test") {
    return "TEST";
  }

  return tvAction || "-";
}

function getTvCommandSuccessMessage(tvAction) {
  if (tvAction === "power_on") {
    return "Perintah TV ON berhasil dikirim.";
  }

  if (tvAction === "power_off") {
    return "Perintah TV OFF berhasil dikirim.";
  }

  return "Perintah TEST TV berhasil dikirim.";
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
    ["Total Tagihan", formatCurrency(summary.totalRevenue), getTransactionPeriodRevenueNote()],
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
  subtitle.textContent = "Rekap sementara berdasarkan transaksi shift aktif.";

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

function findRoomRecoveryCandidate(roomId, sessionId) {
  return roomRecoveryCandidates.find((candidate) => (
    String(candidate?.room_id || "") === String(roomId || "") &&
    String(candidate?.session_id || "") === String(sessionId || "")
  ));
}

function formatExpiredMinutesText(minutes) {
  const expiredMinutes = Math.max(0, Math.floor(Number(minutes) || 0));

  if (expiredMinutes <= 0) {
    return "baru saja expired";
  }

  return `expired ${expiredMinutes} menit lalu`;
}

function createRoomRecoveryPanelElement() {
  const section = document.createElement("section");
  section.className = "room-recovery-panel";
  section.setAttribute("aria-labelledby", "room-recovery-title");

  const header = document.createElement("div");
  header.className = "room-recovery-header";

  const titleGroup = document.createElement("div");

  const title = document.createElement("h2");
  title.className = "room-recovery-title";
  title.id = "room-recovery-title";
  title.textContent = "Room Bermasalah";

  const subtitle = document.createElement("p");
  subtitle.className = "room-recovery-subtitle";
  subtitle.textContent = "Review manual untuk room expired atau data waktu sesi yang perlu perhatian.";

  titleGroup.append(title, subtitle);

  const summary = document.createElement("span");
  summary.className = withStatusBadge("room-recovery-summary", "warning");
  summary.textContent = `${roomRecoveryCandidates.length} kandidat`;

  header.append(titleGroup, summary);

  const list = document.createElement("div");
  list.className = "room-recovery-list";

  roomRecoveryCandidates.forEach((candidate) => {
    list.appendChild(createRoomRecoveryCandidateElement(candidate));
  });

  section.append(header, list);
  return section;
}

function hasRoomRecoveryCandidates() {
  return Array.isArray(roomRecoveryCandidates) && roomRecoveryCandidates.length > 0;
}

function ensureRoomRecoveryCandidatesLoaded() {
  if (
    !API_BASE_URL.trim() ||
    roomRecoveryLoadStarted ||
    isLoadingRoomRecovery ||
    hasRoomRecoveryCandidates()
  ) {
    return;
  }

  roomRecoveryLoadStarted = true;

  setTimeout(() => {
    loadRoomRecoveryCandidates();
  }, 0);
}

function createRoomRecoveryCandidateElement(candidate) {
  const item = document.createElement("article");
  item.className = candidate.safe_to_recover
    ? "room-recovery-item recoverable"
    : "room-recovery-item review";

  const topLine = document.createElement("div");
  topLine.className = "room-recovery-item-header";

  const title = document.createElement("h3");
  title.className = "room-recovery-room";
  title.textContent = `${candidate.room_name || "Room"} (${candidate.room_id || "-"})`;

  const badge = document.createElement("span");
  badge.className = withStatusBadge(
    "room-recovery-badge",
    candidate.safe_to_recover ? "success" : "warning"
  );
  badge.textContent = candidate.safe_to_recover ? "Bisa Dipulihkan" : "Perlu Review Manual";

  topLine.append(title, badge);

  const meta = document.createElement("div");
  meta.className = "room-recovery-meta";

  [
    ["Expired", formatExpiredMinutesText(candidate.expired_minutes)],
    ["Issue", candidate.issue_type || "-"],
    ["Sesi", candidate.session_id || "-"],
  ].forEach(([labelText, valueText]) => {
    const row = document.createElement("p");
    row.className = "room-recovery-meta-item";

    const label = document.createElement("span");
    label.className = "room-recovery-meta-label";
    label.textContent = labelText;

    const value = document.createElement("span");
    value.className = "room-recovery-meta-value";
    value.textContent = valueText;

    row.append(label, value);
    meta.appendChild(row);
  });

  const reason = document.createElement("p");
  reason.className = "room-recovery-reason";
  reason.textContent = candidate.reason || "Perlu dicek manual.";

  const actions = document.createElement("div");
  actions.className = "room-recovery-actions";

  if (candidate.safe_to_recover) {
    const recoverButton = document.createElement("button");
    recoverButton.className = "master-button primary room-recovery-button";
    recoverButton.type = "button";
    recoverButton.dataset.action = "open-room-recovery-confirmation";
    recoverButton.dataset.roomId = candidate.room_id || "";
    recoverButton.dataset.sessionId = candidate.session_id || "";
    recoverButton.disabled = isRecoveringRoom;
    recoverButton.textContent = "Pulihkan";
    actions.appendChild(recoverButton);
  } else {
    const manual = document.createElement("p");
    manual.className = "room-recovery-manual-note";
    manual.textContent = "Perlu dicek manual. Sistem tidak menyediakan tombol pulihkan untuk kandidat ini.";
    actions.appendChild(manual);
  }

  item.append(topLine, meta, reason, actions);
  return item;
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
  status.className = withStatusBadge("room-status", getRoomStatusTone(room.status));
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
  meta.appendChild(createRoomTvControlElement(room));

  const actions = document.createElement("div");
  actions.className = "room-actions";

  const sessionButton = document.createElement("button");
  sessionButton.className = "room-button";
  sessionButton.type = "button";
  sessionButton.dataset.action = "toggle-session";
  sessionButton.textContent = sessionButtonLabel;

  if (room.status === "occupied") {
    actions.classList.add("room-actions-occupied");

    const extendButton = document.createElement("button");
    extendButton.className = "room-button room-button-extend";
    extendButton.type = "button";
    extendButton.dataset.action = "show-extend-selection";
    extendButton.textContent = isExtendingSession ? "Menambah..." : "Tambah Waktu";

    actions.append(sessionButton, extendButton);
  } else {
    actions.append(sessionButton);
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

  const noteField = document.createElement("div");
  noteField.className = "extend-note-field";

  const noteLabel = document.createElement("label");
  noteLabel.className = "extend-note-label";
  noteLabel.textContent = "Catatan tambah waktu";

  const noteInput = document.createElement("input");
  noteInput.className = "extend-note-input";
  noteInput.type = "text";
  noteInput.placeholder = "Contoh: Customer tambah 30 menit";
  noteInput.dataset.action = "update-extend-session-note";
  noteInput.value = extendSessionNote;
  noteInput.disabled = isExtendingSession;

  noteField.append(noteLabel, noteInput);

  const cancelButton = document.createElement("button");
  cancelButton.className = "extend-cancel-button";
  cancelButton.type = "button";
  cancelButton.dataset.action = "cancel-extend-selection";
  cancelButton.textContent = "Batal";

  panel.append(title, options, custom, noteField, cancelButton);

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
  status.className = withStatusBadge(
    `menu-status ${statusClass}`,
    statusClass === "active" ? "success" : "neutral"
  );
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
    const paginatedOrders = getPaginatedSlice("openFnbOrders", orders);
    paginatedOrders.items.forEach((order) => {
      list.appendChild(createOpenFnbOrderCardElement(order));
    });
    list.appendChild(createPaginationControlsElement("openFnbOrders", orders.length));
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
  status.className = withStatusBadge(
    `open-fnb-status ${getFnbOrderStatusClass(order.order_status)}`,
    getFnbOrderStatusTone(order.order_status)
  );
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
  title.textContent = "Riwayat Order F&B - Shift Aktif";

  const subtitle = document.createElement("p");
  subtitle.className = "today-fnb-subtitle";
  subtitle.textContent = "Daftar pesanan makanan dan minuman pada shift operasional aktif.";

  titleGroup.append(title, subtitle);
  header.appendChild(titleGroup);

  const filteredOrders = getFilteredTodayFnbOrders();
  const summary = todayFnbOrderStatusFilter === "all" && todayFnbOrderRoomFilter === "all"
    ? todayFnbOrderSummary || calculateTodayFnbOrderSummary(filteredOrders)
    : calculateTodayFnbOrderSummary(filteredOrders);
  const list = document.createElement("div");
  list.className = "today-fnb-list";

  if (isLoadingTodayFnbOrders) {
    list.appendChild(createStateMessage("Memuat riwayat order F&B shift aktif..."));
  } else if (filteredOrders.length === 0) {
    const empty = document.createElement("p");
    empty.className = "today-fnb-empty";
    empty.textContent = getTodayFnbEmptyMessage();
    list.appendChild(empty);
  } else {
    const paginatedOrders = getPaginatedSlice("todayFnbOrders", filteredOrders);
    paginatedOrders.items.forEach((order) => {
      list.appendChild(createTodayFnbOrderCardElement(order));
    });
    list.appendChild(createPaginationControlsElement("todayFnbOrders", filteredOrders.length));
  }

  panel.append(
    header,
    createOperationalShiftNoteElement("shift-period-note"),
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
  status.className = withStatusBadge(
    `today-fnb-status ${getFnbOrderStatusClass(order.order_status)}`,
    getFnbOrderStatusTone(order.order_status)
  );
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

  return "Belum ada order F&B pada shift aktif.";
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
    const paginatedInventory = getPaginatedSlice("inventoryItems", inventoryItems);
    paginatedInventory.items.forEach((item) => {
      list.appendChild(createInventoryItemRowElement(item));
    });
    list.appendChild(createPaginationControlsElement("inventoryItems", inventoryItems.length));
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
  status.className = withStatusBadge(
    `inventory-status ${getInventoryStockStatusClass(item.stock_status)}`,
    getInventoryStockStatusTone(item.stock_status)
  );
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
    return "Tidak ada mutasi stok pada shift aktif untuk filter yang dipilih.";
  }

  return "Belum ada mutasi stok pada shift aktif.";
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
  title.textContent = "Riwayat Mutasi Stok - Shift Aktif";

  const subtitle = document.createElement("p");
  subtitle.className = "stock-movements-subtitle";
  subtitle.textContent = "Semua perubahan stok shift aktif dari transaksi F&B, restock, dan koreksi manual.";

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
    list.appendChild(createStateMessage("Memuat riwayat mutasi stok shift aktif..."));
  } else if (todayStockMovements.length === 0) {
    const empty = document.createElement("p");
    empty.className = "stock-movements-empty";
    empty.textContent = getTodayStockMovementEmptyMessage();
    list.appendChild(empty);
  } else {
    const paginatedMovements = getPaginatedSlice("stockMovements", todayStockMovements);
    paginatedMovements.items.forEach((movement) => {
      list.appendChild(createTodayStockMovementRowElement(movement));
    });
    list.appendChild(createPaginationControlsElement("stockMovements", todayStockMovements.length));
  }

  panel.append(
    header,
    createOperationalShiftNoteElement("shift-period-note"),
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
  badge.className = withStatusBadge(
    `stock-movements-badge ${getTodayStockMovementTypeClass(movement.movement_type)}`,
    getStockMovementTypeTone(movement.movement_type)
  );
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

function getLowStockReportStatusLabel(status) {
  if (status === "low") {
    return "Stok Rendah";
  }

  if (status === "negative") {
    return "Stok Minus";
  }

  return status || "-";
}

function getLowStockReportStatusClass(status) {
  if (status === "low" || status === "negative") {
    return status;
  }

  return "unknown";
}

function createRoomUsagePeriodFilterElement() {
  const wrapper = document.createElement("div");
  wrapper.className = "period-filter room-usage-period-filter";
  wrapper.setAttribute("aria-label", "Filter periode laporan pemakaian room");

  const buttons = document.createElement("div");
  buttons.className = "period-filter-buttons";

  ROOM_USAGE_PERIOD_OPTIONS.forEach(([period, labelText]) => {
    const button = document.createElement("button");
    button.className = period === roomUsagePeriodFilter
      ? "period-filter-button active"
      : "period-filter-button";
    button.type = "button";
    button.dataset.action = "filter-room-usage-period";
    button.dataset.period = period;
    button.textContent = labelText;
    buttons.appendChild(button);
  });

  wrapper.appendChild(buttons);

  if (roomUsagePeriodFilter === "custom") {
    const custom = document.createElement("div");
    custom.className = "custom-date-filter";

    const startField = document.createElement("div");
    startField.className = "custom-date-field";

    const startLabel = document.createElement("label");
    startLabel.className = "custom-date-label";
    startLabel.textContent = "Tanggal Operasional Mulai";

    const startInput = document.createElement("input");
    startInput.className = "custom-date-input";
    startInput.type = "date";
    startInput.dataset.action = "update-room-usage-custom-start-date";
    startInput.value = roomUsageCustomStartDate;

    startField.append(startLabel, startInput);

    const endField = document.createElement("div");
    endField.className = "custom-date-field";

    const endLabel = document.createElement("label");
    endLabel.className = "custom-date-label";
    endLabel.textContent = "Tanggal Operasional Akhir";

    const endInput = document.createElement("input");
    endInput.className = "custom-date-input";
    endInput.type = "date";
    endInput.dataset.action = "update-room-usage-custom-end-date";
    endInput.value = roomUsageCustomEndDate;

    endField.append(endLabel, endInput);

    const applyButton = document.createElement("button");
    applyButton.className = "period-filter-apply-button";
    applyButton.type = "button";
    applyButton.dataset.action = "apply-room-usage-custom-period";
    applyButton.textContent = "Terapkan";

    custom.append(startField, endField, applyButton);
    wrapper.appendChild(custom);
  }

  if (roomUsagePeriodNotice) {
    const notice = document.createElement("p");
    notice.className = "period-filter-notice";
    notice.textContent = roomUsagePeriodNotice;
    wrapper.appendChild(notice);
  }

  return wrapper;
}

function createRoomUsageSummaryElement(summary) {
  const grid = document.createElement("div");
  grid.className = "room-usage-summary";

  const topRoomLabel = summary.top_room_name
    ? `${summary.top_room_name} (${formatDurationMinutes(summary.top_room_duration_minutes)})`
    : "-";

  [
    ["Total Sesi", Number(summary.total_sessions) || 0],
    ["Total Durasi Terjual", formatDurationMinutes(summary.total_duration_minutes)],
    ["Omzet Room", formatCurrency(summary.total_room_revenue)],
    ["Omzet F&B", formatCurrency(summary.total_fnb_revenue)],
    ["Total Revenue", formatCurrency(summary.total_grand_revenue)],
    ["Room Terpakai", Number(summary.unique_rooms_used) || 0],
    ["Room Terlaris", topRoomLabel],
  ].forEach(([labelText, valueText]) => {
    const card = document.createElement("div");
    card.className = "room-usage-summary-card";

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

function createRoomUsageRowElement(item) {
  const row = document.createElement("article");
  row.className = "room-usage-row";

  [
    ["Room", item.room_name || item.room_id || "-"],
    ["Jumlah Sesi", String(Number(item.session_count) || 0)],
    ["Total Durasi", formatDurationMinutes(item.duration_minutes)],
    ["Omzet Room", formatCurrency(item.room_revenue)],
    ["Omzet F&B", formatCurrency(item.fnb_revenue)],
    ["Total Revenue", formatCurrency(item.grand_revenue)],
    ["Rata-rata Durasi", formatDurationMinutes(item.average_duration_minutes)],
  ].forEach(([labelText, valueText]) => {
    const cell = document.createElement("div");
    cell.className = "room-usage-cell";

    const label = document.createElement("p");
    label.className = "transaction-label";
    label.textContent = labelText;

    const value = document.createElement("p");
    value.className = "transaction-value";
    value.textContent = valueText;

    cell.append(label, value);
    row.appendChild(cell);
  });

  return row;
}

function createRoomUsageTransactionsListElement() {
  const section = document.createElement("section");
  section.className = "room-usage-transactions";
  section.setAttribute("aria-labelledby", "room-usage-transactions-title");

  const title = document.createElement("h3");
  title.className = "room-usage-section-title";
  title.id = "room-usage-transactions-title";
  title.textContent = "Detail Transaksi Room";

  const list = document.createElement("div");
  list.className = "room-usage-transactions-list";

  if (isLoadingRoomUsageReport) {
    list.appendChild(createStateMessage("Memuat detail transaksi room..."));
  } else if (roomUsageTransactions.length === 0) {
    const empty = document.createElement("p");
    empty.className = "state-message";
    empty.textContent = "Belum ada pemakaian room pada shift/periode ini.";
    list.appendChild(empty);
  } else {
    const paginatedTransactions = getPaginatedSlice("roomUsageTransactions", roomUsageTransactions);
    paginatedTransactions.items.forEach((transaction) => {
      list.appendChild(createRoomUsageTransactionRowElement(transaction));
    });
    list.appendChild(createPaginationControlsElement("roomUsageTransactions", roomUsageTransactions.length));
  }

  section.append(title, list);

  return section;
}

function createRoomUsageTransactionRowElement(transaction) {
  const row = document.createElement("article");
  row.className = "room-usage-transaction-row";

  const statusTone = getPaymentStatusTone(transaction?.payment_status);

  [
    ["ID Transaksi", transaction?.transaction_id || "-"],
    ["Room", transaction?.room_name || transaction?.room_id || "-"],
    ["Mulai", transaction?.start_time || "-"],
    ["Selesai", transaction?.end_time || "-"],
    ["Durasi", formatDurationMinutes(transaction?.duration_minutes)],
    ["Total Room", formatCurrency(transaction?.room_total)],
    ["F&B", formatCurrency(transaction?.fnb_total)],
    ["Grand Total", formatCurrency(transaction?.grand_total)],
    ["Status Bayar", formatPaymentStatusLabel(transaction?.payment_status), "payment-status"],
    ["Kasir", transaction?.cashier_name || "-"],
  ].forEach(([labelText, valueText, modifier]) => {
    const cell = document.createElement("div");
    cell.className = "room-usage-cell";

    const label = document.createElement("p");
    label.className = "transaction-label";
    label.textContent = labelText;

    const value = document.createElement("p");
    value.className = modifier === "payment-status"
      ? withStatusBadge("transaction-value", statusTone)
      : "transaction-value";
    value.textContent = valueText;

    cell.append(label, value);
    row.appendChild(cell);
  });

  return row;
}

function createRoomUsageReportPanelElement() {
  const panel = document.createElement("section");
  panel.className = "room-usage-report";
  panel.setAttribute("aria-labelledby", "room-usage-report-title");

  const header = document.createElement("div");
  header.className = "room-usage-report-header";

  const titleGroup = document.createElement("div");

  const title = document.createElement("h2");
  title.className = "room-usage-report-title";
  title.id = "room-usage-report-title";
  title.textContent = `Laporan Pemakaian Room - ${getRoomUsagePeriodTitleSuffix()}`;

  const subtitle = document.createElement("p");
  subtitle.className = "room-usage-report-subtitle";
  subtitle.textContent = "Mengikuti tanggal operasional karaoke. Transaksi sebelum pukul 10:00 masuk shift hari sebelumnya.";

  titleGroup.append(title, subtitle);

  const actions = document.createElement("div");
  actions.className = "room-usage-report-actions";

  const refreshButton = document.createElement("button");
  refreshButton.className = "room-usage-report-button";
  refreshButton.type = "button";
  refreshButton.dataset.action = "refresh-room-usage-report";
  refreshButton.disabled = isLoadingRoomUsageReport || !API_BASE_URL.trim();
  refreshButton.textContent = isLoadingRoomUsageReport ? "Memuat..." : "Refresh Laporan Room";

  actions.appendChild(refreshButton);
  header.append(titleGroup, actions);

  const summary = roomUsageSummary || {
    total_sessions: 0,
    total_duration_minutes: 0,
    total_room_revenue: 0,
    total_fnb_revenue: 0,
    total_grand_revenue: 0,
    unique_rooms_used: 0,
    top_room_name: "",
    top_room_duration_minutes: 0,
  };

  const roomUsageSection = document.createElement("section");
  roomUsageSection.className = "room-usage-section";
  roomUsageSection.setAttribute("aria-labelledby", "room-usage-list-title");

  const roomUsageTitle = document.createElement("h3");
  roomUsageTitle.className = "room-usage-section-title";
  roomUsageTitle.id = "room-usage-list-title";
  roomUsageTitle.textContent = "Pemakaian per Room";

  const roomUsageList = document.createElement("div");
  roomUsageList.className = "room-usage-list";

  if (isLoadingRoomUsageReport) {
    roomUsageList.appendChild(createStateMessage("Memuat laporan pemakaian room..."));
  } else if (roomUsageItems.length === 0) {
    const empty = document.createElement("p");
    empty.className = "state-message";
    empty.textContent = "Belum ada pemakaian room pada shift/periode ini.";
    roomUsageList.appendChild(empty);
  } else {
    const paginatedUsage = getPaginatedSlice("roomUsage", roomUsageItems);
    paginatedUsage.items.forEach((item) => {
      roomUsageList.appendChild(createRoomUsageRowElement(item));
    });
    roomUsageList.appendChild(createPaginationControlsElement("roomUsage", roomUsageItems.length));
  }

  roomUsageSection.append(roomUsageTitle, roomUsageList);

  panel.append(
    header,
    createRoomUsagePeriodFilterElement(),
    createRoomUsageSummaryElement(summary),
    roomUsageSection,
    createRoomUsageTransactionsListElement()
  );

  return panel;
}

function formatDecimal(value, maximumFractionDigits = 1) {
  const safeValue = Number.isFinite(Number(value)) ? Number(value) : 0;

  return safeValue.toLocaleString("id-ID", {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  });
}

function formatHours(value) {
  return `${formatDecimal(value)} jam`;
}

function formatPercent(value) {
  return `${formatDecimal(value)}%`;
}

function formatDurationMinutesAndHours(minutes) {
  const safeMinutes = Number(minutes) || 0;
  const safeHours = safeMinutes / 60;

  return `${safeMinutes} menit / ${formatDecimal(safeHours)} jam`;
}

function getActiveRoomsForOccupancy() {
  return rooms.filter((room) => normalizeRoomStatus(room?.status) !== "maintenance");
}

function getRoomUsagePeriodDayCount() {
  if (roomUsagePeriodFilter === "last7days") {
    return 7;
  }

  if (roomUsagePeriodFilter === "custom" && roomUsageCustomStartDate && roomUsageCustomEndDate) {
    const startDate = new Date(`${roomUsageCustomStartDate}T00:00:00`);
    const endDate = new Date(`${roomUsageCustomEndDate}T00:00:00`);
    const diffMs = endDate.getTime() - startDate.getTime();

    if (Number.isFinite(diffMs) && diffMs >= 0) {
      return Math.floor(diffMs / 86400000) + 1;
    }
  }

  if (roomUsagePeriodFilter === "thisMonth") {
    return new Date().getDate();
  }

  if (roomUsagePeriodFilter === "all") {
    const operationalDates = new Set(
      roomUsageTransactions
        .map((transaction) => transaction?.operational_date)
        .filter(Boolean)
    );

    return Math.max(operationalDates.size, 1);
  }

  return 1;
}

function getOccupancyStatus(utilization) {
  if (utilization <= 0) {
    return {
      label: "Belum Terpakai",
      tone: "neutral",
    };
  }

  if (utilization >= 70) {
    return {
      label: "Tinggi",
      tone: "danger",
    };
  }

  if (utilization >= 40) {
    return {
      label: "Sedang",
      tone: "warning",
    };
  }

  return {
    label: "Rendah",
    tone: "info",
  };
}

function buildRoomOccupancyRows() {
  const activeRooms = getActiveRoomsForOccupancy();
  const usageByRoomId = new Map();
  const usageByRoomName = new Map();

  roomUsageItems.forEach((item) => {
    if (item?.room_id) {
      usageByRoomId.set(String(item.room_id), item);
    }

    if (item?.room_name) {
      usageByRoomName.set(String(item.room_name), item);
    }
  });

  const rows = activeRooms.map((room) => {
    const usage = usageByRoomId.get(String(room.room_id)) || usageByRoomName.get(String(room.room_name)) || {};
    const durationMinutes = Number(usage.duration_minutes) || Number(usage.total_duration_minutes) || 0;
    const usedHours = durationMinutes / 60;
    const roomRevenue = Number(usage.room_revenue) || Number(usage.total_room_revenue) || 0;
    const utilization = OPERATIONAL_WINDOW_MINUTES > 0
      ? (durationMinutes / OPERATIONAL_WINDOW_MINUTES) * 100
      : 0;
    const revenuePerHour = usedHours > 0 ? roomRevenue / usedHours : 0;

    return {
      room_id: room.room_id || usage.room_id || "",
      room_name: room.room_name || usage.room_name || "Belum ada data",
      session_count: Number(usage.session_count) || Number(usage.total_sessions) || 0,
      duration_minutes: durationMinutes,
      room_revenue: roomRevenue,
      utilization,
      revenue_per_hour: revenuePerHour,
      status: getOccupancyStatus(utilization),
    };
  });

  roomUsageItems.forEach((item) => {
    const roomId = String(item?.room_id || "");
    const roomName = String(item?.room_name || "");
    const alreadyExists = rows.some((row) => (
      (roomId && row.room_id === roomId) ||
      (roomName && row.room_name === roomName)
    ));

    if (alreadyExists) {
      return;
    }

    const durationMinutes = Number(item.duration_minutes) || Number(item.total_duration_minutes) || 0;
    const usedHours = durationMinutes / 60;
    const roomRevenue = Number(item.room_revenue) || Number(item.total_room_revenue) || 0;
    const utilization = OPERATIONAL_WINDOW_MINUTES > 0
      ? (durationMinutes / OPERATIONAL_WINDOW_MINUTES) * 100
      : 0;

    rows.push({
      room_id: roomId,
      room_name: item.room_name || item.room_id || "Belum ada data",
      session_count: Number(item.session_count) || Number(item.total_sessions) || 0,
      duration_minutes: durationMinutes,
      room_revenue: roomRevenue,
      utilization,
      revenue_per_hour: usedHours > 0 ? roomRevenue / usedHours : 0,
      status: getOccupancyStatus(utilization),
    });
  });

  return rows.sort((a, b) => b.duration_minutes - a.duration_minutes || b.room_revenue - a.room_revenue);
}

function buildRoomOccupancySummary(rows) {
  const activeRoomCount = getActiveRoomsForOccupancy().length;
  const periodDayCount = getRoomUsagePeriodDayCount();
  const totalAvailableMinutes = activeRoomCount * OPERATIONAL_WINDOW_MINUTES * periodDayCount;
  const totalUsedMinutes = Number(roomUsageSummary?.total_duration_minutes) || 0;
  const totalUsedHours = Number(roomUsageSummary?.total_duration_hours) || totalUsedMinutes / 60;
  const totalRoomRevenue = Number(roomUsageSummary?.total_room_revenue) || 0;
  const occupancyRate = totalAvailableMinutes > 0
    ? (totalUsedMinutes / totalAvailableMinutes) * 100
    : 0;
  const revenuePerUsedHour = totalUsedHours > 0 ? totalRoomRevenue / totalUsedHours : 0;
  const productiveRoom = rows.reduce((best, row) => {
    if (!best || row.room_revenue > best.room_revenue) {
      return row;
    }

    if (row.room_revenue === best.room_revenue && row.duration_minutes > best.duration_minutes) {
      return row;
    }

    return best;
  }, null);
  const lowestUsageRoom = rows.reduce((lowest, row) => {
    if (!lowest || row.duration_minutes < lowest.duration_minutes) {
      return row;
    }

    if (row.duration_minutes === lowest.duration_minutes && row.room_revenue < lowest.room_revenue) {
      return row;
    }

    return lowest;
  }, null);

  return {
    activeRoomCount,
    periodDayCount,
    totalAvailableMinutes,
    totalAvailableHours: totalAvailableMinutes / 60,
    totalUsedMinutes,
    totalUsedHours,
    occupancyRate,
    productiveRoom,
    lowestUsageRoom,
    revenuePerUsedHour,
    totalSessions: Number(roomUsageSummary?.total_sessions) || 0,
  };
}

function createRoomOccupancySummaryElement(summary) {
  const grid = document.createElement("div");
  grid.className = "room-occupancy-summary";

  const productiveLabel = summary.productiveRoom
    ? `${summary.productiveRoom.room_name} (${formatCurrency(summary.productiveRoom.room_revenue)})`
    : "Belum ada data";
  const lowestLabel = summary.lowestUsageRoom
    ? `${summary.lowestUsageRoom.room_name} (${formatDurationMinutesAndHours(summary.lowestUsageRoom.duration_minutes)})`
    : "Belum ada data";

  [
    ["Total Room Aktif", `${summary.activeRoomCount} room`],
    ["Total Jam Tersedia", formatHours(summary.totalAvailableHours)],
    ["Total Jam Terpakai", formatDurationMinutesAndHours(summary.totalUsedMinutes)],
    ["Occupancy Rate", formatPercent(summary.occupancyRate)],
    ["Room Terproduktif", productiveLabel],
    ["Room Terendah Pemakaian", lowestLabel],
    ["Revenue per Jam", formatCurrency(summary.revenuePerUsedHour)],
    ["Total Session", `${summary.totalSessions} sesi`],
  ].forEach(([labelText, valueText]) => {
    const card = document.createElement("article");
    card.className = "room-occupancy-summary-card";

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

function createRoomOccupancyTableElement(rows) {
  const wrapper = document.createElement("div");
  wrapper.className = "room-occupancy-table-wrap";

  const table = document.createElement("table");
  table.className = "room-occupancy-table";

  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");

  ["Room", "Session", "Durasi", "Revenue", "Utilization", "Revenue/Jam", "Status"].forEach((labelText) => {
    const th = document.createElement("th");
    th.scope = "col";
    th.textContent = labelText;
    headerRow.appendChild(th);
  });

  thead.appendChild(headerRow);

  const tbody = document.createElement("tbody");

  if (rows.length === 0) {
    const emptyRow = document.createElement("tr");
    const emptyCell = document.createElement("td");
    emptyCell.colSpan = 7;
    emptyCell.textContent = "Belum ada data";
    emptyRow.appendChild(emptyCell);
    tbody.appendChild(emptyRow);
  } else {
    rows.forEach((row) => {
      const tr = document.createElement("tr");

      [
        row.room_name || "Belum ada data",
        `${row.session_count} sesi`,
        formatDurationMinutesAndHours(row.duration_minutes),
        formatCurrency(row.room_revenue),
        formatPercent(row.utilization),
        formatCurrency(row.revenue_per_hour),
      ].forEach((valueText) => {
        const td = document.createElement("td");
        td.textContent = valueText;
        tr.appendChild(td);
      });

      const statusCell = document.createElement("td");
      const badge = document.createElement("span");
      badge.className = withStatusBadge("room-occupancy-badge", row.status.tone);
      badge.textContent = row.status.label;
      statusCell.appendChild(badge);
      tr.appendChild(statusCell);
      tbody.appendChild(tr);
    });
  }

  table.append(thead, tbody);
  wrapper.appendChild(table);

  return wrapper;
}

function createRoomOccupancyElement() {
  const section = document.createElement("section");
  section.className = "room-occupancy";
  section.setAttribute("aria-labelledby", "room-occupancy-title");

  const header = document.createElement("div");
  header.className = "room-occupancy-header";

  const titleGroup = document.createElement("div");

  const title = document.createElement("h2");
  title.className = "room-occupancy-title";
  title.id = "room-occupancy-title";
  title.textContent = "Room Occupancy & Utilization";

  const subtitle = document.createElement("p");
  subtitle.className = "room-occupancy-subtitle";
  subtitle.textContent = `Mengikuti filter laporan room: ${getRoomUsagePeriodTitleSuffix()}. Jam operasional ${String(OPERATIONAL_OPEN_HOUR).padStart(2, "0")}:00-${String(OPERATIONAL_CLOSE_HOUR).padStart(2, "0")}:00.`;

  titleGroup.append(title, subtitle);
  header.appendChild(titleGroup);

  const rows = buildRoomOccupancyRows();
  const summary = buildRoomOccupancySummary(rows);

  if (isLoadingRoomUsageReport) {
    section.append(header, createStateMessage("Memuat occupancy room..."));
    return section;
  }

  section.append(
    header,
    createRoomOccupancySummaryElement(summary),
    createRoomOccupancyTableElement(rows)
  );

  return section;
}

function formatOwnerDurationSummary(summary) {
  const totalMinutes = Number(summary?.total_duration_minutes) || 0;
  const totalHours = Number(summary?.total_duration_hours) || totalMinutes / 60;
  const formattedHours = totalHours.toLocaleString("id-ID", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  });

  return `${totalMinutes} menit / ${formattedHours} jam`;
}

function createOwnerDashboardMetricCard({ label, value, badgeText, badgeTone, detail }) {
  const card = document.createElement("article");
  card.className = "owner-dashboard-card";

  const header = document.createElement("div");
  header.className = "owner-dashboard-card-header";

  const labelElement = document.createElement("p");
  labelElement.className = "owner-dashboard-label";
  labelElement.textContent = label;

  header.appendChild(labelElement);

  if (badgeText) {
    const badge = document.createElement("span");
    badge.className = withStatusBadge("owner-dashboard-badge", badgeTone);
    badge.textContent = badgeText;
    header.appendChild(badge);
  }

  const valueElement = document.createElement("p");
  valueElement.className = "owner-dashboard-value";
  valueElement.textContent = value;

  card.append(header, valueElement);

  if (detail) {
    const detailElement = document.createElement("p");
    detailElement.className = "owner-dashboard-detail";
    detailElement.textContent = detail;
    card.appendChild(detailElement);
  }

  return card;
}

function createRoomTvControlElement(room) {
  const tvDevice = room.tv_device || normalizeRoomTvDevice(null);
  const panel = document.createElement("div");
  panel.className = "room-tv-control";

  const badge = document.createElement("p");
  badge.className = withStatusBadge("room-tv-badge", getTvStatusTone(tvDevice));
  badge.textContent = getTvStatusBadgeText(tvDevice);
  panel.appendChild(badge);

  const lastCommand = document.createElement("p");
  lastCommand.className = "room-tv-last-command";
  lastCommand.textContent = `Last command: ${getTvActionLabel(tvDevice.last_command)}`;
  panel.appendChild(lastCommand);

  if (!canControlTv()) {
    return panel;
  }

  const actions = document.createElement("div");
  actions.className = "room-tv-actions";

  [
    ["power_on", "TV ON"],
    ["power_off", "TV OFF"],
    ["test", "TEST"],
  ].forEach(([tvAction, labelText]) => {
    const button = document.createElement("button");
    button.className = "room-tv-button";
    button.type = "button";
    button.dataset.action = tvAction === "power_off" ? "confirm-tv-off" : "send-tv-command";
    button.dataset.tvAction = tvAction;
    button.dataset.roomId = room.room_id;
    button.dataset.tvDeviceId = tvDevice.tv_device_id || "";
    button.disabled = isSendingTvCommand || !API_BASE_URL.trim() || tvDevice.configured === false;
    button.textContent = isSendingTvCommand ? "Kirim..." : labelText;
    actions.appendChild(button);
  });

  panel.appendChild(actions);
  return panel;
}

function createOwnerDashboardListCard({ label, value, badgeText, badgeTone, items, emptyText, detailBuilder }) {
  const card = createOwnerDashboardMetricCard({ label, value, badgeText, badgeTone });
  const list = document.createElement("div");
  list.className = "owner-dashboard-mini-list";

  if (items.length === 0) {
    const empty = document.createElement("p");
    empty.className = "owner-dashboard-empty";
    empty.textContent = emptyText;
    list.appendChild(empty);
  } else {
    items.slice(0, 3).forEach((item) => {
      const row = document.createElement("div");
      row.className = "owner-dashboard-mini-row";

      const name = document.createElement("span");
      name.className = "owner-dashboard-mini-name";
      name.textContent = detailBuilder(item).name;

      const meta = document.createElement("span");
      meta.className = "owner-dashboard-mini-meta";
      meta.textContent = detailBuilder(item).meta;

      row.append(name, meta);
      list.appendChild(row);
    });
  }

  card.appendChild(list);
  return card;
}

function createOwnerDashboardElement() {
  const section = document.createElement("section");
  section.className = "owner-dashboard";
  section.setAttribute("aria-labelledby", "owner-dashboard-title");

  const header = document.createElement("div");
  header.className = "owner-dashboard-header";

  const titleGroup = document.createElement("div");

  const title = document.createElement("h2");
  title.className = "owner-dashboard-title";
  title.id = "owner-dashboard-title";
  title.textContent = "Dashboard Owner";

  const subtitle = document.createElement("p");
  subtitle.className = "owner-dashboard-subtitle";
  subtitle.textContent = "Ringkasan cepat shift aktif berdasarkan tanggal operasional karaoke.";

  titleGroup.append(title, subtitle);

  const refreshButton = document.createElement("button");
  refreshButton.className = "owner-dashboard-button";
  refreshButton.type = "button";
  refreshButton.dataset.action = "refresh-owner-dashboard";
  refreshButton.disabled = isLoadingOwnerDashboard || !API_BASE_URL.trim();
  refreshButton.textContent = isLoadingOwnerDashboard ? "Memuat..." : "Refresh Dashboard";

  header.append(titleGroup, refreshButton);

  const summary = ownerRoomUsageSummary || {
    total_sessions: 0,
    total_duration_minutes: 0,
    total_duration_hours: 0,
    total_room_revenue: 0,
    total_fnb_revenue: 0,
    total_grand_revenue: 0,
    paid_revenue: 0,
    unpaid_revenue: 0,
    top_room_name: "",
    top_room_duration_minutes: 0,
  };
  const lowStockItems = getOwnerLowStockItems();
  const activeSessions = getOwnerActiveSessions();
  const topRoomName = summary.top_room_name || "-";
  const topRoomDetail = summary.top_room_duration_minutes
    ? `Durasi ${formatDurationMinutes(summary.top_room_duration_minutes)}`
    : "Belum ada room terlaris di shift ini.";

  const grid = document.createElement("div");
  grid.className = "owner-dashboard-grid";

  [
    {
      label: "Total Revenue Shift Aktif",
      value: formatCurrency(summary.total_grand_revenue),
      detail: `${Number(summary.total_sessions) || 0} sesi tercatat`,
    },
    {
      label: "Paid Revenue",
      value: formatCurrency(summary.paid_revenue),
      badgeText: "Paid",
      badgeTone: "success",
    },
    {
      label: "Revenue Room",
      value: formatCurrency(summary.total_room_revenue),
    },
    {
      label: "Revenue F&B",
      value: formatCurrency(summary.total_fnb_revenue),
    },
    {
      label: "Unpaid Revenue",
      value: formatCurrency(summary.unpaid_revenue),
      badgeText: "Unpaid",
      badgeTone: Number(summary.unpaid_revenue) > 0 ? "warning" : "success",
    },
    {
      label: "Total Session",
      value: `${Number(summary.total_sessions) || 0} sesi`,
    },
    {
      label: "Room Terlaris",
      value: topRoomName,
      detail: topRoomDetail,
    },
    {
      label: "Total Durasi Room",
      value: formatOwnerDurationSummary(summary),
    },
  ].forEach((item) => {
    grid.appendChild(createOwnerDashboardMetricCard(item));
  });

  grid.appendChild(createOwnerDashboardListCard({
    label: "Stok Rendah",
    value: `${lowStockItems.length} item`,
    badgeText: "Stok Rendah",
    badgeTone: lowStockItems.length > 0 ? "warning" : "success",
    items: lowStockItems,
    emptyText: "Tidak ada stok rendah.",
    detailBuilder: (item) => ({
      name: item.stock_item_name || item.stock_item_id || "-",
      meta: `${Number(item.stock_qty) || 0}/${Number(item.min_stock) || 0} ${item.unit || ""}`.trim(),
    }),
  }));

  grid.appendChild(createOwnerDashboardListCard({
    label: "Sesi Aktif",
    value: `${activeSessions.length} room`,
    badgeText: activeSessions.length > 0 ? "Room Occupied" : "Room Available",
    badgeTone: activeSessions.length > 0 ? "danger" : "success",
    items: activeSessions,
    emptyText: "Semua room available.",
    detailBuilder: (room) => ({
      name: room.room_name || room.room_id || "-",
      meta: room.scheduled_end_time ? `Sampai ${room.scheduled_end_time}` : "Sedang occupied",
    }),
  }));

  section.append(header, createOperationalShiftNoteElement("owner-dashboard-note"), grid);

  return section;
}

function createTodayFnbSalesReportPanelElement() {
  const panel = document.createElement("section");
  panel.className = "fnb-sales-report-panel";
  panel.setAttribute("aria-labelledby", "fnb-sales-report-title");

  const header = document.createElement("div");
  header.className = "fnb-sales-report-header";

  const titleGroup = document.createElement("div");

  const title = document.createElement("h2");
  title.className = "fnb-sales-report-title";
  title.id = "fnb-sales-report-title";
  title.textContent = "Laporan F&B - Shift Aktif";

  const subtitle = document.createElement("p");
  subtitle.className = "fnb-sales-report-subtitle";
  subtitle.textContent = "Ringkasan penjualan F&B billed shift aktif dan rekomendasi restock stok rendah. Mengikuti tanggal operasional karaoke.";

  titleGroup.append(title, subtitle);

  const actions = document.createElement("div");
  actions.className = "fnb-sales-report-actions";

  const refreshButton = document.createElement("button");
  refreshButton.className = "fnb-sales-report-button";
  refreshButton.type = "button";
  refreshButton.dataset.action = "refresh-fnb-sales-report";
  refreshButton.disabled = isLoadingFnbSalesReport || !API_BASE_URL.trim();
  refreshButton.textContent = isLoadingFnbSalesReport ? "Memuat..." : "Refresh Laporan F&B";

  actions.appendChild(refreshButton);
  header.append(titleGroup, actions);

  const summary = todayFnbSalesSummary || {
    total_fnb_orders: 0,
    total_items_sold: 0,
    total_fnb_sales: 0,
    top_menu_name: "-",
    top_menu_quantity: 0,
    low_stock_count: 0,
    negative_stock_count: 0,
  };
  const topMenuLabel = summary.top_menu_name
    ? `${summary.top_menu_name} (${Number(summary.top_menu_quantity) || 0})`
    : "-";

  panel.append(
    header,
    createOperationalShiftNoteElement("shift-period-note"),
    createFnbSalesReportSummaryElement(summary, topMenuLabel),
    createFnbMenuSalesSectionElement(),
    createLowStockReportSectionElement()
  );

  return panel;
}

function createFnbSalesReportSummaryElement(summary, topMenuLabel) {
  const grid = document.createElement("div");
  grid.className = "fnb-sales-report-summary";

  [
    ["Total Order F&B", Number(summary.total_fnb_orders) || 0],
    ["Total Item Terjual", Number(summary.total_items_sold) || 0],
    ["Omzet F&B Shift Aktif", formatCurrency(summary.total_fnb_sales)],
    ["Menu Terlaris", topMenuLabel],
    ["Stok Rendah", Number(summary.low_stock_count) || 0],
    ["Stok Minus", Number(summary.negative_stock_count) || 0],
  ].forEach(([labelText, valueText]) => {
    const card = document.createElement("div");
    card.className = "fnb-sales-report-summary-card";

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

function createFnbMenuSalesSectionElement() {
  const section = document.createElement("section");
  section.className = "fnb-sales-report-section";
  section.setAttribute("aria-labelledby", "fnb-menu-sales-title");

  const title = document.createElement("h3");
  title.className = "fnb-sales-report-section-title";
  title.id = "fnb-menu-sales-title";
  title.textContent = "Penjualan per Menu";

  const list = document.createElement("div");
  list.className = "fnb-menu-sales-list";

  if (isLoadingFnbSalesReport) {
    list.appendChild(createStateMessage("Memuat laporan penjualan F&B..."));
  } else if (todayFnbMenuSales.length === 0) {
    const empty = document.createElement("p");
    empty.className = "fnb-sales-report-empty";
    empty.textContent = "Belum ada penjualan F&B pada shift aktif.";
    list.appendChild(empty);
  } else {
    const paginatedMenuSales = getPaginatedSlice("fnbMenuSales", todayFnbMenuSales);
    paginatedMenuSales.items.forEach((menuSale) => {
      list.appendChild(createFnbMenuSalesRowElement(menuSale));
    });
    list.appendChild(createPaginationControlsElement("fnbMenuSales", todayFnbMenuSales.length));
  }

  section.append(title, list);

  return section;
}

function createFnbMenuSalesRowElement(menuSale) {
  const row = document.createElement("article");
  row.className = "fnb-menu-sales-row";

  const info = document.createElement("div");

  const name = document.createElement("h4");
  name.className = "fnb-menu-sales-name";
  name.textContent = menuSale.menu_name || menuSale.menu_id || "-";

  const meta = document.createElement("p");
  meta.className = "fnb-menu-sales-meta";
  meta.textContent = menuSale.category || "-";

  info.append(name, meta);

  const qty = document.createElement("p");
  qty.className = "fnb-menu-sales-qty";
  qty.textContent = String(Number(menuSale.quantity_sold) || 0);

  const sales = document.createElement("p");
  sales.className = "fnb-menu-sales-total";
  sales.textContent = formatCurrency(menuSale.gross_sales);

  const orders = document.createElement("p");
  orders.className = "fnb-menu-sales-orders";
  orders.textContent = `${Number(menuSale.order_count) || 0} order`;

  row.append(info, qty, sales, orders);

  return row;
}

function createLowStockReportSectionElement() {
  const section = document.createElement("section");
  section.className = "fnb-sales-report-section";
  section.setAttribute("aria-labelledby", "low-stock-report-title");

  const title = document.createElement("h3");
  title.className = "fnb-sales-report-section-title";
  title.id = "low-stock-report-title";
  title.textContent = "Stok Rendah & Rekomendasi Restock";

  const list = document.createElement("div");
  list.className = "low-stock-report-list";

  if (isLoadingFnbSalesReport) {
    list.appendChild(createStateMessage("Memuat data stok rendah..."));
  } else if (lowStockReportItems.length === 0) {
    const empty = document.createElement("p");
    empty.className = "fnb-sales-report-empty";
    empty.textContent = "Tidak ada stok rendah saat ini.";
    list.appendChild(empty);
  } else {
    const paginatedLowStock = getPaginatedSlice("lowStockItems", lowStockReportItems);
    paginatedLowStock.items.forEach((item) => {
      list.appendChild(createLowStockReportRowElement(item));
    });
    list.appendChild(createPaginationControlsElement("lowStockItems", lowStockReportItems.length));
  }

  section.append(title, list);

  return section;
}

function createLowStockReportRowElement(item) {
  const row = document.createElement("article");
  row.className = "low-stock-report-row";

  const header = document.createElement("div");
  header.className = "low-stock-report-row-header";

  const titleGroup = document.createElement("div");

  const name = document.createElement("h4");
  name.className = "low-stock-report-name";
  name.textContent = item.stock_item_name || item.stock_item_id || "-";

  const meta = document.createElement("p");
  meta.className = "low-stock-report-meta";
  meta.textContent = `${item.category || "-"} - Min: ${Number(item.min_stock) || 0} ${item.unit || ""}`.trim();

  titleGroup.append(name, meta);

  const badge = document.createElement("span");
  badge.className = withStatusBadge(
    `low-stock-report-badge ${getLowStockReportStatusClass(item.stock_status)}`,
    getInventoryStockStatusTone(item.stock_status)
  );
  badge.textContent = getLowStockReportStatusLabel(item.stock_status);

  header.append(titleGroup, badge);

  const details = document.createElement("div");
  details.className = "low-stock-report-details";

  [
    ["Stok Saat Ini", `${Number(item.stock_qty) || 0} ${item.unit || ""}`.trim()],
    ["Rekomendasi Restock", `${Number(item.suggested_restock_qty) || 0} ${item.unit || ""}`.trim()],
  ].forEach(([labelText, valueText]) => {
    const detail = document.createElement("div");
    detail.className = "low-stock-report-detail-item";

    const label = document.createElement("p");
    label.className = "low-stock-report-detail-label";
    label.textContent = labelText;

    const value = document.createElement("p");
    value.className = "low-stock-report-detail-value";
    value.textContent = valueText;

    detail.append(label, value);
    details.appendChild(detail);
  });

  row.append(header, details);

  if (item.recommendation) {
    const recommendation = document.createElement("p");
    recommendation.className = "low-stock-report-recommendation";
    recommendation.textContent = item.recommendation;
    row.appendChild(recommendation);
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
  title.textContent = `Riwayat Transaksi - ${getTransactionPeriodTitleSuffix()}`;

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
    const paginatedTransactions = getPaginatedSlice("transactions", filteredTransactions);
    paginatedTransactions.items.forEach((transaction) => {
      list.appendChild(createTransactionRowElement(transaction));
    });
    list.appendChild(createPaginationControlsElement("transactions", filteredTransactions.length));
  }

  history.append(
    header,
    createTransactionPeriodFilterElement(),
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
  title.textContent = `Riwayat Closing - ${getTransactionPeriodTitleSuffix()}`;

  header.appendChild(title);

  const list = document.createElement("div");
  list.className = "cashier-closing-history-list";

  if (todayCashierClosings.length === 0) {
    const empty = document.createElement("p");
    empty.className = "state-message";
    empty.textContent = getEmptyCashierClosingMessage();
    list.appendChild(empty);
  } else {
    const paginatedClosings = getPaginatedSlice("cashierClosings", todayCashierClosings);
    paginatedClosings.items.forEach((closing) => {
      list.appendChild(createCashierClosingRowElement(closing));
    });
    list.appendChild(createPaginationControlsElement("cashierClosings", todayCashierClosings.length));
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

function createTransactionPeriodFilterElement() {
  const wrapper = document.createElement("div");
  wrapper.className = "period-filter";
  wrapper.setAttribute("aria-label", "Filter periode transaksi");

  const buttons = document.createElement("div");
  buttons.className = "period-filter-buttons";

  TRANSACTION_PERIOD_OPTIONS.forEach(([period, labelText]) => {
    const button = document.createElement("button");
    button.className = period === transactionPeriodFilter
      ? "period-filter-button active"
      : "period-filter-button";
    button.type = "button";
    button.dataset.action = "filter-transaction-period";
    button.dataset.period = period;
    button.textContent = labelText;
    buttons.appendChild(button);
  });

  wrapper.appendChild(buttons);
  wrapper.appendChild(createOperationalShiftNoteElement("operational-date-note"));

  if (transactionPeriodFilter === "custom") {
    const custom = document.createElement("div");
    custom.className = "custom-date-filter";

    const startField = document.createElement("div");
    startField.className = "custom-date-field";

    const startLabel = document.createElement("label");
    startLabel.className = "custom-date-label";
    startLabel.textContent = "Tanggal Operasional Mulai";

    const startInput = document.createElement("input");
    startInput.className = "custom-date-input";
    startInput.type = "date";
    startInput.dataset.action = "update-transaction-custom-start-date";
    startInput.value = transactionCustomStartDate;

    startField.append(startLabel, startInput);

    const endField = document.createElement("div");
    endField.className = "custom-date-field";

    const endLabel = document.createElement("label");
    endLabel.className = "custom-date-label";
    endLabel.textContent = "Tanggal Operasional Akhir";

    const endInput = document.createElement("input");
    endInput.className = "custom-date-input";
    endInput.type = "date";
    endInput.dataset.action = "update-transaction-custom-end-date";
    endInput.value = transactionCustomEndDate;

    endField.append(endLabel, endInput);

    const applyButton = document.createElement("button");
    applyButton.className = "period-filter-apply-button";
    applyButton.type = "button";
    applyButton.dataset.action = "apply-transaction-custom-period";
    applyButton.textContent = "Terapkan";

    custom.append(startField, endField, applyButton);
    wrapper.appendChild(custom);
  }

  if (transactionPeriodNotice) {
    const notice = document.createElement("p");
    notice.className = "period-filter-notice";
    notice.textContent = transactionPeriodNotice;
    wrapper.appendChild(notice);
  }

  return wrapper;
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
      value.className = labelText === "Status"
        ? withStatusBadge("transaction-value", getPaymentStatusTone(transaction?.payment_status))
        : "transaction-value";
      value.textContent = valueText;
      item.append(label, value);

      if (modifierClass === "transaction-has-fnb") {
        const badge = document.createElement("span");
        badge.className = withStatusBadge("transaction-fnb-badge", "warning");
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

function queryDashboard(selector) {
  return dashboardShell ? dashboardShell.querySelector(selector) : null;
}

function getPaginationState(key) {
  if (!paginationState[key]) {
    paginationState[key] = { page: 1 };
  }

  return paginationState[key];
}

function getPaginationTotalPages(totalItems) {
  return Math.max(1, Math.ceil(totalItems / PAGINATION_PAGE_SIZE));
}

function resetPaginationPage(key) {
  getPaginationState(key).page = 1;
}

function setPaginationPage(key, page) {
  const state = getPaginationState(key);
  const totalPages = getPaginationTotalPages(state.totalItems || 0);
  state.page = Math.max(1, Math.min(Number(page) || 1, totalPages));
  renderRooms();
}

function clampPaginationPage(key, totalItems) {
  const state = getPaginationState(key);
  const totalPages = getPaginationTotalPages(totalItems);
  state.totalItems = totalItems;

  if (state.page > totalPages) {
    state.page = totalPages;
  }

  if (state.page < 1) {
    state.page = 1;
  }
}

function getPaginatedSlice(key, items) {
  const sourceItems = Array.isArray(items) ? items : [];
  const totalItems = sourceItems.length;

  clampPaginationPage(key, totalItems);

  const state = getPaginationState(key);
  const page = state.page;
  const startIndex = (page - 1) * PAGINATION_PAGE_SIZE;
  const endIndex = Math.min(startIndex + PAGINATION_PAGE_SIZE, totalItems);

  return {
    items: sourceItems.slice(startIndex, endIndex),
    page,
    totalPages: getPaginationTotalPages(totalItems),
    totalItems,
    rangeStart: totalItems === 0 ? 0 : startIndex + 1,
    rangeEnd: endIndex,
  };
}

function createPaginationControlsElement(key, totalItems) {
  if (totalItems <= PAGINATION_PAGE_SIZE) {
    return document.createDocumentFragment();
  }

  clampPaginationPage(key, totalItems);

  const state = getPaginationState(key);
  const page = state.page;
  const totalPages = getPaginationTotalPages(totalItems);
  const rangeStart = (page - 1) * PAGINATION_PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGINATION_PAGE_SIZE, totalItems);

  const wrapper = document.createElement("div");
  wrapper.className = "pagination";

  const info = document.createElement("p");
  info.className = "pagination-info";
  info.textContent = `Menampilkan ${rangeStart}-${rangeEnd} dari ${totalItems} data · Halaman ${page} dari ${totalPages}`;

  const actions = document.createElement("div");
  actions.className = "pagination-actions";

  const prevButton = document.createElement("button");
  prevButton.className = "pagination-button";
  prevButton.type = "button";
  prevButton.dataset.action = "pagination-prev";
  prevButton.dataset.paginationKey = key;
  prevButton.disabled = page <= 1;
  prevButton.textContent = "Sebelumnya";

  const nextButton = document.createElement("button");
  nextButton.className = "pagination-button";
  nextButton.type = "button";
  nextButton.dataset.action = "pagination-next";
  nextButton.dataset.paginationKey = key;
  nextButton.disabled = page >= totalPages;
  nextButton.textContent = "Berikutnya";

  actions.append(prevButton, nextButton);
  wrapper.append(info, actions);

  return wrapper;
}

function openMasterDataForm(type, mode, item = null) {
  const defaults = {
    room: {
      room_id: "",
      room_name: "",
      rate_per_hour: "",
      tv_device_id: "",
      status: "available",
    },
    menu: {
      menu_id: "",
      menu_name: "",
      category: "",
      price: "",
      stock_item_id: "",
      qty_per_unit: "",
      status: "active",
    },
    inventory: {
      stock_item_id: "",
      stock_item_name: "",
      category: "",
      unit: "",
      min_stock: "",
      status: "active",
    },
  };

  masterDataForm = {
    type,
    mode,
    originalValues: {
      ...(item || {}),
      qty_per_unit: item?.stock_qty_per_unit ?? item?.qty_per_unit ?? defaults[type]?.qty_per_unit,
    },
    values: {
      ...defaults[type],
      ...(item || {}),
      qty_per_unit: item?.stock_qty_per_unit ?? item?.qty_per_unit ?? defaults[type]?.qty_per_unit,
    },
  };
  renderRooms();
}

function closeMasterDataForm() {
  masterDataForm = null;
  renderRooms();
}

function updateMasterDataForm(field, value) {
  if (!masterDataForm) {
    return;
  }

  masterDataForm = {
    ...masterDataForm,
    values: {
      ...masterDataForm.values,
      [field]: value,
    },
  };
}

function getMasterDataFormTitle() {
  if (!masterDataForm) {
    return "";
  }

  const labels = {
    room: "Ruangan",
    menu: "Menu F&B",
    inventory: "Inventory",
  };

  return `${masterDataForm.mode === "edit" ? "Edit" : "Tambah"} ${labels[masterDataForm.type]}`;
}

function createMasterField({ label, field, type = "text", options = null, disabled = false, helper = "" }) {
  const wrapper = document.createElement("label");
  wrapper.className = "master-form-field";

  const labelElement = document.createElement("span");
  labelElement.className = "master-form-label";
  labelElement.textContent = label;

  let input;

  if (options) {
    input = document.createElement("select");
    options.forEach(([value, text]) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = text;
      input.appendChild(option);
    });
  } else {
    input = document.createElement("input");
    input.type = type;
  }

  input.className = "master-form-input";
  input.dataset.action = "update-master-form";
  input.dataset.field = field;
  input.disabled = disabled;
  input.value = masterDataForm?.values?.[field] ?? "";

  wrapper.append(labelElement, input);

  if (helper) {
    const helperElement = document.createElement("span");
    helperElement.className = "master-form-helper";
    helperElement.textContent = helper;
    wrapper.appendChild(helperElement);
  }

  return wrapper;
}

function createMasterDataFormElement() {
  if (!masterDataForm) {
    return null;
  }

  const form = document.createElement("section");
  form.className = "master-form";
  form.setAttribute("aria-labelledby", "master-form-title");

  const title = document.createElement("h3");
  title.className = "master-form-title";
  title.id = "master-form-title";
  title.textContent = getMasterDataFormTitle();

  const grid = document.createElement("div");
  grid.className = "master-form-grid";

  if (masterDataForm.type === "room") {
    if (masterDataForm.mode === "edit") {
      grid.appendChild(createMasterField({ label: "Room ID", field: "room_id", disabled: true }));
    }

    const currentRoomStatus = String(masterDataForm.values.status || "").toLowerCase();
    const isOccupied = currentRoomStatus === "occupied";

    grid.append(
      createMasterField({ label: "Nama Room", field: "room_name" }),
      createMasterField({ label: "Tarif per Jam", field: "rate_per_hour", type: "number" }),
      createMasterField({ label: "TV Device ID", field: "tv_device_id" }),
      createMasterField({
        label: "Status",
        field: "status",
        disabled: isOccupied,
        helper: isOccupied ? "Room occupied tidak bisa diubah dari Pengaturan." : "",
        options: [
          ["available", "Available"],
          ["occupied", "Occupied"],
          ["maintenance", "Maintenance"],
        ],
      })
    );
  }

  if (masterDataForm.type === "menu") {
    if (masterDataForm.mode === "edit") {
      grid.appendChild(createMasterField({ label: "Menu ID", field: "menu_id", disabled: true }));
    }

    grid.append(
      createMasterField({ label: "Nama Menu", field: "menu_name" }),
      createMasterField({ label: "Kategori", field: "category" }),
      createMasterField({ label: "Harga", field: "price", type: "number" }),
      createMasterField({ label: "Stock Item ID", field: "stock_item_id", helper: "Kosongkan jika stok tidak otomatis berkurang." }),
      createMasterField({ label: "Qty per Unit", field: "qty_per_unit", type: "number" }),
      createMasterField({
        label: "Status",
        field: "status",
        options: [
          ["active", "Active"],
          ["inactive", "Inactive"],
        ],
      })
    );
  }

  if (masterDataForm.type === "inventory") {
    if (masterDataForm.mode === "edit") {
      grid.appendChild(createMasterField({ label: "Item ID", field: "stock_item_id", disabled: true }));
    }

    grid.append(
      createMasterField({ label: "Nama Item", field: "stock_item_name" }),
      createMasterField({ label: "Kategori", field: "category" }),
      createMasterField({ label: "Unit", field: "unit" }),
      createMasterField({ label: "Min Stok", field: "min_stock", type: "number" }),
      createMasterField({
        label: "Status",
        field: "status",
        options: [
          ["active", "Active"],
          ["inactive", "Inactive"],
        ],
      })
    );
  }

  const actions = document.createElement("div");
  actions.className = "master-form-actions";

  const cancelButton = document.createElement("button");
  cancelButton.className = "master-button secondary";
  cancelButton.type = "button";
  cancelButton.dataset.action = "close-master-form";
  cancelButton.textContent = "Batal";

  const saveButton = document.createElement("button");
  saveButton.className = "master-button primary";
  saveButton.type = "button";
  saveButton.dataset.action = "submit-master-form";
  saveButton.disabled = isSavingMasterData;
  saveButton.textContent = isSavingMasterData ? "Menyimpan..." : "Simpan";

  actions.append(cancelButton, saveButton);
  form.append(title, grid, actions);

  return form;
}

function getMasterStatusBadge(status) {
  const normalizedStatus = String(status || "").trim().toLowerCase();
  const tone = normalizedStatus === "active" || normalizedStatus === "available"
    ? "success"
    : normalizedStatus === "maintenance"
      ? "warning"
      : normalizedStatus === "occupied"
        ? "danger"
        : normalizedStatus === "inactive"
          ? "neutral"
          : "neutral";
  const badge = document.createElement("span");
  badge.className = withStatusBadge("master-status-badge", tone);
  badge.textContent = normalizedStatus || "unknown";
  return badge;
}

function createMasterTable(headers, rows, emptyText) {
  const wrapper = document.createElement("div");
  wrapper.className = "master-table-wrap";

  const table = document.createElement("table");
  table.className = "master-table";

  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  headers.forEach((header) => {
    const th = document.createElement("th");
    th.scope = "col";
    th.textContent = header;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);

  const tbody = document.createElement("tbody");

  if (rows.length === 0) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = headers.length;
    td.textContent = emptyText;
    tr.appendChild(td);
    tbody.appendChild(tr);
  } else {
    rows.forEach((cells) => {
      const tr = document.createElement("tr");
      cells.forEach((cell) => {
        const td = document.createElement("td");
        if (cell instanceof Node) {
          td.appendChild(cell);
        } else {
          td.textContent = cell;
        }
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
  }

  table.append(thead, tbody);
  wrapper.appendChild(table);
  return wrapper;
}

function createMasterActionButton(type, item) {
  const actions = document.createElement("div");
  actions.className = "master-row-actions";

  const button = document.createElement("button");
  button.className = "master-button";
  button.type = "button";
  button.dataset.action = "edit-master-data";
  button.dataset.masterType = type;
  button.dataset.masterId = item.room_id || item.menu_id || item.stock_item_id || "";
  button.textContent = "Edit";

  const deleteButton = document.createElement("button");
  deleteButton.className = "master-button danger";
  deleteButton.type = "button";
  deleteButton.dataset.action = "confirm-delete-master-data";
  deleteButton.dataset.masterType = type;
  deleteButton.dataset.masterId = item.room_id || item.menu_id || item.stock_item_id || "";
  deleteButton.textContent = "Delete Permanen";

  actions.append(button, deleteButton);

  return actions;
}

function createSettingsSection(titleText, subtitleText, addType, tableElement) {
  const section = document.createElement("section");
  section.className = "settings-section";

  const header = document.createElement("div");
  header.className = "settings-section-header";

  const titleGroup = document.createElement("div");
  const title = document.createElement("h3");
  title.className = "settings-section-title";
  title.textContent = titleText;
  const subtitle = document.createElement("p");
  subtitle.className = "settings-section-subtitle";
  subtitle.textContent = subtitleText;
  titleGroup.append(title, subtitle);

  const addButton = document.createElement("button");
  addButton.className = "master-button primary";
  addButton.type = "button";
  addButton.dataset.action = "add-master-data";
  addButton.dataset.masterType = addType;
  addButton.textContent = "Tambah";

  header.append(titleGroup, addButton);
  section.append(header, tableElement);
  return section;
}

function createRoomSettingsSection() {
  const rows = rooms.map((room) => [
    room.room_id || "-",
    room.room_name || "-",
    formatCurrency(room.rate_per_hour),
    room.tv_device_id || "-",
    getMasterStatusBadge(room.status),
    createMasterActionButton("room", room),
  ]);

  return createSettingsSection(
    "Pengaturan Ruangan",
    "Kelola data master room tanpa mengubah waktu sesi aktif.",
    "room",
    createMasterTable(["ID", "Room", "Tarif/Jam", "TV", "Status", "Aksi"], rows, "Belum ada room.")
  );
}

function createMenuSettingsSection() {
  const rows = menuItems.map((menuItem) => [
    menuItem.menu_id || "-",
    menuItem.menu_name || "-",
    menuItem.category || "-",
    formatCurrency(menuItem.price),
    menuItem.stock_item_id || "-",
    Number(menuItem.stock_qty_per_unit) || 0,
    getMasterStatusBadge(menuItem.status),
    createMasterActionButton("menu", menuItem),
  ]);

  return createSettingsSection(
    "Pengaturan Menu F&B",
    "Kelola menu aktif/inaktif dan mapping stok.",
    "menu",
    createMasterTable(["ID", "Menu", "Kategori", "Harga", "Stock Item", "Qty/Unit", "Status", "Aksi"], rows, "Belum ada menu.")
  );
}

function createInventorySettingsSection() {
  const rows = inventoryItems.map((item) => [
    item.stock_item_id || "-",
    item.stock_item_name || "-",
    item.category || "-",
    item.unit || "-",
    `${Number(item.stock_qty) || 0}`,
    `${Number(item.min_stock) || 0}`,
    getMasterStatusBadge(item.status),
    createMasterActionButton("inventory", item),
  ]);

  return createSettingsSection(
    "Pengaturan Inventory",
    "Kelola master item dan min stok. Restock tetap melalui fitur Stok.",
    "inventory",
    createMasterTable(["ID", "Item", "Kategori", "Unit", "Stok", "Min", "Status", "Aksi"], rows, "Belum ada inventory.")
  );
}

function createAccessSettingsSection() {
  const section = document.createElement("section");
  section.className = "settings-section access-settings-section";

  const header = document.createElement("div");
  header.className = "settings-section-header";

  const titleGroup = document.createElement("div");
  const title = document.createElement("h3");
  title.className = "settings-section-title";
  title.textContent = "Pengaturan Akses";
  const subtitle = document.createElement("p");
  subtitle.className = "settings-section-subtitle";
  subtitle.textContent = "Daftar role aktif untuk proteksi PIN admin.";
  titleGroup.append(title, subtitle);

  const refreshButton = document.createElement("button");
  refreshButton.className = "master-button";
  refreshButton.type = "button";
  refreshButton.dataset.action = "refresh-settings-data";
  refreshButton.disabled = isLoadingSettingsData || !API_BASE_URL.trim();
  refreshButton.textContent = isLoadingSettingsData ? "Memuat..." : "Refresh Akses";

  const rows = employees.map((employee) => [
    employee.employee_id || "-",
    employee.employee_name || "-",
    getMasterStatusBadge(employee.role),
    getMasterStatusBadge(employee.status),
  ]);

  header.append(titleGroup, refreshButton);
  section.append(
    header,
    createMasterTable(["ID", "Nama", "Role", "Status"], rows, "Belum ada data employee.")
  );

  return section;
}

function normalizeNameForDuplicateCheck(name) {
  return String(name || "").trim().toLowerCase();
}

function isTestOrQaData(name) {
  return /(test|qa|dummy|sample|coba)/i.test(String(name || ""));
}

function createNameCountMap(items, nameGetter) {
  return items.reduce((map, item) => {
    const key = normalizeNameForDuplicateCheck(nameGetter(item));

    if (key) {
      map.set(key, (map.get(key) || 0) + 1);
    }

    return map;
  }, new Map());
}

function createQualityIssue({ type, id, name, issue, severity, recommendation, cleanupCandidate = false }) {
  return {
    type,
    id: id || "-",
    name: name || "-",
    issue,
    severity,
    recommendation,
    cleanupCandidate,
  };
}

function detectRoomQualityIssues(sourceRooms) {
  const nameCounts = createNameCountMap(sourceRooms, (room) => room.room_name);
  const validStatuses = new Set(["available", "occupied", "maintenance"]);
  const issues = [];

  sourceRooms.forEach((room) => {
    const roomName = room.room_name || "";
    const normalizedName = normalizeNameForDuplicateCheck(roomName);
    const status = normalizeRoomStatus(room.status);
    const rate = Number(room.rate_per_hour);
    const isOccupied = status === "occupied";

    if (!roomName.trim()) {
      issues.push(createQualityIssue({
        type: "room",
        id: room.room_id,
        name: roomName,
        issue: "Nama room kosong",
        severity: "critical",
        recommendation: "Edit nama room",
      }));
    }

    if (!Number.isFinite(rate) || rate <= 0) {
      issues.push(createQualityIssue({
        type: "room",
        id: room.room_id,
        name: roomName,
        issue: "Tarif room kosong atau tidak valid",
        severity: "critical",
        recommendation: "Edit tarif room",
      }));
    }

    if (!validStatuses.has(status)) {
      issues.push(createQualityIssue({
        type: "room",
        id: room.room_id,
        name: roomName,
        issue: "Status room tidak valid",
        severity: "critical",
        recommendation: "Edit status room",
      }));
    }

    if (normalizedName && nameCounts.get(normalizedName) > 1) {
      issues.push(createQualityIssue({
        type: "room",
        id: room.room_id,
        name: roomName,
        issue: "Nama room duplikat",
        severity: "warning",
        recommendation: "Review dan edit nama room",
      }));
    }

    if (isTestOrQaData(roomName)) {
      issues.push(createQualityIssue({
        type: "room",
        id: room.room_id,
        name: roomName,
        issue: "Data TEST / QA terdeteksi",
        severity: isOccupied ? "blocked" : "safe_cleanup",
        recommendation: isOccupied ? "Jangan cleanup saat occupied" : "Delete permanen jika belum punya histori",
        cleanupCandidate: !isOccupied,
      }));
    }

    if (!String(room.tv_device_id || "").trim()) {
      issues.push(createQualityIssue({
        type: "room",
        id: room.room_id,
        name: roomName,
        issue: "TV device ID kosong",
        severity: "info",
        recommendation: "Isi TV device jika dipakai integrasi TV",
      }));
    }

    if (status === "maintenance") {
      issues.push(createQualityIssue({
        type: "room",
        id: room.room_id,
        name: roomName,
        issue: "Room maintenance",
        severity: "info",
        recommendation: "Review status maintenance",
      }));
    }
  });

  return issues;
}

function detectMenuQualityIssues(sourceMenuItems, sourceInventoryItems) {
  const nameCounts = createNameCountMap(sourceMenuItems, (menuItem) => menuItem.menu_name);
  const inventoryMap = new Map(sourceInventoryItems.map((item) => [String(item.stock_item_id || ""), item]));
  const validStatuses = new Set(["active", "inactive"]);
  const issues = [];

  sourceMenuItems.forEach((menuItem) => {
    const menuName = menuItem.menu_name || "";
    const normalizedName = normalizeNameForDuplicateCheck(menuName);
    const status = String(menuItem.status || "").trim().toLowerCase();
    const price = Number(menuItem.price);
    const stockItemId = String(menuItem.stock_item_id || "").trim();
    const qtyPerUnit = Number(menuItem.stock_qty_per_unit);
    const mappedInventory = stockItemId ? inventoryMap.get(stockItemId) : null;

    if (!menuName.trim()) {
      issues.push(createQualityIssue({ type: "menu", id: menuItem.menu_id, name: menuName, issue: "Nama menu kosong", severity: "critical", recommendation: "Edit nama menu" }));
    }

    if (!String(menuItem.category || "").trim()) {
      issues.push(createQualityIssue({ type: "menu", id: menuItem.menu_id, name: menuName, issue: "Kategori menu kosong", severity: "critical", recommendation: "Edit kategori menu" }));
    }

    if (!Number.isFinite(price) || price < 0) {
      issues.push(createQualityIssue({ type: "menu", id: menuItem.menu_id, name: menuName, issue: "Harga menu kosong atau tidak valid", severity: "critical", recommendation: "Edit harga menu" }));
    }

    if (!validStatuses.has(status)) {
      issues.push(createQualityIssue({ type: "menu", id: menuItem.menu_id, name: menuName, issue: "Status menu tidak valid", severity: "critical", recommendation: "Edit status menu" }));
    }

    if (normalizedName && nameCounts.get(normalizedName) > 1) {
      issues.push(createQualityIssue({ type: "menu", id: menuItem.menu_id, name: menuName, issue: "Nama menu duplikat", severity: "warning", recommendation: "Review dan edit nama menu" }));
    }

    if (isTestOrQaData(menuName)) {
      issues.push(createQualityIssue({
        type: "menu",
        id: menuItem.menu_id,
        name: menuName,
        issue: "Data TEST / QA terdeteksi",
        severity: "safe_cleanup",
        recommendation: "Delete permanen jika belum punya histori",
        cleanupCandidate: true,
      }));
    }

    if (!stockItemId) {
      issues.push(createQualityIssue({ type: "menu", id: menuItem.menu_id, name: menuName, issue: "Menu tanpa stock item", severity: "warning", recommendation: "Isi stock item jika perlu stok otomatis" }));
    } else if (!mappedInventory) {
      issues.push(createQualityIssue({ type: "menu", id: menuItem.menu_id, name: menuName, issue: "Stock item tidak ditemukan", severity: "critical", recommendation: "Ganti mapping inventory" }));
    } else if (String(mappedInventory.status || "").trim().toLowerCase() === "inactive") {
      issues.push(createQualityIssue({ type: "menu", id: menuItem.menu_id, name: menuName, issue: "Menu memakai inventory inactive", severity: "critical", recommendation: "Aktifkan inventory atau ganti mapping menu" }));
    }

    if (stockItemId && (!Number.isFinite(qtyPerUnit) || qtyPerUnit <= 0)) {
      issues.push(createQualityIssue({ type: "menu", id: menuItem.menu_id, name: menuName, issue: "Qty per unit kosong atau 0", severity: "warning", recommendation: "Edit qty per unit" }));
    }
  });

  return issues;
}

function detectInventoryQualityIssues(sourceInventoryItems, sourceMenuItems) {
  const nameCounts = createNameCountMap(sourceInventoryItems, (item) => item.stock_item_name);
  const menuUsageMap = sourceMenuItems.reduce((map, menuItem) => {
    const stockItemId = String(menuItem.stock_item_id || "").trim();

    if (stockItemId) {
      if (!map.has(stockItemId)) {
        map.set(stockItemId, []);
      }

      map.get(stockItemId).push(menuItem);
    }

    return map;
  }, new Map());
  const validStatuses = new Set(["active", "inactive"]);
  const issues = [];

  sourceInventoryItems.forEach((item) => {
    const itemName = item.stock_item_name || "";
    const normalizedName = normalizeNameForDuplicateCheck(itemName);
    const status = String(item.status || "").trim().toLowerCase();
    const minStock = Number(item.min_stock);
    const stockQty = Number(item.stock_qty);
    const usedMenus = menuUsageMap.get(item.stock_item_id) || [];
    const usedByActiveMenu = usedMenus.some((menuItem) => String(menuItem.status || "").trim().toLowerCase() === "active");

    if (!itemName.trim()) {
      issues.push(createQualityIssue({ type: "inventory", id: item.stock_item_id, name: itemName, issue: "Nama inventory kosong", severity: "critical", recommendation: "Edit nama inventory" }));
    }

    if (!String(item.category || "").trim()) {
      issues.push(createQualityIssue({ type: "inventory", id: item.stock_item_id, name: itemName, issue: "Kategori inventory kosong", severity: "critical", recommendation: "Edit kategori inventory" }));
    }

    if (!String(item.unit || "").trim()) {
      issues.push(createQualityIssue({ type: "inventory", id: item.stock_item_id, name: itemName, issue: "Unit inventory kosong", severity: "critical", recommendation: "Edit unit inventory" }));
    }

    if (!Number.isFinite(minStock) || minStock < 0) {
      issues.push(createQualityIssue({ type: "inventory", id: item.stock_item_id, name: itemName, issue: "Min stok kosong atau tidak valid", severity: "warning", recommendation: "Edit min stok" }));
    }

    if (!validStatuses.has(status)) {
      issues.push(createQualityIssue({ type: "inventory", id: item.stock_item_id, name: itemName, issue: "Status inventory tidak valid", severity: "critical", recommendation: "Edit status inventory" }));
    }

    if (normalizedName && nameCounts.get(normalizedName) > 1) {
      issues.push(createQualityIssue({ type: "inventory", id: item.stock_item_id, name: itemName, issue: "Nama inventory duplikat", severity: "warning", recommendation: "Review dan edit nama inventory" }));
    }

    if (isTestOrQaData(itemName)) {
      issues.push(createQualityIssue({
        type: "inventory",
        id: item.stock_item_id,
        name: itemName,
        issue: "Data TEST / QA terdeteksi",
        severity: "safe_cleanup",
        recommendation: "Delete permanen jika belum punya referensi",
        cleanupCandidate: true,
      }));
    }

    if (status === "inactive" && usedByActiveMenu) {
      issues.push(createQualityIssue({ type: "inventory", id: item.stock_item_id, name: itemName, issue: "Inventory inactive dipakai menu active", severity: "critical", recommendation: "Aktifkan inventory atau ganti mapping menu" }));
    }

    if (usedMenus.length === 0) {
      issues.push(createQualityIssue({ type: "inventory", id: item.stock_item_id, name: itemName, issue: "Inventory tidak dipakai menu mana pun", severity: "info", recommendation: "Review apakah masih dibutuhkan" }));
    }

    if (!Number.isFinite(stockQty)) {
      issues.push(createQualityIssue({ type: "inventory", id: item.stock_item_id, name: itemName, issue: "Stock qty kosong atau tidak valid", severity: "warning", recommendation: "Gunakan fitur Restock/Koreksi Stok" }));
    }
  });

  return issues;
}

function buildMasterDataQualityReport() {
  const issues = [
    ...detectRoomQualityIssues(rooms),
    ...detectMenuQualityIssues(menuItems, inventoryItems),
    ...detectInventoryQualityIssues(inventoryItems, menuItems),
  ];

  return {
    issues,
    summary: {
      total: issues.length,
      room: issues.filter((issue) => issue.type === "room").length,
      menu: issues.filter((issue) => issue.type === "menu").length,
      inventory: issues.filter((issue) => issue.type === "inventory").length,
      testData: issues.filter((issue) => issue.issue.includes("TEST / QA")).length,
      duplicate: issues.filter((issue) => issue.issue.includes("duplikat")).length,
      emptyField: issues.filter((issue) => issue.issue.includes("kosong")).length,
      cleanup: issues.filter((issue) => issue.cleanupCandidate).length,
    },
  };
}

function getQualitySeverityTone(severity) {
  if (severity === "critical") {
    return "danger";
  }

  if (severity === "warning" || severity === "need_review") {
    return "warning";
  }

  if (severity === "safe_cleanup") {
    return "success";
  }

  if (severity === "blocked") {
    return "danger";
  }

  return "info";
}

function getQualitySeverityLabel(severity) {
  const labels = {
    critical: "Critical",
    warning: "Warning",
    info: "Info",
    safe_cleanup: "Safe Cleanup",
    blocked: "Blocked",
    need_review: "Need Review",
  };

  return labels[severity] || "Need Review";
}

function createQualitySeverityBadge(severity) {
  const badge = document.createElement("span");
  badge.className = withStatusBadge("quality-severity-badge", getQualitySeverityTone(severity));
  badge.textContent = getQualitySeverityLabel(severity);
  return badge;
}

function createQualityActionButtons(issue) {
  const actions = document.createElement("div");
  actions.className = "quality-actions";
  const item = findMasterItem(issue.type, issue.id);

  if (item) {
    const editButton = document.createElement("button");
    editButton.className = "master-button";
    editButton.type = "button";
    editButton.dataset.action = "edit-master-data";
    editButton.dataset.masterType = issue.type;
    editButton.dataset.masterId = issue.id;
    editButton.textContent = "Edit";
    actions.appendChild(editButton);
  }

  if (issue.cleanupCandidate && item) {
    const deleteButton = document.createElement("button");
    deleteButton.className = "master-button danger";
    deleteButton.type = "button";
    deleteButton.dataset.action = "confirm-delete-master-data";
    deleteButton.dataset.masterType = issue.type;
    deleteButton.dataset.masterId = issue.id;
    deleteButton.textContent = "Delete Permanen";
    actions.appendChild(deleteButton);
  }

  if (actions.children.length === 0) {
    const text = document.createElement("span");
    text.className = "settings-section-subtitle";
    text.textContent = "Review";
    actions.appendChild(text);
  }

  return actions;
}

function createQualitySummaryCards(summary) {
  const grid = document.createElement("div");
  grid.className = "quality-summary";

  [
    ["Total Issue", summary.total],
    ["Issue Room", summary.room],
    ["Issue Menu", summary.menu],
    ["Issue Inventory", summary.inventory],
    ["Data TEST / QA", summary.testData],
    ["Duplikat Nama", summary.duplicate],
    ["Field Kosong", summary.emptyField],
    ["Data Bisa Dibersihkan", summary.cleanup],
  ].forEach(([labelText, valueText]) => {
    const card = document.createElement("article");
    card.className = "quality-summary-card";

    const label = document.createElement("p");
    label.className = "transaction-label";
    label.textContent = labelText;

    const value = document.createElement("p");
    value.className = "transaction-value";
    value.textContent = String(valueText);

    card.append(label, value);
    grid.appendChild(card);
  });

  return grid;
}

function createQualityIssueTable(issues) {
  const rows = issues.map((issue) => [
    issue.type,
    issue.id,
    issue.name,
    issue.issue,
    createQualitySeverityBadge(issue.severity),
    issue.recommendation,
    createQualityActionButtons(issue),
  ]);

  return createMasterTable(
    ["Tipe", "ID", "Nama", "Issue", "Severity", "Rekomendasi", "Aksi"],
    rows,
    "Tidak ada issue master data."
  );
}

function createMasterDataQualitySection() {
  const report = buildMasterDataQualityReport();
  const section = document.createElement("section");
  section.className = "settings-section master-quality-section";

  const header = document.createElement("div");
  header.className = "settings-section-header";

  const titleGroup = document.createElement("div");
  const title = document.createElement("h3");
  title.className = "settings-section-title";
  title.textContent = "Master Data Quality & Cleanup";
  const subtitle = document.createElement("p");
  subtitle.className = "settings-section-subtitle";
  subtitle.textContent = "Deteksi data TEST/QA, duplikat, field kosong, dan kandidat cleanup aman.";
  titleGroup.append(title, subtitle);

  const refreshButton = document.createElement("button");
  refreshButton.className = "master-button";
  refreshButton.type = "button";
  refreshButton.dataset.action = "refresh-settings-data";
  refreshButton.textContent = "Refresh Quality";

  header.append(titleGroup, refreshButton);
  section.append(header, createQualitySummaryCards(report.summary), createQualityIssueTable(report.issues));

  return section;
}

function getAuditBadgeTone(value) {
  const normalized = String(value || "").trim().toLowerCase();

  if (normalized === "success" || normalized === "create" || normalized === "activate") {
    return "success";
  }

  if (normalized === "blocked" || normalized === "delete_blocked" || normalized === "maintenance") {
    return "warning";
  }

  if (normalized === "failed" || normalized === "delete_permanent" || normalized === "deactivate") {
    return "danger";
  }

  return "neutral";
}

function createAuditBadge(value) {
  const badge = document.createElement("span");
  badge.className = withStatusBadge("master-audit-badge", getAuditBadgeTone(value));
  badge.textContent = value || "-";
  return badge;
}

function createMasterAuditFiltersElement() {
  const filters = document.createElement("div");
  filters.className = "master-audit-filters";

  const entitySelect = createMasterAuditSelect(
    "Entity",
    "filter-master-audit-entity",
    masterAuditEntityFilter,
    [
      ["all", "Semua"],
      ["room", "Room"],
      ["menu", "Menu"],
      ["inventory", "Inventory"],
      ["access", "Access"],
    ]
  );

  const actionSelect = createMasterAuditSelect(
    "Action",
    "filter-master-audit-action",
    masterAuditActionFilter,
    [
      ["all", "Semua"],
      ["create", "Create"],
      ["update", "Update"],
      ["activate", "Activate"],
      ["deactivate", "Deactivate"],
      ["maintenance", "Maintenance"],
      ["delete_permanent", "Delete Permanen"],
      ["delete_blocked", "Delete Ditolak"],
      ["pin_validation", "Validasi PIN"],
    ]
  );

  filters.append(entitySelect, actionSelect);
  return filters;
}

function createMasterAuditSelect(labelText, action, value, options) {
  const wrapper = document.createElement("label");
  wrapper.className = "master-form-field";

  const label = document.createElement("span");
  label.className = "master-form-label";
  label.textContent = labelText;

  const select = document.createElement("select");
  select.className = "master-form-input";
  select.dataset.action = action;
  select.value = value;

  options.forEach(([optionValue, text]) => {
    const option = document.createElement("option");
    option.value = optionValue;
    option.textContent = text;
    select.appendChild(option);
  });

  wrapper.append(label, select);
  return wrapper;
}

function createMasterAuditLogSection() {
  const section = document.createElement("section");
  section.className = "settings-section master-audit-section";

  const header = document.createElement("div");
  header.className = "settings-section-header";

  const titleGroup = document.createElement("div");
  const title = document.createElement("h3");
  title.className = "settings-section-title";
  title.textContent = "Audit Log Master Data";
  const subtitle = document.createElement("p");
  subtitle.className = "settings-section-subtitle";
  subtitle.textContent = "100 log terbaru perubahan master data.";
  titleGroup.append(title, subtitle);

  const refreshButton = document.createElement("button");
  refreshButton.className = "master-button";
  refreshButton.type = "button";
  refreshButton.dataset.action = "refresh-master-audit-logs";
  refreshButton.disabled = isLoadingMasterAuditLogs || !API_BASE_URL.trim();
  refreshButton.textContent = isLoadingMasterAuditLogs ? "Memuat..." : "Refresh Audit";

  header.append(titleGroup, refreshButton);

  const rows = masterAuditLogs.map((log) => [
    log.created_at || "-",
    log.entity_type || "-",
    log.entity_id || "-",
    log.entity_name || "-",
    createAuditBadge(log.action_type),
    log.changed_by || "-",
    createAuditBadge(log.result),
    log.block_reason || "-",
    log.note || "-",
  ]);

  section.append(
    header,
    createMasterAuditFiltersElement(),
    isLoadingMasterAuditLogs
      ? createStateMessage("Memuat audit log master data...")
      : createMasterTable(
        ["Waktu", "Entity", "ID", "Nama", "Action", "Changed By", "Result", "Alasan Blokir", "Note"],
        rows,
        "Belum ada audit log master data."
      )
  );

  return section;
}

function createSettingsPanelElement() {
  const panel = document.createElement("section");
  panel.className = "settings-panel";
  panel.setAttribute("aria-labelledby", "settings-title");

  const header = document.createElement("div");
  header.className = "settings-header";

  const titleGroup = document.createElement("div");
  const title = document.createElement("h2");
  title.className = "settings-title";
  title.id = "settings-title";
  title.textContent = "Pengaturan";
  const subtitle = document.createElement("p");
  subtitle.className = "settings-subtitle";
  subtitle.textContent = "Kelola master data ruangan, menu F&B, inventory, dan mapping TV.";
  titleGroup.append(title, subtitle);

  const refreshButton = document.createElement("button");
  refreshButton.className = "master-button";
  refreshButton.type = "button";
  refreshButton.dataset.action = "refresh-settings-data";
  refreshButton.disabled = isLoadingSettingsData || !API_BASE_URL.trim();
  refreshButton.textContent = isLoadingSettingsData ? "Memuat..." : "Refresh";

  header.append(titleGroup, refreshButton);
  panel.appendChild(header);

  const form = createMasterDataFormElement();
  if (form) {
    panel.appendChild(form);
  }

  panel.appendChild(createDeleteMasterConfirmationElement());
  panel.appendChild(createAdminPinModalElement());

  const tvDeviceFormModal = createTvDeviceFormModalElement();
  if (tvDeviceFormModal) {
    panel.appendChild(tvDeviceFormModal);
  }

  if (isLoadingSettingsData) {
    panel.appendChild(createStateMessage("Memuat data pengaturan..."));
    return panel;
  }

  panel.append(
    createRoomSettingsSection(),
    createMenuSettingsSection(),
    createInventorySettingsSection(),
    createTvIntegrationSection(),
    createAccessSettingsSection(),
    createMasterAuditLogSection(),
    createMasterDataQualitySection()
  );

  return panel;
}

function findMasterItem(type, id) {
  if (type === "room") {
    return rooms.find((room) => room.room_id === id) || null;
  }

  if (type === "menu") {
    return menuItems.find((menuItem) => menuItem.menu_id === id) || null;
  }

  if (type === "inventory") {
    return inventoryItems.find((item) => item.stock_item_id === id) || null;
  }

  return null;
}

function getMasterEntityName(type, item) {
  if (type === "room") {
    return item?.room_name || item?.room_id || "-";
  }

  if (type === "menu") {
    return item?.menu_name || item?.menu_id || "-";
  }

  if (type === "inventory") {
    return item?.stock_item_name || item?.stock_item_id || "-";
  }

  return "-";
}

function getMasterEntityId(type, item) {
  if (type === "room") {
    return item?.room_id || "";
  }

  if (type === "menu") {
    return item?.menu_id || "";
  }

  if (type === "inventory") {
    return item?.stock_item_id || "";
  }

  return "";
}

function openDeleteMasterConfirmation(type, item) {
  deleteMasterConfirmation = {
    type,
    id: getMasterEntityId(type, item),
    name: getMasterEntityName(type, item),
    typedText: "",
    note: "",
  };
  renderRooms();
}

function closeDeleteMasterConfirmation() {
  deleteMasterConfirmation = null;
  renderRooms();
}

function updateDeleteMasterConfirmation(field, value) {
  if (!deleteMasterConfirmation) {
    return;
  }

  deleteMasterConfirmation = {
    ...deleteMasterConfirmation,
    [field]: value,
  };
}

function syncDeleteMasterConfirmationControls() {
  const modal = queryDashboard(".master-delete-modal");

  if (!modal || !deleteMasterConfirmation) {
    return;
  }

  const deleteButton = modal.querySelector("[data-action='submit-delete-master-data']");

  if (deleteButton) {
    deleteButton.disabled = isDeletingMasterData || deleteMasterConfirmation.typedText !== "HAPUS";
  }
}

function buildDeleteMasterPayload(adminPin = "", authData = null) {
  const confirmation = deleteMasterConfirmation || {};
  const basePayload = {
    changed_by: getLoggedInOperatorName(),
    note: confirmation.note || "",
    admin_pin: adminPin,
  };

  if (confirmation.type === "room") {
    return {
      ...basePayload,
      action: "deleteRoomMaster",
      room_id: confirmation.id,
    };
  }

  if (confirmation.type === "menu") {
    return {
      ...basePayload,
      action: "deleteMenuMaster",
      menu_id: confirmation.id,
    };
  }

  return {
    ...basePayload,
    action: "deleteInventoryMaster",
    stock_item_id: confirmation.id,
  };
}

function getDeleteMasterEntityLabel(type) {
  const labels = {
    room: "Room",
    menu: "Menu",
    inventory: "Inventory",
  };

  return labels[type] || "Data";
}

function getDeleteMasterSuccessMessage(type) {
  return `${getDeleteMasterEntityLabel(type)} berhasil dihapus permanen.`;
}

function isAdminPinDeleteError(data) {
  const blockReason = String(data?.block_reason || "").trim().toUpperCase();

  return blockReason === "INVALID_ADMIN_PIN" || blockReason === "INVALID_PIN" || blockReason === "INSUFFICIENT_ROLE" || blockReason === "EMPTY_PIN";
}

function formatDeleteMasterErrorMessage(data) {
  if (isAdminPinDeleteError(data)) {
    return "PIN tidak valid atau akses tidak cukup.";
  }

  const message = data?.message || data?.error || "Delete permanen ditolak.";
  const blockReason = data?.block_reason ? ` (${data.block_reason})` : "";

  return `Data gagal dihapus: ${message}${blockReason}`;
}

async function submitDeleteMasterData() {
  if (!deleteMasterConfirmation || isDeletingMasterData) {
    return;
  }

  if (deleteMasterConfirmation.typedText !== "HAPUS") {
    showInlineNotice("Ketik HAPUS untuk mengaktifkan delete permanen.", "error");
    return;
  }

  openAdminPinModal({
    title: "PIN Admin Delete Permanen",
    message: `Masukkan PIN owner/admin untuk menghapus permanen ${deleteMasterConfirmation.name || deleteMasterConfirmation.id}.`,
    requestedAction: `delete_permanent_${deleteMasterConfirmation.type}`,
    requiredRole: "admin",
    validatePin: false,
    onSuccess: (authData, adminPin) => executeDeleteMasterData(adminPin, authData),
  });
}

async function executeDeleteMasterData(adminPin, authData) {
  if (!deleteMasterConfirmation || isDeletingMasterData) {
    return { success: false };
  }

  const deleteType = deleteMasterConfirmation.type;
  isDeletingMasterData = true;
  renderRooms();

  try {
    const data = await postApiAction(buildDeleteMasterPayload(adminPin, authData));

    if (!data || (data.ok !== true && data.success !== true)) {
      const message = formatDeleteMasterErrorMessage(data);
      showInlineNotice(message, "error");

      if (adminPinModal) {
        adminPinModal = {
          ...adminPinModal,
          pin: "",
          error: isAdminPinDeleteError(data) ? "PIN tidak valid atau akses tidak cukup." : message,
        };
      }

      return { success: false, message };
    }

    const message = getDeleteMasterSuccessMessage(deleteType);
    adminPinModal = null;
    deleteMasterConfirmation = null;
    showInlineNotice(message);
    await loadSettingsTabData();
    return { success: true, message };
  } catch (error) {
    console.error("Gagal delete permanen.", error);
    const message = "Terjadi kendala saat menghapus data. Silakan coba lagi.";
    showInlineNotice(message, "error");

    if (adminPinModal) {
      adminPinModal = {
        ...adminPinModal,
        pin: "",
        error: message,
      };
    }

    return { success: false, message };
  } finally {
    isDeletingMasterData = false;
    renderRooms();
  }
}

function createDeleteMasterConfirmationElement() {
  if (!deleteMasterConfirmation) {
    return document.createDocumentFragment();
  }

  const overlay = document.createElement("section");
  overlay.className = "master-delete-modal";
  overlay.setAttribute("aria-labelledby", "master-delete-title");

  const dialog = document.createElement("div");
  dialog.className = "master-delete-dialog";

  const title = document.createElement("h3");
  title.className = "master-delete-title";
  title.id = "master-delete-title";
  title.textContent = "Konfirmasi Delete Permanen";

  const warning = document.createElement("p");
  warning.className = "master-delete-warning";
  warning.textContent = "Data akan dihapus permanen jika belum pernah dipakai transaksi. Jika sudah memiliki histori, sistem akan menolak penghapusan.";

  const details = document.createElement("div");
  details.className = "master-delete-details";

  [
    ["Tipe", deleteMasterConfirmation.type],
    ["ID", deleteMasterConfirmation.id],
    ["Nama", deleteMasterConfirmation.name],
  ].forEach(([labelText, valueText]) => {
    const item = document.createElement("div");
    const label = document.createElement("p");
    label.className = "transaction-label";
    label.textContent = labelText;
    const value = document.createElement("p");
    value.className = "transaction-value";
    value.textContent = valueText || "-";
    item.append(label, value);
    details.appendChild(item);
  });

  const typedField = createDeleteField("Ketik HAPUS", "typedText", deleteMasterConfirmation.typedText);
  const noteField = createDeleteField("Catatan", "note", deleteMasterConfirmation.note);

  const actions = document.createElement("div");
  actions.className = "master-delete-actions";

  const cancelButton = document.createElement("button");
  cancelButton.className = "master-button secondary";
  cancelButton.type = "button";
  cancelButton.dataset.action = "close-delete-master-confirmation";
  cancelButton.textContent = "Batal";

  const deleteButton = document.createElement("button");
  deleteButton.className = "master-button danger";
  deleteButton.type = "button";
  deleteButton.dataset.action = "submit-delete-master-data";
  deleteButton.dataset.role = "delete-master-submit";
  deleteButton.disabled = isDeletingMasterData || deleteMasterConfirmation.typedText !== "HAPUS";
  deleteButton.textContent = isDeletingMasterData ? "Menghapus..." : "Delete Permanen";

  actions.append(cancelButton, deleteButton);
  dialog.append(title, warning, details, typedField, noteField, actions);
  overlay.appendChild(dialog);

  return overlay;
}

function createDeleteField(labelText, field, value) {
  const wrapper = document.createElement("label");
  wrapper.className = "master-form-field";

  const label = document.createElement("span");
  label.className = "master-form-label";
  label.textContent = labelText;

  const input = document.createElement("input");
  input.className = "master-form-input";
  input.type = "text";
  input.dataset.action = "update-delete-master-confirmation";
  input.dataset.field = field;
  input.dataset.role = field === "typedText" ? "delete-confirmation-input" : "delete-note-input";
  input.value = value || "";

  wrapper.append(label, input);
  return wrapper;
}

function openAdminPinModal({ title, message, requestedAction, requiredRole = "admin", validatePin = true, onSuccess }) {
  adminPinModal = {
    title: title || "PIN Admin",
    message: message || "Masukkan PIN owner/admin untuk melanjutkan.",
    requestedAction: requestedAction || "admin_action",
    requiredRole,
    validatePin,
    pin: "",
    error: "",
    onSuccess,
  };
  renderRooms();
}

function closeAdminPinModal() {
  if (isValidatingAdminPin) {
    return;
  }

  adminPinModal = null;
  renderRooms();
}

function updateAdminPinModal(field, value) {
  if (!adminPinModal || field !== "pin") {
    return;
  }

  adminPinModal = {
    ...adminPinModal,
    pin: value,
    error: "",
  };
}

function syncAdminPinModalControls() {
  const modal = queryDashboard(".admin-pin-modal");

  if (!modal || !adminPinModal) {
    return;
  }

  const submitButton = modal.querySelector("[data-action='submit-admin-pin-modal']");

  if (submitButton) {
    submitButton.disabled = isValidatingAdminPin || !String(adminPinModal.pin || "").trim();
  }
}

async function submitAdminPinModal() {
  if (!adminPinModal || isValidatingAdminPin) {
    return;
  }

  const adminPin = String(adminPinModal.pin || "").trim();

  if (!adminPin) {
    adminPinModal = {
      ...adminPinModal,
      error: "PIN wajib diisi.",
    };
    renderRooms();
    return;
  }

  const pendingAction = adminPinModal.onSuccess;

  if (adminPinModal.validatePin === false) {
    isValidatingAdminPin = true;
    renderRooms();

    try {
      const result = typeof pendingAction === "function"
        ? await pendingAction({}, adminPin)
        : { success: true };

      if (result?.success !== false) {
        adminPinModal = null;
      }
    } catch (error) {
      console.error("Gagal menjalankan aksi setelah PIN.", error);
      adminPinModal = {
        ...adminPinModal,
        pin: "",
        error: "Terjadi kendala saat menghapus data. Silakan coba lagi.",
      };
      showInlineNotice("Terjadi kendala saat menghapus data. Silakan coba lagi.", "error");
    } finally {
      isValidatingAdminPin = false;
      renderRooms();
    }

    return;
  }

  isValidatingAdminPin = true;
  renderRooms();

  try {
    const data = await postApiAction({
      action: "validateAdminPin",
      pin: adminPin,
      required_role: adminPinModal.requiredRole || "admin",
      requested_action: adminPinModal.requestedAction || "admin_action",
      changed_by: getLoggedInOperatorName(),
    });

    if (!data || (data.ok !== true && data.success !== true)) {
      throw new Error(data?.message || data?.error || "PIN admin tidak valid.");
    }

    const authData = data.data || {};
    adminPinModal = null;
    isValidatingAdminPin = false;
    renderRooms();

    if (typeof pendingAction === "function") {
      await pendingAction(authData, adminPin);
    }
  } catch (error) {
    adminPinModal = {
      ...adminPinModal,
      pin: "",
      error: error.message || "PIN admin tidak valid.",
    };
    isValidatingAdminPin = false;
    renderRooms();
  }
}

function createAdminPinModalElement() {
  if (!adminPinModal) {
    return document.createDocumentFragment();
  }

  const overlay = document.createElement("section");
  overlay.className = "master-delete-modal admin-pin-modal";
  overlay.setAttribute("aria-labelledby", "admin-pin-title");

  const dialog = document.createElement("div");
  dialog.className = "master-delete-dialog";

  const title = document.createElement("h3");
  title.className = "master-delete-title";
  title.id = "admin-pin-title";
  title.textContent = adminPinModal.title || "PIN Admin";

  const message = document.createElement("p");
  message.className = "master-delete-warning";
  message.textContent = adminPinModal.message || "Masukkan PIN owner/admin untuk melanjutkan.";

  const field = document.createElement("label");
  field.className = "master-form-field";

  const label = document.createElement("span");
  label.className = "master-form-label";
  label.textContent = "PIN Admin";

  const input = document.createElement("input");
  input.className = "master-form-input";
  input.type = "password";
  input.autocomplete = "off";
  input.dataset.action = "update-admin-pin-modal";
  input.dataset.field = "pin";
  input.dataset.role = "admin-pin-input";
  input.value = adminPinModal.pin || "";

  field.append(label, input);

  const actions = document.createElement("div");
  actions.className = "master-delete-actions";

  const cancelButton = document.createElement("button");
  cancelButton.className = "master-button secondary";
  cancelButton.type = "button";
  cancelButton.dataset.action = "close-admin-pin-modal";
  cancelButton.disabled = isValidatingAdminPin;
  cancelButton.textContent = "Batal";

  const submitButton = document.createElement("button");
  submitButton.className = "master-button danger";
  submitButton.type = "button";
  submitButton.dataset.action = "submit-admin-pin-modal";
  submitButton.disabled = isValidatingAdminPin || !String(adminPinModal.pin || "").trim();
  submitButton.textContent = isValidatingAdminPin ? "Memvalidasi..." : "Lanjutkan";

  actions.append(cancelButton, submitButton);
  dialog.append(title, message, field);

  if (adminPinModal.error) {
    const error = document.createElement("p");
    error.className = "inline-notice error";
    error.textContent = adminPinModal.error;
    dialog.appendChild(error);
  }

  dialog.appendChild(actions);
  overlay.appendChild(dialog);

  return overlay;
}

function buildMasterPayload(authData = null, adminPin = "") {
  const values = masterDataForm?.values || {};
  const isEdit = masterDataForm?.mode === "edit";
  const accessPayload = {
    changed_by: getLoggedInOperatorName(),
    admin_pin: adminPin,
  };

  if (masterDataForm.type === "room") {
    return {
      ...accessPayload,
      action: isEdit ? "updateRoomMaster" : "saveRoomMaster",
      room_id: values.room_id || "",
      room_name: values.room_name || "",
      rate_per_hour: Number(values.rate_per_hour),
      tv_device_id: values.tv_device_id || "",
      status: values.status || "available",
    };
  }

  if (masterDataForm.type === "menu") {
    return {
      ...accessPayload,
      action: isEdit ? "updateMenuMaster" : "saveMenuMaster",
      menu_id: values.menu_id || "",
      menu_name: values.menu_name || "",
      category: values.category || "",
      price: Number(values.price),
      stock_item_id: values.stock_item_id || "",
      qty_per_unit: Number(values.qty_per_unit || values.stock_qty_per_unit || 0),
      status: values.status || "active",
    };
  }

  return {
    ...accessPayload,
    action: isEdit ? "updateInventoryMaster" : "saveInventoryMaster",
    stock_item_id: values.stock_item_id || "",
    stock_item_name: values.stock_item_name || "",
    category: values.category || "",
    unit: values.unit || "",
    min_stock: Number(values.min_stock),
    status: values.status || "active",
  };
}

async function submitMasterDataForm() {
  if (!masterDataForm || isSavingMasterData) {
    return;
  }

  if (!API_BASE_URL.trim()) {
    showInlineNotice("API belum dikonfigurasi.", "error");
    return;
  }

  if (isSensitiveMasterDataChange()) {
    openAdminPinModal({
      title: "PIN Admin Master Data",
      message: getSensitiveMasterDataMessage(),
      requestedAction: getSensitiveMasterDataAction(),
      requiredRole: "admin",
      onSuccess: (authData, adminPin) => executeMasterDataSubmit(authData, adminPin),
    });
    return;
  }

  await executeMasterDataSubmit();
}

function isSensitiveMasterDataChange() {
  if (!masterDataForm || masterDataForm.mode !== "edit") {
    return false;
  }

  const values = masterDataForm.values || {};
  const original = masterDataForm.originalValues || {};

  if (masterDataForm.type === "room") {
    const originalRate = Number(original.rate_per_hour) || 0;
    const nextRate = Number(values.rate_per_hour) || 0;
    const originalStatus = String(original.status || "").trim().toLowerCase();
    const nextStatus = String(values.status || "").trim().toLowerCase();

    return originalRate !== nextRate
      || ((originalStatus === "maintenance" || nextStatus === "maintenance") && originalStatus !== nextStatus);
  }

  if (masterDataForm.type === "menu") {
    return (Number(original.price) || 0) !== (Number(values.price) || 0);
  }

  return false;
}

function getSensitiveMasterDataAction() {
  if (!masterDataForm) {
    return "update_master_data";
  }

  const values = masterDataForm.values || {};
  const original = masterDataForm.originalValues || {};

  if (masterDataForm.type === "room") {
    const originalStatus = String(original.status || "").trim().toLowerCase();
    const nextStatus = String(values.status || "").trim().toLowerCase();

    if ((originalStatus === "maintenance" || nextStatus === "maintenance") && originalStatus !== nextStatus) {
      return "set_room_maintenance";
    }

    return "edit_room_price";
  }

  if (masterDataForm.type === "menu") {
    return "edit_menu_price";
  }

  return "update_master_data";
}

function getSensitiveMasterDataMessage() {
  if (!masterDataForm) {
    return "Masukkan PIN owner/admin untuk menyimpan perubahan.";
  }

  const labels = {
    edit_room_price: "mengubah tarif room",
    set_room_maintenance: "mengubah status maintenance room",
    edit_menu_price: "mengubah harga menu",
  };
  const action = getSensitiveMasterDataAction();

  return `Masukkan PIN owner/admin untuk ${labels[action] || "menyimpan perubahan sensitif"}.`;
}

async function executeMasterDataSubmit(authData = null, adminPin = "") {
  if (!masterDataForm || isSavingMasterData) {
    return;
  }

  isSavingMasterData = true;
  renderRooms();

  try {
    const data = await postApiAction(buildMasterPayload(authData, adminPin));

    if (!data || (data.ok !== true && data.success !== true)) {
      throw new Error(data?.message || data?.error || "Gagal menyimpan master data.");
    }

    showInlineNotice(data.message || "Master data berhasil disimpan.");
    masterDataForm = null;
    await loadSettingsTabData();
    await Promise.all([
      loadMenuItems(),
      loadInventoryItems(),
      loadRooms(),
    ]);
  } catch (error) {
    showInlineNotice(error.message || "Gagal menyimpan master data.", "error");
  } finally {
    isSavingMasterData = false;
    renderRooms();
  }
}

function loadActiveDashboardTab() {
  try {
    const savedTab = localStorage.getItem(DASHBOARD_TAB_STORAGE_KEY);

    if (savedTab && DASHBOARD_TABS.some((tab) => tab.key === savedTab)) {
      return savedTab;
    }
  } catch (error) {
    console.warn("Gagal membaca tab dashboard dari localStorage.", error);
  }

  return "rooms";
}

function saveActiveDashboardTab(tabKey) {
  try {
    localStorage.setItem(DASHBOARD_TAB_STORAGE_KEY, tabKey);
  } catch (error) {
    console.warn("Gagal menyimpan tab dashboard ke localStorage.", error);
  }
}

function isValidDashboardTab(tabKey) {
  return DASHBOARD_TABS.some((tab) => tab.key === tabKey);
}

function setActiveDashboardTab(tabKey) {
  if (!isValidDashboardTab(tabKey) || activeDashboardTab === tabKey) {
    return;
  }

  activeDashboardTab = tabKey;
  saveActiveDashboardTab(tabKey);
  renderRooms();
  refreshActiveTabData();
}

function refreshActiveTabData() {
  if (!API_BASE_URL.trim() && activeDashboardTab !== "rooms") {
    return;
  }

  switch (activeDashboardTab) {
    case "rooms":
      loadRoomRecoveryCandidates();
      break;
    case "fnb":
      loadMenuItems();
      loadOpenFnbOrders();
      loadTodayFnbOrders();
      break;
    case "stock":
      loadInventoryItems();
      loadTodayStockMovements();
      break;
    case "reports":
      loadOwnerDashboardSummary();
      loadTodayFnbSalesReport();
      loadRoomUsageReport();
      break;
    case "transactions":
      loadTodayTransactions();
      loadTodayCashierClosings();
      break;
    case "audit":
      loadTodayRoomTimeLogs();
      break;
    case "settings":
      loadSettingsTabData();
      break;
    default:
      break;
  }
}

function renderDashboardGlobal() {
  if (!dashboardGlobal) {
    return;
  }

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

  if (tvOffConfirmation) {
    fragment.appendChild(createTvOffConfirmationElement());
  }

  if (roomRecoveryConfirmation) {
    fragment.appendChild(createRoomRecoveryConfirmationElement());
  }

  dashboardGlobal.replaceChildren(fragment);
}

function renderAppTabs() {
  if (!appTabsNav) {
    return;
  }

  const fragment = document.createDocumentFragment();
  const roomsWarningCount = getRoomsTimeWarningCount();

  DASHBOARD_TABS.forEach((tab) => {
    const button = document.createElement("button");
    const label = document.createElement("span");

    button.className = activeDashboardTab === tab.key
      ? "app-tab-button active"
      : "app-tab-button";
    button.type = "button";
    button.role = "tab";
    button.dataset.action = "switch-dashboard-tab";
    button.dataset.tab = tab.key;
    button.setAttribute("aria-selected", activeDashboardTab === tab.key ? "true" : "false");
    label.className = "app-tab-label";
    label.textContent = tab.label;
    button.appendChild(label);

    if (tab.key === "rooms") {
      const badge = document.createElement("span");
      badge.className = "app-tab-badge rooms-warning-badge";
      badge.dataset.role = "rooms-warning-badge";
      badge.hidden = roomsWarningCount <= 0;

      if (roomsWarningCount > 0) {
        badge.textContent = String(roomsWarningCount);
        badge.setAttribute("aria-label", `${roomsWarningCount} room perlu perhatian`);
      }

      button.appendChild(badge);
    }

    fragment.appendChild(button);
  });

  appTabsNav.replaceChildren(fragment);
}

function appendDashboardTabContent(panel, tabKey) {
  switch (tabKey) {
    case "rooms": {
      ensureRoomRecoveryCandidatesLoaded();

      if (hasRoomRecoveryCandidates()) {
        panel.appendChild(createRoomRecoveryPanelElement());
      }

      const roomsContainer = document.createElement("div");
      roomsContainer.className = "rooms-tab-grid";

      if (roomsLoading) {
        roomsContainer.appendChild(createStateMessage("Memuat data ruangan..."));
      } else {
        rooms.forEach((room) => {
          roomsContainer.appendChild(createRoomCard(room));
        });
      }

      panel.appendChild(roomsContainer);
      break;
    }
    case "fnb":
      panel.append(
        createMenuPanelElement(),
        createFbOrderPanelElement(),
        createOpenFnbOrdersPanelElement(),
        createTodayFnbOrdersPanelElement()
      );
      break;
    case "stock":
      panel.append(
        createInventoryPanelElement(),
        createTodayStockMovementsPanelElement()
      );
      break;
    case "reports":
      panel.append(
        createOwnerDashboardElement(),
        createRoomOccupancyElement(),
        createTodayFnbSalesReportPanelElement(),
        createRoomUsageReportPanelElement()
      );
      break;
    case "transactions":
      try {
        panel.appendChild(renderTransactionHistory());
      } catch (error) {
        console.warn("Gagal merender riwayat transaksi.", error);
        panel.appendChild(createStateMessage("Riwayat transaksi gagal ditampilkan.", "error"));
      }
      break;
    case "audit":
      panel.appendChild(createTodayRoomTimeLogsPanelElement());
      break;
    case "settings":
      panel.appendChild(createSettingsPanelElement());
      break;
    default:
      break;
  }
}

function renderDashboardTabPanels() {
  if (!dashboardPanels) {
    return;
  }

  const fragment = document.createDocumentFragment();

  DASHBOARD_TABS.forEach((tab) => {
    const panel = document.createElement("section");
    panel.className = activeDashboardTab === tab.key
      ? `app-tab-panel app-tab-panel--${tab.key} active`
      : `app-tab-panel app-tab-panel--${tab.key}`;
    panel.dataset.tabPanel = tab.key;
    panel.setAttribute("role", "tabpanel");
    panel.hidden = activeDashboardTab !== tab.key;

    if (activeDashboardTab === tab.key) {
      appendDashboardTabContent(panel, tab.key);
    }

    fragment.appendChild(panel);
  });

  dashboardPanels.replaceChildren(fragment);
}

function renderRooms() {
  renderDashboardGlobal();
  renderAppTabs();
  renderDashboardTabPanels();
}

function updateRunningTimers() {
  updateRoomsTimeWarningAwareness({ playSound: true });

  const occupiedCards = dashboardPanels
    ? dashboardPanels.querySelectorAll(".room-card.occupied")
    : [];

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
  extendSessionNote = "";
  renderRooms();
}

function cancelExtendSelection() {
  extendSelectionRoomId = "";
  customExtendMinutes = "";
  extendSessionNote = "";
  renderRooms();
}

function updateCustomExtendMinutes(value) {
  customExtendMinutes = value;
}

function updateExtendSessionNote(value) {
  extendSessionNote = value;
}

async function loadTodayRoomTimeLogs() {
  todayRoomTimeLogSummary = null;

  if (!API_BASE_URL.trim()) {
    todayRoomTimeLogs = [];
    renderRooms();
    return;
  }

  isLoadingRoomTimeLogs = true;
  renderRooms();

  try {
    const data = await fetchTodayRoomTimeLogsFromApi();

    todayRoomTimeLogs = Array.isArray(data.room_time_logs) ? data.room_time_logs : [];
    todayRoomTimeLogSummary = data.summary || null;
  } catch (error) {
    console.warn("Gagal memuat riwayat tambah waktu room.", error);
    todayRoomTimeLogs = [];
    todayRoomTimeLogSummary = null;
  } finally {
    isLoadingRoomTimeLogs = false;
    renderRooms();
  }
}

async function fetchTodayRoomTimeLogsFromApi() {
  if (!API_BASE_URL.trim()) {
    return {
      room_time_logs: [],
      summary: null,
    };
  }

  const params = new URLSearchParams({
    action: "getTodayRoomTimeLogs",
    action_type: "extend_session",
  });
  buildActiveShiftQueryParams().forEach((value, key) => {
    params.set(key, value);
  });

  if (roomTimeLogRoomFilter && roomTimeLogRoomFilter !== "all") {
    params.set("room_id", roomTimeLogRoomFilter);
  }

  const response = await fetch(`${API_BASE_URL}?${params.toString()}`);

  if (!response.ok) {
    throw new Error(`API request failed with status ${response.status}`);
  }

  const data = await response.json();

  if (!data || data.ok !== true || !Array.isArray(data.room_time_logs)) {
    throw new Error(data?.error || "API response is invalid.");
  }

  return {
    room_time_logs: data.room_time_logs,
    summary: data.summary || null,
  };
}

function setRoomTimeLogRoomFilter(roomId) {
  roomTimeLogRoomFilter = roomId || "all";
  resetPaginationPage("roomTimeLogs");
  loadTodayRoomTimeLogs();
}

function getRoomTimeLogRoomFilterOptions() {
  const roomMap = new Map();

  rooms.forEach((room) => {
    if (room.room_id) {
      roomMap.set(room.room_id, room.room_name || room.room_id);
    }
  });

  todayRoomTimeLogs.forEach((log) => {
    if (log.room_id && !roomMap.has(log.room_id)) {
      roomMap.set(log.room_id, log.room_name || log.room_id);
    }
  });

  return [...roomMap.entries()]
    .map(([room_id, room_name]) => ({ room_id, room_name }))
    .sort((first, second) => first.room_name.localeCompare(second.room_name, "id"));
}

function getRoomTimeLogActionLabel(actionType) {
  if (actionType === "extend_session") {
    return "Tambah Waktu";
  }

  return actionType || "-";
}

function getRoomTimeLogEmptyMessage() {
  if (!API_BASE_URL.trim()) {
    return "Riwayat tambah waktu hanya tersedia saat terhubung ke server.";
  }

  if (roomTimeLogRoomFilter !== "all") {
    return "Tidak ada riwayat tambah waktu pada shift aktif untuk room yang dipilih.";
  }

  return "Belum ada riwayat tambah waktu room pada shift aktif.";
}

function createTodayRoomTimeLogsPanelElement() {
  const panel = document.createElement("section");
  panel.className = "room-time-logs-panel";
  panel.setAttribute("aria-labelledby", "room-time-logs-title");

  const header = document.createElement("div");
  header.className = "room-time-logs-header";

  const titleGroup = document.createElement("div");

  const title = document.createElement("h2");
  title.className = "room-time-logs-title";
  title.id = "room-time-logs-title";
  title.textContent = "Riwayat Tambah Waktu Room - Shift Aktif";

  const subtitle = document.createElement("p");
  subtitle.className = "room-time-logs-subtitle";
  subtitle.textContent = "Audit log perubahan durasi booking room pada shift operasional aktif.";

  titleGroup.append(title, subtitle);

  const actions = document.createElement("div");
  actions.className = "room-time-logs-actions";

  const refreshButton = document.createElement("button");
  refreshButton.className = "room-time-logs-button";
  refreshButton.type = "button";
  refreshButton.dataset.action = "refresh-room-time-logs";
  refreshButton.disabled = isLoadingRoomTimeLogs || !API_BASE_URL.trim();
  refreshButton.textContent = isLoadingRoomTimeLogs ? "Memuat..." : "Refresh Riwayat Tambah Waktu";

  actions.appendChild(refreshButton);
  header.append(titleGroup, actions);

  const summary = todayRoomTimeLogSummary || {
    total_logs: 0,
    total_added_minutes: 0,
    rooms_extended: 0,
  };
  const list = document.createElement("div");
  list.className = "room-time-logs-list";

  if (isLoadingRoomTimeLogs) {
    list.appendChild(createStateMessage("Memuat riwayat tambah waktu room..."));
  } else if (todayRoomTimeLogs.length === 0) {
    const empty = document.createElement("p");
    empty.className = "room-time-logs-empty";
    empty.textContent = getRoomTimeLogEmptyMessage();
    list.appendChild(empty);
  } else {
    const paginatedLogs = getPaginatedSlice("roomTimeLogs", todayRoomTimeLogs);
    paginatedLogs.items.forEach((log) => {
      list.appendChild(createRoomTimeLogRowElement(log));
    });
    list.appendChild(createPaginationControlsElement("roomTimeLogs", todayRoomTimeLogs.length));
  }

  panel.append(
    header,
    createOperationalShiftNoteElement("shift-period-note"),
    createRoomTimeLogSummaryElement(summary),
    createRoomTimeLogToolbarElement(),
    list
  );

  return panel;
}

function createRoomTimeLogSummaryElement(summary) {
  const grid = document.createElement("div");
  grid.className = "room-time-logs-summary";

  [
    ["Total Tambah Waktu", Number(summary.total_logs) || 0],
    ["Total Menit Ditambahkan", Number(summary.total_added_minutes) || 0],
    ["Jumlah Room Ditambah Waktu", Number(summary.rooms_extended) || 0],
  ].forEach(([labelText, valueText]) => {
    const card = document.createElement("div");
    card.className = "room-time-logs-summary-card";

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

function createRoomTimeLogToolbarElement() {
  const toolbar = document.createElement("div");
  toolbar.className = "room-time-logs-toolbar";

  const roomFilter = document.createElement("select");
  roomFilter.className = "room-time-logs-room-filter";
  roomFilter.dataset.action = "filter-room-time-log-room";

  const allRoomsOption = document.createElement("option");
  allRoomsOption.value = "all";
  allRoomsOption.textContent = "Semua Room";
  roomFilter.appendChild(allRoomsOption);

  getRoomTimeLogRoomFilterOptions().forEach((room) => {
    const option = document.createElement("option");
    option.value = room.room_id;
    option.textContent = room.room_name || room.room_id;
    roomFilter.appendChild(option);
  });

  roomFilter.value = roomTimeLogRoomFilter;
  roomFilter.disabled = isLoadingRoomTimeLogs || !API_BASE_URL.trim();

  toolbar.appendChild(roomFilter);

  return toolbar;
}

function createRoomTimeLogRowElement(log) {
  const row = document.createElement("article");
  row.className = "room-time-logs-row";

  const header = document.createElement("div");
  header.className = "room-time-logs-row-header";

  const titleGroup = document.createElement("div");

  const roomName = document.createElement("h3");
  roomName.className = "room-time-logs-room-name";
  roomName.textContent = log.room_name || log.room_id || "-";

  const meta = document.createElement("p");
  meta.className = "room-time-logs-meta";
  meta.textContent = `${log.created_at || "-"} - ${log.log_id || "-"}`;

  titleGroup.append(roomName, meta);

  const badge = document.createElement("span");
  badge.className = withStatusBadge("room-time-logs-badge", "info");
  badge.textContent = getRoomTimeLogActionLabel(log.action_type);

  header.append(titleGroup, badge);

  const details = document.createElement("div");
  details.className = "room-time-logs-details";

  [
    ["Durasi Lama", formatDurationMinutes(log.old_booked_duration_minutes)],
    ["Durasi Baru", formatDurationMinutes(log.new_booked_duration_minutes)],
    ["Jadwal Selesai Lama", log.old_scheduled_end_time || "-"],
    ["Jadwal Selesai Baru", log.new_scheduled_end_time || "-"],
    ["Tambah Menit", String(Number(log.add_minutes) || 0)],
    ["Kasir", log.cashier_name || "-"],
  ].forEach(([labelText, valueText]) => {
    const item = document.createElement("div");
    item.className = "room-time-logs-detail-item";

    const label = document.createElement("p");
    label.className = "room-time-logs-detail-label";
    label.textContent = labelText;

    const value = document.createElement("p");
    value.className = "room-time-logs-detail-value";
    value.textContent = valueText;

    item.append(label, value);
    details.appendChild(item);
  });

  row.append(header, details);

  if (log.note) {
    const note = document.createElement("p");
    note.className = "room-time-logs-note";
    note.textContent = log.note;
    row.appendChild(note);
  }

  return row;
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
    const payload = {
      action: "extendSession",
      room_id: roomId,
      add_minutes: selectedMinutes,
      cashier_name: getLoggedInOperatorName(),
    };

    if (extendSessionNote.trim()) {
      payload.note = extendSessionNote.trim();
    }

    const data = await postApiAction(payload);

    if (!data || data.ok !== true) {
      throw new Error(data?.error || "Gagal menambah waktu sesi.");
    }

    showInlineNotice(getExtendSuccessMessage(roomName, selectedMinutes));
    extendSelectionRoomId = "";
    customExtendMinutes = "";
    extendSessionNote = "";
    await loadRooms();
    await loadTodayRoomTimeLogs();
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
      cashier_name: getLoggedInOperatorName(),
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
    await loadTodayFnbSalesReport();
    await loadTodayTransactions();
  } catch (error) {
    showInlineNotice(error.message || "Gagal menyelesaikan sesi.", "error");
  } finally {
    setActionButtonsDisabled(false);
  }
}

function openTvOffConfirmation(roomId, tvDeviceId) {
  const room = rooms.find((item) => item.room_id === roomId);

  if (!room || !tvDeviceId) {
    showInlineNotice("TV belum disetting untuk room ini.", "error");
    return;
  }

  tvOffConfirmation = {
    room_id: roomId,
    room_name: room.room_name || roomId,
    tv_device_id: tvDeviceId,
  };
  renderRooms();
}

function closeTvOffConfirmation() {
  if (isSendingTvCommand) {
    return;
  }

  tvOffConfirmation = null;
  renderRooms();
}

function createTvOffConfirmationElement() {
  const overlay = document.createElement("section");
  overlay.className = "master-delete-modal tv-off-modal";
  overlay.setAttribute("aria-labelledby", "tv-off-title");

  const dialog = document.createElement("div");
  dialog.className = "master-delete-dialog tv-off-dialog";

  const title = document.createElement("h3");
  title.className = "master-delete-title";
  title.id = "tv-off-title";
  title.textContent = "Konfirmasi TV OFF";

  const warning = document.createElement("p");
  warning.className = "master-delete-warning";
  warning.textContent = `Kirim perintah TV OFF untuk ${tvOffConfirmation.room_name}?`;

  const actions = document.createElement("div");
  actions.className = "master-delete-actions";

  const cancelButton = document.createElement("button");
  cancelButton.className = "master-button secondary";
  cancelButton.type = "button";
  cancelButton.dataset.action = "close-tv-off-confirmation";
  cancelButton.textContent = "Batal";

  const confirmButton = document.createElement("button");
  confirmButton.className = "master-button danger";
  confirmButton.type = "button";
  confirmButton.dataset.action = "submit-tv-off";
  confirmButton.disabled = isSendingTvCommand;
  confirmButton.textContent = isSendingTvCommand ? "Mengirim..." : "Kirim TV OFF";

  actions.append(cancelButton, confirmButton);
  dialog.append(title, warning, actions);
  overlay.appendChild(dialog);

  return overlay;
}

function openRoomRecoveryConfirmation(roomId, sessionId) {
  const candidate = findRoomRecoveryCandidate(roomId, sessionId);

  if (!candidate) {
    showInlineNotice("Kandidat recovery tidak ditemukan. Refresh data room lalu coba lagi.", "error");
    return;
  }

  if (!candidate.safe_to_recover) {
    showInlineNotice("Room ini perlu review manual dan tidak bisa dipulihkan dari UI.", "error");
    return;
  }

  roomRecoveryConfirmation = {
    room_id: candidate.room_id || "",
    room_name: candidate.room_name || candidate.room_id || "Room",
    session_id: candidate.session_id || "",
    expired_minutes: candidate.expired_minutes,
    reason: candidate.reason || "",
    typedText: "",
    note: "",
  };
  renderRooms();
}

function closeRoomRecoveryConfirmation() {
  if (isRecoveringRoom) {
    return;
  }

  roomRecoveryConfirmation = null;
  renderRooms();
}

function updateRoomRecoveryConfirmation(field, value) {
  if (!roomRecoveryConfirmation) {
    return;
  }

  roomRecoveryConfirmation = {
    ...roomRecoveryConfirmation,
    [field]: value,
  };
}

function syncRoomRecoveryConfirmationControls() {
  if (!dashboardGlobal || !roomRecoveryConfirmation) {
    return;
  }

  const submitButton = dashboardGlobal.querySelector("[data-role='room-recovery-submit']");

  if (submitButton) {
    submitButton.disabled = isRecoveringRoom || roomRecoveryConfirmation.typedText !== "RECOVER";
  }
}

function createRoomRecoveryConfirmationElement() {
  const overlay = document.createElement("section");
  overlay.className = "master-delete-modal room-recovery-modal";
  overlay.setAttribute("aria-labelledby", "room-recovery-confirm-title");

  const dialog = document.createElement("div");
  dialog.className = "master-delete-dialog room-recovery-dialog";

  const title = document.createElement("h3");
  title.className = "master-delete-title";
  title.id = "room-recovery-confirm-title";
  title.textContent = "Konfirmasi Pemulihan Room";

  const warning = document.createElement("p");
  warning.className = "master-delete-warning";
  warning.textContent = "Pemulihan hanya mengubah status room menjadi available dan mengosongkan durasi/jadwal selesai. Transaksi, F&B, pembayaran, dan start_time tidak disentuh.";

  const details = document.createElement("div");
  details.className = "master-delete-details room-recovery-confirm-details";

  [
    ["Room", `${roomRecoveryConfirmation.room_name} (${roomRecoveryConfirmation.room_id})`],
    ["Expired", formatExpiredMinutesText(roomRecoveryConfirmation.expired_minutes)],
    ["Sesi", roomRecoveryConfirmation.session_id || "-"],
  ].forEach(([labelText, valueText]) => {
    const item = document.createElement("div");
    const label = document.createElement("p");
    label.className = "transaction-label";
    label.textContent = labelText;
    const value = document.createElement("p");
    value.className = "transaction-value";
    value.textContent = valueText || "-";
    item.append(label, value);
    details.appendChild(item);
  });

  const reason = document.createElement("p");
  reason.className = "room-recovery-confirm-reason";
  reason.textContent = roomRecoveryConfirmation.reason || "Tidak ada alasan dari diagnostic.";

  const typedField = createRoomRecoveryField(
    "Ketik RECOVER",
    "typedText",
    roomRecoveryConfirmation.typedText,
    "input"
  );
  const noteField = createRoomRecoveryField(
    "Alasan tambahan",
    "note",
    roomRecoveryConfirmation.note,
    "textarea"
  );

  const actions = document.createElement("div");
  actions.className = "master-delete-actions";

  const cancelButton = document.createElement("button");
  cancelButton.className = "master-button secondary";
  cancelButton.type = "button";
  cancelButton.dataset.action = "close-room-recovery-confirmation";
  cancelButton.disabled = isRecoveringRoom;
  cancelButton.textContent = "Batal";

  const submitButton = document.createElement("button");
  submitButton.className = "master-button primary";
  submitButton.type = "button";
  submitButton.dataset.action = "submit-room-recovery";
  submitButton.dataset.role = "room-recovery-submit";
  submitButton.disabled = isRecoveringRoom || roomRecoveryConfirmation.typedText !== "RECOVER";
  submitButton.textContent = isRecoveringRoom ? "Memulihkan..." : "Pulihkan Room";

  actions.append(cancelButton, submitButton);
  dialog.append(title, warning, details, reason, typedField, noteField, actions);
  overlay.appendChild(dialog);

  return overlay;
}

function createRoomRecoveryField(labelText, field, value, type = "input") {
  const wrapper = document.createElement("label");
  wrapper.className = "master-form-field";

  const label = document.createElement("span");
  label.className = "master-form-label";
  label.textContent = labelText;

  const input = type === "textarea"
    ? document.createElement("textarea")
    : document.createElement("input");

  input.className = type === "textarea"
    ? "master-form-input room-recovery-textarea"
    : "master-form-input";
  input.dataset.action = "update-room-recovery-confirmation";
  input.dataset.field = field;
  input.value = value || "";

  if (type !== "textarea") {
    input.type = "text";
  } else {
    input.rows = 3;
  }

  wrapper.append(label, input);
  return wrapper;
}

async function submitRoomRecovery() {
  if (!roomRecoveryConfirmation) {
    return;
  }

  if (roomRecoveryConfirmation.typedText !== "RECOVER") {
    showInlineNotice("Ketik RECOVER untuk mengaktifkan pemulihan room.", "error");
    return;
  }

  if (!API_BASE_URL.trim()) {
    showInlineNotice("API belum dikonfigurasi. Isi URL server dulu di config.js.", "error");
    return;
  }

  isRecoveringRoom = true;
  setActionButtonsDisabled(true);
  renderRooms();

  try {
    const reason = roomRecoveryConfirmation.note.trim()
      || roomRecoveryConfirmation.reason
      || "Manual expired room recovery";

    const data = await postApiAction({
      action: "recoverExpiredRoomSession",
      room_id: roomRecoveryConfirmation.room_id,
      session_id: roomRecoveryConfirmation.session_id,
      confirm: "RECOVER",
      reason,
      actor: getLoggedInOperatorName(),
    });

    if (!data || data.ok !== true) {
      throw new Error(data?.message || data?.error || data?.code || "Gagal memulihkan room.");
    }

    showInlineNotice(data.message || "Room berhasil dipulihkan.");
    roomRecoveryConfirmation = null;
    await loadRooms();
  } catch (error) {
    showInlineNotice(error.message || "Gagal memulihkan room.", "error");
  } finally {
    isRecoveringRoom = false;
    setActionButtonsDisabled(false);
    renderRooms();
  }
}

async function sendTvCommand(roomId, tvDeviceId, tvAction) {
  if (!API_BASE_URL.trim()) {
    showInlineNotice("API belum dikonfigurasi. Isi URL server dulu di config.js.", "error");
    return;
  }

  if (!tvDeviceId) {
    showInlineNotice("TV belum disetting untuk room ini.", "error");
    return;
  }

  isSendingTvCommand = true;
  setActionButtonsDisabled(true);
  renderRooms();

  try {
    const data = await postApiAction({
      action: "sendTvCommand",
      room_id: roomId,
      tv_device_id: tvDeviceId,
      tv_action: tvAction,
      trigger_source: "room_card",
      cashier_name: getLoggedInOperatorName(),
    });

    if (!data || data.success !== true) {
      throw new Error(data?.message || "Perintah TV gagal dikirim.");
    }

    showInlineNotice(data.message || "Perintah TV berhasil dikirim.");
    tvOffConfirmation = null;
    await loadRooms();
  } catch (error) {
    showInlineNotice(error.message || "Perintah TV gagal dikirim.", "error");
    await loadRooms();
  } finally {
    isSendingTvCommand = false;
    setActionButtonsDisabled(false);
    renderRooms();
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
      cashier_name: getLoggedInOperatorName(),
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

function ensureOperatorHeader() {
  if (!appHeader) {
    return null;
  }

  let operatorPanel = appHeader.querySelector(".operator-session");

  if (!operatorPanel) {
    operatorPanel = document.createElement("div");
    operatorPanel.className = "operator-session";

    if (dataSourceBadge) {
      dataSourceBadge.insertAdjacentElement("afterend", operatorPanel);
    } else {
      appHeader.appendChild(operatorPanel);
    }
  }

  return operatorPanel;
}

function renderOperatorHeader() {
  const operatorPanel = ensureOperatorHeader();

  if (!operatorPanel) {
    return;
  }

  operatorPanel.replaceChildren();

  if (!isOperatorLoggedIn()) {
    operatorPanel.hidden = true;
    return;
  }

  operatorPanel.hidden = false;

  const operatorLabel = document.createElement("span");
  operatorLabel.className = "operator-session-label";
  operatorLabel.textContent = `Operator: ${currentOperator.employee_name} (${currentOperator.role})`;

  const logoutButton = document.createElement("button");
  logoutButton.type = "button";
  logoutButton.className = "btn btn-secondary operator-logout-button";
  logoutButton.dataset.action = "logout-operator";
  logoutButton.textContent = "Logout";

  operatorPanel.append(operatorLabel, logoutButton);
}

function renderLoginScreen() {
  let loginScreen = document.querySelector("#operatorLoginScreen");

  if (isOperatorLoggedIn()) {
    document.body.classList.remove("login-required");

    if (loginScreen) {
      loginScreen.remove();
    }

    return;
  }

  document.body.classList.add("login-required");

  if (!loginScreen) {
    loginScreen = document.createElement("section");
    loginScreen.id = "operatorLoginScreen";
    loginScreen.className = "operator-login-screen";
    loginScreen.setAttribute("aria-labelledby", "operatorLoginTitle");
    document.body.appendChild(loginScreen);
  }

  loginScreen.replaceChildren();

  const loginPanel = document.createElement("form");
  loginPanel.className = "operator-login-panel";
  loginPanel.dataset.action = "operator-login-form";

  const kicker = document.createElement("p");
  kicker.className = "operator-login-kicker";
  kicker.textContent = "Akses Operator";

  const title = document.createElement("h2");
  title.id = "operatorLoginTitle";
  title.textContent = "Masuk Dashboard";

  const label = document.createElement("label");
  label.className = "operator-login-field";
  label.htmlFor = "operatorLoginPin";
  label.textContent = "PIN Operator";

  const input = document.createElement("input");
  input.id = "operatorLoginPin";
  input.className = "operator-login-input";
  input.type = "password";
  input.inputMode = "numeric";
  input.pattern = "[0-9]*";
  input.autocomplete = "current-password";
  input.value = loginPin;
  input.placeholder = "Masukkan PIN";
  input.disabled = isLoggingIn;
  input.dataset.action = "update-operator-login-pin";

  label.appendChild(input);

  const submitButton = document.createElement("button");
  submitButton.type = "submit";
  submitButton.className = "btn btn-primary operator-login-button";
  submitButton.disabled = isLoggingIn || !loginPin.trim();
  submitButton.textContent = isLoggingIn ? "Memeriksa..." : "Masuk";

  loginPanel.append(kicker, title, label);

  if (loginErrorMessage) {
    const error = document.createElement("p");
    error.className = "operator-login-error";
    error.setAttribute("role", "alert");
    error.textContent = loginErrorMessage;
    loginPanel.appendChild(error);
  }

  loginPanel.appendChild(submitButton);
  loginScreen.appendChild(loginPanel);

  window.requestAnimationFrame(() => {
    const activeInput = document.querySelector("#operatorLoginPin");

    if (activeInput && document.activeElement !== activeInput) {
      activeInput.focus();
    }
  });
}

async function handleOperatorLogin() {
  if (isLoggingIn) {
    return;
  }

  const pin = loginPin.trim();

  if (!pin) {
    loginErrorMessage = "PIN tidak valid";
    renderLoginScreen();
    return;
  }

  if (!API_BASE_URL.trim()) {
    loginErrorMessage = "Server login belum dikonfigurasi.";
    renderLoginScreen();
    return;
  }

  isLoggingIn = true;
  loginErrorMessage = "";
  renderLoginScreen();

  try {
    const data = await postApiAction({
      action: "validateAdminPin",
      pin,
      required_role: "staff",
      requested_action: "login",
      changed_by: "login_screen",
    });

    const employee = data?.employee || data?.data;

    if (data?.success !== true || !employee?.employee_id || !employee?.employee_name || !employee?.role) {
      throw new Error("PIN tidak valid");
    }

    saveOperatorSession(employee);
    loginPin = "";
    loginErrorMessage = "";
    renderOperatorHeader();
    renderLoginScreen();
  } catch (error) {
    loginErrorMessage = "PIN tidak valid";
    renderLoginScreen();
    return;
  } finally {
    isLoggingIn = false;
    renderLoginScreen();
  }

  await initializeDashboard();
}

function handleOperatorLogout() {
  clearOperatorSession();
  renderOperatorHeader();
  renderLoginScreen();
}

function formatCurrency(value) {
  return currencyFormatter.format(Number(value) || 0);
}

function setActionButtonsDisabled(isDisabled) {
  if (!dashboardShell) {
    return;
  }

  dashboardShell
    .querySelectorAll(
      ".room-button, .billing-payment-button, .transaction-filter-button, .transaction-action-button, .transaction-pay-button"
        + ", .cashier-closing-button, .today-fnb-button, .today-fnb-filter-button, .fnb-cancel-button, .inventory-button"
        + ", .stock-adjustment-button, .duration-option-button, .duration-custom-button, .duration-cancel-button"
        + ", .room-button-extend, .extend-option-button, .extend-custom-button, .extend-cancel-button"
        + ", .room-tv-button, .room-recovery-button"
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

  if (action === "switch-dashboard-tab") {
    setActiveDashboardTab(button.dataset.tab || "rooms");
    return;
  }

  if (action === "refresh-settings-data") {
    await loadSettingsTabData();
    return;
  }

  if (action === "refresh-tv-integration") {
    await Promise.all([loadTvDevices(), loadTvControlLogs()]);
    return;
  }

  if (action === "add-tv-device-mapping") {
    openTvDeviceForm("create");
    return;
  }

  if (action === "edit-tv-device-mapping") {
    const device = findTvDeviceItem(button.dataset.tvDeviceId || "");

    if (!device) {
      showInlineNotice("TV device tidak ditemukan.", "error");
      return;
    }

    openTvDeviceForm("edit", device);
    return;
  }

  if (action === "close-tv-device-form") {
    closeTvDeviceForm();
    return;
  }

  if (action === "submit-tv-device-form") {
    await submitTvDeviceForm();
    return;
  }

  if (action === "toggle-tv-device-status") {
    await toggleTvDeviceStatus(button.dataset.tvDeviceId || "");
    return;
  }

  if (action === "send-tv-test-from-settings") {
    await sendTvCommandFromSettings(
      button.dataset.roomId || "",
      button.dataset.tvDeviceId || ""
    );
    return;
  }

  if (action === "add-master-data") {
    openMasterDataForm(button.dataset.masterType, "create");
    return;
  }

  if (action === "edit-master-data") {
    const item = findMasterItem(button.dataset.masterType, button.dataset.masterId);

    if (!item) {
      showInlineNotice("Data master tidak ditemukan.", "error");
      return;
    }

    openMasterDataForm(button.dataset.masterType, "edit", item);
    return;
  }

  if (action === "confirm-delete-master-data") {
    const item = findMasterItem(button.dataset.masterType, button.dataset.masterId);

    if (!item) {
      showInlineNotice("Data master tidak ditemukan.", "error");
      return;
    }

    openDeleteMasterConfirmation(button.dataset.masterType, item);
    return;
  }

  if (action === "close-delete-master-confirmation") {
    closeDeleteMasterConfirmation();
    return;
  }

  if (action === "submit-delete-master-data") {
    await submitDeleteMasterData();
    return;
  }

  if (action === "close-admin-pin-modal") {
    closeAdminPinModal();
    return;
  }

  if (action === "submit-admin-pin-modal") {
    await submitAdminPinModal();
    return;
  }

  if (action === "refresh-master-audit-logs") {
    await loadMasterDataAuditLogs();
    return;
  }

  if (action === "close-master-form") {
    closeMasterDataForm();
    return;
  }

  if (action === "submit-master-form") {
    await submitMasterDataForm();
    return;
  }

  if (action === "pagination-prev") {
    const paginationKey = button.dataset.paginationKey || "";
    const state = getPaginationState(paginationKey);
    setPaginationPage(paginationKey, state.page - 1);
    return;
  }

  if (action === "pagination-next") {
    const paginationKey = button.dataset.paginationKey || "";
    const state = getPaginationState(paginationKey);
    setPaginationPage(paginationKey, state.page + 1);
    return;
  }

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

  if (action === "confirm-tv-off") {
    openTvOffConfirmation(button.dataset.roomId || roomId || "", button.dataset.tvDeviceId || "");
    return;
  }

  if (action === "close-tv-off-confirmation") {
    closeTvOffConfirmation();
    return;
  }

  if (action === "submit-tv-off") {
    if (tvOffConfirmation) {
      await sendTvCommand(
        tvOffConfirmation.room_id,
        tvOffConfirmation.tv_device_id,
        "power_off"
      );
    }
    return;
  }

  if (action === "open-room-recovery-confirmation") {
    openRoomRecoveryConfirmation(
      button.dataset.roomId || "",
      button.dataset.sessionId || ""
    );
    return;
  }

  if (action === "close-room-recovery-confirmation") {
    closeRoomRecoveryConfirmation();
    return;
  }

  if (action === "submit-room-recovery") {
    await submitRoomRecovery();
    return;
  }

  if (action === "send-tv-command") {
    await sendTvCommand(
      button.dataset.roomId || roomId || "",
      button.dataset.tvDeviceId || "",
      button.dataset.tvAction || ""
    );
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

  if (action === "filter-transaction-period") {
    setTransactionPeriodFilter(button.dataset.period || "today");
    return;
  }

  if (action === "apply-transaction-custom-period") {
    await applyTransactionCustomPeriod();
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

  if (action === "refresh-fnb-sales-report") {
    await loadTodayFnbSalesReport();
    return;
  }

  if (action === "refresh-owner-dashboard") {
    await loadOwnerDashboardSummary();
    return;
  }

  if (action === "refresh-room-usage-report") {
    await loadRoomUsageReport();
    return;
  }

  if (action === "filter-room-usage-period") {
    setRoomUsagePeriodFilter(button.dataset.period || "today");
    return;
  }

  if (action === "apply-room-usage-custom-period") {
    await applyRoomUsageCustomPeriod();
    return;
  }

  if (action === "refresh-room-time-logs") {
    await loadTodayRoomTimeLogs();
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

  if (action === "update-extend-session-note") {
    updateExtendSessionNote(field.value);
    return;
  }

  if (action === "update-transaction-custom-start-date") {
    updateTransactionCustomStartDate(field.value);
    return;
  }

  if (action === "update-transaction-custom-end-date") {
    updateTransactionCustomEndDate(field.value);
    return;
  }

  if (action === "update-room-usage-custom-start-date") {
    updateRoomUsageCustomStartDate(field.value);
    return;
  }

  if (action === "update-room-usage-custom-end-date") {
    updateRoomUsageCustomEndDate(field.value);
    return;
  }

  if (action === "update-master-form") {
    updateMasterDataForm(field.dataset.field, field.value);
    return;
  }

  if (action === "update-tv-device-form") {
    updateTvDeviceForm(field.dataset.field, field.value);
    return;
  }

  if (action === "update-delete-master-confirmation") {
    updateDeleteMasterConfirmation(field.dataset.field, field.value);
    syncDeleteMasterConfirmationControls();
    return;
  }

  if (action === "update-admin-pin-modal") {
    updateAdminPinModal(field.dataset.field, field.value);
    syncAdminPinModalControls();
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
  const masterField = event.target.closest("[data-action='update-master-form']");

  if (masterField) {
    updateMasterDataForm(masterField.dataset.field, masterField.value);
    return;
  }

  const tvDeviceField = event.target.closest("[data-action='update-tv-device-form']");

  if (tvDeviceField) {
    updateTvDeviceForm(tvDeviceField.dataset.field, tvDeviceField.value);
    return;
  }

  const deleteConfirmationField = event.target.closest("[data-action='update-delete-master-confirmation']");

  if (deleteConfirmationField) {
    updateDeleteMasterConfirmation(deleteConfirmationField.dataset.field, deleteConfirmationField.value);
    syncDeleteMasterConfirmationControls();
    return;
  }

  const adminPinField = event.target.closest("[data-action='update-admin-pin-modal']");

  if (adminPinField) {
    updateAdminPinModal(adminPinField.dataset.field, adminPinField.value);
    syncAdminPinModalControls();
    return;
  }

  const roomRecoveryField = event.target.closest("[data-action='update-room-recovery-confirmation']");

  if (roomRecoveryField) {
    updateRoomRecoveryConfirmation(roomRecoveryField.dataset.field, roomRecoveryField.value);
    syncRoomRecoveryConfirmationControls();
    return;
  }

  const auditEntityFilter = event.target.closest("[data-action='filter-master-audit-entity']");

  if (auditEntityFilter) {
    masterAuditEntityFilter = auditEntityFilter.value || "all";
    loadMasterDataAuditLogs();
    return;
  }

  const auditActionFilter = event.target.closest("[data-action='filter-master-audit-action']");

  if (auditActionFilter) {
    masterAuditActionFilter = auditActionFilter.value || "all";
    loadMasterDataAuditLogs();
    return;
  }

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
    return;
  }

  const roomTimeLogRoomFilterSelect = event.target.closest(".room-time-logs-room-filter");

  if (roomTimeLogRoomFilterSelect) {
    setRoomTimeLogRoomFilter(roomTimeLogRoomFilterSelect.value);
  }
}

document.addEventListener("input", (event) => {
  const loginPinInput = event.target.closest("[data-action='update-operator-login-pin']");

  if (!loginPinInput) {
    return;
  }

  loginPin = loginPinInput.value.replace(/\D/g, "");
  loginErrorMessage = "";
  renderLoginScreen();
});

document.addEventListener("submit", (event) => {
  const loginForm = event.target.closest("[data-action='operator-login-form']");

  if (!loginForm) {
    return;
  }

  event.preventDefault();
  handleOperatorLogin();
});

document.addEventListener("click", (event) => {
  const logoutButton = event.target.closest("[data-action='logout-operator']");

  if (!logoutButton) {
    return;
  }

  handleOperatorLogout();
});

if (dashboardShell) {
  dashboardShell.addEventListener("pointerdown", unlockRoomWarningAudio, { once: true });
  dashboardShell.addEventListener("keydown", unlockRoomWarningAudio, { once: true });
  dashboardShell.addEventListener("click", handleRoomAction);
  dashboardShell.addEventListener("input", handleDashboardInput);
  dashboardShell.addEventListener("change", handleDashboardChange);
}
initializeDashboard();
setInterval(updateRunningTimers, 1000);

async function initializeDashboard() {
  renderOperatorHeader();
  renderLoginScreen();

  if (!isOperatorLoggedIn()) {
    return;
  }

  if (dashboardDataInitialized) {
    renderRooms();
    return;
  }

  dashboardDataInitialized = true;
  renderRooms();
  loadMenuItems();
  loadOpenFnbOrders();
  loadInventoryItems();
  await loadRooms();
  await Promise.all([
    loadTodayFnbOrders(),
    loadTodayStockMovements(),
    loadOwnerDashboardSummary(),
    loadTodayFnbSalesReport(),
    loadRoomUsageReport(),
    loadTodayRoomTimeLogs(),
    loadTodayTransactions(),
    loadTodayCashierClosings(),
    activeDashboardTab === "settings" ? loadSettingsTabData() : Promise.resolve(),
  ]);
}
