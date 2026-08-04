/*
  Renderer utama dashboard.
  File ini memuat data ruangan, merender kartu, dan memperbarui timer ruangan terisi.

  TODO: Isi API_BASE_URL di config.js dengan URL Web App Google Apps Script
  agar action=getRooms menggantikan sumber data contoh di production.
*/

import {
  API_BASE_URL,
  DEV_MIN_SESSION_MINUTES,
  DEV_SHORT_SESSION_ENABLED,
  LOCAL_TV_BRIDGE_ENABLED,
  LOCAL_TV_BRIDGE_URL,
} from "./config.js?v=fnb-detail-fix-v1";
import { rooms as mockRooms } from "./mock-data.js";
import { buildReceiptData, formatReceipt58mm } from "./receipt.js?v=receipt-reprint-v2";
import { printThermalReceipt } from "./printer-adapter.js?v=receipt-reprint-v2";

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
  { key: "lc", label: "LC" },
  { key: "reports", label: "Laporan" },
  { key: "transactions", label: "Transaksi" },
  { key: "audit", label: "Audit" },
  { key: "promosi", label: "Promosi" },
  { key: "settings", label: "Pengaturan" },
];
const ROLE_ALIASES = {
  admin: "manager",
};
const ROLE_LABELS = {
  owner: "Owner",
  manager: "Manager Operasional",
  cashier: "Kasir",
  receptionist: "Resepsionis",
  staff: "Staff",
};
const ROLE_DASHBOARD_TABS = {
  owner: ["rooms", "fnb", "stock", "lc", "reports", "transactions", "audit", "promosi", "settings"],
  manager: ["rooms", "fnb", "stock", "lc", "reports", "transactions", "audit", "promosi", "settings"],
  cashier: ["rooms", "fnb", "lc", "reports", "transactions"],
  receptionist: ["rooms"],
};
const ROLE_REPORT_SUB_TABS = {
  owner: ["owner", "cashier", "fnb", "room"],
  manager: ["cashier", "fnb", "room"],
  cashier: ["cashier"],
  receptionist: [],
};
const FNB_PRIMARY_CATEGORY_ORDER = ["favorites", "Food", "Beverage", "Beer", "Spirit", "Anggur", "Cigarette"];
const FNB_SPIRIT_SUBCATEGORY_ORDER = [
  "Cognac",
  "Vodka",
  "Tequila",
  "Gin",
  "Rum",
  "Blended",
  "Single Malt",
  "American Whisky",
  "Lokal",
];
const FNB_SPIRIT_CATEGORY_ALIASES = new Map([
  ["cognac", "Cognac"],
  ["vodca", "Vodka"],
  ["vodka", "Vodka"],
  ["tequila", "Tequila"],
  ["gin", "Gin"],
  ["rum", "Rum"],
  ["blended", "Blended"],
  ["single malt", "Single Malt"],
  ["american whisky", "American Whisky"],
  ["lokal", "Lokal"],
]);
const FNB_CATEGORY_LABELS = {
  all: "Semua",
  favorites: "Favorit",
  Food: "Food",
  Beverage: "Beverage",
  Beer: "Beer",
  Spirit: "Spirit",
  Anggur: "Anggur",
  Cigarette: "Rokok",
};
const FNB_CATEGORY_ICONS = {
  all: "📋",
  favorites: "⭐",
  Food: "🍔",
  Beverage: "🍹",
  Beer: "🍺",
  Spirit: "🍾",
  Anggur: "🍷",
  Cigarette: "🚬",
};
const FNB_FAVORITE_ITEM_NAMES = new Set([
  "es teh manis",
  "mineral water 600ml",
  "french fries",
  "bintang",
  "anggur merah",
  "sampoerna mild red",
]);
const dataSourceBadge = document.querySelector("#dataSourceBadge");
const currencyFormatter = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});
const ROOM_WARNING_SOUND_DURATION_MS = 180;
const ROOM_WARNING_SOUND_FREQUENCY_HZ = 880;
const API_GET_MAX_CONCURRENCY = 2;
let activeApiGetCount = 0;
const pendingApiGetTasks = [];
const inFlightApiGetRequests = new Map();

function buildApiUrl(action, params = null) {
  const url = new URL(API_BASE_URL);
  url.searchParams.set("action", action);
  url.searchParams.set("_cb", `${Date.now()}-${Math.random().toString(36).slice(2)}`);

  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined || value === null || value === "") {
        return;
      }
      url.searchParams.set(key, String(value));
    });
  }

  return url.toString();
}

function getApiRequestKey(url) {
  const requestUrl = new URL(url);
  requestUrl.searchParams.delete("_cb");
  requestUrl.searchParams.delete("_retry");
  requestUrl.searchParams.sort();
  return requestUrl.toString();
}

function drainApiGetQueue() {
  while (activeApiGetCount < API_GET_MAX_CONCURRENCY && pendingApiGetTasks.length > 0) {
    const task = pendingApiGetTasks.shift();
    activeApiGetCount += 1;

    task.run()
      .then(task.resolve, task.reject)
      .finally(() => {
        activeApiGetCount -= 1;
        drainApiGetQueue();
      });
  }
}

function scheduleApiGet(run) {
  return new Promise((resolve, reject) => {
    pendingApiGetTasks.push({ run, resolve, reject });
    drainApiGetQueue();
  });
}

async function executeApiGet(url) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const requestUrl = new URL(url);
    if (attempt > 0) {
      requestUrl.searchParams.set("_retry", `${Date.now()}-${attempt}`);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);
    let response;

    try {
      response = await fetch(requestUrl.toString(), {
        cache: "no-store",
        signal: controller.signal,
      });
    } catch (error) {
      if (error?.name === "AbortError") {
        const action = requestUrl.searchParams.get("action") || "API";
        throw new Error(`${action} timeout setelah 20 detik.`);
      }

      throw error;
    } finally {
      clearTimeout(timeoutId);
    }

    if (response.status !== 404 || attempt === 1) {
      return response;
    }

    await new Promise((resolve) => setTimeout(resolve, 650));
  }

  return fetch(url, { cache: "no-store" });
}

function fetchPeriodApiResponse(url) {
  const requestKey = getApiRequestKey(url);
  let pendingRequest = inFlightApiGetRequests.get(requestKey);

  if (!pendingRequest) {
    pendingRequest = scheduleApiGet(() => executeApiGet(url));
    inFlightApiGetRequests.set(requestKey, pendingRequest);
    pendingRequest.then(
      () => inFlightApiGetRequests.delete(requestKey),
      () => inFlightApiGetRequests.delete(requestKey)
    );
  }

  return pendingRequest.then((response) => response.clone());
}

function isLocalTvBridgeEnabled() {
  const hostname = String(window.location.hostname || "").toLowerCase();
  const isGitHubPages = hostname === "github.io" || hostname.endsWith(".github.io");

  return Boolean(!isGitHubPages && LOCAL_TV_BRIDGE_ENABLED && String(LOCAL_TV_BRIDGE_URL || "").trim());
}

function canUseDevShortSessions() {
  return Boolean(DEV_SHORT_SESSION_ENABLED && roleMeetsRequired(getCurrentOperatorRole(), "manager"));
}

function getMinimumSessionMinutes() {
  if (canUseDevShortSessions()) {
    return Math.max(1, Number(DEV_MIN_SESSION_MINUTES) || 1);
  }

  return 15;
}

function getMinimumSessionMessage() {
  return `Durasi minimal ${getMinimumSessionMinutes()} menit.`;
}

function getDefaultLcDurationMinutes(room) {
  const roomDuration = Number(room?.booked_duration_minutes) || 0;
  return Math.max(getMinimumSessionMinutes(), roomDuration || 60);
}

function parseLcAssignmentsFromRoom(room) {
  const rawAssignments = String(room?.lc_assignments || "").trim();

  if (!rawAssignments) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawAssignments);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((assignment) => ({
        lc_id: String(assignment?.lc_id || assignment?.id || "").trim(),
        duration_minutes: normalizeLcDurationMinutesForRoom(room, assignment?.duration_minutes),
      }))
      .filter((assignment) => assignment.lc_id);
  } catch (error) {
    console.warn("Gagal membaca durasi LC room.", error);
    return [];
  }
}

function normalizeLcDurationMinutesForRoom(room, value) {
  const fallback = getDefaultLcDurationMinutes(room);
  const duration = Math.round(Number(value));

  if (!Number.isFinite(duration) || duration <= 0) {
    return fallback;
  }

  return Math.max(1, duration);
}

function getLcDurationHourOptions(room) {
  const bookedMinutes = Number(room?.booked_duration_minutes) || 0;
  const maxMinutes = Math.max(60, Math.ceil(bookedMinutes / 30) * 30);
  const options = [];

  for (let minutes = 30; minutes <= maxMinutes; minutes += 30) {
    options.push(minutes);
  }

  return options;
}

function formatLcDurationOptionLabel(minutes) {
  const duration = Number(minutes) || 0;
  const hours = duration / 60;

  if (Number.isInteger(hours)) {
    return `${hours} jam`;
  }

  return `${hours.toLocaleString("id-ID", { maximumFractionDigits: 1 })} jam`;
}

function createLcDurationSelectElement(room, lcId, value) {
  const select = document.createElement("select");
  select.className = "lc-selection-duration-input";
  select.title = "Durasi LC dalam jam";

  const normalizedValue = normalizeLcDurationMinutesForRoom(room, value);
  const options = getLcDurationHourOptions(room);

  if (!options.includes(normalizedValue)) {
    options.push(normalizedValue);
    options.sort((first, second) => first - second);
  }

  options.forEach((minutes) => {
    const option = document.createElement("option");
    option.value = String(minutes);
    option.textContent = formatLcDurationOptionLabel(minutes);
    option.selected = minutes === normalizedValue;
    select.appendChild(option);
  });

  select.onchange = (event) => {
    pendingLcDurations[lcId] = normalizeLcDurationMinutesForRoom(room, event.target.value);
    renderRooms();
  };
  select.onclick = (event) => event.stopPropagation();

  return select;
}

function ensureLcSelectionStateForRoom(room) {
  if (!room?.room_id) {
    return;
  }

  if (!selectedLcIdsForRoom[room.room_id]) {
    const lcIds = String(room.lc_ids || "").trim();
    if (lcIds) {
      selectedLcIdsForRoom[room.room_id] = lcIds.split(",").map(id => id.trim()).filter(Boolean);
    }
  }

  if (!selectedLcDurationsForRoom[room.room_id]) {
    selectedLcDurationsForRoom[room.room_id] = {};
  }

  const durationMap = selectedLcDurationsForRoom[room.room_id];
  parseLcAssignmentsFromRoom(room).forEach((assignment) => {
    durationMap[assignment.lc_id] = normalizeLcDurationMinutesForRoom(room, assignment.duration_minutes);
  });

  (selectedLcIdsForRoom[room.room_id] || []).forEach((lcId) => {
    if (!durationMap[lcId] && Number(room.booked_duration_minutes) > 0) {
      durationMap[lcId] = getDefaultLcDurationMinutes(room);
    }
  });
}

function setLcDurationForRoom(room, lcId, value) {
  if (!room?.room_id || !lcId) {
    return;
  }

  if (!selectedLcDurationsForRoom[room.room_id]) {
    selectedLcDurationsForRoom[room.room_id] = {};
  }

  selectedLcDurationsForRoom[room.room_id][lcId] = normalizeLcDurationMinutesForRoom(room, value);
}

function getLcDurationForRoom(room, lcId) {
  ensureLcSelectionStateForRoom(room);
  return normalizeLcDurationMinutesForRoom(
    room,
    selectedLcDurationsForRoom[room.room_id]?.[lcId]
  );
}

function buildLcAssignmentsForRoom(room) {
  ensureLcSelectionStateForRoom(room);

  return (selectedLcIdsForRoom[room.room_id] || [])
    .map((lcId) => ({
      lc_id: lcId,
      duration_minutes: getLcDurationForRoom(room, lcId),
    }))
    .filter((assignment) => assignment.lc_id);
}

function buildLcAssignmentsPayloadForRoom(room) {
  return JSON.stringify(buildLcAssignmentsForRoom(room));
}

function calculateLcCharge(durationMinutes, ratePerHour) {
  const duration = Math.max(1, Math.round(Number(durationMinutes) || 0));
  const rate = Number(ratePerHour) || 0;
  return Math.ceil(duration / 60) * rate;
}

function formatLcDurationShort(minutes) {
  const duration = Math.max(1, Math.round(Number(minutes) || 0));
  if (duration % 60 === 0) {
    return `${duration / 60} jam`;
  }
  return `${duration} menit`;
}

function getPackageForRoom(room) {
  const packageId = String(room?.package_id || "").trim();
  if (!packageId) {
    return null;
  }

  return packages.find((pkg) => String(pkg.package_id || "").trim() === packageId) || null;
}

function getRoomPriceLabel(room) {
  const pkg = getPackageForRoom(room);
  if (pkg) {
    return `${currencyFormatter.format(Number(pkg.selling_price) || 0)} / paket`;
  }

  if (room?.package_id) {
    return `${room.package_id} / paket`;
  }

  return `${currencyFormatter.format(Number(room?.rate_per_hour) || 0)} / jam`;
}

async function sendLocalTvCommand(roomId, tvAction, triggerSource) {
  if (!isLocalTvBridgeEnabled()) {
    return {
      skipped: true,
      message: "Kontrol TV lokal belum aktif.",
    };
  }

  const response = await fetch(LOCAL_TV_BRIDGE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    cache: "no-store",
    body: JSON.stringify({
      room_id: roomId,
      tv_action: tvAction,
      trigger_source: triggerSource,
      requested_by: getLoggedInOperatorName(),
    }),
  });

  let data = null;
  try {
    data = await response.json();
  } catch (error) {
    throw new Error("Bridge TV lokal mengembalikan respons tidak valid.");
  }

  if (!response.ok || data?.success !== true) {
    throw new Error(data?.message || data?.error || `Perintah TV gagal dengan status ${response.status}.`);
  }

  return data;
}

function sendTvOffForExpiredCountdown(roomId, scheduledEndTime) {
  const key = `${roomId || ""}|${scheduledEndTime || ""}`;
  if (!roomId || !scheduledEndTime || autoTvOffByCountdownKey.has(key)) {
    return;
  }

  autoTvOffByCountdownKey.add(key);
  sendLocalTvCommand(roomId, "power_off", "countdown_expired")
    .then(() => {
      showInlineNotice(`Waktu ${roomId} habis. TV dimatikan otomatis.`, "warning");
    })
    .catch((error) => {
      console.warn("Gagal mematikan TV saat countdown habis.", error);
      showInlineNotice(`Waktu ${roomId} habis, tetapi TV gagal dimatikan: ${error.message}`, "warning");
    });
}

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
let transactionPeriodRequestVersion = 0;
let ownerReportPeriodFilter = "today";
let ownerReportCustomStartDate = "";
let ownerReportCustomEndDate = "";
let ownerReportPeriodNotice = "";
let ownerReportRequestVersion = 0;
let ownerReportTransactionSummary = null;
let ownerReportRoomUsageSummary = null;
let ownerReportFnbSalesSummary = null;
let ownerReportCashierClosings = [];
let isLoadingOwnerReport = false;
let ownerReportPrintVisible = false;
let roomWarningStateInitialized = false;
let previousWarningRoomIds = new Set();
const autoTvOffByCountdownKey = new Set();
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
const REPORT_SUB_TABS = [
  {
    key: "owner",
    label: "Owner",
    description: "Ringkasan uang masuk, status kas, dan cetak laporan owner.",
  },
  {
    key: "cashier",
    label: "Tutup Shift",
    description: "Pantau hasil closing kasir dan laporan tutup shift.",
  },
  {
    key: "fnb",
    label: "F&B",
    description: "Lihat penjualan makanan/minuman, menu terlaris, dan stok rendah.",
  },
  {
    key: "room",
    label: "Room",
    description: "Pantau okupansi, pemakaian room, durasi, dan room terlaris.",
  },
];

const OPERATIONAL_SHIFT_NOTE =
  "Tanggal operasional mengikuti cutoff jam 10:00. Transaksi sebelum pukul 10:00 masuk shift hari sebelumnya.";
const ROOM_STATUS_CONFIG = {
  available: {
    label: "Kosong",
    className: "available",
    tone: "success",
    buttonLabel: "Buat Booking",
  },
  occupied: {
    label: "Terisi",
    className: "occupied",
    tone: "danger",
    buttonLabel: "Selesaikan Sesi",
  },
  maintenance: {
    label: "Perbaikan",
    className: "maintenance",
    tone: "warning",
    buttonLabel: "Tidak Tersedia",
  },
  paid_waiting_start: {
    label: "Menunggu Mulai",
    className: "paid-waiting-start",
    tone: "info",
    buttonLabel: "Mulai Countdown",
  },
  cleaning: {
    label: "Cleaning",
    className: "cleaning",
    tone: "warning",
    buttonLabel: "Selesai Bersihkan",
  },
  waiting_payment: {
    label: "Menunggu Bayar",
    className: "waiting-payment",
    tone: "warning",
    buttonLabel: "Detail Sesi",
  },
};
const VALID_ROOM_STATUS_KEYS = new Set(Object.keys(ROOM_STATUS_CONFIG));

function normalizeOperatorRole(role) {
  const normalizedRole = String(role || "cashier").trim().toLowerCase() || "cashier";
  return ROLE_ALIASES[normalizedRole] || normalizedRole;
}

function getOperatorRoleLabel(role) {
  const normalizedRole = normalizeOperatorRole(role);
  return ROLE_LABELS[normalizedRole] || normalizedRole || "Kasir";
}

function roleMeetsRequired(role, requiredRole) {
  const normalizedRole = normalizeOperatorRole(role);
  const normalizedRequiredRole = normalizeOperatorRole(requiredRole || "manager");
  const rank = {
    staff: 1,
    receptionist: 1,
    cashier: 2,
    manager: 3,
    owner: 4,
  };

  if (normalizedRole === "owner") {
    return true;
  }

  return (rank[normalizedRole] || 0) >= (rank[normalizedRequiredRole] || rank.manager);
}

function getCurrentOperatorRole() {
  if (currentOperator?.role) {
    return normalizeOperatorRole(currentOperator.role);
  }

  try {
    return normalizeOperatorRole(
      localStorage.getItem("karaoke_current_role")
        || localStorage.getItem("karaoke_user_role")
        || "cashier"
    );
  } catch (error) {
    return "cashier";
  }
}

function getAllowedDashboardTabsForCurrentRole() {
  return ROLE_DASHBOARD_TABS[getCurrentOperatorRole()] || ROLE_DASHBOARD_TABS.cashier;
}

function getVisibleDashboardTabs() {
  const allowedTabs = new Set(getAllowedDashboardTabsForCurrentRole());
  return DASHBOARD_TABS.filter((tab) => allowedTabs.has(tab.key));
}

function getDefaultDashboardTabForCurrentRole() {
  return getVisibleDashboardTabs()[0]?.key || "rooms";
}

function canAccessDashboardTab(tabKey) {
  return getAllowedDashboardTabsForCurrentRole().includes(tabKey);
}

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
      role: normalizeOperatorRole(parsedOperator.role),
    };
  } catch (error) {
    sessionStorage.removeItem(OPERATOR_SESSION_STORAGE_KEY);
    return null;
  }
}

function getLoggedInOperatorPin() {
  try {
    return sessionStorage.getItem("karaoke_operator_pin") || "";
  } catch (error) {
    return "";
  }
}

function saveOperatorSession(operator, pin = "") {
  const safeOperator = {
    employee_id: String(operator?.employee_id || ""),
    employee_name: String(operator?.employee_name || ""),
    role: normalizeOperatorRole(operator?.role),
  };

  sessionStorage.setItem(OPERATOR_SESSION_STORAGE_KEY, JSON.stringify(safeOperator));
  if (pin) {
    try {
      sessionStorage.setItem("karaoke_operator_pin", pin);
    } catch (e) {
      console.error("Gagal menyimpan operator PIN ke sessionStorage", e);
    }
  }
  currentOperator = safeOperator;
}

function clearOperatorSession() {
  sessionStorage.removeItem(OPERATOR_SESSION_STORAGE_KEY);
  try {
    sessionStorage.removeItem("karaoke_operator_pin");
  } catch (e) {}
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
  return ROOM_STATUS_CONFIG[status]?.tone || "neutral";
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
let cashierClosingDenominations = {
  d100k: 0,
  d50k: 0,
  d20k: 0,
  d10k: 0,
  d5k: 0,
  d2k: 0,
  d1k: 0,
  d500: 0,
  d200: 0,
  d100: 0,
};
let cashierClosingConfirmationVisible = false;
let lastCashierClosing = null;
let isSavingCashierClosing = false;
const markingTransactionPaidIds = new Set(); // track per-transactionId mark-paid in progress
let todayCashierClosings = [];
let todayCashierClosingSummary = null;
let selectedClosingForPrint = null;
let closingPrintPreviewVisible = false;
let menuItems = [];
let menuSearchQuery = "";
let menuCategoryFilter = "all";
let menuSpiritFilter = "all";
let menuErrorMessage = "";
let inventoryItems = [];
let inventorySummary = null;
let isLoadingInventory = false;
let isLoadingSettingsData = false;
let hasLoadedSettingsData = false;
let isSavingMasterData = false;
let masterDataForm = null;
let masterAuditLogs = [];
let isLoadingMasterAuditLogs = false;
let hasLoadedMasterAuditLogs = false;
let masterAuditEntityFilter = "all";
let masterAuditActionFilter = "all";
let settingsMenuSearchQuery = "";
let settingsMenuAnalysisFilter = "all";
let settingsRoomSearchQuery = "";
let settingsInventorySearchQuery = "";
let settingsAccessSearchQuery = "";
let settingsPackageSearchQuery = "";
let selectedSettingsPackageId = "";
let packageDetailsByPackageId = {};
let isLoadingPackageDetails = false;
let activeSettingsSubTab = "rooms";
let deleteMasterConfirmation = null;
let isDeletingMasterData = false;
let employees = [];
let adminPinModal = null;
let isValidatingAdminPin = false;
let stockWarningMessages = [];
let addInventoryItemForm = null;
let isSavingAddInventoryItem = false;
let lcs = [];
let isLoadingLcs = false;
let lcWorkReports = [];
let isLoadingLcWorkReports = false;
let activeLcSubTab = "master";
let lcMasterPage = 1;
let lcReportsPage = 1;
let addLcForm = null;
let editLcForm = null;
let isSavingLc = false;
let deleteLcConfirmation = null;
let isDeletingLc = false;
let selectedLcIdsForRoom = {};
let selectedLcDurationsForRoom = {};
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
let fnbOrderMode = "room";
let fnbTestRunId = "";
let fbCartItems = [];
let lastFnbOrder = null;
let isSavingFnbOrder = false;
let isCancellingFnbOrder = false;
let fnbOrderNote = "";
let fnbOrderPaymentMethod = "room_bill";
let activeFnbSubTab = "order";
let activeTransactionsSubTab = "history";
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
let receiptPrintAuditByTransactionId = {};
let durationSelectionRoomId = "";
let customDurationMinutes = "";
let durationPaymentMethod = "cash";
let paymentSelectionRoomId = "";
let paymentMethodSelection = "cash";
let bookingTypeSelection = "regular";
let bookingPackageSelection = "";
let customerNameInput = "";
let bookingCartItems = [];
let prepayCartItems = [];
let isLoadingPrepayFnb = false;
let prepayFnbError = "";
let packages = [];
let isPreparingRoomSession = false;
let isActivatingPreparedSession = false;
let isCancellingBooking = false;
let isCompletingCleaning = false;
let extendSelectionRoomId = "";
let customExtendMinutes = "";
let extendSessionNote = "";
let lcSelectionRoomId = "";
let isSavingSessionLcs = false;
let extendPaymentMethod = "cash";
let isExtendingSession = false;
let roomRecoveryCandidates = [];
let roomRecoverySummary = null;
let isLoadingRoomRecovery = false;
let isRecoveringRoom = false;
let roomRecoveryConfirmation = null;
let roomRecoveryLoadStarted = false;
let activeDashboardTab = loadActiveDashboardTab();
let activeReportSubTab = "owner";
let currentOperator = loadOperatorSession();
let loginPin = "";
let loginErrorMessage = "";
let isLoggingIn = false;
let dashboardDataInitialized = false;
const PAGINATION_PAGE_SIZE = 10;
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
let roomUsageRequestVersion = 0;
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

function isUserBusy() {
  if (document.querySelector(".admin-pin-modal-overlay")) {
    return true;
  }
  const activeEl = document.activeElement;
  const isTyping = activeEl && (
    activeEl.tagName === "INPUT" ||
    activeEl.tagName === "TEXTAREA" ||
    activeEl.tagName === "SELECT" ||
    activeEl.isContentEditable
  );
  if (isTyping) {
    return true;
  }

  if (
    durationSelectionRoomId ||
    paymentSelectionRoomId ||
    extendSelectionRoomId ||
    lcSelectionRoomId
  ) {
    return true;
  }

  if (
    cashierClosingPreviewVisible ||
    cashierClosingConfirmationVisible ||
    closingPrintPreviewVisible ||
    receiptPrintVisible ||
    adminPinModal ||
    deleteMasterConfirmation ||
    deleteLcConfirmation ||
    roomRecoveryConfirmation
  ) {
    return true;
  }

  if (
    isPreparingRoomSession ||
    isActivatingPreparedSession ||
    isSavingSessionLcs ||
    isExtendingSession ||
    isSavingFnbOrder ||
    isCancellingFnbOrder ||
    isSavingStockAdjustment ||
    isSavingAddInventoryItem ||
    isSavingLc ||
    isDeletingLc ||
    isDeletingMasterData
  ) {
    return true;
  }

  return false;
}

async function silentReloadRooms() {
  if (!API_BASE_URL.trim()) {
    return;
  }

  try {
    const promises = [fetchRoomsFromApi()];
    const isReceptionist = getCurrentOperatorRole() === "receptionist";
    if (!isReceptionist) {
      promises.push(
        postApiAction({
          action: "getExpiredRoomRecoveryList",
          grace_minutes: 5,
          include_invalid_end_time: true,
        }).catch((err) => {
          console.warn("Gagal memuat kandidat recovery di background", err);
          return null;
        })
      );
    }

    const [roomsData, recoveryData] = await Promise.all(promises);

    rooms = normalizeRooms(roomsData);
    syncSelectedFbRoomWithRooms();

    if (recoveryData && recoveryData.ok === true) {
      roomRecoveryCandidates = Array.isArray(recoveryData.candidates) ? recoveryData.candidates : [];
      roomRecoverySummary = {
        expired_count: Number(recoveryData.expired_count) || 0,
        invalid_count: Number(recoveryData.invalid_count) || 0,
        total_rooms_checked: Number(recoveryData.total_rooms_checked) || 0,
      };
    }

    if (isUserBusy() || activeDashboardTab !== "rooms") {
      console.info("Silent refresh: Data diperbarui di memori, re-render DOM ditunda karena user sedang sibuk.");
      return;
    }

    renderRooms();
    console.info("Silent refresh: Tampilan ruangan berhasil diperbarui.");
  } catch (error) {
    console.warn("Silent refresh gagal:", error);
  }
}

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
    await loadLcs();
    roomsLoading = false;
    setDataSourceBadge("Mode Data Contoh", "mock");
    console.info("Memakai data contoh karena API_BASE_URL masih kosong.");
    renderRooms();
    return;
  }

  try {
    const [roomsData, _] = await Promise.all([
      fetchRoomsFromApi(),
      loadLcs()
    ]);
    rooms = normalizeRooms(roomsData);
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
  const response = await fetchPeriodApiResponse(buildApiUrl("getRooms"));

  if (!response.ok) {
    throw new Error(`getRooms API request failed with status ${response.status}`);
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

async function loadTodayTransactions(requestVersion = transactionPeriodRequestVersion) {
  if (!API_BASE_URL.trim()) {
    return;
  }

  if (!canFetchTransactionPeriodData()) {
    renderRooms();
    return;
  }

  try {
    const data = await fetchTodayTransactionsFromApi();

    if (requestVersion !== transactionPeriodRequestVersion) {
      return;
    }

    todayTransactions = data.transactions;
    todayTransactionSummary = data.summary;
    renderRooms();
  } catch (error) {
    if (requestVersion !== transactionPeriodRequestVersion) {
      return;
    }

    console.warn("Gagal memuat riwayat transaksi.", error);
    showInlineNotice(error.message || "Gagal memuat riwayat transaksi.", "error");
    todayTransactions = [];
    todayTransactionSummary = null;
    renderRooms();
  }
}

async function fetchTodayTransactionsFromApi() {
  const params = buildTransactionPeriodQueryParams();
  const response = await fetchPeriodApiResponse(
    buildApiUrl("getTodayTransactions", Object.fromEntries(params.entries()))
  );

  if (!response.ok) {
    throw new Error(`getTodayTransactions API request failed with status ${response.status}`);
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

function buildOwnerReportPeriodQueryParams() {
  const params = new URLSearchParams();

  params.set("period", normalizeTransactionPeriodForApi(ownerReportPeriodFilter));

  if (ownerReportPeriodFilter === "custom") {
    if (ownerReportCustomStartDate) {
      params.set("start_date", ownerReportCustomStartDate);
    }

    if (ownerReportCustomEndDate) {
      params.set("end_date", ownerReportCustomEndDate);
    }
  }

  return params;
}

function canFetchOwnerReportPeriodData() {
  if (ownerReportPeriodFilter !== "custom") {
    return true;
  }

  return Boolean(ownerReportCustomStartDate && ownerReportCustomEndDate);
}

function getOwnerReportPeriodTitleSuffix() {
  const labels = {
    today: "Shift Aktif",
    yesterday: "Shift Kemarin",
    last7days: "7 Shift",
    thisMonth: "Bulan Ini",
    all: "Semua",
    custom: "Custom",
  };

  if (ownerReportPeriodFilter === "custom" && ownerReportCustomStartDate && ownerReportCustomEndDate) {
    return `${ownerReportCustomStartDate} s/d ${ownerReportCustomEndDate}`;
  }

  return labels[ownerReportPeriodFilter] || "Shift Aktif";
}

function setOwnerReportPeriodFilter(period) {
  if (!TRANSACTION_PERIOD_OPTIONS.some(([value]) => value === period)) {
    return;
  }

  ownerReportPeriodFilter = period;
  ownerReportRequestVersion += 1;

  if (period !== "custom") {
    ownerReportCustomStartDate = "";
    ownerReportCustomEndDate = "";
    ownerReportPeriodNotice = "";
    loadOwnerPeriodReport();
    return;
  }

  ownerReportPeriodNotice = "Pilih tanggal operasional mulai dan akhir, lalu klik Terapkan.";
  renderRooms();
}

function updateOwnerReportCustomStartDate(value) {
  ownerReportCustomStartDate = value || "";
}

function updateOwnerReportCustomEndDate(value) {
  ownerReportCustomEndDate = value || "";
}

async function applyOwnerReportCustomPeriod() {
  if (!ownerReportCustomStartDate || !ownerReportCustomEndDate) {
    ownerReportPeriodNotice = "Pilih tanggal operasional mulai dan akhir, lalu klik Terapkan.";
    renderRooms();
    return;
  }

  if (ownerReportCustomStartDate > ownerReportCustomEndDate) {
    ownerReportPeriodNotice = "Tanggal mulai tidak boleh lebih besar dari tanggal akhir.";
    renderRooms();
    return;
  }

  ownerReportPeriodNotice = "";
  ownerReportRequestVersion += 1;
  await loadOwnerPeriodReport();
}

async function fetchOwnerReportEndpoint(action) {
  const params = buildOwnerReportPeriodQueryParams();
  const response = await fetchPeriodApiResponse(buildApiUrl(action, Object.fromEntries(params.entries())));

  if (!response.ok) {
    throw new Error(`${action} API request failed with status ${response.status}`);
  }

  const data = await response.json();

  if (!data || data.ok !== true) {
    throw new Error(data?.error || "API response is invalid.");
  }

  return data;
}

async function loadOwnerPeriodReport() {
  if (!API_BASE_URL.trim()) {
    return;
  }

  if (!canFetchOwnerReportPeriodData()) {
    renderRooms();
    return;
  }

  const requestVersion = ownerReportRequestVersion;
  isLoadingOwnerReport = true;
  renderRooms();

  try {
    const results = await Promise.allSettled([
      fetchOwnerReportEndpoint("getTodayTransactions"),
      fetchOwnerReportEndpoint("getRoomUsageReport"),
      fetchOwnerReportEndpoint("getTodayFnbSalesReport"),
      fetchOwnerReportEndpoint("getTodayCashierClosings"),
    ]);

    if (requestVersion !== ownerReportRequestVersion) {
      return;
    }

    const [transactionResult, roomUsageResult, fnbSalesResult, closingResult] = results;
    const failedResults = results.filter((result) => result.status === "rejected");

    if (failedResults.length === results.length) {
      throw failedResults[0].reason;
    }

    const transactionData = transactionResult.status === "fulfilled" ? transactionResult.value : null;
    const roomUsageData = roomUsageResult.status === "fulfilled" ? roomUsageResult.value : null;
    const fnbSalesData = fnbSalesResult.status === "fulfilled" ? fnbSalesResult.value : null;
    const closingData = closingResult.status === "fulfilled" ? closingResult.value : null;

    ownerReportTransactionSummary = transactionData?.summary || null;
    ownerReportRoomUsageSummary = roomUsageData?.summary || null;
    ownerReportFnbSalesSummary = fnbSalesData?.summary || null;
    ownerReportCashierClosings = Array.isArray(closingData?.closings) ? closingData.closings : [];

    if (ownerReportPeriodFilter === "today" && roomUsageData?.summary) {
      ownerRoomUsageSummary = roomUsageData.summary;
    }

    if (failedResults.length > 0) {
      showInlineNotice("Sebagian laporan belum tersedia. Coba refresh setelah beberapa detik.", "warning");
    }
  } catch (error) {
    if (requestVersion !== ownerReportRequestVersion) {
      return;
    }

    console.warn("Gagal memuat laporan owner periode.", error);
    showInlineNotice(error.message || "Gagal memuat laporan owner periode.", "error");
    ownerReportTransactionSummary = null;
    ownerReportRoomUsageSummary = null;
    ownerReportFnbSalesSummary = null;
    ownerReportCashierClosings = [];
  } finally {
    if (requestVersion === ownerReportRequestVersion) {
      isLoadingOwnerReport = false;
      renderRooms();
    }
  }
}

async function loadTodayCashierClosings(requestVersion = transactionPeriodRequestVersion) {
  if (!API_BASE_URL.trim()) {
    return;
  }

  if (!canFetchTransactionPeriodData()) {
    renderRooms();
    return;
  }

  try {
    const data = await fetchTodayCashierClosingsFromApi();

    if (requestVersion !== transactionPeriodRequestVersion) {
      return;
    }

    todayCashierClosings = data.closings;
    todayCashierClosingSummary = data.summary;
    lastCashierClosing = todayCashierClosings[0] || lastCashierClosing;
    renderRooms();
  } catch (error) {
    if (requestVersion !== transactionPeriodRequestVersion) {
      return;
    }

    console.warn("Gagal memuat riwayat closing.", error);
    showInlineNotice(error.message || "Gagal memuat riwayat closing.", "error");
    todayCashierClosings = [];
    todayCashierClosingSummary = null;
    renderRooms();
  }
}

async function fetchTodayCashierClosingsFromApi() {
  const params = buildTransactionPeriodQueryParams();
  const response = await fetchPeriodApiResponse(
    buildApiUrl("getTodayCashierClosings", Object.fromEntries(params.entries()))
  );

  if (!response.ok) {
    throw new Error(`getTodayCashierClosings API request failed with status ${response.status}`);
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
  const response = await fetchPeriodApiResponse(buildApiUrl("getMenuItems"));

  if (!response.ok) {
    throw new Error(`getMenuItems API request failed with status ${response.status}`);
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
      status: String(menuItem.status || "").trim().toLowerCase(),
      updated_at: menuItem.updated_at || "",
      stock_tracking: menuItem.stock_tracking || "",
      stock_item_id: menuItem.stock_item_id || "",
      stock_qty_per_unit: Number(menuItem.stock_qty_per_unit) || 0,
      stock_qty: menuItem.stock_qty !== null && menuItem.stock_qty !== undefined ? Number(menuItem.stock_qty) : null,
      unit: menuItem.unit || "",
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
  const response = await fetchPeriodApiResponse(buildApiUrl("getInventoryItems"));

  if (!response.ok) {
    throw new Error(`getInventoryItems API request failed with status ${response.status}`);
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
  const response = await fetchPeriodApiResponse(buildApiUrl("getEmployees"));

  if (!response.ok) {
    throw new Error(`getEmployees API request failed with status ${response.status}`);
  }

  const data = await response.json();

  if (!data || (data.ok !== true && data.success !== true) || !Array.isArray(data.employees)) {
    throw new Error(data?.message || data?.error || "Gagal memuat data akses.");
  }

  return data.employees;
}

async function fetchPackagesFromApi() {
  const response = await fetchPeriodApiResponse(buildApiUrl("getPackages"));

  if (!response.ok) {
    throw new Error(`getPackages API request failed with status ${response.status}`);
  }

  const data = await response.json();

  if (!data || (data.ok !== true && data.success !== true) || !Array.isArray(data.packages)) {
    throw new Error(data?.message || data?.error || "Gagal memuat data paket.");
  }

  return data.packages;
}

async function fetchPackageDetailsFromApi(packageId) {
  const params = new URLSearchParams();
  params.set("action", "getPackageDetails");
  params.set("package_id", packageId);

  const response = await fetchPeriodApiResponse(`${API_BASE_URL}?${params.toString()}`);

  if (!response.ok) {
    throw new Error(`API request failed with status ${response.status}`);
  }

  const data = await response.json();

  if (!data || (data.ok !== true && data.success !== true) || !Array.isArray(data.package_details)) {
    throw new Error(data?.message || data?.error || "Gagal memuat detail paket.");
  }

  return data.package_details;
}

async function loadSettingsData(options = {}) {
  if (!API_BASE_URL.trim()) {
    return;
  }

  const force = options.force === true;
  if (hasLoadedSettingsData && !force) {
    return;
  }

  isLoadingSettingsData = true;
  renderRooms();

  try {
    const [latestRooms, menuData, inventoryData, employeeData, latestPackages] = await Promise.all([
      fetchRoomsFromApi(),
      fetchMenuItemsFromApi(),
      fetchInventoryItemsFromApi(),
      fetchEmployeesFromApi(),
      fetchPackagesFromApi(),
    ]);

    rooms = normalizeRooms(latestRooms);
    menuItems = Array.isArray(menuData.menu_items) ? menuData.menu_items : [];
    inventoryItems = Array.isArray(inventoryData.items) ? inventoryData.items : [];
    inventorySummary = inventoryData.summary || null;
    employees = Array.isArray(employeeData) ? employeeData : [];
    packages = Array.isArray(latestPackages) ? latestPackages : [];
    packageDetailsByPackageId = force ? {} : packageDetailsByPackageId;
    if (selectedSettingsPackageId && !packages.some((pkg) => pkg.package_id === selectedSettingsPackageId)) {
      selectedSettingsPackageId = "";
    }
    hasLoadedSettingsData = true;
    syncSelectedFbRoomWithRooms();
  } catch (error) {
    console.warn("Gagal memuat data pengaturan.", error);
    showInlineNotice(error.message || "Gagal memuat data pengaturan.", "error");
  } finally {
    isLoadingSettingsData = false;
    renderRooms();
  }
}

function getRoomNameById(roomId) {
  const room = rooms.find((item) => item.room_id === roomId);
  return room?.room_name || roomId || "-";
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

async function loadMasterDataAuditLogs(options = {}) {
  if (!API_BASE_URL.trim()) {
    masterAuditLogs = [];
    return;
  }

  const force = options.force === true;
  if (hasLoadedMasterAuditLogs && !force) {
    return;
  }

  isLoadingMasterAuditLogs = true;
  renderRooms();

  try {
    const params = buildMasterAuditQueryParams();
    const response = await fetchPeriodApiResponse(`${API_BASE_URL}?${params.toString()}`);

    if (!response.ok) {
      throw new Error(`API request failed with status ${response.status}`);
    }

    const data = await response.json();

    if (!data || (data.ok !== true && data.success !== true)) {
      throw new Error(data?.message || data?.error || "Gagal memuat audit log master data.");
    }

    masterAuditLogs = Array.isArray(data.data) ? data.data : Array.isArray(data.logs) ? data.logs : [];
    hasLoadedMasterAuditLogs = true;
  } catch (error) {
    console.warn("Gagal memuat audit log master data.", error);
    masterAuditLogs = [];
    showInlineNotice(error.message || "Gagal memuat audit log master data.", "error");
  } finally {
    isLoadingMasterAuditLogs = false;
    renderRooms();
  }
}

async function loadSettingsTabData(options = {}) {
  await Promise.all([
    loadSettingsData(options),
    loadMasterDataAuditLogs(options),
  ]);
}

async function selectSettingsPackage(packageId) {
  const normalizedPackageId = String(packageId || "").trim();

  if (!normalizedPackageId) {
    return;
  }

  selectedSettingsPackageId = normalizedPackageId;

  if (packageDetailsByPackageId[normalizedPackageId]) {
    resetPaginationPage("settingsPackageDetails");
    renderRooms();
    return;
  }

  isLoadingPackageDetails = true;
  resetPaginationPage("settingsPackageDetails");
  renderRooms();

  try {
    packageDetailsByPackageId = {
      ...packageDetailsByPackageId,
      [normalizedPackageId]: await fetchPackageDetailsFromApi(normalizedPackageId),
    };
  } catch (error) {
    console.warn("Gagal memuat detail paket.", error);
    showInlineNotice(error.message || "Gagal memuat detail paket.", "error");
  } finally {
    isLoadingPackageDetails = false;
    renderRooms();
  }
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
    await loadMenuItems();
    await loadTodayStockMovements();
    await loadTodayFnbSalesReport();
  } catch (error) {
    showInlineNotice(error.message || "Gagal memperbarui stok.", "error");
  } finally {
    isSavingStockAdjustment = false;
    renderRooms();
  }
}

function openAddInventoryItemModal() {
  addInventoryItemForm = {
    name: "",
    category: "Snack",
    price: "",
    unit: "pcs",
    min_stock: "5",
    initial_stock: "0"
  };
  renderRooms();
}

function closeAddInventoryItemModal() {
  addInventoryItemForm = null;
  renderRooms();
}

function updateAddInventoryItemForm(field, value) {
  if (!addInventoryItemForm) {
    return;
  }
  addInventoryItemForm = {
    ...addInventoryItemForm,
    [field]: value
  };
}

function submitAddInventoryItem() {
  if (!API_BASE_URL.trim()) {
    showInlineNotice("API belum dikonfigurasi.", "error");
    return;
  }

  const name = String(addInventoryItemForm?.name || "").trim();
  const category = String(addInventoryItemForm?.category || "").trim();
  const price = Number(addInventoryItemForm?.price);
  const unit = String(addInventoryItemForm?.unit || "").trim();
  const minStock = Number(addInventoryItemForm?.min_stock);
  const initialStock = Number(addInventoryItemForm?.initial_stock || 0);

  if (!name) {
    showInlineNotice("Nama Item F&B wajib diisi.", "error");
    return;
  }
  if (!category) {
    showInlineNotice("Kategori wajib diisi.", "error");
    return;
  }
  if (!Number.isFinite(price) || price < 0) {
    showInlineNotice("Harga jual wajib berupa angka 0 atau lebih.", "error");
    return;
  }
  if (!unit) {
    showInlineNotice("Satuan (Unit) wajib diisi.", "error");
    return;
  }
  if (!Number.isFinite(minStock) || minStock < 0) {
    showInlineNotice("Minimum stok wajib berupa angka 0 atau lebih.", "error");
    return;
  }
  if (!Number.isFinite(initialStock) || initialStock < 0) {
    showInlineNotice("Stok awal wajib berupa angka 0 atau lebih.", "error");
    return;
  }

  openAdminPinModal({
    title: "PIN Manager Tambah Item F&B",
    message: "Masukkan PIN owner/manager untuk mendaftarkan item F&B baru.",
    requestedAction: "add_inventory_item",
    requiredRole: "manager",
    onSuccess: async (authData, adminPin) => {
      await executeAddInventoryItemSubmit(adminPin);
    }
  });
}

async function executeAddInventoryItemSubmit(adminPin) {
  if (isSavingAddInventoryItem || !addInventoryItemForm) {
    return;
  }

  isSavingAddInventoryItem = true;
  renderRooms();

  try {
    const invResponse = await postApiAction({
      action: "saveInventoryMaster",
      stock_item_name: addInventoryItemForm.name.trim(),
      category: addInventoryItemForm.category,
      unit: addInventoryItemForm.unit.trim(),
      min_stock: Number(addInventoryItemForm.min_stock) || 0,
      status: "active",
      admin_pin: adminPin,
      changed_by: getLoggedInOperatorName()
    });

    if (!invResponse || invResponse.ok !== true) {
      throw new Error(invResponse?.message || invResponse?.error || "Gagal mendaftarkan item stok.");
    }

    const savedInventory = invResponse.data || {};
    const stockItemId = savedInventory.stock_item_id;

    if (!stockItemId) {
      throw new Error("Gagal memperoleh ID item stok baru dari backend.");
    }

    const menuResponse = await postApiAction({
      action: "saveMenuMaster",
      menu_name: addInventoryItemForm.name.trim(),
      category: addInventoryItemForm.category,
      price: Number(addInventoryItemForm.price) || 0,
      stock_item_id: stockItemId,
      qty_per_unit: 1,
      status: "active",
      admin_pin: adminPin,
      changed_by: getLoggedInOperatorName()
    });

    if (!menuResponse || menuResponse.ok !== true) {
      throw new Error(menuResponse?.message || menuResponse?.error || "Data stok terbuat, namun gagal membuat menu F&B.");
    }

    const initialStockVal = Number(addInventoryItemForm.initial_stock) || 0;
    if (initialStockVal > 0) {
      const adjustResponse = await postApiAction({
        action: "adjustInventoryStock",
        stock_item_id: stockItemId,
        adjustment_type: "restock",
        quantity: initialStockVal,
        note: "Stok awal pendaftaran barang baru",
        cashier_name: getLoggedInOperatorName()
      });

      if (!adjustResponse || adjustResponse.ok !== true) {
        showInlineNotice(`Item "${addInventoryItemForm.name}" berhasil dibuat, namun inisialisasi stok fisik gagal: ${adjustResponse?.message || adjustResponse?.error || 'Unknown Error'}`, "warning");
      }
    }

    showInlineNotice(`Item "${addInventoryItemForm.name}" berhasil didaftarkan ke stok dan menu penjualan.`);
    addInventoryItemForm = null;

    await Promise.all([
      loadInventoryItems(),
      loadMenuItems()
    ]);
  } catch (error) {
    showInlineNotice(error.message || "Terjadi kesalahan saat menambahkan item baru.", "error");
  } finally {
    isSavingAddInventoryItem = false;
    renderRooms();
  }
}

function createAddInventoryItemModalElement() {
  if (!addInventoryItemForm) {
    return document.createDocumentFragment();
  }

  const overlay = document.createElement("section");
  overlay.className = "master-delete-modal add-inventory-item-modal";
  overlay.setAttribute("aria-labelledby", "add-inventory-item-title");

  const dialog = document.createElement("div");
  dialog.className = "master-delete-dialog";

  const title = document.createElement("h3");
  title.className = "master-delete-title";
  title.id = "add-inventory-item-title";
  title.textContent = "Tambah Item Makanan / Minuman Baru";

  const grid = document.createElement("div");
  grid.style.display = "grid";
  grid.style.gridTemplateColumns = "repeat(auto-fit, minmax(200px, 1fr))";
  grid.style.gap = "var(--space-3)";
  grid.style.margin = "var(--space-3) 0";

  const createField = (label, fieldName, type = "text", placeholder = "", options = null) => {
    const fieldEl = document.createElement("label");
    fieldEl.className = "master-form-field";

    const labelEl = document.createElement("span");
    labelEl.className = "master-form-label";
    labelEl.textContent = label;

    let input;
    if (options) {
      input = document.createElement("select");
      input.className = "master-form-input";
      options.forEach(([val, lbl]) => {
        const opt = document.createElement("option");
        opt.value = val;
        opt.textContent = lbl;
        input.appendChild(opt);
      });
    } else {
      input = document.createElement("input");
      input.className = "master-form-input";
      input.type = type;
      input.placeholder = placeholder;
      if (type === "number") {
        input.min = "0";
      }
    }

    input.dataset.action = "update-add-inventory-item-form";
    input.dataset.field = fieldName;
    input.value = addInventoryItemForm[fieldName] || "";
    input.disabled = isSavingAddInventoryItem;

    fieldEl.append(labelEl, input);
    return fieldEl;
  };

  grid.appendChild(createField("Nama Item F&B", "name", "text", "Contoh: Keripik Pisang"));
  grid.appendChild(createField("Kategori", "category", "select", "", [
    ["Snack", "Snack"],
    ["Makanan", "Makanan"],
    ["Minuman", "Minuman"]
  ]));
  grid.appendChild(createField("Harga Jual (Rp)", "price", "number", "Contoh: 15000"));
  grid.appendChild(createField("Satuan (Unit)", "unit", "text", "Contoh: pcs, porsi, botol"));
  grid.appendChild(createField("Minimum Stok", "min_stock", "number", "Contoh: 5"));
  grid.appendChild(createField("Stok Awal Fisik", "initial_stock", "number", "Contoh: 20"));

  const actions = document.createElement("div");
  actions.className = "master-form-actions";

  const cancelButton = document.createElement("button");
  cancelButton.className = "master-button secondary";
  cancelButton.type = "button";
  cancelButton.dataset.action = "close-add-inventory-item-modal";
  cancelButton.disabled = isSavingAddInventoryItem;
  cancelButton.textContent = "Batal";

  const saveButton = document.createElement("button");
  saveButton.className = "master-button primary";
  saveButton.type = "button";
  saveButton.dataset.action = "submit-add-inventory-item";
  saveButton.disabled = isSavingAddInventoryItem;
  saveButton.textContent = isSavingAddInventoryItem ? "Menyimpan..." : "Simpan";

  actions.append(cancelButton, saveButton);
  dialog.append(title, grid, actions);
  overlay.appendChild(dialog);

  return overlay;
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
  roomUsageRequestVersion += 1;
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
  roomUsageRequestVersion += 1;
  resetPaginationPage("roomUsage");
  resetPaginationPage("roomUsageTransactions");
  await loadRoomUsageReport();
}

async function loadRoomUsageReport(requestVersion = roomUsageRequestVersion) {
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

    if (requestVersion !== roomUsageRequestVersion) {
      return;
    }

    roomUsageSummary = data.summary || null;
    roomUsageItems = Array.isArray(data.room_usage) ? data.room_usage : [];
    roomUsageTransactions = Array.isArray(data.transactions) ? data.transactions : [];
  } catch (error) {
    if (requestVersion !== roomUsageRequestVersion) {
      return;
    }

    console.warn("Gagal memuat laporan pemakaian room.", error);
    showInlineNotice(error.message || "Gagal memuat laporan pemakaian room.", "error");
    roomUsageSummary = null;
    roomUsageItems = [];
    roomUsageTransactions = [];
  } finally {
    if (requestVersion === roomUsageRequestVersion) {
      isLoadingRoomUsageReport = false;
      renderRooms();
    }
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
  const response = await fetchPeriodApiResponse(
    buildApiUrl("getRoomUsageReport", Object.fromEntries(params.entries()))
  );

  if (!response.ok) {
    throw new Error(`getRoomUsageReport API request failed with status ${response.status}`);
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
  const response = await fetchPeriodApiResponse(
    buildApiUrl("getRoomUsageReport", Object.fromEntries(params.entries()))
  );

  if (!response.ok) {
    throw new Error(`getRoomUsageReport API request failed with status ${response.status}`);
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
    const inventoryData = await fetchInventoryItemsFromApi();
    const latestRooms = await fetchRoomsFromApi();

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
  const response = await fetchPeriodApiResponse(`${API_BASE_URL}?action=getTodayFnbSalesReport&${params.toString()}`);

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

  const response = await fetchPeriodApiResponse(`${API_BASE_URL}?${params.toString()}`);

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

  const response = await fetchPeriodApiResponse(`${API_BASE_URL}?${params.toString()}`);

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
  const response = await fetchPeriodApiResponse(`${API_BASE_URL}?action=getTodayFnbOrders&${params.toString()}`);

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
  const normalizedOrderIds = normalizeFnbOrderIds(orderIds);

  if (!API_BASE_URL.trim() || normalizedOrderIds.length === 0) {
    return [];
  }

  const params = new URLSearchParams({
    action: "getFnbOrdersByIds",
    order_ids: normalizedOrderIds.join(","),
  });
  const response = await fetchPeriodApiResponse(`${API_BASE_URL}?${params.toString()}`);

  if (!response.ok) {
    if (response.status === 404) {
      console.warn("Endpoint detail F&B belum tersedia di deployment API aktif.");
      return [];
    }

    throw new Error(`API request failed with status ${response.status}`);
  }

  const data = await response.json();

  if (!data || data.ok !== true || !Array.isArray(data.orders)) {
    throw new Error("API response is invalid.");
  }

  return data.orders;
}

function normalizeFnbOrderIds(orderIds) {
  const sourceOrderIds = Array.isArray(orderIds)
    ? orderIds
    : String(orderIds || "").split(",");

  return sourceOrderIds
    .map((orderId) => String(orderId || "").trim())
    .filter(Boolean)
    .filter((orderId, index, ids) => ids.indexOf(orderId) === index);
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
  if (transaction) {
    loadFnbDetailsForTransaction(transaction);
  }
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
  window.scrollTo({ top: 0, behavior: "smooth" });
  loadFnbDetailsForTransaction(transaction);
}

function hideReceiptPrint() {
  selectedReceiptTransaction = null;
  receiptPrintVisible = false;
  renderRooms();
}

function transactionHasFnbForReceipt(transaction) {
  return getTransactionFnbTotal(transaction) > 0 || getTransactionFnbOrderIds(transaction).length > 0;
}

function transactionHasLoadedFnbDetails(transaction) {
  return getReceiptFnbOrders(transaction).length > 0;
}

async function prepareReceiptTransaction(transaction) {
  if (!transaction) {
    showInlineNotice("Belum ada transaksi untuk dicetak.", "error");
    return null;
  }

  if (!transactionHasFnbForReceipt(transaction) || transactionHasLoadedFnbDetails(transaction)) {
    return transaction;
  }

  showInlineNotice("Memuat detail F&B untuk struk...");
  await loadFnbDetailsForTransaction(transaction);

  return transaction;
}

function normalizeReceiptPrintAudit(audit) {
  const sequence = Number(audit?.print_sequence || audit?.printSequence || 0) || 0;
  const reprintNumber = Number(audit?.reprint_number || audit?.reprintNumber || Math.max(0, sequence - 1)) || 0;

  return {
    print_sequence: sequence,
    is_reprint: Boolean(audit?.is_reprint || audit?.isReprint || sequence > 1 || reprintNumber > 0),
    reprint_number: reprintNumber,
    printed_at: audit?.printed_at || audit?.printedAt || "",
    cashier_name: audit?.cashier_name || audit?.cashierName || "",
    print_type: audit?.print_type || audit?.printType || "",
  };
}

function getReceiptPrintAudit(transaction) {
  const transactionId = transaction?.transaction_id || "";
  return transactionId ? receiptPrintAuditByTransactionId[transactionId] || null : null;
}

async function waitForNextFrame() {
  await new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
}

async function logReceiptPrintAttempt(transaction, printType) {
  const transactionId = transaction?.transaction_id || "";

  if (!transactionId) {
    throw new Error("ID transaksi tidak ditemukan.");
  }

  if (!API_BASE_URL.trim()) {
    throw new Error("API belum dikonfigurasi. Cetak struk perlu dicatat ke sistem.");
  }

  const data = await postApiAction({
    action: "logReceiptPrint",
    transaction_id: transactionId,
    print_type: printType,
    cashier_name: getLoggedInOperatorName(),
  });

  if (!data || data.ok !== true) {
    const failedTransactionId = data?.transaction_id || transactionId;
    const baseMessage = data?.error || "Gagal mencatat cetak struk.";
    throw new Error(`${baseMessage} ID: ${failedTransactionId}`);
  }

  const audit = normalizeReceiptPrintAudit(data.log || data);
  receiptPrintAuditByTransactionId = {
    ...receiptPrintAuditByTransactionId,
    [transactionId]: audit,
  };

  return audit;
}

async function printReceipt(transaction = selectedReceiptTransaction || lastTransaction) {
  const preparedTransaction = await prepareReceiptTransaction(transaction);

  if (!preparedTransaction) {
    return;
  }

  if (typeof window === "undefined" || typeof window.print !== "function") {
    showInlineNotice("Fitur cetak tidak tersedia di browser ini.", "error");
    return;
  }

  try {
    const audit = await logReceiptPrintAttempt(preparedTransaction, "browser");
    showInlineNotice(audit.is_reprint ? `Cetak ulang struk ke-${audit.reprint_number}.` : "Cetak struk dicatat.");
    renderRooms();
    await waitForNextFrame();
    window.print();
  } catch (error) {
    showInlineNotice(error.message || "Gagal mencetak struk.", "error");
  }
}

async function showThermalReceiptPreview(transaction) {
  const preparedTransaction = await prepareReceiptTransaction(transaction);

  if (!preparedTransaction) {
    return;
  }

  const receipt = queryDashboard(".receipt-print");

  if (!receipt) {
    showInlineNotice("Buka preview struk terlebih dahulu.", "error");
    return;
  }

  const receiptData = buildReceiptData(preparedTransaction, {
    fnbOrders: getReceiptFnbOrders(preparedTransaction),
    print: getReceiptPrintAudit(preparedTransaction),
  });
  const previewText = formatReceipt58mm(receiptData);
  let preview = receipt.querySelector(".thermal-receipt-preview");
  let content = preview?.querySelector(".thermal-receipt-preview-content");

  if (!preview) {
    preview = document.createElement("section");
    preview.className = "thermal-receipt-preview";

    const title = document.createElement("h3");
    title.className = "thermal-receipt-preview-title";
    title.textContent = "Preview Thermal 58mm";

    content = document.createElement("pre");
    content.className = "thermal-receipt-preview-content";

    preview.append(title, content);
    receipt.querySelector(".receipt-print-actions")?.before(preview);
  }

  if (content) {
    content.textContent = previewText;
  }
}

async function printThermalReceiptFromTransaction(transaction = selectedReceiptTransaction || lastTransaction) {
  const preparedTransaction = await prepareReceiptTransaction(transaction);

  if (!preparedTransaction) {
    return;
  }

  try {
    const audit = await logReceiptPrintAttempt(preparedTransaction, "thermal");
    const receiptData = buildReceiptData(preparedTransaction, {
      fnbOrders: getReceiptFnbOrders(preparedTransaction),
      print: audit,
    });
    const printStarted = printThermalReceipt(receiptData);

    if (!printStarted) {
      showInlineNotice("Fitur cetak thermal tidak tersedia di browser ini.", "error");
      return;
    }

    showInlineNotice(audit.is_reprint ? `Cetak ulang thermal ke-${audit.reprint_number}.` : "Cetak thermal dicatat.");
  } catch (error) {
    showInlineNotice(error.message || "Gagal mencetak struk thermal.", "error");
  }
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
  transactionPeriodRequestVersion += 1;
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
  transactionPeriodRequestVersion += 1;
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

function getTransactionTimeValue(transaction) {
  const candidates = [
    transaction?.created_at,
    transaction?.createdAt,
    transaction?.end_time,
    transaction?.endTime,
    transaction?.start_time,
    transaction?.startTime,
  ];

  for (const candidate of candidates) {
    const value = String(candidate || "").trim();
    const localMatch = value.match(/^(\d{2})-(\d{2})-(\d{4}) - (\d{2}):(\d{2}):(\d{2})$/);
    const timestamp = localMatch
      ? new Date(
          Number(localMatch[3]),
          Number(localMatch[2]) - 1,
          Number(localMatch[1]),
          Number(localMatch[4]),
          Number(localMatch[5]),
          Number(localMatch[6])
        ).getTime()
      : Date.parse(value);

    if (!Number.isNaN(timestamp)) {
      return timestamp;
    }
  }

  return 0;
}

function getLatestTodayTransaction() {
  return todayTransactions.reduce((latest, transaction) => {
    if (!latest) {
      return transaction;
    }

    return getTransactionTimeValue(transaction) >= getTransactionTimeValue(latest)
      ? transaction
      : latest;
  }, null);
}

async function findTransactionForAction(button) {
  const transactionId = button?.dataset?.transactionId || "";

  if (transactionId) {
    let transaction = findTodayTransactionById(transactionId)
      || (lastTransaction?.transaction_id === transactionId ? lastTransaction : null)
      || (selectedReceiptTransaction?.transaction_id === transactionId ? selectedReceiptTransaction : null);

    if (!transaction) {
      showInlineNotice("Memuat ulang riwayat transaksi...");
      await loadTodayTransactions();
      transaction = findTodayTransactionById(transactionId)
        || (lastTransaction?.transaction_id === transactionId ? lastTransaction : null)
        || (selectedReceiptTransaction?.transaction_id === transactionId ? selectedReceiptTransaction : null);
    }

    return transaction;
  }

  return lastTransaction || selectedReceiptTransaction || getLatestTodayTransaction();
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
  resetClosingDenominations();
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

function resetClosingDenominations() {
  cashierClosingDenominations = {
    d100k: 0,
    d50k: 0,
    d20k: 0,
    d10k: 0,
    d5k: 0,
    d2k: 0,
    d1k: 0,
    d500: 0,
    d200: 0,
    d100: 0,
  };
}

function compileClosingNote() {
  const baseNote = cashierClosingNote.trim();
  const breakdownLines = [];
  const denoms = [
    { key: "d100k", val: 100000, label: "Rp 100.000" },
    { key: "d50k", val: 50000, label: "Rp 50.000" },
    { key: "d20k", val: 20000, label: "Rp 20.000" },
    { key: "d10k", val: 10000, label: "Rp 10.000" },
    { key: "d5k", val: 5000, label: "Rp 5.000" },
    { key: "d2k", val: 2000, label: "Rp 2.000" },
    { key: "d1k", val: 1000, label: "Rp 1.000" },
    { key: "d500", val: 500, label: "Rp 500" },
    { key: "d200", val: 200, label: "Rp 200" },
    { key: "d100", val: 100, label: "Rp 100" },
  ];

  denoms.forEach(d => {
    const qty = cashierClosingDenominations[d.key] || 0;
    if (qty > 0) {
      breakdownLines.push(`${d.label}: ${qty}x`);
    }
  });

  if (breakdownLines.length > 0) {
    const denomString = `[Pecahan Fisik: ${breakdownLines.join(" | ")}]`;
    return baseNote ? `${baseNote}\n\n${denomString}` : denomString;
  }
  return baseNote;
}

function parseClosingNoteAndDenoms(rawNote) {
  if (!rawNote) return { note: "", denoms: [] };

  const denomRegex = /\[Pecahan Fisik:\s*([^\]]+)\]/;
  const match = rawNote.match(denomRegex);

  if (match) {
    const denomPart = match[1];
    const cleanedNote = rawNote.replace(denomRegex, "").trim();
    const denoms = denomPart.split(" | ").map(part => {
      const subParts = part.split(":");
      const label = subParts[0]?.trim() || "";
      const qtyText = subParts[1]?.replace("x", "")?.trim() || "0";
      const qty = parseInt(qtyText, 10) || 0;
      
      const valText = label.replace(/[^\d]/g, "");
      const value = parseInt(valText, 10) || 0;

      return { label, qty, total: qty * value };
    });

    return { note: cleanedNote, denoms };
  }

  return { note: rawNote, denoms: [] };
}

function recalculateFromDenoms(focusedId) {
  const denoms = [
    { key: "d100k", val: 100000 },
    { key: "d50k", val: 50000 },
    { key: "d20k", val: 20000 },
    { key: "d10k", val: 10000 },
    { key: "d5k", val: 5000 },
    { key: "d2k", val: 2000 },
    { key: "d1k", val: 1000 },
    { key: "d500", val: 500 },
    { key: "d200", val: 200 },
    { key: "d100", val: 100 },
  ];

  let total = 0;
  denoms.forEach((d) => {
    total += (cashierClosingDenominations[d.key] || 0) * d.val;
  });

  cashierClosingCashActual = total.toString();
  renderRooms();

  if (focusedId) {
    const input = queryDashboard(`#${focusedId}`);
    if (input) {
      input.focus();
      try {
        input.setSelectionRange(input.value.length, input.value.length);
      } catch (error) {}
    }
  }
}

function hasTodayCashierClosing() {
  return todayCashierClosings.length > 0;
}

function findTodayClosingById(closingId) {
  return todayCashierClosings.find((closing) => closing.closing_id === closingId) || null;
}

async function showClosingPrintPreview(closingId) {
  const closing = findTodayClosingById(closingId);

  if (!closing) {
    showInlineNotice("Data closing tidak ditemukan.", "error");
    return;
  }

  selectedClosingForPrint = { ...closing, closing_details_loading: true };
  closingPrintPreviewVisible = true;
  renderRooms();

  try {
    const params = new URLSearchParams({
      action: "getCashierClosingDetails",
      closing_id: closingId,
      _: Date.now().toString(),
    });
    const response = await fetchPeriodApiResponse(`${API_BASE_URL}?${params.toString()}`);
    const data = await response.json();
    if (!response.ok || data?.ok !== true) {
      throw new Error(data?.error || "Rincian closing tidak dapat dimuat.");
    }
    selectedClosingForPrint = {
      ...closing,
      closing_details_loading: false,
      closing_details: data,
    };
  } catch (error) {
    selectedClosingForPrint = {
      ...closing,
      closing_details_loading: false,
      closing_details_error: error.message || "Rincian closing tidak dapat dimuat.",
    };
    showInlineNotice(error.message || "Rincian closing tidak dapat dimuat.", "error");
  }
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

function showOwnerReportPrintPreview() {
  ownerReportPrintVisible = true;
  renderRooms();
}

function hideOwnerReportPrintPreview() {
  ownerReportPrintVisible = false;
  renderRooms();
}

function printOwnerReport() {
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
      updated_at: room.updated_at || null,
      customer_name: room.customer_name || "",
      package_id: room.package_id || "",
      lc_ids: String(room.lc_ids || "").trim(),
      lc_companion_ids: String(room.lc_companion_ids || room.lc_ids || "").trim(),
      _debug_lc_info: room._debug_lc_info || null,
    };
  });
}

function getFilteredMenuItems() {
  const normalizedSearch = menuSearchQuery.trim().toLowerCase();

  return menuItems.filter((menuItem) => {
    const classification = getFnbMenuClassification(menuItem);
    const isActive = String(menuItem.status || "").trim().toLowerCase() === "active";
    const matchesCategory = menuCategoryFilter === "all" ||
      (menuCategoryFilter === "favorites" && isFavoriteFnbMenuItem(menuItem)) ||
      classification.primary === menuCategoryFilter;
    const matchesSpirit = menuCategoryFilter !== "Spirit" ||
      menuSpiritFilter === "all" ||
      classification.subcategory === menuSpiritFilter;
    const matchesSearch =
      !normalizedSearch ||
      `${menuItem.menu_name || ""} ${classification.primary} ${classification.subcategory} ${classification.rawCategory}`
        .toLowerCase()
        .includes(normalizedSearch);

    return isActive && matchesCategory && matchesSpirit && matchesSearch;
  });
}

function getFnbMenuClassification(menuItem) {
  const rawCategory = String(menuItem && menuItem.category || "").trim();
  const normalizedRaw = rawCategory.toLowerCase();
  const spiritSubcategory = FNB_SPIRIT_CATEGORY_ALIASES.get(normalizedRaw);

  if (spiritSubcategory) {
    return {
      primary: "Spirit",
      subcategory: spiritSubcategory,
      rawCategory,
    };
  }

  const primary = FNB_PRIMARY_CATEGORY_ORDER.includes(rawCategory) && rawCategory !== "favorites"
    ? rawCategory
    : rawCategory || "Lainnya";

  return {
    primary,
    subcategory: "",
    rawCategory,
  };
}

function isFavoriteFnbMenuItem(menuItem) {
  const normalizedName = String(menuItem && menuItem.menu_name || "").trim().toLowerCase();
  return FNB_FAVORITE_ITEM_NAMES.has(normalizedName);
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
  if (menuCategoryFilter !== "Spirit") {
    menuSpiritFilter = "all";
  }
  renderRooms();
}

function setMenuSpiritFilter(subcategory) {
  menuSpiritFilter = subcategory || "all";
  renderRooms();
}

function getMenuCategories() {
  const activeItems = menuItems.filter((menuItem) => {
    return String(menuItem.status || "").trim().toLowerCase() === "active";
  });
  const available = new Set(activeItems.map((menuItem) => getFnbMenuClassification(menuItem).primary));
  const ordered = FNB_PRIMARY_CATEGORY_ORDER.filter((category) => {
    return category === "favorites"
      ? activeItems.some(isFavoriteFnbMenuItem)
      : available.has(category);
  });
  const extra = [...available].filter((category) => !FNB_PRIMARY_CATEGORY_ORDER.includes(category)).sort();

  return ["all", ...ordered, ...extra];
}

function getFnbMenuCategoryCount(category) {
  return menuItems.filter((menuItem) => {
    const isActive = String(menuItem.status || "").trim().toLowerCase() === "active";
    const classification = getFnbMenuClassification(menuItem);

    return isActive && (
      category === "all" ||
      (category === "favorites" && isFavoriteFnbMenuItem(menuItem)) ||
      classification.primary === category
    );
  }).length;
}

function getAvailableSpiritSubcategories() {
  const available = new Set(menuItems
    .filter((menuItem) => String(menuItem.status || "").trim().toLowerCase() === "active")
    .map((menuItem) => getFnbMenuClassification(menuItem))
    .filter((classification) => classification.primary === "Spirit" && classification.subcategory)
    .map((classification) => classification.subcategory));

  return FNB_SPIRIT_SUBCATEGORY_ORDER.filter((subcategory) => available.has(subcategory));
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

function setFnbOrderMode(mode) {
  const nextMode = ["general", "testing"].includes(mode) ? mode : "room";

  if (nextMode === "testing" && !roleMeetsRequired(getCurrentOperatorRole(), "manager")) {
    showInlineNotice("Mode testing F&B hanya tersedia untuk manager atau owner.", "error");
    return;
  }

  fnbOrderMode = nextMode;

  if (nextMode === "general" || nextMode === "testing") {
    selectedFbRoomId = "";
    fnbOrderPaymentMethod = "cash";
  }

  if (nextMode === "testing" && !fnbTestRunId) {
    fnbTestRunId = `FNB-TEST-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  }

  renderRooms();
}

function getDynamicMenuStockInfo(menuItem) {
  if (!menuItem || menuItem.stock_tracking !== "yes" || !menuItem.stock_item_id) {
    return { hasTracking: false, availablePortions: Infinity, unit: "", stockQty: null };
  }

  const normalizedTargetId = String(menuItem.stock_item_id).trim().toLowerCase();
  let invItem = (inventoryItems || []).find(
    (inv) => String(inv.stock_item_id || "").trim().toLowerCase() === normalizedTargetId
  );

  // Fallback tolerance for prefix mismatch (e.g. ITEM-034 vs MENU-034)
  if (!invItem) {
    const targetSuffix = normalizedTargetId.replace(/^\D+/, "");
    if (targetSuffix) {
      invItem = (inventoryItems || []).find(
        (inv) => String(inv.stock_item_id || "").trim().toLowerCase().replace(/^\D+/, "") === targetSuffix
      );
    }
  }

  let rawStockQty = null;
  let unit = menuItem.unit || "";

  if (invItem && invItem.stock_qty !== null && invItem.stock_qty !== undefined) {
    rawStockQty = Number(invItem.stock_qty);
    if (invItem.unit) {
      unit = invItem.unit;
    }
  } else if (menuItem.stock_qty !== null && menuItem.stock_qty !== undefined) {
    rawStockQty = Number(menuItem.stock_qty);
  }

  if (rawStockQty === null || !Number.isFinite(rawStockQty)) {
    return { hasTracking: true, availablePortions: Infinity, unit, stockQty: null };
  }

  const stockQty = rawStockQty;
  const qtyPerUnit = Number(menuItem.stock_qty_per_unit) || 1;
  const availablePortions = Math.floor(stockQty / qtyPerUnit);

  return { hasTracking: true, availablePortions, unit, stockQty };
}

function getAvailableMenuPortions(menuItem) {
  const stockInfo = getDynamicMenuStockInfo(menuItem);
  return stockInfo.availablePortions;
}

function addMenuItemToCart(menuId) {
  const menuItem = findMenuItemById(menuId);

  if (!menuItem || String(menuItem.status || "").trim().toLowerCase() !== "active") {
    showInlineNotice("Menu tidak aktif dan tidak bisa ditambahkan.", "error");
    return;
  }

  const availablePortions = getAvailableMenuPortions(menuItem);
  const existingItem = fbCartItems.find((item) => item.menu_id === menuItem.menu_id);
  const currentQty = existingItem ? existingItem.quantity : 0;

  if (currentQty + 1 > availablePortions) {
    showInlineNotice(`Stok tidak mencukupi (Sisa stok: ${availablePortions}).`, "error");
    return;
  }

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

  const menuItem = findMenuItemById(menuId);
  const availablePortions = getAvailableMenuPortions(menuItem);

  if (cartItem.quantity + 1 > availablePortions) {
    showInlineNotice(`Stok tidak mencukupi (Sisa stok: ${availablePortions}).`, "error");
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
  const isTestingOrder = fnbOrderMode === "testing";
  const isRoomBill = fnbOrderPaymentMethod === "room_bill" && !isTestingOrder;
  return {
    action: "saveFnbOrder",
    room_id: fnbOrderMode === "room" ? selectedFbRoomId : "FNB-GENERAL",
    items: fbCartItems.map((item) => ({
      menu_id: item.menu_id,
      quantity: item.quantity,
    })),
    cashier_name: getLoggedInOperatorName(),
    note: fnbOrderNote,
    payment_method: isRoomBill ? "" : fnbOrderPaymentMethod,
    payment_status: isRoomBill ? "unpaid" : "paid",
    test_mode: isTestingOrder,
    test_run_id: isTestingOrder ? fnbTestRunId : "",
    test_note: isTestingOrder ? "F&B menu testing" : "",
  };
}

async function saveFnbOrder() {
  if (!API_BASE_URL.trim()) {
    showInlineNotice("API belum dikonfigurasi. Isi URL server dulu di config.js.", "error");
    return;
  }

  const selectedRoom = getSelectedFbRoom();
  const isTestingOrder = fnbOrderMode === "testing";
  const isGeneralOrder = fnbOrderMode === "general" || isTestingOrder;

  if (!isGeneralOrder && !selectedRoom) {
    showInlineNotice("Pilih ruangan terlebih dahulu.", "error");
    return;
  }

  if (!isGeneralOrder && !isFbOrderRoomSelectable(selectedRoom)) {
    showInlineNotice("Order F&B hanya bisa disimpan untuk ruangan yang sedang terisi.", "error");
    return;
  }

  if (isGeneralOrder && fnbOrderPaymentMethod === "room_bill") {
    showInlineNotice("Order F&B umum harus dibayar tunai atau transfer.", "error");
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
    const originalPaymentMethod = fnbOrderPaymentMethod;
    fnbOrderPaymentMethod = "room_bill";
    showInlineNotice(
      isTestingOrder
        ? "Order F&B TEST berhasil disimpan. Data tidak masuk production dan tidak memotong stok."
        : "Order F&B berhasil disimpan."
    );
    await loadOpenFnbOrders();
    await loadTodayFnbOrders();
    await loadInventoryItems();

    if (data.order && data.order.order_status === "paid") {
      const detailedOrder = Object.assign({}, data.order, {
        items: lastFnbOrder.items
      });
      transactionFnbDetails[data.order.order_id] = [detailedOrder];

      const tempTransaction = {
        transaction_id: data.order.order_id,
        room_id: data.order.room_id,
        room_name: data.order.room_name,
        start_time: "",
        end_time: data.order.created_at,
        duration_minutes: 0,
        rate_per_hour: 0,
        room_total: 0,
        fnb_total: data.order.order_total,
        grand_total: data.order.order_total,
        fnb_order_ids: data.order.order_id,
        payment_method: originalPaymentMethod || "cash",
        payment_status: "paid",
        cashier_name: data.order.cashier_name,
        created_at: data.order.created_at,
        transaction_type: "fnb_addon"
      };
      
      showReceiptPrint(tempTransaction);
    }
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
    await loadInventoryItems();
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

function formatDateTimeLabel(value) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value).trim();
  }

  const pad = (num) => String(num).padStart(2, "0");
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function formatTransactionDateTime(value) {
  if (!value) return "-";
  if (/^\d{2}-\d{2}-\d{4} - \d{2}:\d{2}:\d{2}$/.test(value)) {
    return value;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value)
      .replace("T", " ")
      .replace(/\.\d{3}/, "")
      .replace(/\+\d{2}:?\d{2}$/, "")
      .replace(/Z$/, "");
  }
  const pad = (num) => String(num).padStart(2, "0");
  const day = pad(date.getDate());
  const month = pad(date.getMonth() + 1);
  const year = date.getFullYear();
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());
  return `${day}-${month}-${year} - ${hours}:${minutes}:${seconds}`;
}

function formatSimpleDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    // Fallback: hapus T dan bagian jam jika bukan date object valid
    return String(value).split("T")[0].split(" ")[0];
  }
  const pad = (num) => String(num).padStart(2, "0");
  const day = pad(date.getDate());
  const month = pad(date.getMonth() + 1);
  const year = date.getFullYear();
  return `${day}-${month}-${year}`;
}

function getElapsedSeconds(startTime) {
  if (!startTime) {
    return 0;
  }

  return Math.floor((Date.now() - new Date(startTime).getTime()) / 1000);
}

function getStatusLabel(status) {
  return ROOM_STATUS_CONFIG[status]?.label || "Tidak Dikenal";
}

function getStatusClass(status) {
  return ROOM_STATUS_CONFIG[status]?.className || "unknown";
}

function getSessionButtonLabel(status) {
  return ROOM_STATUS_CONFIG[status]?.buttonLabel || "Cek Status";
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
  const rawGrandTotal = transaction?.grand_total;
  if (rawGrandTotal !== "" && rawGrandTotal !== null && rawGrandTotal !== undefined) {
    const grandTotal = Number(rawGrandTotal);
    if (Number.isFinite(grandTotal)) return grandTotal;
  }

  return (Number(transaction?.room_total) || 0)
    + (Number(transaction?.fnb_total) || 0)
    + (Number(transaction?.lc_total) || 0);
}

function getTransactionRoomTotal(transaction) {
  return Number(transaction?.room_total) || 0;
}

function getTransactionFnbTotal(transaction) {
  return Number(transaction?.fnb_total) || 0;
}

function getTransactionFnbOrderIds(transaction) {
  return normalizeFnbOrderIds(transaction?.fnb_order_ids);
}

function getReceiptFnbOrders(transaction) {
  const transactionId = transaction?.transaction_id || "";
  const loadedOrders = transactionId ? transactionFnbDetails[transactionId] : null;

  if (Array.isArray(loadedOrders) && loadedOrders.length > 0) {
    return loadedOrders;
  }

  if (Array.isArray(transaction?.fnb_orders)) {
    return transaction.fnb_orders;
  }

  return [];
}

function getLoadedTransactionFnbDetails(transactionId) {
  const loadedOrders = transactionId ? transactionFnbDetails[transactionId] : null;
  return Array.isArray(loadedOrders) && loadedOrders.length > 0 ? loadedOrders : null;
}

function getCachedFnbOrdersByIds(orderIds) {
  const normalizedOrderIds = normalizeFnbOrderIds(orderIds);

  if (normalizedOrderIds.length === 0) {
    return [];
  }

  const orderIdMap = normalizedOrderIds.reduce((map, orderId) => {
    map[orderId] = true;
    return map;
  }, {});
  const sources = [
    Array.isArray(todayFnbOrders) ? todayFnbOrders : [],
    Array.isArray(openFnbOrders) ? openFnbOrders : [],
  ];
  const ordersById = {};

  sources.forEach((orders) => {
    orders.forEach((order) => {
      const orderId = String(order?.order_id || "").trim();

      if (orderIdMap[orderId] && !ordersById[orderId]) {
        ordersById[orderId] = order;
      }
    });
  });

  return normalizedOrderIds
    .map((orderId) => ordersById[orderId])
    .filter(Boolean);
}

function cachedFnbOrdersCoverIds(orderIds, orders) {
  const normalizedOrderIds = normalizeFnbOrderIds(orderIds);

  if (normalizedOrderIds.length === 0) {
    return true;
  }

  const loadedOrderIds = (Array.isArray(orders) ? orders : [])
    .map((order) => String(order?.order_id || "").trim())
    .filter(Boolean);

  return normalizedOrderIds.every((orderId) => loadedOrderIds.includes(orderId));
}

async function loadFnbDetailsForTransaction(transaction) {
  const transactionId = transaction?.transaction_id || "";
  const orderIds = getTransactionFnbOrderIds(transaction);

  if (!transactionId || orderIds.length === 0 || getLoadedTransactionFnbDetails(transactionId)) {
    return;
  }

  const cachedOrders = getCachedFnbOrdersByIds(orderIds);

  if (cachedOrders.length > 0) {
    transactionFnbDetails[transactionId] = cachedOrders;
    renderRooms();

    if (cachedFnbOrdersCoverIds(orderIds, cachedOrders)) {
      return;
    }
  }

  isLoadingTransactionFnbDetails = true;
  renderRooms();

  try {
    const apiOrders = await fetchFnbOrdersByIds(orderIds);
    transactionFnbDetails[transactionId] = apiOrders.length > 0
      ? apiOrders
      : cachedOrders;
  } catch (error) {
    console.warn("Gagal memuat detail F&B transaksi.", error);
    transactionFnbDetails[transactionId] = cachedOrders;
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

function createCashierClosingCard(labelText, valueText, detailText = "", modifierClass = "") {
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

  if (detailText) {
    const detail = document.createElement("p");
    detail.className = "cashier-closing-card-detail";
    detail.textContent = detailText;
    card.appendChild(detail);
  }

  return card;
}

function createCashierClosingSectionTitle(titleText, helperText = "") {
  const wrapper = document.createElement("div");

  const title = document.createElement("h4");
  title.className = "cashier-closing-section-title";
  title.textContent = titleText;

  wrapper.appendChild(title);

  if (helperText) {
    const helper = document.createElement("p");
    helper.className = "cashier-closing-helper";
    helper.textContent = helperText;
    wrapper.appendChild(helper);
  }

  return wrapper;
}

function openCashierClosingConfirmation() {
  if (hasTodayCashierClosing()) {
    showInlineNotice("Closing kasir hari ini sudah tersimpan.", "error");
    return;
  }

  cashierClosingConfirmationVisible = true;
  renderRooms();
}

function closeCashierClosingConfirmation() {
  cashierClosingConfirmationVisible = false;
  renderRooms();
}

function createCashierClosingConfirmationElement() {
  const preview = calculateCashierClosingPreview(todayTransactions);
  const overlay = document.createElement("section");
  overlay.className = "master-delete-modal cashier-closing-confirm-modal";
  overlay.setAttribute("aria-labelledby", "cashier-closing-confirm-title");

  const dialog = document.createElement("div");
  dialog.className = "master-delete-dialog cashier-closing-confirm-dialog";

  const title = document.createElement("h3");
  title.className = "master-delete-title cashier-closing-confirm-title";
  title.id = "cashier-closing-confirm-title";
  title.textContent = "Konfirmasi Simpan Closing";

  const warning = document.createElement("p");
  warning.className = "master-delete-warning cashier-closing-confirm-warning";
  warning.textContent = "Periksa angka terakhir ini sebelum closing disimpan. Setelah tersimpan, closing shift aktif akan terkunci.";

  const details = document.createElement("div");
  details.className = "master-delete-details cashier-closing-confirm-details";

  [
    ["Cash Sistem", formatCurrency(preview.cashExpected)],
    ["Cash Aktual", formatCurrency(preview.cashActual)],
    ["Selisih Cash", `${formatCurrency(preview.cashDifference)} - ${getCashDifferenceLabel(preview.cashDifference)}`],
    ["Transfer Sistem", formatCurrency(preview.transferRevenue)],
    ["Belum Dibayar", formatCurrency(preview.unpaidRevenue)],
    ["Total Tagihan", formatCurrency(preview.totalRevenue)],
  ].forEach(([labelText, valueText]) => {
    const item = document.createElement("div");
    item.className = "cashier-closing-confirm-item";

    const label = document.createElement("p");
    label.className = "cashier-closing-saved-label";
    label.textContent = labelText;

    const value = document.createElement("p");
    value.className = "cashier-closing-saved-value";
    value.textContent = valueText;

    item.append(label, value);
    details.appendChild(item);
  });

  const transferNote = document.createElement("p");
  transferNote.className = "cashier-closing-confirm-note";
  transferNote.textContent = preview.transferTransactions > 0
    ? "Transfer dianggap sudah dicek manual dengan mutasi/QRIS/bukti transfer."
    : "Tidak ada transaksi transfer pada shift aktif.";

  const actions = document.createElement("div");
  actions.className = "master-delete-actions";

  const cancelButton = document.createElement("button");
  cancelButton.className = "master-button secondary";
  cancelButton.type = "button";
  cancelButton.dataset.action = "close-cashier-closing-confirmation";
  cancelButton.disabled = isSavingCashierClosing;
  cancelButton.textContent = "Batal";

  const submitButton = document.createElement("button");
  submitButton.className = "master-button primary";
  submitButton.type = "button";
  submitButton.dataset.action = "confirm-save-cashier-closing";
  submitButton.disabled = isSavingCashierClosing;
  submitButton.textContent = isSavingCashierClosing ? "Menyimpan..." : "Ya, Simpan Closing";

  actions.append(cancelButton, submitButton);
  dialog.append(title, warning, details, transferNote, actions);
  overlay.appendChild(dialog);

  return overlay;
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

  // 1. Rekap Transaksi & Keuangan Table
  const mainTable = document.createElement("table");
  mainTable.className = "cashier-closing-table";
  
  const mainTableHeader = document.createElement("thead");
  const mainHeaderRow = document.createElement("tr");
  ["Kategori / Deskripsi", "Detail Transaksi", "Nominal Sistem"].forEach(text => {
    const th = document.createElement("th");
    if (text === "Nominal Sistem") th.className = "text-right";
    th.textContent = text;
    mainHeaderRow.appendChild(th);
  });
  mainTableHeader.appendChild(mainHeaderRow);
  mainTable.appendChild(mainTableHeader);

  const mainTableBody = document.createElement("tbody");

  // Section Rekap Transaksi
  const secTrans = document.createElement("tr");
  secTrans.className = "table-section-header";
  const secTransTd = document.createElement("td");
  secTransTd.colSpan = 3;
  secTransTd.textContent = "Rekap Volume Transaksi";
  secTrans.appendChild(secTransTd);
  mainTableBody.appendChild(secTrans);

  const transRows = [
    ["Total Transaksi", `${preview.totalTransactions} transaksi`, "-"],
    ["Transaksi Lunas", `${preview.paidTransactions} transaksi`, "-"],
    ["Transaksi Belum Dibayar", `${preview.unpaidTransactions} transaksi`, "-", preview.unpaidTransactions > 0 ? "text-warning font-bold" : ""],
  ];
  transRows.forEach(([desc, detail, amount, cls]) => {
    const tr = document.createElement("tr");
    if (cls) tr.className = cls;
    const td1 = document.createElement("td"); td1.textContent = desc;
    const td2 = document.createElement("td"); td2.textContent = detail;
    const td3 = document.createElement("td"); td3.className = "text-right"; td3.textContent = amount;
    tr.append(td1, td2, td3);
    mainTableBody.appendChild(tr);
  });

  // Section Rekap Keuangan
  const secFinance = document.createElement("tr");
  secFinance.className = "table-section-header";
  const secFinanceTd = document.createElement("td");
  secFinanceTd.colSpan = 3;
  secFinanceTd.textContent = "Rekap Keuangan (Omzet)";
  secFinance.appendChild(secFinanceTd);
  mainTableBody.appendChild(secFinance);

  const financeRows = [
    ["Omzet Lunas (Sudah Dibayar)", "Total penerimaan kasir", formatCurrency(preview.paidRevenue), "highlight-row text-success"],
    ["• Cash Sistem", `${preview.cashTransactions} transaksi cash`, formatCurrency(preview.cashExpected), "sub-row"],
    ["• Transfer Sistem", `${preview.transferTransactions} transaksi transfer`, formatCurrency(preview.transferRevenue), "sub-row"],
    ["Sisa Belum Dibayar", "Tagihan room/F&B yang masih open", formatCurrency(preview.unpaidRevenue), preview.unpaidRevenue > 0 ? "text-warning font-bold" : ""],
    ["Total Semua Tagihan", "Akumulasi lunas + belum lunas", formatCurrency(preview.totalRevenue), "grand-total-row"],
  ];
  financeRows.forEach(([desc, detail, amount, cls]) => {
    const tr = document.createElement("tr");
    if (cls) tr.className = cls;
    const td1 = document.createElement("td"); td1.textContent = desc;
    const td2 = document.createElement("td"); td2.textContent = detail;
    const td3 = document.createElement("td"); td3.className = "text-right"; td3.textContent = amount;
    tr.append(td1, td2, td3);
    mainTableBody.appendChild(tr);
  });

  mainTable.appendChild(mainTableBody);

  const cashSection = document.createElement("div");
  cashSection.className = "cashier-closing-section";

  cashSection.appendChild(createCashierClosingSectionTitle(
    "Pemeriksaan Cash",
    "Hitung uang fisik di laci kasir, lalu masukkan nominalnya di bawah ini."
  ));

  const cashLabel = document.createElement("label");
  cashLabel.className = "cashier-closing-label";
  cashLabel.htmlFor = "cashierClosingCashActual";
  cashLabel.textContent = "Cash Aktual di Laci";

  const cashInput = document.createElement("input");
  cashInput.className = "cashier-closing-input";
  cashInput.id = "cashierClosingCashActual";
  cashInput.type = "number";
  cashInput.min = "0";
  cashInput.inputMode = "numeric";
  cashInput.placeholder = "Masukkan uang cash di laci";
  cashInput.dataset.action = "update-cash-actual";
  cashInput.value = cashierClosingCashActual;

  // Kalkulator Pecahan Uang
  const calcTitle = document.createElement("p");
  calcTitle.className = "cashier-closing-label";
  calcTitle.style.marginTop = "16px";
  calcTitle.textContent = "Kalkulator Pecahan Uang Laci (Opsional)";

  const denomTable = document.createElement("table");
  denomTable.className = "cashier-closing-table";
  
  const denomTableHeader = document.createElement("thead");
  const denomHeaderRow = document.createElement("tr");
  ["Pecahan Uang", "Jumlah Lembar / Koin", "Subtotal"].forEach(text => {
    const th = document.createElement("th");
    if (text === "Jumlah Lembar / Koin") th.className = "text-center";
    if (text === "Subtotal") th.className = "text-right";
    th.textContent = text;
    denomHeaderRow.appendChild(th);
  });
  denomTableHeader.appendChild(denomHeaderRow);
  denomTable.appendChild(denomTableHeader);

  const denomTableBody = document.createElement("tbody");

  const denoms = [
    { key: "d100k", val: 100000, label: "Rp 100.000" },
    { key: "d50k", val: 50000, label: "Rp 50.000" },
    { key: "d20k", val: 20000, label: "Rp 20.000" },
    { key: "d10k", val: 10000, label: "Rp 10.000" },
    { key: "d5k", val: 5000, label: "Rp 5.000" },
    { key: "d2k", val: 2000, label: "Rp 2.000" },
    { key: "d1k", val: 1000, label: "Rp 1.000" },
    { key: "d500", val: 500, label: "Rp 500" },
    { key: "d200", val: 200, label: "Rp 200" },
    { key: "d100", val: 100, label: "Rp 100" },
  ];

  denoms.forEach((denom) => {
    const tr = document.createElement("tr");

    const labelTd = document.createElement("td");
    labelTd.textContent = denom.label;

    const countTd = document.createElement("td");
    countTd.className = "text-center";

    const rowWrapper = document.createElement("div");
    rowWrapper.className = "denom-row-table";

    const decBtn = document.createElement("button");
    decBtn.type = "button";
    decBtn.className = "denom-btn-table dec-btn";
    decBtn.textContent = "-";
    decBtn.onclick = () => {
      const currentVal = cashierClosingDenominations[denom.key] || 0;
      if (currentVal > 0) {
        cashierClosingDenominations[denom.key] = currentVal - 1;
        recalculateFromDenoms(`denom_input_${denom.key}`);
      }
    };

    const countInput = document.createElement("input");
    countInput.type = "number";
    countInput.min = "0";
    countInput.id = `denom_input_${denom.key}`;
    countInput.value = cashierClosingDenominations[denom.key] || 0;
    countInput.className = "denom-input-table";
    countInput.oninput = (e) => {
      const val = parseInt(e.target.value, 10) || 0;
      cashierClosingDenominations[denom.key] = val >= 0 ? val : 0;
      recalculateFromDenoms(`denom_input_${denom.key}`);
    };

    const incBtn = document.createElement("button");
    incBtn.type = "button";
    incBtn.className = "denom-btn-table inc-btn";
    incBtn.textContent = "+";
    incBtn.onclick = () => {
      const currentVal = cashierClosingDenominations[denom.key] || 0;
      cashierClosingDenominations[denom.key] = currentVal + 1;
      recalculateFromDenoms(`denom_input_${denom.key}`);
    };

    rowWrapper.append(decBtn, countInput, incBtn);
    countTd.appendChild(rowWrapper);

    const subtotalTd = document.createElement("td");
    subtotalTd.className = "text-right text-gold";
    const totalVal = (cashierClosingDenominations[denom.key] || 0) * denom.val;
    subtotalTd.textContent = totalVal > 0 ? formatCurrency(totalVal) : "Rp 0";

    tr.append(labelTd, countTd, subtotalTd);
    denomTableBody.appendChild(tr);
  });
  denomTable.appendChild(denomTableBody);

  // 3. Cash Comparison Table
  const cashCompTable = document.createElement("table");
  cashCompTable.className = "cashier-closing-table";

  const cashCompBody = document.createElement("tbody");

  const compRows = [
    ["Cash Sistem (Seharusnya Ada)", formatCurrency(preview.cashExpected), ""],
    ["Cash Aktual Fisik (Dihitung)", formatCurrency(preview.cashActual), "text-gold"],
    ["Selisih Cash", formatCurrency(preview.cashDifference), `highlight-row text-gold ${getCashDifferenceClass(preview.cashDifference)}`],
  ];

  compRows.forEach(([label, value, cls]) => {
    const tr = document.createElement("tr");
    if (cls) tr.className = cls;
    
    const td1 = document.createElement("td");
    td1.textContent = label;

    const td2 = document.createElement("td");
    td2.className = "text-right";
    td2.textContent = value;

    tr.append(td1, td2);
    cashCompBody.appendChild(tr);
  });
  cashCompTable.appendChild(cashCompBody);

  const difference = document.createElement("p");
  difference.className = `cashier-closing-difference ${getCashDifferenceClass(preview.cashDifference)}`;
  difference.textContent = getCashDifferenceLabel(preview.cashDifference);

  cashSection.append(cashLabel, cashInput, calcTitle, denomTable, cashCompTable, difference);

  const transferSection = document.createElement("div");
  transferSection.className = "cashier-closing-section cashier-closing-section--transfer";
  transferSection.appendChild(createCashierClosingSectionTitle(
    "Pemeriksaan Transfer",
    "Cocokkan transaksi transfer dengan mutasi rekening, QRIS, atau bukti transfer sebelum closing disimpan."
  ));

  // 4. Transfer Comparison Table
  const transferCompTable = document.createElement("table");
  transferCompTable.className = "cashier-closing-table";

  const transferCompBody = document.createElement("tbody");

  const transCompRows = [
    ["Transfer Sistem", `${preview.transferTransactions} transaksi transfer lunas`, formatCurrency(preview.transferRevenue)],
    ["Yang Harus Dicek Kasir", "Mutasi bank, QRIS, atau bukti transfer manual", "-"],
  ];

  transCompRows.forEach(([label, detail, value]) => {
    const tr = document.createElement("tr");
    
    const td1 = document.createElement("td");
    td1.textContent = label;

    const td2 = document.createElement("td");
    td2.textContent = detail;

    const td3 = document.createElement("td");
    td3.className = "text-right";
    td3.textContent = value;

    tr.append(td1, td2, td3);
    transferCompBody.appendChild(tr);
  });
  transferCompTable.appendChild(transferCompBody);

  const transferChecklist = document.createElement("ul");
  transferChecklist.className = "cashier-closing-checklist";

  [
    "Cocokkan total transfer sistem dengan bukti/mutasi.",
    "Pastikan tidak ada transfer pending yang belum masuk.",
    "Tulis masalah transfer di Catatan Kasir jika ada.",
  ].forEach((itemText) => {
    const item = document.createElement("li");
    item.textContent = itemText;
    transferChecklist.appendChild(item);
  });

  transferSection.append(transferCompTable, transferChecklist);

  const noteSection = document.createElement("div");
  noteSection.className = "cashier-closing-section";
  noteSection.appendChild(createCashierClosingSectionTitle(
    "Catatan Closing",
    "Isi hanya jika ada informasi penting untuk owner atau shift berikutnya."
  ));

  const noteLabel = document.createElement("label");
  noteLabel.className = "cashier-closing-label";
  noteLabel.htmlFor = "cashierClosingNote";
  noteLabel.textContent = "Catatan Kasir";

  const noteInput = document.createElement("textarea");
  noteInput.className = "cashier-closing-textarea";
  noteInput.id = "cashierClosingNote";
  noteInput.placeholder = "Contoh: transfer BCA pelanggan belum masuk, ada tagihan pending, atau cash lebih karena pelanggan memberi uang lebih.";
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

  closing.append(header, mainTable, cashSection, transferSection, noteSection);

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
    ["Waktu", formatDateTimeLabel(closing?.created_at)],
    ["Cash Sistem", formatCurrency(closing?.cash_expected)],
    ["Cash Aktual", formatCurrency(closing?.cash_actual)],
    ["Transfer Sistem", formatCurrency(closing?.transfer_revenue)],
    ["Transaksi Transfer", `${Number(closing?.transfer_transactions) || 0} transaksi`],
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

  // Set layout container payment to vertical
  payment.style.flexDirection = "column";
  payment.style.alignItems = "stretch";
  payment.style.gap = "12px";

  const headerRow = document.createElement("div");
  headerRow.style.display = "flex";
  headerRow.style.justifyContent = "space-between";
  headerRow.style.alignItems = "center";
  headerRow.style.gap = "14px";
  headerRow.style.flexWrap = "wrap";

  headerRow.append(label, control);

  // Formatting helpers for cash input
  function formatIndonesianNumber(num) {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  }
  function parseIndonesianNumber(str) {
    return Number(str.replace(/\./g, "")) || 0;
  }

  // Cash Calculator Container (Opsi A)
  const calculatorContainer = document.createElement("div");
  calculatorContainer.className = "billing-payment-calculator";
  calculatorContainer.style.display = select.value === "cash" ? "flex" : "none";
  calculatorContainer.style.flexDirection = "column";
  calculatorContainer.style.gap = "10px";
  calculatorContainer.style.padding = "10px 12px";
  calculatorContainer.style.backgroundColor = "rgba(255, 255, 255, 0.02)";
  calculatorContainer.style.border = "1px solid var(--border)";
  calculatorContainer.style.borderRadius = "8px";

  const calcHeader = document.createElement("div");
  calcHeader.style.display = "flex";
  calcHeader.style.justifyContent = "space-between";
  calcHeader.style.alignItems = "center";
  
  const calcTitle = document.createElement("span");
  calcTitle.style.fontSize = "11px";
  calcTitle.style.fontWeight = "800";
  calcTitle.style.color = "var(--muted)";
  calcTitle.style.textTransform = "uppercase";
  calcTitle.style.letterSpacing = "0.5px";
  calcTitle.textContent = "Kalkulator Kasir (Tunai)";
  calcHeader.appendChild(calcTitle);

  const inputInfoRow = document.createElement("div");
  inputInfoRow.style.display = "flex";
  inputInfoRow.style.gap = "14px";
  inputInfoRow.style.alignItems = "center";
  inputInfoRow.style.flexWrap = "wrap";

  const inputGroup = document.createElement("div");
  inputGroup.style.display = "flex";
  inputGroup.style.flexDirection = "column";
  inputGroup.style.gap = "4px";
  inputGroup.style.flex = "1 1 180px";

  const inputLabel = document.createElement("span");
  inputLabel.style.fontSize = "11px";
  inputLabel.style.color = "var(--muted)";
  inputLabel.textContent = "Uang Diterima (Rp):";

  const cashInput = document.createElement("input");
  cashInput.type = "text";
  cashInput.placeholder = "Masukkan jumlah...";
  cashInput.style.padding = "8px 10px";
  cashInput.style.fontSize = "13px";
  cashInput.style.fontWeight = "700";
  cashInput.style.backgroundColor = "var(--surface)";
  cashInput.style.color = "var(--text)";
  cashInput.style.border = "1px solid var(--border)";
  cashInput.style.borderRadius = "6px";

  inputGroup.append(inputLabel, cashInput);

  const resultGroup = document.createElement("div");
  resultGroup.style.display = "flex";
  resultGroup.style.flexDirection = "column";
  resultGroup.style.gap = "4px";
  resultGroup.style.flex = "1 1 180px";

  const resultLabel = document.createElement("span");
  resultLabel.style.fontSize = "11px";
  resultLabel.style.color = "var(--muted)";
  resultLabel.textContent = "Kembalian:";

  const changeDisplay = document.createElement("span");
  changeDisplay.style.fontSize = "16px";
  changeDisplay.style.fontWeight = "900";
  changeDisplay.style.color = "var(--muted)";
  changeDisplay.textContent = "-";

  resultGroup.append(resultLabel, changeDisplay);
  inputInfoRow.append(inputGroup, resultGroup);

  const shortcutsRow = document.createElement("div");
  shortcutsRow.style.display = "flex";
  shortcutsRow.style.flexWrap = "wrap";
  shortcutsRow.style.gap = "6px";
  shortcutsRow.style.marginTop = "2px";

  calculatorContainer.append(calcHeader, inputInfoRow, shortcutsRow);

  // Dynamic Banknote Shortcuts generator
  function getShortcutValues(total) {
    if (total <= 0) return [];
    const shortcuts = new Set();
    shortcuts.add(total); // Uang Pas

    // Next round values of 50k, 100k, 500k
    const denoms = [50000, 100000, 500000];
    denoms.forEach(d => {
      const val = Math.ceil(total / d) * d;
      if (val > total) {
        shortcuts.add(val);
      }
    });

    // Add common large bills above total
    const commonBills = [100000, 200000, 500000, 1000000, 1500000, 2000000];
    commonBills.forEach(b => {
      if (b > total && b < total * 3) {
        shortcuts.add(b);
      }
    });

    return Array.from(shortcuts).sort((a, b) => a - b).slice(0, 5);
  }

  function renderShortcuts(total) {
    shortcutsRow.replaceChildren();
    const values = getShortcutValues(total);
    values.forEach(val => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "erp-btn erp-btn-secondary";
      btn.style.padding = "4px 8px";
      btn.style.fontSize = "11px";
      btn.style.fontWeight = "700";
      
      if (val === total) {
        btn.textContent = "Uang Pas";
        btn.style.borderColor = "var(--success)";
        btn.style.color = "var(--success)";
      } else {
        btn.textContent = formatCurrency(val);
      }

      btn.onclick = () => {
        cashInput.value = formatIndonesianNumber(val);
        recalculateChange(total);
      };
      shortcutsRow.appendChild(btn);
    });
  }

  function recalculateChange(total) {
    const cashText = cashInput.value;
    if (!cashText) {
      changeDisplay.textContent = "-";
      changeDisplay.style.color = "var(--muted)";
      button.disabled = false; // let them mark paid directly if they don't want to use calc
      return;
    }

    const cash = parseIndonesianNumber(cashText);
    const change = cash - total;

    if (change >= 0) {
      changeDisplay.textContent = formatCurrency(change);
      changeDisplay.style.color = "var(--success)";
      button.disabled = false;
    } else {
      changeDisplay.textContent = `Kurang ${formatCurrency(Math.abs(change))}`;
      changeDisplay.style.color = "var(--error)";
      button.disabled = true;
    }
  }

  // Promo / Voucher Input Group
  const promoContainer = document.createElement("div");
  promoContainer.style.display = "flex";
  promoContainer.style.flexDirection = "column";
  promoContainer.style.gap = "6px";
  promoContainer.style.marginTop = "4px";
  promoContainer.style.padding = "8px";
  promoContainer.style.backgroundColor = "rgba(255, 255, 255, 0.02)";
  promoContainer.style.border = "1px solid var(--border)";
  promoContainer.style.borderRadius = "6px";

  const promoLabel = document.createElement("span");
  promoLabel.style.fontSize = "12px";
  promoLabel.style.color = "var(--muted)";
  promoLabel.textContent = "Kode Promo / Voucher (Opsional):";

  const promoInputRow = document.createElement("div");
  promoInputRow.style.display = "flex";
  promoInputRow.style.gap = "8px";

  const promoInput = document.createElement("input");
  promoInput.type = "text";
  promoInput.className = "billing-payment-promo-input";
  promoInput.placeholder = "Masukkan kode...";
  promoInput.style.flex = "1";
  promoInput.style.padding = "6px";
  promoInput.style.fontSize = "12px";
  promoInput.style.backgroundColor = "var(--surface)";
  promoInput.style.color = "var(--text)";
  promoInput.style.border = "1px solid var(--border)";
  promoInput.style.borderRadius = "4px";
  promoInput.oninput = (e) => {
    e.target.value = e.target.value.toUpperCase().replace(/\s+/g, "");
  };

  const promoBtn = document.createElement("button");
  promoBtn.type = "button";
  promoBtn.className = "erp-btn erp-btn-secondary";
  promoBtn.style.padding = "6px 12px";
  promoBtn.style.fontSize = "12px";
  promoBtn.textContent = "Terapkan";

  const promoNotice = document.createElement("div");
  promoNotice.style.fontSize = "11px";
  promoNotice.style.marginTop = "4px";
  promoNotice.style.display = "none";

  let appliedPromoCode = "";
  let appliedDiscountVal = 0;

  const roomTotal = Number(transaction?.room_total || 0);
  const fnbTotal = Number(transaction?.fnb_total || 0);
  const lcTotal = Number(transaction?.lc_total || 0);

  let activeGrandTotal = roomTotal + fnbTotal + lcTotal;

  cashInput.oninput = (e) => {
    let cleanVal = e.target.value.replace(/\D/g, "");
    if (cleanVal) {
      e.target.value = formatIndonesianNumber(cleanVal);
    } else {
      e.target.value = "";
    }
    recalculateChange(activeGrandTotal);
  };

  select.onchange = () => {
    if (select.value === "cash") {
      calculatorContainer.style.display = "flex";
      cashInput.focus();
      recalculateChange(activeGrandTotal);
    } else {
      calculatorContainer.style.display = "none";
      button.disabled = false;
    }
  };

  promoBtn.onclick = async () => {
    const code = promoInput.value.trim().toUpperCase();
    if (!code) {
      appliedPromoCode = "";
      appliedDiscountVal = 0;
      promoInput.removeAttribute("data-applied-promo-code");
      promoNotice.style.color = "var(--muted)";
      promoNotice.textContent = "Kode dikosongkan.";
      promoNotice.style.display = "block";
      updateCheckoutTotals();
      return;
    }

    promoBtn.disabled = true;
    promoBtn.textContent = "⌛ Check...";

    try {
      if (!API_BASE_URL.trim()) {
        if (code === "MERDEKA50") {
          appliedPromoCode = code;
          appliedDiscountVal = Math.ceil(0.5 * roomTotal);
          promoNotice.style.color = "var(--success)";
          promoNotice.innerHTML = `✅ Terpasang (Mock): Diskon Room 50% (<strong>${formatCurrency(appliedDiscountVal)}</strong>)`;
        } else if (code === "VCH100K") {
          appliedPromoCode = code;
          appliedDiscountVal = Math.min(100000, roomTotal);
          promoNotice.style.color = "var(--success)";
          promoNotice.innerHTML = `✅ Terpasang (Mock): Potongan sewa room <strong>${formatCurrency(appliedDiscountVal)}</strong>`;
        } else {
          appliedPromoCode = "";
          appliedDiscountVal = 0;
          promoNotice.style.color = "var(--error)";
          promoNotice.textContent = `❌ Kode promo "${code}" tidak valid.`;
        }
        
        if (appliedPromoCode) {
          promoInput.setAttribute("data-applied-promo-code", appliedPromoCode);
        } else {
          promoInput.removeAttribute("data-applied-promo-code");
        }
        
        promoNotice.style.display = "block";
        updateCheckoutTotals();
        return;
      }

      const url = `${API_BASE_URL}?action=validatePromoCode&code=${code}&room_total=${roomTotal}`;
      const res = await fetchPeriodApiResponse(url);
      const data = await res.json();
      if (data && data.success) {
        appliedPromoCode = data.code;
        appliedDiscountVal = data.discount;
        promoInput.setAttribute("data-applied-promo-code", appliedPromoCode);
        promoNotice.style.color = "var(--success)";
        promoNotice.innerHTML = `✅ Terpasang: Potongan sewa room <strong>${formatCurrency(data.discount)}</strong>`;
        promoNotice.style.display = "block";
      } else {
        appliedPromoCode = "";
        appliedDiscountVal = 0;
        promoInput.removeAttribute("data-applied-promo-code");
        promoNotice.style.color = "var(--error)";
        promoNotice.textContent = `❌ ${data.error || "Kode tidak valid"}`;
        promoNotice.style.display = "block";
      }
    } catch (error) {
      console.error(error);
      promoNotice.style.color = "var(--error)";
      promoNotice.textContent = "❌ Gagal memvalidasi kode.";
      promoNotice.style.display = "block";
    } finally {
      promoBtn.disabled = false;
      promoBtn.textContent = "Terapkan";
      updateCheckoutTotals();
    }
  };

  function updateCheckoutTotals() {
    const discountedRoomTotal = Math.max(0, roomTotal - appliedDiscountVal);
    const newGrandTotal = discountedRoomTotal + fnbTotal + lcTotal;
    activeGrandTotal = newGrandTotal;

    const breakdownEl = payment.closest(".billing-summary")?.querySelector(".billing-breakdown");
    if (breakdownEl) {
      const rows = breakdownEl.children;
      if (rows && rows[0]) {
        rows[0].querySelector("p:last-child").textContent = formatCurrency(discountedRoomTotal);
      }
      if (rows && rows[rows.length - 1]) {
        rows[rows.length - 1].querySelector("p:last-child").textContent = formatCurrency(newGrandTotal);
      }
    }

    renderShortcuts(activeGrandTotal);
    recalculateChange(activeGrandTotal);
  }

  // Initialize shortcuts and change for initial grand total
  renderShortcuts(activeGrandTotal);
  recalculateChange(activeGrandTotal);

  promoInputRow.append(promoInput, promoBtn);
  promoContainer.append(promoLabel, promoInputRow, promoNotice);

  payment.append(headerRow, calculatorContainer, promoContainer);

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

function createLatestTransactionShortcutElement(transaction) {
  const shortcut = document.createElement("section");
  shortcut.className = "latest-transaction-shortcut";
  shortcut.dataset.transactionId = transaction?.transaction_id || "";
  shortcut.setAttribute("aria-labelledby", "latest-transaction-shortcut-title");

  const content = document.createElement("div");
  content.className = "latest-transaction-shortcut-content";

  const title = document.createElement("h2");
  title.id = "latest-transaction-shortcut-title";
  title.className = "latest-transaction-shortcut-title";
  title.textContent = "Transaksi Terakhir";

  const meta = document.createElement("p");
  meta.className = "latest-transaction-shortcut-meta";
  meta.textContent = [
    transaction?.room_name || transaction?.room_id || "-",
    formatCurrency(getTransactionFinalTotal(transaction)),
    getPaymentStatusLabel(transaction?.payment_status),
  ].join(" | ");

  const detail = document.createElement("p");
  detail.className = "latest-transaction-shortcut-detail";
  detail.textContent = `ID: ${transaction?.transaction_id || "-"} | Selesai: ${formatTransactionDateTime(transaction?.end_time || transaction?.created_at)}`;

  content.append(title, meta, detail);

  const actions = document.createElement("div");
  actions.className = "latest-transaction-shortcut-actions";

  const summaryButton = document.createElement("button");
  summaryButton.className = "latest-transaction-shortcut-button secondary";
  summaryButton.type = "button";
  summaryButton.dataset.action = "show-transaction-summary";
  summaryButton.dataset.transactionId = transaction?.transaction_id || "";
  summaryButton.textContent = "Lihat Ringkasan";

  const printButton = document.createElement("button");
  printButton.className = "latest-transaction-shortcut-button";
  printButton.type = "button";
  printButton.dataset.action = "show-receipt-print";
  printButton.dataset.transactionId = transaction?.transaction_id || "";
  printButton.textContent = "Cetak Struk";

  actions.append(summaryButton, printButton);
  shortcut.append(content, actions);

  return shortcut;
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
    ["Waktu Mulai", formatTransactionDateTime(transaction?.start_time)],
    ["Waktu Selesai", formatTransactionDateTime(transaction?.end_time)],
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

  const roomTotal = Number(transaction?.room_total) || 0;
  const promoDiscount = Number(transaction?.promo_discount) || 0;
  const originalRoomTotal = roomTotal + promoDiscount;

  const rows = [
    ["Biaya Room", formatCurrency(originalRoomTotal)],
  ];

  if (promoDiscount > 0) {
    rows.push([`Diskon (${transaction.promo_code})`, `-${formatCurrency(promoDiscount)}`]);
  }

  const lcTotal = Number(transaction?.lc_total || 0);
  if (lcTotal > 0) {
    rows.push(["Jasa LC", formatCurrency(lcTotal)]);
  }

  rows.push(["Total F&B", formatCurrency(getTransactionFnbTotal(transaction))]);
  rows.push(["Total Tagihan Akhir", formatCurrency(getTransactionFinalTotal(transaction)), "total"]);

  rows.forEach(([labelText, valueText, type]) => {
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
  const orders = getReceiptFnbOrders(transaction);

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
  const printAudit = getReceiptPrintAudit(transaction);
  const receiptData = buildReceiptData(transaction, {
    fnbOrders: getReceiptFnbOrders(transaction),
    print: printAudit,
  });
  const receipt = document.createElement("section");
  receipt.className = "receipt-print";
  receipt.setAttribute("aria-labelledby", "receipt-print-title");

  const header = document.createElement("header");
  header.className = "receipt-print-header";

  const brand = document.createElement("p");
  brand.className = "receipt-print-brand";
  brand.textContent = receiptData.business.name || "Karaoke POS";

  const title = document.createElement("h2");
  title.className = "receipt-print-title";
  title.id = "receipt-print-title";
  title.textContent = "Struk Tagihan";

  const meta = document.createElement("p");
  meta.className = "receipt-print-meta";
  meta.textContent = `ID Transaksi: ${receiptData.transaction.id || "-"} | Waktu: ${formatTransactionDateTime(receiptData.transaction.createdAt)} | Kasir: ${receiptData.transaction.cashierName || "-"}`;

  header.append(brand, title, meta);

  const reprintNotice = createReceiptReprintNoticeElement(receiptData.print);

  const roomRows = [
    ["Nama Ruangan", receiptData.room.name || receiptData.room.id || "-"],
    ["Waktu Mulai", formatTransactionDateTime(receiptData.room.startTime)],
    ["Waktu Selesai", formatTransactionDateTime(receiptData.room.endTime)],
    ["Durasi", `${receiptData.room.durationMinutes} menit`],
    ["Tarif per Jam", formatCurrency(receiptData.room.ratePerHour)],
  ];
  const basisLabel = getBillingBasisLabel(receiptData.room.billingBasis);

  if (basisLabel) {
    roomRows.push(["Dasar Tagihan", basisLabel]);
  }

  const roomSection = createReceiptSection("Informasi Ruangan", roomRows);

  const billingRows = [
    ["Biaya Room", formatCurrency(receiptData.totals.roomTotal)],
  ];

  const lcTotal = Number(transaction?.lc_total || 0);
  if (lcTotal > 0) {
    billingRows.push(["Jasa LC", formatCurrency(lcTotal)]);
  }

  billingRows.push(["Total F&B", formatCurrency(receiptData.totals.fnbTotal)]);
  billingRows.push(["Total Tagihan Akhir", formatCurrency(receiptData.totals.grandTotal), "total"]);

  const billingSection = createReceiptSection("Rincian Tagihan", billingRows);

  const paymentSection = createReceiptSection("Status Pembayaran", [
    ["Status", getPaymentStatusLabel(receiptData.payment.status)],
    ["Metode Pembayaran", formatPaymentMethodLabel(receiptData.payment.method)],
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

  const thermalPreviewButton = document.createElement("button");
  thermalPreviewButton.className = "receipt-print-button secondary";
  thermalPreviewButton.type = "button";
  thermalPreviewButton.dataset.action = "preview-thermal-receipt";
  thermalPreviewButton.textContent = "Preview Thermal";

  const thermalPrintButton = document.createElement("button");
  thermalPrintButton.className = "receipt-print-button secondary";
  thermalPrintButton.type = "button";
  thermalPrintButton.dataset.action = "print-thermal-receipt";
  thermalPrintButton.textContent = "Cetak Thermal";

  const closeButton = document.createElement("button");
  closeButton.className = "receipt-print-button secondary";
  closeButton.type = "button";
  closeButton.dataset.action = "hide-receipt-print";
  closeButton.textContent = "Tutup Preview";

  actions.append(printButton, thermalPreviewButton, thermalPrintButton, closeButton);
  receipt.append(
    header,
    reprintNotice,
    roomSection,
    billingSection,
    createReceiptFnbDetailElement(receiptData),
    paymentSection,
    footer,
    actions
  );

  return receipt;
}

function createReceiptReprintNoticeElement(printAudit) {
  if (!printAudit?.isReprint) {
    return document.createDocumentFragment();
  }

  const notice = document.createElement("section");
  notice.className = "receipt-print-reprint-notice";

  const title = document.createElement("p");
  title.className = "receipt-print-reprint-title";
  title.textContent = "*** CETAK ULANG ***";

  const detail = document.createElement("p");
  detail.className = "receipt-print-reprint-detail";
  detail.textContent = [
    `Cetak ulang ke-${Number(printAudit.reprintNumber) || 1}`,
    printAudit.printedAt ? `Waktu: ${formatTransactionDateTime(printAudit.printedAt)}` : "",
    printAudit.cashierName ? `Kasir: ${printAudit.cashierName}` : "",
  ].filter(Boolean).join(" | ");

  notice.append(title, detail);
  return notice;
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

function createReceiptFnbDetailElement(receiptData) {
  const section = document.createElement("section");
  section.className = "receipt-print-section receipt-print-fnb";

  const title = document.createElement("h3");
  title.className = "receipt-print-section-title";
  title.textContent = "Detail F&B";

  section.appendChild(title);

  if (!receiptData.fnb.hasFnb) {
    const empty = document.createElement("p");
    empty.className = "receipt-print-note";
    empty.textContent = "Tidak ada pesanan F&B.";
    section.appendChild(empty);
    return section;
  }

  const orders = receiptData.fnb.orders;

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
    orderTitle.textContent = `${order?.id || "-"} - ${formatCurrency(order?.total)}`;

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
      name.textContent = item?.name || "-";

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

function getOpenFnbOrdersForRoom(room) {
  if (room.status !== "occupied" || !room.start_time) {
    return [];
  }
  const roomStartTime = formatJakartaIsoString(room.start_time);
  return openFnbOrders.filter((order) => {
    return (
      order.room_id === room.room_id &&
      formatJakartaIsoString(order.room_start_time) === roomStartTime &&
      order.order_status === "open"
    );
  });
}

function createRoomOpenFnbBreakdownElement(openOrders) {
  const container = document.createElement("div");
  container.className = "room-card-fnb-breakdown";
  container.style.marginTop = "8px";
  container.style.padding = "6px 8px";
  container.style.backgroundColor = "rgba(0, 0, 0, 0.25)";
  container.style.borderRadius = "6px";
  container.style.border = "1px solid rgba(255, 255, 255, 0.08)";
  container.style.fontSize = "0.78rem";

  const title = document.createElement("div");
  title.style.fontWeight = "bold";
  title.style.color = "rgba(255, 255, 255, 0.85)";
  title.style.marginBottom = "4px";
  title.style.display = "flex";
  title.style.justifyContent = "space-between";
  title.style.alignItems = "center";
  title.innerHTML = `<span>🍽️ Rincian F&B:</span>`;

  container.appendChild(title);

  const itemsList = document.createElement("div");
  itemsList.style.display = "flex";
  itemsList.style.flexDirection = "column";
  itemsList.style.gap = "2px";
  itemsList.style.color = "rgba(255, 255, 255, 0.7)";

  const aggregatedItems = {};
  let totalFbAmount = 0;

  openOrders.forEach((order) => {
    (order.items || []).forEach((item) => {
      const name = item.menu_name || "-";
      const qty = Number(item.quantity) || 0;
      const price = Number(item.price) || 0;
      if (!aggregatedItems[name]) {
        aggregatedItems[name] = { quantity: 0, price: price };
      }
      aggregatedItems[name].quantity += qty;
      totalFbAmount += qty * price;
    });
  });

  Object.entries(aggregatedItems).forEach(([name, data]) => {
    const itemRow = document.createElement("div");
    itemRow.style.display = "flex";
    itemRow.style.justifyContent = "space-between";

    const nameSpan = document.createElement("span");
    nameSpan.textContent = name;
    nameSpan.style.whiteSpace = "nowrap";
    nameSpan.style.overflow = "hidden";
    nameSpan.style.textOverflow = "ellipsis";
    nameSpan.style.maxWidth = "130px";

    const detailsSpan = document.createElement("span");
    detailsSpan.textContent = `${data.quantity}x ${formatCurrency(data.price)}`;
    detailsSpan.style.color = "rgba(255, 255, 255, 0.5)";

    itemRow.append(nameSpan, detailsSpan);
    itemsList.appendChild(itemRow);
  });

  container.appendChild(itemsList);

  const divider = document.createElement("div");
  divider.style.height = "1px";
  divider.style.backgroundColor = "rgba(255, 255, 255, 0.1)";
  divider.style.margin = "4px 0";
  container.appendChild(divider);

  const footer = document.createElement("div");
  footer.style.display = "flex";
  footer.style.justifyContent = "space-between";
  footer.style.fontWeight = "bold";
  footer.style.color = "#10b981";

  const footerLabel = document.createElement("span");
  footerLabel.textContent = "Total F&B:";
  const footerVal = document.createElement("span");
  footerVal.textContent = formatCurrency(totalFbAmount);

  footer.append(footerLabel, footerVal);
  container.appendChild(footer);

  return container;
}

function createRoomCard(room) {
  const card = document.createElement("article");
  card.className = `room-card ${getStatusClass(room.status)}`;
  card.dataset.roomId = room.room_id;

  if (room.status === "occupied" && room.scheduled_end_time) {
    applyRoomTimeVisualState(card, getRoomTimeState(room).status);
  }

  const statusLabel = getStatusLabel(room.status);
  let sessionButtonLabel = getSessionButtonLabel(room.status);
  if (room.status === "waiting_payment") {
    if (getCurrentOperatorRole() === "receptionist") {
      sessionButtonLabel = "Detail / Batal";
    } else {
      sessionButtonLabel = "Bayar & Mulai";
    }
  }

  const topLine = document.createElement("div");
  topLine.className = "room-topline";

  const name = document.createElement("h2");
  name.className = "room-name";
  name.textContent = room.room_name;

  const status = document.createElement("span");
  status.className = withStatusBadge("room-status", getRoomStatusTone(room.status));
  status.textContent = statusLabel;

  if (room.status === "occupied") {
    const openBillBadge = document.createElement("span");
    openBillBadge.className = "room-status-badge open-bill-badge";
    openBillBadge.style.backgroundColor = "rgba(124, 58, 237, 0.15)";
    openBillBadge.style.color = "#a78bfa";
    openBillBadge.style.fontSize = "11px";
    openBillBadge.style.padding = "2px 6px";
    openBillBadge.style.borderRadius = "4px";
    openBillBadge.style.border = "1px solid rgba(124, 58, 237, 0.3)";
    openBillBadge.style.fontWeight = "bold";
    openBillBadge.textContent = "Open Bill";
    topLine.append(name, status, openBillBadge);
  } else {
    topLine.append(name, status);
  }

  const meta = document.createElement("div");
  meta.className = "room-meta";

  if (room.status === "occupied") {
    meta.appendChild(createRoomBookingInfoElement(room));
    const openOrders = getOpenFnbOrdersForRoom(room);
    if (openOrders.length > 0) {
      meta.appendChild(createRoomOpenFnbBreakdownElement(openOrders));
    }
  } else if (room.status === "waiting_payment" || room.status === "paid_waiting_start") {
    meta.appendChild(createRoomWaitingPaymentInfoElement(room));
  } else if (room.status === "cleaning") {
    meta.appendChild(createRoomOperationalStatusInfoElement(room.status));
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
  rate.textContent = getRoomPriceLabel(room);

  meta.appendChild(rate);

  const actions = document.createElement("div");
  actions.className = "room-actions";

  const sessionButton = document.createElement("button");
  sessionButton.className = "room-button";
  sessionButton.type = "button";
  sessionButton.dataset.action = "toggle-session";
  sessionButton.textContent = sessionButtonLabel;
  sessionButton.disabled = isPreparingRoomSession || isActivatingPreparedSession;

  if (room.status === "occupied") {
    actions.classList.add("room-actions-occupied");

    const extendButton = document.createElement("button");
    extendButton.className = "room-button room-button-extend";
    extendButton.type = "button";
    extendButton.dataset.action = "show-extend-selection";
    extendButton.textContent = isExtendingSession ? "Menambah..." : "Tambah Waktu";

    const selectLcButton = document.createElement("button");
    selectLcButton.className = "room-button room-button-lc";
    selectLcButton.type = "button";
    selectLcButton.dataset.action = "show-lc-selection";
    selectLcButton.textContent = "Pilih LC";

    actions.append(sessionButton, extendButton, selectLcButton);
  } else {
    actions.append(sessionButton);
  }

  const isDurationActive = durationSelectionRoomId === room.room_id && room.status === "available";
  const isPaymentActive = paymentSelectionRoomId === room.room_id && room.status === "waiting_payment";
  const isExtendActive = extendSelectionRoomId === room.room_id && room.status === "occupied";
  const isLcActive = lcSelectionRoomId === room.room_id && room.status === "occupied";

  if (isDurationActive) {
    card.appendChild(createDurationSelectionElement(room));
  } else if (isPaymentActive) {
    card.appendChild(createPaymentSelectionElement(room));
  } else if (isExtendActive) {
    card.appendChild(createExtendSelectionElement(room));
  } else if (isLcActive) {
    card.appendChild(createSelectLcModalOverlay(room));
  } else {
    card.append(topLine, meta, actions);
  }

  return card;
}

function createRoomOperationalStatusInfoElement(status) {
  const info = document.createElement("div");
  info.className = "room-booking-info room-operational-info";

  const title = document.createElement("p");
  title.className = "room-booking-row";

  const label = document.createElement("span");
  label.className = "room-booking-label";
  label.textContent = "Status:";

  const value = document.createElement("span");
  value.className = "room-booking-value";
  value.textContent = getStatusLabel(status);

  title.append(label, value);

  const helper = document.createElement("p");
  helper.className = "room-operational-helper";
  helper.textContent = status === "paid_waiting_start"
    ? "Sudah dibayar, menunggu room dan perangkat siap sebelum countdown dimulai."
    : "Room sedang dibersihkan dan belum bisa dijual kembali.";

  info.append(title, helper);
  return info;
}

function createRoomWaitingPaymentInfoElement(room) {
  const info = document.createElement("div");
  info.className = "room-booking-info";

  const items = [
    ["Pelanggan", room.customer_name || "-"],
  ];
  if (room.package_id) {
    const pkg = packages.find(p => p.package_id === room.package_id);
    items.push(["Paket", pkg ? pkg.package_name : room.package_id]);
  } else {
    items.push(["Durasi", `${room.booked_duration_minutes || "-"} menit (Regular)`]);
  }

  items.forEach(([labelText, valueText]) => {
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

  return info;
}

function createRoomBookingInfoElement(room) {
  const info = document.createElement("div");
  info.className = "room-booking-info";
  const timeState = getRoomTimeState(room);
  const roomPackage = getPackageForRoom(room);

  const rows = [
    ["Durasi", formatDurationMinutes(room.booked_duration_minutes)],
    ["Mulai", getRoomTimeLabel(room.start_time)],
    ["Selesai", getRoomTimeLabel(room.scheduled_end_time)],
  ];

  if (room.package_id) {
    rows.unshift(["Paket", roomPackage ? roomPackage.package_name : room.package_id]);
  }

  const lcIds = String(room.lc_ids || "").trim();
  if (lcIds) {
    const ids = lcIds.split(",").map(id => id.trim()).filter(Boolean);
    const pendingCount = ids.filter(id => id === "PENDING").length;
    const resolvedIds = ids.filter(id => id !== "PENDING");
    
    let displayStr = "";
    if (pendingCount > 0) {
      const resolvedNames = resolvedIds.map(id => {
        const found = lcs.find(l => l.lc_id === id);
        return found ? found.lc_name : id.replace("LC-", "");
      });
      const parts = [];
      if (resolvedNames.length > 0) {
        parts.push(resolvedNames.join(", "));
      }
      parts.push(`${pendingCount} Orang (Belum Dipilih)`);
      displayStr = parts.join(" + ");
    } else {
      displayStr = resolvedIds.map(id => {
        const found = lcs.find(l => l.lc_id === id);
        return found ? found.lc_name : id.replace("LC-", "");
      }).join(", ");
    }
    
    rows.push(["LC Sesi", displayStr]);
  }

  rows.forEach(([labelText, valueText]) => {
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
  title.textContent = `Pilih durasi/paket untuk ${room.room_name}`;

  // Customer Name input
  const nameField = document.createElement("div");
  nameField.style.display = "flex";
  nameField.style.flexDirection = "column";
  nameField.style.gap = "4px";

  const nameLabel = document.createElement("span");
  nameLabel.className = "duration-payment-label";
  nameLabel.textContent = "Nama Pelanggan:";

  const nameInput = document.createElement("input");
  nameInput.className = "duration-custom-input";
  nameInput.type = "text";
  nameInput.placeholder = "Nama Pelanggan (Opsional)";
  nameInput.dataset.action = "update-customer-name";
  nameInput.value = customerNameInput;

  nameField.append(nameLabel, nameInput);
  panel.appendChild(nameField);

  // Lady Companion (LC) Selection
  const lcField = document.createElement("div");
  lcField.style.display = "flex";
  lcField.style.flexDirection = "column";
  lcField.style.gap = "4px";
  lcField.style.marginTop = "8px";

  const lcLabel = document.createElement("span");
  lcLabel.className = "duration-payment-label";
  lcLabel.textContent = "Jumlah LC (Orang):";

  const lcSelect = document.createElement("select");
  lcSelect.className = "duration-payment-select";
  lcSelect.style.width = "100%";

  ensureLcSelectionStateForRoom(room);
  const activeLcIds = selectedLcIdsForRoom[room.room_id] || [];
  const currentLcCount = activeLcIds.length;

  for (let i = 0; i <= 10; i++) {
    const opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = i === 0 ? "Tanpa LC" : `${i} Orang`;
    opt.selected = currentLcCount === i;
    lcSelect.appendChild(opt);
  }

  lcSelect.onchange = (e) => {
    const count = parseInt(e.target.value) || 0;
    const placeholderArray = [];
    for (let i = 0; i < count; i++) {
      placeholderArray.push("PENDING");
    }
    selectedLcIdsForRoom[room.room_id] = placeholderArray;
    renderRooms();
  };

  lcField.append(lcLabel, lcSelect);

  if (currentLcCount > 0) {
    const durationLabel = document.createElement("span");
    durationLabel.className = "duration-payment-label";
    durationLabel.textContent = "Durasi LC:";

    const durationInput = document.createElement("input");
    durationInput.className = "duration-custom-input";
    durationInput.type = "number";
    durationInput.min = "1";
    durationInput.step = "1";
    durationInput.value = String(getLcDurationForRoom(room, "PENDING"));
    durationInput.placeholder = "Menit";
    durationInput.onchange = (e) => {
      setLcDurationForRoom(room, "PENDING", e.target.value);
      renderRooms();
    };

    const durationHint = document.createElement("span");
    durationHint.style.fontSize = "0.75rem";
    durationHint.style.color = "rgba(255, 255, 255, 0.55)";
    durationHint.textContent = `Untuk ${currentLcCount} LC pending. Isi menit, contoh 60 = 1 jam.`;

    lcField.append(durationLabel, durationInput, durationHint);
  }

  panel.appendChild(lcField);

  // F&B Selection Section
  const fnbField = document.createElement("div");
  fnbField.style.display = "flex";
  fnbField.style.flexDirection = "column";
  fnbField.style.gap = "6px";
  fnbField.style.marginTop = "8px";
  fnbField.style.padding = "8px";
  fnbField.style.backgroundColor = "rgba(255, 255, 255, 0.03)";
  fnbField.style.borderRadius = "6px";
  fnbField.style.border = "1px dashed rgba(255, 255, 255, 0.1)";

  const fnbHeader = document.createElement("div");
  fnbHeader.style.display = "flex";
  fnbHeader.style.justifyContent = "space-between";
  fnbHeader.style.alignItems = "center";

  const fnbLabel = document.createElement("span");
  fnbLabel.className = "duration-payment-label";
  fnbLabel.style.fontWeight = "bold";
  fnbLabel.textContent = "Pesanan F&B (Optional):";

  const addFnbButton = document.createElement("button");
  addFnbButton.className = "room-button";
  addFnbButton.type = "button";
  addFnbButton.style.padding = "4px 8px";
  addFnbButton.style.fontSize = "0.75rem";
  addFnbButton.style.backgroundColor = "var(--available)";
  addFnbButton.style.color = "#fff";
  addFnbButton.style.border = "none";
  addFnbButton.style.borderRadius = "4px";
  addFnbButton.textContent = bookingCartItems.length > 0 ? "✏️ Ubah F&B" : "➕ Tambah F&B";
  addFnbButton.onclick = () => {
    showBookingFnbSelectorModal(room, "booking");
  };

  fnbHeader.append(fnbLabel, addFnbButton);
  fnbField.appendChild(fnbHeader);

  if (bookingCartItems.length > 0) {
    const fnbList = document.createElement("div");
    fnbList.style.display = "flex";
    fnbList.style.flexDirection = "column";
    fnbList.style.gap = "4px";
    fnbList.style.marginTop = "4px";
    fnbList.style.fontSize = "0.8rem";
    fnbList.style.color = "rgba(255, 255, 255, 0.7)";

    let totalAmount = 0;
    bookingCartItems.forEach((cartItem) => {
      const itemRow = document.createElement("div");
      itemRow.style.display = "flex";
      itemRow.style.justifyContent = "space-between";
      
      const itemText = document.createElement("span");
      itemText.textContent = `${cartItem.menu_name} x${cartItem.quantity}`;
      
      const itemPrice = document.createElement("span");
      const itemSubtotal = cartItem.price * cartItem.quantity;
      totalAmount += itemSubtotal;
      itemPrice.textContent = formatCurrency(itemSubtotal);
      
      itemRow.append(itemText, itemPrice);
      fnbList.appendChild(itemRow);
    });

    const divider = document.createElement("div");
    divider.style.height = "1px";
    divider.style.backgroundColor = "rgba(255, 255, 255, 0.1)";
    divider.style.margin = "4px 0";

    const totalRow = document.createElement("div");
    totalRow.style.display = "flex";
    totalRow.style.justifyContent = "space-between";
    totalRow.style.fontWeight = "bold";
    totalRow.style.color = "var(--color-success)";

    const totalLabel = document.createElement("span");
    totalLabel.textContent = "Total F&B:";
    const totalVal = document.createElement("span");
    totalVal.textContent = formatCurrency(totalAmount);

    totalRow.append(totalLabel, totalVal);
    
    // Hapus button
    const clearButton = document.createElement("button");
    clearButton.type = "button";
    clearButton.style.background = "none";
    clearButton.style.border = "none";
    clearButton.style.color = "var(--occupied)";
    clearButton.style.fontSize = "0.75rem";
    clearButton.style.cursor = "pointer";
    clearButton.style.alignSelf = "flex-end";
    clearButton.style.padding = "0";
    clearButton.style.marginTop = "2px";
    clearButton.textContent = "🗑️ Bersihkan F&B";
    clearButton.onclick = () => {
      bookingCartItems = [];
      renderRooms();
    };

    fnbList.append(divider, totalRow, clearButton);
    fnbField.appendChild(fnbList);
  } else {
    const emptyNote = document.createElement("span");
    emptyNote.style.fontSize = "0.75rem";
    emptyNote.style.color = "rgba(255, 255, 255, 0.4)";
    emptyNote.textContent = "Belum ada pesanan makanan/minuman.";
    fnbField.appendChild(emptyNote);
  }

  panel.appendChild(fnbField);

  // Booking Type select
  const typeField = document.createElement("div");
  typeField.style.display = "flex";
  typeField.style.flexDirection = "column";
  typeField.style.gap = "4px";

  const typeLabel = document.createElement("span");
  typeLabel.className = "duration-payment-label";
  typeLabel.textContent = "Jenis Booking:";

  const typeSelect = document.createElement("select");
  typeSelect.className = "duration-payment-select";
  typeSelect.style.width = "100%";
  
  [
    ["regular", "Regular (Jam/Menit)"],
    ["package", "Paket F&B All-In"],
  ].forEach(([val, label]) => {
    const opt = document.createElement("option");
    opt.value = val;
    opt.textContent = label;
    opt.selected = bookingTypeSelection === val;
    typeSelect.appendChild(opt);
  });

  typeSelect.onchange = (e) => {
    bookingTypeSelection = e.target.value;
    renderRooms();
  };

  typeField.append(typeLabel, typeSelect);
  panel.appendChild(typeField);

  if (bookingTypeSelection === "package") {
    // Package selector
    const pkgField = document.createElement("div");
    pkgField.style.display = "flex";
    pkgField.style.flexDirection = "column";
    pkgField.style.gap = "4px";

    const pkgLabel = document.createElement("span");
    pkgLabel.className = "duration-payment-label";
    pkgLabel.textContent = "Pilih Paket Karaoke:";

    const pkgSelect = document.createElement("select");
    pkgSelect.className = "duration-payment-select";
    pkgSelect.style.width = "100%";

    packages.forEach((pkg) => {
      const opt = document.createElement("option");
      opt.value = pkg.package_id;
      opt.textContent = `${pkg.package_name} (${formatCurrency(pkg.selling_price)} - ${pkg.duration_minutes}m)`;
      opt.selected = bookingPackageSelection === pkg.package_id;
      pkgSelect.appendChild(opt);
    });

    if (packages.length > 0 && !bookingPackageSelection) {
      bookingPackageSelection = packages[0].package_id;
    }

    pkgSelect.onchange = (e) => {
      bookingPackageSelection = e.target.value;
    };

    pkgField.append(pkgLabel, pkgSelect);
    panel.appendChild(pkgField);

    const savePkgButton = document.createElement("button");
    savePkgButton.className = "duration-custom-button";
    savePkgButton.type = "button";
    savePkgButton.style.backgroundColor = "var(--color-success)";
    savePkgButton.style.color = "#fff";
    savePkgButton.style.width = "100%";
    savePkgButton.disabled = isPreparingRoomSession;
    savePkgButton.textContent = isPreparingRoomSession ? "Menyimpan..." : "Simpan Booking Paket";
    savePkgButton.onclick = async () => {
      const selectedPkgId = pkgSelect.value || bookingPackageSelection;
      const selectedPkg = packages.find(p => p.package_id === selectedPkgId);
      if (selectedPkg) {
        const activeLcIds = (selectedLcIdsForRoom[room.room_id] || []).join(",");
        await prepareRoomSession(room.room_id, selectedPkg.duration_minutes, customerNameInput, selectedPkgId, activeLcIds);
        customerNameInput = "";
        bookingTypeSelection = "regular";
        delete selectedLcIdsForRoom[room.room_id];
        delete selectedLcDurationsForRoom[room.room_id];
      } else {
        showInlineNotice("Pilih paket terlebih dahulu.", "error");
      }
    };

    savePkgButton.style.backgroundColor = "var(--available)";
    savePkgButton.style.color = "#ffffff";
    savePkgButton.style.fontWeight = "800";
    savePkgButton.style.boxShadow = "0 4px 12px rgba(53, 183, 121, 0.25)";
    panel.appendChild(savePkgButton);
  } else {
    // Regular durations selector
    const options = document.createElement("div");
    options.className = "duration-options";

    const durationOptions = canUseDevShortSessions()
      ? [
          [1, "1 menit"],
          [5, "5 menit"],
          [10, "10 menit"],
          [60, "1 jam"],
          [120, "2 jam"],
          [180, "3 jam"],
        ]
      : [
          [60, "1 jam"],
          [120, "2 jam"],
          [180, "3 jam"],
        ];

    durationOptions.forEach(([minutes, labelText]) => {
      const button = document.createElement("button");
      button.className = "duration-option-button";
      button.type = "button";
      button.dataset.action = "prepare-room-session-duration";
      button.dataset.roomId = room.room_id;
      button.dataset.durationMinutes = String(minutes);
      button.disabled = isPreparingRoomSession;
      button.textContent = isPreparingRoomSession ? "Menyiapkan..." : labelText;
      options.appendChild(button);
    });

    const custom = document.createElement("div");
    custom.className = "duration-custom";

    const input = document.createElement("input");
    input.className = "duration-custom-input";
    input.type = "number";
    input.min = String(getMinimumSessionMinutes());
    input.step = "1";
    input.placeholder = "Custom mnt";
    input.dataset.action = "update-custom-duration";
    input.value = customDurationMinutes;
    input.disabled = isPreparingRoomSession;

    const customButton = document.createElement("button");
    customButton.className = "duration-custom-button";
    customButton.type = "button";
    customButton.dataset.action = "prepare-room-session-custom-duration";
    customButton.dataset.roomId = room.room_id;
    customButton.disabled = isPreparingRoomSession;
    customButton.style.backgroundColor = "var(--available)";
    customButton.style.color = "#ffffff";
    customButton.style.fontWeight = "800";
    customButton.style.boxShadow = "0 4px 12px rgba(53, 183, 121, 0.25)";
    customButton.textContent = isPreparingRoomSession ? "Menyiapkan..." : "Custom";

    custom.append(input, customButton);
    panel.append(options, custom);
  }

  const cancelButton = document.createElement("button");
  cancelButton.className = "duration-cancel-button";
  cancelButton.type = "button";
  cancelButton.dataset.action = "cancel-duration-selection";
  cancelButton.disabled = isPreparingRoomSession;
  cancelButton.style.backgroundColor = "rgba(255,255,255,0.1)";
  cancelButton.style.color = "#ffffff";
  cancelButton.textContent = "Batal";

  panel.appendChild(cancelButton);

  return panel;
}

let currentBookingFnbModalSearchQuery = "";
let currentBookingFnbModalMainTab = "all"; // "all", "favorites", "makanan", "minuman", "rokok"
let currentBookingFnbModalSubTab = "all";  // "all" or specific category e.g. "Beverage", "Beer", "Spirit", "Anggur"
let currentBookingFnbModalSpiritFilter = "all";

function showBookingFnbSelectorModal(room, targetCartType) {
  // Reset modal state variables on open
  currentBookingFnbModalSearchQuery = "";
  currentBookingFnbModalMainTab = "all";
  currentBookingFnbModalSubTab = "all";
  currentBookingFnbModalSpiritFilter = "all";

  console.log("showBookingFnbSelectorModal: Open for room", room.room_id, "Target:", targetCartType, "menuItems count:", menuItems.length);

  // targetCartType is either "booking" or "prepay"
  const cart = targetCartType === "booking" ? bookingCartItems : prepayCartItems;

  const modalOverlay = document.createElement("div");
  modalOverlay.className = "admin-pin-modal-overlay"; // reuse overlay styling for modal
  modalOverlay.style.position = "fixed";
  modalOverlay.style.top = "0";
  modalOverlay.style.left = "0";
  modalOverlay.style.width = "100%";
  modalOverlay.style.height = "100%";
  modalOverlay.style.backgroundColor = "rgba(0, 0, 0, 0.7)";
  modalOverlay.style.zIndex = "1000";
  modalOverlay.style.display = "flex";
  modalOverlay.style.alignItems = "center";
  modalOverlay.style.justifyContent = "center";

  const modalContainer = document.createElement("div");
  modalContainer.className = "admin-pin-modal";
  modalContainer.style.width = "90vw";
  modalContainer.style.maxWidth = "1000px";
  modalContainer.style.height = "85vh";
  modalContainer.style.display = "flex";
  modalContainer.style.flexDirection = "column";
  modalContainer.style.padding = "20px";
  modalContainer.style.backgroundColor = "var(--color-bg-lounge, #1a1a2e)";
  modalContainer.style.border = "1px solid rgba(255, 255, 255, 0.1)";

  // Header
  const header = document.createElement("div");
  header.style.display = "flex";
  header.style.justifyContent = "space-between";
  header.style.alignItems = "center";
  header.style.marginBottom = "15px";

  const title = document.createElement("h3");
  title.style.margin = "0";
  title.style.fontSize = "1.5rem";
  title.style.color = "#ffffff";
  title.textContent = `POS F&B - Booking ${room.room_name}`;

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.style.background = "none";
  closeBtn.style.border = "none";
  closeBtn.style.color = "#ffffff";
  closeBtn.style.fontSize = "1.5rem";
  closeBtn.style.cursor = "pointer";
  closeBtn.textContent = "✕";
  closeBtn.onclick = () => {
    modalOverlay.remove();
  };

  header.append(title, closeBtn);
  modalContainer.appendChild(header);

  // Content Area (Two Columns)
  const body = document.createElement("div");
  body.style.display = "flex";
  body.style.flex = "1";
  body.style.gap = "20px";
  body.style.overflow = "hidden";
  body.style.minHeight = "0"; // crucial for nested scroll behavior

  // Left Column (Catalog)
  const catalogCol = document.createElement("div");
  catalogCol.style.flex = "7";
  catalogCol.style.display = "flex";
  catalogCol.style.flexDirection = "column";
  catalogCol.style.overflow = "hidden";
  catalogCol.style.minHeight = "0";

  // Right Column (Cart)
  const cartCol = document.createElement("div");
  cartCol.style.flex = "3";
  cartCol.style.display = "flex";
  cartCol.style.flexDirection = "column";
  cartCol.style.backgroundColor = "rgba(255, 255, 255, 0.02)";
  cartCol.style.borderRadius = "8px";
  cartCol.style.padding = "15px";
  cartCol.style.overflow = "hidden";
  cartCol.style.minHeight = "0";

  body.append(catalogCol, cartCol);
  modalContainer.appendChild(body);
  modalOverlay.appendChild(modalContainer);
  document.body.appendChild(modalOverlay);

  // Render POS Catalog and Cart inside modal
  const renderModalCatalog = () => {
    catalogCol.innerHTML = "";

    // Search bar
    const searchBar = document.createElement("input");
    searchBar.className = "menu-search";
    searchBar.style.marginBottom = "10px";
    searchBar.placeholder = "Cari item: bintang, fries, soju, marlboro...";
    searchBar.value = currentBookingFnbModalSearchQuery;
    searchBar.oninput = (e) => {
      currentBookingFnbModalSearchQuery = e.target.value;
      updateFilteredList();
    };
    catalogCol.appendChild(searchBar);

    // Main Tabs Container
    const mainTabsContainer = document.createElement("div");
    mainTabsContainer.className = "menu-category-filter";
    mainTabsContainer.style.marginBottom = "10px";
    mainTabsContainer.style.borderBottom = "2px solid rgba(255, 255, 255, 0.1)";

    const mainTabs = [
      { id: "all", label: "Semua", icon: "🌐" },
      { id: "favorites", label: "Terlaris", icon: "⭐" },
      { id: "makanan", label: "Makanan", icon: "🍔" },
      { id: "minuman", label: "Minuman", icon: "🍹" },
      { id: "rokok", label: "Rokok & Lainnya", icon: "🚬" },
    ];

    mainTabs.forEach((tab) => {
      const button = document.createElement("button");
      button.className = tab.id === currentBookingFnbModalMainTab ? "menu-category-button active" : "menu-category-button";
      button.style.padding = "10px 15px";
      button.style.fontSize = "0.9rem";
      button.textContent = `${tab.icon} ${tab.label}`;
      button.onclick = () => {
        currentBookingFnbModalMainTab = tab.id;
        currentBookingFnbModalSubTab = "all"; // reset sub tab
        currentBookingFnbModalSpiritFilter = "all"; // reset spirit filter
        renderModalCatalog();
      };
      mainTabsContainer.appendChild(button);
    });
    catalogCol.appendChild(mainTabsContainer);

    // Sub Tabs Container (only shown if needed, e.g., for Minuman)
    if (currentBookingFnbModalMainTab === "minuman") {
      const subTabsContainer = document.createElement("div");
      subTabsContainer.className = "menu-category-filter";
      subTabsContainer.style.marginBottom = "10px";
      subTabsContainer.style.padding = "4px 0";

      const subTabs = [
        { id: "all", label: "Semua Minuman" },
        { id: "Beverage", label: "Soft Drink" },
        { id: "Beer", label: "Bir" },
        { id: "Spirit", label: "Spirit / Liquors" },
        { id: "Anggur", label: "Wine / Anggur" },
      ];

      subTabs.forEach((tab) => {
        const button = document.createElement("button");
        button.className = tab.id === currentBookingFnbModalSubTab ? "menu-category-button active" : "menu-category-button";
        button.style.padding = "6px 12px";
        button.style.fontSize = "0.8rem";
        button.textContent = tab.label;
        button.onclick = () => {
          currentBookingFnbModalSubTab = tab.id;
          currentBookingFnbModalSpiritFilter = "all"; // reset spirit filter
          renderModalCatalog();
        };
        subTabsContainer.appendChild(button);
      });
      catalogCol.appendChild(subTabsContainer);
    }

    // Spirit Sub-classification (if Minuman -> Spirit is active)
    if (currentBookingFnbModalMainTab === "minuman" && currentBookingFnbModalSubTab === "Spirit") {
      const spiritContainer = document.createElement("div");
      spiritContainer.className = "menu-category-filter spirit-filter";
      spiritContainer.style.marginBottom = "10px";
      spiritContainer.style.padding = "2px 0";

      const subcategories = ["all", ...FNB_SPIRIT_SUBCATEGORY_ORDER];
      subcategories.forEach((sub) => {
        const button = document.createElement("button");
        button.className = sub === currentBookingFnbModalSpiritFilter ? "menu-category-button active" : "menu-category-button";
        button.style.padding = "4px 10px";
        button.style.fontSize = "0.75rem";
        button.textContent = sub === "all" ? "Semua Spirit" : sub;
        button.onclick = () => {
          currentBookingFnbModalSpiritFilter = sub;
          renderModalCatalog();
        };
        spiritContainer.appendChild(button);
      });
      catalogCol.appendChild(spiritContainer);
    }

    // Menu list scroll area
    const listScroll = document.createElement("div");
    listScroll.className = "menu-list";
    listScroll.style.flex = "1";
    listScroll.style.overflowY = "auto";
    listScroll.style.minHeight = "0"; // prevent flexbox layout break
    listScroll.style.display = "flex";
    listScroll.style.flexWrap = "wrap";
    listScroll.style.gap = "12px";
    listScroll.style.padding = "10px 5px";
    listScroll.style.alignContent = "start"; // avoid vertical stretching

    catalogCol.appendChild(listScroll);

    const updateFilteredList = () => {
      listScroll.innerHTML = "";
      
      let filtered = menuItems;

      // Filter by Search
      if (currentBookingFnbModalSearchQuery.trim()) {
        const query = currentBookingFnbModalSearchQuery.toLowerCase().trim();
        filtered = filtered.filter(item => 
          String(item.menu_name || "").toLowerCase().includes(query) ||
          String(item.category || "").toLowerCase().includes(query) ||
          String(item.subcategory || "").toLowerCase().includes(query)
        );
      }

      // Filter by Main Group Tab
      if (currentBookingFnbModalMainTab === "favorites") {
        filtered = filtered.filter(item => isFavoriteFnbMenuItem(item));
      } else if (currentBookingFnbModalMainTab === "makanan") {
        filtered = filtered.filter(item => String(item.category || "").trim().toLowerCase() === "food");
      } else if (currentBookingFnbModalMainTab === "minuman") {
        const minumanCats = ["beverage", "beer", "spirit", "anggur"];
        filtered = filtered.filter(item => minumanCats.includes(String(item.category || "").trim().toLowerCase()));
        
        // Filter by Sub Tab
        if (currentBookingFnbModalSubTab !== "all") {
          filtered = filtered.filter(item => String(item.category || "").trim().toLowerCase() === currentBookingFnbModalSubTab.toLowerCase());
        }

        // Filter by Spirit classification
        if (currentBookingFnbModalSubTab === "Spirit" && currentBookingFnbModalSpiritFilter !== "all") {
          filtered = filtered.filter(item => {
            const itemSub = String(item.subcategory || "").trim().toLowerCase();
            const targetSub = currentBookingFnbModalSpiritFilter.trim().toLowerCase();
            return itemSub === targetSub;
          });
        }
      } else if (currentBookingFnbModalMainTab === "rokok") {
        filtered = filtered.filter(item => String(item.category || "").trim().toLowerCase() === "cigarette");
      }

      if (filtered.length === 0) {
        listScroll.appendChild(createStateMessage("Item tidak ditemukan."));
        return;
      }

      filtered.forEach((menuItem) => {
        const card = createMenuCardElement(menuItem);
        
        // Inline Reset Styles to ensure absolute visual consistency and prevent overlap
        card.style.display = "flex";
        card.style.flexDirection = "column";
        card.style.justifyContent = "space-between";
        card.style.position = "relative";
        card.style.padding = "12px";
        card.style.minHeight = "130px";
        card.style.width = "calc(50% - 6px)";
        card.style.boxSizing = "border-box";
        card.style.border = "1px solid rgba(255, 255, 255, 0.1)";
        card.style.borderRadius = "12px";
        card.style.backgroundColor = "rgba(255, 255, 255, 0.02)";
        
        const badge = card.querySelector(".menu-category-chip");
        if (badge) {
          badge.style.position = "absolute";
          badge.style.top = "8px";
          badge.style.left = "8px";
          badge.style.fontSize = "0.65rem";
          badge.style.padding = "2px 6px";
          badge.style.margin = "0";
        }

        const status = card.querySelector(".menu-status");
        if (status) {
          status.style.position = "absolute";
          status.style.top = "8px";
          status.style.right = "8px";
          status.style.fontSize = "0.65rem";
          status.style.padding = "2px 6px";
          status.style.borderRadius = "4px";
          status.style.margin = "0";
        }

        const info = card.querySelector(".menu-card-info");
        if (info) {
          info.style.marginTop = "22px"; // clear room for top absolute badges
          info.style.marginBottom = "4px";
          info.style.minWidth = "0";
        }

        const name = card.querySelector(".menu-name");
        if (name) {
          name.style.fontSize = "0.95rem";
          name.style.fontWeight = "bold";
          name.style.color = "#ffffff";
          name.style.margin = "0 0 2px 0";
          name.style.lineHeight = "1.2";
          name.style.whiteSpace = "normal";
          name.style.wordBreak = "break-word";
        }

        const meta = card.querySelector(".menu-meta");
        if (meta) {
          meta.style.fontSize = "0.75rem";
          meta.style.color = "rgba(255, 255, 255, 0.4)";
          meta.style.margin = "0";
        }

        const price = card.querySelector(".menu-price");
        if (price) {
          price.style.fontSize = "0.95rem";
          price.style.color = "var(--color-success, #35b779)";
          price.style.fontWeight = "bold";
          price.style.margin = "2px 0 6px 0";
        }

        // Bottom row container for stock and add button
        const bottomRow = document.createElement("div");
        bottomRow.style.display = "flex";
        bottomRow.style.justifyContent = "space-between";
        bottomRow.style.alignItems = "center";
        bottomRow.style.marginTop = "auto"; // push to bottom
        bottomRow.style.gap = "8px";

        const stockBadge = card.querySelector(".menu-stock-badge");
        if (stockBadge) {
          stockBadge.style.fontSize = "0.75rem";
          stockBadge.style.padding = "2px 6px";
          stockBadge.style.borderRadius = "4px";
          stockBadge.style.margin = "0";
          stockBadge.style.alignSelf = "center";
          bottomRow.appendChild(stockBadge);
        } else {
          // Add a dummy spacer to align the button to the right if there's no stock badge
          const spacer = document.createElement("div");
          bottomRow.appendChild(spacer);
        }

        const addButton = card.querySelector(".menu-add-button");
        if (addButton) {
          addButton.style.width = "auto";
          addButton.style.minWidth = "75px";
          addButton.style.height = "26px";
          addButton.style.minHeight = "26px";
          addButton.style.fontSize = "0.75rem";
          addButton.style.margin = "0";
          addButton.style.borderRadius = "6px";
          addButton.style.padding = "0 8px";
          addButton.style.display = "inline-flex";
          addButton.style.alignItems = "center";
          addButton.style.justifyContent = "center";
          addButton.style.alignSelf = "center";

          addButton.onclick = (e) => {
            e.stopPropagation();
            addMenuItemToLocalCart(menuItem);
          };
          bottomRow.appendChild(addButton);
        }

        card.appendChild(bottomRow);
        listScroll.appendChild(card);
      });
    };

    updateFilteredList();
  };

  const addMenuItemToLocalCart = (menuItem) => {
    const existing = cart.find(item => item.menu_id === menuItem.menu_id);
    if (existing) {
      existing.quantity += 1;
    } else {
      cart.push({
        menu_id: menuItem.menu_id,
        menu_name: menuItem.menu_name,
        price: menuItem.price,
        quantity: 1,
      });
    }
    renderModalCart();
  };

  const renderModalCart = () => {
    cartCol.innerHTML = "";

    const cartTitle = document.createElement("h4");
    cartTitle.style.margin = "0 0 10px 0";
    cartTitle.style.color = "#ffffff";
    cartTitle.textContent = "Tray Pesanan";
    cartCol.appendChild(cartTitle);

    const itemsList = document.createElement("div");
    itemsList.style.flex = "1";
    itemsList.style.overflowY = "auto";
    itemsList.style.display = "flex";
    itemsList.style.flexDirection = "column";
    itemsList.style.gap = "8px";
    cartCol.appendChild(itemsList);

    let totalAmount = 0;

    if (cart.length === 0) {
      const emptyMsg = document.createElement("div");
      emptyMsg.style.color = "rgba(255, 255, 255, 0.4)";
      emptyMsg.style.fontSize = "0.9rem";
      emptyMsg.style.textAlign = "center";
      emptyMsg.style.marginTop = "20px";
      emptyMsg.textContent = "Tray masih kosong.";
      itemsList.appendChild(emptyMsg);
    } else {
      cart.forEach((cartItem) => {
        const itemRow = document.createElement("div");
        itemRow.style.display = "flex";
        itemRow.style.justifyContent = "space-between";
        itemRow.style.alignItems = "center";
        itemRow.style.padding = "6px 8px";
        itemRow.style.backgroundColor = "rgba(255, 255, 255, 0.03)";
        itemRow.style.borderRadius = "4px";

        const textGroup = document.createElement("div");
        textGroup.style.display = "flex";
        textGroup.style.flexDirection = "column";

        const nameSpan = document.createElement("span");
        nameSpan.style.fontWeight = "bold";
        nameSpan.style.fontSize = "0.85rem";
        nameSpan.style.color = "#fff";
        nameSpan.textContent = cartItem.menu_name;

        const subtotal = cartItem.price * cartItem.quantity;
        totalAmount += subtotal;

        const priceSpan = document.createElement("span");
        priceSpan.style.fontSize = "0.75rem";
        priceSpan.style.color = "rgba(255, 255, 255, 0.5)";
        priceSpan.textContent = `${formatCurrency(cartItem.price)} x ${cartItem.quantity} = ${formatCurrency(subtotal)}`;

        textGroup.append(nameSpan, priceSpan);

        const ctrlGroup = document.createElement("div");
        ctrlGroup.style.display = "flex";
        ctrlGroup.style.alignItems = "center";
        ctrlGroup.style.gap = "4px";

        const decBtn = document.createElement("button");
        decBtn.type = "button";
        decBtn.style.padding = "2px 6px";
        decBtn.textContent = "-";
        decBtn.onclick = () => {
          cartItem.quantity -= 1;
          if (cartItem.quantity <= 0) {
            const index = cart.indexOf(cartItem);
            cart.splice(index, 1);
          }
          renderModalCart();
        };

        const incBtn = document.createElement("button");
        incBtn.type = "button";
        incBtn.style.padding = "2px 6px";
        incBtn.textContent = "+";
        incBtn.onclick = () => {
          cartItem.quantity += 1;
          renderModalCart();
        };

        const delBtn = document.createElement("button");
        delBtn.type = "button";
        delBtn.style.background = "none";
        delBtn.style.border = "none";
        delBtn.style.color = "var(--occupied)";
        delBtn.style.cursor = "pointer";
        delBtn.textContent = "🗑️";
        delBtn.onclick = () => {
          const index = cart.indexOf(cartItem);
          cart.splice(index, 1);
          renderModalCart();
        };

        ctrlGroup.append(decBtn, incBtn, delBtn);
        itemRow.append(textGroup, ctrlGroup);
        itemsList.appendChild(itemRow);
      });
    }

    const divider = document.createElement("div");
    divider.style.height = "1px";
    divider.style.backgroundColor = "rgba(255, 255, 255, 0.1)";
    divider.style.margin = "10px 0";
    cartCol.appendChild(divider);

    const totalRow = document.createElement("div");
    totalRow.style.display = "flex";
    totalRow.style.justifyContent = "space-between";
    totalRow.style.fontWeight = "bold";
    totalRow.style.color = "var(--color-success)";
    totalRow.style.marginBottom = "15px";

    const totalLabel = document.createElement("span");
    totalLabel.textContent = "Total Amount:";
    const totalVal = document.createElement("span");
    totalVal.textContent = formatCurrency(totalAmount);

    totalRow.append(totalLabel, totalVal);
    cartCol.appendChild(totalRow);

    const confirmBtn = document.createElement("button");
    confirmBtn.type = "button";
    confirmBtn.className = "duration-custom-button";
    confirmBtn.style.width = "100%";
    confirmBtn.style.backgroundColor = "var(--available)";
    confirmBtn.style.color = "#fff";
    confirmBtn.style.fontWeight = "bold";
    confirmBtn.textContent = "Konfirmasi Pesanan F&B";
    confirmBtn.onclick = () => {
      modalOverlay.remove();
      renderRooms(); // trigger room re-render to display the F&B summary
    };
    cartCol.appendChild(confirmBtn);
  };

  // If menuItems is empty, try to load it dynamically and show a spinner
  if (menuItems.length === 0) {
    catalogCol.innerHTML = "<div style='color:rgba(255,255,255,0.6); padding:20px; text-align:center;'>⏳ Memuat daftar menu F&B...</div>";
    Promise.all([
      loadMenuItems(),
      loadInventoryItems()
    ]).then(() => {
      console.log("showBookingFnbSelectorModal: Dynamic load success, menuItems count:", menuItems.length);
      renderModalCatalog();
    }).catch((err) => {
      console.error("showBookingFnbSelectorModal: Dynamic load error:", err);
      catalogCol.innerHTML = `<div style='color:var(--occupied); padding:20px; text-align:center;'>❌ Gagal memuat menu: ${err.message || err}</div>`;
    });
  } else {
    renderModalCatalog();
  }

  renderModalCart();
}

function createPaymentSelectionElement(room) {
  const panel = document.createElement("div");
  panel.className = "duration-selection";

  const title = document.createElement("p");
  title.className = "duration-selection-title";
  title.textContent = `Proses Booking untuk ${room.room_name}`;

  const infoBlock = document.createElement("div");
  infoBlock.className = "duration-phase-note";
  infoBlock.style.margin = "8px 0";
  infoBlock.style.padding = "6px";
  infoBlock.style.backgroundColor = "rgba(255,255,255,0.05)";
  infoBlock.style.borderRadius = "4px";
  
  let infoHtml = `<strong>Nama Pelanggan:</strong> ${room.customer_name || "-"}<br>`;
  if (room.package_id) {
    const pkg = packages.find(p => p.package_id === room.package_id);
    infoHtml += `<strong>Paket:</strong> ${pkg ? pkg.package_name : room.package_id}`;
  } else {
    infoHtml += `<strong>Durasi:</strong> ${room.booked_duration_minutes || "-"} menit (Regular)`;
  }
  infoBlock.innerHTML = infoHtml;
  panel.appendChild(title);
  panel.appendChild(infoBlock);

  const role = getCurrentOperatorRole();

  // Prepayment F&B Section
  const fnbPrepayField = document.createElement("div");
  fnbPrepayField.style.display = "flex";
  fnbPrepayField.style.flexDirection = "column";
  fnbPrepayField.style.gap = "6px";
  fnbPrepayField.style.marginTop = "8px";
  fnbPrepayField.style.marginBottom = "8px";
  fnbPrepayField.style.padding = "8px";
  fnbPrepayField.style.backgroundColor = "rgba(255, 255, 255, 0.03)";
  fnbPrepayField.style.borderRadius = "6px";
  fnbPrepayField.style.border = "1px solid rgba(255, 255, 255, 0.08)";

  const fnbHeader = document.createElement("div");
  fnbHeader.style.display = "flex";
  fnbHeader.style.justifyContent = "space-between";
  fnbHeader.style.alignItems = "center";

  const fnbLabel = document.createElement("span");
  fnbLabel.className = "duration-payment-label";
  fnbLabel.style.fontWeight = "bold";
  fnbLabel.textContent = "Detail Pesanan F&B:";

  fnbHeader.appendChild(fnbLabel);

  if (role !== "receptionist") {
    const addFnbBtn = document.createElement("button");
    addFnbBtn.className = "room-button";
    addFnbBtn.type = "button";
    addFnbBtn.style.padding = "2px 6px";
    addFnbBtn.style.fontSize = "0.75rem";
    addFnbBtn.style.backgroundColor = "var(--available)";
    addFnbBtn.style.color = "#fff";
    addFnbBtn.style.border = "none";
    addFnbBtn.style.borderRadius = "4px";
    addFnbBtn.textContent = "➕ Tambah Menu";
    addFnbBtn.onclick = () => {
      showBookingFnbSelectorModal(room, "prepay");
    };
    fnbHeader.appendChild(addFnbBtn);
  }

  fnbPrepayField.appendChild(fnbHeader);

  let fnbTotal = 0;

  if (isLoadingPrepayFnb) {
    const loadingMsg = document.createElement("span");
    loadingMsg.style.fontSize = "0.8rem";
    loadingMsg.style.color = "rgba(255, 255, 255, 0.5)";
    loadingMsg.textContent = "⏳ Memuat data F&B...";
    fnbPrepayField.appendChild(loadingMsg);
  } else if (prepayFnbError) {
    const errorMsg = document.createElement("span");
    errorMsg.style.fontSize = "0.8rem";
    errorMsg.style.color = "var(--occupied)";
    errorMsg.textContent = `❌ ${prepayFnbError}`;
    fnbPrepayField.appendChild(errorMsg);
  } else if (prepayCartItems.length > 0) {
    const itemsList = document.createElement("div");
    itemsList.style.display = "flex";
    itemsList.style.flexDirection = "column";
    itemsList.style.gap = "6px";
    itemsList.style.marginTop = "6px";

    prepayCartItems.forEach((cartItem) => {
      const itemRow = document.createElement("div");
      itemRow.style.display = "flex";
      itemRow.style.justifyContent = "space-between";
      itemRow.style.alignItems = "center";
      itemRow.style.fontSize = "0.85rem";

      const textSpan = document.createElement("span");
      textSpan.textContent = `${cartItem.menu_name} x${cartItem.quantity}`;

      const rightGroup = document.createElement("div");
      rightGroup.style.display = "flex";
      rightGroup.style.alignItems = "center";
      rightGroup.style.gap = "8px";

      const priceSpan = document.createElement("span");
      const subtotal = cartItem.price * cartItem.quantity;
      fnbTotal += subtotal;
      priceSpan.textContent = formatCurrency(subtotal);
      rightGroup.appendChild(priceSpan);

      if (role !== "receptionist") {
        const decBtn = document.createElement("button");
        decBtn.type = "button";
        decBtn.style.padding = "1px 4px";
        decBtn.style.fontSize = "0.75rem";
        decBtn.textContent = "-";
        decBtn.onclick = () => {
          cartItem.quantity -= 1;
          if (cartItem.quantity <= 0) {
            const idx = prepayCartItems.indexOf(cartItem);
            prepayCartItems.splice(idx, 1);
          }
          renderRooms();
        };

        const incBtn = document.createElement("button");
        incBtn.type = "button";
        incBtn.style.padding = "1px 4px";
        incBtn.style.fontSize = "0.75rem";
        incBtn.textContent = "+";
        incBtn.onclick = () => {
          cartItem.quantity += 1;
          renderRooms();
        };

        rightGroup.append(decBtn, incBtn);
      }

      itemRow.append(textSpan, rightGroup);
      itemsList.appendChild(itemRow);
    });

    const divider = document.createElement("div");
    divider.style.height = "1px";
    divider.style.backgroundColor = "rgba(255, 255, 255, 0.1)";
    divider.style.margin = "4px 0";

    const totalRow = document.createElement("div");
    totalRow.style.display = "flex";
    totalRow.style.justifyContent = "space-between";
    totalRow.style.fontWeight = "bold";
    totalRow.style.color = "var(--color-success)";

    const totalLabel = document.createElement("span");
    totalLabel.textContent = "Subtotal F&B:";
    const totalVal = document.createElement("span");
    totalVal.textContent = formatCurrency(fnbTotal);

    totalRow.append(totalLabel, totalVal);
    itemsList.append(divider, totalRow);
    fnbPrepayField.appendChild(itemsList);
  } else {
    const emptyNote = document.createElement("span");
    emptyNote.style.fontSize = "0.75rem";
    emptyNote.style.color = "rgba(255, 255, 255, 0.4)";
    emptyNote.textContent = "Tidak ada pesanan makanan/minuman.";
    fnbPrepayField.appendChild(emptyNote);
  }

  panel.appendChild(fnbPrepayField);

  // LC Selector Field for Cashier (Hanya Kasir)
  if (role !== "receptionist") {
    const lcSelectField = document.createElement("div");
    lcSelectField.style.display = "flex";
    lcSelectField.style.flexDirection = "column";
    lcSelectField.style.gap = "4px";
    lcSelectField.style.marginTop = "8px";
    lcSelectField.style.marginBottom = "8px";

    const lcSelectLabel = document.createElement("span");
    lcSelectLabel.className = "duration-payment-label";
    lcSelectLabel.style.fontWeight = "bold";
    lcSelectLabel.textContent = "Lady Companion (LC):";

    const lcSelectDropdown = document.createElement("select");
    lcSelectDropdown.className = "duration-payment-select";
    lcSelectDropdown.style.width = "100%";

    ensureLcSelectionStateForRoom(room);
    const currentLcCount = (selectedLcIdsForRoom[room.room_id] || []).length;

    for (let i = 0; i <= 10; i++) {
      const opt = document.createElement("option");
      opt.value = String(i);
      opt.textContent = i === 0 ? "Tanpa LC" : `${i} Orang`;
      opt.selected = currentLcCount === i;
      lcSelectDropdown.appendChild(opt);
    }

    lcSelectDropdown.onchange = (e) => {
      const count = parseInt(e.target.value) || 0;
      const placeholderArray = [];
      for (let i = 0; i < count; i++) {
        placeholderArray.push("PENDING");
      }
      selectedLcIdsForRoom[room.room_id] = placeholderArray;
      setLcDurationForRoom(room, "PENDING", getDefaultLcDurationMinutes(room));
      renderRooms(); // Re-render to update the summary, calculator shortcuts, and breakdown!
    };

    lcSelectField.append(lcSelectLabel, lcSelectDropdown);

    if (currentLcCount > 0) {
      const lcDurationLabel = document.createElement("span");
      lcDurationLabel.className = "duration-payment-label";
      lcDurationLabel.textContent = "Durasi LC:";

      const lcDurationInput = document.createElement("input");
      lcDurationInput.className = "duration-custom-input";
      lcDurationInput.type = "number";
      lcDurationInput.min = "1";
      lcDurationInput.step = "1";
      lcDurationInput.value = String(getLcDurationForRoom(room, "PENDING"));
      lcDurationInput.placeholder = "Menit";
      lcDurationInput.onchange = (e) => {
        setLcDurationForRoom(room, "PENDING", e.target.value);
        renderRooms();
      };

      const lcDurationHint = document.createElement("span");
      lcDurationHint.style.fontSize = "0.75rem";
      lcDurationHint.style.color = "rgba(255, 255, 255, 0.55)";
      lcDurationHint.textContent = `Untuk ${currentLcCount} LC pending. Isi menit, contoh 120 = 2 jam.`;

      lcSelectField.append(lcDurationLabel, lcDurationInput, lcDurationHint);
    }

    panel.appendChild(lcSelectField);
  }

  // Kalkulasi Room Prepay + LC Fee
  let roomPrepayCharge = 0;
  if (room.package_id) {
    const pkg = packages.find(p => p.package_id === room.package_id);
    roomPrepayCharge = pkg ? pkg.selling_price : 0;
  } else {
    roomPrepayCharge = Math.ceil((Number(room.booked_duration_minutes) || 0) / 60 * (Number(room.rate_per_hour) || 0));
  }

  ensureLcSelectionStateForRoom(room);
  const activeLcIds = selectedLcIdsForRoom[room.room_id] || [];

  let lcFeeTotal = 0;
  if (activeLcIds && activeLcIds.length > 0) {
    // Hitung rata-rata tarif dari semua LC aktif (untuk preview slot PENDING)
    const activeLcList = lcs.filter(l => l.status === "active");
    const rates = activeLcList.map(l => Number(l.rate_per_room) || 0).filter(r => r > 0);
    const avgRate = rates.length > 0 ? rates.reduce((a, b) => a + b, 0) / rates.length : 0;

    activeLcIds.forEach(id => {
      const lcDuration = getLcDurationForRoom(room, id);
      if (id === "PENDING") {
        lcFeeTotal += calculateLcCharge(lcDuration, avgRate);
      } else {
        const found = lcs.find(l => l.lc_id === id);
        const rate = found ? (Number(found.rate_per_room) || avgRate) : avgRate;
        lcFeeTotal += calculateLcCharge(lcDuration, rate);
      }
    });
  }

  let activeGrandTotal = roomPrepayCharge + lcFeeTotal + fnbTotal;

  // Ringkasan Pembayaran (Billing Summary)
  const billingSummary = document.createElement("div");
  billingSummary.style.marginTop = "8px";
  billingSummary.style.marginBottom = "12px";
  billingSummary.style.padding = "10px";
  billingSummary.style.backgroundColor = "rgba(53, 183, 121, 0.08)";
  billingSummary.style.borderRadius = "6px";
  billingSummary.style.border = "1px solid rgba(53, 183, 121, 0.2)";

  const summaryTitle = document.createElement("p");
  summaryTitle.style.margin = "0 0 6px 0";
  summaryTitle.style.fontWeight = "bold";
  summaryTitle.style.color = "var(--color-success)";
  summaryTitle.textContent = "Ringkasan Pembayaran Awal:";
  billingSummary.appendChild(summaryTitle);

  const roomRow = document.createElement("div");
  roomRow.style.display = "flex";
  roomRow.style.justifyContent = "space-between";
  roomRow.style.fontSize = "0.85rem";
  roomRow.style.color = "rgba(255, 255, 255, 0.8)";
  roomRow.innerHTML = `<span>Sewa Room:</span> <span>${formatCurrency(roomPrepayCharge)}</span>`;
  billingSummary.appendChild(roomRow);

  const lcRow = document.createElement("div");
  lcRow.style.display = "flex";
  lcRow.style.flexDirection = "column";
  lcRow.style.gap = "4px";
  lcRow.style.fontSize = "0.85rem";
  lcRow.style.color = "rgba(255, 255, 255, 0.8)";
  
  if (lcFeeTotal > 0) {
    const mainLcRow = document.createElement("div");
    mainLcRow.style.display = "flex";
    mainLcRow.style.justifyContent = "space-between";
    mainLcRow.innerHTML = `<span>Jasa LC (${activeLcIds.length} Orang):</span> <span>${formatCurrency(lcFeeTotal)}</span>`;
    lcRow.appendChild(mainLcRow);

    const breakdownList = document.createElement("div");
    breakdownList.style.display = "flex";
    breakdownList.style.flexDirection = "column";
    breakdownList.style.gap = "2px";
    breakdownList.style.paddingLeft = "12px";
    breakdownList.style.fontSize = "0.75rem";
    breakdownList.style.color = "rgba(255, 255, 255, 0.6)";

    const activeLcList = lcs.filter(l => l.status === "active");
    const rates = activeLcList.map(l => Number(l.rate_per_room) || 0).filter(r => r > 0);
    const avgRate = rates.length > 0 ? rates.reduce((a, b) => a + b, 0) / rates.length : 0;

    activeLcIds.forEach((id, index) => {
      let lcName = "";
      let rate = 0;
      if (id === "PENDING") {
        lcName = `LC ${index + 1} (Belum Dipilih)`;
        rate = avgRate;
      } else {
        const found = lcs.find(l => l.lc_id === id);
        lcName = found ? found.lc_name : `LC ${index + 1}`;
        rate = found ? (Number(found.rate_per_room) || avgRate) : avgRate;
      }
      const lcDuration = getLcDurationForRoom(room, id);
      const itemCost = calculateLcCharge(lcDuration, rate);
      
      const itemRow = document.createElement("div");
      itemRow.style.display = "flex";
      itemRow.style.justifyContent = "space-between";
      itemRow.innerHTML = `<span>- ${lcName} (${formatCurrency(rate)}/jam x ${formatLcDurationShort(lcDuration)})</span> <span>${formatCurrency(itemCost)}</span>`;
      breakdownList.appendChild(itemRow);
    });
    
    lcRow.appendChild(breakdownList);
    billingSummary.appendChild(lcRow);
  }

  const fnbRow = document.createElement("div");
  fnbRow.style.display = "flex";
  fnbRow.style.justifyContent = "space-between";
  fnbRow.style.fontSize = "0.85rem";
  fnbRow.style.color = "rgba(255, 255, 255, 0.8)";
  fnbRow.innerHTML = `<span>Pesanan F&B:</span> <span>${formatCurrency(fnbTotal)}</span>`;
  if (fnbTotal > 0) {
    billingSummary.appendChild(fnbRow);
  }

  const sumDivider = document.createElement("div");
  sumDivider.style.height = "1px";
  sumDivider.style.backgroundColor = "rgba(53, 183, 121, 0.2)";
  sumDivider.style.margin = "6px 0";
  billingSummary.appendChild(sumDivider);

  const grandTotalRow = document.createElement("div");
  grandTotalRow.style.display = "flex";
  grandTotalRow.style.justifyContent = "space-between";
  grandTotalRow.style.fontWeight = "bold";
  grandTotalRow.style.fontSize = "1rem";
  grandTotalRow.style.color = "#ffffff";
  grandTotalRow.innerHTML = `<span>Total Bayar:</span> <span style="color:var(--color-success)">${formatCurrency(activeGrandTotal)}</span>`;
  billingSummary.appendChild(grandTotalRow);

  // Promo / Voucher Input Group (Hanya Kasir)
  let appliedPromoCode = "";
  let appliedDiscountVal = 0;

  if (role !== "receptionist") {
    const promoGroup = document.createElement("div");
    promoGroup.style.display = "flex";
    promoGroup.style.flexDirection = "column";
    promoGroup.style.gap = "6px";
    promoGroup.style.marginTop = "12px";
    promoGroup.style.marginBottom = "12px";
    promoGroup.style.padding = "8px";
    promoGroup.style.backgroundColor = "rgba(255, 255, 255, 0.02)";
    promoGroup.style.border = "1px solid rgba(255, 255, 255, 0.1)";
    promoGroup.style.borderRadius = "6px";

    const promoLabel = document.createElement("span");
    promoLabel.style.fontSize = "12px";
    promoLabel.style.color = "var(--muted)";
    promoLabel.textContent = "Kode Promo / Voucher (Opsional):";

    const promoInputRow = document.createElement("div");
    promoInputRow.style.display = "flex";
    promoInputRow.style.gap = "8px";

    const promoInput = document.createElement("input");
    promoInput.type = "text";
    promoInput.placeholder = "Masukkan kode...";
    promoInput.style.flex = "1";
    promoInput.style.minWidth = "0";
    promoInput.style.width = "100%";
    promoInput.style.padding = "6px";
    promoInput.style.fontSize = "12px";
    promoInput.style.backgroundColor = "var(--surface)";
    promoInput.style.color = "var(--text)";
    promoInput.style.border = "1px solid var(--border)";
    promoInput.style.borderRadius = "4px";
    promoInput.oninput = (e) => {
      e.target.value = e.target.value.toUpperCase().replace(/\s+/g, "");
    };

    const promoBtn = document.createElement("button");
    promoBtn.type = "button";
    promoBtn.className = "erp-btn erp-btn-secondary";
    promoBtn.style.padding = "6px 12px";
    promoBtn.style.fontSize = "12px";
    promoBtn.textContent = "Terapkan";

    const promoNotice = document.createElement("div");
    promoNotice.style.fontSize = "11px";
    promoNotice.style.marginTop = "4px";
    promoNotice.style.display = "none";

    promoBtn.onclick = async () => {
      const code = promoInput.value.trim().toUpperCase();
      if (!code) {
        appliedPromoCode = "";
        appliedDiscountVal = 0;
        promoNotice.style.color = "var(--muted)";
        promoNotice.textContent = "Kode dikosongkan.";
        promoNotice.style.display = "block";
        updatePrepayTotals();
        return;
      }

      promoBtn.disabled = true;
      promoBtn.textContent = "⌛ Check...";

      try {
        if (!API_BASE_URL.trim()) {
          if (code === "MERDEKA50") {
            appliedPromoCode = code;
            appliedDiscountVal = Math.ceil(0.5 * roomPrepayCharge);
            promoNotice.style.color = "var(--success)";
            promoNotice.innerHTML = `✅ Terpasang (Mock): Diskon Room 50% (<strong>${formatCurrency(appliedDiscountVal)}</strong>)`;
          } else if (code === "VCH100K") {
            appliedPromoCode = code;
            appliedDiscountVal = Math.min(100000, roomPrepayCharge);
            promoNotice.style.color = "var(--success)";
            promoNotice.innerHTML = `✅ Terpasang (Mock): Potongan sewa room <strong>${formatCurrency(appliedDiscountVal)}</strong>`;
          } else {
            appliedPromoCode = "";
            appliedDiscountVal = 0;
            promoNotice.style.color = "var(--error)";
            promoNotice.textContent = `❌ Kode promo "${code}" tidak valid.`;
          }
          promoNotice.style.display = "block";
          updatePrepayTotals();
          return;
        }

        const url = `${API_BASE_URL}?action=validatePromoCode&code=${code}&room_total=${roomPrepayCharge}`;
        const res = await fetchPeriodApiResponse(url);
        const data = await res.json();
        if (data && data.success) {
          appliedPromoCode = data.code;
          appliedDiscountVal = data.discount;
          promoNotice.style.color = "var(--success)";
          promoNotice.innerHTML = `✅ Terpasang: Potongan sewa room <strong>${formatCurrency(data.discount)}</strong>`;
          promoNotice.style.display = "block";
        } else {
          appliedPromoCode = "";
          appliedDiscountVal = 0;
          promoNotice.style.color = "var(--error)";
          promoNotice.textContent = `❌ ${data.error || "Kode tidak valid"}`;
          promoNotice.style.display = "block";
        }
      } catch (error) {
        console.error(error);
        promoNotice.style.color = "var(--error)";
        promoNotice.textContent = "❌ Gagal memvalidasi kode.";
        promoNotice.style.display = "block";
      } finally {
        promoBtn.disabled = false;
        promoBtn.textContent = "Terapkan";
        updatePrepayTotals();
      }
    };

    function updatePrepayTotals() {
      const discountedRoomTotal = Math.max(0, roomPrepayCharge - appliedDiscountVal);
      const newGrandTotal = discountedRoomTotal + lcFeeTotal + fnbTotal;
      activeGrandTotal = newGrandTotal;
      roomRow.innerHTML = `<span>Sewa Room:</span> <span>${formatCurrency(discountedRoomTotal)}</span>`;
      grandTotalRow.innerHTML = `<span>Total Bayar:</span> <span style="color:var(--color-success)">${formatCurrency(activeGrandTotal)}</span>`;

      if (typeof renderShortcuts === "function") {
        renderShortcuts(activeGrandTotal);
      }
      if (typeof recalculateChange === "function") {
        recalculateChange(activeGrandTotal);
      }
    }

    promoInputRow.append(promoInput, promoBtn);
    promoGroup.append(promoLabel, promoInputRow, promoNotice);
    billingSummary.appendChild(promoGroup);
  }

  panel.appendChild(billingSummary);
  
  let renderShortcuts, recalculateChange;

  if (role !== "receptionist") {
    const paymentField = document.createElement("label");
    paymentField.className = "duration-payment-field";

    const paymentLabel = document.createElement("span");
    paymentLabel.className = "duration-payment-label";
    paymentLabel.textContent = "Metode Pembayaran:";

    const paymentSelect = document.createElement("select");
    paymentSelect.className = "duration-payment-select";
    paymentSelect.id = `payment-method-select-${room.room_id}`;
    
    [
      ["cash", "Cash"],
      ["transfer", "Transfer/QRIS"],
    ].forEach(([value, labelText]) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = labelText;
      paymentSelect.appendChild(option);
    });

    paymentField.append(paymentLabel, paymentSelect);
    panel.appendChild(paymentField);

    // Cash Calculator Container (Opsi A)
    const calculatorContainer = document.createElement("div");
    calculatorContainer.className = "duration-payment-calculator";
    calculatorContainer.style.display = paymentSelect.value === "cash" ? "flex" : "none";
    calculatorContainer.style.flexDirection = "column";
    calculatorContainer.style.gap = "10px";
    calculatorContainer.style.padding = "10px 12px";
    calculatorContainer.style.backgroundColor = "rgba(255, 255, 255, 0.02)";
    calculatorContainer.style.border = "1px solid var(--border)";
    calculatorContainer.style.borderRadius = "8px";
    calculatorContainer.style.marginTop = "8px";
    calculatorContainer.style.marginBottom = "8px";

    const calcHeader = document.createElement("div");
    calcHeader.style.display = "flex";
    calcHeader.style.justifyContent = "space-between";
    calcHeader.style.alignItems = "center";
    
    const calcTitle = document.createElement("span");
    calcTitle.style.fontSize = "11px";
    calcTitle.style.fontWeight = "800";
    calcTitle.style.color = "var(--muted)";
    calcTitle.style.textTransform = "uppercase";
    calcTitle.style.letterSpacing = "0.5px";
    calcTitle.textContent = "Kalkulator Kasir (Tunai)";
    calcHeader.appendChild(calcTitle);

    const inputInfoRow = document.createElement("div");
    inputInfoRow.style.display = "flex";
    inputInfoRow.style.gap = "14px";
    inputInfoRow.style.alignItems = "center";
    inputInfoRow.style.flexWrap = "wrap";

    const inputGroup = document.createElement("div");
    inputGroup.style.display = "flex";
    inputGroup.style.flexDirection = "column";
    inputGroup.style.gap = "4px";
    inputGroup.style.flex = "1 1 180px";

    const inputLabel = document.createElement("span");
    inputLabel.style.fontSize = "11px";
    inputLabel.style.color = "var(--muted)";
    inputLabel.textContent = "Uang Diterima (Rp):";

    const cashInput = document.createElement("input");
    cashInput.type = "text";
    cashInput.placeholder = "Masukkan jumlah...";
    cashInput.style.padding = "8px 10px";
    cashInput.style.fontSize = "13px";
    cashInput.style.fontWeight = "700";
    cashInput.style.backgroundColor = "var(--surface)";
    cashInput.style.color = "var(--text)";
    cashInput.style.border = "1px solid var(--border)";
    cashInput.style.borderRadius = "6px";
    cashInput.style.width = "100%";

    inputGroup.append(inputLabel, cashInput);

    const resultGroup = document.createElement("div");
    resultGroup.style.display = "flex";
    resultGroup.style.flexDirection = "column";
    resultGroup.style.gap = "4px";
    resultGroup.style.flex = "1 1 180px";

    const resultLabel = document.createElement("span");
    resultLabel.style.fontSize = "11px";
    resultLabel.style.color = "var(--muted)";
    resultLabel.textContent = "Kembalian:";

    const changeDisplay = document.createElement("span");
    changeDisplay.style.fontSize = "16px";
    changeDisplay.style.fontWeight = "900";
    changeDisplay.style.color = "var(--muted)";
    changeDisplay.textContent = "-";

    resultGroup.append(resultLabel, changeDisplay);
    inputInfoRow.append(inputGroup, resultGroup);

    const shortcutsRow = document.createElement("div");
    shortcutsRow.style.display = "flex";
    shortcutsRow.style.flexWrap = "wrap";
    shortcutsRow.style.gap = "6px";
    shortcutsRow.style.marginTop = "2px";

    calculatorContainer.append(calcHeader, inputInfoRow, shortcutsRow);

    // Helpers
    function formatIndonesianNumber(num) {
      return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    }
    function parseIndonesianNumber(str) {
      return Number(str.replace(/\./g, "")) || 0;
    }

    function getShortcutValues(total) {
      if (total <= 0) return [];
      const shortcuts = new Set();
      shortcuts.add(total);
      const denoms = [50000, 100000, 500000];
      denoms.forEach(d => {
        const val = Math.ceil(total / d) * d;
        if (val > total) shortcuts.add(val);
      });
      const commonBills = [100000, 200000, 500000, 1000000, 1500000, 2000000];
      commonBills.forEach(b => {
        if (b > total && b < total * 3) shortcuts.add(b);
      });
      return Array.from(shortcuts).sort((a, b) => a - b).slice(0, 5);
    }

    renderShortcuts = function(total) {
      shortcutsRow.replaceChildren();
      const values = getShortcutValues(total);
      values.forEach(val => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "erp-btn erp-btn-secondary";
        btn.style.padding = "4px 8px";
        btn.style.fontSize = "11px";
        btn.style.fontWeight = "700";
        if (val === total) {
          btn.textContent = "Uang Pas";
          btn.style.borderColor = "var(--success)";
          btn.style.color = "var(--success)";
        } else {
          btn.textContent = formatCurrency(val);
        }
        btn.onclick = () => {
          cashInput.value = formatIndonesianNumber(val);
          recalculateChange(total);
        };
        shortcutsRow.appendChild(btn);
      });
    };

    recalculateChange = function(total) {
      const cashText = cashInput.value;
      if (isLoadingPrepayFnb) {
        startButton.disabled = true;
        startButton.style.opacity = "0.5";
        startButton.style.cursor = "not-allowed";
        return;
      }

      if (!cashText) {
        changeDisplay.textContent = "-";
        changeDisplay.style.color = "var(--muted)";
        startButton.disabled = false;
        startButton.style.opacity = "1";
        startButton.style.cursor = "pointer";
        return;
      }

      const cash = parseIndonesianNumber(cashText);
      const change = cash - total;

      if (change >= 0) {
        changeDisplay.textContent = formatCurrency(change);
        changeDisplay.style.color = "var(--success)";
        startButton.disabled = false;
        startButton.style.opacity = "1";
        startButton.style.cursor = "pointer";
      } else {
        changeDisplay.textContent = `Kurang ${formatCurrency(Math.abs(change))}`;
        changeDisplay.style.color = "var(--error)";
        startButton.disabled = true;
        startButton.style.opacity = "0.5";
        startButton.style.cursor = "not-allowed";
      }
    };

    cashInput.oninput = (e) => {
      let cleanVal = e.target.value.replace(/\D/g, "");
      if (cleanVal) {
        e.target.value = formatIndonesianNumber(cleanVal);
      } else {
        e.target.value = "";
      }
      recalculateChange(activeGrandTotal);
    };

    paymentSelect.onchange = () => {
      if (paymentSelect.value === "cash") {
        calculatorContainer.style.display = "flex";
        cashInput.focus();
        recalculateChange(activeGrandTotal);
      } else {
        calculatorContainer.style.display = "none";
        startButton.disabled = false;
        startButton.style.opacity = "1";
        startButton.style.cursor = "pointer";
      }
    };

    panel.appendChild(calculatorContainer);

    const startButton = document.createElement("button");
    startButton.className = "duration-custom-button";
    startButton.type = "button";
    startButton.style.backgroundColor = "var(--available)";
    startButton.style.color = "#fff";
    startButton.style.fontWeight = "800";
    startButton.style.boxShadow = "0 4px 12px rgba(53, 183, 121, 0.25)";
    startButton.style.width = "100%";
    startButton.style.marginBottom = "8px";
    if (isLoadingPrepayFnb) {
      startButton.disabled = true;
      startButton.style.opacity = "0.5";
      startButton.style.cursor = "not-allowed";
      startButton.textContent = "⏳ Memuat data F&B...";
    } else {
      startButton.textContent = "Terima Pembayaran & Mulai";
      startButton.onclick = async () => {
        const method = paymentSelect.value;
        await payAndStartSession(room.room_id, method, appliedPromoCode);
      };
    }
    panel.appendChild(startButton);

    // Initial load
    renderShortcuts(activeGrandTotal);
    recalculateChange(activeGrandTotal);
  } else {
    const notice = document.createElement("p");
    notice.className = "duration-phase-note";
    notice.style.color = "var(--color-warning)";
    notice.style.marginBottom = "8px";
    notice.textContent = "Menunggu pembayaran pelanggan di kasir.";
    panel.appendChild(notice);
  }

  const cancelButton = document.createElement("button");
  cancelButton.className = "duration-cancel-button";
  cancelButton.type = "button";
  cancelButton.style.backgroundColor = "var(--occupied)";
  cancelButton.style.color = "#fff";
  cancelButton.style.fontWeight = "800";
  cancelButton.style.boxShadow = "0 4px 12px rgba(216, 106, 95, 0.25)";
  cancelButton.style.width = "100%";
  cancelButton.style.marginBottom = "8px";
  cancelButton.textContent = "Batalkan Booking";
  cancelButton.onclick = async () => {
    if (confirm("Apakah Anda yakin ingin membatalkan booking room ini?")) {
      await cancelBooking(room.room_id);
    }
  };

  const closeButton = document.createElement("button");
  closeButton.className = "duration-cancel-button";
  closeButton.type = "button";
  closeButton.style.backgroundColor = "rgba(255,255,255,0.1)";
  closeButton.style.color = "#fff";
  closeButton.style.width = "100%";
  closeButton.textContent = "Tutup";
  closeButton.onclick = () => {
    cancelPaymentSelection();
  };

  panel.append(cancelButton, closeButton);

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
    if (getCurrentOperatorRole() === "receptionist") {
      button.disabled = true;
    }
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
  if (getCurrentOperatorRole() === "receptionist") {
    input.disabled = true;
  }

  const customButton = document.createElement("button");
  customButton.className = "extend-custom-button";
  customButton.type = "button";
  customButton.dataset.action = "extend-session-custom-duration";
  customButton.dataset.roomId = room.room_id;
  if (getCurrentOperatorRole() === "receptionist") {
    customButton.disabled = true;
  }
  customButton.textContent = "Tambah Custom";

  custom.append(input, customButton);

  const paymentField = document.createElement("div");
  paymentField.className = "extend-note-field";
  paymentField.style.backgroundColor = "rgba(124, 58, 237, 0.1)";
  paymentField.style.padding = "8px 12px";
  paymentField.style.borderRadius = "var(--radius-sm)";
  paymentField.style.border = "1px dashed rgba(124, 58, 237, 0.3)";
  paymentField.style.fontSize = "12px";
  paymentField.style.color = "#a78bfa";
  paymentField.style.textAlign = "center";
  paymentField.textContent = "ℹ️ Biaya tambahan waktu akan ditagihkan saat checkout (Open Bill).";

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

  panel.append(title, options, custom, paymentField, noteField, cancelButton);

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
  title.textContent = "POS F&B";

  const subtitle = document.createElement("p");
  subtitle.className = "menu-panel-subtitle";
  subtitle.textContent = "Cari cepat, pilih kategori, lalu tambah item ke tray pesanan.";

  titleGroup.append(title, subtitle);
  header.appendChild(titleGroup);

  const toolbar = document.createElement("div");
  toolbar.className = "menu-toolbar";

  const search = document.createElement("input");
  search.className = "menu-search";
  search.type = "search";
  search.placeholder = "Cari item: bintang, fries, soju, marlboro...";
  search.value = menuSearchQuery;
  search.dataset.action = "search-menu";
  search.setAttribute("aria-label", "Cari menu F&B");

  toolbar.append(search);

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

  panel.append(header, createMenuCategoryFilterElement(), createMenuSpiritFilterElement(), toolbar, list);

  return panel;
}

function createMenuCategoryFilterElement() {
  const filter = document.createElement("div");
  filter.className = "menu-category-filter";
  filter.setAttribute("aria-label", "Filter kategori Menu F&B");
  filter.setAttribute("role", "tablist");

  getMenuCategories().forEach(
    (value) => {
      const labelText = FNB_CATEGORY_LABELS[value] || value;
      const icon = FNB_CATEGORY_ICONS[value] || "🏷️";
      const button = document.createElement("button");
      button.className =
        value === menuCategoryFilter
          ? "menu-category-button active"
          : "menu-category-button";
      button.type = "button";
      button.setAttribute("role", "tab");
      button.setAttribute("aria-selected", String(value === menuCategoryFilter));
      button.dataset.action = "filter-menu-category";
      button.dataset.category = value;
      button.innerHTML = `<span class="category-tab-icon">${icon}</span><span class="category-tab-text">${labelText}</span><span class="category-tab-count">${getFnbMenuCategoryCount(value)}</span>`;
      filter.appendChild(button);
    }
  );

  return filter;
}

function createMenuSpiritFilterElement() {
  const subcategories = getAvailableSpiritSubcategories();
  const filter = document.createElement("div");
  filter.className = menuCategoryFilter === "Spirit"
    ? "menu-spirit-filter"
    : "menu-spirit-filter is-hidden";
  filter.setAttribute("aria-label", "Filter subkategori Spirit");

  if (menuCategoryFilter !== "Spirit" || subcategories.length === 0) {
    return filter;
  }

  [["all", "Semua"], ...subcategories.map((subcategory) => [subcategory, subcategory])].forEach(
    ([value, labelText]) => {
      const button = document.createElement("button");
      button.className =
        value === menuSpiritFilter
          ? "menu-spirit-button active"
          : "menu-spirit-button";
      button.type = "button";
      button.dataset.action = "filter-menu-spirit";
      button.dataset.subcategory = value;
      button.textContent = labelText;
      filter.appendChild(button);
    }
  );

  return filter;
}

function createMenuCardElement(menuItem) {
  const card = document.createElement("article");
  const normalizedStatus = String(menuItem.status || "").trim().toLowerCase();
  const isInactive = normalizedStatus !== "active";
  const stockInfo = getDynamicMenuStockInfo(menuItem);
  const hasStockTracking = stockInfo.hasTracking;
  const availablePortions = stockInfo.availablePortions;
  const isOutOfStock = hasStockTracking && availablePortions <= 0;

  let cardClass = "menu-card";
  if (isInactive) {
    cardClass += " inactive";
  } else if (isOutOfStock) {
    cardClass += " out-of-stock";
  }
  card.className = cardClass;

  const classification = getFnbMenuClassification(menuItem);
  const isFavorite = isFavoriteFnbMenuItem(menuItem);

  const info = document.createElement("div");
  info.className = "menu-card-info";

  const name = document.createElement("h3");
  name.className = "menu-name";
  name.textContent = menuItem.menu_name || "-";

  const meta = document.createElement("p");
  meta.className = "menu-meta";
  const primaryLabel = FNB_CATEGORY_LABELS[classification.primary] || classification.primary || "Tanpa kategori";
  meta.textContent = classification.subcategory
    ? `${primaryLabel} / ${classification.subcategory}`
    : primaryLabel;

  info.append(name, meta);

  const badge = document.createElement("span");
  badge.className = isFavorite ? "menu-category-chip favorite" : "menu-category-chip";
  badge.textContent = isFavorite ? "Favorit" : (FNB_CATEGORY_LABELS[classification.primary] || classification.primary);

  const price = document.createElement("p");
  price.className = "menu-price";
  price.textContent = formatCurrency(menuItem.price);

  const status = document.createElement("span");
  const statusClass = isInactive ? "inactive" : "active";
  status.className = withStatusBadge(
    `menu-status ${statusClass}`,
    statusClass === "active" ? "success" : "neutral"
  );
  status.textContent = getMenuStatusLabel(normalizedStatus);

  card.append(badge, info, price);

  if (hasStockTracking) {
    const stockBadge = document.createElement("span");
    const unitStr = stockInfo.unit ? ` ${stockInfo.unit}` : "";
    if (isOutOfStock) {
      stockBadge.className = "menu-stock-badge out-of-stock";
      stockBadge.textContent = "Stok Habis";
    } else {
      stockBadge.className = availablePortions <= 5 ? "menu-stock-badge low-stock" : "menu-stock-badge";
      stockBadge.textContent = `Stok: ${availablePortions}${unitStr}`;
    }
    card.appendChild(stockBadge);
  }

  card.appendChild(status);

  const addButton = document.createElement("button");
  const canAdd = !isInactive && !isOutOfStock;
  addButton.className = canAdd ? "menu-add-button" : "menu-add-button disabled";
  addButton.type = "button";
  addButton.dataset.action = "add-menu-to-cart";
  addButton.dataset.menuId = menuItem.menu_id || "";
  addButton.disabled = !canAdd;

  if (isInactive) {
    addButton.textContent = "Tidak Aktif";
  } else if (isOutOfStock) {
    addButton.textContent = "Stok Habis";
  } else {
    addButton.textContent = "+ Tambah";
  }

  card.appendChild(addButton);

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
    createFbPaymentMethodElement(),
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

  const modeLabel = document.createElement("label");
  modeLabel.className = "transaction-label";
  modeLabel.textContent = "Jenis Order";

  const modeButtons = document.createElement("div");
  modeButtons.className = "fb-order-mode-buttons";
  const modeOptions = [
    ["room", "Order Room"],
    ["general", "Order F&B Umum"],
  ];

  if (roleMeetsRequired(getCurrentOperatorRole(), "manager")) {
    modeOptions.push(["testing", "F&B Testing"]);
  }

  modeOptions.forEach(([mode, labelText]) => {
    const button = document.createElement("button");
    button.className = fnbOrderMode === mode ? "fb-order-mode-button active" : "fb-order-mode-button";
    button.type = "button";
    button.dataset.action = "set-fnb-order-mode";
    button.dataset.mode = mode;
    button.textContent = labelText;
    modeButtons.appendChild(button);
  });

  control.append(modeLabel, modeButtons);

  if (fnbOrderMode === "testing") {
    const info = document.createElement("p");
    info.className = "fb-room-warning";
    info.textContent = "Mode TEST: order ditandai sebagai data testing, tidak masuk laporan production dan tidak memotong stok.";
    control.appendChild(info);
    return control;
  }

  if (fnbOrderMode === "general") {
    const info = document.createElement("p");
    info.className = "fb-room-warning";
    info.textContent = "Order ini tidak dikaitkan ke room dan dibayar terpisah.";
    control.appendChild(info);
    return control;
  }

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

  if (fnbOrderMode === "testing") {
    const roomName = document.createElement("p");
    roomName.className = "fb-cart-name";
    roomName.textContent = "F&B Testing";

    const roomStatus = document.createElement("p");
    roomStatus.className = "fb-cart-meta";
    roomStatus.textContent = fnbTestRunId ? `Run: ${fnbTestRunId}` : "Run testing baru";

    info.append(roomName, roomStatus);
    return info;
  }

  if (fnbOrderMode === "general") {
    const roomName = document.createElement("p");
    roomName.className = "fb-cart-name";
    roomName.textContent = "F&B Umum";

    const roomStatus = document.createElement("p");
    roomStatus.className = "fb-cart-meta";
    roomStatus.textContent = "Tidak terkait room aktif";

    info.append(roomName, roomStatus);
    return info;
  }

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
  meta.textContent = FNB_CATEGORY_LABELS[item.category] || item.category || "Tanpa kategori";

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

function createFbPaymentMethodElement() {
  const selectedRoom = getSelectedFbRoom();
  const isGeneralOrder = fnbOrderMode === "general";
  if ((!isGeneralOrder && (!selectedRoom || !isFbOrderRoomSelectable(selectedRoom))) || fbCartItems.length === 0) {
    return document.createDocumentFragment();
  }

  const control = document.createElement("div");
  control.className = "fb-room-control";

  const label = document.createElement("label");
  label.className = "transaction-label";
  label.setAttribute("for", "fbPaymentMethodSelect");
  label.textContent = "Metode Pembayaran";

  const select = document.createElement("select");
  select.className = "fb-room-select";
  select.id = "fbPaymentMethodSelect";
  select.dataset.action = "update-fb-payment-method";

  if (!isGeneralOrder) {
    const roomBillOpt = document.createElement("option");
    roomBillOpt.value = "room_bill";
    roomBillOpt.textContent = "Open Bill (Masuk Tagihan Room)";
    if (fnbOrderPaymentMethod === "room_bill") roomBillOpt.selected = true;
    select.appendChild(roomBillOpt);
  }

  const cashOpt = document.createElement("option");
  cashOpt.value = "cash";
  cashOpt.textContent = "Tunai / Cash";
  if (fnbOrderPaymentMethod === "cash") cashOpt.selected = true;

  const transferOpt = document.createElement("option");
  transferOpt.value = "transfer";
  transferOpt.textContent = "Transfer / QRIS";
  if (fnbOrderPaymentMethod === "transfer") transferOpt.selected = true;

  select.append(cashOpt, transferOpt);
  control.append(label, select);

  return control;
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

  if (status === "paid") {
    return "Lunas";
  }

  if (status === "cancelled") {
    return "Dibatalkan";
  }

  return "Tidak Dikenal";
}

function getFnbOrderStatusClass(status) {
  if (status === "open" || status === "billed" || status === "paid" || status === "cancelled") {
    return status;
  }

  return "unknown";
}

function createFbOrderActionsElement() {
  const actions = document.createElement("div");
  actions.className = "fb-order-actions";
  const selectedRoom = getSelectedFbRoom();
  const canSave =
    (fnbOrderMode === "general" || (Boolean(selectedRoom) && isFbOrderRoomSelectable(selectedRoom))) &&
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
  saveButton.textContent = isSavingFnbOrder ? "Memproses..." : "Bayar & Kirim Order";

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
  meta.textContent = `${order.room_name || order.room_id || "-"} - Order: ${formatDateTimeLabel(order.created_at)} - Sesi: ${getRoomTimeLabel(order.room_start_time)}`;

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
  meta.textContent = `${order.room_name || order.room_id || "-"} - Order: ${formatDateTimeLabel(order.created_at)} - Sesi: ${getRoomTimeLabel(order.room_start_time)}`;

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
  panel.className = "inventory-panel erp-inventory-view";
  panel.setAttribute("aria-labelledby", "inventory-title");

  const header = document.createElement("div");
  header.className = "inventory-header erp-header";

  const titleGroup = document.createElement("div");

  const title = document.createElement("h2");
  title.className = "inventory-title";
  title.id = "inventory-title";
  title.textContent = "Material Management & Stok";

  const subtitle = document.createElement("p");
  subtitle.className = "inventory-subtitle";
  subtitle.textContent = "Katalog inventaris, posisi fisik barang, dan kontrol penyesuaian stok real-time (SAP/Odoo View).";

  titleGroup.append(title, subtitle);

  const actions = document.createElement("div");
  actions.className = "inventory-actions";

  const refreshButton = document.createElement("button");
  refreshButton.className = "inventory-button erp-btn-secondary";
  refreshButton.type = "button";
  refreshButton.dataset.action = "refresh-inventory";
  refreshButton.disabled = isLoadingInventory || !API_BASE_URL.trim();
  refreshButton.textContent = isLoadingInventory ? "Memuat..." : "↻ Refresh Data";

  const addButton = document.createElement("button");
  addButton.className = "inventory-button erp-btn-primary";
  addButton.type = "button";
  addButton.dataset.action = "open-add-inventory-item-modal";
  addButton.disabled = isLoadingInventory || !API_BASE_URL.trim();
  addButton.textContent = "+ Tambah Item F&B Baru";
  addButton.style.marginLeft = "8px";

  actions.append(refreshButton, addButton);
  header.append(titleGroup, actions);

  const tableContainer = document.createElement("div");
  tableContainer.className = "inventory-table-container erp-table-wrap";

  if (!API_BASE_URL.trim()) {
    tableContainer.appendChild(createStateMessage("Stok F&B hanya tersedia saat terhubung ke server."));
  } else if (isLoadingInventory) {
    tableContainer.appendChild(createStateMessage("Memuat katalog stok SAP/Odoo ERP..."));
  } else if (inventoryItems.length === 0) {
    const empty = document.createElement("p");
    empty.className = "inventory-empty";
    empty.textContent = "Belum ada data materi stok.";
    tableContainer.appendChild(empty);
  } else {
    tableContainer.appendChild(createInventoryErpTableElement());
    tableContainer.appendChild(createPaginationControlsElement("inventoryItems", inventoryItems.length));
  }

  panel.append(
    header,
    createInventorySummaryElement(),
    tableContainer,
    createStockAdjustmentPanelElement(),
    lastStockAdjustment ? createLastStockAdjustmentElement(lastStockAdjustment) : document.createDocumentFragment(),
    createAdminPinModalElement(),
    addInventoryItemForm ? createAddInventoryItemModalElement() : document.createDocumentFragment()
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
  grid.className = "inventory-summary erp-kpi-grid";

  [
    ["Total SKU Material", Number(summary.total_items) || 0, "neutral"],
    ["Stok Safe / Normal", Number(summary.safe_items) || 0, "success"],
    ["Alert Stok Rendah", Number(summary.low_items) || 0, "warning"],
    ["Stok Out / Minus", Number(summary.negative_items) || 0, "critical"],
  ].forEach(([labelText, valueText, tone]) => {
    const card = document.createElement("div");
    card.className = `inventory-summary-card erp-kpi-card tone-${tone}`;

    const label = document.createElement("p");
    label.className = "transaction-label erp-kpi-label";
    label.textContent = labelText;

    const value = document.createElement("p");
    value.className = "transaction-value erp-kpi-val";
    value.textContent = valueText;

    card.append(label, value);
    grid.appendChild(card);
  });

  return grid;
}

function createInventoryErpTableElement() {
  const table = document.createElement("table");
  table.className = "erp-inventory-table";

  const thead = document.createElement("thead");
  thead.innerHTML = `
    <tr>
      <th>SKU / Item Code</th>
      <th>Nama Material</th>
      <th>Kategori</th>
      <th>Stok Aktual</th>
      <th>Min. Stok</th>
      <th>Status</th>
      <th style="text-align: right;">Aksi</th>
    </tr>
  `;

  const tbody = document.createElement("tbody");
  const paginatedInventory = getPaginatedSlice("inventoryItems", inventoryItems);

  paginatedInventory.items.forEach((item) => {
    const tr = document.createElement("tr");
    tr.className = "erp-inventory-tr";

    const skuTd = document.createElement("td");
    skuTd.innerHTML = `<span class="erp-sku-badge">${item.stock_item_id || "-"}</span>`;

    const nameTd = document.createElement("td");
    nameTd.className = "erp-name-cell";
    nameTd.textContent = item.stock_item_name || item.stock_item_id || "-";

    const catTd = document.createElement("td");
    catTd.className = "erp-cat-cell";
    catTd.textContent = item.category || "General";

    const qtyTd = document.createElement("td");
    qtyTd.className = "erp-qty-cell";
    const qtyVal = Number(item.stock_qty) || 0;
    const unitStr = item.unit ? ` ${item.unit}` : "";
    qtyTd.innerHTML = `<strong>${qtyVal}</strong><small>${unitStr}</small>`;

    const minTd = document.createElement("td");
    minTd.className = "erp-min-cell";
    minTd.textContent = `${Number(item.min_stock) || 0} ${item.unit || ""}`.trim();

    const statusTd = document.createElement("td");
    const statusSpan = document.createElement("span");
    statusSpan.className = withStatusBadge(
      `inventory-status ${getInventoryStockStatusClass(item.stock_status)}`,
      getInventoryStockStatusTone(item.stock_status)
    );
    statusSpan.textContent = getInventoryStockStatusLabel(item.stock_status);
    statusTd.appendChild(statusSpan);

    const actionTd = document.createElement("td");
    actionTd.style.textAlign = "right";
    const adjustBtn = document.createElement("button");
    adjustBtn.className = "erp-quick-adjust-btn";
    adjustBtn.type = "button";
    adjustBtn.textContent = "Adjust / Restock";
    adjustBtn.onclick = () => {
      updateStockAdjustmentForm("stock_item_id", item.stock_item_id);
      focusStockAdjustmentField(".stock-adjustment-quantity");
    };
    actionTd.appendChild(adjustBtn);

    tr.append(skuTd, nameTd, catTd, qtyTd, minTd, statusTd, actionTd);
    tbody.appendChild(tr);
  });

  table.append(thead, tbody);
  return table;
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
  meta.textContent = `${formatDateTimeLabel(movement.created_at)} - ${movement.movement_id || "-"}`;

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
    ["Mulai", formatTransactionDateTime(transaction?.start_time)],
    ["Selesai", formatTransactionDateTime(transaction?.end_time)],
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

function buildFinanceOverviewSummary() {
  const pickNumber = (...values) => {
    for (const value of values) {
      if (value === null || value === undefined || value === "") {
        continue;
      }

      const numberValue = Number(value);

      if (Number.isFinite(numberValue)) {
        return numberValue;
      }
    }

    return 0;
  };
  const hasOwnerReportData = Boolean(
    ownerReportTransactionSummary ||
    ownerReportRoomUsageSummary ||
    ownerReportFnbSalesSummary
  );
  const transactionSummary = ownerReportTransactionSummary || todayTransactionSummary || {};
  const roomSummary = ownerReportRoomUsageSummary || roomUsageSummary || ownerRoomUsageSummary || {};
  const fnbOrderSummary = todayFnbOrderSummary || {};
  const fnbSalesSummary = ownerReportFnbSalesSummary || todayFnbSalesSummary || {};
  const activeRoomCount = rooms.filter((room) => normalizeRoomStatus(room?.status) === "occupied").length;
  const relevantClosings = hasOwnerReportData ? ownerReportCashierClosings : todayCashierClosings;
  const latestClosing = relevantClosings[0] || null;
  const cashDifference = Number(latestClosing?.cash_difference) || 0;
  const openFnbAmount = Number(fnbOrderSummary.open_amount) || calculateOpenFnbOrdersSummary(openFnbOrders).total_amount;
  const isActiveShiftReport = ownerReportPeriodFilter === "today";
  const fallbackTransactions = hasOwnerReportData ? [] : todayTransactions;

  return {
    totalPenjualan: pickNumber(transactionSummary.total_revenue_all, roomSummary.total_grand_revenue),
    sudahDibayar: pickNumber(transactionSummary.paid_revenue, transactionSummary.total_revenue_paid, roomSummary.paid_revenue),
    belumDibayar: pickNumber(transactionSummary.unpaid_revenue, roomSummary.unpaid_revenue),
    cashMasuk: pickNumber(transactionSummary.cash_revenue),
    transferMasuk: pickNumber(transactionSummary.transfer_revenue),
    penjualanRoom: pickNumber(
      roomSummary.total_room_revenue,
      fallbackTransactions.reduce((total, transaction) => total + (Number(transaction.room_total) || 0), 0)
    ),
    penjualanFnb: pickNumber(
      fnbSalesSummary.total_fnb_sales,
      roomSummary.total_fnb_revenue,
      fallbackTransactions.reduce((total, transaction) => total + (Number(transaction.fnb_total) || 0), 0)
    ),
    pesananFnbBerjalan: isActiveShiftReport ? openFnbAmount : 0,
    totalTransaksi: pickNumber(transactionSummary.total_transactions, fallbackTransactions.length),
    transaksiBelumDibayar: pickNumber(
      transactionSummary.unpaid_transactions,
      fallbackTransactions.filter((transaction) => transaction.payment_status === "unpaid").length
    ),
    roomBerjalan: activeRoomCount,
    totalSesi: Number(roomSummary.total_sessions) || 0,
    roomTeraktif: roomSummary.top_room_name || "-",
    menuTerlaris: fnbSalesSummary.top_menu_name || "-",
    setoranKasirTersimpan: relevantClosings.length > 0,
    jumlahClosing: relevantClosings.length,
    latestClosing,
    cashDifference,
  };
}

function getFinanceCashStatus(summary) {
  if (!summary.setoranKasirTersimpan) {
    const isActiveShiftReport = ownerReportPeriodFilter === "today";

    return {
      label: isActiveShiftReport ? "Belum Tutup Shift" : "Belum Ada Closing",
      tone: "warning",
      detail: isActiveShiftReport
        ? "Kasir belum menyimpan laporan tutup shift."
        : "Belum ada laporan tutup shift pada periode ini.",
    };
  }

  if (summary.cashDifference > 0) {
    return {
      label: "Kas Lebih",
      tone: "warning",
      detail: `Ada kelebihan uang kas ${formatCurrency(summary.cashDifference)}.`,
    };
  }

  if (summary.cashDifference < 0) {
    return {
      label: "Kas Kurang",
      tone: "danger",
      detail: `Ada kekurangan uang kas ${formatCurrency(Math.abs(summary.cashDifference))}.`,
    };
  }

  return {
    label: "Kas Cocok",
    tone: "success",
    detail: "Setoran kasir terakhir tercatat cocok.",
  };
}

function buildFinanceChecklist(summary) {
  const checklist = [];

  if (summary.belumDibayar > 0 || summary.transaksiBelumDibayar > 0) {
    checklist.push({
      label: "Tagihan belum dibayar",
      value: formatCurrency(summary.belumDibayar),
      tone: "warning",
      detail: `${summary.transaksiBelumDibayar} transaksi perlu dicek.`,
    });
  }

  if (summary.pesananFnbBerjalan > 0) {
    checklist.push({
      label: "F&B belum masuk tagihan",
      value: formatCurrency(summary.pesananFnbBerjalan),
      tone: "warning",
      detail: "Masih ada pesanan F&B berjalan.",
    });
  }

  if (summary.roomBerjalan > 0) {
    checklist.push({
      label: "Room masih berjalan",
      value: `${summary.roomBerjalan} room`,
      tone: "info",
      detail: "Pastikan room selesai sebelum tutup shift final.",
    });
  }

  const cashStatus = getFinanceCashStatus(summary);
  if (cashStatus.tone !== "success") {
    checklist.push({
      label: cashStatus.label,
      value: "Perlu dicek",
      tone: cashStatus.tone,
      detail: cashStatus.detail,
    });
  }

  return checklist;
}

function createFinanceOverviewMetricCard({ label, value, detail, tone = "neutral" }) {
  const card = document.createElement("article");
  card.className = `finance-overview-card finance-overview-card--${tone}`;

  const labelElement = document.createElement("p");
  labelElement.className = "finance-overview-label";
  labelElement.textContent = label;

  const valueElement = document.createElement("p");
  valueElement.className = "finance-overview-value";
  valueElement.textContent = value;

  card.append(labelElement, valueElement);

  if (detail) {
    const detailElement = document.createElement("p");
    detailElement.className = "finance-overview-detail";
    detailElement.textContent = detail;
    card.appendChild(detailElement);
  }

  return card;
}

function createFinanceChecklistElement(items) {
  const panel = document.createElement("section");
  panel.className = "finance-checklist";
  panel.setAttribute("aria-labelledby", "finance-checklist-title");

  const title = document.createElement("h3");
  title.className = "finance-checklist-title";
  title.id = "finance-checklist-title";
  title.textContent = "Hal yang Perlu Dicek";

  const list = document.createElement("div");
  list.className = "finance-checklist-list";

  if (items.length === 0) {
    const empty = document.createElement("p");
    empty.className = "finance-checklist-empty";
    empty.textContent = "Tidak ada hal penting yang perlu dicek untuk shift ini.";
    list.appendChild(empty);
  } else {
    items.forEach((item) => {
      const row = document.createElement("article");
      row.className = "finance-checklist-row";

      const info = document.createElement("div");

      const label = document.createElement("p");
      label.className = "finance-checklist-label";
      label.textContent = item.label;

      const detail = document.createElement("p");
      detail.className = "finance-checklist-detail";
      detail.textContent = item.detail;

      info.append(label, detail);

      const badge = document.createElement("span");
      badge.className = withStatusBadge("finance-checklist-badge", item.tone);
      badge.textContent = item.value;

      row.append(info, badge);
      list.appendChild(row);
    });
  }

  panel.append(title, list);
  return panel;
}

function createOwnerReportPeriodFilterElement() {
  const wrapper = document.createElement("div");
  wrapper.className = "period-filter owner-report-period-filter";
  wrapper.setAttribute("aria-label", "Filter periode laporan owner");

  const buttons = document.createElement("div");
  buttons.className = "period-filter-buttons";

  TRANSACTION_PERIOD_OPTIONS.forEach(([period, labelText]) => {
    const button = document.createElement("button");
    button.className = period === ownerReportPeriodFilter
      ? "period-filter-button active"
      : "period-filter-button";
    button.type = "button";
    button.dataset.action = "filter-owner-report-period";
    button.dataset.period = period;
    button.textContent = labelText;
    buttons.appendChild(button);
  });

  wrapper.appendChild(buttons);

  if (ownerReportPeriodFilter === "custom") {
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
    startInput.dataset.action = "update-owner-report-custom-start-date";
    startInput.value = ownerReportCustomStartDate;

    startField.append(startLabel, startInput);

    const endField = document.createElement("div");
    endField.className = "custom-date-field";

    const endLabel = document.createElement("label");
    endLabel.className = "custom-date-label";
    endLabel.textContent = "Tanggal Operasional Akhir";

    const endInput = document.createElement("input");
    endInput.className = "custom-date-input";
    endInput.type = "date";
    endInput.dataset.action = "update-owner-report-custom-end-date";
    endInput.value = ownerReportCustomEndDate;

    endField.append(endLabel, endInput);

    const applyButton = document.createElement("button");
    applyButton.className = "period-filter-apply-button";
    applyButton.type = "button";
    applyButton.dataset.action = "apply-owner-report-custom-period";
    applyButton.textContent = "Terapkan";

    custom.append(startField, endField, applyButton);
    wrapper.appendChild(custom);
  }

  if (ownerReportPeriodNotice) {
    const notice = document.createElement("p");
    notice.className = "period-filter-notice";
    notice.textContent = ownerReportPeriodNotice;
    wrapper.appendChild(notice);
  }

  return wrapper;
}

function createOwnerReportPrintSection(titleText, rows) {
  const section = document.createElement("section");
  section.className = "closing-print-section owner-report-print-section";

  const title = document.createElement("h3");
  title.textContent = titleText;

  const grid = document.createElement("div");
  grid.className = "closing-print-grid owner-report-print-grid";

  rows.forEach(([labelText, valueText, helperText]) => {
    const row = document.createElement("div");
    row.className = "closing-print-row";

    const label = document.createElement("p");
    label.className = "closing-print-label";
    label.textContent = labelText;

    const value = document.createElement("p");
    value.className = "closing-print-value";
    value.textContent = valueText;

    row.append(label, value);

    if (helperText) {
      const helper = document.createElement("p");
      helper.className = "closing-print-helper";
      helper.textContent = helperText;
      row.appendChild(helper);
    }

    grid.appendChild(row);
  });

  section.append(title, grid);

  return section;
}

function createOwnerReportPrintPreviewElement() {
  const summary = buildFinanceOverviewSummary();
  const cashStatus = getFinanceCashStatus(summary);
  const checklist = buildFinanceChecklist(summary);
  const latestClosing = summary.latestClosing || {};

  const print = document.createElement("section");
  print.className = "closing-print owner-report-print";
  print.setAttribute("aria-labelledby", "owner-report-print-title");

  const header = document.createElement("div");
  header.className = "closing-print-header";

  const title = document.createElement("h2");
  title.className = "closing-print-title";
  title.id = "owner-report-print-title";
  title.textContent = "Laporan Owner";

  const subtitle = document.createElement("p");
  subtitle.className = "closing-print-subtitle";
  subtitle.textContent = `Happy Song Karaoke - ${getOwnerReportPeriodTitleSuffix()}`;

  header.append(title, subtitle);

  const moneySummary = createOwnerReportPrintSection("Ringkasan Uang Masuk", [
    ["Total Penjualan", formatCurrency(summary.totalPenjualan), `${summary.totalTransaksi} transaksi tercatat.`],
    ["Sudah Dibayar", formatCurrency(summary.sudahDibayar), "Uang yang sudah tercatat lunas."],
    ["Belum Dibayar", formatCurrency(summary.belumDibayar), `${summary.transaksiBelumDibayar} transaksi belum lunas.`],
    ["Cash", formatCurrency(summary.cashMasuk), "Pembayaran tunai dari transaksi lunas."],
    ["Transfer", formatCurrency(summary.transferMasuk), "Pembayaran transfer yang perlu cocok dengan mutasi/QRIS."],
  ]);

  const operationalSummary = createOwnerReportPrintSection("Penjualan Operasional", [
    ["Penjualan Room", formatCurrency(summary.penjualanRoom), `${summary.totalSesi} sesi room tercatat.`],
    ["Penjualan F&B", formatCurrency(summary.penjualanFnb), `Menu terlaris: ${summary.menuTerlaris}`],
    ["F&B Berjalan", formatCurrency(summary.pesananFnbBerjalan), "Pesanan aktif yang belum masuk tagihan akhir."],
    ["Room Teraktif", summary.roomTeraktif, "Room dengan pemakaian terbesar pada periode ini."],
    ["Room Berjalan", `${summary.roomBerjalan} room`, "Room yang masih occupied saat laporan dibuka."],
  ]);

  const closingSummary = createOwnerReportPrintSection("Status Tutup Shift", [
    ["Status Kas", cashStatus.label, cashStatus.detail],
    ["Closing Terakhir", latestClosing.closing_id || "-", formatDateTimeLabel(latestClosing.created_at) || "Belum ada closing pada periode ini."],
    ["Selisih Cash", formatCurrency(summary.cashDifference), "Selisih dari closing kasir terakhir pada periode ini."],
    ["Jumlah Closing", `${summary.jumlahClosing} closing`, "Jumlah laporan tutup shift yang tercatat."],
  ]);

  const checklistSection = document.createElement("section");
  checklistSection.className = "closing-print-section owner-report-print-section";

  const checklistTitle = document.createElement("h3");
  checklistTitle.textContent = "Hal yang Perlu Dicek";

  const checklistNote = document.createElement("p");
  checklistNote.className = "closing-print-note";
  checklistNote.textContent = checklist.length > 0
    ? checklist.map((item) => `${item.label}: ${item.detail}`).join(" | ")
    : "Tidak ada hal penting yang perlu dicek pada periode ini.";

  checklistSection.append(checklistTitle, checklistNote);

  const footer = document.createElement("p");
  footer.className = "closing-print-note";
  footer.textContent = "Dicetak dari Dashboard Owner Happy Song Karaoke. Gunakan laporan ini sebagai arsip evaluasi operasional.";

  const actions = document.createElement("div");
  actions.className = "closing-print-actions";

  const printButton = document.createElement("button");
  printButton.className = "closing-print-button";
  printButton.type = "button";
  printButton.dataset.action = "print-owner-report";
  printButton.textContent = "Cetak";

  const closeButton = document.createElement("button");
  closeButton.className = "closing-print-button secondary";
  closeButton.type = "button";
  closeButton.dataset.action = "hide-owner-report-print";
  closeButton.textContent = "Tutup Preview Cetak";

  actions.append(printButton, closeButton);
  print.append(header, moneySummary, operationalSummary, closingSummary, checklistSection, footer, actions);

  return print;
}

function createFinanceOverviewElement() {
  const section = document.createElement("section");
  section.className = "finance-overview";
  section.setAttribute("aria-labelledby", "finance-overview-title");

  const summary = buildFinanceOverviewSummary();
  const cashStatus = getFinanceCashStatus(summary);
  const checklist = buildFinanceChecklist(summary);

  const header = document.createElement("div");
  header.className = "finance-overview-header";

  const titleGroup = document.createElement("div");

  const title = document.createElement("h2");
  title.className = "finance-overview-title";
  title.id = "finance-overview-title";
  title.textContent = `Ringkasan Keuangan Owner - ${getOwnerReportPeriodTitleSuffix()}`;

  const subtitle = document.createElement("p");
  subtitle.className = "finance-overview-subtitle";
  subtitle.textContent = "Pantau uang masuk, tagihan berjalan, penjualan room, dan penjualan F&B sesuai periode operasional.";

  titleGroup.append(title, subtitle);

  const status = document.createElement("span");
  status.className = withStatusBadge("finance-overview-status", cashStatus.tone);
  status.textContent = cashStatus.label;

  const actions = document.createElement("div");
  actions.className = "finance-overview-actions";

  const printButton = document.createElement("button");
  printButton.className = "owner-dashboard-button";
  printButton.type = "button";
  printButton.dataset.action = "show-owner-report-print";
  printButton.disabled = isLoadingOwnerReport;
  printButton.textContent = "Preview Cetak";

  actions.append(status, printButton);
  header.append(titleGroup, actions);

  const grid = document.createElement("div");
  grid.className = "finance-overview-grid";

  [
    {
      label: "Total Penjualan",
      value: formatCurrency(summary.totalPenjualan),
      detail: `${summary.totalTransaksi} transaksi tercatat`,
      tone: "gold",
    },
    {
      label: "Sudah Dibayar",
      value: formatCurrency(summary.sudahDibayar),
      detail: "Uang yang sudah tercatat lunas",
      tone: "success",
    },
    {
      label: "Belum Dibayar",
      value: formatCurrency(summary.belumDibayar),
      detail: `${summary.transaksiBelumDibayar} transaksi belum lunas`,
      tone: summary.belumDibayar > 0 ? "warning" : "success",
    },
    {
      label: "Penjualan Room",
      value: formatCurrency(summary.penjualanRoom),
      detail: `${summary.totalSesi} sesi, room teraktif: ${summary.roomTeraktif}`,
      tone: "neutral",
    },
    {
      label: "Penjualan F&B",
      value: formatCurrency(summary.penjualanFnb),
      detail: `Menu terlaris: ${summary.menuTerlaris}`,
      tone: "neutral",
    },
    {
      label: "F&B Berjalan",
      value: formatCurrency(summary.pesananFnbBerjalan),
      detail: "Pesanan belum masuk tagihan akhir",
      tone: summary.pesananFnbBerjalan > 0 ? "warning" : "success",
    },
  ].forEach((item) => {
    grid.appendChild(createFinanceOverviewMetricCard(item));
  });

  section.append(
    header,
    createOwnerReportPeriodFilterElement(),
    createOperationalShiftNoteElement("finance-overview-note"),
    grid,
    createFinanceChecklistElement(checklist)
  );

  if (isLoadingOwnerReport) {
    section.appendChild(createStateMessage("Memuat laporan owner periode...", "info"));
  }

  return section;
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
  title.textContent = `Dashboard Owner - ${getOwnerReportPeriodTitleSuffix()}`;

  const subtitle = document.createElement("p");
  subtitle.className = "owner-dashboard-subtitle";
  subtitle.textContent = "Ringkasan cepat berdasarkan filter periode laporan owner.";

  titleGroup.append(title, subtitle);

  const refreshButton = document.createElement("button");
  refreshButton.className = "owner-dashboard-button";
  refreshButton.type = "button";
  refreshButton.dataset.action = "refresh-owner-dashboard";
  refreshButton.disabled = isLoadingOwnerDashboard || isLoadingOwnerReport || !API_BASE_URL.trim();
  refreshButton.textContent = isLoadingOwnerDashboard || isLoadingOwnerReport ? "Memuat..." : "Refresh Dashboard";

  header.append(titleGroup, refreshButton);

  const summary = ownerReportRoomUsageSummary || ownerRoomUsageSummary || {
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
      label: "Total Penjualan Periode",
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
  print.className = "closing-print closing-receipt";
  print.setAttribute("aria-labelledby", "closing-print-title");

  const header = document.createElement("header");
  header.className = "closing-receipt-header";

  const brand = document.createElement("p");
  brand.className = "closing-receipt-brand";
  brand.textContent = "HAPPY SONG KARAOKE";

  const title = document.createElement("h2");
  title.className = "closing-print-title";
  title.id = "closing-print-title";
  title.textContent = "Laporan Tutup Shift";

  header.append(brand, title);

  const details = closing?.closing_details || null;
  const snapshotSummary = details?.summary || {};
  const transactionSummary = snapshotSummary.transactions || {};
  const lcSummary = snapshotSummary.lc || {};
  const { note: parsedNote, denoms: parsedDenoms } = parseClosingNoteAndDenoms(closing?.note || "");

  const identitySection = createClosingReceiptSection("Data Closing", [
    ["Tanggal", formatClosingDate(closing?.closing_date)],
    ["ID", closing?.closing_id || "-"],
    ["Kasir", closing?.cashier_name || "-"],
    ["Waktu", formatDateTimeLabel(closing?.created_at)],
  ]);

  const salesRows = details?.snapshot_available
    ? [
        ["Room", formatCurrency(transactionSummary.room_total)],
        ["F&B", formatCurrency(transactionSummary.fnb_total)],
        ["LC", formatCurrency(transactionSummary.lc_total)],
        ["Diskon", formatClosingSignedCurrency(-(Number(transactionSummary.promo_discount) || 0))],
        ["Total Tagihan", formatCurrency(transactionSummary.grand_total), "total"],
      ]
    : [
        ["Omzet Lunas", formatCurrency(closing?.paid_revenue)],
        ["Total Tagihan", formatCurrency(closing?.total_revenue), "total"],
      ];
  const salesSection = createClosingReceiptSection("Ringkasan Omzet", salesRows);

  const paymentSection = createClosingReceiptSection("Pembayaran", [
    ["Cash Sistem", formatCurrency(closing?.cash_expected)],
    ["Cash Aktual", formatCurrency(closing?.cash_actual)],
    ["Selisih", formatClosingSignedCurrency(closing?.cash_difference), "total"],
    ["Transfer", formatCurrency(closing?.transfer_revenue)],
    ["Belum Lunas", formatCurrency(closing?.unpaid_revenue)],
  ]);

  print.append(header, identitySection, salesSection, paymentSection);

  if (closing?.closing_details_loading) {
    print.appendChild(createClosingReceiptMessage("Memuat rincian closing..."));
  } else if (details?.snapshot_available) {
    print.appendChild(createClosingTransactionDetailsSection(details));
    print.appendChild(createClosingLcDetailsSection(details));
    print.appendChild(createClosingOperationalSummarySection(details));
  } else {
    print.appendChild(createClosingReceiptMessage(
      closing?.closing_details_error
        || "Rincian transaksi tidak tersedia untuk closing lama. Rekap agregat tetap dapat dicetak."
    ));
  }

  if (parsedDenoms.length > 0) {
    print.appendChild(createClosingReceiptSection(
      "Pecahan Cash",
      parsedDenoms.map((denom) => [
        `${denom.label} x${denom.qty}`,
        formatCurrency(denom.total),
      ])
    ));
  }

  print.appendChild(createClosingReceiptSection("Catatan", [
    [parsedNote || "-", ""],
  ], "note"));

  const signatures = document.createElement("section");
  signatures.className = "closing-receipt-signatures";
  ["Kasir", "Manager"].forEach((labelText) => {
    const signature = document.createElement("div");
    signature.className = "closing-receipt-signature";
    const line = document.createElement("span");
    const label = document.createElement("p");
    label.textContent = labelText;
    signature.append(line, label);
    signatures.appendChild(signature);
  });

  const footer = document.createElement("p");
  footer.className = "closing-receipt-footer";
  footer.textContent = details?.snapshot_available
    ? `Closing tersimpan - ${Number(lcSummary.assignment_count) || 0} penugasan LC`
    : "Closing tersimpan";

  const actions = document.createElement("div");
  actions.className = "closing-print-actions";

  const printButton = document.createElement("button");
  printButton.className = "closing-print-button";
  printButton.type = "button";
  printButton.dataset.action = "print-closing";
  printButton.textContent = "Cetak Lengkap";
  printButton.disabled = Boolean(closing?.closing_details_loading);

  const closeButton = document.createElement("button");
  closeButton.className = "closing-print-button secondary";
  closeButton.type = "button";
  closeButton.dataset.action = "hide-closing-print";
  closeButton.textContent = "Tutup Preview";

  actions.append(printButton, closeButton);
  print.append(signatures, footer, actions);
  return print;
}

function createClosingReceiptSection(titleText, rows, modifierClass = "") {
  const section = document.createElement("section");
  section.className = modifierClass
    ? `closing-receipt-section closing-receipt-section--${modifierClass}`
    : "closing-receipt-section";

  const title = document.createElement("h3");
  title.textContent = titleText;
  section.appendChild(title);

  rows.forEach(([labelText, valueText, rowType]) => {
    const row = document.createElement("div");
    row.className = rowType === "total"
      ? "closing-receipt-row closing-receipt-row--total"
      : "closing-receipt-row";
    const label = document.createElement("span");
    label.textContent = labelText;
    const value = document.createElement("strong");
    value.textContent = valueText;
    row.append(label, value);
    section.appendChild(row);
  });

  return section;
}

function createClosingReceiptMessage(messageText) {
  const message = document.createElement("p");
  message.className = "closing-receipt-message";
  message.textContent = messageText;
  return message;
}

function createClosingTransactionDetailsSection(details) {
  const section = document.createElement("section");
  section.className = "closing-receipt-section closing-receipt-details";
  const title = document.createElement("h3");
  title.textContent = "Rincian Transaksi";
  section.appendChild(title);

  const transactions = Array.isArray(details?.transactions) ? details.transactions : [];
  const fnbItems = Array.isArray(details?.fnb_items) ? details.fnb_items : [];
  const itemsByTransaction = fnbItems.reduce((map, item) => {
    const key = String(item.transaction_id || "").trim();
    if (!key) return map;
    if (!map[key]) map[key] = [];
    map[key].push(item);
    return map;
  }, {});

  transactions.forEach((transaction) => {
    const article = document.createElement("article");
    article.className = "closing-receipt-transaction";

    const heading = document.createElement("h4");
    const roomName = transaction.room_name || transaction.room_id || "Transaksi";
    const duration = Number(transaction.duration_minutes) > 0
      ? ` | ${formatClosingDuration(transaction.duration_minutes)}`
      : "";
    heading.textContent = `${roomName}${duration}`;
    article.appendChild(heading);

    if (transaction.start_time || transaction.end_time) {
      const time = document.createElement("p");
      time.className = "closing-receipt-meta";
      time.textContent = `${formatClosingClock(transaction.start_time)}-${formatClosingClock(transaction.end_time)}`;
      article.appendChild(time);
    }

    [
      ["Room", transaction.room_total],
      ["F&B", transaction.fnb_total],
      ["LC", transaction.lc_total],
    ].forEach(([label, amount]) => {
      if (Number(amount)) article.appendChild(createClosingReceiptAmountRow(label, amount));
    });

    (itemsByTransaction[String(transaction.transaction_id || "").trim()] || []).forEach((item) => {
      article.appendChild(createClosingReceiptAmountRow(
        `${formatClosingQuantity(item.quantity)}x ${item.menu_name || "Item F&B"}`,
        item.subtotal,
        "item"
      ));
    });

    if (Number(transaction.promo_discount)) {
      article.appendChild(createClosingReceiptAmountRow("Diskon", -Number(transaction.promo_discount)));
    }
    article.appendChild(createClosingReceiptAmountRow("Total", transaction.grand_total, "total"));

    const payment = document.createElement("p");
    payment.className = "closing-receipt-payment";
    payment.textContent = `${String(transaction.payment_method || "-").toUpperCase()} - ${String(transaction.payment_status || "-").toUpperCase()}`;
    article.appendChild(payment);
    section.appendChild(article);
  });

  const unlinkedOrders = groupClosingFnbItemsByOrder_(fnbItems.filter((item) => !String(item.transaction_id || "").trim()));
  Object.keys(unlinkedOrders).forEach((orderId) => {
    const items = unlinkedOrders[orderId];
    const article = document.createElement("article");
    article.className = "closing-receipt-transaction";
    const heading = document.createElement("h4");
    heading.textContent = `${items[0]?.room_name || "F&B"} | ${String(items[0]?.order_status || "OPEN").toUpperCase()}`;
    article.appendChild(heading);
    items.forEach((item) => {
      article.appendChild(createClosingReceiptAmountRow(
        `${formatClosingQuantity(item.quantity)}x ${item.menu_name || "Item F&B"}`,
        item.subtotal,
        "item"
      ));
    });
    section.appendChild(article);
  });

  if (transactions.length === 0) {
    section.appendChild(createClosingReceiptMessage("Tidak ada transaksi pada snapshot closing."));
  }
  return section;
}

function createClosingReceiptAmountRow(labelText, amount, modifier = "") {
  return createClosingReceiptValueRow(labelText, formatClosingSignedCurrency(amount), modifier);
}

function createClosingReceiptValueRow(labelText, valueText, modifier = "") {
  const row = document.createElement("div");
  row.className = modifier
    ? `closing-receipt-row closing-receipt-row--${modifier}`
    : "closing-receipt-row";
  const label = document.createElement("span");
  label.textContent = labelText;
  const value = document.createElement("strong");
  value.textContent = valueText;
  row.append(label, value);
  return row;
}

function createClosingLcDetailsSection(details) {
  const section = document.createElement("section");
  section.className = "closing-receipt-section closing-receipt-details";
  const title = document.createElement("h3");
  title.textContent = "Rekap LC";
  section.appendChild(title);

  const lcRows = Array.isArray(details?.lc_details) ? details.lc_details : [];
  const groups = lcRows.reduce((map, row) => {
    const key = String(row.lc_id || row.lc_name || "LC").trim();
    if (!map[key]) {
      map[key] = { name: row.lc_name || row.lc_id || "LC", work: [], bonus: [] };
    }
    if (String(row.entry_type || "").toLowerCase() === "bonus") map[key].bonus.push(row);
    else map[key].work.push(row);
    return map;
  }, {});

  Object.values(groups).forEach((group) => {
    const article = document.createElement("article");
    article.className = "closing-receipt-lc";
    const heading = document.createElement("h4");
    heading.textContent = String(group.name || "LC").toUpperCase();
    article.appendChild(heading);

    let completedMinutes = 0;
    let activeCount = 0;
    let roomEarning = 0;
    group.work.forEach((work) => {
      const workStatus = String(work.work_status || "").toLowerCase();
      const isComplete = ["done", "closed", "paid"].includes(workStatus)
        || (!workStatus && Boolean(work.end_time));
      const isActive = workStatus === "active";
      if (isComplete) {
        completedMinutes += Number(work.duration_minutes) || 0;
        roomEarning += Number(work.rate) || 0;
      } else if (isActive) {
        activeCount += 1;
      }

      const line = document.createElement("p");
      line.className = "closing-receipt-lc-line";
      if (isComplete) {
        line.textContent = `${work.room_name || work.room_id || "Room"} ${formatClosingClock(work.start_time)}-${formatClosingClock(work.end_time)} ${formatClosingDuration(work.duration_minutes)}`;
      } else if (isActive) {
        line.textContent = `${work.room_name || work.room_id || "Room"} ${formatClosingClock(work.start_time)}-AKTIF`;
      } else {
        line.textContent = `${work.room_name || work.room_id || "Room"} ${String(work.work_status || "TIDAK SELESAI").toUpperCase()}`;
      }
      article.appendChild(line);
    });

    const bonusTotal = group.bonus.reduce((total, bonus) => total + (Number(bonus.bonus_total) || 0), 0);
    article.appendChild(createClosingReceiptAmountRow(`${group.work.length} sesi | ${formatClosingDuration(completedMinutes)}`, roomEarning));
    article.appendChild(createClosingReceiptAmountRow("Bonus penjualan", bonusTotal));
    article.appendChild(createClosingReceiptAmountRow("Total hak", roomEarning + bonusTotal, "total"));
    if (activeCount > 0) {
      const warning = document.createElement("p");
      warning.className = "closing-receipt-warning";
      warning.textContent = `${activeCount} penugasan masih aktif dan tidak masuk total jam selesai.`;
      article.appendChild(warning);
    }
    section.appendChild(article);
  });

  const summary = details?.summary?.lc || {};
  section.appendChild(createClosingReceiptValueRow("Total penugasan", `${Number(summary.assignment_count) || 0} sesi`));
  section.appendChild(createClosingReceiptValueRow("Total jam LC", formatClosingDuration(summary.completed_duration_minutes)));
  section.appendChild(createClosingReceiptAmountRow("Hak room LC", summary.room_earning_total));
  section.appendChild(createClosingReceiptAmountRow("Bonus LC", summary.sales_bonus_total));
  section.appendChild(createClosingReceiptAmountRow("Kewajiban LC", summary.total_lc_obligation, "total"));

  if (lcRows.length === 0) {
    section.appendChild(createClosingReceiptMessage("Tidak ada aktivitas LC pada closing ini."));
  }
  return section;
}

function createClosingOperationalSummarySection(details) {
  const summary = details?.summary?.transactions || {};
  const fnbItems = Array.isArray(details?.fnb_items) ? details.fnb_items : [];
  const orderIds = new Set(fnbItems.map((item) => item.order_id).filter(Boolean));
  return createClosingReceiptSection("Operasional", [
    ["Room terjual", `${Number(summary.room_sessions) || 0} sesi`],
    ["Total room-hours", formatClosingDuration(summary.room_duration_minutes)],
    ["Order F&B", `${orderIds.size} order`],
    ["Item F&B", `${fnbItems.reduce((total, item) => total + (Number(item.quantity) || 0), 0)} item`],
  ]);
}

function groupClosingFnbItemsByOrder_(items) {
  return items.reduce((map, item) => {
    const key = String(item.order_id || "Tanpa ID").trim();
    if (!map[key]) map[key] = [];
    map[key].push(item);
    return map;
  }, {});
}

function formatClosingClock(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--:--";
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date).replace(".", ":");
}

function formatClosingDate(value) {
  const normalized = String(value || "").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return normalized || "-";
  const [year, month, day] = normalized.split("-");
  return `${day}-${month}-${year}`;
}

function formatClosingDuration(value) {
  const totalMinutes = Math.max(0, Math.round(Number(value) || 0));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}j ${String(minutes).padStart(2, "0")}m`;
}

function formatClosingQuantity(value) {
  const quantity = Number(value) || 0;
  return Number.isInteger(quantity) ? String(quantity) : quantity.toFixed(2).replace(/\.00$/, "");
}

function formatClosingSignedCurrency(value) {
  const amount = Number(value) || 0;
  if (amount < 0) return `-${formatCurrency(Math.abs(amount))}`;
  return formatCurrency(amount);
}

function createLegacyClosingPrintPreviewElement(closing) {
  const print = document.createElement("section");
  print.className = "closing-print";
  print.setAttribute("aria-labelledby", "closing-print-title");

  const header = document.createElement("div");
  header.className = "closing-print-header";

  const title = document.createElement("h2");
  title.className = "closing-print-title";
  title.id = "closing-print-title";
  title.textContent = "Laporan Tutup Shift Kasir";

  const subtitle = document.createElement("p");
  subtitle.className = "closing-print-subtitle";
  subtitle.textContent = "Happy Song Karaoke - arsip operasional kasir";

  header.append(title, subtitle);

  const { note: parsedNote, denoms: parsedDenoms } = parseClosingNoteAndDenoms(closing?.note || "");

  // Main Print Table Report
  const printTable = document.createElement("table");
  printTable.className = "cashier-closing-table";
  printTable.style.width = "100%";
  printTable.style.borderCollapse = "collapse";
  printTable.style.margin = "15px 0";
  printTable.style.fontSize = "12px";

  const printTableBody = document.createElement("tbody");

  // Section 1: Data Closing
  const trDataHeader = document.createElement("tr");
  trDataHeader.className = "table-section-header";
  trDataHeader.style.backgroundColor = "rgba(255, 255, 255, 0.05)";
  const tdDataHeader = document.createElement("td");
  tdDataHeader.colSpan = 2;
  tdDataHeader.style.fontWeight = "800";
  tdDataHeader.textContent = "I. DATA CLOSING";
  trDataHeader.appendChild(tdDataHeader);
  printTableBody.appendChild(trDataHeader);

  const dataRows = [
    ["ID Closing", closing?.closing_id || "-"],
    ["Tanggal Closing", closing?.closing_date || "-"],
    ["Waktu Closing", formatDateTimeLabel(closing?.created_at)],
    ["Kasir", closing?.cashier_name || "-"],
  ];
  dataRows.forEach(([label, value]) => {
    const tr = document.createElement("tr");
    const td1 = document.createElement("td"); td1.style.padding = "8px"; td1.style.borderBottom = "1px solid var(--border)"; td1.textContent = label;
    const td2 = document.createElement("td"); td2.style.padding = "8px"; td2.style.borderBottom = "1px solid var(--border)"; td2.style.textAlign = "right"; td2.textContent = value;
    tr.append(td1, td2);
    printTableBody.appendChild(tr);
  });

  // Section 2: Ringkasan Transaksi
  const trTransHeader = document.createElement("tr");
  trTransHeader.className = "table-section-header";
  trTransHeader.style.backgroundColor = "rgba(255, 255, 255, 0.05)";
  const tdTransHeader = document.createElement("td");
  tdTransHeader.colSpan = 2;
  tdTransHeader.style.fontWeight = "800";
  tdTransHeader.textContent = "II. RINGKASAN TRANSAKSI";
  trTransHeader.appendChild(tdTransHeader);
  printTableBody.appendChild(trTransHeader);

  const transSummaryRows = [
    ["Total Transaksi", `${Number(closing?.total_transactions) || 0} transaksi`],
    ["Transaksi Lunas", `${Number(closing?.paid_transactions) || 0} transaksi`],
    ["Transaksi Belum Dibayar", `${Number(closing?.unpaid_transactions) || 0} transaksi`],
    ["Omzet Lunas", formatCurrency(closing?.paid_revenue)],
    ["Total Tagihan", formatCurrency(closing?.total_revenue)],
  ];
  transSummaryRows.forEach(([label, value]) => {
    const tr = document.createElement("tr");
    const td1 = document.createElement("td"); td1.style.padding = "8px"; td1.style.borderBottom = "1px solid var(--border)"; td1.textContent = label;
    const td2 = document.createElement("td"); td2.style.padding = "8px"; td2.style.borderBottom = "1px solid var(--border)"; td2.style.textAlign = "right"; td2.style.fontWeight = label.includes("Total") || label.includes("Omzet") ? "bold" : "normal"; td2.textContent = value;
    tr.append(td1, td2);
    printTableBody.appendChild(tr);
  });

  // Section 3: Pemeriksaan Kas (Cash)
  const trCashHeader = document.createElement("tr");
  trCashHeader.className = "table-section-header";
  trCashHeader.style.backgroundColor = "rgba(255, 255, 255, 0.05)";
  const tdCashHeader = document.createElement("td");
  tdCashHeader.colSpan = 2;
  tdCashHeader.style.fontWeight = "800";
  tdCashHeader.textContent = "III. PEMERIKSAAN KAS (CASH)";
  trCashHeader.appendChild(tdCashHeader);
  printTableBody.appendChild(trCashHeader);

  const cashSummaryRows = [
    ["Cash Sistem (Expected)", formatCurrency(closing?.cash_expected)],
    ["Cash Aktual (Fisik)", formatCurrency(closing?.cash_actual)],
    ["Selisih Cash", `${formatCurrency(closing?.cash_difference)} - ${getClosingHistoryDifferenceLabel(Number(closing?.cash_difference) || 0)}`],
  ];
  cashSummaryRows.forEach(([label, value]) => {
    const tr = document.createElement("tr");
    tr.className = label === "Selisih Cash" ? `highlight-row ${getCashDifferenceClass(Number(closing?.cash_difference) || 0)}` : "";
    const td1 = document.createElement("td"); td1.style.padding = "8px"; td1.style.borderBottom = "1px solid var(--border)"; td1.textContent = label;
    const td2 = document.createElement("td"); td2.style.padding = "8px"; td2.style.borderBottom = "1px solid var(--border)"; td2.style.textAlign = "right"; td2.style.fontWeight = "bold"; td2.textContent = value;
    tr.append(td1, td2);
    printTableBody.appendChild(tr);
  });

  // Section 4: Rincian Pecahan Uang Fisik jika ada
  if (parsedDenoms.length > 0) {
    const trDenomHeader = document.createElement("tr");
    trDenomHeader.className = "table-section-header";
    trDenomHeader.style.backgroundColor = "rgba(255, 255, 255, 0.05)";
    const tdDenomHeader = document.createElement("td");
    tdDenomHeader.colSpan = 2;
    tdDenomHeader.style.fontWeight = "800";
    tdDenomHeader.textContent = "IV. RINCIAN SETORAN UANG FISIK";
    trDenomHeader.appendChild(tdDenomHeader);
    printTableBody.appendChild(trDenomHeader);

    parsedDenoms.forEach((denom) => {
      const tr = document.createElement("tr");
      const td1 = document.createElement("td"); 
      td1.style.padding = "8px"; 
      td1.style.borderBottom = "1px dashed var(--border)"; 
      td1.textContent = `${denom.label} (x${denom.qty})`;
      
      const td2 = document.createElement("td"); 
      td2.style.padding = "8px"; 
      td2.style.borderBottom = "1px dashed var(--border)"; 
      td2.style.textAlign = "right"; 
      td2.style.fontWeight = "bold";
      td2.className = "text-gold";
      td2.textContent = formatCurrency(denom.total);

      tr.append(td1, td2);
      printTableBody.appendChild(tr);
    });
  }

  // Section 5: Pemeriksaan Transfer & Unpaid
  const trTransferHeader = document.createElement("tr");
  trTransferHeader.className = "table-section-header";
  trTransferHeader.style.backgroundColor = "rgba(255, 255, 255, 0.05)";
  const tdTransferHeader = document.createElement("td");
  tdTransferHeader.colSpan = 2;
  tdTransferHeader.style.fontWeight = "800";
  tdTransferHeader.textContent = "V. PEMERIKSAAN KAS LAINNYA";
  trTransferHeader.appendChild(tdTransferHeader);
  printTableBody.appendChild(trTransferHeader);

  const transferSummaryRows = [
    ["Transfer Sistem", formatCurrency(closing?.transfer_revenue)],
    ["Transaksi Transfer", `${Number(closing?.transfer_transactions) || 0} transaksi`],
    ["Sisa Belum Dibayar (Unpaid)", formatCurrency(closing?.unpaid_revenue)],
  ];
  transferSummaryRows.forEach(([label, value]) => {
    const tr = document.createElement("tr");
    const td1 = document.createElement("td"); td1.style.padding = "8px"; td1.style.borderBottom = "1px solid var(--border)"; td1.textContent = label;
    const td2 = document.createElement("td"); td2.style.padding = "8px"; td2.style.borderBottom = "1px solid var(--border)"; td2.style.textAlign = "right"; td2.textContent = value;
    tr.append(td1, td2);
    printTableBody.appendChild(tr);
  });

  printTable.appendChild(printTableBody);

  const noteSection = document.createElement("section");
  noteSection.className = "closing-print-section";

  const noteTitle = document.createElement("h3");
  noteTitle.textContent = "Catatan Kasir";

  const note = document.createElement("p");
  note.className = "closing-print-note";
  note.textContent = parsedNote || "-";

  noteSection.append(noteTitle, note);

  const signatureSection = document.createElement("section");
  signatureSection.className = "closing-print-signatures";

  ["Kasir", "Owner / Supervisor"].forEach((labelText) => {
    const signature = document.createElement("div");
    signature.className = "closing-print-signature";

    const line = document.createElement("div");
    line.className = "closing-print-signature-line";

    const label = document.createElement("p");
    label.className = "closing-print-label";
    label.textContent = labelText;

    signature.append(line, label);
    signatureSection.appendChild(signature);
  });

  const footer = document.createElement("p");
  footer.className = "closing-print-note";
  footer.textContent = "Dicetak dari Dashboard Kasir Happy Song Karaoke. Simpan laporan ini sebagai arsip tutup shift.";

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
  print.append(header, printTable, noteSection, signatureSection, footer, actions);

  return print;
}

function createClosingPrintSection(titleText, rows, modifierClass = "") {
  const section = document.createElement("section");
  section.className = modifierClass
    ? `closing-print-section ${modifierClass}`
    : "closing-print-section";

  const title = document.createElement("h3");
  title.textContent = titleText;

  const grid = document.createElement("div");
  grid.className = "closing-print-grid";

  rows.forEach(([labelText, valueText, helperText]) => {
    const row = document.createElement("div");
    row.className = "closing-print-row";

    const label = document.createElement("p");
    label.className = "closing-print-label";
    label.textContent = labelText;

    const value = document.createElement("p");
    value.className = "closing-print-value";
    value.textContent = valueText;

    row.append(label, value);

    if (helperText) {
      const helper = document.createElement("p");
      helper.className = "closing-print-helper";
      helper.textContent = helperText;
      row.appendChild(helper);
    }

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
    ["Waktu Closing", formatDateTimeLabel(closing?.created_at)],
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

  const { note: parsedNote, denoms: parsedDenoms } = parseClosingNoteAndDenoms(closing?.note || "");

  const noteItem = document.createElement("div");
  noteItem.className = "cashier-closing-history-note";

  const noteLabel = document.createElement("p");
  noteLabel.className = "cashier-closing-history-label";
  noteLabel.textContent = "Catatan";

  const noteValue = document.createElement("p");
  noteValue.className = "cashier-closing-history-value";
  noteValue.textContent = parsedNote || "-";

  noteItem.append(noteLabel, noteValue);

  if (parsedDenoms.length > 0) {
    const denomDetails = document.createElement("div");
    denomDetails.style.marginTop = "8px";
    denomDetails.style.padding = "6px 10px";
    denomDetails.style.background = "rgba(226, 184, 92, 0.05)";
    denomDetails.style.border = "1px dashed rgba(226, 184, 92, 0.2)";
    denomDetails.style.borderRadius = "4px";
    denomDetails.style.fontSize = "11px";
    denomDetails.style.color = "var(--text-secondary)";

    const denomTitle = document.createElement("strong");
    denomTitle.style.display = "block";
    denomTitle.style.marginBottom = "4px";
    denomTitle.style.color = "var(--gold)";
    denomTitle.textContent = "Rincian Pecahan Uang Fisik:";
    denomDetails.appendChild(denomTitle);

    const listText = parsedDenoms.map(d => `${d.label} (${d.qty}x)`).join(", ");
    const textNode = document.createTextNode(listText);
    denomDetails.appendChild(textNode);
    noteItem.appendChild(denomDetails);
  }

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

  const printButton = document.createElement("button");
  printButton.className = "transaction-action-button";
  printButton.type = "button";
  printButton.dataset.action = "show-receipt-print";
  printButton.dataset.transactionId = transaction?.transaction_id || "";
  printButton.textContent = transaction?.payment_status === "paid" ? "Cetak Ulang" : "Cetak Struk";
  actions.appendChild(printButton);

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
  info.textContent = `Menampilkan ${rangeStart}-${rangeEnd} dari ${totalItems} data - Halaman ${page} dari ${totalPages}`;

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
      bonus_sales_lc: "",
      hpp: "",
      variable_cost_rate: "5",
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
    const stockItemOptions = [
      ["", "-- Tanpa Tracking Stok --"],
      ...inventoryItems.map((item) => [
        item.stock_item_id,
        `${item.stock_item_id} - ${item.stock_item_name || item.stock_item_id} (${item.unit || "unit"})`,
      ]),
    ];

    grid.append(
      createMasterField({ label: "Nama Menu", field: "menu_name" }),
      createMasterField({ label: "Kategori", field: "category" }),
      createMasterField({ label: "Harga", field: "price", type: "number" }),
      createMasterField({ label: "HPP", field: "hpp", type: "number" }),
      createMasterField({ label: "Var Cost %", field: "variable_cost_rate", type: "number" }),
      createMasterField({ label: "Bonus Sales LC", field: "bonus_sales_lc", type: "number" }),
      createMasterField({
        label: "Item Stok Terhubung",
        field: "stock_item_id",
        helper: "Pilih item stok dari Inventory yang berkurang saat menu terjual.",
        options: stockItemOptions,
      }),
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
  const roomTone = ROOM_STATUS_CONFIG[normalizedStatus]?.tone;
  const tone = roomTone
    || (normalizedStatus === "active"
      ? "success"
      : normalizedStatus === "inactive"
        ? "neutral"
        : "neutral");
  const badge = document.createElement("span");
  badge.className = withStatusBadge("master-status-badge", tone);
  badge.textContent = ROOM_STATUS_CONFIG[normalizedStatus]?.label || normalizedStatus || "unknown";
  return badge;
}

function createMasterTable(headers, rows, emptyText, paginationKey = "") {
  const wrapper = document.createElement("div");
  wrapper.className = "master-table-wrap";
  const paginated = paginationKey ? getPaginatedSlice(paginationKey, rows) : null;
  const visibleRows = paginated ? paginated.items : rows;

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
    visibleRows.forEach((cells) => {
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

  if (paginationKey) {
    wrapper.appendChild(createPaginationControlsElement(paginationKey, rows.length));
  }

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

function createSettingsSection(titleText, subtitleText, addType, tableElement, extraControls = null) {
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

  header.appendChild(titleGroup);

  if (addType) {
    const addButton = document.createElement("button");
    addButton.className = "master-button primary";
    addButton.type = "button";
    addButton.dataset.action = "add-master-data";
    addButton.dataset.masterType = addType;
    addButton.textContent = "Tambah";
    header.appendChild(addButton);
  }
  section.append(header);

  if (extraControls) {
    section.appendChild(extraControls);
  }

  section.appendChild(tableElement);
  return section;
}

function createSettingsSearchControl(labelText, value, action, placeholder) {
  const searchWrap = document.createElement("label");
  searchWrap.className = "master-form-field settings-search-field";

  const searchLabel = document.createElement("span");
  searchLabel.className = "master-form-label";
  searchLabel.textContent = labelText;

  const searchInput = document.createElement("input");
  searchInput.type = "search";
  searchInput.className = "master-form-input";
  searchInput.placeholder = placeholder;
  searchInput.value = value;
  searchInput.dataset.action = action;

  searchWrap.append(searchLabel, searchInput);
  return searchWrap;
}

function createSettingsSelectControl(labelText, value, action, options) {
  const wrapper = document.createElement("label");
  wrapper.className = "master-form-field settings-search-field";

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

function matchesSettingsMenuAnalysisFilter(menuItem) {
  const profit = getMenuProfitAnalysis(menuItem);

  if (settingsMenuAnalysisFilter === "margin_danger") {
    return profit.marginPercent < 30;
  }

  if (settingsMenuAnalysisFilter === "margin_warning") {
    return profit.marginPercent >= 30 && profit.marginPercent < 40;
  }

  if (settingsMenuAnalysisFilter === "hpp_empty") {
    return profit.hpp <= 0;
  }

  if (settingsMenuAnalysisFilter === "bonus_lc") {
    return Number(menuItem?.bonus_sales_lc) > 0;
  }

  if (settingsMenuAnalysisFilter === "varcost_empty") {
    return profit.variableCostRate <= 0;
  }

  return true;
}

function createSettingsSubTabsElement() {
  const tabs = [
    ["rooms", "Ruangan"],
    ["menu", "Menu F&B"],
    ["packages", "Paket"],
    ["inventory", "Inventory"],
    ["access", "Akses"],
    ["audit", "Audit"],
    ["quality", "Kualitas Data"],
  ];
  const nav = document.createElement("div");
  nav.className = "settings-sub-tabs";

  tabs.forEach(([key, label]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = key === activeSettingsSubTab ? "settings-sub-tab active" : "settings-sub-tab";
    button.dataset.action = "switch-settings-subtab";
    button.dataset.settingsTab = key;
    button.textContent = label;
    nav.appendChild(button);
  });

  return nav;
}

function getActiveSettingsSectionElement() {
  if (activeSettingsSubTab === "menu") {
    return createMenuSettingsSection();
  }

  if (activeSettingsSubTab === "inventory") {
    return createInventorySettingsSection();
  }

  if (activeSettingsSubTab === "packages") {
    return createPackageSettingsSection();
  }

  if (activeSettingsSubTab === "access") {
    return createAccessSettingsSection();
  }

  if (activeSettingsSubTab === "audit") {
    return createMasterAuditLogSection();
  }

  if (activeSettingsSubTab === "quality") {
    return createMasterDataQualitySection();
  }

  return createRoomSettingsSection();
}

function createRoomSettingsSection() {
  const query = settingsRoomSearchQuery.trim().toLowerCase();
  const filteredRooms = query
    ? rooms.filter((room) => [
      room.room_id,
      room.room_name,
      room.status,
      room.tv_device_id,
    ].join(" ").toLowerCase().includes(query))
    : rooms;
  const rows = filteredRooms.map((room) => [
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
    createMasterTable(["ID", "Room", "Tarif/Jam", "TV", "Status", "Aksi"], rows, "Room tidak ditemukan.", "settingsRooms"),
    createSettingsSearchControl("Cari Ruangan", settingsRoomSearchQuery, "filter-settings-room", "Cari nama room, ID, status, atau TV")
  );
}

function getMenuProfitAnalysis(menuItem) {
  const price = Number(menuItem?.price) || 0;
  const hpp = Number(menuItem?.hpp) || 0;
  const variableCostRate = Number(menuItem?.variable_cost_rate) || 0;
  const bonusSalesLc = Number(menuItem?.bonus_sales_lc) || 0;
  const variableCostAmount = Number.isFinite(Number(menuItem?.variable_cost_amount))
    ? Number(menuItem.variable_cost_amount)
    : price * variableCostRate / 100;
  const marginAmount = Number.isFinite(Number(menuItem?.margin_amount))
    ? Number(menuItem.margin_amount)
    : price - hpp - variableCostAmount - bonusSalesLc;
  const marginPercent = Number.isFinite(Number(menuItem?.margin_percent))
    ? Number(menuItem.margin_percent)
    : price > 0 ? marginAmount / price * 100 : 0;

  return {
    hpp,
    variableCostRate,
    variableCostAmount,
    marginAmount,
    marginPercent,
  };
}

function createMenuSettingsSection() {
  const query = settingsMenuSearchQuery.trim().toLowerCase();
  const filteredMenuItems = menuItems.filter((menuItem) => {
    const matchesAnalysis = matchesSettingsMenuAnalysisFilter(menuItem);

    if (!matchesAnalysis) {
      return false;
    }

    if (query) {
      const haystack = [
        menuItem.menu_id,
        menuItem.menu_name,
        menuItem.category,
        menuItem.stock_item_id,
      ].join(" ").toLowerCase();

      return haystack.includes(query);
    }

    return true;
  });

  const controls = document.createElement("div");
  controls.className = "settings-control-row";
  controls.append(
    createSettingsSearchControl(
      "Cari Menu F&B",
      settingsMenuSearchQuery,
      "filter-settings-menu",
      "Cari nama, kategori, ID menu, atau stock item"
    ),
    createSettingsSelectControl(
      "Filter Analisa",
      settingsMenuAnalysisFilter,
      "filter-settings-menu-analysis",
      [
        ["all", "Semua"],
        ["margin_danger", "Margin Bahaya (<30%)"],
        ["margin_warning", "Margin Tipis (30-40%)"],
        ["hpp_empty", "HPP Kosong"],
        ["bonus_lc", "Bonus LC Ada"],
        ["varcost_empty", "Var Cost Kosong"],
      ]
    )
  );

  const rows = filteredMenuItems.map((menuItem) => {
    const profit = getMenuProfitAnalysis(menuItem);

    return [
      menuItem.menu_id || "-",
      menuItem.menu_name || "-",
      menuItem.category || "-",
      formatCurrency(menuItem.price),
      formatCurrency(profit.hpp),
      `${formatDecimal(profit.variableCostRate)}% / ${formatCurrency(profit.variableCostAmount)}`,
      formatCurrency(menuItem.bonus_sales_lc || 0),
      formatCurrency(profit.marginAmount),
      formatPercent(profit.marginPercent),
      getMasterStatusBadge(menuItem.status),
      createMasterActionButton("menu", menuItem),
    ];
  });

  return createSettingsSection(
    "Pengaturan Menu F&B",
    "Kelola menu aktif/inaktif dan mapping stok.",
    "menu",
    createMasterTable(["ID", "Menu", "Kategori", "Harga", "HPP", "Var Cost", "Bonus LC", "Margin", "Margin %", "Status", "Aksi"], rows, "Menu tidak ditemukan.", "settingsMenu"),
    controls
  );
}

function createInventorySettingsSection() {
  const query = settingsInventorySearchQuery.trim().toLowerCase();
  const filteredInventoryItems = query
    ? inventoryItems.filter((item) => [
      item.stock_item_id,
      item.stock_item_name,
      item.category,
      item.unit,
      item.status,
    ].join(" ").toLowerCase().includes(query))
    : inventoryItems;
  const rows = filteredInventoryItems.map((item) => [
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
    createMasterTable(["ID", "Item", "Kategori", "Unit", "Stok", "Min", "Status", "Aksi"], rows, "Inventory tidak ditemukan.", "settingsInventory"),
    createSettingsSearchControl("Cari Inventory", settingsInventorySearchQuery, "filter-settings-inventory", "Cari item, kategori, unit, ID, atau status")
  );
}

function getPackageDetailsForSettings(packageId) {
  return packageDetailsByPackageId[packageId] || [];
}

function getPackageComponentLabel(type) {
  const normalized = String(type || "").trim().toLowerCase();
  const labels = {
    menu: "Menu F&B",
    service: "Service",
    inventory: "Inventory",
    room: "Room",
  };

  return labels[normalized] || type || "-";
}

function createPackageDetailButton(pkg) {
  const actions = document.createElement("div");
  actions.className = "master-row-actions";

  const button = document.createElement("button");
  button.className = pkg.package_id === selectedSettingsPackageId ? "master-button primary" : "master-button";
  button.type = "button";
  button.dataset.action = "view-settings-package-detail";
  button.dataset.packageId = pkg.package_id || "";
  button.disabled = !pkg.package_id || isLoadingPackageDetails;
  button.textContent = pkg.package_id === selectedSettingsPackageId ? "Terbuka" : "Detail";

  actions.appendChild(button);
  return actions;
}

function createPackageDetailsElement() {
  if (!selectedSettingsPackageId) {
    return createStateMessage("Pilih Detail pada salah satu paket untuk melihat isi paket.");
  }

  const selectedPackage = packages.find((pkg) => pkg.package_id === selectedSettingsPackageId);
  const details = getPackageDetailsForSettings(selectedSettingsPackageId);
  const wrapper = document.createElement("div");
  wrapper.className = "settings-package-detail";

  const title = document.createElement("h4");
  title.className = "settings-section-title";
  title.textContent = selectedPackage
    ? `Isi Paket: ${selectedPackage.package_name}`
    : `Isi Paket: ${selectedSettingsPackageId}`;

  if (isLoadingPackageDetails) {
    wrapper.append(title, createStateMessage("Memuat detail paket..."));
    return wrapper;
  }

  const rows = details.map((detail) => [
    detail.line_no ? String(detail.line_no) : "-",
    getPackageComponentLabel(detail.component_type),
    detail.component_name || detail.component_ref_id || "-",
    detail.component_ref_id || "-",
    `${formatDecimal(detail.qty)} ${detail.unit || ""}`.trim(),
    formatCurrency(detail.hpp || detail.cost_amount || 0),
    detail.is_choice ? "Pilihan" : "Included",
    detail.note || "-",
  ]);

  wrapper.append(
    title,
    createMasterTable(
      ["No", "Tipe", "Komponen", "Ref", "Qty", "HPP/Cost", "Mode", "Catatan"],
      rows,
      "Detail paket belum ada.",
      "settingsPackageDetails"
    )
  );

  return wrapper;
}

function createPackageSettingsSection() {
  const query = settingsPackageSearchQuery.trim().toLowerCase();
  const filteredPackages = query
    ? packages.filter((pkg) => [
      pkg.package_id,
      pkg.package_name,
      pkg.package_category,
      pkg.package_type,
      pkg.status,
      pkg.valid_day_type,
      pkg.note,
    ].join(" ").toLowerCase().includes(query))
    : packages;

  const rows = filteredPackages.map((pkg) => [
    pkg.package_id || "-",
    pkg.package_name || "-",
    pkg.package_category || "-",
    formatCurrency(pkg.selling_price || 0),
    `${Number(pkg.duration_minutes) || 0} menit`,
    pkg.valid_day_type || "-",
    getMasterStatusBadge(pkg.status),
    createPackageDetailButton(pkg),
  ]);

  const content = document.createElement("div");
  content.className = "settings-package-content";
  content.append(
    createMasterTable(
      ["ID", "Paket", "Kategori", "Harga", "Durasi", "Hari", "Status", "Detail"],
      rows,
      "Paket tidak ditemukan.",
      "settingsPackages"
    ),
    createPackageDetailsElement()
  );

  return createSettingsSection(
    "Pengaturan Paket",
    "Lihat master paket dan komponen included sebelum tahap tambah/edit paket diaktifkan.",
    "",
    content,
    createSettingsSearchControl("Cari Paket", settingsPackageSearchQuery, "filter-settings-package", "Cari nama paket, kategori, ID, status, atau catatan")
  );
}

function createAccessSettingsSection() {
  const query = settingsAccessSearchQuery.trim().toLowerCase();
  const filteredEmployees = query
    ? employees.filter((employee) => [
      employee.employee_id,
      employee.employee_name,
      employee.role,
      employee.status,
    ].join(" ").toLowerCase().includes(query))
    : employees;

  const refreshButton = document.createElement("button");
  refreshButton.className = "master-button";
  refreshButton.type = "button";
  refreshButton.dataset.action = "refresh-settings-data";
  refreshButton.disabled = isLoadingSettingsData || !API_BASE_URL.trim();
  refreshButton.textContent = isLoadingSettingsData ? "Memuat..." : "Refresh Akses";

  const controls = document.createElement("div");
  controls.className = "settings-control-row";
  controls.append(
    createSettingsSearchControl("Cari Akses", settingsAccessSearchQuery, "filter-settings-access", "Cari nama, role, status, atau ID"),
    refreshButton
  );

  const rows = filteredEmployees.map((employee) => [
    employee.employee_id || "-",
    employee.employee_name || "-",
    getMasterStatusBadge(employee.role),
    getMasterStatusBadge(employee.status),
  ]);

  return createSettingsSection(
    "Pengaturan Akses",
    "Daftar role aktif untuk proteksi PIN owner/manager.",
    "",
    createMasterTable(["ID", "Nama", "Role", "Status"], rows, "Data akses tidak ditemukan.", "settingsAccess"),
    controls
  );
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
  const validStatuses = VALID_ROOM_STATUS_KEYS;
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
    "Tidak ada issue master data.",
    "settingsQuality"
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
    formatDateTimeLabel(log.created_at),
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
        "Belum ada audit log master data.",
        "settingsAudit"
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
  subtitle.textContent = "Kelola master data ruangan, menu F&B, dan inventory.";
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

  if (isLoadingSettingsData) {
    panel.appendChild(createStateMessage("Memuat data pengaturan..."));
    return panel;
  }

  panel.append(
    createSettingsSubTabsElement(),
    getActiveSettingsSectionElement()
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
    title: "PIN Manager Delete Permanen",
    message: `Masukkan PIN owner/manager untuk menghapus permanen ${deleteMasterConfirmation.name || deleteMasterConfirmation.id}.`,
    requestedAction: `delete_permanent_${deleteMasterConfirmation.type}`,
    requiredRole: "manager",
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
    await loadSettingsTabData({ force: true });
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

function openAdminPinModal({ title, message, requestedAction, requiredRole = "manager", validatePin = true, onSuccess }) {
  const operatorPin = getLoggedInOperatorPin();
  if (isOperatorLoggedIn() && roleMeetsRequired(currentOperator.role, requiredRole) && operatorPin) {
    console.log("openAdminPinModal: Bypassing PIN modal, operator role matches or exceeds required role.");
    if (typeof onSuccess === "function") {
      setTimeout(async () => {
        try {
          await onSuccess({ success: true, employee: currentOperator }, operatorPin);
        } catch (err) {
          console.error("Error executing onSuccess in bypassed PIN validation:", err);
        }
      }, 0);
    }
    return;
  }

  adminPinModal = {
    title: title || "PIN Manager",
    message: message || "Masukkan PIN owner/manager untuk melanjutkan.",
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
  console.log("submitAdminPinModal: triggered");
  if (!adminPinModal || isValidatingAdminPin) {
    console.log("submitAdminPinModal: skipped, adminPinModal is null or already validating", { adminPinModal, isValidatingAdminPin });
    return;
  }

  const adminPin = String(adminPinModal.pin || "").trim();

  if (!adminPin) {
    console.log("submitAdminPinModal: failed, empty pin");
    adminPinModal = {
      ...adminPinModal,
      error: "PIN wajib diisi.",
    };
    renderRooms();
    return;
  }

  const pendingAction = adminPinModal.onSuccess;
  console.log("submitAdminPinModal: pendingAction is", typeof pendingAction);

  if (adminPinModal.validatePin === false) {
    console.log("submitAdminPinModal: bypassing validation");
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

  console.log("submitAdminPinModal: starting API validation request...");
  isValidatingAdminPin = true;
  renderRooms();

  try {
    const data = await postApiAction({
      action: "validateAdminPin",
      pin: adminPin,
      required_role: adminPinModal.requiredRole || "manager",
      requested_action: adminPinModal.requestedAction || "admin_action",
      changed_by: getLoggedInOperatorName(),
    });

    console.log("submitAdminPinModal: validation API response received", data);

    if (!data || (data.ok !== true && data.success !== true)) {
      throw new Error(data?.message || data?.error || "PIN owner/manager tidak valid.");
    }

    const authData = data.data || {};
    console.log("submitAdminPinModal: validation successful, authData:", authData);
    adminPinModal = null;
    isValidatingAdminPin = false;
    renderRooms();

    if (typeof pendingAction === "function") {
      console.log("submitAdminPinModal: executing pending success action...");
      await pendingAction(authData, adminPin);
    }
  } catch (error) {
    console.error("submitAdminPinModal: error validated PIN", error);
    adminPinModal = {
      ...adminPinModal,
      pin: "",
      error: error.message || "PIN owner/manager tidak valid.",
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
  title.textContent = adminPinModal.title || "PIN Manager";

  const message = document.createElement("p");
  message.className = "master-delete-warning";
  message.textContent = adminPinModal.message || "Masukkan PIN owner/manager untuk melanjutkan.";

  const field = document.createElement("label");
  field.className = "master-form-field";

  const label = document.createElement("span");
  label.className = "master-form-label";
  label.textContent = "PIN Owner/Manager";

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
      hpp: Number(values.hpp || 0),
      variable_cost_rate: Number(values.variable_cost_rate || 0),
      bonus_sales_lc: Number(values.bonus_sales_lc || 0),
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
      title: "PIN Manager Master Data",
      message: getSensitiveMasterDataMessage(),
      requestedAction: getSensitiveMasterDataAction(),
      requiredRole: "manager",
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
    return "Masukkan PIN owner/manager untuk menyimpan perubahan.";
  }

  const labels = {
    edit_room_price: "mengubah tarif room",
    set_room_maintenance: "mengubah status maintenance room",
    edit_menu_price: "mengubah harga menu",
  };
  const action = getSensitiveMasterDataAction();

  return `Masukkan PIN owner/manager untuk ${labels[action] || "menyimpan perubahan sensitif"}.`;
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
    await loadSettingsTabData({ force: true });
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
  return DASHBOARD_TABS.some((tab) => tab.key === tabKey) && canAccessDashboardTab(tabKey);
}

function isValidReportSubTab(tabKey) {
  const allowedTabs = ROLE_REPORT_SUB_TABS[getCurrentOperatorRole()] || [];
  return REPORT_SUB_TABS.some((tab) => tab.key === tabKey) && allowedTabs.includes(tabKey);
}

function ensureActiveDashboardTabAllowed() {
  if (!isValidDashboardTab(activeDashboardTab)) {
    activeDashboardTab = getDefaultDashboardTabForCurrentRole();
    saveActiveDashboardTab(activeDashboardTab);
  }
}

function ensureActiveReportSubTabAllowed() {
  if (!isValidReportSubTab(activeReportSubTab)) {
    activeReportSubTab = (ROLE_REPORT_SUB_TABS[getCurrentOperatorRole()] || [])[0] || "cashier";
  }
}

function setActiveReportSubTab(tabKey) {
  if (!isValidReportSubTab(tabKey) || activeReportSubTab === tabKey) {
    return;
  }

  activeReportSubTab = tabKey;
  renderRooms();
  refreshActiveReportSubTabData();
}

async function refreshActiveReportSubTabData() {
  switch (activeReportSubTab) {
    case "owner":
      await loadOwnerPeriodReport();
      await loadOwnerDashboardSummary();
      break;
    case "fnb":
      await loadTodayFnbSalesReport();
      break;
    case "cashier":
      await loadTodayCashierClosings();
      break;
    case "room":
      await loadRoomUsageReport();
      break;
    default:
      break;
  }
}

function setActiveDashboardTab(tabKey) {
  if (!isValidDashboardTab(tabKey) || activeDashboardTab === tabKey) {
    return;
  }

  activeDashboardTab = tabKey;
  saveActiveDashboardTab(tabKey);
  renderRooms();
  refreshActiveTabData();

  if (tabKey === "rooms" && isOperatorLoggedIn() && !isUserBusy()) {
    silentReloadRooms();
  }
}

function refreshActiveTabData() {
  ensureActiveDashboardTabAllowed();

  if (!API_BASE_URL.trim() && activeDashboardTab !== "rooms") {
    return;
  }

  switch (activeDashboardTab) {
    case "rooms":
      loadRoomRecoveryCandidates();
      break;
    case "fnb":
      loadInventoryItems();
      loadMenuItems();
      loadOpenFnbOrders();
      loadTodayFnbOrders();
      break;
    case "stock":
      loadInventoryItems();
      loadTodayStockMovements();
      break;
    case "reports":
      refreshActiveReportSubTabData();
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
    case "lc":
      if (activeLcSubTab === "master") {
        loadLcs();
      } else if (activeLcSubTab === "reports") {
        loadLcWorkReports(lcReportPeriod, lcReportStartDate, lcReportEndDate);
      } else if (activeLcSubTab === "payroll") {
        loadLcPayrollData();
      } else if (activeLcSubTab === "finance") {
        loadLcs(true);
        loadLcFinanceSummary();
      }
      break;
    case "promosi":
      loadPromos();
      break;
    default:
      break;
  }
}

// ==========================================
// PROMOSI & VOUCHER FUNCTIONS
// ==========================================
let promosList = [];
let isLoadingPromos = false;
let isSavingPromo = false;
let showAddPromoModal = false;

async function loadPromos() {
  if (!API_BASE_URL.trim()) {
    promosList = [
      { code: "MERDEKA50", type: "promo", discount_type: "percentage", discount_value: 50, status: "active", created_at: "2026-07-24T00:00:00Z" },
      { code: "VCH100K", type: "voucher", discount_type: "nominal", discount_value: 100000, status: "active", created_at: "2026-07-24T00:00:00Z", used_in_transaction_id: "", used_at: "" }
    ];
    return;
  }

  isLoadingPromos = true;
  if (activeDashboardTab === "promosi") {
    renderRooms();
  }

  try {
    const res = await fetchPeriodApiResponse(`${API_BASE_URL}?action=getPromos`);
    const data = await res.json();
    if (data && data.success) {
      promosList = data.promos || [];
    }
  } catch (error) {
    console.error("Error loading promos:", error);
  } finally {
    isLoadingPromos = false;
    if (activeDashboardTab === "promosi") {
      renderRooms();
    }
  }
}

async function executeSavePromo(promoData) {
  if (!API_BASE_URL.trim()) {
    promosList.push({
      ...promoData,
      status: "active",
      used_in_transaction_id: "",
      used_at: "",
      created_at: new Date().toISOString()
    });
    showAddPromoModal = false;
    alert("Promo berhasil ditambahkan (Mock Mode).");
    renderRooms();
    return;
  }

  isSavingPromo = true;
  renderRooms();

  try {
    const data = await postApiAction({
      action: "savePromo",
      ...promoData
    });
    if (data && data.success) {
      alert(data.message || "Kode promosi berhasil disimpan.");
      showAddPromoModal = false;
      await loadPromos();
    } else {
      alert(data.error || "Gagal menyimpan kode promosi.");
    }
  } catch (error) {
    console.error("Error saving promo:", error);
    alert(error.message || "Terjadi kesalahan koneksi saat menyimpan.");
  } finally {
    isSavingPromo = false;
    renderRooms();
  }
}

async function executeDeletePromo(code) {
  if (!confirm(`Apakah Anda yakin ingin menghapus kode "${code}" secara permanen?`)) {
    return;
  }

  if (!API_BASE_URL.trim()) {
    promosList = promosList.filter(p => p.code !== code);
    alert("Promo berhasil dihapus (Mock Mode).");
    renderRooms();
    return;
  }

  try {
    const data = await postApiAction({
      action: "deletePromo",
      code: code
    });
    if (data && data.success) {
      alert(data.message || "Kode promosi berhasil dihapus.");
      await loadPromos();
    } else {
      alert(data.error || "Gagal menghapus kode.");
    }
  } catch (error) {
    console.error("Error deleting promo:", error);
    alert(error.message || "Terjadi kesalahan koneksi saat menghapus.");
  }
}

async function togglePromoStatus(code, currentStatus) {
  const newStatus = currentStatus === "active" ? "inactive" : "active";

  if (!API_BASE_URL.trim()) {
    const promo = promosList.find(p => p.code === code);
    if (promo) {
      promo.status = newStatus;
    }
    renderRooms();
    return;
  }

  try {
    const data = await postApiAction({
      action: "updatePromoStatus",
      code: code,
      status: newStatus
    });
    if (data && data.success) {
      await loadPromos();
    } else {
      alert(data.error || "Gagal mengubah status.");
    }
  } catch (error) {
    console.error("Error updating status:", error);
    alert(error.message || "Terjadi kesalahan koneksi.");
  }
}

function createPromosiPanelElement() {
  const panel = document.createElement("section");
  panel.className = "promosi-panel erp-card";
  panel.style.padding = "24px";
  panel.style.display = "flex";
  panel.style.flexDirection = "column";
  panel.style.gap = "20px";

  const header = document.createElement("div");
  header.style.display = "flex";
  header.style.justifyContent = "space-between";
  header.style.alignItems = "center";

  const title = document.createElement("h2");
  title.className = "font-title";
  title.style.margin = "0";
  title.style.color = "var(--gold)";
  title.textContent = "Manajemen Promosi & Voucher";

  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.className = "erp-btn erp-btn-primary erp-btn-solid-gold";
  addBtn.style.padding = "10px 20px";
  addBtn.style.fontWeight = "bold";
  addBtn.textContent = "+ Buat Promo / Voucher";
  addBtn.onclick = () => {
    showAddPromoModal = true;
    renderRooms();
  };

  header.append(title, addBtn);
  panel.appendChild(header);

  if (isLoadingPromos) {
    panel.appendChild(createStateMessage("Memuat data promosi..."));
  } else if (promosList.length === 0) {
    panel.appendChild(createStateMessage("Belum ada kode promo atau voucher yang terdaftar.", "info"));
  } else {
    const tableWrapper = document.createElement("div");
    tableWrapper.className = "table-responsive";

    const table = document.createElement("table");
    table.className = "erp-table";
    table.style.width = "100%";
    table.style.borderCollapse = "collapse";

    table.innerHTML = `
      <thead>
        <tr>
          <th>Kode Promo</th>
          <th>Tipe</th>
          <th>Tipe Diskon</th>
          <th>Nilai Potongan</th>
          <th>Status</th>
          <th>Penggunaan</th>
          <th style="text-align: center;">Aksi</th>
        </tr>
      </thead>
      <tbody>
        ${promosList.map(row => {
          const typeLabel = row.type === "voucher" ? "Voucher (Sekali Pakai)" : "Promo (Berkali-kali)";
          const discTypeLabel = row.discount_type === "percentage" ? "Persentase (%)" : "Potongan Rupiah (Nominal)";
          const discValLabel = row.discount_type === "percentage" ? `${row.discount_value}%` : formatCurrency(row.discount_value);
          const statusBadge = row.status === "active"
            ? `<span class="badge badge-success" style="background-color: var(--success); color: #fff; padding: 2px 6px; border-radius: 4px; font-size:11px;">Aktif</span>`
            : `<span class="badge badge-error" style="background-color: var(--error); color: #fff; padding: 2px 6px; border-radius: 4px; font-size:11px;">Tidak Aktif</span>`;
          
          let usageInfo = "-";
          if (row.type === "voucher") {
            if (row.used_in_transaction_id) {
              usageInfo = `<span style="color: var(--muted); font-size:11px;">Dipakai di ${row.used_in_transaction_id}<br>${formatSimpleDate(row.used_at)}</span>`;
            } else {
              usageInfo = `<span class="badge badge-info" style="border: 1px solid var(--gold); color: var(--gold); padding: 1px 4px; border-radius: 3px; font-size:10px;">Belum Terpakai</span>`;
            }
          }

          return `
            <tr>
              <td><strong>${escapeHtml(row.code)}</strong></td>
              <td>${typeLabel}</td>
              <td>${discTypeLabel}</td>
              <td><strong>${discValLabel}</strong></td>
              <td>${statusBadge}</td>
              <td>${usageInfo}</td>
              <td style="text-align: center; white-space: nowrap; gap: 6px;">
                <button type="button" class="erp-btn erp-btn-secondary btn-toggle-status" style="padding: 4px 8px; font-size: 12px; margin-right: 6px;" data-code="${row.code}" data-status="${row.status}">
                  ${row.status === "active" ? "Nonaktifkan" : "Aktifkan"}
                </button>
                <button type="button" class="erp-btn erp-btn-secondary btn-delete-promo" style="padding: 4px 8px; font-size: 12px; border-color: var(--error); color: var(--error);" data-code="${row.code}">
                  Hapus
                </button>
              </td>
            </tr>
          `;
        }).join("")}
      </tbody>
    `;

    table.querySelectorAll(".btn-toggle-status").forEach(btn => {
      btn.onclick = () => {
        togglePromoStatus(btn.dataset.code, btn.dataset.status);
      };
    });

    table.querySelectorAll(".btn-delete-promo").forEach(btn => {
      btn.onclick = () => {
        executeDeletePromo(btn.dataset.code);
      };
    });

    tableWrapper.appendChild(table);
    panel.appendChild(tableWrapper);
  }

  if (showAddPromoModal) {
    panel.appendChild(createAddPromoModalOverlay());
  }

  return panel;
}

function createAddPromoModalOverlay() {
  const overlay = document.createElement("div");
  overlay.className = "admin-pin-modal-overlay";
  overlay.style.position = "fixed";
  overlay.style.top = "0";
  overlay.style.left = "0";
  overlay.style.width = "100%";
  overlay.style.height = "100%";
  overlay.style.backgroundColor = "rgba(0,0,0,0.7)";
  overlay.style.display = "flex";
  overlay.style.justifyContent = "center";
  overlay.style.alignItems = "center";
  overlay.style.zIndex = "1020";

  const formCard = document.createElement("form");
  formCard.className = "erp-card";
  formCard.style.width = "400px";
  formCard.style.padding = "24px";
  formCard.style.display = "flex";
  formCard.style.flexDirection = "column";
  formCard.style.gap = "16px";
  formCard.style.backgroundColor = "var(--surface-raised)";
  formCard.style.border = "1px solid var(--border)";

  const title = document.createElement("h3");
  title.className = "font-title";
  title.style.margin = "0";
  title.style.color = "var(--gold)";
  title.textContent = "Buat Kode Promo / Voucher";

  const codeGroup = document.createElement("div");
  codeGroup.style.display = "flex";
  codeGroup.style.flexDirection = "column";
  codeGroup.style.gap = "6px";
  const codeLabel = document.createElement("label");
  codeLabel.textContent = "Kode Promo (Kapital, tanpa spasi):";
  const codeInput = document.createElement("input");
  codeInput.type = "text";
  codeInput.placeholder = "Contoh: MERDEKA50";
  codeInput.required = true;
  codeInput.style.padding = "8px";
  codeInput.style.backgroundColor = "var(--surface)";
  codeInput.style.color = "var(--text)";
  codeInput.style.border = "1px solid var(--border)";
  codeInput.style.borderRadius = "4px";
  codeInput.oninput = (e) => {
    e.target.value = e.target.value.toUpperCase().replace(/\s+/g, "");
  };
  codeGroup.append(codeLabel, codeInput);

  const typeGroup = document.createElement("div");
  typeGroup.style.display = "flex";
  typeGroup.style.flexDirection = "column";
  typeGroup.style.gap = "6px";
  const typeLabel = document.createElement("label");
  typeLabel.textContent = "Tipe Penggunaan:";
  const typeSelect = document.createElement("select");
  typeSelect.style.padding = "8px";
  typeSelect.style.backgroundColor = "var(--surface)";
  typeSelect.style.color = "var(--text)";
  typeSelect.style.border = "1px solid var(--border)";
  typeSelect.style.borderRadius = "4px";
  typeSelect.innerHTML = `
    <option value="promo">Promo (Bisa dipakai berulang kali)</option>
    <option value="voucher">Voucher (Sekali pakai)</option>
  `;
  typeGroup.append(typeLabel, typeSelect);

  const discTypeGroup = document.createElement("div");
  discTypeGroup.style.display = "flex";
  discTypeGroup.style.flexDirection = "column";
  discTypeGroup.style.gap = "6px";
  const discTypeLabel = document.createElement("label");
  discTypeLabel.textContent = "Tipe Potongan:";
  const discTypeSelect = document.createElement("select");
  discTypeSelect.style.padding = "8px";
  discTypeSelect.style.backgroundColor = "var(--surface)";
  discTypeSelect.style.color = "var(--text)";
  discTypeSelect.style.border = "1px solid var(--border)";
  discTypeSelect.style.borderRadius = "4px";
  discTypeSelect.innerHTML = `
    <option value="percentage">Persentase (%)</option>
    <option value="nominal">Nominal Rupiah (Rp)</option>
  `;
  discTypeGroup.append(discTypeLabel, discTypeSelect);

  const valGroup = document.createElement("div");
  valGroup.style.display = "flex";
  valGroup.style.flexDirection = "column";
  valGroup.style.gap = "6px";
  const valLabel = document.createElement("label");
  valLabel.textContent = "Nilai Potongan:";
  const valInput = document.createElement("input");
  valInput.type = "number";
  valInput.min = "1";
  valInput.placeholder = "Persen (1-100) atau nominal (misal: 50000)";
  valInput.required = true;
  valInput.style.padding = "8px";
  valInput.style.backgroundColor = "var(--surface)";
  valInput.style.color = "var(--text)";
  valInput.style.border = "1px solid var(--border)";
  valInput.style.borderRadius = "4px";
  valGroup.append(valLabel, valInput);

  discTypeSelect.onchange = () => {
    if (discTypeSelect.value === "percentage") {
      valInput.max = "100";
      valInput.placeholder = "Masukkan nilai persen (1 - 100)";
    } else {
      valInput.removeAttribute("max");
      valInput.placeholder = "Masukkan nominal rupiah (misal: 50000)";
    }
  };

  const actionGroup = document.createElement("div");
  actionGroup.style.display = "flex";
  actionGroup.style.gap = "8px";
  actionGroup.style.justifyContent = "flex-end";

  const saveBtn = document.createElement("button");
  saveBtn.type = "submit";
  saveBtn.className = "erp-btn erp-btn-primary erp-btn-solid-gold";
  saveBtn.style.padding = "8px 16px";
  saveBtn.style.fontWeight = "bold";
  saveBtn.textContent = isSavingPromo ? "Menyimpan..." : "Simpan";
  saveBtn.disabled = isSavingPromo;

  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "erp-btn erp-btn-secondary";
  cancelBtn.style.padding = "8px 16px";
  cancelBtn.textContent = "Batal";
  cancelBtn.onclick = () => {
    showAddPromoModal = false;
    renderRooms();
  };

  actionGroup.append(saveBtn, cancelBtn);
  formCard.append(title, codeGroup, typeGroup, discTypeGroup, valGroup, actionGroup);
  overlay.appendChild(formCard);

  formCard.onsubmit = async (e) => {
    e.preventDefault();
    const payload = {
      code: codeInput.value,
      type: typeSelect.value,
      discount_type: discTypeSelect.value,
      discount_value: Number(valInput.value)
    };
    await executeSavePromo(payload);
  };

  return overlay;
}

// ==========================================
// LADY COMPANION (LC) INTEGRATION FUNCTIONS
// ==========================================

async function loadLcs(force = false) {
  if (lcs.length > 0 && !force) {
    return;
  }

  if (!API_BASE_URL.trim()) {
    lcs = [
      { lc_id: "LC-001", lc_name: "Siska", rate_per_room: 175000, status: "active", availability: "available", updated_at: "2026-07-23T09:00:00Z" },
      { lc_id: "LC-002", lc_name: "Rina", rate_per_room: 175000, status: "active", availability: "available", updated_at: "2026-07-23T09:00:00Z" },
      { lc_id: "LC-003", lc_name: "Amel", rate_per_room: 200000, status: "active", availability: "busy", updated_at: "2026-07-23T09:00:00Z" },
    ];
    return;
  }

  isLoadingLcs = true;
  if (activeDashboardTab === "lc") {
    renderRooms();
  }
  try {
    const response = await fetchPeriodApiResponse(`${API_BASE_URL}?action=getLcMasterList`);
    const data = await response.json();
    if (data && data.success) {
      lcs = data.lcs || [];
    }
  } catch (error) {
    console.error("Error loading LCs:", error);
  } finally {
    isLoadingLcs = false;
    if (activeDashboardTab === "lc") {
      renderRooms();
    }
  }
}

async function loadLcWorkReports(period = "today", startDate = "", endDate = "") {
  if (!API_BASE_URL.trim()) {
    lcWorkReports = [
      { lc_id: "LC-001", lc_name: "Siska", rate_per_room: 175000, total_sessions: 5, total_earnings: 875000, logs: [
        { log_id: "LWL-1", session_id: "ROOM-001-SESSION-1", lc_id: "LC-001", lc_name: "Siska", rate: 175000, status: "done", created_at: "2026-07-23T01:00:00Z", closed_at: "2026-07-23T03:00:00Z" }
      ] },
      { lc_id: "LC-002", lc_name: "Rina", rate_per_room: 175000, total_sessions: 3, total_earnings: 525000, logs: [] },
    ];
    return;
  }

  isLoadingLcWorkReports = true;
  if (activeDashboardTab === "lc") {
    renderRooms();
  }
  try {
    const response = await fetchPeriodApiResponse(`${API_BASE_URL}?action=getLcWorkReports&period=${period}&start_date=${startDate}&end_date=${endDate}`);
    const data = await response.json();
    if (data && data.success) {
      lcWorkReports = data.reports || [];
    }
  } catch (error) {
    console.error("Error loading LC work reports:", error);
  } finally {
    isLoadingLcWorkReports = false;
    if (activeDashboardTab === "lc") {
      renderRooms();
    }
  }
}

// Payroll states for LC
let lcPayrollPendingReports = [];
let lcPayrollHistory = [];
let isLoadingLcPayroll = false;
let isProcessingLcPayroll = false;
let lcPayrollStartDate = "";
let lcPayrollEndDate = "";

let selectedLcPayrollDetail = null;
let isLoadingLcPayrollDetail = false;
let selectedLcForSlip = null;
let lcFinanceSummary = null;
let isLoadingLcFinance = false;
let isSavingLcCashAdvance = false;
let isSavingPettyCashEntry = false;
let lcFinancePeriod = "today";
let lcCashAdvanceForm = {
  lc_id: "",
  amount: "",
  note: "",
};
let pettyCashForm = {
  entry_type: "cash_in",
  amount: "",
  category: "manual_topup",
  note: "",
};

async function loadLcFinanceSummary(period = lcFinancePeriod) {
  lcFinancePeriod = period || "today";

  if (!API_BASE_URL.trim()) {
    lcFinanceSummary = {
      summary: {
        sales_bonus_total: 0,
        cash_advance_total: 0,
        petty_cash_in_total: 1000000,
        petty_cash_out_total: 0,
        petty_cash_balance: 1000000,
      },
      cash_advances: [],
      petty_cash_ledger: [],
      sales_bonus_logs: [],
    };
    return;
  }

  isLoadingLcFinance = true;
  if (activeDashboardTab === "lc") {
    renderRooms();
  }

  try {
    if (!lcs.length) {
      await loadLcs(true);
    }

    const url = `${API_BASE_URL}?action=getLcFinanceSummary&period=${encodeURIComponent(lcFinancePeriod)}`;
    const res = await fetchPeriodApiResponse(url);
    const data = await res.json();

    if (data && data.success) {
      lcFinanceSummary = data;
    } else {
      showInlineNotice(data?.error || "Gagal memuat ringkasan LC finance.", "error");
    }
  } catch (error) {
    console.error("Error loading LC finance summary:", error);
    showInlineNotice(error.message || "Gagal memuat ringkasan LC finance.", "error");
  } finally {
    isLoadingLcFinance = false;
    if (activeDashboardTab === "lc") {
      renderRooms();
    }
  }
}

async function submitLcCashAdvance() {
  if (!API_BASE_URL.trim()) {
    showInlineNotice("API belum dikonfigurasi.", "error");
    return;
  }

  if (!lcCashAdvanceForm.lc_id) {
    showInlineNotice("Pilih LC terlebih dahulu.", "error");
    return;
  }

  const amount = Number(lcCashAdvanceForm.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    showInlineNotice("Nominal kasbon wajib lebih dari 0.", "error");
    return;
  }

  isSavingLcCashAdvance = true;
  renderRooms();

  try {
    const result = await postApiAction({
      action: "createLcCashAdvance",
      lc_id: lcCashAdvanceForm.lc_id,
      amount,
      note: lcCashAdvanceForm.note,
      cashier_name: getLoggedInOperatorName() || "Kasir",
    });

    if (result && result.success) {
      lcCashAdvanceForm = { lc_id: "", amount: "", note: "" };
      showInlineNotice(result.message || "Kasbon LC berhasil dicatat.");
      await loadLcFinanceSummary();
      await loadLcPayrollData(lcPayrollStartDate, lcPayrollEndDate);
    } else {
      showInlineNotice(result?.error || "Gagal mencatat kasbon LC.", "error");
    }
  } catch (error) {
    showInlineNotice(error.message || "Gagal mencatat kasbon LC.", "error");
  } finally {
    isSavingLcCashAdvance = false;
    renderRooms();
  }
}

async function submitPettyCashEntry() {
  if (!API_BASE_URL.trim()) {
    showInlineNotice("API belum dikonfigurasi.", "error");
    return;
  }

  const amount = Number(pettyCashForm.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    showInlineNotice("Nominal petty cash wajib lebih dari 0.", "error");
    return;
  }

  isSavingPettyCashEntry = true;
  renderRooms();

  try {
    const result = await postApiAction({
      action: "recordPettyCashEntry",
      entry_type: pettyCashForm.entry_type,
      amount,
      category: pettyCashForm.category,
      note: pettyCashForm.note,
      cashier_name: getLoggedInOperatorName() || "Kasir",
    });

    if (result && result.success) {
      pettyCashForm = { entry_type: "cash_in", amount: "", category: "manual_topup", note: "" };
      showInlineNotice(result.message || "Mutasi petty cash berhasil dicatat.");
      await loadLcFinanceSummary();
    } else {
      showInlineNotice(result?.error || "Gagal mencatat petty cash.", "error");
    }
  } catch (error) {
    showInlineNotice(error.message || "Gagal mencatat petty cash.", "error");
  } finally {
    isSavingPettyCashEntry = false;
    renderRooms();
  }
}

async function loadLcPayrollDetail(payrollId) {
  if (!API_BASE_URL.trim()) {
    selectedLcPayrollDetail = {
      payroll_id: payrollId,
      details: [
        {
          lc_id: "LC-001",
          lc_name: "Siska",
          rate_per_room: 175000,
          total_sessions: 4,
          total_earnings: 700000,
          logs: [
            { log_id: "LWL-1", session_id: "ROOM-001-SESSION-1", rate: 175000, created_at: "2026-07-24T10:00:00Z" }
          ]
        }
      ]
    };
    renderRooms();
    return;
  }

  isLoadingLcPayrollDetail = true;
  renderRooms();

  try {
    const url = `${API_BASE_URL}?action=getLcPayrollDetails&payroll_id=${payrollId}`;
    const res = await fetchPeriodApiResponse(url);
    const data = await res.json();
    if (data && data.success) {
      selectedLcPayrollDetail = data;
    } else {
      showInlineNotice(data.error || "Gagal memuat rincian payroll.", "error");
    }
  } catch (error) {
    console.error("Error loading LC payroll detail:", error);
    showInlineNotice("Terjadi kesalahan saat memuat rincian payroll.", "error");
  } finally {
    isLoadingLcPayrollDetail = false;
    renderRooms();
  }
}

function downloadPendingPayrollCsv() {
  if (lcPayrollPendingReports.length === 0) {
    showInlineNotice("Tidak ada data payroll untuk diunduh.", "error");
    return;
  }
  
  // CSV headers
  const headers = ["ID LC", "Nama Panggilan", "Tarif per Jam", "Total Sesi Pending", "Total Gaji"];
  
  // CSV rows
  const rows = lcPayrollPendingReports.map(rep => [
    rep.lc_id,
    rep.lc_name,
    rep.rate_per_room,
    rep.total_sessions,
    rep.total_earnings
  ]);
  
  // Build CSV content
  const csvContent = [
    headers.join(","),
    ...rows.map(row => row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(","))
  ].join("\n");
  
  // Trigger file download
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `pengajuan_payroll_${lcPayrollStartDate}_sd_${lcPayrollEndDate}.csv`);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

async function loadLcPayrollData(startDate = "", endDate = "") {
  if (!API_BASE_URL.trim()) {
    lcPayrollPendingReports = [
      { lc_id: "LC-001", lc_name: "Siska", rate_per_room: 175000, total_sessions: 4, total_earnings: 700000 },
      { lc_id: "LC-002", lc_name: "Rina", rate_per_room: 175000, total_sessions: 2, total_earnings: 350000 },
    ];
    lcPayrollHistory = [
      { payroll_id: "LCPAY-20260710-1002", start_date: "2026-06-26", end_date: "2026-07-09", total_amount: 1050000, total_sessions: 6, total_lcs_paid: 2, processed_at: "2026-07-10T10:02:00Z", processed_by: "Kasir" }
    ];
    lcPayrollStartDate = startDate || "2026-07-10";
    lcPayrollEndDate = endDate || "2026-07-23";
    return;
  }

  isLoadingLcPayroll = true;
  if (activeDashboardTab === "lc") {
    renderRooms();
  }

  try {
    const pendingUrl = `${API_BASE_URL}?action=getPendingLcPayroll&start_date=${startDate}&end_date=${endDate}`;
    const pendingRes = await fetchPeriodApiResponse(pendingUrl);
    const pendingData = await pendingRes.json();
    if (pendingData && pendingData.success) {
      lcPayrollPendingReports = pendingData.reports || [];
      lcPayrollStartDate = pendingData.current_range.startDate;
      lcPayrollEndDate = pendingData.current_range.endDate;
    }

    const historyUrl = `${API_BASE_URL}?action=getLcPayrollHistory`;
    const historyRes = await fetchPeriodApiResponse(historyUrl);
    const historyData = await historyRes.json();
    if (historyData && historyData.success) {
      lcPayrollHistory = historyData.history || [];
    }
  } catch (error) {
    console.error("Error loading LC payroll data:", error);
  } finally {
    isLoadingLcPayroll = false;
    if (activeDashboardTab === "lc") {
      renderRooms();
    }
  }
}

async function executeProcessLcPayroll() {
  if (!API_BASE_URL.trim()) {
    const mockRecord = {
      payroll_id: "LCPAY-MOCK-" + Math.floor(Math.random() * 9000 + 1000),
      start_date: lcPayrollStartDate,
      end_date: lcPayrollEndDate,
      total_amount: lcPayrollPendingReports.reduce((sum, r) => sum + r.total_earnings, 0),
      total_sessions: lcPayrollPendingReports.reduce((sum, r) => sum + r.total_sessions, 0),
      total_lcs_paid: lcPayrollPendingReports.length,
      processed_at: new Date().toISOString(),
      processed_by: getLoggedInOperatorName() || "Kasir",
    };
    lcPayrollHistory.unshift(mockRecord);
    lcPayrollPendingReports = [];
    alert("Payroll berhasil diproses (Mock Mode).");
    renderRooms();
    return;
  }

  isProcessingLcPayroll = true;
  if (activeDashboardTab === "lc") {
    renderRooms();
  }

  try {
    const operator = getLoggedInOperatorName() || "Kasir";
    const result = await postApiAction({
      action: "processLcPayroll",
      start_date: lcPayrollStartDate,
      end_date: lcPayrollEndDate,
      cashier_name: operator
    });
    if (result && result.success) {
      alert(result.message || "Payroll berhasil diproses.");
      await loadLcPayrollData();
    } else {
      alert("Gagal memproses payroll: " + (result.error || "Unknown error"));
    }
  } catch (error) {
    console.error("Error processing LC payroll:", error);
    alert(error.message || "Terjadi kesalahan koneksi saat memproses payroll.");
  } finally {
    isProcessingLcPayroll = false;
    if (activeDashboardTab === "lc") {
      renderRooms();
    }
  }
}

// Filter states for LC Reports
let lcReportPeriod = "today";
let lcReportStartDate = "";
let lcReportEndDate = "";
let selectedLcDetailForLogs = null;

function createLcPanelElement() {
  const panel = document.createElement("section");
  panel.className = "lc-panel erp-card";
  panel.style.display = "flex";
  panel.style.flexDirection = "column";
  panel.style.gap = "16px";

  const header = document.createElement("div");
  header.className = "lc-header";
  header.style.display = "flex";
  header.style.justifyContent = "space-between";
  header.style.alignItems = "center";
  header.style.flexWrap = "wrap";
  header.style.gap = "12px";

  const titleGroup = document.createElement("div");
  const title = document.createElement("h2");
  title.className = "lc-title font-title";
  title.style.margin = "0";
  title.textContent = "Pengelolaan Lady Companion (LC)";
  const subtitle = document.createElement("p");
  subtitle.className = "lc-subtitle";
  subtitle.style.margin = "4px 0 0 0";
  subtitle.style.fontSize = "14px";
  subtitle.style.color = "var(--muted)";
  subtitle.textContent = "Manajemen data master LC dan laporan gaji sesi.";
  titleGroup.append(title, subtitle);
  header.appendChild(titleGroup);

  const subNav = document.createElement("div");
  subNav.className = "lc-sub-nav";
  subNav.style.display = "flex";
  subNav.style.gap = "8px";
  subNav.style.borderBottom = "1px solid var(--border)";
  subNav.style.paddingBottom = "8px";

  const tabsConfig = [
    { key: "master", label: "Master LC" },
    { key: "reports", label: "Laporan Kerja & Gaji" },
    { key: "finance", label: "Kasbon & Petty Cash" },
    { key: "payroll", label: "Payroll LC" },
  ];

  tabsConfig.forEach(tab => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = activeLcSubTab === tab.key ? "erp-btn erp-btn-secondary active" : "erp-btn erp-btn-secondary";
    btn.style.padding = "8px 16px";
    btn.style.fontSize = "14px";
    btn.style.fontWeight = "bold";
    if (activeLcSubTab === tab.key) {
      btn.style.backgroundColor = "var(--gold)";
      btn.style.color = "var(--bg)";
    }
    btn.textContent = tab.label;
    btn.onclick = () => {
      activeLcSubTab = tab.key;
      if (tab.key === "master") {
        loadLcs(true);
      } else if (tab.key === "reports") {
        loadLcWorkReports(lcReportPeriod, lcReportStartDate, lcReportEndDate);
      } else if (tab.key === "finance") {
        loadLcs(true);
        loadLcFinanceSummary();
      } else if (tab.key === "payroll") {
        loadLcPayrollData();
      }
      renderRooms();
    };
    subNav.appendChild(btn);
  });

  panel.append(header, subNav);

  if (activeLcSubTab === "master") {
    panel.appendChild(createLcMasterSubTabElement());
  } else if (activeLcSubTab === "reports") {
    panel.appendChild(createLcReportsSubTabElement());
  } else if (activeLcSubTab === "finance") {
    panel.appendChild(createLcFinanceSubTabElement());
  } else if (activeLcSubTab === "payroll") {
    panel.appendChild(createLcPayrollSubTabElement());
  }

  if (selectedLcForSlip) {
    panel.appendChild(createLcSlipModalOverlay());
  }

  if (addLcForm) {
    panel.appendChild(createAddLcModalOverlay());
  }
  if (editLcForm) {
    panel.appendChild(createEditLcModalOverlay());
  }
  if (deleteLcConfirmation) {
    panel.appendChild(createDeleteLcModalOverlay());
  }
  if (adminPinModal) {
    const pinModalEl = createAdminPinModalElement();
    if (pinModalEl && pinModalEl.style) {
      pinModalEl.style.position = "fixed";
      pinModalEl.style.top = "0";
      pinModalEl.style.left = "0";
      pinModalEl.style.width = "100%";
      pinModalEl.style.height = "100%";
      pinModalEl.style.backgroundColor = "rgba(0,0,0,0.7)";
      pinModalEl.style.display = "flex";
      pinModalEl.style.justifyContent = "center";
      pinModalEl.style.alignItems = "center";
      pinModalEl.style.zIndex = "1010";

      const dialog = pinModalEl.querySelector(".master-delete-dialog");
      if (dialog) {
        dialog.style.width = "400px";
        dialog.style.backgroundColor = "var(--surface-raised)";
        dialog.style.padding = "24px";
        dialog.style.borderRadius = "var(--radius-md)";
        dialog.style.border = "1px solid var(--border)";
      }
    }
    panel.appendChild(pinModalEl);
  }

  return panel;
}

function createLcMasterSubTabElement() {
  const container = document.createElement("div");
  container.className = "lc-master-subtab";
  container.style.display = "flex";
  container.style.flexDirection = "column";
  container.style.gap = "12px";

  const toolbar = document.createElement("div");
  toolbar.style.display = "flex";
  toolbar.style.justifyContent = "flex-end";
  
  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.className = "erp-btn erp-btn-primary erp-btn-solid-gold";
  addBtn.style.padding = "8px 16px";
  addBtn.style.fontWeight = "bold";
  addBtn.textContent = "+ Tambah LC Baru";
  addBtn.onclick = () => {
    addLcForm = { lc_name: "", rate_per_room: 175000, status: "active" };
    renderRooms();
  };
  toolbar.appendChild(addBtn);
  container.appendChild(toolbar);

  if (isLoadingLcs) {
    container.appendChild(createStateMessage("Memuat data master LC..."));
    return container;
  }

  if (lcs.length === 0) {
    container.appendChild(createStateMessage("Belum ada data LC terdaftar.", "info"));
    return container;
  }

  const tableWrapper = document.createElement("div");
  tableWrapper.className = "table-responsive";
  
  const table = document.createElement("table");
  table.className = "erp-table";
  table.style.width = "100%";
  table.style.borderCollapse = "collapse";

  const thead = document.createElement("thead");
  thead.innerHTML = `
    <tr>
      <th>ID LC</th>
      <th>Nama Panggilan</th>
      <th>Tarif / Jam</th>
      <th>Status Keaktifan</th>
      <th>Ketersediaan</th>
      <th style="text-align: center;">Aksi</th>
    </tr>
  `;
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  
  const itemsPerPage = 10;
  const totalPages = Math.ceil(lcs.length / itemsPerPage);
  if (lcMasterPage > totalPages && totalPages > 0) {
    lcMasterPage = totalPages;
  }
  const startIndex = (lcMasterPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedLcs = lcs.slice(startIndex, endIndex);

  paginatedLcs.forEach(lc => {
    const tr = document.createElement("tr");
    
    const statusText = lc.status === "active" ? "Aktif" : "Tidak Aktif";
    const statusClass = lc.status === "active" ? "badge badge-success" : "badge badge-danger";
    
    const availText = lc.availability === "busy" ? "Sedang Nge-room" : "Tersedia";
    const availClass = lc.availability === "busy" ? "badge badge-danger" : "badge badge-success";

    tr.innerHTML = `
      <td><strong>${lc.lc_id}</strong></td>
      <td>${escapeHtml(lc.lc_name)}</td>
      <td>${formatCurrency(lc.rate_per_room)}</td>
      <td><span class="${statusClass}">${statusText}</span></td>
      <td><span class="${availClass}">${availText}</span></td>
      <td style="text-align: center; display: flex; justify-content: center; gap: 8px;">
        <button type="button" class="erp-btn erp-btn-secondary btn-edit-lc" style="padding: 4px 8px; font-size: 12px;" data-id="${lc.lc_id}">Edit</button>
        <button type="button" class="erp-btn erp-btn-secondary btn-delete-lc" style="padding: 4px 8px; font-size: 12px; background-color: var(--color-danger); color: #fff;" data-id="${lc.lc_id}">Hapus</button>
      </td>
    `;

    tr.querySelector(".btn-edit-lc").onclick = () => {
      editLcForm = { ...lc };
      renderRooms();
    };
    
    tr.querySelector(".btn-delete-lc").onclick = () => {
      deleteLcConfirmation = { ...lc };
      renderRooms();
    };

    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  tableWrapper.appendChild(table);
  container.appendChild(tableWrapper);

  if (totalPages > 1) {
    const pagination = document.createElement("div");
    pagination.className = "erp-pagination";
    pagination.style.display = "flex";
    pagination.style.justifyContent = "center";
    pagination.style.alignItems = "center";
    pagination.style.gap = "12px";
    pagination.style.marginTop = "12px";

    const prevBtn = document.createElement("button");
    prevBtn.type = "button";
    prevBtn.className = "erp-btn erp-btn-secondary";
    prevBtn.textContent = "«";
    prevBtn.disabled = lcMasterPage === 1;
    prevBtn.onclick = () => {
      lcMasterPage--;
      renderRooms();
    };

    const label = document.createElement("span");
    label.style.fontSize = "14px";
    label.textContent = `Halaman ${lcMasterPage} dari ${totalPages}`;

    const nextBtn = document.createElement("button");
    nextBtn.type = "button";
    nextBtn.className = "erp-btn erp-btn-secondary";
    nextBtn.textContent = "»";
    nextBtn.disabled = lcMasterPage === totalPages;
    nextBtn.onclick = () => {
      lcMasterPage++;
      renderRooms();
    };

    pagination.append(prevBtn, label, nextBtn);
    container.appendChild(pagination);
  }

  return container;
}

function createLcReportsSubTabElement() {
  const container = document.createElement("div");
  container.className = "lc-reports-subtab";
  container.style.display = "flex";
  container.style.flexDirection = "column";
  container.style.gap = "16px";

  const toolbar = document.createElement("div");
  toolbar.className = "lc-reports-filter-toolbar";
  toolbar.style.display = "flex";
  toolbar.style.flexWrap = "wrap";
  toolbar.style.alignItems = "center";
  toolbar.style.gap = "12px";
  toolbar.style.backgroundColor = "var(--surface-raised)";
  toolbar.style.padding = "12px";
  toolbar.style.borderRadius = "var(--radius-md)";
  toolbar.style.border = "1px solid var(--border)";

  const periodSelectGroup = document.createElement("div");
  periodSelectGroup.style.display = "flex";
  periodSelectGroup.style.flexDirection = "column";
  periodSelectGroup.style.gap = "4px";

  const periodLabel = document.createElement("label");
  periodLabel.style.fontSize = "12px";
  periodLabel.style.color = "var(--muted)";
  periodLabel.textContent = "Periode:";

  const periodSelect = document.createElement("select");
  periodSelect.className = "duration-payment-select";
  periodSelect.style.padding = "6px";
  periodSelect.style.borderRadius = "var(--radius-sm)";
  
  [
    ["today", "Hari Ini"],
    ["yesterday", "Kemarin"],
    ["this_week", "Minggu Ini"],
    ["last_week", "Minggu Lalu"],
    ["this_month", "Bulan Ini"],
    ["last_month", "Bulan Lalu"],
    ["custom", "Kustom Tanggal"]
  ].forEach(([val, lbl]) => {
    const opt = document.createElement("option");
    opt.value = val;
    opt.textContent = lbl;
    opt.selected = lcReportPeriod === val;
    periodSelect.appendChild(opt);
  });

  periodSelectGroup.append(periodLabel, periodSelect);
  toolbar.appendChild(periodSelectGroup);

  const customGroup = document.createElement("div");
  customGroup.style.display = lcReportPeriod === "custom" ? "flex" : "none";
  customGroup.style.gap = "8px";
  customGroup.style.alignItems = "center";

  const startField = document.createElement("div");
  startField.style.display = "flex";
  startField.style.flexDirection = "column";
  startField.style.gap = "4px";
  const startLbl = document.createElement("label");
  startLbl.style.fontSize = "12px";
  startLbl.style.color = "var(--muted)";
  startLbl.textContent = "Dari:";
  const startInput = document.createElement("input");
  startInput.type = "date";
  startInput.className = "duration-custom-input";
  startInput.value = lcReportStartDate;
  startField.append(startLbl, startInput);

  const endField = document.createElement("div");
  endField.style.display = "flex";
  endField.style.flexDirection = "column";
  endField.style.gap = "4px";
  const endLbl = document.createElement("label");
  endLbl.style.fontSize = "12px";
  endLbl.style.color = "var(--muted)";
  endLbl.textContent = "Sampai:";
  const endInput = document.createElement("input");
  endInput.type = "date";
  endInput.className = "duration-custom-input";
  endInput.value = lcReportEndDate;
  endField.append(endLbl, endInput);

  customGroup.append(startField, endField);
  toolbar.appendChild(customGroup);

  periodSelect.onchange = (e) => {
    lcReportPeriod = e.target.value;
    customGroup.style.display = lcReportPeriod === "custom" ? "flex" : "none";
  };

  const applyBtn = document.createElement("button");
  applyBtn.type = "button";
  applyBtn.className = "erp-btn erp-btn-primary erp-btn-solid-gold";
  applyBtn.style.padding = "8px 16px";
  applyBtn.style.alignSelf = "flex-end";
  applyBtn.style.fontWeight = "bold";
  applyBtn.textContent = "Terapkan Filter";
  applyBtn.onclick = async () => {
    lcReportStartDate = startInput.value;
    lcReportEndDate = endInput.value;
    await loadLcWorkReports(lcReportPeriod, lcReportStartDate, lcReportEndDate);
    renderRooms();
  };
  toolbar.appendChild(applyBtn);
  container.appendChild(toolbar);

  if (isLoadingLcWorkReports) {
    container.appendChild(createStateMessage("Memuat laporan kerja & gaji LC..."));
    return container;
  }

  if (lcWorkReports.length === 0) {
    container.appendChild(createStateMessage("Tidak ada transaksi kerja LC pada periode ini.", "info"));
    return container;
  }

  const tableWrapper = document.createElement("div");
  tableWrapper.className = "table-responsive";
  
  const table = document.createElement("table");
  table.className = "erp-table";
  table.style.width = "100%";
  table.style.borderCollapse = "collapse";

  const thead = document.createElement("thead");
  thead.innerHTML = `
    <tr>
      <th>ID LC</th>
      <th>Nama Panggilan</th>
      <th>Tarif per Jam</th>
      <th style="text-align: center;">Total Sesi / Job</th>
      <th>Total Pendapatan (Gaji)</th>
      <th style="text-align: center;">Aksi</th>
    </tr>
  `;
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  
  const itemsPerPage = 10;
  const totalPages = Math.ceil(lcWorkReports.length / itemsPerPage);
  if (lcReportsPage > totalPages && totalPages > 0) {
    lcReportsPage = totalPages;
  }
  const startIndex = (lcReportsPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedReports = lcWorkReports.slice(startIndex, endIndex);

  paginatedReports.forEach(rep => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${rep.lc_id}</strong></td>
      <td>${escapeHtml(rep.lc_name)}</td>
      <td>${formatCurrency(rep.rate_per_room)}</td>
      <td style="text-align: center;">${rep.total_sessions}</td>
      <td><strong>${formatCurrency(rep.total_earnings)}</strong></td>
      <td style="text-align: center;">
        <button type="button" class="erp-btn erp-btn-secondary btn-detail-lc-logs" style="padding: 4px 8px; font-size: 12px;">Lihat Rincian</button>
      </td>
    `;

    tr.querySelector(".btn-detail-lc-logs").onclick = () => {
      selectedLcDetailForLogs = rep;
      renderRooms();
    };

    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  tableWrapper.appendChild(table);
  container.appendChild(tableWrapper);

  if (totalPages > 1) {
    const pagination = document.createElement("div");
    pagination.className = "erp-pagination";
    pagination.style.display = "flex";
    pagination.style.justifyContent = "center";
    pagination.style.alignItems = "center";
    pagination.style.gap = "12px";
    pagination.style.marginTop = "12px";

    const prevBtn = document.createElement("button");
    prevBtn.type = "button";
    prevBtn.className = "erp-btn erp-btn-secondary";
    prevBtn.textContent = "«";
    prevBtn.disabled = lcReportsPage === 1;
    prevBtn.onclick = () => {
      lcReportsPage--;
      renderRooms();
    };

    const label = document.createElement("span");
    label.style.fontSize = "14px";
    label.textContent = `Halaman ${lcReportsPage} dari ${totalPages}`;

    const nextBtn = document.createElement("button");
    nextBtn.type = "button";
    nextBtn.className = "erp-btn erp-btn-secondary";
    nextBtn.textContent = "»";
    nextBtn.disabled = lcReportsPage === totalPages;
    nextBtn.onclick = () => {
      lcReportsPage++;
      renderRooms();
    };

    pagination.append(prevBtn, label, nextBtn);
    container.appendChild(pagination);
  }

  if (selectedLcDetailForLogs) {
    container.appendChild(createLcDetailLogsOverlay());
  }

  return container;
}

function createLcFinanceMetric(label, value, accent = false) {
  const item = document.createElement("div");
  item.style.display = "flex";
  item.style.flexDirection = "column";
  item.style.gap = "4px";
  item.style.backgroundColor = "var(--bg)";
  item.style.border = "1px solid var(--border)";
  item.style.borderRadius = "var(--radius-sm)";
  item.style.padding = "12px";

  const text = document.createElement("span");
  text.style.fontSize = "12px";
  text.style.color = "var(--muted)";
  text.textContent = label;

  const amount = document.createElement("strong");
  amount.style.fontSize = "18px";
  amount.style.color = accent ? "var(--gold)" : "var(--text)";
  amount.textContent = formatCurrency(value || 0);

  item.append(text, amount);
  return item;
}

function createLcFinanceSubTabElement() {
  const container = document.createElement("div");
  container.className = "lc-finance-subtab";
  container.style.display = "flex";
  container.style.flexDirection = "column";
  container.style.gap = "16px";

  const toolbar = document.createElement("div");
  toolbar.style.display = "flex";
  toolbar.style.justifyContent = "space-between";
  toolbar.style.alignItems = "center";
  toolbar.style.gap = "12px";
  toolbar.style.flexWrap = "wrap";

  const titleGroup = document.createElement("div");
  const title = document.createElement("h3");
  title.style.margin = "0";
  title.textContent = "Kasbon LC & Petty Cash";
  const subtitle = document.createElement("p");
  subtitle.style.margin = "4px 0 0";
  subtitle.style.fontSize = "13px";
  subtitle.style.color = "var(--muted)";
  subtitle.textContent = "Kasbon langsung dicatat oleh kasir dan otomatis menjadi mutasi petty cash.";
  titleGroup.append(title, subtitle);

  const refreshBtn = document.createElement("button");
  refreshBtn.type = "button";
  refreshBtn.className = "erp-btn erp-btn-secondary";
  refreshBtn.style.padding = "8px 12px";
  refreshBtn.disabled = isLoadingLcFinance;
  refreshBtn.textContent = isLoadingLcFinance ? "Memuat..." : "Refresh";
  refreshBtn.onclick = () => loadLcFinanceSummary();

  toolbar.append(titleGroup, refreshBtn);
  container.appendChild(toolbar);

  if (isLoadingLcFinance && !lcFinanceSummary) {
    container.appendChild(createStateMessage("Memuat data kasbon dan petty cash..."));
    return container;
  }

  const summary = lcFinanceSummary?.summary || {};
  const metricGrid = document.createElement("div");
  metricGrid.style.display = "grid";
  metricGrid.style.gridTemplateColumns = "repeat(auto-fit, minmax(170px, 1fr))";
  metricGrid.style.gap = "12px";
  metricGrid.append(
    createLcFinanceMetric("Saldo Petty Cash", summary.petty_cash_balance, true),
    createLcFinanceMetric("Cash In Hari Ini", summary.petty_cash_in_total),
    createLcFinanceMetric("Cash Out Hari Ini", summary.petty_cash_out_total),
    createLcFinanceMetric("Kasbon LC Hari Ini", summary.cash_advance_total),
    createLcFinanceMetric("Bonus Sales LC Hari Ini", summary.sales_bonus_total)
  );
  container.appendChild(metricGrid);

  const formGrid = document.createElement("div");
  formGrid.style.display = "grid";
  formGrid.style.gridTemplateColumns = "repeat(auto-fit, minmax(280px, 1fr))";
  formGrid.style.gap = "16px";

  const cashAdvanceCard = document.createElement("div");
  cashAdvanceCard.className = "erp-card";
  cashAdvanceCard.style.padding = "16px";
  cashAdvanceCard.style.display = "flex";
  cashAdvanceCard.style.flexDirection = "column";
  cashAdvanceCard.style.gap = "12px";
  cashAdvanceCard.innerHTML = `<h4 style="margin:0;">Input Kasbon LC</h4>`;

  const lcSelect = document.createElement("select");
  lcSelect.className = "duration-payment-select";
  lcSelect.value = lcCashAdvanceForm.lc_id;
  lcSelect.innerHTML = `<option value="">Pilih LC</option>${lcs.map(lc => `<option value="${escapeHtml(lc.lc_id)}" ${lcCashAdvanceForm.lc_id === lc.lc_id ? "selected" : ""}>${escapeHtml(lc.lc_name)} (${escapeHtml(lc.lc_id)})</option>`).join("")}`;
  lcSelect.onchange = (event) => {
    lcCashAdvanceForm.lc_id = event.target.value;
  };

  const advanceAmount = document.createElement("input");
  advanceAmount.type = "number";
  advanceAmount.min = "0";
  advanceAmount.step = "1000";
  advanceAmount.className = "duration-custom-input";
  advanceAmount.placeholder = "Nominal kasbon";
  advanceAmount.value = lcCashAdvanceForm.amount;
  advanceAmount.oninput = (event) => {
    lcCashAdvanceForm.amount = event.target.value;
  };

  const advanceNote = document.createElement("input");
  advanceNote.type = "text";
  advanceNote.className = "duration-custom-input";
  advanceNote.placeholder = "Catatan";
  advanceNote.value = lcCashAdvanceForm.note;
  advanceNote.oninput = (event) => {
    lcCashAdvanceForm.note = event.target.value;
  };

  const advanceBtn = document.createElement("button");
  advanceBtn.type = "button";
  advanceBtn.className = "erp-btn erp-btn-primary erp-btn-solid-gold";
  advanceBtn.style.padding = "10px 14px";
  advanceBtn.disabled = isSavingLcCashAdvance;
  advanceBtn.textContent = isSavingLcCashAdvance ? "Mencatat..." : "Catat Kasbon";
  advanceBtn.onclick = submitLcCashAdvance;
  cashAdvanceCard.append(lcSelect, advanceAmount, advanceNote, advanceBtn);

  const pettyCard = document.createElement("div");
  pettyCard.className = "erp-card";
  pettyCard.style.padding = "16px";
  pettyCard.style.display = "flex";
  pettyCard.style.flexDirection = "column";
  pettyCard.style.gap = "12px";
  pettyCard.innerHTML = `<h4 style="margin:0;">Mutasi Petty Cash Manual</h4>`;

  const pettyType = document.createElement("select");
  pettyType.className = "duration-payment-select";
  pettyType.innerHTML = `
    <option value="cash_in" ${pettyCashForm.entry_type === "cash_in" ? "selected" : ""}>Cash In</option>
    <option value="cash_out" ${pettyCashForm.entry_type === "cash_out" ? "selected" : ""}>Cash Out</option>
  `;
  pettyType.onchange = (event) => {
    pettyCashForm.entry_type = event.target.value;
  };

  const pettyAmount = document.createElement("input");
  pettyAmount.type = "number";
  pettyAmount.min = "0";
  pettyAmount.step = "1000";
  pettyAmount.className = "duration-custom-input";
  pettyAmount.placeholder = "Nominal";
  pettyAmount.value = pettyCashForm.amount;
  pettyAmount.oninput = (event) => {
    pettyCashForm.amount = event.target.value;
  };

  const pettyNote = document.createElement("input");
  pettyNote.type = "text";
  pettyNote.className = "duration-custom-input";
  pettyNote.placeholder = "Catatan";
  pettyNote.value = pettyCashForm.note;
  pettyNote.oninput = (event) => {
    pettyCashForm.note = event.target.value;
  };

  const pettyBtn = document.createElement("button");
  pettyBtn.type = "button";
  pettyBtn.className = "erp-btn erp-btn-secondary";
  pettyBtn.style.padding = "10px 14px";
  pettyBtn.disabled = isSavingPettyCashEntry;
  pettyBtn.textContent = isSavingPettyCashEntry ? "Mencatat..." : "Catat Mutasi";
  pettyBtn.onclick = submitPettyCashEntry;
  pettyCard.append(pettyType, pettyAmount, pettyNote, pettyBtn);

  formGrid.append(cashAdvanceCard, pettyCard);
  container.appendChild(formGrid);

  const histories = document.createElement("div");
  histories.style.display = "grid";
  histories.style.gridTemplateColumns = "repeat(auto-fit, minmax(320px, 1fr))";
  histories.style.gap = "16px";

  const advances = (lcFinanceSummary?.cash_advances || []).slice(-12).reverse();
  const ledgers = (lcFinanceSummary?.petty_cash_ledger || []).slice(-12).reverse();

  const advanceHistory = document.createElement("div");
  advanceHistory.className = "erp-card";
  advanceHistory.style.padding = "16px";
  advanceHistory.innerHTML = `
    <h4 style="margin:0 0 12px;">Kasbon LC Hari Ini</h4>
    ${advances.length ? `
      <div class="table-responsive">
        <table class="erp-table" style="width:100%; border-collapse:collapse;">
          <thead><tr><th>LC</th><th>Nominal</th><th>Status</th><th>Kasir</th></tr></thead>
          <tbody>${advances.map(row => `
            <tr>
              <td>${escapeHtml(row.lc_name || row.lc_id || "-")}</td>
              <td><strong>${formatCurrency(row.amount)}</strong></td>
              <td>${escapeHtml(row.status || "open")}</td>
              <td>${escapeHtml(row.cashier_name || "Kasir")}</td>
            </tr>
          `).join("")}</tbody>
        </table>
      </div>
    ` : `<div class="state-message info">Belum ada kasbon LC hari ini.</div>`}
  `;

  const ledgerHistory = document.createElement("div");
  ledgerHistory.className = "erp-card";
  ledgerHistory.style.padding = "16px";
  ledgerHistory.innerHTML = `
    <h4 style="margin:0 0 12px;">Mutasi Petty Cash Hari Ini</h4>
    ${ledgers.length ? `
      <div class="table-responsive">
        <table class="erp-table" style="width:100%; border-collapse:collapse;">
          <thead><tr><th>Kategori</th><th>In</th><th>Out</th><th>Saldo</th></tr></thead>
          <tbody>${ledgers.map(row => `
            <tr>
              <td>${escapeHtml(row.category || "-")}</td>
              <td>${formatCurrency(row.cash_in_amount)}</td>
              <td>${formatCurrency(row.cash_out_amount)}</td>
              <td><strong>${formatCurrency(row.balance_after)}</strong></td>
            </tr>
          `).join("")}</tbody>
        </table>
      </div>
    ` : `<div class="state-message info">Belum ada mutasi petty cash hari ini.</div>`}
  `;

  histories.append(advanceHistory, ledgerHistory);
  container.appendChild(histories);

  return container;
}

function createLcPayrollSubTabElement() {
  const container = document.createElement("div");
  container.className = "lc-payroll-subtab";
  container.style.display = "flex";
  container.style.flexDirection = "column";
  container.style.gap = "24px";

  const pendingSection = document.createElement("div");
  pendingSection.className = "erp-card";
  pendingSection.style.padding = "16px";
  pendingSection.style.backgroundColor = "var(--surface-raised)";
  pendingSection.style.borderRadius = "var(--radius-md)";
  pendingSection.style.border = "1px solid var(--border)";
  pendingSection.style.display = "flex";
  pendingSection.style.flexDirection = "column";
  pendingSection.style.gap = "16px";

  const secHeader = document.createElement("div");
  secHeader.style.display = "flex";
  secHeader.style.justifyContent = "space-between";
  secHeader.style.alignItems = "center";
  secHeader.style.flexWrap = "wrap";
  secHeader.style.gap = "12px";

  const secTitleGroup = document.createElement("div");
  const secTitle = document.createElement("h3");
  secTitle.style.margin = "0";
  secTitle.textContent = "Pembayaran Payroll LC (2 Mingguan)";
  const secDesc = document.createElement("p");
  secDesc.style.margin = "4px 0 0 0";
  secDesc.style.fontSize = "13px";
  secDesc.style.color = "var(--muted)";
  secDesc.textContent = "Tentukan periode payroll dan proses pembayaran instan untuk sesi kerja done yang belum dibayar.";
  secTitleGroup.append(secTitle, secDesc);
  secHeader.appendChild(secTitleGroup);

  const dateFilters = document.createElement("div");
  dateFilters.style.display = "flex";
  dateFilters.style.gap = "12px";
  dateFilters.style.alignItems = "center";

  const startCol = document.createElement("div");
  startCol.style.display = "flex";
  startCol.style.flexDirection = "column";
  startCol.style.gap = "4px";
  const startLbl = document.createElement("label");
  startLbl.style.fontSize = "11px";
  startLbl.style.color = "var(--muted)";
  startLbl.textContent = "Dari Tanggal:";
  const startIn = document.createElement("input");
  startIn.type = "date";
  startIn.className = "duration-custom-input";
  startIn.value = lcPayrollStartDate;
  startCol.append(startLbl, startIn);

  const endCol = document.createElement("div");
  endCol.style.display = "flex";
  endCol.style.flexDirection = "column";
  endCol.style.gap = "4px";
  const endLbl = document.createElement("label");
  endLbl.style.fontSize = "11px";
  endLbl.style.color = "var(--muted)";
  endLbl.textContent = "Sampai Tanggal:";
  const endIn = document.createElement("input");
  endIn.type = "date";
  endIn.className = "duration-custom-input";
  endIn.value = lcPayrollEndDate;
  endCol.append(endLbl, endIn);

  const filterBtn = document.createElement("button");
  filterBtn.type = "button";
  filterBtn.className = "erp-btn erp-btn-secondary";
  filterBtn.style.padding = "8px 12px";
  filterBtn.textContent = "Filter";
  filterBtn.onclick = async () => {
    await loadLcPayrollData(startIn.value, endIn.value);
  };

  const downloadCsvBtn = document.createElement("button");
  downloadCsvBtn.type = "button";
  downloadCsvBtn.className = "erp-btn erp-btn-secondary";
  downloadCsvBtn.style.padding = "8px 12px";
  downloadCsvBtn.textContent = "Download CSV Pengajuan";
  downloadCsvBtn.onclick = () => {
    downloadPendingPayrollCsv();
  };

  const buttonGroup = document.createElement("div");
  buttonGroup.style.display = "flex";
  buttonGroup.style.gap = "8px";
  buttonGroup.style.alignSelf = "flex-end";
  buttonGroup.append(downloadCsvBtn, filterBtn);

  dateFilters.append(startCol, endCol, buttonGroup);
  secHeader.appendChild(dateFilters);
  pendingSection.appendChild(secHeader);

  if (isLoadingLcPayroll) {
    pendingSection.appendChild(createStateMessage("Memuat data payroll..."));
    container.appendChild(pendingSection);
    return container;
  }

  const summaryBox = document.createElement("div");
  summaryBox.style.display = "grid";
  summaryBox.style.gridTemplateColumns = "repeat(auto-fit, minmax(180px, 1fr))";
  summaryBox.style.gap = "12px";
  summaryBox.style.backgroundColor = "var(--bg)";
  summaryBox.style.padding = "12px";
  summaryBox.style.borderRadius = "var(--radius-sm)";
  summaryBox.style.border = "1px solid var(--border)";

  const totalRoomEarning = lcPayrollPendingReports.reduce((sum, r) => sum + Number(r.room_earning_total ?? r.total_earnings ?? 0), 0);
  const totalSalesBonus = lcPayrollPendingReports.reduce((sum, r) => sum + Number(r.sales_bonus_total || 0), 0);
  const totalCashAdvance = lcPayrollPendingReports.reduce((sum, r) => sum + Number(r.cash_advance_deducted || 0), 0);
  const totalCashAdvanceOutstanding = lcPayrollPendingReports.reduce((sum, r) => sum + Number(r.cash_advance_outstanding || 0), 0);
  const totalGross = totalRoomEarning + totalSalesBonus;
  const totalAmount = lcPayrollPendingReports.reduce((sum, r) => sum + Number(r.net_payout_total ?? r.total_earnings ?? 0), 0);
  const totalSessions = lcPayrollPendingReports.reduce((sum, r) => sum + r.total_sessions, 0);
  const totalLcs = lcPayrollPendingReports.length;

  summaryBox.innerHTML = `
    <div style="display:flex; flex-direction:column; gap:4px;">
      <span style="font-size:12px; color:var(--muted)">Net Payout Payroll:</span>
      <strong style="font-size:18px; color:var(--gold)">${formatCurrency(totalAmount)}</strong>
    </div>
    <div style="display:flex; flex-direction:column; gap:4px;">
      <span style="font-size:12px; color:var(--muted)">Gaji Room:</span>
      <strong style="font-size:18px;">${formatCurrency(totalRoomEarning)}</strong>
    </div>
    <div style="display:flex; flex-direction:column; gap:4px;">
      <span style="font-size:12px; color:var(--muted)">Bonus Sales:</span>
      <strong style="font-size:18px;">${formatCurrency(totalSalesBonus)}</strong>
    </div>
    <div style="display:flex; flex-direction:column; gap:4px;">
      <span style="font-size:12px; color:var(--muted)">Potongan Kasbon:</span>
      <strong style="font-size:18px;">${formatCurrency(totalCashAdvance)}</strong>
    </div>
    <div style="display:flex; flex-direction:column; gap:4px;">
      <span style="font-size:12px; color:var(--muted)">Kasbon Outstanding:</span>
      <strong style="font-size:18px;">${formatCurrency(totalCashAdvanceOutstanding)}</strong>
    </div>
    <div style="display:flex; flex-direction:column; gap:4px;">
      <span style="font-size:12px; color:var(--muted)">Gross Earning:</span>
      <strong style="font-size:18px;">${formatCurrency(totalGross)}</strong>
    </div>
    <div style="display:flex; flex-direction:column; gap:4px;">
      <span style="font-size:12px; color:var(--muted)">Total Sesi / Job:</span>
      <strong style="font-size:18px;">${totalSessions} Sesi</strong>
    </div>
    <div style="display:flex; flex-direction:column; gap:4px;">
      <span style="font-size:12px; color:var(--muted)">Jumlah LC Dibayar:</span>
      <strong style="font-size:18px;">${totalLcs} Orang</strong>
    </div>
  `;
  pendingSection.appendChild(summaryBox);

  if (lcPayrollPendingReports.length === 0) {
    const noPending = createStateMessage("Tidak ada sesi kerja LC yang belum dibayar pada periode ini.", "info");
    pendingSection.appendChild(noPending);
  } else {
    const tableWrapper = document.createElement("div");
    tableWrapper.className = "table-responsive";
    
    const table = document.createElement("table");
    table.className = "erp-table";
    table.style.width = "100%";
    table.style.borderCollapse = "collapse";

    table.innerHTML = `
      <thead>
        <tr>
          <th>ID LC</th>
          <th>Nama Panggilan</th>
          <th>Tarif per Jam</th>
          <th style="text-align: center;">Total Sesi Pending</th>
          <th>Gaji Room</th>
          <th>Bonus Sales</th>
          <th>Kasbon</th>
          <th>Sisa Kasbon</th>
          <th>Net Payout</th>
        </tr>
      </thead>
      <tbody>
        ${lcPayrollPendingReports.map(rep => `
          <tr>
            <td><strong>${rep.lc_id}</strong></td>
            <td>${escapeHtml(rep.lc_name)}</td>
            <td>${formatCurrency(rep.rate_per_room)}</td>
            <td style="text-align: center;">${rep.total_sessions}</td>
            <td>${formatCurrency(rep.room_earning_total ?? rep.total_earnings)}</td>
            <td>${formatCurrency(rep.sales_bonus_total || 0)}</td>
            <td>${formatCurrency(rep.cash_advance_deducted || 0)}</td>
            <td>${formatCurrency(rep.cash_advance_outstanding || 0)}</td>
            <td><strong>${formatCurrency(rep.net_payout_total ?? rep.total_earnings)}</strong></td>
          </tr>
        `).join("")}
      </tbody>
    `;
    tableWrapper.appendChild(table);
    pendingSection.appendChild(tableWrapper);

    const processBtn = document.createElement("button");
    processBtn.type = "button";
    processBtn.className = "erp-btn erp-btn-primary erp-btn-solid-gold";
    processBtn.style.padding = "10px 20px";
    processBtn.style.alignSelf = "flex-end";
    processBtn.style.fontWeight = "bold";
    processBtn.textContent = isProcessingLcPayroll ? "Memproses..." : "Proses Pembayaran Payroll";
    processBtn.disabled = isProcessingLcPayroll;
    processBtn.onclick = async () => {
      if (confirm(`Konfirmasi pembayaran payroll net sebesar ${formatCurrency(totalAmount)} untuk periode ini?`)) {
        await executeProcessLcPayroll();
      }
    };
    pendingSection.appendChild(processBtn);
  }

  container.appendChild(pendingSection);

  const historySection = document.createElement("div");
  historySection.className = "erp-card";
  historySection.style.padding = "16px";
  historySection.style.display = "flex";
  historySection.style.flexDirection = "column";
  historySection.style.gap = "12px";

  const historyTitle = document.createElement("h3");
  historyTitle.style.margin = "0";
  historyTitle.textContent = "Riwayat Pembayaran Payroll";
  historySection.appendChild(historyTitle);

  if (lcPayrollHistory.length === 0) {
    historySection.appendChild(createStateMessage("Belum ada riwayat pembayaran payroll.", "info"));
  } else {
    const histTableWrapper = document.createElement("div");
    histTableWrapper.className = "table-responsive";

    const histTable = document.createElement("table");
    histTable.className = "erp-table";
    histTable.style.width = "100%";
    histTable.style.borderCollapse = "collapse";
    histTable.innerHTML = `
      <thead>
        <tr>
          <th>ID Payroll</th>
          <th>Periode Kerja</th>
          <th>Net Payout</th>
          <th style="text-align: center;">Total Sesi</th>
          <th style="text-align: center;">LC Terbayar</th>
          <th>Tanggal Diproses</th>
          <th>Operator</th>
          <th style="text-align: center;">Aksi</th>
        </tr>
      </thead>
      <tbody>
        ${lcPayrollHistory.map(row => `
          <tr>
            <td><strong>${row.payroll_id}</strong></td>
            <td>${formatSimpleDate(row.start_date)} s.d. ${formatSimpleDate(row.end_date)}</td>
            <td><strong>${formatCurrency(row.total_amount)}</strong></td>
            <td style="text-align: center;">${row.total_sessions} Sesi</td>
            <td style="text-align: center;">${row.total_lcs_paid} LC</td>
            <td>${new Date(row.processed_at).toLocaleString("id-ID")}</td>
            <td>${escapeHtml(row.processed_by || "Kasir")}</td>
            <td style="text-align: center;">
              <button type="button" class="erp-btn erp-btn-secondary btn-detail-payroll" style="padding: 4px 8px; font-size: 12px; border-color: var(--gold);" data-id="${row.payroll_id}">Detail</button>
            </td>
          </tr>
        `).join("")}
      </tbody>
    `;

    histTable.querySelectorAll(".btn-detail-payroll").forEach(btn => {
      const payrollId = btn.dataset.id;
      btn.onclick = () => {
        loadLcPayrollDetail(payrollId);
      };
    });

    histTableWrapper.appendChild(histTable);
    historySection.appendChild(histTableWrapper);
  }

  if (isLoadingLcPayrollDetail) {
    historySection.appendChild(createStateMessage("Memuat rincian payroll..."));
  } else if (selectedLcPayrollDetail) {
    historySection.appendChild(createLcPayrollDetailElement());
  }

  container.appendChild(historySection);
  return container;
}

function createLcPayrollDetailElement() {
  const detailsContainer = document.createElement("div");
  detailsContainer.className = "lc-payroll-detail-panel erp-card";
  detailsContainer.style.padding = "16px";
  detailsContainer.style.backgroundColor = "var(--surface-raised)";
  detailsContainer.style.borderRadius = "var(--radius-md)";
  detailsContainer.style.border = "1px solid var(--gold)";
  detailsContainer.style.display = "flex";
  detailsContainer.style.flexDirection = "column";
  detailsContainer.style.gap = "12px";

  const header = document.createElement("div");
  header.style.display = "flex";
  header.style.justifyContent = "space-between";
  header.style.alignItems = "center";

  const title = document.createElement("h4");
  title.style.margin = "0";
  title.style.color = "var(--gold)";
  title.textContent = `Rincian Pembayaran LC - Payroll ${selectedLcPayrollDetail.payroll_id}`;

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "erp-btn erp-btn-secondary";
  closeBtn.style.padding = "4px 8px";
  closeBtn.style.fontSize = "12px";
  closeBtn.textContent = "Tutup Rincian";
  closeBtn.onclick = () => {
    selectedLcPayrollDetail = null;
    renderRooms();
  };

  header.append(title, closeBtn);
  detailsContainer.appendChild(header);

  const tableWrapper = document.createElement("div");
  tableWrapper.className = "table-responsive";

  const table = document.createElement("table");
  table.className = "erp-table";
  table.style.width = "100%";
  table.style.borderCollapse = "collapse";

  table.innerHTML = `
    <thead>
      <tr>
        <th>ID LC</th>
        <th>Nama Panggilan</th>
        <th>Tarif per Jam</th>
        <th style="text-align: center;">Total Sesi Kerja</th>
        <th>Total Pembayaran Gaji</th>
        <th style="text-align: center;">Aksi</th>
      </tr>
    </thead>
    <tbody>
      ${selectedLcPayrollDetail.details.map(rep => `
        <tr>
          <td><strong>${rep.lc_id}</strong></td>
          <td>${escapeHtml(rep.lc_name)}</td>
          <td>${formatCurrency(rep.rate_per_room)}</td>
          <td style="text-align: center;">${rep.total_sessions} Sesi</td>
          <td><strong>${formatCurrency(rep.total_earnings)}</strong></td>
          <td style="text-align: center;">
            <button type="button" class="erp-btn erp-btn-secondary btn-slip-lc" style="padding: 4px 8px; font-size: 12px; border-color: var(--gold);" data-id="${rep.lc_id}">Slip Gaji</button>
          </td>
        </tr>
      `).join("")}
    </tbody>
  `;

  table.querySelectorAll(".btn-slip-lc").forEach(btn => {
    const lcId = btn.dataset.id;
    const lcData = selectedLcPayrollDetail.details.find(d => d.lc_id === lcId);
    btn.onclick = () => {
      selectedLcForSlip = {
        payroll_id: selectedLcPayrollDetail.payroll_id,
        ...lcData
      };
      renderRooms();
    };
  });

  tableWrapper.appendChild(table);
  detailsContainer.appendChild(tableWrapper);

  return detailsContainer;
}

function createLcSlipModalOverlay() {
  const overlay = document.createElement("div");
  overlay.className = "admin-pin-modal-overlay";
  overlay.style.position = "fixed";
  overlay.style.top = "0";
  overlay.style.left = "0";
  overlay.style.width = "100%";
  overlay.style.height = "100%";
  overlay.style.backgroundColor = "rgba(0,0,0,0.7)";
  overlay.style.display = "flex";
  overlay.style.justifyContent = "center";
  overlay.style.alignItems = "center";
  overlay.style.zIndex = "1020";

  const container = document.createElement("div");
  container.className = "erp-card";
  container.style.width = "400px";
  container.style.maxHeight = "90vh";
  container.style.overflowY = "auto";
  container.style.padding = "24px";
  container.style.display = "flex";
  container.style.flexDirection = "column";
  container.style.gap = "16px";
  container.style.backgroundColor = "var(--surface-raised)";
  container.style.border = "1px solid var(--border)";

  const title = document.createElement("h3");
  title.className = "font-title";
  title.style.margin = "0";
  title.style.textAlign = "center";
  title.style.color = "var(--gold)";
  title.textContent = "SLIP GAJI LADY COMPANION";

  const content = document.createElement("div");
  content.className = "thermal-slip-preview";
  content.style.fontFamily = "monospace";
  content.style.fontSize = "12px";
  content.style.backgroundColor = "#fff";
  content.style.color = "#000";
  content.style.padding = "16px";
  content.style.borderRadius = "4px";
  content.style.border = "1px dashed #aaa";
  content.style.whiteSpace = "pre-wrap";

  const divider = "--------------------------------";
  const doubleDivider = "================================";

  const lc = selectedLcForSlip;
  const lines = [
    centerText("HAPPY SONG KARAOKE", 32),
    centerText("SLIP GAJI PARTNER (LC)", 32),
    divider,
    padText("ID Payroll", lc.payroll_id, 32),
    padText("ID LC", lc.lc_id, 32),
    padText("Nama", lc.lc_name, 32),
    divider,
    "Rincian Sesi Kerja:",
  ];

  (lc.logs || []).forEach((log, index) => {
    const dateStr = formatTransactionDateTime(log.created_at).split(" - ")[0];
    const roomName = log.session_id.split("-")[0];
    
    let durationMinutes = Math.round(Number(log.duration_minutes) || 0);
    if (durationMinutes <= 0 && log.created_at && log.closed_at) {
      const ms = new Date(log.closed_at).getTime() - new Date(log.created_at).getTime();
      durationMinutes = Math.max(1, Math.ceil(ms / 60000));
    }
    if (durationMinutes <= 0 && Number(log.rate) > 0 && Number(lc.rate_per_room) > 0) {
      durationMinutes = Math.ceil(Number(log.rate) / Number(lc.rate_per_room)) * 60;
    }
    const durationHours = durationMinutes > 0 ? durationMinutes / 60 : 0;
    
    lines.push(`${index + 1}. Room: ${roomName} (${dateStr})`);
    
    const formattedHours = durationHours > 0 ? `${durationHours.toFixed(1)} Jam` : "N/A";
    lines.push(padText(`   ${formattedHours} @ ${formatCurrency(lc.rate_per_room)}/Jam`, formatCurrency(log.rate), 32));
  });

  lines.push(
    divider,
    padText("Total Sesi", `${lc.total_sessions} Sesi`, 32),
    padText("Tarif per Jam", formatCurrency(lc.rate_per_room), 32),
    doubleDivider,
    padText("TOTAL GAJI", formatCurrency(lc.total_earnings), 32),
    doubleDivider,
    "",
    centerText("TANDA TERIMA", 32),
    "",
    "",
    centerText("( ______________________ )", 32),
    centerText(lc.lc_name, 32),
  );

  content.textContent = lines.join("\n");
  container.appendChild(title);
  container.appendChild(content);

  const actionGroup = document.createElement("div");
  actionGroup.style.display = "flex";
  actionGroup.style.gap = "8px";
  actionGroup.style.justifyContent = "flex-end";

  const printBtn = document.createElement("button");
  printBtn.type = "button";
  printBtn.className = "erp-btn erp-btn-primary erp-btn-solid-gold";
  printBtn.style.padding = "8px 16px";
  printBtn.style.fontWeight = "bold";
  printBtn.textContent = "Cetak Slip";
  printBtn.onclick = () => {
    const printWindow = window.open("", "_blank");
    printWindow.document.write(`
      <html>
        <head>
          <title>Cetak Slip Gaji ${lc.lc_name}</title>
          <style>
            body {
              font-family: monospace;
              font-size: 14px;
              white-space: pre-wrap;
              padding: 20px;
              width: 300px;
            }
            @media print {
              body { padding: 0; margin: 0; width: 58mm; }
            }
          </style>
        </head>
        <body>${content.textContent}</body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
    printWindow.close();
  };

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "erp-btn erp-btn-secondary";
  closeBtn.style.padding = "8px 16px";
  closeBtn.textContent = "Tutup";
  closeBtn.onclick = () => {
    selectedLcForSlip = null;
    renderRooms();
  };

  actionGroup.append(printBtn, closeBtn);
  container.appendChild(actionGroup);
  overlay.appendChild(container);

  return overlay;
}

function centerText(text, width) {
  const clean = String(text).slice(0, width);
  const padLeft = Math.floor((width - clean.length) / 2);
  return " ".repeat(padLeft) + clean;
}

function padText(left, right, width) {
  const l = String(left);
  const r = String(right);
  const space = width - l.length - r.length;
  return l + " ".repeat(Math.max(1, space)) + r;
}

function createAddLcModalOverlay() {
  const overlay = document.createElement("div");
  overlay.className = "admin-pin-modal-overlay";
  overlay.style.position = "fixed";
  overlay.style.top = "0";
  overlay.style.left = "0";
  overlay.style.width = "100%";
  overlay.style.height = "100%";
  overlay.style.backgroundColor = "rgba(0,0,0,0.7)";
  overlay.style.display = "flex";
  overlay.style.justifyContent = "center";
  overlay.style.alignItems = "center";
  overlay.style.zIndex = "1000";

  const formEl = document.createElement("div");
  formEl.className = "admin-pin-modal erp-card";
  formEl.style.width = "400px";
  formEl.style.padding = "24px";
  formEl.style.display = "flex";
  formEl.style.flexDirection = "column";
  formEl.style.gap = "16px";

  const title = document.createElement("h3");
  title.className = "font-title";
  title.style.margin = "0";
  title.textContent = "Tambah Lady Companion (LC) Baru";

  const nameField = document.createElement("div");
  nameField.style.display = "flex";
  nameField.style.flexDirection = "column";
  nameField.style.gap = "4px";
  nameField.innerHTML = `
    <label style="font-size: 12px; color: var(--muted);">Nama Panggilan:</label>
    <input type="text" class="duration-custom-input text-input-name" placeholder="Nama Panggilan LC" value="${escapeHtml(addLcForm.lc_name || "")}">
  `;

  const rateField = document.createElement("div");
  rateField.style.display = "flex";
  rateField.style.flexDirection = "column";
  rateField.style.gap = "4px";
  rateField.innerHTML = `
    <label style="font-size: 12px; color: var(--muted);">Tarif per Jam (Rp):</label>
    <input type="number" class="duration-custom-input text-input-rate" placeholder="150000" value="${addLcForm.rate_per_room || 150000}">
  `;

  const actions = document.createElement("div");
  actions.style.display = "flex";
  actions.style.justifyContent = "flex-end";
  actions.style.gap = "8px";

  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "erp-btn erp-btn-secondary";
  cancelBtn.textContent = "Batal";
  cancelBtn.onclick = () => {
    addLcForm = null;
    renderRooms();
  };

  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.className = "erp-btn erp-btn-primary erp-btn-solid-gold";
  saveBtn.style.fontWeight = "bold";
  saveBtn.textContent = isSavingLc ? "Menyimpan..." : "Simpan";
  saveBtn.disabled = isSavingLc;
  saveBtn.onclick = () => {
    const name = formEl.querySelector(".text-input-name").value.trim();
    const rate = Number(formEl.querySelector(".text-input-rate").value) || 0;
    console.log("saveBtn.onclick: clicked", { name, rate });
    if (!name) {
      showInlineNotice("Nama panggilan wajib diisi.", "error");
      return;
    }
    
    addLcForm.lc_name = name;
    addLcForm.rate_per_room = rate;
    
    console.log("saveBtn.onclick: opening PIN modal...");
    openAdminPinModal({
      title: "PIN Manager Tambah LC",
      message: "Masukkan PIN owner/manager untuk mendaftarkan LC baru.",
      requestedAction: "save_lc_master",
      requiredRole: "manager",
      onSuccess: async (authData, adminPin) => {
        console.log("saveBtn.onclick onSuccess: PIN validated, starting executeSaveLcMaster...");
        await executeSaveLcMaster(adminPin);
      }
    });
  };

  actions.append(cancelBtn, saveBtn);
  formEl.append(title, nameField, rateField, actions);
  overlay.appendChild(formEl);
  return overlay;
}

async function executeSaveLcMaster(adminPin) {
  console.log("executeSaveLcMaster: triggered", { addLcForm, isSavingLc });
  if (isSavingLc || !addLcForm) {
    console.log("executeSaveLcMaster: skipped, isSavingLc is true or addLcForm is null");
    return;
  }

  isSavingLc = true;
  renderRooms();

  console.log("executeSaveLcMaster: sending saveLcMaster request to API...");
  try {
    const response = await postApiAction({
      action: "saveLcMaster",
      lc_name: addLcForm.lc_name,
      rate_per_room: addLcForm.rate_per_room,
      status: addLcForm.status || "active",
      availability: "available",
      admin_pin: adminPin,
      changed_by: getLoggedInOperatorName()
    });

    console.log("executeSaveLcMaster: API response received", response);

    if (!response || response.ok !== true) {
      throw new Error(response?.message || response?.error || "Gagal menyimpan data LC.");
    }

    console.log("executeSaveLcMaster: save successful, clearing form and reloading LCs...");
    showInlineNotice("LC berhasil didaftarkan.");
    addLcForm = null;
    await loadLcs(true);
    console.log("executeSaveLcMaster: LCs reloaded successfully");
  } catch (error) {
    console.error("executeSaveLcMaster: error occurred", error);
    showInlineNotice(error.message || "Gagal mendaftarkan LC.", "error");
  } finally {
    console.log("executeSaveLcMaster: resetting isSavingLc to false and rendering");
    isSavingLc = false;
    renderRooms();
  }
}

function createEditLcModalOverlay() {
  const overlay = document.createElement("div");
  overlay.className = "admin-pin-modal-overlay";
  overlay.style.position = "fixed";
  overlay.style.top = "0";
  overlay.style.left = "0";
  overlay.style.width = "100%";
  overlay.style.height = "100%";
  overlay.style.backgroundColor = "rgba(0,0,0,0.7)";
  overlay.style.display = "flex";
  overlay.style.justifyContent = "center";
  overlay.style.alignItems = "center";
  overlay.style.zIndex = "1000";

  const formEl = document.createElement("div");
  formEl.className = "admin-pin-modal erp-card";
  formEl.style.width = "400px";
  formEl.style.padding = "24px";
  formEl.style.display = "flex";
  formEl.style.flexDirection = "column";
  formEl.style.gap = "16px";

  const title = document.createElement("h3");
  title.className = "font-title";
  title.style.margin = "0";
  title.textContent = `Edit Lady Companion (LC) - ${editLcForm.lc_id}`;

  const nameField = document.createElement("div");
  nameField.style.display = "flex";
  nameField.style.flexDirection = "column";
  nameField.style.gap = "4px";
  nameField.innerHTML = `
    <label style="font-size: 12px; color: var(--muted);">Nama Panggilan:</label>
    <input type="text" class="duration-custom-input text-input-name" placeholder="Nama Panggilan LC" value="${escapeHtml(editLcForm.lc_name || "")}">
  `;

  const rateField = document.createElement("div");
  rateField.style.display = "flex";
  rateField.style.flexDirection = "column";
  rateField.style.gap = "4px";
  rateField.innerHTML = `
    <label style="font-size: 12px; color: var(--muted);">Tarif per Jam (Rp):</label>
    <input type="number" class="duration-custom-input text-input-rate" placeholder="150000" value="${editLcForm.rate_per_room}">
  `;

  const statusField = document.createElement("div");
  statusField.style.display = "flex";
  statusField.style.flexDirection = "column";
  statusField.style.gap = "4px";
  statusField.innerHTML = `
    <label style="font-size: 12px; color: var(--muted);">Status Keaktifan:</label>
    <select class="duration-payment-select text-select-status" style="width: 100%;">
      <option value="active" ${editLcForm.status === "active" ? "selected" : ""}>Aktif</option>
      <option value="inactive" ${editLcForm.status === "inactive" ? "selected" : ""}>Tidak Aktif</option>
    </select>
  `;

  const actions = document.createElement("div");
  actions.style.display = "flex";
  actions.style.justifyContent = "flex-end";
  actions.style.gap = "8px";

  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "erp-btn erp-btn-secondary";
  cancelBtn.textContent = "Batal";
  cancelBtn.onclick = () => {
    editLcForm = null;
    renderRooms();
  };

  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.className = "erp-btn erp-btn-primary erp-btn-solid-gold";
  saveBtn.style.fontWeight = "bold";
  saveBtn.textContent = isSavingLc ? "Menyimpan..." : "Simpan Perubahan";
  saveBtn.disabled = isSavingLc;
  saveBtn.onclick = () => {
    const name = formEl.querySelector(".text-input-name").value.trim();
    const rate = Number(formEl.querySelector(".text-input-rate").value) || 0;
    const status = formEl.querySelector(".text-select-status").value;
    
    if (!name) {
      showInlineNotice("Nama panggilan wajib diisi.", "error");
      return;
    }
    
    editLcForm.lc_name = name;
    editLcForm.rate_per_room = rate;
    editLcForm.status = status;
    
    openAdminPinModal({
      title: "PIN Manager Edit LC",
      message: "Masukkan PIN owner/manager untuk mengubah data LC.",
      requestedAction: "update_lc_master",
      requiredRole: "manager",
      onSuccess: async (authData, adminPin) => {
        await executeUpdateLcMaster(adminPin);
      }
    });
  };

  actions.append(cancelBtn, saveBtn);
  formEl.append(title, nameField, rateField, statusField, actions);
  overlay.appendChild(formEl);
  return overlay;
}

async function executeUpdateLcMaster(adminPin) {
  if (isSavingLc || !editLcForm) return;

  isSavingLc = true;
  renderRooms();

  try {
    const response = await postApiAction({
      action: "updateLcMaster",
      lc_id: editLcForm.lc_id,
      lc_name: editLcForm.lc_name,
      rate_per_room: editLcForm.rate_per_room,
      status: editLcForm.status,
      admin_pin: adminPin,
      changed_by: getLoggedInOperatorName()
    });

    if (!response || response.ok !== true) {
      throw new Error(response?.message || response?.error || "Gagal memperbarui data LC.");
    }

    showInlineNotice("Data LC berhasil diperbarui.");
    editLcForm = null;
    await loadLcs(true);
  } catch (error) {
    showInlineNotice(error.message || "Gagal memperbarui data LC.", "error");
  } finally {
    isSavingLc = false;
    renderRooms();
  }
}

function createDeleteLcModalOverlay() {
  const overlay = document.createElement("div");
  overlay.className = "admin-pin-modal-overlay";
  overlay.style.position = "fixed";
  overlay.style.top = "0";
  overlay.style.left = "0";
  overlay.style.width = "100%";
  overlay.style.height = "100%";
  overlay.style.backgroundColor = "rgba(0,0,0,0.7)";
  overlay.style.display = "flex";
  overlay.style.justifyContent = "center";
  overlay.style.alignItems = "center";
  overlay.style.zIndex = "1000";

  const formEl = document.createElement("div");
  formEl.className = "admin-pin-modal erp-card";
  formEl.style.width = "400px";
  formEl.style.padding = "24px";
  formEl.style.display = "flex";
  formEl.style.flexDirection = "column";
  formEl.style.gap = "16px";

  const title = document.createElement("h3");
  title.className = "font-title";
  title.style.margin = "0";
  title.textContent = `Hapus Lady Companion - ${deleteLcConfirmation.lc_id}`;

  const msg = document.createElement("p");
  msg.style.margin = "0";
  msg.style.fontSize = "14px";
  msg.style.color = "var(--text)";
  msg.textContent = `Apakah Anda yakin ingin menghapus ${deleteLcConfirmation.lc_name} secara permanen? Aksi ini memerlukan PIN owner/manager dan hanya dapat dilakukan jika LC belum memiliki riwayat kerja.`;

  const actions = document.createElement("div");
  actions.style.display = "flex";
  actions.style.justifyContent = "flex-end";
  actions.style.gap = "8px";

  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "erp-btn erp-btn-secondary";
  cancelBtn.textContent = "Batal";
  cancelBtn.onclick = () => {
    deleteLcConfirmation = null;
    renderRooms();
  };

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "erp-btn";
  deleteBtn.style.backgroundColor = "var(--color-danger)";
  deleteBtn.style.color = "#fff";
  deleteBtn.style.fontWeight = "bold";
  deleteBtn.textContent = isDeletingLc ? "Menghapus..." : "Hapus Permanen (Manager)";
  deleteBtn.disabled = isDeletingLc;
  deleteBtn.onclick = () => {
    openAdminPinModal({
      title: "PIN Manager Hapus LC",
      message: "Masukkan PIN owner/manager untuk menghapus data LC secara permanen.",
      requestedAction: "delete_lc_master",
      requiredRole: "manager",
      validatePin: false,
      onSuccess: async (authData, adminPin) => {
        return executeDeleteLcMaster(adminPin);
      }
    });
  };

  actions.append(cancelBtn, deleteBtn);
  formEl.append(title, msg, actions);
  overlay.appendChild(formEl);
  return overlay;
}

async function executeDeleteLcMaster(adminPin) {
  if (isDeletingLc || !deleteLcConfirmation) return { success: false };

  isDeletingLc = true;
  renderRooms();

  try {
    const response = await postApiAction({
      action: "deleteLcMaster",
      lc_id: deleteLcConfirmation.lc_id,
      admin_pin: adminPin,
      changed_by: getLoggedInOperatorName()
    });

    if (!response || response.ok !== true) {
      const message = isAdminPinDeleteError(response)
        ? "PIN tidak valid atau akses tidak cukup. Gunakan PIN owner/manager."
        : response?.message || response?.error || "Gagal menghapus data LC.";

      if (adminPinModal) {
        adminPinModal = {
          ...adminPinModal,
          pin: "",
          error: message,
        };
      }

      showInlineNotice(message, "error");
      return { success: false, message };
    }

    showInlineNotice("LC berhasil dihapus secara permanen.");
    adminPinModal = null;
    deleteLcConfirmation = null;
    await loadLcs(true);
    return { success: true };
  } catch (error) {
    const message = error.message || "Gagal menghapus LC.";
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
    isDeletingLc = false;
    renderRooms();
  }
}

function createLcDetailLogsOverlay() {
  const overlay = document.createElement("div");
  overlay.className = "admin-pin-modal-overlay";
  overlay.style.position = "fixed";
  overlay.style.top = "0";
  overlay.style.left = "0";
  overlay.style.width = "100%";
  overlay.style.height = "100%";
  overlay.style.backgroundColor = "rgba(0,0,0,0.7)";
  overlay.style.display = "flex";
  overlay.style.justifyContent = "center";
  overlay.style.alignItems = "center";
  overlay.style.zIndex = "1000";

  const formEl = document.createElement("div");
  formEl.className = "admin-pin-modal erp-card";
  formEl.style.width = "650px";
  formEl.style.maxWidth = "90%";
  formEl.style.padding = "24px";
  formEl.style.display = "flex";
  formEl.style.flexDirection = "column";
  formEl.style.gap = "16px";

  const title = document.createElement("h3");
  title.className = "font-title";
  title.style.margin = "0";
  title.textContent = `Riwayat Sesi Kerja LC - ${selectedLcDetailForLogs.lc_name}`;

  const infoText = document.createElement("p");
  infoText.style.margin = "0";
  infoText.style.fontSize = "14px";
  infoText.style.color = "var(--muted)";
  infoText.textContent = `Menampilkan log kerja untuk ${selectedLcDetailForLogs.lc_id}. Total Sesi: ${selectedLcDetailForLogs.total_sessions}, Total Gaji: ${formatCurrency(selectedLcDetailForLogs.total_earnings)}`;

  const tableWrapper = document.createElement("div");
  tableWrapper.className = "table-responsive";
  tableWrapper.style.maxHeight = "300px";
  tableWrapper.style.overflowY = "auto";

  const table = document.createElement("table");
  table.className = "erp-table";
  table.style.width = "100%";
  table.style.borderCollapse = "collapse";

  const thead = document.createElement("thead");
  thead.innerHTML = `
    <tr>
      <th>ID Log</th>
      <th>ID Sesi Room</th>
      <th>Tarif (Rp)</th>
      <th>Status Kerja</th>
      <th>Waktu Mulai</th>
    </tr>
  `;
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  const logs = selectedLcDetailForLogs.logs || [];
  
  if (logs.length === 0) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="5" style="text-align: center; color: var(--muted);">Tidak ada riwayat sesi.</td>`;
    tbody.appendChild(tr);
  } else {
    logs.forEach(log => {
      const tr = document.createElement("tr");
      const statusText = log.status === "active" ? "Aktif" : (log.status === "done" ? "Selesai" : "Batal");
      const statusClass = log.status === "active" ? "badge badge-primary" : (log.status === "done" ? "badge badge-success" : "badge badge-danger");

      tr.innerHTML = `
        <td><small>${log.log_id}</small></td>
        <td><small>${log.session_id}</small></td>
        <td>${formatCurrency(log.rate)}</td>
        <td><span class="${statusClass}">${statusText}</span></td>
        <td><small>${formatDateTimeLabel(log.created_at)}</small></td>
      `;
      tbody.appendChild(tr);
    });
  }
  table.appendChild(tbody);
  tableWrapper.appendChild(table);

  const actions = document.createElement("div");
  actions.style.display = "flex";
  actions.style.justifyContent = "flex-end";

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "erp-btn erp-btn-secondary";
  closeBtn.textContent = "Tutup";
  closeBtn.onclick = () => {
    selectedLcDetailForLogs = null;
    renderRooms();
  };
  actions.appendChild(closeBtn);

  formEl.append(title, infoText, tableWrapper, actions);
  overlay.appendChild(formEl);
  return overlay;
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

  const latestTransaction = getLatestTodayTransaction();

  if (!lastTransaction && !receiptPrintVisible && activeDashboardTab === "rooms" && latestTransaction) {
    fragment.appendChild(createLatestTransactionShortcutElement(latestTransaction));
  }

  if (lastTransaction) {
    fragment.appendChild(createBillingSummaryElement(lastTransaction));
  }

  if (receiptPrintVisible && selectedReceiptTransaction) {
    fragment.appendChild(createReceiptPrintElement(selectedReceiptTransaction));
  }

  if (ownerReportPrintVisible) {
    fragment.appendChild(createOwnerReportPrintPreviewElement());
  }

  if (cashierClosingConfirmationVisible) {
    fragment.appendChild(createCashierClosingConfirmationElement());
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

  ensureActiveDashboardTabAllowed();

  const fragment = document.createDocumentFragment();
  const roomsWarningCount = getRoomsTimeWarningCount();

  getVisibleDashboardTabs().forEach((tab) => {
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

function createFnbSubNavElement() {
  const wrapper = document.createElement("section");
  wrapper.className = "fnb-subnav";
  wrapper.setAttribute("aria-label", "Sub menu F&B");

  [
    ["order", "🛒 Pesan Menu", "Input order F&B baru untuk room"],
    ["open", "⏳ Antrean F&B", "Pantau pesanan F&B yang sedang diproses"],
    ["history", "📜 Riwayat F&B", "Lihat rekapan penjualan F&B hari ini"],
  ].forEach(([key, label, description]) => {
    const button = document.createElement("button");
    button.className = activeFnbSubTab === key
      ? "fnb-subnav-button active"
      : "fnb-subnav-button";
    button.type = "button";
    button.dataset.action = "switch-fnb-subtab";
    button.dataset.fnbSubtab = key;
    button.setAttribute("aria-pressed", activeFnbSubTab === key ? "true" : "false");
    button.title = description;

    const labelSpan = document.createElement("span");
    labelSpan.className = "fnb-subnav-label";
    labelSpan.textContent = label;

    button.appendChild(labelSpan);
    wrapper.appendChild(button);
  });

  return wrapper;
}

function createTransactionsSubNavElement() {
  const wrapper = document.createElement("section");
  wrapper.className = "transactions-subnav";
  wrapper.setAttribute("aria-label", "Sub menu Transaksi");

  [
    ["history", "📑 Riwayat Transaksi", "Cari dan lihat seluruh transaksi hari ini"],
    ["closing", "💵 Shift Kasir (Shift Aktif)", "Pantau omzet berjalan kasir dan proses Tutup Shift"],
  ].forEach(([key, label, description]) => {
    const button = document.createElement("button");
    button.className = activeTransactionsSubTab === key
      ? "transactions-subnav-button active"
      : "transactions-subnav-button";
    button.type = "button";
    button.dataset.action = "switch-transactions-subtab";
    button.dataset.transactionsSubtab = key;
    button.setAttribute("aria-pressed", activeTransactionsSubTab === key ? "true" : "false");
    button.title = description;

    const labelSpan = document.createElement("span");
    labelSpan.className = "transactions-subnav-label";
    labelSpan.textContent = label;

    button.appendChild(labelSpan);
    wrapper.appendChild(button);
  });

  return wrapper;
}

function createReportsSubNavElement() {
  const wrapper = document.createElement("section");
  wrapper.className = "reports-subnav";
  wrapper.setAttribute("aria-label", "Sub menu laporan");

  ensureActiveReportSubTabAllowed();
  const allowedReportTabs = new Set(ROLE_REPORT_SUB_TABS[getCurrentOperatorRole()] || []);

  REPORT_SUB_TABS.filter((tab) => allowedReportTabs.has(tab.key)).forEach((tab) => {
    const button = document.createElement("button");
    button.className = activeReportSubTab === tab.key
      ? "reports-subnav-button active"
      : "reports-subnav-button";
    button.type = "button";
    button.dataset.action = "switch-report-subtab";
    button.dataset.reportTab = tab.key;
    button.setAttribute("aria-pressed", activeReportSubTab === tab.key ? "true" : "false");

    const label = document.createElement("span");
    label.className = "reports-subnav-label";
    label.textContent = tab.label;

    const description = document.createElement("span");
    description.className = "reports-subnav-description";
    description.textContent = tab.description;

    button.append(label, description);
    wrapper.appendChild(button);
  });

  return wrapper;
}

function createReportsSubTabContentElement() {
  const wrapper = document.createElement("div");
  wrapper.className = `reports-subtab-content reports-subtab-content--${activeReportSubTab}`;

  switch (activeReportSubTab) {
    case "owner":
      wrapper.append(
        createFinanceOverviewElement(),
        createOwnerDashboardElement()
      );
      break;
    case "cashier":
      if (closingPrintPreviewVisible && selectedClosingForPrint) {
        wrapper.appendChild(createClosingPrintPreviewElement(selectedClosingForPrint));
      } else {
        wrapper.appendChild(renderCashierClosingHistory());
      }
      break;
    case "fnb":
      wrapper.appendChild(createTodayFnbSalesReportPanelElement());
      break;
    case "room":
      wrapper.append(
        createRoomOccupancyElement(),
        createRoomUsageReportPanelElement()
      );
      break;
    default:
      wrapper.appendChild(createStateMessage("Sub menu laporan tidak dikenal.", "error"));
      break;
  }

  return wrapper;
}

function appendDashboardTabContent(panel, tabKey) {
  switch (tabKey) {
    case "rooms": {
      if (getCurrentOperatorRole() !== "receptionist") {
        ensureRoomRecoveryCandidatesLoaded();

        if (hasRoomRecoveryCandidates()) {
          panel.appendChild(createRoomRecoveryPanelElement());
        }
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
    case "fnb": {
        // Insert sub-navigation for F&B
        panel.appendChild(createFnbSubNavElement());
        // Render content based on selected sub-tab
        if (activeFnbSubTab === "order") {
          panel.append(
            createMenuPanelElement(),
            createFbOrderPanelElement()
          );
        } else if (activeFnbSubTab === "open") {
          panel.appendChild(createOpenFnbOrdersPanelElement());
        } else if (activeFnbSubTab === "history") {
          panel.appendChild(createTodayFnbOrdersPanelElement());
        }
        break;
      }
      case "transactions": {
        // Insert sub-navigation for Transactions
        panel.appendChild(createTransactionsSubNavElement());
        // Render based on selected sub-tab (history or closing)
        if (activeTransactionsSubTab === "history") {
          // Existing transaction history UI
          panel.appendChild(renderTransactionHistory());
        } else if (activeTransactionsSubTab === "closing") {
          // Shift Kasir UI – reuse the same transaction history which already includes closing components
          panel.appendChild(renderTransactionHistory());
        }
        break;
      }
    case "stock":
      panel.append(
        createInventoryPanelElement(),
        createTodayStockMovementsPanelElement()
      );
      break;
    case "reports":
      panel.append(
        createReportsSubNavElement(),
        createReportsSubTabContentElement()
      );
      break;
    case "audit":
      panel.appendChild(createTodayRoomTimeLogsPanelElement());
      break;
    case "settings":
      panel.appendChild(createSettingsPanelElement());
      break;
    case "lc":
      panel.appendChild(createLcPanelElement());
      break;
    case "promosi":
      panel.appendChild(createPromosiPanelElement());
      break;
    default:
      break;
  }
}

function renderDashboardTabPanels() {
  if (!dashboardPanels) {
    return;
  }

  ensureActiveDashboardTabAllowed();

  const fragment = document.createDocumentFragment();

  getVisibleDashboardTabs().forEach((tab) => {
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
  ensureActiveDashboardTabAllowed();
  ensureActiveReportSubTabAllowed();
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

      if (status === "expired") {
        sendTvOffForExpiredCountdown(card.dataset.roomId, timer.dataset.scheduledEndTime);
      }

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
  bookingCartItems = []; // reset cart for new booking
  renderRooms();
}

function cancelDurationSelection() {
  durationSelectionRoomId = "";
  customDurationMinutes = "";
  bookingCartItems = []; // clear cart
  renderRooms();
}

function updateCustomDuration(value) {
  customDurationMinutes = value;
}

function updateCustomerName(value) {
  customerNameInput = value;
}

function updateDurationPaymentMethod(value) {
  durationPaymentMethod = value === "transfer" ? "transfer" : "cash";
}

function createRoomSessionIdempotencyKey(roomId, durationMinutes) {
  return [
    "prepare",
    roomId || "room",
    String(durationMinutes || 0),
    Date.now().toString(36),
    Math.random().toString(36).slice(2, 8),
  ].join("-");
}

// Idempotency key untuk payAndStartSession — di-cache per roomId agar
// retry dalam satu sesi pembayaran menggunakan key yang SAMA, sehingga
// server bisa mendeteksi duplikat dan tidak membuat transaksi ganda.
const _payAndStartIdempotencyKeys = {};
function createPayAndStartIdempotencyKey(roomId, paymentMethod) {
  const cacheKey = `${roomId}__${paymentMethod}`;
  if (!_payAndStartIdempotencyKeys[cacheKey]) {
    _payAndStartIdempotencyKeys[cacheKey] = [
      "pay",
      roomId || "room",
      paymentMethod || "cash",
      Date.now().toString(36),
      Math.random().toString(36).slice(2, 8),
    ].join("-");
  }
  return _payAndStartIdempotencyKeys[cacheKey];
}

// Hapus cache idempotency setelah pembayaran berhasil atau room reset
function clearPayAndStartIdempotencyKey(roomId, paymentMethod) {
  const cacheKey = `${roomId}__${paymentMethod}`;
  delete _payAndStartIdempotencyKeys[cacheKey];
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
  extendPaymentMethod = "cash";
  renderRooms();
}

function updateCustomExtendMinutes(value) {
  customExtendMinutes = value;
}

function updateExtendSessionNote(value) {
  extendSessionNote = value;
}

// ── LC Mid-Session Selection ──

let pendingLcSelections = {};
let pendingLcDurations = {};

function showLcSelection(roomId) {
  lcSelectionRoomId = roomId;
  pendingLcSelections = {};
  pendingLcDurations = {};
  const room = rooms.find(r => r.room_id === roomId);
  if (room) {
    const assignmentsById = new Map(parseLcAssignmentsFromRoom(room).map((assignment) => [assignment.lc_id, assignment.duration_minutes]));
    const lcIds = String(room.lc_ids || "").trim();
    if (lcIds) {
      lcIds.split(",").map(id => id.trim()).filter(Boolean).forEach(id => {
        if (id !== "PENDING") {
          pendingLcSelections[id] = true;
          pendingLcDurations[id] = assignmentsById.get(id) || getDefaultLcDurationMinutes(room);
        }
      });
    }
  }
  renderRooms();
}

function cancelLcSelection() {
  lcSelectionRoomId = "";
  pendingLcSelections = {};
  pendingLcDurations = {};
  renderRooms();
}

function createSelectLcModalOverlay(room) {
  const panel = document.createElement("div");
  panel.className = "lc-selection-panel";

  const title = document.createElement("p");
  title.className = "lc-selection-title";
  title.textContent = `Pilih LC untuk ${room.room_name}`;

  const lcIdsRaw = String(room.lc_ids || "").trim();
  const allIds = lcIdsRaw.split(",").map(id => id.trim()).filter(Boolean);
  const bookedCount = allIds.length;
  const selectedCount = Object.keys(pendingLcSelections).filter(k => pendingLcSelections[k]).length;

  const counter = document.createElement("p");
  counter.className = "lc-selection-counter";
  counter.textContent = `Terpilih: ${selectedCount} orang`;

  const availableLcs = lcs.filter(lc => lc.status === "active" && (lc.availability === "available" || pendingLcSelections[lc.lc_id]));

  const listContainer = document.createElement("div");
  listContainer.className = "lc-selection-list";

  if (availableLcs.length === 0) {
    const noLcMsg = document.createElement("p");
    noLcMsg.className = "lc-selection-empty";
    noLcMsg.textContent = "Tidak ada LC yang tersedia saat ini.";
    listContainer.appendChild(noLcMsg);
  } else {
    availableLcs.forEach(lc => {
      const itemLabel = document.createElement("label");
      itemLabel.className = "lc-selection-item";

      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.value = lc.lc_id;
      cb.checked = !!pendingLcSelections[lc.lc_id];
      cb.dataset.action = "toggle-lc-checkbox";
      cb.onchange = () => {
        if (cb.checked) {
          pendingLcSelections[lc.lc_id] = true;
          pendingLcDurations[lc.lc_id] = pendingLcDurations[lc.lc_id] || getDefaultLcDurationMinutes(room);
        } else {
          delete pendingLcSelections[lc.lc_id];
          delete pendingLcDurations[lc.lc_id];
        }
        renderRooms();
      };

      const nameSpan = document.createElement("span");
      nameSpan.textContent = lc.lc_name;

      const rateSpan = document.createElement("span");
      rateSpan.className = "lc-selection-rate";
      rateSpan.textContent = currencyFormatter.format(Number(lc.rate_per_room) || 175000);

      itemLabel.append(cb, nameSpan, rateSpan);

      if (cb.checked) {
        const durationInput = createLcDurationSelectElement(
          room,
          lc.lc_id,
          pendingLcDurations[lc.lc_id] || getDefaultLcDurationMinutes(room)
        );
        itemLabel.appendChild(durationInput);
      }

      listContainer.appendChild(itemLabel);
    });
  }

  const actions = document.createElement("div");
  actions.className = "lc-selection-actions";

  const saveBtn = document.createElement("button");
  saveBtn.className = "room-button lc-selection-save";
  saveBtn.type = "button";
  saveBtn.dataset.action = "save-lc-selection";
  saveBtn.dataset.roomId = room.room_id;
  saveBtn.textContent = isSavingSessionLcs ? "Menyimpan..." : "Simpan Pilihan";
  saveBtn.disabled = isSavingSessionLcs || selectedCount === 0;

  const cancelBtn = document.createElement("button");
  cancelBtn.className = "room-button lc-selection-cancel";
  cancelBtn.type = "button";
  cancelBtn.dataset.action = "cancel-lc-selection";
  cancelBtn.textContent = "Batal";
  cancelBtn.disabled = isSavingSessionLcs;

  actions.append(saveBtn, cancelBtn);
  panel.append(title, counter, listContainer, actions);

  return panel;
}

async function saveSessionLcSelection(roomId) {
  const room = rooms.find(r => r.room_id === roomId) || { room_id: roomId };
  const selectedIds = Object.keys(pendingLcSelections).filter(k => pendingLcSelections[k]);

  if (selectedIds.length === 0) {
    showInlineNotice("Pilih minimal 1 LC.", "error");
    return;
  }

  isSavingSessionLcs = true;
  renderRooms();

  try {
    const result = await postApiAction({
      action: "assignSessionLcs",
      room_id: roomId,
      lc_ids: selectedIds.join(","),
      lc_assignments: JSON.stringify(selectedIds.map((lcId) => ({
        lc_id: lcId,
        duration_minutes: normalizeLcDurationMinutesForRoom(room, pendingLcDurations[lcId]),
      }))),
      changed_by: getLoggedInOperatorName(),
    });

    if (result?.ok || result?.success) {
      showInlineNotice("Pilihan LC berhasil disimpan.", "success");
      lcSelectionRoomId = "";
      pendingLcSelections = {};
      pendingLcDurations = {};
      await loadRooms();
    } else {
      showInlineNotice(result?.error || result?.message || "Gagal menyimpan pilihan LC.", "error");
    }
  } catch (err) {
    console.error("Error saving LC selection:", err);
    showInlineNotice(err.message || "Gagal menghubungi server. Coba lagi.", "error");
  } finally {
    isSavingSessionLcs = false;
    renderRooms();
  }
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

  const response = await fetchPeriodApiResponse(`${API_BASE_URL}?${params.toString()}`);

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
  meta.textContent = `${formatDateTimeLabel(log.created_at)} - ${log.log_id || "-"}`;

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
  if (getCurrentOperatorRole() === "receptionist") {
    showInlineNotice("Resepsionis tidak diizinkan menambah waktu sesi.", "error");
    return;
  }

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
      payment_method: "",
      payment_status: "unpaid",
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
    extendPaymentMethod = "cash";
    await Promise.all([
      loadRooms(),
      loadTodayRoomTimeLogs()
    ]);
  } catch (error) {
    showInlineNotice(error.message || "Gagal menambah waktu sesi.", "error");
  } finally {
    isExtendingSession = false;
    setActionButtonsDisabled(false);
  }
}

async function startSession(roomId, durationMinutes) {
  if (getCurrentOperatorRole() === "receptionist") {
    showInlineNotice("Resepsionis tidak diizinkan memulai sesi.", "error");
    return;
  }

  if (!API_BASE_URL.trim()) {
    showInlineNotice("API belum dikonfigurasi. Isi URL server dulu di config.js.", "error");
    return;
  }

  const selectedDuration = Number(durationMinutes);

  if (!Number.isFinite(selectedDuration) || selectedDuration <= 0) {
    showInlineNotice("Durasi wajib berupa angka positif.", "error");
    return;
  }

  if (selectedDuration < getMinimumSessionMinutes()) {
    showInlineNotice(getMinimumSessionMessage(), "error");
    return;
  }

  setActionButtonsDisabled(true);

  try {
    const data = await postApiAction({
      action: "startSession",
      room_id: roomId,
      duration_minutes: selectedDuration,
      dev_test_duration: canUseDevShortSessions(),
    });

    if (!data || data.ok !== true) {
      throw new Error(data?.error || "Gagal memulai sesi.");
    }

    try {
      await sendLocalTvCommand(roomId, "power_on", "start_session");
      showInlineNotice("Sesi berhasil dimulai. TV dinyalakan.");
    } catch (tvError) {
      showInlineNotice(`Sesi berhasil dimulai. Namun TV gagal dinyalakan: ${tvError.message}`, "warning");
    }

    durationSelectionRoomId = "";
    customDurationMinutes = "";
    await loadRooms();
  } catch (error) {
    showInlineNotice(error.message || "Gagal memulai sesi.", "error");
  } finally {
    setActionButtonsDisabled(false);
  }
}

async function prepareRoomSession(roomId, durationMinutes, customerName = "", packageId = "", lcIds = "") {
  if (!API_BASE_URL.trim()) {
    showInlineNotice("API belum dikonfigurasi. Isi URL server dulu di config.js.", "error");
    return;
  }

  const selectedDuration = Number(durationMinutes);

  if (!Number.isFinite(selectedDuration) || selectedDuration <= 0) {
    showInlineNotice("Durasi wajib berupa angka positif.", "error");
    return;
  }

  if (selectedDuration < getMinimumSessionMinutes()) {
    showInlineNotice(getMinimumSessionMessage(), "error");
    return;
  }

  isPreparingRoomSession = true;
  setActionButtonsDisabled(true);
  renderRooms();

  try {
    const room = rooms.find(r => r.room_id === roomId) || { room_id: roomId, booked_duration_minutes: selectedDuration };
    const lcAssignmentsPayload = buildLcAssignmentsPayloadForRoom({
      ...room,
      booked_duration_minutes: selectedDuration,
    });

    const data = await postApiAction({
      action: "prepareRoomSession",
      room_id: roomId,
      duration_minutes: selectedDuration,
      dev_test_duration: canUseDevShortSessions(),
      payment_method: "cash",
      cashier_name: getLoggedInOperatorName(),
      customer_name: customerName,
      package_id: packageId,
      lc_ids: lcIds,
      lc_assignments: lcAssignmentsPayload,
      fnb_items: bookingCartItems.map(item => ({
        menu_id: item.menu_id,
        quantity: item.quantity
      })),
      idempotency_key: createRoomSessionIdempotencyKey(roomId, selectedDuration),
    });

    if (!data || data.ok !== true) {
      throw new Error(data?.error || "Gagal menyiapkan booking room.");
    }

    showInlineNotice(data.message || "Booking room berhasil disiapkan.");
    bookingCartItems = []; // clear receptionist cart on success
    durationSelectionRoomId = "";
    customDurationMinutes = "";
    durationPaymentMethod = "cash";
    await loadRooms();
  } catch (error) {
    showInlineNotice(error.message || "Gagal menyiapkan booking room.", "error");
  } finally {
    isPreparingRoomSession = false;
    setActionButtonsDisabled(false);
    renderRooms();
  }
}

async function loadPackages() {
  if (!API_BASE_URL.trim()) return;
  try {
    packages = await fetchPackagesFromApi();
  } catch (error) {
    console.error("Gagal memuat paket:", error);
  }
}

async function payAndStartSession(roomId, paymentMethod, promoCode = "") {
  if (getCurrentOperatorRole() === "receptionist") {
    showInlineNotice("Resepsionis tidak diizinkan memulai sesi.", "error");
    return;
  }

  if (!API_BASE_URL.trim()) {
    showInlineNotice("API belum dikonfigurasi.", "error");
    return;
  }

  if (isActivatingPreparedSession) {
    return;
  }

  isActivatingPreparedSession = true;
  setActionButtonsDisabled(true);
  renderRooms();
  try {
    const room = rooms.find(r => r.room_id === roomId) || { room_id: roomId };
    const activeLcIds = selectedLcIdsForRoom[roomId] || [];
    const lcIdsStr = activeLcIds.join(",");

    const data = await postApiAction({
      action: "payAndStartSession",
      room_id: roomId,
      payment_method: paymentMethod,
      promo_code: promoCode,
      lc_ids: lcIdsStr,
      lc_assignments: buildLcAssignmentsPayloadForRoom(room),
      cashier_name: getLoggedInOperatorName(),
      fnb_items: prepayCartItems.map(item => ({
        menu_id: item.menu_id,
        quantity: item.quantity
      })),
      idempotency_key: createPayAndStartIdempotencyKey(roomId, paymentMethod),
    });
    if (!data || data.ok !== true) {
      throw new Error(data?.error || "Gagal memproses pembayaran.");
    }
    showInlineNotice(data.message || "Pembayaran berhasil diproses.");
    clearPayAndStartIdempotencyKey(roomId, paymentMethod); // bersihkan cache key setelah sukses
    prepayCartItems = []; // clear cashier cart on success
    paymentSelectionRoomId = "";
    delete selectedLcIdsForRoom[roomId];
    delete selectedLcDurationsForRoom[roomId];
    if (data.transaction) {
      showBillingSummary(data.transaction);
    }
    await Promise.all([
      loadRooms(),
      loadTodayTransactions()
    ]);
  } catch (error) {
    showInlineNotice(error.message || "Gagal memproses pembayaran.", "error");
  } finally {
    isActivatingPreparedSession = false;
    setActionButtonsDisabled(false);
    renderRooms();
  }
}

async function cancelBooking(roomId) {
  if (!API_BASE_URL.trim()) return;
  if (isCancellingBooking) return;
  isCancellingBooking = true;
  setActionButtonsDisabled(true);
  try {
    const data = await postApiAction({
      action: "cancelBooking",
      room_id: roomId,
    });
    if (!data || data.ok !== true) {
      throw new Error(data?.error || "Gagal membatalkan booking.");
    }
    showInlineNotice("Pemesanan berhasil dibatalkan.");
    paymentSelectionRoomId = "";
    await loadRooms();
  } catch (error) {
    showInlineNotice(error.message || "Gagal membatalkan booking.", "error");
  } finally {
    isCancellingBooking = false;
    setActionButtonsDisabled(false);
    renderRooms();
  }
}

async function completeCleaning(roomId) {
  if (!API_BASE_URL.trim()) return;
  if (isCompletingCleaning) return;
  isCompletingCleaning = true;
  setActionButtonsDisabled(true);
  try {
    const data = await postApiAction({
      action: "completeCleaning",
      room_id: roomId,
    });
    if (!data || data.ok !== true) {
      throw new Error(data?.error || "Gagal menyelesaikan cleaning.");
    }

    try {
      await sendLocalTvCommand(roomId, "power_on", "complete_cleaning");
      showInlineNotice("Room siap digunakan kembali. TV dinyalakan.");
    } catch (tvError) {
      showInlineNotice(`Room siap digunakan kembali. Namun TV gagal dinyalakan: ${tvError.message}`, "warning");
    }

    await loadRooms();
  } catch (error) {
    showInlineNotice(error.message || "Gagal menyelesaikan cleaning.", "error");
  } finally {
    isCompletingCleaning = false;
    setActionButtonsDisabled(false);
    renderRooms();
  }
}

async function showPaymentSelection(roomId) {
  paymentSelectionRoomId = roomId;
  paymentMethodSelection = "cash";
  prepayCartItems = []; // reset cashier cart
  isLoadingPrepayFnb = true;
  prepayFnbError = "";
  renderRooms();

  try {
    const result = await fetchOpenFnbOrdersFromApi(roomId, "");
    console.log("showPaymentSelection: fetchOpenFnbOrdersFromApi result:", result);
    if (paymentSelectionRoomId !== roomId) return; // user closed it
    
    if (result.orders.length > 0) {
      showInlineNotice(`Ditemukan ${result.orders.length} pesanan F&B open. Memuat rincian...`, "info");
      const orderIds = result.orders.map(o => o.order_id);
      const fetchedOrders = await fetchFnbOrdersByIds(orderIds);
      const detailedOrders = fetchedOrders.length > 0 ? fetchedOrders : result.orders;
      console.log("showPaymentSelection: detailedOrders:", detailedOrders);
      if (paymentSelectionRoomId !== roomId) return; // check again
      
      const itemsList = [];
      detailedOrders.forEach(order => {
        if (Array.isArray(order.items)) {
          order.items.forEach(item => {
            const existing = itemsList.find(x => x.menu_id === item.menu_id);
            if (existing) {
              existing.quantity += item.quantity;
            } else {
              itemsList.push({
                menu_id: item.menu_id,
                menu_name: item.menu_name,
                price: item.price,
                quantity: item.quantity,
              });
            }
          });
        }
      });
      prepayCartItems = itemsList;
      showInlineNotice(`Berhasil memuat ${prepayCartItems.length} menu F&B ke bil pembayaran Kasir.`, "success");
    } else {
      console.log("showPaymentSelection: result.orders is empty");
      showInlineNotice("Penyelidikan F&B: 0 pesanan F&B aktif ditemukan untuk room ini.", "warning");
    }
  } catch (error) {
    console.warn("Gagal memuat F&B prepay", error);
    prepayFnbError = "Gagal memuat detail pesanan F&B dari server.";
  } finally {
    isLoadingPrepayFnb = false;
    renderRooms();
  }
}

function cancelPaymentSelection() {
  paymentSelectionRoomId = "";
  prepayCartItems = [];
  isLoadingPrepayFnb = false;
  prepayFnbError = "";
  renderRooms();
}

async function activatePreparedSession(roomId) {
  if (getCurrentOperatorRole() === "receptionist") {
    showInlineNotice("Resepsionis tidak diizinkan memulai countdown sesi.", "error");
    return;
  }

  if (!API_BASE_URL.trim()) {
    showInlineNotice("API belum dikonfigurasi. Isi URL server dulu di config.js.", "error");
    return;
  }

  isActivatingPreparedSession = true;
  setActionButtonsDisabled(true);
  renderRooms();

  try {
    const data = await postApiAction({
      action: "activatePreparedSession",
      room_id: roomId,
      cashier_name: getLoggedInOperatorName(),
    });

    if (!data || data.ok !== true) {
      throw new Error(data?.error || "Gagal memulai countdown.");
    }

    try {
      await sendLocalTvCommand(roomId, "power_on", "activate_prepared_session");
      showInlineNotice(`${data.message || "Countdown room berhasil dimulai."} TV dinyalakan.`);
    } catch (tvError) {
      showInlineNotice(
        `${data.message || "Countdown room berhasil dimulai."} Namun TV gagal dinyalakan: ${tvError.message}`,
        "warning"
      );
    }

    await loadRooms();
  } catch (error) {
    showInlineNotice(error.message || "Gagal memulai countdown.", "error");
  } finally {
    isActivatingPreparedSession = false;
    setActionButtonsDisabled(false);
    renderRooms();
  }
}

async function closeSession(roomId) {
  if (getCurrentOperatorRole() === "receptionist") {
    showInlineNotice("Resepsionis tidak diizinkan menyelesaikan sesi.", "error");
    return;
  }

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

    try {
      await sendLocalTvCommand(roomId, "power_off", "close_session");
      showInlineNotice("Sesi berhasil diselesaikan. TV dimatikan.");
    } catch (tvError) {
      showInlineNotice(`Sesi berhasil diselesaikan. Namun TV gagal dimatikan: ${tvError.message}`, "warning");
    }

    if (transaction.transaction_id) {
      showBillingSummary(transaction);
    } else {
      clearBillingSummary();
    }
    await Promise.all([
      loadRooms(),
      loadOpenFnbOrders(),
      loadTodayFnbOrders(),
      loadInventoryItems(),
      loadMenuItems(),
      loadTodayFnbSalesReport(),
      loadTodayTransactions()
    ]);
  } catch (error) {
    showInlineNotice(error.message || "Gagal menyelesaikan sesi.", "error");
  } finally {
    setActionButtonsDisabled(false);
  }
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

async function markTransactionPaid(transactionId, paymentMethod, promoCode = "", options = {}) {
  if (!API_BASE_URL.trim()) {
    showInlineNotice("API belum dikonfigurasi. Isi URL server dulu di config.js.", "error");
    return;
  }

  if (markingTransactionPaidIds.has(transactionId)) {
    return; // sudah dalam proses mark paid untuk transaksi ini
  }

  markingTransactionPaidIds.add(transactionId);
  setActionButtonsDisabled(true);

  try {
    const data = await postApiAction({
      action: "markTransactionPaid",
      transaction_id: transactionId,
      payment_method: paymentMethod,
      promo_code: promoCode,
    });

    if (!data || data.ok !== true) {
      throw new Error(data?.error || "Gagal menandai pembayaran lunas.");
    }

    if (
      options.updateBillingSummary ||
      lastTransaction?.transaction_id === data.transaction?.transaction_id
    ) {
      lastTransaction = data.transaction || lastTransaction;
      if (lastTransaction) {
        loadFnbDetailsForTransaction(lastTransaction);
      }
    }

    showInlineNotice("Pembayaran berhasil ditandai lunas.");
    await loadTodayTransactions();
  } catch (error) {
    showInlineNotice(error.message || "Gagal menandai pembayaran lunas.", "error");
  } finally {
    markingTransactionPaidIds.delete(transactionId);
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
    const compiledNote = compileClosingNote();
    const data = await postApiAction({
      action: "saveCashierClosing",
      cash_actual: Number(cashierClosingCashActual || 0),
      note: compiledNote,
      cashier_name: getLoggedInOperatorName(),
    });

    if (!data || data.ok !== true) {
      throw new Error(data?.error || "Gagal menyimpan closing kasir.");
    }

    lastCashierClosing = data.closing || null;
    cashierClosingConfirmationVisible = false;
    cashierClosingCashActual = "";
    cashierClosingNote = "";
    resetClosingDenominations();
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
    cache: "no-store",
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
  operatorLabel.textContent = `Operator: ${currentOperator.employee_name} (${getOperatorRoleLabel(currentOperator.role)})`;

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

    saveOperatorSession(employee, pin);
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
    await loadSettingsTabData({ force: true });
    return;
  }

  if (action === "switch-settings-subtab") {
    activeSettingsSubTab = button.dataset.settingsTab || "rooms";
    renderRooms();
    return;
  }

  if (action === "view-settings-package-detail") {
    await selectSettingsPackage(button.dataset.packageId);
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
    setTimeout(() => {
      const form = document.querySelector(".master-form");
      if (form && typeof form.scrollIntoView === "function") {
        form.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 0);
    showInlineNotice(`Form edit ${getMasterEntityName(button.dataset.masterType, item)} dibuka.`);
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

  if (action === "open-add-inventory-item-modal") {
    openAddInventoryItemModal();
    return;
  }

  if (action === "close-add-inventory-item-modal") {
    closeAddInventoryItemModal();
    return;
  }

  if (action === "submit-add-inventory-item") {
    submitAddInventoryItem();
    return;
  }

  if (action === "refresh-master-audit-logs") {
    await loadMasterDataAuditLogs({ force: true });
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

  if (action === "switch-fnb-subtab") {
    const subtab = button.dataset.fnbSubtab;
    if (subtab && ["order", "open", "history"].includes(subtab)) {
      activeFnbSubTab = subtab;
      renderDashboardTabPanels();
    }
    return;
  }

  if (action === "switch-transactions-subtab") {
    const subtab = button.dataset.transactionsSubtab;
    if (subtab && ["history", "closing"].includes(subtab)) {
      activeTransactionsSubTab = subtab;
      renderDashboardTabPanels();
    }
    return;
  }

  if (action === "switch-report-subtab") {
    const subtab = button.dataset.reportTab;
    if (subtab && REPORT_SUB_TABS.some((t) => t.key === subtab)) {
      setActiveReportSubTab(subtab);
    }
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
    showReceiptPrint(await findTransactionForAction(button));
    return;
  }

  if (action === "hide-receipt-print") {
    hideReceiptPrint();
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

  if (action === "close-cashier-closing-confirmation") {
    closeCashierClosingConfirmation();
    return;
  }

  if (action === "confirm-save-cashier-closing") {
    await saveCashierClosing();
    return;
  }

  if (action === "print-receipt") {
    await printReceipt();
    return;
  }

  if (action === "preview-thermal-receipt") {
    await showThermalReceiptPreview(selectedReceiptTransaction || lastTransaction);
    return;
  }

  if (action === "print-thermal-receipt") {
    await printThermalReceiptFromTransaction();
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
    await showClosingPrintPreview(button.dataset.closingId || "");
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
    openCashierClosingConfirmation();
    return;
  }

  if (action === "mark-paid") {
    const summary = button.closest(".billing-summary");
    const transactionId = button.dataset.transactionId || summary?.dataset.transactionId || "";
    const paymentMethod = summary?.querySelector(".billing-payment-select")?.value || "";
    const promoInput = summary?.querySelector(".billing-payment-promo-input");
    const promoCode = promoInput ? promoInput.getAttribute("data-applied-promo-code") || "" : "";

    await markTransactionPaid(transactionId, paymentMethod, promoCode, { updateBillingSummary: true });
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

  if (action === "filter-menu-spirit") {
    setMenuSpiritFilter(button.dataset.subcategory || "all");
    return;
  }

  if (action === "add-menu-to-cart") {
    addMenuItemToCart(button.dataset.menuId || "");
    return;
  }

  if (action === "set-fnb-order-mode") {
    setFnbOrderMode(button.dataset.mode || "room");
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
    await loadMenuItems();
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
    await Promise.all([
      loadOwnerDashboardSummary(),
      loadOwnerPeriodReport(),
    ]);
    return;
  }

  if (action === "filter-owner-report-period") {
    setOwnerReportPeriodFilter(button.dataset.period || "today");
    return;
  }

  if (action === "apply-owner-report-custom-period") {
    await applyOwnerReportCustomPeriod();
    return;
  }

  if (action === "show-owner-report-print") {
    showOwnerReportPrintPreview();
    return;
  }

  if (action === "hide-owner-report-print") {
    hideOwnerReportPrintPreview();
    return;
  }

  if (action === "print-owner-report") {
    printOwnerReport();
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

  if (action === "prepare-room-session-duration") {
    const roomId = button.dataset.roomId || "";
    const activeLcIds = (selectedLcIdsForRoom[roomId] || []).join(",");
    await prepareRoomSession(roomId, Number(button.dataset.durationMinutes), customerNameInput, "", activeLcIds);
    customerNameInput = "";
    delete selectedLcIdsForRoom[roomId];
    delete selectedLcDurationsForRoom[roomId];
    return;
  }

  if (action === "prepare-room-session-custom-duration") {
    const selectedDuration = Number(customDurationMinutes);

    if (!Number.isFinite(selectedDuration) || selectedDuration <= 0) {
      showInlineNotice("Isi durasi custom terlebih dahulu.", "error");
      return;
    }

    if (selectedDuration < getMinimumSessionMinutes()) {
      showInlineNotice(getMinimumSessionMessage(), "error");
      return;
    }

    const roomId = button.dataset.roomId || "";
    const activeLcIds = (selectedLcIdsForRoom[roomId] || []).join(",");
    await prepareRoomSession(roomId, selectedDuration, customerNameInput, "", activeLcIds);
    customerNameInput = "";
    delete selectedLcIdsForRoom[roomId];
    delete selectedLcDurationsForRoom[roomId];
    return;
  }

  if (action === "cancel-duration-selection") {
    cancelDurationSelection();
    return;
  }

  if (action === "show-extend-selection") {
    if (getCurrentOperatorRole() === "receptionist") {
      showInlineNotice("Resepsionis tidak diizinkan menambah waktu.", "error");
      return;
    }
    showExtendSelection(button.dataset.roomId || roomId || "");
    return;
  }

  if (action === "show-lc-selection") {
    if (getCurrentOperatorRole() === "receptionist") {
      showInlineNotice("Resepsionis tidak diizinkan memilih LC.", "error");
      return;
    }
    showLcSelection(button.dataset.roomId || roomId || "");
    return;
  }

  if (action === "cancel-lc-selection") {
    cancelLcSelection();
    return;
  }

  if (action === "save-lc-selection") {
    await saveSessionLcSelection(button.dataset.roomId || roomId || "");
    return;
  }

  if (action === "toggle-lc-checkbox") {
    // handled inline by onchange — no-op
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

  if (room.status === "waiting_payment") {
    showPaymentSelection(roomId);
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

  if (room.status === "paid_waiting_start") {
    await activatePreparedSession(roomId);
    return;
  }

  if (room.status === "cleaning") {
    await completeCleaning(roomId);
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

  if (action === "update-owner-report-custom-start-date") {
    updateOwnerReportCustomStartDate(field.value);
    return;
  }

  if (action === "update-owner-report-custom-end-date") {
    updateOwnerReportCustomEndDate(field.value);
    return;
  }

  if (action === "search-menu") {
    setMenuSearchQuery(field.value);
    return;
  }

  if (action === "update-customer-name") {
    updateCustomerName(field.value);
    return;
  }

  if (action === "update-fnb-order-note") {
    updateFnbOrderNote(field.value);
    return;
  }

  if (action === "update-fb-payment-method") {
    fnbOrderPaymentMethod = field.value;
    return;
  }

  if (action === "update-duration-payment-method") {
    updateDurationPaymentMethod(field.value);
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

  if (action === "update-extend-payment-method") {
    extendPaymentMethod = field.value;
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

  if (action === "filter-settings-menu") {
    settingsMenuSearchQuery = field.value;
    resetPaginationPage("settingsMenu");
    renderRooms();
    return;
  }

  if (action === "filter-settings-room") {
    settingsRoomSearchQuery = field.value;
    resetPaginationPage("settingsRooms");
    renderRooms();
    return;
  }

  if (action === "filter-settings-inventory") {
    settingsInventorySearchQuery = field.value;
    resetPaginationPage("settingsInventory");
    renderRooms();
    return;
  }

  if (action === "filter-settings-package") {
    settingsPackageSearchQuery = field.value;
    resetPaginationPage("settingsPackages");
    renderRooms();
    return;
  }

  if (action === "filter-settings-access") {
    settingsAccessSearchQuery = field.value;
    resetPaginationPage("settingsAccess");
    renderRooms();
    return;
  }

  if (action === "update-add-inventory-item-form") {
    updateAddInventoryItemForm(field.dataset.field, field.value);
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
  const durationPaymentField = event.target.closest("[data-action='update-duration-payment-method']");

  if (durationPaymentField) {
    updateDurationPaymentMethod(durationPaymentField.value);
    return;
  }

  const masterField = event.target.closest("[data-action='update-master-form']");

  if (masterField) {
    updateMasterDataForm(masterField.dataset.field, masterField.value);
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
    loadMasterDataAuditLogs({ force: true });
    return;
  }

  const auditActionFilter = event.target.closest("[data-action='filter-master-audit-action']");

  if (auditActionFilter) {
    masterAuditActionFilter = auditActionFilter.value || "all";
    loadMasterDataAuditLogs({ force: true });
    return;
  }

  const menuAnalysisFilter = event.target.closest("[data-action='filter-settings-menu-analysis']");

  if (menuAnalysisFilter) {
    settingsMenuAnalysisFilter = menuAnalysisFilter.value || "all";
    resetPaginationPage("settingsMenu");
    renderRooms();
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
  
  // Update the input value in-place to avoid cursor jumps / redraws
  loginPinInput.value = loginPin;

  // Update the submit button status and remove error message without re-rendering the whole screen
  const loginForm = loginPinInput.closest("[data-action='operator-login-form']");
  if (loginForm) {
    const submitButton = loginForm.querySelector(".operator-login-button");
    if (submitButton) {
      submitButton.disabled = isLoggingIn || !loginPin.trim();
    }
    const errorEl = loginForm.querySelector(".operator-login-error");
    if (errorEl) {
      errorEl.remove();
    }
  }
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

// Jalankan silent refresh setiap 10 detik jika tidak sedang sibuk
setInterval(async () => {
  if (!isOperatorLoggedIn() || activeDashboardTab !== "rooms") {
    return;
  }
  if (isUserBusy()) {
    console.info("Auto-refresh ditunda: Pengguna sedang sibuk.");
    return;
  }
  await silentReloadRooms();
}, 10000);

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
  await loadRooms();
  await loadPackages();

  const initialLoads = [];

  if (activeDashboardTab === "fnb" || activeDashboardTab === "stock" || activeDashboardTab === "rooms") {
    initialLoads.push(loadInventoryItems());
  }

  if (activeDashboardTab === "fnb" || activeDashboardTab === "rooms") {
    initialLoads.push(loadMenuItems());
  }

  if (activeDashboardTab === "fnb") {
    initialLoads.push(loadOpenFnbOrders(), loadTodayFnbOrders());
  }

  if (activeDashboardTab === "stock") {
    initialLoads.push(loadTodayStockMovements());
  }

  if (activeDashboardTab === "reports") {
    initialLoads.push(refreshActiveReportSubTabData());
  }

  if (activeDashboardTab === "audit") {
    initialLoads.push(loadTodayRoomTimeLogs());
  }

  if (activeDashboardTab === "transactions") {
    initialLoads.push(loadTodayTransactions(), loadTodayCashierClosings());
  }

  if (activeDashboardTab === "settings" && canAccessDashboardTab("settings")) {
    initialLoads.push(loadSettingsTabData());
  }

  if (activeDashboardTab === "promosi" && canAccessDashboardTab("promosi")) {
    initialLoads.push(loadPromos());
  }

  await Promise.all(initialLoads);
}
