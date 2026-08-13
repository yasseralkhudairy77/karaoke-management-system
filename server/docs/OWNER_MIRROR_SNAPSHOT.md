# Owner Mirror Snapshot Sementara

Fitur ini adalah fondasi mirroring read-only untuk owner/manager sebelum cloud permanen disiapkan.

Tujuan:
- PC kasir tetap menjadi server utama operasional lokal.
- Owner mendapat snapshot ringkasan tanpa mengubah data kasir.
- Payload snapshot ini nanti bisa dikirim otomatis ke cloud/Railway.

Endpoint lokal:

```text
GET http://localhost:3000/exec?action=getOwnerMirrorSnapshot
```

Contoh periode:

```text
GET http://localhost:3000/exec?action=getOwnerMirrorSnapshot&period=today
GET http://localhost:3000/exec?action=getOwnerMirrorSnapshot&period=yesterday
GET http://localhost:3000/exec?action=getOwnerMirrorSnapshot&period=last7days
```

Export JSON dari PC server:

```powershell
cd "C:\HappySong\happy-song-local\server"
npm.cmd run mirror:snapshot
```

Output default:

```text
C:\HappySong\happy-song-local\server\mirror\owner-snapshot.json
```

Isi snapshot:
- ringkasan omzet transaksi;
- status room;
- open F&B aktif;
- transaksi periode operasional;
- closing kasir;
- status sync outbox lokal.

Catatan keamanan:
- Snapshot ini read-only.
- Jangan membuka akses publik ke PC kasir sebelum autentikasi/cloud mirror permanen siap.

## Mode Railway Sementara

Arsitektur sementara:

```text
PC Kasir Lokal
  -> build snapshot dari PostgreSQL lokal
  -> push ke Railway pakai OWNER_MIRROR_TOKEN
  -> Railway menyimpan snapshot terakhir
  -> Owner membuka endpoint Railway read-only
```

Variable di Railway app service:

```text
DATABASE_URL=${{Postgres.DATABASE_URL}}
OWNER_MIRROR_MODE=cloud
OWNER_MIRROR_TOKEN=<buat token rahasia yang sama dengan PC kasir>
OWNER_MIRROR_SOURCE_ID=happy-song-local
DISABLE_SYNC_WORKER=1
```

Variable di PC kasir lokal:

```text
OWNER_MIRROR_MODE=local
OWNER_MIRROR_CLOUD_URL=https://<domain-railway>/exec
OWNER_MIRROR_TOKEN=<token rahasia yang sama dengan Railway>
OWNER_MIRROR_SOURCE_ID=happy-song-local
OWNER_MIRROR_PUSH_INTERVAL_MS=60000
```

Test push manual dari PC kasir:

```powershell
cd "C:\HappySong\happy-song-local\server"
npm.cmd run mirror:push
```

Test status worker lokal:

```powershell
Invoke-RestMethod "http://localhost:3000/sync/status"
```

Test dari internet setelah Railway deploy:

```text
https://<domain-railway>/exec?action=getOwnerMirrorSnapshot
```

Jika `has_snapshot=false`, artinya Railway sudah hidup tapi belum menerima push dari PC kasir.
