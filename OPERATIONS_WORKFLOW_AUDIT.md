# Karaoke Operations Workflow Audit

Date: 2026-07-20
Branch: `design/dark-lounge-brand-theme`

## Objective

Audit the current application against the intended karaoke operating flow before changing backend behavior. This document is intentionally read-first and implementation-neutral so the next engineering phase can be done safely, checkpoint by checkpoint.

## Target Business Flow

1. Guest arrives and is greeted by receptionist.
2. Receptionist checks room availability, explains price, package, and facilities.
3. Guest chooses room and karaoke duration.
4. Receptionist creates the order and sends guest to cashier.
5. Cashier accepts payment by cash, transfer, or QRIS, then gives receipt.
6. Waiter confirms the room is ready and escorts guest to the room.
7. After guest enters and devices are ready, waiter instructs cashier to start countdown.
8. Guest can order F&B, cigarettes, or add time through waiter.
9. Add-ons are recorded and paid through cashier, QRIS, or room bill.
10. System and waiter warn guest before time runs out.
11. Extension is paid first, then time is added.
12. When time ends, karaoke is stopped and guest leaves.
13. Waiter cleans and checks the room.
14. Once ready, room status returns to available.

## Current Backend Inventory

### Active legacy room flow

Current `Rooms.status` values are:

- `available`
- `occupied`
- `maintenance`

Current `startSession` behavior:

- Requires room status `available`.
- Writes `status = occupied`.
- Writes `start_time = now`.
- Writes `booked_duration_minutes`.
- Writes `scheduled_end_time = now + duration`.
- Countdown starts immediately after duration selection.

Current `extendSession` behavior:

- Requires room status `occupied`.
- Requires valid `start_time` and `scheduled_end_time`.
- Adds minutes to `booked_duration_minutes`.
- Adds minutes to `scheduled_end_time`.
- Writes an audit row to `RoomTimeLogs`.
- Does not create or require a payment transaction before extension.

Current `closeSession` behavior:

- Requires room status `occupied`.
- Calculates room billing from booked duration if available.
- Pulls open F&B orders for the same room and room start time.
- Creates one `Transactions` row with `payment_status = unpaid`.
- Marks related F&B orders as `billed`.
- Deducts F&B stock at close time.
- Immediately changes room back to `available`.
- Clears `start_time`, `booked_duration_minutes`, and `scheduled_end_time`.

Current `markTransactionPaid` behavior:

- Supports only `cash` and `transfer`.
- Changes existing unpaid transaction to paid.
- Does not support separate `qris` yet.

Current cashier closing behavior:

- Uses operational date with cutoff 10:00.
- Summarizes paid/unpaid transactions.
- Cash expected only includes paid transactions with method `cash`.
- Transfer revenue only includes paid transactions with method `transfer`.
- Prevents more than one cashier closing per operational day.

### Existing canonical foundation

The backend already defines these planned sheets:

- `RoomSessions`
- `SessionPackages`
- `SessionPackageDetails`
- `TransactionLines`

The schema documentation says this foundation is not yet integrated into `startSession`, `extendSession`, or `closeSession`.

Important implication: the safest long-term route is to integrate the existing canonical session foundation gradually instead of inventing a second lifecycle model.

## Current Frontend Inventory

### Room cards

Current room labels:

- `available` -> `Kosong`
- `occupied` -> `Terisi`
- `maintenance` -> `Perbaikan`

Current primary room button labels:

- `available` -> `Mulai Sesi`
- `occupied` -> `Selesaikan Sesi`
- `maintenance` -> `Tidak Tersedia`

Current UI behavior:

- Clicking available room opens duration selection.
- Choosing duration calls `startSession`.
- Clicking occupied room calls `closeSession`.
- Occupied room shows duration, start time, scheduled end time, and countdown.
- Expired state is visual and derived from countdown, not a persisted room status.

### F&B

Current F&B room selection:

- F&B can only be ordered for room status `occupied`.
- Open F&B orders are attached to the active session by `room_id` and `room_start_time`.
- F&B stock deduction happens when room session is closed and F&B orders become billed.

