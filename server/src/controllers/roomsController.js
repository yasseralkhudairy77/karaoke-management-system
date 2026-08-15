const db = require('../db');
const { successResponse, errorResponse } = require('../utils/response');
const { getOperationalDate } = require('../utils/operationalDate');

function parseSessionPackageMeta(session) {
  const note = String(session?.note || '');
  const packageId = (note.match(/package_id=([^|]+)/)?.[1] || '').trim();
  const packageName = (note.match(/package_name=([^|]+)/)?.[1] || '').trim();
  const packageTotal = Number((note.match(/package_total=([0-9.]+)/)?.[1] || '0').trim()) || 0;

  return { packageId, packageName, packageTotal };
}

function stripSessionPackageMeta(note) {
  return String(note || '')
    .split('|')
    .map(part => part.trim())
    .filter(part => part && !/^package_(id|name|total)=/i.test(part))
    .join(' | ');
}

function buildSessionPackageNote(baseNote, pkg = null, reason = '') {
  const parts = [];
  const cleanBase = stripSessionPackageMeta(baseNote);
  if (cleanBase) parts.push(cleanBase);
  if (pkg) {
    parts.push(`package_id=${pkg.package_id}`);
    parts.push(`package_name=${pkg.package_name}`);
    parts.push(`package_total=${Number(pkg.selling_price || 0)}`);
  }
  if (reason) {
    parts.push(`package_change_reason=${String(reason).replace(/\|/g, '/').trim()}`);
  }
  return parts.join(' | ');
}

async function getRooms(req, res) {
  try {
    const result = await db.query(`
      SELECT 
        room_id, room_name, status, start_time, 
        booked_duration_minutes, scheduled_end_time, rate_per_hour, 
        tv_device_id, updated_at
      FROM rooms
      WHERE room_id <> 'FNB-GENERAL'
      ORDER BY room_id ASC
    `);

    const activeLcRes = await db.query(`
      SELECT room_id, lc_id, lc_name, duration_minutes, rate_per_hour, rate
      FROM lc_work_logs
      WHERE status = 'active' AND closed_at IS NULL
      ORDER BY created_at ASC
    `);

    const openFnbOrdersRes = await db.query(`
      SELECT *
      FROM fnb_orders
      WHERE order_status = 'open'
      ORDER BY created_at ASC
    `);

    const openFnbOrders = [];
    for (const order of openFnbOrdersRes.rows) {
      const itemsRes = await db.query(`
        SELECT *
        FROM fnb_order_items
        WHERE order_id = $1
        ORDER BY created_at ASC
      `, [order.order_id]);

      openFnbOrders.push({
        order_id: order.order_id,
        room_id: order.room_id,
        room_name: order.room_name,
        room_start_time: order.room_start_time ? new Date(order.room_start_time).toISOString() : "",
        order_status: order.order_status,
        order_total: Number(order.order_total || 0),
        cashier_name: order.cashier_name || "",
        note: order.note || "",
        customer_name: order.customer_name || "",
        general_bill_id: order.general_bill_id || "",
        created_at: order.created_at ? new Date(order.created_at).toISOString() : "",
        updated_at: order.updated_at ? new Date(order.updated_at).toISOString() : "",
        items: itemsRes.rows.map(item => ({
          order_item_id: item.order_item_id,
          order_id: item.order_id,
          menu_id: item.menu_id,
          menu_name: item.menu_name,
          category: item.category,
          price: Number(item.price || 0),
          quantity: Number(item.quantity || 0),
          subtotal: Number(item.subtotal || 0),
          created_at: item.created_at ? new Date(item.created_at).toISOString() : ""
        }))
      });
    }

    const activeLcsByRoom = new Map();
    for (const row of activeLcRes.rows) {
      const roomId = row.room_id;
      if (!activeLcsByRoom.has(roomId)) activeLcsByRoom.set(roomId, new Map());
      activeLcsByRoom.get(roomId).set(row.lc_id, {
        lc_id: row.lc_id,
        lc_name: row.lc_name,
        duration_minutes: Number(row.duration_minutes || 0),
        rate_per_hour: Number(row.rate_per_hour || 0),
        rate_per_room: Number(row.rate_per_hour || 0),
        rate: Number(row.rate || 0)
      });
    }

    const activeSessionsRes = await db.query(`
      SELECT session_id, room_id, booking_mode, status, note, booked_duration_minutes, package_included_minutes
      FROM room_sessions
      WHERE status IN ('starting', 'active')
      ORDER BY created_at DESC
    `);

    const sessionByRoom = new Map();
    for (const session of activeSessionsRes.rows) {
      if (!sessionByRoom.has(session.room_id)) {
        sessionByRoom.set(session.room_id, session);
      }
    }

    const rooms = result.rows.map(r => {
      const lcAssignments = Array.from((activeLcsByRoom.get(r.room_id) || new Map()).values());
      const lcIds = lcAssignments.map(lc => lc.lc_id).filter(Boolean).join(',');
      const roomOpenFnbOrders = openFnbOrders.filter(order => {
        if (order.order_status !== 'open') return false;
        if (order.room_id && order.room_id === r.room_id) return true;
        return Boolean(order.room_name && r.room_name && order.room_name === r.room_name);
      });

      const activeSession = sessionByRoom.get(r.room_id);
      let bookingMode = 'regular';
      let packageId = '';
      let packageName = '';
      let packageTotal = 0;

      if (r.status !== 'available' && r.status !== 'cleaning' && activeSession && activeSession.booking_mode === 'package') {
        const pkgMeta = parseSessionPackageMeta(activeSession);
        bookingMode = 'package';
        packageId = pkgMeta.packageId;
        packageName = pkgMeta.packageName;
        packageTotal = pkgMeta.packageTotal;
      }

      return {
        room_id: r.room_id,
        room_name: r.room_name,
        status: r.status,
        booking_mode: bookingMode,
        package_id: packageId,
        package_name: packageName,
        package_total: packageTotal,
        start_time: r.start_time ? new Date(r.start_time).toISOString() : "",
        booked_duration_minutes: r.booked_duration_minutes || 0,
        scheduled_end_time: r.scheduled_end_time ? new Date(r.scheduled_end_time).toISOString() : "",
        rate_per_hour: Number(r.rate_per_hour || 0),
        tv_device_id: r.tv_device_id || "",
        updated_at: r.updated_at ? new Date(r.updated_at).toISOString() : "",
        open_fnb_orders: roomOpenFnbOrders,
        open_fnb_total: roomOpenFnbOrders.reduce((total, order) => total + Number(order.order_total || 0), 0),
        lc_ids: lcIds,
        lc_companion_ids: lcIds,
        lc_assignments: JSON.stringify(lcAssignments)
      };
    });

    return res.json({ ok: true, success: true, rooms });
  } catch (err) {
    if (err.message && err.message.includes('DATABASE_OFFLINE')) throw err;
    return errorResponse(res, err.message);
  }
}

