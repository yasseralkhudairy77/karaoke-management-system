import { API_BASE_URL } from "./config.js";

var DEFAULT_REFRESH_SECONDS = 30;
var WARNING_REFRESH_SECONDS = 15;
var IDLE_REFRESH_SECONDS = 15;
var SLOW_REQUEST_NOTICE_MS = 12000;
var FETCH_HARD_TIMEOUT_MS = 70000;
var EXPIRED_RESYNC_SECONDS = 5;
var HARD_RELOAD_MINUTES = 60;
var MISSING_CONFIG_MESSAGE = "Display belum dikonfigurasi. Silakan hubungi kasir.";
var RECONNECT_MESSAGE = "Sedang memperbarui tampilan...";
var IDLE_MESSAGE = "Silakan hubungi kasir untuk mulai karaoke.";
var queryParams = new URLSearchParams(window.location.search);
var roomId = String(queryParams.get("room_id") || "").trim();
var token = String(queryParams.get("token") || "").trim();
var elements = {};
var currentState = null;
var serverOffsetMs = 0;
var pollTimerId = null;
var countdownTimerId = null;
var expiredResyncTimerId = null;
var hardReloadTimerId = null;
var hasWarnedFetchFailure = false;
var isReconnecting = false;
var latestRequestId = 0;

document.addEventListener("DOMContentLoaded", initDisplay);
window.addEventListener("beforeunload", clearTimers);

function initDisplay() {
  elements = {
    root: document.getElementById("displayRoot"),
    lastUpdate: document.getElementById("lastUpdate"),
    statusLabel: document.getElementById("statusLabel"),
    roomName: document.getElementById("roomName"),
    timerText: document.getElementById("timerText"),
    messageText: document.getElementById("messageText"),
    startTime: document.getElementById("startTime"),
    endTime: document.getElementById("endTime"),
    durationText: document.getElementById("durationText"),
  };

  renderLoading();

  if (!roomId || !token) {
    renderSafeMessage(MISSING_CONFIG_MESSAGE, "idle");
    return;
  }

  if (!String(API_BASE_URL || "").trim()) {
    renderSafeMessage(RECONNECT_MESSAGE, "reconnecting");
    return;
  }

  startCountdownTimer();
  startHardReloadWatchdog();
  fetchDisplayState();
}

function postDisplayAction(payload) {
  var abortController = typeof AbortController === "function" ? new AbortController() : null;
  var hasCompleted = false;
  var hardTimeoutTimerId = null;
  var slowNoticeTimerId = window.setTimeout(function () {
    if (!hasCompleted) {
      renderReconnect();
    }
  }, SLOW_REQUEST_NOTICE_MS);
  var requestOptions = {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload),
  };

  if (abortController) {
    requestOptions.signal = abortController.signal;
  }

  var request = fetch(API_BASE_URL, {
    method: requestOptions.method,
    headers: requestOptions.headers,
    body: requestOptions.body,
    signal: requestOptions.signal,
  }).then(function (response) {
    return response.json();
  });

  var timeout = new Promise(function (_, reject) {
    hardTimeoutTimerId = window.setTimeout(function () {
      if (!hasCompleted && abortController) {
        abortController.abort();
      }

      reject(new Error("Customer display request timed out."));
    }, FETCH_HARD_TIMEOUT_MS);
  });

  return Promise.race([request, timeout]).finally(function () {
    hasCompleted = true;
    window.clearTimeout(slowNoticeTimerId);
    window.clearTimeout(hardTimeoutTimerId);
  });
}

function fetchDisplayState() {
  clearPollTimer();

  var requestId = latestRequestId + 1;
  latestRequestId = requestId;

  postDisplayAction({
    action: "getCustomerDisplayState",
    room_id: roomId,
    token: token,
  })
    .then(function (data) {
      if (requestId !== latestRequestId) {
        return;
      }

      if (!data || data.success === false || data.ok === false) {
        handleBackendError(data);
        scheduleNextPoll(DEFAULT_REFRESH_SECONDS);
        return;
      }

      hasWarnedFetchFailure = false;
      isReconnecting = false;
      clearExpiredResyncTimer();
      applyDisplayState(data);
      scheduleNextPoll(getRefreshIntervalSeconds(data));
    })
    .catch(function (error) {
      if (requestId !== latestRequestId) {
        return;
      }

      if (!hasWarnedFetchFailure) {
        console.warn("Customer display update delayed.", getSafeErrorName(error));
        hasWarnedFetchFailure = true;
      }

      renderReconnect();
      scheduleNextPoll(DEFAULT_REFRESH_SECONDS);
    });
}

