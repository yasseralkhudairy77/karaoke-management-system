const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const wol = require('wake_on_lan');
require('dotenv').config();

const {
  getDefaultRoomId,
  getRoom,
  getRoomIdOrNull,
  listRooms,
  resolveRoom,
  getConfigPath,
} = require('./roomConfig');

const execFileAsync = promisify(execFile);
const adbBin = process.env.ADB_BIN || 'adb';

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
    const state = await runAdb(['-s', serial, 'get-state'], `Checking device state for ${room.id}`, room.adbTimeoutMs);
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
  assertRoomHasIp(room);

  const serial = serialFromRoom(room);
  log(`Connecting to ${room.id} (${serial})...`);

  if (await verifyConnected(room)) {
    log(`Room ${room.id} is already connected`);
    return getStatus(room.id);
  }

  try {
    await runAdb(['connect', serial], `Connecting to ${serial}`, room.adbTimeoutMs);
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
  return getStatus(room.id);
}

async function ensureConnected(roomSelector) {
  const room = typeof roomSelector === 'object' && roomSelector ? roomSelector : resolveRoom(roomSelector);
  const serial = serialFromRoom(room);
  if (getRuntimeState(room.id).connected && (await verifyConnected(room))) {
    return serial;
  }

  await connectToRoom(room);
  return serial;
}

async function runShell(room, command, label) {
  const shellArgs = Array.isArray(command) ? command : [String(command)];
  const output = await runAdb(['-s', serialFromRoom(room), 'shell', ...shellArgs], label, room.adbTimeoutMs);
  return output;
}

async function sendSleepKeyevent(roomSelector, keycode) {
  const room = typeof roomSelector === 'object' && roomSelector ? roomSelector : resolveRoom(roomSelector);
  assertRoomHasIp(room);

  const numericKeycode = Number(
    typeof keycode !== 'undefined' ? keycode : room.defaultSleepKeycode
  );
  if (!Number.isFinite(numericKeycode)) {
    throw new Error('keycode must be a number');
  }

  const serial = await ensureConnected(room);
  const output = await runShell(room, ['input', 'keyevent', String(numericKeycode)], `Sending keyevent ${numericKeycode}`);
  log(`Sleep command sent to ${serial}`);
  return {
    ok: true,
    roomId: room.id,
    roomName: room.name,
    serial,
    keycode: numericKeycode,
    output,
  };
}

async function sendWakeKeyevent(roomSelector) {
  const room = typeof roomSelector === 'object' && roomSelector ? roomSelector : resolveRoom(roomSelector);
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

async function getStatus(roomSelector) {
  const room = typeof roomSelector === 'object' && roomSelector ? roomSelector : resolveRoom(roomSelector);
  assertRoomHasIp(room);

  const connected = await verifyConnected(room);
  const runtime = getRuntimeState(room.id);

  return {
    ok: true,
    roomId: room.id,
    roomName: room.name,
    connected,
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
  };
}

function listRoomStatuses() {
  return listRooms().map((room) => getRoomRuntime(room.id));
}

module.exports = {
  connectToRoom,
  ensureConnected,
  getDefaultRoomId,
  getRoomRuntime,
  getRuntime,
  getStatus,
  launchApp,
  listRoomStatuses,
  resolveRoomId: getRoomIdOrNull,
  sleepRoom: sendSleepKeyevent,
  wakeRoom,
};
