const db = require('../db');
const { successResponse, errorResponse } = require('../utils/response');
const { getOperationalDate } = require('../utils/operationalDate');

async function getRooms(req, res) {
  try {
    const result = await db.query(`
      SELECT 
        room_id, room_name, status, start_time, 
        booked_duration_minutes, scheduled_end_time, rate_per_hour, 
        tv_device_id, updated_at
      FROM rooms
      ORDER BY room_id ASC
    `);

    const rooms = result.rows.map(r => ({
      room_id: r.room_id,
      room_name: r.room_name,
      status: r.status,
      start_time: r.start_time ? new Date(r.start_time).toISOString() : "",
      booked_duration_minutes: r.booked_duration_minutes || 0,
      scheduled_end_time: r.scheduled_end_time ? new Date(r.scheduled_end_time).toISOString() : "",
      rate_per_hour: Number(r.rate_per_hour || 0),
      tv_device_id: r.tv_device_id || "",
      updated_at: r.updated_at ? new Date(r.updated_at).toISOString() : ""
    }));

    return res.json({ ok: true, success: true, rooms });
  } catch (err) {
    return errorResponse(res, err.message);
  }
}

async function startSession(req, res, payload) {
  let client;
  try {
    client = await db.pool.connect();
    await client.query('BEGIN');
    const roomId = payload.room_id || req.query.room_id;
    const durationMinutes = parseInt(payload.duration_minutes || req.query.duration_minutes || 60, 10);
    const cashierName = payload.cashier_name || 'Kasir';
    const idempotencyKey = payload.idempotency_key || null;

    if (!roomId) throw new Error('room_id wajib diisi.');

    if (idempotencyKey) {
      const existing = await client.query('SELECT * FROM room_sessions WHERE idempotency_key = $1', [idempotencyKey]);
      if (existing.rowCount > 0) {
        await client.query('COMMIT');
        return successResponse(res, { message: 'Sesi sudah dimulai (idempotent).', session: existing.rows[0] });
      }
    }

    const roomRes = await client.query('SELECT * FROM rooms WHERE room_id = $1 FOR UPDATE', [roomId]);
    if (roomRes.rowCount === 0) throw new Error('Room tidak ditemukan.');

    const room = roomRes.rows[0];
    if (room.status !== 'available' && room.status !== 'paid_waiting_start') {
      throw new Error(`Room ${roomId} sedang tidak tersedia (status: ${room.status}).`);
    }

    const startTime = new Date();
    const scheduledEndTime = new Date(startTime.getTime() + durationMinutes * 60 * 1000);

    await client.query(`
      UPDATE rooms 
      SET status = 'occupied',
          start_time = $1,
          booked_duration_minutes = $2,
          scheduled_end_time = $3,
          updated_at = CURRENT_TIMESTAMP
      WHERE room_id = $4
    `, [startTime, durationMinutes, scheduledEndTime, roomId]);

    const sessionId = `${roomId}-${startTime.toISOString().replace(/[-:T.Z]/g, '')}`;
    await client.query(`
      INSERT INTO room_sessions (
        session_id, room_id, room_name, booking_mode, status, 
        start_time, scheduled_end_time, booked_duration_minutes, 
        billable_room_minutes, rate_per_hour, cashier_name, idempotency_key
      ) VALUES ($1, $2, $3, 'regular', 'active', $4, $5, $6, $7, $8, $9, $10)
    `, [sessionId, roomId, room.room_name, startTime, scheduledEndTime, durationMinutes, durationMinutes, room.rate_per_hour, cashierName, idempotencyKey]);

    await client.query(`
      INSERT INTO sync_outbox (entity_type, entity_id, action, payload_json)
      VALUES ('room_sessions', $1, 'INSERT', $2)
      ON CONFLICT DO NOTHING
    `, [sessionId, JSON.stringify({ session_id: sessionId, room_id: roomId, status: 'active', start_time: startTime })]);

    await client.query('COMMIT');
    return successResponse(res, {
      message: `Sesi ${room.room_name} berhasil dimulai.`,
      session: {
        session_id: sessionId,
        room_id: roomId,
        room_name: room.room_name,
        status: 'occupied',
        start_time: startTime.toISOString(),
        scheduled_end_time: scheduledEndTime.toISOString(),
        booked_duration_minutes: durationMinutes,
      }
    });
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    return errorResponse(res, err.message);
  } finally {
    if (client) client.release();
  }
}

