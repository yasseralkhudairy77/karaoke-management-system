const express = require('express');
const router = express.Router();

const roomsController = require('../controllers/roomsController');
const fnbController = require('../controllers/fnbController');
const inventoryController = require('../controllers/inventoryController');
const transactionsController = require('../controllers/transactionsController');
const closingsController = require('../controllers/closingsController');
const lcController = require('../controllers/lcController');
const tvController = require('../controllers/tvController');
const masterDataController = require('../controllers/masterDataController');
const mirrorController = require('../controllers/mirrorController');
const auditController = require('../controllers/auditController');
const { successResponse, errorResponse } = require('../utils/response');

// Helper to handle Apps Script GET actions
async function handleGetAction(action, req, res) {
  switch (action) {
    case 'health':
      return successResponse(res, { status: 'healthy', database: 'postgresql_local' });
    case 'getRooms':
      return roomsController.getRooms(req, res);
    case 'getRoomUsageReport':
      return roomsController.getRoomUsageReport(req, res);
    case 'getExpiredRoomRecoveryList':
      return roomsController.getExpiredRoomRecoveryList(req, res);
    case 'getTodayRoomTimeLogs':
      return roomsController.getTodayRoomTimeLogs(req, res);
    case 'getMenuItems':
      return fnbController.getMenuItems(req, res);
    case 'getOpenFnbOrders':
      return fnbController.getOpenFnbOrders(req, res, req.query.room_id);
    case 'getTodayFnbOrders':
      return fnbController.getTodayFnbOrders(req, res);
    case 'getTodayFnbSalesReport':
    case 'getFnbSalesReport':
      return fnbController.getTodayFnbSalesReport(req, res);
    case 'getFnbOrdersByIds':
      return fnbController.getFnbOrdersByIds(req, res);
    case 'getInventoryItems':
      return inventoryController.getInventoryItems(req, res);
    case 'getTodayStockMovements':
      return inventoryController.getTodayStockMovements(req, res);
    case 'getRecipeBom':
      return inventoryController.getRecipeBom(req, res);
    case 'getInventoryAudits':
      return inventoryController.getInventoryAudits(req, res);
    case 'getInventoryAuditDetails':
      return inventoryController.getInventoryAuditDetails(req, res);
    case 'getTodayTransactions':
      return transactionsController.getTodayTransactions(req, res);
    case 'getTransactionLcEditDetails':
      return transactionsController.getTransactionLcEditDetails(req, res);
    case 'getTransactionLcReceiptDetails':
      return transactionsController.getTransactionLcReceiptDetails(req, res);
    case 'getTodayCashierClosings':
      return closingsController.getTodayCashierClosings(req, res);
    case 'getCashierClosingDetails':
      return closingsController.getCashierClosingDetails(req, res);
    case 'getLcMasterList':
      return lcController.getLcMasterList(req, res);
    case 'getLcWorkReports':
      return lcController.getLcWorkReports(req, res);
    case 'getLcFinanceSummary':
      return lcController.getLcFinanceSummary(req, res);
    case 'getPendingLcPayroll':
      return lcController.getPendingLcPayroll(req, res);
    case 'getLcPayrollHistory':
      return lcController.getLcPayrollHistory(req, res);
    case 'getLcPayrollDetails':
      return lcController.getLcPayrollDetails(req, res);
    case 'getTvDevices':
      return tvController.getTvDevices(req, res);
    case 'getTvControlLogs':
      return tvController.getTvControlLogs(req, res);
    case 'getTvDisplaySetupList':
      return tvController.getTvDisplaySetupList(req, res);
    case 'getCustomerDisplayState':
      return tvController.getCustomerDisplayState(req, res);
    case 'getEmployees':
      return masterDataController.getEmployees(req, res);
    case 'getServiceItems':
      return masterDataController.getServiceItems(req, res);
    case 'getCosting':
      return masterDataController.getCosting(req, res);
    case 'getMasterDataAuditLogs':
      return masterDataController.getMasterDataAuditLogs(req, res);
    case 'getOperationalAuditReport':
      return auditController.getOperationalAuditReport(req, res);
    case 'getPackages':
      return masterDataController.getPackages(req, res);
    case 'getPackageDetails':
      return masterDataController.getPackageDetails(req, res);
    case 'getEligiblePackages':
      return masterDataController.getEligiblePackages(req, res);
    case 'getPromos':
      return masterDataController.getPromos(req, res);
    case 'validatePromoCode':
      return masterDataController.validatePromoCode(req, res);
    case 'getApiCapabilities':
      return successResponse(res, { local_first: true, postgresql: true, outbox_sync: true, owner_mirror_snapshot: true });
    case 'getOwnerMirrorSnapshot':
      return mirrorController.getOwnerMirrorSnapshot(req, res);
    default:
      return errorResponse(res, `Aksi GET tidak dikenal: ${action}`, 'UNKNOWN_ACTION');
  }
}

