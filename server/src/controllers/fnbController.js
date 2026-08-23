const db = require('../db');
const { successResponse, errorResponse } = require('../utils/response');
const { getOperationalDate, getOperationalDateRange } = require('../utils/operationalDate');

const FNB_GENERAL_ROOM_ID = 'FNB-GENERAL';
const FNB_GENERAL_ROOM_NAME = 'F&B Umum';

let fnbBundleSchemaChecked = false;
async function ensureFnbBundleSchema(executor = db) {
  if (fnbBundleSchemaChecked) return;
  await executor.query(`
    ALTER TABLE menu ADD COLUMN IF NOT EXISTS menu_type VARCHAR(30) NOT NULL DEFAULT 'regular';
    ALTER TABLE recipe ADD COLUMN IF NOT EXISTS component_mode VARCHAR(20) NOT NULL DEFAULT 'included';
    ALTER TABLE recipe ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 1;
    ALTER TABLE fnb_order_items ADD COLUMN IF NOT EXISTS menu_type_snapshot VARCHAR(30) NOT NULL DEFAULT 'regular';
    CREATE TABLE IF NOT EXISTS fnb_order_item_components (
      component_snapshot_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      order_item_id UUID NOT NULL REFERENCES fnb_order_items(order_item_id) ON DELETE CASCADE,
      order_id VARCHAR(50) NOT NULL REFERENCES fnb_orders(order_id) ON DELETE CASCADE,
      menu_id VARCHAR(50),
      item_id VARCHAR(50),
      component_name VARCHAR(100) NOT NULL,
      qty_per_menu NUMERIC(12,4) NOT NULL,
      order_quantity INT NOT NULL,
      total_qty NUMERIC(12,4) NOT NULL,
      unit VARCHAR(20) NOT NULL,
      component_mode VARCHAR(20) NOT NULL DEFAULT 'included',
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_fnb_order_item_components_order_item ON fnb_order_item_components(order_item_id);
    CREATE INDEX IF NOT EXISTS idx_fnb_order_item_components_order ON fnb_order_item_components(order_id);
  `);
  fnbBundleSchemaChecked = true;
}

function normalizeBundleComponentRow(row) {
  return {
    item_id: row.item_id || '',
    stock_item_id: row.item_id || '',
    component_name: row.component_name || row.stock_item_name || row.item_id || '',
    stock_item_name: row.component_name || row.stock_item_name || row.item_id || '',
    qty_used: Number(row.qty_used ?? row.qty_per_menu ?? 0),
    qty_per_menu: Number(row.qty_per_menu ?? row.qty_used ?? 0),
    order_quantity: Number(row.order_quantity || 0),
    total_qty: Number(row.total_qty || 0),
    unit: row.unit || 'unit',
    component_mode: String(row.component_mode || 'included').toLowerCase(),
    sort_order: Number(row.sort_order || 0)
  };
}

async function ensureGeneralFnbRoom(client) {
  await client.query(`
    INSERT INTO rooms (room_id, room_name, status, rate_per_hour)
    VALUES ($1, $2, 'available', 0)
    ON CONFLICT (room_id) DO NOTHING
  `, [FNB_GENERAL_ROOM_ID, FNB_GENERAL_ROOM_NAME]);
}