async function startSession(req, res, payload) {
  let client;
  try {
    client = await db.pool.connect();
    await client.query('BEGIN');
    const roomId = payload.room_id || req.query.room_id;
    let durationMinutes = parseInt(payload.duration_minutes || req.query.duration_minutes || 60, 10);
    const packageId = payload.package_id || req.query.package_id || '';
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

    let bookingMode = 'regular';
    let billableMinutes = durationMinutes;
    let packageIncludedMinutes = 0;
    let note = payload.customer_name ? `customer_name=${payload.customer_name}` : '';

    if (packageId) {
      const pkgRes = await client.query('SELECT * FROM package_master WHERE package_id = $1 AND status = $2', [packageId, 'active']);
      if (pkgRes.rowCount > 0) {
        const pkg = pkgRes.rows[0];
        bookingMode = 'package';
        durationMinutes = Number(pkg.duration_minutes || durationMinutes);
        billableMinutes = 0;
        packageIncludedMinutes = durationMinutes;
        note = [note, `package_id=${pkg.package_id}`, `package_name=${pkg.package_name}`, `package_total=${Number(pkg.selling_price || 0)}`].filter(Boolean).join(' | ');
      }
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
        package_included_minutes, billable_room_minutes, rate_per_hour, cashier_name, idempotency_key, note
      ) VALUES ($1, $2, $3, $4, 'active', $5, $6, $7, $8, $9, $10, $11, $12, $13)
    `, [sessionId, roomId, room.room_name, bookingMode, startTime, scheduledEndTime, durationMinutes, packageIncludedMinutes, billableMinutes, room.rate_per_hour, cashierName, idempotencyKey, note]);

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

async function prepareRoomSession(req, res, payload) {
  let client;
  try {
    client = await db.pool.connect();
    await client.query('BEGIN');

    const roomId = payload.room_id;
    const cashierName = payload.cashier_name || 'Kasir';
    const customerName = payload.customer_name || '';
    const packageId = payload.package_id || '';
    const idempotencyKey = payload.idempotency_key || null;
    let durationMinutes = parseInt(payload.duration_minutes || 0, 10);

    if (!roomId) throw new Error('room_id wajib diisi.');
    if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) throw new Error('duration_minutes wajib berupa angka positif.');

    if (idempotencyKey) {
      const existing = await client.query('SELECT * FROM room_sessions WHERE idempotency_key = $1', [idempotencyKey]);
      if (existing.rowCount > 0) {
        await client.query('COMMIT');
        return successResponse(res, { message: 'Booking room sudah pernah disiapkan.', session: existing.rows[0], idempotent_replay: true });
      }
    }

    const roomRes = await client.query('SELECT * FROM rooms WHERE room_id = $1 FOR UPDATE', [roomId]);
    if (roomRes.rowCount === 0) throw new Error('Ruangan tidak ditemukan.');
    const room = roomRes.rows[0];
    if (room.status !== 'available') throw new Error('Ruangan tidak tersedia untuk dibuat booking.');

    let bookingMode = 'regular';
    let billableMinutes = durationMinutes;
    let packageIncludedMinutes = 0;
    let note = customerName ? `customer_name=${customerName}` : '';

    if (packageId) {
      const pkgRes = await client.query('SELECT * FROM package_master WHERE package_id = $1 AND status = $2', [packageId, 'active']);
      if (pkgRes.rowCount === 0) throw new Error('Paket tidak ditemukan atau tidak aktif.');
      const pkg = pkgRes.rows[0];
      bookingMode = 'package';
      durationMinutes = Number(pkg.duration_minutes || durationMinutes);
      billableMinutes = 0;
      packageIncludedMinutes = durationMinutes;
      note = [note, `package_id=${pkg.package_id}`, `package_name=${pkg.package_name}`, `package_total=${Number(pkg.selling_price || 0)}`].filter(Boolean).join(' | ');
    }

    const now = new Date();
    const scheduledEndTime = new Date(now.getTime() + durationMinutes * 60 * 1000);
    const sessionId = `${roomId}-${now.toISOString().replace(/[-:T.Z]/g, '')}`;

    await client.query(`
      INSERT INTO room_sessions (
        session_id, room_id, room_name, booking_mode, status,
        start_time, scheduled_end_time, booked_duration_minutes,
        package_included_minutes, billable_room_minutes, rate_per_hour,
        cashier_name, idempotency_key, note
      ) VALUES ($1, $2, $3, $4, 'starting', $5, $6, $7, $8, $9, $10, $11, $12, $13)
    `, [sessionId, roomId, room.room_name, bookingMode, now, scheduledEndTime, durationMinutes, packageIncludedMinutes, billableMinutes, room.rate_per_hour, cashierName, idempotencyKey, note]);

    await client.query(`
      UPDATE rooms
      SET status = 'paid_waiting_start',
          start_time = NULL,
          booked_duration_minutes = $1,
          scheduled_end_time = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE room_id = $2
    `, [durationMinutes, roomId]);

    await client.query(`
      INSERT INTO sync_outbox (entity_type, entity_id, action, payload_json)
      VALUES ('room_sessions', $1, 'INSERT', $2)
      ON CONFLICT DO NOTHING
    `, [sessionId, JSON.stringify({ session_id: sessionId, room_id: roomId, status: 'starting', booking_mode: bookingMode })]);

    await client.query('COMMIT');
    return successResponse(res, {
      message: 'Booking room berhasil disimpan. Mulai sesi saat pelanggan sudah masuk room.',
      session: {
        session_id: sessionId,
        room_id: roomId,
        room_name: room.room_name,
        booking_mode: bookingMode,
        status: 'starting',
        booked_duration_minutes: durationMinutes,
        package_id: packageId
      }
    });
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    return errorResponse(res, err.message);
  } finally {
    if (client) client.release();
  }
}

async function payAndStartSession(req, res, payload) {
  let client;
  try {
    client = await db.pool.connect();
    await client.query('BEGIN');

    const roomId = payload.room_id;
    const paymentMethod = String(payload.payment_method || '').toLowerCase();
    const cashierName = payload.cashier_name || 'Kasir';
    const idempotencyKey = payload.idempotency_key || null;

    if (!roomId) throw new Error('room_id wajib diisi.');
    if (!['cash', 'qris', 'transfer'].includes(paymentMethod)) throw new Error('Metode pembayaran wajib cash, qris, atau transfer.');

    if (idempotencyKey) {
      const existingTx = await client.query('SELECT * FROM transactions WHERE idempotency_key = $1', [idempotencyKey]);
      if (existingTx.rowCount > 0) {
        await client.query('COMMIT');
        return successResponse(res, { message: 'Pembayaran awal sudah pernah diproses.', transaction: existingTx.rows[0], idempotent_replay: true });
      }
    }

    const roomRes = await client.query('SELECT * FROM rooms WHERE room_id = $1 FOR UPDATE', [roomId]);
    if (roomRes.rowCount === 0) throw new Error('Ruangan tidak ditemukan.');
    const room = roomRes.rows[0];
    if (room.status !== 'paid_waiting_start') throw new Error('Room tidak berstatus menunggu pembayaran.');

    const sessionRes = await client.query(`
      SELECT * FROM room_sessions
      WHERE room_id = $1 AND status = 'starting'
      ORDER BY created_at DESC
      LIMIT 1
    `, [roomId]);
    if (sessionRes.rowCount === 0) throw new Error('Sesi booking tidak ditemukan.');
    const session = sessionRes.rows[0];

    const now = new Date();
    const durationMinutes = Number(session.booked_duration_minutes || room.booked_duration_minutes || 0);
    const scheduledEndTime = new Date(now.getTime() + durationMinutes * 60 * 1000);
    const ratePerHour = Number(session.rate_per_hour || room.rate_per_hour || 0);
    let roomTotal = Math.ceil((Number(session.billable_room_minutes || durationMinutes) / 60) * ratePerHour);
    const packageMeta = parseSessionPackageMeta(session);
    let bookingMode = session.booking_mode || 'regular';
    let transactionPackageId = '';
    let transactionPackageName = '';
    let transactionPackageTotal = 0;

    if (session.booking_mode === 'package') {
      roomTotal = packageMeta.packageTotal;
      bookingMode = 'package';
      transactionPackageId = packageMeta.packageId;
      transactionPackageName = packageMeta.packageName;
      transactionPackageTotal = packageMeta.packageTotal;
    }

    const fnbRes = await client.query(`
      SELECT order_id, order_total FROM fnb_orders
      WHERE room_id = $1 AND order_status = 'open'
    `, [roomId]);
    const fnbOrderIds = fnbRes.rows.map(row => row.order_id);
    const fnbTotal = fnbRes.rows.reduce((total, row) => total + Number(row.order_total || 0), 0);

    const transactionId = `TRX-${Date.now()}`;
    if (fnbOrderIds.length > 0) {
      await client.query(`UPDATE fnb_orders SET order_status = 'billed', updated_at = CURRENT_TIMESTAMP WHERE order_id = ANY($1)`, [fnbOrderIds]);
      await deductStockForFnbOrders(client, fnbOrderIds, transactionId, cashierName);
    }

    const opDate = getOperationalDate(now);
    const grandTotal = roomTotal + fnbTotal;

    await client.query(`
      INSERT INTO transactions (
        transaction_id, room_id, room_name, start_time, end_time,
        duration_minutes, rate_per_hour, room_total, fnb_total, lc_total,
        grand_total, fnb_order_ids, payment_method, payment_status, cashier_name, operational_date, idempotency_key,
        booking_mode, package_id, package_name, package_total
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 0, $10, $11, $12, 'paid', $13, $14, $15, $16, $17, $18, $19)
    `, [transactionId, roomId, room.room_name, now, scheduledEndTime, durationMinutes, ratePerHour, roomTotal, fnbTotal, grandTotal, fnbOrderIds.join(','), paymentMethod, cashierName, opDate, idempotencyKey, bookingMode, transactionPackageId || null, transactionPackageName || null, transactionPackageTotal]);

    await client.query(`
      UPDATE room_sessions
      SET status = 'active', start_time = $1, scheduled_end_time = $2, updated_at = CURRENT_TIMESTAMP
      WHERE session_id = $3
    `, [now, scheduledEndTime, session.session_id]);

    await client.query(`
      UPDATE rooms
      SET status = 'paid_waiting_start',
          start_time = NULL,
          booked_duration_minutes = $1,
          scheduled_end_time = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE room_id = $2
    `, [durationMinutes, roomId]);

    await client.query(`
      INSERT INTO sync_outbox (entity_type, entity_id, action, payload_json)
      VALUES ('transactions', $1, 'INSERT', $2)
      ON CONFLICT DO NOTHING
    `, [transactionId, JSON.stringify({ transaction_id: transactionId, room_id: roomId, grand_total: grandTotal, payment_status: 'paid', operational_date: opDate })]);

    await client.query('COMMIT');
    return successResponse(res, {
      message: 'Pembayaran awal lunas. Room menunggu siap diaktifkan waiters.',
      transaction: {
        transaction_id: transactionId,
        room_id: roomId,
        room_name: room.room_name,
        room_total: roomTotal,
        fnb_total: fnbTotal,
        lc_total: 0,
        grand_total: grandTotal,
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

async function cancelBooking(req, res, payload) {
  let client;
  try {
    client = await db.pool.connect();
    await client.query('BEGIN');
    const roomId = payload.room_id;
    const reason = payload.reason || 'Booking dibatalkan';
    if (!roomId) throw new Error('room_id wajib diisi.');

    const roomRes = await client.query('SELECT * FROM rooms WHERE room_id = $1 FOR UPDATE', [roomId]);
    if (roomRes.rowCount === 0) throw new Error('Ruangan tidak ditemukan.');
    const room = roomRes.rows[0];
    if (!['paid_waiting_start', 'waiting_payment', 'booked'].includes(room.status)) {
      throw new Error('Hanya booking yang menunggu pembayaran yang bisa dibatalkan.');
    }

    await client.query(`
      UPDATE room_sessions
      SET status = 'voided', note = CONCAT(COALESCE(note, ''), $1), updated_at = CURRENT_TIMESTAMP
      WHERE room_id = $2 AND status = 'starting'
    `, [` | cancel_reason=${reason}`, roomId]);

    await client.query(`
      UPDATE fnb_orders
      SET order_status = 'cancelled', cancel_reason = $1, updated_at = CURRENT_TIMESTAMP
      WHERE room_id = $2 AND order_status = 'open'
    `, [reason, roomId]);

    await client.query(`
      UPDATE rooms
      SET status = 'available', start_time = NULL, booked_duration_minutes = 0, scheduled_end_time = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE room_id = $1
    `, [roomId]);

    await client.query('COMMIT');
    return successResponse(res, { message: `Booking ${room.room_name} berhasil dibatalkan.` });
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

async function updateActiveSessionPackage(req, res, payload) {
  let client;
  try {
    client = await db.pool.connect();
    await client.query('BEGIN');

    const roomId = payload.room_id || req.query.room_id || '';
    const packageId = String(payload.package_id || req.query.package_id || '').trim();
    const reason = String(payload.reason || payload.note || '').trim();
    const changedBy = payload.cashier_name || payload.changed_by || 'Kasir';

    if (!roomId) throw new Error('room_id wajib diisi.');
    if (!reason) throw new Error('Alasan ubah paket wajib diisi.');

    const roomRes = await client.query('SELECT * FROM rooms WHERE room_id = $1 FOR UPDATE', [roomId]);
    if (roomRes.rowCount === 0) throw new Error('Room tidak ditemukan.');
    const room = roomRes.rows[0];
    if (room.status !== 'occupied') throw new Error('Ubah paket hanya bisa untuk sesi room yang sedang berjalan.');

    const sessionRes = await client.query(`
      SELECT *
      FROM room_sessions
      WHERE room_id = $1 AND status IN ('starting', 'active')
      ORDER BY created_at DESC
      LIMIT 1
      FOR UPDATE
    `, [roomId]);
    if (sessionRes.rowCount === 0) throw new Error('Sesi aktif tidak ditemukan.');

    const session = sessionRes.rows[0];
    const oldMeta = parseSessionPackageMeta(session);
    const oldValue = {
      session_id: session.session_id,
      room_id: roomId,
      room_name: room.room_name,
      booking_mode: session.booking_mode || 'regular',
      package_id: oldMeta.packageId,
      package_name: oldMeta.packageName,
      package_total: oldMeta.packageTotal,
      note: session.note || ''
    };

    let nextBookingMode = 'regular';
    let nextNote = buildSessionPackageNote(session.note, null, reason);
    let nextPackage = null;
    let nextBillableMinutes = Number(session.booked_duration_minutes || room.booked_duration_minutes || 0);
    let nextIncludedMinutes = 0;

    if (packageId) {
      const pkgRes = await client.query('SELECT * FROM package_master WHERE package_id = $1 AND status = $2', [packageId, 'active']);
      if (pkgRes.rowCount === 0) throw new Error('Paket tidak ditemukan atau tidak aktif.');
      nextPackage = pkgRes.rows[0];
      nextBookingMode = 'package';
      nextNote = buildSessionPackageNote(session.note, nextPackage, reason);
      nextBillableMinutes = 0;
      nextIncludedMinutes = Number(session.booked_duration_minutes || room.booked_duration_minutes || nextPackage.duration_minutes || 0);
    }

    await client.query(`
      UPDATE room_sessions
      SET booking_mode = $1,
          package_included_minutes = $2,
          billable_room_minutes = $3,
          note = $4,
          updated_at = CURRENT_TIMESTAMP
      WHERE session_id = $5
    `, [nextBookingMode, nextIncludedMinutes, nextBillableMinutes, nextNote, session.session_id]);

    const newValue = {
      session_id: session.session_id,
      room_id: roomId,
      room_name: room.room_name,
      booking_mode: nextBookingMode,
      package_id: nextPackage?.package_id || '',
      package_name: nextPackage?.package_name || '',
      package_total: Number(nextPackage?.selling_price || 0),
      reason
    };

    await client.query(`
      INSERT INTO master_data_audit_logs (
        log_id, entity_type, entity_id, entity_name, action_type,
        old_value_json, new_value_json, changed_by, note, result
      ) VALUES ($1, 'room_session', $2, $3, 'package_change', $4, $5, $6, $7, 'success')
    `, [
      `MDA-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      session.session_id,
      room.room_name,
      oldValue,
      newValue,
      changedBy,
      reason
    ]);

    await client.query(`
      INSERT INTO sync_outbox (entity_type, entity_id, action, payload_json)
      VALUES ('room_sessions', $1, 'UPDATE', $2)
      ON CONFLICT (entity_type, entity_id, action) DO UPDATE
      SET payload_json = EXCLUDED.payload_json,
          status = 'pending',
          attempts = 0,
          last_attempt_at = NULL,
          error_message = NULL
    `, [session.session_id, JSON.stringify(newValue)]);

    await client.query('COMMIT');
    return successResponse(res, {
      message: nextBookingMode === 'package'
        ? `Paket sesi ${room.room_name} berhasil diubah ke ${nextPackage.package_name}.`
        : `Paket sesi ${room.room_name} berhasil diubah ke Tanpa Paket.`,
      room_id: roomId,
      session_id: session.session_id,
      booking_mode: nextBookingMode,
      package_id: nextPackage?.package_id || '',
      package_name: nextPackage?.package_name || '',
      package_total: Number(nextPackage?.selling_price || 0)
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
    let roomTotal = Math.ceil((durationMinutes / 60) * ratePerHour);
    let bookingMode = 'regular';
    let transactionPackageId = '';
    let transactionPackageName = '';
    let transactionPackageTotal = 0;

    const activeSessionRes = await client.query(`
      SELECT * FROM room_sessions
      WHERE room_id = $1 AND status IN ('starting', 'active')
      ORDER BY created_at DESC
      LIMIT 1
    `, [roomId]);
    if (activeSessionRes.rowCount > 0 && activeSessionRes.rows[0].booking_mode === 'package') {
      const packageMeta = parseSessionPackageMeta(activeSessionRes.rows[0]);
      roomTotal = packageMeta.packageTotal;
      bookingMode = 'package';
      transactionPackageId = packageMeta.packageId;
      transactionPackageName = packageMeta.packageName;
      transactionPackageTotal = packageMeta.packageTotal;
    }

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
      SELECT log_id, session_id, room_id, room_name, lc_id, lc_name, duration_minutes, rate_per_hour, rate, status, created_at
      FROM lc_work_logs
      WHERE room_id = $1 AND closed_at IS NULL AND status != 'cancelled'
      ORDER BY created_at ASC
    `, [roomId]);
    const uniqueLcRows = Array.from(lcRes.rows.reduce((map, row) => {
      if (!row.lc_id || map.has(row.lc_id)) return map;
      map.set(row.lc_id, row);
      return map;
    }, new Map()).values());
    let lcTotal = 0;
    uniqueLcRows.forEach(r => { lcTotal += Number(r.rate || 0); });
    const lcLogsForReceipt = uniqueLcRows.map(row => ({
      ...row,
      duration_minutes: Number(row.duration_minutes || 0),
      rate_per_hour: Number(row.rate_per_hour || 0),
      rate_per_room: Number(row.rate_per_hour || 0),
      rate: Number(row.rate || 0),
      created_at: row.created_at ? new Date(row.created_at).toISOString() : ''
    }));
    const lcDetails = {
      detail_available: lcLogsForReceipt.length > 0,
      lc_logs: lcLogsForReceipt,
      items: lcLogsForReceipt,
      item_total: lcLogsForReceipt.reduce((total, row) => total + Number(row.rate || 0), 0),
      billing_adjustment: 0,
      total: lcTotal
    };

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
        grand_total, fnb_order_ids, payment_method, payment_status, cashier_name, operational_date, idempotency_key,
        booking_mode, package_id, package_name, package_total
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, '', 'unpaid', $13, $14, $15, $16, $17, $18, $19)
    `, [transactionId, roomId, room.room_name, startTime, endTime, durationMinutes, ratePerHour, roomTotal, fnbTotal, lcTotal, grandTotal, fnbOrderIds.join(','), cashierName, opDate, idempotencyKey, bookingMode, transactionPackageId || null, transactionPackageName || null, transactionPackageTotal]);

    await client.query(`
      UPDATE rooms 
      SET status = 'cleaning',
          start_time = NULL,
          booked_duration_minutes = 0,
          scheduled_end_time = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE room_id = $1
    `, [roomId]);

    if (activeSessionRes.rowCount > 0) {
      await client.query(`
        UPDATE room_sessions
        SET status = 'closed', end_time = $1, closed_transaction_id = $2, updated_at = CURRENT_TIMESTAMP
        WHERE session_id = $3
      `, [endTime, transactionId, activeSessionRes.rows[0].session_id]);
    }

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
        payment_method: '',
        lc_details: lcDetails
      },
      lc_details: lcDetails
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

