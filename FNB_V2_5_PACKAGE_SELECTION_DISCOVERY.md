# F&B V2.5 Package Selection and Pricing Foundation Discovery

## 1. Executive Summary

CONFIRMED: Repository saat ini berada di `main` pada HEAD `98cd12852c3ab9428f2e781eab3ffcf12e2f45d5` dengan tag `fnb-v2.4-beer-holic-package-complete`. Checkpoint `fnb-v2.3b-inventory-migration-complete`, `fnb-v2.4-package-import-tool`, dan `fnb-v2.4-beer-holic-package-complete` tersedia.

CONFIRMED: Package foundation sudah ada sebagai read-only API `getPackages` dan `getPackageDetails`, membaca `PackageMaster` dan `PackageDetail`; belum ada integrasi ke start/extend/close session, transaksi, stok, payment, atau receipt. Bukti: `apps-script/Code.gs:359-364`, `apps-script/Code.gs:2420-2505`.

CONFIRMED: Lifecycle session saat ini masih disimpan langsung di sheet `Rooms` melalui `status`, `start_time`, `booked_duration_minutes`, dan `scheduled_end_time`. Tidak ada sheet `RoomSessions` atau `SessionPackages`. Bukti: `apps-script/Code.gs:4516-4585`, `apps-script/Code.gs:202-212`.

CONFIRMED: Billing close session saat ini memakai formula `room_total + fnb_total = grand_total`, sehingga package `room_fnb_bundle` tidak boleh langsung ditambahkan ke formula lama tanpa pricing foundation baru. Bukti: `apps-script/Code.gs:4760-4787`, `apps-script/SCHEMA.md:385-405`.

RECOMMENDATION: V2.5 harus append-only: tambah `RoomSessions`, `SessionPackages`, `SessionPackageDetails`, `TransactionLines`, dan `PricingAuditLogs`; pertahankan `Rooms` dan `Transactions` sebagai compatibility surface untuk UI/receipt lama.

## 2. Repository State

CONFIRMED:
- `pwd`: `F:\KARAOKE MANAGEMENT SYSTEM`
- Branch: `main`
- HEAD: `98cd128 (HEAD -> main, tag: fnb-v2.4-beer-holic-package-complete) docs: complete fnb v2.4 beer holic package`
- Pre-existing untracked files before this discovery: `PROJECT_AUDIT_2026-07-11.md`, `js/thermal-printer.js`, `public/`.

CONFIRMED tag checkpoints:
- `fnb-v2.3b-inventory-migration-complete` -> `5b265b134911ac6c19c9046c599c1b760e7af221`
- `fnb-v2.4-package-import-tool` -> `dfe0b91c319f106cb0b35d430a5e07603b7a7511`
- `fnb-v2.4-beer-holic-package-complete` -> `98cd12852c3ab9428f2e781eab3ffcf12e2f45d5`

## 3. Documents Reviewed

CONFIRMED:
- `FNB_V2_3B_INVENTORY_IDENTITY_RECOVERY_RESULT.md:1-45`: v2.3B completed; do not rerun migration/recovery; keep `StockMovements` unchanged.
- `FNB_V2_4_MENU_MASTER_BASE_RESULT.md:1-49`: `MENU-004 Fruit Platter` exists with `price=0`, `stock_tracking=no`.
- `FNB_V2_4_BEER_HOLIC_PACKAGE_RESULT.md:1-105`: `PKG-001 Beer Holic Package` inserted and production read-only validation passed.
- `apps-script/SCHEMA.md:5-24`, `apps-script/SCHEMA.md:385-405`, `apps-script/SCHEMA.md:558-611`, `apps-script/SCHEMA.md:641-658`, `apps-script/SCHEMA.md:768-801`: current sheet contracts.
- `README.md:1-20`, `README.md:84-112`: frontend tabs and master data history.

## 4. Backend Architecture Map

CONFIRMED API routing:
- `doGet(e)` dispatches read actions including `getRooms`, `getMenuItems`, `getServiceItems`, `getPackages`, `getPackageDetails`, `getTodayTransactions`, `getOpenFnbOrders`, `getTodayFnbOrders`, `getTodayStockMovements`, and `getFnbOrdersByIds`. `apps-script/Code.gs:320-466`
- `doPost(e)` dispatches write actions including `startSession`, `extendSession`, `closeSession`, `markTransactionPaid`, `saveFnbOrder`, and other admin/TV actions. `apps-script/Code.gs:486-540`

