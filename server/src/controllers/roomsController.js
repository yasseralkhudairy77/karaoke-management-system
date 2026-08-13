const db = require('../db');
const { successResponse, errorResponse } = require('../utils/response');
const { getOperationalDate } = require('../utils/operationalDate');

async function getRooms(req, res) {
  try {
    const result = await db.query(`
      SELECT 
        room_id,
        room_name,
        status,
        start_time,
        booked_duration_minutes,
        scheduled_end_time,
        rate_per_hour,
        tv_device_id,
        updated_at
      FROM rooms
      ORDER BY room_id ASC
    `);

    // Transform fields for 100% Apps Script legacy UI compatibility
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

    return res.json({ ok: true, rooms });
  } catch (err) {
    return errorResponse(res, err.message);
  }
}

async function startSession(req, res, payload) {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const roomId = payload.room_id || req.query.room_id;
    const durationMinutes = parseInt(payload.duration_minutes || req.query.duration_minutes || 60, 10);
    const cashierName = payload.cashier_name || 'Kasir';

    if (!roomId) throw new Error('room_id wajib diisi.');

    const roomRes = await client.query('SELECT * FROM rooms WHERE room_id = $1 FOR UPDATE', [roomId]);
    if (roomRes.rowCount === 0) throw new Error('Room tidak ditemukan.');

    const room = roomRes.rows[0];
    if (room.status !== 'available' && room.status !== 'paid_waiting_start') {
      throw new Error(`Room ${roomId} sedang tidak tersedia (status: ${room.status}).`);
    }

    const startTime = new Date();
    const scheduledEndTime = new Date(startTime.getTime() + durationMinutes * 60 * 1000);

    // Update rooms table
    await client.query(`
      UPDATE rooms 
      SET status = 'occupied',
          start_time = $1,
          booked_duration_minutes = $2,
          scheduled_end_time = $3,
          updated_at = CURRENT_TIMESTAMP
      WHERE room_id = $4
    `, [startTime, durationMinutes, scheduledEndTime, roomId]);

    // Create record in room_sessions
    const sessionId = `${roomId}-${startTime.toISOString().replace(/[-:T.Z]/g, '')}`;
    await client.query(`
      INSERT INTO room_sessions (
        session_id, room_id, room_name, booking_mode, status, 
        start_time, scheduled_end_time, booked_duration_minutes, 
        billable_room_minutes, rate_per_hour, cashier_name
      ) VALUES ($1, $2, $3, 'regular', 'active', $4, $5, $6, $7, $8, $9)
    `, [sessionId, roomId, room.room_name, startTime, scheduledEndTime, durationMinutes, durationMinutes, room.rate_per_hour, cashierName]);

    // Add to sync outbox
    await client.query(`
      INSERT INTO sync_outbox (entity_type, entity_id, action, payload_json)
      VALUES ('room_sessions', $1, 'INSERT', $2)
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
    await client.query('ROLLBACK');
    return errorResponse(res, err.message);
  } finally {
    client.release();
  }
}

async function extendSession(req, res, payload) {
  const client = await db.pool.connect();
  try {
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

    // Update room
    await client.query(`
      UPDATE rooms 
      SET booked_duration_minutes = $1,
          scheduled_end_time = $2,
          updated_at = CURRENT_TIMESTAMP
      WHERE room_id = $3
    `, [newDuration, newEndTime, roomId]);

    // Insert room_time_logs
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
    await client.query('ROLLBACK');
    return errorResponse(res, err.message);
  } finally {
    client.release();
  }
}

async function closeSession(req, res, payload) {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const roomId = payload.room_id;
    const cashierName = payload.cashier_name || 'Kasir';
    const paymentMethod = payload.payment_method || 'cash';

    if (!roomId) throw new Error('room_id wajib diisi.');

    const roomRes = await client.query('SELECT * FROM rooms WHERE room_id = $1 FOR UPDATE', [roomId]);
    if (roomRes.rowCount === 0) throw new Error('Room tidak ditemukan.');
    const room = roomRes.rows[0];

    if (room.status !== 'occupied') throw new Error('Room tidak dalam status occupied.');

    const endTime = new Date();
    const startTime = new Date(room.start_time);
    const durationMinutes = room.booked_duration_minutes || Math.ceil((endTime - startTime) / (60 * 1000));
    const ratePerHour = Number(room.rate_per_hour || 0);
    const roomTotal = Math.ceil((durationMinutes / 60) * ratePerHour);

    // Fetch open F&B orders for room
    const fnbRes = await client.query(`
      SELECT order_id, order_total FROM fnb_orders 
      WHERE room_id = $1 AND order_status = 'open'
    `, [roomId]);

    let fnbTotal = 0;
    const fnbOrderIds = fnbRes.rows.map(r => r.order_id);
    fnbRes.rows.forEach(r => { fnbTotal += Number(r.order_total || 0); });

    // Mark open F&B orders as billed
    if (fnbOrderIds.length > 0) {
      await client.query(`
        UPDATE fnb_orders SET order_status = 'billed', updated_at = CURRENT_TIMESTAMP
        WHERE order_id = ANY($1)
      `, [fnbOrderIds]);
    }

    // Fetch active LC work logs for room
    const lcRes = await client.query(`
      SELECT rate FROM lc_work_logs WHERE room_id = $1 AND closed_at IS NULL
    `, [roomId]);
    let lcTotal = 0;
    lcRes.rows.forEach(r => { lcTotal += Number(r.rate || 0); });

    // Close LC work logs
    await client.query(`
      UPDATE lc_work_logs SET closed_at = CURRENT_TIMESTAMP WHERE room_id = $1 AND closed_at IS NULL
    `, [roomId]);

    const grandTotal = roomTotal + fnbTotal + lcTotal;
    const opDate = getOperationalDate(endTime);
    const transactionId = `TRX-${Date.now()}`;

    // Insert transaction
    await client.query(`
      INSERT INTO transactions (
        transaction_id, room_id, room_name, start_time, end_time,
        duration_minutes, rate_per_hour, room_total, fnb_total, lc_total,
        grand_total, fnb_order_ids, payment_method, payment_status, cashier_name, operational_date
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'paid', $14, $15)
    `, [transactionId, roomId, room.room_name, startTime, endTime, durationMinutes, ratePerHour, roomTotal, fnbTotal, lcTotal, grandTotal, fnbOrderIds.join(','), paymentMethod, cashierName, opDate]);

    // Reset room status to available / cleaning
    await client.query(`
      UPDATE rooms 
      SET status = 'cleaning',
          start_time = NULL,
          booked_duration_minutes = 0,
          scheduled_end_time = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE room_id = $1
    `, [roomId]);

    // Add to sync outbox
    await client.query(`
      INSERT INTO sync_outbox (entity_type, entity_id, action, payload_json)
      VALUES ('transactions', $1, 'INSERT', $2)
    `, [transactionId, JSON.stringify({ transaction_id: transactionId, room_id: roomId, grand_total: grandTotal, operational_date: opDate })]);

    await client.query('COMMIT');
    return successResponse(res, {
      message: `Sesi room ${room.room_name} berhasil ditutup.`,
      transaction: {
        transaction_id: transactionId,
        room_id: roomId,
        room_name: room.room_name,
        room_total: roomTotal,
        fnb_total: fnbTotal,
        lc_total: lcTotal,
        grand_total: grandTotal,
        payment_status: 'paid',
        payment_method: paymentMethod
      }
    });
  } catch (err) {
    await client.query('ROLLBACK');
    return errorResponse(res, err.message);
  } finally {
    client.release();
  }
}

async function completeCleaning(req, res, payload) {
  try {
    const roomId = payload.room_id;
    if (!roomId) throw new Error('room_id wajib diisi.');

    await db.query(`
      UPDATE rooms 
      SET status = 'available', updated_at = CURRENT_TIMESTAMP
      WHERE room_id = $1
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
