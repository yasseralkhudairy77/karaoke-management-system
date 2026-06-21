/*
 * Karaoke POS API - Google Apps Script backend scaffold.
 *
 * Paste this file into a Google Apps Script project that is bound to the
 * spreadsheet described in SCHEMA.md, then deploy it as a Web App.
 *
 * TODO: In the next phase, connect the frontend to action=getRooms and replace
 * js/mock-data.js as the dashboard data source.
 */

var SERVICE_NAME = "karaoke-pos-api";
var NUMERIC_FIELDS = {
  rate_per_hour: true,
  duration_minutes: true,
  room_total: true,
  fnb_total: true,
  grand_total: true,
  total_transactions: true,
  paid_transactions: true,
  unpaid_transactions: true,
  cash_transactions: true,
  transfer_transactions: true,
  paid_revenue: true,
  cash_expected: true,
  cash_actual: true,
  cash_difference: true,
  transfer_revenue: true,
  unpaid_revenue: true,
  total_revenue: true,
  order_total: true,
  stock_qty: true,
  min_stock: true,
  stock_qty_per_unit: true,
  qty_change: true,
  stock_before: true,
  stock_after: true,
  cost_per_unit: true,
  selling_price: true,
  price: true,
  quantity: true,
  subtotal: true,
  qty_used: true,
  base_salary: true,
};
var CASHIER_CLOSINGS_HEADERS = [
  "closing_id",
  "closing_date",
  "cashier_name",
  "total_transactions",
  "paid_transactions",
  "unpaid_transactions",
  "cash_transactions",
  "transfer_transactions",
  "paid_revenue",
  "cash_expected",
  "cash_actual",
  "cash_difference",
  "transfer_revenue",
  "unpaid_revenue",
  "total_revenue",
  "note",
  "created_at",
];
var FNB_ORDERS_HEADERS = [
  "order_id",
  "room_id",
  "room_name",
  "room_start_time",
  "order_status",
  "order_total",
  "cashier_name",
  "note",
  "created_at",
  "updated_at",
  "cancel_reason",
  "cancelled_by",
  "cancelled_at",
];
var FNB_ORDER_ITEMS_HEADERS = [
  "order_id",
  "menu_id",
  "menu_name",
  "category",
  "price",
  "quantity",
  "subtotal",
  "created_at",
];
var TRANSACTIONS_EXTRA_HEADERS = [
  "fnb_total",
  "grand_total",
  "fnb_order_ids",
];
var MENU_STOCK_HEADERS = [
  "stock_tracking",
  "stock_item_id",
  "stock_qty_per_unit",
];
var INVENTORY_HEADERS = [
  "stock_item_id",
  "stock_item_name",
  "category",
  "unit",
  "stock_qty",
  "min_stock",
  "status",
  "updated_at",
];
var STOCK_MOVEMENTS_HEADERS = [
  "movement_id",
  "created_at",
  "stock_item_id",
  "stock_item_name",
  "movement_type",
  "reference_type",
  "reference_id",
  "qty_change",
  "stock_before",
  "stock_after",
  "note",
  "cashier_name",
];
var ROOMS_BOOKING_HEADERS = [
  "booked_duration_minutes",
  "scheduled_end_time",
];
var ROOM_TIME_LOGS_HEADERS = [
  "log_id",
  "created_at",
  "action_type",
  "room_id",
  "room_name",
  "old_booked_duration_minutes",
  "new_booked_duration_minutes",
  "old_scheduled_end_time",
  "new_scheduled_end_time",
  "add_minutes",
  "cashier_name",
  "note",
];
var TV_DEVICES_HEADERS = [
  "tv_device_id",
  "room_id",
  "device_name",
  "control_type",
  "status",
  "middleware_url",
  "device_identifier",
  "updated_at",
];
var TV_CONTROL_LOGS_HEADERS = [
  "log_id",
  "created_at",
  "room_id",
  "tv_device_id",
  "tv_action",
  "trigger_source",
  "cashier_name",
  "control_type",
  "result",
  "success",
  "block_reason",
  "message",
];
var ROOMS_MASTER_HEADERS = [
  "room_id",
  "room_name",
  "status",
  "start_time",
  "booked_duration_minutes",
  "scheduled_end_time",
  "rate_per_hour",
  "tv_device_id",
  "updated_at",
];
var MENU_MASTER_HEADERS = [
  "menu_id",
  "menu_name",
  "category",
  "price",
  "status",
  "updated_at",
  "stock_tracking",
  "stock_item_id",
  "stock_qty_per_unit",
];
var MASTER_DATA_AUDIT_LOG_HEADERS = [
  "log_id",
  "created_at",
  "entity_type",
  "entity_id",
  "entity_name",
  "action_type",
  "old_value_json",
  "new_value_json",
  "changed_by",
  "note",
  "result",
  "block_reason",
];
var EMPLOYEES_HEADERS = [
  "employee_id",
  "employee_name",
  "role",
  "pin",
  "status",
  "created_at",
  "updated_at",
];

function doGet(e) {
  var action = e && e.parameter ? e.parameter.action : "";

  try {
    if (action === "health") {
      return jsonResponse(healthCheck_());
    }

    if (action === "getRooms") {
      return jsonResponse({
        ok: true,
        rooms: getRooms_(),
      });
    }

    if (action === "getTvDevices") {
      return jsonResponse(getTvDevices_());
    }

    if (action === "getTvControlLogs") {
      return jsonResponse(getTvControlLogs_(
        e.parameter.room_id,
        e.parameter.tv_device_id,
        e.parameter.limit
      ));
    }

    if (action === "getMenuItems") {
      return jsonResponse(getMenuItems_());
    }

    if (action === "getInventoryItems") {
      return jsonResponse(getInventoryItems_());
    }

    if (action === "getTodayTransactions") {
      return jsonResponse(getTransactionsByPeriod_(
        e.parameter.period,
        e.parameter.start_date,
        e.parameter.end_date
      ));
    }

    if (action === "getTodayCashierClosings") {
      return jsonResponse(getCashierClosingsByPeriod_(
        e.parameter.period,
        e.parameter.start_date,
        e.parameter.end_date
      ));
    }

    if (action === "getOpenFnbOrders") {
      return jsonResponse(getOpenFnbOrders_(e.parameter.room_id, e.parameter.room_start_time));
    }

    if (action === "getTodayFnbOrders") {
      return jsonResponse(getTodayFnbOrdersByPeriod_(
        e.parameter.status,
        e.parameter.room_id,
        e.parameter.period,
        e.parameter.start_date,
        e.parameter.end_date
      ));
    }

    if (action === "getTodayStockMovements") {
      return jsonResponse(getTodayStockMovementsByPeriod_(
        e.parameter.stock_item_id,
        e.parameter.movement_type,
        e.parameter.reference_type,
        e.parameter.period,
        e.parameter.start_date,
        e.parameter.end_date
      ));
    }

    if (action === "getTodayFnbSalesReport") {
      return jsonResponse(getTodayFnbSalesReportByPeriod_(
        e.parameter.period,
        e.parameter.start_date,
        e.parameter.end_date
      ));
    }

    if (action === "getTodayRoomTimeLogs") {
      return jsonResponse(getTodayRoomTimeLogsByPeriod_(
        e.parameter.room_id,
        e.parameter.action_type,
        e.parameter.period,
        e.parameter.start_date,
        e.parameter.end_date
      ));
    }

    if (action === "getRoomUsageReport") {
      return jsonResponse(getRoomUsageReportByPeriod_(
        e.parameter.period,
        e.parameter.start_date,
        e.parameter.end_date
      ));
    }

    if (action === "getFnbOrdersByIds") {
      return jsonResponse({
        ok: true,
        orders: getFnbOrdersWithItemsByIds_(parseCommaSeparatedIds_(e.parameter.order_ids)),
      });
    }

    if (action === "getMasterDataAuditLogs") {
      return jsonResponse(getMasterDataAuditLogs_(
        e.parameter.entity_type,
        e.parameter.action_type,
        e.parameter.limit,
        e.parameter.period
      ));
    }

    if (action === "getEmployees") {
      return jsonResponse(getEmployees_());
    }

    return jsonResponse({
      ok: false,
      success: false,
      message: action
        ? "Aksi tidak dikenal: " + action
        : "Parameter action wajib diisi.",
      error: action
        ? "Aksi tidak dikenal: " + action
        : "Parameter action wajib diisi.",
    });
  } catch (error) {
    return jsonResponse({
      ok: false,
      success: false,
      message: error.message,
      error: error.message,
    });
  }
}

function doPost(e) {
  try {
    var payload = parsePostBody_(e);
    var action = payload.action || "";

    if (action === "startSession") {
      return jsonResponse(startSession_(payload.room_id, payload.duration_minutes));
    }

    if (action === "extendSession") {
      return jsonResponse(extendSession_(payload.room_id, payload.add_minutes, payload.cashier_name, payload.note));
    }

    if (action === "closeSession") {
      return jsonResponse(closeSession_(payload.room_id, payload.cashier_name));
    }

    if (action === "markTransactionPaid") {
      return jsonResponse(markTransactionPaid_(payload.transaction_id, payload.payment_method));
    }

    if (action === "saveCashierClosing") {
      return jsonResponse(saveCashierClosing_(payload.cash_actual, payload.note, payload.cashier_name));
    }

    if (action === "saveFnbOrder") {
      return jsonResponse(saveFnbOrder_(payload.room_id, payload.items, payload.cashier_name, payload.note));
    }

    if (action === "cancelFnbOrder") {
      return jsonResponse(cancelFnbOrder_(payload.order_id, payload.cancel_reason, payload.cancelled_by));
    }

    if (action === "sendTvCommand") {
      return jsonResponse(sendTvCommand_(payload));
    }

    if (action === "adjustInventoryStock") {
      return jsonResponse(adjustInventoryStock_(
        payload.stock_item_id,
        payload.adjustment_type,
        payload.quantity,
        payload.note,
        payload.cashier_name
      ));
    }

    if (action === "validateAdminPin") {
      return jsonResponse(validateAdminPin_(payload));
    }

    if (action === "saveRoomMaster") {
      return jsonResponse(saveRoomMaster_(payload));
    }

    if (action === "updateRoomMaster") {
      return jsonResponse(updateRoomMaster_(payload));
    }

    if (action === "saveMenuMaster") {
      return jsonResponse(saveMenuMaster_(payload));
    }

    if (action === "updateMenuMaster") {
      return jsonResponse(updateMenuMaster_(payload));
    }

    if (action === "saveInventoryMaster") {
      return jsonResponse(saveInventoryMaster_(payload));
    }

    if (action === "updateInventoryMaster") {
      return jsonResponse(updateInventoryMaster_(payload));
    }

    if (action === "deleteRoomMaster") {
      return jsonResponse(deleteRoomMaster_(payload));
    }

    if (action === "deleteMenuMaster") {
      return jsonResponse(deleteMenuMaster_(payload));
    }

    if (action === "deleteInventoryMaster") {
      return jsonResponse(deleteInventoryMaster_(payload));
    }

    return jsonResponse({
      ok: false,
      success: false,
      message: action
        ? "Aksi tidak dikenal: " + action
        : "Parameter action wajib diisi.",
      error: action
        ? "Aksi tidak dikenal: " + action
        : "Parameter action wajib diisi.",
    });
  } catch (error) {
    return jsonResponse({
      ok: false,
      success: false,
      message: error.message,
      error: error.message,
    });
  }
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function getSheet_(sheetName) {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();

  if (!spreadsheet) {
    throw new Error("Active spreadsheet was not found.");
  }

  var sheet = spreadsheet.getSheetByName(sheetName);

  if (!sheet) {
    throw new Error("Sheet not found: " + sheetName);
  }

  return sheet;
}

function readSheetAsObjects_(sheetName) {
  var sheet = getSheet_(sheetName);
  var values = sheet.getDataRange().getValues();

  if (values.length < 2) {
    return [];
  }

  var headers = values[0].map(function (header) {
    return String(header).trim();
  });

  return values.slice(1).reduce(function (rows, row) {
    var isEmptyRow = row.every(function (cell) {
      return cell === "" || cell === null;
    });

    if (isEmptyRow) {
      return rows;
    }

    var objectRow = {};

    headers.forEach(function (header, index) {
      if (!header) {
        return;
      }

      objectRow[header] = normalizeCellValue_(header, row[index]);
    });

    rows.push(objectRow);
    return rows;
  }, []);
}

function getRooms_() {
  ensureRoomsBookingColumns_();
  ensureTvDevicesSheet_();
  ensureTvControlLogsSheet_();

  var tvDevicesByRoom = getTvDevicesByRoomMap_();
  var latestTvLogByDevice = getLatestTvControlLogByDeviceMap_();

  return readSheetAsObjects_("Rooms").map(function (room) {
    var tvDevice = tvDevicesByRoom[String(room.room_id || "").trim()] || null;
    var latestTvLog = tvDevice
      ? latestTvLogByDevice[String(tvDevice.tv_device_id || "").trim()] || null
      : null;

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
    };
  });
}

function normalizeTvDevice_(device) {
  return {
    tv_device_id: device.tv_device_id || "",
    room_id: device.room_id || "",
    device_name: device.device_name || "",
    control_type: String(device.control_type || "mock").trim().toLowerCase() || "mock",
    status: String(device.status || "active").trim().toLowerCase() || "active",
    middleware_url: device.middleware_url || "",
    device_identifier: device.device_identifier || "",
    updated_at: device.updated_at || null,
  };
}

function getTvDevices_() {
  ensureTvDevicesSheet_();

  return {
    ok: true,
    success: true,
    tv_devices: readSheetAsObjects_("TVDevices").map(normalizeTvDevice_),
  };
}

function getTvDevicesByRoomMap_() {
  return readSheetAsObjectsOrEmpty_("TVDevices").reduce(function (map, device) {
    var normalizedDevice = normalizeTvDevice_(device);
    var roomId = String(normalizedDevice.room_id || "").trim();

    if (roomId && !map[roomId]) {
      map[roomId] = normalizedDevice;
    }

    return map;
  }, {});
}

function getLatestTvControlLogByDeviceMap_() {
  return readSheetAsObjectsOrEmpty_("TVControlLogs").reduce(function (map, log) {
    var tvDeviceId = String(log.tv_device_id || "").trim();

    if (!tvDeviceId) {
      return map;
    }

    var normalizedLog = normalizeTvControlLog_(log);
    var currentLog = map[tvDeviceId];

    if (!currentLog || String(normalizedLog.created_at || "").localeCompare(String(currentLog.created_at || "")) > 0) {
      map[tvDeviceId] = normalizedLog;
    }

    return map;
  }, {});
}

function buildRoomTvSummary_(room, tvDevice, latestTvLog) {
  if (!tvDevice) {
    return {
      configured: false,
      status: "not_configured",
      status_label: "TV belum disetting",
      last_command: "",
      last_command_at: null,
    };
  }

  var result = latestTvLog ? String(latestTvLog.result || "").trim().toLowerCase() : "";
  var status = "unchecked";

  if (result === "sent") {
    status = "active";
  } else if (result === "failed") {
    status = "failed";
  } else if (result === "timeout") {
    status = "timeout";
  }

  return {
    configured: true,
    room_id: room.room_id || tvDevice.room_id || "",
    tv_device_id: tvDevice.tv_device_id || "",
    device_name: tvDevice.device_name || "",
    control_type: tvDevice.control_type || "mock",
    device_status: tvDevice.status || "active",
    status: status,
    status_label: getTvStatusLabel_(status),
    last_command: latestTvLog ? latestTvLog.tv_action || "" : "",
    last_command_result: latestTvLog ? latestTvLog.result || "" : "",
    last_command_at: latestTvLog ? latestTvLog.created_at || null : null,
  };
}

function getTvStatusLabel_(status) {
  if (status === "active") {
    return "TV: Aktif";
  }

  if (status === "failed") {
    return "TV: Gagal";
  }

  if (status === "timeout") {
    return "TV: Timeout";
  }

  return "TV: Belum dicek";
}

function normalizeTvAction_(tvAction) {
  var action = String(tvAction || "").trim().toLowerCase();
  var validActions = {
    test: true,
    power_on: true,
    power_off: true,
  };

  return validActions[action] ? action : "";
}

function normalizeTvControlLog_(log) {
  return {
    log_id: log.log_id || "",
    created_at: normalizeFnbOrderDateTime_(log.created_at),
    room_id: log.room_id || "",
    tv_device_id: log.tv_device_id || "",
    tv_action: log.tv_action || "",
    trigger_source: log.trigger_source || "",
    cashier_name: log.cashier_name || "",
    control_type: log.control_type || "",
    result: log.result || "",
    success: String(log.success || "").trim().toLowerCase() === "true" || log.success === true,
    block_reason: log.block_reason || "",
    message: log.message || "",
  };
}

function getTvControlLogs_(roomId, tvDeviceId, limit) {
  ensureTvControlLogsSheet_();

  var normalizedRoomId = String(roomId || "").trim();
  var normalizedTvDeviceId = String(tvDeviceId || "").trim();
  var safeLimit = Math.max(1, Math.min(Number(limit) || 100, 500));
  var logs = readSheetAsObjects_("TVControlLogs")
    .filter(function (log) {
      return (
        (!normalizedRoomId || String(log.room_id || "").trim() === normalizedRoomId) &&
        (!normalizedTvDeviceId || String(log.tv_device_id || "").trim() === normalizedTvDeviceId)
      );
    })
    .map(normalizeTvControlLog_)
    .sort(function (first, second) {
      return String(second.created_at || "").localeCompare(String(first.created_at || ""));
    })
    .slice(0, safeLimit);

  return {
    ok: true,
    success: true,
    tv_control_logs: logs,
    logs: logs,
  };
}

