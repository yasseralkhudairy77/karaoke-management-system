const db = require('../db');
const { successResponse, errorResponse } = require('../utils/response');
const { getOperationalDate, getOperationalDateRange } = require('../utils/operationalDate');
const { verifyAndUpgradePin } = require('../middleware/auth');

function toNumber(value, fallback = 0) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function serializeTransaction(row) {
  if (!row) return null;
  let roomJourney = row.room_journey_json || [];
  if (typeof roomJourney === 'string') {
    try { roomJourney = JSON.parse(roomJourney); } catch (_) { roomJourney = []; }
  }
  return {
    transaction_id: row.transaction_id,
    room_id: row.room_id,
    room_name: row.room_name,
    start_time: row.start_time ? new Date(row.start_time).toISOString() : '',
    end_time: row.end_time ? new Date(row.end_time).toISOString() : '',
    duration_minutes: Number(row.duration_minutes || 0),
    rate_per_hour: Number(row.rate_per_hour || 0),
    room_total: Number(row.room_total || 0),
    fnb_total: Number(row.fnb_total || 0),
    lc_total: Number(row.lc_total || 0),
    grand_total: Number(row.grand_total || 0),
    fnb_order_ids: row.fnb_order_ids || '',
    payment_method: row.payment_method,
    payment_status: row.payment_status,
    cashier_name: row.cashier_name,
    operational_date: row.operational_date ? row.operational_date.toISOString().split('T')[0] : '',
    booking_mode: row.booking_mode || '',
    package_id: row.package_id || '',
    package_name: row.package_name || '',
    package_total: Number(row.package_total || 0),
    promo_code: row.promo_code || '',
    promo_discount: Number(row.promo_discount || 0),
    corrected_at: row.corrected_at ? new Date(row.corrected_at).toISOString() : '',
    corrected_by: row.corrected_by || '',
    correction_note: row.correction_note || '',
    billable_room_minutes: row.billable_room_minutes === null || row.billable_room_minutes === undefined ? null : Number(row.billable_room_minutes || 0),
    free_room_minutes: Number(row.free_room_minutes || 0),
    room_discount_amount: Number(row.room_discount_amount || 0),
    room_upgrade_total: Number(row.room_upgrade_total || 0),
    room_journey: Array.isArray(roomJourney) ? roomJourney : [],
    created_at: row.created_at ? new Date(row.created_at).toISOString() : ''
  };
}

async function validateOwnerPin(pin) {
  if (!pin) throw new Error('PIN owner wajib diisi.');

  const result = await db.query(`
    SELECT employee_id, employee_name, role, pin, pin_hash
    FROM employees
    WHERE role = 'owner' AND is_active = TRUE
    ORDER BY employee_name ASC
  `);

  for (const emp of result.rows) {
    const isValid = await verifyAndUpgradePin(emp.employee_id, pin, emp.pin, emp.pin_hash);
    if (isValid) {
      return {
        employee_id: emp.employee_id,
        employee_name: emp.employee_name,
        role: emp.role
      };
    }
  }

  throw new Error('PIN Owner tidak valid.');
}

