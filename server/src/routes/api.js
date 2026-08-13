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
const { successResponse, errorResponse } = require('../utils/response');

// Helper to handle Apps Script GET actions
async function handleGetAction(action, req, res) {
  switch (action) {
    case 'health':
      return successResponse(res, { status: 'healthy', database: 'postgresql_local' });
    case 'getRooms':
      return roomsController.getRooms(req, res);
    case 'getMenuItems':
      return fnbController.getMenuItems(req, res);
    case 'getOpenFnbOrders':
      return fnbController.getOpenFnbOrders(req, res, req.query.room_id);
    case 'getInventoryItems':
      return inventoryController.getInventoryItems(req, res);
    case 'getTodayTransactions':
      return transactionsController.getTodayTransactions(req, res);
    case 'getTodayCashierClosings':
      return closingsController.getTodayCashierClosings(req, res);
    case 'getLcMasterList':
      return lcController.getLcMasterList(req, res);
    case 'getTvDevices':
      return tvController.getTvDevices(req, res);
    case 'getEmployees':
      return masterDataController.getEmployees(req, res);
    case 'getPackages':
      return masterDataController.getPackages(req, res);
    case 'getPromos':
      return masterDataController.getPromos(req, res);
    case 'getApiCapabilities':
      return successResponse(res, { local_first: true, postgresql: true, outbox_sync: true });
    default:
      return errorResponse(res, `Aksi GET tidak dikenal: ${action}`, 'UNKNOWN_ACTION');
  }
}

// Helper to handle Apps Script POST actions
async function handlePostAction(action, req, res, payload) {
  switch (action) {
    case 'startSession':
      return roomsController.startSession(req, res, payload);
    case 'extendSession':
      return roomsController.extendSession(req, res, payload);
    case 'closeSession':
      return roomsController.closeSession(req, res, payload);
    case 'completeCleaning':
      return roomsController.completeCleaning(req, res, payload);
    case 'saveFnbOrder':
      return fnbController.saveFnbOrder(req, res, payload);
    case 'cancelFnbOrder':
      return fnbController.cancelFnbOrder(req, res, payload);
    case 'adjustInventoryStock':
      return inventoryController.adjustInventoryStock(req, res, payload);
    case 'markTransactionPaid':
      return transactionsController.markTransactionPaid(req, res, payload);
    case 'logReceiptPrint':
      return transactionsController.logReceiptPrint(req, res, payload);
    case 'saveCashierClosing':
      return closingsController.saveCashierClosing(req, res, payload);
    case 'assignSessionLcs':
      return lcController.assignSessionLcs(req, res, payload);
    case 'recordPettyCashEntry':
      return lcController.recordPettyCashEntry(req, res, payload);
    case 'sendTvCommand':
      return tvController.sendTvCommand(req, res, payload);
    case 'validateAdminPin':
      return masterDataController.validateAdminPin(req, res, payload);
    default:
      return errorResponse(res, `Aksi POST tidak dikenal: ${action}`, 'UNKNOWN_ACTION');
  }
}

// Legacy Web App GET compatibility route (/exec)
router.get('/exec', (req, res) => {
  const action = req.query.action || '';
  if (!action) return errorResponse(res, 'Parameter action wajib diisi.');
  return handleGetAction(action, req, res);
});

// Legacy Web App POST compatibility route (/exec)
router.post('/exec', (req, res) => {
  let payload = req.body || {};
  // Handle text/plain JSON strings sent by Apps Script clients
  if (typeof payload === 'string') {
    try { payload = JSON.parse(payload); } catch (e) { /* keep as is */ }
  }
  const action = payload.action || req.query.action || '';
  if (!action) return errorResponse(res, 'Parameter action wajib diisi.');
  return handlePostAction(action, req, res, payload);
});

// RESTful aliases
router.get('/rooms', (req, res) => roomsController.getRooms(req, res));
router.get('/menu', (req, res) => fnbController.getMenuItems(req, res));
router.get('/inventory', (req, res) => inventoryController.getInventoryItems(req, res));
router.get('/transactions', (req, res) => transactionsController.getTodayTransactions(req, res));
router.get('/closings', (req, res) => closingsController.getTodayCashierClosings(req, res));

module.exports = router;
