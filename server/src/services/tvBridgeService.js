/**
 * Jembatan POS <-> TV Control Bridge (C:\karaoke-tv-bridge, port 3030).
 *
 * Prinsip:
 *  - Semua panggilan bersifat BEST-EFFORT: kegagalan bridge TIDAK boleh menggagalkan
 *    transaksi kasir. Setiap percobaan tetap dicatat ke tabel tv_control_logs supaya
 *    "TV tidak mati" terlihat di data, bukan ketahuan besok pagi.
 *  - Sumber kebenaran jadwal adalah tabel `rooms` (status + scheduled_end_time).
 *    Fungsi syncRoom() membaca DB lalu menyesuaikan jadwal di bridge, jadi urutan
 *    perubahan di controller tidak perlu diikuti satu per satu.
 *  - Bridge yang memegang jadwal: peringatan T-15/T-5 di layar TV dan peniduran TV
 *    di T-0 + masa tenggang tetap jalan walau tab kasir ditutup.
 */

const db = require('../db');

// Status ruangan yang berarti "sedang dipakai pelanggan" (lihat roomsController.startSession).
// Ini yang membuat bridge memasang jadwal peringatan + peniduran TV.
const ACTIVE_ROOM_STATUSES = ['occupied'];

function getConfig() {
  const warnMinutes = String(process.env.TV_BRIDGE_WARN_MINUTES || '15,5')
    .split(',')
    .map((value) => Number(String(value).trim()))
    .filter((value) => Number.isFinite(value) && value > 0);

  return {
    enabled: String(process.env.TV_BRIDGE_ENABLED || '1') !== '0',
    url: String(process.env.TV_BRIDGE_URL || 'http://127.0.0.1:3030').replace(/\/+$/, ''),
    token: String(process.env.TV_BRIDGE_TOKEN || '').trim(),
    warnMinutes: warnMinutes.length > 0 ? warnMinutes : [15, 5],
    graceSeconds: Number(process.env.TV_BRIDGE_GRACE_SECONDS || 60),
    timeoutMs: Number(process.env.TV_BRIDGE_TIMEOUT_MS || 8000),
    sweepEnabled: String(process.env.DISABLE_TV_SWEEPER || '') !== '1',
    sweepIntervalMs: Number(process.env.TV_BRIDGE_SWEEP_INTERVAL_MS || 60000),
    sweepMaxLateMinutes: Number(process.env.TV_BRIDGE_SWEEP_MAX_LATE_MINUTES || 360),
    sweepRepeatMinutes: Number(process.env.TV_BRIDGE_SWEEP_REPEAT_MINUTES || 5),
    sweepDryRun: String(process.env.TV_BRIDGE_SWEEP_DRY_RUN || '') === '1',
    // Pengaman masa uji: kalau diisi, perintah TV hanya dikirim untuk ruangan di daftar ini.
    // Kosongkan untuk memberlakukan ke semua ruangan.
    roomAllowlist: String(process.env.TV_BRIDGE_ROOM_ALLOWLIST || '')
      .split(',')
      .map((value) => value.trim().toUpperCase())
      .filter(Boolean),
  };
}

function isRoomAllowed(roomId) {
  const { roomAllowlist } = getConfig();
  if (roomAllowlist.length === 0) {
    return true;
  }
  return roomAllowlist.includes(String(roomId || '').toUpperCase());
}

function log(message) {
  console.log(`[TV bridge] ${message}`);
}