async function getMenuItems(req, res) {
  try {
    await ensureFnbBundleSchema();
    const result = await db.query(`
      SELECT 
        menu_id, menu_name, category, price, status, 
        stock_tracking, stock_item_id, stock_qty_per_unit, 
        bonus_sales_lc, hpp, variable_cost_rate, menu_type
      FROM menu
      ORDER BY category ASC, menu_name ASC
    `);

    const recipeResult = await db.query(`
      SELECT r.menu_id, r.item_id, r.qty_used, r.unit, r.component_mode, r.sort_order,
             i.stock_item_name, i.status AS inventory_status
      FROM recipe r
      LEFT JOIN inventory i ON i.stock_item_id = r.item_id
      JOIN menu m ON m.menu_id = r.menu_id
      WHERE m.menu_type = 'fnb_bundle'
      ORDER BY r.menu_id ASC, r.sort_order ASC, r.recipe_id ASC
    `);
    const componentsByMenuId = recipeResult.rows.reduce((map, row) => {
      if (!map[row.menu_id]) map[row.menu_id] = [];
      map[row.menu_id].push({
        ...normalizeBundleComponentRow({ ...row, component_name: row.stock_item_name }),
        inventory_status: row.inventory_status || ''
      });
      return map;
    }, {});

    const items = result.rows.map(row => ({
      menu_id: row.menu_id,
      menu_name: row.menu_name,
      category: row.category,
      price: Number(row.price || 0),
      status: row.status,
      stock_tracking: row.stock_tracking || 'no',
      stock_item_id: row.stock_item_id || '',
      stock_qty_per_unit: Number(row.stock_qty_per_unit || 1),
      bonus_sales_lc: Number(row.bonus_sales_lc || 0),
      hpp: Number(row.hpp || 0),
      variable_cost_rate: Number(row.variable_cost_rate || 0),
      menu_type: row.menu_type || 'regular',
      bundle_components: componentsByMenuId[row.menu_id] || []
    }));

    return res.json({ ok: true, success: true, items, menu_items: items });
  } catch (err) {
    return errorResponse(res, err.message);
  }
}

async function getOpenFnbOrders(req, res, roomId) {
  try {
    await ensureFnbBundleSchema();
    const ordersRes = await db.query(`
      SELECT * FROM fnb_orders 
      WHERE ($1::varchar IS NULL OR room_id = $1) AND order_status = 'open'
      ORDER BY created_at ASC
    `, [roomId || null]);

    const orders = await attachOrderItems(ordersRes.rows);

    return res.json({ ok: true, orders });
  } catch (err) {
    return errorResponse(res, err.message);
  }
}

async function attachOrderItems(orders) {
  await ensureFnbBundleSchema();
  for (const order of orders) {
    const itemsRes = await db.query('SELECT * FROM fnb_order_items WHERE order_id = $1 ORDER BY created_at ASC', [order.order_id]);
    const itemIds = itemsRes.rows.map(item => item.order_item_id);
    const componentsResult = itemIds.length > 0
      ? await db.query(`
          SELECT * FROM fnb_order_item_components
          WHERE order_item_id = ANY($1::uuid[])
          ORDER BY created_at ASC, component_snapshot_id ASC
        `, [itemIds])
      : { rows: [] };
    const componentsByItemId = componentsResult.rows.reduce((map, row) => {
      if (!map[row.order_item_id]) map[row.order_item_id] = [];
      map[row.order_item_id].push(normalizeBundleComponentRow(row));
      return map;
    }, {});
    order.items = itemsRes.rows.map(item => ({
      ...item,
      price: Number(item.price || 0),
      subtotal: Number(item.subtotal || 0),
      is_voided: Boolean(item.is_voided),
      menu_type: item.menu_type_snapshot || 'regular',
      bundle_components: componentsByItemId[item.order_item_id] || []
    }));
    order.order_total = Number(order.order_total || 0);
  }
  return orders;
}

async function getTodayFnbOrders(req, res) {
  try {
    const { status, room_id, period, start_date, end_date } = req.query;
    const { startDate, endDate } = getOperationalDateRange(period, start_date, end_date);

    const params = [startDate, endDate];
    const filters = [`DATE(created_at AT TIME ZONE 'Asia/Jakarta') >= $1`, `DATE(created_at AT TIME ZONE 'Asia/Jakarta') <= $2`];
    if (status) {
      params.push(status);
      filters.push(`order_status = $${params.length}`);
    }
    if (room_id) {
      params.push(room_id);
      filters.push(`room_id = $${params.length}`);
    }

    const ordersRes = await db.query(`
      SELECT * FROM fnb_orders
      WHERE ${filters.join(' AND ')}
      ORDER BY created_at DESC
    `, params);

    const orders = await attachOrderItems(ordersRes.rows);
    return res.json({ ok: true, success: true, orders, fnb_orders: orders });
  } catch (err) {
    return errorResponse(res, err.message);
  }
}

