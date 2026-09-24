const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const wol = require('wake_on_lan');
require('dotenv').config();

const {
  getDefaultRoomId,
  getRoom,
  getRoomIdOrNull,
  getTestDevice,
  getTestDeviceIdOrNull,
  listRooms,
  listTestDevices,
  resolveRoom,
  getConfigPath,
} = require('./roomConfig');

const execFileAsync = promisify(execFile);
const adbBin = process.env.ADB_BIN || 'adb';

// Batas waktu perintah ADB. PENTING: config/rooms.json tidak memuat adbTimeoutMs, dan tanpa
// nilai bawaan perintah ke TV yang mati bisa menggantung lama sekali (temuan uji 2026-09-23).
const defaultAdbTimeoutMs = Math.max(1000, Number(process.env.ADB_TIMEOUT_MS) || 15000);

function adbTimeout(room) {
  const value = Number(room && room.adbTimeoutMs);
  return Number.isFinite(value) && value > 0 ? value : defaultAdbTimeoutMs;
}

// Paket APK overlay di layar TV (dipasang 2026-09-23, terbukti lolos uji T1-T7).
const overlayPackageDefault = process.env.TV_NOTIFY_PACKAGE || 'com.happysong.tvnotify';
const overlayServiceName = 'OverlayService';

const runtimeByRoomId = new Map();

function makeRuntimeState() {
  return {
    connected: false,
    lastSerial: null,
    lastConnectAt: null,
    lastError: null,
  };
}

function getRuntimeState(roomId) {
  const key = String(roomId).toLowerCase();
  if (!runtimeByRoomId.has(key)) {
    runtimeByRoomId.set(key, makeRuntimeState());
  }
  return runtimeByRoomId.get(key);
}

function setConnected(roomId, connected, error = null, serial = null) {
  const state = getRuntimeState(roomId);
  state.connected = connected;
  state.lastSerial = serial || state.lastSerial;
  state.lastConnectAt = connected ? new Date().toISOString() : state.lastConnectAt;
  state.lastError = error ? String(error.message || error) : null;
}

function assertRoomHasIp(room) {
  if (!room.ip) {
    throw new Error(`ROOM ${room.id} is missing ip`);
  }
}

function assertRoomEnabled(room) {
  if (!room.enabled) {
    const error = new Error(`ROOM ${room.id} is disabled`);
    error.statusCode = 409;
    throw error;
  }
}

function assertRoomHasMac(room) {
  if (!room.mac) {
    throw new Error(`ROOM ${room.id} is missing mac`);
  }
}