async function ensureTransactionCorrectionSchema(client) {
  await client.query(`
    ALTER TABLE transactions ADD COLUMN IF NOT EXISTS booking_mode VARCHAR(30) DEFAULT 'regular';
    ALTER TABLE transactions ADD COLUMN IF NOT EXISTS package_id VARCHAR(50);
    ALTER TABLE transactions ADD COLUMN IF NOT EXISTS package_name VARCHAR(100);
    ALTER TABLE transactions ADD COLUMN IF NOT EXISTS package_total NUMERIC(12,2) NOT NULL DEFAULT 0;
    ALTER TABLE transactions ADD COLUMN IF NOT EXISTS corrected_at TIMESTAMPTZ;
    ALTER TABLE transactions ADD COLUMN IF NOT EXISTS corrected_by VARCHAR(100);
    ALTER TABLE transactions ADD COLUMN IF NOT EXISTS correction_note TEXT;
    ALTER TABLE transactions ADD COLUMN IF NOT EXISTS billable_room_minutes INT;
    ALTER TABLE transactions ADD COLUMN IF NOT EXISTS free_room_minutes INT NOT NULL DEFAULT 0;
    ALTER TABLE transactions ADD COLUMN IF NOT EXISTS room_discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0;
    ALTER TABLE transactions ADD COLUMN IF NOT EXISTS promo_code VARCHAR(50);
    ALTER TABLE transactions ADD COLUMN IF NOT EXISTS promo_discount NUMERIC(12,2) NOT NULL DEFAULT 0;
    ALTER TABLE transactions ADD COLUMN IF NOT EXISTS room_upgrade_total NUMERIC(12,2) NOT NULL DEFAULT 0;
    ALTER TABLE transactions ADD COLUMN IF NOT EXISTS room_journey_json JSONB NOT NULL DEFAULT '[]'::jsonb;

    CREATE TABLE IF NOT EXISTS transaction_correction_logs (
      correction_id VARCHAR(80) PRIMARY KEY,
      transaction_id VARCHAR(50) REFERENCES transactions(transaction_id) ON DELETE CASCADE,
      correction_type VARCHAR(50) NOT NULL,
      old_value_json JSONB,
      new_value_json JSONB,
      reason TEXT NOT NULL,
      corrected_by VARCHAR(100) NOT NULL,
      corrected_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

async function refreshClosingSnapshotForTransaction(client, transaction) {
  const closingRows = await client.query(
    'SELECT DISTINCT closing_id FROM cashier_closing_transactions WHERE transaction_id = $1',
    [transaction.transaction_id]
  );

  for (const row of closingRows.rows) {
    const closingId = row.closing_id;
    await client.query(`
      UPDATE cashier_closing_transactions
      SET room_id = $1,
          room_name = $2,
          duration_minutes = $3,
          room_total = $4,
          fnb_total = $5,
          lc_total = $6,
          grand_total = $7,
          payment_method = $8,
          payment_status = $9
      WHERE closing_id = $10 AND transaction_id = $11
    `, [
      transaction.room_id,
      transaction.room_name,
      transaction.duration_minutes,
      transaction.room_total,
      transaction.fnb_total,
      transaction.lc_total,
      transaction.grand_total,
      transaction.payment_method,
      transaction.payment_status,
      closingId,
      transaction.transaction_id
    ]);

    const summary = await client.query(`
      SELECT
        COUNT(*)::int AS total_transactions,
        COUNT(*) FILTER (WHERE payment_status = 'paid')::int AS paid_transactions,
        COUNT(*) FILTER (WHERE payment_status = 'unpaid')::int AS unpaid_transactions,
        COUNT(*) FILTER (WHERE payment_status = 'paid' AND payment_method = 'cash')::int AS cash_transactions,
        COUNT(*) FILTER (WHERE payment_status = 'paid' AND payment_method <> 'cash')::int AS transfer_transactions,
        COALESCE(SUM(grand_total) FILTER (WHERE payment_status = 'paid'), 0) AS paid_revenue,
        COALESCE(SUM(grand_total) FILTER (WHERE payment_status = 'paid' AND payment_method = 'cash'), 0) AS cash_expected,
        COALESCE(SUM(grand_total) FILTER (WHERE payment_status = 'paid' AND payment_method <> 'cash'), 0) AS transfer_revenue,
        COALESCE(SUM(grand_total) FILTER (WHERE payment_status = 'unpaid'), 0) AS unpaid_revenue,
        COALESCE(SUM(grand_total), 0) AS total_revenue
      FROM cashier_closing_transactions
      WHERE closing_id = $1
    `, [closingId]);
    const s = summary.rows[0] || {};

    await client.query(`
      UPDATE cashier_closings
      SET total_transactions = $1,
          paid_transactions = $2,
          unpaid_transactions = $3,
          cash_transactions = $4,
          transfer_transactions = $5,
          paid_revenue = $6,
          cash_expected = $7,
          transfer_revenue = $8,
          unpaid_revenue = $9,
          total_revenue = $10
      WHERE closing_id = $11
    `, [
      s.total_transactions || 0,
      s.paid_transactions || 0,
      s.unpaid_transactions || 0,
      s.cash_transactions || 0,
      s.transfer_transactions || 0,
      s.paid_revenue || 0,
      s.cash_expected || 0,
      s.transfer_revenue || 0,
      s.unpaid_revenue || 0,
      s.total_revenue || 0,
      closingId
    ]);
  }
}

async function getTodayTransactions(req, res) {
  try {
    const { period, start_date, end_date } = req.query;
    const { startDate, endDate } = getOperationalDateRange(period, start_date, end_date);

    const result = await db.query(`
      SELECT * FROM transactions
      WHERE operational_date >= $1 AND operational_date <= $2
        AND payment_status <> 'cancelled'
      ORDER BY created_at DESC
    `, [startDate, endDate]);

    const transactions = result.rows.map(serializeTransaction);

    let cashRevenue = 0;
    let transferRevenue = 0;
    let totalRevenuePaid = 0;
    let totalRevenueAll = 0;
    let unpaidRevenue = 0;
    let paidTransactions = 0;
    let unpaidTransactions = 0;
    let cashTransactions = 0;
    let transferTransactions = 0;

    transactions.forEach(t => {
      const transactionTotal = Number(t.grand_total) || 0;

      if (t.payment_status === 'paid') {
        paidTransactions += 1;
        totalRevenuePaid += transactionTotal;
        totalRevenueAll += transactionTotal;

        if (t.payment_method === 'cash') {
          cashTransactions += 1;
          cashRevenue += transactionTotal;
        } else {
          transferTransactions += 1;
          transferRevenue += transactionTotal;
        }
      } else if (t.payment_status === 'unpaid') {
        unpaidTransactions += 1;
        unpaidRevenue += transactionTotal;
        totalRevenueAll += transactionTotal;
      }
    });

    return res.json({
      ok: true,
      success: true,
      transactions,
      summary: {
        total_transactions: transactions.length,
        paid_transactions: paidTransactions,
        unpaid_transactions: unpaidTransactions,
        cash_transactions: cashTransactions,
        transfer_transactions: transferTransactions,
        cash_revenue: cashRevenue,
        transfer_revenue: transferRevenue,
        unpaid_revenue: unpaidRevenue,
        paid_revenue: totalRevenuePaid,
        total_revenue_paid: totalRevenuePaid,
        total_revenue_unpaid: unpaidRevenue,
        total_revenue_all: totalRevenueAll,
        total_revenue: totalRevenuePaid
      },
      operational_date_start: startDate,
      operational_date_end: endDate
    });
  } catch (err) {
    return errorResponse(res, err.message);
  }
}

async function markTransactionPaid(req, res, payload) {
  let client;
  try {
    client = await db.pool.connect();
    await client.query('BEGIN');
    await ensureTransactionCorrectionSchema(client);

    const { transaction_id, payment_method = 'cash', promo_code = '' } = payload;
    if (!transaction_id) throw new Error('transaction_id wajib diisi.');

    const trxRes = await client.query('SELECT * FROM transactions WHERE transaction_id = $1 FOR UPDATE', [transaction_id]);
    if (trxRes.rowCount === 0) throw new Error('Transaksi tidak ditemukan.');
    const transaction = trxRes.rows[0];

    const prCode = String(promo_code || payload.promoCode || '').trim().toUpperCase();
    let roomTotal = Number(transaction.room_total || 0);
    let fnbTotal = Number(transaction.fnb_total || 0);
    let lcTotal = Number(transaction.lc_total || 0);
    let existingDiscount = Number(transaction.promo_discount || 0);
    let promoDiscount = existingDiscount;
    let appliedPromoCode = transaction.promo_code || '';

    if (prCode) {
      const grossRoomTotal = existingDiscount > 0 ? roomTotal + existingDiscount : roomTotal;
      const promoRes = await client.query('SELECT * FROM promos WHERE UPPER(promo_code) = $1 LIMIT 1', [prCode]);

      if (promoRes.rowCount > 0) {
        const promo = promoRes.rows[0];
        const promoType = String(promo.type || 'promo').trim().toLowerCase();

        if (promoType === 'voucher' && promo.used_in_transaction_id && promo.used_in_transaction_id !== transaction_id) {
          throw new Error(`Voucher "${prCode}" sudah digunakan di transaksi ${promo.used_in_transaction_id}.`);
        }

        if (promo.is_active === false && promo.used_in_transaction_id !== transaction_id) {
          throw new Error(`Voucher "${prCode}" sedang tidak aktif.`);
        }

        if (promo.discount_type === 'percentage') {
          promoDiscount = Math.floor(grossRoomTotal * (Number(promo.discount_value || 0) / 100));
          if (promo.max_discount !== null && promo.max_discount !== undefined) {
            promoDiscount = Math.min(promoDiscount, Number(promo.max_discount || promoDiscount));
          }
        } else {
          promoDiscount = Number(promo.discount_value || 0);
        }
        promoDiscount = Math.max(0, Math.min(promoDiscount, grossRoomTotal));
        roomTotal = Math.max(0, grossRoomTotal - promoDiscount);
        appliedPromoCode = promo.promo_code;

        if (promoType === 'voucher') {
          await client.query(`
            UPDATE promos
            SET used_in_transaction_id = $1, used_at = CURRENT_TIMESTAMP, is_active = FALSE
            WHERE UPPER(promo_code) = $2
          `, [transaction_id, prCode]);
        }
      }
    }

    const grandTotal = roomTotal + fnbTotal + lcTotal;

    await client.query(`
      UPDATE transactions
      SET payment_status = 'paid',
          payment_method = $1,
          room_total = $2,
          promo_code = $3,
          promo_discount = $4,
          grand_total = $5
      WHERE transaction_id = $6
    `, [payment_method, roomTotal, appliedPromoCode, promoDiscount, grandTotal, transaction_id]);

    await client.query('COMMIT');

    const updatedTrx = await db.query('SELECT * FROM transactions WHERE transaction_id = $1', [transaction_id]);

    return successResponse(res, {
      message: `Transaksi ${transaction_id} berhasil ditandai Lunas.`,
      transaction: serializeTransaction(updatedTrx.rows[0])
    });
  } catch (err) {
    if (client) await client.query('ROLLBACK');
    return errorResponse(res, err.message);
  } finally {
    if (client) client.release();
  }
}

async function logReceiptPrint(req, res, payload) {
  try {
    const { transaction_id, print_type = 'thermal', cashier_name = 'Kasir', note = '' } = payload;
    if (!transaction_id) throw new Error('transaction_id wajib diisi.');

    await db.query(`
      CREATE TABLE IF NOT EXISTS receipt_print_logs (
        print_log_id VARCHAR(50) PRIMARY KEY,
        transaction_id VARCHAR(50) REFERENCES transactions(transaction_id) ON DELETE CASCADE,
        print_sequence INT NOT NULL DEFAULT 1,
        is_reprint BOOLEAN DEFAULT FALSE,
        print_type VARCHAR(20),
        cashier_name VARCHAR(100) NOT NULL,
        printed_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        note TEXT
      )
    `);

    const logRes = await db.query('SELECT COUNT(*) FROM receipt_print_logs WHERE transaction_id = $1', [transaction_id]);
    const printSeq = parseInt(logRes.rows[0]?.count || 0, 10) + 1;
    const isReprint = printSeq > 1;

    const logId = `RPL-${Date.now()}`;
    const printedAt = new Date();
    await db.query(`
      INSERT INTO receipt_print_logs (
        print_log_id, transaction_id, print_sequence, is_reprint, print_type, cashier_name, printed_at, note
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [logId, transaction_id, printSeq, isReprint, print_type, cashier_name, printedAt, note]);

    return successResponse(res, {
      message: 'Audit cetak struk dicatat.',
      print_sequence: printSeq,
      is_reprint: isReprint,
      log: {
        print_log_id: logId,
        transaction_id,
        print_sequence: printSeq,
        is_reprint: isReprint,
        reprint_number: Math.max(0, printSeq - 1),
        print_type,
        cashier_name,
        printed_at: printedAt.toISOString()
      }
    });
  } catch (err) {
    return errorResponse(res, err.message);
  }
}

