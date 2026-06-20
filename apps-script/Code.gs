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
      return jsonResponse(getTodayFnbOrders_(e.parameter.status, e.parameter.room_id));
    }

    if (action === "getTodayStockMovements") {
      return jsonResponse(getTodayStockMovements_(
        e.parameter.stock_item_id,
        e.parameter.movement_type,
        e.parameter.reference_type
      ));
    }

    if (action === "getTodayFnbSalesReport") {
      return jsonResponse(getTodayFnbSalesReport_());
    }

    if (action === "getTodayRoomTimeLogs") {
      return jsonResponse(getTodayRoomTimeLogs_(e.parameter.room_id, e.parameter.action_type));
    }

    if (action === "getFnbOrdersByIds") {
      return jsonResponse({
        ok: true,
        orders: getFnbOrdersWithItemsByIds_(parseCommaSeparatedIds_(e.parameter.order_ids)),
      });
    }

    return jsonResponse({
      ok: false,
      error: action
        ? "Aksi tidak dikenal: " + action
        : "Parameter action wajib diisi.",
    });
  } catch (error) {
    return jsonResponse({
      ok: false,
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

    if (action === "adjustInventoryStock") {
      return jsonResponse(adjustInventoryStock_(
        payload.stock_item_id,
        payload.adjustment_type,
        payload.quantity,
        payload.note,
        payload.cashier_name
      ));
    }

    return jsonResponse({
      ok: false,
      error: action
        ? "Aksi tidak dikenal: " + action
        : "Parameter action wajib diisi.",
    });
  } catch (error) {
    return jsonResponse({
      ok: false,
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

  return readSheetAsObjects_("Rooms").map(function (room) {
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

      var transactionDate = resolveTransactionDateString_(transaction);

      return isDateWithinInclusiveRange_(
        transactionDate,
        periodResult.startDate,
        periodResult.endDate
      );
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

  return {
    ok: true,
    transactions: transactions,
    summary: summary,
    period: periodResult.period,
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

      var closingDate = normalizeJakartaDateString_(closing.closing_date)
        || normalizeJakartaDateString_(closing.created_at);

      return isDateWithinInclusiveRange_(
        closingDate,
        periodResult.startDate,
        periodResult.endDate
      );
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

  return {
    ok: true,
    closings: closings,
    summary: {
      total_closings: closings.length,
      latest_closing_id: closings.length > 0 ? closings[0].closing_id : "",
      latest_created_at: closings.length > 0 ? closings[0].created_at : "",
    },
    period: periodResult.period,
  };
}

function parseTransactionPeriod_(period, startDate, endDate) {
  var normalizedPeriod = String(period || "today").trim().toLowerCase();
  var today = getJakartaDateString_(new Date());

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
      startDate: today,
      endDate: today,
    };
  }

  if (normalizedPeriod === "yesterday") {
    var yesterday = getJakartaDateWithOffset_(-1);

    return {
      ok: true,
      period: normalizedPeriod,
      startDate: yesterday,
      endDate: yesterday,
    };
  }

  if (normalizedPeriod === "last7days") {
    return {
      ok: true,
      period: normalizedPeriod,
      startDate: getJakartaDateWithOffset_(-6),
      endDate: today,
    };
  }

  if (normalizedPeriod === "thismonth") {
    return {
      ok: true,
      period: normalizedPeriod,
      startDate: getJakartaMonthStartDateString_(),
      endDate: today,
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

function resolveTransactionDateString_(transaction) {
  return normalizeJakartaDateString_(transaction.created_at)
    || normalizeJakartaDateString_(transaction.end_time)
    || normalizeJakartaDateString_(transaction.start_time)
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
  var normalizedStatus = String(status || "").trim().toLowerCase();
  var normalizedRoomId = String(roomId || "").trim();

  if (normalizedStatus && ["open", "billed", "cancelled"].indexOf(normalizedStatus) === -1) {
    return {
      ok: false,
      error: "Status order F&B tidak dikenal.",
    };
  }

  if (!sheetExists_("FnbOrders") || !sheetExists_("FnbOrderItems")) {
    return {
      ok: true,
      orders: [],
      summary: createTodayFnbOrderEmptySummary_(),
    };
  }

  var today = new Date();
  var itemsByOrderId = groupFnbOrderItemsByOrderId_(readFnbOrderItemsOrEmpty_());
  var orders = readFnbOrdersOrEmpty_()
    .filter(function (order) {
      var orderStatus = String(order.order_status || "").trim().toLowerCase();
      var matchesStatus = !normalizedStatus || orderStatus === normalizedStatus;
      var matchesRoom = !normalizedRoomId || String(order.room_id || "").trim() === normalizedRoomId;

      return matchesStatus && matchesRoom && isSameJakartaDateFromTimestamp_(order.created_at, today);
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

  return {
    ok: true,
    orders: orders,
    summary: summary,
  };
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
    return {
      ok: true,
      stock_movements: [],
      summary: createTodayStockMovementEmptySummary_(),
    };
  }

  var today = new Date();
  var movements = readSheetAsObjectsOrEmpty_("StockMovements")
    .filter(function (movement) {
      var movementTypeValue = String(movement.movement_type || "").trim().toLowerCase();
      var referenceTypeValue = String(movement.reference_type || "").trim().toLowerCase();

      return (
        isSameJakartaDateFromTimestamp_(movement.created_at, today) &&
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

  return {
    ok: true,
    stock_movements: movements,
    summary: summary,
  };
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
  var today = new Date();
  var billedOrders = [];
  var billedOrderIds = {};
  var itemsByOrderId = {};

  if (sheetExists_("FnbOrders")) {
    readFnbOrdersOrEmpty_().forEach(function (order) {
      var orderStatus = String(order.order_status || "").trim().toLowerCase();
      var orderId = order.order_id || "";

      if (
        orderStatus === "billed" &&
        orderId &&
        isSameJakartaDateFromTimestamp_(order.created_at, today)
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

  return {
    ok: true,
    summary: summary,
    menu_sales: menuSales,
    low_stock_items: lowStockItems,
  };
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
  var normalizedRoomId = String(roomId || "").trim();
  var normalizedActionType = String(actionType || "").trim().toLowerCase();

  if (normalizedActionType && normalizedActionType !== "extend_session") {
    return {
      ok: false,
      error: "Jenis log waktu room tidak dikenal.",
    };
  }

  if (!sheetExists_("RoomTimeLogs")) {
    return {
      ok: true,
      room_time_logs: [],
      summary: createRoomTimeLogEmptySummary_(),
    };
  }

  var today = new Date();
  var logs = readSheetAsObjectsOrEmpty_("RoomTimeLogs")
    .filter(function (log) {
      var logActionType = String(log.action_type || "").trim().toLowerCase();

      return (
        isSameJakartaDateFromTimestamp_(log.created_at, today) &&
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

  return {
    ok: true,
    room_time_logs: logs,
    summary: summary,
  };
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

function generateRoomTimeLogId_() {
  return "RTL-" + Utilities.formatDate(new Date(), "Asia/Jakarta", "yyyyMMdd-HHmmss") + "-" + Math.floor(Math.random() * 1000);
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
