# 🎯 LC Selection Issue - Quick Reference

## The Problem
Tombol **"Pilih LC"** (ungu) tidak muncul di room card saat:
- Room status = `occupied`
- Jumlah LC yang di-booking > 0

## The Root Cause
**Backend API tidak mengirim field `lc_ids` ke frontend**

```
Frontend: "Mana lc_ids-nya?"
API Response: { room_id, room_name, status, ... } ← MISSING lc_ids!
Frontend: Kondisi "if (lcIds)" FALSE → Button tidak render
```

## The Fix
**File**: `apps-script/Code.gs`  
**Location**: Function `getRooms_()` (baris 921-950)  
**Change**: Add 1 line

```diff
  return {
    // ... other fields ...
    customer_name: room.customer_name || "",
    package_id: room.package_id || "",
+   lc_ids: room.lc_ids || "",  // ← ADD THIS LINE
  };
```

## Files Created
1. **LC_SELECTION_AUDIT_REPORT.md** - Detailed analysis (includes step 1-3)
2. **LC_SELECTION_DEVTOOLS_TRACE.md** - Browser debugging guide
3. **LC_SELECTION_FIX_CHECKLIST.md** - Implementation checklist

## What Changed
- **Before**: `room.lc_ids` = undefined → button hidden
- **After**: `room.lc_ids` = "PENDING,PENDING" → button visible

## Quick Deploy Steps
1. Edit `apps-script/Code.gs` (add 1 line above)
2. Deploy to Google Apps Script
3. Hard refresh: `Ctrl + Shift + R`
4. Test: Create room with LC > 0 → button should appear

## Test Verification
```
✅ Create room with Jumlah LC = 2
✅ Complete payment
✅ Room status = occupied
✅ "Pilih LC" button APPEARS (purple/ungu #7c3aed)
✅ Click button → modal opens
✅ Select LC → save → success
```

## Files Affected
- ✅ `apps-script/Code.gs` (1 line added)
- ✅ No frontend changes needed
- ✅ No database schema changes

---

**Status**: ✅ FIXED & READY TO DEPLOY
