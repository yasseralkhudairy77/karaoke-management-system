# 🔍 Audit Report: Tombol "Pilih LC" Tidak Muncul

**Status**: ✅ ROOT CAUSE IDENTIFIED & FIXED  
**Date**: July 23, 2026  
**Issue**: Tombol "Pilih LC" (ungu) tidak muncul di room card saat status `occupied` dan Jumlah LC > 0

---

## 📊 Alur Diagnosis (1-3)

### Step 1: Verifikasi Frontend Data Flow ✅
**Location**: `js/app.js` - `prepareRoomSession()` function (baris 13510-13550)

**Hasil**: Frontend **BENAR** mengirim LC data:
```javascript
const activeLcIds = (selectedLcIdsForRoom[roomId] || []).join(",");
await prepareRoomSession(roomId, durationMinutes, customerNameInput, "", activeLcIds);
// Output example: "PENDING,PENDING" untuk 2 orang LC
```

**Kesimpulan**: ✅ Frontend tidak ada masalah

---

### Step 2: Verifikasi Backend Data Processing ✅
**Location**: `apps-script/Code.gs` - `prepareRoomSession_()` function (baris 7020-7160)

**Hasil**: Backend **BENAR** menerima dan menyimpan LC data:
```javascript
var lcIds = String(request.lc_ids || "").trim();
// ... validasi LC
var session = {
  // ... field lainnya
  lc_ids: lcIds,  // ✅ Disimpan ke RoomSessions sheet
};
appendRoomSession_(session);
```

**Kesimpulan**: ✅ Backend tidak ada masalah pada penyimpanan

---

### Step 3: 🔴 ROOT CAUSE FOUND - API Return Data ❌
**Location**: `apps-script/Code.gs` - `getRooms_()` function (baris 921-950)

**Masalah**: Function `getRooms_()` **TIDAK mengembalikan field `lc_ids`**

**Before (BUGGY)**:
```javascript
return readSheetAsObjects_("Rooms").map(function (room) {
  return {
    room_id: room.room_id || "",
    room_name: room.room_name || "",
    status: room.status || "",
    // ... field lainnya
    customer_name: room.customer_name || "",
    package_id: room.package_id || "",
    // ❌ MISSING: lc_ids tidak ada!
  };
});
```

**After (FIXED)**:
```javascript
return readSheetAsObjects_("Rooms").map(function (room) {
  return {
    room_id: room.room_id || "",
    room_name: room.room_name || "",
    status: room.status || "",
    // ... field lainnya
    customer_name: room.customer_name || "",
    package_id: room.package_id || "",
    lc_ids: room.lc_ids || "",  // ✅ DITAMBAHKAN
  };
});
```

---

## 🎯 Alasan Tombol Tidak Muncul

Frontend code di `js/app.js` (baris 4901-4905):
```javascript
const lcIds = String(room.lc_ids || "").trim();  // ← Nilai kosong karena API tidak return
if (lcIds) {
  actions.append(sessionButton, extendButton, selectLcButton);  // ❌ Kondisi FALSE
} else {
  actions.append(sessionButton, extendButton);  // ✅ Hanya button ini yang di-render
}
```

**Alur masalah**:
1. ✅ User memilih "Jumlah LC = 2 Orang" di form check-in
2. ✅ Data `["PENDING", "PENDING"]` dikirim ke backend via `prepareRoomSession()`
3. ✅ Backend menyimpan ke database sebagai `lc_ids = "PENDING,PENDING"`
4. ❌ API `getRooms()` tidak mengembalikan field `lc_ids`
5. ❌ Frontend menerima `room.lc_ids = undefined`
6. ❌ Kondisi `if (lcIds)` gagal
7. ❌ Tombol "Pilih LC" **tidak pernah di-render**

---

## ✅ Fix yang Diterapkan

**File**: `apps-script/Code.gs`  
**Function**: `getRooms_()` (baris 921-950)  
**Change**: Tambahkan field `lc_ids` ke return object