function sendTvCommand_(payload) {
  var roomId = String(payload.room_id || "").trim();
  var tvDeviceId = String(payload.tv_device_id || "").trim();
  var tvAction = normalizeTvAction_(payload.tv_action);
  var triggerSource = String(payload.trigger_source || "room_card").trim() || "room_card";
  var cashierName = String(payload.cashier_name || "Kasir").trim() || "Kasir";
  var device = null;
  var response;

  if (!tvAction) {
    response = createTvCommandFailedResponse_(roomId, tvDeviceId, tvAction, triggerSource, cashierName, "", "failed", "TV_ACTION_INVALID");
    appendTvControlLogFromResponse_(response, triggerSource, cashierName, tvAction);
    return response;
  }

  device = findTvDevice_(roomId, tvDeviceId);

  if (!device) {
    response = createTvCommandFailedResponse_(roomId, tvDeviceId, tvAction, triggerSource, cashierName, "", "failed", "TV_DEVICE_NOT_FOUND");
    appendTvControlLogFromResponse_(response, triggerSource, cashierName, tvAction);
    return response;
  }

  if (device.status !== "active") {
    response = createTvCommandFailedResponse_(roomId || device.room_id, device.tv_device_id, tvAction, triggerSource, cashierName, device.control_type, "failed", "TV_DEVICE_INACTIVE");
    appendTvControlLogFromResponse_(response, triggerSource, cashierName, tvAction);
    return response;
  }

  if (device.control_type !== "mock") {
    response = createTvCommandFailedResponse_(roomId || device.room_id, device.tv_device_id, tvAction, triggerSource, cashierName, device.control_type, "failed", "TV_CONTROL_TYPE_UNSUPPORTED");
    appendTvControlLogFromResponse_(response, triggerSource, cashierName, tvAction);
    return response;
  }

  if (device.tv_device_id === "TV-FAIL") {
    response = createTvCommandFailedResponse_(roomId || device.room_id, device.tv_device_id, tvAction, triggerSource, cashierName, device.control_type, "failed", "TV_DEVICE_OFFLINE");
    appendTvControlLogFromResponse_(response, triggerSource, cashierName, tvAction);
    return response;
  }

  if (device.tv_device_id === "TV-TIMEOUT") {
    response = createTvCommandFailedResponse_(roomId || device.room_id, device.tv_device_id, tvAction, triggerSource, cashierName, device.control_type, "timeout", "TV_DEVICE_TIMEOUT");
    appendTvControlLogFromResponse_(response, triggerSource, cashierName, tvAction);
    return response;
  }

  response = {
    ok: true,
    success: true,
    message: "Perintah TV berhasil dikirim.",
    data: {
      room_id: roomId || device.room_id,
      tv_device_id: device.tv_device_id,
      result: "sent",
    },
    tv_action: tvAction,
    control_type: device.control_type,
  };
  appendTvControlLogFromResponse_(response, triggerSource, cashierName, tvAction);

  return response;
}

function findTvDevice_(roomId, tvDeviceId) {
  ensureTvDevicesSheet_();

  var normalizedRoomId = String(roomId || "").trim();
  var normalizedTvDeviceId = String(tvDeviceId || "").trim();

  return readSheetAsObjects_("TVDevices")
    .map(normalizeTvDevice_)
    .filter(function (device) {
      if (normalizedTvDeviceId) {
        return String(device.tv_device_id || "").trim() === normalizedTvDeviceId;
      }

      return normalizedRoomId && String(device.room_id || "").trim() === normalizedRoomId;
    })[0] || null;
}

function createTvCommandFailedResponse_(roomId, tvDeviceId, tvAction, triggerSource, cashierName, controlType, result, blockReason) {
  return {
    ok: false,
    success: false,
    message: "Perintah TV gagal dikirim.",
    block_reason: blockReason,
    data: {
      room_id: roomId || "",
      tv_device_id: tvDeviceId || "",
      result: result || "failed",
    },
    tv_action: tvAction || "",
    trigger_source: triggerSource || "",
    cashier_name: cashierName || "",
    control_type: controlType || "",
  };
}

function appendTvControlLogFromResponse_(response, triggerSource, cashierName, tvAction) {
  appendTvControlLog_({
    log_id: generateTvControlLogId_(),
    created_at: toJakartaIsoString_(new Date()),
    room_id: response && response.data ? response.data.room_id || "" : "",
    tv_device_id: response && response.data ? response.data.tv_device_id || "" : "",
    tv_action: tvAction || response.tv_action || "",
    trigger_source: triggerSource || response.trigger_source || "",
    cashier_name: cashierName || response.cashier_name || "",
    control_type: response.control_type || "",
    result: response && response.data ? response.data.result || "" : "",
    success: response && response.success === true,
    block_reason: response.block_reason || "",
    message: response.message || "",
  });
}

function getMenuItems_() {
  ensureMenuStockColumns_();
  var menuItems = readSheetAsObjects_("Menu")
    .filter(function (menuItem) {
      return menuItem.menu_id && menuItem.menu_name;
    })
    .map(function (menuItem) {
      var price = menuItem.price;
      var status = menuItem.status;

      if (price === "" || price === null || price === undefined) {
        price = menuItem.selling_price;
      }

      if (!status && menuItem.is_active !== "" && menuItem.is_active !== null && menuItem.is_active !== undefined) {
        status = String(menuItem.is_active).toUpperCase() === "TRUE" ? "active" : "inactive";
      }

      return {
        menu_id: menuItem.menu_id || "",
        menu_name: menuItem.menu_name || "",
        category: menuItem.category || "",
        price: Number(price) || 0,
        status: status || "",
        updated_at: menuItem.updated_at || "",
        stock_tracking: menuItem.stock_tracking || "",
        stock_item_id: menuItem.stock_item_id || "",
        stock_qty_per_unit: Number(menuItem.stock_qty_per_unit) || 0,
      };
    })
    .sort(function (first, second) {
      var firstCategory = String(first.category || "");
      var secondCategory = String(second.category || "");
      var categoryCompare = firstCategory.localeCompare(secondCategory);

      if (categoryCompare !== 0) {
        return categoryCompare;
      }

      return String(first.menu_name || "").localeCompare(String(second.menu_name || ""));
    });

  return {
    ok: true,
    menu_items: menuItems,
  };
}

function getInventoryItems_() {
  ensureInventorySheetColumns_();

  var items = readSheetAsObjects_("Inventory")
    .map(function (item) {
      var stockItemId = item.stock_item_id || item.item_id || "";
      var stockItemName = item.stock_item_name || item.item_name || "";
      var stockQty = Number(item.stock_qty) || 0;
      var minStock = Number(item.min_stock) || 0;

      return {
        stock_item_id: stockItemId,
        stock_item_name: stockItemName,
        category: item.category || "",
        unit: item.unit || "",
        stock_qty: stockQty,
        min_stock: minStock,
        status: item.status || "",
        stock_status: getInventoryStatus_(stockQty, minStock),
        updated_at: item.updated_at || "",
      };
    })
    .filter(function (item) {
      return item.stock_item_id || item.stock_item_name;
    })
    .sort(function (first, second) {
      var categoryCompare = String(first.category || "").localeCompare(String(second.category || ""));

      if (categoryCompare !== 0) {
        return categoryCompare;
      }

      return String(first.stock_item_name || "").localeCompare(String(second.stock_item_name || ""));
    });
  var summary = items.reduce(function (result, item) {
    result.total_items += 1;

    if (item.stock_status === "negative") {
      result.negative_items += 1;
    } else if (item.stock_status === "low") {
      result.low_items += 1;
    } else {
      result.safe_items += 1;
    }

    return result;
  }, {
    total_items: 0,
    safe_items: 0,
    low_items: 0,
    negative_items: 0,
  });

  return {
    ok: true,
    items: items,
    summary: summary,
  };
}

function getInventoryStatus_(stockQty, minStock) {
  if (stockQty < 0) {
    return "negative";
  }

  if (stockQty <= minStock) {
    return "low";
  }

  return "safe";
}

function adjustInventoryStock_(stockItemId, adjustmentType, quantity, note, cashierName) {
  var normalizedStockItemId = String(stockItemId || "").trim();
  var normalizedAdjustmentType = String(adjustmentType || "").trim();

  if (!normalizedStockItemId) {
    return {
      ok: false,
      error: "stock_item_id wajib diisi.",
    };
  }

  if (["restock", "set_stock"].indexOf(normalizedAdjustmentType) === -1) {
    return {
      ok: false,
      error: "Jenis perubahan stok tidak dikenal.",
    };
  }

  var parsedQuantity = normalizedAdjustmentType === "restock"
    ? toPositiveStockQuantity_(quantity)
    : toNonNegativeStockQuantity_(quantity);

  if (parsedQuantity === null) {
    return {
      ok: false,
      error: normalizedAdjustmentType === "restock"
        ? "Jumlah restock harus lebih dari 0."
        : "Stok aktual harus 0 atau lebih.",
    };
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    var inventorySheet = ensureInventorySheetColumns_();
    ensureStockMovementsSheet_();
    var inventoryHeaderMap = getHeaderMap_(inventorySheet);
    var rowNumber = findInventoryRowByStockItemId_(normalizedStockItemId, inventorySheet, inventoryHeaderMap);

    if (!rowNumber) {
      return {
        ok: false,
        error: "Item stok tidak ditemukan.",
      };
    }

    var currentItem = buildInventoryItemFromRow_(inventorySheet, inventoryHeaderMap, rowNumber);

    if (!isInventoryItemActive_(currentItem.status)) {
      return {
        ok: false,
        error: "Item stok tidak aktif.",
      };
    }

    var stockBefore = Number(currentItem.stock_qty) || 0;
    var stockAfter = normalizedAdjustmentType === "restock"
      ? stockBefore + parsedQuantity
      : parsedQuantity;
    var qtyChange = stockAfter - stockBefore;

    if (qtyChange === 0) {
      return {
        ok: false,
        error: "Stok tidak berubah.",
      };
    }

    var now = toJakartaIsoString_(new Date());
    var movementId = generateStockMovementId_();
    var movement = {
      movement_id: movementId,
      created_at: now,
      stock_item_id: currentItem.stock_item_id,
      stock_item_name: currentItem.stock_item_name,
      movement_type: normalizedAdjustmentType === "restock" ? "in" : "adjustment",
      reference_type: "manual_adjustment",
      reference_id: movementId,
      qty_change: qtyChange,
      stock_before: stockBefore,
      stock_after: stockAfter,
      note: String(note || "").trim(),
      cashier_name: String(cashierName || "").trim() || "Kasir",
    };

    inventorySheet.getRange(rowNumber, inventoryHeaderMap.stock_qty).setValue(stockAfter);

    if (inventoryHeaderMap.updated_at) {
      inventorySheet.getRange(rowNumber, inventoryHeaderMap.updated_at).setValue(now);
    }

    appendStockMovement_(movement);

    var updatedItem = buildInventoryItemFromRow_(inventorySheet, inventoryHeaderMap, rowNumber);

    return {
      ok: true,
      message: "Stok berhasil diperbarui.",
      stock_item: {
        stock_item_id: updatedItem.stock_item_id,
        stock_item_name: updatedItem.stock_item_name,
        stock_before: stockBefore,
        stock_after: stockAfter,
        qty_change: qtyChange,
        status: updatedItem.stock_status,
      },
      stock_movement: {
        movement_id: movement.movement_id,
        movement_type: movement.movement_type,
        reference_type: movement.reference_type,
        reference_id: movement.reference_id,
        qty_change: movement.qty_change,
        stock_before: movement.stock_before,
        stock_after: movement.stock_after,
        note: movement.note,
        cashier_name: movement.cashier_name,
        created_at: movement.created_at,
      },
      item: updatedItem,
      movement: movement,
    };
  } finally {
    lock.releaseLock();
  }
}

function isInventoryItemActive_(status) {
  var normalizedStatus = String(status || "").trim().toLowerCase();

  if (!normalizedStatus) {
    return true;
  }

  return normalizedStatus === "active";
}

function findInventoryRowByStockItemId_(stockItemId, sheet, headerMap) {
  var targetSheet = sheet || ensureInventorySheetColumns_();
  var targetHeaderMap = headerMap || getHeaderMap_(targetSheet);
  var stockItemColumn = targetHeaderMap.stock_item_id;
  var legacyItemColumn = targetHeaderMap.item_id;

  if (!stockItemColumn && !legacyItemColumn) {
    throw new Error("Kolom stock_item_id tidak ditemukan.");
  }

  var lastRow = targetSheet.getLastRow();

  if (lastRow < 2) {
    return null;
  }

  var stockItemValues = stockItemColumn
    ? targetSheet.getRange(2, stockItemColumn, lastRow - 1, 1).getValues()
    : [];
  var legacyItemValues = legacyItemColumn
    ? targetSheet.getRange(2, legacyItemColumn, lastRow - 1, 1).getValues()
    : [];

  for (var index = 0; index < lastRow - 1; index++) {
    var currentStockItemId = stockItemValues[index] ? String(stockItemValues[index][0]).trim() : "";
    var currentLegacyItemId = legacyItemValues[index] ? String(legacyItemValues[index][0]).trim() : "";

    if (currentStockItemId === String(stockItemId || "").trim() || currentLegacyItemId === String(stockItemId || "").trim()) {
      return index + 2;
    }
  }

  return null;
}

function buildInventoryItemFromRow_(sheet, headerMap, rowNumber) {
  var row = getRowObject_(sheet, headerMap, rowNumber);
  var stockQty = Number(row.stock_qty) || 0;
  var minStock = Number(row.min_stock) || 0;

  return {
    stock_item_id: row.stock_item_id || row.item_id || "",
    stock_item_name: row.stock_item_name || row.item_name || "",
    category: row.category || "",
    unit: row.unit || "",
    stock_qty: stockQty,
    min_stock: minStock,
    status: row.status || "",
    stock_status: getInventoryStatus_(stockQty, minStock),
    updated_at: row.updated_at || "",
  };
}

function toPositiveStockQuantity_(value) {
  var numberValue = Number(value);

  if (!isFinite(numberValue) || numberValue <= 0) {
    return null;
  }

  return numberValue;
}

function toNonNegativeStockQuantity_(value) {
  var numberValue = Number(value);

  if (!isFinite(numberValue) || numberValue < 0) {
    return null;
  }

  return numberValue;
}

function masterSuccessResponse_(message, data) {
  return {
    ok: true,
    success: true,
    message: message,
    data: data,
  };
}

function masterBlockedResponse_(message, blockReason, data) {
  return {
    ok: false,
    success: false,
    message: message,
    error: message,
    block_reason: blockReason,
    data: data || null,
  };
}

function masterError_(message) {
  throw new Error(message);
}

function normalizeMasterStatus_(status, allowedStatuses, fallback) {
  var normalizedStatus = String(status || fallback || "").trim().toLowerCase();

  if (allowedStatuses.indexOf(normalizedStatus) === -1) {
    masterError_("Status tidak valid.");
  }

  return normalizedStatus;
}

function getSheetHeaders_(sheet) {
  return sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(function (header) {
    return String(header).trim();
  });
}

function ensureColumns_(sheet, headers) {
  var existingHeaders = getSheetHeaders_(sheet);

  headers.forEach(function (header) {
    if (existingHeaders.indexOf(header) === -1) {
      sheet.getRange(1, sheet.getLastColumn() + 1).setValue(header);
      existingHeaders.push(header);
    }
  });

  return sheet;
}

function ensureRoomsMasterColumns_() {
  var sheet = ensureSheetWithHeaders_("Rooms", ROOMS_MASTER_HEADERS);
  ensureColumns_(sheet, ROOMS_MASTER_HEADERS);
  ensureColumns_(sheet, ROOMS_BOOKING_HEADERS);
  return sheet;
}

function ensureMenuMasterColumns_() {
  var sheet = ensureSheetWithHeaders_("Menu", MENU_MASTER_HEADERS);
  ensureColumns_(sheet, MENU_MASTER_HEADERS);
  ensureColumns_(sheet, MENU_STOCK_HEADERS);
  return sheet;
}

function ensureMasterDataAuditLogsSheet_() {
  var sheet = ensureSheetWithHeaders_("MasterDataAuditLogs", MASTER_DATA_AUDIT_LOG_HEADERS);
  ensureColumns_(sheet, MASTER_DATA_AUDIT_LOG_HEADERS);
  return sheet;
}

function ensureEmployeesSheet_() {
  var sheet = ensureSheetWithHeaders_("Employees", EMPLOYEES_HEADERS);
  ensureColumns_(sheet, EMPLOYEES_HEADERS);
  return sheet;
}

function sanitizeEmployeeForAccess_(employee) {
  if (!employee) {
    return null;
  }

  return {
    employee_id: employee.employee_id || "",
    employee_name: employee.employee_name || "",
    role: String(employee.role || "").trim().toLowerCase(),
    status: getEmployeeStatus_(employee),
  };
}

function getEmployeeStatus_(employee) {
  return String(employee && employee.status || "active").trim().toLowerCase() || "active";
}

function getEmployees_() {
  ensureEmployeesSheet_();

  return {
    ok: true,
    success: true,
    employees: readSheetAsObjects_("Employees").map(sanitizeEmployeeForAccess_),
  };
}

function roleMeetsRequired_(role, requiredRole) {
  var normalizedRole = String(role || "").trim().toLowerCase();
  var normalizedRequiredRole = String(requiredRole || "admin").trim().toLowerCase();
  var rank = {
    staff: 1,
    cashier: 2,
    admin: 3,
    owner: 4,
  };

  if (normalizedRole === "owner") {
    return true;
  }

  return (rank[normalizedRole] || 0) >= (rank[normalizedRequiredRole] || rank.admin);
}

function auditAdminPinValidation_(payload, result, blockReason, employee) {
  var requestedAction = String(payload.requested_action || "admin_pin").trim();
  var safeEmployee = sanitizeEmployeeForAccess_(employee);

  appendMasterDataAuditLog_({
    entity_type: "access",
    entity_id: requestedAction,
    entity_name: requestedAction,
    action_type: "pin_validation",
    old_value: "",
    new_value: safeEmployee
      ? {
        employee_id: safeEmployee.employee_id,
        employee_name: safeEmployee.employee_name,
        role: safeEmployee.role,
        status: safeEmployee.status,
        required_role: payload.required_role || "admin",
        requested_action: requestedAction,
      }
      : {
        required_role: payload.required_role || "admin",
        requested_action: requestedAction,
      },
    changed_by: safeEmployee ? safeEmployee.employee_name : payload.changed_by || "Admin",
    note: requestedAction,
    result: result,
    block_reason: blockReason || "",
  });
}