async function saveFnbOrder(req, res, payload) {
  let client;
  try {
    client = await db.pool.connect();
    await ensureFnbBundleSchema(client);
    await client.query('BEGIN');
    const {
      room_id,
      items,
      cashier_name = 'Kasir',
      note = '',
      payment_method = '',
      payment_status = 'unpaid',
      customer_name = '',
      general_bill_id = '',
      idempotency_key
    } = payload;

    if (!room_id) throw new Error('room_id wajib diisi.');
    if (!Array.isArray(items) || items.length === 0) throw new Error('Daftar item F&B wajib diisi.');

    const isGeneralOrder = String(room_id).toUpperCase() === FNB_GENERAL_ROOM_ID;
    const isPaid = String(payment_status).toLowerCase() === 'paid';
    if (isGeneralOrder && !String(customer_name || '').trim()) {
      throw new Error('Nama pemesan wajib diisi untuk order F&B umum.');
    }

    if (idempotency_key) {
      const existing = await client.query('SELECT * FROM fnb_orders WHERE idempotency_key = $1', [idempotency_key]);
      if (existing.rowCount > 0) {
        const itemsRes = await client.query('SELECT * FROM fnb_order_items WHERE order_id = $1 ORDER BY created_at ASC', [existing.rows[0].order_id]);
        await client.query('COMMIT');
        return successResponse(res, { message: 'Order F&B sudah diproses (idempotent).', order: existing.rows[0], items: itemsRes.rows, idempotent_replay: true });
      }
    }

    if (isGeneralOrder) {
      await ensureGeneralFnbRoom(client);
    }

    const roomRes = await client.query('SELECT room_name, start_time, status FROM rooms WHERE room_id = $1', [room_id]);
    if (roomRes.rowCount === 0) throw new Error('Ruangan tidak ditemukan.');
    const roomName = isGeneralOrder ? FNB_GENERAL_ROOM_NAME : roomRes.rows[0].room_name;
    const roomStartTime = roomRes.rows[0].start_time || null;
    let sessionId = null;

    if (!isGeneralOrder) {
      const status = String(roomRes.rows[0].status || '').toLowerCase();
      if (!['occupied', 'waiting_payment', 'booked', 'paid_waiting_start'].includes(status)) {
        throw new Error('Order F&B hanya bisa disimpan untuk ruangan yang sedang terisi atau sudah dibooking.');
      }
      const sessionRes = await client.query(`
        SELECT session_id
        FROM room_sessions
        WHERE room_id = $1 AND status IN ('starting', 'active')
        ORDER BY created_at DESC
        LIMIT 1
      `, [room_id]);
      sessionId = sessionRes.rows[0]?.session_id || null;
    }

    let orderTotal = 0;
    const verifiedItems = [];

    for (const itemInput of items) {
      const menuId = itemInput.menu_id;
      const quantity = Math.max(1, parseInt(itemInput.quantity || 1, 10));

      const menuRes = await client.query('SELECT menu_id, menu_name, category, price, status, menu_type FROM menu WHERE menu_id = $1', [menuId]);
      if (menuRes.rowCount === 0) {
        throw new Error(`Menu dengan ID ${menuId} tidak ditemukan.`);
      }

      const dbMenu = menuRes.rows[0];
      if (dbMenu.status !== 'active') {
        throw new Error(`Menu ${dbMenu.menu_name} sedang tidak aktif.`);
      }

      const verifiedPrice = Number(dbMenu.price || 0);
      const subtotal = verifiedPrice * quantity;
      orderTotal += subtotal;

      let bundleComponents = [];
      if (String(dbMenu.menu_type || 'regular').toLowerCase() === 'fnb_bundle') {
        const componentResult = await client.query(`
          SELECT r.item_id, r.qty_used, r.unit, r.component_mode, r.sort_order,
                 i.stock_item_name, i.status AS inventory_status
          FROM recipe r
          LEFT JOIN inventory i ON i.stock_item_id = r.item_id
          WHERE r.menu_id = $1
          ORDER BY r.sort_order ASC, r.recipe_id ASC
        `, [dbMenu.menu_id]);
        if (componentResult.rowCount === 0) throw new Error(`Paket F&B ${dbMenu.menu_name} belum memiliki komponen.`);
        if (componentResult.rows.some(component => !component.stock_item_name || String(component.inventory_status || '').toLowerCase() !== 'active')) {
          throw new Error(`Komponen stok paket F&B ${dbMenu.menu_name} tidak lengkap atau tidak aktif.`);
        }
        bundleComponents = componentResult.rows.map(component => ({
          ...normalizeBundleComponentRow({ ...component, component_name: component.stock_item_name }),
          order_quantity: quantity,
          total_qty: Number(component.qty_used || 0) * quantity
        }));
      }

      verifiedItems.push({
        menu_id: dbMenu.menu_id,
        menu_name: dbMenu.menu_name,
        category: dbMenu.category || 'F&B',
        price: verifiedPrice,
        quantity,
        subtotal,
        menu_type: dbMenu.menu_type || 'regular',
        bundle_components: bundleComponents
      });
    }

    const orderId = `FNB-${Date.now()}`;
    const effectiveGeneralBillId = isGeneralOrder && !isPaid
      ? (general_bill_id || `GBILL-${Date.now()}`)
      : '';
    const orderStatus = isPaid ? 'billed' : 'open';

    await client.query(`
      INSERT INTO fnb_orders (
        order_id, room_id, room_name, session_id, room_start_time, order_status,
        order_total, cashier_name, note, idempotency_key, customer_name, general_bill_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    `, [orderId, room_id, roomName, sessionId, roomStartTime, orderStatus, orderTotal, cashier_name, note, idempotency_key || null, customer_name || null, effectiveGeneralBillId || null]);

    for (const vItem of verifiedItems) {
      const insertedItem = await client.query(`
        INSERT INTO fnb_order_items (
          order_id, menu_id, menu_name, category, price, quantity, subtotal, menu_type_snapshot
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING order_item_id
      `, [orderId, vItem.menu_id, vItem.menu_name, vItem.category, vItem.price, vItem.quantity, vItem.subtotal, vItem.menu_type]);
      vItem.order_item_id = insertedItem.rows[0].order_item_id;

      for (const component of vItem.bundle_components) {
        await client.query(`
          INSERT INTO fnb_order_item_components (
            order_item_id, order_id, menu_id, item_id, component_name,
            qty_per_menu, order_quantity, total_qty, unit, component_mode
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        `, [vItem.order_item_id, orderId, vItem.menu_id, component.item_id, component.component_name, component.qty_per_menu, vItem.quantity, component.total_qty, component.unit, component.component_mode]);
      }
    }

    let transaction = null;
    if (isPaid) {
      const { deductStockForFnbOrders } = require('./roomsController');
      const now = new Date();
      const transactionId = `TRX-${Date.now()}`;
      const opDate = getOperationalDate(now);
      await client.query(`
        INSERT INTO transactions (
          transaction_id, room_id, room_name, start_time, end_time,
          duration_minutes, rate_per_hour, room_total, fnb_total, lc_total,
          grand_total, fnb_order_ids, payment_method, payment_status, cashier_name, operational_date, idempotency_key
        ) VALUES ($1, $2, $3, $4, $4, 0, 0, 0, $5, 0, $5, $6, $7, 'paid', $8, $9, $10)
      `, [transactionId, room_id, isGeneralOrder && customer_name ? `${FNB_GENERAL_ROOM_NAME} - ${customer_name}` : roomName, now, orderTotal, orderId, payment_method || 'cash', cashier_name, opDate, idempotency_key ? `${idempotency_key}:trx` : null]);
      await deductStockForFnbOrders(client, [orderId], transactionId, cashier_name);
      transaction = { transaction_id: transactionId, room_id, room_name: roomName, fnb_total: orderTotal, grand_total: orderTotal, payment_status: 'paid', payment_method: payment_method || 'cash' };
    }

    await client.query(`
      INSERT INTO sync_outbox (entity_type, entity_id, action, payload_json)
      VALUES ('fnb_orders', $1, 'INSERT', $2)
      ON CONFLICT DO NOTHING
    `, [orderId, JSON.stringify({ order_id: orderId, room_id, order_total: orderTotal, items_count: verifiedItems.length })]);

    await client.query('COMMIT');
    return successResponse(res, {
      message: 'Order F&B berhasil disimpan.',
      order_id: orderId,
      order_total: orderTotal,
      general_bill_id: effectiveGeneralBillId,
      order: {
        order_id: orderId,
        room_id,
        room_name: roomName,
        session_id: sessionId,
        order_status: orderStatus,
        order_total: orderTotal,
        customer_name,
        general_bill_id: effectiveGeneralBillId
      },
      items: verifiedItems,
      transaction
    });
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    return errorResponse(res, err.message);
  } finally {
    if (client) client.release();
  }
}