CONFIRMED `startSession_(roomId, durationMinutes)`:
- Parameters: `roomId`, `durationMinutes`.
- Reads/writes: `Rooms`; ensures booking columns.
- Lock: `LockService.getScriptLock().waitLock(10000)`.
- Validation: room id required, positive duration, minimum 15 minutes, room must be `available`.
- Side effects: sets room `status=occupied`, `start_time=now`, `booked_duration_minutes`, `scheduled_end_time`, `updated_at`.
- Response: `{ ok, message, room }`.
- Rollback: none after writes.
- Dependencies: `ensureRoomsBookingColumns_`, `findRowByValue_`, `addMinutesToJakartaIsoString_`, `getRoomFromRow_`.
- Evidence: `apps-script/Code.gs:4516-4585`.

CONFIRMED `extendSession_(roomId, addMinutes, cashierName, note)`:
- Parameters: `roomId`, `addMinutes`, `cashierName`, `note`.
- Reads/writes: `Rooms`, `RoomTimeLogs`.
- Lock: script lock.
- Validation: room id, positive add minutes, minimum 15 minutes, room `occupied`, valid `start_time`, existing `scheduled_end_time`.
- Side effects: increments `booked_duration_minutes`, extends `scheduled_end_time`, writes audit log.
- Rollback: if audit log append fails, duration and scheduled end time are restored.
- Response includes `room`, `audit_log`, and `extension`.
- Evidence: `apps-script/Code.gs:4588-4712`.

CONFIRMED `closeSession_(roomId, cashierName)`:
- Parameters: `roomId`, `cashierName`.
- Reads/writes: `Rooms`, `Transactions`, `FnbOrders`, `FnbOrderItems`, `Inventory`, `StockMovements`.
- Lock: script lock.
- Validation: room id, room exists, status `occupied`, valid `start_time`.
- Side effects: appends transaction, deducts F&B stock, marks F&B orders billed, clears room session fields.
- Rollback/compensation: none around transaction append, stock deduction, billed marking, or room clearing.
- Response includes `transaction`, `fnb_orders`, `stock_movements`, and `stock_warnings`.
- Evidence: `apps-script/Code.gs:4715-4818`.

CONFIRMED `resolveSessionBilling_(room, startDate, endDate)`:
- Uses `booked_duration_minutes` when present; otherwise actual elapsed duration.
- Calculates room total as `ceil(duration/60 * rate_per_hour)`.
- Evidence: `apps-script/Code.gs:8052-8075`.

CONFIRMED `appendTransaction_(transaction)`:
- Writes to `Transactions`; ensures only extra headers `fnb_total`, `grand_total`, `fnb_order_ids`.
- No duplicate transaction check.
- Evidence: `apps-script/Code.gs:8006-8031`.

CONFIRMED `markTransactionPaid_(transactionId, paymentMethod)`:
- Reads/writes `Transactions`; script lock; validates payment method from `cash` and `transfer`.
- Blocks if already `paid`; sets payment method/status.
- Evidence: `apps-script/Code.gs:4821-4888`.

CONFIRMED `saveFnbOrder_(roomId, items, cashierName, note)`:
- Reads `Rooms` and `Menu`; writes `FnbOrders` and `FnbOrderItems`.
- Requires occupied room and valid `room.start_time`.
- Snapshots item name/category/price/subtotal into `FnbOrderItems`.
- Evidence: `apps-script/Code.gs:5018-5114`.

CONFIRMED `deductStockForFnbOrders_(fnbOrders, transactionId, cashierName, now)`:
- Reads `Menu` stock mapping and `Inventory`; writes `Inventory.stock_qty`, `Inventory.updated_at`, and `StockMovements`.
- Deducts even if stock goes negative; warnings are returned, not blockers.
- Evidence: `apps-script/Code.gs:5861-5924`.

CONFIRMED package read functions:
- `getPackages_()` reads `PackageMaster`, normalizes numeric price/duration, sorts by type/name.
- `getPackageDetails_(packageId)` reads `PackageDetail`, optionally filters by package id, returns normalized detail including `is_choice` and `choice_group`.
- Evidence: `apps-script/Code.gs:2420-2505`.

