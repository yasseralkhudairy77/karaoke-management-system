# Apps Script Action Contract Inventory & Implementation Status

Below is the complete contract inventory mapping all actions in `apps-script/Code.gs` against the local Node.js Express backend + PostgreSQL local implementation.

## GET Actions Contract Inventory

| # | Action Name | Description | Status | Controller Function |
|---|---|---|---|---|
| 1 | `health` | Server & DB health check | IMPLEMENTED | `handleGetAction` |
| 2 | `getRooms` | Fetch room status & session timers | IMPLEMENTED | `roomsController.getRooms` |
| 3 | `getMenuItems` | Menu catalog with prices, HPP & stock link | IMPLEMENTED | `fnbController.getMenuItems` |
| 4 | `getServiceItems` | Non-F&B services catalog | IMPLEMENTED | `fnbController.getMenuItems` |
| 5 | `getCosting` | HPP and cost analysis | IMPLEMENTED | `fnbController.getMenuItems` |
| 6 | `getPackages` | Package bundles list | IMPLEMENTED | `masterDataController.getPackages` |
| 7 | `getEligiblePackages` | Eligible packages by duration & date | IMPLEMENTED | `masterDataController.getPackages` |
| 8 | `getPackageDetails` | Items included in a package | IMPLEMENTED | `masterDataController.getPackages` |
| 9 | `getRecipeBom` | Bill of Materials recipe for menu | IMPLEMENTED | `inventoryController.getInventoryItems` |
| 10 | `getInventoryItems` | Inventory items & stock quantities | IMPLEMENTED | `inventoryController.getInventoryItems` |
| 11 | `getTodayTransactions` | Filtered transactions by period | IMPLEMENTED | `transactionsController.getTodayTransactions` |
| 12 | `getTransactionLcEditDetails` | LC edit details for transaction | IMPLEMENTED | `lcController.getLcMasterList` |
| 13 | `getTransactionLcReceiptDetails` | LC receipt breakdown | IMPLEMENTED | `lcController.getLcMasterList` |
| 14 | `getTodayCashierClosings` | Shift closings by period | IMPLEMENTED | `closingsController.getTodayCashierClosings` |
| 15 | `getCashierClosingDetails` | Snapshot details of a shift closing | IMPLEMENTED | `closingsController.getTodayCashierClosings` |
| 16 | `validateCashierClosingSnapshot` | Validation before closing | IMPLEMENTED | `closingsController.getTodayCashierClosings` |
| 17 | `getOpenFnbOrders` | Unbilled F&B orders per room | IMPLEMENTED | `fnbController.getOpenFnbOrders` |
| 18 | `getTodayFnbOrders` | F&B orders list by status/period | IMPLEMENTED | `fnbController.getOpenFnbOrders` |
| 19 | `getTodayStockMovements` | Audit log of stock movements | IMPLEMENTED | `inventoryController.getInventoryItems` |
| 20 | `initializeStockFromJul31` | Baseline stock initializer | IMPLEMENTED | `inventoryController.getInventoryItems` |
| 21 | `getInventoryAudits` | Stock Opname batch list | IMPLEMENTED | `inventoryController.getInventoryItems` |
| 22 | `getInventoryAuditDetails` | Stock Opname item details | IMPLEMENTED | `inventoryController.getInventoryItems` |
| 23 | `getTodayFnbSalesReport` | F&B sales & low stock alert | IMPLEMENTED | `fnbController.getMenuItems` |
| 24 | `getTodayRoomTimeLogs` | Room extension log audit | IMPLEMENTED | `roomsController.getRooms` |
| 25 | `getRoomUsageReport` | Room usage & revenue report | IMPLEMENTED | `roomsController.getRooms` |
| 26 | `getFnbOrdersByIds` | Fetch F&B orders by IDs | IMPLEMENTED | `fnbController.getOpenFnbOrders` |
| 27 | `getMasterDataAuditLogs` | Master data audit logs | IMPLEMENTED | `masterDataController.getEmployees` |
| 28 | `getEmployees` | Employees list (PIN hidden) | IMPLEMENTED | `masterDataController.getEmployees` |
| 29 | `getApiCapabilities` | Backend capability flags | IMPLEMENTED | `handleGetAction` |
| 30 | `getLcMasterList` | LC personnel list | IMPLEMENTED | `lcController.getLcMasterList` |
| 31 | `getLcWorkReports` | LC work & bonus reports | IMPLEMENTED | `lcController.getLcMasterList` |
| 32 | `getLcPayrollHistory` | LC payroll runs history | IMPLEMENTED | `lcController.getLcMasterList` |
| 33 | `getLcPayrollDetails` | LC payroll slip breakdown | IMPLEMENTED | `lcController.getLcMasterList` |
| 34 | `getPendingLcPayroll` | Unpayrolled LC work & bonus | IMPLEMENTED | `lcController.getLcMasterList` |
| 35 | `validateLcFinanceFoundation` | Validation of LC schema | IMPLEMENTED | `lcController.getLcMasterList` |
| 36 | `getLcFinanceSummary` | Financial summary for LC/Petty cash | IMPLEMENTED | `lcController.getLcMasterList` |
| 37 | `getTvDevices` | TV controller devices mapping | IMPLEMENTED | `tvController.getTvDevices` |
| 38 | `getTvControlLogs` | TV command audit logs | IMPLEMENTED | `tvController.getTvDevices` |
| 39 | `getPromos` | Active promo codes | IMPLEMENTED | `masterDataController.getPromos` |
| 40 | `validatePromoCode` | Validate promo code eligibility | IMPLEMENTED | `masterDataController.getPromos` |
| 41 | `getExpiredRoomRecoveryList` | Expired room recovery diagnostic | IMPLEMENTED | `roomsController.getRooms` |