async function getTodayRoomTimeLogs(req, res) {
  try {
    const { period, start_date, end_date } = req.query;
    const { getOperationalDateRange } = require('../utils/operationalDate');
    const { startDate, endDate } = getOperationalDateRange(period, start_date, end_date);

    const params = [startDate, endDate];
    const filters = [`DATE(created_at AT TIME ZONE 'Asia/Jakarta') >= $1`, `DATE(created_at AT TIME ZONE 'Asia/Jakarta') <= $2`];
    if (req.query.room_id) {
      params.push(req.query.room_id);
      filters.push(`room_id = $${params.length}`);
    }
    if (req.query.action_type) {
      params.push(req.query.action_type);
      filters.push(`action_type = $${params.length}`);
    }

    const result = await db.query(`
      SELECT * FROM room_time_logs
      WHERE ${filters.join(' AND ')}
      ORDER BY created_at DESC
    `, params);

    return res.json({ ok: true, success: true, logs: result.rows, room_time_logs: result.rows });
  } catch (err) {
    return errorResponse(res, err.message);
  }
}

async function getRoomUsageReport(req, res) {
  try {
    const { getOperationalDateRange } = require('../utils/operationalDate');
    const { period, start_date, end_date } = req.query;
    const { startDate, endDate } = getOperationalDateRange(period, start_date, end_date);

    const result = await db.query(`
      SELECT
        room_id,
        room_name,
        COUNT(*) AS session_count,
        COALESCE(SUM(duration_minutes), 0) AS total_minutes,
        COALESCE(SUM(room_total), 0) AS room_revenue,
        COALESCE(SUM(fnb_total), 0) AS fnb_revenue,
        COALESCE(SUM(lc_total), 0) AS lc_revenue,
        COALESCE(SUM(grand_total), 0) AS grand_total
      FROM transactions
      WHERE operational_date >= $1 AND operational_date <= $2
      GROUP BY room_id, room_name
      ORDER BY room_name ASC
    `, [startDate, endDate]);

    const rooms = result.rows.map(row => ({
      room_id: row.room_id,
      room_name: row.room_name,
      session_count: Number(row.session_count || 0),
      total_minutes: Number(row.total_minutes || 0),
      total_hours: Number(row.total_minutes || 0) / 60,
      room_revenue: Number(row.room_revenue || 0),
      fnb_revenue: Number(row.fnb_revenue || 0),
      lc_revenue: Number(row.lc_revenue || 0),
      grand_total: Number(row.grand_total || 0)
    }));

    return res.json({ ok: true, success: true, rooms, report: rooms, operational_date_start: startDate, operational_date_end: endDate });
  } catch (err) {
    return errorResponse(res, err.message);
  }
}

