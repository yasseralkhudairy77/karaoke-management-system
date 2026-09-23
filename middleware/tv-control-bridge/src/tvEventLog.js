const fs = require('node:fs');
const path = require('node:path');

/**
 * Catatan kejadian TV: satu baris JSON per kejadian, ditulis ke logs/tv-events.jsonl
 * supaya "TV tidak mati" bisa dilihat di data, bukan ditemukan besok pagi.
 * Ring buffer di memori dipakai untuk endpoint /api/events (tahan dibaca cepat),
 * berkas dipakai untuk riwayat yang tahan restart bridge.
 */

const LOG_DIR = process.env.TV_EVENT_LOG_DIR || path.join(__dirname, '..', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'tv-events.jsonl');
const MAX_MEMORY_EVENTS = Math.max(50, Number(process.env.TV_EVENT_MEMORY || 500));

const memory = [];

function ensureLogDir() {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  } catch (error) {
    // diabaikan: kalau folder tidak bisa dibuat, kejadian tetap ada di memori
  }
}

function describe(entry) {
  const target = entry.roomName || entry.roomId || '-';
  const outcome = entry.ok === false ? 'GAGAL' : 'ok';
  const detail = entry.detail ? ` - ${entry.detail}` : '';
  return `[EVENT] ${entry.action || 'kejadian'} ${target} ${outcome}${detail}`;
}

function recordEvent(event = {}) {
  const entry = { at: new Date().toISOString(), ...event };
  memory.push(entry);
  if (memory.length > MAX_MEMORY_EVENTS) {
    memory.splice(0, memory.length - MAX_MEMORY_EVENTS);
  }

  try {
    ensureLogDir();
    fs.appendFileSync(LOG_FILE, `${JSON.stringify(entry)}\n`);
  } catch (error) {
    console.warn(`[EVENT] gagal menulis berkas: ${error.message}`);
  }

  console.log(describe(entry));
  return entry;
}

function readEventsFromFile(limit) {
  try {
    if (!fs.existsSync(LOG_FILE)) {
      return [];
    }

    const stat = fs.statSync(LOG_FILE);
    const maxBytes = 256 * 1024;
    const start = Math.max(0, stat.size - maxBytes);
    const buffer = Buffer.alloc(stat.size - start);
    const fd = fs.openSync(LOG_FILE, 'r');
    fs.readSync(fd, buffer, 0, buffer.length, start);
    fs.closeSync(fd);

    return String(buffer)
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch (error) {
          return null;
        }
      })
      .filter(Boolean)
      .slice(-limit);
  } catch (error) {
    console.warn(`[EVENT] gagal membaca berkas: ${error.message}`);
    return [];
  }
}

/**
 * Kejadian terbaru lebih dulu. Diambil dari memori; kalau memori belum cukup
 * (bridge baru di-restart) sisanya dilengkapi dari berkas.
 */
function listEvents(limit = 50) {
  const size = Math.max(1, Math.min(Number(limit) || 50, MAX_MEMORY_EVENTS));
  const fromMemory = memory.slice(-size);
  if (fromMemory.length >= size) {
    return fromMemory.slice().reverse();
  }

  const fromFile = readEventsFromFile(size * 2);
  const seen = new Set();
  const merged = [];
  for (const entry of [...fromFile, ...fromMemory]) {
    const fingerprint = JSON.stringify(entry);
    if (seen.has(fingerprint)) {
      continue;
    }
    seen.add(fingerprint);
    merged.push(entry);
  }
  return merged.slice(-size).reverse();
}

module.exports = {
  LOG_FILE,
  listEvents,
  recordEvent,
};