### Transactions and reports

Current reports and closing depend on `Transactions`:

- `payment_status` values: `paid`, `unpaid`.
- `payment_method` values: `cash`, `transfer`.
- Owner report summarizes total sales, paid, unpaid, room sales, F&B sales, cash, transfer, and closing status.
- Cashier closing is now stable for cash/transfer separation.

## Gap Analysis

### Gap 1: Payment-before-countdown is not enforced

Target flow requires cashier payment before session countdown starts. Current system starts countdown immediately after duration selection and creates payment only after session close.

Risk if changed carelessly:

- Existing reports may double count if a prepayment transaction is introduced without clear finalization rules.
- Cashier closing may include future/active sessions incorrectly.
- Room/F&B total can change after initial payment if F&B or extension is added.

### Gap 2: No paid waiting start state

Target flow needs a room state after payment but before countdown. Current model jumps directly from `available` to `occupied`.

Recommended status:

- `paid_waiting_start`

Meaning:

- Guest has paid selected room duration.
- Waiter is preparing or confirming room/device.
- Countdown has not started.

### Gap 3: No cleaning state

Target flow needs a room state after guest leaves but before room is available. Current `closeSession` immediately sets room to `available`.

Recommended status:

- `cleaning`

Meaning:

- Session is finished.
- Room is not sellable yet.
- Waiter must clean/check room before status returns to `available`.

### Gap 4: Extension does not require payment first

Target flow requires guest to pay before extension is added. Current `extendSession` immediately adds time and only writes `RoomTimeLogs`.

Recommended direction:

- Add an extension payment step.
- Only after payment is recorded should backend add minutes.
- The audit log should reference the payment or transaction line.

### Gap 5: QRIS is not separated

Target flow mentions QRIS. Current backend treats non-cash only as `transfer`.

Safe options:

- Keep QRIS grouped as `transfer` for now and label it "Transfer/QRIS".
- Add `qris` as a new payment method later with report and closing updates.

Recommendation:

- For near-term simulation, use "Transfer/QRIS" as one bucket.
- Split `qris` only when owner wants separate bank reconciliation.

### Gap 6: Role model is simpler than operations

Target operations mention receptionist, cashier, and waiter. Current app roles are effectively owner/admin/cashier for controls, with no explicit receptionist/waiter workflow.

Recommendation:

- Do not add full role enforcement immediately.
- First add clear action labels and audit fields such as `cashier_name`, `started_by`, `ready_by`, and `cleaned_by`.
- Add dedicated roles only after operational screens stabilize.

### Gap 7: F&B settlement needs a clear rule

Target allows additional orders paid at cashier/QRIS or put on room bill. Current F&B is always open until close, then billed into final transaction.

Required decision before implementation:

- Should F&B default to room bill?
- Should cashier be able to mark F&B paid immediately?
- Should immediate paid F&B appear as a separate transaction or attach to the room session?

Recommendation:

- Keep current room-bill behavior for the first lifecycle upgrade.
- Add immediate F&B payment later as a separate controlled phase.

## Recommended Safe Implementation Phases

### Phase 0: Audit and checkpoint

Status: this document.

Goal:

- No behavior change.
- Confirm current architecture and operational gaps.
- Commit and push audit checkpoint.

### Phase 1: UI language and state preparation

Backend impact: low.

Status: implemented in frontend only on 2026-07-20.

Work:

- Add frontend labels for future states without changing backend writes.
- Update management/audit checks to recognize future statuses as planned.
- Update schema documentation with intended lifecycle.
- Keep master room status options limited to current backend-supported values until lifecycle actions are implemented.

Safe outcome:

- App remains operational.
- Future backend states will not immediately appear as "Tidak Dikenal".
- No `startSession`, `extendSession`, `closeSession`, transaction, F&B, or closing behavior is changed in this phase.

### Phase 2: Add booking/prepayment record without starting countdown

Backend impact: medium-high.

Work:

- Introduce a dedicated backend action such as `prepareRoomSession`.
- Create or integrate `RoomSessions` row with status like `starting` or `paid_waiting_start`.
- Mark room compatibility cache as `paid_waiting_start`.
- Create a payment record or transaction draft for room duration.

