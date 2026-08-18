const db = require('../db');
const { getOperationalDateRange, toJakartaIsoString } = require('../utils/operationalDate');
const { getSyncStatus } = require('./railwaySyncWorker');

function iso(value) {
  return value ? new Date(value).toISOString() : '';
}

function money(value) {
  return Number(value || 0);
}

async function getOpenFnbOrders() {
  const ordersRes = await db.query(`
    SELECT *
    FROM fnb_orders
    WHERE order_status = 'open'
    ORDER BY created_at ASC
  `);

  const orders = [];
  for (const order of ordersRes.rows) {
    const itemsRes = await db.query(`
      SELECT *
      FROM fnb_order_items
      WHERE order_id = $1
      ORDER BY created_at ASC
    `, [order.order_id]);

    orders.push({
      order_id: order.order_id,
      room_id: order.room_id,
      room_name: order.room_name,
      room_start_time: iso(order.room_start_time),
      order_status: order.order_status,
      order_total: money(order.order_total),
      cashier_name: order.cashier_name || '',
      note: order.note || '',
      customer_name: order.customer_name || '',
      general_bill_id: order.general_bill_id || '',
      created_at: iso(order.created_at),
      updated_at: iso(order.updated_at),
      items: itemsRes.rows.map(item => ({
        order_item_id: item.order_item_id,
        order_id: item.order_id,
        menu_id: item.menu_id,
        menu_name: item.menu_name,
        category: item.category,
        price: money(item.price),
        quantity: Number(item.quantity || 0),
        subtotal: money(item.subtotal),
        created_at: iso(item.created_at)
      }))
    });
  }

  return orders;
}