async function activatePreparedSession(req, res, payload) {
  let client;
  try {
    client = await db.pool.connect();
    await client.query('BEGIN');
    const roomId = payload.room_id;
    if (!roomId) throw new Error('room_id wajib diisi.');

    const roomRes = await client.query('SELECT * FROM rooms WHERE room_id = $1 FOR UPDATE', [roomId]);
    if (roomRes.rowCount === 0) throw new Error('Ruangan tidak ditemukan.');
    const room = roomRes.rows[0];
    if (room.status !== 'paid_waiting_start') throw new Error('Room tidak dalam status menunggu mulai.');

    const sessionRes = await client.query(`
      SELECT * FROM room_sessions
      WHERE room_id = $1 AND status IN ('starting', 'active')
      ORDER BY created_at DESC
      LIMIT 1
    `, [roomId]);
    const durationMinutes = sessionRes.rowCount > 0
      ? Number(sessionRes.rows[0].booked_duration_minutes || room.booked_duration_minutes || 0)
      : Number(room.booked_duration_minutes || 0);

    const startTime = new Date();
    const scheduledEndTime = new Date(startTime.getTime() + durationMinutes * 60 * 1000);

    await client.query(`
      UPDATE rooms
      SET status = 'occupied', start_time = $1, scheduled_end_time = $2, updated_at = CURRENT_TIMESTAMP
      WHERE room_id = $3
    `, [startTime, scheduledEndTime, roomId]);

    if (sessionRes.rowCount > 0) {
      await client.query(`
        UPDATE room_sessions
        SET start_time = $1, scheduled_end_time = $2, updated_at = CURRENT_TIMESTAMP
        WHERE session_id = $3
      `, [startTime, scheduledEndTime, sessionRes.rows[0].session_id]);
    }

    await client.query('COMMIT');
    return successResponse(res, {
      message: `Sesi ${room.room_name} berhasil dimulai.`,
      room: { room_id: roomId, status: 'occupied', start_time: startTime.toISOString(), scheduled_end_time: scheduledEndTime.toISOString() }
    });
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    return errorResponse(res, err.message);
  } finally {
    if (client) client.release();
  }
}