async function extendSession(req, res, payload) {
  let client;
  try {
    client = await db.pool.connect();
    await client.query('BEGIN');
    const roomId = payload.room_id;
    const addMinutes = parseInt(payload.add_minutes || 0, 10);
    const cashierName = payload.cashier_name || 'Kasir';
    const note = payload.note || '';

    if (!roomId) throw new Error('room_id wajib diisi.');
    if (addMinutes <= 0) throw new Error('add_minutes harus lebih besar dari 0.');

    const roomRes = await client.query('SELECT * FROM rooms WHERE room_id = $1 FOR UPDATE', [roomId]);
    if (roomRes.rowCount === 0) throw new Error('Room tidak ditemukan.');
    const room = roomRes.rows[0];

    if (room.status !== 'occupied') throw new Error('Room tidak dalam sesi aktif.');

    const oldDuration = room.booked_duration_minutes || 0;
    const newDuration = oldDuration + addMinutes;
    const startTime = new Date(room.start_time);
    const oldEndTime = new Date(room.scheduled_end_time);
    const newEndTime = new Date(startTime.getTime() + newDuration * 60 * 1000);

    await client.query(`
      UPDATE rooms 
      SET booked_duration_minutes = $1,
          scheduled_end_time = $2,
          updated_at = CURRENT_TIMESTAMP
      WHERE room_id = $3
    `, [newDuration, newEndTime, roomId]);

    const logId = `RTL-${Date.now()}`;
    await client.query(`
      INSERT INTO room_time_logs (
        log_id, action_type, room_id, room_name,
        old_booked_duration_minutes, new_booked_duration_minutes,
        old_scheduled_end_time, new_scheduled_end_time,
        add_minutes, cashier_name, note
      ) VALUES ($1, 'extend_session', $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `, [logId, roomId, room.room_name, oldDuration, newDuration, oldEndTime, newEndTime, addMinutes, cashierName, note]);

    await client.query('COMMIT');
    return successResponse(res, {
      message: `Durasi room ${room.room_name} berhasil ditambah ${addMinutes} menit.`,
      room: {
        room_id: roomId,
        booked_duration_minutes: newDuration,
        scheduled_end_time: newEndTime.toISOString()
      }
    });
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    return errorResponse(res, err.message);
  } finally {
    if (client) client.release();
  }
}