async function cancelFnbOrder(req, res, payload) {
  try {
    const { order_id, cancel_reason, cancelled_by = 'Kasir' } = payload;
    if (!order_id) throw new Error('order_id wajib diisi.');

    await db.query(`
      UPDATE fnb_orders
      SET order_status = 'cancelled',
          cancel_reason = $1,
          cancelled_by = $2,
          cancelled_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE order_id = $3
    `, [cancel_reason || 'Dibatalkan kasir', cancelled_by, order_id]);

    return successResponse(res, { message: `Order ${order_id} berhasil dibatalkan.` });
  } catch (err) {
    return errorResponse(res, err.message);
  }
}

async function getFnbOrdersByIds(req, res) {
  try {
    const rawIds = req.query.order_ids || req.query.ids || '';
    const ids = String(rawIds).split(',').map(id => id.trim()).filter(Boolean);
    if (ids.length === 0) return res.json({ ok: true, success: true, orders: [] });

    const ordersRes = await db.query('SELECT * FROM fnb_orders WHERE order_id = ANY($1) ORDER BY created_at ASC', [ids]);
    const orders = ordersRes.rows;
    await attachOrderItems(orders);

    return res.json({ ok: true, success: true, orders });
  } catch (err) {
    return errorResponse(res, err.message);
  }
}

