const { execFile } = require('node:child_process');
const fs = require('node:fs');
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

// Berkas APK peringatan (bawaan sistem POS). PENTING: path ini DIPATOK di bridge dan TIDAK
// pernah diterima dari permintaan HTTP - kalau path bisa dikirim dari browser, siapa pun yang
// dapat membuka halaman POS dapat memerintahkan bridge memasang APK apa saja ke TV.
const overlayApkPath = String(process.env.TV_OVERLAY_APK || '').trim();
// `adb install` ke TV 5-20 detik, jadi batas waktunya terpisah dari perintah ADB biasa.
const overlayInstallTimeoutMs = Math.max(15000, Number(process.env.TV_OVERLAY_INSTALL_TIMEOUT_MS) || 60000);

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

/**
 * Nilai terakhir yang sudah diketahui untuk keadaan APK peringatan per ruangan.
 * Dipakai oleh /api/rooms (daftar semua ruangan) supaya endpoint itu TIDAK perlu memanggil
 * ADB per ruangan setiap kali halaman kasir dibuka: dengan 20 ruangan, cara itu membuat
 * setiap buka halaman terasa menggantung. Pemeriksaan selalu diperbarui lewat
 * readOverlayState() pada /status ruangan (yang memang dipanggil tombol "Cek").
 * null = belum pernah diperiksa; true/false = hasil pemeriksaan terakhir.
 */
const overlayStateByRoomId = new Map();

function rememberOverlayState(roomId, state) {
  overlayStateByRoomId.set(String(roomId).toLowerCase(), {
    installed: state.overlayInstalled,
    allowed: state.overlayAllowed,
    checkedAt: new Date().toISOString(),
  });
}