## 5. Frontend Architecture Map

CONFIRMED:
- `fetchRoomsFromApi()` calls `GET ?action=getRooms` and expects `{ ok:true, rooms:[] }`. `js/app.js:404-418`
- Room card action opens duration selection when room is available. `js/app.js:4606-4637`
- Duration UI offers 60/120/180 minutes plus custom minutes; buttons dispatch `start-session-duration`. `js/app.js:4698-4750`
- `startSession(roomId, durationMinutes)` posts legacy payload `{ action:"startSession", room_id, duration_minutes }`. `js/app.js:10699-10738`
- `extendSession(roomId, addMinutes)` posts `{ action:"extendSession", room_id, add_minutes, cashier_name, note? }`. `js/app.js:10642-10697`
- `closeSession(roomId)` posts `{ action:"closeSession", room_id, cashier_name }`, stores returned `fnb_orders` by `transaction_id`, then reloads rooms/F&B/inventory/reports/transactions. `js/app.js:10741-10782`
- `saveFnbOrder()` posts `{ action:"saveFnbOrder", room_id, items:[{menu_id, quantity}], cashier_name, note }`. `js/app.js:2775-2840`
- Payment posts `{ action:"markTransactionPaid", transaction_id, payment_method }`. `js/app.js:11106-11139`
- All POST calls use `Content-Type: text/plain;charset=utf-8`. `js/app.js:11182-11190`
- Receipt preparation loads F&B details by transaction `fnb_order_ids` if not already present. `js/app.js:2086-2208`, `js/app.js:3475-3515`
- Receipt builder uses transaction snapshot fields and normalized F&B order details; it does not read package master. `js/receipt.js:13-32`, `js/receipt.js:335-407`

CONFIRMED package UI gap: no frontend call to `getPackages` or `getPackageDetails` was found in `js/app.js`; package selection has no UI integration.

RECOMMENDATION: Best insertion point is the existing duration selection panel: after `Duration Selection`, add segmented `Regular` / `Package` mode and package cards with pricing preview before calling `startSession`. Evidence for current panel: `js/app.js:4698-4750`.

## 6. API Route Map

CONFIRMED current relevant routes:
- GET `getRooms`: reads `Rooms`. `apps-script/Code.gs:328-332`
- GET `getServiceItems`: reads `ServiceItems`. `apps-script/Code.gs:351-352`
- GET `getPackages`: reads `PackageMaster`. `apps-script/Code.gs:359-360`
- GET `getPackageDetails`: reads `PackageDetail`. `apps-script/Code.gs:363-364`
- GET `getTodayTransactions`: reads `Transactions`. `apps-script/Code.gs:375-380`
- GET `getOpenFnbOrders`: reads `FnbOrders`/`FnbOrderItems`. `apps-script/Code.gs:391-392`
- GET `getFnbOrdersByIds`: reads F&B order snapshots by ids. `apps-script/Code.gs:442-446`
- POST `startSession`, `extendSession`, `closeSession`, `markTransactionPaid`, `saveFnbOrder`. `apps-script/Code.gs:491-512`

## 7. Sheet/Data Model Map