function validateAdminPinPayload_(pin, requiredRole, requestedAction, changedBy, shouldAudit) {
  ensureEmployeesSheet_();

  var payload = {
    pin: pin,
    required_role: requiredRole || "admin",
    requested_action: requestedAction || "admin_pin",
    changed_by: changedBy || "Admin",
  };
  var normalizedPin = String(pin || "").trim();

  if (!normalizedPin) {
    if (shouldAudit !== false) {
      auditAdminPinValidation_(payload, "blocked", "EMPTY_PIN", null);
    }

    return {
      ok: false,
      success: false,
      message: "PIN admin wajib diisi.",
      block_reason: "EMPTY_PIN",
    };
  }

  var employees = readSheetAsObjects_("Employees");
  var employee = employees.find(function (item) {
    return getEmployeeStatus_(item) === "active"
      && String(item.pin || "").trim() === normalizedPin;
  });

  if (!employee) {
    if (shouldAudit !== false) {
      auditAdminPinValidation_(payload, "blocked", "INVALID_PIN", null);
    }

    return {
      ok: false,
      success: false,
      message: "PIN admin tidak valid.",
      block_reason: "INVALID_PIN",
    };
  }

  if (!roleMeetsRequired_(employee.role, payload.required_role)) {
    if (shouldAudit !== false) {
      auditAdminPinValidation_(payload, "blocked", "INSUFFICIENT_ROLE", employee);
    }

    return {
      ok: false,
      success: false,
      message: "Role tidak memiliki akses untuk aksi ini.",
      block_reason: "INSUFFICIENT_ROLE",
      employee: sanitizeEmployeeForAccess_(employee),
    };
  }

  if (shouldAudit !== false) {
    auditAdminPinValidation_(payload, "success", "", employee);
  }

  return {
    ok: true,
    success: true,
    message: "PIN admin valid.",
    employee: sanitizeEmployeeForAccess_(employee),
  };
}

function validateAdminPin_(payload) {
  var result = validateAdminPinPayload_(
    payload.pin,
    payload.required_role || "admin",
    payload.requested_action || "admin_pin",
    payload.changed_by || "Admin",
    true
  );

  if (result.success) {
    return {
      ok: true,
      success: true,
      message: result.message,
      data: result.employee,
    };
  }

  return {
    ok: false,
    success: false,
    message: result.message,
    block_reason: result.block_reason,
    data: result.employee || null,
  };
}

function stringifySafeJson_(value) {
  if (value === "" || value === null || value === undefined) {
    return "";
  }

  try {
    return JSON.stringify(value);
  } catch (error) {
    return JSON.stringify({ error: "JSON stringify failed" });
  }
}

function getNextAuditLogId_() {
  var sheet = ensureMasterDataAuditLogsSheet_();
  var headerMap = getHeaderMap_(sheet);
  var column = headerMap.log_id;
  var maxNumber = 0;

  if (column && sheet.getLastRow() >= 2) {
    sheet.getRange(2, column, sheet.getLastRow() - 1, 1).getValues().forEach(function (row) {
      var value = String(row[0] || "").trim();
      var match = value.match(/^AUDIT-(\d+)$/);

      if (match) {
        maxNumber = Math.max(maxNumber, Number(match[1]) || 0);
      }
    });
  }

  return "AUDIT-" + String(maxNumber + 1).padStart(6, "0");
}

function appendMasterDataAuditLog_(entry) {
  var lock = LockService.getDocumentLock();
  lock.waitLock(10000);

  try {
    var sheet = ensureMasterDataAuditLogsSheet_();
    var log = {
      log_id: getNextAuditLogId_(),
      created_at: toJakartaIsoString_(new Date()),
      entity_type: entry.entity_type || "",
      entity_id: entry.entity_id || "",
      entity_name: entry.entity_name || "",
      action_type: entry.action_type || "",
      old_value_json: stringifySafeJson_(entry.old_value),
      new_value_json: stringifySafeJson_(entry.new_value),
      changed_by: entry.changed_by || "Admin",
      note: entry.note || "",
      result: entry.result || "success",
      block_reason: entry.block_reason || "",
    };

    appendObjectRow_(sheet, log);
    return log;
  } finally {
    lock.releaseLock();
  }
}

function getMasterDataAuditLogs_(entityType, actionType, limit, period) {
  ensureMasterDataAuditLogsSheet_();
  var normalizedEntityType = String(entityType || "all").trim().toLowerCase();
  var normalizedActionType = String(actionType || "").trim().toLowerCase();
  var normalizedPeriod = String(period || "all").trim().toLowerCase();
  var safeLimit = Math.max(1, Math.min(Number(limit) || 100, 500));
  var today = getJakartaDateString_(new Date());

  var logs = readSheetAsObjects_("MasterDataAuditLogs")
    .filter(function (log) {
      if (normalizedEntityType !== "all" && normalizedEntityType && String(log.entity_type || "").trim().toLowerCase() !== normalizedEntityType) {
        return false;
      }

      if (normalizedActionType && String(log.action_type || "").trim().toLowerCase() !== normalizedActionType) {
        return false;
      }

      if (normalizedPeriod === "today") {
        return getOperationalDateString_(log.created_at) === today;
      }

      if (normalizedPeriod === "last7days") {
        var logDate = getOperationalDateString_(log.created_at);
        var startDate = new Date(today + "T00:00:00");
        startDate.setDate(startDate.getDate() - 6);
        var start = Utilities.formatDate(startDate, "Asia/Jakarta", "yyyy-MM-dd");
        return logDate >= start && logDate <= today;
      }

      return true;
    })
    .map(function (log) {
      return {
        log_id: log.log_id || "",
        created_at: log.created_at || "",
        entity_type: log.entity_type || "",
        entity_id: log.entity_id || "",
        entity_name: log.entity_name || "",
        action_type: log.action_type || "",
        old_value_json: log.old_value_json || "",
        new_value_json: log.new_value_json || "",
        changed_by: log.changed_by || "",
        note: log.note || "",
        result: log.result || "",
        block_reason: log.block_reason || "",
      };
    })
    .sort(function (a, b) {
      return String(b.created_at || "").localeCompare(String(a.created_at || ""));
    })
    .slice(0, safeLimit);

  return {
    ok: true,
    success: true,
    data: logs,
    logs: logs,
  };
}

function getMasterChangedBy_(payload) {
  return String(payload.changed_by || payload.cashier_name || "Admin").trim() || "Admin";
}

function getMasterNote_(payload) {
  return String(payload.note || "").trim();
}

function getMasterActionType_(entityType, oldValue, newValue) {
  var oldStatus = String(oldValue && oldValue.status || "").trim().toLowerCase();
  var newStatus = String(newValue && newValue.status || "").trim().toLowerCase();

  if (entityType === "room" && oldStatus !== newStatus && newStatus === "maintenance") {
    return "maintenance";
  }

  if ((entityType === "menu" || entityType === "inventory") && oldStatus !== newStatus) {
    if (newStatus === "active") {
      return "activate";
    }

    if (newStatus === "inactive") {
      return "deactivate";
    }
  }

  return "update";
}

function generateSequentialId_(sheet, headerMap, columnName, prefix) {
  var column = headerMap[columnName];
  var maxNumber = 0;

  if (!column || sheet.getLastRow() < 2) {
    return prefix + "-001";
  }

  sheet.getRange(2, column, sheet.getLastRow() - 1, 1).getValues().forEach(function (row) {
    var value = String(row[0] || "").trim();
    var match = value.match(new RegExp("^" + prefix + "-(\\d+)$"));

    if (match) {
      maxNumber = Math.max(maxNumber, Number(match[1]) || 0);
    }
  });

  return prefix + "-" + String(maxNumber + 1).padStart(3, "0");
}

function appendObjectRow_(sheet, objectData) {
  var rowValues = getSheetHeaders_(sheet).map(function (header) {
    return objectData[header] !== undefined ? objectData[header] : "";
  });

  sheet.appendRow(rowValues);
}

function setRowValues_(sheet, headerMap, rowNumber, objectData) {
  Object.keys(objectData).forEach(function (key) {
    if (headerMap[key]) {
      sheet.getRange(rowNumber, headerMap[key]).setValue(objectData[key]);
    }
  });
}

function validateRoomMasterPayload_(payload, isUpdate) {
  var roomName = String(payload.room_name || "").trim();
  var ratePerHour = Number(payload.rate_per_hour);
  var status = normalizeMasterStatus_(payload.status, ["available", "occupied", "maintenance"], "available");

  if (isUpdate && !String(payload.room_id || "").trim()) {
    masterError_("room_id wajib diisi.");
  }

  if (!roomName) {
    masterError_("Nama room wajib diisi.");
  }

  if (!isFinite(ratePerHour) || ratePerHour <= 0) {
    masterError_("Tarif room wajib angka lebih dari 0.");
  }

  return {
    room_name: roomName,
    rate_per_hour: ratePerHour,
    tv_device_id: String(payload.tv_device_id || "").trim(),
    status: status,
  };
}

function saveRoomMaster_(payload) {
  var data = validateRoomMasterPayload_(payload, false);
  var sheet = ensureRoomsMasterColumns_();
  var headerMap = getHeaderMap_(sheet);
  var roomId = generateSequentialId_(sheet, headerMap, "room_id", "ROOM");
  var room = {
    room_id: roomId,
    room_name: data.room_name,
    status: data.status,
    start_time: "",
    booked_duration_minutes: "",
    scheduled_end_time: "",
    rate_per_hour: data.rate_per_hour,
    tv_device_id: data.tv_device_id,
    updated_at: toJakartaIsoString_(new Date()),
  };

  appendObjectRow_(sheet, room);
  var savedRoom = getRoomFromRow_(sheet, getHeaderMap_(sheet), sheet.getLastRow());

  appendMasterDataAuditLog_({
    entity_type: "room",
    entity_id: savedRoom.room_id,
    entity_name: savedRoom.room_name,
    action_type: "create",
    old_value: "",
    new_value: savedRoom,
    changed_by: getMasterChangedBy_(payload),
    note: getMasterNote_(payload),
    result: "success",
  });

  return masterSuccessResponse_("Data room berhasil disimpan.", savedRoom);
}

function updateRoomMaster_(payload) {
  var roomId = String(payload.room_id || "").trim();
  var data = validateRoomMasterPayload_(payload, true);
  var sheet = ensureRoomsMasterColumns_();
  var headerMap = getHeaderMap_(sheet);
  var rowNumber = findRowByValue_(sheet, headerMap, "room_id", roomId);

  if (!rowNumber) {
    masterError_("Room tidak ditemukan.");
  }

  var currentRoom = getRoomFromRow_(sheet, headerMap, rowNumber);

  if (String(currentRoom.status || "").trim().toLowerCase() === "occupied" && data.status !== "occupied") {
    masterError_("Room occupied tidak boleh diubah statusnya dari menu pengaturan.");
  }

  setRowValues_(sheet, headerMap, rowNumber, {
    room_name: data.room_name,
    rate_per_hour: data.rate_per_hour,
    tv_device_id: data.tv_device_id,
    status: data.status,
    updated_at: toJakartaIsoString_(new Date()),
  });
  var updatedRoom = getRoomFromRow_(sheet, headerMap, rowNumber);

  appendMasterDataAuditLog_({
    entity_type: "room",
    entity_id: updatedRoom.room_id,
    entity_name: updatedRoom.room_name,
    action_type: getMasterActionType_("room", currentRoom, updatedRoom),
    old_value: currentRoom,
    new_value: updatedRoom,
    changed_by: getMasterChangedBy_(payload),
    note: getMasterNote_(payload),
    result: "success",
  });

  return masterSuccessResponse_("Data room berhasil diperbarui.", updatedRoom);
}

function validateMenuMasterPayload_(payload, isUpdate) {
  var menuName = String(payload.menu_name || "").trim();
  var category = String(payload.category || "").trim();
  var price = Number(payload.price);
  var stockItemId = String(payload.stock_item_id || "").trim();
  var qtyPerUnit = Number(payload.qty_per_unit || payload.stock_qty_per_unit || 0);
  var status = normalizeMasterStatus_(payload.status, ["active", "inactive"], "active");

  if (isUpdate && !String(payload.menu_id || "").trim()) {
    masterError_("menu_id wajib diisi.");
  }

  if (!menuName) {
    masterError_("Nama menu wajib diisi.");
  }

  if (!category) {
    masterError_("Kategori menu wajib diisi.");
  }

  if (!isFinite(price) || price < 0) {
    masterError_("Harga menu wajib angka 0 atau lebih.");
  }

  if (stockItemId && (!isFinite(qtyPerUnit) || qtyPerUnit < 0)) {
    masterError_("Qty stok per unit wajib angka 0 atau lebih jika stock item diisi.");
  }

  return {
    menu_name: menuName,
    category: category,
    price: price,
    stock_item_id: stockItemId,
    stock_qty_per_unit: stockItemId ? qtyPerUnit : 0,
    stock_tracking: stockItemId ? "yes" : "no",
    status: status,
  };
}

function getMenuMasterRow_(sheet, headerMap, rowNumber) {
  var row = getRowObject_(sheet, headerMap, rowNumber);

  return {
    menu_id: row.menu_id || "",
    menu_name: row.menu_name || "",
    category: row.category || "",
    price: Number(row.price) || 0,
    status: row.status || "",
    updated_at: row.updated_at || "",
    stock_tracking: row.stock_tracking || "",
    stock_item_id: row.stock_item_id || "",
    stock_qty_per_unit: Number(row.stock_qty_per_unit) || 0,
  };
}

function saveMenuMaster_(payload) {
  var data = validateMenuMasterPayload_(payload, false);
  var sheet = ensureMenuMasterColumns_();
  var headerMap = getHeaderMap_(sheet);
  var menuId = generateSequentialId_(sheet, headerMap, "menu_id", "MENU");
  var menu = {
    menu_id: menuId,
    menu_name: data.menu_name,
    category: data.category,
    price: data.price,
    status: data.status,
    updated_at: toJakartaIsoString_(new Date()),
    stock_tracking: data.stock_tracking,
    stock_item_id: data.stock_item_id,
    stock_qty_per_unit: data.stock_qty_per_unit,
  };

  appendObjectRow_(sheet, menu);
  var savedMenu = getMenuMasterRow_(sheet, getHeaderMap_(sheet), sheet.getLastRow());

  appendMasterDataAuditLog_({
    entity_type: "menu",
    entity_id: savedMenu.menu_id,
    entity_name: savedMenu.menu_name,
    action_type: "create",
    old_value: "",
    new_value: savedMenu,
    changed_by: getMasterChangedBy_(payload),
    note: getMasterNote_(payload),
    result: "success",
  });

  return masterSuccessResponse_("Data menu berhasil disimpan.", savedMenu);
}

function updateMenuMaster_(payload) {
  var menuId = String(payload.menu_id || "").trim();
  var data = validateMenuMasterPayload_(payload, true);
  var sheet = ensureMenuMasterColumns_();
  var headerMap = getHeaderMap_(sheet);
  var rowNumber = findRowByValue_(sheet, headerMap, "menu_id", menuId);

  if (!rowNumber) {
    masterError_("Menu tidak ditemukan.");
  }
  var currentMenu = getMenuMasterRow_(sheet, headerMap, rowNumber);

  setRowValues_(sheet, headerMap, rowNumber, {
    menu_name: data.menu_name,
    category: data.category,
    price: data.price,
    status: data.status,
    updated_at: toJakartaIsoString_(new Date()),
    stock_tracking: data.stock_tracking,
    stock_item_id: data.stock_item_id,
    stock_qty_per_unit: data.stock_qty_per_unit,
  });
  var updatedMenu = getMenuMasterRow_(sheet, headerMap, rowNumber);

  appendMasterDataAuditLog_({
    entity_type: "menu",
    entity_id: updatedMenu.menu_id,
    entity_name: updatedMenu.menu_name,
    action_type: getMasterActionType_("menu", currentMenu, updatedMenu),
    old_value: currentMenu,
    new_value: updatedMenu,
    changed_by: getMasterChangedBy_(payload),
    note: getMasterNote_(payload),
    result: "success",
  });

  return masterSuccessResponse_("Data menu berhasil diperbarui.", updatedMenu);
}

function validateInventoryMasterPayload_(payload, isUpdate) {
  var stockItemName = String(payload.stock_item_name || "").trim();
  var category = String(payload.category || "").trim();
  var unit = String(payload.unit || "").trim();
  var minStock = Number(payload.min_stock);
  var status = normalizeMasterStatus_(payload.status, ["active", "inactive"], "active");

  if (isUpdate && !String(payload.stock_item_id || "").trim()) {
    masterError_("stock_item_id wajib diisi.");
  }

  if (!stockItemName) {
    masterError_("Nama item inventory wajib diisi.");
  }

  if (!category) {
    masterError_("Kategori inventory wajib diisi.");
  }

  if (!unit) {
    masterError_("Unit inventory wajib diisi.");
  }

  if (!isFinite(minStock) || minStock < 0) {
    masterError_("Min stok wajib angka 0 atau lebih.");
  }

  return {
    stock_item_name: stockItemName,
    category: category,
    unit: unit,
    min_stock: minStock,
    status: status,
  };
}

function saveInventoryMaster_(payload) {
  var data = validateInventoryMasterPayload_(payload, false);
  var sheet = ensureInventorySheetColumns_();
  var headerMap = getHeaderMap_(sheet);
  var stockItemId = generateSequentialId_(sheet, headerMap, "stock_item_id", "ITEM");
  var item = {
    stock_item_id: stockItemId,
    stock_item_name: data.stock_item_name,
    category: data.category,
    unit: data.unit,
    stock_qty: 0,
    min_stock: data.min_stock,
    status: data.status,
    updated_at: toJakartaIsoString_(new Date()),
  };

  appendObjectRow_(sheet, item);
  var savedItem = buildInventoryItemFromRow_(sheet, getHeaderMap_(sheet), sheet.getLastRow());

  appendMasterDataAuditLog_({
    entity_type: "inventory",
    entity_id: savedItem.stock_item_id,
    entity_name: savedItem.stock_item_name,
    action_type: "create",
    old_value: "",
    new_value: savedItem,
    changed_by: getMasterChangedBy_(payload),
    note: getMasterNote_(payload),
    result: "success",
  });

  return masterSuccessResponse_("Data inventory berhasil disimpan.", savedItem);
}

function updateInventoryMaster_(payload) {
  var stockItemId = String(payload.stock_item_id || "").trim();
  var data = validateInventoryMasterPayload_(payload, true);
  var sheet = ensureInventorySheetColumns_();
  var headerMap = getHeaderMap_(sheet);
  var rowNumber = findRowByValue_(sheet, headerMap, "stock_item_id", stockItemId);

  if (!rowNumber) {
    masterError_("Inventory item tidak ditemukan.");
  }
  var currentItem = buildInventoryItemFromRow_(sheet, headerMap, rowNumber);

  setRowValues_(sheet, headerMap, rowNumber, {
    stock_item_name: data.stock_item_name,
    category: data.category,
    unit: data.unit,
    min_stock: data.min_stock,
    status: data.status,
    updated_at: toJakartaIsoString_(new Date()),
  });
  var updatedItem = buildInventoryItemFromRow_(sheet, headerMap, rowNumber);

  appendMasterDataAuditLog_({
    entity_type: "inventory",
    entity_id: updatedItem.stock_item_id,
    entity_name: updatedItem.stock_item_name,
    action_type: getMasterActionType_("inventory", currentItem, updatedItem),
    old_value: currentItem,
    new_value: updatedItem,
    changed_by: getMasterChangedBy_(payload),
    note: getMasterNote_(payload),
    result: "success",
  });

  return masterSuccessResponse_("Data inventory berhasil diperbarui.", updatedItem);
}