async function bridgeFetch(pathname, options = {}) {
  const config = getConfig();
  if (!config.enabled) {
    return { ok: false, skipped: true, error: 'TV bridge dinonaktifkan (TV_BRIDGE_ENABLED=0).' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs || config.timeoutMs);

  try {
    const response = await fetch(`${config.url}${pathname}`, {
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(config.token ? { 'X-API-Token': config.token } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });

    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch (error) {
      data = { raw: text };
    }

    if (!response.ok || (data && data.success === false)) {
      return {
        ok: false,
        status: response.status,
        data,
        error: (data && (data.error || data.message)) || `HTTP ${response.status}`,
      };
    }

    return { ok: true, status: response.status, data };
  } catch (error) {
    const message = error.name === 'AbortError'
      ? `bridge tidak menjawab dalam ${options.timeoutMs || config.timeoutMs} ms`
      : error.message;
    return { ok: false, error: message };
  } finally {
    clearTimeout(timer);
  }
}

/** Id perangkat TV untuk ruangan ini (kolom tv_device_id punya foreign key ke tv_devices). */
async function resolveTvDeviceId(roomId) {
  if (!roomId) {
    return null;
  }

  try {
    const result = await db.query(
      `SELECT tv_device_id FROM tv_devices
        WHERE room_id = $1
        ORDER BY (status = 'active') DESC, tv_device_id ASC
        LIMIT 1`,
      [roomId],
    );
    return result.rowCount > 0 ? result.rows[0].tv_device_id : null;
  } catch (error) {
    return null;
  }
}

async function recordTvLog(entry) {
  const {
    roomId,
    action,
    triggerSource = 'pos_server',
    cashierName = 'Sistem',
    controlType = 'middleware',
    result = 'failed',
    success = false,
    blockReason = null,
    message = '',
    rawResponse = '',
  } = entry;

  const tvDeviceId = entry.tvDeviceId !== undefined ? entry.tvDeviceId : await resolveTvDeviceId(roomId);

  try {
    await db.query(
      `INSERT INTO tv_control_logs (
        log_id, room_id, tv_device_id, tv_action, trigger_source,
        cashier_name, control_type, result, success, block_reason, message, raw_response
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        `TVB-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
        roomId,
        tvDeviceId,
        action,
        triggerSource,
        cashierName,
        controlType,
        result,
        success,
        blockReason,
        message,
        String(rawResponse || '').slice(0, 2000),
      ],
    );
  } catch (error) {
    console.warn(`[TV bridge] gagal menulis catatan audit: ${error.message}`);
  }
}

/** Perintah bentuk /tv-command (Apps Script compatible) - power_on, power_off, test, notify. */
async function sendTvCommand(roomId, action, options = {}) {
  const body = {
    room_id: roomId,
    tv_action: action,
    trigger_source: options.triggerSource || 'pos_server',
    requested_by: options.cashierName || 'Sistem',
  };

  if (options.text || options.subtext || options.seconds) {
    body.text = options.text;
    body.subtext = options.subtext;
    body.seconds = options.seconds;
  }

  const result = await bridgeFetch('/tv-command', { method: 'POST', body });

  await recordTvLog({
    roomId,
    action,
    triggerSource: body.trigger_source,
    cashierName: body.requested_by,
    result: result.ok ? 'sent' : 'failed',
    success: result.ok,
    blockReason: result.ok ? null : 'BRIDGE_ERROR',
    message: result.ok
      ? String((result.data && result.data.message) || `Perintah ${action} dikirim ke bridge.`)
      : `Perintah ${action} gagal: ${result.error}`,
    rawResponse: JSON.stringify((result.data && (result.data.data || result.data)) || result.error || ''),
  });

  if (!result.ok) {
    log(`PERINTAH ${action} ${roomId} GAGAL: ${result.error}`);
  }

  return result;
}

/**
 * Memasang jadwal peringatan + peniduran TV untuk sebuah ruangan.
 * Kalau jam berakhir sudah lewat, langsung kirim perintah matikan (perilaku lama dashboard).
 */
async function startSchedule(roomId, endTime, options = {}) {
  const config = getConfig();
  const endMs = new Date(endTime).getTime();

  if (!Number.isFinite(endMs)) {
    return { ok: false, skipped: true, error: 'scheduled_end_time tidak valid' };
  }

  const remainingSeconds = Math.round((endMs - Date.now()) / 1000);
  if (remainingSeconds <= 0) {
    return sendTvCommand(roomId, 'power_off', {
      triggerSource: options.triggerSource || 'countdown_expired',
      cashierName: options.cashierName,
    });
  }

  const body = {
    seconds: remainingSeconds,
    warnMinutes: config.warnMinutes,
    graceSeconds: config.graceSeconds,
    wakeOnStart: Boolean(options.wakeOnStart),
  };

  const result = await bridgeFetch(`/api/rooms/${encodeURIComponent(roomId)}/countdown/start`, {
    method: 'POST',
    body,
  });

  await recordTvLog({
    roomId,
    action: 'schedule_warning',
    triggerSource: options.triggerSource || 'pos_schedule',
    cashierName: options.cashierName,
    result: result.ok ? 'sent' : 'failed',
    success: result.ok,
    blockReason: result.ok ? null : 'BRIDGE_ERROR',
    message: result.ok
      ? `Jadwal peringatan dipasang: ${remainingSeconds} detik lagi (peringatan T-${config.warnMinutes.join(', T-')} menit).`
      : `Gagal memasang jadwal peringatan: ${result.error}`,
    rawResponse: JSON.stringify((result.data && result.data.countdown) || result.error || ''),
  });

  log(result.ok
    ? `Jadwal ${roomId}: ${remainingSeconds} detik (peringatan T-${config.warnMinutes.join(', T-')} menit)`
    : `Jadwal ${roomId} GAGAL: ${result.error}`);

  return result;
}

async function cancelSchedule(roomId, options = {}) {
  const result = await bridgeFetch(`/api/rooms/${encodeURIComponent(roomId)}/countdown/cancel`, { method: 'POST' });

  await recordTvLog({
    roomId,
    action: 'cancel_schedule',
    triggerSource: options.triggerSource || 'pos_cancel',
    cashierName: options.cashierName,
    result: result.ok ? 'sent' : 'failed',
    success: result.ok,
    blockReason: result.ok ? null : 'BRIDGE_ERROR',
    message: result.ok
      ? 'Jadwal peringatan dibatalkan (waktu tidak habis lagi).'
      : `Gagal membatalkan jadwal: ${result.error}`,
    rawResponse: JSON.stringify((result.data && result.data.countdown) || result.error || ''),
  });

  return result;
}

/** Menampilkan pesan bebas di layar TV ruangan (mis. pemberitahuan manual kasir). */
async function notifyRoom(roomId, options = {}) {
  const result = await bridgeFetch(`/api/rooms/${encodeURIComponent(roomId)}/notify`, {
    method: 'POST',
    body: {
      text: options.text,
      subtext: options.subtext,
      seconds: options.seconds,
    },
  });

  await recordTvLog({
    roomId,
    action: 'notify',
    triggerSource: options.triggerSource || 'pos_notify',
    cashierName: options.cashierName,
    result: result.ok ? 'sent' : 'failed',
    success: result.ok,
    blockReason: result.ok ? null : 'BRIDGE_ERROR',
    message: result.ok
      ? `Pesan tampil di layar TV: ${options.text || ''}`
      : `Gagal mengirim pesan: ${result.error}`,
    rawResponse: JSON.stringify((result.data && result.data.result) || result.error || ''),
  });

  return result;
}

/**
 * Menyesuaikan keadaan bridge dengan keadaan ruangan di DB.
 *  - ruangan aktif & berakhir di masa depan -> pasang/segarkan jadwal
 *  - ruangan tidak aktif                    -> batalkan jadwal (+ tidurkan bila diminta)
 */
async function syncRoom(roomId, options = {}) {
  const config = getConfig();
  if (!config.enabled) {
    return { ok: false, skipped: true };
  }
  if (!roomId) {
    return { ok: false, skipped: true, error: 'room_id kosong' };
  }

  if (!isRoomAllowed(roomId)) {
    log(`Sinkronisasi ${roomId} dilewati (di luar daftar TV_BRIDGE_ROOM_ALLOWLIST).`);
    return { ok: false, skipped: true, reason: 'ruangan di luar daftar uji' };
  }

  try {
    const result = await db.query(
      'SELECT room_id, room_name, status, scheduled_end_time FROM rooms WHERE room_id = $1',
      [roomId],
    );

    if (result.rowCount === 0) {
      return { ok: false, skipped: true, error: `ruangan ${roomId} tidak ditemukan` };
    }

    const room = result.rows[0];

    if (ACTIVE_ROOM_STATUSES.includes(room.status) && room.scheduled_end_time) {
      return startSchedule(room.room_id, room.scheduled_end_time, options);
    }

    const cancelled = await cancelSchedule(room.room_id, options);

    if (options.sleepWhenInactive) {
      const sleepResult = await sendTvCommand(room.room_id, 'power_off', options);
      return { ok: cancelled.ok && sleepResult.ok, cancelled, sleep: sleepResult };
    }

    return cancelled;
  } catch (error) {
    log(`Sinkronisasi ${roomId} gagal: ${error.message}`);
    return { ok: false, error: error.message };
  }
}

/**
 * Penyapu: ruangan yang sudah lewat waktu habis tapi tidak ada satu pun catatan sukses
 * "power_off" -> kirim ulang. Jaring pengaman untuk bridge mati, TV tak terjangkau, dll.
 */
async function sweepExpiredRooms() {
  const config = getConfig();
  if (!config.enabled || !config.sweepEnabled) {
    return { skipped: true, reason: 'penyapu dimatikan' };
  }

  const lateSeconds = Math.max(0, config.graceSeconds);
  const maxLateSeconds = Math.max(lateSeconds + 60, config.sweepMaxLateMinutes * 60);

  try {
    const rows = await db.query(
      `SELECT room_id, room_name, scheduled_end_time
         FROM rooms
        WHERE status = ANY($3)
          AND scheduled_end_time IS NOT NULL
          AND scheduled_end_time < now() - make_interval(secs => $1)
          AND scheduled_end_time > now() - make_interval(secs => $2)`,
      [lateSeconds, maxLateSeconds, ACTIVE_ROOM_STATUSES],
    );

    const actions = [];
    const repeatWindowMs = Math.max(1, config.sweepRepeatMinutes) * 60 * 1000;

    for (const room of rows.rows) {
      if (!isRoomAllowed(room.room_id)) {
        actions.push({ roomId: room.room_id, action: 'dilewati', reason: 'di luar daftar uji' });
        continue;
      }

      // Penjaga tambahan: walau penulisan catatan gagal, satu ruangan tidak ditembak
      // berulang-ulang dalam satu jendela waktu yang singkat.
      const lastAttempt = lastSweepAttemptByRoom.get(room.room_id) || 0;
      if (Date.now() - lastAttempt < repeatWindowMs) {
        actions.push({ roomId: room.room_id, action: 'dilewati', reason: 'baru saja dicoba, menunggu jendela ulang' });
        continue;
      }

      const alreadyDone = await db.query(
        `SELECT 1 FROM tv_control_logs
          WHERE room_id = $1 AND tv_action = 'power_off' AND success = true AND created_at >= $2
          LIMIT 1`,
        [room.room_id, room.scheduled_end_time],
      );

      if (alreadyDone.rowCount > 0) {
        actions.push({ roomId: room.room_id, action: 'dilewati', reason: 'sudah ada catatan sukses' });
        continue;
      }

      if (config.sweepDryRun) {
        actions.push({ roomId: room.room_id, action: 'uji-coba', reason: 'TV_BRIDGE_SWEEP_DRY_RUN=1' });
        continue;
      }

      lastSweepAttemptByRoom.set(room.room_id, Date.now());

      const result = await sendTvCommand(room.room_id, 'power_off', {
        triggerSource: 'sweeper_expired',
        cashierName: 'Sistem (penyapu)',
      });
      actions.push({ roomId: room.room_id, action: 'power_off', ok: result.ok, error: result.error || null });
    }

    if (actions.length > 0) {
      log(`Penyapu: ${actions.length} ruangan lewat waktu -> ${JSON.stringify(actions)}`);
    }

    return { checked: rows.rowCount, actions };
  } catch (error) {
    log(`Penyapu gagal: ${error.message}`);
    return { ok: false, error: error.message };
  }
}

async function getBridgeHealth() {
  const config = getConfig();
  return bridgeFetch('/health', { timeoutMs: Math.min(config.timeoutMs, 4000) });
}

async function getBridgeRooms() {
  const config = getConfig();
  return bridgeFetch('/api/rooms', { timeoutMs: Math.min(config.timeoutMs, 4000) });
}

async function getBridgeRoomStatus(roomId) {
  const config = getConfig();
  return bridgeFetch(`/api/rooms/${encodeURIComponent(roomId)}/status`, { timeoutMs: Math.min(config.timeoutMs, 3000) });
}

async function updateBridgeRoomConfig(roomId, roomConfig) {
  const config = getConfig();
  return bridgeFetch(`/api/rooms/${encodeURIComponent(roomId)}/config`, {
    method: 'PUT',
    body: roomConfig,
    timeoutMs: Math.min(config.timeoutMs, 5000),
  });
}

/**
 * Keadaan APK peringatan untuk SEMUA ruangan sekaligus, dari bridge (GET /api/rooms).
 * Sekali ambil untuk seluruh halaman: memanggil per ruangan berarti 20 panggilan bridge
 * setiap kali halaman Kontrol TV dibuka.
 * Balasan: { ok, rooms: [{ roomId, known, connected, installed, allowed, packageName }] }
 * `known:false` berarti belum pernah diperiksa - UI boleh menawarkan tombol pasang.
 */
async function getOverlayStates() {
  const res = await getBridgeRooms();
  if (!res.ok || !res.data || !Array.isArray(res.data.rooms)) {
    return { ok: false, rooms: [], error: res.error || 'bridge tidak menjawab' };
  }

  const rooms = res.data.rooms.map((room) => {
    const connected = Boolean(room.runtime && typeof room.runtime.connected === 'boolean'
      ? room.runtime.connected
      : room.connected);

    return {
      roomId: room.id,
      roomName: room.name,
      connected,
      known: typeof room.overlayInstalled === 'boolean',
      installed: typeof room.overlayInstalled === 'boolean' ? room.overlayInstalled : null,
      allowed: typeof room.overlayAllowed === 'boolean' ? room.overlayAllowed : null,
      packageName: room.overlayPackage || null,
    };
  });

  return { ok: true, rooms };
}

/**
 * Memasang APK peringatan (bawaan sistem POS) ke TV sebuah ruangan.
 *
 * Batas waktunya SENGAJA lebih panjang dari panggilan bridge lain: `adb install` ke TV
 * memakan 5-20 detik. Batas bawaan (8 detik) akan membatalkan pemanggilan sementara bridge
 * masih memasang, operator melihat "gagal", menekan lagi - dan TV menerima perintah dua kali.
 * Path APK tidak pernah dikirim dari sini: bridge memakai TV_OVERLAY_APK di .env-nya sendiri.
 */
async function installOverlay(roomId, options = {}) {
  const config = getConfig();
  const result = await bridgeFetch(`/api/rooms/${encodeURIComponent(roomId)}/overlay/install`, {
    method: 'POST',
    timeoutMs: Number(process.env.TV_BRIDGE_INSTALL_TIMEOUT_MS) || 60000,
  });

  const payload = result.ok && result.data && result.data.result ? result.data.result : null;

  await recordTvLog({
    roomId,
    action: 'install_overlay',
    triggerSource: options.triggerSource || 'kontrol_tv_ui',
    cashierName: options.cashierName || 'Sistem',
    result: result.ok ? (payload && payload.overlayInstalled ? 'installed' : 'sent') : 'failed',
    success: result.ok,
    blockReason: result.ok ? null : 'BRIDGE_ERROR',
    message: result.ok
      ? `APK peringatan ruangan ${roomId}: terpasang=${payload ? payload.overlayInstalled : '?'}, izin=${payload ? payload.overlayAllowed : '?'}`
      : `Pemasangan APK peringatan ruangan ${roomId} gagal: ${result.error}`,
    rawResponse: JSON.stringify(payload || result.error || ''),
  });

  if (!result.ok) {
    log(`PASANG PERINGATAN ${roomId} GAGAL: ${result.error}`);
  }

  return result;
}

async function reloadBridgeConfig() {
  const config = getConfig();
  return bridgeFetch('/api/config/reload', {
    method: 'POST',
    timeoutMs: Math.min(config.timeoutMs, 5000),
  });
}

const lastSweepAttemptByRoom = new Map();

let sweeperHandle = null;
let sweeperRunning = false;
let lastSweepAt = null;
let lastSweepResult = null;

function startTvSweeperWorker(intervalMs) {
  const config = getConfig();
  if (!config.sweepEnabled) {
    log('Penyapu dimatikan (DISABLE_TV_SWEEPER=1).');
    return null;
  }
  if (sweeperHandle) {
    return sweeperHandle;
  }

  const interval = Number(intervalMs) || config.sweepIntervalMs;
  log(`Penyapu TV aktif: memeriksa setiap ${Math.round(interval / 1000)} detik`
    + `${config.sweepDryRun ? ' (MODE UJI COBA, tidak mengirim perintah)' : ''}.`);

  sweeperHandle = setInterval(async () => {
    if (sweeperRunning) {
      return;
    }
    sweeperRunning = true;
    try {
      lastSweepResult = await sweepExpiredRooms();
      lastSweepAt = new Date().toISOString();
    } catch (error) {
      lastSweepResult = { ok: false, error: error.message };
    } finally {
      sweeperRunning = false;
    }
  }, interval);

  if (typeof sweeperHandle.unref === 'function') {
    sweeperHandle.unref();
  }

  return sweeperHandle;
}

function getTvSweeperStatus() {
  const config = getConfig();
  return {
    enabled: config.sweepEnabled && config.enabled,
    dryRun: config.sweepDryRun,
    intervalMs: config.sweepIntervalMs,
    bridgeUrl: config.url,
    lastSweepAt,
    lastSweepResult,
  };
}

module.exports = {
  cancelSchedule,
  isRoomAllowed,
  getBridgeHealth,
  getBridgeRooms,
  getBridgeRoomStatus,
  getConfig,
  getOverlayStates,
  getTvSweeperStatus,
  installOverlay,
  notifyRoom,
  recordTvLog,
  reloadBridgeConfig,
  sendTvCommand,
  startSchedule,
  startTvSweeperWorker,
  sweepExpiredRooms,
  syncRoom,
  updateBridgeRoomConfig,
};