function serialFromRoom(room) {
  return `${room.ip}:${room.adbPort}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function log(message, extra) {
  if (typeof extra === 'undefined') {
    console.log(`[ADB] ${message}`);
    return;
  }
  console.log(`[ADB] ${message}`, extra);
}

async function runAdb(args, label, timeoutMs) {
  try {
    const { stdout, stderr } = await execFileAsync(adbBin, args, {
      timeout: timeoutMs,
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    });

    const output = String(stdout || stderr || '').trim();
    if (output) {
      log(`${label}: ${output}`);
    } else {
      log(label);
    }
    return output;
  } catch (error) {
    const stderr = error && error.stderr ? String(error.stderr).trim() : '';
    const stdout = error && error.stdout ? String(error.stdout).trim() : '';
    const message = stderr || stdout || error.message || 'ADB command failed';
    const wrapped = new Error(message);
    wrapped.cause = error;
    throw wrapped;
  }
}

async function verifyConnected(room) {
  const serial = serialFromRoom(room);
  try {
    const state = await runAdb(['-s', serial, 'get-state'], `Checking device state for ${room.id}`, adbTimeout(room));
    const isConnected = state === 'device';
    setConnected(room.id, isConnected, null, serial);
    return isConnected;
  } catch (error) {
    setConnected(room.id, false, error, serial);
    return false;
  }
}

async function waitForDevice(room) {
  const deadline = Date.now() + room.adbTimeoutMs;
  while (Date.now() < deadline) {
    if (await verifyConnected(room)) {
      return true;
    }
    await sleep(500);
  }
  return false;
}

async function connectToRoom(roomSelector) {
  const room = typeof roomSelector === 'object' && roomSelector ? roomSelector : resolveRoom(roomSelector);
  assertRoomEnabled(room);
  assertRoomHasIp(room);

  const serial = serialFromRoom(room);
  log(`Connecting to ${room.id} (${serial})...`);

  if (await verifyConnected(room)) {
    log(`Room ${room.id} is already connected`);
    return getStatus(room);
  }

  try {
    await runAdb(['connect', serial], `Connecting to ${serial}`, adbTimeout(room));
  } catch (error) {
    const message = String(error && error.message ? error.message : error);
    if (!/already connected/i.test(message)) {
      throw error;
    }
    log(`ADB reported existing connection for ${serial}; continuing`);
  }

  const connected = await waitForDevice(room);
  if (!connected) {
    throw new Error(`ADB is not in device state for ${serial}`);
  }

  setConnected(room.id, true, null, serial);
  log(`Connected to ${room.id} (${serial})`);
  return getStatus(room);
}

async function ensureConnected(roomSelector) {
  const room = typeof roomSelector === 'object' && roomSelector ? roomSelector : resolveRoom(roomSelector);
  assertRoomEnabled(room);
  const serial = serialFromRoom(room);
  if (getRuntimeState(room.id).connected && (await verifyConnected(room))) {
    return serial;
  }

  await connectToRoom(room);
  return serial;
}

async function runShell(room, command, label) {
  const shellArgs = Array.isArray(command) ? command : [String(command)];
  const output = await runAdb(['-s', serialFromRoom(room), 'shell', ...shellArgs], label, adbTimeout(room));
  return output;
}

async function sendSleepKeyevent(roomSelector, keycode) {
  const room = typeof roomSelector === 'object' && roomSelector ? roomSelector : resolveRoom(roomSelector);
  assertRoomEnabled(room);
  assertRoomHasIp(room);

  const numericKeycode = Number(
    typeof keycode !== 'undefined' ? keycode : room.defaultSleepKeycode
  );
  if (!Number.isFinite(numericKeycode)) {
    throw new Error('keycode must be a number');
  }

  // Kalau TV sudah tidur atau tidak menjawab sama sekali, tidak ada gunanya mengirim keyevent:
  // tujuannya sudah tercapai. Dicatat sebagai berhasil dengan catatan, supaya audit POS tidak
  // melaporkan "gagal mematikan TV" padahal TV memang sudah mati (temuan uji 2026-09-23).
  const before = await getTvPowerState(room).catch(() => ({ reachable: false, wakefulness: null }));
  if (!before.reachable) {
    log(`TV ${room.name} tidak menjawab; dianggap sudah tidur, tidak ada perintah dikirim`);
    return {
      ok: true,
      roomId: room.id,
      roomName: room.name,
      serial: serialFromRoom(room),
      keycode: numericKeycode,
      alreadyAsleep: true,
      note: 'TV tidak menjawab (kemungkinan sudah tidur); tidak ada perintah dikirim.',
      output: '',
    };
  }

  if (before.wakefulness && /asleep|dozing/i.test(before.wakefulness)) {
    log(`Layar ${room.name} sudah ${before.wakefulness}; tidak ada perintah dikirim`);
    return {
      ok: true,
      roomId: room.id,
      roomName: room.name,
      serial: serialFromRoom(room),
      keycode: numericKeycode,
      alreadyAsleep: true,
      note: `Layar TV sudah ${before.wakefulness}; tidak ada perintah dikirim.`,
      output: '',
    };
  }

  const serial = await ensureConnected(room);
  const output = await runShell(room, ['input', 'keyevent', String(numericKeycode)], `Sending keyevent ${numericKeycode}`);
  const after = await getTvPowerState(room).catch(() => ({ reachable: false, wakefulness: null }));
  const verified = !after.reachable || !after.wakefulness || /asleep|dozing/i.test(after.wakefulness);
  log(`Sleep command sent to ${serial} (terverifikasi: ${verified ? 'ya' : 'belum'})`);
  return {
    ok: true,
    roomId: room.id,
    roomName: room.name,
    serial,
    keycode: numericKeycode,
    verified,
    note: verified
      ? `TV ditidurkan dan terverifikasi (layar ${after.wakefulness || 'tidak menjawab'}).`
      : `Perintah terkirim tetapi layar masih ${after.wakefulness || 'tidak diketahui'}.`,
    output,
  };
}

async function sendWakeKeyevent(roomSelector) {
  const room = typeof roomSelector === 'object' && roomSelector ? roomSelector : resolveRoom(roomSelector);
  assertRoomEnabled(room);
  assertRoomHasIp(room);

  const serial = await ensureConnected(room);
  const output = await runShell(room, ['input', 'keyevent', '224'], 'Sending wake keyevent 224');
  log(`Wake keyevent sent to ${serial}`);
  return {
    ok: true,
    roomId: room.id,
    roomName: room.name,
    serial,
    keycode: 224,
    output,
  };
}

async function wakeRoom(roomSelector) {
  const room = typeof roomSelector === 'object' && roomSelector ? roomSelector : resolveRoom(roomSelector);
  assertRoomEnabled(room);
  assertRoomHasIp(room);
  assertRoomHasMac(room);

  let adbWake = null;
  try {
    adbWake = await sendWakeKeyevent(room);
  } catch (error) {
    log(`ADB wake attempt failed for ${room.id}: ${error.message}`);
  }

  const broadcasts = [
    room.wolBroadcast,
    ...room.wolBroadcasts,
    '255.255.255.255',
  ]
    .filter(Boolean)
    .filter((value, index, array) => array.indexOf(value) === index);

  for (const broadcast of broadcasts) {
    log(`Sending WoL magic packet to ${room.mac} via ${broadcast}:${room.wolPort}`);

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      await new Promise((resolve, reject) => {
        wol.wake(
          room.mac,
          {
            address: broadcast,
            port: room.wolPort,
            num_packets: room.wolPackets,
            interval: room.wolIntervalMs,
          },
          (error) => {
            if (error) {
              return reject(error);
            }
            return resolve();
          }
        );
      });

      log(`WoL packet sent to ${room.mac} via ${broadcast} (attempt ${attempt}/3)`);
      await sleep(500);
    }
  }

  return {
    ok: true,
    roomId: room.id,
    roomName: room.name,
    mac: room.mac,
    broadcast: broadcasts[0] || room.wolBroadcast,
    broadcasts,
    adbWake,
  };
}

async function launchApp(packageName, roomSelector) {
  if (!packageName || typeof packageName !== 'string') {
    throw new Error('packageName is required');
  }

  const room = typeof roomSelector === 'object' && roomSelector ? roomSelector : resolveRoom(roomSelector);
  assertRoomEnabled(room);
  assertRoomHasIp(room);

  const cleanPackage = packageName.trim();
  if (!cleanPackage) {
    throw new Error('packageName is required');
  }

  const serial = await ensureConnected(room);
  const primaryCommand = [
    'am',
    'start',
    '-a',
    'android.intent.action.MAIN',
    '-c',
    'android.intent.category.LEANBACK_LAUNCHER',
    '-p',
    cleanPackage,
  ];

  let output = await runShell(room, primaryCommand, `Launching app ${cleanPackage}`);

  if (/error|exception|no activity found/i.test(output)) {
    const fallbackCommand = [
      'am',
      'start',
      '-a',
      'android.intent.action.MAIN',
      '-c',
      'android.intent.category.LAUNCHER',
      '-p',
      cleanPackage,
    ];
    output = await runShell(room, fallbackCommand, `Fallback launch app ${cleanPackage}`);
  }

  log(`Launch attempt finished for ${cleanPackage}`);
  return {
    ok: true,
    roomId: room.id,
    roomName: room.name,
    serial,
    packageName: cleanPackage,
    output,
  };
}

/**
 * Memastikan TV bangun dan ADB siap dipakai.
 * Alasannya nyata (ditemukan saat uji 2026-09-23): TV bisa tidur sendiri sebelum peringatan
 * jatuh tempo, sehingga perintah overlay gagal dengan "device offline".
 */
/** Membaca status layar TV: Awake / Asleep / Dozing / Dream (screensaver). */
async function readWakefulness(room) {
  try {
    const output = await runShell(room, ['dumpsys', 'power'], `Membaca status daya ${room.name}`);
    const match = /mWakefulness=(\w+)/.exec(output || '');
    return match ? match[1] : null;
  } catch (error) {
    return null;
  }
}

async function ensureAwakeAndConnected(roomSelector) {
  const room = typeof roomSelector === 'object' && roomSelector ? roomSelector : resolveRoom(roomSelector);
  assertRoomEnabled(room);
  assertRoomHasIp(room);

  let serial = null;
  try {
    serial = await ensureConnected(room);
  } catch (error) {
    log(`ADB ${room.name} belum siap (${error.message}); mencoba membangunkan...`);
  }

  if (!serial) {
    try {
      await wakeRoom(room);
    } catch (error) {
      log(`Percobaan bangunkan ${room.name} gagal: ${error.message}`);
    }

    await sleep(4000);

    let lastError = null;
    // Dua percobaan saja: cukup untuk TV yang baru tidur, dan tidak membuat jadwal
    // menggantung lama ketika TV benar-benar mati (mis. NIC mati saat standby).
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        serial = await ensureConnected(room);
        break;
      } catch (error) {
        lastError = error;
        await sleep(1500);
      }
    }

    if (!serial) {
      throw new Error(`TV ${room.name} tidak bisa dibangunkan/dihubungi: ${lastError ? lastError.message : 'tidak diketahui'}`);
    }
  }

  // PENTING: ADB tetap menjawab walau layar TV sedang tidur, jadi keberhasilan ADB saja
  // bukan bukti layar menyala. Layar diperiksa dan dibangunkan bila perlu supaya peringatan
  // benar-benar terlihat pelanggan (temuan uji 2026-09-23).
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const wakefulness = await readWakefulness(room);
    if (wakefulness === null || /awake|dream/i.test(wakefulness)) {
      return serial;
    }

    log(`Layar ${room.name} sedang ${wakefulness}; membangunkan sebelum menampilkan peringatan (percobaan ${attempt}/2)...`);
    try {
      await wakeRoom(room);
    } catch (error) {
      log(`Bangunkan ${room.name} gagal: ${error.message}`);
    }
    await sleep(3500);
  }

  const finalState = await readWakefulness(room);
  log(`Catatan: status layar ${room.name} masih ${finalState || 'tidak diketahui'} setelah dibangunkan; peringatan tetap dikirim.`);
  return serial;
}

function sanitizeOverlayText(value, fallback = '') {
  const raw = typeof value === 'string' ? value : '';
  const clean = raw.replace(/["'`$\\\r\n\t]/g, ' ').replace(/\s+/g, ' ').trim();
  return clean || fallback;
}