CONFIRMED headers from source/schema:
- `Rooms`: `room_id`, `room_name`, `status`, `start_time`, `booked_duration_minutes`, `scheduled_end_time`, `rate_per_hour`, `tv_device_id`, `updated_at`. `apps-script/Code.gs:202-212`
- `Transactions`: base schema `transaction_id`, `room_id`, `room_name`, `start_time`, `end_time`, `duration_minutes`, `rate_per_hour`, `room_total`, `fnb_total`, `grand_total`, `fnb_order_ids`, `payment_method`, `payment_status`, `cashier_name`, `created_at`; runtime also writes `billing_basis` if header exists. `apps-script/SCHEMA.md:385-405`, `apps-script/Code.gs:4786`
- `FnbOrders`: `order_id`, `room_id`, `room_name`, `room_start_time`, `order_status`, `order_total`, `cashier_name`, `note`, `created_at`, `updated_at`, `cancel_reason`, `cancelled_by`, `cancelled_at`. `apps-script/Code.gs:51-65`
- `FnbOrderItems`: `order_id`, `menu_id`, `menu_name`, `category`, `price`, `quantity`, `subtotal`, `created_at`. `apps-script/Code.gs:66-75`
- `Inventory`: `stock_item_id`, `stock_item_name`, `category`, `unit`, `stock_qty`, `min_stock`, `status`, `updated_at`. `apps-script/Code.gs:81-90`
- `StockMovements`: `movement_id`, `created_at`, `stock_item_id`, `stock_item_name`, `movement_type`, `reference_type`, `reference_id`, `qty_change`, `stock_before`, `stock_after`, `note`, `cashier_name`. `apps-script/Code.gs:91-105`
- `MenuMaster/Menu`: `menu_id`, `menu_name`, `category`, `price`, `status`, `updated_at`, `stock_tracking`, `stock_item_id`, `stock_qty_per_unit`. `apps-script/Code.gs:213-223`
- `ServiceItems`: `service_item_id`, `service_name`, `service_type`, `unit`, `cost_rate`, `selling_rate`, `status`, `updated_at`, `note`. `apps-script/Code.gs:247-257`
- `PackageMaster`: `package_id`, `menu_id`, `package_name`, `package_category`, `package_type`, `selling_price`, `status`, `valid_day_type`, `duration_minutes`, `updated_at`, `note`. `apps-script/Code.gs:274-286`
- `PackageDetail`: `package_detail_id`, `package_id`, `line_no`, `component_type`, `component_ref_id`, `component_name`, `qty`, `unit`, `hpp`, `additional_price`, `cost_amount`, `is_choice`, `choice_group`, `updated_at`, `note`. `apps-script/Code.gs:287-303`

CONFIRMED concept search:
- `session_id` exists only for display/recovery diagnostics, not as billing session identity. `apps-script/Code.gs:1445`, `apps-script/Code.gs:1634-1646`
- `promotion`, `discount`, `authorization`, `idempotency key`, `package fulfillment`, and `inventory reservation` were not found as implemented billing concepts.
- `pricing` exists only as generic wording/search context, not as a pricing engine.

## 8. Current Room-Session Lifecycle

CONFIRMED:
1. Frontend opens duration selector for available room. `js/app.js:10289-10303`
2. Frontend posts `startSession` with room id and duration. `js/app.js:10720-10724`
3. Backend sets session fields in `Rooms`; no separate session row is created. `apps-script/Code.gs:4569-4576`
4. Extend updates same `Rooms` row and writes `RoomTimeLogs`. `apps-script/Code.gs:4651-4680`
5. Close calculates billing, appends transaction, deducts F&B stock, marks orders billed, then clears room fields. `apps-script/Code.gs:4760-4806`

INFERENCE: The permanent session identity for billing is effectively `(room_id, start_time)` plus occupied status, because F&B orders store `room_start_time` and close filters open orders by `room_id` and start time. Evidence: `apps-script/Code.gs:5075-5085`, `apps-script/Code.gs:5778-5802`.

## 9. Current Billing Lifecycle

CONFIRMED:
1. Duration is determined at start from `duration_minutes`, normalized to `Number`, minimum 15. `apps-script/Code.gs:4524-4538`
2. Extension adds `add_minutes` to `booked_duration_minutes`; `start_time` is not changed. `apps-script/Code.gs:4651-4661`
3. Close uses `booked_duration_minutes` if present; fallback is actual elapsed minutes. `apps-script/Code.gs:8052-8071`
4. `room_total = ceil(duration/60 * rate_per_hour)`. `apps-script/Code.gs:8073-8075`
5. `fnb_total` sums open F&B order totals for the same room/start time. `apps-script/Code.gs:4764-4769`, `apps-script/Code.gs:5855-5858`
6. `grand_total` is formed during close as `roomTotal + fnbTotal`. `apps-script/Code.gs:4770-4787`
7. Payment is separate after close; marking paid does not recalculate billing. `apps-script/Code.gs:4821-4880`

CONFIRMED idempotency risk: `closeSession` blocks repeat close only after the room has been cleared to `available`; there is no idempotency key or duplicate transaction lookup before `appendTransaction_`. `apps-script/Code.gs:4741-4746`, `apps-script/Code.gs:4789`, `apps-script/Code.gs:8006-8016`.

## 10. Current Inventory-Deduction Lifecycle

