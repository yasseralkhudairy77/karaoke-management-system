# F&B V2.5A Package Pricing Preview Result

## 1. Status

COMPLETED.

## 2. Commit Hash

Implementation commit:

```text
28be33feac3bdaa4fbacfcf6683d34243af95259
```

## 3. Branch

```text
feat/fnb-v2.5a-package-pricing-preview
```

## 4. Apps Script Version

```text
67
```

## 5. Deployment ID

```text
AKfycbzYoO2LkCAG0fUBKMjAv7uI9RkANiW795Dj_DdlFO4omvW3Btt3MEEI7kW8bOgg1ve1
```

## 6. Deployment Timestamp

```text
2026-07-16T00:23:28+07:00
```

Validation document created:

```text
2026-07-16T00:27:25+07:00
```

## 7. Source Files Deployed

`clasp push --force` uploaded:

```text
appsscript.json
Code.gs
```

Repository implementation commit contains:

```text
apps-script/Code.gs
apps-script/SCHEMA.md
```

## 8. Baseline Room

Selected production room:

```text
room_id: ROOM-001
room_name: Ruangan 1 - Sakura
status: available
rate_per_hour: 75000
start_time: null
booked_duration_minutes: 0
scheduled_end_time: null
updated_at: 2026-07-12T00:29:00+07:00
```

No naturally occupied or maintenance room existed during validation, so the nonavailable-room scenario was skipped without changing room status.

## 9. Package Baseline

```text
package_id: PKG-001
package_name: Beer Holic Package
package_type: room_fnb_bundle
selling_price: 1100000
duration_minutes: 120
status: active
valid_day_type: all
```

## 10. Package-Detail Baseline

Exactly five valid details were present:

```text
PKD-001 Room
PKD-002 LC/Talent
PKD-003 Beer
PKD-004 Mineral Water 330ml
PKD-005 Fruit Platter
```

## 11. `getEligiblePackages` Test Results

Scenario A, `duration_minutes=120`, `booking_date=2026-07-15`:

```text
ok: true
success: true
criteria.duration_minutes: 120
criteria.booking_date: 2026-07-15
criteria.day_type: weekday
PKG-001 appears: 1
eligible_count: 1
evaluated_count: 1
excluded_count: 0
pricing_version: fnb-v2.5a
PKG-001 selling_price: 1100000
PKG-001 duration_minutes: 120
PKG-001 valid_day_type: all
PKG-001 valid_day_result: pass
PKG-001 details_preview count: 5
```

Scenario B, `duration_minutes=60`:

```text
ok: true
PKG-001 appears: 0
```

Scenario C, invalid duration format `duration_minutes=1e2`:

```text
ok: false
code: INVALID_DURATION
```

Scenario D, invalid calendar date `booking_date=2026-02-30`:

```text
ok: false
code: INVALID_BOOKING_DATE
```

Scenario E, nonavailable room:

```text
skipped: no naturally occupied or maintenance room existed
```

## 12. Regular Pricing Preview Result

Request:

```text
room_id: ROOM-001
duration_minutes: 120
booking_mode: regular
booking_date: 2026-07-15
cashier_name: Production Read-Only Validation
```

Result:

```text
ok: true
success: true
booking_mode: regular
package_snapshot: null
requested_duration_minutes: 120
billable_room_minutes: 120
package_included_minutes: 0
promotion_free_minutes: 0
package_subtotal: 0
base_room_charge: 150000
excess_room_charge: 0
room_total_compat: 150000
grand_total: 150000
promotion_benefit: 0
manual_discount: 0
surcharge: 0
additional_fnb_total: 0
additional_service_total: 0
```

## 13. Package 120-Minute Result

Request:

```text
room_id: ROOM-001
duration_minutes: 120
booking_mode: package
package_id: PKG-001
booking_date: 2026-07-15
cashier_name: Production Read-Only Validation
```

Result:

```text
ok: true
success: true
package_subtotal: 1100000
package_included_minutes: 120
billable_room_minutes: 0
base_room_charge: 0
excess_room_charge: 0
room_total_compat: 0
grand_total: 1100000
package_snapshot.package_id: PKG-001
package_snapshot.details count: 5
valid_day_result: pass
pricing lines: package_subtotal, package_included_room
room_excess line: absent
```

## 14. Package 180-Minute Result

Request:

```text
room_id: ROOM-001
duration_minutes: 180
booking_mode: package
package_id: PKG-001
booking_date: 2026-07-15
cashier_name: Production Read-Only Validation
```

Result:

```text
ok: true
success: true
package_subtotal: 1100000
package_included_minutes: 120
billable_room_minutes: 60
excess_room_charge: 75000
room_total_compat: 75000
grand_total: 1175000
pricing lines: package_subtotal, package_included_room, room_excess
```

## 15. Validation Error Results

```text
GET invalid duration string 1e2: INVALID_DURATION
GET invalid booking date 2026-02-30: INVALID_BOOKING_DATE
POST package duration shorter than package, 60 minutes: PACKAGE_DURATION_TOO_SHORT
POST package_id PKG-NOT-FOUND: PACKAGE_NOT_FOUND
```

## 16. Pricing-Line Reconciliation

```text
regular 120 line count: 1
regular 120 line net sum: 150000
regular 120 grand_total: 150000

package 120 line net sum: 1100000
package 120 grand_total: 1100000

package 180 line net sum: 1175000
package 180 grand_total: 1175000
```

## 17. Zero-Mutation Validation

Post-test re-read confirmed:

```text
ROOM-001 status: available
ROOM-001 start_time: null
ROOM-001 booked_duration_minutes: 0
ROOM-001 scheduled_end_time: null
ROOM-001 updated_at: 2026-07-12T00:29:00+07:00
PKG-001 unchanged: true
PKD-001..PKD-005 unchanged: true
```

Operational read-only checks:

```text
transactions created by validation: 0
F&B orders created by validation: 0
stock movements created by validation: 0
validation marker in transactions: false
validation marker in F&B orders: false
validation marker in stock movements: false
inventory rows changed by validation: 0
package rows changed: 0
rooms mutated by validation: 0
```

Read-only endpoint and preview calls did not create sessions, close sessions, create transactions, create F&B orders, alter inventory, or add stock movements.

## 18. Deviations

- Nonavailable-room scenario was skipped because all rooms were naturally `available`; no room status was changed to manufacture the case.
- Production validation used `ROOM-001`, whose `rate_per_hour` is `75000`, so expected totals were calculated from that production rate.
- `clasp status` reports only `appsscript.json` and `Code.gs` as Apps Script tracked upload files; `SCHEMA.md` is repository documentation and was not uploaded by clasp.

## 19. Blockers

None.

## 20. Final Production Verdict

COMPLETED. Controlled deployment succeeded, required read-only production validations passed, pricing-line reconciliation passed, and zero-mutation validation passed.