function parseFnbOrderIds(value) {
  return String(value || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

async function buildFnbSoldSummary(transactions) {
  const orderIds = Array.from(new Set(
    transactions.flatMap(transaction => parseFnbOrderIds(transaction.fnb_order_ids))
  ));

  if (orderIds.length === 0) {
    return {
      total_qty: 0,
      total_revenue: 0,
      unique_items: 0,
      order_count: 0,
      items: []
    };
  }

  const itemsRes = await db.query(`
    SELECT
      order_id,
      menu_id,
      menu_name,
      category,
      SUM(quantity) AS quantity,
      SUM(subtotal) AS revenue,
      COUNT(*) AS line_count
    FROM fnb_order_items
    WHERE order_id = ANY($1::text[])
    GROUP BY order_id, menu_id, menu_name, category
    ORDER BY revenue DESC, quantity DESC, menu_name ASC
  `, [orderIds]);

  const grouped = new Map();
  for (const row of itemsRes.rows) {
    const key = row.menu_id || row.menu_name;
    const current = grouped.get(key) || {
      menu_id: row.menu_id || '',
      menu_name: row.menu_name || '',
      category: row.category || '',
      quantity: 0,
      revenue: 0,
      order_count: 0,
      line_count: 0
    };

    current.quantity += Number(row.quantity || 0);
    current.revenue += money(row.revenue);
    current.order_count += 1;
    current.line_count += Number(row.line_count || 0);
    grouped.set(key, current);
  }

  const items = Array.from(grouped.values())
    .sort((a, b) => (b.revenue - a.revenue) || (b.quantity - a.quantity) || a.menu_name.localeCompare(b.menu_name));

  return {
    total_qty: items.reduce((total, item) => total + Number(item.quantity || 0), 0),
    total_revenue: items.reduce((total, item) => total + money(item.revenue), 0),
    unique_items: items.length,
    order_count: orderIds.length,
    items
  };
}

async function buildLcPerformanceSummary(startDate, endDate) {
  const logsRes = await db.query(`
    SELECT
      lc_id,
      lc_name,
      room_id,
      room_name,
      duration_minutes,
      rate_per_hour,
      rate,
      status,
      created_at,
      closed_at
    FROM lc_work_logs
    WHERE status <> 'cancelled'
      AND (((created_at AT TIME ZONE 'Asia/Jakarta') - INTERVAL '10 hours')::date) >= $1::date
      AND (((created_at AT TIME ZONE 'Asia/Jakarta') - INTERVAL '10 hours')::date) <= $2::date
    ORDER BY created_at DESC
  `, [startDate, endDate]);

  const grouped = new Map();
  for (const row of logsRes.rows) {
    const key = row.lc_id || row.lc_name;
    const current = grouped.get(key) || {
      lc_id: row.lc_id || '',
      lc_name: row.lc_name || '',
      session_count: 0,
      total_duration_minutes: 0,
      total_fee: 0,
      rooms: [],
      latest_at: ''
    };

    current.session_count += 1;
    current.total_duration_minutes += Number(row.duration_minutes || 0);
    current.total_fee += money(row.rate);
    if (row.room_name && !current.rooms.includes(row.room_name)) {
      current.rooms.push(row.room_name);
    }
    if (!current.latest_at || new Date(row.created_at).getTime() > new Date(current.latest_at).getTime()) {
      current.latest_at = iso(row.created_at);
    }
    grouped.set(key, current);
  }

  const items = Array.from(grouped.values())
    .sort((a, b) => (b.total_fee - a.total_fee) || (b.total_duration_minutes - a.total_duration_minutes) || a.lc_name.localeCompare(b.lc_name));

  return {
    active_lc_count: items.length,
    total_sessions: items.reduce((total, item) => total + Number(item.session_count || 0), 0),
    total_duration_minutes: items.reduce((total, item) => total + Number(item.total_duration_minutes || 0), 0),
    total_fee: items.reduce((total, item) => total + money(item.total_fee), 0),
    items
  };
}

async function buildOwnerMirrorSnapshot(options = {}) {
  const period = options.period || 'today';
  const { startDate, endDate } = getOperationalDateRange(period, options.start_date, options.end_date);

  const [roomsRes, transactionsRes, closingsRes, outboxStatus, openFnbOrders, lcPerformance] = await Promise.all([
    db.query(`
      SELECT room_id, room_name, status, start_time, booked_duration_minutes,
             scheduled_end_time, rate_per_hour, tv_device_id, updated_at
      FROM rooms
      WHERE room_id <> 'FNB-GENERAL'
      ORDER BY room_id ASC
    `),
    db.query(`
      SELECT *
      FROM transactions
      WHERE operational_date >= $1 AND operational_date <= $2
        AND payment_status <> 'cancelled'
      ORDER BY created_at DESC
    `, [startDate, endDate]),
    db.query(`
      SELECT *
      FROM cashier_closings
      WHERE closing_date >= $1 AND closing_date <= $2
      ORDER BY created_at DESC
    `, [startDate, endDate]),
    getSyncStatus().catch(err => ({ error: err.message })),
    getOpenFnbOrders(),
    buildLcPerformanceSummary(startDate, endDate)
  ]);

  const rooms = roomsRes.rows.map(room => {
    const roomOpenFnbOrders = openFnbOrders.filter(order => {
      if (order.room_id && order.room_id === room.room_id) return true;
      return Boolean(order.room_name && room.room_name && order.room_name === room.room_name);
    });

    return {
      room_id: room.room_id,
      room_name: room.room_name,
      status: room.status,
      start_time: iso(room.start_time),
      start_time_wib: room.start_time ? toJakartaIsoString(room.start_time) : '',
      booked_duration_minutes: Number(room.booked_duration_minutes || 0),
      scheduled_end_time: iso(room.scheduled_end_time),
      scheduled_end_time_wib: room.scheduled_end_time ? toJakartaIsoString(room.scheduled_end_time) : '',
      rate_per_hour: money(room.rate_per_hour),
      tv_device_id: room.tv_device_id || '',
      updated_at: iso(room.updated_at),
      open_fnb_total: roomOpenFnbOrders.reduce((total, order) => total + money(order.order_total), 0),
      open_fnb_orders: roomOpenFnbOrders
    };
  });

  const transactions = transactionsRes.rows.map(transaction => ({
    transaction_id: transaction.transaction_id,
    room_id: transaction.room_id,
    room_name: transaction.room_name,
    start_time: iso(transaction.start_time),
    start_time_wib: transaction.start_time ? toJakartaIsoString(transaction.start_time) : '',
    end_time: iso(transaction.end_time),
    end_time_wib: transaction.end_time ? toJakartaIsoString(transaction.end_time) : '',
    duration_minutes: Number(transaction.duration_minutes || 0),
    room_total: money(transaction.room_total),
    fnb_total: money(transaction.fnb_total),
    lc_total: money(transaction.lc_total),
    grand_total: money(transaction.grand_total),
    fnb_order_ids: transaction.fnb_order_ids || '',
    payment_method: transaction.payment_method || '',
    payment_status: transaction.payment_status || '',
    cashier_name: transaction.cashier_name || '',
    booking_mode: transaction.booking_mode || '',
    package_id: transaction.package_id || '',
    package_name: transaction.package_name || '',
    package_total: money(transaction.package_total),
    corrected_at: iso(transaction.corrected_at),
    corrected_at_wib: transaction.corrected_at ? toJakartaIsoString(transaction.corrected_at) : '',
    corrected_by: transaction.corrected_by || '',
    correction_note: transaction.correction_note || '',
    billable_room_minutes: transaction.billable_room_minutes === null || transaction.billable_room_minutes === undefined ? null : Number(transaction.billable_room_minutes || 0),
    free_room_minutes: Number(transaction.free_room_minutes || 0),
    room_discount_amount: money(transaction.room_discount_amount),
    room_upgrade_total: money(transaction.room_upgrade_total),
    room_journey: Array.isArray(transaction.room_journey_json)
      ? transaction.room_journey_json
      : [],
    operational_date: transaction.operational_date ? transaction.operational_date.toISOString().split('T')[0] : '',
    created_at: iso(transaction.created_at)
  }));

  const fnbSoldSummary = await buildFnbSoldSummary(transactionsRes.rows);

  const summary = transactions.reduce((acc, transaction) => {
    const grandTotal = money(transaction.grand_total);
    acc.total_transactions += 1;
    acc.total_revenue_all += grandTotal;
    acc.total_room_revenue += money(transaction.room_total);
    acc.total_fnb_revenue += money(transaction.fnb_total);
    acc.total_lc_revenue += money(transaction.lc_total);

    if (transaction.payment_status === 'paid') {
      acc.paid_transactions += 1;
      acc.paid_revenue += grandTotal;
      if (transaction.payment_method === 'cash') acc.cash_revenue += grandTotal;
      else acc.transfer_revenue += grandTotal;
    } else {
      acc.unpaid_transactions += 1;
      acc.unpaid_revenue += grandTotal;
    }

    return acc;
  }, {
    total_transactions: 0,
    paid_transactions: 0,
    unpaid_transactions: 0,
    paid_revenue: 0,
    unpaid_revenue: 0,
    cash_revenue: 0,
    transfer_revenue: 0,
    total_revenue_all: 0,
    total_room_revenue: 0,
    total_fnb_revenue: 0,
    total_lc_revenue: 0,
    open_fnb_revenue: openFnbOrders.reduce((total, order) => total + money(order.order_total), 0),
    occupied_rooms: rooms.filter(room => room.status === 'occupied').length,
    available_rooms: rooms.filter(room => room.status === 'available').length,
    cleaning_rooms: rooms.filter(room => room.status === 'cleaning').length
  });

  const closings = closingsRes.rows.map(closing => ({
    ...closing,
    paid_revenue: money(closing.paid_revenue),
    unpaid_revenue: money(closing.unpaid_revenue),
    total_revenue: money(closing.total_revenue),
    cash_expected: money(closing.cash_expected),
    cash_actual: money(closing.cash_actual),
    cash_difference: money(closing.cash_difference),
    created_at: iso(closing.created_at),
    updated_at: iso(closing.updated_at)
  }));

  return {
    mirror_version: 'owner-mirror-snapshot-v1',
    generated_at: new Date().toISOString(),
    generated_at_wib: toJakartaIsoString(new Date()),
    mode: 'local_read_only_snapshot',
    period,
    operational_date_start: startDate,
    operational_date_end: endDate,
    summary,
    fnb_sold_summary: fnbSoldSummary,
    fnb_sold_items: fnbSoldSummary.items,
    lc_performance: lcPerformance,
    lc_performance_items: lcPerformance.items,
    rooms,
    open_fnb_orders: openFnbOrders,
    transactions,
    cashier_closings: closings,
    sync_status: outboxStatus
  };
}

async function saveOwnerMirrorSnapshot(snapshot, sourceId = 'happy-song-local') {
  if (!snapshot || typeof snapshot !== 'object') {
    throw new Error('Payload snapshot mirror tidak valid.');
  }

  const result = await db.query(`
    INSERT INTO owner_mirror_snapshots (
      source_id, mirror_version, generated_at, generated_at_wib, period,
      operational_date_start, operational_date_end, payload_json
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING snapshot_id, source_id, received_at
  `, [
    sourceId,
    snapshot.mirror_version || '',
    snapshot.generated_at || null,
    snapshot.generated_at_wib || '',
    snapshot.period || '',
    snapshot.operational_date_start || null,
    snapshot.operational_date_end || null,
    JSON.stringify(snapshot)
  ]);

  return {
    snapshot_id: result.rows[0].snapshot_id,
    source_id: result.rows[0].source_id,
    received_at: iso(result.rows[0].received_at)
  };
}

async function getLatestOwnerMirrorSnapshot(sourceId = 'happy-song-local', options = {}) {
  const period = options.period || '';
  const hasPeriodFilter = Boolean(period || options.start_date || options.end_date);
  const range = hasPeriodFilter
    ? getOperationalDateRange(period || 'today', options.start_date, options.end_date)
    : null;

  const result = hasPeriodFilter
    ? await db.query(`
      SELECT *
      FROM owner_mirror_snapshots
      WHERE source_id = $1
        AND operational_date_start = $3::date
        AND operational_date_end = $4::date
      ORDER BY
        CASE WHEN period = $2 THEN 0 ELSE 1 END,
        received_at DESC
      LIMIT 1
    `, [sourceId, period || 'today', range.startDate, range.endDate])
    : await db.query(`
      SELECT *
      FROM owner_mirror_snapshots
      WHERE source_id = $1
      ORDER BY received_at DESC
      LIMIT 1
    `, [sourceId]);

  if (result.rowCount === 0) {
    return {
      mirror_version: 'owner-mirror-cloud-empty-v1',
      mode: 'cloud_latest_snapshot',
      source_id: sourceId,
      has_snapshot: false,
      period: period || 'latest',
      operational_date_start: range?.startDate || '',
      operational_date_end: range?.endDate || '',
      summary: {},
      rooms: [],
      transactions: [],
      cashier_closings: [],
      fnb_sold_summary: { total_qty: 0, total_revenue: 0, unique_items: 0, order_count: 0, items: [] },
      lc_performance: { active_lc_count: 0, total_sessions: 0, total_duration_minutes: 0, total_fee: 0, items: [] },
      message: 'Belum ada snapshot dari PC kasir.'
    };
  }

  const row = result.rows[0];
  const storedPeriod = row.period || row.payload_json?.period || '';
  return {
    ...row.payload_json,
    mode: 'cloud_latest_snapshot',
    source_id: row.source_id,
    has_snapshot: true,
    period: period || storedPeriod || 'latest',
    snapshot_period: storedPeriod,
    period_relabelled: Boolean(period && storedPeriod && period !== storedPeriod),
    cloud_snapshot_id: row.snapshot_id,
    cloud_received_at: iso(row.received_at),
    cloud_received_at_wib: toJakartaIsoString(row.received_at)
  };
}

module.exports = {
  buildOwnerMirrorSnapshot,
  saveOwnerMirrorSnapshot,
  getLatestOwnerMirrorSnapshot
};
