const db = require('../db');
const { successResponse, errorResponse } = require('../utils/response');
const { getOperationalDate, getOperationalDateRange } = require('../utils/operationalDate');

async function getTodayTransactions(req, res) {
  try {
    const { period, start_date, end_date } = req.query;
    const { startDate, endDate } = getOperationalDateRange(period, start_date, end_date);

    const result = await db.query(`
      SELECT * FROM transactions
      WHERE operational_date >= $1 AND operational_date <= $2
      ORDER BY created_at DESC
    `, [startDate, endDate]);

    const transactions = result.rows.map(t => ({
      transaction_id: t.transaction_id,
      room_id: t.room_id,
      room_name: t.room_name,
      start_time: new Date(t.start_time).toISOString(),
      end_time: new Date(t.end_time).toISOString(),
      duration_minutes: t.duration_minutes,
      rate_per_hour: Number(t.rate_per_hour),
      room_total: Number(t.room_total),
      fnb_total: Number(t.fnb_total),
      lc_total: Number(t.lc_total || 0),
      grand_total: Number(t.grand_total),
      fnb_order_ids: t.fnb_order_ids || '',
      payment_method: t.payment_method,
      payment_status: t.payment_status,
      cashier_name: t.cashier_name,
      operational_date: t.operational_date ? t.operational_date.toISOString().split('T')[0] : '',
      created_at: new Date(t.created_at).toISOString()
    }));

    let cashRevenue = 0;
    let transferRevenue = 0;
    let totalRevenue = 0;

    transactions.forEach(t => {
      if (t.payment_status === 'paid') {
        totalRevenue += t.grand_total;
        if (t.payment_method === 'cash') cashRevenue += t.grand_total;
        else transferRevenue += t.grand_total;
      }
    });

    return res.json({
      ok: true,
      success: true,
      transactions,
      summary: {
        total_transactions: transactions.length,
        cash_revenue: cashRevenue,
        transfer_revenue: transferRevenue,
        total_revenue: totalRevenue
      },
      operational_date_start: startDate,
      operational_date_end: endDate
    });
  } catch (err) {
    return errorResponse(res, err.message);
  }
}

async function markTransactionPaid(req, res, payload) {
  try {
    const { transaction_id, payment_method = 'cash' } = payload;
    if (!transaction_id) throw new Error('transaction_id wajib diisi.');

    await db.query(`
      UPDATE transactions
      SET payment_status = 'paid', payment_method = $1
      WHERE transaction_id = $2
    `, [payment_method, transaction_id]);

    return successResponse(res, { message: `Transaksi ${transaction_id} berhasil ditandai Lunas.` });
  } catch (err) {
    return errorResponse(res, err.message);
  }
}