async function updateTransactionDetails(req, res, payload) {
  let client;
  try {
    const transactionId = payload.transaction_id;
    if (!transactionId) throw new Error('transaction_id wajib diisi.');

    client = await db.pool.connect();
    await client.query('BEGIN');

    const trxCheck = await client.query('SELECT * FROM transactions WHERE transaction_id = $1 FOR UPDATE', [transactionId]);
    if (trxCheck.rowCount === 0) throw new Error('Transaksi tidak ditemukan.');

    const fields = [];
    const params = [];
    const allowed = {
      payment_method: value => {
        const val = String(value || '').toLowerCase().trim();
        return ['transfer', 'qris'].includes(val) ? 'transfer' : 'cash';
      },
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
    await client.query(`UPDATE transactions SET ${fields.join(', ')} WHERE transaction_id = $${params.length}`, params);

    const updatedTrx = await client.query('SELECT * FROM transactions WHERE transaction_id = $1', [transactionId]);
    if (updatedTrx.rowCount > 0) {
      await refreshClosingSnapshotForTransaction(client, updatedTrx.rows[0]);
    }

    await client.query('COMMIT');

    const serialized = serializeTransaction(updatedTrx.rows[0]);
    return successResponse(res, {
      message: `Metode pembayaran transaksi ${transactionId} berhasil diperbarui ke ${serialized.payment_method ? serialized.payment_method.toUpperCase() : ''}.`,
      transaction: serialized,
      transaction_id: transactionId
    });
  } catch (err) {
    if (client) await client.query('ROLLBACK');
    return errorResponse(res, err.message);
  } finally {
    if (client) client.release();
  }
}

async function correctTransactionPackage(req, res, payload) {
  let client;
  try {
    client = await db.pool.connect();
    await client.query('BEGIN');
    await ensureTransactionCorrectionSchema(client);

    const transactionId = String(payload.transaction_id || '').trim();
    const packageId = String(payload.package_id || '').trim();
    const reason = String(payload.reason || payload.note || '').trim();
    const adminPin = String(payload.admin_pin || payload.owner_pin || '').trim();
    const correctedBy = String(payload.changed_by || payload.corrected_by || 'Owner').trim();

    if (!transactionId) throw new Error('transaction_id wajib diisi.');
    if (!packageId) throw new Error('package_id wajib diisi.');
    if (reason.length < 5) throw new Error('Alasan koreksi minimal 5 karakter.');

    await validateOwnerPin(adminPin);

    const trxRes = await client.query('SELECT * FROM transactions WHERE transaction_id = $1 FOR UPDATE', [transactionId]);
    if (trxRes.rowCount === 0) throw new Error('Transaksi tidak ditemukan.');
    const oldTransaction = trxRes.rows[0];

    if (String(oldTransaction.payment_status || '').toLowerCase() === 'cancelled') {
      throw new Error('Transaksi yang sudah dibatalkan tidak bisa dikoreksi.');
    }

    const pkgRes = await client.query('SELECT * FROM package_master WHERE package_id = $1 AND status = $2', [packageId, 'active']);
    if (pkgRes.rowCount === 0) throw new Error('Paket tidak ditemukan atau tidak aktif.');
    const pkg = pkgRes.rows[0];

    const packageTotal = toNumber(pkg.selling_price);
    const fnbTotal = toNumber(oldTransaction.fnb_total);
    const lcTotal = toNumber(oldTransaction.lc_total);
    const grandTotal = packageTotal + fnbTotal + lcTotal;
    const durationMinutes = toNumber(pkg.duration_minutes, oldTransaction.duration_minutes);
    const ratePerHour = durationMinutes > 0 ? Math.ceil(packageTotal / Math.ceil(durationMinutes / 60 || 1)) : 0;

    const updatedRes = await client.query(`
      UPDATE transactions
      SET booking_mode = 'package_correction',
          package_id = $1,
          package_name = $2,
          package_total = $3,
          duration_minutes = $4,
          rate_per_hour = $5,
          room_total = $3,
          grand_total = $6,
          corrected_at = CURRENT_TIMESTAMP,
          corrected_by = $7,
          correction_note = $8
      WHERE transaction_id = $9
      RETURNING *
    `, [
      packageId,
      pkg.package_name || packageId,
      packageTotal,
      Math.floor(durationMinutes || oldTransaction.duration_minutes || 0),
      ratePerHour,
      grandTotal,
      correctedBy,
      reason,
      transactionId
    ]);
    const updatedTransaction = updatedRes.rows[0];

    await client.query(`
      INSERT INTO transaction_correction_logs (
        correction_id, transaction_id, correction_type, old_value_json,
        new_value_json, reason, corrected_by
      ) VALUES ($1, $2, 'package_correction', $3, $4, $5, $6)
    `, [
      `TCOR-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      transactionId,
      JSON.stringify({
        booking_mode: oldTransaction.booking_mode || '',
        package_id: oldTransaction.package_id || '',
        package_name: oldTransaction.package_name || '',
        package_total: toNumber(oldTransaction.package_total),
        duration_minutes: toNumber(oldTransaction.duration_minutes),
        rate_per_hour: toNumber(oldTransaction.rate_per_hour),
        room_total: toNumber(oldTransaction.room_total),
        fnb_total: fnbTotal,
        lc_total: lcTotal,
        grand_total: toNumber(oldTransaction.grand_total)
      }),
      JSON.stringify({
        booking_mode: 'package_correction',
        package_id: packageId,
        package_name: pkg.package_name || packageId,
        package_total: packageTotal,
        duration_minutes: Math.floor(durationMinutes || oldTransaction.duration_minutes || 0),
        rate_per_hour: ratePerHour,
        room_total: packageTotal,
        fnb_total: fnbTotal,
        lc_total: lcTotal,
        grand_total: grandTotal
      }),
      reason,
      correctedBy
    ]);

    await refreshClosingSnapshotForTransaction(client, updatedTransaction);

    await client.query(`
      INSERT INTO sync_outbox (entity_type, entity_id, action, payload_json)
      VALUES ('transactions', $1, 'UPDATE', $2)
    `, [transactionId, JSON.stringify(serializeTransaction(updatedTransaction))]);

    await client.query('COMMIT');
    return successResponse(res, {
      message: 'Koreksi paket transaksi berhasil disimpan.',
      transaction: serializeTransaction(updatedTransaction)
    });
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    return errorResponse(res, err.message);
  } finally {
    if (client) client.release();
  }
}

async function correctTransactionFreeRoom(req, res, payload) {
  let client;
  try {
    client = await db.pool.connect();
    await client.query('BEGIN');
    await ensureTransactionCorrectionSchema(client);

    const transactionId = String(payload.transaction_id || '').trim();
    const freeRoomMinutes = Math.max(0, Math.floor(toNumber(payload.free_room_minutes)));
    const reason = String(payload.reason || payload.note || '').trim();
    const adminPin = String(payload.admin_pin || payload.owner_pin || '').trim();
    const correctedBy = String(payload.changed_by || payload.corrected_by || 'Owner').trim();

    if (!transactionId) throw new Error('transaction_id wajib diisi.');
    if (freeRoomMinutes <= 0) throw new Error('Free room wajib lebih dari 0 menit.');
    if (reason.length < 5) throw new Error('Alasan koreksi minimal 5 karakter.');

    await validateOwnerPin(adminPin);

    const trxRes = await client.query('SELECT * FROM transactions WHERE transaction_id = $1 FOR UPDATE', [transactionId]);
    if (trxRes.rowCount === 0) throw new Error('Transaksi tidak ditemukan.');
    const oldTransaction = trxRes.rows[0];

    if (String(oldTransaction.payment_status || '').toLowerCase() === 'cancelled') {
      throw new Error('Transaksi yang sudah dibatalkan tidak bisa dikoreksi.');
    }
    if (String(oldTransaction.package_id || '').trim()) {
      throw new Error('Transaksi paket tidak bisa memakai koreksi free room. Gunakan koreksi paket bila perlu.');
    }

    const actualDurationMinutes = Math.max(0, Math.floor(toNumber(oldTransaction.duration_minutes)));
    if (actualDurationMinutes <= 0) throw new Error('Durasi aktual transaksi tidak valid.');
    if (freeRoomMinutes > actualDurationMinutes) {
      throw new Error('Free room tidak boleh lebih besar dari durasi aktual.');
    }

    const ratePerHour = toNumber(oldTransaction.rate_per_hour);
    if (ratePerHour <= 0) throw new Error('Tarif per jam transaksi tidak valid.');

    const grossRoomTotal = Math.ceil((actualDurationMinutes / 60) * ratePerHour);
    const billableRoomMinutes = Math.max(0, actualDurationMinutes - freeRoomMinutes);
    const nextRoomTotal = Math.ceil((billableRoomMinutes / 60) * ratePerHour);
    const discountAmount = Math.max(0, grossRoomTotal - nextRoomTotal);
    const fnbTotal = toNumber(oldTransaction.fnb_total);
    const lcTotal = toNumber(oldTransaction.lc_total);
    const grandTotal = nextRoomTotal + fnbTotal + lcTotal;

    const updatedRes = await client.query(`
      UPDATE transactions
      SET booking_mode = 'free_room_correction',
          billable_room_minutes = $1,
          free_room_minutes = $2,
          room_discount_amount = $3,
          room_total = $4,
          grand_total = $5,
          corrected_at = CURRENT_TIMESTAMP,
          corrected_by = $6,
          correction_note = $7
      WHERE transaction_id = $8
      RETURNING *
    `, [
      billableRoomMinutes,
      freeRoomMinutes,
      discountAmount,
      nextRoomTotal,
      grandTotal,
      correctedBy,
      reason,
      transactionId
    ]);
    const updatedTransaction = updatedRes.rows[0];

    await client.query(`
      INSERT INTO transaction_correction_logs (
        correction_id, transaction_id, correction_type, old_value_json,
        new_value_json, reason, corrected_by
      ) VALUES ($1, $2, 'free_room_correction', $3, $4, $5, $6)
    `, [
      `TCOR-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      transactionId,
      JSON.stringify({
        booking_mode: oldTransaction.booking_mode || '',
        duration_minutes: actualDurationMinutes,
        billable_room_minutes: oldTransaction.billable_room_minutes === null || oldTransaction.billable_room_minutes === undefined ? null : toNumber(oldTransaction.billable_room_minutes),
        free_room_minutes: toNumber(oldTransaction.free_room_minutes),
        room_discount_amount: toNumber(oldTransaction.room_discount_amount),
        rate_per_hour: ratePerHour,
        room_total: toNumber(oldTransaction.room_total),
        fnb_total: fnbTotal,
        lc_total: lcTotal,
        grand_total: toNumber(oldTransaction.grand_total)
      }),
      JSON.stringify({
        booking_mode: 'free_room_correction',
        duration_minutes: actualDurationMinutes,
        billable_room_minutes: billableRoomMinutes,
        free_room_minutes: freeRoomMinutes,
        room_discount_amount: discountAmount,
        rate_per_hour: ratePerHour,
        room_total: nextRoomTotal,
        fnb_total: fnbTotal,
        lc_total: lcTotal,
        grand_total: grandTotal
      }),
      reason,
      correctedBy
    ]);

    await refreshClosingSnapshotForTransaction(client, updatedTransaction);

    await client.query(`
      INSERT INTO sync_outbox (entity_type, entity_id, action, payload_json)
      VALUES ('transactions', $1, 'UPDATE', $2)
    `, [transactionId, JSON.stringify(serializeTransaction(updatedTransaction))]);

    await client.query('COMMIT');
    return successResponse(res, {
      message: 'Koreksi free room transaksi berhasil disimpan.',
      transaction: serializeTransaction(updatedTransaction)
    });
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    return errorResponse(res, err.message);
  } finally {
    if (client) client.release();
  }
}

async function deleteTransaction(req, res, payload) {
  try {
    const transactionId = payload.transaction_id;
    if (!transactionId) throw new Error('transaction_id wajib diisi.');
    if (payload.owner_pin) {
      await validateOwnerPin(payload.owner_pin);
    }
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
    let bookingMode = mode === 'room' ? 'regular' : mode;
    let transactionPackageId = '';
    let transactionPackageName = '';
    let transactionPackageTotal = 0;

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
        const pkg = pkgRes.rows[0];
        roomTotal = Number(pkg.selling_price || 0);
        bookingMode = 'package';
        transactionPackageId = pkg.package_id;
        transactionPackageName = pkg.package_name;
        transactionPackageTotal = roomTotal;
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
        payment_method, payment_status, cashier_name, operational_date, idempotency_key,
        booking_mode, package_id, package_name, package_total
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, '', $12, $13, $14, $15, $16, $17, $18, $19, $20)
    `, [transactionId, mode === 'room' ? roomId : 'FNB-GENERAL', roomName, startTime, endTime, durationMinutes, ratePerHour, roomTotal, fnbTotal, lcTotal, grandTotal, paymentMethod, paymentStatus, cashierName, opDate, idempotencyKey, bookingMode, transactionPackageId || null, transactionPackageName || null, transactionPackageTotal]);

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
        operational_date: opDate,
        booking_mode: bookingMode,
        package_id: transactionPackageId,
        package_name: transactionPackageName,
        package_total: transactionPackageTotal
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
  correctTransactionPackage,
  correctTransactionFreeRoom,
  deleteTransaction,
  getTransactionLcEditDetails: getTransactionLcDetails,
  getTransactionLcReceiptDetails: getTransactionLcDetails,
  updateTransactionLcDurations,
  createManualOutageTransaction,
};
