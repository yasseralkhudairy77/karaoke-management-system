const db = require('../db');
const { getOperationalDateRange, toJakartaIsoString } = require('../utils/operationalDate');
const { getSyncStatus } = require('./railwaySyncWorker');
const { computeOperationalAnalytics } = require('../controllers/analyticsController');

function iso(value) {
  return value ? new Date(value).toISOString() : '';
}

function money(value) {
  return Number(value || 0);
}

function getPaymentBreakdown(row) {
  const paymentStatus = String(row?.payment_status || '').toLowerCase();
  const paymentMethod = String(row?.payment_method || '').toLowerCase();
  const grandTotal = money(row?.grand_total || 0);
  const cashAmount = money(row?.cash_amount || 0);
  const transferAmount = money(row?.transfer_amount || 0);

  if (paymentStatus !== 'paid') return { cash_amount: 0, transfer_amount: 0 };
  if (paymentMethod === 'split') {
    if (cashAmount + transferAmount === grandTotal) {
      return { cash_amount: cashAmount, transfer_amount: transferAmount };
    }
    const safeCash = Math.min(grandTotal, Math.max(0, cashAmount));
    const safeTransfer = Math.max(0, money(grandTotal - safeCash));
    return { cash_amount: safeCash, transfer_amount: safeTransfer };
  }
  if (paymentMethod === 'cash') return { cash_amount: grandTotal, transfer_amount: 0 };
  if (paymentMethod === 'transfer' || paymentMethod === 'qris') return { cash_amount: 0, transfer_amount: grandTotal };
  return { cash_amount: 0, transfer_amount: 0 };
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
      WHERE order_id = $1 AND (is_voided IS FALSE OR is_voided IS NULL)
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
    WHERE order_id = ANY($1::text[]) AND (is_voided IS FALSE OR is_voided IS NULL)
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

function getInventoryStockStatus(stockQty, minStock) {
  if (stockQty < 0) return 'negative';
  if (stockQty <= minStock) return 'low';
  return 'safe';
}

async function buildInventorySnapshot() {
  const result = await db.query(`
    SELECT stock_item_id, stock_item_name, category, unit, stock_qty, min_stock, status, updated_at
    FROM inventory
    WHERE (status = 'active' OR status IS NULL OR status = '')
    ORDER BY category ASC, stock_item_name ASC
  `);

  const items = result.rows.map(row => {
    const stockQty = Number(row.stock_qty || 0);
    const minStock = Number(row.min_stock || 0);
    const category = String(row.category || 'General').trim() || 'General';
    return {
      stock_item_id: row.stock_item_id,
      stock_item_name: row.stock_item_name,
      category,
      unit: row.unit || 'pcs',
      stock_qty: stockQty,
      min_stock: minStock,
      status: row.status || 'active',
      stock_status: getInventoryStockStatus(stockQty, minStock),
      updated_at: iso(row.updated_at)
    };
  });

  const categories = Array.from(new Set(items.map(i => i.category).filter(Boolean))).sort();

  const summary = {
    total_items: items.length,
    safe_items: items.filter(i => i.stock_status === 'safe').length,
    low_items: items.filter(i => i.stock_status === 'low').length,
    negative_items: items.filter(i => i.stock_status === 'negative').length,
    categories
  };

  return {
    summary,
    items
  };
}

async function buildOwnerMirrorSnapshot(options = {}) {
  const period = options.period || 'today';
  const { startDate, endDate } = getOperationalDateRange(period, options.start_date, options.end_date);

  const [roomsRes, transactionsRes, closingsRes, outboxStatus, openFnbOrders, lcPerformance, inventoryData, salesCommissionsRes, analyticsData] = await Promise.all([
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
    buildLcPerformanceSummary(startDate, endDate),
    buildInventorySnapshot().catch(err => ({
      summary: { total_items: 0, safe_items: 0, low_items: 0, negative_items: 0, categories: [] },
      items: [],
      error: err.message
    })),
    db.query(`
      SELECT commission_id, transaction_id, operational_date, basis_type, basis_amount,
             commission_percent, commission_amount, recipient_name, cashier_name, note, created_at
      FROM sales_commission_logs
      WHERE operational_date >= $1 AND operational_date <= $2
      ORDER BY created_at DESC
    `, [startDate, endDate]).catch(() => ({ rows: [] })),
    computeOperationalAnalytics({
      period,
      customStart: options.start_date,
      customEnd: options.end_date,
      compareTo: options.compare_to || 'previous_period',
      roomFilter: 'all'
    }).catch(err => {
      console.warn('Mirror analytics computation fallback error:', err.message);
      return null;
    })
  ]);

  const commissionsByTransactionId = new Map(
    (salesCommissionsRes?.rows || []).map(row => [row.transaction_id, row])
  );

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

  const transactions = transactionsRes.rows.map(transaction => {
    const paymentBreakdown = getPaymentBreakdown(transaction);
    const commission = commissionsByTransactionId.get(transaction.transaction_id);
    const commissionAmount = commission ? money(commission.commission_amount) : 0;
    const commissionPercent = commission ? Number(commission.commission_percent || 0) : 0;
    const recipientName = commission ? String(commission.recipient_name || '').trim() : '';
    const cashierName = commission ? String(commission.cashier_name || '').trim() : '';
    const note = commission ? String(commission.note || '').trim() : '';
    const basisType = commission ? String(commission.basis_type || 'grand_total').trim() : '';
    const basisAmount = commission ? money(commission.basis_amount) : 0;

    const promoDiscount = money(transaction.promo_discount);
    const manualDiscount = money(transaction.manual_discount) || (money(transaction.manual_discount_room) + money(transaction.manual_discount_fnb));
    const totalDeductions = commissionAmount + promoDiscount + manualDiscount;
    const grandTotal = money(transaction.grand_total);
    const netTotal = Math.max(0, grandTotal - commissionAmount);

    return {
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
      grand_total: grandTotal,
      sales_commission: commission ? {
        commission_id: commission.commission_id,
        transaction_id: commission.transaction_id,
        operational_date: commission.operational_date ? (commission.operational_date.toISOString ? commission.operational_date.toISOString().split('T')[0] : String(commission.operational_date)) : '',
        basis_type: basisType,
        basis_amount: basisAmount,
        commission_percent: commissionPercent,
        commission_amount: commissionAmount,
        recipient_name: recipientName,
        cashier_name: cashierName,
        note: note,
        created_at: iso(commission.created_at)
      } : null,
      sales_commission_amount: commissionAmount,
      sales_commission_percent: commissionPercent,
      sales_commission_recipient: recipientName,
      sales_commission_basis: basisType,
      promo_discount: promoDiscount,
      manual_discount: manualDiscount,
      total_deductions: totalDeductions,
      net_total: netTotal,
      fnb_order_ids: transaction.fnb_order_ids || '',
      payment_method: transaction.payment_method || '',
      payment_status: transaction.payment_status || '',
      cash_amount: paymentBreakdown.cash_amount,
      transfer_amount: paymentBreakdown.transfer_amount,
      cashier_name: transaction.cashier_name || '',
      booking_mode: transaction.booking_mode || '',
      package_id: transaction.package_id || '',
      package_name: transaction.package_name || '',
      package_total: money(transaction.package_total),
      promo_code: transaction.promo_code || '',
      manual_discount_room: money(transaction.manual_discount_room),
      manual_discount_fnb: money(transaction.manual_discount_fnb),
      manual_discount_reason: transaction.manual_discount_reason || '',
      manual_discount_by: transaction.manual_discount_by || '',
      manual_discount_at: iso(transaction.manual_discount_at),
      manual_discount_at_wib: transaction.manual_discount_at ? toJakartaIsoString(transaction.manual_discount_at) : '',
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
      operational_date: transaction.operational_date ? (transaction.operational_date.toISOString ? transaction.operational_date.toISOString().split('T')[0] : String(transaction.operational_date)) : '',
      created_at: iso(transaction.created_at)
    };
  });

  const fnbSoldSummary = await buildFnbSoldSummary(transactionsRes.rows);

  const summary = transactions.reduce((acc, transaction) => {
    const grandTotal = money(transaction.grand_total);
    const commAmount = money(transaction.sales_commission_amount);
    const promoDisc = money(transaction.promo_discount);
    const manualDisc = money(transaction.manual_discount);
    const totalDeductions = commAmount + promoDisc + manualDisc;

    acc.total_transactions += 1;
    acc.total_revenue_all += grandTotal;
    acc.total_room_revenue += money(transaction.room_total);
    acc.total_fnb_revenue += money(transaction.fnb_total);
    acc.total_lc_revenue += money(transaction.lc_total);
    acc.total_sales_commission += commAmount;
    acc.total_promo_discount += promoDisc;
    acc.total_manual_discount += manualDisc;
    acc.total_deductions += totalDeductions;
    acc.net_revenue_all += Math.max(0, grandTotal - commAmount);
    if (commAmount > 0) acc.transactions_with_commission += 1;
    if (totalDeductions > 0) acc.transactions_with_deductions += 1;

    if (transaction.payment_status === 'paid') {
      acc.paid_transactions += 1;
      acc.paid_revenue += grandTotal;
      acc.paid_sales_commission += commAmount;
      acc.net_paid_revenue += Math.max(0, grandTotal - commAmount);
      if (transaction.cash_amount > 0) acc.cash_revenue += money(transaction.cash_amount);
      if (transaction.transfer_amount > 0) acc.transfer_revenue += money(transaction.transfer_amount);
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
    net_revenue_all: 0,
    total_room_revenue: 0,
    total_fnb_revenue: 0,
    total_lc_revenue: 0,
    total_sales_commission: 0,
    paid_sales_commission: 0,
    net_paid_revenue: 0,
    total_promo_discount: 0,
    total_manual_discount: 0,
    total_deductions: 0,
    transactions_with_commission: 0,
    transactions_with_deductions: 0,
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
    sales_commission_total: money(closing.sales_commission_total),
    net_revenue_after_commission: money(closing.net_revenue_after_commission),
    operational_expense_total: money(closing.operational_expense_total),
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
    sales_commissions: (salesCommissionsRes?.rows || []).map(row => ({
      commission_id: row.commission_id,
      transaction_id: row.transaction_id,
      operational_date: row.operational_date ? (row.operational_date.toISOString ? row.operational_date.toISOString().split('T')[0] : String(row.operational_date)) : '',
      basis_type: row.basis_type || 'grand_total',
      basis_amount: money(row.basis_amount),
      commission_percent: Number(row.commission_percent || 0),
      commission_amount: money(row.commission_amount),
      recipient_name: row.recipient_name || '',
      cashier_name: row.cashier_name || '',
      note: row.note || '',
      created_at: iso(row.created_at)
    })),
    cashier_closings: closings,
    inventory_summary: inventoryData?.summary || { total_items: 0, safe_items: 0, low_items: 0, negative_items: 0, categories: [] },
    inventory_items: inventoryData?.items || [],
    analytics: analyticsData,
    sync_status: outboxStatus
  };
}

async function saveOwnerMirrorSnapshot(snapshot, sourceId = 'happy-song-local') {
  if (!snapshot || typeof snapshot !== 'object') {
    throw new Error('Payload snapshot mirror tidak valid.');
  }

  const period = snapshot.period || '';
  const operationalDateStart = snapshot.operational_date_start || null;
  const operationalDateEnd = snapshot.operational_date_end || null;
  const payloadJson = JSON.stringify(snapshot);
  const client = await db.pool.connect();

  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      `${sourceId}|${period}|${operationalDateStart || ''}|${operationalDateEnd || ''}`
    ]);

    const existing = await client.query(`
      SELECT snapshot_id
      FROM owner_mirror_snapshots
      WHERE source_id = $1
        AND COALESCE(period, '') = COALESCE($2, '')
        AND COALESCE(operational_date_start, DATE '1900-01-01') = COALESCE($3::date, DATE '1900-01-01')
        AND COALESCE(operational_date_end, DATE '1900-01-01') = COALESCE($4::date, DATE '1900-01-01')
      ORDER BY received_at DESC, snapshot_id DESC
      LIMIT 1
      FOR UPDATE
    `, [sourceId, period, operationalDateStart, operationalDateEnd]);

    const result = existing.rowCount > 0
      ? await client.query(`
          UPDATE owner_mirror_snapshots
          SET mirror_version = $2,
              generated_at = $3,
              generated_at_wib = $4,
              period = $5,
              operational_date_start = $6,
              operational_date_end = $7,
              payload_json = $8,
              received_at = CURRENT_TIMESTAMP
          WHERE snapshot_id = $1
          RETURNING snapshot_id, source_id, received_at
        `, [
          existing.rows[0].snapshot_id,
          snapshot.mirror_version || '',
          snapshot.generated_at || null,
          snapshot.generated_at_wib || '',
          period,
          operationalDateStart,
          operationalDateEnd,
          payloadJson
        ])
      : await client.query(`
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
          period,
          operationalDateStart,
          operationalDateEnd,
          payloadJson
        ]);

    const dedupe = await client.query(`
      WITH ranked AS (
        SELECT
          snapshot_id,
          ROW_NUMBER() OVER (
            PARTITION BY source_id, COALESCE(period, ''), operational_date_start, operational_date_end
            ORDER BY received_at DESC, snapshot_id DESC
          ) AS row_number
        FROM owner_mirror_snapshots
        WHERE source_id = $1
      )
      DELETE FROM owner_mirror_snapshots target
      USING ranked
      WHERE target.snapshot_id = ranked.snapshot_id
        AND ranked.row_number > 1
    `, [sourceId]);

    const retentionDays = Math.max(7, parseInt(process.env.OWNER_MIRROR_RETENTION_DAYS || '45', 10) || 45);
    const retention = await client.query(`
      DELETE FROM owner_mirror_snapshots
      WHERE source_id = $1
        AND received_at < CURRENT_TIMESTAMP - ($2::int * INTERVAL '1 day')
    `, [sourceId, retentionDays]);

    await client.query('COMMIT');

    return {
      snapshot_id: result.rows[0].snapshot_id,
      source_id: result.rows[0].source_id,
      received_at: iso(result.rows[0].received_at),
      deduped_snapshots: dedupe.rowCount || 0,
      retention_deleted_snapshots: retention.rowCount || 0,
      retention_days: retentionDays
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

function deriveAnalyticsFromSnapshotPayload(payload = {}, period = 'today') {
  const transactions = Array.isArray(payload.transactions) ? payload.transactions : [];
  const paidTrx = transactions.filter(t => t.payment_status === 'paid');
  const summary = payload.summary || {};
  const rooms = Array.isArray(payload.rooms) ? payload.rooms : [];
  const totalRoomsCount = Math.max(1, rooms.length || 1);
  const operationalHoursPerDay = 18;
  const durationDays = payload.operational_date_start && payload.operational_date_end
    ? Math.max(1, Math.round((new Date(payload.operational_date_end) - new Date(payload.operational_date_start)) / 86400000) + 1)
    : 1;
  const availableRoomHours = totalRoomsCount * operationalHoursPerDay * durationDays;

  const totalRevenue = money(summary.paid_revenue !== undefined ? summary.paid_revenue : paidTrx.reduce((s, t) => s + money(t.grand_total), 0));
  const roomRevenue = money(summary.total_room_revenue !== undefined ? summary.total_room_revenue : paidTrx.reduce((s, t) => s + money(t.room_total), 0));
  const fnbRevenue = money(summary.total_fnb_revenue !== undefined ? summary.total_fnb_revenue : paidTrx.reduce((s, t) => s + money(t.fnb_total), 0));
  const lcRevenue = money(summary.total_lc_revenue !== undefined ? summary.total_lc_revenue : paidTrx.reduce((s, t) => s + money(t.lc_total), 0));
  const discounts = money(summary.total_promo_discount || 0) + money(summary.total_manual_discount || 0);

  const curRevPah = availableRoomHours > 0 ? Math.round(roomRevenue / availableRoomHours) : 0;
  const curAov = paidTrx.length > 0 ? Math.round(totalRevenue / paidTrx.length) : 0;
  const extCount = paidTrx.filter(t => Number(t.duration_minutes || 0) > 120).length;
  const lcCount = paidTrx.filter(t => money(t.lc_total) > 0).length;
  const fnbHpp = Math.round(fnbRevenue * 0.4);
  const fnbGrossProfit = Math.max(0, fnbRevenue - fnbHpp);
  const fnbMarginPercent = fnbRevenue > 0 ? Math.round((fnbGrossProfit / fnbRevenue) * 1000) / 10 : 0;

  // 24 Hour sequence (10:00 to 09:00 next day)
  const hourlySequence = [];
  for (let i = 0; i < 24; i++) {
    const h = (10 + i) % 24;
    const inHour = paidTrx.filter(t => {
      const dtStr = t.start_time_wib || t.start_time || '';
      if (!dtStr) return false;
      const dt = new Date(dtStr);
      if (Number.isNaN(dt.getTime())) return false;
      const hrs = dt.getHours();
      return hrs === h;
    });
    hourlySequence.push({
      hour_wib: h,
      session_count: inHour.length,
      hourly_revenue: inHour.reduce((s, t) => s + money(t.grand_total), 0),
      hourly_room_hours: Math.round(inHour.reduce((s, t) => s + Number(t.duration_minutes || 0), 0) / 60 * 10) / 10
    });
  }

  // Daily sequence
  const dailyMap = new Map();
  for (const t of paidTrx) {
    const d = t.operational_date || (t.start_time_wib ? String(t.start_time_wib).split('T')[0] : '2026-09-20');
    if (!dailyMap.has(d)) {
      dailyMap.set(d, { operational_date: d, trx_count: 0, daily_revenue: 0, daily_room_hours: 0 });
    }
    const item = dailyMap.get(d);
    item.trx_count += 1;
    item.daily_revenue += money(t.grand_total);
    item.daily_room_hours += Math.round(Number(t.duration_minutes || 0) / 60 * 10) / 10;
  }
  const dailySequence = Array.from(dailyMap.values()).sort((a, b) => a.operational_date.localeCompare(b.operational_date));

  // Day of week pattern
  const dayNamesId = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
  const dowList = dayNamesId.map(name => ({ day_name: name, total_sessions: 0, total_revenue: 0, total_room_hours: 0 }));
  for (const t of paidTrx) {
    const dStr = t.operational_date || '';
    if (dStr) {
      const dt = new Date(`${dStr}T00:00:00+07:00`);
      if (!Number.isNaN(dt.getTime())) {
        const dow = dt.getDay();
        dowList[dow].total_sessions += 1;
        dowList[dow].total_revenue += money(t.grand_total);
        dowList[dow].total_room_hours += Math.round(Number(t.duration_minutes || 0) / 60 * 10) / 10;
      }
    }
  }

  // Room Leaderboard
  const roomMap = new Map();
  for (const t of paidTrx) {
    const rName = t.room_name || t.room_id || 'Room';
    if (!roomMap.has(rName)) {
      roomMap.set(rName, { room_id: t.room_id, room_name: rName, session_count: 0, total_revenue: 0, total_room_hours: 0 });
    }
    const rm = roomMap.get(rName);
    rm.session_count += 1;
    rm.total_revenue += money(t.grand_total);
    rm.total_room_hours += Math.round(Number(t.duration_minutes || 0) / 60 * 10) / 10;
  }
  const roomLeaderboard = Array.from(roomMap.values()).sort((a, b) => b.total_revenue - a.total_revenue);

  // FnB Leaderboard
  const fnbSold = Array.isArray(payload.fnb_sold_items) ? payload.fnb_sold_items : (payload.fnb_sold_summary?.items || []);
  const fnbLeaderboard = fnbSold.slice(0, 10).map(f => ({
    menu_id: f.menu_id || '',
    menu_name: f.menu_name || '',
    category: f.category || 'F&B',
    total_quantity: Number(f.quantity || 0),
    total_revenue: money(f.revenue || 0)
  }));

  return {
    filters: {
      period,
      startDate: payload.operational_date_start,
      endDate: payload.operational_date_end,
      durationDays,
      totalRoomsCount,
      availableRoomHours,
      operationalHoursPerDay
    },
    kpi: {
      totalRevenue: {
        current: totalRevenue,
        compare: 0,
        deltaPercent: 0,
        trxCount: paidTrx.length
      },
      revPah: {
        current: curRevPah,
        compare: 0,
        deltaPercent: 0,
        availableHours: availableRoomHours
      },
      avgSpendPerRoom: {
        current: curAov,
        compare: 0,
        deltaPercent: 0
      },
      roomOccupancyRate: {
        currentPercent: availableRoomHours > 0 ? Math.round(((paidTrx.reduce((s, t) => s + Number(t.duration_minutes || 0), 0) / 60) / availableRoomHours) * 1000) / 10 : 0,
        comparePercent: 0,
        deltaPercent: 0,
        availableHours: availableRoomHours
      },
      fnbGrossMargin: {
        grossSales: fnbRevenue,
        currentPercent: fnbMarginPercent,
        grossProfit: fnbGrossProfit,
        totalHpp: fnbHpp
      },
      roomExtensionRate: {
        currentPercent: paidTrx.length > 0 ? Math.round((extCount / paidTrx.length) * 1000) / 10 : 0,
        comparePercent: 0,
        deltaPercent: 0,
        extendedSessions: extCount,
        totalSessions: paidTrx.length
      },
      lcAttachmentRate: {
        currentPercent: paidTrx.length > 0 ? Math.round((lcCount / paidTrx.length) * 1000) / 10 : 0,
        comparePercent: 0,
        deltaPercent: 0,
        lcSessions: lcCount,
        totalSessions: paidTrx.length
      },
      discountLeakage: {
        current: discounts,
        compare: 0,
        deltaPercent: 0
      }
    },
    revenueComposition: {
      roomTotal: roomRevenue,
      fnbTotal: fnbRevenue,
      lcTotal: lcRevenue,
      discounts,
      netRevenue: totalRevenue
    },
    paymentBreakdown: {
      cash: money(summary.cash_revenue),
      transfer: money(summary.transfer_revenue)
    },
    hourlyTraffic: hourlySequence,
    dailyTrend: dailySequence.length ? dailySequence : [{ operational_date: payload.operational_date_start || '2026-09-20', trx_count: paidTrx.length, daily_revenue: totalRevenue, daily_room_hours: 15 }],
    dayOfWeekPattern: {
      days: dowList,
      peakDay: "Minggu",
      slowestDay: "Senin"
    },
    roomLeaderboard,
    fnbLeaderboard
  };
}

async function getLatestOwnerMirrorSnapshot(sourceId = 'happy-song-local', options = {}) {
  const period = options.period || '';
  const hasPeriodFilter = Boolean(period || options.start_date || options.end_date);
  const range = hasPeriodFilter
    ? getOperationalDateRange(period || 'today', options.start_date, options.end_date)
    : null;

  let result = hasPeriodFilter
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

  let isFallback = false;

  // Fallback hanya berlaku untuk periode akumulasi/rentang (seperti 'last7days', 'thismonth')
  // saat PC kasir offline sehingga data tanggal operasional hari ini belum terkirim.
  // Untuk 'today' atau 'activeshift', TIDAK BOLEH fallback ke snapshot hari kemarin/sebelumnya
  // agar aturan cut-off 10:00 WIB ditaati (hari operasional baru otomatis reset / kosong sampai kasir buka).
  const allowCumulativeFallback = hasPeriodFilter && (period === 'last7days' || period === 'thismonth');

  if (result.rowCount === 0 && allowCumulativeFallback) {
    const periodFallback = await db.query(`
      SELECT *
      FROM owner_mirror_snapshots
      WHERE source_id = $1
        AND period = $2
      ORDER BY received_at DESC, snapshot_id DESC
      LIMIT 1
    `, [sourceId, period]);

    if (periodFallback.rowCount > 0) {
      result = periodFallback;
      isFallback = true;
    }
  }

  if (result.rowCount === 0) {
    return {
      mirror_version: 'owner-mirror-cloud-empty-v1',
      mode: 'cloud_latest_snapshot',
      source_id: sourceId,
      has_snapshot: false,
      is_fallback: false,
      period: period || 'latest',
      operational_date_start: range?.startDate || '',
      operational_date_end: range?.endDate || '',
      summary: {
        total_revenue_all: 0,
        paid_revenue: 0,
        unpaid_revenue: 0,
        paid_transactions: 0,
        unpaid_transactions: 0,
        total_transactions: 0,
        cash_revenue: 0,
        transfer_revenue: 0,
        total_fnb_revenue: 0,
        total_lc_revenue: 0,
        occupied_rooms: 0,
        cleaning_rooms: 0,
        available_rooms: 0,
        open_fnb_revenue: 0,
        total_sales_commission: 0,
        paid_sales_commission: 0,
        net_paid_revenue: 0,
        transactions_with_commission: 0
      },
      rooms: [],
      transactions: [],
      cashier_closings: [],
      fnb_sold_summary: { total_qty: 0, total_revenue: 0, unique_items: 0, order_count: 0, items: [] },
      lc_performance: { active_lc_count: 0, total_sessions: 0, total_duration_minutes: 0, total_fee: 0, items: [] },
      message: (period === 'today' || period === 'activeshift')
        ? 'Belum ada transaksi di hari operasional ini (Cut-off jam 10:00 WIB).'
        : 'Belum ada snapshot dari PC kasir untuk periode ini.'
    };
  }

  const row = result.rows[0];
  const storedPeriod = row.period || row.payload_json?.period || '';
  const payload = row.payload_json || {};
  let analytics = payload.analytics;
  if (!analytics || !analytics.kpi) {
    analytics = deriveAnalyticsFromSnapshotPayload(payload, period || storedPeriod);
  }

  return {
    ...payload,
    analytics,
    mode: 'cloud_latest_snapshot',
    source_id: row.source_id,
    has_snapshot: true,
    is_fallback: isFallback,
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
  getLatestOwnerMirrorSnapshot,
  deriveAnalyticsFromSnapshotPayload
};