async function getExpiredRoomRecoveryList(req, res) {
  try {
    const now = new Date();
    const graceMinutes = Math.max(0, Number(req.query.grace_minutes || req.query.graceMinutes || 0));
    const cutoff = new Date(now.getTime() - graceMinutes * 60 * 1000);
    const result = await db.query(`
      SELECT room_id, room_name, status, start_time, scheduled_end_time, booked_duration_minutes
      FROM rooms
      WHERE status = 'occupied' AND scheduled_end_time IS NOT NULL AND scheduled_end_time < $1
      ORDER BY scheduled_end_time ASC
    `, [cutoff]);

    const rooms = result.rows.map(row => ({
      ...row,
      expired_minutes: row.scheduled_end_time ? Math.max(0, Math.floor((now - row.scheduled_end_time) / 60000)) : 0,
      start_time: row.start_time ? row.start_time.toISOString() : '',
      scheduled_end_time: row.scheduled_end_time ? row.scheduled_end_time.toISOString() : ''
    }));

    const totalRes = await db.query(`
      SELECT COUNT(*) AS total
      FROM rooms
      WHERE room_id <> 'FNB-GENERAL'
    `);

    return successResponse(res, {
      candidates: rooms,
      rooms,
      recovery_list: rooms,
      expired_count: rooms.length,
      invalid_count: 0,
      total_rooms_checked: Number(totalRes.rows[0]?.total || 0)
    });
  } catch (err) {
    return errorResponse(res, err.message);
  }
}