// Helper to handle Apps Script POST actions
async function handlePostAction(action, req, res, payload) {
  switch (action) {
    case 'health':
    case 'getRooms':
    case 'getRoomUsageReport':
    case 'getExpiredRoomRecoveryList':
    case 'getTodayRoomTimeLogs':
    case 'getMenuItems':
    case 'getOpenFnbOrders':
    case 'getTodayFnbOrders':
    case 'getTodayFnbSalesReport':
    case 'getFnbOrdersByIds':
    case 'getInventoryItems':
    case 'getTodayStockMovements':
    case 'getRecipeBom':
    case 'getInventoryAudits':
    case 'getInventoryAuditDetails':
    case 'getTodayTransactions':
    case 'getTransactionLcEditDetails':
    case 'getTransactionLcReceiptDetails':
    case 'getTodayCashierClosings':
    case 'getCashierClosingDetails':
    case 'getLcMasterList':
    case 'getLcWorkReports':
    case 'getLcFinanceSummary':
    case 'getPendingLcPayroll':
    case 'getLcPayrollHistory':
    case 'getLcPayrollDetails':
    case 'getTvDevices':
    case 'getTvControlLogs':
    case 'getTvDisplaySetupList':
    case 'getCustomerDisplayState':
    case 'getEmployees':
    case 'getServiceItems':
    case 'getRecipeBomStatus':
    case 'getCosting':
    case 'getMasterDataAuditLogs':
    case 'getOperationalAuditReport':
    case 'getPackages':
    case 'getPackageDetails':
    case 'getEligiblePackages':
    case 'getPromos':
    case 'validatePromoCode':
    case 'getApiCapabilities':
    case 'getOwnerMirrorSnapshot':
      req.query = { ...payload, ...req.query, action };
      return handleGetAction(action, req, res);
    case 'prepareRoomSession':
      return roomsController.prepareRoomSession(req, res, payload);
    case 'previewSessionPricing':
      return roomsController.previewSessionPricing(req, res, payload);
    case 'payAndStartSession':
      return roomsController.payAndStartSession(req, res, payload);
    case 'cancelBooking':
      return roomsController.cancelBooking(req, res, payload);
    case 'activatePreparedSession':
      return roomsController.activatePreparedSession(req, res, payload);
    case 'recoverExpiredRoomSession':
      return roomsController.recoverExpiredRoomSession(req, res, payload);
    case 'correctActiveRoomDuration':
      return roomsController.correctActiveRoomDuration(req, res, payload);
    case 'startSession':
      return roomsController.startSession(req, res, payload);
    case 'extendSession':
      return roomsController.extendSession(req, res, payload);
    case 'moveActiveSessionRoom':
      return roomsController.moveActiveSessionRoom(req, res, payload);
    case 'updateActiveSessionPackage':
      return roomsController.updateActiveSessionPackage(req, res, payload);
    case 'closeSession':
      return roomsController.closeSession(req, res, payload);
    case 'completeCleaning':
      return roomsController.completeCleaning(req, res, payload);
    case 'saveFnbOrder':
      return fnbController.saveFnbOrder(req, res, payload);
    case 'cancelFnbOrder':
      return fnbController.cancelFnbOrder(req, res, payload);
    case 'cancelGeneralFnbBill':
      return fnbController.cancelGeneralFnbBill(req, res, payload);
    case 'settleGeneralFnbBill':
      return fnbController.settleGeneralFnbBill(req, res, payload);
    case 'adjustInventoryStock':
      return inventoryController.adjustInventoryStock(req, res, payload);
    case 'receiveGoodsBatch':
      return inventoryController.receiveGoodsBatch(req, res, payload);
    case 'createInventoryAudit':
      return inventoryController.createInventoryAudit(req, res, payload);
    case 'saveInventoryAuditCounts':
      return inventoryController.saveInventoryAuditCounts(req, res, payload);
    case 'submitInventoryAudit':
      return inventoryController.submitInventoryAudit(req, res, payload);
    case 'approveInventoryAudit':
      return inventoryController.approveInventoryAudit(req, res, payload);
    case 'markTransactionPaid':
      return transactionsController.markTransactionPaid(req, res, payload);
    case 'updateTransactionDetails':
      return transactionsController.updateTransactionDetails(req, res, payload);
    case 'correctTransactionPackage':
      return transactionsController.correctTransactionPackage(req, res, payload);
    case 'correctTransactionFreeRoom':
      return transactionsController.correctTransactionFreeRoom(req, res, payload);
    case 'applyTransactionManualDiscount':
      return transactionsController.applyTransactionManualDiscount(req, res, payload);
    case 'updateTransactionLcDurations':
      return transactionsController.updateTransactionLcDurations(req, res, payload);
    case 'deleteTransaction':
      return transactionsController.deleteTransaction(req, res, payload);
    case 'voidTransactionFnbOrder':
      return transactionsController.voidTransactionFnbOrder(req, res, payload);
    case 'createManualOutageTransaction':
      return transactionsController.createManualOutageTransaction(req, res, payload);
    case 'logReceiptPrint':
      return transactionsController.logReceiptPrint(req, res, payload);
    case 'saveCashierClosing':
      return closingsController.saveCashierClosing(req, res, payload);
    case 'pushOwnerMirrorSnapshot':
      return mirrorController.pushOwnerMirrorSnapshot(req, res, payload);
    case 'validateCashierClosingSnapshot':
      return closingsController.validateCashierClosingSnapshot(req, res, payload);
    case 'assignSessionLcs':
      return lcController.assignSessionLcs(req, res, payload);
    case 'recordPettyCashEntry':
      return lcController.recordPettyCashEntry(req, res, payload);
    case 'createLcCashAdvance':
      return lcController.createLcCashAdvance(req, res, payload);
    case 'createLcSalesBonusLog':
      return lcController.createLcSalesBonusLog(req, res, payload);
    case 'processLcPayroll':
      return lcController.processLcPayroll(req, res, payload);
    case 'initializeLcFinanceFoundation':
      return lcController.initializeLcFinanceFoundation(req, res, payload);
    case 'validateLcFinanceFoundation':
      return lcController.validateLcFinanceFoundation(req, res, payload);
    case 'initializePackageSessionFoundation':
      return successResponse(res, { message: 'Package session foundation siap.', initialized: true, valid: true });
    case 'validatePackageSessionFoundation':
      return successResponse(res, { message: 'Package session foundation siap.', initialized: true, valid: true });
    case 'initializeStockFromJul31':
      return successResponse(res, { message: 'Fondasi stok lokal siap; inisialisasi massal produksi tidak dijalankan otomatis.', initialized: false });
    case 'sendTvCommand':
      return tvController.sendTvCommand(req, res, payload);
    case 'saveTvDevice':
      return tvController.saveTvDevice(req, res, payload);
    case 'updateTvDevice':
      return tvController.saveTvDevice(req, res, payload);
    case 'rotateTvDisplayToken':
      return tvController.rotateTvDisplayToken(req, res, payload);
    case 'seedPilotTvDisplay':
      return tvController.seedPilotTvDisplay(req, res, payload);
    case 'seedTvDisplaysForAllRooms':
      return tvController.seedTvDisplaysForAllRooms(req, res, payload);
    case 'saveRoomMaster':
      return masterDataController.saveRoomMaster(req, res, payload);
    case 'updateRoomMaster':
      return masterDataController.updateRoomMaster(req, res, payload);
    case 'deleteRoomMaster':
      return masterDataController.deleteRoomMaster(req, res, payload);
    case 'saveMenuMaster':
      return masterDataController.saveMenuMaster(req, res, payload);
    case 'updateMenuMaster':
      return masterDataController.updateMenuMaster(req, res, payload);
    case 'deleteMenuMaster':
      return masterDataController.deleteMenuMaster(req, res, payload);
    case 'bulkUpdateMenuProfitability':
      return masterDataController.bulkUpdateMenuProfitability(req, res, payload);
    case 'saveInventoryMaster':
      return masterDataController.saveInventoryMaster(req, res, payload);
    case 'updateInventoryMaster':
      return masterDataController.updateInventoryMaster(req, res, payload);
    case 'deleteInventoryMaster':
      return masterDataController.deleteInventoryMaster(req, res, payload);
    case 'saveLcMaster':
      return masterDataController.saveLcMaster(req, res, payload);
    case 'updateLcMaster':
      return masterDataController.updateLcMaster(req, res, payload);
    case 'deleteLcMaster':
      return masterDataController.deleteLcMaster(req, res, payload);
    case 'savePackageMaster':
      return masterDataController.savePackageMaster(req, res, payload);
    case 'updatePackageMaster':
      return masterDataController.updatePackageMaster(req, res, payload);
    case 'deletePackageMaster':
      return masterDataController.deletePackageMaster(req, res, payload);
    case 'savePromo':
      return masterDataController.savePromo(req, res, payload);
    case 'updatePromoStatus':
      return masterDataController.updatePromoStatus(req, res, payload);
    case 'deletePromo':
      return masterDataController.deletePromo(req, res, payload);
    case 'bulkImportPackages':
      return masterDataController.bulkImportPackages(req, res, payload);
    case 'seedReceptionistEmployee':
      return masterDataController.seedReceptionistEmployee(req, res, payload);
    case 'validateAdminPin':
      return masterDataController.validateAdminPin(req, res, payload);
    default:
      return errorResponse(res, `Aksi POST tidak dikenal: ${action}`, 'UNKNOWN_ACTION');
  }
}

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzjBoz2FvaRqTdsmdR-eYQBRvzPVqGV0lf-FPJlDgfFDQ0bxSWr8JVpgxICBwIkI7CK/exec';

