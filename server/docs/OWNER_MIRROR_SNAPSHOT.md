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
