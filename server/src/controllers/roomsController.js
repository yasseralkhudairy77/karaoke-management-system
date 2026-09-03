const db = require('../db');
const { successResponse, errorResponse } = require('../utils/response');
const { getOperationalDate } = require('../utils/operationalDate');
const { writeOperationalAudit } = require('../services/operationalAuditService');

function parseSessionPackageMeta(session) {
  const note = String(session?.note || '');
  const packageId = (note.match(/package_id=([^|]+)/)?.[1] || '').trim();
  const packageName = (note.match(/package_name=([^|]+)/)?.[1] || '').trim();
  const packageTotal = Number((note.match(/package_total=([0-9.]+)/)?.[1] || '0').trim()) || 0;

  return { packageId, packageName, packageTotal };
}

function toMoneyNumber(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function calculateLcCharge(durationMinutes, ratePerHour) {
  const duration = Math.max(0, Math.round(Number(durationMinutes) || 0));
  const rate = Math.max(0, Number(ratePerHour) || 0);
  if (duration <= 0 || rate <= 0) return 0;
  return Math.ceil(duration / 60) * rate;
}

let packageLcBillingSchemaChecked = false;
async function ensurePackageLcBillingSchema(client) {
  if (packageLcBillingSchemaChecked) return;
  await client.query(`
    ALTER TABLE package_master ADD COLUMN IF NOT EXISTS included_lc_count INT NOT NULL DEFAULT 0;
    ALTER TABLE package_master ADD COLUMN IF NOT EXISTS included_lc_duration_minutes INT NOT NULL DEFAULT 0;
    ALTER TABLE lc_work_logs ADD COLUMN IF NOT EXISTS customer_charge_amount NUMERIC(12,2) NOT NULL DEFAULT 0;
    ALTER TABLE lc_work_logs ADD COLUMN IF NOT EXISTS included_minutes INT NOT NULL DEFAULT 0;
    ALTER TABLE lc_work_logs ADD COLUMN IF NOT EXISTS extra_minutes INT NOT NULL DEFAULT 0;
    ALTER TABLE lc_work_logs ADD COLUMN IF NOT EXISTS billing_source VARCHAR(30) NOT NULL DEFAULT 'regular';
    ALTER TABLE lc_work_logs ADD COLUMN IF NOT EXISTS package_id VARCHAR(50);
  `);
  packageLcBillingSchemaChecked = true;
}

async function getPackageLcRule(client, packageId) {
  if (!packageId) {
    return { package_id: '', included_lc_count: 0, included_lc_duration_minutes: 0 };
  }
  const pkgRes = await client.query(`
    SELECT package_id, included_lc_count, included_lc_duration_minutes
    FROM package_master
    WHERE package_id = $1
    LIMIT 1
  `, [packageId]);
  const pkg = pkgRes.rows[0] || {};
  return {
    package_id: pkg.package_id || packageId,
    included_lc_count: Math.max(0, Math.floor(Number(pkg.included_lc_count || 0))),
    included_lc_duration_minutes: Math.max(0, Math.floor(Number(pkg.included_lc_duration_minutes || 0)))
  };
}

function allocatePackageLcBilling(lcRows, packageRule) {
  const includedCount = Math.max(0, Math.floor(Number(packageRule?.included_lc_count || 0)));
  const includedDuration = Math.max(0, Math.floor(Number(packageRule?.included_lc_duration_minutes || 0)));

  return lcRows.map((row, index) => {
    const durationMinutes = Math.max(0, Math.round(Number(row.duration_minutes || 0)));
    const ratePerHour = toMoneyNumber(row.rate_per_hour);
    const payableAmount = calculateLcCharge(durationMinutes, ratePerHour);
    const hasPackageRule = Boolean(packageRule?.package_id);
    const includedMinutes = index < includedCount
      ? Math.min(durationMinutes, includedDuration)
      : 0;
    const extraMinutes = Math.max(0, durationMinutes - includedMinutes);
    const customerChargeAmount = calculateLcCharge(extraMinutes, ratePerHour);
    const billingSource = includedMinutes > 0
      ? (extraMinutes > 0 ? 'package_partial' : 'package_included')
      : hasPackageRule
        ? 'extra_charge'
        : 'regular';

    return {
      ...row,
      duration_minutes: durationMinutes,
      rate_per_hour: ratePerHour,
      rate_per_room: ratePerHour,
      rate: payableAmount,
      payable_amount: payableAmount,
      customer_charge_amount: customerChargeAmount,
      included_minutes: includedMinutes,
      extra_minutes: extraMinutes,
      billing_source: billingSource,
      package_id: packageRule?.package_id || null
    };
  });
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

function serializeRoomSegment(row) {
  return {
    segment_id: row.segment_id,
    session_id: row.session_id,
    sequence_no: Number(row.sequence_no || 0),
    room_id: row.room_id,
    room_name: row.room_name,
    rate_per_hour: Number(row.rate_per_hour || 0),
    started_at: row.started_at ? new Date(row.started_at).toISOString() : '',
    ended_at: row.ended_at ? new Date(row.ended_at).toISOString() : '',
    allocated_minutes: row.allocated_minutes === null || row.allocated_minutes === undefined
      ? null
      : Number(row.allocated_minutes || 0),
    move_reason: row.move_reason || '',
    moved_by: row.moved_by || ''
  };
}

async function ensureActiveRoomSegment(client, session, room) {
  const existing = await client.query(`
    SELECT * FROM room_session_segments
    WHERE session_id = $1 AND ended_at IS NULL
    ORDER BY sequence_no DESC
    LIMIT 1
    FOR UPDATE
  `, [session.session_id]);
  if (existing.rowCount > 0) return existing.rows[0];

  const sequenceRes = await client.query(`
    SELECT COALESCE(MAX(sequence_no), 0) + 1 AS next_sequence
    FROM room_session_segments
    WHERE session_id = $1
  `, [session.session_id]);
  const sequenceNo = Number(sequenceRes.rows[0]?.next_sequence || 1);
  const segmentId = `RSG-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  const inserted = await client.query(`
    INSERT INTO room_session_segments (
      segment_id, session_id, sequence_no, room_id, room_name,
      rate_per_hour, started_at, moved_by
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *
  `, [
    segmentId,
    session.session_id,
    sequenceNo,
    room.room_id,
    room.room_name,
    Number(room.rate_per_hour || session.rate_per_hour || 0),
    session.start_time || room.start_time || new Date(),
    session.cashier_name || 'Kasir'
  ]);
  return inserted.rows[0];
}

async function finalizeAndPriceRoomSegments(client, session, room, endTime) {
  await ensureActiveRoomSegment(client, session, room);
  const segmentsRes = await client.query(`
    SELECT * FROM room_session_segments
    WHERE session_id = $1
    ORDER BY sequence_no ASC
    FOR UPDATE
  `, [session.session_id]);
  const totalMinutes = Math.max(0, Number(session.booked_duration_minutes || room.booked_duration_minutes || 0));
  let allocatedBeforeActive = segmentsRes.rows
    .filter(segment => segment.ended_at)
    .reduce((total, segment) => total + Math.max(0, Number(segment.allocated_minutes || 0)), 0);
  let remainingMinutes = Math.max(0, totalMinutes - allocatedBeforeActive);

  for (const segment of segmentsRes.rows) {
    if (!segment.ended_at) {
      await client.query(`
        UPDATE room_session_segments
        SET ended_at = $1, allocated_minutes = $2, updated_at = CURRENT_TIMESTAMP
        WHERE segment_id = $3
      `, [endTime, remainingMinutes, segment.segment_id]);
      segment.ended_at = endTime;
      segment.allocated_minutes = remainingMinutes;
      remainingMinutes = 0;
    }
  }

  const segments = segmentsRes.rows.map(serializeRoomSegment);
  const baseRate = Number(session.rate_per_hour || 0);
  const isPackage = String(session.booking_mode || '').toLowerCase() === 'package';
  const packageMeta = parseSessionPackageMeta(session);
  let regularTotal = 0;
  let upgradeTotal = 0;

  for (const segment of segments) {
    const minutes = Math.max(0, Number(segment.allocated_minutes || 0));
    const rate = Math.max(0, Number(segment.rate_per_hour || 0));
    regularTotal += (minutes / 60) * rate;
    if (isPackage) {
      upgradeTotal += (minutes / 60) * Math.max(0, rate - baseRate);
    }
  }

  return {
    segments,
    roomTotal: isPackage
      ? Math.ceil(Number(packageMeta.packageTotal || 0) + upgradeTotal)
      : Math.ceil(regularTotal),
    upgradeTotal: Math.ceil(upgradeTotal),
    packageMeta
  };
}

async function getRooms(req, res) {
  try {
    await ensurePackageLcBillingSchema(db);
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
        session_id: order.session_id || "",
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
    const packageIds = new Set();
    for (const session of activeSessionsRes.rows) {
      if (!sessionByRoom.has(session.room_id)) {
        sessionByRoom.set(session.room_id, session);
        const pkgMeta = parseSessionPackageMeta(session);
        if (pkgMeta.packageId) packageIds.add(pkgMeta.packageId);
      }
    }

    const packagesById = new Map();
    if (packageIds.size > 0) {
      const packageRes = await db.query(`
        SELECT package_id, included_lc_count, included_lc_duration_minutes
        FROM package_master
        WHERE package_id = ANY($1::varchar[])
      `, [Array.from(packageIds)]);
      packageRes.rows.forEach(pkg => {
        packagesById.set(pkg.package_id, {
          included_lc_count: Number(pkg.included_lc_count || 0),
          included_lc_duration_minutes: Number(pkg.included_lc_duration_minutes || 0)
        });
      });
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
      let includedLcCount = 0;
      let includedLcDurationMinutes = 0;

      if (r.status !== 'available' && r.status !== 'cleaning' && activeSession && activeSession.booking_mode === 'package') {
        const pkgMeta = parseSessionPackageMeta(activeSession);
        const pkgLcRule = packagesById.get(pkgMeta.packageId) || {};
        bookingMode = 'package';
        packageId = pkgMeta.packageId;
        packageName = pkgMeta.packageName;
        packageTotal = pkgMeta.packageTotal;
        includedLcCount = Number(pkgLcRule.included_lc_count || 0);
        includedLcDurationMinutes = Number(pkgLcRule.included_lc_duration_minutes || 0);
      }

      return {
        room_id: r.room_id,
        room_name: r.room_name,
        status: r.status,
        booking_mode: bookingMode,
        package_id: packageId,
        package_name: packageName,
        package_total: packageTotal,
        included_lc_count: includedLcCount,
        included_lc_duration_minutes: includedLcDurationMinutes,
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

    await ensureActiveRoomSegment(client, {
      session_id: sessionId,
      start_time: startTime,
      rate_per_hour: room.rate_per_hour,
      cashier_name: cashierName
    }, room);

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

    if (transactionPackageId) {
      await deductStockForRoomPackage(client, transactionPackageId, transactionPackageName, transactionId, cashierName);
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
    const reason = String(payload.reason || '').trim();
    const cancelledBy = String(payload.changed_by || payload.cashier_name || 'Operator').trim();
    if (!roomId) throw new Error('room_id wajib diisi.');
    if (reason.length < 5) throw new Error('Alasan pembatalan minimal 5 karakter.');

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

    await writeOperationalAudit(client, {
      risk_level: room.status === 'paid_waiting_start' ? 'critical' : 'high',
      domain: 'room', event_type: 'booking_cancelled', source_action: 'cancelBooking',
      initiated_by: cancelledBy,
      target_type: 'room', target_id: roomId, room_id: roomId, room_name: room.room_name,
      reason,
      old_value: room,
      new_value: { room_id: roomId, room_name: room.room_name, status: 'available' },
      metadata: { previous_status: room.status }
    });

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

    await client.query(`
      UPDATE room_sessions
      SET booked_duration_minutes = $1,
          scheduled_end_time = $2,
          billable_room_minutes = CASE
            WHEN booking_mode = 'regular' THEN COALESCE(billable_room_minutes, $3) + $4
            ELSE billable_room_minutes
          END,
          updated_at = CURRENT_TIMESTAMP
      WHERE room_id = $5 AND status = 'active'
    `, [newDuration, newEndTime, oldDuration, addMinutes, roomId]);

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

async function moveActiveSessionRoom(req, res, payload) {
  let client;
  try {
    client = await db.pool.connect();
    await client.query('BEGIN');

    const sourceRoomId = String(payload.room_id || payload.source_room_id || '').trim();
    const targetRoomId = String(payload.target_room_id || '').trim();
    const reason = String(payload.reason || payload.note || '').trim();
    const movedBy = String(payload.cashier_name || payload.moved_by || 'Kasir').trim();
    const idempotencyKey = String(payload.idempotency_key || '').trim() || null;

    if (!sourceRoomId) throw new Error('room_id asal wajib diisi.');
    if (!targetRoomId) throw new Error('target_room_id wajib diisi.');
    if (sourceRoomId === targetRoomId) throw new Error('Room tujuan harus berbeda dari room asal.');
    if (reason.length < 3) throw new Error('Alasan pindah room wajib diisi minimal 3 karakter.');

    if (idempotencyKey) {
      const replayRes = await client.query(`
        SELECT * FROM room_session_segments
        WHERE transfer_idempotency_key = $1
        LIMIT 1
      `, [idempotencyKey]);
      if (replayRes.rowCount > 0) {
        await client.query('COMMIT');
        return successResponse(res, {
          message: 'Pindah room sudah diproses sebelumnya.',
          idempotent_replay: true,
          target_room: { room_id: replayRes.rows[0].room_id, room_name: replayRes.rows[0].room_name }
        });
      }
    }

    const roomsRes = await client.query(`
      SELECT * FROM rooms
      WHERE room_id = ANY($1)
      ORDER BY room_id ASC
      FOR UPDATE
    `, [[sourceRoomId, targetRoomId]]);
    const sourceRoom = roomsRes.rows.find(room => room.room_id === sourceRoomId);
    const targetRoom = roomsRes.rows.find(room => room.room_id === targetRoomId);
    if (!sourceRoom) throw new Error('Room asal tidak ditemukan.');
    if (!targetRoom) throw new Error('Room tujuan tidak ditemukan.');
    if (sourceRoom.status !== 'occupied') throw new Error('Room asal tidak memiliki sesi aktif.');
    if (targetRoom.status !== 'available') {
      throw new Error(`Room tujuan belum tersedia (status: ${targetRoom.status}).`);
    }

    let sessionRes = await client.query(`
      SELECT * FROM room_sessions
      WHERE room_id = $1 AND status IN ('starting', 'active')
      ORDER BY created_at DESC
      LIMIT 1
      FOR UPDATE
    `, [sourceRoomId]);

    let session = sessionRes.rows[0];

    if (!session) {
      const startTime = sourceRoom.start_time ? new Date(sourceRoom.start_time) : new Date();
      const durationMinutes = Math.max(0, Number(sourceRoom.booked_duration_minutes || 60));
      const scheduledEndTime = sourceRoom.scheduled_end_time
        ? new Date(sourceRoom.scheduled_end_time)
        : new Date(startTime.getTime() + durationMinutes * 60 * 1000);
      const sessionId = `${sourceRoomId}-${startTime.toISOString().replace(/[-:T.Z]/g, '')}`;

      const insertedSession = await client.query(`
        INSERT INTO room_sessions (
          session_id, room_id, room_name, booking_mode, status,
          start_time, scheduled_end_time, booked_duration_minutes,
          package_included_minutes, billable_room_minutes, rate_per_hour, cashier_name
        ) VALUES ($1, $2, $3, 'regular', 'active', $4, $5, $6, 0, $6, $7, $8)
        RETURNING *
      `, [
        sessionId,
        sourceRoomId,
        sourceRoom.room_name,
        startTime,
        scheduledEndTime,
        durationMinutes,
        Number(sourceRoom.rate_per_hour || 0),
        movedBy
      ]);
      session = insertedSession.rows[0];
    } else if (session.status !== 'active') {
      await client.query(`
        UPDATE room_sessions
        SET status = 'active', updated_at = CURRENT_TIMESTAMP
        WHERE session_id = $1
      `, [session.session_id]);
      session.status = 'active';
    }

    const currentSegment = await ensureActiveRoomSegment(client, session, sourceRoom);

    const completedRes = await client.query(`
      SELECT COALESCE(SUM(allocated_minutes), 0) AS completed_minutes,
             COALESCE(MAX(sequence_no), 0) AS last_sequence
      FROM room_session_segments
      WHERE session_id = $1 AND ended_at IS NOT NULL
    `, [session.session_id]);
    const totalMinutes = Math.max(0, Number(session.booked_duration_minutes || sourceRoom.booked_duration_minutes || 0));
    const completedMinutes = Math.max(0, Number(completedRes.rows[0]?.completed_minutes || 0));
    const availableMinutes = Math.max(0, totalMinutes - completedMinutes);
    const movedAt = new Date();
    const elapsedInCurrent = Math.max(0, Math.floor((movedAt.getTime() - new Date(currentSegment.started_at).getTime()) / 60000));
    const currentAllocatedMinutes = Math.min(availableMinutes, elapsedInCurrent);
    const remainingMinutes = Math.max(0, availableMinutes - currentAllocatedMinutes);

    await client.query(`
      UPDATE room_session_segments
      SET ended_at = $1, allocated_minutes = $2, updated_at = CURRENT_TIMESTAMP
      WHERE segment_id = $3
    `, [movedAt, currentAllocatedMinutes, currentSegment.segment_id]);

    const nextSequence = Math.max(Number(currentSegment.sequence_no || 0), Number(completedRes.rows[0]?.last_sequence || 0)) + 1;
    const nextSegmentId = `RSG-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    await client.query(`
      INSERT INTO room_session_segments (
        segment_id, session_id, sequence_no, room_id, room_name,
        rate_per_hour, started_at, move_reason, moved_by, transfer_idempotency_key
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `, [
      nextSegmentId,
      session.session_id,
      nextSequence,
      targetRoom.room_id,
      targetRoom.room_name,
      Number(targetRoom.rate_per_hour || 0),
      movedAt,
      reason,
      movedBy,
      idempotencyKey
    ]);

    await client.query(`
      UPDATE room_sessions
      SET room_id = $1, room_name = $2, updated_at = CURRENT_TIMESTAMP
      WHERE session_id = $3
    `, [targetRoom.room_id, targetRoom.room_name, session.session_id]);

    await client.query(`
      UPDATE rooms
      SET status = 'cleaning', start_time = NULL, booked_duration_minutes = 0,
          scheduled_end_time = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE room_id = $1
    `, [sourceRoom.room_id]);
    await client.query(`
      UPDATE rooms
      SET status = 'occupied', start_time = $1, booked_duration_minutes = $2,
          scheduled_end_time = $3, updated_at = CURRENT_TIMESTAMP
      WHERE room_id = $4
    `, [session.start_time, totalMinutes, session.scheduled_end_time, targetRoom.room_id]);

    await client.query(`
      UPDATE fnb_orders
      SET session_id = $1, room_id = $2, room_name = $3, updated_at = CURRENT_TIMESTAMP
      WHERE order_status = 'open'
        AND (session_id = $1 OR (session_id IS NULL AND room_id = $4))
    `, [session.session_id, targetRoom.room_id, targetRoom.room_name, sourceRoom.room_id]);

    await client.query(`
      UPDATE lc_work_logs
      SET room_id = $1, room_name = $2
      WHERE closed_at IS NULL AND status <> 'cancelled'
        AND (session_id = $3 OR (session_id IS NULL AND room_id = $4))
    `, [targetRoom.room_id, targetRoom.room_name, session.session_id, sourceRoom.room_id]);

    const journeyRes = await client.query(`
      SELECT * FROM room_session_segments
      WHERE session_id = $1
      ORDER BY sequence_no ASC
    `, [session.session_id]);
    const journey = journeyRes.rows.map(serializeRoomSegment);
    const baseRate = Number(session.rate_per_hour || 0);
    const packageMeta = parseSessionPackageMeta(session);
    const isPackage = String(session.booking_mode || '').toLowerCase() === 'package';
    const estimatedSegmentTotal = journey.reduce((total, segment) => {
      const minutes = segment.ended_at ? Number(segment.allocated_minutes || 0) : remainingMinutes;
      const rate = Number(segment.rate_per_hour || 0);
      return total + (minutes / 60) * (isPackage ? Math.max(0, rate - baseRate) : rate);
    }, 0);
    const estimatedRoomTotal = Math.ceil((isPackage ? Number(packageMeta.packageTotal || 0) : 0) + estimatedSegmentTotal);
    const oldValue = {
      room_id: sourceRoom.room_id,
      room_name: sourceRoom.room_name,
      rate_per_hour: Number(sourceRoom.rate_per_hour || 0)
    };
    const newValue = {
      room_id: targetRoom.room_id,
      room_name: targetRoom.room_name,
      rate_per_hour: Number(targetRoom.rate_per_hour || 0),
      moved_at: movedAt.toISOString(),
      remaining_minutes: remainingMinutes,
      estimated_room_total: estimatedRoomTotal
    };

    await client.query(`
      INSERT INTO master_data_audit_logs (
        log_id, entity_type, entity_id, entity_name, action_type,
        old_value_json, new_value_json, changed_by, note, result
      ) VALUES ($1, 'room_session', $2, $3, 'room_transfer', $4, $5, $6, $7, 'success')
    `, [
      `MDA-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      session.session_id,
      targetRoom.room_name,
      oldValue,
      newValue,
      movedBy,
      reason
    ]);

    await client.query(`
      INSERT INTO room_time_logs (
        log_id, action_type, room_id, room_name,
        old_booked_duration_minutes, new_booked_duration_minutes,
        old_scheduled_end_time, new_scheduled_end_time,
        add_minutes, cashier_name, note
      ) VALUES ($1, 'move_room', $2, $3, $4, $4, $5, $5, 0, $6, $7)
    `, [
      `RTL-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      targetRoom.room_id,
      targetRoom.room_name,
      totalMinutes,
      session.scheduled_end_time,
      movedBy,
      `${sourceRoom.room_name} -> ${targetRoom.room_name} | ${reason}`
    ]);

    await client.query(`
      INSERT INTO sync_outbox (entity_type, entity_id, action, payload_json)
      VALUES ('room_sessions', $1, 'UPDATE', $2)
      ON CONFLICT (entity_type, entity_id, action) DO UPDATE
      SET payload_json = EXCLUDED.payload_json, status = 'pending', attempts = 0,
          last_attempt_at = NULL, error_message = NULL
    `, [session.session_id, JSON.stringify({
      session_id: session.session_id,
      action: 'move_room',
      source_room_id: sourceRoom.room_id,
      target_room_id: targetRoom.room_id,
      moved_at: movedAt,
      journey
    })]);

    await client.query('COMMIT');
    return successResponse(res, {
      message: `Sesi berhasil dipindahkan dari ${sourceRoom.room_name} ke ${targetRoom.room_name}.`,
      session_id: session.session_id,
      source_room: oldValue,
      target_room: newValue,
      remaining_minutes: remainingMinutes,
      estimated_room_total: estimatedRoomTotal,
      same_rate: Number(sourceRoom.rate_per_hour || 0) === Number(targetRoom.rate_per_hour || 0),
      room_journey: journey
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
    SELECT foi.order_item_id, foi.menu_id, foi.quantity, foi.menu_type_snapshot,
           m.stock_tracking, m.stock_item_id, m.stock_qty_per_unit, m.menu_name
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

        const movementId = `MOV-${transactionId}-${item.order_item_id}-${item.stock_item_id}`;
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

    const snapshotRes = await client.query(`
      SELECT item_id, component_name, total_qty, component_mode
      FROM fnb_order_item_components
      WHERE order_item_id = $1
      ORDER BY created_at ASC, component_snapshot_id ASC
    `, [item.order_item_id]);
    const componentRows = snapshotRes.rowCount > 0
      ? snapshotRes.rows.map(component => ({
          item_id: component.item_id,
          component_name: component.component_name,
          component_mode: component.component_mode,
          qty_to_deduct: Number(component.total_qty || 0)
        }))
      : (await client.query('SELECT * FROM recipe WHERE menu_id = $1', [item.menu_id])).rows.map(recipe => ({
          item_id: recipe.item_id,
          component_name: recipe.item_id,
          component_mode: recipe.component_mode || 'included',
          qty_to_deduct: orderQty * Number(recipe.qty_used || 1)
        }));

    for (const component of componentRows) {
      const recipeInvRes = await client.query('SELECT * FROM inventory WHERE stock_item_id = $1 FOR UPDATE', [component.item_id]);
      if (recipeInvRes.rowCount > 0) {
        const rInv = recipeInvRes.rows[0];
        const recipeDeduct = Number(component.qty_to_deduct || 0);
        const rStockBefore = Number(rInv.stock_qty || 0);
        const rStockAfter = rStockBefore - recipeDeduct;

        await client.query('UPDATE inventory SET stock_qty = $1, updated_at = CURRENT_TIMESTAMP WHERE stock_item_id = $2', [rStockAfter, component.item_id]);

        const rMovementId = `MOV-${transactionId}-${item.order_item_id}-RECIPE-${component.item_id}`;
        await client.query(`
          INSERT INTO stock_movements (
            movement_id, stock_item_id, stock_item_name, movement_type,
            reference_type, reference_id, qty_change, stock_before, stock_after, note, cashier_name, idempotency_key
          ) VALUES ($1, $2, $3, 'out', 'transaction', $4, $5, $6, $7, $8, $9, $1)
          ON CONFLICT (idempotency_key) DO NOTHING
        `, [rMovementId, component.item_id, rInv.stock_item_name, transactionId, -recipeDeduct, rStockBefore, rStockAfter, `Komponen ${component.component_mode === 'bonus' ? 'bonus' : 'paket'}: ${item.menu_name}`, cashierName]);

        movements.push({ stock_item_id: component.item_id, stock_before: rStockBefore, stock_after: rStockAfter });
      }
    }
  }

  return { movements };
}

async function deductStockForRoomPackage(client, packageId, packageName, transactionId, cashierName) {
  if (!packageId) return { movements: [] };

  const detailsRes = await client.query(`
    SELECT component_ref_id, component_name, qty, unit, is_choice, note, component_type
    FROM package_details
    WHERE package_id = $1
      AND component_ref_id IS NOT NULL AND component_ref_id <> ''
  `, [packageId]);

  const movements = [];

  for (const comp of detailsRes.rows) {
    let stockItemId = comp.component_ref_id;
    const qtyDeduct = Number(comp.qty || 1);
    if (!stockItemId || qtyDeduct <= 0) continue;

    if (comp.component_type === 'menu') {
      const menuRes = await client.query('SELECT stock_item_id FROM menu WHERE menu_id = $1', [comp.component_ref_id]);
      if (menuRes.rowCount > 0 && menuRes.rows[0].stock_item_id) {
        stockItemId = menuRes.rows[0].stock_item_id;
      }
    }

    const invRes = await client.query('SELECT * FROM inventory WHERE stock_item_id = $1 FOR UPDATE', [stockItemId]);
    if (invRes.rowCount > 0) {
      const inv = invRes.rows[0];
      const stockBefore = Number(inv.stock_qty || 0);
      const stockAfter = stockBefore - qtyDeduct;

      await client.query('UPDATE inventory SET stock_qty = $1, updated_at = CURRENT_TIMESTAMP WHERE stock_item_id = $2', [stockAfter, stockItemId]);

      const movementId = `MOV-${transactionId}-PKG-${stockItemId}`;
      await client.query(`
        INSERT INTO stock_movements (
          movement_id, stock_item_id, stock_item_name, movement_type,
          reference_type, reference_id, qty_change, stock_before, stock_after, note, cashier_name, idempotency_key
        ) VALUES ($1, $2, $3, 'out', 'transaction', $4, $5, $6, $7, $8, $9, $1)
        ON CONFLICT (idempotency_key) DO NOTHING
      `, [
        movementId,
        stockItemId,
        inv.stock_item_name,
        transactionId,
        -qtyDeduct,
        stockBefore,
        stockAfter,
        `Komponen Room Package: ${packageName || packageId} - ${comp.component_name || inv.stock_item_name}`,
        cashierName
      ]);

      movements.push({ stock_item_id: stockItemId, stock_before: stockBefore, stock_after: stockAfter });
    }
  }

  return { movements };
}

async function closeSession(req, res, payload) {
  let client;
  try {
    client = await db.pool.connect();
    await client.query('BEGIN');
    await ensurePackageLcBillingSchema(client);
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
    let durationMinutes = room.booked_duration_minutes || Math.ceil((endTime - startTime) / (60 * 1000));
    let ratePerHour = Number(room.rate_per_hour || 0);
    let roomTotal = Math.ceil((durationMinutes / 60) * ratePerHour);
    let roomUpgradeTotal = 0;
    let roomJourney = [];
    let bookingMode = 'regular';
    let transactionPackageId = '';
    let transactionPackageName = '';
    let transactionPackageTotal = 0;

    const activeSessionRes = await client.query(`
      SELECT * FROM room_sessions
      WHERE room_id = $1 AND status IN ('starting', 'active')
      ORDER BY created_at DESC
      LIMIT 1
      FOR UPDATE
    `, [roomId]);
    const activeSession = activeSessionRes.rows[0] || null;
    if (activeSession) {
      durationMinutes = Number(activeSession.booked_duration_minutes || durationMinutes);
      ratePerHour = Number(activeSession.rate_per_hour || ratePerHour);
      const pricing = await finalizeAndPriceRoomSegments(client, activeSession, room, endTime);
      roomTotal = pricing.roomTotal;
      roomUpgradeTotal = pricing.upgradeTotal;
      roomJourney = pricing.segments;
      if (activeSession.booking_mode === 'package') {
        bookingMode = 'package';
        transactionPackageId = pricing.packageMeta.packageId;
        transactionPackageName = pricing.packageMeta.packageName;
        transactionPackageTotal = pricing.packageMeta.packageTotal;
      }
    }

    const fnbRes = await client.query(`
      SELECT order_id, order_total FROM fnb_orders 
      WHERE order_status = 'open'
        AND ($1::varchar IS NOT NULL AND session_id = $1 OR session_id IS NULL AND room_id = $2)
    `, [activeSession?.session_id || null, roomId]);

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

    if (transactionPackageId) {
      await deductStockForRoomPackage(client, transactionPackageId, transactionPackageName, transactionId, cashierName);
    }

    const lcRes = await client.query(`
      SELECT
        log_id, session_id, room_id, room_name, lc_id, lc_name,
        duration_minutes, rate_per_hour, rate, status, created_at
      FROM lc_work_logs
      WHERE closed_at IS NULL AND status != 'cancelled'
        AND ($1::varchar IS NOT NULL AND session_id = $1 OR session_id IS NULL AND room_id = $2)
      ORDER BY created_at ASC
    `, [activeSession?.session_id || null, roomId]);
    const uniqueLcRows = Array.from(lcRes.rows.reduce((map, row) => {
      if (!row.lc_id || map.has(row.lc_id)) return map;
      map.set(row.lc_id, row);
      return map;
    }, new Map()).values());
    const packageLcRule = bookingMode === 'package'
      ? await getPackageLcRule(client, transactionPackageId)
      : { package_id: '', included_lc_count: 0, included_lc_duration_minutes: 0 };
    const allocatedLcRows = allocatePackageLcBilling(uniqueLcRows, packageLcRule);
    let lcTotal = 0;
    let lcPayableTotal = 0;
    allocatedLcRows.forEach(r => {
      lcTotal += Number(r.customer_charge_amount || 0);
      lcPayableTotal += Number(r.payable_amount || r.rate || 0);
    });
    const lcLogsForReceipt = allocatedLcRows.map(row => ({
      ...row,
      created_at: row.created_at ? new Date(row.created_at).toISOString() : ''
    }));
    const lcDetails = {
      detail_available: lcLogsForReceipt.length > 0,
      lc_logs: lcLogsForReceipt,
      items: lcLogsForReceipt,
      customer_items: lcLogsForReceipt.filter(row => Number(row.customer_charge_amount || 0) > 0),
      item_total: lcLogsForReceipt.reduce((total, row) => total + Number(row.customer_charge_amount || 0), 0),
      payable_total: lcPayableTotal,
      included_total: lcPayableTotal - lcTotal,
      billing_adjustment: 0,
      total: lcTotal
    };

    const grandTotal = roomTotal + fnbTotal + lcTotal;
    const opDate = getOperationalDate(endTime);

    // CRITICAL: Postpaid flow produces payment_status = 'unpaid'
    await client.query(`
      INSERT INTO transactions (
        transaction_id, room_id, room_name, start_time, end_time,
        duration_minutes, rate_per_hour, room_total, fnb_total, lc_total,
        grand_total, fnb_order_ids, payment_method, payment_status, cashier_name, operational_date, idempotency_key,
        booking_mode, package_id, package_name, package_total, room_upgrade_total, room_journey_json
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, '', 'unpaid', $13, $14, $15, $16, $17, $18, $19, $20, $21)
    `, [transactionId, roomId, room.room_name, startTime, endTime, durationMinutes, ratePerHour, roomTotal, fnbTotal, lcTotal, grandTotal, fnbOrderIds.join(','), cashierName, opDate, idempotencyKey, bookingMode, transactionPackageId || null, transactionPackageName || null, transactionPackageTotal, roomUpgradeTotal, JSON.stringify(roomJourney)]);

    await client.query(`
      UPDATE lc_work_logs
      SET closed_at = CURRENT_TIMESTAMP,
          closed_transaction_id = $1,
          status = 'closed',
          rate = data.rate,
          customer_charge_amount = data.customer_charge_amount,
          included_minutes = data.included_minutes,
          extra_minutes = data.extra_minutes,
          billing_source = data.billing_source,
          package_id = data.package_id
      FROM (
        SELECT *
        FROM jsonb_to_recordset($4::jsonb) AS x(
          log_id varchar,
          rate numeric,
          customer_charge_amount numeric,
          included_minutes int,
          extra_minutes int,
          billing_source varchar,
          package_id varchar
        )
      ) AS data
      WHERE closed_at IS NULL AND status != 'cancelled'
        AND ($2::varchar IS NOT NULL AND session_id = $2 OR session_id IS NULL AND room_id = $3)
        AND lc_work_logs.log_id = data.log_id
    `, [
      transactionId,
      activeSession?.session_id || null,
      roomId,
      JSON.stringify(allocatedLcRows.map(row => ({
        log_id: row.log_id,
        rate: row.payable_amount,
        customer_charge_amount: row.customer_charge_amount,
        included_minutes: row.included_minutes,
        extra_minutes: row.extra_minutes,
        billing_source: row.billing_source,
        package_id: row.package_id || null
      })))
    ]);

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
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
        duration_minutes: durationMinutes,
        billable_room_minutes: durationMinutes,
        free_room_minutes: 0,
        rate_per_hour: ratePerHour,
        room_total: roomTotal,
        fnb_total: fnbTotal,
        lc_total: lcTotal,
        grand_total: grandTotal,
        fnb_order_ids: fnbOrderIds.join(','),
        payment_status: 'unpaid',
        payment_method: '',
        cashier_name: cashierName,
        operational_date: opDate,
        booking_mode: bookingMode,
        package_id: transactionPackageId,
        package_name: transactionPackageName,
        package_total: transactionPackageTotal,
        room_upgrade_total: roomUpgradeTotal,
        room_journey: roomJourney,
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
        SET status = 'active', start_time = $1, scheduled_end_time = $2, updated_at = CURRENT_TIMESTAMP
        WHERE session_id = $3
      `, [startTime, scheduledEndTime, sessionRes.rows[0].session_id]);

      await ensureActiveRoomSegment(client, {
        ...sessionRes.rows[0],
        status: 'active',
        start_time: startTime
      }, room);
    } else {
      const sessionId = `${roomId}-${startTime.toISOString().replace(/[-:T.Z]/g, '')}`;
      await client.query(`
        INSERT INTO room_sessions (
          session_id, room_id, room_name, booking_mode, status,
          start_time, scheduled_end_time, booked_duration_minutes,
          package_included_minutes, billable_room_minutes, rate_per_hour, cashier_name
        ) VALUES ($1, $2, $3, 'regular', 'active', $4, $5, $6, 0, $6, $7, $8)
      `, [sessionId, roomId, room.room_name, startTime, scheduledEndTime, durationMinutes, Number(room.rate_per_hour || 0), 'Kasir']);

      await ensureActiveRoomSegment(client, {
        session_id: sessionId,
        status: 'active',
        start_time: startTime,
        rate_per_hour: room.rate_per_hour,
        cashier_name: 'Kasir'
      }, room);
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
  moveActiveSessionRoom,
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
  deductStockForRoomPackage,
};