async function recoverExpiredRoomSession(req, res, payload) {
  let client;
  try {
    client = await db.pool.connect();
    await client.query('BEGIN');
    const roomId = payload.room_id;
    const confirm = payload.confirm || '';
    const reason = payload.reason || 'Manual expired room recovery';
    const actor = payload.actor || payload.cashier_name || 'Operator';

    if (!roomId) throw new Error('room_id wajib diisi.');
    if (confirm !== 'RECOVER') throw new Error('Ketik RECOVER untuk memulihkan room.');

    const roomRes = await client.query('SELECT * FROM rooms WHERE room_id = $1 FOR UPDATE', [roomId]);
    if (roomRes.rowCount === 0) throw new Error('Ruangan tidak ditemukan.');
    const room = roomRes.rows[0];

    await client.query(`
      UPDATE rooms
      SET status = 'available', start_time = NULL, booked_duration_minutes = 0, scheduled_end_time = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE room_id = $1
    `, [roomId]);

    const logId = `RRL-${Date.now()}`;
    await client.query(`
      INSERT INTO room_recovery_logs (log_id, room_id, room_name, session_id, issue_type, expired_minutes, action, reason, actor, result)
      VALUES ($1, $2, $3, $4, 'expired_room', $5, 'recover', $6, $7, 'success')
    `, [logId, roomId, room.room_name, payload.session_id || null, 0, reason, actor]);

    await client.query('COMMIT');
    return successResponse(res, { message: `Room ${room.room_name} berhasil dipulihkan.`, log_id: logId });
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    return errorResponse(res, err.message);
  } finally {
    if (client) client.release();
  }
}