CONFIRMED:
- F&B order creation does not deduct stock; it snapshots order and item values. `apps-script/Code.gs:5100-5103`
- Stock deduction happens during `closeSession` after `appendTransaction_`. `apps-script/Code.gs:4789-4791`
- Deduction writes negative stock if needed and emits warnings; it does not block the transaction. `apps-script/Code.gs:5886-5917`
- `StockMovements.reference_type` is `transaction`, `reference_id` is transaction id. `apps-script/Code.gs:5895-5908`

BLOCKER: If stock deduction or `markFnbOrdersAsBilled_` throws after `appendTransaction_`, there is no rollback for the transaction row or any partial inventory writes. Evidence: `apps-script/Code.gs:4789-4791`, `apps-script/Code.gs:5861-5924`, `apps-script/Code.gs:6066-6086`.

## 11. Package Integration Gaps

CONFIRMED:
- `PackageMaster`/`PackageDetail` are readable but not selected by frontend. `apps-script/Code.gs:359-364`, `js/app.js` search result no `getPackages`.
- `startSession_` accepts only `roomId` and `durationMinutes`; `doPost` passes only those two args. `apps-script/Code.gs:491-493`, `apps-script/Code.gs:4516`
- `Transactions` has no package fields and no line table. `apps-script/SCHEMA.md:385-405`
- Receipt has no package section or pricing breakdown. `js/receipt.js:57-68`

RECOMMENDATION: Package selection should snapshot master data at start, not at receipt or close, because master package changes must not mutate historical transaction meaning.

## 12. Promotion Integration Gaps

CONFIRMED: No promotion engine, promotion table, benefit type, stacking policy, or separation between promotion and manual discount exists in the inspected code.

RECOMMENDATION: Do not implement promotion in V2.5. Add pricing fields and audit schema that can later support `TIME_BONUS`, `promotion_free_minutes`, and `promotion_policy`, while setting initial promotion result to none.

## 13. Risk Severity Matrix

| Risk | Severity | Likelihood | Mitigation |
| --- | --- | --- | --- |
| Double room charging for package | critical | high | Use pricing engine fields: `package_included_minutes`, `billable_room_minutes`, transaction lines. |
| Master package changes alter history | critical | high | Snapshot `PackageMaster` and `PackageDetail` into append-only session package tables. |
| Package detail not stored | high | high | Require `SessionPackageDetails` before room start succeeds. |
| Duplicate close session | critical | medium | Add session id + close idempotency key + transaction uniqueness by `session_id`. |
| Duplicate inventory deduction | critical | medium | Deduct by immutable transaction/package fulfillment ids and check existing `StockMovements.reference_id`. |
| Transaction written but stock deduction fails | critical | medium | Prevalidate stock plan before transaction append; use staged close status and compensation logs. |
| Room freed before transaction complete | high | medium | Clear `Rooms` only after transaction lines, stock, and F&B billing complete. |
| Stock package deducted too early | high | medium | Deduct package inventory at fulfillment/close, not preview; define status lifecycle. |
| Promotion stacking uncontrolled | high | medium | Explicit promotion result table and `stacking_policy=none` for v1. |
| Package changed after item delivered | high | medium | Block package change after start; override requires audit log. |
| Race between start/extend/order/close | high | medium | Keep script lock; add session status and optimistic checks by `session_id`. |
| Frontend/backend total mismatch | high | high | Backend authoritative `previewSessionPricing` and `closeSession` final pricing. |
| Backward compatibility with old sessions | high | medium | If no `session_id`, keep legacy close path. |
| F&B/receipt compatibility | medium | high | Continue populating `Transactions.room_total/fnb_total/grand_total`; add line details separately. |
| Apps Script execution/batch limits | medium | medium | Batch reads/writes, precompute maps, keep rows append-only. |
| Header changes break old functions | high | medium | Append headers only; never reorder/delete existing headers. |

## 14. Recommended Architecture Decisions

RECOMMENDATION:
- Create a durable `session_id` at start session.
- Keep `Rooms` as current active-room cache for frontend compatibility.
- Write canonical session/package/pricing facts to append-only sheets.
- Store all package and pricing snapshots before marking room occupied for package booking.
- Make backend totals authoritative; frontend only displays preview returned by backend.
- Preserve legacy `startSession` request exactly.
- Defer promotion execution; reserve schema fields.