function hasSheetReference_(sheetName, columnName, value) {
  var rows = readSheetAsObjectsOrEmpty_(sheetName);
  var target = String(value || "").trim();

  return rows.some(function (row) {
    return String(row[columnName] || "").trim() === target;
  });
}

function hasInventoryMenuReference_(stockItemId) {
  var target = String(stockItemId || "").trim();

  return readSheetAsObjectsOrEmpty_("Menu").some(function (menuItem) {
    return String(menuItem.stock_item_id || "").trim() === target;
  });
}

function auditDeleteBlocked_(entityType, entityId, entityName, oldValue, blockReason, payload) {
  appendMasterDataAuditLog_({
    entity_type: entityType,
    entity_id: entityId,
    entity_name: entityName,
    action_type: "delete_blocked",
    old_value: oldValue || "",
    new_value: "",
    changed_by: getMasterChangedBy_(payload),
    note: getMasterNote_(payload),
    result: "blocked",
    block_reason: blockReason,
  });
}

function deleteBlockedResponse_(entityType, entityId, blockReason, message) {
  return masterBlockedResponse_(message, blockReason, {
    entity_type: entityType,
    entity_id: entityId,
  });
}

function authorizeAdminPinForMasterDelete_(payload, entityType, entityId) {
  var authResult = validateAdminPinPayload_(
    payload.admin_pin,
    "admin",
    "delete_permanent_" + entityType,
    payload.changed_by || "Admin",
    true
  );

  if (!authResult.success) {
    auditDeleteBlocked_(entityType, entityId, entityId, "", "INVALID_ADMIN_PIN", payload);

    return {
      ok: false,
      response: deleteBlockedResponse_(
        entityType,
        entityId,
        "INVALID_ADMIN_PIN",
        "Delete permanen membutuhkan PIN owner/admin yang valid."
      ),
    };
  }

  payload.changed_by = authResult.employee && authResult.employee.employee_name
    ? authResult.employee.employee_name
    : payload.changed_by || "Admin";

  return {
    ok: true,
    employee: authResult.employee,
  };
}

function deleteRoomMaster_(payload) {
  var roomId = String(payload.room_id || "").trim();

  if (!roomId) {
    masterError_("room_id wajib diisi.");
  }

  var authResult = authorizeAdminPinForMasterDelete_(payload, "room", roomId);

  if (!authResult.ok) {
    return authResult.response;
  }

  var sheet = ensureRoomsMasterColumns_();
  var headerMap = getHeaderMap_(sheet);
  var rowNumber = findRowByValue_(sheet, headerMap, "room_id", roomId);

  if (!rowNumber) {
    auditDeleteBlocked_("room", roomId, roomId, "", "ROOM_NOT_FOUND", payload);
    return deleteBlockedResponse_("room", roomId, "ROOM_NOT_FOUND", "Room tidak ditemukan.");
  }

  var room = getRoomFromRow_(sheet, headerMap, rowNumber);

  if (String(room.status || "").trim().toLowerCase() === "occupied") {
    auditDeleteBlocked_("room", room.room_id, room.room_name, room, "ROOM_OCCUPIED", payload);
    return deleteBlockedResponse_("room", room.room_id, "ROOM_OCCUPIED", "Room sedang occupied. Selesaikan sesi atau gunakan maintenance saat room kosong.");
  }

  if (hasSheetReference_("Transactions", "room_id", roomId)) {
    auditDeleteBlocked_("room", room.room_id, room.room_name, room, "ROOM_HAS_TRANSACTIONS", payload);
    return deleteBlockedResponse_("room", room.room_id, "ROOM_HAS_TRANSACTIONS", "Data tidak bisa dihapus permanen karena sudah memiliki histori transaksi. Gunakan status maintenance.");
  }

  if (hasSheetReference_("FnbOrders", "room_id", roomId)) {
    auditDeleteBlocked_("room", room.room_id, room.room_name, room, "ROOM_HAS_FNB_ORDERS", payload);
    return deleteBlockedResponse_("room", room.room_id, "ROOM_HAS_FNB_ORDERS", "Data tidak bisa dihapus permanen karena sudah memiliki histori F&B order. Gunakan status maintenance.");
  }

  if (hasSheetReference_("RoomTimeLogs", "room_id", roomId)) {
    auditDeleteBlocked_("room", room.room_id, room.room_name, room, "ROOM_HAS_TIME_LOGS", payload);
    return deleteBlockedResponse_("room", room.room_id, "ROOM_HAS_TIME_LOGS", "Data tidak bisa dihapus permanen karena sudah memiliki audit tambah waktu. Gunakan status maintenance.");
  }

  sheet.deleteRow(rowNumber);
  appendMasterDataAuditLog_({
    entity_type: "room",
    entity_id: room.room_id,
    entity_name: room.room_name,
    action_type: "delete_permanent",
    old_value: room,
    new_value: "",
    changed_by: getMasterChangedBy_(payload),
    note: getMasterNote_(payload),
    result: "success",
  });

  return masterSuccessResponse_("Data berhasil dihapus permanen.", {
    entity_type: "room",
    entity_id: room.room_id,
  });
}

function deleteMenuMaster_(payload) {
  var menuId = String(payload.menu_id || "").trim();

  if (!menuId) {
    masterError_("menu_id wajib diisi.");
  }

  var authResult = authorizeAdminPinForMasterDelete_(payload, "menu", menuId);

  if (!authResult.ok) {
    return authResult.response;
  }

  var sheet = ensureMenuMasterColumns_();
  var headerMap = getHeaderMap_(sheet);
  var rowNumber = findRowByValue_(sheet, headerMap, "menu_id", menuId);

  if (!rowNumber) {
    auditDeleteBlocked_("menu", menuId, menuId, "", "MENU_NOT_FOUND", payload);
    return deleteBlockedResponse_("menu", menuId, "MENU_NOT_FOUND", "Menu tidak ditemukan.");
  }

  var menu = getMenuMasterRow_(sheet, headerMap, rowNumber);

  if (hasSheetReference_("FnbOrderItems", "menu_id", menuId)) {
    auditDeleteBlocked_("menu", menu.menu_id, menu.menu_name, menu, "MENU_HAS_ORDER_ITEMS", payload);
    return deleteBlockedResponse_("menu", menu.menu_id, "MENU_HAS_ORDER_ITEMS", "Data tidak bisa dihapus permanen karena sudah pernah masuk order F&B. Gunakan status inactive.");
  }

  sheet.deleteRow(rowNumber);
  appendMasterDataAuditLog_({
    entity_type: "menu",
    entity_id: menu.menu_id,
    entity_name: menu.menu_name,
    action_type: "delete_permanent",
    old_value: menu,
    new_value: "",
    changed_by: getMasterChangedBy_(payload),
    note: getMasterNote_(payload),
    result: "success",
  });

  return masterSuccessResponse_("Data berhasil dihapus permanen.", {
    entity_type: "menu",
    entity_id: menu.menu_id,
  });
}

function deleteInventoryMaster_(payload) {
  var stockItemId = String(payload.stock_item_id || "").trim();

  if (!stockItemId) {
    masterError_("stock_item_id wajib diisi.");
  }

  var authResult = authorizeAdminPinForMasterDelete_(payload, "inventory", stockItemId);

  if (!authResult.ok) {
    return authResult.response;
  }

  var sheet = ensureInventorySheetColumns_();
  var headerMap = getHeaderMap_(sheet);
  var rowNumber = findInventoryRowByStockItemId_(stockItemId, sheet, headerMap);

  if (!rowNumber) {
    auditDeleteBlocked_("inventory", stockItemId, stockItemId, "", "INVENTORY_NOT_FOUND", payload);
    return deleteBlockedResponse_("inventory", stockItemId, "INVENTORY_NOT_FOUND", "Inventory item tidak ditemukan.");
  }

  var item = buildInventoryItemFromRow_(sheet, headerMap, rowNumber);

  if (hasInventoryMenuReference_(stockItemId)) {
    auditDeleteBlocked_("inventory", item.stock_item_id, item.stock_item_name, item, "INVENTORY_USED_BY_MENU", payload);
    return deleteBlockedResponse_("inventory", item.stock_item_id, "INVENTORY_USED_BY_MENU", "Data tidak bisa dihapus permanen karena masih dipakai oleh Menu. Gunakan status inactive.");
  }

  if (hasSheetReference_("StockMovements", "stock_item_id", stockItemId)) {
    auditDeleteBlocked_("inventory", item.stock_item_id, item.stock_item_name, item, "INVENTORY_HAS_STOCK_MOVEMENTS", payload);
    return deleteBlockedResponse_("inventory", item.stock_item_id, "INVENTORY_HAS_STOCK_MOVEMENTS", "Data tidak bisa dihapus permanen karena sudah memiliki mutasi stok. Gunakan status inactive.");
  }

  sheet.deleteRow(rowNumber);
  appendMasterDataAuditLog_({
    entity_type: "inventory",
    entity_id: item.stock_item_id,
    entity_name: item.stock_item_name,
    action_type: "delete_permanent",
    old_value: item,
    new_value: "",
    changed_by: getMasterChangedBy_(payload),
    note: getMasterNote_(payload),
    result: "success",
  });

  return masterSuccessResponse_("Data berhasil dihapus permanen.", {
    entity_type: "inventory",
    entity_id: item.stock_item_id,
  });
}

function getTodayTransactions_() {
  return getTransactionsByPeriod_("today", "", "");
}

function getTransactionsByPeriod_(period, startDate, endDate) {
  var periodResult = parseTransactionPeriod_(period, startDate, endDate);

  if (!periodResult.ok) {
    return periodResult;
  }

  var transactions = readSheetAsObjects_("Transactions")
    .filter(function (transaction) {
      if (periodResult.period === "all") {
        return true;
      }

      var transactionDate = resolveTransactionOperationalDateString_(transaction);

      return matchesOperationalPeriod_(transactionDate, periodResult);
    })
    .map(function (transaction) {
      return {
        transaction_id: transaction.transaction_id || "",
        room_id: transaction.room_id || "",
        room_name: transaction.room_name || "",
        start_time: transaction.start_time || "",
        end_time: transaction.end_time || "",
        duration_minutes: Number(transaction.duration_minutes) || 0,
        rate_per_hour: Number(transaction.rate_per_hour) || 0,
        room_total: Number(transaction.room_total) || 0,
        fnb_total: Number(transaction.fnb_total) || 0,
        grand_total: getTransactionAmount_(transaction),
        fnb_order_ids: transaction.fnb_order_ids || "",
        payment_method: transaction.payment_method || "",
        payment_status: transaction.payment_status || "",
        cashier_name: transaction.cashier_name || "",
        created_at: transaction.created_at || "",
      };
    })
    .sort(function (first, second) {
      return new Date(second.created_at).getTime() - new Date(first.created_at).getTime();
    });

  var summary = transactions.reduce(function (result, transaction) {
    var amount = getTransactionAmount_(transaction);
    var paymentStatus = String(transaction.payment_status || "").trim();
    var paymentMethod = String(transaction.payment_method || "").trim().toLowerCase();

    result.total_transactions += 1;
    result.total_revenue_all += amount;
    result.total_bill += amount;

    if (paymentStatus === "paid") {
      result.paid_transactions += 1;
      result.total_revenue_paid += amount;
      result.paid_revenue += amount;

      if (paymentMethod === "cash") {
        result.cash_revenue += amount;
      }

      if (paymentMethod === "transfer") {
        result.transfer_revenue += amount;
      }
    }

    if (paymentStatus === "unpaid") {
      result.unpaid_transactions += 1;
      result.unpaid_revenue += amount;
    }

    return result;
  }, {
    total_transactions: 0,
    paid_transactions: 0,
    unpaid_transactions: 0,
    total_revenue_paid: 0,
    total_revenue_all: 0,
    paid_revenue: 0,
    unpaid_revenue: 0,
    total_bill: 0,
    cash_revenue: 0,
    transfer_revenue: 0,
  });

  return Object.assign({
    ok: true,
    transactions: transactions,
    summary: summary,
  }, buildOperationalPeriodMetadata_(periodResult));
}

function getRoomUsageReportByPeriod_(period, startDate, endDate) {
  var periodResult = parseRoomUsageReportPeriod_(period, startDate, endDate);

  if (!periodResult.ok) {
    return periodResult;
  }

  var filteredTransactions = readSheetAsObjects_("Transactions")
    .filter(function (transaction) {
      if (periodResult.period === "all") {
        return true;
      }

      return matchesOperationalPeriod_(
        resolveTransactionOperationalDateString_(transaction),
        periodResult
      );
    })
    .map(function (transaction) {
      return mapRoomUsageTransactionRow_(transaction);
    })
    .sort(function (first, second) {
      return new Date(second.created_at).getTime() - new Date(first.created_at).getTime();
    });

  var roomUsageMap = {};
  var summary = createRoomUsageReportEmptySummary_();

  filteredTransactions.forEach(function (transaction) {
    var roomKey = getRoomUsageGroupKey_(transaction);
    var durationMinutes = Number(transaction.duration_minutes) || 0;
    var roomRevenue = Number(transaction.room_total) || 0;
    var fnbRevenue = Number(transaction.fnb_total) || 0;
    var grandRevenue = Number(transaction.grand_total) || 0;
    var isPaid = isTransactionPaidForReport_(transaction);

    summary.total_sessions += 1;
    summary.total_duration_minutes += durationMinutes;
    summary.total_room_revenue += roomRevenue;
    summary.total_fnb_revenue += fnbRevenue;
    summary.total_grand_revenue += grandRevenue;

    if (isPaid) {
      summary.paid_revenue += grandRevenue;
      summary.paid_sessions += 1;
    } else {
      summary.unpaid_revenue += grandRevenue;
      summary.unpaid_sessions += 1;
    }

    if (!roomUsageMap[roomKey]) {
      roomUsageMap[roomKey] = {
        room_id: transaction.room_id || "",
        room_name: transaction.room_name || roomKey,
        session_count: 0,
        duration_minutes: 0,
        room_revenue: 0,
        fnb_revenue: 0,
        grand_revenue: 0,
        paid_revenue: 0,
        unpaid_revenue: 0,
      };
    }

    var roomUsage = roomUsageMap[roomKey];

    roomUsage.session_count += 1;
    roomUsage.duration_minutes += durationMinutes;
    roomUsage.room_revenue += roomRevenue;
    roomUsage.fnb_revenue += fnbRevenue;
    roomUsage.grand_revenue += grandRevenue;

    if (isPaid) {
      roomUsage.paid_revenue += grandRevenue;
    } else {
      roomUsage.unpaid_revenue += grandRevenue;
    }
  });

  var roomUsage = Object.keys(roomUsageMap)
    .map(function (roomKey) {
      var entry = roomUsageMap[roomKey];
      var sessionCount = Number(entry.session_count) || 0;
      var durationMinutes = Number(entry.duration_minutes) || 0;

      return {
        room_id: entry.room_id,
        room_name: entry.room_name,
        session_count: sessionCount,
        duration_minutes: durationMinutes,
        duration_hours: durationMinutes / 60,
        room_revenue: entry.room_revenue,
        fnb_revenue: entry.fnb_revenue,
        grand_revenue: entry.grand_revenue,
        paid_revenue: entry.paid_revenue,
        unpaid_revenue: entry.unpaid_revenue,
        average_duration_minutes: sessionCount > 0
          ? Math.round(durationMinutes / sessionCount)
          : 0,
      };
    })
    .sort(function (first, second) {
      if (second.duration_minutes !== first.duration_minutes) {
        return second.duration_minutes - first.duration_minutes;
      }

      return second.grand_revenue - first.grand_revenue;
    });

  summary.total_duration_hours = summary.total_duration_minutes / 60;
  summary.unique_rooms_used = roomUsage.length;

  if (roomUsage.length > 0) {
    summary.top_room_name = roomUsage[0].room_name;
    summary.top_room_duration_minutes = roomUsage[0].duration_minutes;
  }

  return Object.assign({
    ok: true,
    summary: summary,
    room_usage: roomUsage,
    transactions: filteredTransactions,
  }, buildOperationalPeriodMetadata_(periodResult));
}

function parseRoomUsageReportPeriod_(period, startDate, endDate) {
  var normalizedPeriod = normalizeOperationalPeriodKey_(period);

  if (["today", "yesterday", "last7days", "thismonth", "all", "custom"].indexOf(normalizedPeriod) === -1) {
    return {
      ok: false,
      error: "Periode laporan room tidak dikenal.",
    };
  }

  return getOperationalDateRangeForPeriod_(period, startDate, endDate);
}

function mapRoomUsageTransactionRow_(transaction) {
  return {
    transaction_id: transaction.transaction_id || "",
    room_id: transaction.room_id || "",
    room_name: transaction.room_name || "",
    start_time: transaction.start_time || "",
    end_time: transaction.end_time || "",
    duration_minutes: Number(transaction.duration_minutes) || 0,
    room_total: Number(transaction.room_total) || 0,
    fnb_total: Number(transaction.fnb_total) || 0,
    grand_total: getTransactionGrandTotalForReport_(transaction),
    payment_status: transaction.payment_status || "",
    payment_method: transaction.payment_method || "",
    cashier_name: transaction.cashier_name || "",
    created_at: transaction.created_at || "",
    operational_date: resolveTransactionOperationalDateString_(transaction),
  };
}

function getRoomUsageGroupKey_(transaction) {
  var roomId = String(transaction.room_id || "").trim();

  if (roomId) {
    return roomId;
  }

  return String(transaction.room_name || "").trim() || "UNKNOWN";
}

function getTransactionGrandTotalForReport_(transaction) {
  var grandTotal = Number(transaction.grand_total) || 0;

  if (grandTotal > 0) {
    return grandTotal;
  }

  return (Number(transaction.room_total) || 0) + (Number(transaction.fnb_total) || 0);
}

function isTransactionPaidForReport_(transaction) {
  return String(transaction.payment_status || "").trim().toLowerCase() === "paid";
}