async function settleGeneralFnbBill(req, res, payload) {
  let client;
  try {
    client = await db.pool.connect();
    await client.query('BEGIN');

    await ensureGeneralFnbRoom(client);

    const generalBillId = payload.general_bill_id;
    const paymentMethod = String(payload.payment_method || 'cash').toLowerCase();
    const cashierName = payload.cashier_name || 'Kasir';
    const idempotencyKey = payload.idempotency_key || null;

    if (!generalBillId) throw new Error('general_bill_id wajib diisi.');
    if (!['cash', 'qris', 'transfer'].includes(paymentMethod)) throw new Error('Metode pembayaran wajib cash, qris, atau transfer.');

    if (idempotencyKey) {
      const existingTx = await client.query('SELECT * FROM transactions WHERE idempotency_key = $1', [idempotencyKey]);
      if (existingTx.rowCount > 0) {
        await client.query('COMMIT');
        return successResponse(res, { message: 'Open bill F&B umum sudah pernah dibayar.', transaction: existingTx.rows[0], idempotent_replay: true });
      }
    }

    const ordersRes = await client.query(`
      SELECT * FROM fnb_orders
      WHERE general_bill_id = $1 AND room_id = $2 AND order_status = 'open'
      ORDER BY created_at ASC
      FOR UPDATE
    `, [generalBillId, FNB_GENERAL_ROOM_ID]);

    if (ordersRes.rowCount === 0) throw new Error('Open bill F&B umum tidak ditemukan atau sudah dibayar.');

    const orderIds = ordersRes.rows.map(order => order.order_id);
    const fnbTotal = ordersRes.rows.reduce((total, order) => total + Number(order.order_total || 0), 0);
    const customerName = ordersRes.rows[0].customer_name || '';
    const now = new Date();
    const opDate = getOperationalDate(now);
    const transactionId = `TRX-${Date.now()}`;

    await client.query(`
      INSERT INTO transactions (
        transaction_id, room_id, room_name, start_time, end_time,
        duration_minutes, rate_per_hour, room_total, fnb_total, lc_total,
        grand_total, fnb_order_ids, payment_method, payment_status, cashier_name, operational_date, idempotency_key
      ) VALUES ($1, $2, $3, $4, $4, 0, 0, 0, $5, 0, $5, $6, $7, 'paid', $8, $9, $10)
    `, [transactionId, FNB_GENERAL_ROOM_ID, customerName ? `${FNB_GENERAL_ROOM_NAME} - ${customerName}` : FNB_GENERAL_ROOM_NAME, now, fnbTotal, orderIds.join(','), paymentMethod, cashierName, opDate, idempotencyKey]);

    await client.query(`UPDATE fnb_orders SET order_status = 'billed', updated_at = CURRENT_TIMESTAMP WHERE order_id = ANY($1)`, [orderIds]);

    const { deductStockForFnbOrders } = require('./roomsController');
    await deductStockForFnbOrders(client, orderIds, transactionId, cashierName);

    await client.query(`
      INSERT INTO sync_outbox (entity_type, entity_id, action, payload_json)
      VALUES ('transactions', $1, 'INSERT', $2)
      ON CONFLICT DO NOTHING
    `, [transactionId, JSON.stringify({ transaction_id: transactionId, room_id: FNB_GENERAL_ROOM_ID, grand_total: fnbTotal, payment_status: 'paid', operational_date: opDate })]);

    await client.query('COMMIT');
    return successResponse(res, {
      message: 'Open bill F&B umum berhasil dibayar.',
      transaction: {
        transaction_id: transactionId,
        room_id: FNB_GENERAL_ROOM_ID,
        room_name: customerName ? `${FNB_GENERAL_ROOM_NAME} - ${customerName}` : FNB_GENERAL_ROOM_NAME,
        fnb_total: fnbTotal,
        grand_total: fnbTotal,
        fnb_order_ids: orderIds.join(','),
        payment_method: paymentMethod,
        payment_status: 'paid'
      }
    });
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    return errorResponse(res, err.message);
  } finally {
    if (client) client.release();
  }
}

