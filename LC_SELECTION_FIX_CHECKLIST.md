# ✅ LC Selection Fix - Implementation Checklist

## 📋 Summary
- **Issue**: Tombol "Pilih LC" (ungu) tidak muncul di room card saat status `occupied`
- **Root Cause**: Backend API `getRooms()` tidak mengembalikan field `lc_ids`
- **Fix**: Tambah field `lc_ids` ke return object di function `getRooms_()`
- **Status**: ✅ **FIXED**
- **Difficulty**: SIMPLE (1 line code)
- **Files Changed**: 1 file (apps-script/Code.gs)

---

## 🔧 Changes Applied

### File: `apps-script/Code.gs`
**Function**: `getRooms_()` (baris 921-950)

**Change**: Added `lc_ids: room.lc_ids || "",` to return object

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

## 📝 Verification Checklist (PRE-DEPLOYMENT)

Sebelum deploy Google Apps Script:

- [ ] Baca audit report di `LC_SELECTION_AUDIT_REPORT.md`
- [ ] Verify file `apps-script/Code.gs` sudah di-edit
- [ ] Confirm perubahan hanya pada function `getRooms_()`
- [ ] Pastikan tidak ada syntax error (test compile di GAS)

---

## 🚀 Deployment Checklist

1. **Update Google Apps Script**
   - [ ] Buka [Google Apps Script Editor](https://script.google.com)
   - [ ] Buka project yang bound dengan karaoke spreadsheet
   - [ ] Paste/copy isi file `apps-script/Code.gs` yang sudah diupdate
   - [ ] Run test deploy: `Ctrl + S` untuk save, atau run function test
   - [ ] Deploy as "New Deployment" atau update existing Web App
   - [ ] Copy deployment URL (untuk verify)

2. **Verify Deployment**
   - [ ] Confirm URL di `js/config.js` points to correct GAS deployment
   - [ ] Test health check: buka di browser `{GAS_URL}?action=health`
   - [ ] Verify response OK

3. **Clear Browser Cache**
   - [ ] Open aplikasi: `http://localhost:5500`
   - [ ] Hard refresh: `Ctrl + Shift + R`
   - [ ] Clear LocalStorage jika perlu: Open DevTools → Application → Clear storage

---

## ✅ Testing Checklist (POST-DEPLOYMENT)

### Pre-Test Setup
- [ ] Hard refresh aplikasi: `Ctrl + Shift + R`
- [ ] Logout dan login kembali sebagai Kasir
- [ ] Pastikan tidak ada room yang sedang `occupied` (start dengan clean state)

### Test Flow
1. **Create Room Session with LC**
   - [ ] Click room card (status `available`)
   - [ ] Form appears: duration selection
   - [ ] Fill "Nama Pelanggan" (optional)
   - [ ] **Select "Jumlah LC = 2 Orang"** ← CRITICAL STEP
   - [ ] Select duration (e.g., "1 jam")
   - [ ] Click "Simpan Booking"

2. **Verify Room Status Changed**
   - [ ] Room card updates to status `waiting_payment`
   - [ ] Room moves to "Menunggu Pembayaran" section

3. **Process Payment**
   - [ ] Payment form appears
   - [ ] Click payment button ("Bayar - Mulai Sesi" or similar)
   - [ ] Verify payment processed

4. **Verify Room Occupied State**
   - [ ] Room status changes to `occupied`
   - [ ] Room card shows:
     - [ ] Room name
     - [ ] Status badge "Occupied"
     - [ ] Room timer/countdown

5. **🎯 CRITICAL TEST: Check "Pilih LC" Button**
   - [ ] Room actions area shows 3 buttons:
     - [ ] "Selesai" (complete session)
     - [ ] "Tambah Waktu" (extend duration)
     - [ ] **"Pilih LC" (PURPLE/UNGU)** ← THIS MUST APPEAR ✅
   - [ ] Button is visible and clickable
   - [ ] Button color is purple (#7c3aed)

6. **Test LC Selection Modal**
   - [ ] Click "Pilih LC" button
   - [ ] Modal overlay appears with:
     - [ ] Title: "Pilih LC untuk [Room Name]"
     - [ ] Counter: "Terpilih: 0 / 2 orang"
     - [ ] List of available LCs with checkboxes
     - [ ] Save and Cancel buttons
   - [ ] Select LC from list (checkboxes)
   - [ ] Counter updates: "Terpilih: 1 / 2 orang"
   - [ ] Can select up to 2 LCs (matching booked count)
   - [ ] Cannot select more than 2 (over limit = error)
   - [ ] Click "Simpan Pilihan"
   - [ ] Success message appears
   - [ ] Modal closes

7. **Verify Data Persisted**
   - [ ] Hard refresh: `Ctrl + Shift + R`
   - [ ] Room still shows "Pilih LC" button
   - [ ] Button still clickable (data persisted to database)

### Regression Tests
- [ ] Room without LC (Jumlah LC = 0) does NOT show "Pilih LC" button
- [ ] "Tambah Waktu" button still works
- [ ] "Selesai" button functionality unchanged
- [ ] Other room operations (F&B order, etc.) still work
- [ ] No console errors during room operations

---

## 🔍 DevTools Verification (Optional)

Jalankan di browser Console setelah deployment:

```javascript
// 1. Verify API returns lc_ids
fetch('YOUR_GAS_URL?action=getRooms')
  .then(r => r.json())
  .then(data => {
    const room = data.rooms.find(r => r.status === 'occupied');
    console.log("✅ room.lc_ids:", room?.lc_ids);
    console.log("✅ Should show button:", !!String(room?.lc_ids).trim());
  });

// 2. Verify button in DOM
const lcButton = document.querySelector('[data-action="show-lc-selection"]');
console.log("✅ Button exists:", !!lcButton);
console.log("✅ Button visible:", lcButton?.offsetHeight > 0);
```

---

## 📊 Acceptance Criteria

| Criteria | Expected | Status |
|----------|----------|--------|
| API returns `lc_ids` field | YES | [ ] |
| "Pilih LC" button appears for `occupied` room with LC | YES | [ ] |
| "Pilih LC" button does NOT appear if LC = 0 | YES | [ ] |
| Clicking button opens LC selection modal | YES | [ ] |
| Can select LC from modal | YES | [ ] |
| Data persists after refresh | YES | [ ] |
| No console errors | CLEAN | [ ] |
| No regression in other features | OK | [ ] |

---

## 🐛 Troubleshooting

### Issue: Tombol masih tidak muncul
**Checklist**:
- [ ] Google Apps Script sudah di-deploy (check deployment URL aktif)
- [ ] Browser cache cleared (`Ctrl + Shift + R`)
- [ ] API URL di `config.js` correct
- [ ] Room benar-benar status `occupied` (bukan `waiting_payment`)
- [ ] LC count > 0 saat create session

**Debug**:
```javascript
// Run di console
console.log("Room:", rooms.find(r => r.status === 'occupied'));
console.log("API URL:", API_BASE_URL);
```

### Issue: Button appears tapi modal tidak muncul
- [ ] LC Master data exists di spreadsheet
- [ ] LC status = "active"
- [ ] Check console for error messages
- [ ] Verify `showLcSelection()` function called

### Issue: Button clickable but no response
- [ ] Check event listener `show-lc-selection` di app.js
- [ ] Verify no console errors
- [ ] Try hard refresh

---

## 📚 Related Documentation

- **Audit Report**: `LC_SELECTION_AUDIT_REPORT.md`
- **DevTools Guide**: `LC_SELECTION_DEVTOOLS_TRACE.md`
- **Frontend Code**: `js/app.js` (createRoomCard function, ~baris 4901)
- **Backend Code**: `apps-script/Code.gs` (getRooms_ function, baris 921)

---

## 🎯 Sign-Off

- [ ] Fix implemented and code reviewed
- [ ] Changes deployed to production
- [ ] All tests passed
- [ ] No regressions detected
- [ ] Stakeholders informed

**Date Deployed**: ________________  
**Deployed By**: ________________  
**Verified By**: ________________  

---

