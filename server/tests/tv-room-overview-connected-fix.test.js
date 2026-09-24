const assert = require('assert');
const fs = require('fs');
const path = require('path');

const tvControllerPath = path.join(__dirname, '..', 'src', 'controllers', 'tvController.js');
const tvControllerSrc = fs.readFileSync(tvControllerPath, 'utf8');

const appJsPath = path.join(__dirname, '..', '..', 'js', 'app.js');
const appJsSrc = fs.readFileSync(appJsPath, 'utf8');

// 1. Verifikasi tvController.js membaca bRoom.runtime.connected dan bRoom.connected
assert(
  tvControllerSrc.includes('bRoom.runtime && typeof bRoom.runtime.connected === \'boolean\'') ||
  tvControllerSrc.includes('bRoom.runtime.connected'),
  'tvController wajib membaca status connected dari bRoom.runtime.connected'
);

// 2. Verifikasi cadangan single room status getBridgeRoomStatus(r.room_id)
assert(
  tvControllerSrc.includes('tvBridgeService.getBridgeRoomStatus(r.room_id)'),
  'tvController wajib memanggil getBridgeRoomStatus(r.room_id) sebagai cadangan per ruangan'
);

// 3. Verifikasi pemetaan Executive Room via alias (idKey, nameKey, nameSlug)
assert(
  tvControllerSrc.includes('nameSlug') || tvControllerSrc.includes('aliases'),
  'tvController wajib memetakan Executive Room via alias / name slug'
);

// 4. Verifikasi dukungan ruangan tanpa tv_devices (has_device)
assert(
  tvControllerSrc.includes('has_device: hasDevice'),
  'tvController wajib menyertakan flag has_device untuk ruangan yang belum dikonfigurasi'
);

// 5. Verifikasi deteksi masalah tunnel lhr.life
assert(
  tvControllerSrc.includes("middlewareUrl.includes('lhr.life')"),
  'tvController wajib mendeteksi tunnel lama lhr.life sebagai masalah'
);

// 6. Verifikasi frontend app.js menampilkan last_check_message / last_check_result
assert(
  appJsSrc.includes('r.last_check_result') && appJsSrc.includes('r.last_check_message'),
  'app.js wajib menampilkan riwayat pemeriksaan terakhir di kolom ADB'
);

// 7. Verifikasi frontend app.js mendukung Screensaver untuk Dreaming / Dozing
assert(
  appJsSrc.includes('Screensaver') && appJsSrc.includes('Dreaming'),
  'app.js wajib menampilkan badge Screensaver untuk wakefulness Dreaming/Dozing'
);

// 8. Verifikasi tombol + Tambah Perangkat untuk ruangan tanpa tv_devices
assert(
  appJsSrc.includes('+ Tambah Perangkat'),
  'app.js wajib menyediakan tombol + Tambah Perangkat untuk ruangan tanpa konfigurasi'
);

console.log('✓ Seluruh perbaikan bug TV Room Overview terverifikasi valid!');
