const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config();

const DEFAULT_CONFIG_PATH = process.env.ROOMS_CONFIG_PATH
  ? path.resolve(process.cwd(), process.env.ROOMS_CONFIG_PATH)
  : path.join(__dirname, '..', 'config', 'rooms.json');

function parseCsvList(value) {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.map((entry) => String(entry).trim()).filter(Boolean);
  }

  return String(value)
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function padRoomNumber(index) {
  return String(index + 1).padStart(2, '0');
}

function normalizeRoom(rawRoom = {}, index = 0) {
  const suffix = padRoomNumber(index);
  const id = String(rawRoom.id || `room-${suffix}`).trim();
  const name = String(rawRoom.name || `Room ${suffix}`).trim();
  const ip = String(rawRoom.ip || '').trim();
  const mac = String(rawRoom.mac || '').trim().toLowerCase();
  const adbPort = Number(rawRoom.adbPort || process.env.ADB_PORT || 5555);
  const wolBroadcast = String(rawRoom.wolBroadcast || process.env.WOL_BROADCAST || '255.255.255.255').trim();
  const wolBroadcasts = parseCsvList(
    typeof rawRoom.wolBroadcasts !== 'undefined' ? rawRoom.wolBroadcasts : process.env.WOL_BROADCASTS
  );
  const wolPort = Number(rawRoom.wolPort || process.env.WOL_PORT || 9);
  const wolPackets = Number(rawRoom.wolPackets || process.env.WOL_PACKETS || 3);
  const wolIntervalMs = Number(rawRoom.wolIntervalMs || process.env.WOL_INTERVAL_MS || 100);
  const defaultSleepKeycode = Number(rawRoom.defaultSleepKeycode || process.env.DEFAULT_SLEEP_KEYCODE || 223);
  const enabled = rawRoom.enabled !== false;
  const notes = rawRoom.notes ? String(rawRoom.notes).trim() : '';

  return {
    id,
    name,
    ip,
    mac,
    adbPort,
    wolBroadcast,
    wolBroadcasts,
    wolPort,
    wolPackets,
    wolIntervalMs,
    defaultSleepKeycode,
    enabled,
    notes,
  };
}

function buildFallbackRooms() {
  const defaultRoomId = String(process.env.DEFAULT_ROOM_ID || 'room-01').trim() || 'room-01';

  return {
    defaultRoomId,
    rooms: [
      normalizeRoom(
        {
          id: defaultRoomId,
          name: 'Main Room',
          ip: process.env.TV_IP || '',
          mac: process.env.TV_MAC || '',
          adbPort: process.env.ADB_PORT || 5555,
          wolBroadcast: process.env.WOL_BROADCAST || '255.255.255.255',
          wolBroadcasts: process.env.WOL_BROADCASTS || '',
          wolPort: process.env.WOL_PORT || 9,
          wolPackets: process.env.WOL_PACKETS || 3,
          wolIntervalMs: process.env.WOL_INTERVAL_MS || 100,
          defaultSleepKeycode: process.env.DEFAULT_SLEEP_KEYCODE || 223,
          enabled: true,
        },
        0
      ),
    ],
  };
}

function loadRoomFile() {
  if (!fs.existsSync(DEFAULT_CONFIG_PATH)) {
    return buildFallbackRooms();
  }

  const raw = fs.readFileSync(DEFAULT_CONFIG_PATH, 'utf8');
  const parsed = JSON.parse(raw);
  const defaultRoomId = String(parsed.defaultRoomId || process.env.DEFAULT_ROOM_ID || '').trim();
  const roomList = Array.isArray(parsed.rooms) ? parsed.rooms : Array.isArray(parsed) ? parsed : [];
  const rooms = roomList.map((room, index) => normalizeRoom(room, index));
  const resolvedDefaultRoomId = defaultRoomId || (rooms[0] ? rooms[0].id : 'room-01');

  return {
    defaultRoomId: resolvedDefaultRoomId,
    rooms,
  };
}

const roomFile = loadRoomFile();
const rooms = roomFile.rooms;
const roomsById = new Map(rooms.map((room) => [room.id.toLowerCase(), room]));
const roomsByName = new Map(rooms.map((room) => [room.name.toLowerCase(), room]));

function listRooms() {
  return rooms.map((room) => ({ ...room }));
}

function getDefaultRoomId() {
  return roomFile.defaultRoomId;
}

function getRoomIdOrNull(selector) {
  if (typeof selector === 'undefined' || selector === null || selector === '') {
    return getDefaultRoomId();
  }

  const raw = String(selector).trim();
  if (!raw) {
    return getDefaultRoomId();
  }

  const lower = raw.toLowerCase();
  if (roomsById.has(lower)) {
    return roomsById.get(lower).id;
  }

  if (roomsByName.has(lower)) {
    return roomsByName.get(lower).id;
  }

  if (/^\d+$/.test(lower)) {
    const normalized = `room-${String(Number(lower)).padStart(2, '0')}`;
    if (roomsById.has(normalized.toLowerCase())) {
      return roomsById.get(normalized.toLowerCase()).id;
    }
  }

  return null;
}

function getRoom(selector) {
  const roomId = getRoomIdOrNull(selector);
  if (!roomId) {
    return null;
  }

  return roomsById.get(roomId.toLowerCase()) || null;
}

function resolveRoom(selector) {
  const room = getRoom(selector);
  if (!room) {
    const target = typeof selector === 'undefined' || selector === null || selector === ''
      ? 'default room'
      : String(selector);
    throw new Error(`Unknown room: ${target}`);
  }

  return room;
}

function getDefaultRoom() {
  return resolveRoom(getDefaultRoomId());
}

function getConfigPath() {
  return DEFAULT_CONFIG_PATH;
}

module.exports = {
  getConfigPath,
  getDefaultRoom,
  getDefaultRoomId,
  getRoom,
  getRoomIdOrNull,
  listRooms,
  normalizeRoom,
  resolveRoom,
};
