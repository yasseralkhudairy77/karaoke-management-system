/*
 * Uji terisolasi: sakelar "matikan TV otomatis" di bridge.
 * TIDAK menyentuh TV venue: IP/MAC kedua ruangan uji diarahkan ke alamat palsu
 * (127.0.0.1 / MAC tak terpakai). ADB palsu tidak melakukan apa-apa.
 *
 * Jalankan:
 *   ADB_BIN=<adb-palsu> node uji-auto-power-off.js
 */
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const tmp = os.tmpdir();
const configPath = path.join(tmp, '_uji-auto-off-rooms.json');

// Dua ruangan: satu fitur AKTIF, satu fitur DIMATIKAN. Alamat palsu.
const config = {
  defaultRoomId: 'room-uji-on',
  rooms: [
    {
      id: 'room-uji-on', name: 'UJI-ON', aliases: [], ip: '127.0.0.1', mac: '00:00:00:00:00:01',
      adbPort: 5555, adbTimeoutMs: 1500, wolBroadcast: '127.0.0.1', wolBroadcasts: [],
      wolPort: 9, wolPackets: 1, wolIntervalMs: 10, defaultSleepKeycode: 223,
      enabled: true, autoPowerOff: true, notes: 'uji',
    },
    {
      id: 'room-uji-off', name: 'UJI-OFF', aliases: [], ip: '127.0.0.1', mac: '00:00:00:00:00:02',
      adbPort: 5555, adbTimeoutMs: 1500, wolBroadcast: '127.0.0.1', wolBroadcasts: [],
      wolPort: 9, wolPackets: 1, wolIntervalMs: 10, defaultSleepKeycode: 223,
      enabled: true, autoPowerOff: false, notes: 'uji',
    },
  ],
  testDevices: [],
};
fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
process.env.ROOMS_CONFIG_PATH = configPath;
process.env.TV_SCHEDULE_FILE = path.join(tmp, '_uji-auto-off-jadwal.json');
fs.rmSync(process.env.TV_SCHEDULE_FILE, { force: true });

const roomConfig = require('../src/roomConfig');
const countdownService = require('../src/countdownService');

console.log('config terpakai :', roomConfig.getConfigPath());
console.log('UJI-ON  autoPowerOff =', roomConfig.getRoom('room-uji-on').autoPowerOff);
console.log('UJI-OFF autoPowerOff =', roomConfig.getRoom('room-uji-off').autoPowerOff);
console.log('menunggu jadwal singkat (T-0 lalu tenggang 2 detik)...\n');

countdownService.startCountdown({
  targetType: 'room',
  target: roomConfig.getRoom('room-uji-on'),
  durationSeconds: 4,
  graceSeconds: 2,
  finalSeconds: 2,
  warnOffsetsSeconds: [],
});
countdownService.startCountdown({
  targetType: 'room',
  target: roomConfig.getRoom('room-uji-off'),
  durationSeconds: 4,
  graceSeconds: 2,
  finalSeconds: 2,
  warnOffsetsSeconds: [],
});

setTimeout(() => {
  const hasil = countdownService.listCountdowns();
  console.log('=== HASIL ===');
  for (const r of hasil) {
    console.log(`\n${r.targetName} (${r.targetId})`);
    console.log('  state akhir      :', r.state);
    console.log('  tvWasPoweredOff  :', r.tvWasPoweredOff);
    console.log('  riwayat          :');
    r.history.slice(0, 8).reverse().forEach((h) => console.log('    -', h.action, '|', h.detail));
  }
  process.exit(0);
}, 22000);