function createRoomUsageReportEmptySummary_() {
  return {
    total_sessions: 0,
    total_duration_minutes: 0,
    total_duration_hours: 0,
    total_room_revenue: 0,
    total_fnb_revenue: 0,
    total_grand_revenue: 0,
    paid_revenue: 0,
    unpaid_revenue: 0,
    paid_sessions: 0,
    unpaid_sessions: 0,
    unique_rooms_used: 0,
    top_room_name: "",
    top_room_duration_minutes: 0,
  };
}

function getTodayCashierClosings_() {
  return getCashierClosingsByPeriod_("today", "", "");
}

function getCashierClosingsByPeriod_(period, startDate, endDate) {
  var periodResult = parseTransactionPeriod_(period, startDate, endDate);

  if (!periodResult.ok) {
    return periodResult;
  }

  var closings = readCashierClosingsOrEmpty_()
    .filter(function (closing) {
      if (periodResult.period === "all") {
        return true;
      }

      var closingDate = resolveClosingOperationalDateString_(closing);

      return matchesOperationalPeriod_(closingDate, periodResult);
    })
    .map(function (closing) {
      return {
        closing_id: closing.closing_id || "",
        closing_date: closing.closing_date || "",
        cashier_name: closing.cashier_name || "",
        total_transactions: Number(closing.total_transactions) || 0,
        paid_transactions: Number(closing.paid_transactions) || 0,
        unpaid_transactions: Number(closing.unpaid_transactions) || 0,
        cash_transactions: Number(closing.cash_transactions) || 0,
        transfer_transactions: Number(closing.transfer_transactions) || 0,
        paid_revenue: Number(closing.paid_revenue) || 0,
        cash_expected: Number(closing.cash_expected) || 0,
        cash_actual: Number(closing.cash_actual) || 0,
        cash_difference: Number(closing.cash_difference) || 0,
        transfer_revenue: Number(closing.transfer_revenue) || 0,
        unpaid_revenue: Number(closing.unpaid_revenue) || 0,
        total_revenue: Number(closing.total_revenue) || 0,
        note: closing.note || "",
        created_at: closing.created_at || "",
      };
    })
    .sort(function (first, second) {
      return new Date(second.created_at).getTime() - new Date(first.created_at).getTime();
    });

  return Object.assign({
    ok: true,
    closings: closings,
    summary: {
      total_closings: closings.length,
      latest_closing_id: closings.length > 0 ? closings[0].closing_id : "",
      latest_created_at: closings.length > 0 ? closings[0].created_at : "",
    },
  }, buildOperationalPeriodMetadata_(periodResult));
}

function getOperationalCutoffHour_() {
  return 10;
}

function parseJakartaDateTimeValue_(value) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value;
  }

  var textValue = String(value).trim();

  if (!textValue) {
    return null;
  }

  var parsedDate = new Date(textValue);

  return isNaN(parsedDate.getTime()) ? null : parsedDate;
}

function getOperationalDateString_(dateValue) {
  var parsedDate = parseJakartaDateTimeValue_(dateValue);

  if (!parsedDate) {
    return "";
  }

  var shiftedDate = new Date(parsedDate.getTime() - getOperationalCutoffHour_() * 3600000);

  return getJakartaDateString_(shiftedDate);
}

function getCurrentOperationalDateString_() {
  return getOperationalDateString_(new Date());
}

function parseOperationalDateAnchor_(dateString) {
  var match = String(dateString || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) {
    return null;
  }

  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 5, 0, 0));
}

function addDaysToOperationalDateString_(dateString, dayOffset) {
  var anchorDate = parseOperationalDateAnchor_(dateString);

  if (!anchorDate) {
    return "";
  }

  return Utilities.formatDate(
    new Date(anchorDate.getTime() + (Number(dayOffset) || 0) * 86400000),
    "Asia/Jakarta",
    "yyyy-MM-dd"
  );
}

function getOperationalMonthStartDateString_(operationalDateString) {
  var activeOperationalDate = operationalDateString || getCurrentOperationalDateString_();

  if (!activeOperationalDate || activeOperationalDate.length < 7) {
    return getCurrentOperationalDateString_().substring(0, 7) + "-01";
  }

  return activeOperationalDate.substring(0, 7) + "-01";
}

function normalizeOperationalPeriodKey_(period) {
  var normalizedPeriod = String(period || "today").trim().toLowerCase();

  if (normalizedPeriod === "activeshift") {
    return "today";
  }

  return normalizedPeriod;
}

function getOperationalDateRangeForPeriod_(period, startDate, endDate) {
  var normalizedPeriod = normalizeOperationalPeriodKey_(period);
  var activeOperationalDate = getCurrentOperationalDateString_();

  if (["today", "yesterday", "last7days", "thismonth", "all", "custom"].indexOf(normalizedPeriod) === -1) {
    return {
      ok: false,
      error: "Periode transaksi tidak dikenal.",
    };
  }

  if (normalizedPeriod === "today") {
    return {
      ok: true,
      period: normalizedPeriod,
      startDate: activeOperationalDate,
      endDate: activeOperationalDate,
    };
  }

  if (normalizedPeriod === "yesterday") {
    var yesterdayOperationalDate = addDaysToOperationalDateString_(activeOperationalDate, -1);

    return {
      ok: true,
      period: normalizedPeriod,
      startDate: yesterdayOperationalDate,
      endDate: yesterdayOperationalDate,
    };
  }

  if (normalizedPeriod === "last7days") {
    return {
      ok: true,
      period: normalizedPeriod,
      startDate: addDaysToOperationalDateString_(activeOperationalDate, -6),
      endDate: activeOperationalDate,
    };
  }

  if (normalizedPeriod === "thismonth") {
    return {
      ok: true,
      period: normalizedPeriod,
      startDate: getOperationalMonthStartDateString_(activeOperationalDate),
      endDate: activeOperationalDate,
    };
  }

  if (normalizedPeriod === "all") {
    return {
      ok: true,
      period: normalizedPeriod,
      startDate: "",
      endDate: "",
    };
  }

  var normalizedStartDate = normalizeJakartaDateString_(startDate);
  var normalizedEndDate = normalizeJakartaDateString_(endDate);

  if (!normalizedStartDate || !normalizedEndDate) {
    return {
      ok: false,
      error: "Tanggal mulai dan tanggal akhir wajib diisi untuk periode custom.",
    };
  }

  if (normalizedStartDate > normalizedEndDate) {
    return {
      ok: false,
      error: "Tanggal mulai tidak boleh lebih besar dari tanggal akhir.",
    };
  }

  return {
    ok: true,
    period: normalizedPeriod,
    startDate: normalizedStartDate,
    endDate: normalizedEndDate,
  };
}

function parseTransactionPeriod_(period, startDate, endDate) {
  return getOperationalDateRangeForPeriod_(period, startDate, endDate);
}

function buildOperationalPeriodMetadata_(periodResult) {
  return {
    period: periodResult.period,
    operational_date_start: periodResult.startDate || "",
    operational_date_end: periodResult.endDate || "",
    operational_cutoff_hour: getOperationalCutoffHour_(),
  };
}

function matchesOperationalPeriod_(operationalDate, periodResult) {
  if (periodResult.period === "all") {
    return true;
  }

  return isDateWithinInclusiveRange_(
    operationalDate,
    periodResult.startDate,
    periodResult.endDate
  );
}

function resolveTransactionOperationalDateString_(transaction) {
  return getOperationalDateString_(transaction.created_at)
    || getOperationalDateString_(transaction.end_time)
    || getOperationalDateString_(transaction.start_time)
    || "";
}

function resolveClosingOperationalDateString_(closing) {
  var closingDateText = String(closing.closing_date || "").trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(closingDateText)) {
    return closingDateText;
  }

  var fromClosingDate = getOperationalDateString_(closing.closing_date);

  if (fromClosingDate) {
    return fromClosingDate;
  }

  return getOperationalDateString_(closing.created_at);
}

function resolveFnbOrderOperationalDateString_(order) {
  return getOperationalDateString_(order.created_at)
    || getOperationalDateString_(order.updated_at)
    || "";
}

function isDateWithinInclusiveRange_(dateString, startDateString, endDateString) {
  if (!dateString) {
    return false;
  }

  if (startDateString && dateString < startDateString) {
    return false;
  }

  if (endDateString && dateString > endDateString) {
    return false;
  }

  return true;
}

function getJakartaDateWithOffset_(dayOffset) {
  var now = new Date();

  return Utilities.formatDate(
    new Date(now.getTime() + (Number(dayOffset) || 0) * 86400000),
    "Asia/Jakarta",
    "yyyy-MM-dd"
  );
}

function getJakartaMonthStartDateString_() {
  return Utilities.formatDate(new Date(), "Asia/Jakarta", "yyyy-MM") + "-01";
}

function readCashierClosingsOrEmpty_() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();

  if (!spreadsheet || !spreadsheet.getSheetByName("CashierClosings")) {
    return [];
  }

  return readSheetAsObjects_("CashierClosings");
}

function isSameJakartaDate_(isoDateString, date) {
  if (!isoDateString) {
    return false;
  }

  var transactionDate = isoDateString instanceof Date ? isoDateString : new Date(isoDateString);

  if (isNaN(transactionDate.getTime())) {
    return false;
  }

  var transactionDay = Utilities.formatDate(transactionDate, "Asia/Jakarta", "yyyy-MM-dd");
  var targetDay = Utilities.formatDate(date, "Asia/Jakarta", "yyyy-MM-dd");

  return transactionDay === targetDay;
}

function normalizeJakartaDateString_(value) {
  if (!value) {
    return "";
  }

  if (value instanceof Date) {
    return isNaN(value.getTime()) ? "" : getJakartaDateString_(value);
  }

  var textValue = String(value).trim();

  if (!textValue) {
    return "";
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(textValue)) {
    return textValue;
  }

  var parsedDate = new Date(textValue);

  if (isNaN(parsedDate.getTime())) {
    return "";
  }

  return getJakartaDateString_(parsedDate);
}

function parsePostBody_(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      throw new Error("Empty request body.");
    }

    return JSON.parse(e.postData.contents);
  } catch (error) {
    throw new Error("Format permintaan tidak valid.");
  }
}

function startSession_(roomId, durationMinutes) {
  if (!roomId) {
    return {
      ok: false,
      error: "room_id wajib diisi.",
    };
  }

  var bookedDurationMinutes = Number(durationMinutes);

  if (!isFinite(bookedDurationMinutes) || bookedDurationMinutes <= 0) {
    return {
      ok: false,
      error: "duration_minutes wajib berupa angka positif.",
    };
  }

  if (bookedDurationMinutes < 15) {
    return {
      ok: false,
      error: "Durasi minimal 15 menit.",
    };
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    var sheet = ensureRoomsBookingColumns_();
    var headerMap = getHeaderMap_(sheet);
    var rowNumber = findRowByValue_(sheet, headerMap, "room_id", roomId);

    if (!rowNumber) {
      return {
        ok: false,
        error: "Ruangan tidak ditemukan.",
      };
    }

    var statusColumn = headerMap.status;
    var startTimeColumn = headerMap.start_time;
    var updatedAtColumn = headerMap.updated_at;
    var bookedDurationColumn = headerMap.booked_duration_minutes;
    var scheduledEndTimeColumn = headerMap.scheduled_end_time;
    var status = String(sheet.getRange(rowNumber, statusColumn).getValue()).trim();

    if (status !== "available") {
      return {
        ok: false,
        error: "Ruangan tidak tersedia untuk memulai sesi.",
      };
    }

    var now = toJakartaIsoString_(new Date());
    var scheduledEndTime = addMinutesToJakartaIsoString_(now, bookedDurationMinutes);

    sheet.getRange(rowNumber, statusColumn).setValue("occupied");
    sheet.getRange(rowNumber, startTimeColumn).setValue(now);
    sheet.getRange(rowNumber, bookedDurationColumn).setValue(bookedDurationMinutes);
    sheet.getRange(rowNumber, scheduledEndTimeColumn).setValue(scheduledEndTime);
    sheet.getRange(rowNumber, updatedAtColumn).setValue(now);

    return {
      ok: true,
      message: "Sesi berhasil dimulai.",
      room: getRoomFromRow_(sheet, headerMap, rowNumber),
    };
  } finally {
    lock.releaseLock();
  }
}

function extendSession_(roomId, addMinutes, cashierName, note) {
  if (!roomId) {
    return {
      ok: false,
      error: "room_id wajib diisi.",
    };
  }

  var addedMinutes = Number(addMinutes);

  if (!isFinite(addedMinutes) || addedMinutes <= 0) {
    return {
      ok: false,
      error: "add_minutes wajib berupa angka positif.",
    };
  }

  if (addedMinutes < 15) {
    return {
      ok: false,
      error: "Tambahan waktu minimal 15 menit.",
    };
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    var sheet = ensureRoomsBookingColumns_();
    var headerMap = getHeaderMap_(sheet);
    var rowNumber = findRowByValue_(sheet, headerMap, "room_id", roomId);

    if (!rowNumber) {
      return {
        ok: false,
        error: "Ruangan tidak ditemukan.",
      };
    }

    var room = getRowObject_(sheet, headerMap, rowNumber);
    var status = String(room.status || "").trim();

    if (status !== "occupied") {
      return {
        ok: false,
        error: "Tambah waktu hanya bisa dilakukan untuk room yang sedang terisi.",
      };
    }

    if (!room.start_time) {
      return {
        ok: false,
        error: "Waktu mulai sesi tidak valid.",
      };
    }

    if (!room.scheduled_end_time) {
      return {
        ok: false,
        error: "Sesi ini belum memiliki jadwal selesai. Tutup sesi lama dan mulai ulang dengan durasi booking.",
      };
    }

    var oldBookedDurationMinutes = Number(room.booked_duration_minutes) || 0;
    var oldScheduledEndTime = room.scheduled_end_time instanceof Date
      ? toJakartaIsoString_(room.scheduled_end_time)
      : String(room.scheduled_end_time).trim();
    var newBookedDurationMinutes = oldBookedDurationMinutes + addedMinutes;
    var newScheduledEndTime = addMinutesToJakartaIsoString_(oldScheduledEndTime, addedMinutes);
    var now = toJakartaIsoString_(new Date());

    sheet.getRange(rowNumber, headerMap.booked_duration_minutes).setValue(newBookedDurationMinutes);
    sheet.getRange(rowNumber, headerMap.scheduled_end_time).setValue(newScheduledEndTime);
    sheet.getRange(rowNumber, headerMap.updated_at).setValue(now);

    var logId = generateRoomTimeLogId_();
    var logEntry = {
      log_id: logId,
      created_at: now,
      action_type: "extend_session",
      room_id: roomId,
      room_name: room.room_name || "",
      old_booked_duration_minutes: oldBookedDurationMinutes,
      new_booked_duration_minutes: newBookedDurationMinutes,
      old_scheduled_end_time: oldScheduledEndTime,
      new_scheduled_end_time: newScheduledEndTime,
      add_minutes: addedMinutes,
      cashier_name: cashierName || "Kasir",
      note: String(note || "").trim(),
    };

    try {
      appendRoomTimeLog_(logEntry);
    } catch (logError) {
      sheet.getRange(rowNumber, headerMap.booked_duration_minutes).setValue(oldBookedDurationMinutes);
      sheet.getRange(rowNumber, headerMap.scheduled_end_time).setValue(oldScheduledEndTime);
      sheet.getRange(rowNumber, headerMap.updated_at).setValue(room.updated_at || "");

      return {
        ok: false,
        error: "Gagal mencatat audit log tambah waktu. Perubahan durasi dibatalkan.",
      };
    }

    return {
      ok: true,
      message: "Waktu room berhasil ditambahkan.",
      room: getRoomFromRow_(sheet, headerMap, rowNumber),
      audit_log: {
        log_id: logId,
        action_type: "extend_session",
      },
      extension: {
        add_minutes: addedMinutes,
        old_booked_duration_minutes: oldBookedDurationMinutes,
        new_booked_duration_minutes: newBookedDurationMinutes,
        old_scheduled_end_time: oldScheduledEndTime,
        new_scheduled_end_time: newScheduledEndTime,
        cashier_name: cashierName || "Kasir",
        note: logEntry.note,
      },
    };
  } finally {
    lock.releaseLock();
  }
}

function closeSession_(roomId, cashierName) {
  if (!roomId) {
    return {
      ok: false,
      error: "room_id wajib diisi.",
    };
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    var roomsSheet = getSheet_("Rooms");
    var roomsHeaderMap = getHeaderMap_(roomsSheet);
    var rowNumber = findRowByValue_(roomsSheet, roomsHeaderMap, "room_id", roomId);

    if (!rowNumber) {
      return {
        ok: false,
        error: "Ruangan tidak ditemukan.",
      };
    }

    var room = getRowObject_(roomsSheet, roomsHeaderMap, rowNumber);
    var status = String(room.status || "").trim();

    if (status !== "occupied") {
      return {
        ok: false,
        error: "Ruangan belum sedang digunakan.",
      };
    }

    var startDate = new Date(room.start_time);

    if (!room.start_time || isNaN(startDate.getTime())) {
      return {
        ok: false,
        error: "Waktu mulai sesi tidak valid.",
      };
    }

    var endDate = new Date();
    var endTime = toJakartaIsoString_(endDate);
    var startTime = room.start_time instanceof Date ? toJakartaIsoString_(room.start_time) : room.start_time;
    var billing = resolveSessionBilling_(room, startDate, endDate);
    var durationMinutes = billing.duration_minutes;
    var ratePerHour = Number(room.rate_per_hour) || 0;
    var roomTotal = billing.room_total;
    var fnbOrders = getOpenFnbOrdersForSession_(room.room_id || "", startTime || "");
    var fnbTotal = calculateFnbTotal_(fnbOrders);
    var fnbOrderIds = fnbOrders.map(function (order) {
      return order.order_id;
    }).join(",");
    var detailedFnbOrders = getFnbOrdersWithItemsByIds_(parseCommaSeparatedIds_(fnbOrderIds));
    var transaction = {
      transaction_id: generateTransactionId_(),
      room_id: room.room_id || "",
      room_name: room.room_name || "",
      start_time: startTime || "",
      end_time: endTime,
      duration_minutes: durationMinutes,
      rate_per_hour: ratePerHour,
      room_total: roomTotal,
      fnb_total: fnbTotal,
      grand_total: roomTotal + fnbTotal,
      fnb_order_ids: fnbOrderIds,
      payment_method: "",
      payment_status: "unpaid",
      cashier_name: cashierName || "Kasir",
      created_at: endTime,
      billing_basis: billing.billing_basis,
    };

    appendTransaction_(transaction);
    var stockResult = deductStockForFnbOrders_(detailedFnbOrders, transaction.transaction_id, transaction.cashier_name, endTime);
    markFnbOrdersAsBilled_(fnbOrderIds ? fnbOrderIds.split(",") : [], endTime);
    fnbOrders = detailedFnbOrders.map(function (order) {
      order.order_status = "billed";
      order.updated_at = endTime;
      return order;
    });

    roomsSheet.getRange(rowNumber, roomsHeaderMap.status).setValue("available");
    roomsSheet.getRange(rowNumber, roomsHeaderMap.start_time).setValue("");
    if (roomsHeaderMap.booked_duration_minutes) {
      roomsSheet.getRange(rowNumber, roomsHeaderMap.booked_duration_minutes).setValue("");
    }
    if (roomsHeaderMap.scheduled_end_time) {
      roomsSheet.getRange(rowNumber, roomsHeaderMap.scheduled_end_time).setValue("");
    }
    roomsSheet.getRange(rowNumber, roomsHeaderMap.updated_at).setValue(endTime);

    return {
      ok: true,
      message: "Sesi berhasil diselesaikan.",
      transaction: transaction,
      fnb_orders: fnbOrders,
      stock_movements: stockResult.movements,
      stock_warnings: stockResult.warnings,
    };
  } finally {
    lock.releaseLock();
  }
}

