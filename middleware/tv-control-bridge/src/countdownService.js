const fs = require('node:fs');
const path = require('node:path');

const { sleepRoom, wakeRoom, sendOverlay, getTvPowerState } = require('./adbService');
const { recordEvent } = require('./tvEventLog');

/**
 * Jadwal peringatan per ruangan: T-15 dan T-5 lewat overlay di layar TV, lalu T-0
 * mengirim pesan "WAKTU HABIS" dan (setelah masa tenggang) menidurkan TV.
 *
 * Alasan bridge yang memegang jadwal: peringatan yang dipicu dari tab browser kasir
 * berhenti ada begitu tab ditutup. Jadwal di sini hidup di proses bridge.
 *
 * Keputusan pemilik yang tertanam di sini (2026-09-23):
 *   - masa tenggang setelah T-0 sebelum TV ditidurkan: 60 detik
 *   - perpanjangan setelah waktu habis menyalakan TV kembali: ya (wakeOnStart)
 *   - jadwal + riwayat ditulis ke berkas supaya tahan restart bridge
 */

const DEFAULT_WARN_OFFSETS_SECONDS = [900, 300];
const DEFAULT_FINAL_SECONDS = 30;
const DEFAULT_GRACE_SECONDS = 60;
const DEFAULT_POWER_OFF_RETRIES = 3;
const DEFAULT_POWER_OFF_INTERVAL_MS = 20000;
const RESTORE_MAX_LATE_SECONDS = 1800;
const MAX_HISTORY = 40;

const STATE_FILE = process.env.TV_SCHEDULE_FILE || path.join(__dirname, '..', 'data', 'jadwal-ruangan.json');

const countdowns = new Map();

function makeKey(targetType, targetId) {
  return `${targetType}:${String(targetId).toLowerCase()}`;
}

function readNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function clampSeconds(value, fallback, min, max) {
  const numeric = readNumber(value, fallback);
  return Math.min(Math.max(Math.round(numeric), min), max);
}

function readDurationSeconds(input = {}) {
  const seconds = Number(input.seconds);
  if (Number.isFinite(seconds) && seconds > 0) {
    return Math.ceil(seconds);
  }

  const minutes = Number(input.minutes);
  if (Number.isFinite(minutes) && minutes > 0) {
    return Math.ceil(minutes * 60);
  }

  throw new Error('minutes or seconds must be a positive number');
}

/** Label waktu yang enak dibaca: 900 -> "15 menit", 30 -> "30 detik", 90 -> "1 menit 30 detik". */
function labelOffset(offsetSeconds) {
  const total = Math.max(0, Math.round(offsetSeconds));
  if (total === 0) {
    return 'waktu habis';
  }
  if (total < 60) {
    return `${total} detik`;
  }

  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return rest === 0 ? `${minutes} menit` : `${minutes} menit ${rest} detik`;
}

function defaultMessageForOffset(offsetSeconds, targetName) {
  if (offsetSeconds <= 0) {
    return {
      text: 'WAKTU HABIS',
      subtext: `Silakan hubungi kasir${targetName ? ` - ${targetName}` : ''}`,
      seconds: DEFAULT_FINAL_SECONDS,
    };
  }

  return {
    text: `SISA WAKTU ${labelOffset(offsetSeconds).toUpperCase()}`,
    subtext: 'Hubungi kasir untuk memperpanjang',
    seconds: 20,
  };
}

function normalizeWarnings(options = {}, targetName) {
  const rawOffsets = Array.isArray(options.warnOffsetsSeconds)
    ? options.warnOffsetsSeconds
    : Array.isArray(options.warnMinutes)
      ? options.warnMinutes.map((value) => Number(value) * 60)
      : DEFAULT_WARN_OFFSETS_SECONDS;

  const messageOverrides = options.messages && typeof options.messages === 'object' ? options.messages : {};

  return rawOffsets
    .map((value) => Math.round(Number(value)))
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => b - a)
    .map((offsetSeconds) => {
      const override = messageOverrides[offsetSeconds] || messageOverrides[String(offsetSeconds)] || {};
      const fallback = defaultMessageForOffset(offsetSeconds, targetName);
      return {
        offsetSeconds,
        text: override.text || fallback.text,
        subtext: typeof override.subtext === 'string' ? override.subtext : fallback.subtext,
        seconds: clampSeconds(override.seconds, fallback.seconds, 3, 600),
        at: null,
        status: 'pending',
        attempts: 0,
        lastError: null,
      };
    });
}