async function deductStockForFnbOrders(client, fnbOrderIds, transactionId, cashierName) {
  if (!fnbOrderIds || fnbOrderIds.length === 0) return { movements: [] };

  const itemsRes = await client.query(`
    SELECT foi.menu_id, foi.quantity, m.stock_tracking, m.stock_item_id, m.stock_qty_per_unit, m.menu_name
    FROM fnb_order_items foi
    JOIN menu m ON foi.menu_id = m.menu_id
    WHERE foi.order_id = ANY($1)
  `, [fnbOrderIds]);

  const movements = [];

  for (const item of itemsRes.rows) {
    const orderQty = Number(item.quantity || 1);

    if (item.stock_tracking === 'yes' && item.stock_item_id) {
      const invRes = await client.query('SELECT * FROM inventory WHERE stock_item_id = $1 FOR UPDATE', [item.stock_item_id]);
      if (invRes.rowCount > 0) {
        const inv = invRes.rows[0];
        const qtyDeduct = orderQty * Number(item.stock_qty_per_unit || 1);
        const stockBefore = Number(inv.stock_qty || 0);
        const stockAfter = stockBefore - qtyDeduct;

        await client.query('UPDATE inventory SET stock_qty = $1, updated_at = CURRENT_TIMESTAMP WHERE stock_item_id = $2', [stockAfter, item.stock_item_id]);

        const movementId = `MOV-${transactionId}-${item.stock_item_id}`;
        await client.query(`
          INSERT INTO stock_movements (
            movement_id, stock_item_id, stock_item_name, movement_type,
            reference_type, reference_id, qty_change, stock_before, stock_after, note, cashier_name, idempotency_key
          ) VALUES ($1, $2, $3, 'out', 'transaction', $4, $5, $6, $7, $8, $9, $1)
          ON CONFLICT (idempotency_key) DO NOTHING
        `, [movementId, item.stock_item_id, inv.stock_item_name, transactionId, -qtyDeduct, stockBefore, stockAfter, `F&B Checkout Menu: ${item.menu_name}`, cashierName]);

        movements.push({ stock_item_id: item.stock_item_id, stock_before: stockBefore, stock_after: stockAfter });
      }
    }

    const recipeRes = await client.query('SELECT * FROM recipe WHERE menu_id = $1', [item.menu_id]);
    for (const r of recipeRes.rows) {
      const recipeInvRes = await client.query('SELECT * FROM inventory WHERE stock_item_id = $1 FOR UPDATE', [r.item_id]);
      if (recipeInvRes.rowCount > 0) {
        const rInv = recipeInvRes.rows[0];
        const recipeDeduct = orderQty * Number(r.qty_used || 1);
        const rStockBefore = Number(rInv.stock_qty || 0);
        const rStockAfter = rStockBefore - recipeDeduct;

        await client.query('UPDATE inventory SET stock_qty = $1, updated_at = CURRENT_TIMESTAMP WHERE stock_item_id = $2', [rStockAfter, r.item_id]);

        const rMovementId = `MOV-${transactionId}-RECIPE-${r.item_id}`;
        await client.query(`
          INSERT INTO stock_movements (
            movement_id, stock_item_id, stock_item_name, movement_type,
            reference_type, reference_id, qty_change, stock_before, stock_after, note, cashier_name, idempotency_key
          ) VALUES ($1, $2, $3, 'out', 'transaction', $4, $5, $6, $7, $8, $9, $1)
          ON CONFLICT (idempotency_key) DO NOTHING
        `, [rMovementId, r.item_id, rInv.stock_item_name, transactionId, -recipeDeduct, rStockBefore, rStockAfter, `Recipe BOM for Menu: ${item.menu_name}`, cashierName]);

        movements.push({ stock_item_id: r.item_id, stock_before: rStockBefore, stock_after: rStockAfter });
      }
    }
  }

  return { movements };
}

