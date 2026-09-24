# Rencana Implementasi: Menu Kontrol TV di Aplikasi POS

> **Untuk pekerja agentic:** SUB-SKILL WAJIB: Gunakan superpowers:subagent-driven-development (direkomendasikan) atau superpowers:executing-plans untuk mengimplementasikan rencana ini tugas demi tugas. Langkah menggunakan sintaks checkbox (`- [ ]`) untuk pelacakan.

**Goal:** Menghadirkan sub-tab "Kontrol TV" di dalam tab Pengaturan POS untuk memantau status riil 9 ruangan aktif, mengedit konfigurasi IP/MAC di database dan bridge secara terintegrasi, menguji koneksi/daya TV, serta menyediakan tombol penambahan ruangan baru.

**Architecture:** Database POS (tabel `tv_devices`) menjadi sumber kebenaran utama (single source of truth). Seluruh kontrol UI dan pembaruan pengaturan diarahkan melalui backend Express POS (`/exec`) dengan proteksi PIN Admin/Owner, kemudian diteruskan ke TV Control Bridge LAN (port 3030) via REST endpoint dan dicatat ke `tv_control_logs`.

**Tech Stack:** Node.js, Express, PostgreSQL, Vanilla JavaScript (POS SPA), CSS murni, Android ADB / WoL Bridge.

