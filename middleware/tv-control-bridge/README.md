# Local TV Middleware Bridge

Middleware lokal berbasis **Node.js + Express** untuk Fase 7A-2 Karaoke Management System.

Server ini menerima command TV via HTTP sebagai jembatan awal sebelum integrasi Home Assistant atau hardware asli.

## Penting

- Middleware ini **masih simulator lokal** — bukan production.
- **Belum** terhubung ke Home Assistant.
- **Belum** terhubung ke hardware fisik (ESP32, smart plug, IR blaster).
- **Belum** terintegrasi ke dashboard frontend atau Google Apps Script pada fase ini.
- Response `result: "sent"` berarti command diterima middleware, **bukan** bukti TV fisik benar-benar menyala atau mati.

## Prasyarat

- Node.js 18 atau lebih baru
- npm

## Instalasi

```powershell
cd "F:\karaoke management system\middleware\tv-control-bridge"
npm install
```

## Menjalankan server

```powershell
npm start
```

Server berjalan di:

```text
http://localhost:3030
```

## Endpoint

### GET /health

Response:

```json
{
  "success": true,
  "service": "tv-control-bridge",
  "status": "ok"
}
```

### POST /tv-command

Payload:

```json
{
  "room_id": "ROOM-001",
  "tv_device_id": "TV-001",
  "tv_action": "power_on",
  "trigger_source": "manual_test",
  "requested_by": "Admin"
}
```

Field wajib: `room_id`, `tv_device_id`, `tv_action`.

`tv_action` valid:

| Value | Deskripsi |
| --- | --- |
| `test` | Command test |
| `power_on` | Command power on |
| `power_off` | Command power off |

Field opsional: `trigger_source`, `requested_by` (dicatat di log jika dikirim, tidak wajib untuk validasi).

## Perilaku simulasi

| Kondisi | Hasil |
| --- | --- |
| Device normal (`TV-001`, dll.) | `success: true`, `result: "sent"` |
| `tv_device_id = TV-FAIL` | `success: false`, `result: "failed"`, `block_reason: TV_DEVICE_OFFLINE` |
| `tv_device_id = TV-TIMEOUT` | Delay ~5 detik, lalu `success: false`, `result: "timeout"`, `block_reason: TV_DEVICE_TIMEOUT` |
| `tv_action` tidak valid | `success: false`, `block_reason: INVALID_TV_ACTION` |
| Payload kurang field wajib | `success: false`, `block_reason: VALIDATION_ERROR` |

## Contoh test PowerShell

Buka terminal baru (server harus sudah `npm start`):

### Health

```powershell
Invoke-RestMethod -Method GET -Uri "http://localhost:3030/health"
```

### Command success

```powershell
Invoke-RestMethod -Method POST -Uri "http://localhost:3030/tv-command" -ContentType "application/json" -Body '{"room_id":"ROOM-001","tv_device_id":"TV-001","tv_action":"power_on","trigger_source":"manual_test","requested_by":"Admin"}'
```

### Simulasi failed

```powershell
Invoke-RestMethod -Method POST -Uri "http://localhost:3030/tv-command" -ContentType "application/json" -Body '{"room_id":"ROOM-002","tv_device_id":"TV-FAIL","tv_action":"power_off","trigger_source":"manual_test","requested_by":"Admin"}'
```

### Invalid action

```powershell
Invoke-RestMethod -Method POST -Uri "http://localhost:3030/tv-command" -ContentType "application/json" -Body '{"room_id":"ROOM-001","tv_device_id":"TV-001","tv_action":"volume_up","trigger_source":"manual_test","requested_by":"Admin"}'
```

### Simulasi timeout (~5 detik)

```powershell
Invoke-RestMethod -Method POST -Uri "http://localhost:3030/tv-command" -ContentType "application/json" -Body '{"room_id":"ROOM-003","tv_device_id":"TV-TIMEOUT","tv_action":"test","trigger_source":"manual_test","requested_by":"Admin"}' -TimeoutSec 15
```

Gunakan `-TimeoutSec 15` karena server sengaja menunggu ~5 detik sebelum mengembalikan respons `result: "timeout"`. HTTP status tetap `200` agar mudah diuji; delay inilah simulasi timeout-nya.

## CORS

Diizinkan untuk development lokal:

- Origin: `localhost` / `127.0.0.1` (dengan port apa pun)
- Method: `GET`, `POST`
- Header: `Content-Type`

## Logging

Setiap command TV dicatat ke console:

```text
[2026-06-22T21:00:00.000Z] room_id=ROOM-001 tv_device_id=TV-001 tv_action=power_on result=sent
```

## Langkah berikutnya (belum fase ini)

- Hubungkan Apps Script `sendTvCommand` ke `middleware_url` device
- Integrasi Home Assistant atau hardware Wokwi/ESP32
- Deploy middleware ke environment non-lokal