# 🛠️ DevTools Debugging Guide - LC Selection Issue

**Cara trace masalah LC Selection dengan browser DevTools**

---

## Step-by-Step Trace (Sebelum/Sesudah Fix)

### 1. Open Developer Tools
- **Windows/Linux**: `F12` atau `Ctrl + Shift + I`
- **Mac**: `Cmd + Option + I`
- Tab ke **Console** dan **Network**

---

### 2. Trace Network Call - getRooms API

#### A. Setup Network Monitor
1. Buka **Console** tab
2. Buka **Network** tab (clear history jika ada)
3. Atur filter: Cari `getRooms`

#### B. Trigger API Call
1. Buka aplikasi di `http://localhost:5500`
2. Hard refresh: `Ctrl + Shift + R`
3. Login sebagai Kasir
4. Amati Network tab - carilah request ke API dengan pattern `action=getRooms`

#### C. Inspect Response
1. Klik request `getRooms` di Network tab
2. Tab ke **Response**
3. Lihat JSON response, cari field-field room:
   ```json
   {
     "ok": true,
     "rooms": [
       {
         "room_id": "R001",
         "room_name": "Room 1",
         "status": "occupied",
         "customer_name": "John Doe",
         "package_id": "",
         // ❌ BEFORE FIX: "lc_ids" TIDAK ADA
         // ✅ AFTER FIX: "lc_ids": "PENDING,PENDING"
       },
       // ... room lainnya
     ]
   }
   ```

---

### 3. Trace JavaScript Execution - Check room.lc_ids

#### A. Open Console
Tab ke **Console**, paste code berikut:
```javascript
// Check nilai room di memory (asumsi room 'occupied' ada)
console.log("All rooms:", rooms);

// Filter room yang status = occupied
const occupiedRoom = rooms.find(r => r.status === 'occupied');
console.log("Occupied room:", occupiedRoom);

// Check lc_ids field
if (occupiedRoom) {
  console.log("room.lc_ids:", occupiedRoom.lc_ids);
  console.log("lcIds (trimmed):", String(occupiedRoom.lc_ids || "").trim());
  console.log("if (lcIds) evaluates to:", !!String(occupiedRoom.lc_ids || "").trim());
}
```

#### B. Expected Output

**❌ BEFORE FIX**:
```javascript
Occupied room: {room_id: "R001", room_name: "Room 1", status: "occupied", …}
room.lc_ids: undefined  // ← MASALAH!
lcIds (trimmed): ""
if (lcIds) evaluates to: false  // ← Kondisi FALSE, tombol tidak render
```

**✅ AFTER FIX**:
```javascript
Occupied room: {room_id: "R001", room_name: "Room 1", status: "occupied", …}
room.lc_ids: "PENDING,PENDING"  // ← FIXED!
lcIds (trimmed): "PENDING,PENDING"
if (lcIds) evaluates to: true  // ← Kondisi TRUE, tombol render!
```

---

### 4. Trace DOM - Check Button Element

#### A. Open Elements/Inspector
1. Tab ke **Elements** atau **Inspector**
2. Hard refresh page (`Ctrl + Shift + R`)
3. Klik "Select Element" tool (atau `Ctrl + Shift + C`)
4. Klik pada room card yang status `occupied`

#### B. Find Room Actions Container
Di Elements tab, cari HTML structure:
```html
<div class="room-card">
  <!-- ... room header dan meta info ... -->
  <div class="room-actions room-actions-occupied">
    <button class="room-button" data-action="toggle-session">Selesai</button>
    <button class="room-button room-button-extend" data-action="show-extend-selection">Tambah Waktu</button>
    <!-- ❌ BEFORE FIX: Button "Pilih LC" TIDAK ADA -->
    <!-- ✅ AFTER FIX: Button ini harus ada -->
    <button class="room-button room-button-lc" data-action="show-lc-selection">Pilih LC</button>
  </div>
</div>
```