/**
 * Menampilkan peringatan di layar TV lewat ADB (APK overlay, jendela non-fokus).
 *
 * PENTING: nilai teks dibungkus kutipan tunggal DI DALAM argumen, karena shell di TV
 * yang memecah spasi - tanpa itu "SISA WAKTU 15 MENIT" sampai hanya sebagai kata pertama.
 * (Teks dibersihkan lebih dulu supaya kutipan/karakter kendali tidak bisa menyusup.)
 */
async function sendOverlay(roomSelector, options = {}) {
  const room = typeof roomSelector === 'object' && roomSelector ? roomSelector : resolveRoom(roomSelector);
  assertRoomEnabled(room);
  assertRoomHasIp(room);

  const packageName = sanitizeOverlayText(options.packageName || room.notifyPackage || overlayPackageDefault, overlayPackageDefault);
  const text = sanitizeOverlayText(options.text, 'SISA WAKTU');
  const subtext = sanitizeOverlayText(options.subtext, '');
  const seconds = Math.min(Math.max(Math.round(Number(options.seconds) || 20), 3), 600);

  // Peringatan hanya berguna kalau layar TV benar-benar menyala, jadi kalau TV sedang tidur
  // ia dibangunkan lebih dulu. Matikan dengan { ensureAwake: false } bila tidak diinginkan.
  const needAwake = options.ensureAwake !== false;
  const serial = needAwake ? await ensureAwakeAndConnected(room) : await ensureConnected(room);
  const argv = [
    'am',
    'start-foreground-service',
    '-n',
    `${packageName}/.${overlayServiceName}`,
    '--es',
    'text',
    `'${text}'`,
    '--ei',
    'seconds',
    String(seconds),
  ];

  if (subtext) {
    argv.push('--es', 'subtext', `'${subtext}'`);
  }

  const output = await runShell(room, argv, `Menampilkan peringatan di ${room.name}`);
  if (/error|exception|not found|does not exist/i.test(output)) {
    throw new Error(`Peringatan gagal dikirim ke ${room.name}: ${output}`);
  }

  log(`Peringatan terkirim ke ${serial}: ${text}`);
  return {
    ok: true,
    roomId: room.id,
    roomName: room.name,
    serial,
    text,
    subtext,
    seconds,
    packageName,
    output,
  };
}