async function correctActiveRoomDuration(req, res, payload) {
  let client;
  try {
    client = await db.pool.connect();
    await client.query('BEGIN');
    const roomId = payload.room_id;
    const newDuration = Number(payload.duration_minutes || payload.new_duration_minutes || 0);
    const cashierName = payload.cashier_name || 'Operator';
    const note = payload.note || 'Koreksi durasi room aktif';
    if (!roomId) throw new Error('room_id wajib diisi.');
    if (!Number.isFinite(newDuration) || newDuration <= 0) throw new Error('duration_minutes wajib positif.');

    const roomRes = await client.query('SELECT * FROM rooms WHERE room_id = $1 FOR UPDATE', [roomId]);
    if (roomRes.rowCount === 0) throw new Error('Ruangan tidak ditemukan.');
    const room = roomRes.rows[0];
    if (!['occupied', 'paid_waiting_start'].includes(room.status)) throw new Error('Room tidak dalam sesi aktif.');

    const startTime = room.start_time || new Date();
    const newEndTime = new Date(new Date(startTime).getTime() + newDuration * 60 * 1000);
    const oldDuration = Number(room.booked_duration_minutes || 0);

    await client.query(`
      UPDATE rooms SET booked_duration_minutes = $1, scheduled_end_time = $2, updated_at = CURRENT_TIMESTAMP WHERE room_id = $3
    `, [newDuration, newEndTime, roomId]);

    const logId = `RTL-${Date.now()}`;
    await client.query(`
      INSERT INTO room_time_logs (
        log_id, action_type, room_id, room_name, old_booked_duration_minutes, new_booked_duration_minutes,
        old_scheduled_end_time, new_scheduled_end_time, add_minutes, cashier_name, note
      ) VALUES ($1, 'correct_duration', $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `, [logId, roomId, room.room_name, oldDuration, newDuration, room.scheduled_end_time, newEndTime, newDuration - oldDuration, cashierName, note]);

    await client.query('COMMIT');
    return successResponse(res, { message: 'Durasi room berhasil dikoreksi.', room_id: roomId, booked_duration_minutes: newDuration });
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    return errorResponse(res, err.message);
  } finally {
    if (client) client.release();
  }
}

