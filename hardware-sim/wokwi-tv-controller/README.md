# Wokwi ESP32 TV Device Simulator

Simulator perangkat TV controller untuk **Karaoke Management System** (Fase 7A-1.5).

Wokwi mensimulasikan ESP32 + LED sebagai status TV. Ini **bukan** bukti TV fisik benar-benar menyala atau mati — hanya alat latihan sebelum integrasi Home Assistant atau hardware asli.

## Isi folder

| File | Fungsi |
| --- | --- |
| `sketch.ino` | Firmware simulator command TV |
| `diagram.json` | Diagram rangkaian Wokwi (ESP32 + LED status) |
| `README.md` | Panduan menjalankan simulasi |

## Perilaku simulasi

| Command (`tv_action`) | LED |
| --- | --- |
| `power_on` | Menyala (ON) |
| `power_off` | Mati (OFF) |
| `test` | Berkedip beberapa kali, lalu OFF |

Struktur command selaras dengan backend dashboard:

- `tv_action`: `test` | `power_on` | `power_off`
- `tv_device_id`: ID perangkat (default simulasi: `TV-WOKWI-001`)
- `room_id`: ID room (default simulasi: `ROOM-001`)

## Cara menjalankan di Wokwi

1. Buka [https://wokwi.com](https://wokwi.com) dan login (gratis).
2. Klik **New Project** → **Import**.
3. Upload atau salin isi folder ini:
   - `sketch.ino`
   - `diagram.json`
4. Pastikan board: **ESP32 DevKit C v4**.
5. Klik **Start Simulation** (tombol play hijau).
6. Buka **Serial Monitor** di panel bawah Wokwi.
7. Set baud rate **115200** jika perlu.
8. Ketik command lalu Enter.

## Contoh input Serial Monitor

Perintah singkat:

```text
power_on
power_off
test
status
help
```

Format `tv_action=`:

```text
tv_action=power_on
tv_action=power_off
tv_action=test
```

Format JSON (konsisten dengan payload backend):

```json
{"tv_action":"power_on","tv_device_id":"TV-001","room_id":"ROOM-001"}
{"tv_action":"power_off","tv_device_id":"TV-001","room_id":"ROOM-001"}
{"tv_action":"test","tv_device_id":"TV-001","room_id":"ROOM-001"}
```

## Respons simulator

Sukses (contoh):

```json
{"ok":true,"success":true,"message":"Perintah TV berhasil dikirim.","tv_action":"power_on","data":{"room_id":"ROOM-001","tv_device_id":"TV-WOKWI-001","result":"sent"}}
```

Gagal (action tidak dikenal):

```json
{"ok":false,"success":false,"message":"Perintah TV gagal dikirim.","block_reason":"TV_ACTION_INVALID"}
```

## Wiring (diagram)

- LED **TV Status** → GPIO **D2** ESP32 (via resistor 220 Ω)
- Katoda LED → **GND**

Ubah pin di `sketch.ino` (`TV_STATUS_LED_PIN`) dan `diagram.json` jika memindahkan LED.

## Konfigurasi default device

Edit di bagian atas `sketch.ino` jika ingin menyesuaikan mapping:

```cpp
const char* TV_DEVICE_ID = "TV-WOKWI-001";
const char* ROOM_ID = "ROOM-001";
```

## Batasan fase ini

- **Tidak** terhubung ke Google Apps Script / dashboard secara langsung.
- **Tidak** menggantikan `control_type=mock` di backend.
- **Tidak** membuktikan TV fisik nyala/mati — hanya simulasi LED di Wokwi.
- Integrasi HTTP/MQTT ke middleware akan masuk fase hardware berikutnya.

## Checklist PASS lokal

- [ ] Simulasi Wokwi start tanpa error
- [ ] `power_on` → LED menyala
- [ ] `power_off` → LED mati
- [ ] `test` → LED berkedip lalu mati
- [ ] `status` menampilkan `tv_device_id`, `room_id`, `tv_action`
- [ ] Command JSON dengan `tv_action` berfungsi