/**
 * Membaca keadaan TV: apakah ADB menjawab, dan layarnya tidur atau nyala.
 * Dipakai sebelum/sesudah menidurkan TV supaya "TV tidak menjawab" tidak dicatat
 * sebagai kegagalan padahal artinya TV sudah tidur (temuan uji 2026-09-23).
 */
async function getTvPowerState(roomSelector) {
  const room = typeof roomSelector === 'object' && roomSelector ? roomSelector : resolveRoom(roomSelector);

  const connected = await verifyConnected(room);
  if (!connected) {
    return { reachable: false, wakefulness: null, error: getRuntimeState(room.id).lastError };
  }

  return { reachable: true, wakefulness: await readWakefulness(room), error: null };
}

async function getStatus(roomSelector) {
  const room = typeof roomSelector === 'object' && roomSelector ? roomSelector : resolveRoom(roomSelector);
  assertRoomHasIp(room);

  const connected = await verifyConnected(room);
  const runtime = getRuntimeState(room.id);
  let wakefulness = null;
  if (connected && room.ip) {
    try {
      wakefulness = await readWakefulness(room);
    } catch (_err) {
      wakefulness = null;
    }
  }
  let arpMac = '';
  try {
    const arpTable = await getArpTable();
    arpMac = (room.ip && arpTable.get(room.ip)) || '';
  } catch (_e) {}

  return {
    ok: true,
    roomId: room.id,
    roomName: room.name,
    connected,
    wakefulness,
    arpMac,
    ip: room.ip,
    mac: room.mac,
    serial: serialFromRoom(room),
    enabled: room.enabled,
    lastError: runtime.lastError,
  };
}