function markTransactionPaid_(transactionId, paymentMethod) {
  if (!transactionId) {
    return {
      ok: false,
      error: "transaction_id wajib diisi.",
    };
  }

  if (!paymentMethod) {
    return {
      ok: false,
      error: "payment_method wajib diisi.",
    };
  }

  var allowedPaymentMethods = getAllowedPaymentMethods_();

  if (!allowedPaymentMethods[paymentMethod]) {
    return {
      ok: false,
      error: "Metode pembayaran tidak dikenal.",
    };
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    var sheet = getSheet_("Transactions");
    var headerMap = getHeaderMap_(sheet);
    var rowNumber = findRowByValue_(sheet, headerMap, "transaction_id", transactionId);

    if (!rowNumber) {
      return {
        ok: false,
        error: "Transaksi tidak ditemukan.",
      };
    }

    var transaction = getRowObject_(sheet, headerMap, rowNumber);
    var paymentStatus = String(transaction.payment_status || "").trim();

    if (paymentStatus === "paid") {
      return {
        ok: false,
        error: "Transaksi sudah lunas.",
      };
    }

    sheet.getRange(rowNumber, headerMap.payment_method).setValue(paymentMethod);
    sheet.getRange(rowNumber, headerMap.payment_status).setValue("paid");

    return {
      ok: true,
      message: "Pembayaran berhasil ditandai lunas.",
      transaction: getRowObject_(sheet, headerMap, rowNumber),
    };
  } finally {
    lock.releaseLock();
  }
}

function getAllowedPaymentMethods_() {
  return {
    cash: true,
    transfer: true,
  };
}

function saveCashierClosing_(cashActual, note, cashierName) {
  var normalizedCashActual = cashActual === "" || cashActual === null || cashActual === undefined
    ? 0
    : Number(cashActual);

  if (isNaN(normalizedCashActual) || normalizedCashActual < 0) {
    return {
      ok: false,
      error: "Uang cash aktual harus berupa angka 0 atau lebih.",
    };
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    var now = new Date();
    var createdAt = toJakartaIsoString_(now);
    var todayDateString = getJakartaDateString_(now);
    var existingClosings = readCashierClosingsOrEmpty_().filter(function (closing) {
      return normalizeJakartaDateString_(closing.closing_date) === todayDateString;
    });

    if (existingClosings.length > 0) {
      return {
        ok: false,
        error: "Closing kasir hari ini sudah pernah disimpan.",
      };
    }

    var summary = calculateCashierClosingSummary_();

    if (summary.total_transactions === 0) {
      return {
        ok: false,
        error: "Belum ada transaksi hari ini untuk ditutup.",
      };
    }

    var closing = {
      closing_id: generateClosingId_(),
      closing_date: getJakartaDateString_(now),
      cashier_name: cashierName || "Kasir",
      total_transactions: summary.total_transactions,
      paid_transactions: summary.paid_transactions,
      unpaid_transactions: summary.unpaid_transactions,
      cash_transactions: summary.cash_transactions,
      transfer_transactions: summary.transfer_transactions,
      paid_revenue: summary.paid_revenue,
      cash_expected: summary.cash_expected,
      cash_actual: normalizedCashActual,
      cash_difference: normalizedCashActual - summary.cash_expected,
      transfer_revenue: summary.transfer_revenue,
      unpaid_revenue: summary.unpaid_revenue,
      total_revenue: summary.total_revenue,
      note: note || "",
      created_at: createdAt,
    };

    var sheet = ensureCashierClosingsSheet_();
    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(function (header) {
      return String(header).trim();
    });
    var rowValues = headers.map(function (header) {
      return closing[header] !== undefined ? closing[header] : "";
    });

    sheet.appendRow(rowValues);

    return {
      ok: true,
      message: "Closing kasir berhasil disimpan.",
      closing: closing,
    };
  } finally {
    lock.releaseLock();
  }
}

function calculateCashierClosingSummary_() {
  var today = new Date();
  var transactions = readSheetAsObjects_("Transactions").filter(function (transaction) {
    return isSameJakartaDate_(transaction.created_at, today);
  });

  return transactions.reduce(function (summary, transaction) {
    var amount = getTransactionAmount_(transaction);
    var paymentStatus = String(transaction.payment_status || "").trim();
    var paymentMethod = String(transaction.payment_method || "").trim();

    summary.total_transactions += 1;
    summary.total_revenue += amount;

    if (paymentStatus === "paid") {
      summary.paid_transactions += 1;
      summary.paid_revenue += amount;

      if (paymentMethod === "cash") {
        summary.cash_transactions += 1;
        summary.cash_expected += amount;
      }

      if (paymentMethod === "transfer") {
        summary.transfer_transactions += 1;
        summary.transfer_revenue += amount;
      }
    }

    if (paymentStatus === "unpaid") {
      summary.unpaid_transactions += 1;
      summary.unpaid_revenue += amount;
    }

    return summary;
  }, {
    total_transactions: 0,
    paid_transactions: 0,
    unpaid_transactions: 0,
    cash_transactions: 0,
    transfer_transactions: 0,
    paid_revenue: 0,
    cash_expected: 0,
    transfer_revenue: 0,
    unpaid_revenue: 0,
    total_revenue: 0,
  });
}

function saveFnbOrder_(roomId, items, cashierName, note) {
  if (!roomId) {
    return {
      ok: false,
      error: "room_id wajib diisi.",
    };
  }

  if (!Array.isArray(items) || items.length === 0) {
    return {
      ok: false,
      error: "Item order F&B wajib diisi.",
    };
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    var roomsSheet = getSheet_("Rooms");
    var roomsHeaderMap = getHeaderMap_(roomsSheet);
    var rowNumber = findRowByValue_(roomsSheet, roomsHeaderMap, "room_id", roomId);

    if (!rowNumber) {
      return {
        ok: false,
        error: "Ruangan tidak ditemukan.",
      };
    }

    var room = getRowObject_(roomsSheet, roomsHeaderMap, rowNumber);
    var status = String(room.status || "").trim();

    if (status !== "occupied") {
      return {
        ok: false,
        error: "Order F&B hanya bisa disimpan untuk ruangan yang sedang terisi.",
      };
    }

    if (!room.start_time) {
      return {
        ok: false,
        error: "Sesi ruangan belum memiliki waktu mulai.",
      };
    }

    var menuMap = getMenuItemsMap_();
    var normalizedItems = normalizeFnbOrderItems_(items, menuMap);
    var orderTotal = normalizedItems.reduce(function (total, item) {
      return total + item.subtotal;
    }, 0);
    var now = new Date();
    var timestamp = toJakartaIsoString_(now);
    var roomStartTime = room.start_time instanceof Date
      ? toJakartaIsoString_(room.start_time)
      : room.start_time;
    var order = {
      order_id: generateFnbOrderId_(),
      room_id: room.room_id || "",
      room_name: room.room_name || "",
      room_start_time: roomStartTime || "",
      order_status: "open",
      order_total: orderTotal,
      cashier_name: cashierName || "Kasir",
      note: note || "",
      created_at: timestamp,
      updated_at: timestamp,
    };
    var orderItems = normalizedItems.map(function (item) {
      return {
        order_id: order.order_id,
        menu_id: item.menu_id,
        menu_name: item.menu_name,
        category: item.category,
        price: item.price,
        quantity: item.quantity,
        subtotal: item.subtotal,
        created_at: timestamp,
      };
    });

    ensureFnbOrdersSheet_();
    ensureFnbOrderItemsSheet_();
    appendFnbOrder_(order);
    appendFnbOrderItems_(orderItems);

    return {
      ok: true,
      message: "Order F&B berhasil disimpan.",
      order: order,
      items: orderItems,
    };
  } finally {
    lock.releaseLock();
  }
}

function getOpenFnbOrders_(roomId, roomStartTime) {
  var orders = readFnbOrdersOrEmpty_().filter(function (order) {
    var isOpen = String(order.order_status || "").trim() === "open";
    var matchesRoom = !roomId || String(order.room_id || "").trim() === String(roomId).trim();
    var orderRoomStartTime = normalizeFnbOrderDateTime_(order.room_start_time);
    var matchesSession = !roomStartTime || orderRoomStartTime === String(roomStartTime).trim();

    return isOpen && matchesRoom && matchesSession;
  });
  var itemsByOrderId = groupFnbOrderItemsByOrderId_(readFnbOrderItemsOrEmpty_());
  var normalizedOrders = orders
    .map(function (order) {
      var orderId = order.order_id || "";
      var items = itemsByOrderId[orderId] || [];

      return {
        order_id: orderId,
        room_id: order.room_id || "",
        room_name: order.room_name || "",
        room_start_time: normalizeFnbOrderDateTime_(order.room_start_time),
        order_status: order.order_status || "",
        order_total: Number(order.order_total) || 0,
        cashier_name: order.cashier_name || "",
        note: order.note || "",
        created_at: normalizeFnbOrderDateTime_(order.created_at),
        updated_at: normalizeFnbOrderDateTime_(order.updated_at),
        items: items,
      };
    })
    .sort(function (first, second) {
      return new Date(second.created_at).getTime() - new Date(first.created_at).getTime();
    });
  var summary = normalizedOrders.reduce(function (result, order) {
    result.total_orders += 1;
    result.total_amount += Number(order.order_total) || 0;
    result.total_items += order.items.reduce(function (total, item) {
      return total + (Number(item.quantity) || 0);
    }, 0);

    return result;
  }, {
    total_orders: 0,
    total_items: 0,
    total_amount: 0,
  });

  return {
    ok: true,
    orders: normalizedOrders,
    summary: summary,
  };
}

function cancelFnbOrder_(orderId, cancelReason, cancelledBy) {
  var normalizedOrderId = String(orderId || "").trim();

  if (!normalizedOrderId) {
    return {
      ok: false,
      error: "order_id wajib diisi.",
    };
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    if (!sheetExists_("FnbOrders")) {
      return {
        ok: false,
        error: "Order F&B tidak ditemukan.",
      };
    }

    var sheet = ensureFnbOrdersSheetColumns_();
    var headerMap = getHeaderMap_(sheet);
    var rowNumber = findFnbOrderRowById_(normalizedOrderId, sheet, headerMap);

    if (!rowNumber) {
      return {
        ok: false,
        error: "Order F&B tidak ditemukan.",
      };
    }

    var currentStatus = String(sheet.getRange(rowNumber, headerMap.order_status).getValue() || "").trim().toLowerCase();

    if (currentStatus === "billed") {
      return {
        ok: false,
        error: "Order F&B sudah masuk tagihan dan tidak bisa dibatalkan.",
      };
    }

    if (currentStatus === "cancelled") {
      return {
        ok: false,
        error: "Order F&B sudah dibatalkan.",
      };
    }

    if (currentStatus !== "open") {
      return {
        ok: false,
        error: "Status order F&B tidak bisa dibatalkan.",
      };
    }

    var now = toJakartaIsoString_(new Date());
    var reason = String(cancelReason || "").trim() || "Tanpa alasan";
    var user = String(cancelledBy || "").trim() || "Kasir";

    sheet.getRange(rowNumber, headerMap.order_status).setValue("cancelled");
    sheet.getRange(rowNumber, headerMap.cancel_reason).setValue(reason);
    sheet.getRange(rowNumber, headerMap.cancelled_by).setValue(user);
    sheet.getRange(rowNumber, headerMap.cancelled_at).setValue(now);

    if (headerMap.updated_at) {
      sheet.getRange(rowNumber, headerMap.updated_at).setValue(now);
    }

    return {
      ok: true,
      message: "Order F&B berhasil dibatalkan.",
      order: getFnbOrderObjectFromRow_(sheet, rowNumber),
    };
  } finally {
    lock.releaseLock();
  }
}

function getTodayFnbOrders_(status, roomId) {
  return getTodayFnbOrdersByPeriod_(status, roomId, "today", "", "");
}

function getTodayFnbOrdersByPeriod_(status, roomId, period, startDate, endDate) {
  var periodResult = parseTransactionPeriod_(period, startDate, endDate);

  if (!periodResult.ok) {
    return periodResult;
  }

  var normalizedStatus = String(status || "").trim().toLowerCase();
  var normalizedRoomId = String(roomId || "").trim();

  if (normalizedStatus && ["open", "billed", "cancelled"].indexOf(normalizedStatus) === -1) {
    return {
      ok: false,
      error: "Status order F&B tidak dikenal.",
    };
  }

  if (!sheetExists_("FnbOrders") || !sheetExists_("FnbOrderItems")) {
    return Object.assign({
      ok: true,
      orders: [],
      summary: createTodayFnbOrderEmptySummary_(),
    }, buildOperationalPeriodMetadata_(periodResult));
  }

  var itemsByOrderId = groupFnbOrderItemsByOrderId_(readFnbOrderItemsOrEmpty_());
  var orders = readFnbOrdersOrEmpty_()
    .filter(function (order) {
      var orderStatus = String(order.order_status || "").trim().toLowerCase();
      var matchesStatus = !normalizedStatus || orderStatus === normalizedStatus;
      var matchesRoom = !normalizedRoomId || String(order.room_id || "").trim() === normalizedRoomId;
      var operationalDate = resolveFnbOrderOperationalDateString_(order);

      return matchesStatus && matchesRoom && matchesOperationalPeriod_(operationalDate, periodResult);
    })
    .map(function (order) {
      var orderId = order.order_id || "";

      return {
        order_id: orderId,
        room_id: order.room_id || "",
        room_name: order.room_name || "",
        room_start_time: normalizeFnbOrderDateTime_(order.room_start_time),
        order_status: String(order.order_status || "").trim().toLowerCase(),
        order_total: Number(order.order_total) || 0,
        cashier_name: order.cashier_name || "",
        note: order.note || "",
        created_at: normalizeFnbOrderDateTime_(order.created_at),
        updated_at: normalizeFnbOrderDateTime_(order.updated_at),
        cancel_reason: order.cancel_reason || "",
        cancelled_by: order.cancelled_by || "",
        cancelled_at: normalizeFnbOrderDateTime_(order.cancelled_at),
        items: itemsByOrderId[orderId] || [],
      };
    })
    .sort(function (first, second) {
      return new Date(second.created_at).getTime() - new Date(first.created_at).getTime();
    });
  var summary = orders.reduce(function (result, order) {
    var orderTotal = Number(order.order_total) || 0;
    var itemQuantity = order.items.reduce(function (total, item) {
      return total + (Number(item.quantity) || 0);
    }, 0);

    result.total_orders += 1;
    result.total_items += itemQuantity;
    result.total_amount += orderTotal;

    if (order.order_status === "open") {
      result.open_orders += 1;
      result.open_amount += orderTotal;
    } else if (order.order_status === "billed") {
      result.billed_orders += 1;
      result.billed_amount += orderTotal;
    } else if (order.order_status === "cancelled") {
      result.cancelled_orders += 1;
      result.cancelled_amount += orderTotal;
    }

    return result;
  }, createTodayFnbOrderEmptySummary_());

  return Object.assign({
    ok: true,
    orders: orders,
    summary: summary,
  }, buildOperationalPeriodMetadata_(periodResult));
}

function createTodayFnbOrderEmptySummary_() {
  return {
    total_orders: 0,
    open_orders: 0,
    billed_orders: 0,
    cancelled_orders: 0,
    total_items: 0,
    open_amount: 0,
    billed_amount: 0,
    cancelled_amount: 0,
    total_amount: 0,
  };
}

function getTodayStockMovements_(stockItemId, movementType, referenceType) {
  return getTodayStockMovementsByPeriod_(stockItemId, movementType, referenceType, "today", "", "");
}

function getTodayStockMovementsByPeriod_(stockItemId, movementType, referenceType, period, startDate, endDate) {
  var periodResult = parseTransactionPeriod_(period, startDate, endDate);

  if (!periodResult.ok) {
    return periodResult;
  }

  var normalizedStockItemId = String(stockItemId || "").trim();
  var normalizedMovementType = String(movementType || "").trim().toLowerCase();
  var normalizedReferenceType = String(referenceType || "").trim().toLowerCase();

  if (normalizedMovementType && ["in", "out", "adjustment"].indexOf(normalizedMovementType) === -1) {
    return {
      ok: false,
      error: "Jenis mutasi stok tidak dikenal.",
    };
  }

  if (normalizedReferenceType && ["transaction", "manual_adjustment"].indexOf(normalizedReferenceType) === -1) {
    return {
      ok: false,
      error: "Jenis referensi mutasi stok tidak dikenal.",
    };
  }

  if (!sheetExists_("StockMovements")) {
    return Object.assign({
      ok: true,
      stock_movements: [],
      summary: createTodayStockMovementEmptySummary_(),
    }, buildOperationalPeriodMetadata_(periodResult));
  }

  var movements = readSheetAsObjectsOrEmpty_("StockMovements")
    .filter(function (movement) {
      var movementTypeValue = String(movement.movement_type || "").trim().toLowerCase();
      var referenceTypeValue = String(movement.reference_type || "").trim().toLowerCase();
      var operationalDate = getOperationalDateString_(movement.created_at);

      return (
        matchesOperationalPeriod_(operationalDate, periodResult) &&
        (!normalizedStockItemId || String(movement.stock_item_id || "").trim() === normalizedStockItemId) &&
        (!normalizedMovementType || movementTypeValue === normalizedMovementType) &&
        (!normalizedReferenceType || referenceTypeValue === normalizedReferenceType)
      );
    })
    .map(function (movement) {
      return {
        movement_id: movement.movement_id || "",
        created_at: normalizeFnbOrderDateTime_(movement.created_at),
        stock_item_id: movement.stock_item_id || "",
        stock_item_name: movement.stock_item_name || "",
        movement_type: String(movement.movement_type || "").trim().toLowerCase(),
        reference_type: String(movement.reference_type || "").trim().toLowerCase(),
        reference_id: movement.reference_id || "",
        qty_change: Number(movement.qty_change) || 0,
        stock_before: Number(movement.stock_before) || 0,
        stock_after: Number(movement.stock_after) || 0,
        note: movement.note || "",
        cashier_name: movement.cashier_name || "",
      };
    })
    .sort(function (first, second) {
      return new Date(second.created_at).getTime() - new Date(first.created_at).getTime();
    });
  var summary = movements.reduce(function (result, movement) {
    var qtyChange = Number(movement.qty_change) || 0;

    result.total_movements += 1;

    if (movement.movement_type === "in") {
      result.total_in_qty += qtyChange > 0 ? qtyChange : 0;
      result.in_movements += 1;
    } else if (movement.movement_type === "out") {
      result.total_out_qty += Math.abs(qtyChange);
      result.out_movements += 1;
    } else if (movement.movement_type === "adjustment") {
      result.total_adjustment_abs_qty += Math.abs(qtyChange);
      result.adjustment_movements += 1;
    }

    return result;
  }, createTodayStockMovementEmptySummary_());

  return Object.assign({
    ok: true,
    stock_movements: movements,
    summary: summary,
  }, buildOperationalPeriodMetadata_(periodResult));
}