function applyDisplayState(data) {
  var serverTime = data.server_time ? new Date(data.server_time).getTime() : NaN;

  if (!isNaN(serverTime)) {
    serverOffsetMs = serverTime - Date.now();
  }

  currentState = data;
  renderState(data);
}

function renderState(data) {
  var room = data.room || {};
  var session = data.session || {};
  var hasActiveSession = session.has_active_session === true;
  var tone = hasActiveSession ? normalizeTone(session.warning_level) : "idle";
  var roomName = room.room_name || room.room_id || "Karaoke Room";

  setTone(tone);
  setText(elements.roomName, roomName);
  setText(elements.lastUpdate, "Terakhir update: " + formatClock(new Date()));

  if (!hasActiveSession) {
    setText(elements.statusLabel, "Ruangan tersedia");
    setText(elements.timerText, "00:00:00");
    setText(elements.messageText, IDLE_MESSAGE);
    setText(elements.startTime, "--:--");
    setText(elements.endTime, "--:--");
    setText(elements.durationText, "-- menit");
    return;
  }

  setText(elements.statusLabel, "Sesi karaoke aktif");
  setText(elements.messageText, getDisplayMessage(data, getMessageForTone(tone)));
  setText(elements.startTime, formatTimeValue(session.start_time));
  setText(elements.endTime, formatTimeValue(session.end_time));
  setText(elements.durationText, formatDuration(session.duration_minutes));
  renderCountdown();
}

function renderCountdown() {
  if (!currentState || !currentState.session || currentState.session.has_active_session !== true) {
    return;
  }

  var session = currentState.session;
  var endTimeMs = session.end_time ? new Date(session.end_time).getTime() : NaN;

  if (isNaN(endTimeMs)) {
    setText(elements.timerText, "00:00:00");
    return;
  }

  var estimatedServerNow = Date.now() + serverOffsetMs;
  var remainingSeconds = Math.max(0, Math.floor((endTimeMs - estimatedServerNow) / 1000));
  var tone = normalizeTone(getWarningLevelFromRemaining(remainingSeconds));

  setText(elements.timerText, formatTimer(remainingSeconds));

  if (remainingSeconds <= 0) {
    scheduleExpiredResync();
  }

  if (isReconnecting) {
    return;
  }

  setTone(tone);
  setText(elements.messageText, getMessageForTone(tone));
}

function handleBackendError(data) {
  var errorCode = data && (data.error || data.code);
  var messageMap = {
    INVALID_DISPLAY_TOKEN: "Display tidak valid. Silakan hubungi kasir.",
    DISPLAY_DISABLED: "Display room sedang nonaktif. Silakan hubungi kasir.",
    DISPLAY_NOT_FOUND: "Display belum terdaftar. Silakan hubungi kasir.",
  };
  var message = messageMap[errorCode] || RECONNECT_MESSAGE;
  isReconnecting = true;

  if (currentState) {
    setTone("reconnecting");
    setText(elements.statusLabel, RECONNECT_MESSAGE);

    if (messageMap[errorCode]) {
      setText(elements.messageText, message);
    }

    return;
  }

  renderSafeMessage(message, errorCode ? "idle" : "reconnecting");
}

function renderLoading() {
  setTone("loading");
  setText(elements.statusLabel, "Sedang menyiapkan display...");
  setText(elements.roomName, "Karaoke Room");
  setText(elements.timerText, "00:00:00");
  setText(elements.messageText, "Sedang menyiapkan display...");
  setText(elements.startTime, "--:--");
  setText(elements.endTime, "--:--");
  setText(elements.durationText, "-- menit");
  setText(elements.lastUpdate, "Terakhir update: --:--:--");
}

function renderReconnect() {
  isReconnecting = true;

  if (currentState) {
    setTone("reconnecting");
    setText(elements.statusLabel, RECONNECT_MESSAGE);
    return;
  }

  renderSafeMessage(RECONNECT_MESSAGE, "reconnecting");
}

function renderSafeMessage(message, tone) {
  setTone(tone || "idle");
  setText(elements.statusLabel, message);
  setText(elements.roomName, "Karaoke Room");
  setText(elements.timerText, "00:00:00");
  setText(elements.messageText, message);
  setText(elements.startTime, "--:--");
  setText(elements.endTime, "--:--");
  setText(elements.durationText, "-- menit");
}

function startCountdownTimer() {
  clearCountdownTimer();
  countdownTimerId = window.setInterval(renderCountdown, 1000);
}