async function forwardToAppsScript(req, res, action, payload) {
  try {
    const isPost = req.method === 'POST';
    let targetUrl = `${APPS_SCRIPT_URL}?action=${encodeURIComponent(action)}`;

    if (!isPost && req.query) {
      const queryParams = new URLSearchParams(req.query);
      targetUrl = `${APPS_SCRIPT_URL}?${queryParams.toString()}`;
    }

    const options = {
      method: isPost ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json' },
    };

    if (isPost) {
      options.body = JSON.stringify({ ...(payload || {}), action });
    }

    const response = await fetch(targetUrl, options);
    const data = await response.json();
    return res.json(data);
  } catch (fallbackErr) {
    return errorResponse(res, `Gagal memuat data dari database lokal maupun cloud: ${fallbackErr.message}`);
  }
}

// Legacy Web App GET compatibility route (/exec)
router.get('/exec', async (req, res) => {
  const action = req.query.action || '';
  if (!action) return errorResponse(res, 'Parameter action wajib diisi.');
  try {
    return await handleGetAction(action, req, res);
  } catch (err) {
    if (err.message && err.message.includes('DATABASE_OFFLINE')) {
      console.warn(`[API Fallback] PostgreSQL lokal offline untuk aksi '${action}'. Mengalihkan ke Cloud Apps Script...`);
      return forwardToAppsScript(req, res, action, null);
    }
    return errorResponse(res, err.message);
  }
});