// ------------------------------------------------------------------ penjadwalan

function armWarning(record, warning) {
  const atMs = record.endsAtMs - warning.offsetSeconds * 1000;
  const delay = atMs - Date.now();

  if (delay <= 0) {
    warning.status = 'skipped_late';
    warning.at = new Date(atMs).toISOString();
    pushHistory(record, {
      action: 'peringatan_dilewati',
      ok: true,
      detail: `T-${labelOffset(warning.offsetSeconds)} sudah lewat saat jadwal dipasang`,
    });
    return;
  }

  warning.at = new Date(atMs).toISOString();
  arm(record, delay, () => fireWarning(record, warning));
}

function fireWarning(record, warning) {
  if (record.state === 'canceled') {
    warning.status = 'canceled';
    return Promise.resolve();
  }

  warning.attempts += 1;
  return sendOverlay(record.sleepTarget, {
    text: warning.text,
    subtext: warning.subtext,
    seconds: warning.seconds,
  })
    .then(() => {
      warning.status = 'sent';
      warning.lastError = null;
      pushHistory(record, {
        action: 'peringatan_terkirim',
        ok: true,
        detail: `T-${labelOffset(warning.offsetSeconds)}: ${warning.text}`,
      });
      recordEvent({
        action: 'peringatan_terkirim',
        roomId: record.targetId,
        roomName: record.targetName,
        ok: true,
        detail: warning.text,
      });
      persist();
    })
    .catch((error) => {
      warning.status = 'failed';
      warning.lastError = error && error.message ? error.message : String(error);
      pushHistory(record, {
        action: 'peringatan_gagal',
        ok: false,
        detail: `${warning.text}: ${warning.lastError}`,
      });
      recordEvent({
        action: 'peringatan_gagal',
        roomId: record.targetId,
        roomName: record.targetName,
        ok: false,
        detail: warning.lastError,
      });
      persist();
    });
}