function createTodayStockMovementEmptySummary_() {
  return {
    total_movements: 0,
    total_in_qty: 0,
    total_out_qty: 0,
    total_adjustment_abs_qty: 0,
    in_movements: 0,
    out_movements: 0,
    adjustment_movements: 0,
  };
}

function getTodayFnbSalesReport_() {
  return getTodayFnbSalesReportByPeriod_("today", "", "");
}

function getTodayFnbSalesReportByPeriod_(period, startDate, endDate) {
  var periodResult = parseTransactionPeriod_(period, startDate, endDate);

  if (!periodResult.ok) {
    return periodResult;
  }

  var billedOrders = [];
  var billedOrderIds = {};
  var itemsByOrderId = {};

  if (sheetExists_("FnbOrders")) {
    readFnbOrdersOrEmpty_().forEach(function (order) {
      var orderStatus = String(order.order_status || "").trim().toLowerCase();
      var orderId = order.order_id || "";
      var operationalDate = resolveFnbOrderOperationalDateString_(order);

      if (
        orderStatus === "billed" &&
        orderId &&
        matchesOperationalPeriod_(operationalDate, periodResult)
      ) {
        billedOrders.push(order);
        billedOrderIds[orderId] = true;
      }
    });
  }

  if (sheetExists_("FnbOrderItems")) {
    itemsByOrderId = groupFnbOrderItemsByOrderId_(readFnbOrderItemsOrEmpty_());
  }

  var menuSales = groupFnbSalesByMenu_(billedOrderIds, itemsByOrderId, getMenuItemsByIdMap_());
  var lowStockItems = getLowStockItemsForReport_();
  var summary = createFnbSalesReportSummary_(menuSales, billedOrders.length, lowStockItems);

  return Object.assign({
    ok: true,
    summary: summary,
    menu_sales: menuSales,
    low_stock_items: lowStockItems,
  }, buildOperationalPeriodMetadata_(periodResult));
}

function createFnbSalesReportSummary_(menuSales, totalFnbOrders, lowStockItems) {
  var totalItemsSold = 0;
  var totalFnbSales = 0;
  var topMenu = menuSales.length > 0 ? menuSales[0] : null;
  var lowStockCount = 0;
  var negativeStockCount = 0;

  menuSales.forEach(function (menuSale) {
    totalItemsSold += Number(menuSale.quantity_sold) || 0;
    totalFnbSales += Number(menuSale.gross_sales) || 0;
  });

  lowStockItems.forEach(function (item) {
    if (item.stock_status === "negative") {
      negativeStockCount += 1;
    } else if (item.stock_status === "low") {
      lowStockCount += 1;
    }
  });

  return {
    total_fnb_orders: Number(totalFnbOrders) || 0,
    total_items_sold: totalItemsSold,
    total_fnb_sales: totalFnbSales,
    unique_menus_sold: menuSales.length,
    top_menu_name: topMenu ? topMenu.menu_name : "",
    top_menu_quantity: topMenu ? Number(topMenu.quantity_sold) || 0 : 0,
    low_stock_count: lowStockCount,
    negative_stock_count: negativeStockCount,
  };
}

function groupFnbSalesByMenu_(billedOrderIds, itemsByOrderId, menuItemsById) {
  var menuSalesMap = {};

  Object.keys(billedOrderIds).forEach(function (orderId) {
    var items = itemsByOrderId[orderId] || [];

    items.forEach(function (item) {
      var menuId = String(item.menu_id || "").trim() || "UNKNOWN";
      var quantity = Number(item.quantity) || 0;
      var subtotal = Number(item.subtotal) || 0;
      var menuFallback = menuItemsById[menuId] || {};

      if (!menuSalesMap[menuId]) {
        menuSalesMap[menuId] = {
          menu_id: menuId,
          menu_name: item.menu_name || menuFallback.menu_name || menuId,
          category: item.category || menuFallback.category || "",
          quantity_sold: 0,
          gross_sales: 0,
          order_ids: {},
        };
      }

      menuSalesMap[menuId].quantity_sold += quantity;
      menuSalesMap[menuId].gross_sales += subtotal;
      menuSalesMap[menuId].order_ids[orderId] = true;

      if (!menuSalesMap[menuId].menu_name && (item.menu_name || menuFallback.menu_name)) {
        menuSalesMap[menuId].menu_name = item.menu_name || menuFallback.menu_name;
      }

      if (!menuSalesMap[menuId].category && (item.category || menuFallback.category)) {
        menuSalesMap[menuId].category = item.category || menuFallback.category;
      }
    });
  });

  return Object.keys(menuSalesMap)
    .map(function (menuId) {
      var entry = menuSalesMap[menuId];

      return {
        menu_id: entry.menu_id,
        menu_name: entry.menu_name,
        category: entry.category,
        quantity_sold: entry.quantity_sold,
        gross_sales: entry.gross_sales,
        order_count: Object.keys(entry.order_ids).length,
      };
    })
    .sort(function (first, second) {
      if (second.quantity_sold !== first.quantity_sold) {
        return second.quantity_sold - first.quantity_sold;
      }

      return second.gross_sales - first.gross_sales;
    });
}

function getMenuItemsByIdMap_() {
  if (!sheetExists_("Menu")) {
    return {};
  }

  return readSheetAsObjects_("Menu").reduce(function (map, menuItem) {
    if (menuItem.menu_id) {
      map[menuItem.menu_id] = {
        menu_name: menuItem.menu_name || "",
        category: menuItem.category || "",
      };
    }

    return map;
  }, {});
}

function getLowStockItemsForReport_() {
  if (!sheetExists_("Inventory")) {
    return [];
  }

  ensureInventorySheetColumns_();

  return readSheetAsObjects_("Inventory")
    .map(function (item) {
      var stockItemId = item.stock_item_id || item.item_id || "";
      var stockItemName = item.stock_item_name || item.item_name || "";
      var stockQty = Number(item.stock_qty) || 0;
      var minStock = Number(item.min_stock) || 0;
      var stockStatus = getInventoryStatus_(stockQty, minStock);
      var unit = item.unit || "pcs";
      var suggestedRestockQty = Math.max(0, minStock - stockQty);
      var recommendation = "";

      if (stockStatus === "safe") {
        return null;
      }

      if (stockStatus === "negative") {
        recommendation = "Stok minus, disarankan restock minimal " + suggestedRestockQty + " " + unit + ".";
      } else {
        recommendation = "Stok rendah, disarankan restock minimal " + suggestedRestockQty + " " + unit + ".";
      }

      return {
        stock_item_id: stockItemId,
        stock_item_name: stockItemName,
        category: item.category || "",
        unit: unit,
        stock_qty: stockQty,
        min_stock: minStock,
        stock_status: stockStatus,
        suggested_restock_qty: suggestedRestockQty,
        recommendation: recommendation,
      };
    })
    .filter(function (item) {
      return item && (item.stock_item_id || item.stock_item_name);
    })
    .sort(function (first, second) {
      var statusOrder = {
        negative: 0,
        low: 1,
      };
      var firstOrder = statusOrder[first.stock_status] !== undefined ? statusOrder[first.stock_status] : 2;
      var secondOrder = statusOrder[second.stock_status] !== undefined ? statusOrder[second.stock_status] : 2;

      if (firstOrder !== secondOrder) {
        return firstOrder - secondOrder;
      }

      return first.stock_qty - second.stock_qty;
    });
}

function getTodayRoomTimeLogs_(roomId, actionType) {
  return getTodayRoomTimeLogsByPeriod_(roomId, actionType, "today", "", "");
}

function getTodayRoomTimeLogsByPeriod_(roomId, actionType, period, startDate, endDate) {
  var periodResult = parseTransactionPeriod_(period, startDate, endDate);

  if (!periodResult.ok) {
    return periodResult;
  }

  var normalizedRoomId = String(roomId || "").trim();
  var normalizedActionType = String(actionType || "").trim().toLowerCase();

  if (normalizedActionType && normalizedActionType !== "extend_session") {
    return {
      ok: false,
      error: "Jenis log waktu room tidak dikenal.",
    };
  }

  if (!sheetExists_("RoomTimeLogs")) {
    return Object.assign({
      ok: true,
      room_time_logs: [],
      summary: createRoomTimeLogEmptySummary_(),
    }, buildOperationalPeriodMetadata_(periodResult));
  }

  var logs = readSheetAsObjectsOrEmpty_("RoomTimeLogs")
    .filter(function (log) {
      var logActionType = String(log.action_type || "").trim().toLowerCase();
      var operationalDate = getOperationalDateString_(log.created_at);

      return (
        matchesOperationalPeriod_(operationalDate, periodResult) &&
        (!normalizedRoomId || String(log.room_id || "").trim() === normalizedRoomId) &&
        (!normalizedActionType || logActionType === normalizedActionType)
      );
    })
    .map(function (log) {
      return {
        log_id: log.log_id || "",
        created_at: normalizeFnbOrderDateTime_(log.created_at),
        action_type: String(log.action_type || "").trim().toLowerCase(),
        room_id: log.room_id || "",
        room_name: log.room_name || "",
        old_booked_duration_minutes: Number(log.old_booked_duration_minutes) || 0,
        new_booked_duration_minutes: Number(log.new_booked_duration_minutes) || 0,
        old_scheduled_end_time: normalizeFnbOrderDateTime_(log.old_scheduled_end_time),
        new_scheduled_end_time: normalizeFnbOrderDateTime_(log.new_scheduled_end_time),
        add_minutes: Number(log.add_minutes) || 0,
        cashier_name: log.cashier_name || "",
        note: log.note || "",
      };
    })
    .sort(function (first, second) {
      return new Date(second.created_at).getTime() - new Date(first.created_at).getTime();
    });
  var uniqueRoomIds = {};
  var summary = logs.reduce(function (result, log) {
    result.total_logs += 1;
    result.total_added_minutes += Number(log.add_minutes) || 0;

    if (log.room_id) {
      uniqueRoomIds[log.room_id] = true;
    }

    return result;
  }, createRoomTimeLogEmptySummary_());

  summary.rooms_extended = Object.keys(uniqueRoomIds).length;

  return Object.assign({
    ok: true,
    room_time_logs: logs,
    summary: summary,
  }, buildOperationalPeriodMetadata_(periodResult));
}

function createRoomTimeLogEmptySummary_() {
  return {
    total_logs: 0,
    total_added_minutes: 0,
    rooms_extended: 0,
  };
}

function isSameJakartaDateFromTimestamp_(value, date) {
  return normalizeJakartaDateString_(value) === getJakartaDateString_(date);
}

function sheetExists_(sheetName) {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();

  if (!spreadsheet) {
    throw new Error("Active spreadsheet was not found.");
  }

  return Boolean(spreadsheet.getSheetByName(sheetName));
}

function getOpenFnbOrdersForSession_(roomId, roomStartTime) {
  var normalizedStartTime = normalizeFnbOrderDateTime_(roomStartTime);

  return readFnbOrdersOrEmpty_()
    .filter(function (order) {
      return (
        String(order.room_id || "").trim() === String(roomId || "").trim() &&
        normalizeFnbOrderDateTime_(order.room_start_time) === normalizedStartTime &&
        String(order.order_status || "").trim() === "open"
      );
    })
    .map(function (order) {
      return {
        order_id: order.order_id || "",
        room_id: order.room_id || "",
        room_name: order.room_name || "",
        room_start_time: normalizeFnbOrderDateTime_(order.room_start_time),
        order_status: order.order_status || "",
        order_total: Number(order.order_total) || 0,
        cashier_name: order.cashier_name || "",
        note: order.note || "",
        created_at: normalizeFnbOrderDateTime_(order.created_at),
        updated_at: normalizeFnbOrderDateTime_(order.updated_at),
      };
    });
}

function parseCommaSeparatedIds_(value) {
  if (!value) {
    return [];
  }

  return String(value).split(",").reduce(function (ids, rawId) {
    var id = String(rawId || "").trim();

    if (id && ids.indexOf(id) === -1) {
      ids.push(id);
    }

    return ids;
  }, []);
}

function getFnbOrdersWithItemsByIds_(orderIds) {
  if (!orderIds || orderIds.length === 0) {
    return [];
  }

  var idMap = orderIds.reduce(function (map, orderId) {
    map[orderId] = true;
    return map;
  }, {});
  var itemsByOrderId = groupFnbOrderItemsByOrderId_(readFnbOrderItemsOrEmpty_());

  return readFnbOrdersOrEmpty_()
    .filter(function (order) {
      return idMap[order.order_id];
    })
    .map(function (order) {
      var orderId = order.order_id || "";

      return {
        order_id: orderId,
        room_id: order.room_id || "",
        room_name: order.room_name || "",
        room_start_time: normalizeFnbOrderDateTime_(order.room_start_time),
        order_status: order.order_status || "",
        order_total: Number(order.order_total) || 0,
        cashier_name: order.cashier_name || "",
        note: order.note || "",
        created_at: normalizeFnbOrderDateTime_(order.created_at),
        updated_at: normalizeFnbOrderDateTime_(order.updated_at),
        items: itemsByOrderId[orderId] || [],
      };
    });
}

function calculateFnbTotal_(orders) {
  return orders.reduce(function (total, order) {
    return total + (Number(order.order_total) || 0);
  }, 0);
}

function deductStockForFnbOrders_(fnbOrders, transactionId, cashierName, now) {
  if (!fnbOrders || fnbOrders.length === 0) {
    return {
      movements: [],
      warnings: [],
    };
  }

  var stockPlan = calculateStockRequirementsFromFnbOrders_(fnbOrders);
  var inventoryMap = getInventoryMap_();
  var movements = [];
  var warnings = stockPlan.warnings.slice();

  stockPlan.requirements.forEach(function (requirement) {
    var inventory = inventoryMap[requirement.stock_item_id];

    if (!inventory) {
      warnings.push("Item stok " + requirement.stock_item_id + " tidak ditemukan.");
      return;
    }

    if (String(inventory.status || "").trim().toLowerCase() === "inactive") {
      warnings.push("Stok " + inventory.stock_item_name + " berstatus inactive.");
    }

    var stockBefore = toStockNumber_(inventory.stock_qty);
    var stockAfter = stockBefore - requirement.required_qty;

    inventory.sheet.getRange(inventory.row_number, inventory.header_map.stock_qty).setValue(stockAfter);

    if (inventory.header_map.updated_at) {
      inventory.sheet.getRange(inventory.row_number, inventory.header_map.updated_at).setValue(now);
    }

    var movement = {
      movement_id: generateStockMovementId_(),
      created_at: now,
      stock_item_id: inventory.stock_item_id,
      stock_item_name: inventory.stock_item_name,
      movement_type: "out",
      reference_type: "transaction",
      reference_id: transactionId,
      qty_change: -requirement.required_qty,
      stock_before: stockBefore,
      stock_after: stockAfter,
      note: "F&B billed dari transaksi " + transactionId,
      cashier_name: cashierName || "Kasir",
    };

    appendStockMovement_(movement);
    movements.push(movement);

    if (stockAfter < 0) {
      warnings.push("Stok " + inventory.stock_item_name + " minus.");
    } else if (stockAfter <= inventory.min_stock) {
      warnings.push("Stok " + inventory.stock_item_name + " rendah.");
    }
  });

  return {
    movements: movements,
    warnings: warnings,
  };
}

function calculateStockRequirementsFromFnbOrders_(fnbOrders) {
  var menuStockMap = getMenuStockMap_();
  var requirementMap = {};
  var warnings = [];

  fnbOrders.forEach(function (order) {
    (order.items || []).forEach(function (item) {
      var menuId = item.menu_id || "";
      var menuName = item.menu_name || menuId || "Menu tanpa nama";
      var menuStock = menuStockMap[menuId];

      if (!menuStock) {
        warnings.push("Menu " + menuName + " tidak ditemukan di mapping stok.");
        return;
      }

      if (!isStockTrackingEnabled_(menuStock.stock_tracking)) {
        warnings.push("Menu " + menuName + " belum mengaktifkan tracking stok.");
        return;
      }

      if (!menuStock.stock_item_id) {
        warnings.push("Menu " + menuName + " belum memiliki mapping stok.");
        return;
      }

      var qtyPerUnit = toStockNumber_(menuStock.stock_qty_per_unit);

      if (qtyPerUnit <= 0) {
        warnings.push("Menu " + menuName + " belum memiliki qty stok per unit yang valid.");
        return;
      }

      var requiredQty = (Number(item.quantity) || 0) * qtyPerUnit;

      if (requiredQty <= 0) {
        return;
      }

      if (!requirementMap[menuStock.stock_item_id]) {
        requirementMap[menuStock.stock_item_id] = {
          stock_item_id: menuStock.stock_item_id,
          required_qty: 0,
          source_menu_names: [],
        };
      }

      requirementMap[menuStock.stock_item_id].required_qty += requiredQty;

      if (requirementMap[menuStock.stock_item_id].source_menu_names.indexOf(menuName) === -1) {
        requirementMap[menuStock.stock_item_id].source_menu_names.push(menuName);
      }
    });
  });

  return {
    requirements: Object.keys(requirementMap).map(function (stockItemId) {
      return requirementMap[stockItemId];
    }),
    warnings: warnings,
  };
}