```diff
  return {
    room_id: room.room_id || "",
    room_name: room.room_name || "",
    status: room.status || "",
    start_time: room.start_time || null,
    booked_duration_minutes: Number(room.booked_duration_minutes) || 0,
    scheduled_end_time: room.scheduled_end_time || null,
    rate_per_hour: room.rate_per_hour || 0,
    tv_device_id: room.tv_device_id || "",
    tv_device: buildRoomTvSummary_(room, tvDevice, latestTvLog),
    updated_at: room.updated_at || null,
    customer_name: room.customer_name || "",
    package_id: room.package_id || "",
+   lc_ids: room.lc_ids || "",
  };
```

---

## 🧪 Testing Steps untuk Verifikasi Fix

Setelah deploy perubahan Google Apps Script:

1. **Buka aplikasi** di `http://localhost:5500`
2. **Hard refresh**: `Ctrl + Shift + R`
3. **Login** sebagai Kasir atau Manajer
4. **Buat sesi room baru**:
   - Pilih room yang tersedia
   - Isi Nama Pelanggan (opsional)
   - **Pilih Jumlah LC = 2 Orang** ← PENTING
   - Pilih durasi (misal: 1 jam)
   - Klik "Simpan"
5. **Lakukan pembayaran**
6. **Observasi room card**:
   - Status seharusnya berubah menjadi `occupied`
   - ✅ **Tombol "Pilih LC" (ungu) HARUS MUNCUL** (sebelumnya tidak ada)
   - Tombol "Tambah Waktu" juga muncul
7. **Klik tombol "Pilih LC"**:
   - Modal selection panel harus muncul
   - Pilih LC yang tersedia
   - Klik "Simpan Pilihan"

---

## 📋 Data Flow Summary

### Before Fix (Broken)
```
Frontend Form
    ↓
[Jumlah LC = 2 → ["PENDING", "PENDING"]]
    ↓
POST /api?action=prepareRoomSession
    ↓
Backend: lc_ids = "PENDING,PENDING" ✅ Disimpan
    ↓
GET /api?action=getRooms
    ↓
❌ API Return: { room_id, room_name, status, ... } (NO lc_ids)
    ↓
Frontend: room.lc_ids = undefined
    ↓
❌ if (lcIds) { /* Render Tombol */ } ← Kondisi FALSE
    ↓
❌ Tombol "Pilih LC" TIDAK MUNCUL
```

### After Fix (Working)
```
Frontend Form
    ↓
[Jumlah LC = 2 → ["PENDING", "PENDING"]]
    ↓
POST /api?action=prepareRoomSession
    ↓
Backend: lc_ids = "PENDING,PENDING" ✅ Disimpan
    ↓
GET /api?action=getRooms
    ↓
✅ API Return: { room_id, room_name, status, ..., lc_ids: "PENDING,PENDING" }
    ↓
Frontend: room.lc_ids = "PENDING,PENDING"
    ↓
✅ if (lcIds) { /* Render Tombol */ } ← Kondisi TRUE
    ↓
✅ Tombol "Pilih LC" MUNCUL
```

---

## 📝 Root Cause Analysis

| Aspek | Status | Penyebab |
|-------|--------|---------|
| Frontend mengirim LC data | ✅ OK | Code benar |
| Backend menerima LC data | ✅ OK | Code benar |
| Backend menyimpan LC data | ✅ OK | Code benar |
| **API mengembalikan LC data** | ❌ **BUG** | **Field lc_ids tidak di-include di return object** |
| Frontend menerima LC data | ❌ GAGAL | Akibat dari API tidak return |
| Frontend render tombol LC | ❌ GAGAL | Akibat dari kondisi `if (lcIds)` bernilai FALSE |

**Kesimpulan**: Ini adalah **data mapping bug** di backend API, bukan logic error.

---

## 🚀 Deployment Instructions

1. Copy file `apps-script/Code.gs` yang sudah di-fix
2. Paste ke Google Apps Script project yang bound dengan spreadsheet
3. Deploy ulang sebagai "New Deployment" atau update existing Web App
4. Test dengan steps di section "Testing Steps untuk Verifikasi Fix"

---

## 📊 Impact Assessment

- **Severity**: 🔴 **HIGH** - Feature LC selection completely unavailable
- **Scope**: Room management untuk booking dengan LC
- **Affected Users**: Kasir/Manajer yang ingin assign LC untuk session
- **Fix Complexity**: ✅ **SIMPLE** - Hanya tambah 1 line return field
- **Testing Scope**: ✅ **FOCUSED** - Hanya test room card rendering + LC selection flow

