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
var FNB_V25A_BOOKING_MODE_REGULAR = "regular";
var FNB_V25A_BOOKING_MODE_PACKAGE = "package";
var FNB_V25A_PACKAGE_TYPE_ROOM_FNB_BUNDLE = "room_fnb_bundle";
var FNB_V25A_PRICING_VERSION = "fnb-v2.5a";
var FNB_V25A_VALID_DAY_ALL = "all";
var FNB_V25A_VALID_DAY_WEEKDAY = "weekday";
var FNB_V25A_VALID_DAY_WEEKEND = "weekend";
var FNB_GENERAL_ROOM_ID = "FNB-GENERAL";
var FNB_GENERAL_ROOM_NAME = "F&B Umum";
var DEV_SHORT_SESSION_ENABLED = true;
var DEV_MIN_SESSION_MINUTES = 1;
var MIN_SESSION_MINUTES = 15;
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
  total_items: true,
  counted_items: true,
  matched_items: true,
  variance_items: true,
  shortage_items: true,
  overage_items: true,
  absolute_variance_qty: true,
  net_variance_qty: true,
  book_qty_snapshot: true,
  sealed_container_qty: true,
  count_qty: true,
  final_qty: true,
  difference_qty: true,
  cost_per_unit: true,
  cost_rate: true,
  selling_rate: true,
  selling_price: true,
  hpp: true,
  var_cost_rate: true,
  var_cost_amount: true,
  total_cost: true,
  margin_amount: true,
  margin_percent: true,
  additional_price: true,
  cost_amount: true,
  line_no: true,
  price: true,
  quantity: true,
  subtotal: true,
  qty_used: true,
  waste_percent: true,
  base_salary: true,
  rate_per_room: true,
  rate: true,
  lc_total: true,
  promo_discount: true,
  bonus_per_item: true,
  bonus_total: true,
  room_earning_total: true,
  sales_bonus_total: true,
  cash_advance_deducted: true,
  gross_earning_total: true,
  net_payout_total: true,
  amount: true,
  cash_in_amount: true,
  cash_out_amount: true,
  balance_after: true,
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
  "customer_name",
  "general_bill_id",
  "billed_transaction_id",
  "idempotency_key",
];
var FNB_ORDER_ITEMS_HEADERS = [
  "order_id",
  "menu_id",
  "menu_name",
  "category",
  "price",
  "quantity",
  "subtotal",
  "bonus_sales_lc",
  "created_at",
];
var CASHIER_CLOSING_TRANSACTIONS_HEADERS = [
  "closing_transaction_id",
  "closing_id",
  "transaction_id",
  "transaction_type",
  "session_id",
  "room_id",
  "room_name",
  "start_time",
  "end_time",
  "duration_minutes",
  "room_total",
  "fnb_total",
  "lc_total",
  "promo_code",
  "promo_discount",
  "grand_total",
  "fnb_order_ids",
  "payment_method",
  "payment_status",
  "cashier_name",
  "transaction_created_at",
  "snapshot_at",
];
var CASHIER_CLOSING_FNB_ITEMS_HEADERS = [
  "closing_fnb_item_id",
  "closing_id",
  "transaction_id",
  "order_id",
  "room_id",
  "room_name",
  "order_status",
  "menu_id",
  "menu_name",
  "category",
  "price",
  "quantity",
  "subtotal",
  "order_created_at",
  "snapshot_at",
];
var CASHIER_CLOSING_LC_DETAILS_HEADERS = [
  "closing_lc_detail_id",
  "closing_id",
  "entry_type",
  "log_id",
  "bonus_log_id",
  "transaction_id",
  "order_id",
  "session_id",
  "room_id",
  "room_name",
  "lc_id",
  "lc_name",
  "start_time",
  "end_time",
  "duration_minutes",
  "work_status",
  "rate",
  "menu_name",
  "quantity",
  "bonus_per_item",
  "bonus_total",
  "snapshot_at",
];
var RECEIPT_PRINT_LOGS_HEADERS = [
  "print_log_id",
  "transaction_id",
  "print_sequence",
  "is_reprint",
  "print_type",
  "cashier_name",
  "printed_at",
  "note",
];
var TRANSACTIONS_EXTRA_HEADERS = [
  "fnb_total",
  "grand_total",
  "fnb_order_ids",
  "transaction_type",
  "lc_total",
  "promo_code",
  "promo_discount",
  "customer_name",
  "general_bill_id",
];
var PROMO_MASTER_HEADERS = [
  "code",
  "type",
  "discount_type",
  "discount_value",
  "status",
  "used_in_transaction_id",
  "used_at",
  "created_at",
];
var LC_MASTER_HEADERS = [
  "lc_id",
  "lc_name",
  "rate_per_room",
  "status",
  "availability",
  "updated_at",
];
var LC_WORK_LOG_HEADERS = [
  "log_id",
  "session_id",
  "lc_id",
  "lc_name",
  "rate",
  "duration_minutes",
  "rate_per_hour",
  "status",
  "created_at",
  "closed_at",
  "payroll_id",
];
var LC_PAYROLL_HISTORY_HEADERS = [
  "payroll_id",
  "start_date",
  "end_date",
  "total_amount",
  "total_sessions",
  "total_lcs_paid",
  "processed_at",
  "processed_by",
  "room_earning_total",
  "sales_bonus_total",
  "cash_advance_deducted",
  "gross_earning_total",
  "net_payout_total",
  "petty_cash_ledger_id",
  "status",
];
var LC_SALES_BONUS_LOG_HEADERS = [
  "bonus_log_id",
  "operational_date",
  "transaction_id",
  "order_id",
  "menu_id",
  "menu_name",
  "category",
  "lc_id",
  "lc_name",
  "quantity",
  "bonus_per_item",
  "bonus_total",
  "source_status",
  "payroll_id",
  "created_at",
  "created_by",
  "voided_at",
  "void_reason",
];
var LC_CASH_ADVANCES_HEADERS = [
  "cash_advance_id",
  "operational_date",
  "lc_id",
  "lc_name",
  "amount",
  "status",
  "requested_by",
  "cashier_name",
  "petty_cash_ledger_id",
  "payroll_id",
  "note",
  "created_at",
  "deducted_at",
  "cancelled_at",
  "cancel_reason",
];
var PETTY_CASH_LEDGER_HEADERS = [
  "ledger_id",
  "operational_date",
  "entry_type",
  "category",
  "reference_type",
  "reference_id",
  "lc_id",
  "lc_name",
  "cash_in_amount",
  "cash_out_amount",
  "balance_after",
  "cashier_name",
  "note",
  "created_at",
  "voided_at",
  "void_reason",
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
var INVENTORY_AUDIT_HEADERS = [
  "audit_id",
  "operational_date",
  "audit_type",
  "scope",
  "status",
  "started_at",
  "started_by",
  "submitted_at",
  "submitted_by",
  "approved_at",
  "approved_by",
  "posted_at",
  "posted_by",
  "note",
  "total_items",
  "counted_items",
  "matched_items",
  "variance_items",
  "shortage_items",
  "overage_items",
  "absolute_variance_qty",
  "net_variance_qty"
];
var INVENTORY_AUDIT_LINE_HEADERS = [
  "audit_line_id",
  "audit_id",
  "stock_item_id",
  "stock_item_name",
  "category",
  "unit",
  "book_qty_snapshot",
  "count_method",
  "sealed_container_qty",
  "open_container_percentages_json",
  "count_qty",
  "final_qty",
  "difference_qty",
  "reason_code",
  "note",
  "status",
  "movement_id",
  "updated_at"
];
var ROOMS_BOOKING_HEADERS = [
  "booked_duration_minutes",
  "scheduled_end_time",
  "customer_name",
  "package_id",
  "lc_ids",
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
var ROOM_RECOVERY_LOGS_HEADERS = [
  "log_id",
  "timestamp",
  "room_id",
  "room_name",
  "session_id",
  "issue_type",
  "expired_minutes",
  "action",
  "reason",
  "actor",
  "result",
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
  "raw_response",
];
var TV_DISPLAYS_HEADERS = [
  "display_id",
  "room_id",
  "display_name",
  "display_token",
  "display_enabled",
  "refresh_interval_seconds",
  "notes",
  "created_at",
  "updated_at",
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
  "bonus_sales_lc",
  "hpp",
  "variable_cost_rate",
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
var SERVICE_ITEMS_HEADERS = [
  "service_item_id",
  "service_name",
  "service_type",
  "unit",
  "cost_rate",
  "selling_rate",
  "status",
  "updated_at",
  "note",
];
var COSTING_HEADERS = [
  "costing_id",
  "menu_id",
  "source_type",
  "hpp",
  "var_cost_rate",
  "var_cost_amount",
  "total_cost",
  "selling_price",
  "margin_amount",
  "margin_percent",
  "effective_from",
  "status",
  "updated_at",
  "note",
];
var PACKAGE_MASTER_HEADERS = [
  "package_id",
  "menu_id",
  "package_name",
  "package_category",
  "package_type",
  "selling_price",
  "status",
  "valid_day_type",
  "duration_minutes",
  "updated_at",
  "note",
];
var PACKAGE_DETAIL_HEADERS = [
  "package_detail_id",
  "package_id",
  "line_no",
  "component_type",
  "component_ref_id",
  "component_name",
  "qty",
  "unit",
  "hpp",
  "additional_price",
  "cost_amount",
  "is_choice",
  "choice_group",
  "updated_at",
  "note",
];
var ROOM_SESSIONS_SHEET = "RoomSessions";
var SESSION_PACKAGES_SHEET = "SessionPackages";
var SESSION_PACKAGE_DETAILS_SHEET = "SessionPackageDetails";
var TRANSACTION_LINES_SHEET = "TransactionLines";
var ROOM_SESSION_HEADERS = [
  "session_id",
  "room_id",
  "room_name",
  "booking_mode",
  "status",
  "start_time",
  "scheduled_end_time",
  "end_time",
  "booked_duration_minutes",
  "package_included_minutes",
  "promotion_free_minutes",
  "billable_room_minutes",
  "rate_per_hour",
  "cashier_name",
  "created_at",
  "updated_at",
  "closed_transaction_id",
  "idempotency_key",
  "legacy_room_start_time",
  "note",
  "customer_name",
  "package_id",
  "prepayment_transaction_id",
  "lc_ids",
  "lc_assignments",
];
var SESSION_PACKAGE_HEADERS = [
  "session_package_id",
  "session_id",
  "package_id",
  "package_name",
  "package_category",
  "package_type",
  "selling_price",
  "duration_minutes",
  "valid_day_type",
  "valid_day_result",
  "status",
  "selected_at",
  "selected_by",
  "snapshot_json",
  "void_reason",
  "voided_at",
];
var SESSION_PACKAGE_DETAIL_HEADERS = [
  "session_package_detail_id",
  "session_package_id",
  "session_id",
  "package_detail_id",
  "line_no",
  "component_type",
  "component_ref_id",
  "component_name",
  "qty",
  "unit",
  "hpp",
  "additional_price",
  "cost_amount",
  "is_choice",
  "choice_group",
  "chosen_ref_id",
  "chosen_name",
  "fulfillment_status",
  "fulfilled_qty",
  "fulfilled_at",
  "snapshot_json",
];
var TRANSACTION_LINE_HEADERS = [
  "transaction_line_id",
  "transaction_id",
  "session_id",
  "line_type",
  "source_type",
  "source_id",
  "description",
  "qty",
  "unit",
  "unit_price",
  "gross_amount",
  "discount_amount",
  "net_amount",
  "tax_amount",
  "sort_order",
  "created_at",
  "snapshot_json",
];
var PACKAGE_SESSION_FOUNDATION_SHEETS = [
  {
    sheet_name: ROOM_SESSIONS_SHEET,
    headers: ROOM_SESSION_HEADERS,
    primary_id: "session_id",
  },
  {
    sheet_name: SESSION_PACKAGES_SHEET,
    headers: SESSION_PACKAGE_HEADERS,
    primary_id: "session_package_id",
  },
  {
    sheet_name: SESSION_PACKAGE_DETAILS_SHEET,
    headers: SESSION_PACKAGE_DETAIL_HEADERS,
    primary_id: "session_package_detail_id",
  },
  {
    sheet_name: TRANSACTION_LINES_SHEET,
    headers: TRANSACTION_LINE_HEADERS,
    primary_id: "transaction_line_id",
  },
];
var LC_FINANCE_FOUNDATION_SHEETS = [
  {
    sheet_name: "LcSalesBonusLogs",
    headers: LC_SALES_BONUS_LOG_HEADERS,
    primary_id: "bonus_log_id",
  },
  {
    sheet_name: "LcCashAdvances",
    headers: LC_CASH_ADVANCES_HEADERS,
    primary_id: "cash_advance_id",
  },
  {
    sheet_name: "PettyCashLedger",
    headers: PETTY_CASH_LEDGER_HEADERS,
    primary_id: "ledger_id",
  },
  {
    sheet_name: "LcPayrollHistory",
    headers: LC_PAYROLL_HISTORY_HEADERS,
    primary_id: "payroll_id",
    allow_append_headers: true,
  },
];
var RECIPE_BOM_HEADERS = [
  "recipe_id",
  "menu_id",
  "line_no",
  "ingredient_item_id",
  "ingredient_name",
  "qty_used",
  "unit",
  "cost_per_unit",
  "cost_amount",
  "waste_percent",
  "status",
  "updated_at",
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

    if (action === "correctActiveRoomDuration") {
      return jsonResponse(correctActiveRoomDuration_(
        e.parameter.room_id,
        e.parameter.target_duration_minutes,
        e.parameter.cashier_name,
        e.parameter.note
      ));
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

    if (action === "getServiceItems") {
      return jsonResponse(getServiceItems_());
    }

    if (action === "getCosting") {
      return jsonResponse(getCosting_());
    }

    if (action === "getPackages") {
      return jsonResponse(getPackages_());
    }

    if (action === "getEligiblePackages") {
      return jsonResponse(getEligiblePackages_(
        e.parameter.room_id,
        e.parameter.duration_minutes,
        e.parameter.booking_date
      ));
    }

    if (action === "getPackageDetails") {
      return jsonResponse(getPackageDetails_(e.parameter.package_id));
    }

    if (action === "getRecipeBom") {
      return jsonResponse(getRecipeBom_(e.parameter.menu_id));
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

    if (action === "getTransactionLcEditDetails") {
      return jsonResponse(getTransactionLcEditDetails_(e.parameter.transaction_id));
    }

    if (action === "getTodayCashierClosings") {
      return jsonResponse(getCashierClosingsByPeriod_(
        e.parameter.period,
        e.parameter.start_date,
        e.parameter.end_date
      ));
    }

    if (action === "getCashierClosingDetails") {
      return jsonResponse(getCashierClosingDetails_(e.parameter.closing_id));
    }

    if (action === "validateCashierClosingSnapshot") {
      return jsonResponse(validateCashierClosingSnapshot_());
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

    if (action === "initializeStockFromJul31") {
      return jsonResponse(initializeStockFromJul31_(e.parameter));
    }

    if (action === "getInventoryAudits") {
      return jsonResponse(getInventoryAudits_(e.parameter.status, e.parameter.limit));
    }

    if (action === "getInventoryAuditDetails") {
      return jsonResponse(getInventoryAuditDetails_(e.parameter.audit_id));
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

    if (action === "getApiCapabilities") {
      return jsonResponse({
        ok: true,
        success: true,
        lc_assignment_dry_run: true,
      });
    }

    if (action === "getLcMasterList") {
      return jsonResponse(getLcMasterList_());
    }

    if (action === "getLcWorkReports") {
      return jsonResponse(getLcWorkReports_(
        e.parameter.period,
        e.parameter.start_date,
        e.parameter.end_date
      ));
    }

    if (action === "getLcPayrollHistory") {
      return jsonResponse(getLcPayrollHistory_());
    }

    if (action === "getLcPayrollDetails") {
      return jsonResponse(getLcPayrollDetails_(e.parameter.payroll_id));
    }

    if (action === "getPendingLcPayroll") {
      return jsonResponse(getPendingLcPayroll_(
        e.parameter.start_date,
        e.parameter.end_date
      ));
    }

    if (action === "validateLcFinanceFoundation") {
      return jsonResponse(validateLcFinanceFoundation_());
    }

    if (action === "getLcFinanceSummary") {
      return jsonResponse(getLcFinanceSummary_(
        e.parameter.period,
        e.parameter.start_date,
        e.parameter.end_date
      ));
    }

    if (action === "getPromos") {
      return jsonResponse(getPromos_());
    }

    if (action === "validatePromoCode") {
      return jsonResponse(validatePromoCode_(e.parameter));
    }

    if (action === "getExpiredRoomRecoveryList") {
      return jsonResponse(getExpiredRoomRecoveryList_(e.parameter));
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
      return jsonResponse(startSession_(payload.room_id, payload.duration_minutes, payload));
    }

    if (action === "prepareRoomSession") {
      return jsonResponse(prepareRoomSession_(payload));
    }

    if (action === "payAndStartSession") {
      return jsonResponse(payAndStartSession_(payload));
    }

    if (action === "completeCleaning") {
      return jsonResponse(completeCleaning_(payload));
    }

    if (action === "cancelBooking") {
      return jsonResponse(cancelBooking_(payload));
    }

    if (action === "bulkImportPackages") {
      return jsonResponse(bulkImportPackages_(payload));
    }

    if (action === "seedReceptionistEmployee") {
      return jsonResponse(seedReceptionistEmployee_());
    }

    if (action === "activatePreparedSession") {
      return jsonResponse(activatePreparedSession_(payload.room_id, payload.cashier_name));
    }

    if (action === "extendSession") {
      return jsonResponse(extendSession_(
        payload.room_id,
        payload.add_minutes,
        payload.cashier_name,
        payload.note,
        payload.payment_method,
        payload.payment_status
      ));
    }

    if (action === "correctActiveRoomDuration") {
      return jsonResponse(correctActiveRoomDuration_(
        payload.room_id,
        payload.target_duration_minutes,
        payload.cashier_name,
        payload.note
      ));
    }

    if (action === "closeSession") {
      return jsonResponse(closeSession_(payload.room_id, payload.cashier_name, payload));
    }

    if (action === "markTransactionPaid") {
      return jsonResponse(markTransactionPaid_(payload.transaction_id, payload.payment_method, payload.promo_code));
    }

    if (action === "updateTransactionDetails") {
      return jsonResponse(updateTransactionDetails_(payload));
    }

    if (action === "updateTransactionLcDurations") {
      return jsonResponse(updateTransactionLcDurations_(payload));
    }

    if (action === "deleteTransaction") {
      return jsonResponse(deleteTransaction_(payload));
    }

    if (action === "logReceiptPrint") {
      return jsonResponse(logReceiptPrint_(payload));
    }

    if (action === "saveCashierClosing") {
      return jsonResponse(saveCashierClosing_(payload.cash_actual, payload.note, payload.cashier_name));
    }

    if (action === "saveFnbOrder") {
      return jsonResponse(saveFnbOrder_(
        payload.room_id,
        payload.items,
        payload.cashier_name,
        payload.note,
        payload.payment_method,
        payload.payment_status,
        payload.customer_name,
        payload.general_bill_id,
        payload.idempotency_key
      ));
    }

    if (action === "settleGeneralFnbBill") {
      return jsonResponse(settleGeneralFnbBill_(payload));
    }

    if (action === "previewSessionPricing") {
      return jsonResponse(previewSessionPricing_(payload));
    }

    if (action === "validatePackageSessionFoundation") {
      return jsonResponse(validatePackageSessionFoundation_());
    }

    if (action === "initializePackageSessionFoundation") {
      return jsonResponse(initializePackageSessionFoundation_(payload));
    }

    if (action === "validateLcFinanceFoundation") {
      return jsonResponse(validateLcFinanceFoundation_());
    }

    if (action === "initializeLcFinanceFoundation") {
      return jsonResponse(initializeLcFinanceFoundation_(payload));
    }

    if (action === "cancelFnbOrder") {
      return jsonResponse(cancelFnbOrder_(payload.order_id, payload.cancel_reason, payload.cancelled_by));
    }

    if (action === "sendTvCommand") {
      return jsonResponse(sendTvCommand_(payload));
    }

    if (action === "saveTvDevice") {
      return jsonResponse(saveTvDevice_(payload));
    }

    if (action === "updateTvDevice") {
      return jsonResponse(updateTvDevice_(payload));
    }

    if (action === "seedPilotTvDisplay") {
      return jsonResponse(seedPilotTvDisplay_());
    }

    if (action === "seedTvDisplaysForAllRooms") {
      return jsonResponse(seedTvDisplaysForAllRooms_());
    }

    if (action === "rotateTvDisplayToken") {
      return jsonResponse(rotateTvDisplayToken_(payload));
    }

    if (action === "getTvDisplaySetupList") {
      return jsonResponse(getTvDisplaySetupList_());
    }

    if (action === "getExpiredRoomRecoveryList") {
      return jsonResponse(getExpiredRoomRecoveryList_(payload));
    }

    if (action === "recoverExpiredRoomSession") {
      return jsonResponse(recoverExpiredRoomSession_(payload));
    }

    if (action === "getCustomerDisplayState") {
      return jsonResponse(getCustomerDisplayState_(payload.room_id, payload.token));
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

    if (action === "initializeStockFromJul31") {
      return jsonResponse(initializeStockFromJul31_(payload));
    }

    if (action === "createInventoryAudit") {
      return jsonResponse(createInventoryAudit_(payload));
    }

    if (action === "saveInventoryAuditCounts") {
      return jsonResponse(saveInventoryAuditCounts_(payload));
    }

    if (action === "submitInventoryAudit") {
      return jsonResponse(submitInventoryAudit_(payload));
    }

    if (action === "approveInventoryAudit") {
      return jsonResponse(approveInventoryAudit_(payload));
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

    if (action === "bulkUpdateMenuProfitability") {
      return jsonResponse(bulkUpdateMenuProfitability_(payload));
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

    if (action === "saveLcMaster") {
      return jsonResponse(saveLcMaster_(payload));
    }

    if (action === "updateLcMaster") {
      return jsonResponse(updateLcMaster_(payload));
    }

    if (action === "deleteLcMaster") {
      return jsonResponse(deleteLcMaster_(payload));
    }

    if (action === "assignSessionLcs") {
      return jsonResponse(assignSessionLcs_(payload));
    }

    if (action === "processLcPayroll") {
      return jsonResponse(processLcPayroll_(payload));
    }

    if (action === "createLcCashAdvance") {
      return jsonResponse(createLcCashAdvance_(payload));
    }

    if (action === "recordPettyCashEntry") {
      return jsonResponse(recordPettyCashEntry_(payload));
    }

    if (action === "createLcSalesBonusLog") {
      return jsonResponse(createLcSalesBonusLog_(payload));
    }

    if (action === "savePromo") {
      return jsonResponse(savePromo_(payload));
    }

    if (action === "updatePromoStatus") {
      return jsonResponse(updatePromoStatus_(payload));
    }

    if (action === "deletePromo") {
      return jsonResponse(deletePromo_(payload));
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

    // Get LC IDs from active session - IMPORTANT: Must check all relevant statuses
    var lcIds = "";
    var lcAssignments = "";
    var debugInfo = {
      room_id: room.room_id,
      lcIds_initial: lcIds,
      activeSession_found: false,
      lcIds_from_session: null,
      lcIds_final: ""
    };

    try {
      // Try to find session with any of these statuses
      var activeSession = findLatestRoomSessionForRoom_(room.room_id || "", ["starting", "active", "closing", "paid_waiting_start"]);
      debugInfo.activeSession_found = !!activeSession;
      
      if (activeSession && activeSession.session) {
        var sessionLcIds = activeSession.session.lc_ids;
        debugInfo.lcIds_from_session = sessionLcIds;
        lcIds = String(sessionLcIds || "").trim();
        lcAssignments = String(activeSession.session.lc_assignments || "").trim();
      }
    } catch (err) {
      Logger.log("Error finding session for " + room.room_id + ": " + err.message);
      // Safe fallback - use lc_ids from room sheet if available
      lcIds = String(room.lc_ids || "").trim();
    }

    debugInfo.lcIds_final = lcIds;

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
      lc_ids: lcIds,
      lc_assignments: lcAssignments,
      lc_companion_ids: lcIds,
      _debug_lc_info: debugInfo,
    };

    return roomObj;
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
    var currentDevice;

    if (!roomId) {
      return map;
    }

    currentDevice = map[roomId];

    if (!currentDevice) {
      map[roomId] = normalizedDevice;
      return map;
    }

    if (currentDevice.status !== "active" && normalizedDevice.status === "active") {
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
    raw_response: log.raw_response || "",
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

function normalizeBoolean_(value) {
  if (value === true) {
    return true;
  }

  var normalizedValue = String(value || "").trim().toLowerCase();

  return normalizedValue === "true"
    || normalizedValue === "1"
    || normalizedValue === "yes"
    || normalizedValue === "active";
}

function normalizePositiveInteger_(value, fallback) {
  var numberValue = Number(value);

  if (!isFinite(numberValue) || numberValue <= 0) {
    return fallback;
  }

  return Math.floor(numberValue);
}

function generateDisplayToken_() {
  return [
    Utilities.getUuid(),
    Utilities.formatDate(new Date(), "Asia/Jakarta", "yyyyMMddHHmmss"),
    Utilities.getUuid(),
    Math.floor(Math.random() * 1000000000),
  ].join("-");
}

function normalizeTvDisplay_(display) {
  return {
    display_id: display.display_id || "",
    room_id: display.room_id || "",
    display_name: display.display_name || "",
    display_token: display.display_token || "",
    display_enabled: normalizeBoolean_(display.display_enabled),
    refresh_interval_seconds: normalizePositiveInteger_(display.refresh_interval_seconds, 30),
    notes: display.notes || "",
    created_at: normalizeFnbOrderDateTime_(display.created_at),
    updated_at: normalizeFnbOrderDateTime_(display.updated_at),
  };
}

function getTvDisplayByRoomId_(roomId) {
  ensureTvDisplaysSheet_();

  var normalizedRoomId = String(roomId || "").trim();

  if (!normalizedRoomId) {
    return null;
  }

  var displays = readSheetAsObjects_("TVDisplays");

  for (var index = 0; index < displays.length; index++) {
    if (String(displays[index].room_id || "").trim() === normalizedRoomId) {
      return normalizeTvDisplay_(displays[index]);
    }
  }

  return null;
}

function validateCustomerDisplayAccess_(roomId, token) {
  var normalizedRoomId = String(roomId || "").trim();
  var normalizedToken = String(token || "").trim();

  if (!normalizedRoomId) {
    return createCustomerDisplayError_("INVALID_ROOM_ID", "Room display tidak valid.");
  }

  if (!normalizedToken) {
    return createCustomerDisplayError_("INVALID_DISPLAY_TOKEN", "Token display tidak valid.");
  }

  var display = getTvDisplayByRoomId_(normalizedRoomId);

  if (!display) {
    return createCustomerDisplayError_("DISPLAY_NOT_FOUND", "Display room belum terdaftar.");
  }

  if (!display.display_enabled) {
    return createCustomerDisplayError_("DISPLAY_DISABLED", "Display room sedang nonaktif.");
  }

  if (String(display.display_token || "") !== normalizedToken) {
    return createCustomerDisplayError_("INVALID_DISPLAY_TOKEN", "Token display tidak valid.");
  }

  return display;
}

function createCustomerDisplayError_(code, message) {
  return {
    ok: false,
    success: false,
    error: code,
    code: code,
    message: message,
  };
}

function getRoomMasterByRoomId_(roomId) {
  ensureRoomsMasterColumns_();

  var normalizedRoomId = String(roomId || "").trim();
  var rooms = readSheetAsObjects_("Rooms");

  for (var index = 0; index < rooms.length; index++) {
    if (String(rooms[index].room_id || "").trim() === normalizedRoomId) {
      return rooms[index];
    }
  }

  return null;
}

function isValidRoomForTvDisplay_(room) {
  return !!(room && String(room.room_id || "").trim() && String(room.room_name || "").trim());
}

function buildTvDisplayId_(roomId) {
  return "DISPLAY-" + String(roomId || "").trim().replace(/[^A-Za-z0-9_-]/g, "-").toUpperCase();
}

function buildTvDisplayUrlHint_(roomId, token) {
  return "tv-display.html?room_id=" + encodeURIComponent(roomId) + "&token=" + encodeURIComponent(token);
}

function formatTvDisplaySetup_(display, room, status, fallback) {
  var normalizedDisplay = normalizeTvDisplay_(display);
  var safeFallback = fallback || {};
  var safeRoomId = normalizedDisplay.room_id || safeFallback.room_id || "";
  var safeToken = normalizedDisplay.display_token || safeFallback.token || "";

  // Setup actions may return tokens; the customer display state endpoint must not.
  return {
    status: status || "",
    display_id: normalizedDisplay.display_id || safeFallback.display_id || (safeRoomId ? buildTvDisplayId_(safeRoomId) : ""),
    room_id: safeRoomId,
    room_name: room ? room.room_name || "" : safeFallback.room_name || "",
    display_name: normalizedDisplay.display_name || safeFallback.display_name || "",
    display_enabled: normalizedDisplay.display_enabled,
    refresh_interval_seconds: normalizePositiveInteger_(normalizedDisplay.refresh_interval_seconds, 30),
    display_url_hint: buildTvDisplayUrlHint_(safeRoomId, safeToken),
    token: safeToken,
  };
}

function seedTvDisplayForRoom_(roomId, options) {
  var room = getRoomMasterByRoomId_(roomId);
  var settings = options || {};

  if (!isValidRoomForTvDisplay_(room)) {
    var skippedRoomId = String(roomId || "").trim();
    var skippedDisplay = formatTvDisplaySetup_({}, null, "skipped", {
      room_id: skippedRoomId,
      display_id: skippedRoomId ? buildTvDisplayId_(skippedRoomId) : "",
    });

    return {
      ok: false,
      status: "skipped",
      display_id: skippedDisplay.display_id,
      room_id: skippedDisplay.room_id,
      room_name: skippedDisplay.room_name,
      display_name: skippedDisplay.display_name,
      display_enabled: skippedDisplay.display_enabled,
      refresh_interval_seconds: skippedDisplay.refresh_interval_seconds,
      display_url_hint: skippedDisplay.display_url_hint,
      token: skippedDisplay.token,
      display: skippedDisplay,
      reason: "INVALID_ROOM",
    };
  }

  var sheet = ensureTvDisplaysSheet_();
  var headerMap = getHeaderMap_(sheet);
  var normalizedRoomId = String(room.room_id || "").trim();
  var rowNumber = findRowByValue_(sheet, headerMap, "room_id", normalizedRoomId);
  var now = toJakartaIsoString_(new Date());
  var displayId = buildTvDisplayId_(normalizedRoomId);
  var displayName = String(settings.display_name || "").trim() || "Display " + String(room.room_name || "").trim();
  var refreshIntervalSeconds = normalizePositiveInteger_(settings.refresh_interval_seconds, 30);
  var notes = String(settings.notes || "").trim();
  var status = "created";
  var display;
  var token;

  if (rowNumber) {
    display = getRowObject_(sheet, headerMap, rowNumber);
    token = settings.rotate_token ? generateDisplayToken_() : display.display_token || generateDisplayToken_();
    status = settings.rotate_token ? "rotated" : "existing";

    setRowValues_(sheet, headerMap, rowNumber, {
      display_id: settings.rotate_token ? display.display_id || displayId : displayId,
      room_id: normalizedRoomId,
      display_name: settings.rotate_token ? display.display_name || displayName : displayName,
      display_token: token,
      display_enabled: true,
      refresh_interval_seconds: settings.rotate_token ? display.refresh_interval_seconds || refreshIntervalSeconds : refreshIntervalSeconds,
      notes: settings.rotate_token ? display.notes || notes : notes,
      created_at: display.created_at || now,
      updated_at: now,
    });
    display = getRowObject_(sheet, headerMap, rowNumber);
  } else {
    token = generateDisplayToken_();
    display = {
      display_id: displayId,
      room_id: normalizedRoomId,
      display_name: displayName,
      display_token: token,
      display_enabled: true,
      refresh_interval_seconds: refreshIntervalSeconds,
      notes: notes,
      created_at: now,
      updated_at: now,
    };
    appendObjectRow_(sheet, display);
  }

  var setupDisplay = formatTvDisplaySetup_(display, room, status, {
    display_id: displayId,
    room_id: normalizedRoomId,
    room_name: room.room_name || "",
    display_name: displayName,
    token: token,
  });

  return Object.assign({
    ok: true,
  }, setupDisplay, {
    display: setupDisplay,
  });
}

function seedPilotTvDisplay_() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(2000)) {
    return createLockBusyResponse_("Sistem sedang menyiapkan TV display lain. Coba lagi sebentar.");
  }

  try {
    var result = seedTvDisplayForRoom_("ROOM-002", {
      notes: "Polytron Google TV pilot room 2",
    });

    if (!result.ok) {
      return {
        ok: false,
        success: false,
        error: result.reason || "PILOT_ROOM_INVALID",
        message: "Pilot TV display gagal disiapkan.",
      };
    }

    return {
      ok: true,
      success: true,
      message: "Pilot TV display siap digunakan.",
      display: {
        display_id: result.display.display_id,
        room_id: result.display.room_id,
        display_name: result.display.display_name,
        display_enabled: result.display.display_enabled,
        refresh_interval_seconds: result.display.refresh_interval_seconds,
        display_url_hint: result.display.display_url_hint,
        token: result.display.token,
      },
    };
  } finally {
    lock.releaseLock();
  }
}

function seedTvDisplaysForAllRooms_() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(2000)) {
    return createLockBusyResponse_("Sistem sedang menyiapkan TV display lain. Coba lagi sebentar.");
  }

  try {
    ensureRoomsMasterColumns_();

    var rooms = readSheetAsObjects_("Rooms");
    var summary = {
      total_rooms_checked: rooms.length,
      created_count: 0,
      existing_count: 0,
      skipped_count: 0,
      displays: [],
    };

    rooms.forEach(function (room) {
      if (!isValidRoomForTvDisplay_(room)) {
        var skippedResult = seedTvDisplayForRoom_(room ? room.room_id : "");

        summary.skipped_count += 1;
        summary.displays.push(skippedResult.display);
        return;
      }

      var result = seedTvDisplayForRoom_(room.room_id);

      if (!result.ok) {
        summary.skipped_count += 1;
        return;
      }

      if (result.status === "created") {
        summary.created_count += 1;
      } else {
        summary.existing_count += 1;
      }

      summary.displays.push(result.display);
    });

    return Object.assign({
      ok: true,
      success: true,
      message: "Setup TV display semua room selesai.",
    }, summary);
  } finally {
    lock.releaseLock();
  }
}

function rotateTvDisplayToken_(payload) {
  if (String(payload.confirm || "").trim() !== "ROTATE") {
    return {
      ok: false,
      success: false,
      error: "ROTATE_CONFIRM_REQUIRED",
      message: "Konfirmasi rotate token wajib diisi.",
    };
  }

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(2000)) {
    return createLockBusyResponse_("Sistem sedang memproses perubahan TV display lain. Coba lagi sebentar.");
  }

  try {
    var result = seedTvDisplayForRoom_(payload.room_id, {
      rotate_token: true,
    });

    if (!result.ok) {
      return {
        ok: false,
        success: false,
        error: result.reason || "ROOM_NOT_FOUND",
        message: "Room untuk display tidak ditemukan.",
      };
    }

    return {
      ok: true,
      success: true,
      message: "Token TV display berhasil dirotasi.",
      display: result.display,
    };
  } finally {
    lock.releaseLock();
  }
}

function getTvDisplaySetupList_() {
  ensureTvDisplaysSheet_();
  ensureRoomsMasterColumns_();

  var roomsById = readSheetAsObjects_("Rooms").reduce(function (map, room) {
    var roomId = String(room.room_id || "").trim();

    if (roomId) {
      map[roomId] = room;
    }

    return map;
  }, {});

  var displays = readSheetAsObjects_("TVDisplays")
    .map(function (display) {
      var normalizedDisplay = normalizeTvDisplay_(display);
      return formatTvDisplaySetup_(normalizedDisplay, roomsById[normalizedDisplay.room_id] || null, "setup");
    })
    .sort(function (first, second) {
      return String(first.room_id || "").localeCompare(String(second.room_id || ""));
    });

  return {
    ok: true,
    success: true,
    message: "Daftar setup TV display berhasil dibaca.",
    displays: displays,
  };
}

function getCustomerDisplayState_(roomId, token) {
  var access = validateCustomerDisplayAccess_(roomId, token);

  if (access.ok === false) {
    return access;
  }

  var normalizedRoomId = String(roomId || "").trim();
  var rooms = readSheetAsObjects_("Rooms");
  var room = selectCustomerDisplayRoom_(rooms, normalizedRoomId);

  if (!room) {
    return createCustomerDisplayError_("INVALID_ROOM_ID", "Room display tidak valid.");
  }

  var nowDate = new Date();
  var nowIso = toJakartaIsoString_(nowDate);
  var session = buildCustomerDisplaySession_(room, nowDate);
  var latestTvLog = getLatestTvControlLogByRoomId_(normalizedRoomId);
  var resolvedRoomId = normalizedRoomId || String(room.room_id || "").trim();
  var resolvedRoomName = resolveCustomerDisplayRoomName_(resolvedRoomId, room, access);
  var roomStatus = room.status || "";
  var response = {
    ok: true,
    success: true,
    server_time: nowIso,
    operational_date: getOperationalDateString_(nowDate),
    room: {
      room_id: resolvedRoomId,
      room_name: resolvedRoomName || "Karaoke Room",
      status: roomStatus,
    },
    session: session,
    display: {
      display_id: access.display_id || "",
      display_name: access.display_name || "",
      refresh_interval_seconds: normalizePositiveInteger_(access.refresh_interval_seconds, 30),
      message: session.message,
    },
    tv: {
      last_command: latestTvLog ? latestTvLog.tv_action || "" : "",
      last_command_at: latestTvLog ? latestTvLog.created_at || "" : "",
    },
  };

  return ensureCustomerDisplayRoomPayload_(response, resolvedRoomId, room, response.display || access, roomStatus);
}

function ensureCustomerDisplayRoomPayload_(response, roomId, room, display, roomStatus) {
  var safeResponse = response || {};
  var responseRoom = safeResponse.room || {};
  var responseDisplay = safeResponse.display || display || {};
  var safeRoomId = String(roomId || responseRoom.room_id || "").trim();
  var safeRoomStatus = String(roomStatus || responseRoom.status || "").trim();
  var resolvedRoomName = resolveCustomerDisplayRoomName_(safeRoomId, room, responseDisplay)
    || deriveRoomNameFromDisplayName_(responseDisplay.display_name)
    || "Karaoke Room";
  var safeRoomName = String(resolvedRoomName || "Karaoke Room").trim() || "Karaoke Room";

  safeResponse.room = {
    room_id: safeRoomId,
    room_name: safeRoomName,
    status: safeRoomStatus,
  };

  return safeResponse;
}

function resolveCustomerDisplayRoomName_(roomId, room, display) {
  var roomName = String(room && room.room_name || "").trim();

  if (roomName) {
    return roomName;
  }

  var masterRoom = getRoomMasterByRoomId_(roomId);
  roomName = String(masterRoom && masterRoom.room_name || "").trim();

  if (roomName) {
    return roomName;
  }

  var displayName = String(display && display.display_name || "").trim();

  roomName = deriveRoomNameFromDisplayName_(displayName);

  return roomName || "Karaoke Room";
}

function deriveRoomNameFromDisplayName_(displayName) {
  var normalizedDisplayName = String(displayName || "").trim();

  if (normalizedDisplayName.indexOf("Display ") === 0 && normalizedDisplayName.length > "Display ".length) {
    return normalizedDisplayName.substring("Display ".length).trim();
  }

  return "";
}

function selectCustomerDisplayRoom_(rooms, roomId) {
  var matchingRooms = rooms.filter(function (room) {
    return String(room.room_id || "").trim() === roomId;
  });

  if (!matchingRooms.length) {
    return null;
  }

  return matchingRooms.reduce(function (selectedRoom, currentRoom) {
    if (!selectedRoom) {
      return currentRoom;
    }

    var currentStatus = String(currentRoom.status || "").trim().toLowerCase();
    var selectedStatus = String(selectedRoom.status || "").trim().toLowerCase();

    if (currentStatus === "occupied" && selectedStatus !== "occupied") {
      return currentRoom;
    }

    if (currentStatus !== "occupied" || selectedStatus !== "occupied") {
      return selectedRoom;
    }

    var currentEndDate = parseJakartaDateTimeValue_(currentRoom.scheduled_end_time);
    var selectedEndDate = parseJakartaDateTimeValue_(selectedRoom.scheduled_end_time);

    if (currentEndDate && (!selectedEndDate || currentEndDate.getTime() > selectedEndDate.getTime())) {
      return currentRoom;
    }

    return selectedRoom;
  }, null);
}

function buildCustomerDisplaySession_(room, nowDate) {
  // Customer display derives session state only from the active room row and returns a safe public payload.
  var status = String(room.status || "").trim().toLowerCase();
  var startTime = normalizeFnbOrderDateTime_(room.start_time);
  var endDate = parseJakartaDateTimeValue_(room.scheduled_end_time);

  if (status !== "occupied") {
    return buildIdleCustomerDisplaySession_("Silakan hubungi kasir untuk mulai karaoke.");
  }

  if (!endDate) {
    return buildIdleCustomerDisplaySession_("Silakan hubungi kasir.");
  }

  var remainingSeconds = Math.floor((endDate.getTime() - nowDate.getTime()) / 1000);
  var warningLevel = getCustomerDisplayWarningLevel_(remainingSeconds);
  var endTime = normalizeFnbOrderDateTime_(room.scheduled_end_time);
  var durationMinutes = Number(room.booked_duration_minutes) || 0;

  return {
    has_active_session: true,
    session_id: buildCustomerDisplaySessionId_(room),
    start_time: startTime || "",
    end_time: endTime || "",
    duration_minutes: durationMinutes,
    remaining_seconds: Math.max(0, remainingSeconds),
    warning_level: warningLevel,
    message: getCustomerDisplayMessage_(warningLevel),
  };
}

function buildIdleCustomerDisplaySession_(message) {
  return {
    has_active_session: false,
    session_id: "",
    start_time: "",
    end_time: "",
    duration_minutes: 0,
    remaining_seconds: 0,
    warning_level: "idle",
    message: message || "Silakan hubungi kasir untuk mulai karaoke.",
  };
}

function buildCustomerDisplaySessionId_(room) {
  var roomId = String(room.room_id || "").trim();
  var startTime = normalizeFnbOrderDateTime_(room.start_time);

  if (!roomId || !startTime) {
    return "";
  }

  return roomId + "-" + String(startTime).replace(/[^0-9]/g, "");
}

function getCustomerDisplayWarningLevel_(remainingSeconds) {
  if (remainingSeconds <= 0) {
    return "expired";
  }

  if (remainingSeconds <= 300) {
    return "warning_5";
  }

  if (remainingSeconds <= 600) {
    return "warning_10";
  }

  return "normal";
}

function getCustomerDisplayMessage_(warningLevel) {
  if (warningLevel === "expired") {
    return "Waktu karaoke telah habis. Silakan hubungi kasir.";
  }

  if (warningLevel === "warning_5") {
    return "Sisa waktu kurang dari 5 menit.";
  }

  if (warningLevel === "warning_10") {
    return "Sisa waktu kurang dari 10 menit.";
  }

  return "Selamat bernyanyi.";
}

function getExpiredRoomRecoveryList_(payload) {
  return getExpiredRoomRecoveryCandidates_(payload || {});
}

function buildExpiredRoomRecoveryResponse_(nowDate, rooms, candidates) {
  var expiredCount = candidates.filter(function (candidate) {
    return candidate.issue_type === "expired_session";
  }).length;
  var invalidCount = candidates.filter(function (candidate) {
    return candidate.issue_type === "invalid_end_time" || candidate.issue_type === "occupied_without_session";
  }).length;

  return {
    ok: true,
    success: true,
    server_time: toJakartaIsoString_(nowDate),
    operational_date: getOperationalDateString_(nowDate),
    total_rooms_checked: rooms.length,
    expired_count: expiredCount,
    invalid_count: invalidCount,
    candidates: candidates,
  };
}

function getExpiredRoomRecoveryCandidates_(options) {
  var settings = options || {};
  var nowDate = new Date();
  var graceMinutes = normalizePositiveInteger_(settings.grace_minutes, 5);
  var includeInvalidEndTime = settings.include_invalid_end_time === undefined
    ? true
    : normalizeBoolean_(settings.include_invalid_end_time);
  ensureRoomsBookingColumns_();

  var rooms = readSheetAsObjects_("Rooms");
  var candidates = [];

  // Read-only diagnostic: recovery/mutation belongs to the next phase after candidates are reviewed.
  rooms.forEach(function (room) {
    var roomStatus = String(room.status || "").trim().toLowerCase();
    var isOccupied = roomStatus === "occupied";

    if (!isOccupied) {
      return;
    }

    var endDate = parseRoomRecoveryEndDate_(room);

    if (!endDate) {
      if (includeInvalidEndTime) {
        candidates.push(buildExpiredRoomRecoveryCandidate_(room, nowDate, null, "invalid_end_time", graceMinutes));
      }

      return;
    }

    var remainingSeconds = Math.floor((endDate.getTime() - nowDate.getTime()) / 1000);

    if (remainingSeconds <= 0) {
      candidates.push(buildExpiredRoomRecoveryCandidate_(room, nowDate, endDate, "expired_session", graceMinutes));
    }
  });

  return buildExpiredRoomRecoveryResponse_(nowDate, rooms, candidates);
}

function parseRoomRecoveryEndDate_(room) {
  return parseJakartaDateTimeValue_(room.scheduled_end_time || room.end_time);
}

function buildExpiredRoomRecoveryCandidate_(room, nowDate, endDate, issueType, graceMinutes) {
  var startTime = normalizeFnbOrderDateTime_(room.start_time);
  var endTime = endDate ? toJakartaIsoString_(endDate) : normalizeFnbOrderDateTime_(room.scheduled_end_time || room.end_time);
  var remainingSeconds = endDate ? Math.floor((endDate.getTime() - nowDate.getTime()) / 1000) : 0;
  var expiredMinutes = endDate ? Math.max(0, Math.floor((nowDate.getTime() - endDate.getTime()) / 60000)) : 0;
  var hasStartTime = !!parseJakartaDateTimeValue_(room.start_time);
  var normalizedIssueType = issueType;
  var safeToRecover = normalizedIssueType === "expired_session" && expiredMinutes >= graceMinutes;

  if (normalizedIssueType === "invalid_end_time" && !hasStartTime) {
    normalizedIssueType = "occupied_without_session";
  }

  return {
    room_id: room.room_id || "",
    room_name: room.room_name || "",
    room_status: room.status || "",
    session_id: buildCustomerDisplaySessionId_(room),
    start_time: startTime || "",
    end_time: endTime || "",
    duration_minutes: Number(room.booked_duration_minutes) || 0,
    remaining_seconds: Math.min(0, remainingSeconds),
    expired_minutes: expiredMinutes,
    issue_type: normalizedIssueType,
    recommended_action: safeToRecover ? "eligible_for_recovery" : "manual_review",
    safe_to_recover: safeToRecover,
    reason: getExpiredRoomRecoveryReason_(normalizedIssueType, safeToRecover, graceMinutes),
  };
}

function getExpiredRoomRecoveryReason_(issueType, safeToRecover, graceMinutes) {
  if (issueType === "occupied_without_session") {
    return "Room occupied tetapi tidak memiliki start_time/end_time valid.";
  }

  if (issueType === "invalid_end_time") {
    return "Room occupied tetapi scheduled_end_time/end_time kosong atau tidak valid.";
  }

  if (safeToRecover) {
    return "Room occupied sudah melewati waktu selesai lebih dari grace period.";
  }

  return "Room occupied sudah expired tetapi masih dalam grace period " + graceMinutes + " menit.";
}

function recoverExpiredRoomSession_(payload) {
  var request = payload || {};

  if (String(request.confirm || "").trim() !== "RECOVER") {
    return recoveryErrorResponse_("RECOVERY_CONFIRMATION_REQUIRED", "Konfirmasi recovery wajib diisi.");
  }

  var roomId = String(request.room_id || "").trim();
  var requestedSessionId = String(request.session_id || "").trim();

  if (!roomId) {
    return recoveryErrorResponse_("ROOM_ID_REQUIRED", "room_id wajib diisi.");
  }

  var diagnostic = getExpiredRoomRecoveryCandidates_({
    grace_minutes: request.grace_minutes || 5,
    include_invalid_end_time: true,
  });
  var candidate = findRecoveryCandidate_(diagnostic.candidates, roomId, requestedSessionId);

  if (requestedSessionId && candidate && candidate.session_id !== requestedSessionId) {
    return recoveryErrorResponse_("RECOVERY_SESSION_MISMATCH", "Session room tidak cocok untuk recovery.");
  }

  if (!candidate) {
    if (requestedSessionId && hasRecoveryCandidateForRoom_(diagnostic.candidates, roomId)) {
      return recoveryErrorResponse_("RECOVERY_SESSION_MISMATCH", "Session room tidak cocok untuk recovery.");
    }

    return recoveryErrorResponse_("ROOM_NOT_ELIGIBLE_FOR_RECOVERY", "Room tidak memenuhi syarat recovery.");
  }

  if (
    candidate.issue_type !== "expired_session" ||
    candidate.safe_to_recover !== true ||
    candidate.recommended_action !== "eligible_for_recovery"
  ) {
    return recoveryErrorResponse_("ROOM_NOT_ELIGIBLE_FOR_RECOVERY", "Room tidak memenuhi syarat recovery.");
  }

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(2000)) {
    return recoveryErrorResponse_("LOCK_BUSY", "Sistem sedang memproses recovery room lain. Coba lagi sebentar.");
  }

  try {
    return recoverExpiredRoomSessionWithLock_(request, candidate);
  } finally {
    lock.releaseLock();
  }
}

function recoverExpiredRoomSessionWithLock_(request, originalCandidate) {
  var roomId = String(request.room_id || "").trim();
  var requestedSessionId = String(request.session_id || "").trim();
  var diagnostic = getExpiredRoomRecoveryCandidates_({
    grace_minutes: request.grace_minutes || 5,
    include_invalid_end_time: true,
  });
  var candidate = findRecoveryCandidate_(diagnostic.candidates, roomId, requestedSessionId);

  if (!candidate || candidate.session_id !== originalCandidate.session_id) {
    return recoveryErrorResponse_("ROOM_NOT_ELIGIBLE_FOR_RECOVERY", "Room tidak memenuhi syarat recovery.");
  }

  if (
    candidate.issue_type !== "expired_session" ||
    candidate.safe_to_recover !== true ||
    candidate.recommended_action !== "eligible_for_recovery"
  ) {
    return recoveryErrorResponse_("ROOM_NOT_ELIGIBLE_FOR_RECOVERY", "Room tidak memenuhi syarat recovery.");
  }

  var roomsSheet = ensureRoomsBookingColumns_();
  var headerMap = getHeaderMap_(roomsSheet);
  var rowNumber = findRowByValue_(roomsSheet, headerMap, "room_id", roomId);

  if (!rowNumber) {
    return recoveryErrorResponse_("ROOM_NOT_ELIGIBLE_FOR_RECOVERY", "Room tidak memenuhi syarat recovery.");
  }

  var room = getRowObject_(roomsSheet, headerMap, rowNumber);
  var previousStatus = String(room.status || "").trim();
  var recoveredAt = toJakartaIsoString_(new Date());
  var reason = String(request.reason || "").trim() || "Manual expired room recovery";
  var actor = String(request.actor || "").trim() || "system";

  setRowValues_(roomsSheet, headerMap, rowNumber, buildRoomRecoveryUpdate_(headerMap, recoveredAt));

  appendRoomRecoveryLog_({
    log_id: generateRoomRecoveryLogId_(),
    timestamp: recoveredAt,
    room_id: candidate.room_id,
    room_name: candidate.room_name,
    session_id: candidate.session_id,
    issue_type: candidate.issue_type,
    expired_minutes: candidate.expired_minutes,
    action: "recover_expired_room_session",
    reason: reason,
    actor: actor,
    result: "success",
  });

  return {
    ok: true,
    success: true,
    code: "ROOM_RECOVERED",
    message: "Room berhasil dipulihkan.",
    server_time: recoveredAt,
    operational_date: getOperationalDateString_(new Date(recoveredAt)),
    recovery: {
      room_id: candidate.room_id,
      room_name: candidate.room_name,
      previous_status: previousStatus,
      new_status: "available",
      session_id: candidate.session_id,
      issue_type: candidate.issue_type,
      expired_minutes: candidate.expired_minutes,
      recovered_at: recoveredAt,
      reason: reason,
      actor: actor,
    },
  };
}

function buildRoomRecoveryUpdate_(headerMap, recoveredAt) {
  var update = {
    status: "available",
    booked_duration_minutes: "",
    scheduled_end_time: "",
    updated_at: recoveredAt,
  };
  var optionalSessionFields = [
    "current_session_id",
    "session_id",
    "scheduled_start_time",
    "end_time",
  ];

  optionalSessionFields.forEach(function (field) {
    if (headerMap[field]) {
      update[field] = "";
    }
  });

  return update;
}

function findRecoveryCandidate_(candidates, roomId, sessionId) {
  var normalizedRoomId = String(roomId || "").trim();
  var normalizedSessionId = String(sessionId || "").trim();

  for (var index = 0; index < candidates.length; index++) {
    if (String(candidates[index].room_id || "").trim() !== normalizedRoomId) {
      continue;
    }

    if (normalizedSessionId && String(candidates[index].session_id || "").trim() !== normalizedSessionId) {
      continue;
    }

    return candidates[index];
  }

  return null;
}

function hasRecoveryCandidateForRoom_(candidates, roomId) {
  var normalizedRoomId = String(roomId || "").trim();

  return candidates.some(function (candidate) {
    return String(candidate.room_id || "").trim() === normalizedRoomId;
  });
}

function recoveryErrorResponse_(code, message) {
  return {
    ok: false,
    success: false,
    code: code,
    message: message,
  };
}

function getLatestTvControlLogByRoomId_(roomId) {
  ensureTvControlLogsSheet_();

  var normalizedRoomId = String(roomId || "").trim();
  var logs = readSheetAsObjectsOrEmpty_("TVControlLogs");
  var latestLog = null;

  logs.forEach(function (log) {
    if (String(log.room_id || "").trim() !== normalizedRoomId) {
      return;
    }

    var normalizedLog = normalizeTvControlLog_(log);

    if (!latestLog || String(normalizedLog.created_at || "").localeCompare(String(latestLog.created_at || "")) > 0) {
      latestLog = normalizedLog;
    }
  });

  return latestLog;
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

  if (device.control_type === "mock") {
    return sendTvCommandViaMock_(device, roomId, tvDeviceId, tvAction, triggerSource, cashierName);
  }

  if (device.control_type === "middleware") {
    return sendTvCommandViaMiddleware_(device, roomId, tvDeviceId, tvAction, triggerSource, cashierName);
  }

  response = createTvCommandFailedResponse_(roomId || device.room_id, device.tv_device_id, tvAction, triggerSource, cashierName, device.control_type, "failed", "TV_CONTROL_TYPE_UNSUPPORTED");
  appendTvControlLogFromResponse_(response, triggerSource, cashierName, tvAction);
  return response;
}

function sendTvCommandViaMock_(device, roomId, tvDeviceId, tvAction, triggerSource, cashierName) {
  var response;

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

function isValidMiddlewareUrl_(middlewareUrl) {
  var trimmedUrl = String(middlewareUrl || "").trim();

  return /^https?:\/\/.+/i.test(trimmedUrl);
}

function truncateTvControlRawResponse_(value) {
  var text = String(value || "").trim();

  if (text.length <= 2000) {
    return text;
  }

  return text.substring(0, 2000) + "...[truncated]";
}

function callTvMiddleware_(middlewareUrl, payload) {
  var rawResponse = "";
  var httpResponse;
  var statusCode;
  var parsedBody;
  var result;
  var blockReason;
  var errorMessage;

  try {
    httpResponse = UrlFetchApp.fetch(middlewareUrl, {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
      headers: {
        "ngrok-skip-browser-warning": "true",
      },
    });
    statusCode = httpResponse.getResponseCode();
    rawResponse = httpResponse.getContentText() || "";

    try {
      parsedBody = JSON.parse(rawResponse);
    } catch (parseError) {
      return {
        success: false,
        result: "failed",
        error: "MIDDLEWARE_ERROR",
        raw_response: truncateTvControlRawResponse_(rawResponse),
        message: "Middleware mengembalikan respons non-JSON.",
      };
    }

    if (parsedBody && parsedBody.success === true) {
      return {
        success: true,
        result: String(parsedBody.result || "sent").trim().toLowerCase() || "sent",
        error: "",
        raw_response: truncateTvControlRawResponse_(rawResponse),
        message: String(parsedBody.message || "").trim(),
      };
    }

    result = String(parsedBody && parsedBody.result ? parsedBody.result : "failed").trim().toLowerCase();
    blockReason = String(parsedBody && parsedBody.block_reason ? parsedBody.block_reason : "MIDDLEWARE_ERROR").trim();

    if (result === "timeout" || blockReason === "TV_DEVICE_TIMEOUT" || blockReason === "MIDDLEWARE_TIMEOUT") {
      return {
        success: false,
        result: "timeout",
        error: blockReason || "MIDDLEWARE_TIMEOUT",
        raw_response: truncateTvControlRawResponse_(rawResponse),
        message: String(parsedBody && parsedBody.message ? parsedBody.message : "Middleware timeout.").trim(),
      };
    }

    return {
      success: false,
      result: result || "failed",
      error: blockReason || "MIDDLEWARE_ERROR",
      raw_response: truncateTvControlRawResponse_(rawResponse),
      message: String(parsedBody && parsedBody.message ? parsedBody.message : "Middleware menolak command.").trim(),
    };
  } catch (fetchError) {
    errorMessage = String(fetchError && fetchError.message ? fetchError.message : fetchError).toLowerCase();

    if (errorMessage.indexOf("timeout") >= 0 || errorMessage.indexOf("timed out") >= 0) {
      return {
        success: false,
        result: "timeout",
        error: "MIDDLEWARE_TIMEOUT",
        raw_response: truncateTvControlRawResponse_(rawResponse || errorMessage),
        message: "Middleware timeout.",
      };
    }

    return {
      success: false,
      result: "failed",
      error: "MIDDLEWARE_ERROR",
      raw_response: truncateTvControlRawResponse_(rawResponse || errorMessage),
      message: "Gagal menghubungi middleware.",
    };
  }
}

function sendTvCommandViaMiddleware_(device, roomId, tvDeviceId, tvAction, triggerSource, cashierName) {
  var middlewareUrl = String(device.middleware_url || "").trim();
  var middlewarePayload;
  var middlewareResult;
  var response;

  if (!middlewareUrl) {
    response = createTvCommandFailedResponse_(roomId || device.room_id, device.tv_device_id, tvAction, triggerSource, cashierName, device.control_type, "failed", "MIDDLEWARE_URL_EMPTY");
    appendTvControlLogFromResponse_(response, triggerSource, cashierName, tvAction);
    return response;
  }

  if (!isValidMiddlewareUrl_(middlewareUrl)) {
    response = createTvCommandFailedResponse_(roomId || device.room_id, device.tv_device_id, tvAction, triggerSource, cashierName, device.control_type, "failed", "INVALID_MIDDLEWARE_URL");
    appendTvControlLogFromResponse_(response, triggerSource, cashierName, tvAction);
    return response;
  }

  middlewarePayload = {
    room_id: roomId || device.room_id,
    tv_device_id: device.tv_device_id || tvDeviceId,
    tv_action: tvAction,
    trigger_source: triggerSource,
    requested_by: cashierName,
  };
  middlewareResult = callTvMiddleware_(middlewareUrl, middlewarePayload);

  if (middlewareResult.success === true) {
    response = {
      ok: true,
      success: true,
      message: "Perintah TV berhasil dikirim.",
      data: {
        room_id: roomId || device.room_id,
        tv_device_id: device.tv_device_id,
        result: middlewareResult.result || "sent",
      },
      tv_action: tvAction,
      control_type: device.control_type,
      raw_response: middlewareResult.raw_response || "",
    };
    appendTvControlLogFromResponse_(response, triggerSource, cashierName, tvAction, middlewareResult.raw_response);
    return response;
  }

  response = createTvCommandFailedResponse_(
    roomId || device.room_id,
    device.tv_device_id,
    tvAction,
    triggerSource,
    cashierName,
    device.control_type,
    middlewareResult.result || "failed",
    middlewareResult.error || "MIDDLEWARE_ERROR"
  );
  response.raw_response = middlewareResult.raw_response || "";
  if (middlewareResult.message) {
    response.message = "Perintah TV gagal dikirim.";
  }
  appendTvControlLogFromResponse_(response, triggerSource, cashierName, tvAction, middlewareResult.raw_response);
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

function validateTvDevicePayload_(payload, isUpdate) {
  var tvDeviceId = String(payload.tv_device_id || "").trim();
  var roomId = String(payload.room_id || "").trim();
  var deviceName = String(payload.device_name || "").trim();
  var controlType = String(payload.control_type || "mock").trim().toLowerCase();
  var status = String(payload.status || "active").trim().toLowerCase();
  var middlewareUrl = String(payload.middleware_url || "").trim();
  var deviceIdentifier = String(payload.device_identifier || "").trim();
  var validControlTypes = ["mock", "middleware", "home_assistant", "manual"];
  var validStatuses = ["active", "inactive"];
  var roomsSheet;
  var roomsHeaderMap;

  if (isUpdate && !tvDeviceId) {
    masterError_("tv_device_id wajib diisi.");
  }

  if (!tvDeviceId) {
    masterError_("tv_device_id wajib diisi.");
  }

  if (!roomId) {
    masterError_("room_id wajib diisi.");
  }

  if (!deviceName) {
    masterError_("device_name wajib diisi.");
  }

  if (validControlTypes.indexOf(controlType) === -1) {
    masterError_("control_type tidak valid.");
  }

  if (validStatuses.indexOf(status) === -1) {
    masterError_("status tidak valid.");
  }

  ensureRoomsMasterColumns_();
  roomsSheet = getSheet_("Rooms");
  roomsHeaderMap = getHeaderMap_(roomsSheet);

  if (!findRowByValue_(roomsSheet, roomsHeaderMap, "room_id", roomId)) {
    masterError_("room_id tidak ditemukan di sheet Rooms.");
  }

  if (controlType === "middleware" && !middlewareUrl) {
    masterError_("middleware_url wajib diisi untuk control_type middleware.");
  }

  if (middlewareUrl && !isValidMiddlewareUrl_(middlewareUrl)) {
    masterError_("middleware_url tidak valid.");
  }

  return {
    tv_device_id: tvDeviceId,
    room_id: roomId,
    device_name: deviceName,
    control_type: controlType,
    status: status,
    middleware_url: middlewareUrl,
    device_identifier: deviceIdentifier,
  };
}

function deactivateOtherActiveTvDevicesInRoom_(sheet, headerMap, roomId, exceptTvDeviceId) {
  var devices = readSheetAsObjects_("TVDevices");
  var now = toJakartaIsoString_(new Date());
  var deactivated = [];

  devices.forEach(function (device) {
    var normalizedDevice = normalizeTvDevice_(device);
    var rowNumber;

    if (
      String(normalizedDevice.room_id || "").trim() !== String(roomId || "").trim() ||
      String(normalizedDevice.tv_device_id || "").trim() === String(exceptTvDeviceId || "").trim() ||
      normalizedDevice.status !== "active"
    ) {
      return;
    }

    rowNumber = findRowByValue_(sheet, headerMap, "tv_device_id", normalizedDevice.tv_device_id);

    if (!rowNumber) {
      return;
    }

    setRowValues_(sheet, headerMap, rowNumber, {
      status: "inactive",
      updated_at: now,
    });
    deactivated.push(normalizedDevice.tv_device_id);
  });

  return deactivated;
}

function saveTvDevice_(payload) {
  var data = validateTvDevicePayload_(payload, false);
  var sheet = ensureTvDevicesSheet_();
  var headerMap = getHeaderMap_(sheet);
  var now = toJakartaIsoString_(new Date());
  var deactivatedIds = [];
  var device;
  var savedDevice;

  if (findRowByValue_(sheet, headerMap, "tv_device_id", data.tv_device_id)) {
    masterError_("tv_device_id sudah digunakan.");
  }

  if (data.status === "active") {
    deactivatedIds = deactivateOtherActiveTvDevicesInRoom_(sheet, headerMap, data.room_id, data.tv_device_id);
  }

  device = {
    tv_device_id: data.tv_device_id,
    room_id: data.room_id,
    device_name: data.device_name,
    control_type: data.control_type,
    status: data.status,
    middleware_url: data.middleware_url,
    device_identifier: data.device_identifier,
    updated_at: now,
  };

  appendObjectRow_(sheet, device);
  savedDevice = findTvDevice_(data.room_id, data.tv_device_id);

  return {
    ok: true,
    success: true,
    message: deactivatedIds.length > 0
      ? "Mapping TV berhasil disimpan. Device aktif lain di room yang sama dinonaktifkan: " + deactivatedIds.join(", ") + "."
      : "Mapping TV berhasil disimpan.",
    data: savedDevice,
    deactivated_tv_device_ids: deactivatedIds,
  };
}

function updateTvDevice_(payload) {
  var tvDeviceId = String(payload.tv_device_id || "").trim();
  var data = validateTvDevicePayload_(payload, true);
  var sheet = ensureTvDevicesSheet_();
  var headerMap = getHeaderMap_(sheet);
  var rowNumber = findRowByValue_(sheet, headerMap, "tv_device_id", tvDeviceId);
  var now = toJakartaIsoString_(new Date());
  var deactivatedIds = [];
  var updatedDevice;

  if (!rowNumber) {
    masterError_("TV device tidak ditemukan.");
  }

  if (data.status === "active") {
    deactivatedIds = deactivateOtherActiveTvDevicesInRoom_(sheet, headerMap, data.room_id, data.tv_device_id);
  }

  setRowValues_(sheet, headerMap, rowNumber, {
    room_id: data.room_id,
    device_name: data.device_name,
    control_type: data.control_type,
    status: data.status,
    middleware_url: data.middleware_url,
    device_identifier: data.device_identifier,
    updated_at: now,
  });
  updatedDevice = findTvDevice_(data.room_id, data.tv_device_id);

  return {
    ok: true,
    success: true,
    message: deactivatedIds.length > 0
      ? "Mapping TV berhasil diperbarui. Device aktif lain di room yang sama dinonaktifkan: " + deactivatedIds.join(", ") + "."
      : "Mapping TV berhasil diperbarui.",
    data: updatedDevice,
    deactivated_tv_device_ids: deactivatedIds,
  };
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

function appendTvControlLogFromResponse_(response, triggerSource, cashierName, tvAction, rawResponse) {
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
    raw_response: truncateTvControlRawResponse_(rawResponse || (response ? response.raw_response : "") || ""),
  });
}

function getMenuItems_() {
  ensureMenuStockColumns_();
  var inventoryMap = {};
  try {
    var inventoryItems = getInventoryItems_();
    for (var i = 0; i < inventoryItems.length; i++) {
      var inv = inventoryItems[i];
      if (inv && inv.stock_item_id) {
        var key = String(inv.stock_item_id).trim().toLowerCase();
        inventoryMap[key] = inv;
      }
    }
  } catch (err) {
    // Fallback if Inventory sheet is empty or unavailable
  }

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

      var stockItemId = String(menuItem.stock_item_id || "").trim();
      var stockTracking = menuItem.stock_tracking || (stockItemId ? "yes" : "no");
      var lookupKey = stockItemId.toLowerCase();
      var stockItem = stockItemId ? inventoryMap[lookupKey] : null;
      var sellingPrice = Number(price) || 0;
      var hpp = Number(menuItem.hpp) || 0;
      var variableCostRate = Number(menuItem.variable_cost_rate) || 0;
      var bonusSalesLc = Number(menuItem.bonus_sales_lc || menuItem.bonus_per_item) || 0;
      var variableCostAmount = sellingPrice * variableCostRate / 100;
      var marginAmount = sellingPrice - hpp - variableCostAmount - bonusSalesLc;
      var marginPercent = sellingPrice > 0 ? marginAmount / sellingPrice * 100 : 0;

      return {
        menu_id: menuItem.menu_id || "",
        menu_name: menuItem.menu_name || "",
        category: menuItem.category || "",
        price: sellingPrice,
        status: String(status || "").trim().toLowerCase(),
        updated_at: menuItem.updated_at || "",
        stock_tracking: menuItem.stock_tracking || "",
        stock_item_id: menuItem.stock_item_id || "",
        stock_qty_per_unit: Number(menuItem.stock_qty_per_unit) || 0,
        bonus_sales_lc: bonusSalesLc,
        hpp: hpp,
        variable_cost_rate: variableCostRate,
        variable_cost_amount: variableCostAmount,
        margin_amount: marginAmount,
        margin_percent: marginPercent,
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

function getServiceItems_() {
  ensureServiceItemsSheet_();

  return {
    ok: true,
    success: true,
    service_items: readSheetAsObjects_("ServiceItems")
      .map(normalizeServiceItem_)
      .filter(function (item) {
        return item.service_item_id || item.service_name;
      })
      .sort(function (first, second) {
        var typeCompare = String(first.service_type || "").localeCompare(String(second.service_type || ""));

        if (typeCompare !== 0) {
          return typeCompare;
        }

        return String(first.service_name || "").localeCompare(String(second.service_name || ""));
      }),
  };
}

function normalizeServiceItem_(item) {
  return {
    service_item_id: item.service_item_id || "",
    service_name: item.service_name || "",
    service_type: item.service_type || "",
    unit: item.unit || "",
    cost_rate: Number(item.cost_rate) || 0,
    selling_rate: Number(item.selling_rate) || 0,
    status: item.status || "",
    updated_at: item.updated_at || "",
    note: item.note || "",
  };
}

function getCosting_() {
  ensureCostingSheet_();

  return {
    ok: true,
    success: true,
    costing: readSheetAsObjects_("Costing")
      .map(normalizeCosting_)
      .filter(function (item) {
        return item.costing_id || item.menu_id;
      }),
  };
}

function normalizeCosting_(item) {
  return {
    costing_id: item.costing_id || "",
    menu_id: item.menu_id || "",
    source_type: item.source_type || "",
    hpp: Number(item.hpp) || 0,
    var_cost_rate: Number(item.var_cost_rate) || 0,
    var_cost_amount: Number(item.var_cost_amount) || 0,
    total_cost: Number(item.total_cost) || 0,
    selling_price: Number(item.selling_price) || 0,
    margin_amount: Number(item.margin_amount) || 0,
    margin_percent: Number(item.margin_percent) || 0,
    effective_from: item.effective_from || "",
    status: item.status || "",
    updated_at: item.updated_at || "",
    note: item.note || "",
  };
}

function getPackages_() {
  ensurePackageMasterSheet_();

  return {
    ok: true,
    success: true,
    packages: readSheetAsObjects_("PackageMaster")
      .map(normalizePackageMaster_)
      .filter(function (item) {
        return item.package_id || item.package_name;
      })
      .sort(function (first, second) {
        var typeCompare = String(first.package_type || "").localeCompare(String(second.package_type || ""));

        if (typeCompare !== 0) {
          return typeCompare;
        }

        return String(first.package_name || "").localeCompare(String(second.package_name || ""));
      }),
  };
}

function normalizePackageMaster_(item) {
  return {
    package_id: item.package_id || "",
    menu_id: item.menu_id || "",
    package_name: item.package_name || "",
    package_category: item.package_category || "",
    package_type: item.package_type || "",
    selling_price: Number(item.selling_price) || 0,
    status: item.status || "",
    valid_day_type: item.valid_day_type || "",
    duration_minutes: Number(item.duration_minutes) || 0,
    updated_at: item.updated_at || "",
    note: item.note || "",
  };
}

function getPackageDetails_(packageId) {
  ensurePackageDetailSheet_();
  var normalizedPackageId = String(packageId || "").trim();

  return {
    ok: true,
    success: true,
    package_details: readSheetAsObjects_("PackageDetail")
      .map(normalizePackageDetail_)
      .filter(function (item) {
        if (!item.package_detail_id && !item.package_id && !item.component_name) {
          return false;
        }

        return !normalizedPackageId || item.package_id === normalizedPackageId;
      })
      .sort(function (first, second) {
        var packageCompare = String(first.package_id || "").localeCompare(String(second.package_id || ""));

        if (packageCompare !== 0) {
          return packageCompare;
        }

        return (Number(first.line_no) || 0) - (Number(second.line_no) || 0);
      }),
  };
}

function normalizePackageDetail_(item) {
  return {
    package_detail_id: item.package_detail_id || "",
    package_id: item.package_id || "",
    line_no: Number(item.line_no) || 0,
    component_type: item.component_type || "",
    component_ref_id: item.component_ref_id || "",
    component_name: item.component_name || "",
    qty: Number(item.qty) || 0,
    unit: item.unit || "",
    hpp: Number(item.hpp) || 0,
    additional_price: Number(item.additional_price) || 0,
    cost_amount: Number(item.cost_amount) || 0,
    is_choice: normalizeBooleanString_(item.is_choice),
    choice_group: item.choice_group || "",
    updated_at: item.updated_at || "",
    note: item.note || "",
  };
}

function getEligiblePackages_(roomId, durationMinutes, bookingDate) {
  var roomResult = getAvailableRoomForPricing_(roomId);

  if (!roomResult.ok) {
    return roomResult;
  }

  var durationResult = normalizePricingDuration_(durationMinutes);

  if (!durationResult.ok) {
    return durationResult;
  }

  var bookingDateResult = normalizePricingBookingDate_(bookingDate);

  if (!bookingDateResult.ok) {
    return bookingDateResult;
  }

  var packageDetailsById = getPackageDetailsByPackageIdForPricing_();
  var candidates = readSheetAsObjects_("PackageMaster").map(function (item) {
    var normalizedPackageId = normalizePackageIdForPricing_(item.package_id);
    return buildPackageCandidateForPricing_(item, getPackageDetailDiagnosticsForPricing_(packageDetailsById, normalizedPackageId));
  });
  var eligibleCandidates = candidates.filter(function (candidate) {
    return evaluatePackageEligibilityForPricing_(
      candidate,
      durationResult.duration_minutes,
      bookingDateResult.day_type
    ).eligible;
  });
  var packages = eligibleCandidates
    .sort(sortEligiblePackagesForPricing_)
    .map(function (candidate) {
      return {
        package_id: candidate.package_id,
        package_name: candidate.package_name,
        package_category: candidate.package_category,
        package_type: candidate.package_type,
        selling_price: candidate.selling_price,
        duration_minutes: candidate.duration_minutes,
        valid_day_type: candidate.valid_day_type,
        valid_day_result: "pass",
        details_preview: candidate.details.map(buildPackageDetailPreviewForPricing_),
      };
    });

  return {
    ok: true,
    success: true,
    room: roomResult.room,
    criteria: {
      duration_minutes: durationResult.duration_minutes,
      booking_date: bookingDateResult.booking_date,
      day_type: bookingDateResult.day_type,
    },
    packages: packages,
    meta: {
      eligible_count: packages.length,
      evaluated_count: candidates.length,
      excluded_count: candidates.length - packages.length,
      pricing_version: FNB_V25A_PRICING_VERSION,
    },
  };
}

function previewSessionPricing_(payload) {
  var request = payload || {};
  var roomResult = getAvailableRoomForPricing_(request.room_id);

  if (!roomResult.ok) {
    return roomResult;
  }

  var durationResult = normalizePricingDuration_(request.duration_minutes);

  if (!durationResult.ok) {
    return durationResult;
  }

  var bookingDateResult = normalizePricingBookingDate_(request.booking_date);

  if (!bookingDateResult.ok) {
    return bookingDateResult;
  }

  var bookingMode = String(request.booking_mode || "").trim().toLowerCase();

  if (!bookingMode) {
    return pricingError_("BOOKING_MODE_REQUIRED", "booking_mode wajib diisi.");
  }

  if (bookingMode !== FNB_V25A_BOOKING_MODE_REGULAR && bookingMode !== FNB_V25A_BOOKING_MODE_PACKAGE) {
    return pricingError_("INVALID_BOOKING_MODE", "booking_mode tidak didukung.");
  }

  if (bookingMode === FNB_V25A_BOOKING_MODE_REGULAR) {
    var regularPricing = calculateRegularPricingPreview_(
      roomResult.room,
      durationResult.duration_minutes,
      roomResult.room.rate_per_hour
    );

    if (regularPricing.ok === false) {
      return regularPricing;
    }

    return {
      ok: true,
      success: true,
      pricing: regularPricing,
      room: roomResult.room,
      package_snapshot: null,
      criteria: {
        duration_minutes: durationResult.duration_minutes,
        booking_mode: bookingMode,
        booking_date: bookingDateResult.booking_date,
        day_type: bookingDateResult.day_type,
        valid_day_result: "not_applicable",
      },
    };
  }

  var packageId = String(request.package_id || "").trim();

  if (!packageId) {
    return pricingError_("PACKAGE_REQUIRED", "package_id wajib diisi untuk booking package.");
  }

  var packageDetailsById = getPackageDetailsByPackageIdForPricing_();
  var packageCandidate = findPackageCandidateForPricing_(packageId, packageDetailsById);

  if (!packageCandidate) {
    return pricingError_("PACKAGE_NOT_FOUND", "Package tidak ditemukan.");
  }

  var eligibility = evaluatePackageEligibilityForPricing_(
    packageCandidate,
    durationResult.duration_minutes,
    bookingDateResult.day_type
  );

  if (!eligibility.eligible) {
    return pricingError_(eligibility.code, eligibility.message);
  }

  var packagePricing = calculatePackagePricingPreview_(
    roomResult.room,
    packageCandidate,
    durationResult.duration_minutes,
    roomResult.room.rate_per_hour
  );

  if (packagePricing.ok === false) {
    return packagePricing;
  }

  return {
    ok: true,
    success: true,
    pricing: packagePricing,
    room: roomResult.room,
    package_snapshot: buildPackageSnapshotForPricing_(packageCandidate),
    criteria: {
      duration_minutes: durationResult.duration_minutes,
      booking_mode: bookingMode,
      booking_date: bookingDateResult.booking_date,
      day_type: bookingDateResult.day_type,
      valid_day_result: "pass",
    },
  };
}

function getAvailableRoomForPricing_(roomId) {
  var normalizedRoomId = String(roomId || "").trim();

  if (!normalizedRoomId) {
    return pricingError_("ROOM_ID_REQUIRED", "room_id wajib diisi.");
  }

  var sheet = getSheet_("Rooms");
  var headerMap = getHeaderMap_(sheet);
  var rowNumber = findRowByValue_(sheet, headerMap, "room_id", normalizedRoomId);

  if (!rowNumber) {
    return pricingError_("ROOM_NOT_FOUND", "Ruangan tidak ditemukan.");
  }

  var room = getRowObject_(sheet, headerMap, rowNumber);
  var status = String(room.status || "").trim().toLowerCase();

  if (status !== "available") {
    return pricingError_("ROOM_NOT_AVAILABLE", "Ruangan tidak tersedia.");
  }

  var roomRateResult = normalizeNonNegativeFiniteNumberForPricing_(room.rate_per_hour);

  if (!roomRateResult.ok) {
    return pricingError_("INVALID_ROOM_RATE", "Tarif room tidak valid.");
  }

  return {
    ok: true,
    room: {
      room_id: room.room_id || "",
      room_name: room.room_name || "",
      status: status,
      rate_per_hour: roomRateResult.value,
    },
  };
}

function normalizePricingDuration_(durationMinutes) {
  if (!isStrictNumericValueForPricing_(durationMinutes)) {
    return pricingError_("INVALID_DURATION", "duration_minutes wajib berupa angka bulat positif.");
  }

  var numberValue = Number(durationMinutes);

  if (!isFinite(numberValue) || numberValue <= 0 || Math.floor(numberValue) !== numberValue) {
    return pricingError_("INVALID_DURATION", "duration_minutes wajib berupa angka bulat positif.");
  }

  if (numberValue < 15) {
    return pricingError_("INVALID_DURATION", "Durasi minimal 15 menit.");
  }

  return {
    ok: true,
    duration_minutes: numberValue,
  };
}

function normalizePricingBookingDate_(bookingDate) {
  var isOmitted = bookingDate === undefined || bookingDate === null ||
    (typeof bookingDate === "string" && !bookingDate.trim());

  if (isOmitted) {
    var jakartaDate = getJakartaDateString_(new Date());
    return {
      ok: true,
      booking_date: jakartaDate,
      day_type: resolvePricingDayTypeFromParts_(jakartaDate),
    };
  }

  if (typeof bookingDate !== "string") {
    return pricingError_("INVALID_BOOKING_DATE", "booking_date wajib memakai format YYYY-MM-DD.");
  }

  var normalizedDate = bookingDate.trim();
  var match = normalizedDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) {
    return pricingError_("INVALID_BOOKING_DATE", "booking_date wajib memakai format YYYY-MM-DD.");
  }

  var year = Number(match[1]);
  var month = Number(match[2]);
  var day = Number(match[3]);
  var localDate = new Date(year, month - 1, day);

  if (
    localDate.getFullYear() !== year ||
    localDate.getMonth() !== month - 1 ||
    localDate.getDate() !== day
  ) {
    return pricingError_("INVALID_BOOKING_DATE", "booking_date tidak valid.");
  }

  return {
    ok: true,
    booking_date: normalizedDate,
    day_type: resolvePricingDayType_(localDate),
  };
}

function resolvePricingDayTypeFromParts_(dateText) {
  var parts = String(dateText || "").split("-");
  var year = Number(parts[0]);
  var month = Number(parts[1]);
  var day = Number(parts[2]);
  return resolvePricingDayType_(new Date(year, month - 1, day));
}

function resolvePricingDayType_(date) {
  var day = date.getDay();
  return day === 0 || day === 6 ? FNB_V25A_VALID_DAY_WEEKEND : FNB_V25A_VALID_DAY_WEEKDAY;
}

function normalizeNonNegativeFiniteNumberForPricing_(value) {
  if (!isStrictNumericValueForPricing_(value)) {
    return {
      ok: false,
    };
  }

  var numberValue = Number(value);

  if (!isFinite(numberValue) || numberValue < 0) {
    return {
      ok: false,
    };
  }

  return {
    ok: true,
    value: numberValue,
  };
}

function normalizePositiveFiniteNumberForPricing_(value) {
  if (!isStrictNumericValueForPricing_(value)) {
    return {
      ok: false,
    };
  }

  var numberValue = Number(value);

  if (!isFinite(numberValue) || numberValue <= 0) {
    return {
      ok: false,
    };
  }

  return {
    ok: true,
    value: numberValue,
  };
}

function normalizePositiveIntegerForPricing_(value) {
  var result = normalizePositiveFiniteNumberForPricing_(value);

  if (!result.ok || Math.floor(result.value) !== result.value) {
    return {
      ok: false,
    };
  }

  return result;
}

function normalizeOptionalNumberForPricing_(value, defaultValue) {
  if (value === "" || value === null || value === undefined) {
    return {
      ok: true,
      value: defaultValue,
    };
  }

  if (!isStrictNumericValueForPricing_(value)) {
    return {
      ok: false,
      value: defaultValue,
    };
  }

  var numberValue = Number(value);

  if (!isFinite(numberValue) || numberValue < 0) {
    return {
      ok: false,
      value: defaultValue,
    };
  }

  return {
    ok: true,
    value: numberValue,
  };
}

function isStrictNumericValueForPricing_(value) {
  if (value === "" || value === null || value === undefined) {
    return false;
  }

  if (typeof value === "number") {
    return isFinite(value);
  }

  if (typeof value !== "string") {
    return false;
  }

  var normalizedText = value.trim();

  if (!normalizedText) {
    return false;
  }

  return /^[-+]?(?:\d+|\d+\.\d+|\.\d+)$/.test(normalizedText) && isFinite(Number(normalizedText));
}

function getPackageDetailsByPackageIdForPricing_() {
  return readSheetAsObjects_("PackageDetail")
    .map(buildPackageDetailForPricing_)
    .reduce(function (map, detail) {
      if (!detail.package_id) {
        return map;
      }

      if (!map[detail.package_id]) {
        map[detail.package_id] = createPackageDetailDiagnosticsForPricing_();
      }

      map[detail.package_id].raw_detail_count += 1;

      if (!detail.is_choice_valid) {
        map[detail.package_id].invalid_choice_count += 1;
      }

      if (!detail.detail_valid) {
        map[detail.package_id].invalid_detail_count += 1;
        return map;
      }

      map[detail.package_id].valid_detail_count += 1;
      map[detail.package_id].details.push(detail);
      return map;
    }, {});
}

function findPackageCandidateForPricing_(packageId, packageDetailsById) {
  var normalizedPackageId = normalizePackageIdForPricing_(packageId);
  var rows = readSheetAsObjects_("PackageMaster");

  for (var index = 0; index < rows.length; index += 1) {
    if (normalizePackageIdForPricing_(rows[index].package_id) === normalizedPackageId) {
      return buildPackageCandidateForPricing_(rows[index], getPackageDetailDiagnosticsForPricing_(packageDetailsById, normalizedPackageId));
    }
  }

  return null;
}

function buildPackageCandidateForPricing_(item, detailDiagnostics) {
  var priceResult = normalizeNonNegativeFiniteNumberForPricing_(item.selling_price);
  var durationResult = normalizePositiveIntegerForPricing_(item.duration_minutes);
  var diagnostics = detailDiagnostics || createPackageDetailDiagnosticsForPricing_();

  return {
    package_id: normalizePackageIdForPricing_(item.package_id),
    package_name: String(item.package_name || "").trim(),
    package_category: String(item.package_category || "").trim(),
    package_type: String(item.package_type || "").trim().toLowerCase(),
    selling_price: priceResult.ok ? priceResult.value : item.selling_price,
    selling_price_valid: priceResult.ok,
    status: String(item.status || "").trim().toLowerCase(),
    valid_day_type: String(item.valid_day_type || "").trim().toLowerCase(),
    duration_minutes: durationResult.ok ? durationResult.value : item.duration_minutes,
    duration_minutes_valid: durationResult.ok,
    note: item.note || "",
    raw_detail_count: diagnostics.raw_detail_count,
    valid_detail_count: diagnostics.valid_detail_count,
    invalid_detail_count: diagnostics.invalid_detail_count,
    invalid_choice_count: diagnostics.invalid_choice_count,
    details: (diagnostics.details || []).slice().sort(sortPackageDetailsForPricing_),
  };
}

function buildPackageDetailForPricing_(item) {
  var lineNoResult = normalizePositiveIntegerForPricing_(item.line_no);
  var qtyResult = normalizePositiveFiniteNumberForPricing_(item.qty);
  var hppResult = normalizeOptionalNumberForPricing_(item.hpp, 0);
  var additionalPriceResult = normalizeOptionalNumberForPricing_(item.additional_price, 0);
  var costAmountResult = normalizeOptionalNumberForPricing_(item.cost_amount, 0);
  var choiceResult = normalizePackageChoiceForPricing_(item.is_choice);
  var packageDetailId = String(item.package_detail_id || "").trim();
  var packageId = normalizePackageIdForPricing_(item.package_id);
  var componentType = String(item.component_type || "").trim().toLowerCase();
  var componentRefId = String(item.component_ref_id || "").trim();
  var componentName = String(item.component_name || "").trim();
  var unit = String(item.unit || "").trim();

  return {
    package_detail_id: packageDetailId,
    package_id: packageId,
    line_no: lineNoResult.value,
    component_type: componentType,
    component_ref_id: componentRefId,
    component_name: componentName,
    qty: qtyResult.value,
    unit: unit,
    hpp: hppResult.value,
    additional_price: additionalPriceResult.value,
    cost_amount: costAmountResult.value,
    is_choice: choiceResult.value,
    is_choice_valid: choiceResult.ok,
    choice_group: String(item.choice_group || "").trim(),
    note: String(item.note || "").trim(),
    detail_valid: Boolean(
      packageDetailId &&
      packageId &&
      isSupportedPackageDetailComponentTypeForPricing_(componentType) &&
      componentRefId &&
      componentName &&
      unit &&
      lineNoResult.ok &&
      qtyResult.ok &&
      hppResult.ok &&
      additionalPriceResult.ok &&
      costAmountResult.ok &&
      choiceResult.ok
    ),
  };
}

function evaluatePackageEligibilityForPricing_(candidate, requestedDurationMinutes, requestDayType) {
  if (candidate.status !== "active") {
    return packageEligibilityFailure_("PACKAGE_NOT_ACTIVE", "Package tidak aktif.");
  }

  if (candidate.package_type !== FNB_V25A_PACKAGE_TYPE_ROOM_FNB_BUNDLE) {
    return packageEligibilityFailure_("PACKAGE_TYPE_NOT_SUPPORTED", "Tipe package tidak didukung.");
  }

  if (!candidate.selling_price_valid) {
    return packageEligibilityFailure_("INVALID_PACKAGE_PRICE", "Harga package tidak valid.");
  }

  if (!candidate.duration_minutes_valid) {
    return packageEligibilityFailure_("INVALID_PACKAGE_DURATION", "Durasi package tidak valid.");
  }

  if (requestedDurationMinutes < candidate.duration_minutes) {
    return packageEligibilityFailure_("PACKAGE_DURATION_TOO_SHORT", "Durasi request lebih pendek dari durasi package.");
  }

  if (!isValidPackageDayForPricing_(candidate.valid_day_type, requestDayType)) {
    return packageEligibilityFailure_("PACKAGE_DAY_NOT_ELIGIBLE", "Package tidak berlaku untuk tanggal booking.");
  }

  if (candidate.raw_detail_count === 0) {
    return packageEligibilityFailure_("PACKAGE_DETAILS_REQUIRED", "Package belum memiliki detail.");
  }

  if (candidate.invalid_choice_count > 0) {
    return packageEligibilityFailure_("PACKAGE_CHOICE_NOT_SUPPORTED", "Nilai pilihan komponen package tidak didukung.");
  }

  if (candidate.invalid_detail_count > 0) {
    return packageEligibilityFailure_("PACKAGE_DETAILS_INVALID", "Detail package tidak valid.");
  }

  if (candidate.valid_detail_count === 0) {
    return packageEligibilityFailure_("PACKAGE_DETAILS_REQUIRED", "Package belum memiliki detail valid.");
  }

  if (candidate.details.some(function (detail) { return detail.is_choice; })) {
    return packageEligibilityFailure_("PACKAGE_CHOICE_NOT_SUPPORTED", "Package dengan pilihan komponen belum didukung.");
  }

  return {
    eligible: true,
  };
}

function createPackageDetailDiagnosticsForPricing_() {
  return {
    raw_detail_count: 0,
    valid_detail_count: 0,
    invalid_detail_count: 0,
    invalid_choice_count: 0,
    details: [],
  };
}

function getPackageDetailDiagnosticsForPricing_(packageDetailsById, packageId) {
  var normalizedPackageId = normalizePackageIdForPricing_(packageId);
  return packageDetailsById[normalizedPackageId] || createPackageDetailDiagnosticsForPricing_();
}

function normalizePackageIdForPricing_(packageId) {
  return String(packageId || "").trim();
}

function isSupportedPackageDetailComponentTypeForPricing_(componentType) {
  return componentType === "service" || componentType === "inventory" || componentType === "menu";
}

function normalizePackageChoiceForPricing_(value) {
  if (value === null || value === undefined) {
    return {
      ok: true,
      value: false,
    };
  }

  if (typeof value === "boolean") {
    return {
      ok: true,
      value: value,
    };
  }

  if (typeof value === "number") {
    if (value === 1) {
      return {
        ok: true,
        value: true,
      };
    }

    if (value === 0) {
      return {
        ok: true,
        value: false,
      };
    }

    return {
      ok: false,
      value: false,
    };
  }

  if (typeof value !== "string") {
    return {
      ok: false,
      value: false,
    };
  }

  var normalizedText = value.trim().toLowerCase();

  if (!normalizedText) {
    return {
      ok: true,
      value: false,
    };
  }

  if (normalizedText === "true" || normalizedText === "1" || normalizedText === "yes") {
    return {
      ok: true,
      value: true,
    };
  }

  if (normalizedText === "false" || normalizedText === "0" || normalizedText === "no") {
    return {
      ok: true,
      value: false,
    };
  }

  return {
    ok: false,
    value: false,
  };
}

function isValidPackageDayForPricing_(validDayType, requestDayType) {
  if (validDayType === FNB_V25A_VALID_DAY_ALL) {
    return true;
  }

  if (validDayType === FNB_V25A_VALID_DAY_WEEKDAY) {
    return requestDayType === FNB_V25A_VALID_DAY_WEEKDAY;
  }

  if (validDayType === FNB_V25A_VALID_DAY_WEEKEND) {
    return requestDayType === FNB_V25A_VALID_DAY_WEEKEND;
  }

  return false;
}

function calculateRegularPricingPreview_(room, durationMinutes, ratePerHour) {
  var baseRoomCharge = calculateRoomTotal_(durationMinutes, ratePerHour);

  return validatePricingPreviewObject_(buildPricingPreviewObject_({
    booking_mode: FNB_V25A_BOOKING_MODE_REGULAR,
    requested_duration_minutes: durationMinutes,
    package_included_minutes: 0,
    billable_room_minutes: durationMinutes,
    rate_per_hour: ratePerHour,
    package_subtotal: 0,
    base_room_charge: baseRoomCharge,
    excess_room_charge: 0,
    room_total_compat: baseRoomCharge,
    grand_total: baseRoomCharge,
    lines: [
      buildPricingLineForPreview_(
        "room_base",
        "room",
        room.room_id,
        "Room " + durationMinutes + " menit",
        durationMinutes,
        "minute",
        0,
        baseRoomCharge,
        10
      ),
    ],
  }));
}

function calculatePackagePricingPreview_(room, packageCandidate, requestedDurationMinutes, ratePerHour) {
  var packageIncludedMinutes = Number(packageCandidate.duration_minutes);
  var billableRoomMinutes = Math.max(0, requestedDurationMinutes - packageIncludedMinutes);
  var excessRoomCharge = calculateRoomTotal_(billableRoomMinutes, ratePerHour);
  var lines = [
    buildPricingLineForPreview_(
      "package_subtotal",
      "package",
      packageCandidate.package_id,
      packageCandidate.package_name,
      1,
      "package",
      packageCandidate.selling_price,
      packageCandidate.selling_price,
      10
    ),
    buildPricingLineForPreview_(
      "package_included_room",
      "package_component",
      getPackageIncludedRoomSourceIdForPricing_(packageCandidate),
      "Room included " + packageIncludedMinutes + " menit",
      packageIncludedMinutes,
      "minute",
      0,
      0,
      20
    ),
  ];

  if (billableRoomMinutes > 0) {
    lines.push(buildPricingLineForPreview_(
      "room_excess",
      "room",
      room.room_id,
      "Excess room " + billableRoomMinutes + " menit",
      billableRoomMinutes,
      "minute",
      0,
      excessRoomCharge,
      30
    ));
  }

  return validatePricingPreviewObject_(buildPricingPreviewObject_({
    booking_mode: FNB_V25A_BOOKING_MODE_PACKAGE,
    requested_duration_minutes: requestedDurationMinutes,
    package_included_minutes: packageIncludedMinutes,
    billable_room_minutes: billableRoomMinutes,
    rate_per_hour: ratePerHour,
    package_subtotal: packageCandidate.selling_price,
    base_room_charge: 0,
    excess_room_charge: excessRoomCharge,
    room_total_compat: excessRoomCharge,
    grand_total: packageCandidate.selling_price + excessRoomCharge,
    lines: lines,
  }));
}

function buildPricingPreviewObject_(input) {
  return {
    pricing_version: FNB_V25A_PRICING_VERSION,
    booking_mode: input.booking_mode,
    requested_duration_minutes: input.requested_duration_minutes,
    package_included_minutes: input.package_included_minutes,
    promotion_free_minutes: 0,
    billable_room_minutes: input.billable_room_minutes,
    rate_per_hour: input.rate_per_hour,
    package_subtotal: input.package_subtotal,
    base_room_charge: input.base_room_charge,
    excess_room_charge: input.excess_room_charge,
    additional_fnb_total: 0,
    additional_service_total: 0,
    surcharge: 0,
    promotion_benefit: 0,
    manual_discount: 0,
    room_total_compat: input.room_total_compat,
    grand_total: input.grand_total,
    lines: input.lines,
  };
}

function buildPricingLineForPreview_(lineType, sourceType, sourceId, description, qty, unit, unitPrice, netAmount, sortOrder) {
  return {
    line_type: lineType,
    source_type: sourceType,
    source_id: sourceId,
    description: description,
    qty: qty,
    unit: unit,
    unit_price: unitPrice,
    gross_amount: netAmount,
    discount_amount: 0,
    net_amount: netAmount,
    sort_order: sortOrder,
  };
}

function validatePricingPreviewObject_(pricing) {
  var amountFields = [
    "package_subtotal",
    "base_room_charge",
    "excess_room_charge",
    "room_total_compat",
    "grand_total",
  ];

  for (var index = 0; index < amountFields.length; index += 1) {
    if (!isValidPricingAmount_(pricing[amountFields[index]])) {
      return pricingError_("PRICING_AMOUNT_INVALID", "Hasil perhitungan harga tidak valid.");
    }
  }

  for (var lineIndex = 0; lineIndex < pricing.lines.length; lineIndex += 1) {
    if (
      !isValidPricingAmount_(pricing.lines[lineIndex].gross_amount) ||
      !isValidPricingAmount_(pricing.lines[lineIndex].net_amount)
    ) {
      return pricingError_("PRICING_AMOUNT_INVALID", "Hasil perhitungan harga tidak valid.");
    }
  }

  return pricing;
}

function isValidPricingAmount_(value) {
  return typeof value === "number" && isFinite(value) && value >= 0;
}

function buildPackageSnapshotForPricing_(candidate) {
  return {
    package_id: candidate.package_id,
    package_name: candidate.package_name,
    package_category: candidate.package_category,
    package_type: candidate.package_type,
    selling_price: candidate.selling_price,
    duration_minutes: candidate.duration_minutes,
    valid_day_type: candidate.valid_day_type,
    valid_day_result: "pass",
    details: candidate.details.map(buildPackageDetailPreviewForPricing_),
  };
}

function buildPackageDetailPreviewForPricing_(detail) {
  return {
    package_detail_id: detail.package_detail_id,
    line_no: detail.line_no,
    component_type: detail.component_type,
    component_ref_id: detail.component_ref_id,
    component_name: detail.component_name,
    qty: detail.qty,
    unit: detail.unit,
    hpp: detail.hpp,
    additional_price: detail.additional_price,
    cost_amount: detail.cost_amount,
    is_choice: detail.is_choice,
    choice_group: detail.choice_group,
    note: detail.note,
  };
}

function getPackageIncludedRoomSourceIdForPricing_(candidate) {
  var roomDetails = candidate.details.filter(function (detail) {
    return String(detail.component_name || "").trim().toLowerCase() === "room";
  });

  if (roomDetails.length > 0) {
    return roomDetails[0].package_detail_id || candidate.package_id;
  }

  return candidate.package_id;
}

function sortPackageDetailsForPricing_(first, second) {
  var lineCompare = Number(first.line_no) - Number(second.line_no);

  if (lineCompare !== 0) {
    return lineCompare;
  }

  return String(first.package_detail_id || "").localeCompare(String(second.package_detail_id || ""));
}

function sortEligiblePackagesForPricing_(first, second) {
  var categoryCompare = String(first.package_category || "").localeCompare(String(second.package_category || ""));

  if (categoryCompare !== 0) {
    return categoryCompare;
  }

  var nameCompare = String(first.package_name || "").localeCompare(String(second.package_name || ""));

  if (nameCompare !== 0) {
    return nameCompare;
  }

  return String(first.package_id || "").localeCompare(String(second.package_id || ""));
}

function packageEligibilityFailure_(code, message) {
  return {
    eligible: false,
    code: code,
    message: message,
  };
}

function pricingError_(code, message) {
  return {
    ok: false,
    success: false,
    code: code,
    message: message,
    error: message,
  };
}

function validatePackageSessionFoundation_() {
  var validation = buildPackageSessionFoundationValidation_();

  return {
    ok: true,
    success: true,
    status: validation.status,
    sheets: validation.sheets,
    summary: validation.summary,
  };
}

function initializePackageSessionFoundation_(payload) {
  var request = payload || {};
  var dryRun = request.dry_run !== false;
  var backupConfirmed = request.backup_confirmed === true;
  var confirmToken = typeof request.confirm === "string"
    ? request.confirm.trim()
    : "";
  var initialValidation = buildPackageSessionFoundationValidation_();
  var output = buildPackageSessionFoundationInitializerPlan_(dryRun, initialValidation);

  if (dryRun) {
    return output;
  }

  if (!backupConfirmed) {
    return packageSessionFoundationError_(
      "BACKUP_CONFIRMATION_REQUIRED",
      "Backup manual spreadsheet wajib dikonfirmasi sebelum initializer dijalankan.",
      output
    );
  }

  if (confirmToken !== "INITIALIZE_V25B") {
    return packageSessionFoundationError_(
      "INITIALIZATION_CONFIRMATION_REQUIRED",
      "Token confirm wajib INITIALIZE_V25B.",
      output
    );
  }

  var lock = LockService.getScriptLock();
  var lockAcquired = false;

  try {
    if (!lock.tryLock(2000)) {
      return packageSessionFoundationError_(
        "LOCK_BUSY",
        "Sistem sedang memproses perubahan lain. Coba lagi sebentar.",
        output
      );
    }
    lockAcquired = true;

    var lockedValidation = buildPackageSessionFoundationValidation_();
    var lockedPlan = buildPackageSessionFoundationInitializerPlan_(false, lockedValidation);

    if (lockedValidation.summary.valid_sheet_count === lockedValidation.summary.required_sheet_count) {
      return packageSessionFoundationError_(
        "FOUNDATION_ALREADY_INITIALIZED",
        "Package session foundation sudah terinisialisasi.",
        lockedPlan
      );
    }

    if (lockedValidation.summary.invalid_sheet_count > 0) {
      return packageSessionFoundationError_(
        "FOUNDATION_SCHEMA_CONFLICT",
        "Terdapat sheet foundation dengan header konflik. Initializer dihentikan tanpa perbaikan otomatis.",
        lockedPlan
      );
    }

    var createdSheets = [];
    var failedSheets = [];
    var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();

    if (!spreadsheet) {
      throw new Error("Active spreadsheet was not found.");
    }

    PACKAGE_SESSION_FOUNDATION_SHEETS.forEach(function (definition) {
      var existingSheet = spreadsheet.getSheetByName(definition.sheet_name);

      if (existingSheet) {
        return;
      }

      try {
        var sheet = spreadsheet.insertSheet(definition.sheet_name);
        sheet.getRange(1, 1, 1, definition.headers.length).setValues([definition.headers]);

        if (typeof sheet.setFrozenRows === "function") {
          sheet.setFrozenRows(1);
        }

        createdSheets.push(definition.sheet_name);
      } catch (error) {
        failedSheets.push({
          sheet_name: definition.sheet_name,
          error: error.message,
        });
      }
    });

    var finalValidation = buildPackageSessionFoundationValidation_();

    if (failedSheets.length > 0) {
      return packageSessionFoundationError_(
        "FOUNDATION_INITIALIZATION_FAILED",
        "Sebagian sheet foundation gagal dibuat. Tidak ada rollback otomatis.",
        {
          ok: false,
          success: false,
          status: "partial_initialization_failed",
          dry_run: false,
          created_sheets: createdSheets,
          failed_sheets: failedSheets,
          validation: finalValidation,
        }
      );
    }

    if (!isPackageSessionFoundationReady_(finalValidation)) {
      return packageSessionFoundationError_(
        "FOUNDATION_INITIALIZATION_FAILED",
        "Post-validation package session foundation gagal.",
        {
          status: "post_validation_failed",
          dry_run: false,
          created_sheets: createdSheets,
          failed_sheets: failedSheets,
          validation: finalValidation,
        }
      );
    }

    return {
      ok: true,
      success: true,
      status: "initialized",
      dry_run: false,
      code: "FOUNDATION_INITIALIZED",
      message: "Package session foundation berhasil diinisialisasi.",
      created_sheets: createdSheets,
      failed_sheets: failedSheets,
      validation: finalValidation,
    };
  } catch (error) {
    return packageSessionFoundationError_(
      "FOUNDATION_INITIALIZATION_FAILED",
      "Package session foundation gagal diinisialisasi.",
      {
        dry_run: false,
        safe_error_detail: error.message,
      }
    );
  } finally {
    if (lockAcquired) {
      lock.releaseLock();
    }
  }
}

function isPackageSessionFoundationReady_(validation) {
  var summary = validation.summary || {};

  return validation.status === "ready" &&
    summary.required_sheet_count === PACKAGE_SESSION_FOUNDATION_SHEETS.length &&
    summary.existing_sheet_count === PACKAGE_SESSION_FOUNDATION_SHEETS.length &&
    summary.valid_sheet_count === PACKAGE_SESSION_FOUNDATION_SHEETS.length &&
    summary.missing_sheet_count === 0 &&
    summary.invalid_sheet_count === 0;
}

function buildPackageSessionFoundationInitializerPlan_(dryRun, validation) {
  var sheetsToCreate = PACKAGE_SESSION_FOUNDATION_SHEETS
    .filter(function (definition) {
      var sheetResult = validation.sheets[definition.sheet_name];
      return !sheetResult || !sheetResult.exists;
    })
    .map(function (definition) {
      return {
        sheet_name: definition.sheet_name,
        expected_headers: definition.headers.slice(),
      };
    });
  var blockers = [];

  Object.keys(validation.sheets).forEach(function (sheetName) {
    var sheetResult = validation.sheets[sheetName];

    if (sheetResult.exists && sheetResult.validation_status !== "valid") {
      blockers.push({
        code: "FOUNDATION_SCHEMA_CONFLICT",
        sheet_name: sheetName,
        validation_status: sheetResult.validation_status,
        missing_headers: sheetResult.missing_headers,
        unexpected_headers: sheetResult.unexpected_headers,
        duplicate_headers: sheetResult.duplicate_headers,
        header_order_valid: sheetResult.header_order_valid,
      });
    }
  });

  return {
    ok: true,
    success: true,
    status: dryRun ? "dry_run" : "ready_to_initialize",
    dry_run: dryRun,
    required_sheet_count: PACKAGE_SESSION_FOUNDATION_SHEETS.length,
    sheets_to_create: sheetsToCreate,
    blockers: blockers,
    expected_schemas: PACKAGE_SESSION_FOUNDATION_SHEETS.map(function (definition) {
      return {
        sheet_name: definition.sheet_name,
        expected_headers: definition.headers.slice(),
      };
    }),
    validation: validation,
  };
}

function packageSessionFoundationError_(code, message, data) {
  var response = data || {};
  response.ok = false;
  response.success = false;
  response.code = code;
  response.message = message;
  response.error = message;
  return response;
}

function validateLcFinanceFoundation_() {
  var validation = buildLcFinanceFoundationValidation_();

  return {
    ok: true,
    success: true,
    status: validation.status,
    sheets: validation.sheets,
    summary: validation.summary,
  };
}

function initializeLcFinanceFoundation_(payload) {
  var request = payload || {};
  var dryRun = request.dry_run !== false;
  var backupConfirmed = request.backup_confirmed === true;
  var confirmToken = typeof request.confirm === "string"
    ? request.confirm.trim()
    : "";
  var initialValidation = buildLcFinanceFoundationValidation_();
  var output = buildLcFinanceFoundationInitializerPlan_(dryRun, initialValidation);

  if (dryRun) {
    return output;
  }

  if (!backupConfirmed) {
    return lcFinanceFoundationError_(
      "BACKUP_CONFIRMATION_REQUIRED",
      "Backup manual spreadsheet wajib dikonfirmasi sebelum initializer LC finance dijalankan.",
      output
    );
  }

  if (confirmToken !== "INITIALIZE_LC_FINANCE") {
    return lcFinanceFoundationError_(
      "INITIALIZATION_CONFIRMATION_REQUIRED",
      "Token confirm wajib INITIALIZE_LC_FINANCE.",
      output
    );
  }

  var lock = LockService.getScriptLock();
  var lockAcquired = false;

  try {
    if (!lock.tryLock(2000)) {
      return lcFinanceFoundationError_(
        "LOCK_BUSY",
        "Sistem sedang memproses perubahan lain. Coba lagi sebentar.",
        output
      );
    }
    lockAcquired = true;

    var lockedValidation = buildLcFinanceFoundationValidation_();
    var lockedPlan = buildLcFinanceFoundationInitializerPlan_(false, lockedValidation);

    if (isLcFinanceFoundationReady_(lockedValidation)) {
      return lcFinanceFoundationError_(
        "FOUNDATION_ALREADY_INITIALIZED",
        "LC finance foundation sudah terinisialisasi.",
        lockedPlan
      );
    }

    if (lockedValidation.summary.invalid_sheet_count > 0) {
      return lcFinanceFoundationError_(
        "FOUNDATION_SCHEMA_CONFLICT",
        "Terdapat sheet LC finance dengan header konflik. Initializer dihentikan tanpa perbaikan otomatis.",
        lockedPlan
      );
    }

    var createdSheets = [];
    var updatedSheets = [];
    var failedSheets = [];

    LC_FINANCE_FOUNDATION_SHEETS.forEach(function (definition) {
      try {
        var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
        var existingSheet = spreadsheet.getSheetByName(definition.sheet_name);
        var beforeValidation = lockedValidation.sheets[definition.sheet_name] || {};
        var sheet = ensureSheetWithHeaders_(definition.sheet_name, definition.headers);

        ensureSheetHasHeaders_(sheet, definition.headers);

        if (!existingSheet) {
          createdSheets.push(definition.sheet_name);
        } else if (beforeValidation.missing_headers && beforeValidation.missing_headers.length > 0) {
          updatedSheets.push(definition.sheet_name);
        }

        if (typeof sheet.setFrozenRows === "function") {
          sheet.setFrozenRows(1);
        }
      } catch (error) {
        failedSheets.push({
          sheet_name: definition.sheet_name,
          error: error.message,
        });
      }
    });

    var finalValidation = buildLcFinanceFoundationValidation_();

    if (failedSheets.length > 0 || !isLcFinanceFoundationReady_(finalValidation)) {
      return lcFinanceFoundationError_(
        "FOUNDATION_INITIALIZATION_FAILED",
        "LC finance foundation gagal diinisialisasi penuh.",
        {
          status: "post_validation_failed",
          dry_run: false,
          created_sheets: createdSheets,
          updated_sheets: updatedSheets,
          failed_sheets: failedSheets,
          validation: finalValidation,
        }
      );
    }

    return {
      ok: true,
      success: true,
      status: "initialized",
      dry_run: false,
      code: "FOUNDATION_INITIALIZED",
      message: "LC finance foundation berhasil diinisialisasi.",
      created_sheets: createdSheets,
      updated_sheets: updatedSheets,
      failed_sheets: failedSheets,
      validation: finalValidation,
    };
  } catch (error) {
    return lcFinanceFoundationError_(
      "FOUNDATION_INITIALIZATION_FAILED",
      "LC finance foundation gagal diinisialisasi.",
      {
        dry_run: false,
        safe_error_detail: error.message,
      }
    );
  } finally {
    if (lockAcquired) {
      lock.releaseLock();
    }
  }
}

function lcFinanceFoundationError_(code, message, data) {
  var response = data || {};
  response.ok = false;
  response.success = false;
  response.code = code;
  response.message = message;
  response.error = message;
  return response;
}

function isLcFinanceFoundationReady_(validation) {
  var summary = validation.summary || {};

  return validation.status === "ready" &&
    summary.required_sheet_count === LC_FINANCE_FOUNDATION_SHEETS.length &&
    summary.existing_sheet_count === LC_FINANCE_FOUNDATION_SHEETS.length &&
    summary.valid_sheet_count === LC_FINANCE_FOUNDATION_SHEETS.length &&
    summary.missing_sheet_count === 0 &&
    summary.invalid_sheet_count === 0;
}

function buildLcFinanceFoundationInitializerPlan_(dryRun, validation) {
  var sheetsToCreate = LC_FINANCE_FOUNDATION_SHEETS
    .filter(function (definition) {
      var sheetResult = validation.sheets[definition.sheet_name];
      return !sheetResult || !sheetResult.exists;
    })
    .map(function (definition) {
      return {
        sheet_name: definition.sheet_name,
        expected_headers: definition.headers.slice(),
      };
    });
  var sheetsToUpdate = [];
  var blockers = [];

  Object.keys(validation.sheets).forEach(function (sheetName) {
    var sheetResult = validation.sheets[sheetName];

    if (sheetResult.exists && sheetResult.missing_headers.length > 0 && sheetResult.allow_append_headers) {
      sheetsToUpdate.push({
        sheet_name: sheetName,
        missing_headers: sheetResult.missing_headers,
      });
    }

    if (sheetResult.exists && sheetResult.validation_status === "invalid") {
      blockers.push({
        code: "FOUNDATION_SCHEMA_CONFLICT",
        sheet_name: sheetName,
        validation_status: sheetResult.validation_status,
        duplicate_headers: sheetResult.duplicate_headers,
        unexpected_headers: sheetResult.unexpected_headers,
        header_order_valid: sheetResult.header_order_valid,
      });
    }
  });

  return {
    ok: true,
    success: true,
    status: dryRun ? "dry_run" : "ready_to_initialize",
    dry_run: dryRun,
    required_sheet_count: LC_FINANCE_FOUNDATION_SHEETS.length,
    sheets_to_create: sheetsToCreate,
    sheets_to_update: sheetsToUpdate,
    blockers: blockers,
    expected_schemas: LC_FINANCE_FOUNDATION_SHEETS.map(function (definition) {
      return {
        sheet_name: definition.sheet_name,
        expected_headers: definition.headers.slice(),
      };
    }),
    validation: validation,
  };
}

function buildLcFinanceFoundationValidation_() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();

  if (!spreadsheet) {
    throw new Error("Active spreadsheet was not found.");
  }

  var sheets = {};
  var summary = {
    required_sheet_count: LC_FINANCE_FOUNDATION_SHEETS.length,
    existing_sheet_count: 0,
    valid_sheet_count: 0,
    missing_sheet_count: 0,
    invalid_sheet_count: 0,
    append_required_count: 0,
  };

  LC_FINANCE_FOUNDATION_SHEETS.forEach(function (definition) {
    var sheetResult = validateLcFinanceFoundationSheet_(spreadsheet, definition);
    sheets[definition.sheet_name] = sheetResult;

    if (!sheetResult.exists) {
      summary.missing_sheet_count++;
      return;
    }

    summary.existing_sheet_count++;

    if (sheetResult.validation_status === "valid") {
      summary.valid_sheet_count++;
    } else if (sheetResult.validation_status === "append_required") {
      summary.append_required_count++;
    } else {
      summary.invalid_sheet_count++;
    }
  });

  var status = "ready";

  if (summary.missing_sheet_count > 0 && summary.invalid_sheet_count > 0) {
    status = "partial_invalid";
  } else if (summary.invalid_sheet_count > 0) {
    status = "invalid";
  } else if (summary.missing_sheet_count > 0) {
    status = "not_initialized";
  } else if (summary.append_required_count > 0) {
    status = "append_required";
  }

  return {
    status: status,
    sheets: sheets,
    summary: summary,
  };
}

function validateLcFinanceFoundationSheet_(spreadsheet, definition) {
  var sheet = spreadsheet.getSheetByName(definition.sheet_name);

  if (!sheet) {
    return {
      sheet_name: definition.sheet_name,
      exists: false,
      allow_append_headers: definition.allow_append_headers === true,
      expected_headers: definition.headers.slice(),
      missing_headers: definition.headers.slice(),
      unexpected_headers: [],
      duplicate_headers: [],
      header_order_valid: false,
      data_row_count: 0,
      missing_primary_id_count: 0,
      duplicate_primary_id_count: 0,
      validation_status: "missing",
    };
  }

  var values = sheet.getDataRange().getValues();
  var headers = values.length > 0
    ? values[0].map(function (header) { return String(header).trim(); })
    : [];
  var headerIssues = getPackageSessionFoundationHeaderIssues_(headers, definition.headers);
  var duplicateHeaders = headerIssues.duplicate_headers;
  var missingHeaders = headerIssues.missing_headers;
  var unexpectedHeaders = headerIssues.unexpected_headers;
  var headerOrderValid = headerIssues.header_order_valid;
  var appendPrefixOrderValid = definition.allow_append_headers === true &&
    headers.every(function (header, index) {
      return !header || definition.headers[index] === header;
    });
  var rows = values.slice(1).filter(function (row) {
    return row.some(function (cell) {
      return cell !== "" && cell !== null;
    });
  });
  var primaryIndex = headers.indexOf(definition.primary_id);
  var primaryIds = {};
  var missingPrimaryIdCount = 0;
  var duplicatePrimaryIdCount = 0;

  if (primaryIndex >= 0) {
    rows.forEach(function (row) {
      var id = String(row[primaryIndex] || "").trim();

      if (!id) {
        missingPrimaryIdCount++;
        return;
      }

      if (primaryIds[id]) {
        duplicatePrimaryIdCount++;
      }

      primaryIds[id] = true;
    });
  }

  var hasBlockingHeaderConflict = duplicateHeaders.length > 0 ||
    unexpectedHeaders.length > 0 ||
    (!definition.allow_append_headers && missingHeaders.length > 0) ||
    (definition.allow_append_headers ? !appendPrefixOrderValid : !headerOrderValid);
  var validationStatus = hasBlockingHeaderConflict ||
    primaryIndex === -1 ||
    missingPrimaryIdCount > 0 ||
    duplicatePrimaryIdCount > 0
      ? "invalid"
      : "valid";

  if (definition.allow_append_headers &&
      missingHeaders.length > 0 &&
      appendPrefixOrderValid &&
      duplicateHeaders.length === 0 &&
      unexpectedHeaders.length === 0 &&
      primaryIndex >= 0 &&
      missingPrimaryIdCount === 0 &&
      duplicatePrimaryIdCount === 0) {
    validationStatus = "append_required";
  }

  return {
    sheet_name: definition.sheet_name,
    exists: true,
    allow_append_headers: definition.allow_append_headers === true,
    header_count: headers.length,
    expected_header_count: definition.headers.length,
    expected_headers: definition.headers.slice(),
    missing_headers: missingHeaders,
    unexpected_headers: unexpectedHeaders,
    duplicate_headers: duplicateHeaders,
    header_order_valid: headerOrderValid,
    data_row_count: rows.length,
    missing_primary_id_count: missingPrimaryIdCount,
    duplicate_primary_id_count: duplicatePrimaryIdCount,
    validation_status: validationStatus,
  };
}

function buildPackageSessionFoundationValidation_() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();

  if (!spreadsheet) {
    throw new Error("Active spreadsheet was not found.");
  }

  var sheets = {};
  var referenceMaps = buildPackageSessionFoundationReferenceMaps_(spreadsheet);

  PACKAGE_SESSION_FOUNDATION_SHEETS.forEach(function (definition) {
    sheets[definition.sheet_name] = validatePackageSessionFoundationSheet_(spreadsheet, definition, referenceMaps);
  });

  var summary = Object.keys(sheets).reduce(function (result, sheetName) {
    var sheetResult = sheets[sheetName];

    if (sheetResult.exists) {
      result.existing_sheet_count += 1;
    } else {
      result.missing_sheet_count += 1;
    }

    if (sheetResult.validation_status === "valid") {
      result.valid_sheet_count += 1;
    } else if (sheetResult.validation_status === "invalid") {
      result.invalid_sheet_count += 1;
    }

    return result;
  }, {
    required_sheet_count: PACKAGE_SESSION_FOUNDATION_SHEETS.length,
    existing_sheet_count: 0,
    valid_sheet_count: 0,
    missing_sheet_count: 0,
    invalid_sheet_count: 0,
  });

  return {
    status: getPackageSessionFoundationStatus_(summary),
    sheets: sheets,
    summary: summary,
  };
}

function getPackageSessionFoundationStatus_(summary) {
  if (summary.invalid_sheet_count > 0 && summary.missing_sheet_count > 0) {
    return "partial_invalid";
  }

  if (summary.invalid_sheet_count > 0) {
    return "invalid";
  }

  if (summary.missing_sheet_count > 0) {
    return "not_initialized";
  }

  return "ready";
}

function validatePackageSessionFoundationSheet_(spreadsheet, definition, referenceMaps) {
  var sheet = spreadsheet.getSheetByName(definition.sheet_name);
  var result = {
    sheet_name: definition.sheet_name,
    exists: !!sheet,
    header_count: 0,
    expected_header_count: definition.headers.length,
    missing_headers: definition.headers.slice(),
    unexpected_headers: [],
    header_order_valid: false,
    duplicate_headers: [],
    data_row_count: 0,
    missing_primary_id_count: 0,
    duplicate_primary_id_count: 0,
    validation_status: "missing",
  };

  if (!sheet) {
    return result;
  }

  var values = sheet.getDataRange().getValues();
  var headers = values.length > 0
    ? values[0].map(function (header) {
      return String(header).trim();
    })
    : [];
  var rows = values.length > 1 ? values.slice(1).filter(packageSessionFoundationRowHasData_) : [];
  var headerIssues = getPackageSessionFoundationHeaderIssues_(headers, definition.headers);

  result.header_count = headers.length;
  result.missing_headers = headerIssues.missing_headers;
  result.unexpected_headers = headerIssues.unexpected_headers;
  result.header_order_valid = headerIssues.header_order_valid;
  result.duplicate_headers = headerIssues.duplicate_headers;
  result.data_row_count = rows.length;
  result.missing_primary_id_count = countMissingValuesInRows_(rows, headers, definition.primary_id);
  result.duplicate_primary_id_count = countDuplicateNonBlankValuesInRows_(rows, headers, definition.primary_id);

  var dataIssues = validatePackageSessionFoundationRows_(definition.sheet_name, headers, rows, referenceMaps);

  Object.keys(dataIssues).forEach(function (key) {
    result[key] = dataIssues[key];
  });

  result.validation_status = (
    result.missing_headers.length === 0 &&
    result.unexpected_headers.length === 0 &&
    result.duplicate_headers.length === 0 &&
    result.header_order_valid &&
    result.missing_primary_id_count === 0 &&
    result.duplicate_primary_id_count === 0 &&
    dataIssues.issue_count === 0
  ) ? "valid" : "invalid";

  return result;
}

function getPackageSessionFoundationHeaderIssues_(headers, expectedHeaders) {
  var headerCounts = countValues_(headers);
  var expectedMap = countValues_(expectedHeaders);

  return {
    missing_headers: expectedHeaders.filter(function (header) {
      return !headerCounts[header];
    }),
    unexpected_headers: headers.filter(function (header) {
      return header && !expectedMap[header];
    }),
    header_order_valid: headers.length === expectedHeaders.length && expectedHeaders.every(function (header, index) {
      return headers[index] === header;
    }),
    duplicate_headers: Object.keys(headerCounts).filter(function (header) {
      return header && headerCounts[header] > 1;
    }),
  };
}

function buildPackageSessionFoundationReferenceMaps_(spreadsheet) {
  var rooms = readPackageSessionFoundationRowsForReference_(spreadsheet, "Rooms");
  var transactions = readPackageSessionFoundationRowsForReference_(spreadsheet, "Transactions");
  var roomSessions = readPackageSessionFoundationRowsForReference_(spreadsheet, ROOM_SESSIONS_SHEET);
  var sessionPackages = readPackageSessionFoundationRowsForReference_(spreadsheet, SESSION_PACKAGES_SHEET);

  return {
    rooms_sheet_exists: rooms.exists,
    transactions_sheet_exists: transactions.exists,
    room_ids: buildValueSet_(rooms.rows, rooms.headers, "room_id"),
    transaction_ids: buildValueSet_(transactions.rows, transactions.headers, "transaction_id"),
    room_session_ids: buildValueSet_(roomSessions.rows, roomSessions.headers, "session_id"),
    session_package_ids: buildValueSet_(sessionPackages.rows, sessionPackages.headers, "session_package_id"),
    session_package_session_ids: buildValueMap_(sessionPackages.rows, sessionPackages.headers, "session_package_id", "session_id"),
  };
}

function readPackageSessionFoundationRowsForReference_(spreadsheet, sheetName) {
  var sheet = spreadsheet.getSheetByName(sheetName);

  if (!sheet) {
    return {
      exists: false,
      headers: [],
      rows: [],
    };
  }

  var values = sheet.getDataRange().getValues();

  return {
    exists: true,
    headers: values.length ? values[0].map(function (header) {
      return String(header).trim();
    }) : [],
    rows: values.length > 1 ? values.slice(1).filter(packageSessionFoundationRowHasData_) : [],
  };
}

function validatePackageSessionFoundationRows_(sheetName, headers, rows, referenceMaps) {
  if (sheetName === ROOM_SESSIONS_SHEET) {
    return validateRoomSessionFoundationRows_(headers, rows, referenceMaps);
  }

  if (sheetName === SESSION_PACKAGES_SHEET) {
    return validateSessionPackageFoundationRows_(headers, rows, referenceMaps);
  }

  if (sheetName === SESSION_PACKAGE_DETAILS_SHEET) {
    return validateSessionPackageDetailFoundationRows_(headers, rows, referenceMaps);
  }

  if (sheetName === TRANSACTION_LINES_SHEET) {
    return validateTransactionLineFoundationRows_(headers, rows, referenceMaps);
  }

  return {
    issue_count: 0,
  };
}

function validateRoomSessionFoundationRows_(headers, rows, referenceMaps) {
  var idempotencyDuplicateCount = countDuplicateNonBlankValuesInRows_(rows, headers, "idempotency_key");
  var issues = {
    duplicate_idempotency_key_count: idempotencyDuplicateCount,
    missing_room_id_count: 0,
    missing_room_reference_count: 0,
    missing_required_field_count: 0,
    invalid_booking_mode_count: 0,
    invalid_status_count: 0,
    invalid_duration_or_rate_count: 0,
    closed_without_transaction_count: 0,
    active_with_closed_transaction_count: 0,
  };

  rows.forEach(function (row) {
    var objectRow = buildObjectFromFoundationRow_(headers, row);
    var roomId = String(objectRow.room_id || "").trim();
    var bookingMode = String(objectRow.booking_mode || "").trim().toLowerCase();
    var status = String(objectRow.status || "").trim().toLowerCase();

    [
      "session_id",
      "room_id",
      "booking_mode",
      "status",
      "booked_duration_minutes",
      "package_included_minutes",
      "promotion_free_minutes",
      "billable_room_minutes",
      "rate_per_hour",
    ].forEach(function (fieldName) {
      if (isFoundationBlank_(objectRow[fieldName])) {
        issues.missing_required_field_count += 1;
      }
    });

    if (!roomId) {
      issues.missing_room_id_count += 1;
    } else if (!referenceMaps.rooms_sheet_exists || !referenceMaps.room_ids[roomId]) {
      issues.missing_room_reference_count += 1;
    }

    if (["regular", "package"].indexOf(bookingMode) === -1) {
      issues.invalid_booking_mode_count += 1;
    }

    if (["starting", "active", "closing", "closed", "cancelled", "voided", "start_failed", "close_failed"].indexOf(status) === -1) {
      issues.invalid_status_count += 1;
    }

    ["booked_duration_minutes", "package_included_minutes", "promotion_free_minutes", "billable_room_minutes"].forEach(function (fieldName) {
      if (!isFoundationNonNegativeInteger_(objectRow[fieldName])) {
        issues.invalid_duration_or_rate_count += 1;
      }
    });

    if (status === "active" && Number(objectRow.booked_duration_minutes) < 15) {
      issues.invalid_duration_or_rate_count += 1;
    }

    if (!isFoundationNonNegativeNumber_(objectRow.rate_per_hour)) {
      issues.invalid_duration_or_rate_count += 1;
    }

    if (status === "closed" && !String(objectRow.closed_transaction_id || "").trim()) {
      issues.closed_without_transaction_count += 1;
    }

    if (status === "active" && String(objectRow.closed_transaction_id || "").trim()) {
      issues.active_with_closed_transaction_count += 1;
    }
  });

  issues.issue_count = sumPackageSessionFoundationIssueCounts_(issues);
  return issues;
}

function validateSessionPackageFoundationRows_(headers, rows, referenceMaps) {
  var activePackageCountBySession = {};
  var issues = {
    missing_session_reference_count: 0,
    missing_package_identity_count: 0,
    missing_snapshot_field_count: 0,
    missing_required_field_count: 0,
    multiple_active_package_session_count: 0,
    invalid_package_type_count: 0,
    invalid_status_count: 0,
    invalid_price_count: 0,
    invalid_duration_count: 0,
    invalid_valid_day_type_count: 0,
    invalid_valid_day_result_count: 0,
  };

  rows.forEach(function (row) {
    var objectRow = buildObjectFromFoundationRow_(headers, row);
    var sessionId = String(objectRow.session_id || "").trim();
    var status = String(objectRow.status || "").trim().toLowerCase();

    if (isFoundationBlank_(objectRow.package_id)) {
      issues.missing_package_identity_count += 1;
    }

    [
      "session_id",
      "package_id",
      "package_name",
      "package_type",
      "selling_price",
      "duration_minutes",
      "valid_day_type",
      "valid_day_result",
      "status",
    ].forEach(function (fieldName) {
      if (isFoundationBlank_(objectRow[fieldName])) {
        issues.missing_required_field_count += 1;
      }
    });

    [
      "package_name",
      "package_type",
      "selling_price",
      "duration_minutes",
      "valid_day_type",
      "valid_day_result",
      "status",
    ].forEach(function (fieldName) {
      if (isFoundationBlank_(objectRow[fieldName])) {
        issues.missing_snapshot_field_count += 1;
      }
    });

    if (!sessionId || !referenceMaps.room_session_ids[sessionId]) {
      issues.missing_session_reference_count += 1;
    }

    if (String(objectRow.package_type || "").trim().toLowerCase() !== FNB_V25A_PACKAGE_TYPE_ROOM_FNB_BUNDLE) {
      issues.invalid_package_type_count += 1;
    }

    if (["active", "voided"].indexOf(status) === -1) {
      issues.invalid_status_count += 1;
    }

    if (!isFoundationNonNegativeNumber_(objectRow.selling_price)) {
      issues.invalid_price_count += 1;
    }

    if (!isFoundationPositiveInteger_(objectRow.duration_minutes)) {
      issues.invalid_duration_count += 1;
    }

    if (!isFoundationStringInEnum_(objectRow.valid_day_type, ["all", "weekday", "weekend"])) {
      issues.invalid_valid_day_type_count += 1;
    }

    if (String(objectRow.valid_day_result || "").trim().toLowerCase() !== "pass") {
      issues.invalid_valid_day_result_count += 1;
    }

    if (status === "active" && sessionId) {
      activePackageCountBySession[sessionId] = (activePackageCountBySession[sessionId] || 0) + 1;
    }
  });

  issues.multiple_active_package_session_count = Object.keys(activePackageCountBySession).filter(function (sessionId) {
    return activePackageCountBySession[sessionId] > 1;
  }).length;
  issues.issue_count = sumPackageSessionFoundationIssueCounts_(issues);
  return issues;
}

function validateSessionPackageDetailFoundationRows_(headers, rows, referenceMaps) {
  var issues = {
    missing_session_package_reference_count: 0,
    missing_session_reference_count: 0,
    missing_required_field_count: 0,
    session_package_session_mismatch_count: 0,
    invalid_component_type_count: 0,
    invalid_line_no_count: 0,
    invalid_qty_count: 0,
    invalid_amount_count: 0,
    invalid_is_choice_count: 0,
    invalid_fulfillment_status_count: 0,
    invalid_fulfilled_qty_count: 0,
    fulfilled_qty_exceeds_qty_count: 0,
  };

  rows.forEach(function (row) {
    var objectRow = buildObjectFromFoundationRow_(headers, row);
    var sessionPackageId = String(objectRow.session_package_id || "").trim();
    var sessionId = String(objectRow.session_id || "").trim();
    var choiceResult = parseFoundationBoolean_(objectRow.is_choice);
    var qty = isFoundationPositiveNumber_(objectRow.qty) ? Number(objectRow.qty) : NaN;
    var fulfilledQty = isFoundationBlank_(objectRow.fulfilled_qty)
      ? 0
      : isFoundationFiniteNumber_(objectRow.fulfilled_qty) ? Number(objectRow.fulfilled_qty) : NaN;

    [
      "session_package_id",
      "session_id",
      "package_detail_id",
      "component_type",
      "component_ref_id",
      "component_name",
      "line_no",
      "qty",
      "unit",
      "is_choice",
      "fulfillment_status",
      "fulfilled_qty",
    ].forEach(function (fieldName) {
      if (isFoundationBlank_(objectRow[fieldName])) {
        issues.missing_required_field_count += 1;
      }
    });

    if (!sessionPackageId || !referenceMaps.session_package_ids[sessionPackageId]) {
      issues.missing_session_package_reference_count += 1;
    } else if (sessionId && referenceMaps.session_package_session_ids[sessionPackageId] !== sessionId) {
      issues.session_package_session_mismatch_count += 1;
    }

    if (!sessionId || !referenceMaps.room_session_ids[sessionId]) {
      issues.missing_session_reference_count += 1;
    }

    if (["service", "inventory", "menu"].indexOf(String(objectRow.component_type || "").trim().toLowerCase()) === -1) {
      issues.invalid_component_type_count += 1;
    }

    if (!isFoundationPositiveInteger_(objectRow.line_no)) {
      issues.invalid_line_no_count += 1;
    }

    if (!isFoundationPositiveNumber_(objectRow.qty)) {
      issues.invalid_qty_count += 1;
    }

    ["hpp", "additional_price", "cost_amount"].forEach(function (fieldName) {
      if (!isFoundationBlank_(objectRow[fieldName]) && !isFoundationNonNegativeNumber_(objectRow[fieldName])) {
        issues.invalid_amount_count += 1;
      }
    });

    if (!choiceResult.valid || choiceResult.value !== false) {
      issues.invalid_is_choice_count += 1;
    }

    if (["pending", "fulfilled", "partial", "voided"].indexOf(String(objectRow.fulfillment_status || "").trim().toLowerCase()) === -1) {
      issues.invalid_fulfillment_status_count += 1;
    }

    if (!isFinite(fulfilledQty) || fulfilledQty < 0) {
      issues.invalid_fulfilled_qty_count += 1;
    } else if (isFinite(qty) && fulfilledQty > qty) {
      issues.fulfilled_qty_exceeds_qty_count += 1;
    }
  });

  issues.issue_count = sumPackageSessionFoundationIssueCounts_(issues);
  return issues;
}

function validateTransactionLineFoundationRows_(headers, rows, referenceMaps) {
  var issues = {
    missing_session_reference_count: 0,
    missing_transaction_reference_count: 0,
    missing_required_field_count: 0,
    invalid_line_type_count: 0,
    invalid_qty_count: 0,
    invalid_unit_price_count: 0,
    invalid_negative_net_amount_count: 0,
    invalid_amount_count: 0,
    invalid_sort_order_count: 0,
  };

  rows.forEach(function (row) {
    var objectRow = buildObjectFromFoundationRow_(headers, row);
    var transactionId = String(objectRow.transaction_id || "").trim();
    var sessionId = String(objectRow.session_id || "").trim();
    var lineType = String(objectRow.line_type || "").trim().toLowerCase();

    [
      "transaction_id",
      "session_id",
      "line_type",
      "source_type",
      "source_id",
      "description",
      "qty",
      "unit",
      "unit_price",
      "gross_amount",
      "discount_amount",
      "net_amount",
      "tax_amount",
      "sort_order",
      "created_at",
    ].forEach(function (fieldName) {
      if (isFoundationBlank_(objectRow[fieldName])) {
        issues.missing_required_field_count += 1;
      }
    });

    if (!transactionId || !referenceMaps.transactions_sheet_exists || !referenceMaps.transaction_ids[transactionId]) {
      issues.missing_transaction_reference_count += 1;
    }

    if (!sessionId || !referenceMaps.room_session_ids[sessionId]) {
      issues.missing_session_reference_count += 1;
    }

    if ([
      "room_base",
      "package_subtotal",
      "package_included_room",
      "room_excess",
      "fnb_order",
      "service",
      "promotion",
      "manual_discount",
      "surcharge",
    ].indexOf(lineType) === -1) {
      issues.invalid_line_type_count += 1;
    }

    if (!isFoundationNonNegativeNumber_(objectRow.qty)) {
      issues.invalid_qty_count += 1;
    }

    if (!isFoundationNonNegativeNumber_(objectRow.unit_price)) {
      issues.invalid_unit_price_count += 1;
    }

    ["gross_amount", "discount_amount", "tax_amount"].forEach(function (fieldName) {
      if (!isFoundationNonNegativeNumber_(objectRow[fieldName])) {
        issues.invalid_amount_count += 1;
      }
    });

    if (!isFoundationFiniteNumber_(objectRow.net_amount)) {
      issues.invalid_amount_count += 1;
    } else if (Number(objectRow.net_amount) < 0 && ["manual_discount", "promotion"].indexOf(lineType) === -1) {
      issues.invalid_negative_net_amount_count += 1;
    }

    if (!isFoundationPositiveInteger_(objectRow.sort_order)) {
      issues.invalid_sort_order_count += 1;
    }
  });

  issues.issue_count = sumPackageSessionFoundationIssueCounts_(issues);
  return issues;
}

function buildObjectFromFoundationRow_(headers, row) {
  return headers.reduce(function (objectRow, header, index) {
    if (header) {
      objectRow[header] = row[index];
    }

    return objectRow;
  }, {});
}

function packageSessionFoundationRowHasData_(row) {
  return row.some(function (cell) {
    return cell !== "" && cell !== null && cell !== undefined;
  });
}

function buildValueSet_(rows, headers, fieldName) {
  var index = headers.indexOf(fieldName);

  if (index === -1) {
    return {};
  }

  return rows.reduce(function (set, row) {
    var value = String(row[index] || "").trim();

    if (value) {
      set[value] = true;
    }

    return set;
  }, {});
}

function buildValueMap_(rows, headers, keyFieldName, valueFieldName) {
  var keyIndex = headers.indexOf(keyFieldName);
  var valueIndex = headers.indexOf(valueFieldName);

  if (keyIndex === -1 || valueIndex === -1) {
    return {};
  }

  return rows.reduce(function (map, row) {
    var key = String(row[keyIndex] || "").trim();

    if (key) {
      map[key] = String(row[valueIndex] || "").trim();
    }

    return map;
  }, {});
}

function countDuplicateNonBlankValuesInRows_(rows, headers, fieldName) {
  var index = headers.indexOf(fieldName);

  if (index === -1) {
    return 0;
  }

  var counts = rows.reduce(function (map, row) {
    var value = String(row[index] || "").trim();

    if (value) {
      map[value] = (map[value] || 0) + 1;
    }

    return map;
  }, {});

  return Object.keys(counts).filter(function (value) {
    return counts[value] > 1;
  }).length;
}

function countMissingValuesInRows_(rows, headers, fieldName) {
  var index = headers.indexOf(fieldName);

  if (index === -1) {
    return 0;
  }

  return rows.filter(function (row) {
    return !String(row[index] || "").trim();
  }).length;
}

function countValues_(values) {
  return values.reduce(function (map, value) {
    var key = String(value || "").trim();

    if (key) {
      map[key] = (map[key] || 0) + 1;
    }

    return map;
  }, {});
}

function sumPackageSessionFoundationIssueCounts_(issues) {
  return Object.keys(issues).reduce(function (total, key) {
    if (key === "issue_count") {
      return total;
    }

    return total + (Number(issues[key]) || 0);
  }, 0);
}

function isFoundationFiniteNumber_(value) {
  return isStrictNumericValueForPricing_(value);
}

function isFoundationNonNegativeNumber_(value) {
  return isFoundationFiniteNumber_(value) && Number(value) >= 0;
}

function isFoundationPositiveNumber_(value) {
  return isFoundationFiniteNumber_(value) && Number(value) > 0;
}

function isFoundationNonNegativeInteger_(value) {
  var numberValue = Number(value);
  return isFoundationNonNegativeNumber_(value) && Math.floor(numberValue) === numberValue;
}

function isFoundationPositiveInteger_(value) {
  var numberValue = Number(value);
  return isFoundationPositiveNumber_(value) && Math.floor(numberValue) === numberValue;
}

function isFoundationBlank_(value) {
  if (value === null || value === undefined) {
    return true;
  }

  return typeof value === "string" && value.trim() === "";
}

function isFoundationStringInEnum_(value, allowedValues) {
  if (typeof value !== "string") {
    return false;
  }

  return allowedValues.indexOf(value.trim().toLowerCase()) !== -1;
}

function parseFoundationBoolean_(value) {
  if (typeof value === "boolean") {
    return {
      valid: true,
      value: value,
    };
  }

  if (typeof value === "number") {
    if (value === 1 || value === 0) {
      return {
        valid: true,
        value: value === 1,
      };
    }

    return {
      valid: false,
      value: false,
    };
  }

  if (typeof value !== "string") {
    return {
      valid: false,
      value: false,
    };
  }

  var normalizedValue = String(value || "").trim().toLowerCase();

  if (["false", "0", "no"].indexOf(normalizedValue) !== -1) {
    return {
      valid: true,
      value: false,
    };
  }

  if (["true", "1", "yes"].indexOf(normalizedValue) !== -1) {
    return {
      valid: true,
      value: true,
    };
  }

  return {
    valid: false,
    value: false,
  };
}

function getRecipeBom_(menuId) {
  ensureRecipeBomSheet_();
  var normalizedMenuId = String(menuId || "").trim();

  return {
    ok: true,
    success: true,
    recipe_bom: readSheetAsObjects_("RecipeBom")
      .map(normalizeRecipeBom_)
      .filter(function (item) {
        if (!item.recipe_id && !item.menu_id && !item.ingredient_name) {
          return false;
        }

        return !normalizedMenuId || item.menu_id === normalizedMenuId;
      })
      .sort(function (first, second) {
        var menuCompare = String(first.menu_id || "").localeCompare(String(second.menu_id || ""));

        if (menuCompare !== 0) {
          return menuCompare;
        }

        return (Number(first.line_no) || 0) - (Number(second.line_no) || 0);
      }),
  };
}

function normalizeRecipeBom_(item) {
  return {
    recipe_id: item.recipe_id || "",
    menu_id: item.menu_id || "",
    line_no: Number(item.line_no) || 0,
    ingredient_item_id: item.ingredient_item_id || "",
    ingredient_name: item.ingredient_name || "",
    qty_used: Number(item.qty_used) || 0,
    unit: item.unit || "",
    cost_per_unit: Number(item.cost_per_unit) || 0,
    cost_amount: Number(item.cost_amount) || 0,
    waste_percent: Number(item.waste_percent) || 0,
    status: item.status || "",
    updated_at: item.updated_at || "",
    note: item.note || "",
  };
}

function normalizeBooleanString_(value) {
  var normalizedValue = String(value || "").trim().toLowerCase();

  return normalizedValue === "true" || normalizedValue === "yes" || normalizedValue === "1";
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
  if (!lock.tryLock(2000)) {
    return createLockBusyResponse_("Sistem sedang memproses perubahan stok lain. Coba lagi sebentar.");
  }

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
    role: normalizeEmployeeRole_(employee.role),
    status: getEmployeeStatus_(employee),
  };
}

function normalizeEmployeeRole_(role) {
  var normalizedRole = String(role || "").trim().toLowerCase();

  if (normalizedRole === "admin") {
    return "manager";
  }

  return normalizedRole || "cashier";
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
  var normalizedRole = normalizeEmployeeRole_(role);
  var normalizedRequiredRole = normalizeEmployeeRole_(requiredRole || "manager");
  var rank = {
    staff: 1,
    receptionist: 1,
    cashier: 2,
    manager: 3,
    owner: 4,
  };

  if (normalizedRole === "owner") {
    return true;
  }

  return (rank[normalizedRole] || 0) >= (rank[normalizedRequiredRole] || rank.manager);
}

function auditAdminPinValidation_(payload, result, blockReason, employee) {
  var requestedAction = String(payload.requested_action || "manager_pin").trim();
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
        required_role: payload.required_role || "manager",
        requested_action: requestedAction,
      }
      : {
        required_role: payload.required_role || "manager",
        requested_action: requestedAction,
      },
    changed_by: safeEmployee ? safeEmployee.employee_name : payload.changed_by || "Manager",
    note: requestedAction,
    result: result,
    block_reason: blockReason || "",
  });
}

function validateAdminPinPayload_(pin, requiredRole, requestedAction, changedBy, shouldAudit) {
  ensureEmployeesSheet_();

  var payload = {
    pin: pin,
    required_role: requiredRole || "manager",
    requested_action: requestedAction || "manager_pin",
    changed_by: changedBy || "Manager",
  };
  var normalizedPin = String(pin || "").trim();
  var pinLabel = roleMeetsRequired_("cashier", payload.required_role)
    ? "PIN operator"
    : "PIN owner/manager";

  if (!normalizedPin) {
    if (shouldAudit !== false) {
      auditAdminPinValidation_(payload, "blocked", "EMPTY_PIN", null);
    }

    return {
      ok: false,
      success: false,
      message: pinLabel + " wajib diisi.",
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
      message: pinLabel + " tidak valid.",
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
    message: pinLabel + " valid.",
    employee: sanitizeEmployeeForAccess_(employee),
  };
}

function validateAdminPin_(payload) {
  var result = validateAdminPinPayload_(
    payload.pin,
    payload.required_role || "manager",
    payload.requested_action || "manager_pin",
    payload.changed_by || "Manager",
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
  if (!lock.tryLock(2000)) {
    Logger.log("Audit log skipped because document lock is busy.");
    return null;
  }

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

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(3000)) {
    return masterError_("Sistem sedang memproses master data lain. Coba lagi sebentar.");
  }

  try {
    var sheet = ensureRoomsMasterColumns_();
    var headerMap = getHeaderMap_(sheet);

    // Cek duplikasi nama room
    var existingRooms = readSheetAsObjects_("Rooms");
    var nameLower = data.room_name.toLowerCase();
    var duplicateName = existingRooms.some(function(r) {
      return String(r.room_name || "").trim().toLowerCase() === nameLower;
    });
    if (duplicateName) {
      return masterError_("Nama room \"" + data.room_name + "\" sudah digunakan. Gunakan nama lain.");
    }

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
  } finally {
    lock.releaseLock();
  }
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
  var bonusSalesLc = Number(payload.bonus_sales_lc || payload.bonus_per_item || 0);
  var hpp = Number(payload.hpp || 0);
  var variableCostRate = Number(payload.variable_cost_rate || 0);
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

  if (!isFinite(bonusSalesLc) || bonusSalesLc < 0) {
    masterError_("Bonus sales LC wajib angka 0 atau lebih.");
  }

  if (!isFinite(hpp) || hpp < 0) {
    masterError_("HPP wajib angka 0 atau lebih.");
  }

  if (!isFinite(variableCostRate) || variableCostRate < 0 || variableCostRate > 100) {
    masterError_("Var cost % wajib angka 0 sampai 100.");
  }

  return {
    menu_name: menuName,
    category: category,
    price: price,
    stock_item_id: stockItemId,
    stock_qty_per_unit: stockItemId ? qtyPerUnit : 0,
    stock_tracking: stockItemId ? "yes" : "no",
    bonus_sales_lc: bonusSalesLc,
    hpp: hpp,
    variable_cost_rate: variableCostRate,
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
    bonus_sales_lc: Number(row.bonus_sales_lc || row.bonus_per_item) || 0,
    hpp: Number(row.hpp) || 0,
    variable_cost_rate: Number(row.variable_cost_rate) || 0,
  };
}

function saveMenuMaster_(payload) {
  var data = validateMenuMasterPayload_(payload, false);

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(3000)) {
    return masterError_("Sistem sedang memproses master data lain. Coba lagi sebentar.");
  }

  try {
    var sheet = ensureMenuMasterColumns_();
    var headerMap = getHeaderMap_(sheet);

    // Cek duplikasi nama menu (hanya untuk menu yang masih aktif)
    var existingMenus = readSheetAsObjects_("Menu");
    var nameLower = data.menu_name.toLowerCase();
    var duplicateName = existingMenus.some(function(m) {
      return String(m.menu_name || "").trim().toLowerCase() === nameLower
        && String(m.status || "").trim().toLowerCase() !== "deleted";
    });
    if (duplicateName) {
      return masterError_("Nama menu \"" + data.menu_name + "\" sudah digunakan. Gunakan nama lain.");
    }

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
      bonus_sales_lc: data.bonus_sales_lc,
      hpp: data.hpp,
      variable_cost_rate: data.variable_cost_rate,
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
  } finally {
    lock.releaseLock();
  }
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
    bonus_sales_lc: data.bonus_sales_lc,
    hpp: data.hpp,
    variable_cost_rate: data.variable_cost_rate,
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

function bulkUpdateMenuProfitability_(payload) {
  var request = payload || {};
  var items = Array.isArray(request.items) ? request.items : [];
  var changedBy = getMasterChangedBy_(request);

  if (items.length === 0) {
    return { ok: false, success: false, error: "items wajib diisi.", message: "items wajib diisi." };
  }

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    return createLockBusyResponse_("Sistem sedang memproses update menu lain. Coba lagi sebentar.");
  }

  try {
    var sheet = ensureMenuMasterColumns_();
    var headerMap = getHeaderMap_(sheet);
    var values = sheet.getDataRange().getValues();
    var headers = values.length > 0
      ? values[0].map(function (header) { return String(header).trim(); })
      : [];
    var rowIndexByMenuId = {};
    var itemByMenuId = {};
    var updated = [];
    var skipped = [];
    var now = toJakartaIsoString_(new Date());

    values.slice(1).forEach(function (row, index) {
      var menuId = String(row[(headerMap.menu_id || 1) - 1] || "").trim();
      if (menuId) {
        rowIndexByMenuId[menuId] = index + 1;
      }
    });

    items.forEach(function (item) {
      var menuId = String(item.menu_id || "").trim();

      if (!menuId) {
        skipped.push({ menu_id: "", reason: "menu_id kosong" });
        return;
      }

      if (rowIndexByMenuId[menuId] === undefined) {
        skipped.push({ menu_id: menuId, reason: "menu tidak ditemukan" });
        return;
      }

      var price = Number(item.price);
      var hpp = Number(item.hpp || 0);
      var variableCostRate = Number(item.variable_cost_rate || 0);
      var bonusSalesLc = Number(item.bonus_sales_lc || 0);

      if (!isFinite(price) || price < 0 ||
          !isFinite(hpp) || hpp < 0 ||
          !isFinite(variableCostRate) || variableCostRate < 0 || variableCostRate > 100 ||
          !isFinite(bonusSalesLc) || bonusSalesLc < 0) {
        skipped.push({ menu_id: menuId, reason: "nilai profit tidak valid" });
        return;
      }

      itemByMenuId[menuId] = {
        price: price,
        hpp: hpp,
        variable_cost_rate: variableCostRate,
        bonus_sales_lc: bonusSalesLc,
      };
    });

    Object.keys(itemByMenuId).forEach(function (menuId) {
      var rowIndex = rowIndexByMenuId[menuId];
      var row = values[rowIndex];
      var item = itemByMenuId[menuId];

      row[headerMap.price - 1] = item.price;
      row[headerMap.hpp - 1] = item.hpp;
      row[headerMap.variable_cost_rate - 1] = item.variable_cost_rate;
      row[headerMap.bonus_sales_lc - 1] = item.bonus_sales_lc;
      row[headerMap.updated_at - 1] = now;

      updated.push({
        menu_id: menuId,
        menu_name: row[headerMap.menu_name - 1],
        category: row[headerMap.category - 1],
        price: item.price,
        hpp: item.hpp,
        variable_cost_rate: item.variable_cost_rate,
        bonus_sales_lc: item.bonus_sales_lc,
      });
    });

    if (updated.length > 0) {
      sheet.getRange(1, 1, values.length, headers.length).setValues(values);

      appendMasterDataAuditLog_({
        entity_type: "menu",
        entity_id: "BULK_MENU_PROFITABILITY",
        entity_name: "Bulk Menu Profitability",
        action_type: "bulk_profit_update",
        old_value: "",
        new_value: {
          updated_count: updated.length,
          skipped_count: skipped.length,
          menu_ids: updated.map(function (item) { return item.menu_id; }),
        },
        changed_by: changedBy,
        note: getMasterNote_(request),
        result: "success",
      });
    }

    return {
      ok: true,
      success: true,
      message: "Profitability menu berhasil diupdate.",
      updated_count: updated.length,
      skipped_count: skipped.length,
      updated: updated,
      skipped: skipped,
    };
  } finally {
    lock.releaseLock();
  }
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

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(3000)) {
    return masterError_("Sistem sedang memproses master data lain. Coba lagi sebentar.");
  }

  try {
    var sheet = ensureInventorySheetColumns_();
    var headerMap = getHeaderMap_(sheet);

    // Cek duplikasi nama item inventory
    var existingItems = readSheetAsObjects_("Inventory");
    var nameLower = data.stock_item_name.toLowerCase();
    var duplicateName = existingItems.some(function(inv) {
      return String(inv.stock_item_name || inv.item_name || "").trim().toLowerCase() === nameLower
        && String(inv.status || "").trim().toLowerCase() !== "deleted";
    });
    if (duplicateName) {
      return masterError_("Nama item inventory \"" + data.stock_item_name + "\" sudah digunakan. Gunakan nama lain.");
    }

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
  } finally {
    lock.releaseLock();
  }
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
    "manager",
    "delete_permanent_" + entityType,
    payload.changed_by || "Manager",
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
        "Delete permanen membutuhkan PIN owner/manager yang valid."
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

function ensureLcMasterSheet_() {
  return ensureSheetWithHeaders_("LcMaster", LC_MASTER_HEADERS);
}

function ensureLcWorkLogsSheet_() {
  var sheet = ensureSheetWithHeaders_("LcWorkLogs", LC_WORK_LOG_HEADERS);
  var lastCol = sheet.getLastColumn();
  if (lastCol > 0) {
    var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) {
      return String(h).trim();
    });
    LC_WORK_LOG_HEADERS.forEach(function (h) {
      if (headers.indexOf(h) === -1) {
        sheet.getRange(1, sheet.getLastColumn() + 1).setValue(h);
        headers.push(h);
      }
    });
  }
  return sheet;
}

function ensureSheetHasHeaders_(sheet, expectedHeaders) {
  var lastCol = sheet.getLastColumn();
  var headers = lastCol > 0
    ? sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) {
        return String(h).trim();
      })
    : [];

  expectedHeaders.forEach(function (header) {
    if (headers.indexOf(header) === -1) {
      sheet.getRange(1, sheet.getLastColumn() + 1).setValue(header);
      headers.push(header);
    }
  });

  return sheet;
}

function ensureLcPayrollHistorySheet_() {
  return ensureSheetHasHeaders_(
    ensureSheetWithHeaders_("LcPayrollHistory", LC_PAYROLL_HISTORY_HEADERS),
    LC_PAYROLL_HISTORY_HEADERS
  );
}

function ensureLcSalesBonusLogsSheet_() {
  return ensureSheetHasHeaders_(
    ensureSheetWithHeaders_("LcSalesBonusLogs", LC_SALES_BONUS_LOG_HEADERS),
    LC_SALES_BONUS_LOG_HEADERS
  );
}

function ensureLcCashAdvancesSheet_() {
  return ensureSheetHasHeaders_(
    ensureSheetWithHeaders_("LcCashAdvances", LC_CASH_ADVANCES_HEADERS),
    LC_CASH_ADVANCES_HEADERS
  );
}

function ensurePettyCashLedgerSheet_() {
  return ensureSheetHasHeaders_(
    ensureSheetWithHeaders_("PettyCashLedger", PETTY_CASH_LEDGER_HEADERS),
    PETTY_CASH_LEDGER_HEADERS
  );
}

function ensureLcFinanceFoundation_() {
  ensureLcSalesBonusLogsSheet_();
  ensureLcCashAdvancesSheet_();
  ensurePettyCashLedgerSheet_();
  ensureLcPayrollHistorySheet_();
}

function ensurePromoMasterSheet_() {
  return ensureSheetWithHeaders_("PromoMaster", PROMO_MASTER_HEADERS);
}

function getLcMasterList_() {
  ensureLcMasterSheet_();
  return {
    ok: true,
    success: true,
    lcs: readSheetAsObjects_("LcMaster"),
  };
}

function validateLcMasterPayload_(payload, isUpdate) {
  var lcName = String(payload.lc_name || "").trim();
  var ratePerRoom = Number(payload.rate_per_room);
  var status = normalizeMasterStatus_(payload.status, ["active", "inactive"], "active");
  var availability = normalizeMasterStatus_(payload.availability, ["available", "busy"], "available");

  if (isUpdate && !String(payload.lc_id || "").trim()) {
    masterError_("lc_id wajib diisi.");
  }

  if (!lcName) {
    masterError_("Nama LC wajib diisi.");
  }

  if (isNaN(ratePerRoom) || ratePerRoom < 0) {
    masterError_("Tarif LC wajib angka 0 atau lebih.");
  }

  return {
    lc_name: lcName,
    rate_per_room: ratePerRoom,
    status: status,
    availability: availability,
  };
}

function saveLcMaster_(payload) {
  var data = validateLcMasterPayload_(payload, false);

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(3000)) {
    return masterError_("Sistem sedang memproses master data lain. Coba lagi sebentar.");
  }

  try {
    var sheet = ensureLcMasterSheet_();
    var headerMap = getHeaderMap_(sheet);
    var now = toJakartaIsoString_(new Date());

    // Cek duplikasi nama LC
    var existingLcs = readSheetAsObjects_("LcMaster");
    var nameLower = data.lc_name.toLowerCase();
    var duplicateName = existingLcs.some(function(lc) {
      return String(lc.lc_name || "").trim().toLowerCase() === nameLower
        && String(lc.status || "").trim().toLowerCase() !== "deleted";
    });
    if (duplicateName) {
      return masterError_("Nama LC \"" + data.lc_name + "\" sudah terdaftar. Gunakan nama lain.");
    }

    var lcId = generateSequentialId_(sheet, headerMap, "lc_id", "LC");
    var lc = {
      lc_id: lcId,
      lc_name: data.lc_name,
      rate_per_room: data.rate_per_room,
      status: data.status,
      availability: data.availability,
      updated_at: now,
    };

    appendObjectRow_(sheet, lc);
    var savedLc = getLcMasterRow_(sheet, getHeaderMap_(sheet), sheet.getLastRow());

    appendMasterDataAuditLog_({
      entity_type: "lc",
      entity_id: savedLc.lc_id,
      entity_name: savedLc.lc_name,
      action_type: "create",
      old_value_json: "",
      new_value_json: JSON.stringify(savedLc),
      changed_by: getMasterChangedBy_(payload),
      note: getMasterNote_(payload),
      result: "success",
    });

    return masterSuccessResponse_("Data LC berhasil disimpan.", savedLc);
  } finally {
    lock.releaseLock();
  }
}

function getLcMasterRow_(sheet, headerMap, rowNumber) {
  return getRowObject_(sheet, headerMap, rowNumber);
}

function updateLcMaster_(payload) {
  var lcId = String(payload.lc_id || "").trim();
  var data = validateLcMasterPayload_(payload, true);
  var sheet = ensureLcMasterSheet_();
  var headerMap = getHeaderMap_(sheet);
  var rowNumber = findRowByValue_(sheet, headerMap, "lc_id", lcId);

  if (!rowNumber) {
    masterError_("LC tidak ditemukan.");
  }
  
  var currentLc = getLcMasterRow_(sheet, headerMap, rowNumber);
  var now = toJakartaIsoString_(new Date());
  
  var updatedFields = {
    lc_name: data.lc_name,
    rate_per_room: data.rate_per_room,
    status: data.status,
    availability: payload.availability || currentLc.availability,
    updated_at: now,
  };

  setRowValues_(sheet, headerMap, rowNumber, updatedFields);
  var updatedLc = getLcMasterRow_(sheet, headerMap, rowNumber);

  appendMasterDataAuditLog_({
    entity_type: "lc",
    entity_id: updatedLc.lc_id,
    entity_name: updatedLc.lc_name,
    action_type: "update",
    old_value_json: JSON.stringify(currentLc),
    new_value_json: JSON.stringify(updatedLc),
    changed_by: getMasterChangedBy_(payload),
    note: getMasterNote_(payload),
    result: "success",
  });

  return masterSuccessResponse_("Data LC berhasil diperbarui.", updatedLc);
}

function deleteLcMaster_(payload) {
  var lcId = String(payload.lc_id || "").trim();

  if (!lcId) {
    return { ok: false, success: false, error: "lc_id wajib diisi." };
  }

  var authResult = authorizeAdminPinForMasterDelete_(payload, "lc", lcId);

  if (!authResult.ok) {
    return authResult.response;
  }

  var changedBy = getMasterChangedBy_(payload);
  var sheet = ensureLcMasterSheet_();
  var headerMap = getHeaderMap_(sheet);
  var rowNumber = findRowByValue_(sheet, headerMap, "lc_id", lcId);

  if (!rowNumber) {
    return { ok: false, success: false, error: "LC tidak ditemukan." };
  }
  
  var lc = getLcMasterRow_(sheet, headerMap, rowNumber);

  ensureLcWorkLogsSheet_();
  var workLogs = readSheetAsObjects_("LcWorkLogs");
  var hasHistory = false;
  for (var i = 0; i < workLogs.length; i++) {
    if (String(workLogs[i].lc_id || "").trim() === lcId) {
      hasHistory = true;
      break;
    }
  }

  if (hasHistory) {
    appendMasterDataAuditLog_({
      entity_type: "lc",
      entity_id: lcId,
      entity_name: lc.lc_name,
      action_type: "delete_blocked",
      old_value_json: JSON.stringify(lc),
      new_value_json: "",
      changed_by: changedBy,
      note: "Delete blocked: LC has work history.",
      result: "blocked",
      block_reason: "LC memiliki riwayat kerja di LcWorkLogs.",
    });
    return {
      ok: false,
      success: false,
      error: "LC tidak bisa dihapus karena sudah memiliki riwayat kerja.",
      block_reason: "LC memiliki riwayat kerja.",
    };
  }

  sheet.deleteRow(rowNumber);

  appendMasterDataAuditLog_({
    entity_type: "lc",
    entity_id: lcId,
    entity_name: lc.lc_name,
    action_type: "delete_permanent",
    old_value_json: JSON.stringify(lc),
    new_value_json: "",
    changed_by: changedBy,
    note: "Deleted permanently.",
    result: "success",
  });

  return {
    ok: true,
    success: true,
    message: "LC berhasil dihapus secara permanen.",
  };
}

function appendLcWorkLog_(log) {
  var sheet = ensureLcWorkLogsSheet_();
  appendObjectRow_(sheet, log);
}

function normalizeLcDurationMinutes_(value, defaultDurationMinutes) {
  var fallback = Math.max(1, Math.round(Number(defaultDurationMinutes) || 60));

  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  var durationMinutes = Math.round(Number(value));

  if (!isFinite(durationMinutes) || durationMinutes <= 0) {
    return fallback;
  }

  return durationMinutes;
}

function calculateLcRateForDuration_(durationMinutes, ratePerHour) {
  var safeRatePerHour = Number(ratePerHour) || 0;
  var safeDurationMinutes = normalizeLcDurationMinutes_(durationMinutes, 60);

  return Math.ceil(safeDurationMinutes / 60) * safeRatePerHour;
}

function parseLcAssignments_(request, defaultDurationMinutes) {
  var payload = request || {};
  var rawAssignments = payload.lc_assignments;
  var assignments = [];

  if (typeof rawAssignments === "string" && String(rawAssignments || "").trim()) {
    try {
      rawAssignments = JSON.parse(rawAssignments);
    } catch (err) {
      rawAssignments = null;
    }
  }

  if (Array.isArray(rawAssignments)) {
    rawAssignments.forEach(function (assignment) {
      var lcId = String(assignment && assignment.lc_id || assignment && assignment.id || "").trim();

      if (!lcId) {
        return;
      }

      assignments.push({
        lc_id: lcId,
        duration_minutes: normalizeLcDurationMinutes_(assignment.duration_minutes, defaultDurationMinutes),
      });
    });
  }

  if (assignments.length === 0) {
    String(payload.lc_ids || "").split(",").forEach(function (rawId) {
      var lcId = String(rawId || "").trim();

      if (!lcId) {
        return;
      }

      assignments.push({
        lc_id: lcId,
        duration_minutes: normalizeLcDurationMinutes_("", defaultDurationMinutes),
      });
    });
  }

  return assignments;
}

function serializeLcAssignments_(assignments) {
  if (!Array.isArray(assignments) || assignments.length === 0) {
    return "";
  }

  return JSON.stringify(assignments.map(function (assignment) {
    return {
      lc_id: String(assignment.lc_id || "").trim(),
      duration_minutes: normalizeLcDurationMinutes_(assignment.duration_minutes, 60),
    };
  }).filter(function (assignment) {
    return !!assignment.lc_id;
  }));
}

function getLcIdsFromAssignments_(assignments) {
  if (!Array.isArray(assignments) || assignments.length === 0) {
    return "";
  }

  return assignments.map(function (assignment) {
    return String(assignment.lc_id || "").trim();
  }).filter(Boolean).join(",");
}

function inferLcWorkLogDurationMinutes_(log) {
  var explicitDuration = Number(log.duration_minutes);

  if (isFinite(explicitDuration) && explicitDuration > 0) {
    return Math.round(explicitDuration);
  }

  var ratePerHour = Number(log.rate_per_hour) || 0;
  var totalRate = Number(log.rate) || 0;

  if (ratePerHour > 0 && totalRate > 0) {
    return Math.ceil(totalRate / ratePerHour) * 60;
  }

  if (log.created_at && log.closed_at) {
    return calculateDurationMinutes_(log.created_at, log.closed_at);
  }

  return 0;
}

function resolveLcClosedAtByDuration_(startTime, durationMinutes, fallbackEndTime) {
  if (startTime && Number(durationMinutes) > 0) {
    try {
      return addMinutesToJakartaIsoString_(startTime, durationMinutes);
    } catch (err) {
      Logger.log("Gagal menghitung closed_at LC custom: " + err.message);
    }
  }

  return fallbackEndTime || "";
}

function getLcWorkReports_(period, startDate, endDate) {
  var range = getOperationalDateRangeForPeriod_(period, startDate, endDate);

  if (!range.ok) {
    return range;
  }

  var cache = CacheService.getScriptCache();
  var cacheKey = [
    "lc-work-reports-v2",
    range.period,
    range.startDate || "all",
    range.endDate || "all",
  ].join(":");
  var cachedResponse = cache.get(cacheKey);

  if (cachedResponse) {
    try {
      return JSON.parse(cachedResponse);
    } catch (cacheError) {
      Logger.log("Cache laporan LC tidak valid: " + cacheError.message);
    }
  }

  var logs = readSheetAsObjects_("LcWorkLogs");
  var lcs = readSheetAsObjects_("LcMaster");
  var salesBonusLogs = readSheetAsObjects_("LcSalesBonusLogs");
  var reportsByLcId = {};

  lcs.forEach(function (lc) {
    var lcId = String(lc.lc_id || "").trim();

    if (!lcId) {
      return;
    }

    reportsByLcId[lcId] = {
      lc_id: lc.lc_id,
      lc_name: lc.lc_name,
      rate_per_room: Number(lc.rate_per_room) || 0,
      total_sessions: 0,
      room_earning_total: 0,
      sales_bonus_total: 0,
      gross_earning_total: 0,
      total_earnings: 0,
      logs: [],
      sales_bonus_logs: [],
    };
  });

  logs.forEach(function (log) {
    var createdTime = log.created_at || log.closed_at || "";

    if (!createdTime) {
      return;
    }

    var logOperationalDate = getOperationalDateString_(createdTime);

    if (!matchesOperationalPeriod_(logOperationalDate, range)) {
      return;
    }

    var lcId = String(log.lc_id || "").trim();
    var report = reportsByLcId[lcId];

    if (!report) {
      return;
    }

    var rate = Number(log.rate) || 0;
    report.logs.push({
      log_id: log.log_id,
      session_id: log.session_id,
      lc_id: log.lc_id,
      lc_name: log.lc_name,
      rate: rate,
      duration_minutes: inferLcWorkLogDurationMinutes_(log),
      rate_per_hour: Number(log.rate_per_hour) || 0,
      status: log.status,
      created_at: log.created_at,
      closed_at: log.closed_at,
    });

    if (log.status === "done") {
      report.total_sessions += 1;
      report.room_earning_total += rate;
    }
  });

  salesBonusLogs.forEach(function (bonusLog) {
    var status = String(bonusLog.source_status || "").trim().toLowerCase();
    var operationalDate = resolveLcFinanceOperationalDate_(bonusLog);

    if (
      isLcFinanceRowVoided_(bonusLog) ||
      status === "cancelled" ||
      status === "voided" ||
      !operationalDate ||
      !matchesOperationalPeriod_(operationalDate, range)
    ) {
      return;
    }

    var lcId = String(bonusLog.lc_id || "").trim();
    var report = reportsByLcId[lcId];

    if (!report) {
      return;
    }

    var bonusTotal = Number(bonusLog.bonus_total) || 0;
    report.sales_bonus_total += bonusTotal;
    report.sales_bonus_logs.push({
      bonus_log_id: bonusLog.bonus_log_id || "",
      transaction_id: bonusLog.transaction_id || "",
      order_id: bonusLog.order_id || "",
      menu_id: bonusLog.menu_id || "",
      menu_name: bonusLog.menu_name || "",
      category: bonusLog.category || "",
      quantity: Number(bonusLog.quantity) || 0,
      bonus_per_item: Number(bonusLog.bonus_per_item) || 0,
      bonus_total: bonusTotal,
      source_status: bonusLog.source_status || "",
      operational_date: operationalDate,
      created_at: bonusLog.created_at || "",
    });
  });

  var reports = lcs.map(function (lc) {
    var report = reportsByLcId[String(lc.lc_id || "").trim()];

    if (!report) {
      return null;
    }

    report.sales_bonus_logs.sort(function (first, second) {
      return String(second.created_at || "").localeCompare(String(first.created_at || ""));
    });
    report.gross_earning_total = report.room_earning_total + report.sales_bonus_total;
    report.total_earnings = report.gross_earning_total;

    return report;
  }).filter(function (report) {
    return report && (report.total_sessions > 0 || report.sales_bonus_total > 0);
  });

  var response = {
    ok: true,
    success: true,
    reports: reports,
    range: range,
  };

  try {
    cache.put(cacheKey, JSON.stringify(response), 15);
  } catch (cacheWriteError) {
    Logger.log("Gagal menyimpan cache laporan LC: " + cacheWriteError.message);
  }

  return response;
}

function getLcPayrollHistory_() {
  ensureLcPayrollHistorySheet_();
  var history = readSheetAsObjects_("LcPayrollHistory");
  history.sort(function(a, b) {
    var dateA = new Date(a.processed_at || 0).getTime();
    var dateB = new Date(b.processed_at || 0).getTime();
    return dateB - dateA;
  });
  return {
    ok: true,
    success: true,
    history: history,
  };
}

function getLcPayrollDetails_(payrollId) {
  if (!payrollId) {
    return { ok: false, success: false, error: "payroll_id wajib diisi." };
  }

  ensureLcWorkLogsSheet_();
  var logs = readSheetAsObjects_("LcWorkLogs");
  
  var payrollLogs = logs.filter(function(log) {
    return String(log.payroll_id || "").trim() === String(payrollId).trim();
  });

  // Grouping per LC untuk summary
  var lcGroups = {};
  payrollLogs.forEach(function(log) {
    var lcId = String(log.lc_id || "").trim();
    if (!lcId) return;

    if (!lcGroups[lcId]) {
      lcGroups[lcId] = {
        lc_id: lcId,
        lc_name: log.lc_name || ("LC " + lcId),
        rate_per_room: Number(log.rate) || 175000, // fallback/tarif sesi itu
        total_sessions: 0,
        total_earnings: 0,
        logs: []
      };
    }
    lcGroups[lcId].total_sessions++;
    lcGroups[lcId].total_earnings += (Number(log.rate) || 0);
    lcGroups[lcId].logs.push({
      log_id: log.log_id,
      session_id: log.session_id,
      rate: Number(log.rate) || 0,
      duration_minutes: inferLcWorkLogDurationMinutes_(log),
      rate_per_hour: Number(log.rate_per_hour) || 0,
      created_at: log.created_at,
      closed_at: log.closed_at
    });
  });

  return {
    ok: true,
    success: true,
    payroll_id: payrollId,
    details: Object.values(lcGroups)
  };
}

function generateLcFinanceId_(prefix) {
  return prefix + "-" + Utilities.formatDate(new Date(), "Asia/Jakarta", "yyyyMMdd-HHmmss") + "-" + Math.floor(Math.random() * 1000);
}

function normalizeLcFinanceOperationalDate_(value) {
  var normalized = normalizeJakartaDateString_(value);
  return normalized || getCurrentOperationalDateString_();
}

function resolveLcFinanceOperationalDate_(row) {
  var direct = normalizeJakartaDateString_(row.operational_date);
  if (direct) {
    return direct;
  }

  return getOperationalDateString_(row.created_at || row.deducted_at || row.voided_at || "");
}

function isLcFinanceRowVoided_(row) {
  return !!String(row.voided_at || row.cancelled_at || "").trim();
}

function getLatestPettyCashBalance_() {
  ensurePettyCashLedgerSheet_();
  var rows = readSheetAsObjects_("PettyCashLedger");
  var latestBalance = 0;

  rows.forEach(function (row) {
    if (!String(row.voided_at || "").trim() && row.balance_after !== "" && row.balance_after !== null) {
      latestBalance = Number(row.balance_after) || 0;
    }
  });

  return latestBalance;
}

function appendPettyCashLedgerEntry_(entry) {
  var sheet = ensurePettyCashLedgerSheet_();
  var entryType = String(entry.entry_type || "").trim().toLowerCase();
  var amount = Number(entry.amount || entry.cash_out_amount || entry.cash_in_amount);
  var previousBalance = getLatestPettyCashBalance_();
  var cashIn = entryType === "cash_in" ? amount : 0;
  var cashOut = entryType === "cash_out" ? amount : 0;
  var ledger = {
    ledger_id: entry.ledger_id || generateLcFinanceId_("PETTY"),
    operational_date: normalizeLcFinanceOperationalDate_(entry.operational_date),
    entry_type: entryType,
    category: entry.category || "manual",
    reference_type: entry.reference_type || "manual",
    reference_id: entry.reference_id || "",
    lc_id: entry.lc_id || "",
    lc_name: entry.lc_name || "",
    cash_in_amount: cashIn,
    cash_out_amount: cashOut,
    balance_after: previousBalance + cashIn - cashOut,
    cashier_name: entry.cashier_name || "Kasir",
    note: entry.note || "",
    created_at: toJakartaIsoString_(new Date()),
    voided_at: "",
    void_reason: "",
  };

  appendObjectRow_(sheet, ledger);
  return ledger;
}

function getLcMasterById_(lcId) {
  var targetId = String(lcId || "").trim();
  if (!targetId) {
    return null;
  }

  ensureLcMasterSheet_();
  return readSheetAsObjects_("LcMaster").find(function (lc) {
    return String(lc.lc_id || "").trim() === targetId;
  }) || null;
}

function filterLcFinanceRowsByPeriod_(rows, periodResult) {
  return rows.filter(function (row) {
    var operationalDate = resolveLcFinanceOperationalDate_(row);
    return operationalDate && matchesOperationalPeriod_(operationalDate, periodResult);
  });
}

function getPendingLcSalesBonusRows_(range) {
  ensureLcSalesBonusLogsSheet_();
  return readSheetAsObjects_("LcSalesBonusLogs").map(function (row, index) {
    row.__row_number = index + 2;
    return row;
  }).filter(function (row) {
    var status = String(row.source_status || "").trim().toLowerCase();
    var isUnpaid = !String(row.payroll_id || "").trim();
    return isUnpaid &&
      !isLcFinanceRowVoided_(row) &&
      status !== "cancelled" &&
      status !== "voided" &&
      matchesOperationalPeriod_(resolveLcFinanceOperationalDate_(row), range);
  });
}

function getDeductibleLcCashAdvanceRows_(range) {
  ensureLcCashAdvancesSheet_();
  return readSheetAsObjects_("LcCashAdvances").map(function (row, index) {
    row.__row_number = index + 2;
    return row;
  }).filter(function (row) {
    var status = String(row.status || "open").trim().toLowerCase();
    var operationalDate = resolveLcFinanceOperationalDate_(row);
    var withinCutoff = range.period === "all" || !range.endDate || operationalDate <= range.endDate;
    return !String(row.payroll_id || "").trim() &&
      !isLcFinanceRowVoided_(row) &&
      status === "open" &&
      operationalDate &&
      withinCutoff;
  });
}

function buildLcPayrollFinanceGroups_(range) {
  var groups = {};

  getPendingLcSalesBonusRows_(range).forEach(function (row) {
    var lcId = String(row.lc_id || "").trim();
    if (!lcId) {
      return;
    }
    if (!groups[lcId]) {
      groups[lcId] = { sales_bonus_total: 0, cash_advance_deducted: 0, bonus_rows: [], advance_rows: [] };
    }
    groups[lcId].sales_bonus_total += Number(row.bonus_total) || 0;
    groups[lcId].bonus_rows.push(row);
  });

  getDeductibleLcCashAdvanceRows_(range).forEach(function (row) {
    var lcId = String(row.lc_id || "").trim();
    if (!lcId) {
      return;
    }
    if (!groups[lcId]) {
      groups[lcId] = { sales_bonus_total: 0, cash_advance_deducted: 0, bonus_rows: [], advance_rows: [] };
    }
    groups[lcId].cash_advance_deducted += Number(row.amount) || 0;
    groups[lcId].advance_rows.push(row);
  });

  return groups;
}

function calculateDeductibleCashAdvanceTotal_(advanceRows, grossLimit) {
  var remaining = Math.max(0, Number(grossLimit) || 0);
  var deducted = 0;

  (advanceRows || []).slice().sort(function (a, b) {
    return String(a.created_at || "").localeCompare(String(b.created_at || ""));
  }).forEach(function (row) {
    var amount = Number(row.amount) || 0;
    if (amount > 0 && amount <= remaining) {
      deducted += amount;
      remaining -= amount;
    }
  });

  return deducted;
}

function getLcFinanceSummary_(period, startDate, endDate) {
  var periodResult = parseTransactionPeriod_(period || "today", startDate || "", endDate || "");
  if (!periodResult.ok) {
    return periodResult;
  }

  ensureLcFinanceFoundation_();

  var salesBonusLogs = filterLcFinanceRowsByPeriod_(
    readSheetAsObjects_("LcSalesBonusLogs"),
    periodResult
  ).filter(function (row) {
    return !isLcFinanceRowVoided_(row);
  });
  var cashAdvances = filterLcFinanceRowsByPeriod_(
    readSheetAsObjects_("LcCashAdvances"),
    periodResult
  );
  var pettyCashLedger = filterLcFinanceRowsByPeriod_(
    readSheetAsObjects_("PettyCashLedger"),
    periodResult
  ).filter(function (row) {
    return !String(row.voided_at || "").trim();
  });

  var summary = {
    sales_bonus_total: salesBonusLogs.reduce(function (sum, row) { return sum + (Number(row.bonus_total) || 0); }, 0),
    cash_advance_total: cashAdvances.filter(function (row) {
      return String(row.status || "").trim().toLowerCase() !== "cancelled";
    }).reduce(function (sum, row) { return sum + (Number(row.amount) || 0); }, 0),
    petty_cash_in_total: pettyCashLedger.reduce(function (sum, row) { return sum + (Number(row.cash_in_amount) || 0); }, 0),
    petty_cash_out_total: pettyCashLedger.reduce(function (sum, row) { return sum + (Number(row.cash_out_amount) || 0); }, 0),
    petty_cash_balance: getLatestPettyCashBalance_(),
  };

  return {
    ok: true,
    success: true,
    range: periodResult,
    summary: summary,
    sales_bonus_logs: salesBonusLogs,
    cash_advances: cashAdvances,
    petty_cash_ledger: pettyCashLedger,
  };
}

function getPendingLcPayroll_(startDate, endDate) {
  ensureLcPayrollHistorySheet_();
  ensureLcWorkLogsSheet_();

  var history = readSheetAsObjects_("LcPayrollHistory");
  var suggestedStartDate = "";
  var suggestedEndDate = "";

  if (history.length > 0) {
    var sortedHistory = history.slice().sort(function(a, b) {
      return String(b.end_date || "").localeCompare(String(a.end_date || ""));
    });
    var lastPayroll = sortedHistory[0];
    suggestedStartDate = addDaysToOperationalDateString_(lastPayroll.end_date, 1);
    suggestedEndDate = addDaysToOperationalDateString_(suggestedStartDate, 13);
  } else {
    var activeOpDate = getCurrentOperationalDateString_();
    suggestedStartDate = getOperationalMonthStartDateString_(activeOpDate);
    suggestedEndDate = activeOpDate;
  }

  var startVal = startDate || suggestedStartDate;
  var endVal = endDate || suggestedEndDate;

  var range = {
    period: "custom",
    startDate: startVal,
    endDate: endVal
  };

  var logs = readSheetAsObjects_("LcWorkLogs");
  var lcs = readSheetAsObjects_("LcMaster");
  var financeGroups = buildLcPayrollFinanceGroups_(range);

  var filteredLogs = logs.filter(function(log) {
    var status = String(log.status || "").trim().toLowerCase();
    if (status !== "done") {
      return false;
    }
    if (log.payroll_id && String(log.payroll_id).trim() !== "") {
      return false;
    }
    var effectiveTime = log.closed_at || log.created_at || "";
    if (!effectiveTime) {
      return false;
    }
    var logOperationalDate = getOperationalDateString_(effectiveTime);
    return matchesOperationalPeriod_(logOperationalDate, range);
  });

  var lcById = {};
  lcs.forEach(function (lc) {
    lcById[String(lc.lc_id || "").trim()] = lc;
  });

  var reportLcIds = {};
  filteredLogs.forEach(function (log) {
    if (String(log.lc_id || "").trim()) {
      reportLcIds[String(log.lc_id || "").trim()] = true;
    }
  });
  Object.keys(financeGroups).forEach(function (lcId) {
    reportLcIds[lcId] = true;
  });

  var reports = Object.keys(reportLcIds).map(function(lcId) {
    var lc = lcById[lcId] || { lc_id: lcId, lc_name: "LC " + lcId, rate_per_room: 0 };
    var lcLogs = filteredLogs.filter(function(log) {
      return String(log.lc_id || "").trim() === String(lc.lc_id || "").trim();
    });

    var roomEarningTotal = lcLogs.reduce(function(sum, log) {
      return sum + (Number(log.rate) || 0);
    }, 0);
    var finance = financeGroups[lcId] || { sales_bonus_total: 0, cash_advance_deducted: 0 };
    var salesBonusTotal = Number(finance.sales_bonus_total) || 0;
    var grossEarningTotal = roomEarningTotal + salesBonusTotal;
    var cashAdvanceOutstanding = Number(finance.cash_advance_deducted) || 0;
    var cashAdvanceDeducted = calculateDeductibleCashAdvanceTotal_(finance.advance_rows || [], grossEarningTotal);
    var netPayoutTotal = grossEarningTotal - cashAdvanceDeducted;

    return {
      lc_id: lc.lc_id,
      lc_name: lc.lc_name,
      rate_per_room: Number(lc.rate_per_room) || 0,
      total_sessions: lcLogs.length,
      room_earning_total: roomEarningTotal,
      sales_bonus_total: salesBonusTotal,
      cash_advance_deducted: cashAdvanceDeducted,
      cash_advance_outstanding: cashAdvanceOutstanding - cashAdvanceDeducted,
      gross_earning_total: grossEarningTotal,
      net_payout_total: netPayoutTotal,
      total_earnings: netPayoutTotal,
    };
  }).filter(function(report) {
    return report.total_sessions > 0 ||
      report.sales_bonus_total > 0 ||
      report.cash_advance_deducted > 0 ||
      report.cash_advance_outstanding > 0;
  });

  var summaryRoomEarningTotal = reports.reduce(function(sum, r) {
    return sum + r.room_earning_total;
  }, 0);

  var summarySalesBonusTotal = reports.reduce(function(sum, r) {
    return sum + r.sales_bonus_total;
  }, 0);

  var summaryCashAdvanceDeducted = reports.reduce(function(sum, r) {
    return sum + r.cash_advance_deducted;
  }, 0);

  var summaryTotalAmount = reports.reduce(function(sum, r) {
    return sum + r.net_payout_total;
  }, 0);

  var summaryTotalSessions = reports.reduce(function(sum, r) {
    return sum + r.total_sessions;
  }, 0);

  return {
    ok: true,
    success: true,
    reports: reports,
    suggested_range: {
      startDate: suggestedStartDate,
      endDate: suggestedEndDate,
    },
    current_range: {
      startDate: startVal,
      endDate: endVal,
    },
    summary: {
      total_amount: summaryTotalAmount,
      room_earning_total: summaryRoomEarningTotal,
      sales_bonus_total: summarySalesBonusTotal,
      cash_advance_deducted: summaryCashAdvanceDeducted,
      gross_earning_total: summaryRoomEarningTotal + summarySalesBonusTotal,
      net_payout_total: summaryTotalAmount,
      total_sessions: summaryTotalSessions,
      total_lcs: reports.length,
    }
  };
}

function processLcPayroll_(payload) {
  var lock = LockService.getScriptLock();
  try {
    if (!lock.tryLock(10000)) {
      return { ok: false, error: "Sistem sedang sibuk. Silakan coba beberapa saat lagi." };
    }

    var startDate = String(payload.start_date || "").trim();
    var endDate = String(payload.end_date || "").trim();
    var cashierName = String(payload.cashier_name || "Kasir").trim() || "Kasir";

    if (!startDate || !endDate) {
      return { ok: false, error: "Tanggal mulai dan tanggal akhir wajib ditentukan." };
    }

    // Cek duplikasi: apakah periode ini sudah pernah di-payroll?
    ensureLcPayrollHistorySheet_();
    var existingPayrolls = readSheetAsObjects_("LcPayrollHistory");
    var duplicatePayroll = null;
    for (var p = 0; p < existingPayrolls.length; p++) {
      var prev = existingPayrolls[p];
      var prevStart = normalizeCompareDate_(prev.start_date);
      var prevEnd = normalizeCompareDate_(prev.end_date);
      var targetStart = normalizeCompareDate_(startDate);
      var targetEnd = normalizeCompareDate_(endDate);
      if (prevStart === targetStart && prevEnd === targetEnd) {
        duplicatePayroll = prev;
        break;
      }
    }
    if (duplicatePayroll) {
      return {
        ok: false,
        error: "Payroll untuk periode " + startDate + " s/d " + endDate +
          " sudah pernah diproses (ID: " + duplicatePayroll.payroll_id +
          ", diproses oleh: " + (duplicatePayroll.processed_by || "?") +
          "). Cek riwayat payroll jika terjadi kesalahan.",
      };
    }

    var lcWorkLogsSheet = ensureLcWorkLogsSheet_();
    var lcWorkLogsHeaders = getHeaderMap_(lcWorkLogsSheet);
    var salesBonusSheet = ensureLcSalesBonusLogsSheet_();
    var salesBonusHeaders = getHeaderMap_(salesBonusSheet);
    var cashAdvanceSheet = ensureLcCashAdvancesSheet_();
    var cashAdvanceHeaders = getHeaderMap_(cashAdvanceSheet);

    var range = {
      period: "custom",
      startDate: startDate,
      endDate: endDate
    };

    var logs = readSheetAsObjects_("LcWorkLogs");
    
    var matchingLogIndices = [];
    var matchedLogs = [];

    for (var i = 0; i < logs.length; i++) {
      var log = logs[i];
      var status = String(log.status || "").trim().toLowerCase();
      var isUnpaid = !log.payroll_id || String(log.payroll_id).trim() === "";
      var effectiveTime = log.closed_at || log.created_at || "";

      if (status === "done" && isUnpaid && effectiveTime) {
        var logOperationalDate = getOperationalDateString_(effectiveTime);
        if (matchesOperationalPeriod_(logOperationalDate, range)) {
          matchingLogIndices.push(i);
          matchedLogs.push(log);
        }
      }
    }

    var pendingRoomEarningByLc = {};
    matchedLogs.forEach(function (log) {
      var lcId = String(log.lc_id || "").trim();
      pendingRoomEarningByLc[lcId] = (pendingRoomEarningByLc[lcId] || 0) + (Number(log.rate) || 0);
    });

    var financeGroups = buildLcPayrollFinanceGroups_(range);
    var hasProcessableFinanceRows = Object.keys(financeGroups).some(function (lcId) {
      var group = financeGroups[lcId] || {};
      var salesBonusTotal = Number(group.sales_bonus_total) || 0;
      var lcGross = (Number(pendingRoomEarningByLc[lcId]) || 0) + salesBonusTotal;
      return salesBonusTotal > 0 ||
        calculateDeductibleCashAdvanceTotal_(group.advance_rows || [], lcGross) > 0;
    });

    if (matchedLogs.length === 0 && !hasProcessableFinanceRows) {
      return { ok: false, error: "Tidak ada sesi kerja, bonus sales, atau potongan kasbon LC yang bisa diproses pada periode ini." };
    }

    var todayStr = Utilities.formatDate(new Date(), "Asia/Jakarta", "yyyyMMdd");
    var payrollId = "LCPAY-" + todayStr + "-" + Math.floor(Math.random() * 9000 + 1000);

    var uniqueLcIds = {};
    var roomEarningByLc = {};
    var roomEarningTotal = 0;
    var totalSessions = matchedLogs.length;

    matchedLogs.forEach(function(log) {
      var lcId = String(log.lc_id || "").trim();
      var rate = Number(log.rate) || 0;
      uniqueLcIds[lcId] = true;
      roomEarningByLc[lcId] = (roomEarningByLc[lcId] || 0) + rate;
      roomEarningTotal += rate;
    });

    Object.keys(financeGroups).forEach(function (lcId) {
      uniqueLcIds[lcId] = true;
    });

    var totalLcsPaid = Object.keys(uniqueLcIds).length;
    var salesBonusTotal = Object.keys(financeGroups).reduce(function (sum, lcId) {
      return sum + (Number(financeGroups[lcId].sales_bonus_total) || 0);
    }, 0);
    var cashAdvanceDeducted = 0;
    var grossEarningTotal = roomEarningTotal + salesBonusTotal;

    matchingLogIndices.forEach(function(origIdx) {
      var rowNum = origIdx + 2;
      lcWorkLogsSheet.getRange(rowNum, lcWorkLogsHeaders.payroll_id).setValue(payrollId);
    });

    Object.keys(financeGroups).forEach(function (lcId) {
      (financeGroups[lcId].bonus_rows || []).forEach(function (row) {
        salesBonusSheet.getRange(row.__row_number, salesBonusHeaders.payroll_id).setValue(payrollId);
      });

      var lcGross = (Number(roomEarningByLc[lcId]) || 0) + (Number(financeGroups[lcId].sales_bonus_total) || 0);
      var remainingDeduction = lcGross;
      (financeGroups[lcId].advance_rows || []).slice().sort(function (a, b) {
        return String(a.created_at || "").localeCompare(String(b.created_at || ""));
      }).forEach(function (row) {
        var amount = Number(row.amount) || 0;
        if (amount > 0 && amount <= remainingDeduction) {
          cashAdvanceSheet.getRange(row.__row_number, cashAdvanceHeaders.status).setValue("deducted");
          cashAdvanceSheet.getRange(row.__row_number, cashAdvanceHeaders.payroll_id).setValue(payrollId);
          cashAdvanceSheet.getRange(row.__row_number, cashAdvanceHeaders.deducted_at).setValue(toJakartaIsoString_(new Date()));
          remainingDeduction -= amount;
          cashAdvanceDeducted += amount;
        }
      });
    });

    var netPayoutTotal = grossEarningTotal - cashAdvanceDeducted;

    var payoutLedger = null;
    if (netPayoutTotal > 0) {
      payoutLedger = appendPettyCashLedgerEntry_({
        operational_date: getCurrentOperationalDateString_(),
        entry_type: "cash_out",
        category: "lc_payroll",
        reference_type: "lc_payroll",
        reference_id: payrollId,
        amount: netPayoutTotal,
        cashier_name: cashierName,
        note: "Pembayaran payroll LC periode " + startDate + " s/d " + endDate,
      });
    }

    var payrollRecord = {
      payroll_id: payrollId,
      start_date: startDate,
      end_date: endDate,
      total_amount: netPayoutTotal,
      room_earning_total: roomEarningTotal,
      sales_bonus_total: salesBonusTotal,
      cash_advance_deducted: cashAdvanceDeducted,
      gross_earning_total: grossEarningTotal,
      net_payout_total: netPayoutTotal,
      total_sessions: totalSessions,
      total_lcs_paid: totalLcsPaid,
      petty_cash_ledger_id: payoutLedger ? payoutLedger.ledger_id : "",
      status: "processed",
      processed_at: toJakartaIsoString_(new Date()),
      processed_by: cashierName
    };
    
    var historySheet = ensureLcPayrollHistorySheet_();
    appendObjectRow_(historySheet, payrollRecord);

    return {
      ok: true,
      success: true,
      message: "Payroll berhasil diproses.",
      payroll: payrollRecord
    };

  } catch(e) {
    return { ok: false, error: "Gagal memproses payroll: " + e.message };
  } finally {
    lock.releaseLock();
  }
}

function createLcCashAdvance_(payload) {
  var lock = LockService.getScriptLock();
  var lockAcquired = false;
  try {
    if (!lock.tryLock(10000)) {
      return createLockBusyResponse_();
    }
    lockAcquired = true;

    ensureLcFinanceFoundation_();

    var request = payload || {};
    var lcId = String(request.lc_id || "").trim();
    var lc = getLcMasterById_(lcId);
    var amount = Number(request.amount);
    var cashierName = String(request.cashier_name || "Kasir").trim() || "Kasir";
    var operationalDate = normalizeLcFinanceOperationalDate_(request.operational_date);
    var note = String(request.note || "").trim();

    if (!lc) {
      return { ok: false, success: false, error: "LC tidak ditemukan.", message: "LC tidak ditemukan." };
    }

    if (!isFinite(amount) || amount <= 0) {
      return { ok: false, success: false, error: "Nominal kasbon wajib lebih dari 0.", message: "Nominal kasbon wajib lebih dari 0." };
    }

    var advanceId = generateLcFinanceId_("LCADV");
    var ledger = appendPettyCashLedgerEntry_({
      operational_date: operationalDate,
      entry_type: "cash_out",
      category: "lc_cash_advance",
      reference_type: "lc_cash_advance",
      reference_id: advanceId,
      lc_id: lc.lc_id,
      lc_name: lc.lc_name,
      amount: amount,
      cashier_name: cashierName,
      note: note,
    });

    var advance = {
      cash_advance_id: advanceId,
      operational_date: operationalDate,
      lc_id: lc.lc_id,
      lc_name: lc.lc_name,
      amount: amount,
      status: "open",
      requested_by: String(request.requested_by || lc.lc_name || "").trim(),
      cashier_name: cashierName,
      petty_cash_ledger_id: ledger.ledger_id,
      payroll_id: "",
      note: note,
      created_at: toJakartaIsoString_(new Date()),
      deducted_at: "",
      cancelled_at: "",
      cancel_reason: "",
    };

    appendObjectRow_(ensureLcCashAdvancesSheet_(), advance);

    return {
      ok: true,
      success: true,
      message: "Kasbon LC berhasil dicatat dan petty cash otomatis keluar.",
      cash_advance: advance,
      petty_cash_entry: ledger,
    };
  } catch (error) {
    return { ok: false, success: false, error: "Gagal mencatat kasbon LC: " + error.message, message: "Gagal mencatat kasbon LC: " + error.message };
  } finally {
    if (lockAcquired) {
      lock.releaseLock();
    }
  }
}

function recordPettyCashEntry_(payload) {
  var lock = LockService.getScriptLock();
  var lockAcquired = false;
  try {
    if (!lock.tryLock(10000)) {
      return createLockBusyResponse_();
    }
    lockAcquired = true;

    ensureLcFinanceFoundation_();

    var request = payload || {};
    var entryType = String(request.entry_type || "").trim().toLowerCase();
    var amount = Number(request.amount);
    var cashierName = String(request.cashier_name || "Kasir").trim() || "Kasir";

    if (["cash_in", "cash_out"].indexOf(entryType) === -1) {
      return { ok: false, success: false, error: "Tipe petty cash wajib cash_in atau cash_out.", message: "Tipe petty cash wajib cash_in atau cash_out." };
    }

    if (!isFinite(amount) || amount <= 0) {
      return { ok: false, success: false, error: "Nominal petty cash wajib lebih dari 0.", message: "Nominal petty cash wajib lebih dari 0." };
    }

    var ledger = appendPettyCashLedgerEntry_({
      operational_date: normalizeLcFinanceOperationalDate_(request.operational_date),
      entry_type: entryType,
      category: String(request.category || "manual").trim() || "manual",
      reference_type: "manual",
      reference_id: "",
      amount: amount,
      cashier_name: cashierName,
      note: String(request.note || "").trim(),
    });

    return {
      ok: true,
      success: true,
      message: "Mutasi petty cash berhasil dicatat.",
      petty_cash_entry: ledger,
    };
  } catch (error) {
    return { ok: false, success: false, error: "Gagal mencatat petty cash: " + error.message, message: "Gagal mencatat petty cash: " + error.message };
  } finally {
    if (lockAcquired) {
      lock.releaseLock();
    }
  }
}

function createLcSalesBonusLog_(payload) {
  var lock = LockService.getScriptLock();
  var lockAcquired = false;
  try {
    if (!lock.tryLock(10000)) {
      return createLockBusyResponse_();
    }
    lockAcquired = true;

    ensureLcFinanceFoundation_();

    var request = payload || {};
    var lcId = String(request.lc_id || "").trim();
    var lc = getLcMasterById_(lcId);
    var quantity = Number(request.quantity || 1);
    var bonusPerItem = Number(request.bonus_per_item);
    var cashierName = String(request.cashier_name || request.created_by || "Kasir").trim() || "Kasir";

    if (!lc) {
      return { ok: false, success: false, error: "LC tidak ditemukan.", message: "LC tidak ditemukan." };
    }

    if (!isFinite(quantity) || quantity <= 0) {
      return { ok: false, success: false, error: "Quantity bonus wajib lebih dari 0.", message: "Quantity bonus wajib lebih dari 0." };
    }

    if (!isFinite(bonusPerItem) || bonusPerItem < 0) {
      return { ok: false, success: false, error: "Bonus per item wajib angka 0 atau lebih.", message: "Bonus per item wajib angka 0 atau lebih." };
    }

    var bonusLog = {
      bonus_log_id: generateLcFinanceId_("LCBONUS"),
      operational_date: normalizeLcFinanceOperationalDate_(request.operational_date),
      transaction_id: String(request.transaction_id || "").trim(),
      order_id: String(request.order_id || "").trim(),
      menu_id: String(request.menu_id || "").trim(),
      menu_name: String(request.menu_name || "").trim(),
      category: String(request.category || "").trim(),
      lc_id: lc.lc_id,
      lc_name: lc.lc_name,
      quantity: quantity,
      bonus_per_item: bonusPerItem,
      bonus_total: quantity * bonusPerItem,
      source_status: String(request.source_status || "manual").trim() || "manual",
      payroll_id: "",
      created_at: toJakartaIsoString_(new Date()),
      created_by: cashierName,
      voided_at: "",
      void_reason: "",
    };

    appendObjectRow_(ensureLcSalesBonusLogsSheet_(), bonusLog);

    return {
      ok: true,
      success: true,
      message: "Bonus sales LC berhasil dicatat.",
      sales_bonus_log: bonusLog,
    };
  } catch (error) {
    return { ok: false, success: false, error: "Gagal mencatat bonus sales LC: " + error.message, message: "Gagal mencatat bonus sales LC: " + error.message };
  } finally {
    if (lockAcquired) {
      lock.releaseLock();
    }
  }
}

function getActiveSessionLcSnapshotsForRoom_(roomId) {
  var sessionResult = findLatestRoomSessionForRoom_(roomId, ["active", "starting", "paid_waiting_start", "closing"]);
  if (!sessionResult || !sessionResult.session) {
    return [];
  }

  var lcIds = String(sessionResult.session.lc_ids || "")
    .split(",")
    .map(function (id) { return String(id || "").trim(); })
    .filter(function (id) { return id && id !== "PENDING"; });

  if (lcIds.length === 0) {
    return [];
  }

  ensureLcMasterSheet_();
  var lcRows = readSheetAsObjects_("LcMaster");
  var lcMap = lcRows.reduce(function (map, lc) {
    map[String(lc.lc_id || "").trim()] = lc;
    return map;
  }, {});

  return lcIds.map(function (lcId) {
    var lc = lcMap[lcId] || {};
    return {
      lc_id: lcId,
      lc_name: lc.lc_name || lcId,
    };
  });
}

function appendAutoLcSalesBonusLogsForFnbOrder_(order, orderItems, cashierName) {
  ensureLcSalesBonusLogsSheet_();

  var activeLcs = getActiveSessionLcSnapshotsForRoom_(order.room_id);
  if (!activeLcs.length) {
    return [];
  }

  var rows = [];
  var createdAt = toJakartaIsoString_(new Date());

  (orderItems || []).forEach(function (item) {
    var bonusPerItem = Number(item.bonus_sales_lc) || 0;
    var quantity = Number(item.quantity) || 0;
    var totalBonus = bonusPerItem * quantity;

    if (totalBonus <= 0) {
      return;
    }

    var baseShare = Math.floor(totalBonus / activeLcs.length);
    var remainder = totalBonus - (baseShare * activeLcs.length);

    activeLcs.forEach(function (lc, index) {
      var lcBonusTotal = baseShare + (index < remainder ? 1 : 0);
      if (lcBonusTotal <= 0) {
        return;
      }

      rows.push({
        bonus_log_id: generateLcFinanceId_("LCBONUS"),
        operational_date: normalizeLcFinanceOperationalDate_(order.created_at),
        transaction_id: "",
        order_id: order.order_id,
        menu_id: item.menu_id,
        menu_name: item.menu_name,
        category: item.category,
        lc_id: lc.lc_id,
        lc_name: lc.lc_name,
        quantity: quantity / activeLcs.length,
        bonus_per_item: bonusPerItem,
        bonus_total: lcBonusTotal,
        source_status: "fnb_order",
        payroll_id: "",
        created_at: createdAt,
        created_by: cashierName || order.cashier_name || "Kasir",
        voided_at: "",
        void_reason: "",
      });
    });
  });

  rows.forEach(function (row) {
    appendObjectRow_(ensureLcSalesBonusLogsSheet_(), row);
  });

  return rows;
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
        lc_total: Number(transaction.lc_total) || 0,
        promo_code: transaction.promo_code || "",
        promo_discount: Number(transaction.promo_discount) || 0,
        grand_total: getTransactionAmount_(transaction),
        fnb_order_ids: transaction.fnb_order_ids || "",
        transaction_type: transaction.transaction_type || "session_checkout",
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
    var type = String(transaction.transaction_type || "").trim().toLowerCase();
    var isMainSession = (type === "" || type === "session_checkout");

    if (isMainSession) {
      summary.total_sessions += 1;
    }
    summary.total_duration_minutes += durationMinutes;
    summary.total_room_revenue += roomRevenue;
    summary.total_fnb_revenue += fnbRevenue;
    summary.total_grand_revenue += grandRevenue;

    if (isPaid) {
      summary.paid_revenue += grandRevenue;
      if (isMainSession) {
        summary.paid_sessions += 1;
      }
    } else {
      summary.unpaid_revenue += grandRevenue;
      if (isMainSession) {
        summary.unpaid_sessions += 1;
      }
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

    if (isMainSession) {
      roomUsage.session_count += 1;
    }
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

  if (normalizedPeriod === "this_month") {
    return "thismonth";
  }

  if (normalizedPeriod === "last_7_days") {
    return "last7days";
  }

  return normalizedPeriod;
}

function getOperationalDateRangeForPeriod_(period, startDate, endDate) {
  var normalizedPeriod = normalizeOperationalPeriodKey_(period);
  var activeOperationalDate = getCurrentOperationalDateString_();

  if (["today", "yesterday", "last7days", "this_week", "last_week", "thismonth", "last_month", "all", "custom"].indexOf(normalizedPeriod) === -1) {
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

  if (normalizedPeriod === "this_week") {
    var weekAnchor = parseOperationalDateAnchor_(activeOperationalDate);
    var weekDay = weekAnchor ? weekAnchor.getUTCDay() : 0;
    var daysFromMonday = weekDay === 0 ? 6 : weekDay - 1;

    return {
      ok: true,
      period: normalizedPeriod,
      startDate: addDaysToOperationalDateString_(activeOperationalDate, -daysFromMonday),
      endDate: activeOperationalDate,
    };
  }

  if (normalizedPeriod === "last_week") {
    var lastWeekAnchor = parseOperationalDateAnchor_(activeOperationalDate);
    var lastWeekDay = lastWeekAnchor ? lastWeekAnchor.getUTCDay() : 0;
    var offsetFromMonday = lastWeekDay === 0 ? 6 : lastWeekDay - 1;
    var thisWeekMonday = addDaysToOperationalDateString_(activeOperationalDate, -offsetFromMonday);

    return {
      ok: true,
      period: normalizedPeriod,
      startDate: addDaysToOperationalDateString_(thisWeekMonday, -7),
      endDate: addDaysToOperationalDateString_(thisWeekMonday, -1),
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

function startSession_(roomId, durationMinutes, options) {
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

  if (bookedDurationMinutes < getMinimumSessionMinutes_(options)) {
    return {
      ok: false,
      error: getMinimumSessionErrorMessage_(options),
    };
  }


  var lock = LockService.getScriptLock();
  if (!lock.tryLock(2000)) {
    return {
      ok: false,
      error: "Sistem sedang memproses booking lain. Coba lagi sebentar.",
    };
  }

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

function prepareRoomSession_(payload) {
  var request = payload || {};
  var roomId = String(request.room_id || "").trim();
  var durationMinutes = Number(request.duration_minutes);
  var cashierName = String(request.cashier_name || "Kasir").trim() || "Kasir";
  var paymentMethod = String(request.payment_method || "").trim().toLowerCase();
  var customerName = String(request.customer_name || "").trim();
  var packageId = String(request.package_id || "").trim();

  if (!roomId) {
    return {
      ok: false,
      success: false,
      error: "room_id wajib diisi.",
    };
  }

  if (!isFinite(durationMinutes) || durationMinutes <= 0 || Math.floor(durationMinutes) !== durationMinutes) {
    return {
      ok: false,
      success: false,
      error: "duration_minutes wajib berupa angka bulat positif.",
    };
  }

  if (durationMinutes < getMinimumSessionMinutes_(request)) {
    return {
      ok: false,
      success: false,
      error: getMinimumSessionErrorMessage_(request),
    };
  }

  if (paymentMethod && !getAllowedPaymentMethods_()[paymentMethod]) {
    return {
      ok: false,
      success: false,
      error: "Metode pembayaran tidak dikenal.",
    };
  }

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(2000)) {
    return {
      ok: false,
      success: false,
      error: "Sistem sedang memproses booking lain. Coba lagi sebentar.",
    };
  }

  try {
    var roomsSheet = ensureRoomsBookingColumns_();
    var roomsHeaderMap = getHeaderMap_(roomsSheet);
    var rowNumber = findRowByValue_(roomsSheet, roomsHeaderMap, "room_id", roomId);

    if (!rowNumber) {
      return {
        ok: false,
        success: false,
        error: "Ruangan tidak ditemukan.",
      };
    }

    var room = getRowObject_(roomsSheet, roomsHeaderMap, rowNumber);
    var status = String(room.status || "").trim().toLowerCase();

    if (status !== "available") {
      return {
        ok: false,
        success: false,
        error: "Ruangan tidak tersedia untuk dibuat booking.",
      };
    }

    var bookingMode = "regular";
    if (packageId) {
      var packagesList = readSheetAsObjects_("PackageMaster");
      var selectedPackage = null;
      for (var i = 0; i < packagesList.length; i++) {
        if (String(packagesList[i].package_id || "").trim() === packageId) {
          selectedPackage = packagesList[i];
          break;
        }
      }
      if (!selectedPackage) {
        return {
          ok: false,
          success: false,
          error: "Paket tidak ditemukan.",
        };
      }
      bookingMode = "package";
      durationMinutes = Number(selectedPackage.duration_minutes) || durationMinutes;
    }

    var requestIdempotencyKey = String(request.idempotency_key || "").trim();
    var activeSession = findLatestRoomSessionForRoom_(roomId, ["starting", "active", "closing"]);

    if (activeSession) {
      if (
        requestIdempotencyKey &&
        String(activeSession.session.idempotency_key || "").trim() === requestIdempotencyKey
      ) {
        return {
          ok: true,
          success: true,
          message: "Booking room sudah pernah disiapkan.",
          room: getRoomFromRow_(roomsSheet, roomsHeaderMap, rowNumber),
          session: activeSession.session,
          idempotent_replay: true,
        };
      }

      return {
        ok: false,
        success: false,
        error: "Room masih memiliki session aktif atau menunggu mulai.",
      };
    }

    var now = toJakartaIsoString_(new Date());

    var lcAssignments = parseLcAssignments_(request, durationMinutes);
    var lcIds = getLcIdsFromAssignments_(lcAssignments);
    var lcAssignmentsJson = serializeLcAssignments_(lcAssignments);
    if (lcIds) {
      var selectedLcIds = lcAssignments.map(function (assignment) {
        return String(assignment.lc_id || "").trim();
      }).filter(Boolean);
      var lcMasterSheet = ensureLcMasterSheet_();
      var lcMasterHeaders = getHeaderMap_(lcMasterSheet);
      var lcMasterRows = readSheetAsObjects_("LcMaster");
      
      for (var k = 0; k < selectedLcIds.length; k++) {
        var selId = selectedLcIds[k];
        if (selId === "PENDING") {
          continue; // Skip validation for pending LC selections
        }
        var foundLc = null;
        for (var idx = 0; idx < lcMasterRows.length; idx++) {
          if (String(lcMasterRows[idx].lc_id || "").trim() === selId) {
            foundLc = lcMasterRows[idx];
            break;
          }
        }
        if (!foundLc) {
          return { ok: false, success: false, error: "LC dengan ID " + selId + " tidak ditemukan." };
        }
        if (foundLc.status !== "active") {
          return { ok: false, success: false, error: "LC " + foundLc.lc_name + " sedang tidak aktif." };
        }
        if (foundLc.availability === "busy") {
          return { ok: false, success: false, error: "LC " + foundLc.lc_name + " sedang sibuk di room lain." };
        }
      }
      
      selectedLcIds.forEach(function(selId) {
        if (selId === "PENDING") {
          return; // Skip locking for pending LC selections
        }
        var rowNum = findRowByValue_(lcMasterSheet, lcMasterHeaders, "lc_id", selId);
        if (rowNum) {
          lcMasterSheet.getRange(rowNum, lcMasterHeaders.availability).setValue("busy");
          lcMasterSheet.getRange(rowNum, lcMasterHeaders.updated_at).setValue(now);
        }
      });
    }

    var ratePerHour = Number(room.rate_per_hour) || 0;
    var session = {
      session_id: generateRoomSessionId_(roomId),
      room_id: room.room_id || "",
      room_name: room.room_name || "",
      booking_mode: bookingMode,
      status: "starting",
      start_time: "",
      scheduled_end_time: "",
      end_time: "",
      booked_duration_minutes: durationMinutes,
      package_included_minutes: bookingMode === "package" ? durationMinutes : 0,
      promotion_free_minutes: 0,
      billable_room_minutes: bookingMode === "package" ? 0 : durationMinutes,
      rate_per_hour: ratePerHour,
      cashier_name: cashierName,
      created_at: now,
      updated_at: now,
      closed_transaction_id: "",
      idempotency_key: requestIdempotencyKey,
      legacy_room_start_time: "",
      note: buildPreparedSessionNote_(paymentMethod, request.note),
      customer_name: customerName,
      package_id: packageId,
      prepayment_transaction_id: "",
      lc_ids: lcIds,
      lc_assignments: lcAssignmentsJson,
    };

    appendRoomSession_(session);
    roomsSheet.getRange(rowNumber, roomsHeaderMap.status).setValue("booked");
    roomsSheet.getRange(rowNumber, roomsHeaderMap.start_time).setValue("");
    roomsSheet.getRange(rowNumber, roomsHeaderMap.booked_duration_minutes).setValue(durationMinutes);
    roomsSheet.getRange(rowNumber, roomsHeaderMap.scheduled_end_time).setValue("");
    roomsSheet.getRange(rowNumber, roomsHeaderMap.updated_at).setValue(now);

    if (roomsHeaderMap.customer_name) {
      roomsSheet.getRange(rowNumber, roomsHeaderMap.customer_name).setValue(customerName);
    }
    if (roomsHeaderMap.package_id) {
      roomsSheet.getRange(rowNumber, roomsHeaderMap.package_id).setValue(packageId);
    }
    if (roomsHeaderMap.lc_ids) {
      roomsSheet.getRange(rowNumber, roomsHeaderMap.lc_ids).setValue(lcIds);
    }

    SpreadsheetApp.flush();
    var fnbItems = request.fnb_items;
    if (Array.isArray(fnbItems) && fnbItems.length > 0) {
      var fnbResult = saveFnbOrder_(roomId, fnbItems, cashierName, "Dipesan via Resepsionis", "", "unpaid");
      if (!fnbResult.ok) {
        throw new Error("Gagal menyimpan pesanan F&B: " + fnbResult.error);
      }
    }

    return {
      ok: true,
      success: true,
      message: "Booking room berhasil disimpan. Mulai sesi saat pelanggan sudah masuk room.",
      room: getRoomFromRow_(roomsSheet, roomsHeaderMap, rowNumber),
      session: session,
    };
  } finally {
    lock.releaseLock();
  }
}

function payAndStartSession_(payload) {
  var request = payload || {};
  var roomId = String(request.room_id || "").trim();
  var cashierName = String(request.cashier_name || "Kasir").trim() || "Kasir";
  var paymentMethod = String(request.payment_method || "").trim().toLowerCase();
  var requestIdempotencyKey = String(request.idempotency_key || "").trim();

  if (!roomId) {
    return { ok: false, success: false, error: "room_id wajib diisi." };
  }

  if (!paymentMethod || !getAllowedPaymentMethods_()[paymentMethod]) {
    return { ok: false, success: false, error: "Metode pembayaran wajib diisi dengan benar." };
  }

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(2000)) {
    return {
      ok: false,
      success: false,
      error: "Sistem sedang memproses transaksi lain. Coba lagi sebentar.",
    };
  }

  try {
    var roomsSheet = ensureRoomsBookingColumns_();
    var roomsHeaderMap = getHeaderMap_(roomsSheet);
    var rowNumber = findRowByValue_(roomsSheet, roomsHeaderMap, "room_id", roomId);

    if (!rowNumber) {
      return { ok: false, success: false, error: "Ruangan tidak ditemukan." };
    }

    var room = getRowObject_(roomsSheet, roomsHeaderMap, rowNumber);
    var status = String(room.status || "").trim().toLowerCase();

    // Idempotency check: jika room sudah paid_waiting_start dan key cocok,
    // kembalikan sukses tanpa membuat transaksi baru (replay aman)
    if (requestIdempotencyKey && (status === "paid_waiting_start" || status === "occupied")) {
      var paidSession = findLatestRoomSessionForRoom_(roomId, ["starting", "active"]);
      if (
        paidSession &&
        String(paidSession.session.pay_idempotency_key || "").trim() === requestIdempotencyKey
      ) {
        return {
          ok: true,
          success: true,
          message: "Pembayaran awal sudah pernah diproses.",
          room: getRoomFromRow_(roomsSheet, roomsHeaderMap, rowNumber),
          idempotent_replay: true,
        };
      }
    }

    if (status !== "waiting_payment") {
      return { ok: false, success: false, error: "Room tidak berstatus menunggu pembayaran." };
    }

    var sessionResult = findLatestRoomSessionForRoom_(roomId, ["starting"]);
    if (!sessionResult) {
      return { ok: false, success: false, error: "Sesi booking tidak ditemukan." };

    }

    var session = sessionResult.session;
    var durationMinutes = Number(session.booked_duration_minutes) || 0;
    var ratePerHour = Number(room.rate_per_hour) || 0;
    var upfrontCharge = 0;

    if (session.booking_mode === "package") {
      var packagesList = readSheetAsObjects_("PackageMaster");
      for (var i = 0; i < packagesList.length; i++) {
        if (String(packagesList[i].package_id || "").trim() === session.package_id) {
          upfrontCharge = Number(packagesList[i].selling_price) || 0;
          break;
        }
      }
    } else {
      upfrontCharge = Math.ceil(durationMinutes / 60 * ratePerHour);
    }

    var now = toJakartaIsoString_(new Date());

    var promoCode = String(request.promo_code || "").trim().toUpperCase();
    var promoDiscount = 0;
    var appliedPromo = null;

    if (promoCode) {
      var promoRes = validatePromoCode_({ code: promoCode, room_total: upfrontCharge });
      if (!promoRes.ok || !promoRes.success) {
        return { ok: false, success: false, error: promoRes.error || "Gagal menerapkan kode promo." };
      }
      promoDiscount = promoRes.discount;
      appliedPromo = promoRes;
      
      upfrontCharge = upfrontCharge - promoDiscount;
      if (upfrontCharge < 0) {
        upfrontCharge = 0;
      }
    }
    
    var lcFeeTotal = 0;
    var lcAssignmentSource = (request.lc_ids !== undefined || request.lc_assignments !== undefined)
      ? request
      : {
          lc_ids: session.lc_ids,
          lc_assignments: session.lc_assignments,
        };
    var lcAssignments = parseLcAssignments_(lcAssignmentSource, durationMinutes);
    var lcIds = getLcIdsFromAssignments_(lcAssignments);
    var lcAssignmentsJson = serializeLcAssignments_(lcAssignments);
    if (lcIds) {
      var lcMasterRows = readSheetAsObjects_("LcMaster");

      // Hitung rata-rata tarif dari semua LC aktif di Master (untuk slot PENDING)
      var activeLcRates = [];
      for (var m = 0; m < lcMasterRows.length; m++) {
        var lcRow = lcMasterRows[m];
        if (String(lcRow.status || "").trim().toLowerCase() === "active") {
          var r = Number(lcRow.rate_per_room);
          if (r > 0) activeLcRates.push(r);
        }
      }
      var avgLcRate = activeLcRates.length > 0
        ? activeLcRates.reduce(function(a, b) { return a + b; }, 0) / activeLcRates.length
        : 0;

      var pendingSerial = 0;
      lcAssignments.forEach(function(assignment) {
        var selId = String(assignment.lc_id || "").trim();
        var lcDurationMinutes = normalizeLcDurationMinutes_(assignment.duration_minutes, durationMinutes);

        if (selId === "PENDING") {
          var rateForPending = calculateLcRateForDuration_(lcDurationMinutes, avgLcRate);
          lcFeeTotal += rateForPending;
          pendingSerial++;
          appendLcWorkLog_({
            log_id: "LWL-" + Utilities.formatDate(new Date(), "Asia/Jakarta", "yyyyMMddHHmmss") + "-PENDING" + pendingSerial + "-" + Math.floor(Math.random() * 100),
            session_id: session.session_id,
            lc_id: "PENDING",
            lc_name: "Belum Dipilih",
            rate: rateForPending,
            duration_minutes: lcDurationMinutes,
            rate_per_hour: avgLcRate,
            status: "active",
            created_at: now,
            closed_at: "",
          });
          return;
        }
        var foundLc = null;
        for (var idx = 0; idx < lcMasterRows.length; idx++) {
          if (String(lcMasterRows[idx].lc_id || "").trim() === selId) {
            foundLc = lcMasterRows[idx];
            break;
          }
        }
        if (!foundLc) {
          throw new Error("LC dengan ID '" + selId + "' tidak ditemukan di Master LC. Pastikan data LC sudah benar.");
        }
        var hourlyRate = Number(foundLc.rate_per_room);
        if (!hourlyRate || isNaN(hourlyRate) || hourlyRate <= 0) {
          throw new Error("Tarif per jam LC '" + (foundLc.lc_name || selId) + "' tidak valid. Isi tarif per jam di menu Master LC.");
        }
        var rateForSession = calculateLcRateForDuration_(lcDurationMinutes, hourlyRate);
        lcFeeTotal += rateForSession;
        appendLcWorkLog_({
          log_id: "LWL-" + Utilities.formatDate(new Date(), "Asia/Jakarta", "yyyyMMddHHmmss") + "-" + selId + "-" + Math.floor(Math.random() * 100),
          session_id: session.session_id,
          lc_id: selId,
          lc_name: foundLc.lc_name || selId,
          rate: rateForSession,
          duration_minutes: lcDurationMinutes,
          rate_per_hour: hourlyRate,
          status: "active",
          created_at: now,
          closed_at: "",
        });
      });
    }

    var scheduledEndTime = addMinutesToJakartaIsoString_(now, durationMinutes);
    var transactionId = generateTransactionId_();

    // Hapus order F&B prepay lama
    deleteOpenFnbOrdersForPrepay_(roomId);

    var fnbTotal = 0;
    var fnbOrderIds = "";
    var fnbItems = request.fnb_items;
    if (Array.isArray(fnbItems) && fnbItems.length > 0) {
      var fnbResult = saveFnbOrder_(roomId, fnbItems, cashierName, "Dibayar via Prepayment Kasir", "", "unpaid");
      if (!fnbResult.ok) {
        throw new Error("Gagal memproses F&B Prepayment: " + fnbResult.error);
      }
      fnbTotal = Number(fnbResult.order.order_total) || 0;
      fnbOrderIds = String(fnbResult.order.order_id || "");
      
      // Ubah status order F&B menjadi paid
      markFnbOrdersAsPaid_([fnbOrderIds], now);
      
      // Potong stok F&B
      var detailedOrder = Object.assign({}, fnbResult.order, { items: fnbResult.items });
      deductStockForFnbOrders_([detailedOrder], transactionId, cashierName, now);
    }

    // Create Transaction 1 (Upfront)
    var transaction = {
      transaction_id: transactionId,
      room_id: room.room_id || "",
      room_name: room.room_name || "",
      start_time: now,
      end_time: scheduledEndTime,
      duration_minutes: durationMinutes,
      rate_per_hour: ratePerHour,
      room_total: upfrontCharge,
      fnb_total: fnbTotal,
      lc_total: lcFeeTotal,
      grand_total: upfrontCharge + lcFeeTotal + fnbTotal,
      fnb_order_ids: fnbOrderIds,
      payment_method: paymentMethod,
      payment_status: "paid",
      cashier_name: cashierName,
      created_at: now,
      billing_basis: "upfront_prepay",
      promo_code: promoCode,
      promo_discount: promoDiscount
    };
    appendTransaction_(transaction);

    // Mark voucher as used in database
    if (appliedPromo && String(appliedPromo.type).toLowerCase() === "voucher") {
      var promoSheet = ensurePromoMasterSheet_();
      var promoHeaderMap = getHeaderMap_(promoSheet);
      var promoRowNum = findRowByValue_(promoSheet, promoHeaderMap, "code", promoCode);
      if (promoRowNum) {
        setRowValues_(promoSheet, promoHeaderMap, promoRowNum, {
          used_in_transaction_id: transactionId,
          used_at: now,
          status: "inactive"
        });
      }
    }

    // Deduct stock for package F&B
    if (session.booking_mode === "package" && session.package_id) {
      deductPackageStock_(session.package_id, transactionId, cashierName, now);
    }

    // Update session — simpan pay_idempotency_key untuk deteksi replay
    var sessionUpdateFields = {
      updated_at: now,
      cashier_name: cashierName,
      prepayment_transaction_id: transactionId,
      pay_idempotency_key: requestIdempotencyKey,
    };
    if ((request.lc_ids !== undefined || request.lc_assignments !== undefined) && sessionResult.headerMap.lc_ids) {
      sessionUpdateFields.lc_ids = lcIds;
    }
    if ((request.lc_ids !== undefined || request.lc_assignments !== undefined) && sessionResult.headerMap.lc_assignments) {
      sessionUpdateFields.lc_assignments = lcAssignmentsJson;
    }
    setRowValues_(sessionResult.sheet, sessionResult.headerMap, sessionResult.rowNumber, sessionUpdateFields);

    // Update Room
    roomsSheet.getRange(rowNumber, roomsHeaderMap.status).setValue("paid_waiting_start");
    roomsSheet.getRange(rowNumber, roomsHeaderMap.start_time).setValue("");
    roomsSheet.getRange(rowNumber, roomsHeaderMap.booked_duration_minutes).setValue(durationMinutes);
    roomsSheet.getRange(rowNumber, roomsHeaderMap.scheduled_end_time).setValue("");
    roomsSheet.getRange(rowNumber, roomsHeaderMap.updated_at).setValue(now);
    if (roomsHeaderMap.lc_ids) {
      roomsSheet.getRange(rowNumber, roomsHeaderMap.lc_ids).setValue(lcIds);
    }

    return {
      ok: true,
      success: true,
      message: "Pembayaran awal lunas. Room menunggu siap diaktifkan waiters.",
      room: getRoomFromRow_(roomsSheet, roomsHeaderMap, rowNumber),
      transaction: transaction,
    };
  } finally {
    lock.releaseLock();
  }
}

function getPostpaidPackageContext_(packageId) {
  var normalizedPackageId = String(packageId || "").trim();
  var packageMaster = readSheetAsObjects_("PackageMaster").find(function (item) {
    return String(item.package_id || "").trim() === normalizedPackageId;
  });

  if (!packageMaster) {
    throw new Error("Paket sesi tidak ditemukan: " + normalizedPackageId);
  }

  var packageDetails = readSheetAsObjects_("PackageDetail").filter(function (detail) {
    return String(detail.package_id || "").trim() === normalizedPackageId;
  });
  var includedTalentCount = packageDetails.reduce(function (total, detail) {
    var componentType = String(detail.component_type || "").trim().toLowerCase();
    var componentRefId = String(detail.component_ref_id || "").trim().toUpperCase();
    var componentName = String(detail.component_name || "").trim().toLowerCase();
    var isTalent = componentType === "service"
      && (componentRefId === "SVC-TALENT" || componentName.indexOf("talent") !== -1);

    return total + (isTalent ? Number(detail.qty) || 0 : 0);
  }, 0);

  return {
    package_id: normalizedPackageId,
    package_name: packageMaster.package_name || normalizedPackageId,
    selling_price: Number(packageMaster.selling_price) || 0,
    duration_minutes: Number(packageMaster.duration_minutes) || 0,
    included_talent_count: Math.max(0, Math.floor(includedTalentCount)),
  };
}

function calculatePackageIncludedLcCredit_(workLogs, packageContext) {
  var includedCount = Number(packageContext && packageContext.included_talent_count) || 0;
  var includedDuration = Number(packageContext && packageContext.duration_minutes) || 0;

  if (includedCount <= 0 || includedDuration <= 0) {
    return 0;
  }

  return (workLogs || []).filter(function (log) {
    var lcId = String(log.lc_id || "").trim();
    return lcId && lcId !== "PENDING";
  }).slice(0, includedCount).reduce(function (credit, log) {
    var hourlyRate = Number(log.rate_per_hour) || 0;
    var loggedDuration = inferLcWorkLogDurationMinutes_(log) || includedDuration;
    var coveredDuration = Math.min(loggedDuration, includedDuration);
    var coveredAmount = calculateLcRateForDuration_(coveredDuration, hourlyRate);

    return credit + Math.min(Number(log.rate) || 0, coveredAmount);
  }, 0);
}

function calculatePostpaidPackageRoomTotal_(durationMinutes, packageContext, ratePerHour) {
  var includedDuration = Number(packageContext && packageContext.duration_minutes) || 0;
  var packagePrice = Number(packageContext && packageContext.selling_price) || 0;
  var excessMinutes = Math.max(0, (Number(durationMinutes) || 0) - includedDuration);

  return packagePrice + Math.ceil(excessMinutes / 60 * (Number(ratePerHour) || 0));
}

function deductPackageStock_(packageId, transactionId, cashierName, now) {
  try {
    var packageItems = readSheetAsObjects_("PackageDetail").filter(function (detail) {
      var componentType = String(detail.component_type || "").trim().toLowerCase();
      var refId = String(detail.component_ref_id || "").trim();
      return String(detail.package_id || "").trim() === String(packageId || "").trim()
        && ["menu", "inventory"].indexOf(componentType) !== -1
        && refId.indexOf("MENU-") === 0
        && Number(detail.qty) > 0;
    }).map(function (detail) {
      return {
        menu_id: String(detail.component_ref_id || "").trim(),
        menu_name: detail.component_name || detail.component_ref_id,
        quantity: Number(detail.qty) || 0,
      };
    });

    if (packageItems.length === 0) {
      return { movements: [], warnings: [] };
    }

    return deductStockForFnbOrders_([
      {
        order_id: "PACKAGE-" + packageId,
        items: packageItems,
      },
    ], transactionId, cashierName, now);
  } catch (err) {
    Logger.log("Gagal mengurangi stok paket: " + err.message);
    return { movements: [], warnings: ["Stok paket gagal diperbarui: " + err.message] };
  }
}

function completeCleaning_(payload) {
  var request = payload || {};
  var roomId = String(request.room_id || "").trim();

  if (!roomId) {
    return { ok: false, success: false, error: "room_id wajib diisi." };
  }

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(2000)) {
    return { ok: false, success: false, error: "Sistem sedang memproses perubahan room lain. Coba lagi sebentar." };
  }

  try {
    var roomsSheet = ensureRoomsBookingColumns_();
    var roomsHeaderMap = getHeaderMap_(roomsSheet);
    var rowNumber = findRowByValue_(roomsSheet, roomsHeaderMap, "room_id", roomId);

    if (!rowNumber) {
      return { ok: false, success: false, error: "Ruangan tidak ditemukan." };
    }

    var room = getRowObject_(roomsSheet, roomsHeaderMap, rowNumber);
    var status = String(room.status || "").trim().toLowerCase();

    if (status !== "cleaning") {
      return { ok: false, success: false, error: "Room tidak berstatus cleaning." };
    }

    var now = toJakartaIsoString_(new Date());
    roomsSheet.getRange(rowNumber, roomsHeaderMap.status).setValue("available");
    roomsSheet.getRange(rowNumber, roomsHeaderMap.start_time).setValue("");
    roomsSheet.getRange(rowNumber, roomsHeaderMap.booked_duration_minutes).setValue("");
    roomsSheet.getRange(rowNumber, roomsHeaderMap.scheduled_end_time).setValue("");
    roomsSheet.getRange(rowNumber, roomsHeaderMap.updated_at).setValue(now);

    if (roomsHeaderMap.customer_name) {
      roomsSheet.getRange(rowNumber, roomsHeaderMap.customer_name).setValue("");
    }
    if (roomsHeaderMap.package_id) {
      roomsSheet.getRange(rowNumber, roomsHeaderMap.package_id).setValue("");
    }
    if (roomsHeaderMap.lc_ids) {
      roomsSheet.getRange(rowNumber, roomsHeaderMap.lc_ids).setValue("");
    }

    return {
      ok: true,
      success: true,
      message: "Room siap digunakan kembali.",
      room: getRoomFromRow_(roomsSheet, roomsHeaderMap, rowNumber),
    };
  } finally {
    lock.releaseLock();
  }
}

function cancelBooking_(payload) {
  var request = payload || {};
  var roomId = String(request.room_id || "").trim();

  if (!roomId) {
    return { ok: false, success: false, error: "room_id wajib diisi." };
  }

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(2000)) {
    return { ok: false, success: false, error: "Sistem sedang memproses booking lain. Coba lagi sebentar." };
  }

  try {
    var roomsSheet = ensureRoomsBookingColumns_();
    var roomsHeaderMap = getHeaderMap_(roomsSheet);
    var rowNumber = findRowByValue_(roomsSheet, roomsHeaderMap, "room_id", roomId);

    if (!rowNumber) {
      return { ok: false, success: false, error: "Ruangan tidak ditemukan." };
    }

    var room = getRowObject_(roomsSheet, roomsHeaderMap, rowNumber);
    var status = String(room.status || "").trim().toLowerCase();

    if (["booked", "waiting_payment"].indexOf(status) === -1) {
      return { ok: false, success: false, error: "Hanya booking yang belum dimulai yang bisa dibatalkan." };
    }

    var sessionResult = findLatestRoomSessionForRoom_(roomId, ["starting"]);
    var now = toJakartaIsoString_(new Date());

    if (sessionResult) {
      setRowValues_(sessionResult.sheet, sessionResult.headerMap, sessionResult.rowNumber, {
        status: "cancelled",
        updated_at: now,
      });

      var session = sessionResult.session;
      var lcIds = String(session.lc_ids || "").trim();
      if (lcIds) {
        var selectedLcIds = lcIds.split(",").map(function(id) { return id.trim(); }).filter(Boolean);
        var lcMasterSheet = ensureLcMasterSheet_();
        var lcMasterHeaders = getHeaderMap_(lcMasterSheet);
        var lcWorkLogsSheet = ensureLcWorkLogsSheet_();
        var lcWorkLogsHeaders = getHeaderMap_(lcWorkLogsSheet);
        
        selectedLcIds.forEach(function(selId) {
          var rowNum = findRowByValue_(lcMasterSheet, lcMasterHeaders, "lc_id", selId);
          if (rowNum) {
            lcMasterSheet.getRange(rowNum, lcMasterHeaders.availability).setValue("available");
            lcMasterSheet.getRange(rowNum, lcMasterHeaders.updated_at).setValue(now);
          }
          
          var workLogRows = readSheetAsObjects_("LcWorkLogs");
          for (var rIdx = 0; rIdx < workLogRows.length; rIdx++) {
            var log = workLogRows[rIdx];
            if (
              String(log.session_id || "").trim() === String(session.session_id || "").trim() &&
              String(log.lc_id || "").trim() === selId &&
              log.status === "active"
            ) {
              var logRowNum = rIdx + 2;
              lcWorkLogsSheet.getRange(logRowNum, lcWorkLogsHeaders.status).setValue("cancelled");
              lcWorkLogsSheet.getRange(logRowNum, lcWorkLogsHeaders.closed_at).setValue(now);
            }
          }
        });
      }
    }

    // Hapus order F&B prepay yang belum dibayar jika booking dibatalkan
    deleteOpenFnbOrdersForPrepay_(roomId);

    roomsSheet.getRange(rowNumber, roomsHeaderMap.status).setValue("available");
    roomsSheet.getRange(rowNumber, roomsHeaderMap.start_time).setValue("");
    roomsSheet.getRange(rowNumber, roomsHeaderMap.booked_duration_minutes).setValue("");
    roomsSheet.getRange(rowNumber, roomsHeaderMap.scheduled_end_time).setValue("");
    roomsSheet.getRange(rowNumber, roomsHeaderMap.updated_at).setValue(now);

    if (roomsHeaderMap.customer_name) {
      roomsSheet.getRange(rowNumber, roomsHeaderMap.customer_name).setValue("");
    }
    if (roomsHeaderMap.package_id) {
      roomsSheet.getRange(rowNumber, roomsHeaderMap.package_id).setValue("");
    }
    if (roomsHeaderMap.lc_ids) {
      roomsSheet.getRange(rowNumber, roomsHeaderMap.lc_ids).setValue("");
    }

    return {
      ok: true,
      success: true,
      message: "Pemesanan berhasil dibatalkan.",
      room: getRoomFromRow_(roomsSheet, roomsHeaderMap, rowNumber),
    };
  } finally {
    lock.releaseLock();
  }
}

function bulkImportPackages_(payload) {
  var packages = payload.packages || [];
  if (!packages.length) {
    return { ok: false, success: false, error: "packages array wajib diisi." };
  }

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(3000)) {
    return { ok: false, success: false, error: "Sistem sedang memproses impor lain. Coba lagi sebentar." };
  }

  try {
    var masterSheet = ensurePackageMasterSheet_();
    var detailSheet = ensurePackageDetailSheet_();

    // Clear sheets keeping headers
    var lastRowMaster = masterSheet.getLastRow();
    if (lastRowMaster > 1) masterSheet.deleteRows(2, lastRowMaster - 1);
    
    var lastRowDetail = detailSheet.getLastRow();
    if (lastRowDetail > 1) detailSheet.deleteRows(2, lastRowDetail - 1);

    var masterHeaderMap = getHeaderMap_(masterSheet);
    var detailHeaderMap = getHeaderMap_(detailSheet);
    var now = toJakartaIsoString_(new Date());

    packages.forEach(function (pkg) {
      var master = pkg.package_master;
      master.updated_at = now;
      appendObjectRow_(masterSheet, master);

      var details = pkg.package_details || [];
      details.forEach(function (detail) {
        detail.updated_at = now;
        appendObjectRow_(detailSheet, detail);
      });
    });

    return {
      ok: true,
      success: true,
      message: "Impor paket berhasil. Total " + packages.length + " paket dimasukkan.",
    };
  } finally {
    lock.releaseLock();
  }
}

function seedReceptionistEmployee_() {
  var sheet = getSheet_("Employees");
  var headerMap = getHeaderMap_(sheet);
  var employees = readSheetAsObjects_("Employees");
  
  var exists = employees.some(function (emp) {
    return String(emp.role || "").trim().toLowerCase() === "receptionist";
  });
  
  if (!exists) {
    var nextEmpId = "EMP-004";
    var receptionist = {
      employee_id: nextEmpId,
      employee_name: "Resepsionis 1",
      role: "receptionist",
      pin: "4444",
      status: "active",
      created_at: toJakartaIsoString_(new Date()),
      updated_at: toJakartaIsoString_(new Date()),
    };
    appendObjectRow_(sheet, receptionist);
    return { ok: true, success: true, message: "Karyawan resepsionis berhasil dibuat. PIN: 4444" };
  }
  
  return { ok: true, success: true, message: "Karyawan resepsionis sudah terdaftar." };
}

function activatePreparedSession_(roomId, cashierName) {
  var normalizedRoomId = String(roomId || "").trim();

  if (!normalizedRoomId) {
    return {
      ok: false,
      success: false,
      error: "room_id wajib diisi.",
    };
  }

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(2000)) {
    return { ok: false, success: false, error: "Sistem sedang memproses room lain. Coba lagi sebentar." };
  }

  try {
    var roomsSheet = ensureRoomsBookingColumns_();
    var roomsHeaderMap = getHeaderMap_(roomsSheet);
    var rowNumber = findRowByValue_(roomsSheet, roomsHeaderMap, "room_id", normalizedRoomId);

    if (!rowNumber) {
      return {
        ok: false,
        success: false,
        error: "Ruangan tidak ditemukan.",
      };
    }

    var room = getRowObject_(roomsSheet, roomsHeaderMap, rowNumber);
    var status = String(room.status || "").trim().toLowerCase();

    if (["booked", "waiting_payment", "paid_waiting_start"].indexOf(status) === -1) {
      return {
        ok: false,
        success: false,
        error: "Room belum berada pada status booking yang siap dimulai.",
      };
    }

    var sessionResult = findLatestRoomSessionForRoom_(normalizedRoomId, ["starting"]);

    if (!sessionResult) {
      return {
        ok: false,
        success: false,
        error: "Session menunggu mulai tidak ditemukan.",
      };
    }

    var session = sessionResult.session;
    var durationMinutes = Number(session.booked_duration_minutes) || Number(room.booked_duration_minutes) || 0;

    var minimumDurationMinutes = DEV_SHORT_SESSION_ENABLED === true
      ? Math.max(1, Number(DEV_MIN_SESSION_MINUTES) || 1)
      : MIN_SESSION_MINUTES;

    if (!isFinite(durationMinutes) || durationMinutes < minimumDurationMinutes) {
      return {
        ok: false,
        success: false,
        error: "Durasi booking tidak valid.",
      };
    }

    var now = toJakartaIsoString_(new Date());
    var scheduledEndTime = addMinutesToJakartaIsoString_(now, durationMinutes);
    var actor = String(cashierName || session.cashier_name || "Kasir").trim() || "Kasir";
    var sessionsSheet = sessionResult.sheet;
    var sessionsHeaderMap = sessionResult.headerMap;

    setRowValues_(sessionsSheet, sessionsHeaderMap, sessionResult.rowNumber, {
      status: "active",
      start_time: now,
      scheduled_end_time: scheduledEndTime,
      updated_at: now,
      legacy_room_start_time: now,
      cashier_name: actor,
    });

    roomsSheet.getRange(rowNumber, roomsHeaderMap.status).setValue("occupied");
    roomsSheet.getRange(rowNumber, roomsHeaderMap.start_time).setValue(now);
    roomsSheet.getRange(rowNumber, roomsHeaderMap.booked_duration_minutes).setValue(durationMinutes);
    roomsSheet.getRange(rowNumber, roomsHeaderMap.scheduled_end_time).setValue(scheduledEndTime);
    roomsSheet.getRange(rowNumber, roomsHeaderMap.updated_at).setValue(now);

    ensureActiveLcWorkLogsForSession_(session, now);

    // Sinkronkan order F&B yang dibuat saat booking dengan sesi aktif.
    syncPrepaidFnbOrdersStartTime_(normalizedRoomId, now);

    return {
      ok: true,
      success: true,
      message: "Countdown room berhasil dimulai.",
      room: getRoomFromRow_(roomsSheet, roomsHeaderMap, rowNumber),
      session: getRowObject_(sessionsSheet, sessionsHeaderMap, sessionResult.rowNumber),
    };
  } finally {
    lock.releaseLock();
  }
}

function ensureActiveLcWorkLogsForSession_(session, startedAt) {
  var assignments = parseLcAssignments_(
    {
      lc_ids: session.lc_ids,
      lc_assignments: session.lc_assignments,
    },
    Number(session.booked_duration_minutes) || 60
  );

  if (assignments.length === 0) {
    return;
  }

  var existingLogs = readSheetAsObjectsOrEmpty_("LcWorkLogs").filter(function (log) {
    return String(log.session_id || "").trim() === String(session.session_id || "").trim()
      && String(log.status || "").trim().toLowerCase() === "active";
  });

  if (existingLogs.length > 0) {
    return;
  }

  var lcMasterRows = readSheetAsObjects_("LcMaster");
  var activeRates = lcMasterRows.filter(function (lc) {
    return String(lc.status || "").trim().toLowerCase() === "active";
  }).map(function (lc) {
    return Number(lc.rate_per_room) || 0;
  }).filter(function (rate) {
    return rate > 0;
  });
  var averageRate = activeRates.length > 0
    ? activeRates.reduce(function (sum, rate) { return sum + rate; }, 0) / activeRates.length
    : 0;

  assignments.forEach(function (assignment, index) {
    var lcId = String(assignment.lc_id || "").trim();
    var durationMinutes = normalizeLcDurationMinutes_(
      assignment.duration_minutes,
      Number(session.booked_duration_minutes) || 60
    );
    var lc = lcMasterRows.find(function (item) {
      return String(item.lc_id || "").trim() === lcId;
    });
    var hourlyRate = lcId === "PENDING"
      ? averageRate
      : Number(lc && lc.rate_per_room) || 0;

    appendLcWorkLog_({
      log_id: "LWL-" + Utilities.formatDate(new Date(), "Asia/Jakarta", "yyyyMMddHHmmss") + "-" + (lcId || "PENDING") + "-" + index + "-" + Math.floor(Math.random() * 100),
      session_id: session.session_id,
      lc_id: lcId || "PENDING",
      lc_name: lcId === "PENDING" ? "Belum Dipilih" : (lc && lc.lc_name || lcId),
      rate: calculateLcRateForDuration_(durationMinutes, hourlyRate),
      duration_minutes: durationMinutes,
      rate_per_hour: hourlyRate,
      status: "active",
      created_at: startedAt,
      closed_at: "",
    });
  });
}

function extendSession_(roomId, addMinutes, cashierName, note, paymentMethod, paymentStatus) {
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
  if (!lock.tryLock(2000)) {
    return {
      ok: false,
      error: "Sistem sedang memproses tambah waktu lain. Coba lagi sebentar.",
    };
  }

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

    var isPaid = String(paymentStatus || "").trim().toLowerCase() === "paid";
    var method = String(paymentMethod || "").trim().toLowerCase();

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
      
      // Update active RoomSession if exists
      var activeRoomSession = findLatestRoomSessionForRoom_(roomId, ["active", "starting", "paid_waiting_start"]);
      if (activeRoomSession && activeRoomSession.session) {
        var sessionObj = activeRoomSession.session;
        var packageIncludedMinutes = Number(sessionObj.package_included_minutes) || 0;
        var newBillableRoomMinutes = Math.max(0, newBookedDurationMinutes - packageIncludedMinutes);
        
        setRowValues_(activeRoomSession.sheet, activeRoomSession.headerMap, activeRoomSession.rowNumber, {
          booked_duration_minutes: newBookedDurationMinutes,
          billable_room_minutes: newBillableRoomMinutes,
          scheduled_end_time: newScheduledEndTime,
          updated_at: now
        });
        
        // LC durations remain fixed based on cashier selection and do not auto-extend with room extension
        try {
          Logger.log("Room session extended. LC work log rates remain fixed based on selected LC duration.");
        } catch (lcExtErr) {
          Logger.log("Error during LC extension handling: " + lcExtErr.message);
        }
      }
    } catch (logError) {
      sheet.getRange(rowNumber, headerMap.booked_duration_minutes).setValue(oldBookedDurationMinutes);
      sheet.getRange(rowNumber, headerMap.scheduled_end_time).setValue(oldScheduledEndTime);
      sheet.getRange(rowNumber, headerMap.updated_at).setValue(room.updated_at || "");

      return {
        ok: false,
        error: "Gagal mencatat audit log tambah waktu atau memperbarui sesi. Perubahan durasi dibatalkan.",
      };
    }

    if (isPaid) {
      var ratePerHour = Number(room.rate_per_hour) || 0;
      var extensionCost = Math.ceil((addedMinutes / 60) * ratePerHour);

      var transaction = {
        transaction_id: generateTransactionId_(),
        room_id: room.room_id || "",
        room_name: room.room_name || "",
        start_time: oldScheduledEndTime,
        end_time: newScheduledEndTime,
        duration_minutes: addedMinutes,
        rate_per_hour: ratePerHour,
        room_total: extensionCost,
        fnb_total: 0,
        grand_total: extensionCost,
        fnb_order_ids: "",
        payment_method: method || "cash",
        payment_status: "paid",
        cashier_name: cashierName || "Kasir",
        created_at: now,
        transaction_type: "room_extension",
      };
      appendTransaction_(transaction);
    }

    return {
      ok: true,
      message: isPaid ? "Waktu room berhasil ditambahkan & dibayar." : "Waktu room berhasil ditambahkan.",
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

function closeSession_(roomId, cashierName, requestPayload) {
  if (!roomId) {
    return {
      ok: false,
      error: "room_id wajib diisi.",
    };
  }

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(2000)) {
    return {
      ok: false,
      error: "Sistem sedang memproses penutupan sesi lain. Coba lagi sebentar.",
    };
  }

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
    var status = String(room.status || "").trim().toLowerCase();
    var activeRoomSession = findLatestRoomSessionForRoom_(roomId, ["active"]);

    if (status !== "occupied") {
      if (activeRoomSession && activeRoomSession.session) {
        status = "occupied";
        roomsSheet.getRange(rowNumber, roomsHeaderMap.status).setValue("occupied");
      } else {
        return {
          ok: false,
          error: "Ruangan belum sedang digunakan.",
        };
      }
    }

    if (!room.start_time && activeRoomSession && activeRoomSession.session) {
      room.start_time = activeRoomSession.session.start_time || activeRoomSession.session.created_at || "";
    }

    if (!room.start_time) {
      return {
        ok: false,
        error: "Waktu mulai sesi tidak valid.",
      };
    }

    var startDate = new Date(room.start_time);

    if (isNaN(startDate.getTime())) {
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
    
    // Align LC billing end time with session duration rules
    var sessionBillingEndTime = endTime;
    if (billing.billing_basis === "booked_duration" && room.scheduled_end_time) {
      sessionBillingEndTime = room.scheduled_end_time instanceof Date
        ? toJakartaIsoString_(room.scheduled_end_time)
        : String(room.scheduled_end_time).trim();
    }
    
    var roomTotal = billing.room_total;
    var isPrepay = false;
    var prepayTxId = "";
    var initialPaidMinutes = 0;
    var prepaidRoomTotal = 0;
    var prepaidLcTotal = 0;
    var postpaidPackageContext = null;
    
    if (activeRoomSession && activeRoomSession.session && activeRoomSession.session.prepayment_transaction_id) {
      isPrepay = true;
      prepayTxId = activeRoomSession.session.prepayment_transaction_id;
      
      try {
        var txRows = readSheetAsObjects_("Transactions");
        var prepayTx = null;
        for (var tIdx = 0; tIdx < txRows.length; tIdx++) {
          if (String(txRows[tIdx].transaction_id || "").trim() === String(prepayTxId).trim()) {
            prepayTx = txRows[tIdx];
            break;
          }
        }
        if (prepayTx) {
          prepaidRoomTotal = Number(prepayTx.room_total) || 0;
          prepaidLcTotal = Number(prepayTx.lc_total) || 0;
        }
      } catch (err) {
        Logger.log("Error finding prepayment transaction: " + err.message);
      }

      if (activeRoomSession.session.booking_mode === "package") {
        initialPaidMinutes = Number(activeRoomSession.session.package_included_minutes) || 0;
      } else {
        if (prepayTx) {
          initialPaidMinutes = Number(prepayTx.duration_minutes) || 0;
        }
      }
      
      var excessMinutes = Math.max(0, durationMinutes - initialPaidMinutes);
      roomTotal = Math.ceil((excessMinutes / 60) * ratePerHour);
    }

    if (
      !isPrepay &&
      activeRoomSession &&
      activeRoomSession.session &&
      String(activeRoomSession.session.booking_mode || "").trim().toLowerCase() === "package"
    ) {
      postpaidPackageContext = getPostpaidPackageContext_(activeRoomSession.session.package_id);
      roomTotal = calculatePostpaidPackageRoomTotal_(
        durationMinutes,
        postpaidPackageContext,
        ratePerHour
      );
      billing.billing_basis = "package_postpaid";
    }

    var prepaidExtensionsAmount = 0;
    try {
      var sessionStartTimeMs = new Date(startTime).getTime();
      var sessionEndTimeMs = endDate.getTime();
      
      var relatedExtensionTxs = readSheetAsObjects_("Transactions").filter(function (tx) {
        if (String(tx.room_id || "").trim() !== String(room.room_id || "").trim()) {
          return false;
        }
        if (String(tx.transaction_type || "").trim() !== "room_extension") {
          return false;
        }
        var txTimeText = tx.created_at || tx.end_time || "";
        if (!txTimeText) return false;
        
        var txTimeMs = new Date(txTimeText).getTime();
        return txTimeMs >= sessionStartTimeMs && txTimeMs <= sessionEndTimeMs;
      });
      
      prepaidExtensionsAmount = relatedExtensionTxs.reduce(function (sum, tx) {
        return sum + (Number(tx.grand_total) || 0);
      }, 0);
    } catch (err) {
      // Safe fallback
    }

    roomTotal = Math.max(0, roomTotal - prepaidExtensionsAmount);

    // Calculate LC Fee for checkout (Upfront Booked calculation based on pre-calculated rate column)
    var lcFeeTotal = 0;
    if (activeRoomSession && activeRoomSession.session) {
      try {
        var sessionForLc = activeRoomSession.session;
        var reqPayload = requestPayload || {};
        if (reqPayload.lc_ids !== undefined || reqPayload.lc_assignments !== undefined) {
          try {
            assignSessionLcs_({
              room_id: roomId,
              lc_ids: reqPayload.lc_ids,
              lc_assignments: reqPayload.lc_assignments,
              changed_by: cashierName || "Kasir",
            });
          } catch (assignErr) {
            Logger.log("Error auto-assigning LCs on closeSession: " + assignErr.message);
          }
        }

        var workLogRowsForLc = readSheetAsObjects_("LcWorkLogs").filter(function(log) {
          return String(log.session_id || "").trim() === String(sessionForLc.session_id || "").trim();
        });
        
        var uniqueLcLogsMap = {};
        workLogRowsForLc.forEach(function(log) {
          var selId = String(log.lc_id || "").trim();
          if (selId === "PENDING" || !selId) return;
          var status = String(log.status || "").trim().toLowerCase();
          if (status === "active" || (!uniqueLcLogsMap[selId] && status !== "cancelled")) {
            uniqueLcLogsMap[selId] = log;
          }
        });

        var totalLcCost = 0;
        Object.keys(uniqueLcLogsMap).forEach(function(selId) {
          totalLcCost += Number(uniqueLcLogsMap[selId].rate) || 0;
        });
        
        var includedLcCredit = postpaidPackageContext
          ? calculatePackageIncludedLcCredit_(workLogRowsForLc, postpaidPackageContext)
          : 0;
        lcFeeTotal = Math.max(0, totalLcCost - prepaidLcTotal - includedLcCredit);
      } catch (lcErr) {
        Logger.log("Error calculating LC checkout fee: " + lcErr.message);
        throw lcErr;
      }
    }

    var fnbOrders = getOpenFnbOrdersForSession_(room.room_id || "", startTime || "");
    var fnbTotal = calculateFnbTotal_(fnbOrders);
    var fnbOrderIds = fnbOrders.map(function (order) {
      return order.order_id;
    }).join(",");
    var detailedFnbOrders = getFnbOrdersWithItemsByIds_(parseCommaSeparatedIds_(fnbOrderIds));

    var transaction = null;
    var stockResult = { movements: [], warnings: [] };

    if (!isPrepay || fnbTotal > 0 || roomTotal > 0 || lcFeeTotal > 0) {
      transaction = {
        transaction_id: generateTransactionId_(),
        room_id: room.room_id || "",
        room_name: room.room_name || "",
        start_time: startTime || "",
        end_time: endTime,
        duration_minutes: durationMinutes,
        rate_per_hour: ratePerHour,
        room_total: roomTotal,
        fnb_total: fnbTotal,
        lc_total: lcFeeTotal,
        grand_total: roomTotal + fnbTotal + lcFeeTotal,
        fnb_order_ids: fnbOrderIds,
        payment_method: "",
        payment_status: "unpaid",
        cashier_name: cashierName || "Kasir",
        created_at: endTime,
        billing_basis: isPrepay ? "prepay_add_on" : billing.billing_basis,
        transaction_type: "session_checkout",
      };

      appendTransaction_(transaction);
      stockResult = deductStockForFnbOrders_(detailedFnbOrders, transaction.transaction_id, transaction.cashier_name, endTime);
      if (postpaidPackageContext) {
        var packageStockResult = deductPackageStock_(
          postpaidPackageContext.package_id,
          transaction.transaction_id,
          transaction.cashier_name,
          endTime
        );
        stockResult.movements = stockResult.movements.concat(packageStockResult.movements || []);
        stockResult.warnings = stockResult.warnings.concat(packageStockResult.warnings || []);
      }
      markFnbOrdersAsBilled_(fnbOrderIds ? fnbOrderIds.split(",") : [], endTime);
      fnbOrders = detailedFnbOrders.map(function (order) {
        order.order_status = "billed";
        order.updated_at = endTime;
        return order;
      });
    } else {
      if (fnbOrderIds) {
        markFnbOrdersAsBilled_(fnbOrderIds.split(","), endTime);
      }
    }

    roomsSheet.getRange(rowNumber, roomsHeaderMap.status).setValue("cleaning");
    roomsSheet.getRange(rowNumber, roomsHeaderMap.start_time).setValue("");
    if (roomsHeaderMap.booked_duration_minutes) {
      roomsSheet.getRange(rowNumber, roomsHeaderMap.booked_duration_minutes).setValue("");
    }
    if (roomsHeaderMap.scheduled_end_time) {
      roomsSheet.getRange(rowNumber, roomsHeaderMap.scheduled_end_time).setValue("");
    }
    if (roomsHeaderMap.customer_name) {
      roomsSheet.getRange(rowNumber, roomsHeaderMap.customer_name).setValue("");
    }
    if (roomsHeaderMap.package_id) {
      roomsSheet.getRange(rowNumber, roomsHeaderMap.package_id).setValue("");
    }
    roomsSheet.getRange(rowNumber, roomsHeaderMap.updated_at).setValue(endTime);

    if (activeRoomSession) {
      setRowValues_(activeRoomSession.sheet, activeRoomSession.headerMap, activeRoomSession.rowNumber, {
        status: "closed",
        end_time: endTime,
        updated_at: endTime,
        closed_transaction_id: transaction ? transaction.transaction_id : prepayTxId,
      });

      var session = activeRoomSession.session;
      var lcIds = String(session.lc_ids || "").trim();
      if (lcIds) {
        var selectedLcIds = lcIds.split(",").map(function(id) { return id.trim(); }).filter(Boolean);
        var lcMasterSheet = ensureLcMasterSheet_();
        var lcMasterHeaders = getHeaderMap_(lcMasterSheet);
        var lcWorkLogsSheet = ensureLcWorkLogsSheet_();
        var lcWorkLogsHeaders = getHeaderMap_(lcWorkLogsSheet);
        
        selectedLcIds.forEach(function(selId) {
          if (selId === "PENDING") {
            return; // Skip pelepasan status dan work logs untuk LC pending
          }
          var rowNum = findRowByValue_(lcMasterSheet, lcMasterHeaders, "lc_id", selId);
          if (rowNum) {
            lcMasterSheet.getRange(rowNum, lcMasterHeaders.availability).setValue("available");
            lcMasterSheet.getRange(rowNum, lcMasterHeaders.updated_at).setValue(endTime);
          }
          
          var workLogRows = readSheetAsObjects_("LcWorkLogs");
          for (var rIdx = 0; rIdx < workLogRows.length; rIdx++) {
            var log = workLogRows[rIdx];
            if (
              String(log.session_id || "").trim() === String(session.session_id || "").trim() &&
              String(log.lc_id || "").trim() === selId &&
              log.status === "active"
            ) {
              var logRowNum = rIdx + 2;
              lcWorkLogsSheet.getRange(logRowNum, lcWorkLogsHeaders.status).setValue("done");
              var lcDurationMinutes = inferLcWorkLogDurationMinutes_(log) || Number(session.booked_duration_minutes) || durationMinutes;
              var lcClosedAt = resolveLcClosedAtByDuration_(log.created_at || session.start_time || startTime, lcDurationMinutes, sessionBillingEndTime);
              lcWorkLogsSheet.getRange(logRowNum, lcWorkLogsHeaders.closed_at).setValue(lcClosedAt);
              if (lcWorkLogsHeaders.duration_minutes) {
                lcWorkLogsSheet.getRange(logRowNum, lcWorkLogsHeaders.duration_minutes).setValue(lcDurationMinutes);
              }
              
              // No need to recalculate rate since it's already updated and correct in the log rate column
            }
          }
        });
      }
    }

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

function assignSessionLcs_(payload) {
  var request = payload || {};
  var roomId = String(request.room_id || "").trim();
  var changedBy = String(request.changed_by || "Kasir").trim();

  if (!roomId) {
    return { ok: false, success: false, error: "room_id wajib diisi." };
  }

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) {
    return { ok: false, success: false, error: "Sistem sedang memproses LC room lain. Coba lagi sebentar." };
  }

  try {
    var roomsSheet = getSheet_("Rooms");
    var roomsHeaderMap = getHeaderMap_(roomsSheet);
    var rowNumber = findRowByValue_(roomsSheet, roomsHeaderMap, "room_id", roomId);

    if (!rowNumber) {
      return { ok: false, success: false, error: "Ruangan tidak ditemukan." };
    }

    var room = getRowObject_(roomsSheet, roomsHeaderMap, rowNumber);
    var status = String(room.status || "").trim().toLowerCase();

    if (status !== "occupied") {
      return { ok: false, success: false, error: "Ruangan harus dalam status occupied." };
    }

    var sessionResult = findLatestRoomSessionForRoom_(roomId, ["active"]);
    if (!sessionResult) {
      return { ok: false, success: false, error: "Sesi aktif tidak ditemukan." };
    }

    var session = sessionResult.session;
    var now = toJakartaIsoString_(new Date());

    var newLcAssignments = parseLcAssignments_(request, Number(session.booked_duration_minutes) || 60);
    var newLcIds = newLcAssignments.map(function(assignment) {
      return String(assignment.lc_id || "").trim();
    }).filter(Boolean);
    
    var currentLcIdsRaw = String(session.lc_ids || "").trim();
    var currentLcIds = currentLcIdsRaw.split(",").map(function(id) { return id.trim(); }).filter(Boolean);

    var bookedCount = currentLcIds.length;
    var finalLcCount = Math.max(bookedCount, newLcIds.length);

    var lcMasterSheet = ensureLcMasterSheet_();
    var lcMasterHeaders = getHeaderMap_(lcMasterSheet);
    var lcMasterRows = readSheetAsObjects_("LcMaster");

    for (var i = 0; i < newLcIds.length; i++) {
      var newId = newLcIds[i];
      var foundLc = null;
      for (var idx = 0; idx < lcMasterRows.length; idx++) {
        if (String(lcMasterRows[idx].lc_id || "").trim() === newId) {
          foundLc = lcMasterRows[idx];
          break;
        }
      }
      if (!foundLc) {
        return { ok: false, success: false, error: "LC dengan ID " + newId + " tidak ditemukan." };
      }
      if (foundLc.status !== "active") {
        return { ok: false, success: false, error: "LC " + foundLc.lc_name + " sedang tidak aktif." };
      }
      if (foundLc.availability === "busy" && !currentLcIds.includes(newId)) {
        return { ok: false, success: false, error: "LC " + foundLc.lc_name + " sedang sibuk di room lain." };
      }
    }

    if (request.dry_run === true || String(request.dry_run || "").trim().toLowerCase() === "true") {
      return {
        ok: true,
        success: true,
        dry_run: true,
        message: "Validasi pilihan LC berhasil tanpa menyimpan perubahan.",
        room_id: roomId,
        session_id: session.session_id || "",
        session_status: session.status || "",
        lc_ids: newLcIds.join(","),
      };
    }

    var lcWorkLogsSheet = ensureLcWorkLogsSheet_();
    var lcWorkLogsHeaders = getHeaderMap_(lcWorkLogsSheet);

    currentLcIds.forEach(function(oldId) {
      if (oldId !== "PENDING" && !newLcIds.includes(oldId)) {
        // Free in LcMaster
        var rowNum = findRowByValue_(lcMasterSheet, lcMasterHeaders, "lc_id", oldId);
        if (rowNum) {
          lcMasterSheet.getRange(rowNum, lcMasterHeaders.availability).setValue("available");
          lcMasterSheet.getRange(rowNum, lcMasterHeaders.updated_at).setValue(now);
        }

        // Close work log in LcWorkLogs
        var workLogRows = readSheetAsObjects_("LcWorkLogs");
        for (var rIdx = 0; rIdx < workLogRows.length; rIdx++) {
          var log = workLogRows[rIdx];
          if (
            String(log.session_id || "").trim() === String(session.session_id || "").trim() &&
            String(log.lc_id || "").trim() === oldId &&
            log.status === "active"
          ) {
            var logRowNum = rIdx + 2;
            lcWorkLogsSheet.getRange(logRowNum, lcWorkLogsHeaders.status).setValue("done");
            lcWorkLogsSheet.getRange(logRowNum, lcWorkLogsHeaders.closed_at).setValue(now);
            
            // Calculate rate
            var hourlyRate = 0;
            for (var idx = 0; idx < lcMasterRows.length; idx++) {
              if (String(lcMasterRows[idx].lc_id || "").trim() === oldId) {
                hourlyRate = Number(lcMasterRows[idx].rate_per_room) || 0;
                break;
              }
            }
            if (hourlyRate > 0) {
              var startTimeText = log.created_at || session.start_time || now;
              var workDurationMinutes = calculateDurationMinutes_(startTimeText, now);
              var finalRate = Math.ceil(workDurationMinutes / 60) * hourlyRate;
              lcWorkLogsSheet.getRange(logRowNum, lcWorkLogsHeaders.rate).setValue(finalRate);
              if (lcWorkLogsHeaders.duration_minutes) {
                lcWorkLogsSheet.getRange(logRowNum, lcWorkLogsHeaders.duration_minutes).setValue(workDurationMinutes);
              }
              if (lcWorkLogsHeaders.rate_per_hour) {
                lcWorkLogsSheet.getRange(logRowNum, lcWorkLogsHeaders.rate_per_hour).setValue(hourlyRate);
              }
            }
          }
        }
      }
    });

    var workLogRows = readSheetAsObjects_("LcWorkLogs");

    // Ganti work log PENDING satu per satu dengan LC yang baru dipilih
    // Cari semua baris PENDING untuk session ini (dari belakang agar index tidak geser)
    var pendingLogIndexes = [];
    for (var rIdx = 0; rIdx < workLogRows.length; rIdx++) {
      var log = workLogRows[rIdx];
      if (
        String(log.session_id || "").trim() === String(session.session_id || "").trim() &&
        String(log.lc_id || "").trim() === "PENDING" &&
        log.status === "active"
      ) {
        pendingLogIndexes.push(rIdx);
      }
    }

    // Update baris PENDING yang ada dengan data LC nyata
    newLcAssignments.forEach(function(assignment, i) {
      var newId = String(assignment.lc_id || "").trim();
      var requestedDurationMinutes = normalizeLcDurationMinutes_(assignment.duration_minutes, Number(session.booked_duration_minutes) || 60);
      var foundLc = null;
      for (var idx = 0; idx < lcMasterRows.length; idx++) {
        if (String(lcMasterRows[idx].lc_id || "").trim() === newId) {
          foundLc = lcMasterRows[idx];
          break;
        }
      }

      var lcRowNum = findRowByValue_(lcMasterSheet, lcMasterHeaders, "lc_id", newId);
      if (lcRowNum) {
        lcMasterSheet.getRange(lcRowNum, lcMasterHeaders.availability).setValue("busy");
        lcMasterSheet.getRange(lcRowNum, lcMasterHeaders.updated_at).setValue(now);
      }

      var hourlyRate = foundLc ? (Number(foundLc.rate_per_room) || 0) : 0;
      if (i < pendingLogIndexes.length) {
        // Update baris PENDING yang sudah ada
        var pendingRowNum = pendingLogIndexes[i] + 2;
        lcWorkLogsSheet.getRange(pendingRowNum, lcWorkLogsHeaders.lc_id).setValue(newId);
        lcWorkLogsSheet.getRange(pendingRowNum, lcWorkLogsHeaders.lc_name).setValue(foundLc ? foundLc.lc_name : newId);
        
        // Calculate the rate based on full session booked duration since they replace a PENDING slot
        var rateForSession = calculateLcRateForDuration_(requestedDurationMinutes, hourlyRate);
        lcWorkLogsSheet.getRange(pendingRowNum, lcWorkLogsHeaders.rate).setValue(rateForSession);
        if (lcWorkLogsHeaders.duration_minutes) {
          lcWorkLogsSheet.getRange(pendingRowNum, lcWorkLogsHeaders.duration_minutes).setValue(requestedDurationMinutes);
        }
        if (lcWorkLogsHeaders.rate_per_hour) {
          lcWorkLogsSheet.getRange(pendingRowNum, lcWorkLogsHeaders.rate_per_hour).setValue(hourlyRate);
        }
      } else {
        // Check if an active work log already exists for this session and LC ID
        var existingLogIndex = -1;
        for (var wIdx = 0; wIdx < workLogRows.length; wIdx++) {
          var wLog = workLogRows[wIdx];
          if (
            String(wLog.session_id || "").trim() === String(session.session_id || "").trim() &&
            String(wLog.lc_id || "").trim() === newId &&
            wLog.status === "active"
          ) {
            existingLogIndex = wIdx;
            break;
          }
        }

        var rateForRemaining = calculateLcRateForDuration_(requestedDurationMinutes, hourlyRate);

        if (existingLogIndex >= 0) {
          var activeRowNum = existingLogIndex + 2;
          lcWorkLogsSheet.getRange(activeRowNum, lcWorkLogsHeaders.rate).setValue(rateForRemaining);
          if (lcWorkLogsHeaders.duration_minutes) {
            lcWorkLogsSheet.getRange(activeRowNum, lcWorkLogsHeaders.duration_minutes).setValue(requestedDurationMinutes);
          }
          if (lcWorkLogsHeaders.rate_per_hour) {
            lcWorkLogsSheet.getRange(activeRowNum, lcWorkLogsHeaders.rate_per_hour).setValue(hourlyRate);
          }
        } else {
          appendLcWorkLog_({
            log_id: "LWL-" + Utilities.formatDate(new Date(), "Asia/Jakarta", "yyyyMMddHHmmss") + "-" + newId + "-" + Math.floor(Math.random() * 100),
            session_id: session.session_id,
            lc_id: newId,
            lc_name: foundLc ? foundLc.lc_name : newId,
            rate: rateForRemaining,
            duration_minutes: requestedDurationMinutes,
            rate_per_hour: hourlyRate,
            status: "active",
            created_at: now,
          });
        }
      }
    });

    var finalLcIdsList = newLcIds.slice();
    while (finalLcIdsList.length < finalLcCount) {
      finalLcIdsList.push("PENDING");
    }
    var finalLcIdsStr = finalLcIdsList.join(",");

    setRowValues_(sessionResult.sheet, sessionResult.headerMap, sessionResult.rowNumber, {
      lc_ids: finalLcIdsStr,
      lc_assignments: serializeLcAssignments_(newLcAssignments),
      updated_at: now,
    });

    if (roomsHeaderMap.lc_ids) {
      roomsSheet.getRange(rowNumber, roomsHeaderMap.lc_ids).setValue(finalLcIdsStr);
    }
    roomsSheet.getRange(rowNumber, roomsHeaderMap.updated_at).setValue(now);

    return {
      ok: true,
      success: true,
      message: "Pilihan LC berhasil diperbarui.",
      lc_ids: finalLcIdsStr,
    };
  } finally {
    lock.releaseLock();
  }
}

function markTransactionPaid_(transactionId, paymentMethod, promoCode) {
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
  if (!lock.tryLock(2000)) {
    return { ok: false, error: "Sistem sedang memproses closing lain. Coba lagi sebentar." };
  }

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

    var existingDiscount = Number(transaction.promo_discount) || 0;
    var roomTotal = Number(transaction.room_total) || 0;
    var fnbTotal = Number(transaction.fnb_total) || 0;
    var lcTotal = Number(transaction.lc_total) || 0;

    var prCode = String(promoCode || "").trim().toUpperCase();
    var promoDiscount = existingDiscount;
    var appliedPromo = null;

    if (prCode) {
      var grossRoomTotal = existingDiscount > 0 ? roomTotal + existingDiscount : roomTotal;
      var promoRes = validatePromoCode_({ code: prCode, room_total: grossRoomTotal });
      if (!promoRes.ok || !promoRes.success) {
        return { ok: false, error: promoRes.error || "Gagal menerapkan kode promo." };
      }
      promoDiscount = promoRes.discount;
      appliedPromo = promoRes;

      roomTotal = Math.max(0, grossRoomTotal - promoDiscount);
    }

    var grandTotal = roomTotal + fnbTotal + lcTotal;

    sheet.getRange(rowNumber, headerMap.payment_method).setValue(paymentMethod);
    sheet.getRange(rowNumber, headerMap.payment_status).setValue("paid");

    if (prCode) {
      if (headerMap.room_total) {
        sheet.getRange(rowNumber, headerMap.room_total).setValue(roomTotal);
      }
      if (headerMap.grand_total) {
        sheet.getRange(rowNumber, headerMap.grand_total).setValue(grandTotal);
      }
      if (headerMap.promo_code) {
        sheet.getRange(rowNumber, headerMap.promo_code).setValue(prCode);
      }
      if (headerMap.promo_discount) {
        sheet.getRange(rowNumber, headerMap.promo_discount).setValue(promoDiscount);
      }
    }

    // Tandai voucher terpakai
    if (appliedPromo && String(appliedPromo.type).toLowerCase() === "voucher") {
      var promoSheet = ensurePromoMasterSheet_();
      var promoHeaderMap = getHeaderMap_(promoSheet);
      var promoRowNum = findRowByValue_(promoSheet, promoHeaderMap, "code", prCode);
      if (promoRowNum) {
        var now = toJakartaIsoString_(new Date());
        setRowValues_(promoSheet, promoHeaderMap, promoRowNum, {
          used_in_transaction_id: transactionId,
          used_at: now,
          status: "inactive"
        });
      }
    }

    return {
      ok: true,
      message: "Pembayaran berhasil ditandai lunas.",
      transaction: getRowObject_(sheet, headerMap, rowNumber),
    };
  } finally {
    lock.releaseLock();
  }
}

function updateTransactionDetails_(payload) {
  var transactionId = String(payload.transaction_id || "").trim();
  if (!transactionId) return { ok: false, error: "transaction_id wajib diisi." };

  var sheet = getSheet_("Transactions");
  var headerMap = getHeaderMap_(sheet);
  var rowNumber = findRowByValue_(sheet, headerMap, "transaction_id", transactionId);

  if (!rowNumber) return { ok: false, error: "Transaksi tidak ditemukan." };

  if (payload.room_total !== undefined && headerMap.room_total) sheet.getRange(rowNumber, headerMap.room_total).setValue(payload.room_total);
  if (payload.fnb_total !== undefined && headerMap.fnb_total) sheet.getRange(rowNumber, headerMap.fnb_total).setValue(payload.fnb_total);
  if (payload.lc_total !== undefined && headerMap.lc_total) sheet.getRange(rowNumber, headerMap.lc_total).setValue(payload.lc_total);
  if (payload.promo_code !== undefined && headerMap.promo_code) sheet.getRange(rowNumber, headerMap.promo_code).setValue(payload.promo_code);
  if (payload.promo_discount !== undefined && headerMap.promo_discount) sheet.getRange(rowNumber, headerMap.promo_discount).setValue(payload.promo_discount);
  if (payload.grand_total !== undefined && headerMap.grand_total) sheet.getRange(rowNumber, headerMap.grand_total).setValue(payload.grand_total);
  if (payload.fnb_order_ids !== undefined && headerMap.fnb_order_ids) sheet.getRange(rowNumber, headerMap.fnb_order_ids).setValue(payload.fnb_order_ids);
  if (payload.payment_status !== undefined && headerMap.payment_status) sheet.getRange(rowNumber, headerMap.payment_status).setValue(payload.payment_status);

  return {
    ok: true,
    message: "Transaksi berhasil diperbarui.",
    transaction: getRowObject_(sheet, headerMap, rowNumber),
  };
}

function getTransactionLcEditContext_(transactionId) {
  var normalizedTransactionId = String(transactionId || "").trim();
  if (!normalizedTransactionId) {
    return { ok: false, success: false, error: "transaction_id wajib diisi." };
  }

  var transactionsSheet = getSheet_("Transactions");
  var transactionHeaders = getHeaderMap_(transactionsSheet);
  var transactionRow = findRowByValue_(
    transactionsSheet,
    transactionHeaders,
    "transaction_id",
    normalizedTransactionId
  );

  if (!transactionRow) {
    return { ok: false, success: false, error: "Transaksi tidak ditemukan." };
  }

  var transaction = getRowObject_(transactionsSheet, transactionHeaders, transactionRow);
  if (String(transaction.transaction_type || "").trim().toLowerCase() !== "session_checkout") {
    return {
      ok: false,
      success: false,
      error: "Edit durasi LC hanya tersedia untuk transaksi sesi room.",
    };
  }

  if (!sheetExists_(ROOM_SESSIONS_SHEET)) {
    return { ok: false, success: false, error: "Riwayat sesi room tidak ditemukan." };
  }

  var sessionsSheet = getSheet_(ROOM_SESSIONS_SHEET);
  var sessionHeaders = getHeaderMap_(sessionsSheet);
  var session = null;
  var sessionRow = sessionHeaders.closed_transaction_id
    ? findRowByValue_(
      sessionsSheet,
      sessionHeaders,
      "closed_transaction_id",
      normalizedTransactionId
    )
    : 0;

  if (sessionRow) {
    session = getRowObject_(sessionsSheet, sessionHeaders, sessionRow);
  } else {
    var sessionRows = readSheetAsObjects_(ROOM_SESSIONS_SHEET);
    for (var sessionIndex = sessionRows.length - 1; sessionIndex >= 0; sessionIndex--) {
      var candidate = sessionRows[sessionIndex];
      if (
        String(candidate.room_id || "").trim() === String(transaction.room_id || "").trim()
        && normalizeFnbOrderDateTime_(candidate.start_time)
          === normalizeFnbOrderDateTime_(transaction.start_time)
      ) {
        session = candidate;
        sessionRow = sessionIndex + 2;
        break;
      }
    }
  }

  if (!session || !sessionRow) {
    return { ok: false, success: false, error: "Sesi room untuk transaksi tidak ditemukan." };
  }

  if (!sheetExists_("LcWorkLogs")) {
    return { ok: false, success: false, error: "Work log LC tidak ditemukan." };
  }

  var workLogsSheet = ensureLcWorkLogsSheet_();
  var workLogHeaders = getHeaderMap_(workLogsSheet);
  var workLogRows = readSheetAsObjects_("LcWorkLogs");
  var canonicalLogsByLcId = {};
  var canonicalOrder = [];

  workLogRows.forEach(function (log, index) {
    if (String(log.session_id || "").trim() !== String(session.session_id || "").trim()) {
      return;
    }

    var lcId = String(log.lc_id || "").trim();
    var status = String(log.status || "").trim().toLowerCase();
    if (!lcId || lcId === "PENDING" || status === "cancelled") {
      return;
    }

    if (!canonicalLogsByLcId[lcId]) {
      canonicalOrder.push(lcId);
      canonicalLogsByLcId[lcId] = {
        row_number: index + 2,
        log: log,
      };
      return;
    }

    if (
      status === "active"
      && String(canonicalLogsByLcId[lcId].log.status || "").trim().toLowerCase() !== "active"
    ) {
      canonicalLogsByLcId[lcId] = {
        row_number: index + 2,
        log: log,
      };
    }
  });

  var lcLogs = canonicalOrder.map(function (lcId) {
    return canonicalLogsByLcId[lcId];
  });

  if (lcLogs.length === 0) {
    return {
      ok: false,
      success: false,
      error: "Transaksi tidak memiliki work log LC yang dapat diedit.",
    };
  }

  var closingReference = findTransactionClosingReference_(normalizedTransactionId);
  var payrollReferences = lcLogs.filter(function (entry) {
    return !!String(entry.log.payroll_id || "").trim();
  }).map(function (entry) {
    return String(entry.log.payroll_id || "").trim();
  });
  var paymentStatus = String(transaction.payment_status || "").trim().toLowerCase();
  var blockedReason = "";

  if (closingReference) {
    blockedReason = "Transaksi sudah masuk closing kasir dan tidak dapat diedit.";
  } else if (payrollReferences.length > 0) {
    blockedReason = "Pendapatan LC sudah masuk payroll dan tidak dapat diedit.";
  } else if (paymentStatus !== "unpaid" && paymentStatus !== "paid") {
    blockedReason = "Status pembayaran transaksi tidak mendukung edit durasi LC.";
  }

  return {
    ok: true,
    success: true,
    transaction: transaction,
    transaction_sheet: transactionsSheet,
    transaction_headers: transactionHeaders,
    transaction_row: transactionRow,
    session: session,
    session_sheet: sessionsSheet,
    session_headers: sessionHeaders,
    session_row: sessionRow,
    work_logs_sheet: workLogsSheet,
    work_log_headers: workLogHeaders,
    lc_logs: lcLogs,
    closing_reference: closingReference,
    payroll_references: payrollReferences,
    blocked_reason: blockedReason,
    can_edit: !blockedReason,
    requires_admin_pin: paymentStatus === "paid" && !blockedReason,
  };
}

function serializeTransactionLcEditContext_(context) {
  var currentLogTotal = context.lc_logs.reduce(function (total, entry) {
    return total + (Number(entry.log.rate) || 0);
  }, 0);

  return {
    ok: true,
    success: true,
    transaction_id: context.transaction.transaction_id || "",
    session_id: context.session.session_id || "",
    room_id: context.transaction.room_id || "",
    room_name: context.transaction.room_name || "",
    payment_status: String(context.transaction.payment_status || "").trim().toLowerCase(),
    current_lc_total: Number(context.transaction.lc_total) || 0,
    current_grand_total: Number(context.transaction.grand_total) || 0,
    current_work_log_total: currentLogTotal,
    billing_adjustment: (Number(context.transaction.lc_total) || 0) - currentLogTotal,
    can_edit: context.can_edit,
    requires_admin_pin: context.requires_admin_pin,
    blocked_reason: context.blocked_reason || "",
    lc_logs: context.lc_logs.map(function (entry) {
      return {
        log_id: entry.log.log_id || "",
        lc_id: entry.log.lc_id || "",
        lc_name: entry.log.lc_name || entry.log.lc_id || "",
        duration_minutes: inferLcWorkLogDurationMinutes_(entry.log) || 60,
        rate_per_hour: resolveLcWorkLogHourlyRate_(entry.log),
        rate: Number(entry.log.rate) || 0,
        status: String(entry.log.status || "").trim().toLowerCase(),
        payroll_id: String(entry.log.payroll_id || "").trim(),
      };
    }),
  };
}

function resolveLcWorkLogHourlyRate_(log) {
  var explicitRate = Number(log && log.rate_per_hour) || 0;
  if (explicitRate > 0) {
    return explicitRate;
  }

  var durationMinutes = inferLcWorkLogDurationMinutes_(log || {}) || 60;
  var billedHours = Math.max(1, Math.ceil(durationMinutes / 60));
  var totalRate = Number(log && log.rate) || 0;
  return totalRate > 0 ? totalRate / billedHours : 0;
}

function getTransactionLcEditDetails_(transactionId) {
  var context = getTransactionLcEditContext_(transactionId);
  if (!context.ok) {
    return context;
  }

  return serializeTransactionLcEditContext_(context);
}

function normalizeTransactionLcDurationAssignments_(assignments, context) {
  if (!Array.isArray(assignments)) {
    return { ok: false, error: "Daftar durasi LC wajib diisi." };
  }

  var expectedByLcId = {};
  context.lc_logs.forEach(function (entry) {
    expectedByLcId[String(entry.log.lc_id || "").trim()] = entry;
  });

  var normalized = [];
  var seen = {};

  for (var index = 0; index < assignments.length; index++) {
    var assignment = assignments[index] || {};
    var lcId = String(assignment.lc_id || "").trim();
    var durationMinutes = Math.round(Number(assignment.duration_minutes));

    if (!lcId || !expectedByLcId[lcId]) {
      return { ok: false, error: "LC pada permintaan tidak cocok dengan transaksi." };
    }
    if (seen[lcId]) {
      return { ok: false, error: "LC yang sama tidak boleh dikirim lebih dari sekali." };
    }
    if (
      !isFinite(durationMinutes)
      || durationMinutes < 30
      || durationMinutes > 720
      || durationMinutes % 30 !== 0
    ) {
      return {
        ok: false,
        error: "Durasi LC wajib antara 30 menit dan 12 jam dengan kelipatan 30 menit.",
      };
    }

    seen[lcId] = true;
    normalized.push({
      lc_id: lcId,
      duration_minutes: durationMinutes,
      context_entry: expectedByLcId[lcId],
    });
  }

  if (normalized.length !== context.lc_logs.length) {
    return { ok: false, error: "Semua LC pada transaksi wajib memiliki durasi." };
  }

  return { ok: true, assignments: normalized };
}

function clearLcWorkReportCacheForTransaction_(transaction) {
  try {
    var operationalDate = resolveTransactionOperationalDateString_(transaction);
    var cache = CacheService.getScriptCache();
    var keys = ["lc-work-reports-v2:all:all:all"];

    if (operationalDate) {
      keys.push(
        "lc-work-reports-v2:today:" + operationalDate + ":" + operationalDate,
        "lc-work-reports-v2:yesterday:" + operationalDate + ":" + operationalDate,
        "lc-work-reports-v2:custom:" + operationalDate + ":" + operationalDate
      );
    }

    cache.removeAll(keys);
  } catch (error) {
    Logger.log("Gagal membersihkan cache laporan LC: " + error.message);
  }
}

function updateTransactionLcDurations_(payload) {
  var request = payload || {};
  var transactionId = String(request.transaction_id || "").trim();
  var changedBy = String(request.changed_by || "Kasir").trim() || "Kasir";
  var reason = String(request.reason || "").trim();

  if (!transactionId) {
    return { ok: false, success: false, error: "transaction_id wajib diisi." };
  }
  if (reason.length < 3) {
    return { ok: false, success: false, error: "Alasan perubahan minimal 3 karakter." };
  }

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    return {
      ok: false,
      success: false,
      error: "Sistem sedang memproses perubahan transaksi lain. Coba lagi sebentar.",
    };
  }

  try {
    var context = getTransactionLcEditContext_(transactionId);
    if (!context.ok) {
      return context;
    }
    if (!context.can_edit) {
      return {
        ok: false,
        success: false,
        error: context.blocked_reason,
        block_reason: context.blocked_reason,
      };
    }

    var requiredRole = context.requires_admin_pin ? "manager" : "cashier";
    var authorizationPin = context.requires_admin_pin
      ? request.admin_pin
      : request.operator_pin;
    var requestedAction = context.requires_admin_pin
      ? "edit_paid_transaction_lc_duration"
      : "edit_unpaid_transaction_lc_duration";
    var auth = validateAdminPinPayload_(
      authorizationPin,
      requiredRole,
      requestedAction,
      changedBy,
      true
    );
    if (!auth.success) {
      return {
        ok: false,
        success: false,
        error: auth.message,
        block_reason: auth.block_reason,
      };
    }
    if (auth.employee && auth.employee.employee_name) {
      changedBy = auth.employee.employee_name;
    }

    var normalizedResult = normalizeTransactionLcDurationAssignments_(
      request.assignments,
      context
    );
    if (!normalizedResult.ok) {
      return { ok: false, success: false, error: normalizedResult.error };
    }

    var oldLogTotal = 0;
    var newLogTotal = 0;
    var changes = [];

    normalizedResult.assignments.forEach(function (assignment) {
      var log = assignment.context_entry.log;
      var hourlyRate = resolveLcWorkLogHourlyRate_(log);
      if (hourlyRate <= 0) {
        throw new Error("Tarif per jam LC tidak valid: " + (log.lc_name || assignment.lc_id));
      }

      var oldDuration = inferLcWorkLogDurationMinutes_(log) || 60;
      var oldRate = Number(log.rate) || 0;
      var newRate = calculateLcRateForDuration_(assignment.duration_minutes, hourlyRate);

      oldLogTotal += oldRate;
      newLogTotal += newRate;
      changes.push({
        lc_id: assignment.lc_id,
        lc_name: log.lc_name || assignment.lc_id,
        row_number: assignment.context_entry.row_number,
        old_duration_minutes: oldDuration,
        new_duration_minutes: assignment.duration_minutes,
        rate_per_hour: hourlyRate,
        old_rate: oldRate,
        new_rate: newRate,
      });
    });

    var oldLcTotal = Number(context.transaction.lc_total) || 0;
    var oldGrandTotal = Number(context.transaction.grand_total) || 0;
    var billingAdjustment = oldLcTotal - oldLogTotal;
    var newLcTotal = Math.max(0, newLogTotal + billingAdjustment);
    var newGrandTotal = Math.max(0, oldGrandTotal + (newLcTotal - oldLcTotal));
    var hasChanges = changes.some(function (change) {
      return change.old_duration_minutes !== change.new_duration_minutes
        || change.old_rate !== change.new_rate;
    }) || oldLcTotal !== newLcTotal || oldGrandTotal !== newGrandTotal;

    if (request.dry_run === true || String(request.dry_run || "").trim().toLowerCase() === "true") {
      return {
        ok: true,
        success: true,
        dry_run: true,
        message: "Preview perubahan durasi LC berhasil dihitung.",
        changes: changes,
        old_lc_total: oldLcTotal,
        new_lc_total: newLcTotal,
        old_grand_total: oldGrandTotal,
        new_grand_total: newGrandTotal,
      };
    }

    if (!hasChanges) {
      return {
        ok: true,
        success: true,
        idempotent_replay: true,
        message: "Durasi LC sudah sesuai dan tidak ada perubahan.",
        details: serializeTransactionLcEditContext_(context),
      };
    }

    var oldSessionValues = {
      lc_ids: context.session.lc_ids || "",
      lc_assignments: context.session.lc_assignments || "",
      updated_at: context.session.updated_at || "",
    };
    var updatedTransaction = null;

    try {
      changes.forEach(function (change) {
        context.work_logs_sheet
          .getRange(change.row_number, context.work_log_headers.duration_minutes)
          .setValue(change.new_duration_minutes);
        context.work_logs_sheet
          .getRange(change.row_number, context.work_log_headers.rate)
          .setValue(change.new_rate);
      });

      setRowValues_(
        context.session_sheet,
        context.session_headers,
        context.session_row,
        {
          lc_ids: changes.map(function (change) { return change.lc_id; }).join(","),
          lc_assignments: serializeLcAssignments_(changes.map(function (change) {
            return {
              lc_id: change.lc_id,
              duration_minutes: change.new_duration_minutes,
            };
          })),
          updated_at: toJakartaIsoString_(new Date()),
        }
      );

      context.transaction_sheet
        .getRange(context.transaction_row, context.transaction_headers.lc_total)
        .setValue(newLcTotal);
      context.transaction_sheet
        .getRange(context.transaction_row, context.transaction_headers.grand_total)
        .setValue(newGrandTotal);

      updatedTransaction = getRowObject_(
        context.transaction_sheet,
        context.transaction_headers,
        context.transaction_row
      );
    } catch (writeError) {
      try {
        changes.forEach(function (change) {
          context.work_logs_sheet
            .getRange(change.row_number, context.work_log_headers.duration_minutes)
            .setValue(change.old_duration_minutes);
          context.work_logs_sheet
            .getRange(change.row_number, context.work_log_headers.rate)
            .setValue(change.old_rate);
        });
        setRowValues_(
          context.session_sheet,
          context.session_headers,
          context.session_row,
          oldSessionValues
        );
        context.transaction_sheet
          .getRange(context.transaction_row, context.transaction_headers.lc_total)
          .setValue(oldLcTotal);
        context.transaction_sheet
          .getRange(context.transaction_row, context.transaction_headers.grand_total)
          .setValue(oldGrandTotal);
      } catch (rollbackError) {
        Logger.log("Rollback edit durasi LC gagal: " + rollbackError.message);
      }
      throw writeError;
    }

    try {
      appendMasterDataAuditLog_({
        entity_type: "transaction",
        entity_id: transactionId,
        entity_name: context.transaction.room_name || "",
        action_type: "edit_lc_duration",
        old_value: {
          lc_total: oldLcTotal,
          grand_total: oldGrandTotal,
          lc_logs: changes.map(function (change) {
            return {
              lc_id: change.lc_id,
              duration_minutes: change.old_duration_minutes,
              rate: change.old_rate,
            };
          }),
        },
        new_value: {
          lc_total: newLcTotal,
          grand_total: newGrandTotal,
          lc_logs: changes.map(function (change) {
            return {
              lc_id: change.lc_id,
              duration_minutes: change.new_duration_minutes,
              rate: change.new_rate,
            };
          }),
        },
        changed_by: changedBy,
        note: reason,
        result: "success",
      });
    } catch (auditError) {
      Logger.log("Audit edit durasi LC gagal: " + auditError.message);
    }

    clearLcWorkReportCacheForTransaction_(updatedTransaction);

    return {
      ok: true,
      success: true,
      message: "Durasi LC dan total transaksi berhasil diperbarui.",
      transaction: updatedTransaction,
      changes: changes,
      old_lc_total: oldLcTotal,
      new_lc_total: newLcTotal,
      old_grand_total: oldGrandTotal,
      new_grand_total: newGrandTotal,
    };
  } catch (error) {
    return {
      ok: false,
      success: false,
      error: error.message || "Gagal memperbarui durasi LC.",
    };
  } finally {
    lock.releaseLock();
  }
}

function ensureDeletedTransactionsSheet_(transactionHeaders) {
  var archiveHeaders = (transactionHeaders || []).slice();
  ["deleted_at", "deleted_by", "delete_reason"].forEach(function (header) {
    if (archiveHeaders.indexOf(header) === -1) {
      archiveHeaders.push(header);
    }
  });
  return ensureSheetColumns_("DeletedTransactions", archiveHeaders);
}

function findTransactionClosingReference_(transactionId) {
  if (!sheetExists_("CashierClosingTransactions")) {
    return null;
  }

  return readSheetAsObjects_("CashierClosingTransactions").find(function (row) {
    return String(row.transaction_id || "").trim() === String(transactionId || "").trim();
  }) || null;
}

function restoreStockMovementsForDeletedTransaction_(transactionId, deletedBy, deletedAt) {
  if (!sheetExists_("StockMovements")) {
    return [];
  }

  var allMovements = readSheetAsObjects_("StockMovements");
  var sourceMovements = allMovements.filter(function (movement) {
    return String(movement.reference_id || "").trim() === String(transactionId || "").trim()
      && String(movement.movement_type || "").trim().toLowerCase() === "out"
      && Number(movement.qty_change) < 0;
  });
  var reversalReferenceId = "DELETE-" + transactionId;
  var requiredByStockItem = {};
  var alreadyRestoredByStockItem = {};

  sourceMovements.forEach(function (source) {
    var stockItemId = String(source.stock_item_id || "").trim();
    requiredByStockItem[stockItemId] = (requiredByStockItem[stockItemId] || 0)
      + Math.abs(Number(source.qty_change) || 0);
  });
  allMovements.forEach(function (movement) {
    if (
      String(movement.reference_id || "").trim() === reversalReferenceId
      && String(movement.movement_type || "").trim().toLowerCase() === "in"
      && Number(movement.qty_change) > 0
    ) {
      var stockItemId = String(movement.stock_item_id || "").trim();
      alreadyRestoredByStockItem[stockItemId] = (alreadyRestoredByStockItem[stockItemId] || 0)
        + Number(movement.qty_change);
    }
  });
  var inventoryMap = getInventoryMap_();
  var restoredMovements = [];

  Object.keys(requiredByStockItem).forEach(function (stockItemId) {
    var inventory = inventoryMap[stockItemId] || inventoryMap[stockItemId.toLowerCase()];
    if (!inventory) {
      throw new Error("Inventory untuk pembalikan stok tidak ditemukan: " + stockItemId);
    }

    var restoredQty = requiredByStockItem[stockItemId] - (alreadyRestoredByStockItem[stockItemId] || 0);
    if (restoredQty <= 0) {
      return;
    }
    var stockBefore = toStockNumber_(inventory.stock_qty);
    var stockAfter = stockBefore + restoredQty;
    inventory.sheet.getRange(inventory.row_number, inventory.header_map.stock_qty).setValue(stockAfter);
    if (inventory.header_map.updated_at) {
      inventory.sheet.getRange(inventory.row_number, inventory.header_map.updated_at).setValue(deletedAt);
    }
    inventory.stock_qty = stockAfter;

    var reversal = {
      movement_id: generateStockMovementId_(),
      created_at: deletedAt,
      stock_item_id: inventory.stock_item_id,
      stock_item_name: inventory.stock_item_name,
      movement_type: "in",
      reference_type: "transaction",
      reference_id: reversalReferenceId,
      qty_change: restoredQty,
      stock_before: stockBefore,
      stock_after: stockAfter,
      note: "Pembalikan stok karena transaksi dihapus: " + transactionId,
      cashier_name: deletedBy,
    };
    appendStockMovement_(reversal);
    restoredMovements.push(reversal);
  });

  return restoredMovements;
}

function cancelUnreferencedFnbOrdersForDeletedTransaction_(transaction, remainingTransactions, deletedBy, reason, deletedAt) {
  var orderIds = parseCommaSeparatedIds_(transaction.fnb_order_ids);
  if (orderIds.length === 0 || !sheetExists_("FnbOrders")) {
    return [];
  }

  var referencedByOtherTransaction = {};
  (remainingTransactions || []).forEach(function (otherTransaction) {
    parseCommaSeparatedIds_(otherTransaction.fnb_order_ids).forEach(function (orderId) {
      referencedByOtherTransaction[orderId] = true;
    });
  });
  var ordersSheet = ensureFnbOrdersSheetColumns_();
  var orderHeaders = getHeaderMap_(ordersSheet);
  var cancelledOrderIds = [];

  orderIds.forEach(function (orderId) {
    if (referencedByOtherTransaction[orderId]) {
      return;
    }
    var rowNumber = findRowByValue_(ordersSheet, orderHeaders, "order_id", orderId);
    if (!rowNumber) {
      return;
    }
    setRowValues_(ordersSheet, orderHeaders, rowNumber, {
      order_status: "cancelled",
      cancel_reason: "Transaksi dihapus owner: " + reason,
      cancelled_by: deletedBy,
      cancelled_at: deletedAt,
      updated_at: deletedAt,
    });
    cancelledOrderIds.push(orderId);
  });

  if (cancelledOrderIds.length > 0 && sheetExists_("LcSalesBonusLogs")) {
    var bonusSheet = ensureLcSalesBonusLogsSheet_();
    var bonusHeaders = getHeaderMap_(bonusSheet);
    var bonusRows = readSheetAsObjects_("LcSalesBonusLogs");
    bonusRows.forEach(function (bonus, index) {
      if (
        cancelledOrderIds.indexOf(String(bonus.order_id || "").trim()) !== -1 &&
        !String(bonus.voided_at || "").trim()
      ) {
        setRowValues_(bonusSheet, bonusHeaders, index + 2, {
          voided_at: deletedAt,
          void_reason: "Transaksi dihapus owner: " + reason,
        });
      }
    });
  }

  return cancelledOrderIds;
}

function releasePromoForDeletedTransaction_(transactionId, deletedAt) {
  if (!sheetExists_("PromoMaster")) {
    return false;
  }

  var promoSheet = ensurePromoMasterSheet_();
  var promoHeaders = getHeaderMap_(promoSheet);
  var promoRows = readSheetAsObjects_("PromoMaster");
  var released = false;
  promoRows.forEach(function (promo, index) {
    if (String(promo.used_in_transaction_id || "").trim() === String(transactionId || "").trim()) {
      setRowValues_(promoSheet, promoHeaders, index + 2, {
        used_in_transaction_id: "",
        used_at: "",
        status: "active",
        updated_at: deletedAt,
      });
      released = true;
    }
  });
  return released;
}

function unlinkDeletedTransactionFromSession_(transactionId, deletedAt, reason) {
  if (!sheetExists_(ROOM_SESSIONS_SHEET)) {
    return "";
  }

  var sheet = ensureRoomSessionsSheet_();
  var headerMap = getHeaderMap_(sheet);
  var rows = readSheetAsObjects_(ROOM_SESSIONS_SHEET);
  var sessionId = "";
  rows.forEach(function (session, index) {
    var closedId = String(session.closed_transaction_id || "").trim();
    var prepayId = String(session.prepayment_transaction_id || "").trim();
    if (closedId !== transactionId && prepayId !== transactionId) {
      return;
    }
    var updates = {
      updated_at: deletedAt,
      note: [String(session.note || "").trim(), "Transaksi dihapus owner: " + reason].filter(Boolean).join(" | "),
    };
    if (closedId === transactionId) {
      updates.closed_transaction_id = "";
    }
    if (prepayId === transactionId) {
      updates.prepayment_transaction_id = "";
    }
    setRowValues_(sheet, headerMap, index + 2, updates);
    sessionId = session.session_id || sessionId;
  });
  return sessionId;
}

function deleteTransaction_(payload) {
  var request = payload || {};
  var transactionId = String(request.transaction_id || "").trim();
  var reason = String(request.reason || "").trim();
  var confirmation = String(request.confirmation || "").trim().toUpperCase();

  if (!transactionId) {
    return masterBlockedResponse_("transaction_id wajib diisi.", "EMPTY_TRANSACTION_ID");
  }
  if (reason.length < 5) {
    return masterBlockedResponse_("Alasan penghapusan minimal 5 karakter.", "DELETE_REASON_REQUIRED");
  }
  if (confirmation !== "HAPUS") {
    return masterBlockedResponse_("Konfirmasi penghapusan tidak valid.", "DELETE_CONFIRMATION_REQUIRED");
  }

  var auth = validateAdminPinPayload_(
    request.owner_pin,
    "owner",
    "delete_transaction",
    request.changed_by || "Owner",
    true
  );
  if (!auth.ok) {
    return masterBlockedResponse_(auth.message || "PIN owner tidak valid.", auth.block_reason || "INVALID_OWNER_PIN");
  }

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(3000)) {
    return masterBlockedResponse_("Sistem sedang memproses transaksi lain. Coba lagi sebentar.", "LOCK_BUSY");
  }

  try {
    var transactionsSheet = ensureTransactionsSheetColumns_();
    var transactionHeaders = getSheetHeaders_(transactionsSheet);
    var transactionHeaderMap = getHeaderMap_(transactionsSheet);
    var rowNumber = findRowByValue_(transactionsSheet, transactionHeaderMap, "transaction_id", transactionId);
    if (!rowNumber) {
      return masterBlockedResponse_("Transaksi tidak ditemukan atau sudah dihapus.", "TRANSACTION_NOT_FOUND");
    }

    var transaction = getRowObject_(transactionsSheet, transactionHeaderMap, rowNumber);
    if (getTransactionAmount_(transaction) < 0) {
      return masterBlockedResponse_("Transaksi refund tidak dapat dihapus dari menu ini.", "REFUND_DELETE_BLOCKED");
    }

    var closingReference = findTransactionClosingReference_(transactionId);
    if (closingReference) {
      appendMasterDataAuditLog_({
        entity_type: "transaction",
        entity_id: transactionId,
        entity_name: transaction.room_name || transactionId,
        action_type: "delete_permanent",
        old_value: transaction,
        new_value: "",
        changed_by: auth.employee.employee_name,
        note: reason,
        result: "blocked",
        block_reason: "TRANSACTION_ALREADY_CLOSED",
      });
      return masterBlockedResponse_(
        "Transaksi sudah masuk closing kasir " + (closingReference.closing_id || "") + " dan tidak dapat dihapus.",
        "TRANSACTION_ALREADY_CLOSED",
        { closing_id: closingReference.closing_id || "" }
      );
    }

    var deletedAt = toJakartaIsoString_(new Date());
    var deletedBy = auth.employee.employee_name || request.changed_by || "Owner";
    var remainingTransactions = readSheetAsObjects_("Transactions").filter(function (item) {
      return String(item.transaction_id || "").trim() !== transactionId;
    });
    var transactionOrderIds = parseCommaSeparatedIds_(transaction.fnb_order_ids);
    var linkedTransactions = remainingTransactions.filter(function (item) {
      var otherOrderIds = parseCommaSeparatedIds_(item.fnb_order_ids);
      return transactionOrderIds.some(function (orderId) {
        return otherOrderIds.indexOf(orderId) !== -1;
      });
    });
    if (linkedTransactions.length > 0) {
      return masterBlockedResponse_(
        "Transaksi memiliki transaksi lain yang memakai order F&B yang sama dan tidak dapat dihapus langsung.",
        "TRANSACTION_HAS_LINKED_TRANSACTION",
        {
          linked_transaction_ids: linkedTransactions.map(function (item) {
            return item.transaction_id || "";
          }).filter(Boolean),
        }
      );
    }
    var archiveSheet = ensureDeletedTransactionsSheet_(transactionHeaders);
    var archiveHeaderMap = getHeaderMap_(archiveSheet);
    var archivedRowNumber = findRowByValue_(archiveSheet, archiveHeaderMap, "transaction_id", transactionId);
    if (!archivedRowNumber) {
      appendObjectRow_(archiveSheet, Object.assign({}, transaction, {
        deleted_at: deletedAt,
        deleted_by: deletedBy,
        delete_reason: reason,
      }));
    }

    var restoredMovements = restoreStockMovementsForDeletedTransaction_(transactionId, deletedBy, deletedAt);
    var cancelledOrderIds = cancelUnreferencedFnbOrdersForDeletedTransaction_(
      transaction,
      remainingTransactions,
      deletedBy,
      reason,
      deletedAt
    );
    var promoReleased = releasePromoForDeletedTransaction_(transactionId, deletedAt);
    var sessionId = unlinkDeletedTransactionFromSession_(transactionId, deletedAt, reason);

    transactionsSheet.deleteRow(rowNumber);
    appendMasterDataAuditLog_({
      entity_type: "transaction",
      entity_id: transactionId,
      entity_name: transaction.room_name || transactionId,
      action_type: "delete_permanent",
      old_value: transaction,
      new_value: {
        archived_sheet: "DeletedTransactions",
        restored_stock_movement_count: restoredMovements.length,
        cancelled_order_ids: cancelledOrderIds,
        promo_released: promoReleased,
        session_id: sessionId,
      },
      changed_by: deletedBy,
      note: reason,
      result: "success",
      block_reason: "",
    });

    return {
      ok: true,
      success: true,
      message: "Transaksi berhasil dihapus dan diarsipkan.",
      transaction_id: transactionId,
      archived_sheet: "DeletedTransactions",
      restored_stock_movement_count: restoredMovements.length,
      cancelled_order_ids: cancelledOrderIds,
      promo_released: promoReleased,
      session_id: sessionId,
    };
  } catch (error) {
    appendMasterDataAuditLog_({
      entity_type: "transaction",
      entity_id: transactionId,
      entity_name: transactionId,
      action_type: "delete_permanent",
      old_value: "",
      new_value: "",
      changed_by: auth.employee.employee_name || "Owner",
      note: reason,
      result: "blocked",
      block_reason: "DELETE_FAILED: " + error.message,
    });
    return masterBlockedResponse_("Penghapusan transaksi gagal: " + error.message, "DELETE_FAILED");
  } finally {
    lock.releaseLock();
  }
}

function getInventoryAudits_(status, limit) {
  ensureInventoryAuditSheets_();

  var normalizedStatus = String(status || "").trim().toLowerCase();
  var maxRows = Math.max(1, Math.min(Number(limit) || 20, 100));
  var audits = readSheetAsObjectsOrEmpty_("InventoryAudits")
    .map(normalizeInventoryAudit_)
    .filter(function (audit) {
      return audit.audit_id && (!normalizedStatus || normalizedStatus === "all" || audit.status === normalizedStatus);
    })
    .sort(function (first, second) {
      return new Date(second.started_at || second.submitted_at || 0).getTime() - new Date(first.started_at || first.submitted_at || 0).getTime();
    })
    .slice(0, maxRows);

  return {
    ok: true,
    success: true,
    audits: audits,
    summary: buildInventoryAuditListSummary_(audits),
  };
}

function getInventoryAuditDetails_(auditId) {
  ensureInventoryAuditSheets_();

  var normalizedAuditId = String(auditId || "").trim();

  if (!normalizedAuditId) {
    return {
      ok: false,
      success: false,
      error: "audit_id wajib diisi.",
    };
  }

  var auditSheet = ensureInventoryAuditsSheet_();
  var auditHeaderMap = getHeaderMap_(auditSheet);
  var auditRow = findRowByValue_(auditSheet, auditHeaderMap, "audit_id", normalizedAuditId);

  if (!auditRow) {
    return {
      ok: false,
      success: false,
      error: "Audit inventory tidak ditemukan.",
    };
  }

  return {
    ok: true,
    success: true,
    audit: normalizeInventoryAudit_(getRowObject_(auditSheet, auditHeaderMap, auditRow)),
    lines: getInventoryAuditLinesByAuditId_(normalizedAuditId),
  };
}

function createInventoryAudit_(payload) {
  var request = payload || {};
  var actor = String(request.started_by || request.cashier_name || "Operator").trim() || "Operator";
  var auditType = normalizeInventoryAuditType_(request.audit_type || "full");
  var scope = String(request.scope || "all").trim() || "all";
  var note = String(request.note || "").trim();

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(3000)) {
    return createLockBusyResponse_("Sistem sedang memproses audit stok lain. Coba lagi sebentar.");
  }

  try {
    ensureInventoryAuditSheets_();

    var activeAudit = findActiveInventoryAudit_();
    if (activeAudit) {
      return {
        ok: false,
        success: false,
        error: "Masih ada Stock Opname yang belum selesai: " + activeAudit.audit_id,
        active_audit: activeAudit,
      };
    }

    var inventoryItems = getInventoryItems_().items.filter(function (item) {
      return isInventoryItemActive_(item.status);
    });

    if (!inventoryItems.length) {
      return {
        ok: false,
        success: false,
        error: "Tidak ada item inventory aktif untuk diaudit.",
      };
    }

    var now = toJakartaIsoString_(new Date());
    var auditId = generateInventoryAuditId_();
    var audit = buildInventoryAuditRow_(auditId, now, auditType, scope, actor, note, inventoryItems.length);
    appendObjectRow_(ensureInventoryAuditsSheet_(), audit);

    var lineSheet = ensureInventoryAuditLinesSheet_();
    inventoryItems.forEach(function (item, index) {
      appendObjectRow_(lineSheet, {
        audit_line_id: auditId + "-LINE-" + String(index + 1).padStart(3, "0"),
        audit_id: auditId,
        stock_item_id: item.stock_item_id,
        stock_item_name: item.stock_item_name,
        category: item.category,
        unit: item.unit,
        book_qty_snapshot: Number(item.stock_qty) || 0,
        count_method: "",
        sealed_container_qty: "",
        open_container_percentages_json: "",
        count_qty: "",
        final_qty: "",
        difference_qty: "",
        reason_code: "",
        note: "",
        status: "pending",
        movement_id: "",
        updated_at: now,
      });
    });

    return getInventoryAuditDetails_(auditId);
  } finally {
    lock.releaseLock();
  }
}

function saveInventoryAuditCounts_(payload) {
  var request = payload || {};
  var auditId = String(request.audit_id || "").trim();
  var lines = Array.isArray(request.lines) ? request.lines : [];
  var actor = String(request.updated_by || request.cashier_name || "Operator").trim() || "Operator";

  if (!auditId) {
    return {
      ok: false,
      success: false,
      error: "audit_id wajib diisi.",
    };
  }

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(3000)) {
    return createLockBusyResponse_("Sistem sedang menyimpan audit stok lain. Coba lagi sebentar.");
  }

  try {
    var context = getInventoryAuditContext_(auditId);
    if (!context.ok) {
      return context;
    }

    if (["draft", "counting"].indexOf(context.audit.status) === -1) {
      return {
        ok: false,
        success: false,
        error: "Audit yang sudah disubmit atau diposting tidak bisa diedit.",
      };
    }

    updateInventoryAuditLineCounts_(auditId, lines);
    refreshInventoryAuditSummary_(auditId, {
      status: "counting",
      note: context.audit.note,
      submitted_at: "",
      submitted_by: "",
    });

    var result = getInventoryAuditDetails_(auditId);
    result.message = "Hitungan fisik berhasil disimpan oleh " + actor + ".";
    return result;
  } finally {
    lock.releaseLock();
  }
}

function submitInventoryAudit_(payload) {
  var request = payload || {};
  var auditId = String(request.audit_id || "").trim();
  var actor = String(request.submitted_by || request.cashier_name || "Operator").trim() || "Operator";

  if (!auditId) {
    return {
      ok: false,
      success: false,
      error: "audit_id wajib diisi.",
    };
  }

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(3000)) {
    return createLockBusyResponse_("Sistem sedang submit audit stok lain. Coba lagi sebentar.");
  }

  try {
    var context = getInventoryAuditContext_(auditId);
    if (!context.ok) {
      return context;
    }

    if (["draft", "counting"].indexOf(context.audit.status) === -1) {
      return {
        ok: false,
        success: false,
        error: "Status audit tidak bisa disubmit.",
      };
    }

    var lines = getInventoryAuditLinesByAuditId_(auditId);
    var countedItems = lines.filter(function (line) {
      return line.status !== "pending";
    }).length;

    if (countedItems !== lines.length) {
      return {
        ok: false,
        success: false,
        error: "Masih ada item yang belum dihitung. Isi 0 jika stok fisik memang kosong.",
      };
    }

    refreshInventoryAuditSummary_(auditId, {
      status: "submitted",
      submitted_at: toJakartaIsoString_(new Date()),
      submitted_by: actor,
    });

    return getInventoryAuditDetails_(auditId);
  } finally {
    lock.releaseLock();
  }
}

function approveInventoryAudit_(payload) {
  var request = payload || {};
  var auditId = String(request.audit_id || "").trim();
  var approverName = String(request.approved_by || request.cashier_name || "Owner").trim() || "Owner";
  var pinResult = validateAdminPinPayload_(
    request.admin_pin,
    "manager",
    "approve_inventory_audit",
    approverName,
    true
  );

  if (!pinResult.success) {
    return pinResult;
  }

  if (!auditId) {
    return {
      ok: false,
      success: false,
      error: "audit_id wajib diisi.",
    };
  }

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) {
    return createLockBusyResponse_("Sistem sedang posting audit stok lain. Coba lagi sebentar.");
  }

  try {
    var context = getInventoryAuditContext_(auditId);
    if (!context.ok) {
      return context;
    }

    if (context.audit.status !== "submitted") {
      return {
        ok: false,
        success: false,
        error: "Audit harus berstatus submitted sebelum approval.",
      };
    }

    var now = toJakartaIsoString_(new Date());
    postInventoryAuditDifferences_(auditId, approverName, now);
    refreshInventoryAuditSummary_(auditId, {
      status: "posted",
      approved_at: now,
      approved_by: pinResult.employee.employee_name || approverName,
      posted_at: now,
      posted_by: pinResult.employee.employee_name || approverName,
    });

    var result = getInventoryAuditDetails_(auditId);
    result.message = "Stock Opname berhasil di-approve dan diposting.";
    return result;
  } finally {
    lock.releaseLock();
  }
}

function normalizeInventoryAudit_(audit) {
  return {
    audit_id: audit.audit_id || "",
    operational_date: audit.operational_date || "",
    audit_type: audit.audit_type || "full",
    scope: audit.scope || "all",
    status: String(audit.status || "draft").trim().toLowerCase(),
    started_at: normalizeFnbOrderDateTime_(audit.started_at),
    started_by: audit.started_by || "",
    submitted_at: normalizeFnbOrderDateTime_(audit.submitted_at),
    submitted_by: audit.submitted_by || "",
    approved_at: normalizeFnbOrderDateTime_(audit.approved_at),
    approved_by: audit.approved_by || "",
    posted_at: normalizeFnbOrderDateTime_(audit.posted_at),
    posted_by: audit.posted_by || "",
    note: audit.note || "",
    total_items: Number(audit.total_items) || 0,
    counted_items: Number(audit.counted_items) || 0,
    matched_items: Number(audit.matched_items) || 0,
    variance_items: Number(audit.variance_items) || 0,
    shortage_items: Number(audit.shortage_items) || 0,
    overage_items: Number(audit.overage_items) || 0,
    absolute_variance_qty: Number(audit.absolute_variance_qty) || 0,
    net_variance_qty: Number(audit.net_variance_qty) || 0,
  };
}

function normalizeInventoryAuditLine_(line) {
  var bookQty = Number(line.book_qty_snapshot) || 0;
  var countQty = line.count_qty === "" || line.count_qty === null ? "" : Number(line.count_qty);
  var finalQty = line.final_qty === "" || line.final_qty === null ? "" : Number(line.final_qty);

  return {
    audit_line_id: line.audit_line_id || "",
    audit_id: line.audit_id || "",
    stock_item_id: line.stock_item_id || "",
    stock_item_name: line.stock_item_name || "",
    category: line.category || "",
    unit: line.unit || "",
    book_qty_snapshot: bookQty,
    count_method: line.count_method || "direct",
    sealed_container_qty: line.sealed_container_qty === "" || line.sealed_container_qty === null
      ? ""
      : Number(line.sealed_container_qty),
    open_container_percentages: parseInventoryAuditOpenPercentages_(line.open_container_percentages_json),
    count_qty: countQty,
    final_qty: finalQty,
    difference_qty: line.difference_qty === "" || line.difference_qty === null ? "" : Number(line.difference_qty),
    reason_code: line.reason_code || "",
    note: line.note || "",
    status: String(line.status || "pending").trim().toLowerCase() || "pending",
    movement_id: line.movement_id || "",
    updated_at: normalizeFnbOrderDateTime_(line.updated_at),
  };
}

function parseInventoryAuditOpenPercentages_(value) {
  if (Array.isArray(value)) {
    return value.map(Number).filter(function (percentage) {
      return Number.isFinite(percentage) && percentage >= 0 && percentage <= 100;
    });
  }

  var normalizedValue = String(value || "").trim();
  if (!normalizedValue) {
    return [];
  }

  try {
    var parsed = JSON.parse(normalizedValue);
    if (Array.isArray(parsed)) {
      return parsed.map(Number).filter(function (percentage) {
        return Number.isFinite(percentage) && percentage >= 0 && percentage <= 100;
      });
    }
  } catch (error) {
    // Mendukung data lama yang ditulis sebagai daftar dipisahkan koma.
  }

  return normalizedValue.split(",").map(function (percentage) {
    return Number(String(percentage).trim());
  }).filter(function (percentage) {
    return Number.isFinite(percentage) && percentage >= 0 && percentage <= 100;
  });
}

function normalizeInventoryAuditBottleCount_(incoming, itemName) {
  var sealedQty = toNonNegativeStockQuantity_(incoming.sealed_container_qty);
  if (sealedQty === null || Math.floor(sealedQty) !== sealedQty) {
    throw new Error("Jumlah botol penuh " + itemName + " harus bilangan bulat 0 atau lebih.");
  }

  var percentages = Array.isArray(incoming.open_container_percentages)
    ? incoming.open_container_percentages
    : parseInventoryAuditOpenPercentages_(incoming.open_container_percentages_json);
  var normalizedPercentages = percentages.map(Number);

  if (normalizedPercentages.some(function (percentage) {
    return !Number.isFinite(percentage) || percentage < 0 || percentage > 100;
  })) {
    throw new Error("Persentase botol terbuka " + itemName + " harus antara 0 sampai 100.");
  }

  var openEquivalentQty = normalizedPercentages.reduce(function (total, percentage) {
    return total + percentage / 100;
  }, 0);

  return {
    count_qty: Number((sealedQty + openEquivalentQty).toFixed(4)),
    sealed_container_qty: sealedQty,
    open_container_percentages_json: JSON.stringify(normalizedPercentages),
  };
}

function normalizeInventoryAuditType_(value) {
  var normalizedValue = String(value || "full").trim().toLowerCase();
  return ["full", "partial"].indexOf(normalizedValue) === -1 ? "full" : normalizedValue;
}

function buildInventoryAuditRow_(auditId, now, auditType, scope, actor, note, totalItems) {
  return {
    audit_id: auditId,
    operational_date: getOperationalDateString_(now),
    audit_type: auditType,
    scope: scope,
    status: "draft",
    started_at: now,
    started_by: actor,
    submitted_at: "",
    submitted_by: "",
    approved_at: "",
    approved_by: "",
    posted_at: "",
    posted_by: "",
    note: note,
    total_items: totalItems,
    counted_items: 0,
    matched_items: 0,
    variance_items: 0,
    shortage_items: 0,
    overage_items: 0,
    absolute_variance_qty: 0,
    net_variance_qty: 0,
  };
}

function buildInventoryAuditListSummary_(audits) {
  return audits.reduce(function (summary, audit) {
    summary.total_audits += 1;
    summary[audit.status + "_count"] = (summary[audit.status + "_count"] || 0) + 1;
    summary.total_variance_items += Number(audit.variance_items) || 0;
    summary.total_absolute_variance_qty += Number(audit.absolute_variance_qty) || 0;
    return summary;
  }, {
    total_audits: 0,
    draft_count: 0,
    counting_count: 0,
    submitted_count: 0,
    posted_count: 0,
    total_variance_items: 0,
    total_absolute_variance_qty: 0,
  });
}

function findActiveInventoryAudit_() {
  return readSheetAsObjectsOrEmpty_("InventoryAudits")
    .map(normalizeInventoryAudit_)
    .find(function (audit) {
      return audit.audit_id && ["draft", "counting", "submitted"].indexOf(audit.status) !== -1;
    }) || null;
}

function getInventoryAuditContext_(auditId) {
  ensureInventoryAuditSheets_();

  var auditSheet = ensureInventoryAuditsSheet_();
  var auditHeaderMap = getHeaderMap_(auditSheet);
  var auditRow = findRowByValue_(auditSheet, auditHeaderMap, "audit_id", auditId);

  if (!auditRow) {
    return {
      ok: false,
      success: false,
      error: "Audit inventory tidak ditemukan.",
    };
  }

  return {
    ok: true,
    success: true,
    sheet: auditSheet,
    headerMap: auditHeaderMap,
    rowNumber: auditRow,
    audit: normalizeInventoryAudit_(getRowObject_(auditSheet, auditHeaderMap, auditRow)),
  };
}

function getInventoryAuditLinesByAuditId_(auditId) {
  return readSheetAsObjectsOrEmpty_("InventoryAuditLines")
    .map(normalizeInventoryAuditLine_)
    .filter(function (line) {
      return String(line.audit_id || "").trim() === String(auditId || "").trim();
    })
    .sort(function (first, second) {
      return String(first.stock_item_name || "").localeCompare(String(second.stock_item_name || ""), "id");
    });
}

function updateInventoryAuditLineCounts_(auditId, lines) {
  var lineSheet = ensureInventoryAuditLinesSheet_();
  var lineHeaderMap = getHeaderMap_(lineSheet);
  var lineByItemId = {};

  lines.forEach(function (line) {
    var stockItemId = String(line.stock_item_id || "").trim();
    if (stockItemId) {
      lineByItemId[stockItemId] = line;
    }
  });

  if (lineSheet.getLastRow() < 2) {
    return;
  }

  var now = toJakartaIsoString_(new Date());
  for (var rowNumber = 2; rowNumber <= lineSheet.getLastRow(); rowNumber++) {
    var currentLine = getRowObject_(lineSheet, lineHeaderMap, rowNumber);
    if (String(currentLine.audit_id || "").trim() !== auditId) {
      continue;
    }

    var incoming = lineByItemId[String(currentLine.stock_item_id || "").trim()];
    if (!incoming || incoming.count_qty === "" || incoming.count_qty === null || incoming.count_qty === undefined) {
      continue;
    }

    var countMethod = String(incoming.count_method || "direct").trim().toLowerCase();
    var bottleCount = countMethod === "bottle_percent"
      ? normalizeInventoryAuditBottleCount_(incoming, currentLine.stock_item_name)
      : null;
    var countQty = bottleCount
      ? bottleCount.count_qty
      : toNonNegativeStockQuantity_(incoming.count_qty);
    if (countQty === null) {
      throw new Error("Qty fisik " + currentLine.stock_item_name + " harus 0 atau lebih.");
    }

    var bookQty = Number(currentLine.book_qty_snapshot) || 0;
    var finalQty = countQty;
    setRowValues_(lineSheet, lineHeaderMap, rowNumber, {
      count_method: bottleCount ? "bottle_percent" : "direct",
      sealed_container_qty: bottleCount ? bottleCount.sealed_container_qty : "",
      open_container_percentages_json: bottleCount ? bottleCount.open_container_percentages_json : "",
      count_qty: countQty,
      final_qty: finalQty,
      difference_qty: finalQty - bookQty,
      reason_code: String(incoming.reason_code || "").trim(),
      note: String(incoming.note || "").trim(),
      status: "counted",
      updated_at: now,
    });
  }
}

function refreshInventoryAuditSummary_(auditId, overrides) {
  var context = getInventoryAuditContext_(auditId);
  if (!context.ok) {
    return context;
  }

  var lines = getInventoryAuditLinesByAuditId_(auditId);
  var summary = lines.reduce(function (result, line) {
    var status = String(line.status || "").trim().toLowerCase();
    var difference = Number(line.difference_qty) || 0;

    if (status !== "pending") {
      result.counted_items += 1;
      if (difference === 0) {
        result.matched_items += 1;
      } else {
        result.variance_items += 1;
        result.absolute_variance_qty += Math.abs(difference);
        result.net_variance_qty += difference;
        if (difference < 0) {
          result.shortage_items += 1;
        } else {
          result.overage_items += 1;
        }
      }
    }

    return result;
  }, {
    total_items: lines.length,
    counted_items: 0,
    matched_items: 0,
    variance_items: 0,
    shortage_items: 0,
    overage_items: 0,
    absolute_variance_qty: 0,
    net_variance_qty: 0,
  });

  setRowValues_(context.sheet, context.headerMap, context.rowNumber, Object.assign(summary, overrides || {}));
  return getInventoryAuditDetails_(auditId);
}

function postInventoryAuditDifferences_(auditId, actor, now) {
  var inventorySheet = ensureInventorySheetColumns_();
  var inventoryHeaderMap = getHeaderMap_(inventorySheet);
  var lineSheet = ensureInventoryAuditLinesSheet_();
  var lineHeaderMap = getHeaderMap_(lineSheet);
  var lines = getInventoryAuditLinesByAuditId_(auditId);

  lines.forEach(function (line) {
    var difference = Number(line.difference_qty) || 0;
    var rowNumber = findInventoryRowByStockItemId_(line.stock_item_id, inventorySheet, inventoryHeaderMap);

    if (!rowNumber) {
      throw new Error("Item stok audit tidak ditemukan: " + line.stock_item_id);
    }

    var currentItem = buildInventoryItemFromRow_(inventorySheet, inventoryHeaderMap, rowNumber);
    if (!isInventoryItemActive_(currentItem.status)) {
      throw new Error("Item stok tidak aktif: " + currentItem.stock_item_name);
    }

    var stockBefore = Number(currentItem.stock_qty) || 0;
    var stockAfter = Number(line.final_qty);
    if (!isFinite(stockAfter) || stockAfter < 0) {
      throw new Error("Final qty tidak valid untuk " + line.stock_item_name);
    }

    var movementId = "";
    if (stockAfter !== stockBefore) {
      movementId = generateStockMovementId_();
      inventorySheet.getRange(rowNumber, inventoryHeaderMap.stock_qty).setValue(stockAfter);
      if (inventoryHeaderMap.updated_at) {
        inventorySheet.getRange(rowNumber, inventoryHeaderMap.updated_at).setValue(now);
      }
      appendStockMovement_({
        movement_id: movementId,
        created_at: now,
        stock_item_id: currentItem.stock_item_id,
        stock_item_name: currentItem.stock_item_name,
        movement_type: "adjustment",
        reference_type: "stock_audit",
        reference_id: auditId,
        qty_change: stockAfter - stockBefore,
        stock_before: stockBefore,
        stock_after: stockAfter,
        note: buildInventoryAuditMovementNote_(line),
        cashier_name: actor,
      });
    }

    var lineRow = findRowByValue_(lineSheet, lineHeaderMap, "audit_line_id", line.audit_line_id);
    if (lineRow) {
      setRowValues_(lineSheet, lineHeaderMap, lineRow, {
        status: "posted",
        movement_id: movementId,
        updated_at: now,
      });
    }
  });
}

function buildInventoryAuditMovementNote_(line) {
  var reason = String(line.reason_code || "").trim();
  var note = String(line.note || "").trim();
  var parts = ["Stock Opname"];

  if (reason) {
    parts.push("Reason: " + reason);
  }

  if (note) {
    parts.push(note);
  }

  return parts.join(" - ");
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
  if (!lock.tryLock(2000)) {
    return { ok: false, error: "Sistem sedang memproses order F&B lain. Coba lagi sebentar." };
  }

  try {
    var now = new Date();
    var createdAt = toJakartaIsoString_(now);
    var operationalDateString = getOperationalDateString_(now);
    var existingClosings = readCashierClosingsOrEmpty_().filter(function (closing) {
      return resolveClosingOperationalDateString_(closing) === operationalDateString;
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
      closing_date: operationalDateString,
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

    var snapshot = buildCashierClosingSnapshot_(closing, createdAt);
    var snapshotSheets = ensureCashierClosingSnapshotSheets_();

    try {
      appendCashierClosingSnapshotRows_(snapshotSheets.transactions, snapshot.transactions);
      appendCashierClosingSnapshotRows_(snapshotSheets.fnb_items, snapshot.fnb_items);
      appendCashierClosingSnapshotRows_(snapshotSheets.lc_details, snapshot.lc_details);

      var sheet = ensureCashierClosingsSheet_();
      var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(function (header) {
        return String(header).trim();
      });
      var rowValues = headers.map(function (header) {
        return closing[header] !== undefined ? closing[header] : "";
      });

      sheet.appendRow(rowValues);
    } catch (snapshotError) {
      rollbackCashierClosingSnapshot_(closing.closing_id, snapshotSheets);
      throw snapshotError;
    }

    return {
      ok: true,
      message: "Closing kasir berhasil disimpan.",
      closing: closing,
      snapshot_summary: summarizeCashierClosingSnapshot_(snapshot),
    };
  } finally {
    lock.releaseLock();
  }
}

function calculateCashierClosingSummary_() {
  var periodResult = parseTransactionPeriod_("today", "", "");
  var transactions = readSheetAsObjects_("Transactions").filter(function (transaction) {
    return matchesOperationalPeriod_(
      resolveTransactionOperationalDateString_(transaction),
      periodResult
    );
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

function saveFnbOrder_(roomId, items, cashierName, note, paymentMethod, paymentStatus, customerName, generalBillId, idempotencyKey) {
  var normalizedRoomId = String(roomId || "").trim();
  var isGeneralOrder = normalizedRoomId.toUpperCase() === FNB_GENERAL_ROOM_ID;
  var normalizedCustomerName = String(customerName || "").trim();
  var normalizedGeneralBillId = String(generalBillId || "").trim();
  var normalizedIdempotencyKey = String(idempotencyKey || "").trim();

  if (!normalizedRoomId) {
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

  if (isGeneralOrder && !normalizedCustomerName) {
    return {
      ok: false,
      error: "Nama pemesan wajib diisi untuk order F&B umum.",
    };
  }

  if (normalizedIdempotencyKey.length > 160) {
    return {
      ok: false,
      error: "idempotency_key terlalu panjang.",
    };
  }

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(2000)) {
    return { ok: false, error: "Sistem sedang memproses order F&B lain. Coba lagi sebentar." };
  }

  try {
    var fnbOrdersSheet = ensureFnbOrdersSheetColumns_();
    if (normalizedIdempotencyKey) {
      var fnbOrdersHeaderMap = getHeaderMap_(fnbOrdersSheet);
      var existingOrderRow = findRowByValue_(
        fnbOrdersSheet,
        fnbOrdersHeaderMap,
        "idempotency_key",
        normalizedIdempotencyKey
      );

      if (existingOrderRow) {
        var existingOrder = getFnbOrderObjectFromRow_(fnbOrdersSheet, existingOrderRow);
        var existingOrdersWithItems = getFnbOrdersWithItemsByIds_([existingOrder.order_id]);
        return {
          ok: true,
          success: true,
          message: "Order F&B sudah pernah disimpan.",
          order: existingOrder,
          items: existingOrdersWithItems.length > 0 ? existingOrdersWithItems[0].items : [],
          lc_sales_bonus_logs: [],
          idempotent_replay: true,
        };
      }
    }

    var room = null;
    if (isGeneralOrder) {
      room = {
        room_id: FNB_GENERAL_ROOM_ID,
        room_name: FNB_GENERAL_ROOM_NAME,
        start_time: "",
      };
    } else {
      var roomsSheet = getSheet_("Rooms");
      var roomsHeaderMap = getHeaderMap_(roomsSheet);
      var rowNumber = findRowByValue_(roomsSheet, roomsHeaderMap, "room_id", normalizedRoomId);

      if (!rowNumber) {
        return {
          ok: false,
          error: "Ruangan tidak ditemukan.",
        };
      }

      room = getRowObject_(roomsSheet, roomsHeaderMap, rowNumber);
      var status = String(room.status || "").trim().toLowerCase();

      if (status !== "occupied" && status !== "booked" && status !== "waiting_payment") {
        return {
          ok: false,
          error: "Order F&B hanya bisa disimpan untuk ruangan yang sedang terisi atau sudah dibooking.",
        };
      }

      if (status === "occupied" && !room.start_time) {
        return {
          ok: false,
          error: "Sesi ruangan belum memiliki waktu mulai.",
        };
      }
    }

    var isPaid = String(paymentStatus || "").trim().toLowerCase() === "paid";
    var method = String(paymentMethod || "").trim().toLowerCase();

    if (isGeneralOrder && !isPaid) {
      if (normalizedGeneralBillId) {
        var existingBillOrders = readFnbOrdersOrEmpty_().filter(function (existingOrder) {
          return String(existingOrder.general_bill_id || "").trim() === normalizedGeneralBillId
            && String(existingOrder.order_status || "").trim().toLowerCase() === "open";
        });
        if (existingBillOrders.length === 0) {
          return { ok: false, error: "Open bill F&B umum tidak ditemukan atau sudah dibayar." };
        }
        var existingCustomerName = String(existingBillOrders[0].customer_name || "").trim();
        if (existingCustomerName && existingCustomerName.toLowerCase() !== normalizedCustomerName.toLowerCase()) {
          return { ok: false, error: "Nama pemesan tidak cocok dengan open bill yang dipilih." };
        }
      } else {
        normalizedGeneralBillId = generateGeneralFnbBillId_();
      }
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
      order_status: isPaid ? "paid" : "open",
      order_total: orderTotal,
      cashier_name: cashierName || "Kasir",
      note: isGeneralOrder
        ? ((note ? String(note).trim() + " | " : "") + "Order F&B umum")
        : (note || ""),
      customer_name: isGeneralOrder ? normalizedCustomerName : "",
      general_bill_id: isGeneralOrder && !isPaid ? normalizedGeneralBillId : "",
      billed_transaction_id: "",
      idempotency_key: normalizedIdempotencyKey,
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
        bonus_sales_lc: item.bonus_sales_lc,
        created_at: timestamp,
      };
    });

    ensureFnbOrderItemsSheet_();
    appendFnbOrder_(order);
    appendFnbOrderItems_(orderItems);
    var lcSalesBonusLogs = appendAutoLcSalesBonusLogsForFnbOrder_(order, orderItems, cashierName || "Kasir");

    if (isPaid) {
      var transaction = {
        transaction_id: generateTransactionId_(),
        room_id: room.room_id || "",
        room_name: isGeneralOrder && normalizedCustomerName
          ? FNB_GENERAL_ROOM_NAME + " - " + normalizedCustomerName
          : (room.room_name || ""),
        start_time: "",
        end_time: timestamp,
        duration_minutes: 0,
        rate_per_hour: 0,
        room_total: 0,
        fnb_total: orderTotal,
        grand_total: orderTotal,
        fnb_order_ids: order.order_id,
        payment_method: method || "cash",
        payment_status: "paid",
        cashier_name: cashierName || "Kasir",
        created_at: timestamp,
        transaction_type: "fnb_addon",
        customer_name: isGeneralOrder ? normalizedCustomerName : "",
        general_bill_id: "",
      };
      appendTransaction_(transaction);

      var detailedOrder = Object.assign({}, order, { items: orderItems });
      deductStockForFnbOrders_([detailedOrder], transaction.transaction_id, transaction.cashier_name, timestamp);
    }

    return {
      ok: true,
      message: isPaid ? "Order F&B berhasil dibayar & disimpan." : "Order F&B berhasil disimpan.",
      order: order,
      items: orderItems,
      lc_sales_bonus_logs: lcSalesBonusLogs,
    };
  } finally {
    lock.releaseLock();
  }
}

function generateGeneralFnbBillId_() {
  return "GBILL-" + Utilities.formatDate(new Date(), "Asia/Jakarta", "yyyyMMdd-HHmmss") + "-" + Math.floor(Math.random() * 1000);
}

function settleGeneralFnbBill_(payload) {
  var request = payload || {};
  var generalBillId = String(request.general_bill_id || "").trim();
  var paymentMethod = String(request.payment_method || "").trim().toLowerCase();
  var cashierName = String(request.cashier_name || "Kasir").trim() || "Kasir";

  if (!generalBillId) {
    return { ok: false, success: false, error: "general_bill_id wajib diisi." };
  }
  if (!getAllowedPaymentMethods_()[paymentMethod]) {
    return { ok: false, success: false, error: "Metode pembayaran wajib cash atau transfer." };
  }

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) {
    return { ok: false, success: false, error: "Sistem sedang memproses transaksi lain. Coba lagi sebentar." };
  }

  try {
    var openOrders = readFnbOrdersOrEmpty_().filter(function (order) {
      return String(order.room_id || "").trim().toUpperCase() === FNB_GENERAL_ROOM_ID
        && String(order.general_bill_id || "").trim() === generalBillId
        && String(order.order_status || "").trim().toLowerCase() === "open";
    });

    if (openOrders.length === 0) {
      var existingTransaction = readSheetAsObjects_("Transactions").find(function (transaction) {
        return String(transaction.general_bill_id || "").trim() === generalBillId;
      });
      if (existingTransaction) {
        return {
          ok: true,
          success: true,
          idempotent_replay: true,
          message: "Tagihan F&B umum sudah pernah dibayar.",
          transaction: existingTransaction,
        };
      }
      return { ok: false, success: false, error: "Open bill F&B umum tidak ditemukan atau sudah dibayar." };
    }

    var customerName = String(openOrders[0].customer_name || "").trim();
    var orderIds = openOrders.map(function (order) { return order.order_id || ""; }).filter(Boolean);
    var detailedOrders = getFnbOrdersWithItemsByIds_(orderIds);
    var grandTotal = calculateFnbTotal_(detailedOrders);
    var now = toJakartaIsoString_(new Date());
    var transaction = {
      transaction_id: generateTransactionId_(),
      room_id: FNB_GENERAL_ROOM_ID,
      room_name: customerName ? FNB_GENERAL_ROOM_NAME + " - " + customerName : FNB_GENERAL_ROOM_NAME,
      start_time: openOrders[0].created_at || "",
      end_time: now,
      duration_minutes: 0,
      rate_per_hour: 0,
      room_total: 0,
      fnb_total: grandTotal,
      grand_total: grandTotal,
      fnb_order_ids: orderIds.join(","),
      payment_method: paymentMethod,
      payment_status: "paid",
      cashier_name: cashierName,
      created_at: now,
      transaction_type: "fnb_general",
      customer_name: customerName,
      general_bill_id: generalBillId,
    };

    if (request.dry_run === true || String(request.dry_run || "").trim().toLowerCase() === "true") {
      return {
        ok: true,
        success: true,
        dry_run: true,
        message: "Validasi pembayaran open bill berhasil tanpa menyimpan perubahan.",
        transaction: transaction,
        orders: detailedOrders,
      };
    }

    appendTransaction_(transaction);
    var stockResult = deductStockForFnbOrders_(detailedOrders, transaction.transaction_id, cashierName, now);
    var ordersSheet = ensureFnbOrdersSheetColumns_();
    var orderHeaders = getHeaderMap_(ordersSheet);
    orderIds.forEach(function (orderId) {
      var rowNumber = findRowByValue_(ordersSheet, orderHeaders, "order_id", orderId);
      if (rowNumber) {
        setRowValues_(ordersSheet, orderHeaders, rowNumber, {
          order_status: "billed",
          billed_transaction_id: transaction.transaction_id,
          updated_at: now,
        });
      }
    });

    return {
      ok: true,
      success: true,
      message: "Tagihan F&B umum berhasil dibayar.",
      transaction: transaction,
      orders: detailedOrders,
      stock_movements: stockResult.movements,
      stock_warnings: stockResult.warnings,
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
        customer_name: order.customer_name || "",
        general_bill_id: order.general_bill_id || "",
        billed_transaction_id: order.billed_transaction_id || "",
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
  if (!lock.tryLock(2000)) {
    return { ok: false, error: "Sistem sedang memproses pembatalan order lain. Coba lagi sebentar." };
  }

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

    if (currentStatus !== "open" && currentStatus !== "paid") {
      return {
        ok: false,
        error: "Status order F&B tidak bisa dibatalkan.",
      };
    }

    var now = toJakartaIsoString_(new Date());
    var reason = String(cancelReason || "").trim() || "Tanpa alasan";
    var user = String(cancelledBy || "").trim() || "Kasir";

    var order = getFnbOrderObjectFromRow_(sheet, rowNumber);

    if (currentStatus === "paid") {
      var detailedOrders = getFnbOrdersWithItemsByIds_([normalizedOrderId]);
      var orderTotal = Number(order.order_total) || 0;

      var paymentMethod = "cash";
      try {
        var originalTx = readSheetAsObjects_("Transactions").find(function (tx) {
          return String(tx.fnb_order_ids || "").trim() === normalizedOrderId;
        });
        if (originalTx && originalTx.payment_method) {
          paymentMethod = originalTx.payment_method;
        }
      } catch (err) {
        // Fallback to cash
      }

      var refundTransaction = {
        transaction_id: generateTransactionId_(),
        room_id: order.room_id || "",
        room_name: order.room_name || "",
        start_time: "",
        end_time: now,
        duration_minutes: 0,
        rate_per_hour: 0,
        room_total: 0,
        fnb_total: -orderTotal,
        grand_total: -orderTotal,
        fnb_order_ids: order.order_id,
        payment_method: paymentMethod,
        payment_status: "paid",
        cashier_name: user,
        created_at: now,
        transaction_type: "fnb_refund",
      };
      appendTransaction_(refundTransaction);

      restoreStockForFnbOrders_(detailedOrders, refundTransaction.transaction_id, user, now);
    }

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
        customer_name: order.customer_name || "",
        general_bill_id: order.general_bill_id || "",
        billed_transaction_id: order.billed_transaction_id || "",
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

  if (normalizedReferenceType && ["transaction", "manual_adjustment", "stock_audit"].indexOf(normalizedReferenceType) === -1) {
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
        (orderStatus === "billed" || orderStatus === "paid") &&
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
      var status = String(order.order_status || "").trim().toLowerCase();
      var isUnbilled = status === "open" || (status === "billed" && !String(order.billed_transaction_id || "").trim());
      return (
        String(order.room_id || "").trim() === String(roomId || "").trim() &&
        normalizeFnbOrderDateTime_(order.room_start_time) === normalizedStartTime &&
        isUnbilled
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
        customer_name: order.customer_name || "",
        general_bill_id: order.general_bill_id || "",
        billed_transaction_id: order.billed_transaction_id || "",
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
        customer_name: order.customer_name || "",
        general_bill_id: order.general_bill_id || "",
        billed_transaction_id: order.billed_transaction_id || "",
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

function restoreStockForFnbOrders_(fnbOrders, transactionId, cashierName, now) {
  if (!fnbOrders || fnbOrders.length === 0) {
    return;
  }

  var stockPlan = calculateStockRequirementsFromFnbOrders_(fnbOrders);
  var inventoryMap = getInventoryMap_();

  stockPlan.requirements.forEach(function (requirement) {
    var inventory = inventoryMap[requirement.stock_item_id];

    if (!inventory) {
      return;
    }

    var stockBefore = toStockNumber_(inventory.stock_qty);
    var stockAfter = stockBefore + requirement.required_qty;

    inventory.sheet.getRange(inventory.row_number, inventory.header_map.stock_qty).setValue(stockAfter);

    if (inventory.header_map.updated_at) {
      inventory.sheet.getRange(inventory.row_number, inventory.header_map.updated_at).setValue(now);
    }

    var movement = {
      movement_id: generateStockMovementId_(),
      created_at: now,
      stock_item_id: inventory.stock_item_id,
      stock_item_name: inventory.stock_item_name,
      movement_type: "in",
      reference_type: "transaction",
      reference_id: transactionId,
      qty_change: requirement.required_qty,
      stock_before: stockBefore,
      stock_after: stockAfter,
      note: "F&B refund dari pembatalan transaksi " + transactionId,
      cashier_name: cashierName || "Kasir",
    };

    appendStockMovement_(movement);
  });
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

    var invObj = {
      sheet: sheet,
      header_map: headerMap,
      row_number: index + 2,
      stock_item_id: stockItemId,
      stock_item_name: item.stock_item_name || item.item_name || stockItemId,
      stock_qty: Number(item.stock_qty) || 0,
      min_stock: Number(item.min_stock) || 0,
      status: item.status || "",
    };

    map[stockItemId] = invObj;
    map[String(stockItemId).trim().toLowerCase()] = invObj;

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
    customer_name: order.customer_name || "",
    general_bill_id: order.general_bill_id || "",
    billed_transaction_id: order.billed_transaction_id || "",
    idempotency_key: order.idempotency_key || "",
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

function generateInventoryAuditId_() {
  return "SO-" + Utilities.formatDate(new Date(), "Asia/Jakarta", "yyyyMMdd-HHmmss") + "-" + Math.floor(Math.random() * 1000);
}

function runFnbV23BInventoryIdentityDryRun() {
  var result = migrateFnbV23BInventoryIdentity_({
    dry_run: true,
  });

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function runFnbV23BInventoryIdentityExecute() {
  var result = migrateFnbV23BInventoryIdentity_({
    dry_run: false,
    backup_confirmed: true,
  });

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function runRestoreFnbV23BInventoryQaArchive() {
  var result = restoreFnbV23BInventoryQaArchive_();

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function restoreFnbV23BInventoryQaArchive_() {
  var lock = LockService.getScriptLock();
  var lockAcquired = false;
  var output = buildFnbV23BInventoryQaArchiveOutput_();

  try {
    if (!lock.tryLock(2000)) {
      return buildFnbV23BInventoryQaArchiveErrorOutput_(
        "LOCK_BUSY",
        "Sistem sedang memproses perubahan lain. Coba lagi sebentar.",
        output
      );
    }
    lockAcquired = true;

    return executeFnbV23BInventoryQaArchiveRestore_(output);
  } catch (error) {
    output.ok = false;
    output.abort_reason = "ERROR";
    output.validation.errors.push(error && error.message ? error.message : String(error));
    return output;
  } finally {
    if (lockAcquired) {
      lock.releaseLock();
    }
  }
}

function executeFnbV23BInventoryQaArchiveRestore_(output) {
  var sheet = getSheet_("Inventory");
  var requiredHeaders = [
    "item_id",
    "item_name",
    "category",
    "stock_qty",
    "unit",
    "cost_per_unit",
    "updated_at",
    "stock_item_id",
    "stock_item_name",
    "min_stock",
    "status",
  ];
  var headerMap = getHeaderMap_(sheet);
  var rows;
  var duplicateIds;
  var targetRows = buildFnbV23BInventoryQaArchiveRows_();
  var targetIds = targetRows.map(function (row) {
    return row.stock_item_id;
  });
  var now = toJakartaIsoString_(new Date());

  validateFnbV23BRequiredColumns_(headerMap, requiredHeaders, "Inventory", output.validation.errors);

  if (output.validation.errors.length) {
    output.abort_reason = "MISSING_REQUIRED_COLUMNS";
    return output;
  }

  rows = getFnbV23BSheetRows_(sheet, headerMap);
  duplicateIds = findFnbV23BInventoryDuplicateIdentityIds_(rows);

  output.validation.duplicate_stock_item_id = duplicateIds;

  if (duplicateIds.length) {
    output.abort_reason = "DUPLICATE_STOCK_ITEM_ID_EXISTS";
    return output;
  }

  targetIds.forEach(function (stockItemId) {
    var existingRows = findFnbV23BInventoryRowsByAnyId_(rows, stockItemId);

    if (existingRows.length) {
      output.skipped_rows.push({
        stock_item_id: stockItemId,
        reason: "ID_ALREADY_EXISTS",
        existing_row_numbers: existingRows.map(function (row) {
          return row.row_number;
        }),
      });
    }
  });

  if (output.skipped_rows.length) {
    output.abort_reason = "TARGET_ID_ALREADY_EXISTS";
    return output;
  }

  targetRows.forEach(function (row) {
    row.updated_at = now;
    appendObjectRow_(sheet, row);
    output.inserted_rows.push({
      stock_item_id: row.stock_item_id,
      stock_item_name: row.stock_item_name,
      row_number: sheet.getLastRow(),
    });
  });

  output.validation = validateFnbV23BInventoryQaArchiveRestore_(sheet, targetRows, output.inserted_rows);
  output.ok = output.validation.ok;
  output.abort_reason = output.ok ? "" : "POST_VALIDATION_FAILED";

  return output;
}

function buildFnbV23BInventoryQaArchiveOutput_() {
  return {
    ok: false,
    inserted_rows: [],
    skipped_rows: [],
    abort_reason: "",
    validation: {
      ok: false,
      errors: [],
      duplicate_stock_item_id: [],
      restored_rows: [],
    },
  };
}

function buildFnbV23BInventoryQaArchiveErrorOutput_(code, message, output) {
  var result = output || buildFnbV23BInventoryQaArchiveOutput_();

  result.ok = false;
  result.abort_reason = code || "ERROR";
  if (result.validation && Array.isArray(result.validation.errors)) {
    result.validation.errors.push(String(message || "Sistem sedang memproses perubahan lain. Coba lagi sebentar."));
  }

  return result;
}

function buildFnbV23BInventoryQaArchiveRows_() {
  return [
    {
      item_id: "ITEM-QA-001",
      item_name: "TEST - INVENTORY QA",
      category: "TEST",
      stock_qty: -7,
      unit: "PCS",
      cost_per_unit: "",
      updated_at: "",
      stock_item_id: "ITEM-QA-001",
      stock_item_name: "TEST - INVENTORY QA",
      min_stock: 1,
      status: "inactive",
    },
    {
      item_id: "ITEM-QA-002",
      item_name: "TEST - Inventory Delete QA",
      category: "Test",
      stock_qty: -4,
      unit: "pcs",
      cost_per_unit: "",
      updated_at: "",
      stock_item_id: "ITEM-QA-002",
      stock_item_name: "TEST - Inventory Delete QA",
      min_stock: 1,
      status: "inactive",
    },
  ];
}

function findFnbV23BInventoryDuplicateIdentityIds_(rows) {
  var idGroups = {};
  var duplicates = [];

  rows.forEach(function (row) {
    var stockItemId = String(row.values.stock_item_id || row.values.item_id || "").trim();

    if (!stockItemId) {
      return;
    }

    if (!idGroups[stockItemId]) {
      idGroups[stockItemId] = [];
    }

    idGroups[stockItemId].push(row.row_number);
  });

  Object.keys(idGroups).forEach(function (stockItemId) {
    if (idGroups[stockItemId].length > 1) {
      duplicates.push({
        stock_item_id: stockItemId,
        count: idGroups[stockItemId].length,
        row_numbers: idGroups[stockItemId],
      });
    }
  });

  return duplicates;
}

function findFnbV23BInventoryRowsByAnyId_(rows, stockItemId) {
  var expectedId = String(stockItemId || "").trim();

  return rows.filter(function (row) {
    var canonicalId = String(row.values.stock_item_id || "").trim();
    var legacyId = String(row.values.item_id || "").trim();

    return canonicalId === expectedId || legacyId === expectedId;
  });
}

function validateFnbV23BInventoryQaArchiveRestore_(sheet, expectedRows, insertedRows) {
  var rows = getFnbV23BSheetRows_(sheet, getHeaderMap_(sheet));
  var duplicateIds = findFnbV23BInventoryDuplicateIdentityIds_(rows);
  var errors = [];
  var restoredRows = expectedRows.map(function (expectedRow) {
    var matches = rows.filter(function (row) {
      return String(row.values.stock_item_id || "").trim() === expectedRow.stock_item_id
        && String(row.values.item_id || "").trim() === expectedRow.item_id
        && String(row.values.stock_item_name || "").trim() === expectedRow.stock_item_name
        && String(row.values.item_name || "").trim() === expectedRow.item_name
        && String(row.values.status || "").trim() === expectedRow.status;
    });

    if (matches.length !== 1) {
      errors.push("RESTORED_ROW_INVALID:" + expectedRow.stock_item_id + ":" + matches.length);
    }

    return {
      stock_item_id: expectedRow.stock_item_id,
      expected_name: expectedRow.stock_item_name,
      match_count: matches.length,
      row_numbers: matches.map(function (row) {
        return row.row_number;
      }),
    };
  });

  if (duplicateIds.length) {
    errors.push("DUPLICATE_STOCK_ITEM_ID_AFTER_RESTORE");
  }

  if (insertedRows.length !== expectedRows.length) {
    errors.push("INSERTED_ROW_COUNT_MISMATCH");
  }

  return {
    ok: errors.length === 0,
    errors: errors,
    duplicate_stock_item_id: duplicateIds,
    restored_rows: restoredRows,
  };
}

function runFnbV24PackageImportDryRun() {
  var result = importFnbV24Package_({
    dry_run: true,
  });

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function runFnbV24PackageImportExecute() {
  var result = importFnbV24Package_({
    dry_run: false,
    backup_confirmed: true,
  });

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function importFnbV24Package_(config) {
  var importConfig = buildFnbV24PackageImportConfig_(config || {});
  var lock = LockService.getScriptLock();
  var lockAcquired = false;
  var output;

  try {
    if (!lock.tryLock(2000)) {
      return buildFnbV24PackageImportErrorOutput_(
        importConfig,
        output,
        new Error("Sistem sedang memproses perubahan lain. Coba lagi sebentar.")
      );
    }
    lockAcquired = true;

    output = collectFnbV24PackageImportPlan_(importConfig);

    if (!output.ok || importConfig.dry_run) {
      return output;
    }

    executeFnbV24PackageImportPlan_(output);
    output.validation = validateFnbV24PackageImport_(importConfig);
    output.ok = output.validation.ok;
    output.partial_insert = output.inserted_rows.package_master.length > 0
      && output.inserted_rows.package_details.length !== importConfig.package_details.length;

    if (!output.ok) {
      output.abort_reason = output.validation.abort_reason || "POST_VALIDATION_FAILED";
    }

    if (output.partial_insert) {
      output.rollback_info = buildFnbV24PackageImportRollbackInfo_(output);
    }

    return output;
  } catch (error) {
    return buildFnbV24PackageImportErrorOutput_(importConfig, output, error);
  } finally {
    if (lockAcquired) {
      lock.releaseLock();
    }
  }
}

function buildFnbV24PackageImportConfig_(config) {
  var now = toJakartaIsoString_(new Date());

  return {
    import_id: "IMP-FNB-V24-PACKAGE-" + Utilities.formatDate(new Date(), "Asia/Jakarta", "yyyyMMdd-HHmmss"),
    dry_run: config.dry_run !== false,
    backup_confirmed: config.backup_confirmed === true,
    package_master: {
      package_id: "PKG-001",
      menu_id: "",
      package_name: "Beer Holic Package",
      package_category: "Beer Holic",
      package_type: "room_fnb_bundle",
      selling_price: 1100000,
      status: "active",
      valid_day_type: "all",
      duration_minutes: 120,
      updated_at: now,
      note: "Package karaoke 2 jam + F&B",
    },
    package_details: [
      {
        package_detail_id: "PKD-001",
        package_id: "PKG-001",
        line_no: 1,
        component_type: "service",
        component_ref_id: "SVC-001",
        component_name: "Room",
        qty: 2,
        unit: "Hour",
        hpp: 0,
        additional_price: 0,
        cost_amount: 0,
        is_choice: "no",
        choice_group: "",
        updated_at: now,
        note: "",
      },
      {
        package_detail_id: "PKD-002",
        package_id: "PKG-001",
        line_no: 2,
        component_type: "service",
        component_ref_id: "SVC-002",
        component_name: "LC/Talent",
        qty: 2,
        unit: "Person",
        hpp: 0,
        additional_price: 0,
        cost_amount: 0,
        is_choice: "no",
        choice_group: "",
        updated_at: now,
        note: "",
      },
      {
        package_detail_id: "PKD-003",
        package_id: "PKG-001",
        line_no: 3,
        component_type: "inventory",
        component_ref_id: "ITEM-004",
        component_name: "Beer",
        qty: 6,
        unit: "botol",
        hpp: 0,
        additional_price: 0,
        cost_amount: 0,
        is_choice: "no",
        choice_group: "",
        updated_at: now,
        note: "",
      },
      {
        package_detail_id: "PKD-004",
        package_id: "PKG-001",
        line_no: 4,
        component_type: "inventory",
        component_ref_id: "ITEM-005",
        component_name: "Mineral Water 330ml",
        qty: 2,
        unit: "botol",
        hpp: 0,
        additional_price: 0,
        cost_amount: 0,
        is_choice: "no",
        choice_group: "",
        updated_at: now,
        note: "",
      },
      {
        package_detail_id: "PKD-005",
        package_id: "PKG-001",
        line_no: 5,
        component_type: "menu",
        component_ref_id: "MENU-004",
        component_name: "Fruit Platter",
        qty: 1,
        unit: "porsi",
        hpp: 0,
        additional_price: 0,
        cost_amount: 0,
        is_choice: "no",
        choice_group: "",
        updated_at: now,
        note: "",
      },
    ],
  };
}

function collectFnbV24PackageImportPlan_(config) {
  var output = buildFnbV24PackageImportOutput_(config);
  var abortReasons = [];
  var packageMasterSheet;
  var packageDetailSheet;
  var packageMasterRows;
  var packageDetailRows;
  var packageMasterHeaderMap;
  var packageDetailHeaderMap;

  if (!config.dry_run && !config.backup_confirmed) {
    abortReasons.push("BACKUP_NOT_CONFIRMED");
  }

  try {
    packageMasterSheet = getSheet_("PackageMaster");
    packageDetailSheet = getSheet_("PackageDetail");
  } catch (error) {
    abortReasons.push(error && error.message ? error.message : String(error));
    output.abort_reason = abortReasons.join("; ");
    output.validation = buildFnbV24PackageImportValidationOutput_(abortReasons);
    return output;
  }

  packageMasterHeaderMap = getHeaderMap_(packageMasterSheet);
  packageDetailHeaderMap = getHeaderMap_(packageDetailSheet);
  validateFnbV23BRequiredColumns_(packageMasterHeaderMap, PACKAGE_MASTER_HEADERS, "PackageMaster", abortReasons);
  validateFnbV23BRequiredColumns_(packageDetailHeaderMap, PACKAGE_DETAIL_HEADERS, "PackageDetail", abortReasons);

  packageMasterRows = getFnbV23BSheetRows_(packageMasterSheet, packageMasterHeaderMap);
  packageDetailRows = getFnbV23BSheetRows_(packageDetailSheet, packageDetailHeaderMap);

  output.validation = validateFnbV24PackageImportPlan_(config, packageMasterRows, packageDetailRows, abortReasons);
  output.ok = output.validation.ok;
  output.abort_reason = output.ok ? "" : output.validation.abort_reason;

  return output;
}

function executeFnbV24PackageImportPlan_(plan) {
  var packageMasterSheet = getSheet_("PackageMaster");
  var packageDetailSheet = getSheet_("PackageDetail");
  var detailRows = plan.planned_rows.package_details.slice().sort(function (first, second) {
    return (Number(first.line_no) || 0) - (Number(second.line_no) || 0);
  });

  appendObjectRow_(packageMasterSheet, plan.planned_rows.package_master);
  plan.inserted_rows.package_master.push({
    package_id: plan.planned_rows.package_master.package_id,
    package_name: plan.planned_rows.package_master.package_name,
    row_number: packageMasterSheet.getLastRow(),
  });

  detailRows.forEach(function (detail) {
    appendObjectRow_(packageDetailSheet, detail);
    plan.inserted_rows.package_details.push({
      package_detail_id: detail.package_detail_id,
      package_id: detail.package_id,
      line_no: detail.line_no,
      component_type: detail.component_type,
      component_ref_id: detail.component_ref_id,
      row_number: packageDetailSheet.getLastRow(),
    });
  });
}

function validateFnbV24PackageImport_(config) {
  var abortReasons = [];
  var packageMasterSheet = getSheet_("PackageMaster");
  var packageDetailSheet = getSheet_("PackageDetail");
  var packageMasterHeaderMap = getHeaderMap_(packageMasterSheet);
  var packageDetailHeaderMap = getHeaderMap_(packageDetailSheet);
  var packageMasterRows;
  var packageDetailRows;
  var duplicatePackageIds;
  var duplicatePackageDetailIds;
  var referenceCheck;
  var lineNumbers = {};

  validateFnbV23BRequiredColumns_(packageMasterHeaderMap, PACKAGE_MASTER_HEADERS, "PackageMaster", abortReasons);
  validateFnbV23BRequiredColumns_(packageDetailHeaderMap, PACKAGE_DETAIL_HEADERS, "PackageDetail", abortReasons);

  packageMasterRows = getFnbV23BSheetRows_(packageMasterSheet, packageMasterHeaderMap);
  packageDetailRows = getFnbV23BSheetRows_(packageDetailSheet, packageDetailHeaderMap);
  duplicatePackageIds = findFnbV24DuplicateIds_(packageMasterRows, "package_id");
  duplicatePackageDetailIds = findFnbV24DuplicateIds_(packageDetailRows, "package_detail_id");
  referenceCheck = buildFnbV24PackageReferenceCheck_(config.package_details, abortReasons);
  var packageMatches = packageMasterRows.filter(function (row) {
    return String(row.values.package_id || "").trim() === config.package_master.package_id
      && String(row.values.package_name || "").trim() === config.package_master.package_name;
  });
  var detailMatches = config.package_details.map(function (expectedDetail) {
    var matches = packageDetailRows.filter(function (row) {
      return String(row.values.package_detail_id || "").trim() === expectedDetail.package_detail_id
        && String(row.values.package_id || "").trim() === expectedDetail.package_id
        && String(row.values.component_type || "").trim() === expectedDetail.component_type
        && String(row.values.component_ref_id || "").trim() === expectedDetail.component_ref_id
        && String(row.values.component_name || "").trim() === expectedDetail.component_name;
    });

    if (matches.length !== 1) {
      abortReasons.push("PACKAGE_DETAIL_POST_VALIDATION_INVALID:" + expectedDetail.package_detail_id + ":" + matches.length);
    }

    return {
      package_detail_id: expectedDetail.package_detail_id,
      match_count: matches.length,
      row_numbers: matches.map(function (row) {
        return row.row_number;
      }),
    };
  });

  if (packageMatches.length !== 1) {
    abortReasons.push("PACKAGE_POST_VALIDATION_INVALID:" + config.package_master.package_id + ":" + packageMatches.length);
  }

  config.package_details.forEach(function (detail) {
    var lineNo = String(detail.line_no || "").trim();
    var detailPackageId = String(detail.package_id || "").trim();
    var scopedLineNo = detailPackageId + "::" + lineNo;

    if (detailPackageId !== config.package_master.package_id) {
      abortReasons.push("PACKAGE_DETAIL_PACKAGE_ID_MISMATCH:" + detail.package_detail_id);
    }

    if (!isFnbV24PackageComponentTypeValid_(detail.component_type)) {
      abortReasons.push("INVALID_COMPONENT_TYPE:" + detail.package_detail_id + ":" + detail.component_type);
    }

    if (!lineNo || lineNumbers[scopedLineNo]) {
      abortReasons.push("DUPLICATE_OR_EMPTY_LINE_NO:" + detail.package_detail_id + ":" + scopedLineNo);
    }

    lineNumbers[scopedLineNo] = true;
  });

  if (duplicatePackageIds.length) {
    abortReasons.push("DUPLICATE_PACKAGE_ID_EXISTS");
  }

  if (duplicatePackageDetailIds.length) {
    abortReasons.push("DUPLICATE_PACKAGE_DETAIL_ID_EXISTS");
  }

  return {
    ok: abortReasons.length === 0,
    abort_reason: abortReasons.join("; "),
    errors: abortReasons,
    duplicate_check: {
      package_id: duplicatePackageIds,
      package_detail_id: duplicatePackageDetailIds,
    },
    reference_check: referenceCheck,
    package_master_post_validation: {
      package_id: config.package_master.package_id,
      match_count: packageMatches.length,
      row_numbers: packageMatches.map(function (row) {
        return row.row_number;
      }),
    },
    package_detail_post_validation: detailMatches,
  };
}

function buildFnbV24PackageImportErrorOutput_(config, partialOutput, error) {
  var output = partialOutput || buildFnbV24PackageImportOutput_(config);

  output.ok = false;
  output.error_message = error && error.message ? error.message : String(error);
  output.partial_insert = output.inserted_rows.package_master.length > 0
    && output.inserted_rows.package_details.length !== config.package_details.length;
  output.abort_reason = output.partial_insert ? "ERROR_PARTIAL_INSERT" : "ERROR";

  if (output.partial_insert) {
    output.rollback_info = buildFnbV24PackageImportRollbackInfo_(output);
  }

  return output;
}

function buildFnbV24PackageImportOutput_(config) {
  return {
    ok: false,
    dry_run: config.dry_run,
    import_id: config.import_id,
    backup_confirmed: config.backup_confirmed,
    abort_reason: "",
    error_message: "",
    partial_insert: false,
    planned_rows: {
      package_master: config.package_master,
      package_details: config.package_details,
    },
    inserted_rows: {
      package_master: [],
      package_details: [],
    },
    validation: {},
    rollback_info: [],
  };
}

function validateFnbV24PackageImportPlan_(config, packageMasterRows, packageDetailRows, abortReasons) {
  var errors = abortReasons ? abortReasons.slice() : [];
  var packageId = config.package_master.package_id;
  var packageDetailIds = config.package_details.map(function (detail) {
    return detail.package_detail_id;
  });
  var referenceCheck = buildFnbV24PackageReferenceCheck_(config.package_details, errors);
  var duplicatePackageIds = findFnbV24DuplicateIds_(packageMasterRows, "package_id");
  var duplicatePackageDetailIds = findFnbV24DuplicateIds_(packageDetailRows, "package_detail_id");
  var existingPackageRows = findFnbV24RowsByValue_(packageMasterRows, "package_id", packageId);
  var existingDetailRows = packageDetailIds.reduce(function (rowsById, packageDetailId) {
    rowsById[packageDetailId] = findFnbV24RowsByValue_(packageDetailRows, "package_detail_id", packageDetailId);
    return rowsById;
  }, {});
  var detailPackageIds = {};
  var lineNumbers = {};

  if (existingPackageRows.length) {
    errors.push("PACKAGE_ID_ALREADY_EXISTS:" + packageId);
  }

  Object.keys(existingDetailRows).forEach(function (packageDetailId) {
    if (existingDetailRows[packageDetailId].length) {
      errors.push("PACKAGE_DETAIL_ID_ALREADY_EXISTS:" + packageDetailId);
    }
  });

  if (duplicatePackageIds.length) {
    errors.push("DUPLICATE_PACKAGE_ID_EXISTS");
  }

  if (duplicatePackageDetailIds.length) {
    errors.push("DUPLICATE_PACKAGE_DETAIL_ID_EXISTS");
  }

  config.package_details.forEach(function (detail) {
    var lineNo = String(detail.line_no || "").trim();
    var componentType = String(detail.component_type || "").trim();

    if (String(detail.package_id || "").trim() !== packageId) {
      errors.push("PACKAGE_DETAIL_PACKAGE_ID_MISMATCH:" + detail.package_detail_id);
    }

    if (!isFnbV24PackageComponentTypeValid_(componentType)) {
      errors.push("INVALID_COMPONENT_TYPE:" + detail.package_detail_id + ":" + componentType);
    }

    if (!lineNo || lineNumbers[lineNo]) {
      errors.push("DUPLICATE_OR_EMPTY_LINE_NO:" + detail.package_detail_id + ":" + lineNo);
    }

    lineNumbers[lineNo] = true;
    detailPackageIds[String(detail.package_id || "").trim()] = true;
  });

  return {
    ok: errors.length === 0,
    abort_reason: errors.join("; "),
    errors: errors,
    sheet_availability: {
      PackageMaster: true,
      PackageDetail: true,
    },
    header_validation: {
      PackageMaster: errors.filter(function (error) {
        return String(error).indexOf("MISSING_COLUMN:PackageMaster.") === 0;
      }),
      PackageDetail: errors.filter(function (error) {
        return String(error).indexOf("MISSING_COLUMN:PackageDetail.") === 0;
      }),
    },
    duplicate_check: {
      package_id: duplicatePackageIds,
      package_detail_id: duplicatePackageDetailIds,
    },
    id_availability: {
      package_id: {
        id: packageId,
        available: existingPackageRows.length === 0,
        existing_row_numbers: existingPackageRows.map(function (row) {
          return row.row_number;
        }),
      },
      package_detail_id: Object.keys(existingDetailRows).map(function (packageDetailId) {
        return {
          id: packageDetailId,
          available: existingDetailRows[packageDetailId].length === 0,
          existing_row_numbers: existingDetailRows[packageDetailId].map(function (row) {
            return row.row_number;
          }),
        };
      }),
    },
    detail_validation: {
      unique_package_ids: Object.keys(detailPackageIds),
      line_no_values: Object.keys(lineNumbers),
      component_types_valid: config.package_details.every(function (detail) {
        return isFnbV24PackageComponentTypeValid_(detail.component_type);
      }),
    },
    reference_check: referenceCheck,
  };
}

function buildFnbV24PackageReferenceCheck_(details, errors) {
  var serviceItems = readSheetAsObjects_("ServiceItems");
  var inventoryItems = readSheetAsObjects_("Inventory");
  var menuItems = readSheetAsObjects_("Menu");
  var serviceMap = buildFnbV24ObjectMap_(serviceItems, "service_item_id");
  var inventoryMap = buildFnbV24ObjectMapWithFallback_(inventoryItems, "stock_item_id", "item_id");
  var menuMap = buildFnbV24ObjectMap_(menuItems, "menu_id");

  return details.map(function (detail) {
    var componentType = String(detail.component_type || "").trim();
    var componentRefId = String(detail.component_ref_id || "").trim();
    var expectedName = String(detail.component_name || "").trim();
    var reference = null;
    var actualName = "";

    if (componentType === "service") {
      reference = serviceMap[componentRefId] || null;
      actualName = reference ? String(reference.service_name || "").trim() : "";
    } else if (componentType === "inventory") {
      reference = inventoryMap[componentRefId] || null;
      actualName = reference ? String(reference.stock_item_name || reference.item_name || "").trim() : "";
    } else if (componentType === "menu") {
      reference = menuMap[componentRefId] || null;
      actualName = reference ? String(reference.menu_name || "").trim() : "";
    }

    if (!reference) {
      errors.push("REFERENCE_NOT_FOUND:" + detail.package_detail_id + ":" + componentRefId);
    } else if (actualName !== expectedName) {
      errors.push("REFERENCE_NAME_MISMATCH:" + detail.package_detail_id + ":" + componentRefId);
    }

    return {
      package_detail_id: detail.package_detail_id,
      component_type: componentType,
      component_ref_id: componentRefId,
      expected_name: expectedName,
      actual_name: actualName,
      exists: Boolean(reference),
      name_ok: Boolean(reference) && actualName === expectedName,
    };
  });
}

function findFnbV24DuplicateIds_(rows, fieldName) {
  var groups = {};
  var duplicates = [];

  rows.forEach(function (row) {
    var id = String(row.values[fieldName] || "").trim();

    if (!id) {
      return;
    }

    if (!groups[id]) {
      groups[id] = [];
    }

    groups[id].push(row.row_number);
  });

  Object.keys(groups).forEach(function (id) {
    if (groups[id].length > 1) {
      duplicates.push({
        id: id,
        count: groups[id].length,
        row_numbers: groups[id],
      });
    }
  });

  return duplicates;
}

function findFnbV24RowsByValue_(rows, fieldName, value) {
  var expectedValue = String(value || "").trim();

  return rows.filter(function (row) {
    return String(row.values[fieldName] || "").trim() === expectedValue;
  });
}

function isFnbV24PackageComponentTypeValid_(componentType) {
  var normalizedType = String(componentType || "").trim();

  return normalizedType === "service"
    || normalizedType === "inventory"
    || normalizedType === "menu";
}

function buildFnbV24ObjectMap_(rows, idField) {
  return rows.reduce(function (map, row) {
    var id = String(row[idField] || "").trim();

    if (id) {
      map[id] = row;
    }

    return map;
  }, {});
}

function buildFnbV24ObjectMapWithFallback_(rows, primaryIdField, fallbackIdField) {
  return rows.reduce(function (map, row) {
    var id = String(row[primaryIdField] || row[fallbackIdField] || "").trim();

    if (id) {
      map[id] = row;
    }

    return map;
  }, {});
}

function buildFnbV24PackageImportValidationOutput_(errors) {
  return {
    ok: false,
    abort_reason: errors.join("; "),
    errors: errors,
  };
}

function buildFnbV24PackageImportRollbackInfo_(output) {
  return [
    "Manual rollback required if partial_insert=true.",
    "Review PackageMaster package_id=PKG-001.",
    "Review PackageDetail package_detail_id=PKD-001..PKD-005.",
    "Do not delete rows until operator confirms no dependent usage.",
    "Inserted PackageMaster rows: " + JSON.stringify(output.inserted_rows.package_master),
    "Inserted PackageDetail rows: " + JSON.stringify(output.inserted_rows.package_details),
  ];
}

function migrateFnbV23BInventoryIdentity_(config) {
  var migrationConfig = buildFnbV23BInventoryIdentityConfig_(config || {});
  var lock = LockService.getScriptLock();
  var lockAcquired = false;
  var output;

  try {
    if (!lock.tryLock(2000)) {
      return buildFnbV23BInventoryIdentityErrorOutput_(
        migrationConfig,
        output,
        new Error("Sistem sedang memproses perubahan lain. Coba lagi sebentar.")
      );
    }
    lockAcquired = true;

    output = collectFnbV23BInventoryIdentityPlan_(migrationConfig);

    if (!output.ok || migrationConfig.dry_run) {
      return output;
    }

    executeFnbV23BInventoryIdentityPlan_(output);
    output.post_validation = validateFnbV23BInventoryIdentityMigration_(migrationConfig);
    output.ok = output.post_validation.ok;
    output.warnings = output.warnings.concat(output.post_validation.warnings || []);

    if (!output.ok) {
      output.abort_reason = output.post_validation.abort_reason || "POST_VALIDATION_FAILED";
    }

    return output;
  } catch (error) {
    return buildFnbV23BInventoryIdentityErrorOutput_(migrationConfig, output, error);
  } finally {
    if (lockAcquired) {
      lock.releaseLock();
    }
  }
}

function buildFnbV23BInventoryIdentityConfig_(config) {
  return {
    migration_id: "MIG-FNB-V23B-INVENTORY-" + Utilities.formatDate(new Date(), "Asia/Jakarta", "yyyyMMdd-HHmmss"),
    dry_run: config.dry_run !== false,
    backup_confirmed: config.backup_confirmed === true,
    canonical_items: [
      {
        stock_item_id: "ITEM-001",
        stock_item_name: "Air Mineral 600ml",
      },
      {
        stock_item_id: "ITEM-002",
        stock_item_name: "Teh Botol",
      },
    ],
    protected_menu_refs: [
      {
        menu_id: "MENU-001",
        menu_name: "Air Mineral 600ml",
        stock_item_id: "ITEM-001",
      },
      {
        menu_id: "MENU-002",
        menu_name: "Teh Botol",
        stock_item_id: "ITEM-002",
      },
    ],
    mappings: [
      {
        old_stock_item_id: "ITEM-001",
        stock_item_name: "TEST - INVENTORY QA",
        new_stock_item_id: "ITEM-QA-001",
      },
      {
        old_stock_item_id: "ITEM-002",
        stock_item_name: "TEST - Inventory Delete QA",
        new_stock_item_id: "ITEM-QA-002",
      },
    ],
  };
}

function collectFnbV23BInventoryIdentityPlan_(config) {
  var inventorySheet = getSheet_("Inventory");
  var stockMovementsSheet = getSheet_("StockMovements");
  var menuSheet = getSheet_("Menu");
  var inventoryHeaderMap = getHeaderMap_(inventorySheet);
  var stockMovementsHeaderMap = getHeaderMap_(stockMovementsSheet);
  var menuHeaderMap = getHeaderMap_(menuSheet);
  var inventoryRows = getFnbV23BSheetRows_(inventorySheet, inventoryHeaderMap);
  var stockMovementRows = getFnbV23BSheetRows_(stockMovementsSheet, stockMovementsHeaderMap);
  var menuRows = getFnbV23BSheetRows_(menuSheet, menuHeaderMap);
  var output = {
    ok: true,
    dry_run: config.dry_run,
    migration_id: config.migration_id,
    backup_confirmed: config.backup_confirmed,
    planned_updates: {
      inventory_updates: [],
      stock_movement_updates: [],
    },
    applied_updates: {
      inventory_updates: [],
      stock_movement_updates: [],
    },
    partial_applied: false,
    inventory_updates: [],
    stock_movement_updates: [],
    canonical_inventory_rows: [],
    protected_menu_refs: [],
    duplicate_stock_item_id_before: [],
    duplicate_stock_item_id_after: [],
    warnings: [],
    abort_reason: "",
  };
  var abortReasons = [];

  validateFnbV23BRequiredColumns_(inventoryHeaderMap, ["stock_item_id", "stock_item_name"], "Inventory", abortReasons);
  validateFnbV23BRequiredColumns_(stockMovementsHeaderMap, ["stock_item_id", "stock_item_name", "movement_id", "reference_type", "reference_id", "qty_change", "note", "created_at"], "StockMovements", abortReasons);
  validateFnbV23BRequiredColumns_(menuHeaderMap, ["menu_id", "menu_name", "stock_item_id"], "Menu", abortReasons);

  if (!config.dry_run && !config.backup_confirmed) {
    abortReasons.push("BACKUP_NOT_CONFIRMED");
  }

  config.canonical_items.forEach(function (canonical) {
    var rows = findFnbV23BRowsByStockIdentity_(inventoryRows, canonical.stock_item_id, canonical.stock_item_name);

    if (rows.length !== 1) {
      abortReasons.push("CANONICAL_ROW_COUNT_INVALID:" + canonical.stock_item_id + ":" + canonical.stock_item_name + ":" + rows.length);
    } else {
      output.canonical_inventory_rows.push(buildFnbV23BInventoryRowAudit_(rows[0]));
    }
  });

  config.mappings.forEach(function (mapping) {
    var targetRows = inventoryRows.filter(function (row) {
      return String(row.values.stock_item_id || row.values.item_id || "").trim() === mapping.new_stock_item_id;
    });

    if (targetRows.length > 0) {
      abortReasons.push("TARGET_ID_ALREADY_EXISTS:" + mapping.new_stock_item_id);
    }

    var qaRows = findFnbV23BRowsByStockIdentity_(inventoryRows, mapping.old_stock_item_id, mapping.stock_item_name);

    if (qaRows.length !== 1) {
      abortReasons.push("QA_ROW_COUNT_INVALID:" + mapping.old_stock_item_id + ":" + mapping.stock_item_name + ":" + qaRows.length);
      return;
    }

    output.inventory_updates.push({
      sheet: "Inventory",
      row_number: qaRows[0].row_number,
      column_name: "stock_item_id",
      stock_item_name: mapping.stock_item_name,
      old_stock_item_id: mapping.old_stock_item_id,
      new_stock_item_id: mapping.new_stock_item_id,
      old_value: mapping.old_stock_item_id,
      new_value: mapping.new_stock_item_id,
    });
  });
  output.planned_updates.inventory_updates = output.inventory_updates;

  validateFnbV23BDuplicateScope_(config, inventoryRows, output, abortReasons);
  validateFnbV23BMenuRefs_(config, menuRows, output, abortReasons);
  collectFnbV23BStockMovementUpdates_(config, stockMovementRows, output, abortReasons);
  output.planned_updates.stock_movement_updates = output.stock_movement_updates;

  if (abortReasons.length > 0) {
    output.ok = false;
    output.abort_reason = abortReasons.join("; ");
  }

  return output;
}

function validateFnbV23BRequiredColumns_(headerMap, columns, sheetName, abortReasons) {
  columns.forEach(function (column) {
    if (!headerMap[column]) {
      abortReasons.push("MISSING_COLUMN:" + sheetName + "." + column);
    }
  });
}

function getFnbV23BSheetRows_(sheet, headerMap) {
  var lastRow = sheet.getLastRow();
  var lastColumn = sheet.getLastColumn();

  if (lastRow < 2 || lastColumn < 1) {
    return [];
  }

  var values = sheet.getRange(2, 1, lastRow - 1, lastColumn).getValues();
  var headerByColumn = {};

  Object.keys(headerMap).forEach(function (header) {
    headerByColumn[headerMap[header]] = header;
  });

  return values.reduce(function (rows, row, index) {
    var isEmptyRow = row.every(function (cell) {
      return cell === "" || cell === null;
    });

    if (isEmptyRow) {
      return rows;
    }

    var valuesByHeader = {};

    Object.keys(headerByColumn).forEach(function (column) {
      var header = headerByColumn[column];
      valuesByHeader[header] = normalizeCellValue_(header, row[Number(column) - 1]);
    });

    rows.push({
      row_number: index + 2,
      values: valuesByHeader,
    });
    return rows;
  }, []);
}

function findFnbV23BRowsByStockIdentity_(rows, stockItemId, stockItemName) {
  var expectedId = String(stockItemId || "").trim();
  var expectedName = String(stockItemName || "").trim();

  return rows.filter(function (row) {
    var rowId = String(row.values.stock_item_id || row.values.item_id || "").trim();
    var rowName = String(row.values.stock_item_name || row.values.item_name || "").trim();

    return rowId === expectedId && rowName === expectedName;
  });
}

function buildFnbV23BInventoryRowAudit_(row) {
  return {
    row_number: row.row_number,
    stock_item_id: row.values.stock_item_id || row.values.item_id || "",
    stock_item_name: row.values.stock_item_name || row.values.item_name || "",
    category: row.values.category || "",
    unit: row.values.unit || "",
    stock_qty: Number(row.values.stock_qty) || 0,
    min_stock: Number(row.values.min_stock) || 0,
    status: row.values.status || "",
    updated_at: row.values.updated_at || "",
  };
}

function validateFnbV23BDuplicateScope_(config, inventoryRows, output, abortReasons) {
  config.canonical_items.forEach(function (canonical) {
    var rowsForId = inventoryRows.filter(function (row) {
      return String(row.values.stock_item_id || row.values.item_id || "").trim() === canonical.stock_item_id;
    });
    var allowedNames = [canonical.stock_item_name].concat(config.mappings.filter(function (mapping) {
      return mapping.old_stock_item_id === canonical.stock_item_id;
    }).map(function (mapping) {
      return mapping.stock_item_name;
    }));
    var unexpectedRows = rowsForId.filter(function (row) {
      var rowName = String(row.values.stock_item_name || row.values.item_name || "").trim();
      return allowedNames.indexOf(rowName) === -1;
    });

    output.duplicate_stock_item_id_before.push({
      stock_item_id: canonical.stock_item_id,
      count: rowsForId.length,
      row_numbers: rowsForId.map(function (row) {
        return row.row_number;
      }),
      names: rowsForId.map(function (row) {
        return row.values.stock_item_name || row.values.item_name || "";
      }),
    });

    if (rowsForId.length !== allowedNames.length) {
      abortReasons.push("DUPLICATE_SCOPE_COUNT_INVALID:" + canonical.stock_item_id + ":" + rowsForId.length);
    }

    if (unexpectedRows.length > 0) {
      abortReasons.push("DUPLICATE_SCOPE_UNEXPECTED_ROWS:" + canonical.stock_item_id);
    }
  });
}

function validateFnbV23BMenuRefs_(config, menuRows, output, abortReasons) {
  config.protected_menu_refs.forEach(function (expected) {
    var rows = menuRows.filter(function (row) {
      return String(row.values.menu_id || "").trim() === expected.menu_id;
    });

    if (rows.length !== 1) {
      abortReasons.push("PROTECTED_MENU_ROW_COUNT_INVALID:" + expected.menu_id + ":" + rows.length);
      return;
    }

    var row = rows[0];
    var actualStockItemId = String(row.values.stock_item_id || "").trim();
    var actualMenuName = String(row.values.menu_name || "").trim();

    output.protected_menu_refs.push({
      row_number: row.row_number,
      menu_id: expected.menu_id,
      menu_name: actualMenuName,
      expected_stock_item_id: expected.stock_item_id,
      actual_stock_item_id: actualStockItemId,
    });

    if (actualStockItemId !== expected.stock_item_id) {
      abortReasons.push("PROTECTED_MENU_REF_CHANGED:" + expected.menu_id + ":" + actualStockItemId);
    }
  });
}

function collectFnbV23BStockMovementUpdates_(config, stockMovementRows, output, abortReasons) {
  var oldIds = config.canonical_items.map(function (canonical) {
    return canonical.stock_item_id;
  });
  var knownNamesByOldId = {};

  config.canonical_items.forEach(function (canonical) {
    knownNamesByOldId[canonical.stock_item_id] = [canonical.stock_item_name];
  });
  config.mappings.forEach(function (mapping) {
    if (!knownNamesByOldId[mapping.old_stock_item_id]) {
      knownNamesByOldId[mapping.old_stock_item_id] = [];
    }

    knownNamesByOldId[mapping.old_stock_item_id].push(mapping.stock_item_name);
  });

  stockMovementRows.forEach(function (row) {
    var rowId = String(row.values.stock_item_id || "").trim();
    var rowName = String(row.values.stock_item_name || "").trim();

    if (oldIds.indexOf(rowId) === -1) {
      return;
    }

    if ((knownNamesByOldId[rowId] || []).indexOf(rowName) === -1) {
      abortReasons.push("UNKNOWN_STOCK_MOVEMENT_NAME:" + rowId + ":" + rowName + ":ROW_" + row.row_number);
      return;
    }

    config.mappings.forEach(function (mapping) {
      if (rowId !== mapping.old_stock_item_id || rowName !== mapping.stock_item_name) {
        return;
      }

      output.stock_movement_updates.push({
        sheet: "StockMovements",
        row_number: row.row_number,
        column_name: "stock_item_id",
        movement_id: row.values.movement_id || "",
        created_at: row.values.created_at || "",
        stock_item_name: rowName,
        old_stock_item_id: mapping.old_stock_item_id,
        new_stock_item_id: mapping.new_stock_item_id,
        old_value: mapping.old_stock_item_id,
        new_value: mapping.new_stock_item_id,
        qty_change: Number(row.values.qty_change) || 0,
        reference_type: row.values.reference_type || "",
        reference_id: row.values.reference_id || "",
        note: row.values.note || "",
      });
    });
  });
}

function executeFnbV23BInventoryIdentityPlan_(plan) {
  var inventorySheet = getSheet_("Inventory");
  var stockMovementsSheet = getSheet_("StockMovements");
  var inventoryHeaderMap = getHeaderMap_(inventorySheet);
  var stockMovementsHeaderMap = getHeaderMap_(stockMovementsSheet);

  if (!plan.applied_updates) {
    plan.applied_updates = {
      inventory_updates: [],
      stock_movement_updates: [],
    };
  }

  plan.inventory_updates.forEach(function (update) {
    applyFnbV23BCellUpdate_(inventorySheet, inventoryHeaderMap, update, plan.applied_updates.inventory_updates);
  });

  plan.stock_movement_updates.forEach(function (update) {
    applyFnbV23BCellUpdate_(stockMovementsSheet, stockMovementsHeaderMap, update, plan.applied_updates.stock_movement_updates);
  });
}

function applyFnbV23BCellUpdate_(sheet, headerMap, update, appliedUpdates) {
  var column = headerMap[update.column_name];

  if (!column) {
    throw new Error("Kolom tidak ditemukan untuk migrasi: " + update.sheet + "." + update.column_name);
  }

  var range = sheet.getRange(update.row_number, column);
  var currentValue = String(range.getValue() || "").trim();
  var expectedValue = String(update.old_value || "").trim();

  if (currentValue !== expectedValue) {
    throw new Error("Nilai lama tidak sesuai untuk " + update.sheet + " row " + update.row_number + " kolom " + update.column_name + ". Expected: " + expectedValue + ", actual: " + currentValue);
  }

  range.setValue(update.new_value);
  appliedUpdates.push(Object.assign({}, update, {
    column: update.column_name,
    old_value: expectedValue,
    new_value: update.new_value,
    timestamp: toJakartaIsoString_(new Date()),
  }));
}

function validateFnbV23BInventoryIdentityMigration_(config) {
  var inventorySheet = getSheet_("Inventory");
  var stockMovementsSheet = getSheet_("StockMovements");
  var menuSheet = getSheet_("Menu");
  var inventoryRows = getFnbV23BSheetRows_(inventorySheet, getHeaderMap_(inventorySheet));
  var stockMovementRows = getFnbV23BSheetRows_(stockMovementsSheet, getHeaderMap_(stockMovementsSheet));
  var menuRows = getFnbV23BSheetRows_(menuSheet, getHeaderMap_(menuSheet));
  var duplicateIds = [];
  var idGroups = {};
  var protectedMenuRefs = [];
  var abortReasons = [];
  var warnings = [];
  var scopedIds = config.canonical_items.map(function (canonical) {
    return canonical.stock_item_id;
  }).concat(config.mappings.map(function (mapping) {
    return mapping.new_stock_item_id;
  }));

  inventoryRows.forEach(function (row) {
    var stockItemId = String(row.values.stock_item_id || row.values.item_id || "").trim();

    if (!stockItemId) {
      return;
    }

    if (!idGroups[stockItemId]) {
      idGroups[stockItemId] = [];
    }

    idGroups[stockItemId].push(row);
  });
  Object.keys(idGroups).forEach(function (stockItemId) {
    if (idGroups[stockItemId].length > 1) {
      duplicateIds.push({
        stock_item_id: stockItemId,
        count: idGroups[stockItemId].length,
        row_numbers: idGroups[stockItemId].map(function (row) {
          return row.row_number;
        }),
      });
    }
  });

  duplicateIds.forEach(function (duplicate) {
    if (scopedIds.indexOf(duplicate.stock_item_id) !== -1) {
      abortReasons.push("POST_SCOPED_DUPLICATE_STOCK_ITEM_ID_EXISTS:" + duplicate.stock_item_id);
    } else {
      warnings.push("POST_OUT_OF_SCOPE_DUPLICATE_STOCK_ITEM_ID:" + duplicate.stock_item_id);
    }
  });

  config.canonical_items.forEach(function (canonical) {
    var rows = findFnbV23BRowsByStockIdentity_(inventoryRows, canonical.stock_item_id, canonical.stock_item_name);

    if (rows.length !== 1) {
      abortReasons.push("POST_CANONICAL_ROW_INVALID:" + canonical.stock_item_id + ":" + rows.length);
    }
  });

  config.mappings.forEach(function (mapping) {
    var oldRows = findFnbV23BRowsByStockIdentity_(inventoryRows, mapping.old_stock_item_id, mapping.stock_item_name);
    var newRows = findFnbV23BRowsByStockIdentity_(inventoryRows, mapping.new_stock_item_id, mapping.stock_item_name);

    if (oldRows.length !== 0) {
      abortReasons.push("POST_QA_OLD_ID_STILL_EXISTS:" + mapping.old_stock_item_id + ":" + mapping.stock_item_name);
    }

    if (newRows.length !== 1) {
      abortReasons.push("POST_QA_NEW_ID_INVALID:" + mapping.new_stock_item_id + ":" + newRows.length);
    }

    stockMovementRows.forEach(function (row) {
      var stockItemId = String(row.values.stock_item_id || "").trim();
      var stockItemName = String(row.values.stock_item_name || "").trim();

      if (stockItemId === mapping.old_stock_item_id && stockItemName === mapping.stock_item_name) {
        abortReasons.push("POST_QA_STOCK_MOVEMENT_OLD_ID_EXISTS:" + mapping.old_stock_item_id + ":ROW_" + row.row_number);
      }
    });
  });

  config.protected_menu_refs.forEach(function (expected) {
    var rows = menuRows.filter(function (row) {
      return String(row.values.menu_id || "").trim() === expected.menu_id;
    });

    if (rows.length !== 1) {
      abortReasons.push("POST_PROTECTED_MENU_ROW_INVALID:" + expected.menu_id + ":" + rows.length);
      return;
    }

    protectedMenuRefs.push({
      row_number: rows[0].row_number,
      menu_id: expected.menu_id,
      menu_name: rows[0].values.menu_name || "",
      expected_stock_item_id: expected.stock_item_id,
      actual_stock_item_id: rows[0].values.stock_item_id || "",
    });

    if (String(rows[0].values.stock_item_id || "").trim() !== expected.stock_item_id) {
      abortReasons.push("POST_PROTECTED_MENU_REF_CHANGED:" + expected.menu_id);
    }
  });

  return {
    ok: abortReasons.length === 0,
    abort_reason: abortReasons.join("; "),
    duplicate_stock_item_id_after: duplicateIds,
    protected_menu_refs: protectedMenuRefs,
    warnings: warnings,
  };
}

function buildFnbV23BInventoryIdentityErrorOutput_(config, partialOutput, error) {
  var appliedUpdates = partialOutput && partialOutput.applied_updates
    ? partialOutput.applied_updates
    : {
      inventory_updates: [],
      stock_movement_updates: [],
    };
  var partialApplied = appliedUpdates.inventory_updates.length > 0 || appliedUpdates.stock_movement_updates.length > 0;

  return {
    ok: false,
    dry_run: config ? config.dry_run : true,
    migration_id: config ? config.migration_id : "",
    backup_confirmed: config ? config.backup_confirmed : false,
    abort_reason: "ERROR",
    error_message: error && error.message ? error.message : String(error),
    partial_applied: partialApplied,
    planned_updates: partialOutput && partialOutput.planned_updates ? partialOutput.planned_updates : {
      inventory_updates: partialOutput && partialOutput.inventory_updates ? partialOutput.inventory_updates : [],
      stock_movement_updates: partialOutput && partialOutput.stock_movement_updates ? partialOutput.stock_movement_updates : [],
    },
    applied_updates: appliedUpdates,
    inventory_updates: partialOutput && partialOutput.inventory_updates ? partialOutput.inventory_updates : [],
    stock_movement_updates: partialOutput && partialOutput.stock_movement_updates ? partialOutput.stock_movement_updates : [],
    warnings: partialOutput && partialOutput.warnings ? partialOutput.warnings : [],
  };
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
  return ensureSheetHasHeaders_(
    ensureSheetWithHeaders_("FnbOrderItems", FNB_ORDER_ITEMS_HEADERS),
    FNB_ORDER_ITEMS_HEADERS
  );
}

function ensureMenuStockColumns_() {
  var sheet = getSheet_("Menu");
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(function (header) {
    return String(header).trim();
  });

  MENU_MASTER_HEADERS.concat(MENU_STOCK_HEADERS).forEach(function (header) {
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

function ensureServiceItemsSheet_() {
  return ensureSheetColumns_("ServiceItems", SERVICE_ITEMS_HEADERS);
}

function ensureCostingSheet_() {
  return ensureSheetColumns_("Costing", COSTING_HEADERS);
}

function ensurePackageMasterSheet_() {
  return ensureSheetColumns_("PackageMaster", PACKAGE_MASTER_HEADERS);
}

function ensurePackageDetailSheet_() {
  return ensureSheetColumns_("PackageDetail", PACKAGE_DETAIL_HEADERS);
}

function ensureRoomSessionsSheet_() {
  return ensureSheetColumns_(ROOM_SESSIONS_SHEET, ROOM_SESSION_HEADERS);
}

function ensureRecipeBomSheet_() {
  return ensureSheetColumns_("RecipeBom", RECIPE_BOM_HEADERS);
}

function ensureSheetColumns_(sheetName, expectedHeaders) {
  var sheet = ensureSheetWithHeaders_(sheetName, expectedHeaders);
  ensureColumns_(sheet, expectedHeaders);
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

function ensureInventoryAuditsSheet_() {
  return ensureSheetColumns_("InventoryAudits", INVENTORY_AUDIT_HEADERS);
}

function ensureInventoryAuditLinesSheet_() {
  return ensureSheetColumns_("InventoryAuditLines", INVENTORY_AUDIT_LINE_HEADERS);
}

function ensureInventoryAuditSheets_() {
  ensureInventoryAuditsSheet_();
  ensureInventoryAuditLinesSheet_();
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
      bonus_sales_lc: Number(menuItem.bonus_sales_lc || menuItem.bonus_per_item) || 0,
    };
  });
}

function ensureCashierClosingSnapshotSheets_() {
  return {
    transactions: ensureSheetWithHeaders_("CashierClosingTransactions", CASHIER_CLOSING_TRANSACTIONS_HEADERS),
    fnb_items: ensureSheetWithHeaders_("CashierClosingFnbItems", CASHIER_CLOSING_FNB_ITEMS_HEADERS),
    lc_details: ensureSheetWithHeaders_("CashierClosingLcDetails", CASHIER_CLOSING_LC_DETAILS_HEADERS),
  };
}

function ensureReceiptPrintLogsSheet_() {
  return ensureSheetColumns_("ReceiptPrintLogs", RECEIPT_PRINT_LOGS_HEADERS);
}

function generateReceiptPrintLogId_() {
  return "RPL-" + Utilities.formatDate(new Date(), "Asia/Jakarta", "yyyyMMdd-HHmmss") + "-" + Math.floor(Math.random() * 1000);
}

function logReceiptPrint_(payload) {
  var request = payload || {};
  var transactionId = String(request.transaction_id || "").trim();

  if (!transactionId) {
    return {
      ok: false,
      success: false,
      error: "transaction_id wajib diisi.",
    };
  }

  var transactionsSheet = ensureTransactionsSheetColumns_();
  var transactionsHeaderMap = getHeaderMap_(transactionsSheet);
  var transactionRowNumber = findRowByValue_(transactionsSheet, transactionsHeaderMap, "transaction_id", transactionId);

  if (!transactionRowNumber) {
    return {
      ok: false,
      success: false,
      transaction_id: transactionId,
      error: "Transaksi tidak ditemukan.",
    };
  }

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(2000)) {
    return createLockBusyResponse_("Sistem sedang mencatat cetak struk lain. Coba lagi sebentar.");
  }

  try {
    var sheet = ensureReceiptPrintLogsSheet_();
    var headerMap = getHeaderMap_(sheet);
    var existingCount = countRowsByValue_(sheet, headerMap, "transaction_id", transactionId);
    var sequence = existingCount + 1;
    var now = toJakartaIsoString_(new Date());
    var printType = String(request.print_type || "browser").trim().toLowerCase();

    if (["browser", "thermal"].indexOf(printType) === -1) {
      printType = "browser";
    }

    var logEntry = {
      print_log_id: generateReceiptPrintLogId_(),
      transaction_id: transactionId,
      print_sequence: sequence,
      is_reprint: sequence > 1,
      print_type: printType,
      cashier_name: String(request.cashier_name || "Kasir").trim() || "Kasir",
      printed_at: now,
      note: String(request.note || "").trim(),
    };

    appendObjectRow_(sheet, logEntry);

    return {
      ok: true,
      success: true,
      log: logEntry,
      transaction_id: transactionId,
      print_sequence: sequence,
      is_reprint: sequence > 1,
      reprint_number: Math.max(0, sequence - 1),
      printed_at: now,
      cashier_name: logEntry.cashier_name,
      print_type: printType,
    };
  } finally {
    lock.releaseLock();
  }
}

function countRowsByValue_(sheet, headerMap, columnName, value) {
  var column = headerMap[columnName];

  if (!column) {
    return 0;
  }

  var lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return 0;
  }

  var values = sheet.getRange(2, column, lastRow - 1, 1).getValues();
  var expectedValue = String(value || "").trim();
  var count = 0;

  values.forEach(function (row) {
    if (String(row[0] || "").trim() === expectedValue) {
      count += 1;
    }
  });

  return count;
}

function appendCashierClosingSnapshotRows_(sheet, rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return;
  }
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(function (header) {
    return String(header).trim();
  });
  var values = rows.map(function (row) {
    return headers.map(function (header) {
      return row[header] !== undefined ? row[header] : "";
    });
  });
  sheet.getRange(sheet.getLastRow() + 1, 1, values.length, headers.length).setValues(values);
}

function buildCashierClosingSnapshot_(closing, snapshotAt) {
  var closingId = String(closing.closing_id || "").trim();
  var operationalDate = String(closing.closing_date || "").trim();
  var roomSessions = sheetExists_(ROOM_SESSIONS_SHEET)
    ? readSheetAsObjects_(ROOM_SESSIONS_SHEET)
    : [];
  var sessionsById = {};
  var sessionsByTransactionId = {};

  roomSessions.forEach(function (session) {
    var sessionId = String(session.session_id || "").trim();
    if (sessionId) {
      sessionsById[sessionId] = session;
    }
    [session.closed_transaction_id, session.prepayment_transaction_id].forEach(function (transactionId) {
      var normalizedTransactionId = String(transactionId || "").trim();
      if (normalizedTransactionId) {
        sessionsByTransactionId[normalizedTransactionId] = session;
      }
    });
  });

  var transactions = readSheetAsObjects_("Transactions").filter(function (transaction) {
    return resolveTransactionOperationalDateString_(transaction) === operationalDate;
  });
  var transactionIdByOrderId = {};
  var transactionRows = transactions.map(function (transaction, index) {
    var transactionId = String(transaction.transaction_id || "").trim();
    var session = sessionsByTransactionId[transactionId] || {};

    parseCommaSeparatedIds_(transaction.fnb_order_ids).forEach(function (orderId) {
      transactionIdByOrderId[orderId] = transactionId;
    });

    return {
      closing_transaction_id: closingId + "-TX-" + String(index + 1),
      closing_id: closingId,
      transaction_id: transactionId,
      transaction_type: transaction.transaction_type || "session_checkout",
      session_id: session.session_id || "",
      room_id: transaction.room_id || session.room_id || "",
      room_name: transaction.room_name || session.room_name || "",
      start_time: transaction.start_time || session.start_time || "",
      end_time: transaction.end_time || session.end_time || "",
      duration_minutes: Number(transaction.duration_minutes) || Number(session.booked_duration_minutes) || 0,
      room_total: Number(transaction.room_total) || 0,
      fnb_total: Number(transaction.fnb_total) || 0,
      lc_total: Number(transaction.lc_total) || 0,
      promo_code: transaction.promo_code || "",
      promo_discount: Number(transaction.promo_discount) || 0,
      grand_total: getTransactionAmount_(transaction),
      fnb_order_ids: transaction.fnb_order_ids || "",
      payment_method: transaction.payment_method || "",
      payment_status: transaction.payment_status || "",
      cashier_name: transaction.cashier_name || "",
      transaction_created_at: transaction.created_at || "",
      snapshot_at: snapshotAt,
    };
  });

  var fnbItemRows = [];
  if (sheetExists_("FnbOrders") && sheetExists_("FnbOrderItems")) {
    var itemsByOrderId = groupFnbOrderItemsByOrderId_(readFnbOrderItemsOrEmpty_());
    readFnbOrdersOrEmpty_().filter(function (order) {
      return resolveFnbOrderOperationalDateString_(order) === operationalDate;
    }).forEach(function (order) {
      var orderId = String(order.order_id || "").trim();
      (itemsByOrderId[orderId] || []).forEach(function (item) {
        fnbItemRows.push({
          closing_fnb_item_id: closingId + "-FNB-" + String(fnbItemRows.length + 1),
          closing_id: closingId,
          transaction_id: transactionIdByOrderId[orderId] || "",
          order_id: orderId,
          room_id: order.room_id || "",
          room_name: order.room_name || "",
          order_status: order.order_status || "",
          menu_id: item.menu_id || "",
          menu_name: item.menu_name || "",
          category: item.category || "",
          price: Number(item.price) || 0,
          quantity: Number(item.quantity) || 0,
          subtotal: Number(item.subtotal) || 0,
          order_created_at: order.created_at || "",
          snapshot_at: snapshotAt,
        });
      });
    });
  }

  var lcDetailRows = [];
  if (sheetExists_("LcWorkLogs")) {
    readSheetAsObjects_("LcWorkLogs").filter(function (workLog) {
      return normalizeLcFinanceOperationalDate_(workLog.created_at) === operationalDate;
    }).forEach(function (workLog) {
      var sessionId = String(workLog.session_id || "").trim();
      var session = sessionsById[sessionId] || {};
      var endTime = workLog.closed_at || session.end_time || "";

      lcDetailRows.push({
        closing_lc_detail_id: closingId + "-LC-" + String(lcDetailRows.length + 1),
        closing_id: closingId,
        entry_type: "work",
        log_id: workLog.log_id || "",
        bonus_log_id: "",
        transaction_id: session.closed_transaction_id || session.prepayment_transaction_id || "",
        order_id: "",
        session_id: sessionId,
        room_id: session.room_id || "",
        room_name: session.room_name || "",
        lc_id: workLog.lc_id || "",
        lc_name: workLog.lc_name || "",
        start_time: workLog.created_at || session.start_time || "",
        end_time: endTime,
        duration_minutes: inferLcWorkLogDurationMinutes_(workLog) || calculateClosingDurationMinutes_(workLog.created_at || session.start_time, endTime || snapshotAt),
        work_status: workLog.status || (endTime ? "closed" : "active"),
        rate: Number(workLog.rate) || 0,
        menu_name: "",
        quantity: 0,
        bonus_per_item: 0,
        bonus_total: 0,
        snapshot_at: snapshotAt,
      });
    });
  }

  if (sheetExists_("LcSalesBonusLogs")) {
    readSheetAsObjects_("LcSalesBonusLogs").filter(function (bonusLog) {
      var bonusDate = String(bonusLog.operational_date || "").trim()
        || normalizeLcFinanceOperationalDate_(bonusLog.created_at);
      return bonusDate === operationalDate && !String(bonusLog.voided_at || "").trim();
    }).forEach(function (bonusLog) {
      var orderId = String(bonusLog.order_id || "").trim();
      lcDetailRows.push({
        closing_lc_detail_id: closingId + "-LC-" + String(lcDetailRows.length + 1),
        closing_id: closingId,
        entry_type: "bonus",
        log_id: "",
        bonus_log_id: bonusLog.bonus_log_id || "",
        transaction_id: bonusLog.transaction_id || transactionIdByOrderId[orderId] || "",
        order_id: orderId,
        session_id: "",
        room_id: "",
        room_name: "",
        lc_id: bonusLog.lc_id || "",
        lc_name: bonusLog.lc_name || "",
        start_time: bonusLog.created_at || "",
        end_time: bonusLog.created_at || "",
        duration_minutes: 0,
        work_status: bonusLog.source_status || "recorded",
        rate: 0,
        menu_name: bonusLog.menu_name || "",
        quantity: Number(bonusLog.quantity) || 0,
        bonus_per_item: Number(bonusLog.bonus_per_item) || 0,
        bonus_total: Number(bonusLog.bonus_total) || 0,
        snapshot_at: snapshotAt,
      });
    });
  }

  return {
    transactions: transactionRows,
    fnb_items: fnbItemRows,
    lc_details: lcDetailRows,
  };
}

function calculateClosingDurationMinutes_(startTime, endTime) {
  var start = new Date(startTime);
  var end = new Date(endTime);
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end.getTime() <= start.getTime()) {
    return 0;
  }
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
}

function summarizeCashierClosingSnapshot_(snapshot) {
  var transactionSummary = snapshot.transactions.reduce(function (summary, row) {
    summary.room_total += Number(row.room_total) || 0;
    summary.fnb_total += Number(row.fnb_total) || 0;
    summary.lc_total += Number(row.lc_total) || 0;
    summary.promo_discount += Number(row.promo_discount) || 0;
    summary.grand_total += Number(row.grand_total) || 0;
    if (String(row.transaction_type || "").trim().toLowerCase() === "session_checkout") {
      summary.room_sessions += 1;
      summary.room_duration_minutes += Number(row.duration_minutes) || 0;
    }
    return summary;
  }, {
    room_total: 0,
    fnb_total: 0,
    lc_total: 0,
    promo_discount: 0,
    grand_total: 0,
    room_sessions: 0,
    room_duration_minutes: 0,
  });

  var lcSummary = snapshot.lc_details.reduce(function (summary, row) {
    var entryType = String(row.entry_type || "").trim().toLowerCase();
    if (entryType === "work") {
      summary.assignment_count += 1;
      if (isClosingLcWorkCompleted_(row)) {
        summary.room_earning_total += Number(row.rate) || 0;
        summary.completed_duration_minutes += Number(row.duration_minutes) || 0;
      } else if (String(row.work_status || "").trim().toLowerCase() === "active") {
        summary.active_assignment_count += 1;
      }
    } else if (entryType === "bonus") {
      summary.sales_bonus_total += Number(row.bonus_total) || 0;
    }
    return summary;
  }, {
    assignment_count: 0,
    active_assignment_count: 0,
    completed_duration_minutes: 0,
    room_earning_total: 0,
    sales_bonus_total: 0,
  });

  lcSummary.total_lc_obligation = lcSummary.room_earning_total + lcSummary.sales_bonus_total;
  return {
    transactions: transactionSummary,
    lc: lcSummary,
  };
}

function isClosingLcWorkCompleted_(row) {
  var status = String((row && row.work_status) || "").trim().toLowerCase();
  if (["done", "closed", "paid"].indexOf(status) !== -1) {
    return true;
  }
  return !status && Boolean(row && row.end_time);
}

function rollbackCashierClosingSnapshot_(closingId, sheets) {
  [sheets.transactions, sheets.fnb_items, sheets.lc_details].forEach(function (sheet) {
    deleteSheetRowsByColumnValue_(sheet, "closing_id", closingId);
  });
}

function deleteSheetRowsByColumnValue_(sheet, columnName, value) {
  var headerMap = getHeaderMap_(sheet);
  var column = headerMap[columnName];
  if (!column || sheet.getLastRow() < 2) {
    return;
  }
  var values = sheet.getRange(2, column, sheet.getLastRow() - 1, 1).getValues();
  for (var index = values.length - 1; index >= 0; index -= 1) {
    if (String(values[index][0] || "").trim() === String(value || "").trim()) {
      sheet.deleteRow(index + 2);
    }
  }
}

function getCashierClosingDetails_(closingId) {
  var normalizedClosingId = String(closingId || "").trim();
  if (!normalizedClosingId) {
    return { ok: false, success: false, error: "closing_id wajib diisi." };
  }

  var closing = readCashierClosingsOrEmpty_().filter(function (row) {
    return String(row.closing_id || "").trim() === normalizedClosingId;
  })[0];
  if (!closing) {
    return { ok: false, success: false, error: "Data closing tidak ditemukan." };
  }

  var snapshot = {
    transactions: sheetExists_("CashierClosingTransactions")
      ? readSheetAsObjects_("CashierClosingTransactions").filter(function (row) {
          return String(row.closing_id || "").trim() === normalizedClosingId;
        })
      : [],
    fnb_items: sheetExists_("CashierClosingFnbItems")
      ? readSheetAsObjects_("CashierClosingFnbItems").filter(function (row) {
          return String(row.closing_id || "").trim() === normalizedClosingId;
        })
      : [],
    lc_details: sheetExists_("CashierClosingLcDetails")
      ? readSheetAsObjects_("CashierClosingLcDetails").filter(function (row) {
          return String(row.closing_id || "").trim() === normalizedClosingId;
        })
      : [],
  };

  return {
    ok: true,
    success: true,
    closing_id: normalizedClosingId,
    snapshot_available: snapshot.transactions.length > 0,
    transactions: snapshot.transactions,
    fnb_items: snapshot.fnb_items,
    lc_details: snapshot.lc_details,
    summary: summarizeCashierClosingSnapshot_(snapshot),
  };
}

function validateCashierClosingSnapshot_() {
  var now = new Date();
  var snapshotAt = toJakartaIsoString_(now);
  var operationalDate = getOperationalDateString_(now);
  var snapshot = buildCashierClosingSnapshot_({
    closing_id: "VALIDATION-" + Utilities.formatDate(now, "Asia/Jakarta", "yyyyMMdd-HHmmss"),
    closing_date: operationalDate,
  }, snapshotAt);
  var snapshotSummary = summarizeCashierClosingSnapshot_(snapshot);
  var closingSummary = calculateCashierClosingSummary_();
  var issues = [];

  if (snapshot.transactions.length !== Number(closingSummary.total_transactions || 0)) {
    issues.push("TRANSACTION_COUNT_MISMATCH");
  }
  if (Math.abs(Number(snapshotSummary.transactions.grand_total || 0) - Number(closingSummary.total_revenue || 0)) > 0.01) {
    issues.push("GRAND_TOTAL_MISMATCH");
  }

  return {
    ok: issues.length === 0,
    success: issues.length === 0,
    status: issues.length === 0 ? "ready" : "invalid",
    operational_date: operationalDate,
    counts: {
      transactions: snapshot.transactions.length,
      fnb_items: snapshot.fnb_items.length,
      lc_details: snapshot.lc_details.length,
    },
    summary: snapshotSummary,
    issues: issues,
  };
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

function ensureRoomRecoveryLogsSheet_() {
  var sheet = ensureSheetWithHeaders_("RoomRecoveryLogs", ROOM_RECOVERY_LOGS_HEADERS);
  ensureColumns_(sheet, ROOM_RECOVERY_LOGS_HEADERS);
  return sheet;
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

function ensureTvDisplaysSheet_() {
  var sheet = ensureSheetWithHeaders_("TVDisplays", TV_DISPLAYS_HEADERS);
  ensureColumns_(sheet, TV_DISPLAYS_HEADERS);
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

function appendTvDisplay_(display) {
  var sheet = ensureTvDisplaysSheet_();
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(function (header) {
    return String(header).trim();
  });
  var rowValues = headers.map(function (header) {
    return display[header] !== undefined ? display[header] : "";
  });

  sheet.appendRow(rowValues);
}

function appendRoomRecoveryLog_(logEntry) {
  appendObjectRow_(ensureRoomRecoveryLogsSheet_(), logEntry);
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

function generateRoomRecoveryLogId_() {
  return "RRL-" + Utilities.formatDate(new Date(), "Asia/Jakarta", "yyyyMMdd-HHmmss") + "-" + Math.floor(Math.random() * 1000);
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

function createLockBusyResponse_(message) {
  var text = String(message || "Sistem sedang memproses perubahan lain. Coba lagi sebentar.").trim();

  return {
    ok: false,
    success: false,
    error: text,
    message: text,
  };
}

function isDevShortSessionRequest_(payload) {
  var request = payload || {};
  return DEV_SHORT_SESSION_ENABLED === true && request.dev_test_duration === true;
}

function getMinimumSessionMinutes_(payload) {
  if (isDevShortSessionRequest_(payload)) {
    return Math.max(1, Number(DEV_MIN_SESSION_MINUTES) || 1);
  }

  return MIN_SESSION_MINUTES;
}

function getMinimumSessionErrorMessage_(payload) {
  return "Durasi minimal " + getMinimumSessionMinutes_(payload) + " menit.";
}

function generateTransactionId_() {
  const prefix = "TRX-";
  const uuidPart = Utilities.getUuid().slice(0, 8).toUpperCase(); // 8 karakter unik
  const ts = Utilities.formatDate(new Date(), "Asia/Jakarta", "yyyyMMddHHmmssSSS"); // hingga milidetik
  return `${prefix}${ts}-${uuidPart}`;
}

function appendTransaction_(transaction) {
  var sheet = ensureTransactionsSheetColumns_();
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(function (header) {
    return String(header).trim();
  });

  // Pastikan transaction_id unik; jika duplikat, buat yang baru
  var idIndex = headers.indexOf('transaction_id');
  if (idIndex !== -1 && transaction['transaction_id']) {
    var existingIds = sheet.getRange(2, idIndex + 1, sheet.getLastRow() - 1, 1).getValues()
                       .flat()
                       .map(String);
    if (existingIds.includes(transaction['transaction_id'])) {
      // Ganti dengan ID baru yang unik
      transaction['transaction_id'] = generateTransactionId_();
    }
  }

  var rowValues = headers.map(function (header) {
    return transaction[header] !== undefined ? transaction[header] : "";
  });

  sheet.appendRow(rowValues);
}

function generateRoomSessionId_(roomId) {
  var safeRoomId = String(roomId || "ROOM").trim().replace(/[^A-Za-z0-9-]/g, "");

  return safeRoomId + "-SESSION-" + Utilities.formatDate(new Date(), "Asia/Jakarta", "yyyyMMddHHmmss") + "-" + Math.floor(Math.random() * 1000);
}

function appendRoomSession_(session) {
  appendObjectRow_(ensureRoomSessionsSheet_(), session);
}

function buildPreparedSessionNote_(paymentMethod, note) {
  var userNote = String(note || "").trim();
  var parts = ["Postpaid booking; payment due at checkout"];

  if (userNote) {
    parts.push(userNote);
  }

  return parts.join(" | ");
}

function findLatestRoomSessionForRoom_(roomId, statuses) {
  if (!sheetExists_(ROOM_SESSIONS_SHEET)) {
    return null;
  }

  var normalizedRoomId = String(roomId || "").trim();
  var allowedStatuses = {};

  (statuses || []).forEach(function (status) {
    allowedStatuses[String(status || "").trim().toLowerCase()] = true;
  });

  var sheet = ensureRoomSessionsSheet_();
  var headerMap = getHeaderMap_(sheet);
  var values = sheet.getDataRange().getValues();
  var headers = values.length > 0
    ? values[0].map(function (header) {
      return String(header).trim();
    })
    : [];
  var latest = null;

  values.slice(1).forEach(function (row, index) {
    var isEmptyRow = row.every(function (cell) {
      return cell === "" || cell === null;
    });

    if (isEmptyRow) {
      return;
    }

    var session = {};

    headers.forEach(function (header, headerIndex) {
      if (header) {
        session[header] = normalizeCellValue_(header, row[headerIndex]);
      }
    });

    var matchesRoom = String(session.room_id || "").trim() === normalizedRoomId;
    var normalizedStatus = String(session.status || "").trim().toLowerCase();

    if (!matchesRoom || !allowedStatuses[normalizedStatus]) {
      return;
    }

    var updatedAt = session.updated_at || session.created_at || "";
    var updatedTime = new Date(updatedAt).getTime();

    if (!latest || updatedTime >= latest.updatedTime) {
      latest = {
        session: session,
        rowNumber: index + 2,
        updatedTime: isNaN(updatedTime) ? 0 : updatedTime,
      };
    }
  });

  if (!latest) {
    return null;
  }

  latest.sheet = sheet;
  latest.headerMap = headerMap;
  return latest;
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
  var rawGrandTotal = transaction ? transaction.grand_total : "";
  if (rawGrandTotal !== "" && rawGrandTotal !== null && rawGrandTotal !== undefined) {
    var grandTotal = Number(rawGrandTotal);
    if (isFinite(grandTotal)) {
      return grandTotal;
    }
  }

  return (Number(transaction.room_total) || 0)
    + (Number(transaction.fnb_total) || 0)
    + (Number(transaction.lc_total) || 0);
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
  if (value === "" || value === null || value === undefined) {
    return null;
  }

  if (NUMERIC_FIELDS[header]) {
    if (typeof value === "number") {
      return value;
    }
    
    var str = String(value).replace(/[Rp\s]/gi, "");
    if (/^\d{1,3}(\.\d{3})+$/.test(str)) {
      str = str.replace(/\./g, "");
    } else if (/^\d{1,3}(,\d{3})+$/.test(str)) {
      str = str.replace(/,/g, "");
    } else if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(str)) {
      str = str.replace(/\./g, "").replace(/,/g, ".");
    } else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(str)) {
      str = str.replace(/,/g, "");
    }
    
    var numberValue = Number(str);
    return isNaN(numberValue) ? value : numberValue;
  }

  return value;
}

function getRoomFromRow_(sheet, headerMap, rowNumber) {
  var room = getRowObject_(sheet, headerMap, rowNumber);
  
  var lcIds = "";
  try {
    var activeSession = findLatestRoomSessionForRoom_(room.room_id || "", ["starting", "active", "closing"]);
    if (activeSession && activeSession.session) {
      lcIds = activeSession.session.lc_ids || "";
    }
  } catch (err) {
    // Safe fallback
  }

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
    lc_ids: lcIds,
  };
}

function deleteOpenFnbOrdersForPrepay_(roomId) {
  var ordersSheet = getSheet_("FnbOrders");
  if (!ordersSheet) return;
  var ordersHeaderMap = getHeaderMap_(ordersSheet);
  var itemsSheet = getSheet_("FnbOrderItems");
  if (!itemsSheet) return;
  var itemsHeaderMap = getHeaderMap_(itemsSheet);
  
  var orders = readSheetAsObjects_("FnbOrders");
  var orderIdsToDelete = [];
  
  for (var i = 0; i < orders.length; i++) {
    var order = orders[i];
    if (
      String(order.room_id || "").trim() === String(roomId || "").trim() &&
      !order.room_start_time &&
      String(order.order_status || "").trim() === "open"
    ) {
      orderIdsToDelete.push(order.order_id);
    }
  }
  
  if (orderIdsToDelete.length === 0) return;
  
  // Delete from FnbOrders
  var ordersData = ordersSheet.getDataRange().getValues();
  for (var r = ordersData.length - 1; r >= 1; r--) {
    var id = String(ordersData[r][ordersHeaderMap.order_id - 1] || "").trim();
    if (orderIdsToDelete.indexOf(id) !== -1) {
      ordersSheet.deleteRow(r + 1);
    }
  }
  
  // Delete from FnbOrderItems
  var itemsData = itemsSheet.getDataRange().getValues();
  for (var r = itemsData.length - 1; r >= 1; r--) {
    var id = String(itemsData[r][itemsHeaderMap.order_id - 1] || "").trim();
    if (orderIdsToDelete.indexOf(id) !== -1) {
      itemsSheet.deleteRow(r + 1);
    }
  }
}

function markFnbOrdersAsPaid_(orderIds, now) {
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

    sheet.getRange(rowNumber, headerMap.order_status).setValue("paid");

    if (headerMap.updated_at) {
      sheet.getRange(rowNumber, headerMap.updated_at).setValue(now);
    }
  });
}

function syncPrepaidFnbOrdersStartTime_(roomId, startTime) {
  var sheet = getSheet_("FnbOrders");
  if (!sheet) return;
  
  var headerMap = getHeaderMap_(sheet);
  var orders = readSheetAsObjects_("FnbOrders");
  
  orders.forEach(function (order, index) {
    if (
      String(order.room_id || "").trim() === String(roomId || "").trim() &&
      !order.room_start_time
    ) {
      var rowRowNum = index + 2;
      sheet.getRange(rowRowNum, headerMap.room_start_time).setValue(startTime);
      sheet.getRange(rowRowNum, headerMap.updated_at).setValue(startTime);
    }
  });
}

function getPromos_() {
  ensurePromoMasterSheet_();
  var promos = readSheetAsObjects_("PromoMaster");
  return {
    ok: true,
    success: true,
    promos: promos
  };
}

function savePromo_(payload) {
  var code = String(payload.code || "").trim().toUpperCase();
  var type = String(payload.type || "promo").trim().toLowerCase(); // "promo" atau "voucher"
  var discountType = String(payload.discount_type || "percentage").trim().toLowerCase(); // "percentage" atau "nominal"
  var discountValue = Number(payload.discount_value) || 0;
  
  if (!code) {
    return { ok: false, success: false, error: "Kode promosi wajib diisi." };
  }
  if (discountValue <= 0) {
    return { ok: false, success: false, error: "Nilai potongan diskon wajib lebih dari 0." };
  }

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(3000)) {
    return { ok: false, success: false, error: "Sistem sedang sibuk. Coba lagi sebentar." };
  }

  try {
    var sheet = ensurePromoMasterSheet_();
    var headerMap = getHeaderMap_(sheet);
    
    // Cek duplikasi kode
    var existing = readSheetAsObjects_("PromoMaster");
    var isDuplicate = existing.some(function(p) {
      return String(p.code || "").trim().toUpperCase() === code;
    });
    if (isDuplicate) {
      return { ok: false, success: false, error: "Kode promo/voucher \"" + code + "\" sudah terdaftar." };
    }

    var promo = {
      code: code,
      type: type,
      discount_type: discountType,
      discount_value: discountValue,
      status: "active",
      used_in_transaction_id: "",
      used_at: "",
      created_at: toJakartaIsoString_(new Date())
    };

    appendObjectRow_(sheet, promo);
    return {
      ok: true,
      success: true,
      message: "Kode promosi berhasil ditambahkan.",
      promo: promo
    };
  } finally {
    lock.releaseLock();
  }
}

function updatePromoStatus_(payload) {
  var code = String(payload.code || "").trim().toUpperCase();
  var status = String(payload.status || "active").trim().toLowerCase(); // "active" atau "inactive"
  
  if (!code) {
    return { ok: false, success: false, error: "Kode wajib ditentukan." };
  }

  var sheet = ensurePromoMasterSheet_();
  var headerMap = getHeaderMap_(sheet);
  var rowNumber = findRowByValue_(sheet, headerMap, "code", code);
  
  if (!rowNumber) {
    return { ok: false, success: false, error: "Kode promosi tidak ditemukan." };
  }

  sheet.getRange(rowNumber, headerMap.status).setValue(status);
  return {
    ok: true,
    success: true,
    message: "Status promo berhasil diperbarui."
  };
}

function deletePromo_(payload) {
  var code = String(payload.code || "").trim().toUpperCase();
  if (!code) {
    return { ok: false, success: false, error: "Kode wajib ditentukan." };
  }

  var sheet = ensurePromoMasterSheet_();
  var headerMap = getHeaderMap_(sheet);
  var rowNumber = findRowByValue_(sheet, headerMap, "code", code);
  
  if (!rowNumber) {
    return { ok: false, success: false, error: "Kode promosi tidak ditemukan." };
  }

  sheet.deleteRow(rowNumber);
  return {
    ok: true,
    success: true,
    message: "Kode promosi berhasil dihapus permanen."
  };
}

function validatePromoCode_(payload) {
  var code = String(payload.code || "").trim().toUpperCase();
  var roomTotal = Number(payload.room_total) || 0;

  if (!code) {
    return { ok: false, success: false, error: "Kode promo/voucher wajib diisi." };
  }

  ensurePromoMasterSheet_();
  var promos = readSheetAsObjects_("PromoMaster");
  var foundPromo = null;
  
  for (var i = 0; i < promos.length; i++) {
    if (String(promos[i].code || "").trim().toUpperCase() === code) {
      foundPromo = promos[i];
      break;
    }
  }

  if (!foundPromo) {
    return { ok: false, success: false, error: "Kode promo/voucher \"" + code + "\" tidak terdaftar." };
  }

  if (String(foundPromo.status || "").trim().toLowerCase() !== "active") {
    return { ok: false, success: false, error: "Kode promo/voucher \"" + code + "\" sedang dinonaktifkan." };
  }

  // Cek jika tipe voucher sekali pakai dan sudah terpakai
  if (String(foundPromo.type || "").trim().toLowerCase() === "voucher") {
    if (String(foundPromo.used_in_transaction_id || "").trim() !== "") {
      return { ok: false, success: false, error: "Voucher \"" + code + "\" sudah digunakan di transaksi " + foundPromo.used_in_transaction_id };
    }
  }

  // Hitung diskon
  var discount = 0;
  var val = Number(foundPromo.discount_value) || 0;
  
  if (String(foundPromo.discount_type || "").trim().toLowerCase() === "percentage") {
    discount = Math.ceil((val / 100) * roomTotal);
  } else {
    discount = val;
  }

  // Batasi agar diskon tidak melebihi total sewa room
  if (discount > roomTotal) {
    discount = roomTotal;
  }

  return {
    ok: true,
    success: true,
    code: foundPromo.code,
    type: foundPromo.type,
    discount_type: foundPromo.discount_type,
    discount_value: foundPromo.discount_value,
    discount: discount
  };
}

function normalizeCompareDate_(val) {
  if (!val) return "";
  if (val instanceof Date) {
    var y = val.getFullYear();
    var m = String(val.getMonth() + 1);
    if (m.length < 2) m = "0" + m;
    var d = String(val.getDate());
    if (d.length < 2) d = "0" + d;
    return y + "-" + m + "-" + d;
  }
  var clean = String(val).trim();
  if (clean.indexOf("T") !== -1) {
    return clean.split("T")[0];
  }
  if (clean.indexOf(" ") !== -1) {
    return clean.split(" ")[0];
  }
  return clean;
}

function correctActiveRoomDuration_(roomId, targetDurationMinutes, cashierName, note) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    return createLockBusyResponse_("Sistem sedang memproses transaksi lain. Coba lagi sebentar.");
  }

  try {
    var normalizedRoomId = String(roomId || "").trim();
    var duration = Number(targetDurationMinutes);

    if (!normalizedRoomId) {
      return { ok: false, success: false, error: "room_id wajib diisi." };
    }

    if (isNaN(duration) || duration <= 0) {
      return { ok: false, success: false, error: "target_duration_minutes wajib berupa angka bulat positif." };
    }

    var roomsSheet = ensureRoomsMasterColumns_();
    var roomsHeaderMap = getHeaderMap_(roomsSheet);
    var roomRowNumber = findRowByValue_(roomsSheet, roomsHeaderMap, "room_id", normalizedRoomId);

    if (!roomRowNumber) {
      return { ok: false, success: false, error: "Ruangan tidak ditemukan: " + normalizedRoomId };
    }

    var roomObj = getRowObject_(roomsSheet, roomsHeaderMap, roomRowNumber);
    var startTime = roomObj.start_time;

    if (!startTime) {
      return { ok: false, success: false, error: "Ruangan tidak memiliki sesi aktif." };
    }

    var newScheduledEndTime = addMinutesToJakartaIsoString_(startTime, duration);
    var nowIso = toJakartaIsoString_(new Date());

    // Update Rooms sheet
    setRowValues_(roomsSheet, roomsHeaderMap, roomRowNumber, {
      booked_duration_minutes: duration,
      scheduled_end_time: newScheduledEndTime,
      updated_at: nowIso,
    });

    // Update RoomSessions sheet if available
    if (sheetExists_(ROOM_SESSIONS_SHEET)) {
      var latestSession = findLatestRoomSessionForRoom_(normalizedRoomId, ["starting", "active", "closing"]);
      if (latestSession && latestSession.session && latestSession.rowNumber) {
        var updatePayload = {
          booked_duration_minutes: duration,
          scheduled_end_time: newScheduledEndTime,
          updated_at: nowIso,
        };
        if (latestSession.session.booking_mode === FNB_V25A_BOOKING_MODE_REGULAR) {
          updatePayload.billable_room_minutes = duration;
        }
        setRowValues_(latestSession.sheet, latestSession.headerMap, latestSession.rowNumber, updatePayload);
      }
    }

    // Append RoomTimeLog
    try {
      appendRoomTimeLog_({
        log_id: generateRoomTimeLogId_(),
        room_id: normalizedRoomId,
        room_name: roomObj.room_name || normalizedRoomId,
        action_type: "duration_correction",
        previous_duration: roomObj.booked_duration_minutes || "",
        new_duration: duration,
        cashier_name: cashierName || "Kasir",
        note: note || "Koreksi durasi room oleh operator",
        created_at: nowIso,
      });
    } catch (logErr) {
      // Safe fallback
    }

    return {
      ok: true,
      success: true,
      code: "DURATION_CORRECTED",
      message: "Durasi " + (roomObj.room_name || normalizedRoomId) + " berhasil dikoreksi menjadi " + duration + " menit (" + (duration / 60) + " jam).",
      room: {
        room_id: normalizedRoomId,
        room_name: roomObj.room_name,
        booked_duration_minutes: duration,
        scheduled_end_time: newScheduledEndTime,
        updated_at: nowIso,
      },
    };
  } finally {
    lock.releaseLock();
  }
}

function initializeStockFromJul31_(payload) {
  var user = String(payload && payload.cashier_name || "Owner").trim() || "Owner";
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) {
    return createLockBusyResponse_("Sistem sedang memproses data lain. Coba lagi.");
  }

  try {
    var inventorySheet = ensureInventorySheetColumns_();
    var inventoryHeaderMap = getHeaderMap_(inventorySheet);
    var stockMovementsSheet = ensureStockMovementsSheet_();
    var stockMovementsHeaderMap = getHeaderMap_(stockMovementsSheet);

    var inventoryRows = readSheetAsObjects_("Inventory");
    var existingMovements = readSheetAsObjects_("StockMovements");

    // Group sales out movements by stock_item_id
    var salesOutByItemId = {};
    existingMovements.forEach(function (m) {
      var refType = String(m.reference_type || "").trim();
      var movType = String(m.movement_type || "").trim().toLowerCase();
      if (refType === "transaction" || movType === "out") {
        var sId = String(m.stock_item_id || "").trim();
        if (sId) {
          salesOutByItemId[sId] = (salesOutByItemId[sId] || 0) + Math.abs(Number(m.qty_change) || 0);
        }
      }
    });

    var jul31Timestamp = "2026-07-31T00:00:00+07:00";
    var createdCount = 0;
    var updatedCount = 0;

    inventoryRows.forEach(function (item) {
      var sId = String(item.stock_item_id || item.item_id || "").trim();
      var sName = String(item.stock_item_name || item.item_name || sId).trim();
      if (!sId) return;

      var initialStockQty = Number(item.stock_qty) || 0;
      var totalOutQty = salesOutByItemId[sId] || 0;
      var currentNetStock = initialStockQty - totalOutQty;

      // Check if an initial_stock movement already exists for this item on 31 Jul
      var existingInitMove = existingMovements.find(function (m) {
        return String(m.stock_item_id || "").trim() === sId && String(m.reference_type || "").trim() === "initial_stock";
      });

      if (!existingInitMove) {
        var movementId = "MOV-20260731-000000-" + sId;
        var initMovement = {
          movement_id: movementId,
          created_at: jul31Timestamp,
          stock_item_id: sId,
          stock_item_name: sName,
          movement_type: "in",
          reference_type: "initial_stock",
          reference_id: "INIT-20260731",
          qty_change: initialStockQty,
          stock_before: 0,
          stock_after: initialStockQty,
          note: "Stok Awal Saldo per 31 Juli 2026",
          cashier_name: user,
        };
        appendStockMovement_(initMovement);
        createdCount++;
      } else {
        var rowNum = findRowByValue_(stockMovementsSheet, stockMovementsHeaderMap, "movement_id", existingInitMove.movement_id);
        if (rowNum) {
          stockMovementsSheet.getRange(rowNum, stockMovementsHeaderMap.qty_change).setValue(initialStockQty);
          stockMovementsSheet.getRange(rowNum, stockMovementsHeaderMap.stock_after).setValue(initialStockQty);
          stockMovementsSheet.getRange(rowNum, stockMovementsHeaderMap.created_at).setValue(jul31Timestamp);
        }
        updatedCount++;
      }

      // Update Inventory.stock_qty to currentNetStock (initial stock - total sales out)
      var invRowNum = findInventoryRowByStockItemId_(sId, inventorySheet, inventoryHeaderMap);
      if (invRowNum) {
        inventorySheet.getRange(invRowNum, inventoryHeaderMap.stock_qty).setValue(currentNetStock);
        if (inventoryHeaderMap.updated_at) {
          inventorySheet.getRange(invRowNum, inventoryHeaderMap.updated_at).setValue(toJakartaIsoString_(new Date()));
        }
      }
    });

    return {
      ok: true,
      success: true,
      message: "Stok Awal per 31 Juli 2026 berhasil disinkronkan dan saldo stok diperbarui.",
      created_initial_movements: createdCount,
      updated_initial_movements: updatedCount,
      total_items_processed: inventoryRows.length,
    };
  } finally {
    lock.releaseLock();
  }
}