function getRoomRuntime(roomSelector) {
  const room = typeof roomSelector === 'object' && roomSelector ? roomSelector : getRoom(roomSelector);
  if (!room) {
    return null;
  }

  return {
    ...room,
    runtime: {
      ...getRuntimeState(room.id),
    },
    serial: room.ip ? serialFromRoom(room) : null,
  };
}

function getRuntime() {
  return {
    configPath: getConfigPath(),
    defaultRoomId: getDefaultRoomId(),
    rooms: listRooms().map((room) => ({
      ...room,
      serial: room.ip ? serialFromRoom(room) : null,
      runtime: {
        ...getRuntimeState(room.id),
      },
    })),
    testDevices: listTestDevices().map((device) => ({
      ...device,
      serial: device.ip ? serialFromRoom(device) : null,
      runtime: {
        ...getRuntimeState(device.id),
      },
    })),
  };
}

function listRoomStatuses() {
  return listRooms().map((room) => getRoomRuntime(room.id));
}

function getTestDeviceRuntime(deviceSelector) {
  const device = typeof deviceSelector === 'object' && deviceSelector ? deviceSelector : getTestDevice(deviceSelector);
  if (!device) {
    return null;
  }

  return getRoomRuntime(device);
}

function listTestDeviceStatuses() {
  return listTestDevices().map((device) => getTestDeviceRuntime(device.id));
}

function getArpTable() {
  const { exec } = require('node:child_process');
  return new Promise((resolve) => {
    exec('arp -a', { timeout: 3000 }, (error, stdout) => {
      const map = new Map();
      if (error || !stdout) {
        return resolve(map);
      }
      const lines = String(stdout).split(/\r?\n/);
      for (const line of lines) {
        const match = /(\d+\.\d+\.\d+\.\d+)\s+([0-9a-fA-F]{2}[:-][0-9a-fA-F]{2}[:-][0-9a-fA-F]{2}[:-][0-9a-fA-F]{2}[:-][0-9a-fA-F]{2}[:-][0-9a-fA-F]{2})/i.exec(line);
        if (match) {
          const ip = match[1].trim();
          const mac = match[2].trim().toLowerCase().replace(/-/g, ':');
          map.set(ip, mac);
        }
      }
      resolve(map);
    });
  });
}

async function getConnectedSerials() {
  try {
    const stdout = await runAdb(['devices'], 'Listing adb devices', 2000);
    const set = new Set();
    const lines = String(stdout || '').split(/\r?\n/);
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 2 && parts[1] === 'device') {
        set.add(parts[0].toLowerCase());
      }
    }
    return set;
  } catch (_e) {
    return new Set();
  }
}

async function syncConnectedStatesFromAdb() {
  const connectedSerials = await getConnectedSerials();
  const rooms = listRooms();
  for (const r of rooms) {
    if (r.ip && r.enabled) {
      const serial = serialFromRoom(r).toLowerCase();
      const isDev = connectedSerials.has(serial);
      if (isDev) {
        setConnected(r.id, true, null, serial);
      } else {
        const current = getRuntimeState(r.id);
        if (current.connected) {
          setConnected(r.id, false, null, serial);
        }
      }
    }
  }
  return connectedSerials;
}

module.exports = {
  connectToRoom,
  ensureAwakeAndConnected,
  ensureConnected,
  getArpTable,
  getConnectedSerials,
  getDefaultRoomId,
  getRoomRuntime,
  getRuntime,
  getStatus,
  getTestDeviceRuntime,
  getTvPowerState,
  launchApp,
  listRoomStatuses,
  listTestDeviceStatuses,
  readWakefulness,
  resolveRoomId: getRoomIdOrNull,
  resolveTestDeviceId: getTestDeviceIdOrNull,
  sendOverlay,
  sleepRoom: sendSleepKeyevent,
  syncConnectedStatesFromAdb,
  wakeRoom,
};