// Legacy Web App POST compatibility route (/exec)
router.post('/exec', async (req, res) => {
  let payload = req.body || {};
  // Handle text/plain JSON strings sent by Apps Script clients
  if (typeof payload === 'string') {
    try { payload = JSON.parse(payload); } catch (e) { /* keep as is */ }
  }
  const action = payload.action || req.query.action || '';
  if (!action) return errorResponse(res, 'Parameter action wajib diisi.');
  try {
    return await handlePostAction(action, req, res, payload);
  } catch (err) {
    if (err.message && err.message.includes('DATABASE_OFFLINE')) {
      console.warn(`[API Fallback] PostgreSQL lokal offline untuk aksi '${action}'. Mengalihkan ke Cloud Apps Script...`);
      return forwardToAppsScript(req, res, action, payload);
    }
    return errorResponse(res, err.message);
  }
});

// RESTful aliases
router.get('/rooms', (req, res) => roomsController.getRooms(req, res));
router.get('/menu', (req, res) => fnbController.getMenuItems(req, res));
router.get('/inventory', (req, res) => inventoryController.getInventoryItems(req, res));
router.get('/transactions', (req, res) => transactionsController.getTodayTransactions(req, res));
router.get('/closings', (req, res) => closingsController.getTodayCashierClosings(req, res));

module.exports = router;