async function logReceiptPrint(req, res, payload) {
  try {
    const { transaction_id, print_type = 'thermal', cashier_name = 'Kasir', note = '' } = payload;
    if (!transaction_id) throw new Error('transaction_id wajib diisi.');

    const logRes = await db.query('SELECT COUNT(*) FROM receipt_print_logs WHERE transaction_id = $1', [transaction_id]);
    const printSeq = parseInt(logRes.rows[0].count || 0, 10) + 1;
    const isReprint = printSeq > 1;

    const logId = `RPL-${Date.now()}`;
    await db.query(`
      INSERT INTO receipt_print_logs (
        print_log_id, transaction_id, print_sequence, is_reprint, print_type, cashier_name, note
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [logId, transaction_id, printSeq, isReprint, print_type, cashier_name, note]);

    return successResponse(res, { message: 'Audit cetak struk dicatat.', print_sequence: printSeq, is_reprint: isReprint });
  } catch (err) {
    return errorResponse(res, err.message);
  }
}

async function updateTransactionDetails(req, res, payload) {
  try {
    const transactionId = payload.transaction_id;
    if (!transactionId) throw new Error('transaction_id wajib diisi.');

    const fields = [];
    const params = [];
    const allowed = {
      payment_method: value => String(value || '').toLowerCase(),
      payment_status: value => String(value || '').toLowerCase(),
      room_total: value => Number(value || 0),
      fnb_total: value => Number(value || 0),
      lc_total: value => Number(value || 0),
      grand_total: value => Number(value || 0),
      cashier_name: value => String(value || 'Kasir')
    };

    for (const [field, normalizer] of Object.entries(allowed)) {
      if (payload[field] !== undefined) {
        params.push(normalizer(payload[field]));
        fields.push(`${field} = $${params.length}`);
      }
    }

    if (fields.length === 0) throw new Error('Tidak ada field transaksi yang diperbarui.');
    params.push(transactionId);
    await db.query(`UPDATE transactions SET ${fields.join(', ')} WHERE transaction_id = $${params.length}`, params);
    return successResponse(res, { message: 'Transaksi berhasil diperbarui.', transaction_id: transactionId });
  } catch (err) {
    return errorResponse(res, err.message);
  }
}

async function deleteTransaction(req, res, payload) {
  try {
    const transactionId = payload.transaction_id;
    if (!transactionId) throw new Error('transaction_id wajib diisi.');
    await db.query(`UPDATE transactions SET payment_status = 'cancelled' WHERE transaction_id = $1`, [transactionId]);
    return successResponse(res, { message: 'Transaksi berhasil dibatalkan.', transaction_id: transactionId });
  } catch (err) {
    return errorResponse(res, err.message);
  }
}

async function getTransactionLcDetails(req, res) {
  try {
    const transactionId = req.query.transaction_id || '';
    if (!transactionId) throw new Error('transaction_id wajib diisi.');
    const trxRes = await db.query('SELECT * FROM transactions WHERE transaction_id = $1', [transactionId]);
    if (trxRes.rowCount === 0) return errorResponse(res, 'Transaksi tidak ditemukan.', 'TRANSACTION_NOT_FOUND');
    const trx = trxRes.rows[0];
    const logsRes = await db.query(`
      SELECT * FROM lc_work_logs
      WHERE room_id = $1
        AND created_at >= $2::timestamptz
        AND created_at <= COALESCE($3::timestamptz, CURRENT_TIMESTAMP)
        AND status != 'cancelled'
      ORDER BY created_at DESC
      LIMIT 20
    `, [trx.room_id, trx.start_time, trx.end_time]);
    const uniqueRows = Array.from(logsRes.rows.reduce((map, row) => {
      if (!row.lc_id || map.has(row.lc_id)) return map;
      map.set(row.lc_id, row);
      return map;
    }, new Map()).values());
    const logs = uniqueRows.map(row => ({
      ...row,
      duration_minutes: Number(row.duration_minutes || 0),
      rate_per_hour: Number(row.rate_per_hour || 0),
      rate_per_room: Number(row.rate_per_hour || 0),
      rate: Number(row.rate || 0),
      created_at: row.created_at ? new Date(row.created_at).toISOString() : '',
      closed_at: row.closed_at ? new Date(row.closed_at).toISOString() : ''
    }));
    const itemTotal = logs.reduce((total, row) => total + Number(row.rate || 0), 0);
    const lcTotal = Number(trx.lc_total || 0);
    const lcDetails = {
      detail_available: logs.length > 0,
      lc_logs: logs,
      items: logs,
      item_total: itemTotal,
      billing_adjustment: lcTotal - itemTotal,
      total: lcTotal
    };
    return res.json({
      ok: true,
      success: true,
      transaction: trx,
      ...lcDetails,
      lc_details: lcDetails,
      details: logs
    });
  } catch (err) {
    return errorResponse(res, err.message);
  }
}

async function updateTransactionLcDurations(req, res, payload) {
  let client;
  try {
    client = await db.pool.connect();
    await client.query('BEGIN');
    const transactionId = payload.transaction_id;
    const updates = Array.isArray(payload.lc_assignments) ? payload.lc_assignments : [];
    if (!transactionId) throw new Error('transaction_id wajib diisi.');

    const trxRes = await client.query('SELECT * FROM transactions WHERE transaction_id = $1', [transactionId]);
    if (trxRes.rowCount === 0) throw new Error('Transaksi tidak ditemukan.');
    const trx = trxRes.rows[0];

    let lcTotal = 0;
    for (const item of updates) {
      if (!item.lc_id) continue;
      const duration = Number(item.duration_minutes || 60);
      const lcRes = await client.query('SELECT rate_per_hour FROM lc_master WHERE lc_id = $1', [item.lc_id]);
      const hourlyRate = lcRes.rowCount > 0 ? Number(lcRes.rows[0].rate_per_hour || 0) : Number(item.rate_per_hour || 0);
      const rate = Math.ceil(duration / 60) * hourlyRate;
      lcTotal += rate;
      await client.query(`
        UPDATE lc_work_logs
        SET duration_minutes = $1, rate_per_hour = $2, rate = $3
        WHERE room_id = $4 AND lc_id = $5 AND status <> 'cancelled'
      `, [duration, hourlyRate, rate, trx.room_id, item.lc_id]);
    }

    const grandTotal = Number(trx.room_total || 0) + Number(trx.fnb_total || 0) + lcTotal;
    await client.query('UPDATE transactions SET lc_total = $1, grand_total = $2 WHERE transaction_id = $3', [lcTotal, grandTotal, transactionId]);
    await client.query('COMMIT');
    return successResponse(res, { message: 'Durasi LC transaksi berhasil diperbarui.', transaction_id: transactionId, lc_total: lcTotal, grand_total: grandTotal });
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    return errorResponse(res, err.message);
  } finally {
    if (client) client.release();
  }
}

async function createManualOutageTransaction(req, res, payload) {
  let client;
  try {
    client = await db.pool.connect();
    await client.query('BEGIN');

    const idempotencyKey = payload.idempotency_key;
    if (!idempotencyKey) throw new Error('idempotency_key wajib diisi.');

    const existing = await client.query('SELECT * FROM transactions WHERE idempotency_key = $1', [idempotencyKey]);
    if (existing.rowCount > 0) {
      await client.query('COMMIT');
      return successResponse(res, { message: 'Transaksi manual sudah pernah disimpan.', transaction: existing.rows[0], idempotent_replay: true });
    }

    const mode = String(payload.mode || 'room').toLowerCase();
    const roomId = payload.room_id || null;
    const cashierName = payload.cashier_name || 'Kasir Manual';
    const paymentMethod = String(payload.payment_method || 'cash').toLowerCase();
    const paymentStatus = String(payload.payment_status || 'paid').toLowerCase();
    const durationMinutes = mode === 'room' ? Number(payload.duration_minutes || 0) : 0;
    const startTime = payload.start_time ? new Date(payload.start_time) : new Date();
    const endTime = new Date(startTime.getTime() + durationMinutes * 60 * 1000);
    const opDate = payload.operational_date || getOperationalDate(startTime);

    if (!['room', 'general_fnb'].includes(mode)) throw new Error('Mode transaksi manual tidak valid.');
    if (!['cash', 'qris', 'transfer', ''].includes(paymentMethod)) throw new Error('Metode pembayaran tidak valid.');
    if (!['paid', 'unpaid'].includes(paymentStatus)) throw new Error('Status pembayaran tidak valid.');

    let roomName = mode === 'general_fnb' ? 'F&B Umum' : roomId;
    let ratePerHour = 0;
    let roomTotal = 0;

    if (mode === 'room') {
      if (!roomId) throw new Error('room_id wajib diisi untuk transaksi room.');
      const roomRes = await client.query('SELECT * FROM rooms WHERE room_id = $1', [roomId]);
      if (roomRes.rowCount === 0) throw new Error('Ruangan tidak ditemukan.');
      const room = roomRes.rows[0];
      roomName = room.room_name;
      ratePerHour = Number(room.rate_per_hour || 0);
      roomTotal = Math.ceil((durationMinutes / 60) * ratePerHour);

      if (payload.package_id) {
        const pkgRes = await client.query('SELECT * FROM package_master WHERE package_id = $1 AND status = $2', [payload.package_id, 'active']);
        if (pkgRes.rowCount === 0) throw new Error('Paket tidak ditemukan atau tidak aktif.');
        roomTotal = Number(pkgRes.rows[0].selling_price || 0);
      }
    }

    const fnbItems = Array.isArray(payload.fnb_items) ? payload.fnb_items : [];
    let fnbTotal = 0;
    for (const item of fnbItems) {
      const menuRes = await client.query('SELECT price FROM menu WHERE menu_id = $1 AND status = $2', [item.menu_id, 'active']);
      if (menuRes.rowCount === 0) throw new Error(`Menu ${item.menu_id} tidak ditemukan atau tidak aktif.`);
      fnbTotal += Number(menuRes.rows[0].price || 0) * Math.max(1, Number(item.quantity || 1));
    }

    const lcAssignments = Array.isArray(payload.lc_assignments) ? payload.lc_assignments : [];
    let lcTotal = 0;
    for (const lc of lcAssignments) {
      if (!lc.lc_id) continue;
      const lcRes = await client.query('SELECT rate_per_hour FROM lc_master WHERE lc_id = $1 AND status = $2', [lc.lc_id, 'active']);
      if (lcRes.rowCount === 0) continue;
      const lcDuration = Number(lc.duration_minutes || durationMinutes || 60);
      lcTotal += Math.ceil(lcDuration / 60) * Number(lcRes.rows[0].rate_per_hour || 0);
    }

    const transactionId = `TRX-${Date.now()}`;
    const grandTotal = roomTotal + fnbTotal + lcTotal;
    await client.query(`
      INSERT INTO transactions (
        transaction_id, room_id, room_name, start_time, end_time, duration_minutes,
        rate_per_hour, room_total, fnb_total, lc_total, grand_total, fnb_order_ids,
        payment_method, payment_status, cashier_name, operational_date, idempotency_key
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, '', $12, $13, $14, $15, $16)
    `, [transactionId, mode === 'room' ? roomId : 'FNB-GENERAL', roomName, startTime, endTime, durationMinutes, ratePerHour, roomTotal, fnbTotal, lcTotal, grandTotal, paymentMethod, paymentStatus, cashierName, opDate, idempotencyKey]);

    await client.query(`
      INSERT INTO sync_outbox (entity_type, entity_id, action, payload_json)
      VALUES ('transactions', $1, 'INSERT', $2)
      ON CONFLICT DO NOTHING
    `, [transactionId, JSON.stringify({ transaction_id: transactionId, room_id: roomId, grand_total: grandTotal, payment_status: paymentStatus, operational_date: opDate })]);

    await client.query('COMMIT');
    return successResponse(res, {
      message: 'Transaksi manual berhasil disimpan.',
      transaction: {
        transaction_id: transactionId,
        room_id: mode === 'room' ? roomId : 'FNB-GENERAL',
        room_name: roomName,
        duration_minutes: durationMinutes,
        room_total: roomTotal,
        fnb_total: fnbTotal,
        lc_total: lcTotal,
        grand_total: grandTotal,
        payment_method: paymentMethod,
        payment_status: paymentStatus,
        operational_date: opDate
      }
    });
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    return errorResponse(res, err.message);
  } finally {
    if (client) client.release();
  }
}

module.exports = {
  getTodayTransactions,
  markTransactionPaid,
  logReceiptPrint,
  updateTransactionDetails,
  deleteTransaction,
  getTransactionLcEditDetails: getTransactionLcDetails,
  getTransactionLcReceiptDetails: getTransactionLcDetails,
  updateTransactionLcDurations,
  createManualOutageTransaction,
};