## 15. Rejected Design Alternatives

RECOMMENDATION rejected: Store only `package_id` in `Rooms`.
- Reason: `Rooms` is mutable active state, cleared at close, and cannot preserve historical package details.

RECOMMENDATION rejected: Add package price to current `room_total + fnb_total`.
- Reason: `room_fnb_bundle` already includes room duration and F&B components; naive addition causes double room charging.

RECOMMENDATION rejected: Store package details only in `Transactions` JSON.
- Reason: hard to query, audit, fulfill inventory, and reconcile individual package components in Sheets.

RECOMMENDATION rejected: Deduct package inventory at preview/start.
- Reason: customer may cancel/change before delivery; early deduction creates reservation semantics that do not exist yet.

## 16. Proposed Append-Only Schemas

### RoomSessions

Purpose: canonical session identity and lifecycle.

Headers: `session_id`, `room_id`, `room_name`, `booking_mode`, `status`, `start_time`, `scheduled_end_time`, `end_time`, `booked_duration_minutes`, `package_included_minutes`, `promotion_free_minutes`, `billable_room_minutes`, `rate_per_hour`, `cashier_name`, `created_at`, `updated_at`, `closed_transaction_id`, `idempotency_key`, `legacy_room_start_time`, `note`.

Rules: `session_id` primary; unique `idempotency_key` when provided; immutable after close except `status/updated_at/closed_transaction_id`. Lifecycle: `active -> closing -> closed` or `voided`.

Example: `SES-20260715-ROOM-001-001 | ROOM-001 | Sakura | package | active | ... | 120 | 120 | 0 | 0 | 0 | Kasir`.

Why not `Rooms`/`Transactions`: `Rooms` is cleared at close; `Transactions` exists only after close.

### SessionPackages

Purpose: selected package master snapshot per session.

Headers: `session_package_id`, `session_id`, `package_id`, `package_name`, `package_category`, `package_type`, `selling_price`, `duration_minutes`, `valid_day_type`, `valid_day_result`, `status`, `selected_at`, `selected_by`, `snapshot_json`, `void_reason`, `voided_at`.

Rules: primary `session_package_id`; v1 unique active package per `session_id`; immutable snapshot fields.

Example: `SPKG-000001 | SES-... | PKG-001 | Beer Holic Package | room_fnb_bundle | 1100000 | 120 | all | pass | active`.

Why not `Transactions`: selection happens before transaction close and must survive master changes.

### SessionPackageDetails

Purpose: package component snapshot and fulfillment basis.

Headers: `session_package_detail_id`, `session_package_id`, `session_id`, `package_detail_id`, `line_no`, `component_type`, `component_ref_id`, `component_name`, `qty`, `unit`, `hpp`, `additional_price`, `cost_amount`, `is_choice`, `choice_group`, `chosen_ref_id`, `chosen_name`, `fulfillment_status`, `fulfilled_qty`, `fulfilled_at`, `snapshot_json`.

Rules: primary `session_package_detail_id`; immutable component snapshot; choice fields required only if `is_choice=true`.

Example: `SPKD-000003 | SPKG-000001 | SES-... | PKD-003 | 3 | inventory | ITEM-004 | Beer | 6 | botol | ... | pending`.

Why not `FnbOrderItems`: package components may include service/inventory/menu and may be included-price, not normal F&B sale.

### TransactionLines

Purpose: auditable pricing breakdown.

Headers: `transaction_line_id`, `transaction_id`, `session_id`, `line_type`, `source_type`, `source_id`, `description`, `qty`, `unit`, `unit_price`, `gross_amount`, `discount_amount`, `net_amount`, `tax_amount`, `sort_order`, `created_at`, `snapshot_json`.

Rules: primary `transaction_line_id`; immutable after append; source can be `room`, `package`, `fnb_order`, `service`, `promotion`, `manual_discount`, `surcharge`.

Example: `TL-000001 | TRX-... | SES-... | package_subtotal | session_package | SPKG-000001 | Beer Holic Package | 1 | package | 1100000 | 1100000 | 0 | 1100000`.

Why not only `Transactions`: `Transactions` totals cannot explain package inclusion, excess room charge, promotion, or discounts.

### PricingAuditLogs

Purpose: immutable trace of preview/final pricing decisions.