async function closeSession(req, res, payload) {
  let client;
  try {
    client = await db.pool.connect();
    await client.query('BEGIN');
    const roomId = payload.room_id;
    const cashierName = payload.cashier_name || 'Kasir';
    const idempotencyKey = payload.idempotency_key || null;

    if (!roomId) throw new Error('room_id wajib diisi.');

    if (idempotencyKey) {
      const existingTx = await client.query('SELECT * FROM transactions WHERE idempotency_key = $1', [idempotencyKey]);
      if (existingTx.rowCount > 0) {
        await client.query('COMMIT');
        return successResponse(res, { message: 'Penutupan sesi sudah diproses (idempotent).', transaction: existingTx.rows[0] });
      }
    }

    const roomRes = await client.query('SELECT * FROM rooms WHERE room_id = $1 FOR UPDATE', [roomId]);
    if (roomRes.rowCount === 0) throw new Error('Ruangan tidak ditemukan.');
    const room = roomRes.rows[0];

    if (room.status !== 'occupied') throw new Error('Ruangan belum sedang digunakan.');

    const endTime = new Date();
    const startTime = new Date(room.start_time);
    const durationMinutes = room.booked_duration_minutes || Math.ceil((endTime - startTime) / (60 * 1000));
    const ratePerHour = Number(room.rate_per_hour || 0);
    const roomTotal = Math.ceil((durationMinutes / 60) * ratePerHour);

    const fnbRes = await client.query(`
      SELECT order_id, order_total FROM fnb_orders 
      WHERE room_id = $1 AND order_status = 'open'
    `, [roomId]);

    let fnbTotal = 0;
    const fnbOrderIds = fnbRes.rows.map(r => r.order_id);
    fnbRes.rows.forEach(r => { fnbTotal += Number(r.order_total || 0); });

    const transactionId = `TRX-${Date.now()}`;
    if (fnbOrderIds.length > 0) {
      await client.query(`
        UPDATE fnb_orders SET order_status = 'billed', updated_at = CURRENT_TIMESTAMP
        WHERE order_id = ANY($1)
      `, [fnbOrderIds]);

      await deductStockForFnbOrders(client, fnbOrderIds, transactionId, cashierName);
    }

    const lcRes = await client.query(`
      SELECT rate FROM lc_work_logs WHERE room_id = $1 AND closed_at IS NULL AND status != 'cancelled'
    `, [roomId]);
    let lcTotal = 0;
    lcRes.rows.forEach(r => { lcTotal += Number(r.rate || 0); });

    await client.query(`
      UPDATE lc_work_logs SET closed_at = CURRENT_TIMESTAMP, status = 'closed' 
      WHERE room_id = $1 AND closed_at IS NULL AND status != 'cancelled'
    `, [roomId]);

    const grandTotal = roomTotal + fnbTotal + lcTotal;
    const opDate = getOperationalDate(endTime);

    // CRITICAL: Postpaid flow produces payment_status = 'unpaid'
    await client.query(`
      INSERT INTO transactions (
        transaction_id, room_id, room_name, start_time, end_time,
        duration_minutes, rate_per_hour, room_total, fnb_total, lc_total,
        grand_total, fnb_order_ids, payment_method, payment_status, cashier_name, operational_date, idempotency_key
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, '', 'unpaid', $13, $14, $15)
    `, [transactionId, roomId, room.room_name, startTime, endTime, durationMinutes, ratePerHour, roomTotal, fnbTotal, lcTotal, grandTotal, fnbOrderIds.join(','), cashierName, opDate, idempotencyKey]);

    await client.query(`
      UPDATE rooms 
      SET status = 'cleaning',
          start_time = NULL,
          booked_duration_minutes = 0,
          scheduled_end_time = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE room_id = $1
    `, [roomId]);

    await client.query(`
      INSERT INTO sync_outbox (entity_type, entity_id, action, payload_json)
      VALUES ('transactions', $1, 'INSERT', $2)
      ON CONFLICT DO NOTHING
    `, [transactionId, JSON.stringify({ transaction_id: transactionId, room_id: roomId, grand_total: grandTotal, payment_status: 'unpaid', operational_date: opDate })]);

    await client.query('COMMIT');
    return successResponse(res, {
      message: `Sesi room ${room.room_name} berhasil ditutup. Tagihan dibuat (unpaid).`,
      transaction: {
        transaction_id: transactionId,
        room_id: roomId,
        room_name: room.room_name,
        room_total: roomTotal,
        fnb_total: fnbTotal,
        lc_total: lcTotal,
        grand_total: grandTotal,
        payment_status: 'unpaid',
        payment_method: ''
      }
    });
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    return errorResponse(res, err.message);
  } finally {
    if (client) client.release();
  }
}

async function completeCleaning(req, res, payload) {
  try {
    const roomId = payload.room_id;
    if (!roomId) throw new Error('room_id wajib diisi.');

    await db.query(`
      UPDATE rooms SET status = 'available', updated_at = CURRENT_TIMESTAMP WHERE room_id = $1
    `, [roomId]);

    return successResponse(res, { message: `Cleaning room ${roomId} selesai. Status kembali available.` });
  } catch (err) {
    return errorResponse(res, err.message);
  }
}

module.exports = {
  getRooms,
  startSession,
  extendSession,
  closeSession,
  completeCleaning,
};
