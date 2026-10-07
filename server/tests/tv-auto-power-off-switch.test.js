/*
 * Sakelar per ruangan "Matikan TV otomatis saat waktu habis" (Pengaturan -> Kontrol TV).
 *
 * Uji ini MEMBACA berkas sumber (bukan menjalankan server/TV), sejalan dengan tes TV lain
 * di folder ini. Tujuannya menjaga tiga hal yang mudah rusak tanpa disadari:
 *   1. Bridge tetap menerima & menyimpan nilai sakelar per ruangan.
 *   2. Peringatan sisa waktu TIDAK ikut hilang saat sakelar dimatikan.
 *   3. Semua jalur yang bisa menidurkan TV (jadwal, tutup billing, penyapu, pulih setelah
 *      restart) benar-benar membaca sakelar - kalau satu jalur terlewat, TV tetap mati
 *      sendiri padahal staf sudah mematikan fiturnya.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const baca = (rel) => fs.readFileSync(path.join(__dirname, rel), 'utf8');
const bridgeSrc = (rel) => baca(`../../middleware/tv-control-bridge/${rel}`);

// ---------------------------------------------------------------- sisi bridge
const roomConfig = bridgeSrc('src/roomConfig.js');
assert(
  roomConfig.includes('autoPowerOff'),
  'roomConfig.js bridge wajib menyimpan field autoPowerOff per ruangan'
);
assert(
  /autoPowerOff\s*!==\s*false/.test(roomConfig),
  'autoPowerOff harus ber-bawaan AKTIF (hanya nilai false yang mematikan)'
);

const countdown = bridgeSrc('src/countdownService.js');
assert(
  countdown.includes("action: 'tidur_dilewati'"),
  'countdownService wajib mencatat kejadian tidur_dilewati saat peniduran dilewati'
);
assert(
  countdown.includes('autoPowerOffEnabled(getRoom(record.targetId))'),
  'urutan akhir wajib memeriksa sakelar ruangan sebelum menidurkan TV'
);
assert(
  countdown.includes('function autoPowerOffEnabled'),
  'countdownService wajib punya penolong autoPowerOffEnabled'
);
assert(
  /restoreSchedules[\s\S]*autoPowerOffEnabled/.test(countdown),
  'pemulihan jadwal setelah restart bridge wajib ikut memeriksa sakelar ruangan'
);
// Peringatan tidak boleh dibelokkan oleh sakelar: harus tetap dijadwalkan.
assert(
  countdown.includes('record.warnings.forEach((warning) => armWarning(record, warning));'),
  'peringatan T-15/T-5 wajib tetap dipasang walau matikan otomatis dimatikan'
);

// ----------------------------------------------------------------- sisi POS
const schema = baca('../src/db/schema.sql');
assert(schema.includes('auto_power_off'), 'schema.sql wajib memuat kolom tv_devices.auto_power_off');

const migrasi = baca('../src/db/index.js');
assert(
  /ALTER TABLE tv_devices ADD COLUMN IF NOT EXISTS auto_power_off/.test(migrasi),
  'migrasi startup wajib menambahkan kolom auto_power_off (ADD COLUMN IF NOT EXISTS)'
);

const controller = baca('../src/controllers/tvController.js');
assert(controller.includes('auto_power_off'), 'controller wajib menyimpan nilai auto_power_off ke tv_devices');
assert(
  /autoPowerOff\b/.test(controller) && /autoPowerOff\s*\r?\n\s*\}\);/.test(controller.replace(/autoPowerOff,/g, 'autoPowerOff\n')),
  'controller wajib mengirim nilai autoPowerOff ke bridge saat Simpan'
);
assert(
  /auto_power_off: autoPowerOff/.test(controller),
  'getTvRoomOverview wajib mengirim auto_power_off supaya UI bisa menampilkan statusnya'
);

const service = baca('../src/services/tvBridgeService.js');
assert(
  /autoPowerOff === false/.test(service),
  'startSchedule wajib melewati perintah matikan saat sakelar dimatikan'
);
assert(
  /matikan TV otomatis dimatikan - TV tidak ditidurkan/.test(service),
  'syncRoom wajib melewati peniduran saat menutup billing bila sakelar dimatikan'
);
assert(
  /matikan TV otomatis dimatikan'/.test(service),
  'penyapu ruangan lewat waktu wajib melewati ruangan yang sakelarnya dimatikan'
);
assert(
  /COALESCE\(d\.auto_power_off, TRUE\)/.test(service),
  'nilai sakelar wajib dibaca dari baris perangkat yang benar-benar dipakai bridge'
);

const appJs = baca('../../js/app.js');
assert(
  appJs.includes('data-prop="autoPowerOff"'),
  'modal Kontrol TV wajib memuat sakelar autoPowerOff'
);
assert(
  appJs.includes('auto_power_off: m.autoPowerOff === false'),
  'UI wajib mengirim auto_power_off saat menyimpan pengaturan TV'
);
assert(
  appJs.includes('Matikan TV otomatis saat waktu habis'),
  'label sakelar wajib memakai bahasa yang dipahami staf venue'
);

// Indikator: ruangan yang fiturnya dimatikan harus LANGSUNG terlihat di daftar Kontrol TV,
// kalau tidak staf hanya melihat TV yang tetap menyala dan mengira sistemnya rusak.
assert(
  appJs.includes('Tidak dimatikan otomatis'),
  'baris Kontrol TV wajib menandai ruangan yang TV-nya tidak dimatikan otomatis'
);
assert(
  /auto_power_off === false && r\.has_device !== false/.test(appJs),
  'penanda hanya untuk ruangan yang fiturnya dimatikan dan memang punya perangkat'
);
assert(
  appJs.includes('TIDAK akan dimatikan otomatis saat waktu billing habis'),
  'modal Edit wajib mengingatkan saat pilihan Tidak dipilih'
);

// Kejujuran kolom ADB: "Tersambung" tidak boleh dibaca sebagai keadaan sekarang bila TV sudah
// hilang dari jaringan - halaman Kontrol TV pernah tampil "Tersambung" padahal kartu merah.
assert(
  controller.includes('tv_connected_now') && controller.includes('runtime_last_connect_at'),
  'POS wajib memisahkan sambungan sekarang dan waktu sambungan terakhir'
);
assert(
  appJs.includes('Terakhir tersambung'),
  'UI wajib menulis kapan terakhir tersambung, bukan hanya kata Tersambung'
);
assert(
  /tv_connected_now === false/.test(appJs),
  'UI wajib membedakan sambungan yang masih hidup dari jejak lama'
);
assert(
  appJs.includes('TV_CONTROL_REFRESH_MS') && /setInterval\(\(\) => \{[\s\S]{0,200}halamanKontrolTvSedangDibuka/.test(appJs),
  'halaman Kontrol TV wajib menyegarkan diri sendiri'
);
assert(
  appJs.includes('modalTvSedangTerbuka') && appJs.includes('isUserBusy()'),
  'penyegaran otomatis wajib ditahan saat modal terbuka / orang sedang mengetik'
);

console.log('✓ Sakelar "Matikan TV otomatis" terverifikasi di bridge, POS, dan aplikasi.');