Headers: `pricing_audit_id`, `created_at`, `event_type`, `session_id`, `transaction_id`, `request_hash`, `booking_mode`, `pricing_version`, `input_json`, `result_json`, `cashier_name`, `status`, `error_code`, `note`.

Rules: append-only; no updates; event types `preview`, `start_snapshot`, `close_final`, `override`.

Example: `PAL-000001 | ... | preview | SES-... | | hash | package | v1 | {...} | {...} | Kasir | success`.

Why not app logs: Apps Script logs are not durable business audit.

## 17. Proposed API Contracts

### GET `getEligiblePackages`

Read-only. Request: `action=getEligiblePackages&room_id=ROOM-001&duration_minutes=120&booking_date=2026-07-15`.

Success: `{ ok:true, packages:[{ package_id, package_name, package_type, selling_price, duration_minutes, valid_day_result, details_preview:[...] }] }`.

Validation error: `{ ok:false, code:"INVALID_DURATION", error:"duration_minutes wajib berupa angka positif." }`.

State conflict: `{ ok:false, code:"ROOM_NOT_AVAILABLE", error:"Ruangan tidak tersedia." }`.

Authorization: cashier+ for read. Idempotency: not needed. Snapshot: none; read-only.

### POST `previewSessionPricing`

Read-only from business data; writes optional `PricingAuditLogs` only if owner approves logging previews.

Request: `{ action:"previewSessionPricing", room_id:"ROOM-001", duration_minutes:120, booking_mode:"package", package_id:"PKG-001", cashier_name:"Kasir" }`.

Success: `{ ok:true, pricing:{ booking_mode, package_subtotal, base_room_charge, package_included_minutes, billable_room_minutes, excess_room_charge, additional_fnb_total:0, additional_service_total:0, promotion_benefit:0, manual_discount:0, grand_total, lines:[] }, package_snapshot:{...} }`.

Validation error: `{ ok:false, code:"PACKAGE_REQUIRED", error:"package_id wajib diisi untuk booking package." }`.

State conflict: `{ ok:false, code:"PACKAGE_NOT_ELIGIBLE", error:"Package tidak berlaku untuk sesi ini." }`.

Authorization: cashier+. Idempotency: deterministic by request; no write unless audit preview enabled.

### POST `startSession`

Write. Must remain backward compatible.

Legacy request: `{ "action":"startSession", "room_id":"ROOM-001", "duration_minutes":120 }`.

New request: `{ "action":"startSession", "room_id":"ROOM-001", "duration_minutes":120, "booking_mode":"package", "package_id":"PKG-001", "cashier_name":"Kasir", "idempotency_key":"..." }`.

Success legacy: keep `{ ok:true, message, room }`.

Success new: `{ ok:true, message, room, session:{ session_id, booking_mode, status }, package:{ session_package_id, package_id, package_name }, pricing_preview:{...} }`.

Validation error: `{ ok:false, code:"INVALID_DURATION", error:"Durasi minimal 15 menit." }`.

State conflict: `{ ok:false, code:"ROOM_NOT_AVAILABLE", error:"Ruangan tidak tersedia untuk memulai sesi." }`.

Authorization: cashier+. Idempotency: required for new clients; legacy remains non-idempotent except room status guard. Snapshot: package master/detail and pricing preview.

### GET `getActiveSession`

Read-only. Request: `action=getActiveSession&room_id=ROOM-001`.

Success: `{ ok:true, session:{...}, package:{...}, pricing_current:{...}, room:{...} }`; legacy active room without `RoomSessions` returns inferred `legacy:true`.

Validation error: `{ ok:false, code:"ROOM_ID_REQUIRED", error:"room_id wajib diisi." }`.

State conflict: `{ ok:false, code:"NO_ACTIVE_SESSION", error:"Tidak ada sesi aktif." }`.

Authorization: cashier+. Idempotency: not needed.

### POST `extendSession`

Write. Legacy request remains `{ action:"extendSession", room_id, add_minutes, cashier_name, note }`.

New request adds `session_id` and optional `idempotency_key`.

Success: legacy unchanged plus optional `session` and `pricing_preview` for new sessions.

Validation error: `{ ok:false, code:"INVALID_ADD_MINUTES", error:"Tambahan waktu minimal 15 menit." }`.

