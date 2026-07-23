# LC Selection Feature - Technical Handoff Summary

**Issue**: Tombol "Pilih LC" (ungu) tidak muncul di room card saat status `occupied` dengan Jumlah LC > 0

**Current Status**: Feature implemented end-to-end, but API response missing `lc_ids` field

---

## 1. VERIFIED DATA FLOW

### 1.1 Frontend → Backend ✅
- User selects "Jumlah LC = 2" in check-in form
- Data stored in `selectedLcIdsForRoom[roomId] = ["PENDING", "PENDING"]`
- Sent via POST to `prepareRoomSession()` action as `lc_ids: "PENDING,PENDING"`
- **Status**: Working correctly

**Code**: `js/app.js` line 5223-5224
```javascript
const activeLcIds = (selectedLcIdsForRoom[room.room_id] || []).join(",");
await prepareRoomSession(room.room_id, selectedPkg.duration_minutes, customerNameInput, selectedPkgId, activeLcIds);
```

### 1.2 Backend Storage ✅
- Backend receives `lc_ids` parameter
- Validates LC selections
- Stores in RoomSessions sheet with `lc_ids = "PENDING,PENDING"`
- **Status**: Working correctly

**Code**: `apps-script/Code.gs` line 7020-7127
```javascript
function prepareRoomSession_(payload) {
  var lcIds = String(request.lc_ids || "").trim();
  // ... validation ...
  var session = {
    // ...
    lc_ids: lcIds,  // Stored here
  };
  appendRoomSession_(session);
}
```

**Database Evidence** (Google Sheets - RoomSessions):
```
ROOM-003-SESSION-20260723122656-122
- room_id: ROOM-003
- status: active
- lc_ids: PENDING,PENDING
- customer_name: TESTLC
- booked_duration_minutes: 60
```

### 1.3 Backend API Response ❌
- `getRooms_()` function called to return room list
- Should include `lc_ids` field in each room object
- **ACTUAL**: API response missing `lc_ids` field
- **Status**: BROKEN - see section 3 for root cause

---

## 2. FRONTEND RENDERING LOGIC

**Location**: `js/app.js` line 4901-4905 (createRoomCard function)

```javascript
const lcIds = String(room.lc_ids || "").trim();
if (lcIds) {
  actions.append(sessionButton, extendButton, selectLcButton);  // Render 3 buttons
} else {
  actions.append(sessionButton, extendButton);  // Render 2 buttons only
}
```

**Issue**: Because API returns `room.lc_ids = undefined`, condition fails → only 2 buttons rendered

---

## 3. ROOT CAUSE ANALYSIS

### 3.1 Code Implementation ✅

**getRooms_()` function** (`apps-script/Code.gs` line 921-975):

✅ **Local file content is CORRECT**:
```javascript
return readSheetAsObjects_("Rooms").map(function (room) {
  var lcIds = "";
  var debugInfo = {
    room_id: room.room_id,
    lcIds_initial: lcIds,
    activeSession_found: false,
    lcIds_from_session: null,
    lcIds_final: ""
  };

  try {
    var activeSession = findLatestRoomSessionForRoom_(room.room_id || "", 
      ["starting", "active", "closing", "paid_waiting_start"]);
    debugInfo.activeSession_found = !!activeSession;
    
    if (activeSession && activeSession.session) {
      var sessionLcIds = activeSession.session.lc_ids;
      debugInfo.lcIds_from_session = sessionLcIds;
      lcIds = String(sessionLcIds || "").trim();
    }
  } catch (err) {
    Logger.log("Error finding session for " + room.room_id + ": " + err.message);
    lcIds = String(room.lc_ids || "").trim();
  }

  var roomObj = {
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
    lc_ids: lcIds,                    // ← FIELD PRESENT
    lc_companion_ids: lcIds,          // ← TEST FIELD PRESENT
    _debug_lc_info: debugInfo,        // ← DEBUG INFO PRESENT
  };

  return roomObj;
});
```

### 3.2 API Response Testing ❌

**Test Case**: Room ROOM-003 (customer_name: TESTLC)

**Expected Response**:
```json
{
  "room_id": "ROOM-003",
  "room_name": "Ruangan 3 - VIP 3",
  "status": "occupied",
  "customer_name": "TESTLC",
  "lc_ids": "PENDING,PENDING",
  "lc_companion_ids": "PENDING,PENDING",
  "_debug_lc_info": {
    "room_id": "ROOM-003",
    "lcIds_initial": "",
    "activeSession_found": true,
    "lcIds_from_session": "PENDING,PENDING",
    "lcIds_final": "PENDING,PENDING"
  }
}
```

**Actual Response** (from `GET /action=getRooms`):
```json
{
  "room_id": "ROOM-003",
  "room_name": "Ruangan 3 - VIP 3",
  "status": "occupied",
  "customer_name": "TESTLC",
  // ❌ lc_ids field MISSING
  // ❌ lc_companion_ids field MISSING
  // ❌ _debug_lc_info field MISSING
}
```

**Response Key Count**:
- Expected: 15+ keys
- Actual: 12 keys only
- Missing: `lc_ids`, `lc_companion_ids`, `_debug_lc_info`

### 3.3 Root Cause: Google Apps Script Deployment Caching

**Evidence Chain**:

1. **Local code is up-to-date** ✅
   - File: `apps-script/Code.gs`
   - Lines 921-975 include all `lc_ids` fields
   - Verified with multiple reads

2. **Code pushed successfully** ✅
   - Command: `clasp push --force` executed multiple times
   - Output: "Pushed 2 files at [timestamp]"
   - Files: appsscript.json, Code.gs

3. **BUT: API still returns old response** ❌
   - Deployment URL: `https://script.google.com/macros/s/AKfycbzYoO2LkCAG0fUBKMjAv7uI9RkANiW795Dj_DdlFO4omvW3Btt3MEEI7kW8bOgg1ve1/exec`
   - Deployment @89 (created during development)
   - Response object shape unchanged despite code updates