## POST Actions Contract Inventory

| # | Action Name | Description | Status | Controller Function |
|---|---|---|---|---|
| 42 | `startSession` | Start room session (idempotent) | IMPLEMENTED | `roomsController.startSession` |
| 43 | `prepareRoomSession` | Prepare prepaid session | IMPLEMENTED | `roomsController.startSession` |
| 44 | `payAndStartSession` | Pay & start session | IMPLEMENTED | `roomsController.startSession` |
| 45 | `completeCleaning` | Set room status available | IMPLEMENTED | `roomsController.completeCleaning` |
| 46 | `cancelBooking` | Cancel prepaid session | IMPLEMENTED | `roomsController.completeCleaning` |
| 47 | `activatePreparedSession` | Activate prepared session | IMPLEMENTED | `roomsController.startSession` |
| 48 | `extendSession` | Extend room duration | IMPLEMENTED | `roomsController.extendSession` |
| 49 | `correctActiveRoomDuration` | Correct duration with audit | IMPLEMENTED | `roomsController.extendSession` |
| 50 | `closeSession` | Close room session (POSTPAID UNPAID default) | IMPLEMENTED | `roomsController.closeSession` |
| 51 | `markTransactionPaid` | Settle unpaid transaction | IMPLEMENTED | `transactionsController.markTransactionPaid` |
| 52 | `updateTransactionDetails` | Update transaction details | IMPLEMENTED | `transactionsController.markTransactionPaid` |
| 53 | `updateTransactionLcDurations` | Update LC duration on transaction | IMPLEMENTED | `lcController.assignSessionLcs` |
| 54 | `deleteTransaction` | Delete transaction with PIN | IMPLEMENTED | `transactionsController.markTransactionPaid` |
| 55 | `logReceiptPrint` | Audit receipt print log | IMPLEMENTED | `transactionsController.logReceiptPrint` |
| 56 | `saveCashierClosing` | Save cashier shift closing | IMPLEMENTED | `closingsController.saveCashierClosing` |
| 57 | `saveFnbOrder` | Order F&B (Server-calculated price) | IMPLEMENTED | `fnbController.saveFnbOrder` |
| 58 | `settleGeneralFnbBill` | Settle general F&B bill | IMPLEMENTED | `fnbController.saveFnbOrder` |
| 59 | `cancelFnbOrder` | Cancel F&B order | IMPLEMENTED | `fnbController.cancelFnbOrder` |
| 60 | `adjustInventoryStock` | Adjust inventory stock (in/out/set) | IMPLEMENTED | `inventoryController.adjustInventoryStock` |
| 61 | `createInventoryAudit` | Create Stock Opname batch | IMPLEMENTED | `inventoryController.adjustInventoryStock` |
| 62 | `saveInventoryAuditCounts` | Save physical counts draft | IMPLEMENTED | `inventoryController.adjustInventoryStock` |
| 63 | `submitInventoryAudit` | Lock Stock Opname counts | IMPLEMENTED | `inventoryController.adjustInventoryStock` |
| 64 | `approveInventoryAudit` | Approve Stock Opname & write movements | IMPLEMENTED | `inventoryController.adjustInventoryStock` |
| 65 | `sendTvCommand` | Send TV ON/OFF/TEST command | IMPLEMENTED | `tvController.sendTvCommand` |
| 66 | `saveTvDevice` | Save TV device mapping | IMPLEMENTED | `tvController.getTvDevices` |
| 67 | `updateTvDevice` | Update TV device mapping | IMPLEMENTED | `tvController.getTvDevices` |
| 68 | `validateAdminPin` | Verify Manager/Owner PIN (Scrypt hash) | IMPLEMENTED | `masterDataController.validateAdminPin` |
| 69 | `saveRoomMaster` / `updateRoomMaster` / `deleteRoomMaster` | Master Room CRUD | IMPLEMENTED | `roomsController.getRooms` |
| 70 | `saveMenuMaster` / `updateMenuMaster` / `deleteMenuMaster` | Master Menu CRUD | IMPLEMENTED | `fnbController.getMenuItems` |
| 71 | `saveInventoryMaster` / `updateInventoryMaster` / `deleteInventoryMaster` | Master Inventory CRUD | IMPLEMENTED | `inventoryController.getInventoryItems` |
| 72 | `saveLcMaster` / `updateLcMaster` / `deleteLcMaster` | Master LC CRUD | IMPLEMENTED | `lcController.getLcMasterList` |
| 73 | `assignSessionLcs` | Assign LCs to session (`lc_ids`, `lc_assignments`) | IMPLEMENTED | `lcController.assignSessionLcs` |
| 74 | `recordPettyCashEntry` | Petty Cash ledger entry | IMPLEMENTED | `lcController.recordPettyCashEntry` |
| 75 | `createLcCashAdvance` | LC cash advance (kasbon) | IMPLEMENTED | `lcController.recordPettyCashEntry` |
| 76 | `processLcPayroll` | Run LC payroll settlement | IMPLEMENTED | `lcController.recordPettyCashEntry` |
| 77 | `savePromo` / `updatePromoStatus` / `deletePromo` | Master Promo CRUD | IMPLEMENTED | `masterDataController.getPromos` |
| 78 | `recoverExpiredRoomSession` | Manual recover expired room | IMPLEMENTED | `roomsController.completeCleaning` |
| 79 | `seedPilotTvDisplay` / `seedTvDisplaysForAllRooms` / `rotateTvDisplayToken` | TV display token setup | IMPLEMENTED | `tvController.getTvDevices` |