Safety requirements:

- Use lock.
- Use idempotency key.
- Do not change `start_time` yet.
- Do not allow two active/waiting sessions for one room.
- Confirm reports do not count unpaid/draft session incorrectly.

### Phase 3: Start countdown after waiter confirmation

Backend impact: medium.

Work:

- Add `startPaidSession` or `activateRoomSession`.
- Only allow transition from `paid_waiting_start` to `occupied`.
- Write `start_time` and `scheduled_end_time` at this moment.
- Preserve booked duration and payment reference.

Safety requirements:

- Countdown anchor must be actual start, not payment time.
- UI copy should say "Mulai Countdown" instead of generic "Mulai Sesi".

### Phase 4: Close to cleaning instead of available

Backend impact: medium-high.

Work:

- Change close behavior from `occupied -> available` to `occupied -> cleaning`.
- Finalize any room bill/F&B bill.
- Keep transaction creation behavior compatible with existing reports.
- Add `markRoomReady` action for `cleaning -> available`.

Safety requirements:

- Make sure reports still count only transactions, not room status.
- Make sure room cannot accept new booking during cleaning.
- Keep manual recovery separate from normal cleaning flow.

### Phase 5: Payment-first extension

Backend impact: high.

Work:

- Add extension payment confirmation.
- After payment success, update session duration and scheduled end time.
- Link `RoomTimeLogs` to payment/transaction if possible.

Safety requirements:

- Prevent duplicate extension if cashier double-clicks.
- Keep extension rollback possible if audit log fails.

### Phase 6: Optional QRIS split

Backend impact: medium.

Work:

- Add `qris` to allowed payment methods.
- Update transaction labels, owner report, cashier closing, print preview, and reconciliation checklist.

Recommendation:

- Do only after owner confirms QRIS needs separate reporting from transfer.

## Backend Areas That Must Be Touched Carefully

- `startSession_`
- `extendSession_`
- `closeSession_`
- `markTransactionPaid_`
- `calculateCashierClosingSummary_`
- `getTransactionsByPeriod_`
- `saveFnbOrder_`
- `getOpenFnbOrders_`
- `recoverExpiredRoomSession_`
- `saveRoomMaster_` and `updateRoomMaster_`
- `validatePackageSessionFoundation_`

## Frontend Areas That Must Be Touched Carefully

- Room status labels and classes.
- Room card primary actions.
- Duration selection.
- Extension selection.
- F&B room selector.
- Transaction payment controls.
- Cashier closing preview and save flow.
- Owner and cashier report calculations.
- Audit/quality checks for valid room status.

## Data Migration Notes

No spreadsheet migration should be done without a backup.

Before any backend lifecycle change:

- Export or duplicate the Google Spreadsheet.
- Confirm existing `Rooms` rows have clean statuses.
- Confirm no room is unexpectedly `occupied`.
- Confirm `Transactions`, `FnbOrders`, and `CashierClosings` are internally consistent.
- Validate `RoomSessions` foundation if it exists.

## Rollback Strategy

Every phase should be protected by:

- A Git commit.
- A Git tag for stable milestones.
- No Netlify deployment unless explicitly requested for final testing.
- Apps Script deployment only after local code review and build validation.
- A spreadsheet backup before schema or lifecycle mutation.

Recommended checkpoint names:

- `stable/operations-audit-v1`
- `stable/room-lifecycle-labels-v1`
- `stable/paid-waiting-start-v1`
- `stable/cleaning-flow-v1`
- `stable/payment-first-extension-v1`

## Recommendation

Do not immediately rewrite the backend flow in one pass.

The safest route is:

1. Commit this audit.
2. Add UI/schema preparation for the new statuses.
3. Integrate `RoomSessions` as the canonical session record.
4. Introduce payment-before-countdown as a new backend action.
5. Introduce cleaning as a separate transition after the payment flow is stable.

This keeps the currently stable cashier closing, owner reports, F&B billing, and transaction history from being disrupted while we move toward the real karaoke operating model.