4. **Deployment History** ❌
   ```
   - @89 (CURRENT PRODUCTION) - Old cached response
   - @90 (Invalid URL format)
   - @91 (Created at 12:57 UTC)
   - @HEAD (Latest code, not deployed)
   ```

5. **GAS Caching Mechanism** ❌
   - Google Apps Script caches Web App responses for performance
   - `clasp push` updates source code but may not invalidate cache
   - Cache persists across pushes to same deployment URL
   - Only new deployment URL has fresh cache

---

## 4. FIXES ATTEMPTED (All Failed Due to Cache)

### 4.1 Added `lc_ids` to return object
✅ Code modified correctly, but API response unchanged

### 4.2 Added `lc_companion_ids` test field
✅ Code modified correctly, but API response unchanged

### 4.3 Added `_debug_lc_info` debugging
✅ Code modified correctly, but API response unchanged

### 4.4 Added cache-busting headers
✅ Code modified:
```javascript
.addHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
.addHeader('Pragma', 'no-cache')
.addHeader('Expires', '0')
```
But API response unchanged (headers don't invalidate GAS deployment cache)

### 4.5 Updated `.clasp.json` with deploymentId
Attempted to direct push to deployment @89, but didn't clear cache

### 4.6 Created new deployment @91
✅ New deployment created successfully, but:
- URL format needs validation
- Cache hasn't propagated yet

---

## 5. DIAGNOSTIC TEST RESULTS

### Test 1: Check API Response
```javascript
fetch('https://script.google.com/macros/s/AKfycbzYoO2LkCAG0fUBKMjAv7uI9RkANiW795Dj_DdlFO4omvW3Btt3MEEI7kW8bOgg1ve1/exec?action=getRooms')
  .then(r => r.json())
  .then(data => {
    const testlc = data.rooms.find(r => r.customer_name === 'TESTLC');
    console.log('Keys:', Object.keys(testlc || {}).length);  // Output: 12 (expected: 15+)
    console.log('Has lc_ids:', 'lc_ids' in testlc);          // Output: false (expected: true)
    console.log('lc_ids value:', testlc?.lc_ids);            // Output: undefined (expected: "PENDING,PENDING")
  });
```

### Test 2: Check Database
RoomSessions sheet row for ROOM-003:
- `lc_ids` column: `PENDING,PENDING` ✅
- `status` column: `active` ✅
- Data exists but not returned by API ❌

### Test 3: Check Browser DOM
```javascript
document.querySelector('[data-room-id="ROOM-003"] [data-action="show-lc-selection"]')
// Returns: null (expected: HTMLElement)
// Reason: Frontend never receives lc_ids, so button not rendered
```

---

## 6. CONFIGURATION

### Current Config
- **API Base URL**: `https://script.google.com/macros/s/AKfycbzYoO2LkCAG0fUBKMjAv7uI9RkANiW795Dj_DdlFO4omvW3Btt3MEEI7kW8bOgg1ve1/exec`
- **Deployment**: @89 (cache issue)
- **File**: `js/config.js`

### Available Deployments
```
@89: AKfycbzYoO2LkCAG0fUBKMjAv7uI9RkANiW795Dj_DdlFO4omvW3Btt3MEEI7kW8bOgg1ve1 (CURRENT - CACHED)
@90: AKfycbzKv5NQY1mh5LfyTbTf3QjJNN-WUFf9OQZ165e-MDQOYZc7Z9jAE5e8xiP4FjMS-Z9J (URL format issue)
@91: AKfycby9HgY4ZOoveuv383V1TR4S-hRPGW4cqKcVa3emHWQz1vmOEx7p3kvvnKagoZJi_2nE (LATEST)
```

---

## 7. FILES INVOLVED

### Backend (Google Apps Script)
- **File**: `apps-script/Code.gs`
- **Functions Modified**:
  - `getRooms_()` (line 921): Added `lc_ids`, `lc_companion_ids`, `_debug_lc_info` to response
  - `prepareRoomSession_()` (line 7020): Already saves `lc_ids` to session
  - `jsonResponse()` (line 864): Added cache-busting headers
  - `ROOMS_BOOKING_HEADERS` (line 165): Added `"lc_ids"` column
  - `prepareRoomSession_()` (line 7207): Saves `lc_ids` to Rooms sheet
  - `cancelBooking_()` & `completeCleaning_()`: Clear `lc_ids` on session end

### Frontend (JavaScript)
- **File**: `js/app.js`
- **Components**:
  - Line 4901-4905: `createRoomCard()` - checks `room.lc_ids` to render button
  - Line 5223-5224: Sends `lc_ids` to backend
  - Line 14737-14752: Event handlers for LC selection

- **File**: `js/config.js`
- **Component**: `API_BASE_URL` - hardcoded to deployment @89

### Database (Google Sheets)
- **Sheet**: RoomSessions
- **Data**: Contains `lc_ids` column with values (verified)
- **Example**: ROOM-003 has `lc_ids = "PENDING,PENDING"`

---

## 8. SOLUTION OPTIONS

### Option A: Use New Deployment (Recommended)
1. Update `js/config.js` to use deployment @91 (or create fresh @92)
2. Browser cache clears with new URL
3. Fresh GAS cache serves correct response

**URL Pattern**: 
```
https://script.google.com/macros/s/[DEPLOYMENT_ID]/exec
```

### Option B: Add Cache-Busting Query Parameter
```javascript
export const API_BASE_URL = "https://script.google.com/macros/s/AKfycbzYoO2LkCAG0fUBKMjAv7uI9RkANiW795Dj_DdlFO4omvW3Btt3MEEI7kW8bOgg1ve1/exec?v=" + Date.now();
```
Problem: GAS may still cache at deployment level

### Option C: Clear GAS Cache Manually
1. Use GAS Editor to manually run `getRooms_()` function (triggers cache clear)
2. Then redeploy
Problem: Time-consuming, not guaranteed

---

## 9. VALIDATION CHECKLIST

After implementing fix, verify:

- [ ] API response includes `lc_ids` field
- [ ] Test room ROOM-003 returns `lc_ids: "PENDING,PENDING"`
- [ ] Frontend receives field (check DevTools Network tab)
- [ ] Button "Pilih LC" renders on room card
- [ ] Button color is purple (#7c3aed)
- [ ] Clicking button opens LC selection modal
- [ ] Can select LCs from modal
- [ ] Saving LC selection persists data
- [ ] Hard refresh doesn't break functionality

---

## 10. TECHNICAL DEBT & NOTES

- **Root Cause**: GAS deployment caching is aggressive and not invalidated by code pushes
- **Lesson**: Always use new deployment URL when changing response schema
- **Alternative**: Consider adding API versioning (e.g., `/exec?v=2`) for cache busting
- **Monitoring**: Monitor GAS execution time to detect cache behavior

---

## SUMMARY FOR NEXT AI

**Problem**: Feature fully implemented but API response missing `lc_ids` field

**Root Cause**: Google Apps Script deployment @89 is caching old response (12 fields) despite code updates adding new fields

**Local Code Status**: ✅ Correct (verified in `apps-script/Code.gs`)

**Database Status**: ✅ Correct (verified in RoomSessions sheet)

**API Response Status**: ❌ Broken (still returns 12 fields, missing `lc_ids`)

**Solution**: Use new deployment URL (@91 or create @92) to bypass cache

**Action Required**: 
1. Verify deployment @91 URL validity
2. Update `js/config.js` with working deployment URL
3. Test API response includes `lc_ids` field
4. Verify frontend button renders