#### C. Check Button Visibility
- **❌ BEFORE**: Hanya ada 2 buttons (Selesai, Tambah Waktu)
- **✅ AFTER**: Ada 3 buttons, termasuk "Pilih LC" (warna ungu #7c3aed)

---

### 5. Trace Code Execution - Set Breakpoint

#### A. Open Sources Tab
1. Tab ke **Sources** di DevTools
2. `Ctrl + P` untuk open file picker
3. Search: `app.js`
4. Open file `js/app.js`

#### B. Set Breakpoint di createRoomCard function
1. Cari line ~4901 (fungsi createRoomCard)
2. Klik line number untuk set breakpoint pada:
   ```javascript
   const lcIds = String(room.lc_ids || "").trim();
   ```

#### C. Trigger Breakpoint
1. Refresh page atau trigger room render
2. Debugger akan pause di breakpoint
3. Check values di **Scope** section:
   - `room` object - amati field `lc_ids`
   - `lcIds` variable - harusnya string, bukan empty
   - Hover over `room.lc_ids` untuk lihat value

#### D. Step Through Code
- **F10** (Step over) untuk step next line
- Observe kondisi `if (lcIds)` di line ~4902:
  - **❌ BEFORE**: Kondisi FALSE (tidak enter block)
  - **✅ AFTER**: Kondisi TRUE (enter block, render button)

---

### 6. Console Commands untuk Quick Debug

**Paste di Console untuk quick diagnostics**:

```javascript
// 1. Check room data dari API
console.group("🔍 Room Data Debug");
const room = rooms.find(r => r.status === 'occupied');
console.table({
  "Room ID": room?.room_id,
  "Room Name": room?.room_name,
  "Status": room?.status,
  "LC IDs": room?.lc_ids,
  "LC IDs exists": room?.hasOwnProperty('lc_ids'),
  "LC IDs is empty string": room?.lc_ids === "",
  "LC IDs is undefined": room?.lc_ids === undefined,
});
console.groupEnd();

// 2. Check if button should render
console.group("🎯 Button Render Logic");
const lcIds = String(room?.lc_ids || "").trim();
console.log("lcIds value:", lcIds);
console.log("lcIds truthy:", !!lcIds);
console.log("Should render button:", !!lcIds);
console.groupEnd();

// 3. Check actual DOM button
console.group("📍 DOM Button Status");
const roomCard = document.querySelector(`[data-room-id="${room?.room_id}"]`);
const lcButton = roomCard?.querySelector('[data-action="show-lc-selection"]');
console.log("Room card found:", !!roomCard);
console.log("LC button found:", !!lcButton);
console.log("LC button visible:", lcButton?.offsetHeight > 0);
console.groupEnd();
```

**Output Example**:

❌ **BEFORE FIX**:
```
🔍 Room Data Debug
┌─────────────────────┬──────────────┐
│ Room ID             │ R001         │
│ Room Name           │ Room 1       │
│ Status              │ occupied     │
│ LC IDs              │              │ ← EMPTY!
│ LC IDs exists       │ false        │
│ LC IDs is empty str │ false        │
│ LC IDs is undefined │ true         │
└─────────────────────┴──────────────┘

🎯 Button Render Logic
lcIds value: ""
lcIds truthy: false
Should render button: false

📍 DOM Button Status
Room card found: true
LC button found: false
LC button visible: false
```

✅ **AFTER FIX**:
```
🔍 Room Data Debug
┌─────────────────────┬──────────────────┐
│ Room ID             │ R001             │
│ Room Name           │ Room 1           │
│ Status              │ occupied         │
│ LC IDs              │ PENDING,PENDING  │ ← FIXED!
│ LC IDs exists       │ true             │
│ LC IDs is empty str │ false            │
│ LC IDs is undefined │ false            │
└─────────────────────┴──────────────────┘

🎯 Button Render Logic
lcIds value: "PENDING,PENDING"
lcIds truthy: true
Should render button: true

📍 DOM Button Status
Room card found: true
LC button found: true
LC button visible: true
```

---

### 7. Check CSS Styling (Optional)

Jika button ada tapi tidak terlihat:

```javascript
// Check button styling
const lcButton = document.querySelector('[data-action="show-lc-selection"]');
console.log("Button styles:");
console.log("Display:", window.getComputedStyle(lcButton).display);
console.log("Background Color:", window.getComputedStyle(lcButton).backgroundColor);
console.log("Color:", window.getComputedStyle(lcButton).color);
console.log("Visibility:", window.getComputedStyle(lcButton).visibility);
console.log("Opacity:", window.getComputedStyle(lcButton).opacity);
console.log("Disabled attr:", lcButton.disabled);
```

---

## 🎯 Expected Results After Fix

| Test | Before Fix | After Fix |
|------|-----------|-----------|
| API response includes `lc_ids` | ❌ NO | ✅ YES |
| `room.lc_ids` is defined | ❌ undefined | ✅ "PENDING,PENDING" |
| `if (lcIds)` condition | ❌ FALSE | ✅ TRUE |
| "Pilih LC" button rendered | ❌ NO | ✅ YES |
| "Pilih LC" button visible | ❌ NO | ✅ YES (ungu #7c3aed) |
| Can click "Pilih LC" button | ❌ NO | ✅ YES |
| LC selection modal appears | ❌ NO | ✅ YES |

---

## 🚨 Troubleshooting

### Masalah: Tombol masih tidak muncul setelah fix

**Possible Causes**:
1. **Changes not deployed**: Google Apps Script belum di-deploy
   - Solution: Deploy ulang dari GAS editor
2. **Browser cache**: Cached version masih loaded
   - Solution: `Ctrl + Shift + R` (hard refresh)
3. **Wrong spreadsheet**: Connect ke spreadsheet yang salah
   - Solution: Check `API_BASE_URL` di `js/config.js`

**Debug Command**:
```javascript
console.log("API URL:", API_BASE_URL);
// Verify it points to correct Google Apps Script deployment
```

### Masalah: Tombol muncul tapi modal tidak muncul saat diklik

**Check**:
1. Pastikan ada LC master data di sheet "LcMaster"
2. Check console untuk error messages
3. Verify status LC adalah "active" dan availability bukan "busy"

```javascript
// Di console
fetch(`${API_BASE_URL}?action=getLcs`)
  .then(r => r.json())
  .then(d => console.table(d.lcs));
```

---