async function previewSessionPricing(req, res, payload) {
  try {
    const roomId = payload.room_id;
    let durationMinutes = Number(payload.duration_minutes || 0);
    const packageId = payload.package_id || '';
    if (!roomId) throw new Error('room_id wajib diisi.');
    if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) throw new Error('duration_minutes wajib positif.');

    const roomRes = await db.query('SELECT * FROM rooms WHERE room_id = $1', [roomId]);
    if (roomRes.rowCount === 0) throw new Error('Ruangan tidak ditemukan.');
    const room = roomRes.rows[0];

    let roomTotal = Math.ceil((durationMinutes / 60) * Number(room.rate_per_hour || 0));
    let bookingMode = 'regular';
    let packageInfo = null;
    if (packageId) {
      const pkgRes = await db.query('SELECT * FROM package_master WHERE package_id = $1 AND status = $2', [packageId, 'active']);
      if (pkgRes.rowCount === 0) throw new Error('Paket tidak ditemukan atau tidak aktif.');
      const pkg = pkgRes.rows[0];
      durationMinutes = Number(pkg.duration_minutes || durationMinutes);
      roomTotal = Number(pkg.selling_price || 0);
      bookingMode = 'package';
      packageInfo = pkg;
    }

    return successResponse(res, {
      booking_mode: bookingMode,
      duration_minutes: durationMinutes,
      room_total: roomTotal,
      grand_total: roomTotal,
      package: packageInfo
    });
  } catch (err) {
    return errorResponse(res, err.message);
  }
}

module.exports = {
  getRooms,
  prepareRoomSession,
  payAndStartSession,
  activatePreparedSession,
  startSession,
  extendSession,
  updateActiveSessionPackage,
  closeSession,
  completeCleaning,
  cancelBooking,
  getTodayRoomTimeLogs,
  getRoomUsageReport,
  getExpiredRoomRecoveryList,
  recoverExpiredRoomSession,
  correctActiveRoomDuration,
  previewSessionPricing,
  deductStockForFnbOrders,
};