async function getTodayFnbSalesReport(req, res) {
  try {
    const { period, start_date, end_date } = req.query;
    const { startDate, endDate } = getOperationalDateRange(period, start_date, end_date);

    const itemRes = await db.query(`
      SELECT
        foi.menu_id,
        foi.menu_name,
        foi.category,
        SUM(foi.quantity) AS quantity,
        SUM(foi.subtotal) AS subtotal
      FROM fnb_order_items foi
      JOIN fnb_orders fo ON fo.order_id = foi.order_id
      WHERE DATE(fo.created_at AT TIME ZONE 'Asia/Jakarta') >= $1
        AND DATE(fo.created_at AT TIME ZONE 'Asia/Jakarta') <= $2
        AND fo.order_status <> 'cancelled'
      GROUP BY foi.menu_id, foi.menu_name, foi.category
      ORDER BY subtotal DESC
    `, [startDate, endDate]);

    const items = itemRes.rows.map(row => ({
      ...row,
      quantity: Number(row.quantity || 0),
      subtotal: Number(row.subtotal || 0)
    }));
    const total = items.reduce((sum, item) => sum + item.subtotal, 0);

    return res.json({ ok: true, success: true, items, total_sales: total, operational_date_start: startDate, operational_date_end: endDate });
  } catch (err) {
    return errorResponse(res, err.message);
  }
}

module.exports = {
  getMenuItems,
  getOpenFnbOrders,
  getTodayFnbOrders,
  getFnbOrdersByIds,
  saveFnbOrder,
  cancelFnbOrder,
  settleGeneralFnbBill,
  getTodayFnbSalesReport,
};