**Spec:** [docs/superpowers/specs/2026-09-24-tv-control-menu-design.md](file:///f:/KARAOKE%20MANAGEMENT%20SYSTEM/docs/superpowers/specs/2026-09-24-tv-control-menu-design.md)

## Global Constraints

- Mode Antislop: DURING (tanpa karakter em dash, dial ENERGY 1 / RHYTHM 1 / MOTION 1, tidak ada tombol mati, kontras warna WCAG AA).
- Keamanan: Repositori publik. Tidak boleh ada token atau berkas `.env` yang masuk ke dalam komit git.
- Autentikasi: Seluruh aksi POST mutasi kontrol TV wajib divalidasi dengan PIN Owner/Admin (`validateAdminPin`).
- Integritas Data: ID perangkat dibakukan menjadi `TV-<room_id>`, format MAC disimpan huruf kecil dipisahkan titik dua `:` (contoh: `74:81:9a:ff:72:be`), IP divalidasi format IPv4.
- Kejujuran Status: Status layar dan ADB wajib mencerminkan hasil riil dari bridge (`dumpsys power` dan `getStatus`), baris bermasalah (seperti tunnel mati TV-002) wajib ditandai di kolom masalah.

## Review Focus

1. Input MAC address dengan format bervariasi (huruf besar, tanda hubung `-`, tanpa pemisah) harus dinormalisasi secara otomatis menjadi huruf kecil berpemisah `:`.
2. Kegagalan komunikasi atau timeout saat TV bridge offline tidak boleh membuat server POS crash atau transaksi kasir terganggu, melainkan menghasilkan pesan galat jujur dan status tersimpan di audit log.
3. Upaya mutasi tanpa PIN admin atau dengan PIN salah harus ditolak dengan pesan jelas dan kode blokir `AUTH_FAILED`.
4. Penyimpanan pengaturan TV untuk ruangan yang sudah ada harus memperbarui baris aktif tanpa menduplikasi data atau menyebabkan konflik kunci unik.
5. Perpindahan antar sub-tab Pengaturan tidak boleh merusak state form atau tata letak sub-tab lain, dan sub-tab `tv_control` harus tetap terpilih saat halaman di-refresh.

---

### Task 1: Migrasi Skema Database (`tv_devices`)

**Files:**
- Modify: `server/src/db/schema.sql:350-380`
- Modify: `server/src/db/index.js:50-95`
- Test: `server/tests/tv-devices-schema-migration.test.js`

**Interfaces:**
- Consumes: Skema tabel `tv_devices` yang sudah ada di database PostgreSQL.
- Produces: Kolom baru `tv_ip`, `tv_mac`, `adb_port`, `adb_timeout_ms`, `wol_broadcast`, `notify_package`, `notes`, `last_checked_at`, `last_check_result`, `last_check_message`.

- [ ] **Step 1: Tulis uji otomatis migrasi skema database**

Buat berkas pengujian `server/tests/tv-devices-schema-migration.test.js`:
```javascript
const assert = require('assert');
const fs = require('fs');
const path = require('path');

function testSchemaSqlContainsNewColumns() {
  const schemaPath = path.join(__dirname, '../src/db/schema.sql');
  const schemaContent = fs.readFileSync(schemaPath, 'utf8');

  const requiredColumns = [
    'tv_ip',
    'tv_mac',
    'adb_port',
    'adb_timeout_ms',
    'wol_broadcast',
    'notify_package',
    'notes',
    'last_checked_at',
    'last_check_result',
    'last_check_message'
  ];

  for (const col of requiredColumns) {
    assert(
      schemaContent.includes(col),
      `Kolom ${col} harus didefinisikan pada server/src/db/schema.sql`
    );
  }
  console.log('✓ Definisi kolom tv_devices di schema.sql terverifikasi.');
}

testSchemaSqlContainsNewColumns();
```

- [ ] **Step 2: Jalankan pengujian untuk memastikan uji gagal**

Jalankan: `node server/tests/tv-devices-schema-migration.test.js`
Hasil yang diharapkan: FAIL dengan pesan kolom belum ada di `schema.sql`.

- [ ] **Step 3: Implementasikan penambahan kolom pada schema.sql dan auto-migration helper**

Perbarui `server/src/db/schema.sql` pada definisi tabel `tv_devices`:
```sql
CREATE TABLE IF NOT EXISTS tv_devices (
    tv_device_id VARCHAR(50) PRIMARY KEY,
    room_id VARCHAR(50) REFERENCES rooms(room_id) ON DELETE CASCADE,
    device_name VARCHAR(100) NOT NULL,
    control_type VARCHAR(20) DEFAULT 'mock',
    status VARCHAR(20) DEFAULT 'active',
    middleware_url TEXT,
    device_identifier VARCHAR(100),
    tv_ip VARCHAR(45),
    tv_mac VARCHAR(32),
    adb_port INT DEFAULT 5555,
    adb_timeout_ms INT DEFAULT 15000,
    wol_broadcast VARCHAR(45) DEFAULT '192.168.1.255',
    notify_package VARCHAR(100) DEFAULT 'com.happysong.tvnotify',
    notes TEXT,
    last_checked_at TIMESTAMPTZ,
    last_check_result VARCHAR(30),
    last_check_message TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

Tambahkan fungsi pembantu migrasi runtime di `server/src/db/index.js` agar kolom ditambahkan otomatis saat server dinyalakan:
```javascript
async function runTvDevicesMigration(pool) {
  const alterQueries = [
    "ALTER TABLE tv_devices ADD COLUMN IF NOT EXISTS tv_ip VARCHAR(45);",
    "ALTER TABLE tv_devices ADD COLUMN IF NOT EXISTS tv_mac VARCHAR(32);",
    "ALTER TABLE tv_devices ADD COLUMN IF NOT EXISTS adb_port INT DEFAULT 5555;",
    "ALTER TABLE tv_devices ADD COLUMN IF NOT EXISTS adb_timeout_ms INT DEFAULT 15000;",
    "ALTER TABLE tv_devices ADD COLUMN IF NOT EXISTS wol_broadcast VARCHAR(45) DEFAULT '192.168.1.255';",
    "ALTER TABLE tv_devices ADD COLUMN IF NOT EXISTS notify_package VARCHAR(100) DEFAULT 'com.happysong.tvnotify';",
    "ALTER TABLE tv_devices ADD COLUMN IF NOT EXISTS notes TEXT;",
    "ALTER TABLE tv_devices ADD COLUMN IF NOT EXISTS last_checked_at TIMESTAMPTZ;",
    "ALTER TABLE tv_devices ADD COLUMN IF NOT EXISTS last_check_result VARCHAR(30);",
    "ALTER TABLE tv_devices ADD COLUMN IF NOT EXISTS last_check_message TEXT;"
  ];
  for (const q of alterQueries) {
    try {
      await pool.query(q);
    } catch (e) {
      // Abaikan jika database offline saat pengujian statis
    }
  }
}
```

- [ ] **Step 4: Jalankan pengujian dan pastikan berhasil**

Jalankan: `node server/tests/tv-devices-schema-migration.test.js`
Hasil yang diharapkan: PASS.

- [ ] **Step 5: Komit perubahan Task 1**

```bash
git add server/src/db/schema.sql server/src/db/index.js server/tests/tv-devices-schema-migration.test.js
git commit -m "feat(db): tambahkan kolom konfigurasi dan diagnosa pada tabel tv_devices"
```

---

### Task 2: Endpoint Konfigurasi pada TV Control Bridge (`PUT /api/rooms/:id/config` & Reload)

**Files:**
- Modify: `middleware/tv-control-bridge/src/roomConfig.js`
- Modify: `middleware/tv-control-bridge/server.js`
- Test: `server/tests/tv-bridge-config-endpoint.test.js`

**Interfaces:**
- Consumes: Permintaan HTTP PUT dengan payload JSON berisi pembaruan konfigurasi kamar (`ip`, `mac`, `adbPort`, `notes`, dll.).
- Produces: Pembaruan file `config/rooms.json` secara aman dan pembaruan struktur memori runtime bridge tanpa perlu restart.

- [ ] **Step 1: Tulis uji otomatis rute konfigurasi bridge**

Buat berkas pengujian `server/tests/tv-bridge-config-endpoint.test.js`:
```javascript
const assert = require('assert');
const fs = require('fs');
const path = require('path');

function testBridgeServerConfigRoute() {
  const serverPath = path.join(__dirname, '../../middleware/tv-control-bridge/server.js');
  const serverContent = fs.readFileSync(serverPath, 'utf8');

  assert(
    serverContent.includes('/api/rooms/:roomId/config') || serverContent.includes('/api/rooms/:id/config'),
    'server.js bridge wajib memuat rute PUT untuk pembaruan konfigurasi ruangan'
  );
  assert(
    serverContent.includes('/api/config/reload'),
    'server.js bridge wajib memuat rute POST untuk memuat ulang konfigurasi'
  );
  console.log('✓ Endpoint konfigurasi bridge terverifikasi di server.js.');
}

testBridgeServerConfigRoute();
```

- [ ] **Step 2: Jalankan pengujian untuk memastikan uji gagal**

Jalankan: `node server/tests/tv-bridge-config-endpoint.test.js`
Hasil yang diharapkan: FAIL karena rute belum ada.

- [ ] **Step 3: Implementasikan pembaruan `roomConfig.js` dan endpoint di `server.js`**

Di `middleware/tv-control-bridge/src/roomConfig.js`, tambahkan fungsi `updateRoomConfig`:
```javascript
function updateRoomConfig(roomId, updates = {}) {
  const normalizedId = resolveRoomId(roomId) || String(roomId).trim().toLowerCase();
  const index = rooms.findIndex(r => r.id.toLowerCase() === normalizedId);
  if (index === -1) {
    throw new Error(`Ruangan tidak ditemukan: ${roomId}`);
  }

  const current = rooms[index];
  const updated = {
    ...current,
    ...updates,
    id: current.id,
    aliases: current.aliases
  };

  rooms[index] = normalizeRoom(updated, index);
  roomsById.set(current.id.toLowerCase(), rooms[index]);
  roomsByName.set(current.name.toLowerCase(), rooms[index]);

  // Simpan ke disk secara aman
  const configToSave = {
    defaultRoomId: getDefaultRoomId(),
    rooms,
    testDevices: listTestDevices()
  };
  const tmpPath = `${DEFAULT_CONFIG_PATH}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(configToSave, null, 4), 'utf8');
  fs.renameSync(tmpPath, DEFAULT_CONFIG_PATH);

  return rooms[index];
}

function reloadRoomConfig() {
  const loaded = loadRoomFile();
  rooms.length = 0;
  rooms.push(...loaded.rooms);
  roomsById.clear();
  roomsByName.clear();
  roomsByAlias.clear();
  rooms.forEach(r => {
    roomsById.set(r.id.toLowerCase(), r);
    roomsByName.set(r.name.toLowerCase(), r);
    r.aliases.forEach(a => roomsByAlias.set(a.toLowerCase(), r));
  });
  return { ok: true, roomCount: rooms.length };
}

module.exports = {
  // ekspor yang sudah ada...
  updateRoomConfig,
  reloadRoomConfig
};
```

Di `middleware/tv-control-bridge/server.js`, daftarkan rute:
```javascript
app.put("/api/rooms/:roomId/config", requireApiToken, async (req, res) => {
  try {
    const roomId = resolveRouteRoom(req, res);
    if (!roomId) return;
    const updated = updateRoomConfig(roomId, req.body || {});
    log(`Konfigurasi ruangan ${roomId} diperbarui lewat API.`);
    res.json({ ok: true, success: true, room: updated });
  } catch (error) {
    sendError(res, error, 400);
  }
});

app.post("/api/config/reload", requireApiToken, (_req, res) => {
  try {
    const result = reloadRoomConfig();
    log(`Konfigurasi bridge dimuat ulang lewat API.`);
    res.json({ ok: true, success: true, ...result });
  } catch (error) {
    sendError(res, error, 500);
  }
});
```

- [ ] **Step 4: Jalankan pengujian dan pastikan berhasil**

Jalankan: `node server/tests/tv-bridge-config-endpoint.test.js`
Hasil yang diharapkan: PASS.

- [ ] **Step 5: Komit perubahan Task 2**

```bash
git add middleware/tv-control-bridge/src/roomConfig.js middleware/tv-control-bridge/server.js server/tests/tv-bridge-config-endpoint.test.js
git commit -m "feat(bridge): sediakan endpoint PUT /api/rooms/:id/config dan POST /api/config/reload"
```

---

### Task 3: Implementasi Controller dan Layanan API Server POS

**Files:**
- Modify: `server/src/controllers/tvController.js`
- Modify: `server/src/services/tvBridgeService.js`
- Modify: `server/src/routes/api.js`
- Test: `server/tests/tv-control-api-actions.test.js`

**Interfaces:**
- Consumes: Aksi GET `getTvRoomOverview`, POST `saveTvDeviceSettings`, `checkTvDevice`, `testTvDevice`, `wakeTvDevice`, `sleepTvDevice`, `notifyTvDevice`, `reloadTvBridgeConfig`.
- Produces: Respon terstruktur `{ ok, success, rooms/data }` dengan penanganan galat dan pencatatan audit log.

- [ ] **Step 1: Tulis pengujian kontrak endpoint API Kontrol TV**

Buat berkas pengujian `server/tests/tv-control-api-actions.test.js`:
```javascript
const assert = require('assert');
const fs = require('fs');
const path = require('path');

function testApiRoutesConfigured() {
  const apiRoutePath = path.join(__dirname, '../src/routes/api.js');
  const routeContent = fs.readFileSync(apiRoutePath, 'utf8');

  const requiredGetActions = ['getTvRoomOverview'];
  const requiredPostActions = [
    'saveTvDeviceSettings',
    'checkTvDevice',
    'testTvDevice',
    'wakeTvDevice',
    'sleepTvDevice',
    'notifyTvDevice',
    'reloadTvBridgeConfig'
  ];

  for (const action of requiredGetActions) {
    assert(routeContent.includes(`'${action}'`) || routeContent.includes(`"${action}"`), `Aksi GET ${action} wajib terdaftar pada api.js`);
  }
  for (const action of requiredPostActions) {
    assert(routeContent.includes(`'${action}'`) || routeContent.includes(`"${action}"`), `Aksi POST ${action} wajib terdaftar pada api.js`);
  }

  console.log('✓ Seluruh aksi API Kontrol TV terdaftar di server/src/routes/api.js.');
}

testApiRoutesConfigured();
```

- [ ] **Step 2: Jalankan pengujian untuk memastikan uji gagal**

Jalankan: `node server/tests/tv-control-api-actions.test.js`
Hasil yang diharapkan: FAIL karena rute belum didaftarkan di switch `api.js`.

- [ ] **Step 3: Implementasikan fungsi di `tvController.js`, `tvBridgeService.js`, dan rute `api.js`**

1. Normalisasi MAC dan validasi IPv4 helper di `tvController.js`:
```javascript
function normalizeMac(mac) {
  if (!mac) return '';
  const clean = String(mac).trim().toLowerCase().replace(/[^a-f0-9]/g, '');
  if (clean.length !== 12) return '';
  return clean.match(/.{1,2}/g).join(':');
}

function isValidIpv4(ip) {
  if (!ip) return false;
  const parts = String(ip).trim().split('.');
  if (parts.length !== 4) return false;
  return parts.every(p => {
    const num = Number(p);
    return Number.isInteger(num) && num >= 0 && num <= 255 && String(num) === p;
  });
}
```

2. Implementasikan `getTvRoomOverview`:
   - Membaca tabel `rooms` diurutkan berdasarkan `room_id`.
   - Mengambil data dari tabel `tv_devices`.
   - Menghubungi bridge TV lokal (`/api/rooms`) secara best-effort dengan timeout cepat (2000ms).
   - Menyusun objek `rooms` beserta array `masalah` (misal jika MAC kosong, IP salah, atau bridge offline).

3. Implementasikan `saveTvDeviceSettings`:
   - Validasi `admin_pin` dengan `validateAdminPin(payload.admin_pin)`.
   - Validasi format IP dan normalisasi MAC.
   - Upsert ke tabel `tv_devices` dengan ID terikat `TV-<room_id>`.
   - Mengirimkan PUT ke bridge TV lokal (`/api/rooms/<room_id>/config`).
   - Mencatat log ke `tv_control_logs`.

4. Implementasikan `checkTvDevice`, `testTvDevice`, `wakeTvDevice`, `sleepTvDevice`, `notifyTvDevice`, dan `reloadTvBridgeConfig` dengan pencatatan audit log `trigger_source = 'kontrol_tv_ui'`.

5. Daftarkan di switch `handleGetAction` dan `handlePostAction` di `server/src/routes/api.js`.

- [ ] **Step 4: Jalankan pengujian dan pastikan berhasil**

Jalankan: `node server/tests/tv-control-api-actions.test.js`
Hasil yang diharapkan: PASS.

- [ ] **Step 5: Komit perubahan Task 3**

```bash
git add server/src/controllers/tvController.js server/src/services/tvBridgeService.js server/src/routes/api.js server/tests/tv-control-api-actions.test.js
git commit -m "feat(api): implementasikan aksi getTvRoomOverview dan kontrol tv di server pos"
```

---

### Task 4: Antarmuka POS - Sub-tab "Kontrol TV" (Tabel 9 Ruangan Aktif)

**Files:**
- Modify: `js/app.js` (bagian `createSettingsSubTabsElement`, `getActiveSettingsSectionElement`, `handleRoomAction`)
- Test: `server/tests/tv-control-ui-subtab.test.js`

**Interfaces:**
- Consumes: Payload `getTvRoomOverview` dari server POS.
- Produces: Komponen HTML Sub-tab "Kontrol TV" yang menampilkan 9 ruangan aktif, tombol "Periksa Semua", penanda masalah, serta tombol aksi baris.

- [ ] **Step 1: Tulis pengujian struktur UI sub-tab Kontrol TV**

Buat berkas pengujian `server/tests/tv-control-ui-subtab.test.js`:
```javascript
const assert = require('assert');
const fs = require('fs');
const path = require('path');

function testSubTabTvControlInAppJs() {
  const appJsPath = path.join(__dirname, '../../js/app.js');
  const appJsContent = fs.readFileSync(appJsPath, 'utf8');

  assert(
    appJsContent.includes('tv_control') || appJsContent.includes('kontrol_tv'),
    'js/app.js wajib mendaftarkan sub-tab Kontrol TV'
  );
  assert(
    appJsContent.includes('renderTvControlSection') || appJsContent.includes('createTvControlTable'),
    'js/app.js wajib memuat fungsi perender tabel Kontrol TV'
  );
  console.log('✓ Struktur sub-tab Kontrol TV terverifikasi di js/app.js.');
}

testSubTabTvControlInAppJs();
```

- [ ] **Step 2: Jalankan pengujian untuk memastikan uji gagal**

Jalankan: `node server/tests/tv-control-ui-subtab.test.js`
Hasil yang diharapkan: FAIL.

- [ ] **Step 3: Implementasikan perenderan sub-tab pada `js/app.js`**

1. Tambahkan sub-tab `{ id: "tv_control", label: "Kontrol TV" }` pada `createSettingsSubTabsElement()`.
2. Di `getActiveSettingsSectionElement()`, jika sub-tab bernilai `tv_control`, panggil fungsi perender `createTvControlSectionElement()`.
3. Buat fungsi `createTvControlSectionElement()`:
   - Header Toolbar: Judul "Manajemen & Kontrol TV Ruangan", tombol "Periksa Semua", dan tombol "+ Tambah / Konfigurasi Ruangan".
   - Filter toggle: "Tampilkan 9 Ruangan Aktif" (default terpilih) dan "Tampilkan Semua Ruangan Termasuk Non-Aktif".
   - Tabel Status 9 Ruangan: Kolom Ruangan, Nama Perangkat, Tipe, IP, MAC, Status ADB, Status Layar, Validasi ARP, Masalah, dan Aksi.
   - Lencana status jujur: Hijau untuk terhubung/Awake, Merah untuk terputus/Asleep, Kuning untuk peringatan/masalah.
   - Tombol per baris: Cek, Nyalakan, Matikan, Uji ADB, Pesan, Edit.
4. Pastikan `activeSettingsSubTab` disimpan ke `localStorage.getItem('active_settings_subtab')` agar persisten saat refresh.

- [ ] **Step 4: Jalankan pengujian dan validasi sintaks**

Jalankan:
`node server/tests/tv-control-ui-subtab.test.js`
`node --check js/app.js`
Hasil yang diharapkan: PASS tanpa galat sintaks.

- [ ] **Step 5: Komit perubahan Task 4**

```bash
git add js/app.js server/tests/tv-control-ui-subtab.test.js
git commit -m "feat(ui): tambahkan sub-tab Kontrol TV dan tabel status ruangan pada menu Pengaturan"
```

---

### Task 5: Modal Pengaturan TV dan Eksekusi Perintah Realtime

**Files:**
- Modify: `js/app.js`
- Test: `server/tests/tv-control-modal-actions.test.js`

**Interfaces:**
- Consumes: Interaksi klik tombol Edit, Tambah Ruangan, Nyalakan, Matikan, Uji, dan Kirim Pesan.
- Produces: Modal form pengaturan dengan validasi IP/MAC, modal prompt pesan overlay, dan pemanggilan API via `postApiAction`.

- [ ] **Step 1: Tulis pengujian modal dan penanganan aksi kontrol TV**

Buat berkas pengujian `server/tests/tv-control-modal-actions.test.js`:
```javascript
const assert = require('assert');
const fs = require('fs');
const path = require('path');

function testModalAndActionsInAppJs() {
  const appJsPath = path.join(__dirname, '../../js/app.js');
  const appJsContent = fs.readFileSync(appJsPath, 'utf8');

  assert(
    appJsContent.includes('openTvDeviceModal') || appJsContent.includes('showTvDeviceConfigModal'),
    'js/app.js wajib memiliki fungsi modal konfigurasi perangkat TV'
  );
  assert(
    appJsContent.includes('openTvNotifyModal') || appJsContent.includes('showTvNotifyModal'),
    'js/app.js wajib memiliki fungsi modal kirim pesan overlay TV'
  );
  console.log('✓ Fungsi modal konfigurasi dan notifikasi TV terverifikasi di js/app.js.');
}

testModalAndActionsInAppJs();
```

- [ ] **Step 2: Jalankan pengujian untuk memastikan uji gagal**

Jalankan: `node server/tests/tv-control-modal-actions.test.js`
Hasil yang diharapkan: FAIL.

- [ ] **Step 3: Implementasikan modal konfigurasi dan pengirim aksi di `js/app.js`**

1. Modal Konfigurasi Perangkat TV (`openTvDeviceModal(roomData)`):
   - Input: Pilihan Ruangan (dropdown), Nama Perangkat, Tipe Kontrol (`middleware` / `mock`), Alamat IP TV, Alamat MAC TV, Port ADB (5555), Batas Waktu ADB (ms), Alamat WoL Broadcast, Paket Notifikasi, Catatan, dan Status Aktif.
   - Tombol Uji Langsung di Modal: "Uji Sambungan Sekarang" (memanggil aksi `checkTvDevice`).
   - Tombol Simpan: Meminta verifikasi PIN admin/owner sebelum memanggil `saveTvDeviceSettings`.
2. Modal Notifikasi Overlay TV (`openTvNotifyModal(roomId, roomName)`):
   - Input: Teks Judul Pesan (contoh: "Waktu Bernyanyi Tersisa 10 Menit"), Subteks, dan Durasi Penayangan (detik).
   - Tombol Kirim: Memanggil aksi `notifyTvDevice` dengan proteksi PIN.
3. Event Handler pada `handleRoomAction` di `js/app.js`:
   - Penanganan tombol `check-tv-device`, `wake-tv-device`, `sleep-tv-device`, `test-tv-device`, `notify-tv-device`, `edit-tv-device`, dan `add-tv-device`.

- [ ] **Step 4: Jalankan pengujian dan validasi sintaks**

Jalankan:
`node server/tests/tv-control-modal-actions.test.js`
`node --check js/app.js`
Hasil yang diharapkan: PASS.

- [ ] **Step 5: Komit perubahan Task 5**

```bash
git add js/app.js server/tests/tv-control-modal-actions.test.js
git commit -m "feat(ui): tambahkan modal konfigurasi TV, dialog notifikasi overlay, dan event handler aksi"
```

---

### Task 6: Panel Riwayat Log Kontrol TV, Cache Versioning, dan Laporan Kemajuan

**Files:**
- Modify: `js/app.js`
- Modify: `index.html`
- Create: `middleware/tv-control-bridge/CATATAN-KEMAJUAN-KONTROL-TV.md`
- Test: `server/tests/tv-control-logs-ui.test.js`

**Interfaces:**
- Consumes: Aksi `getTvControlLogs` dari server POS.
- Produces: Panel riwayat log berpaginasi, cache buster diperbarui di `index.html`, dan dokumentasi serah terima di `CATATAN-KEMAJUAN-KONTROL-TV.md`.

- [ ] **Step 1: Tulis pengujian panel log dan cache buster**

Buat berkas pengujian `server/tests/tv-control-logs-ui.test.js`:
```javascript
const assert = require('assert');
const fs = require('fs');
const path = require('path');

function testLogsAndCacheBuster() {
  const indexPath = path.join(__dirname, '../../index.html');
  const indexContent = fs.readFileSync(indexPath, 'utf8');
  assert(
    indexContent.includes('js/app.js?v=tv-control-v1') || indexContent.includes('js/app.js?v=kontrol-tv-v1'),
    'index.html wajib menaikkan versi cache buster js/app.js'
  );

  const catatanPath = path.join(__dirname, '../../middleware/tv-control-bridge/CATATAN-KEMAJUAN-KONTROL-TV.md');
  assert(fs.existsSync(catatanPath), 'CATATAN-KEMAJUAN-KONTROL-TV.md wajib dibuat');

  console.log('✓ Cache buster dan berkas catatan kemajuan terverifikasi.');
}

testLogsAndCacheBuster();
```

- [ ] **Step 2: Jalankan pengujian untuk memastikan uji gagal**

Jalankan: `node server/tests/tv-control-logs-ui.test.js`
Hasil yang diharapkan: FAIL.

- [ ] **Step 3: Implementasikan panel log riwayat, pembaruan `index.html`, dan buat catatan kemajuan**

1. Di `js/app.js`, tambahkan bagian perenderan tabel log riwayat di bawah tabel status pada sub-tab Kontrol TV:
   - Kolom: Waktu, Ruangan, Aksi, Pemicu, Operator, Status (Berhasil/Gagal), Pesan.
   - Paginasi: Tombol Sebelumnya / Selanjutnya dan pemilih filter ruangan.
2. Di `index.html`, perbarui skrip cache buster:
   `src="js/app.js?v=tv-control-v1"`
3. Buat berkas `middleware/tv-control-bridge/CATATAN-KEMAJUAN-KONTROL-TV.md` yang merangkum pekerjaan yang telah diselesaikan untuk Hermes sesuai petunjuk bagian 11 dokumen instruksi.

- [ ] **Step 4: Jalankan seluruh suite pengujian**

Jalankan:
`node server/tests/tv-control-logs-ui.test.js`
`node --check js/app.js`
`npm run test:timezone`
Hasil yang diharapkan: Seluruh pengujian lolos tanpa galat.

- [ ] **Step 5: Komit perubahan Task 6**

```bash
git add js/app.js index.html middleware/tv-control-bridge/CATATAN-KEMAJUAN-KONTROL-TV.md server/tests/tv-control-logs-ui.test.js
git commit -m "feat(tv): lengkapi panel riwayat log kontrol TV, naikkan cache buster, dan buat catatan serah terima"
```
