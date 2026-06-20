# Panduan clasp untuk Apps Script

Panduan ini dipakai untuk menghubungkan folder lokal `apps-script/` ke project Google Apps Script yang sudah ada.

## Login

Jalankan:

```bash
clasp login
```

## Hubungkan Folder Lokal

1. Buka Apps Script Project Settings.
2. Salin Script ID dari project Apps Script.
3. Buat file `.clasp.json` di folder `apps-script/`.
4. Isi file tersebut dengan:

```json
{
  "scriptId": "PASTE_SCRIPT_ID_DI_SINI",
  "rootDir": "."
}
```

Jangan masukkan Script ID asli ke dokumentasi publik.

## Perintah Harian

Jalankan semua perintah dari folder `apps-script/`, bukan dari root project.

```bash
clasp status
clasp push
clasp open
```

## Deploy Otomatis Web App

Gunakan `deploy.ps1` untuk push perubahan Apps Script, membuat version baru, lalu memperbarui deployment production/versioned yang sudah ada. Script ini tidak memakai deployment `@HEAD` dan tidak membuat deployment baru tanpa deployment ID.

Contoh:

```powershell
cd "F:\KARAOKE MANAGEMENT SYSTEM\apps-script"
.\deploy.ps1 "Fase 3E - Riwayat Transaksi Hari Ini"
```

Jika deskripsi tidak diisi, script memakai default `Deploy update`.

Alur yang dijalankan:

```powershell
clasp status
clasp push --force
clasp create-version "<description>"
clasp create-deployment --deploymentId "<PRODUCTION_DEPLOYMENT_ID>" --versionNumber <version> --description "<description>"
```

Deployment ID production yang dipakai:

```text
AKfycbzYoO2LkCAG0fUBKMjAv7uI9RkANiW795Dj_DdlFO4omvW3Btt3MEEI7kW8bOgg1ve1
```

Catatan:

- Jalankan script ini hanya jika ada perubahan di `apps-script/Code.gs` atau `appsscript.json`.
- Jika hanya mengubah frontend (`js`, `css`, atau `index.html`), tidak perlu menjalankan deploy Apps Script.
- Deployment ID production harus dipertahankan agar URL Web App tidak berubah.
- Jika deployment ID production berubah, update nilai `$ProductionDeploymentId` di `deploy.ps1`.
- Jangan mengubah `.clasp.json` untuk menjalankan script ini.

## Catatan Penting

- Jalankan command dari folder `apps-script/`, bukan root project.
- Jangan commit `.clasp.json` jika berisi Script ID asli, atau masukkan ke `.gitignore` jika project akan dipublish.
- Untuk perubahan backend, gunakan `deploy.ps1` agar version dan deployment production diperbarui tanpa redeploy manual dari UI Apps Script.