function getMenuStockMap_() {
  ensureMenuStockColumns_();

  return readSheetAsObjects_("Menu").reduce(function (map, menuItem) {
    var menuId = menuItem.menu_id || "";

    if (!menuId) {
      return map;
    }

    map[menuId] = {
      menu_id: menuId,
      menu_name: menuItem.menu_name || "",
      stock_tracking: menuItem.stock_tracking || "",
      stock_item_id: menuItem.stock_item_id || "",
      stock_qty_per_unit: menuItem.stock_qty_per_unit || 0,
    };

    return map;
  }, {});
}

function getInventoryMap_() {
  var sheet = ensureInventorySheetColumns_();
  var headerMap = getHeaderMap_(sheet);
  var values = sheet.getDataRange().getValues();
  var headers = values[0].map(function (header) {
    return String(header).trim();
  });

  return values.slice(1).reduce(function (map, row, index) {
    var isEmptyRow = row.every(function (cell) {
      return cell === "" || cell === null;
    });

    if (isEmptyRow) {
      return map;
    }

    var item = headers.reduce(function (result, header, cellIndex) {
      if (header) {
        result[header] = normalizeCellValue_(header, row[cellIndex]);
      }

      return result;
    }, {});
    var stockItemId = item.stock_item_id || item.item_id || "";

    if (!stockItemId) {
      return map;
    }

    map[stockItemId] = {
      sheet: sheet,
      header_map: headerMap,
      row_number: index + 2,
      stock_item_id: stockItemId,
      stock_item_name: item.stock_item_name || item.item_name || stockItemId,
      stock_qty: Number(item.stock_qty) || 0,
      min_stock: Number(item.min_stock) || 0,
      status: item.status || "",
    };

    return map;
  }, {});
}

function isStockTrackingEnabled_(value) {
  var normalizedValue = String(value || "").trim().toLowerCase();
  return ["yes", "true", "1", "y"].indexOf(normalizedValue) !== -1;
}

function toStockNumber_(value) {
  var numberValue = Number(value);
  return isFinite(numberValue) ? numberValue : 0;
}

function markFnbOrdersAsBilled_(orderIds, now) {
  if (!orderIds || orderIds.length === 0) {
    return;
  }

  var sheet = getSheet_("FnbOrders");
  var headerMap = getHeaderMap_(sheet);

  orderIds.forEach(function (orderId) {
    var rowNumber = findRowByValue_(sheet, headerMap, "order_id", orderId);

    if (!rowNumber) {
      throw new Error("Order F&B tidak ditemukan: " + orderId);
    }

    sheet.getRange(rowNumber, headerMap.order_status).setValue("billed");

    if (headerMap.updated_at) {
      sheet.getRange(rowNumber, headerMap.updated_at).setValue(now);
    }
  });
}

function findFnbOrderRowById_(orderId, sheet, headerMap) {
  var targetSheet = sheet || getSheet_("FnbOrders");
  return findRowByValue_(targetSheet, headerMap || getHeaderMap_(targetSheet), "order_id", orderId);
}

function getFnbOrderObjectFromRow_(sheet, rowNumber) {
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(function (header) {
    return String(header).trim();
  });
  var values = sheet.getRange(rowNumber, 1, 1, sheet.getLastColumn()).getValues()[0];
  var order = headers.reduce(function (result, header, index) {
    if (header) {
      result[header] = values[index];
    }

    return result;
  }, {});

  return {
    order_id: order.order_id || "",
    room_id: order.room_id || "",
    room_name: order.room_name || "",
    room_start_time: normalizeFnbOrderDateTime_(order.room_start_time),
    order_status: String(order.order_status || "").trim().toLowerCase(),
    order_total: Number(order.order_total) || 0,
    cashier_name: order.cashier_name || "",
    note: order.note || "",
    created_at: normalizeFnbOrderDateTime_(order.created_at),
    updated_at: normalizeFnbOrderDateTime_(order.updated_at),
    cancel_reason: order.cancel_reason || "",
    cancelled_by: order.cancelled_by || "",
    cancelled_at: normalizeFnbOrderDateTime_(order.cancelled_at),
  };
}

function readFnbOrdersOrEmpty_() {
  return readSheetAsObjectsOrEmpty_("FnbOrders");
}

function readFnbOrderItemsOrEmpty_() {
  return readSheetAsObjectsOrEmpty_("FnbOrderItems").map(function (item) {
    return {
      order_id: item.order_id || "",
      menu_id: item.menu_id || "",
      menu_name: item.menu_name || "",
      category: item.category || "",
      price: Number(item.price) || 0,
      quantity: Number(item.quantity) || 0,
      subtotal: Number(item.subtotal) || 0,
      created_at: normalizeFnbOrderDateTime_(item.created_at),
    };
  });
}

function readSheetAsObjectsOrEmpty_(sheetName) {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();

  if (!spreadsheet) {
    throw new Error("Active spreadsheet was not found.");
  }

  var sheet = spreadsheet.getSheetByName(sheetName);

  if (!sheet) {
    return [];
  }

  return readSheetAsObjects_(sheetName);
}

function groupFnbOrderItemsByOrderId_(items) {
  return items.reduce(function (groups, item) {
    var orderId = item.order_id || "";

    if (!orderId) {
      return groups;
    }

    if (!groups[orderId]) {
      groups[orderId] = [];
    }

    groups[orderId].push(item);
    return groups;
  }, {});
}

function normalizeFnbOrderDateTime_(value) {
  if (value instanceof Date) {
    return toJakartaIsoString_(value);
  }

  return value ? String(value).trim() : "";
}

function generateFnbOrderId_() {
  return "FNB-" + Utilities.formatDate(new Date(), "Asia/Jakarta", "yyyyMMdd-HHmmss") + "-" + Math.floor(Math.random() * 1000);
}

function generateStockMovementId_() {
  return "MOV-" + Utilities.formatDate(new Date(), "Asia/Jakarta", "yyyyMMdd-HHmmss") + "-" + Math.floor(Math.random() * 1000);
}

function ensureFnbOrdersSheet_() {
  return ensureFnbOrdersSheetColumns_();
}

function ensureFnbOrdersSheetColumns_() {
  var sheet = ensureSheetWithHeaders_("FnbOrders", FNB_ORDERS_HEADERS);
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(function (header) {
    return String(header).trim();
  });

  FNB_ORDERS_HEADERS.forEach(function (header) {
    if (headers.indexOf(header) === -1) {
      sheet.getRange(1, sheet.getLastColumn() + 1).setValue(header);
      headers.push(header);
    }
  });

  return sheet;
}

function ensureFnbOrderItemsSheet_() {
  return ensureSheetWithHeaders_("FnbOrderItems", FNB_ORDER_ITEMS_HEADERS);
}

function ensureMenuStockColumns_() {
  var sheet = getSheet_("Menu");
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(function (header) {
    return String(header).trim();
  });

  MENU_STOCK_HEADERS.forEach(function (header) {
    if (headers.indexOf(header) === -1) {
      sheet.getRange(1, sheet.getLastColumn() + 1).setValue(header);
      headers.push(header);
    }
  });

  return sheet;
}

function ensureInventorySheetColumns_() {
  var sheet = ensureSheetWithHeaders_("Inventory", INVENTORY_HEADERS);
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(function (header) {
    return String(header).trim();
  });

  INVENTORY_HEADERS.forEach(function (header) {
    if (headers.indexOf(header) === -1) {
      sheet.getRange(1, sheet.getLastColumn() + 1).setValue(header);
      headers.push(header);
    }
  });

  return sheet;
}

function ensureStockMovementsSheet_() {
  var sheet = ensureSheetWithHeaders_("StockMovements", STOCK_MOVEMENTS_HEADERS);
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(function (header) {
    return String(header).trim();
  });

  STOCK_MOVEMENTS_HEADERS.forEach(function (header) {
    if (headers.indexOf(header) === -1) {
      sheet.getRange(1, sheet.getLastColumn() + 1).setValue(header);
      headers.push(header);
    }
  });

  return sheet;
}

function ensureRoomsBookingColumns_() {
  var sheet = getSheet_("Rooms");
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(function (header) {
    return String(header).trim();
  });

  ROOMS_BOOKING_HEADERS.forEach(function (header) {
    if (headers.indexOf(header) === -1) {
      sheet.getRange(1, sheet.getLastColumn() + 1).setValue(header);
      headers.push(header);
    }
  });

  return sheet;
}

function ensureSheetWithHeaders_(sheetName, headers) {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();

  if (!spreadsheet) {
    throw new Error("Active spreadsheet was not found.");
  }

  var sheet = spreadsheet.getSheetByName(sheetName);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(sheetName);
  }

  if (sheet.getLastRow() === 0 || sheet.getLastColumn() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }

  return sheet;
}

function getMenuItemsMap_() {
  var menuItems = getMenuItems_().menu_items || [];

  return menuItems.reduce(function (map, menuItem) {
    map[menuItem.menu_id] = menuItem;
    return map;
  }, {});
}

function normalizeFnbOrderItems_(items, menuMap) {
  return items.map(function (item) {
    var menuId = item && item.menu_id ? String(item.menu_id).trim() : "";
    var quantity = toPositiveInteger_(item ? item.quantity : null);

    if (!menuId) {
      throw new Error("menu_id wajib diisi.");
    }

    if (!quantity) {
      throw new Error("Quantity menu harus berupa angka positif.");
    }

    var menuItem = menuMap[menuId];

    if (!menuItem) {
      throw new Error("Menu tidak ditemukan.");
    }

    if (menuItem.status !== "active") {
      throw new Error("Menu tidak aktif tidak bisa dipesan.");
    }

    var price = Number(menuItem.price) || 0;

    return {
      menu_id: menuItem.menu_id,
      menu_name: menuItem.menu_name,
      category: menuItem.category || "",
      price: price,
      quantity: quantity,
      subtotal: price * quantity,
    };
  });
}

function appendFnbOrder_(order) {
  var sheet = ensureFnbOrdersSheet_();
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(function (header) {
    return String(header).trim();
  });
  var rowValues = headers.map(function (header) {
    return order[header] !== undefined ? order[header] : "";
  });

  sheet.appendRow(rowValues);
}

function appendFnbOrderItems_(items) {
  if (!items.length) {
    return;
  }

  var sheet = ensureFnbOrderItemsSheet_();
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(function (header) {
    return String(header).trim();
  });
  var rows = items.map(function (item) {
    return headers.map(function (header) {
      return item[header] !== undefined ? item[header] : "";
    });
  });

  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, headers.length).setValues(rows);
}

function appendStockMovement_(movement) {
  var sheet = ensureStockMovementsSheet_();
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(function (header) {
    return String(header).trim();
  });
  var rowValues = headers.map(function (header) {
    return movement[header] !== undefined ? movement[header] : "";
  });

  sheet.appendRow(rowValues);
}

function ensureRoomTimeLogsSheet_() {
  return ensureSheetWithHeaders_("RoomTimeLogs", ROOM_TIME_LOGS_HEADERS);
}

function ensureTvDevicesSheet_() {
  var sheet = ensureSheetWithHeaders_("TVDevices", TV_DEVICES_HEADERS);
  ensureColumns_(sheet, TV_DEVICES_HEADERS);
  return sheet;
}

function ensureTvControlLogsSheet_() {
  var sheet = ensureSheetWithHeaders_("TVControlLogs", TV_CONTROL_LOGS_HEADERS);
  ensureColumns_(sheet, TV_CONTROL_LOGS_HEADERS);
  return sheet;
}

function appendRoomTimeLog_(logEntry) {
  var sheet = ensureRoomTimeLogsSheet_();
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(function (header) {
    return String(header).trim();
  });
  var rowValues = headers.map(function (header) {
    return logEntry[header] !== undefined ? logEntry[header] : "";
  });

  sheet.appendRow(rowValues);
}

function appendTvControlLog_(logEntry) {
  var sheet = ensureTvControlLogsSheet_();
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(function (header) {
    return String(header).trim();
  });
  var rowValues = headers.map(function (header) {
    return logEntry[header] !== undefined ? logEntry[header] : "";
  });

  sheet.appendRow(rowValues);
}

function generateRoomTimeLogId_() {
  return "RTL-" + Utilities.formatDate(new Date(), "Asia/Jakarta", "yyyyMMdd-HHmmss") + "-" + Math.floor(Math.random() * 1000);
}

function generateTvControlLogId_() {
  return "TVL-" + Utilities.formatDate(new Date(), "Asia/Jakarta", "yyyyMMdd-HHmmss") + "-" + Math.floor(Math.random() * 1000);
}

function toPositiveInteger_(value) {
  var numberValue = Number(value);

  if (!isFinite(numberValue) || numberValue < 1 || Math.floor(numberValue) !== numberValue) {
    return 0;
  }

  return numberValue;
}

function generateClosingId_() {
  return "CLS-" + Utilities.formatDate(new Date(), "Asia/Jakarta", "yyyyMMdd-HHmmss") + "-" + Math.floor(Math.random() * 1000);
}

function getJakartaDateString_(date) {
  return Utilities.formatDate(date, "Asia/Jakarta", "yyyy-MM-dd");
}

function addMinutesToJakartaIsoString_(isoString, minutes) {
  var date = new Date(isoString);

  if (isNaN(date.getTime())) {
    throw new Error("Waktu mulai sesi tidak valid.");
  }

  return toJakartaIsoString_(new Date(date.getTime() + (Number(minutes) || 0) * 60000));
}

function ensureCashierClosingsSheet_() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();

  if (!spreadsheet) {
    throw new Error("Active spreadsheet was not found.");
  }

  var sheet = spreadsheet.getSheetByName("CashierClosings");

  if (!sheet) {
    sheet = spreadsheet.insertSheet("CashierClosings");
  }

  if (sheet.getLastRow() === 0 || sheet.getLastColumn() === 0) {
    sheet.getRange(1, 1, 1, CASHIER_CLOSINGS_HEADERS.length).setValues([CASHIER_CLOSINGS_HEADERS]);
  }

  return sheet;
}

function findRowByValue_(sheet, headerMap, columnName, value) {
  var column = headerMap[columnName];

  if (!column) {
    throw new Error("Kolom tidak ditemukan: " + columnName);
  }

  var lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return null;
  }

  var values = sheet.getRange(2, column, lastRow - 1, 1).getValues();

  for (var index = 0; index < values.length; index++) {
    if (String(values[index][0]).trim() === String(value).trim()) {
      return index + 2;
    }
  }

  return null;
}

function getHeaderMap_(sheet) {
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var headerMap = {};

  headers.forEach(function (header, index) {
    var key = String(header).trim();

    if (key) {
      headerMap[key] = index + 1;
    }
  });

  return headerMap;
}

function toJakartaIsoString_(date) {
  return Utilities.formatDate(date, "Asia/Jakarta", "yyyy-MM-dd'T'HH:mm:ssXXX");
}

function generateTransactionId_() {
  return "TRX-" + Utilities.formatDate(new Date(), "Asia/Jakarta", "yyyyMMddHHmmss") + "-" + Math.floor(Math.random() * 1000);
}

function appendTransaction_(transaction) {
  var sheet = ensureTransactionsSheetColumns_();
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(function (header) {
    return String(header).trim();
  });
  var rowValues = headers.map(function (header) {
    return transaction[header] !== undefined ? transaction[header] : "";
  });

  sheet.appendRow(rowValues);
}

function ensureTransactionsSheetColumns_() {
  var sheet = getSheet_("Transactions");
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(function (header) {
    return String(header).trim();
  });

  TRANSACTIONS_EXTRA_HEADERS.forEach(function (header) {
    if (headers.indexOf(header) === -1) {
      sheet.getRange(1, sheet.getLastColumn() + 1).setValue(header);
      headers.push(header);
    }
  });

  return sheet;
}

function getTransactionAmount_(transaction) {
  var grandTotal = Number(transaction.grand_total) || 0;

  if (grandTotal > 0) {
    return grandTotal;
  }

  return Number(transaction.room_total) || 0;
}

function calculateDurationMinutes_(startTime, endTime) {
  var startDate = startTime instanceof Date ? startTime : new Date(startTime);
  var endDate = endTime instanceof Date ? endTime : new Date(endTime);
  var diffMs = endDate.getTime() - startDate.getTime();

  return Math.max(1, Math.ceil(diffMs / 60000));
}

function resolveSessionBilling_(room, startDate, endDate) {
  var bookedDurationMinutes = Number(room.booked_duration_minutes) || 0;
  var ratePerHour = Number(room.rate_per_hour) || 0;

  if (isFinite(bookedDurationMinutes) && bookedDurationMinutes > 0) {
    return {
      duration_minutes: bookedDurationMinutes,
      room_total: calculateRoomTotal_(bookedDurationMinutes, ratePerHour),
      billing_basis: "booked_duration",
    };
  }

  var actualDurationMinutes = calculateDurationMinutes_(startDate, endDate);

  return {
    duration_minutes: actualDurationMinutes,
    room_total: calculateRoomTotal_(actualDurationMinutes, ratePerHour),
    billing_basis: "actual_duration",
  };
}

function calculateRoomTotal_(durationMinutes, ratePerHour) {
  return Math.ceil((durationMinutes / 60) * ratePerHour);
}

function getRowObject_(sheet, headerMap, rowNumber) {
  var row = {};

  Object.keys(headerMap).forEach(function (header) {
    row[header] = normalizeCellValue_(header, sheet.getRange(rowNumber, headerMap[header]).getValue());
  });

  return row;
}

function healthCheck_() {
  return {
    ok: true,
    service: SERVICE_NAME,
    timestamp: new Date().toISOString(),
  };
}

function normalizeCellValue_(header, value) {
  if (value === "") {
    return null;
  }

  if (NUMERIC_FIELDS[header]) {
    var numberValue = Number(value);
    return isNaN(numberValue) ? value : numberValue;
  }

  return value;
}

function getRoomFromRow_(sheet, headerMap, rowNumber) {
  var room = getRowObject_(sheet, headerMap, rowNumber);

  return {
    room_id: room.room_id || "",
    room_name: room.room_name || "",
    status: room.status || "",
    start_time: room.start_time || null,
    booked_duration_minutes: Number(room.booked_duration_minutes) || 0,
    scheduled_end_time: room.scheduled_end_time || null,
    rate_per_hour: room.rate_per_hour || 0,
    tv_device_id: room.tv_device_id || "",
    updated_at: room.updated_at || null,
  };
}