function scheduleNextPoll(seconds) {
  clearPollTimer();
  pollTimerId = window.setTimeout(fetchDisplayState, Math.max(5, Number(seconds) || DEFAULT_REFRESH_SECONDS) * 1000);
}

function scheduleExpiredResync() {
  if (expiredResyncTimerId) {
    return;
  }

  expiredResyncTimerId = window.setTimeout(function () {
    expiredResyncTimerId = null;
    fetchDisplayState();
  }, EXPIRED_RESYNC_SECONDS * 1000);
}

function getRefreshIntervalSeconds(data) {
  var session = data.session || {};
  var display = data.display || {};
  var remaining = Number(session.remaining_seconds);
  var backendInterval = Number(display.refresh_interval_seconds) || DEFAULT_REFRESH_SECONDS;

  if (session.has_active_session !== true) {
    return IDLE_REFRESH_SECONDS;
  }

  if (session.has_active_session === true && isFinite(remaining) && remaining <= 600) {
    return Math.min(backendInterval, WARNING_REFRESH_SECONDS);
  }

  return backendInterval > 0 ? backendInterval : DEFAULT_REFRESH_SECONDS;
}

function clearTimers() {
  clearPollTimer();
  clearCountdownTimer();
  clearExpiredResyncTimer();
  clearHardReloadTimer();
}

function clearPollTimer() {
  if (pollTimerId) {
    window.clearTimeout(pollTimerId);
    pollTimerId = null;
  }
}

function clearCountdownTimer() {
  if (countdownTimerId) {
    window.clearInterval(countdownTimerId);
    countdownTimerId = null;
  }
}

function clearExpiredResyncTimer() {
  if (expiredResyncTimerId) {
    window.clearTimeout(expiredResyncTimerId);
    expiredResyncTimerId = null;
  }
}

function startHardReloadWatchdog() {
  clearHardReloadTimer();

  if (!roomId || !token) {
    return;
  }

  hardReloadTimerId = window.setTimeout(function () {
    window.location.reload();
  }, HARD_RELOAD_MINUTES * 60 * 1000);
}

function clearHardReloadTimer() {
  if (hardReloadTimerId) {
    window.clearTimeout(hardReloadTimerId);
    hardReloadTimerId = null;
  }
}

function normalizeTone(warningLevel) {
  if (warningLevel === "warning_10") {
    return "warning-10";
  }

  if (warningLevel === "warning_5") {
    return "warning-5";
  }

  if (warningLevel === "expired") {
    return "expired";
  }

  if (warningLevel === "idle") {
    return "idle";
  }

  return "normal";
}

function getWarningLevelFromRemaining(remainingSeconds) {
  if (remainingSeconds <= 0) {
    return "expired";
  }

  if (remainingSeconds <= 300) {
    return "warning_5";
  }

  if (remainingSeconds <= 600) {
    return "warning_10";
  }

  return "normal";
}

function getMessageForTone(tone) {
  if (tone === "warning-10") {
    return "Waktu hampir habis, 10 menit terakhir.";
  }

  if (tone === "warning-5") {
    return "Waktu hampir habis. Silakan hubungi kasir jika ingin tambah waktu.";
  }

  if (tone === "expired") {
    return "Waktu karaoke telah habis. Silakan hubungi kasir.";
  }

  return "Selamat bernyanyi";
}

function getDisplayMessage(data, fallback) {
  var displayMessage = data && data.display ? String(data.display.message || "").trim() : "";

  return displayMessage || fallback;
}

function getSafeErrorName(error) {
  return error && error.name ? error.name : "FetchError";
}

function setTone(tone) {
  if (!elements.root) {
    return;
  }

  elements.root.className = "tv-display " + tone;
}

function setText(element, text) {
  if (element) {
    element.textContent = text;
  }
}

function formatTimer(totalSeconds) {
  var safeSeconds = Math.max(0, Number(totalSeconds) || 0);
  var hours = Math.floor(safeSeconds / 3600);
  var minutes = Math.floor((safeSeconds % 3600) / 60);
  var seconds = safeSeconds % 60;

  return [hours, minutes, seconds].map(padTwo).join(":");
}

function formatTimeValue(value) {
  if (!value) {
    return "--:--";
  }

  var date = new Date(value);

  if (isNaN(date.getTime())) {
    return "--:--";
  }

  return date.toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatClock(date) {
  return date.toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function formatDuration(minutes) {
  var safeMinutes = Math.max(0, Number(minutes) || 0);

  return safeMinutes + " menit";
}

function padTwo(value) {
  return String(value).padStart(2, "0");
}