function getRememberedOverlayState(roomId) {
  return overlayStateByRoomId.get(String(roomId).toLowerCase()) || null;
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

async function runShell(room, command, label, timeoutMs) {
  const shellArgs = Array.isArray(command) ? command : [String(command)];
  const batas = Number.isFinite(Number(timeoutMs)) && Number(timeoutMs) > 0 ? Number(timeoutMs) : adbTimeout(room);
  const output = await runAdb(['-s', serialFromRoom(room), 'shell', ...shellArgs], label, batas);
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

/**
 * Membangunkan TV.
 *
 * Opsi `wakeOptions` (bawaan = perilaku lama, dipakai peringatan otomatis di latar belakang):
 *   broadcastOnly  - kirim WoL hanya ke satu alamat (percobaan WoL penuh ~60 detik:
 *                    3 alamat x 3 percobaan x num_packets/interval). Untuk tombol yang ditekan
 *                    operator, 60 detik itu kegagalan pengalaman - jadi dipakai jalur pendek.
 *   attemptsPerBroadcast - jumlah percobaan WoL per alamat.
 */
async function wakeRoom(roomSelector, wakeOptions = {}) {
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

  const daftarAlamat = wakeOptions.broadcastOnly
    ? [room.wolBroadcast || '255.255.255.255']
    : [room.wolBroadcast, ...room.wolBroadcasts, '255.255.255.255'];

  const broadcasts = daftarAlamat
    .filter(Boolean)
    .filter((value, index, array) => array.indexOf(value) === index);

  const attemptsPerBroadcast = Math.max(1, Number(wakeOptions.attemptsPerBroadcast) || 3);

  for (const broadcast of broadcasts) {
    log(`Sending WoL magic packet to ${room.mac} via ${broadcast}:${room.wolPort}`);

    for (let attempt = 1; attempt <= attemptsPerBroadcast; attempt += 1) {
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

/** Membaca status layar dengan batas waktu pendek (dipakai pemeriksaan status overlay). */
async function readWakefulnessQuick(room) {
  try {
    const output = await runShell(room, ['dumpsys', 'power'], `Membaca status daya ${room.name}`, 5000);
    const match = /mWakefulness=(\w+)/.exec(output || '');
    return match ? match[1] : null;
  } catch (error) {
    return null;
  }
}

/**
 * Membaca keadaan APK peringatan di sebuah TV: sudah terpasang? izin overlay sudah diberikan?
 * Dua perintah baca yang murah (pm list packages + appops get) supaya UI bisa menampilkan
 * keadaan yang sebenarnya, bukan menebak dari "perintah berhasil dikirim".
 */
async function readOverlayState(room, packageNameInput) {
  const packageName = sanitizeOverlayText(packageNameInput || overlayPackageDefault, overlayPackageDefault);
  const connected = await verifyConnected(room);
  if (!connected) {
    return {
      overlayInstalled: null,
      overlayAllowed: null,
      overlayCheckError: `ADB tidak tersambung ke ${room.name}; keadaan APK peringatan belum bisa dipastikan.`,
    };
  }

  let installed = null;
  let allowed = null;
  let err = null;

  try {
    const out = await runShell(room, ['pm', 'list', 'packages', packageName], `Memeriksa APK peringatan di ${room.name}`, 6000);
    installed = new RegExp(`package:\\s*${packageName.replace(/\./g, '\\.')}\\b`).test(out || '');
  } catch (error) {
    err = `Gagal membaca daftar paket ${room.name}: ${error.message}`;
  }

  if (installed) {
    try {
      const ops = await runShell(room, ['appops', 'get', packageName, 'SYSTEM_ALERT_WINDOW'], `Memeriksa izin overlay di ${room.name}`, 6000);
      allowed = /SYSTEM_ALERT_WINDOW:\s*allow/i.test(ops || '');
    } catch (error) {
      err = err || `Gagal membaca izin overlay ${room.name}: ${error.message}`;
    }
  }

  const state = {
    overlayInstalled: installed,
    overlayAllowed: installed ? allowed : false,
    overlayCheckError: err,
  };
  rememberOverlayState(room.id, state);
  return state;
}

/**
 * Keadaan APK peringatan untuk daftar ruangan: pakai hasil pemeriksaan terakhir, dan
 * lakukan satu pemeriksaan nyata (dengan batas waktu pendek) hanya bila ruangan itu
 * belum pernah diperiksa sejak bridge hidup. null berarti belum diketahui - UI tidak boleh
 * menampilkan tombol yang pasti gagal, jadi null diperlakukan sebagai "pasang".
 */
async function getOverlayStateForList(room) {
  const remembered = getRememberedOverlayState(room.id);
  if (remembered) {
    return {
      overlayInstalled: remembered.installed,
      overlayAllowed: remembered.allowed,
      overlayCheckError: null,
    };
  }

  if (!getRuntimeState(room.id).connected) {
    return { overlayInstalled: null, overlayAllowed: null, overlayCheckError: null };
  }

  try {
    return await readOverlayState(room, room.notifyPackage || overlayPackageDefault);
  } catch (error) {
    return { overlayInstalled: null, overlayAllowed: null, overlayCheckError: error.message };
  }
}

/**
 * Menyambung ke TV untuk PEMASANGAN dengan anggaran waktu terbatas.
 *
 * Kenapa bukan ensureAwakeAndConnected(): ritual bangunkan TV penuh (WoL + beberapa percobaan
 * ulang + batas waktu ADB 15 detik) memakan ~96 detik untuk TV yang mati - terukur saat uji
 * 2026-09-25. Untuk peringatan otomatis di latar belakang itu wajar; untuk tombol yang ditekan
 * operator di depan layar, itu kegagalan pengalaman yang nyata.
 *
 * Jadi: percobaan pertama seperti biasa, satu kali bangunkan, satu percobaan ulang dengan batas
 * pendek, lalu MENYERAH DENGAN JUJUR. Pesannya harus memberi tahu apa yang bisa dilakukan operator.
 */
async function ensureReachableForInstall(room, budgetMs = 20000) {
  const deadline = Date.now() + budgetMs;
  const sisa = () => Math.max(1500, deadline - Date.now());
  // Batas per percobaan sengaja pendek. TV yang benar-benar hidup menjawab get-state dalam
  // sepersekian detik (terukur), jadi menunggu 15 detik hanya menghukum operator.
  const perPercobaan = (maks) => ({ ...room, adbTimeoutMs: Math.min(maks, sisa()) });

  try {
    return await ensureConnected(perPercobaan(8000));
  } catch (error) {
    log(`Pemasangan: ${room.name} belum menjawab (${error.message}); mencoba membangunkan sekali...`);
  }

  try {
    // Jalur pendek: satu alamat, satu percobaan, dan batas ADB yang sama pendeknya.
    await wakeRoom(perPercobaan(4000), { broadcastOnly: true, attemptsPerBroadcast: 1 });
  } catch (error) {
    log(`Percobaan bangunkan ${room.name} gagal: ${error.message}`);
  }

  await sleep(Math.min(3000, sisa()));

  try {
    return await ensureConnected(perPercobaan(6000));
  } catch (error) {
    throw new Error(
      `TV ${room.name} tidak terjangkau lewat ADB (${error.message}). ` +
      `Pastikan TV benar-benar menyala dan ADB di jaringan hidup, lalu coba lagi.`,
    );
  }
}

/**
 * Memasang APK peringatan + memberi izin "tampil di atas aplikasi lain" pada satu TV.
 *
 * Alasan bentuknya begini:
 *  - APK diambil dari path tetap di .env bridge (TV_OVERLAY_APK), bukan dari permintaan HTTP.
 *  - TV dibangunkan dulu: memasang ke TV yang tidur akan gagal, dan jawaban "berhasil" untuk
 *    TV yang tidak bisa dihubungi adalah kebohongan yang mahal.
 *  - Batas waktu install 60 detik (`adb install` memang lambat), TIDAK memakai batas ADB bawaan 15 detik.
 */
async function installOverlay(roomSelector) {
  const room = typeof roomSelector === 'object' && roomSelector ? roomSelector : resolveRoom(roomSelector);
  assertRoomEnabled(room);
  assertRoomHasIp(room);

  const packageName = sanitizeOverlayText(room.notifyPackage || overlayPackageDefault, overlayPackageDefault);

  if (!overlayApkPath) {
    throw new Error('TV_OVERLAY_APK belum diisi di .env bridge; berkas APK peringatan tidak diketahui.');
  }
  if (!fs.existsSync(overlayApkPath)) {
    throw new Error(`Berkas APK peringatan tidak ditemukan di bridge: ${overlayApkPath}`);
  }

  const serial = await ensureReachableForInstall(room);

  const installOut = await runAdb(
    ['-s', serial, 'install', '-r', overlayApkPath],
    `Memasang APK peringatan di ${room.name}`,
    overlayInstallTimeoutMs,
  );

  if (!/Success/i.test(installOut || '')) {
    throw new Error(`Pemasangan APK peringatan di ${room.name} gagal: ${installOut || 'tanpa keluaran'}`);
  }

  const grantOut = await runShell(
    room,
    ['appops', 'set', packageName, 'SYSTEM_ALERT_WINDOW', 'allow'],
    `Memberi izin tampil di atas aplikasi lain di ${room.name}`,
    8000,
  );

  const state = await readOverlayState(room, packageName);
  // Layar ikut dilaporkan: pemasangan tetap berhasil pada TV yang tidur, TETAPI peringatannya
  // tidak akan terlihat pelanggan. UI perlu bisa mengatakan itu, bukan menyembunyikannya.
  const wakefulness = await readWakefulnessQuick(room);

  return {
    ok: true,
    roomId: room.id,
    roomName: room.name,
    serial,
    packageName,
    apkPath: overlayApkPath,
    installOutput: String(installOut || '').trim(),
    grantOutput: String(grantOut || '').trim(),
    wakefulness,
    overlayInstalled: state.overlayInstalled,
    overlayAllowed: state.overlayAllowed,
    overlayCheckError: state.overlayCheckError,
  };
}

async function getStatus(roomSelector) {
  const room = typeof roomSelector === 'object' && roomSelector ? roomSelector : resolveRoom(roomSelector);
  assertRoomHasIp(room);

  const connected = await verifyConnected(room);
  const runtime = getRuntimeState(room.id);

  // Keadaan APK peringatan ikut dilaporkan supaya UI bisa menyembunyikan tombol pasang
  // untuk ruangan yang sudah lengkap. Hanya diperiksa bila ADB tersambung.
  const overlay = connected
    ? await readOverlayState(room, room.notifyPackage || overlayPackageDefault)
    : { overlayInstalled: null, overlayAllowed: null, overlayCheckError: 'ADB tidak tersambung.' };

  return {
    ok: true,
    roomId: room.id,
    roomName: room.name,
    connected,
    ip: room.ip,
    mac: room.mac,
    serial: serialFromRoom(room),
    enabled: room.enabled,
    overlayPackage: overlayPackageDefault,
    overlayInstalled: overlay.overlayInstalled,
    overlayAllowed: overlay.overlayAllowed,
    overlayCheckError: overlay.overlayCheckError,
    wakefulness: await readWakefulnessQuick(room),
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
      overlayState: getRememberedOverlayState(room.id),
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
  // Tabel ARP PC ini: sumber yang bisa membuktikan sebuah IP benar-benar dipegang
  // perangkat yang kita kira. Dipakai untuk memeriksa alamat TV sebelum disimpan.
  const { exec } = require("node:child_process");
  return new Promise((resolve) => {
    exec("arp -a", { timeout: 3000 }, (error, stdout) => {
      const map = new Map();
      if (error || !stdout) {
        return resolve(map);
      }
      const lines = String(stdout).split(/\r?\n/);
      for (const line of lines) {
        const match = /(\d+\.\d+\.\d+\.\d+)\s+([0-9a-fA-F]{2}[:-][0-9a-fA-F]{2}[:-][0-9a-fA-F]{2}[:-][0-9a-fA-F]{2}[:-][0-9a-fA-F]{2}[:-][0-9a-fA-F]{2})/i.exec(line);
        if (match) {
          map.set(match[1].trim(), match[2].trim().toLowerCase().replace(/-/g, ":"));
        }
      }
      resolve(map);
    });
  });
}

module.exports = {
  connectToRoom,
  ensureAwakeAndConnected,
  ensureConnected,
  getArpTable,
  getOverlayStateForList,
  getTvPowerState,
  installOverlay,
  readOverlayState,
  getDefaultRoomId,
  getRoomRuntime,
  getRuntime,
  getStatus,
  getTestDeviceRuntime,
  launchApp,
  listRoomStatuses,
  listTestDeviceStatuses,
  resolveRoomId: getRoomIdOrNull,
  resolveTestDeviceId: getTestDeviceIdOrNull,
  sendOverlay,
  sleepRoom: sendSleepKeyevent,
  wakeRoom,
};
