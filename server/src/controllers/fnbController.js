const db = require('../db');
const { successResponse, errorResponse } = require('../utils/response');

async function getMenuItems(req, res) {
  try {
    const result = await db.query(`
      SELECT 
        menu_id, menu_name, category, price, status, 
        stock_tracking, stock_item_id, stock_qty_per_unit, 
        bonus_sales_lc, hpp, variable_cost_rate
      FROM menu
      ORDER BY category ASC, menu_name ASC
    `);

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
      variable_cost_rate: Number(row.variable_cost_rate || 0)
    }));

    return res.json({ ok: true, success: true, items });
  } catch (err) {
    return errorResponse(res, err.message);
  }
}

async function getOpenFnbOrders(req, res, roomId) {
  try {
    const ordersRes = await db.query(`
      SELECT * FROM fnb_orders 
      WHERE ($1::varchar IS NULL OR room_id = $1) AND order_status = 'open'
      ORDER BY created_at ASC
    `, [roomId || null]);

    const orders = ordersRes.rows;
    for (const order of orders) {
      const itemsRes = await db.query(`
        SELECT * FROM fnb_order_items WHERE order_id = $1 ORDER BY created_at ASC
      `, [order.order_id]);
      order.items = itemsRes.rows.map(item => ({
        ...item,
        price: Number(item.price),
        subtotal: Number(item.subtotal)
      }));
    }

    return res.json({ ok: true, orders });
  } catch (err) {
    return errorResponse(res, err.message);
  }
}

async function saveFnbOrder(req, res, payload) {
  let client;
  try {
    client = await db.pool.connect();
    await client.query('BEGIN');
    const { room_id, items, cashier_name = 'Kasir', note = '', idempotency_key } = payload;

    if (!room_id) throw new Error('room_id wajib diisi.');
    if (!Array.isArray(items) || items.length === 0) throw new Error('Daftar item F&B wajib diisi.');

    if (idempotency_key) {
      const existing = await client.query('SELECT * FROM fnb_orders WHERE idempotency_key = $1', [idempotency_key]);
      if (existing.rowCount > 0) {
        await client.query('COMMIT');
        return successResponse(res, { message: 'Order F&B sudah diproses (idempotent).', order: existing.rows[0] });
      }
    }

    const roomRes = await client.query('SELECT room_name, start_time FROM rooms WHERE room_id = $1', [room_id]);
    const roomName = roomRes.rowCount > 0 ? roomRes.rows[0].room_name : room_id;
    const roomStartTime = roomRes.rowCount > 0 ? roomRes.rows[0].start_time : null;

    let orderTotal = 0;
    const verifiedItems = [];

    for (const itemInput of items) {
      const menuId = itemInput.menu_id;
      const quantity = Math.max(1, parseInt(itemInput.quantity || 1, 10));

      const menuRes = await client.query('SELECT menu_id, menu_name, category, price, status FROM menu WHERE menu_id = $1', [menuId]);
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

      verifiedItems.push({
        menu_id: dbMenu.menu_id,
        menu_name: dbMenu.menu_name,
        category: dbMenu.category || 'F&B',
        price: verifiedPrice,
        quantity,
        subtotal
      });
    }

    const orderId = `FNB-${Date.now()}`;
    await client.query(`
      INSERT INTO fnb_orders (
        order_id, room_id, room_name, room_start_time, order_status, 
        order_total, cashier_name, note, idempotency_key
      ) VALUES ($1, $2, $3, $4, 'open', $5, $6, $7, $8)
    `, [orderId, room_id, roomName, roomStartTime, orderTotal, cashier_name, note, idempotency_key || null]);

    for (const vItem of verifiedItems) {
      await client.query(`
        INSERT INTO fnb_order_items (
          order_id, menu_id, menu_name, category, price, quantity, subtotal
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [orderId, vItem.menu_id, vItem.menu_name, vItem.category, vItem.price, vItem.quantity, vItem.subtotal]);
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
      order_total: orderTotal
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

module.exports = {
  getMenuItems,
  getOpenFnbOrders,
  saveFnbOrder,
  cancelFnbOrder,
};