State conflict: `{ ok:false, code:"SESSION_MISMATCH", error:"Sesi aktif tidak cocok." }`.

Authorization: cashier+. Idempotency: key required for new clients. Snapshot: new duration/pricing audit.

### POST `closeSession`

Write. Legacy request remains `{ action:"closeSession", room_id, cashier_name }`; new request adds `session_id`, `idempotency_key`, optional final override fields.

Success legacy currently returns `{ ok:true, message, transaction, fnb_orders, stock_movements, stock_warnings }`.

Success new: same fields plus `session`, `pricing_final`, `transaction_lines`, `package_fulfillment`.

Validation error: `{ ok:false, code:"ROOM_ID_REQUIRED", error:"room_id wajib diisi." }`.

State conflict: `{ ok:false, code:"SESSION_ALREADY_CLOSED", transaction:{...} }` for idempotent repeat.

Authorization: cashier+; override/discount requires manager/admin. Idempotency: mandatory for new close. Snapshot: final pricing lines and fulfillment state.

## 18. File-by-File Implementation Plan

RECOMMENDATION:
- `apps-script/Code.gs`: add append-only sheet headers, `generateSessionId_`, package eligibility, pricing preview engine, session snapshot writes, transaction line appends, idempotency lookup, and legacy-safe `startSession_/extendSession_/closeSession_` extensions.
- `apps-script/SCHEMA.md`: document new sheets and API contracts; explicitly mark legacy compatibility.
- `js/app.js`: add package list loading state, booking mode state, package selection UI inside duration panel, preview call, and start payload extension.
- `js/receipt.js`: add package/pricing lines display while keeping old totals fallback.
- `README.md`: add milestone notes and deploy checklist after implementation only.
- Tests/static checks: add local grep/static validation for no header reorder and no destructive production call.

## 19. Validation Strategy

RECOMMENDATION:
1. DRY RUN: local static analysis and Apps Script function-level dry-run with mock payloads only.
2. VALIDATION: read-only checks for package data, headers, and active legacy sessions.
3. BACKUP: spreadsheet backup before any production execute.
4. EXECUTE: deploy code, then create new sheets via controlled initializer only.
5. POST VALIDATION: verify legacy regular booking, package preview, package start, F&B order, close, payment, receipt.
6. CHECKPOINT: tag only after production read validation and owner sign-off.

## 20. Rollback Strategy

RECOMMENDATION:
- Code rollback: redeploy previous Apps Script version and frontend static version.
- Data rollback: new sheets are append-only; do not delete old rows. Mark new sessions/package rows `voided` if test data must be neutralized.
- Compatibility: legacy `Rooms` and `Transactions` fields continue to support old UI if new frontend is rolled back.
- Stock rollback: package inventory deduction must write compensating `StockMovements`, never edit history.

## 21. Suggested Milestone Breakdown

RECOMMENDATION:
1. V2.5A: schema docs and read-only package eligibility.
2. V2.5B: pricing preview engine without session writes.
3. V2.5C: `RoomSessions` and package snapshot at start, legacy-compatible.
4. V2.5D: close session final pricing and transaction lines.
5. V2.5E: receipt/package pricing display.
6. V2.5F: production validation and checkpoint.

## 22. Open Decisions

OPEN DECISION:
- Should package inventory/menu components be fulfilled/deducted at close, at service delivery, or via explicit fulfillment UI?
- Should previews be logged to `PricingAuditLogs`, or only final/start events?
- Who can override/change package after start, and what manager authorization method is acceptable?
- Should `ServiceItems` package components become billable transaction lines immediately or remain included-only in V2.5?
- What exact promotion-free-time policy should apply when package booking is extended beyond included duration?

## 23. Blockers

BLOCKER:
- Current close path is not atomic after transaction append; V2.5 should not add package stock/fulfillment writes to this path without staged finalization or compensation.
- No durable session id exists for billing sessions.
- No pricing line/audit table exists, so package math cannot be explained safely in receipts/reports.

## 24. Exact Recommended Next Action

RECOMMENDATION: Start V2.5 with a small, non-production implementation branch that adds only schema constants/helpers and read-only `getEligiblePackages` plus `previewSessionPricing` dry-run logic. Do not modify `closeSession` until session identity, package snapshot, and transaction-line design are reviewed by owner.