function armFinalSequence(record) {
  const delay = record.endsAtMs - Date.now();
  arm(record, Math.max(0, delay), () => runFinalSequence(record));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runFinalSequence(record) {
  if (record.state === 'canceled') {
    return;
  }

  const finalMessage = record.finalMessage;
  record.state = 'final';

  try {
    await sendOverlay(record.sleepTarget, {
      text: finalMessage.text,
      subtext: finalMessage.subtext,
      seconds: finalMessage.seconds,
    });
    record.finalMessageStatus = 'sent';
    pushHistory(record, { action: 'pesan_habis_terkirim', ok: true, detail: finalMessage.text });
    recordEvent({
      action: 'pesan_habis_terkirim',
      roomId: record.targetId,
      roomName: record.targetName,
      ok: true,
      detail: finalMessage.text,
    });
  } catch (error) {
    record.finalMessageStatus = 'failed';
    record.lastError = error && error.message ? error.message : String(error);
    pushHistory(record, { action: 'pesan_habis_gagal', ok: false, detail: record.lastError });
    recordEvent({
      action: 'pesan_habis_gagal',
      roomId: record.targetId,
      roomName: record.targetName,
      ok: false,
      detail: record.lastError,
    });
  }

  persist();
  await sleep(finalMessage.seconds * 1000);

  if (record.state === 'canceled') {
    return;
  }

  record.state = 'grace';
  persist();
  await sleep(record.graceSeconds * 1000);

  if (record.state === 'canceled') {
    return;
  }

  await powerOffWithRetry(record);
}

async function powerOffWithRetry(record) {
  record.state = 'sleeping';
  persist();

  // Periksa keadaan TV lebih dulu. "ADB tidak menjawab" hampir selalu berarti TV sudah
  // tidur (endpoint ADB hilang saat standby), jadi itu BUKAN kegagalan.
  const before = await getTvPowerState(record.sleepTarget).catch(() => ({ reachable: false, wakefulness: null }));

  if (!before.reachable) {
    record.tvWasPoweredOff = true;
    record.state = 'completed';
    record.completedAt = new Date().toISOString();
    record.lastError = null;
    pushHistory(record, {
      action: 'tv_sudah_tidur',
      ok: true,
      detail: 'ADB tidak menjawab saat peniduran; TV dianggap sudah tidur (tidak perlu perintah)',
    });
    recordEvent({
      action: 'tv_sudah_tidur',
      roomId: record.targetId,
      roomName: record.targetName,
      ok: true,
      detail: 'ADB tidak menjawab; dianggap sudah tidur',
    });
    persist();
    return;
  }

  if (before.wakefulness && /asleep|dozing/i.test(before.wakefulness)) {
    record.tvWasPoweredOff = true;
    record.state = 'completed';
    record.completedAt = new Date().toISOString();
    record.lastError = null;
    pushHistory(record, {
      action: 'tv_sudah_tidur',
      ok: true,
      detail: `layar sudah ${before.wakefulness} sebelum perintah dikirim`,
    });
    recordEvent({
      action: 'tv_sudah_tidur',
      roomId: record.targetId,
      roomName: record.targetName,
      ok: true,
      detail: `layar sudah ${before.wakefulness}`,
    });
    persist();
    return;
  }

  for (let attempt = 1; attempt <= record.powerOffRetries; attempt += 1) {
    if (record.state === 'canceled') {
      return;
    }

    try {
      await sleepRoom(record.sleepTarget);

      // Verifikasi nyata: sesaat setelah keyevent 223, TV masih menjawab dan melaporkan
      // statusnya, jadi keberhasilan tidak perlu diasumsikan lagi.
      const after = await getTvPowerState(record.sleepTarget).catch(() => ({ reachable: false, wakefulness: null }));
      const verified = !after.reachable || !after.wakefulness || /asleep|dozing/i.test(after.wakefulness);

      record.tvWasPoweredOff = verified;
      record.state = verified ? 'completed' : 'failed';
      record.completedAt = new Date().toISOString();
      record.lastError = verified ? null : `layar masih ${after.wakefulness || 'tidak diketahui'} setelah perintah`;

      pushHistory(record, {
        action: verified ? 'tv_ditidurkan' : 'tidurkan_tidak_terbukti',
        ok: verified,
        detail: verified
          ? `perintah keyevent 223 terkirim & terverifikasi (layar ${after.wakefulness || 'tidak menjawab'}, percobaan ${attempt}/${record.powerOffRetries})`
          : `perintah terkirim tapi layar masih ${after.wakefulness || 'tidak diketahui'} (percobaan ${attempt}/${record.powerOffRetries})`,
      });
      recordEvent({
        action: verified ? 'tv_ditidurkan' : 'tidurkan_tidak_terbukti',
        roomId: record.targetId,
        roomName: record.targetName,
        ok: verified,
        detail: `percobaan ${attempt}/${record.powerOffRetries}, layar ${after.wakefulness || 'tidak menjawab'}`,
      });
      persist();

      if (verified) {
        return;
      }
    } catch (error) {
      const message = error && error.message ? error.message : String(error);
      record.lastError = message;
      pushHistory(record, {
        action: 'tidurkan_gagal',
        ok: false,
        detail: `percobaan ${attempt}/${record.powerOffRetries}: ${message}`,
      });
      recordEvent({
        action: 'tidurkan_gagal',
        roomId: record.targetId,
        roomName: record.targetName,
        ok: false,
        detail: `percobaan ${attempt}/${record.powerOffRetries}: ${message}`,
      });
      persist();

      if (attempt < record.powerOffRetries) {
        await sleep(record.powerOffIntervalMs);
      }
    }
  }

  record.state = 'failed';
  record.completedAt = new Date().toISOString();
  persist();
}

async function wakeIfNeeded(record, options = {}) {
  const previous = options.previousRecord;
  const shouldWake = Boolean(options.wakeOnStart) || Boolean(previous && previous.tvWasPoweredOff);

  if (!shouldWake) {
    return;
  }

  try {
    await wakeRoom(record.sleepTarget);
    pushHistory(record, {
      action: 'tv_dinyalakan',
      ok: true,
      detail: options.wakeOnStart ? 'diminta saat jadwal baru dipasang' : 'TV sebelumnya ditidurkan oleh bridge',
    });
    recordEvent({
      action: 'tv_dinyalakan',
      roomId: record.targetId,
      roomName: record.targetName,
      ok: true,
      detail: 'perpanjangan setelah waktu habis',
    });
  } catch (error) {
    const message = error && error.message ? error.message : String(error);
    pushHistory(record, { action: 'nyalakan_gagal', ok: false, detail: message });
    recordEvent({
      action: 'nyalakan_gagal',
      roomId: record.targetId,
      roomName: record.targetName,
      ok: false,
      detail: message,
    });
  }
}

function arm(record, delayMs, callback) {
  const timer = setTimeout(async () => {
    record.timers = (record.timers || []).filter((item) => item !== timer);
    try {
      await callback();
    } catch (error) {
      console.error(`[JADWAL] galat menjalankan jadwal ${record.targetName}: ${error.message}`);
    }
  }, Math.max(0, delayMs));

  // Timer disimpan PER JADWAL. Versi pertama memakai satu daftar global, sehingga
  // membatalkan satu ruangan ikut mematikan timer peringatan ruangan lain.
  record.timers = record.timers || [];
  record.timers.push(timer);
  return timer;
}

function clearTimers(record) {
  for (const timer of record.timers || []) {
    clearTimeout(timer);
  }
  record.timers = [];
}

function pushHistory(record, entry) {
  record.history.unshift({ at: new Date().toISOString(), ...entry });
  if (record.history.length > MAX_HISTORY) {
    record.history.length = MAX_HISTORY;
  }
  record.updatedAt = new Date().toISOString();
}

// -------------------------------------------------------------------- penyimpanan

function serializeRecord(record) {
  return {
    targetType: record.targetType,
    targetId: record.targetId,
    targetName: record.targetName,
    sleepTarget: record.sleepTarget,
    durationSeconds: record.durationSeconds,
    startedAt: record.startedAt,
    endsAt: record.endsAt,
    endsAtMs: record.endsAtMs,
    state: record.state,
    warnings: record.warnings,
    finalMessage: record.finalMessage,
    finalMessageStatus: record.finalMessageStatus,
    finalSeconds: record.finalSeconds,
    graceSeconds: record.graceSeconds,
    powerOffRetries: record.powerOffRetries,
    powerOffIntervalMs: record.powerOffIntervalMs,
    tvWasPoweredOff: record.tvWasPoweredOff,
    completedAt: record.completedAt,
    canceledAt: record.canceledAt,
    lastError: record.lastError,
    history: record.history,
    updatedAt: record.updatedAt,
  };
}

function persist() {
  try {
    const dir = path.dirname(STATE_FILE);
    fs.mkdirSync(dir, { recursive: true });
    const payload = {
      savedAt: new Date().toISOString(),
      countdowns: Array.from(countdowns.values()).map(serializeRecord),
    };
    fs.writeFileSync(STATE_FILE, JSON.stringify(payload, null, 2));
  } catch (error) {
    console.warn(`[JADWAL] gagal menyimpan jadwal: ${error.message}`);
  }
}

function readStateFile() {
  try {
    if (!fs.existsSync(STATE_FILE)) {
      return [];
    }
    const parsed = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    return Array.isArray(parsed.countdowns) ? parsed.countdowns : [];
  } catch (error) {
    console.warn(`[JADWAL] gagal membaca berkas jadwal: ${error.message}`);
    return [];
  }
}

// ------------------------------------------------------------------------ API

function snapshot(record) {
  if (!record) {
    return {
      active: false,
      state: 'idle',
    };
  }

  const remainingSeconds = record.state === 'running'
    ? Math.max(0, Math.ceil((record.endsAtMs - Date.now()) / 1000))
    : 0;

  return {
    active: record.state === 'running',
    state: record.state,
    targetType: record.targetType,
    targetId: record.targetId,
    targetName: record.targetName,
    durationSeconds: record.durationSeconds,
    remainingSeconds,
    startedAt: record.startedAt,
    endsAt: record.endsAt,
    completedAt: record.completedAt,
    canceledAt: record.canceledAt,
    lastError: record.lastError,
    graceSeconds: record.graceSeconds,
    finalSeconds: record.finalSeconds,
    tvWasPoweredOff: Boolean(record.tvWasPoweredOff),
    warnings: (record.warnings || []).map((warning) => ({
      offsetSeconds: warning.offsetSeconds,
      at: warning.at,
      status: warning.status,
      text: warning.text,
      attempts: warning.attempts,
      lastError: warning.lastError,
    })),
    finalMessage: record.finalMessage,
    finalMessageStatus: record.finalMessageStatus || 'pending',
    history: (record.history || []).slice(0, 20),
  };
}

function startCountdown(options = {}) {
  const { targetType, target } = options;
  if (!target || !target.id) {
    throw new Error('target is required');
  }

  const key = makeKey(targetType, target.id);
  const previousRecord = countdowns.get(key);
  if (previousRecord) {
    cancelCountdown(targetType, target.id);
  }

  // Durasi boleh datang sebagai durationSeconds (sudah dihitung server) atau seconds/minutes mentah.
  const durationSeconds = Number(options.durationSeconds) > 0
    ? Math.ceil(Number(options.durationSeconds))
    : readDurationSeconds(options);
  const startedAtMs = Date.now();
  const endsAtMs = startedAtMs + durationSeconds * 1000;

  const record = {
    targetType,
    targetId: target.id,
    targetName: target.name,
    sleepTarget: target,
    durationSeconds,
    startedAt: new Date(startedAtMs).toISOString(),
    endsAt: new Date(endsAtMs).toISOString(),
    endsAtMs,
    state: 'running',
    warnings: normalizeWarnings(options, target.name),
    finalMessage: {
      text: (options.finalMessage && options.finalMessage.text) || defaultMessageForOffset(0).text,
      subtext: (options.finalMessage && options.finalMessage.subtext)
        || defaultMessageForOffset(0, target.name).subtext,
      seconds: clampSeconds(
        options.finalMessage ? options.finalMessage.seconds : options.finalSeconds,
        DEFAULT_FINAL_SECONDS,
        3,
        600
      ),
    },
    finalMessageStatus: 'pending',
    finalSeconds: clampSeconds(options.finalSeconds, DEFAULT_FINAL_SECONDS, 3, 600),
    graceSeconds: clampSeconds(options.graceSeconds, DEFAULT_GRACE_SECONDS, 0, 900),
    powerOffRetries: Math.max(1, Math.min(Math.round(readNumber(options.powerOffRetries, DEFAULT_POWER_OFF_RETRIES)), 10)),
    powerOffIntervalMs: Math.max(1000, readNumber(options.powerOffIntervalMs, DEFAULT_POWER_OFF_INTERVAL_MS)),
    tvWasPoweredOff: false,
    completedAt: null,
    canceledAt: null,
    lastError: null,
    history: [],
    updatedAt: new Date().toISOString(),
    timers: [],
  };

  countdowns.set(key, record);

  record.warnings.forEach((warning) => armWarning(record, warning));
  armFinalSequence(record);

  pushHistory(record, {
    action: 'jadwal_dipasang',
    ok: true,
    detail: `${labelOffset(durationSeconds)}, peringatan T-${record.warnings
      .map((warning) => labelOffset(warning.offsetSeconds))
      .join(', T-')}, tenggang ${record.graceSeconds} detik`,
  });
  recordEvent({
    action: 'jadwal_dipasang',
    roomId: record.targetId,
    roomName: record.targetName,
    ok: true,
    detail: `mulai ${record.startedAt}, berakhir ${record.endsAt}, tenggang ${record.graceSeconds} detik`,
  });
  persist();

  wakeIfNeeded(record, { ...options, previousRecord });

  return snapshot(record);
}

function cancelCountdown(targetType, targetId) {
  const key = makeKey(targetType, targetId);
  const record = countdowns.get(key);
  if (!record) {
    return {
      active: false,
      state: 'idle',
    };
  }

  record.warnings.forEach((warning) => {
    if (warning.status === 'pending') {
      warning.status = 'canceled';
    }
  });

  if (['running', 'final', 'grace', 'sleeping'].includes(record.state)) {
    record.state = 'canceled';
    record.canceledAt = new Date().toISOString();
  }

  clearTimers(record);
  pushHistory(record, { action: 'jadwal_dibatalkan', ok: true, detail: 'timer peringatan ruangan ini dimatikan' });
  recordEvent({
    action: 'jadwal_dibatalkan',
    roomId: record.targetId,
    roomName: record.targetName,
    ok: true,
    detail: 'dibatalkan atau diganti jadwal baru',
  });
  persist();
  return snapshot(record);
}

function getCountdown(targetType, targetId) {
  return snapshot(countdowns.get(makeKey(targetType, targetId)));
}

function listCountdowns() {
  return Array.from(countdowns.values()).map(snapshot);
}

/**
 * Memulihkan jadwal setelah bridge di-restart.
 *  - berakhir di masa depan  -> timer peringatan + T-0 dipasang ulang
 *  - baru saja lewat (< 30 m) -> lanjutkan dari tahap yang sesuai (termasuk menidurkan TV)
 *  - sudah lama lewat        -> ditandai basi, TIDAK menidurkan TV, diserahkan ke penyapu POS
 */
function restoreSchedules() {
  const records = readStateFile();
  if (!records.length) {
    return;
  }

  const now = Date.now();
  let restored = 0;

  for (const saved of records) {
    if (!saved || !saved.targetId || !saved.sleepTarget || !saved.endsAtMs) {
      continue;
    }

    const key = makeKey(saved.targetType || 'room', saved.targetId);
    const record = {
      ...saved,
      state: saved.state,
      history: Array.isArray(saved.history) ? saved.history : [],
      warnings: Array.isArray(saved.warnings) ? saved.warnings : [],
      finalMessage: saved.finalMessage || defaultMessageForOffset(0, saved.targetName),
      finalSeconds: saved.finalSeconds || DEFAULT_FINAL_SECONDS,
      graceSeconds: typeof saved.graceSeconds === 'number' ? saved.graceSeconds : DEFAULT_GRACE_SECONDS,
      powerOffRetries: saved.powerOffRetries || DEFAULT_POWER_OFF_RETRIES,
      powerOffIntervalMs: saved.powerOffIntervalMs || DEFAULT_POWER_OFF_INTERVAL_MS,
      timers: [],
    };

    if (record.state === 'completed' || record.state === 'canceled' || record.state === 'failed') {
      countdowns.set(key, record);
      continue;
    }

    countdowns.set(key, record);

    if (record.endsAtMs > now) {
      record.state = 'running';
      record.warnings.forEach((warning) => armWarning(record, warning));
      armFinalSequence(record);
      restored += 1;
      continue;
    }

    const lateSeconds = Math.round((now - record.endsAtMs) / 1000);
    if (lateSeconds <= RESTORE_MAX_LATE_SECONDS) {
      record.state = 'sleeping';
      pushHistory(record, {
        action: 'jadwal_dilanjutkan',
        ok: true,
        detail: `bridge di-restart, waktu habis ${lateSeconds} detik lalu - lanjut menidurkan TV`,
      });
      recordEvent({
        action: 'jadwal_dilanjutkan',
        roomId: record.targetId,
        roomName: record.targetName,
        ok: true,
        detail: `terlambat ${lateSeconds} detik`,
      });
      restored += 1;
      arm(record, 1000, () => powerOffWithRetry(record));
      continue;
    }

    record.state = 'stale_skipped';
    pushHistory(record, {
      action: 'jadwal_basi',
      ok: false,
      detail: `terlambat ${lateSeconds} detik - TV TIDAK ditidurkan, diserahkan ke penyapu POS`,
    });
    recordEvent({
      action: 'jadwal_basi',
      roomId: record.targetId,
      roomName: record.targetName,
      ok: false,
      detail: `terlambat ${lateSeconds} detik, tidak menidurkan TV`,
    });
  }

  persist();

  if (restored) {
    console.log(`[JADWAL] ${restored} jadwal dipulihkan setelah restart`);
  }
}

module.exports = {
  cancelCountdown,
  getCountdown,
  listCountdowns,
  readDurationSeconds,
  restoreSchedules,
  startCountdown,
  STATE_FILE,
};
