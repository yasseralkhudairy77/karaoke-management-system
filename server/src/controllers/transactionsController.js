const db = require('../db');
const { successResponse, errorResponse } = require('../utils/response');
const { getOperationalDate, getOperationalDateRange } = require('../utils/operationalDate');
const { verifyAndUpgradePin } = require('../middleware/auth');
const { writeOperationalAudit } = require('../services/operationalAuditService');

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
    manual_discount: Number(row.manual_discount || 0),
    manual_discount_room: Number(row.manual_discount_room || 0),
    manual_discount_fnb: Number(row.manual_discount_fnb || 0),
    manual_discount_reason: row.manual_discount_reason || '',
    manual_discount_by: row.manual_discount_by || '',
    manual_discount_at: row.manual_discount_at ? new Date(row.manual_discount_at).toISOString() : '',
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

async function validateOwnerOrManagerPin(pin) {
  if (!pin) throw new Error('PIN owner/manager wajib diisi.');

  const result = await db.query(`
    SELECT employee_id, employee_name, role, pin, pin_hash
    FROM employees
    WHERE role IN ('owner', 'manager') AND is_active = TRUE
    ORDER BY CASE role WHEN 'owner' THEN 1 ELSE 2 END, employee_name ASC
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

  throw new Error('PIN Owner/Manager tidak valid.');
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
    ALTER TABLE transactions ADD COLUMN IF NOT EXISTS manual_discount NUMERIC(12,2) NOT NULL DEFAULT 0;
    ALTER TABLE transactions ADD COLUMN IF NOT EXISTS manual_discount_room NUMERIC(12,2) NOT NULL DEFAULT 0;
    ALTER TABLE transactions ADD COLUMN IF NOT EXISTS manual_discount_fnb NUMERIC(12,2) NOT NULL DEFAULT 0;
    ALTER TABLE transactions ADD COLUMN IF NOT EXISTS manual_discount_reason TEXT;
    ALTER TABLE transactions ADD COLUMN IF NOT EXISTS manual_discount_by VARCHAR(100);
    ALTER TABLE transactions ADD COLUMN IF NOT EXISTS manual_discount_at TIMESTAMPTZ;
    ALTER TABLE transactions ADD COLUMN IF NOT EXISTS room_upgrade_total NUMERIC(12,2) NOT NULL DEFAULT 0;
    ALTER TABLE transactions ADD COLUMN IF NOT EXISTS room_journey_json JSONB NOT NULL DEFAULT '[]'::jsonb;

    ALTER TABLE fnb_order_items ADD COLUMN IF NOT EXISTS is_voided BOOLEAN DEFAULT FALSE;
    ALTER TABLE fnb_order_items ADD COLUMN IF NOT EXISTS void_reason TEXT;
    ALTER TABLE fnb_order_items ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ;
    ALTER TABLE fnb_order_items ADD COLUMN IF NOT EXISTS voided_by VARCHAR(100);
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

    ALTER TABLE stock_movements ALTER COLUMN movement_id TYPE VARCHAR(120);
    ALTER TABLE stock_movements ALTER COLUMN reference_id TYPE VARCHAR(100);
    ALTER TABLE stock_movements ALTER COLUMN idempotency_key TYPE VARCHAR(150);

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

    ALTER TABLE cashier_closing_transactions ADD COLUMN IF NOT EXISTS promo_discount NUMERIC(12,2) DEFAULT 0;
    ALTER TABLE cashier_closing_transactions ADD COLUMN IF NOT EXISTS manual_discount NUMERIC(12,2) DEFAULT 0;
    ALTER TABLE cashier_closing_transactions ADD COLUMN IF NOT EXISTS manual_discount_room NUMERIC(12,2) DEFAULT 0;
    ALTER TABLE cashier_closing_transactions ADD COLUMN IF NOT EXISTS manual_discount_fnb NUMERIC(12,2) DEFAULT 0;
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
          payment_status = $9,
          promo_discount = $10,
          manual_discount = $11,
          manual_discount_room = $12,
          manual_discount_fnb = $13
      WHERE closing_id = $14 AND transaction_id = $15
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
      transaction.promo_discount || 0,
      transaction.manual_discount || 0,
      transaction.manual_discount_room || 0,
      transaction.manual_discount_fnb || 0,
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
      const grossRoomTotal = Math.max(0, roomTotal + existingDiscount);
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

    const updatedRes = await client.query(`
      UPDATE transactions
      SET payment_status = 'paid',
          payment_method = $1,
          room_total = $2,
          promo_code = $3,
          promo_discount = $4,
          grand_total = $5
      WHERE transaction_id = $6
      RETURNING *
    `, [payment_method, roomTotal, appliedPromoCode, promoDiscount, grandTotal, transaction_id]);

    const updatedTransaction = updatedRes.rows[0];
    if (appliedPromoCode || promoDiscount > 0) {
      await writeOperationalAudit(client, {
        risk_level: 'high', domain: 'transaction', event_type: 'promo_applied',
        source_action: 'markTransactionPaid',
        initiated_by: String(payload.changed_by || payload.cashier_name || transaction.cashier_name || 'Kasir'),
        target_type: 'transaction', target_id: transaction_id, transaction_id,
        room_id: transaction.room_id, room_name: transaction.room_name,
        reason: `Promo/Voucher ${appliedPromoCode || prCode}`,
        amount_before: toNumber(transaction.grand_total),
        amount_after: grandTotal,
        old_value: transaction, new_value: updatedTransaction,
        metadata: { promo_code: appliedPromoCode || prCode, promo_discount: promoDiscount },
        idempotency_key: `audit:promo:${transaction_id}:${appliedPromoCode || prCode}`
      });
    }

    await client.query('COMMIT');

    return successResponse(res, {
      message: `Transaksi ${transaction_id} berhasil ditandai Lunas.`,
      transaction: serializeTransaction(updatedTransaction)
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
    await ensureTransactionCorrectionSchema(client);

    const trxCheck = await client.query('SELECT * FROM transactions WHERE transaction_id = $1 FOR UPDATE', [transactionId]);
    if (trxCheck.rowCount === 0) throw new Error('Transaksi tidak ditemukan.');
    const oldTransaction = trxCheck.rows[0];

    const fields = [];
    const changedFields = [];
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
        changedFields.push(field);
      }
    }

    if (fields.length === 0) throw new Error('Tidak ada field transaksi yang diperbarui.');
    params.push(transactionId);
    await client.query(`UPDATE transactions SET ${fields.join(', ')} WHERE transaction_id = $${params.length}`, params);

    const updatedTrx = await client.query('SELECT * FROM transactions WHERE transaction_id = $1', [transactionId]);
    if (updatedTrx.rowCount > 0) {
      await refreshClosingSnapshotForTransaction(client, updatedTrx.rows[0]);
    }

    const updatedTransaction = updatedTrx.rows[0];
    const initiatedBy = String(payload.changed_by || payload.cashier_name || oldTransaction.cashier_name || 'Operator').trim();
    const reason = String(payload.reason || `Perubahan detail transaksi: ${changedFields.join(', ')}`).trim();
    await writeOperationalAudit(client, {
      risk_level: changedFields.some(field => ['payment_status', 'room_total', 'fnb_total', 'lc_total', 'grand_total', 'cashier_name'].includes(field)) ? 'critical' : 'medium',
      domain: 'transaction', event_type: 'transaction_details_updated', source_action: 'updateTransactionDetails',
      initiated_by: initiatedBy,
      target_type: 'transaction', target_id: transactionId, transaction_id: transactionId,
      room_id: oldTransaction.room_id, room_name: oldTransaction.room_name, reason,
      amount_before: toNumber(oldTransaction.grand_total), amount_after: toNumber(updatedTransaction.grand_total),
      old_value: oldTransaction, new_value: updatedTransaction,
      metadata: { changed_fields: changedFields }
    });

    await client.query('COMMIT');

    const serialized = serializeTransaction(updatedTransaction);
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

    const authorizationActor = await validateOwnerPin(adminPin);

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

    const correctionId = `TCOR-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    await client.query(`
      INSERT INTO transaction_correction_logs (
        correction_id, transaction_id, correction_type, old_value_json,
        new_value_json, reason, corrected_by
      ) VALUES ($1, $2, 'package_correction', $3, $4, $5, $6)
    `, [
      correctionId,
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

    await writeOperationalAudit(client, {
      risk_level: 'high', domain: 'transaction', event_type: 'package_correction',
      source_action: 'correctTransactionPackage', source_table: 'transaction_correction_logs', source_record_id: correctionId,
      initiated_by: correctedBy, authorized_by: authorizationActor,
      target_type: 'transaction', target_id: transactionId, transaction_id: transactionId,
      room_id: oldTransaction.room_id, room_name: oldTransaction.room_name, reason,
      amount_before: toNumber(oldTransaction.grand_total), amount_after: grandTotal,
      old_value: oldTransaction, new_value: updatedTransaction
    });

    await refreshClosingSnapshotForTransaction(client, updatedTransaction);

    await client.query(`
      INSERT INTO sync_outbox (entity_type, entity_id, action, payload_json)
      VALUES ('transactions', $1, 'UPDATE', $2)
      ON CONFLICT (entity_type, entity_id, action) DO UPDATE
      SET payload_json = EXCLUDED.payload_json,
          status = 'pending',
          attempts = 0,
          last_attempt_at = NULL,
          error_message = NULL
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

    const authorizationActor = await validateOwnerPin(adminPin);

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

    const correctionId = `TCOR-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    await client.query(`
      INSERT INTO transaction_correction_logs (
        correction_id, transaction_id, correction_type, old_value_json,
        new_value_json, reason, corrected_by
      ) VALUES ($1, $2, 'free_room_correction', $3, $4, $5, $6)
    `, [
      correctionId,
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

    await writeOperationalAudit(client, {
      risk_level: 'high', domain: 'transaction', event_type: 'free_room_correction',
      source_action: 'correctTransactionFreeRoom', source_table: 'transaction_correction_logs', source_record_id: correctionId,
      initiated_by: correctedBy, authorized_by: authorizationActor,
      target_type: 'transaction', target_id: transactionId, transaction_id: transactionId,
      room_id: oldTransaction.room_id, room_name: oldTransaction.room_name, reason,
      amount_before: toNumber(oldTransaction.grand_total), amount_after: grandTotal,
      old_value: oldTransaction, new_value: updatedTransaction
    });

    await refreshClosingSnapshotForTransaction(client, updatedTransaction);

    await client.query(`
      INSERT INTO sync_outbox (entity_type, entity_id, action, payload_json)
      VALUES ('transactions', $1, 'UPDATE', $2)
      ON CONFLICT (entity_type, entity_id, action) DO UPDATE
      SET payload_json = EXCLUDED.payload_json,
          status = 'pending',
          attempts = 0,
          last_attempt_at = NULL,
          error_message = NULL
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

async function applyTransactionManualDiscount(req, res, payload) {
  let client;
  try {
    client = await db.pool.connect();
    await client.query('BEGIN');
    await ensureTransactionCorrectionSchema(client);

    const transactionId = String(payload.transaction_id || '').trim();
    const discountAmount = Math.max(0, Math.floor(toNumber(payload.discount_amount || payload.manual_discount)));
    const reason = String(payload.reason || payload.note || '').trim();
    const adminPin = String(payload.admin_pin || payload.manager_pin || payload.owner_pin || '').trim();
    const correctedBy = String(payload.changed_by || payload.corrected_by || 'Manager').trim();

    if (!transactionId) throw new Error('transaction_id wajib diisi.');
    if (discountAmount <= 0) throw new Error('Nilai diskon wajib lebih dari Rp 0.');
    if (reason.length < 5) throw new Error('Alasan diskon minimal 5 karakter.');

    const authorizationActor = await validateOwnerOrManagerPin(adminPin);

    const trxRes = await client.query('SELECT * FROM transactions WHERE transaction_id = $1 FOR UPDATE', [transactionId]);
    if (trxRes.rowCount === 0) throw new Error('Transaksi tidak ditemukan.');
    const oldTransaction = trxRes.rows[0];

    if (String(oldTransaction.payment_status || '').toLowerCase() === 'cancelled') {
      throw new Error('Transaksi yang sudah dibatalkan tidak bisa diberi diskon.');
    }

    const oldRoomTotal = toNumber(oldTransaction.room_total);
    const oldFnbTotal = toNumber(oldTransaction.fnb_total);
    const lcTotal = toNumber(oldTransaction.lc_total);
    const oldManualDiscount = toNumber(oldTransaction.manual_discount);
    const oldManualDiscountRoom = toNumber(oldTransaction.manual_discount_room);
    const oldManualDiscountFnb = toNumber(oldTransaction.manual_discount_fnb);
    const maxDiscount = oldRoomTotal + oldFnbTotal;
    if (maxDiscount <= 0) {
      throw new Error('Tidak ada nilai Room/F&B yang bisa dipotong. LC tidak ikut terkena diskon.');
    }
    if (discountAmount > maxDiscount) {
      throw new Error(`Diskon maksimal ${maxDiscount.toLocaleString('id-ID')} karena LC tidak ikut dipotong.`);
    }

    const roomDiscountApplied = Math.min(oldRoomTotal, discountAmount);
    const fnbDiscountApplied = Math.min(oldFnbTotal, discountAmount - roomDiscountApplied);
    const nextRoomTotal = Math.max(0, oldRoomTotal - roomDiscountApplied);
    const nextFnbTotal = Math.max(0, oldFnbTotal - fnbDiscountApplied);
    const nextManualDiscount = oldManualDiscount + roomDiscountApplied + fnbDiscountApplied;
    const nextManualDiscountRoom = oldManualDiscountRoom + roomDiscountApplied;
    const nextManualDiscountFnb = oldManualDiscountFnb + fnbDiscountApplied;
    const grandTotal = nextRoomTotal + nextFnbTotal + lcTotal;

    const updatedRes = await client.query(`
      UPDATE transactions
      SET room_total = $1,
          fnb_total = $2,
          grand_total = $3,
          manual_discount = $4,
          manual_discount_room = $5,
          manual_discount_fnb = $6,
          manual_discount_reason = $7,
          manual_discount_by = $8,
          manual_discount_at = CURRENT_TIMESTAMP,
          corrected_at = CURRENT_TIMESTAMP,
          corrected_by = $8,
          correction_note = $7
      WHERE transaction_id = $9
      RETURNING *
    `, [
      nextRoomTotal,
      nextFnbTotal,
      grandTotal,
      nextManualDiscount,
      nextManualDiscountRoom,
      nextManualDiscountFnb,
      reason,
      correctedBy,
      transactionId
    ]);
    const updatedTransaction = updatedRes.rows[0];

    const correctionId = `TCOR-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    await client.query(`
      INSERT INTO transaction_correction_logs (
        correction_id, transaction_id, correction_type, old_value_json,
        new_value_json, reason, corrected_by
      ) VALUES ($1, $2, 'manual_discount_correction', $3, $4, $5, $6)
    `, [
      correctionId,
      transactionId,
      JSON.stringify({
        room_total: oldRoomTotal,
        fnb_total: oldFnbTotal,
        lc_total: lcTotal,
        grand_total: toNumber(oldTransaction.grand_total),
        manual_discount: oldManualDiscount,
        manual_discount_room: oldManualDiscountRoom,
        manual_discount_fnb: oldManualDiscountFnb,
        payment_status: oldTransaction.payment_status || ''
      }),
      JSON.stringify({
        room_total: nextRoomTotal,
        fnb_total: nextFnbTotal,
        lc_total: lcTotal,
        grand_total: grandTotal,
        manual_discount: nextManualDiscount,
        manual_discount_room: nextManualDiscountRoom,
        manual_discount_fnb: nextManualDiscountFnb,
        discount_amount: roomDiscountApplied + fnbDiscountApplied,
        room_discount_applied: roomDiscountApplied,
        fnb_discount_applied: fnbDiscountApplied,
        payment_status: updatedTransaction.payment_status || ''
      }),
      reason,
      correctedBy
    ]);

    await writeOperationalAudit(client, {
      risk_level: 'high', domain: 'transaction', event_type: 'manual_discount_correction',
      source_action: 'applyTransactionManualDiscount', source_table: 'transaction_correction_logs', source_record_id: correctionId,
      initiated_by: correctedBy, authorized_by: authorizationActor,
      target_type: 'transaction', target_id: transactionId, transaction_id: transactionId,
      room_id: oldTransaction.room_id, room_name: oldTransaction.room_name, reason,
      amount_before: toNumber(oldTransaction.grand_total), amount_after: grandTotal,
      old_value: oldTransaction, new_value: updatedTransaction,
      metadata: { discount_amount: roomDiscountApplied + fnbDiscountApplied }
    });

    await refreshClosingSnapshotForTransaction(client, updatedTransaction);

    await client.query(`
      INSERT INTO sync_outbox (entity_type, entity_id, action, payload_json)
      VALUES ('transactions', $1, 'UPDATE', $2)
      ON CONFLICT (entity_type, entity_id, action) DO UPDATE
      SET payload_json = EXCLUDED.payload_json,
          status = 'pending',
          attempts = 0,
          last_attempt_at = NULL,
          error_message = NULL
    `, [transactionId, JSON.stringify(serializeTransaction(updatedTransaction))]);

    await client.query('COMMIT');
    return successResponse(res, {
      message: 'Diskon management berhasil ditambahkan.',
      transaction: serializeTransaction(updatedTransaction),
      discount_amount: roomDiscountApplied + fnbDiscountApplied,
      room_discount_applied: roomDiscountApplied,
      fnb_discount_applied: fnbDiscountApplied
    });
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    return errorResponse(res, err.message);
  } finally {
    if (client) client.release();
  }
}

async function voidTransactionFnbOrder(req, res, payload) {
  let client;
  try {
    client = await db.pool.connect();
    await client.query('BEGIN');
    await ensureTransactionCorrectionSchema(client);

    const transactionId = String(payload.transaction_id || '').trim();
    const orderId = String(payload.order_id || '').trim();
    const reason = String(payload.reason || payload.note || '').trim();
    const adminPin = String(payload.admin_pin || payload.owner_pin || '').trim();
    const voidedBy = String(payload.changed_by || payload.voided_by || 'Owner').trim();

    let targetOrderItemIds = [];
    if (Array.isArray(payload.order_item_ids)) {
      targetOrderItemIds = payload.order_item_ids.map(id => String(id).trim()).filter(Boolean);
    } else if (payload.order_item_id) {
      targetOrderItemIds = [String(payload.order_item_id).trim()];
    }

    if (!transactionId) throw new Error('transaction_id wajib diisi.');
    if (reason.length < 5) throw new Error('Alasan pembatalan minimal 5 karakter.');

    // 1. Validate Owner or Manager PIN
    const authorizationActor = await validateOwnerOrManagerPin(adminPin);

    // 2. Fetch Transaction
    const trxRes = await client.query('SELECT * FROM transactions WHERE transaction_id = $1 FOR UPDATE', [transactionId]);
    if (trxRes.rowCount === 0) throw new Error('Transaksi tidak ditemukan.');
    const oldTransaction = trxRes.rows[0];

    if (String(oldTransaction.payment_status || '').toLowerCase() === 'cancelled') {
      throw new Error('Transaksi yang sudah dibatalkan tidak bisa dikoreksi.');
    }

    // Determine target orders from transaction
    const transactionOrderIds = String(oldTransaction.fnb_order_ids || '')
      .split(',')
      .map(id => id.trim())
      .filter(Boolean);

    // 3. Find items to void
    let itemsToVoid = [];
    if (targetOrderItemIds.length > 0) {
      const itemsRes = await client.query(`
        SELECT foi.*, m.stock_tracking, m.stock_item_id, m.stock_qty_per_unit, m.menu_name AS m_name
        FROM fnb_order_items foi
        LEFT JOIN menu m ON foi.menu_id = m.menu_id
        WHERE foi.order_item_id = ANY($1) AND (foi.is_voided IS FALSE OR foi.is_voided IS NULL)
      `, [targetOrderItemIds]);
      itemsToVoid = itemsRes.rows;
    } else if (orderId) {
      const itemsRes = await client.query(`
        SELECT foi.*, m.stock_tracking, m.stock_item_id, m.stock_qty_per_unit, m.menu_name AS m_name
        FROM fnb_order_items foi
        LEFT JOIN menu m ON foi.menu_id = m.menu_id
        WHERE foi.order_id = $1 AND (foi.is_voided IS FALSE OR foi.is_voided IS NULL)
      `, [orderId]);
      itemsToVoid = itemsRes.rows;
    } else {
      throw new Error('order_id atau order_item_ids wajib diisi.');
    }

    if (itemsToVoid.length === 0) {
      throw new Error('Tidak ada item F&B aktif yang ditemukan untuk dibatalkan.');
    }

    let totalVoidedAmount = 0;
    const restoredMovements = [];
    const affectedOrderIds = new Set();

    // 4. Restore Inventory Stock for each item to void
    for (const item of itemsToVoid) {
      affectedOrderIds.add(item.order_id);
      const itemSubtotal = toNumber(item.subtotal, toNumber(item.price, 0) * toNumber(item.quantity, 1));
      totalVoidedAmount += itemSubtotal;
      const orderQty = toNumber(item.quantity, 1);

      // Direct menu stock tracking
      if (item.stock_tracking === 'yes' && item.stock_item_id) {
        const invRes = await client.query('SELECT * FROM inventory WHERE stock_item_id = $1 FOR UPDATE', [item.stock_item_id]);
        if (invRes.rowCount > 0) {
          const inv = invRes.rows[0];
          const qtyReturn = orderQty * toNumber(item.stock_qty_per_unit, 1);
          const stockBefore = toNumber(inv.stock_qty, 0);
          const stockAfter = stockBefore + qtyReturn;

          await client.query('UPDATE inventory SET stock_qty = $1, updated_at = CURRENT_TIMESTAMP WHERE stock_item_id = $2', [stockAfter, item.stock_item_id]);

          const movementId = `MOV-V-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
          await client.query(`
            INSERT INTO stock_movements (
              movement_id, stock_item_id, stock_item_name, movement_type,
              reference_type, reference_id, qty_change, stock_before, stock_after, note, cashier_name, idempotency_key
            ) VALUES ($1, $2, $3, 'in', 'transaction', $4, $5, $6, $7, $8, $9, $1)
            ON CONFLICT (idempotency_key) DO NOTHING
          `, [movementId, item.stock_item_id, inv.stock_item_name, transactionId, qtyReturn, stockBefore, stockAfter, `Void Item: ${item.menu_name} (${orderQty}x) | ${reason}`, voidedBy]);

          restoredMovements.push({
            order_item_id: item.order_item_id,
            menu_name: item.menu_name,
            stock_item_id: item.stock_item_id,
            stock_item_name: inv.stock_item_name,
            qty_restored: qtyReturn,
            stock_after: stockAfter,
            subtotal: itemSubtotal
          });
        }
      }

      // Komponen paket memakai snapshot transaksi agar perubahan resep master
      // tidak mengubah jumlah stok yang dikembalikan pada void/refund.
      if (item.menu_id) {
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
              qty_to_restore: toNumber(component.total_qty, 0)
            }))
          : (await client.query('SELECT * FROM recipe WHERE menu_id = $1', [item.menu_id])).rows.map(recipe => ({
              item_id: recipe.item_id,
              component_name: recipe.item_id,
              component_mode: recipe.component_mode || 'included',
              qty_to_restore: orderQty * toNumber(recipe.qty_used, 1)
            }));

        for (const component of componentRows) {
          const recipeInvRes = await client.query('SELECT * FROM inventory WHERE stock_item_id = $1 FOR UPDATE', [component.item_id]);
          if (recipeInvRes.rowCount > 0) {
            const rInv = recipeInvRes.rows[0];
            const recipeReturn = toNumber(component.qty_to_restore, 0);
            const rStockBefore = toNumber(rInv.stock_qty, 0);
            const rStockAfter = rStockBefore + recipeReturn;

            await client.query('UPDATE inventory SET stock_qty = $1, updated_at = CURRENT_TIMESTAMP WHERE stock_item_id = $2', [rStockAfter, component.item_id]);

            const rMovementId = `MOV-VR-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
            await client.query(`
              INSERT INTO stock_movements (
                movement_id, stock_item_id, stock_item_name, movement_type,
                reference_type, reference_id, qty_change, stock_before, stock_after, note, cashier_name, idempotency_key
              ) VALUES ($1, $2, $3, 'in', 'transaction', $4, $5, $6, $7, $8, $9, $1)
              ON CONFLICT (idempotency_key) DO NOTHING
            `, [rMovementId, component.item_id, rInv.stock_item_name, transactionId, recipeReturn, rStockBefore, rStockAfter, `Void komponen ${component.component_mode === 'bonus' ? 'bonus' : 'paket'}: ${item.menu_name} | ${reason}`, voidedBy]);

            restoredMovements.push({
              order_item_id: item.order_item_id,
              menu_name: item.menu_name,
              stock_item_id: component.item_id,
              stock_item_name: rInv.stock_item_name,
              qty_restored: recipeReturn,
              stock_after: rStockAfter,
              subtotal: 0
            });
          }
        }
      }

      // Mark this order item as voided
      await client.query(`
        UPDATE fnb_order_items
        SET is_voided = TRUE,
            void_reason = $1,
            voided_at = CURRENT_TIMESTAMP,
            voided_by = $2
        WHERE order_item_id = $3
      `, [reason, voidedBy, item.order_item_id]);
    }

    // 5. Update fnb_orders for all affected orders
    const allRelevantOrderIds = Array.from(new Set([...transactionOrderIds, ...affectedOrderIds]));

    for (const ordId of allRelevantOrderIds) {
      const activeItemsRes = await client.query(`
        SELECT COALESCE(SUM(subtotal), 0) AS remaining_total, COUNT(*)::int AS active_count
        FROM fnb_order_items
        WHERE order_id = $1 AND (is_voided IS FALSE OR is_voided IS NULL)
      `, [ordId]);

      const remainingTotal = toNumber(activeItemsRes.rows[0]?.remaining_total, 0);
      const activeCount = activeItemsRes.rows[0]?.active_count || 0;

      if (activeCount === 0) {
        await client.query(`
          UPDATE fnb_orders
          SET order_status = 'cancelled',
              order_total = 0,
              cancel_reason = $1,
              cancelled_by = $2,
              cancelled_at = CURRENT_TIMESTAMP,
              updated_at = CURRENT_TIMESTAMP
          WHERE order_id = $3
        `, [reason, voidedBy, ordId]);
      } else {
        await client.query(`
          UPDATE fnb_orders
          SET order_total = $1,
              updated_at = CURRENT_TIMESTAMP
          WHERE order_id = $2
        `, [remainingTotal, ordId]);
      }
    }

    // 6. Recalculate Transaction fnb_total and grand_total
    let newFnbTotal = 0;
    if (allRelevantOrderIds.length > 0) {
      const fnbTotalsRes = await client.query(`
        SELECT COALESCE(SUM(order_total), 0) AS new_total
        FROM fnb_orders
        WHERE order_id = ANY($1) AND order_status != 'cancelled'
      `, [allRelevantOrderIds]);
      newFnbTotal = toNumber(fnbTotalsRes.rows[0]?.new_total, 0);
    }

    // Filter active order IDs that are not cancelled
    const activeOrderIdsRes = await client.query(`
      SELECT order_id FROM fnb_orders
      WHERE order_id = ANY($1) AND order_status != 'cancelled'
    `, [allRelevantOrderIds]);
    const remainingActiveOrderIds = activeOrderIdsRes.rows.map(r => r.order_id);

    const roomTotal = toNumber(oldTransaction.room_total, 0);
    const lcTotal = toNumber(oldTransaction.lc_total, 0);
    const newGrandTotal = roomTotal + newFnbTotal + lcTotal;

    const isGeneralFnbOnly = String(oldTransaction.room_id || '').toUpperCase() === 'FNB-GENERAL';
    const nextPaymentStatus = (isGeneralFnbOnly && newGrandTotal === 0) ? 'cancelled' : oldTransaction.payment_status;

    const voidedNames = itemsToVoid.map(it => `${it.menu_name} (${it.quantity}x)`).join(', ');

    const updatedRes = await client.query(`
      UPDATE transactions
      SET fnb_total = $1,
          grand_total = $2,
          fnb_order_ids = $3,
          payment_status = $4,
          corrected_at = CURRENT_TIMESTAMP,
          corrected_by = $5,
          correction_note = $6
      WHERE transaction_id = $7
      RETURNING *
    `, [
      newFnbTotal,
      newGrandTotal,
      remainingActiveOrderIds.join(','),
      nextPaymentStatus,
      voidedBy,
      `Void Item F&B: ${voidedNames} (-Rp ${totalVoidedAmount.toLocaleString('id-ID')}) | ${reason}`,
      transactionId
    ]);
    const updatedTransaction = updatedRes.rows[0];

    // 7. Audit log in transaction_correction_logs
    const correctionId = `TCOR-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    await client.query(`
      INSERT INTO transaction_correction_logs (
        correction_id, transaction_id, correction_type, old_value_json,
        new_value_json, reason, corrected_by
      ) VALUES ($1, $2, 'fnb_item_void_correction', $3, $4, $5, $6)
    `, [
      correctionId,
      transactionId,
      JSON.stringify({
        fnb_total: toNumber(oldTransaction.fnb_total),
        grand_total: toNumber(oldTransaction.grand_total),
        fnb_order_ids: oldTransaction.fnb_order_ids || '',
        voided_items: itemsToVoid.map(it => ({ order_item_id: it.order_item_id, menu_name: it.menu_name, quantity: it.quantity, subtotal: it.subtotal }))
      }),
      JSON.stringify({
        fnb_total: newFnbTotal,
        grand_total: newGrandTotal,
        fnb_order_ids: remainingActiveOrderIds.join(','),
        voided_items: itemsToVoid.map(it => ({ order_item_id: it.order_item_id, menu_name: it.menu_name, quantity: it.quantity, subtotal: it.subtotal })),
        restored_stock: restoredMovements
      }),
      reason,
      voidedBy
    ]);

    await writeOperationalAudit(client, {
      risk_level: 'high', domain: 'fnb', event_type: 'fnb_item_void_correction',
      source_action: 'voidTransactionFnbOrder', source_table: 'transaction_correction_logs', source_record_id: correctionId,
      initiated_by: voidedBy, authorized_by: authorizationActor,
      target_type: 'transaction', target_id: transactionId, transaction_id: transactionId,
      room_id: oldTransaction.room_id, room_name: oldTransaction.room_name, reason,
      amount_before: toNumber(oldTransaction.grand_total), amount_after: newGrandTotal,
      old_value: oldTransaction, new_value: updatedTransaction,
      metadata: {
        voided_amount: totalVoidedAmount,
        voided_items: itemsToVoid.map(item => ({ order_item_id: item.order_item_id, menu_name: item.menu_name, quantity: item.quantity })),
        restored_stock: restoredMovements
      }
    });

    // 8. Refresh closing snapshot
    await refreshClosingSnapshotForTransaction(client, updatedTransaction);

    // 9. Sync outbox
    await client.query(`
      INSERT INTO sync_outbox (entity_type, entity_id, action, payload_json)
      VALUES ('transactions', $1, 'UPDATE', $2)
      ON CONFLICT (entity_type, entity_id, action) DO UPDATE
      SET payload_json = EXCLUDED.payload_json,
          status = 'pending',
          attempts = 0,
          last_attempt_at = NULL,
          error_message = NULL
    `, [transactionId, JSON.stringify(serializeTransaction(updatedTransaction))]);

    for (const ordId of affectedOrderIds) {
      await client.query(`
        INSERT INTO sync_outbox (entity_type, entity_id, action, payload_json)
        VALUES ('fnb_orders', $1, 'UPDATE', $2)
        ON CONFLICT (entity_type, entity_id, action) DO UPDATE
        SET payload_json = EXCLUDED.payload_json,
            status = 'pending',
            attempts = 0,
            last_attempt_at = NULL,
            error_message = NULL
      `, [ordId, JSON.stringify({ order_id: ordId, note: `Item void: ${voidedNames}` })]);
    }

    await client.query('COMMIT');

    return successResponse(res, {
      message: `Item F&B (${voidedNames}) berhasil divoid. Total tagihan berkurang Rp ${totalVoidedAmount.toLocaleString('id-ID')} dan stok telah dikembalikan.`,
      transaction: serializeTransaction(updatedTransaction),
      voided_amount: totalVoidedAmount,
      voided_items: itemsToVoid,
      restored_stock: restoredMovements
    });
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    return errorResponse(res, err.message);
  } finally {
    if (client) client.release();
  }
}

async function deleteTransaction(req, res, payload) {
  let client;
  try {
    client = await db.pool.connect();
    await client.query('BEGIN');
    await ensureTransactionCorrectionSchema(client);
    const transactionId = String(payload.transaction_id || '').trim();
    const reason = String(payload.reason || '').trim();
    const initiatedBy = String(payload.changed_by || 'Operator').trim();
    if (!transactionId) throw new Error('transaction_id wajib diisi.');
    if (reason.length < 5) throw new Error('Alasan pembatalan minimal 5 karakter.');
    if (String(payload.confirmation || '').trim().toUpperCase() !== 'HAPUS') throw new Error('Konfirmasi HAPUS wajib diisi.');
    const authorizationActor = await validateOwnerPin(String(payload.owner_pin || payload.admin_pin || ''));

    const oldRes = await client.query('SELECT * FROM transactions WHERE transaction_id = $1 FOR UPDATE', [transactionId]);
    if (oldRes.rowCount === 0) throw new Error('Transaksi tidak ditemukan.');
    const oldTransaction = oldRes.rows[0];
    if (String(oldTransaction.payment_status || '').toLowerCase() === 'cancelled') throw new Error('Transaksi sudah dibatalkan.');

    const updatedRes = await client.query(`
      UPDATE transactions
      SET payment_status = 'cancelled', corrected_at = CURRENT_TIMESTAMP,
          corrected_by = $1, correction_note = $2
      WHERE transaction_id = $3
      RETURNING *
    `, [initiatedBy, reason, transactionId]);
    const updatedTransaction = updatedRes.rows[0];
    const correctionId = `TCOR-CANCEL-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    await client.query(`
      INSERT INTO transaction_correction_logs (
        correction_id, transaction_id, correction_type, old_value_json,
        new_value_json, reason, corrected_by
      ) VALUES ($1, $2, 'transaction_cancelled', $3, $4, $5, $6)
    `, [correctionId, transactionId, oldTransaction, updatedTransaction, reason, initiatedBy]);

    await writeOperationalAudit(client, {
      risk_level: 'critical', domain: 'transaction', event_type: 'transaction_cancelled',
      source_action: 'deleteTransaction', source_table: 'transaction_correction_logs', source_record_id: correctionId,
      initiated_by: initiatedBy, authorized_by: authorizationActor,
      target_type: 'transaction', target_id: transactionId, transaction_id: transactionId,
      room_id: oldTransaction.room_id, room_name: oldTransaction.room_name, reason,
      amount_before: toNumber(oldTransaction.grand_total), amount_after: 0,
      old_value: oldTransaction, new_value: updatedTransaction
    });
    await refreshClosingSnapshotForTransaction(client, updatedTransaction);
    await client.query('COMMIT');
    return successResponse(res, {
      message: 'Transaksi berhasil dibatalkan dan dicatat di audit.',
      transaction_id: transactionId,
      transaction: serializeTransaction(updatedTransaction)
    });
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    return errorResponse(res, err.message);
  } finally {
    if (client) client.release();
  }
}

async function getTransactionLcDetails(req, res) {
  try {
    const transactionId = req.query.transaction_id || '';
    if (!transactionId) throw new Error('transaction_id wajib diisi.');
    const trxRes = await db.query('SELECT * FROM transactions WHERE transaction_id = $1', [transactionId]);
    if (trxRes.rowCount === 0) return errorResponse(res, 'Transaksi tidak ditemukan.', 'TRANSACTION_NOT_FOUND');
    const trx = trxRes.rows[0];
    let logsRes = await db.query(`
      SELECT * FROM lc_work_logs
      WHERE closed_transaction_id = $1 AND status != 'cancelled'
      ORDER BY created_at ASC, log_id ASC
    `, [transactionId]);

    // Fallback read-only untuk transaksi lama sebelum kolom relasi langsung tersedia.
    if (logsRes.rowCount === 0) {
      logsRes = await db.query(`
        SELECT * FROM lc_work_logs
        WHERE room_id = $1
          AND created_at >= $2::timestamptz
          AND created_at <= COALESCE($3::timestamptz, CURRENT_TIMESTAMP)
          AND status != 'cancelled'
        ORDER BY created_at ASC, log_id ASC
        LIMIT 20
      `, [trx.room_id, trx.start_time, trx.end_time]);
    }

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
    const payrollLocked = uniqueRows.some(row => Boolean(row.payroll_id));
    const cancelled = String(trx.payment_status || '').toLowerCase() === 'cancelled';
    const canEdit = uniqueRows.length > 0 && !payrollLocked && !cancelled;
    const blockedReason = cancelled
      ? 'Transaksi yang dibatalkan tidak dapat direvisi.'
      : payrollLocked
        ? 'Durasi LC tidak dapat direvisi karena honor LC sudah masuk payroll.'
        : uniqueRows.length === 0
          ? 'Detail LC transaksi tidak ditemukan.'
          : '';
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
      transaction_id: transactionId,
      room_id: trx.room_id,
      room_name: trx.room_name,
      current_lc_total: lcTotal,
      current_grand_total: Number(trx.grand_total || 0),
      can_edit: canEdit,
      requires_admin_pin: false,
      blocked_reason: blockedReason,
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
    const transactionId = String(payload.transaction_id || '').trim();
    const updates = Array.isArray(payload.assignments)
      ? payload.assignments
      : Array.isArray(payload.lc_assignments)
        ? payload.lc_assignments
        : [];
    const reason = String(payload.reason || '').trim();
    const changedBy = String(payload.changed_by || payload.cashier_name || 'Kasir').trim();
    if (!transactionId) throw new Error('transaction_id wajib diisi.');
    if (updates.length === 0) throw new Error('Daftar perubahan durasi LC wajib diisi.');
    if (reason.length < 3) throw new Error('Alasan perubahan minimal 3 karakter.');

    const trxRes = await client.query('SELECT * FROM transactions WHERE transaction_id = $1 FOR UPDATE', [transactionId]);
    if (trxRes.rowCount === 0) throw new Error('Transaksi tidak ditemukan.');
    const trx = trxRes.rows[0];
    if (String(trx.payment_status || '').toLowerCase() === 'cancelled') {
      throw new Error('Transaksi yang dibatalkan tidak dapat direvisi.');
    }

    let logsRes = await client.query(`
      SELECT * FROM lc_work_logs
      WHERE closed_transaction_id = $1 AND status != 'cancelled'
      ORDER BY created_at ASC, log_id ASC
      FOR UPDATE
    `, [transactionId]);

    // Migrasi aman untuk transaksi lama: ikat dahulu log yang berada tepat di
    // rentang transaksi, kemudian seluruh perubahan berikutnya memakai log_id.
    if (logsRes.rowCount === 0) {
      logsRes = await client.query(`
        SELECT * FROM lc_work_logs
        WHERE room_id = $1
          AND created_at >= $2::timestamptz
          AND created_at <= COALESCE($3::timestamptz, CURRENT_TIMESTAMP)
          AND status != 'cancelled'
        ORDER BY created_at ASC, log_id ASC
        FOR UPDATE
      `, [trx.room_id, trx.start_time, trx.end_time]);
      if (logsRes.rowCount > 0) {
        await client.query(`
          UPDATE lc_work_logs SET closed_transaction_id = $1
          WHERE log_id = ANY($2)
        `, [transactionId, logsRes.rows.map(row => row.log_id)]);
      }
    }

    const uniqueLogs = Array.from(logsRes.rows.reduce((map, row) => {
      if (!row.lc_id || map.has(row.lc_id)) return map;
      map.set(row.lc_id, row);
      return map;
    }, new Map()).values());
    if (uniqueLogs.length === 0) throw new Error('Detail LC transaksi tidak ditemukan.');
    if (uniqueLogs.some(row => Boolean(row.payroll_id))) {
      throw new Error('Durasi LC tidak dapat direvisi karena honor LC sudah masuk payroll.');
    }

    const oldLcTotal = Number(trx.lc_total || 0);
    const oldGrandTotal = Number(trx.grand_total || 0);
    const oldItems = uniqueLogs.map(row => ({
      log_id: row.log_id,
      lc_id: row.lc_id,
      lc_name: row.lc_name,
      duration_minutes: Number(row.duration_minutes || 0),
      rate_per_hour: Number(row.rate_per_hour || 0),
      rate: Number(row.rate || 0)
    }));

    let lcTotal = 0;
    const newItems = [];
    for (const log of uniqueLogs) {
      const item = updates.find(update => (
        (update.log_id && String(update.log_id) === String(log.log_id))
        || (!update.log_id && update.lc_id && String(update.lc_id) === String(log.lc_id))
      ));
      const duration = Math.round(Number(item?.duration_minutes ?? log.duration_minutes));
      if (!Number.isFinite(duration) || duration < 30 || duration > 720 || duration % 30 !== 0) {
        throw new Error(`Durasi ${log.lc_name || log.lc_id} harus kelipatan 30 menit antara 30 menit sampai 12 jam.`);
      }
      const hourlyRate = Number(log.rate_per_hour || 0);
      if (hourlyRate <= 0) throw new Error(`Tarif historis ${log.lc_name || log.lc_id} tidak valid.`);
      const rate = Math.ceil(duration / 60) * hourlyRate;
      lcTotal += rate;
      await client.query(`
        UPDATE lc_work_logs
        SET duration_minutes = $1, rate_per_hour = $2, rate = $3
        WHERE log_id = $4 AND closed_transaction_id = $5 AND status <> 'cancelled'
      `, [duration, hourlyRate, rate, log.log_id, transactionId]);
      newItems.push({
        log_id: log.log_id,
        lc_id: log.lc_id,
        lc_name: log.lc_name,
        duration_minutes: duration,
        rate_per_hour: hourlyRate,
        rate
      });
    }

    const grandTotal = Number(trx.room_total || 0) + Number(trx.fnb_total || 0) + lcTotal;
    const updatedRes = await client.query(`
      UPDATE transactions
      SET lc_total = $1,
          grand_total = $2,
          corrected_at = CURRENT_TIMESTAMP,
          corrected_by = $3,
          correction_note = $4
      WHERE transaction_id = $5
      RETURNING *
    `, [lcTotal, grandTotal, changedBy, reason, transactionId]);
    const updatedTransaction = updatedRes.rows[0];

    const correctionId = `TCOR-LC-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    await client.query(`
      INSERT INTO transaction_correction_logs (
        correction_id, transaction_id, correction_type, old_value_json,
        new_value_json, reason, corrected_by
      ) VALUES ($1, $2, 'lc_duration_correction', $3, $4, $5, $6)
    `, [
      correctionId,
      transactionId,
      JSON.stringify({ lc_total: oldLcTotal, grand_total: oldGrandTotal, items: oldItems }),
      JSON.stringify({ lc_total: lcTotal, grand_total: grandTotal, items: newItems }),
      reason,
      changedBy
    ]);

    await writeOperationalAudit(client, {
      risk_level: 'high', domain: 'lc', event_type: 'lc_duration_correction',
      source_action: 'updateTransactionLcDurations', source_table: 'transaction_correction_logs', source_record_id: correctionId,
      initiated_by: changedBy,
      target_type: 'transaction', target_id: transactionId, transaction_id: transactionId,
      room_id: trx.room_id, room_name: trx.room_name, reason,
      amount_before: oldGrandTotal, amount_after: grandTotal,
      old_value: { lc_total: oldLcTotal, grand_total: oldGrandTotal, items: oldItems },
      new_value: { lc_total: lcTotal, grand_total: grandTotal, items: newItems }
    });

    await refreshClosingSnapshotForTransaction(client, updatedTransaction);
    await client.query(`
      INSERT INTO sync_outbox (entity_type, entity_id, action, payload_json)
      VALUES ('transactions', $1, 'UPDATE', $2)
      ON CONFLICT (entity_type, entity_id, action) DO UPDATE
      SET payload_json = EXCLUDED.payload_json, status = 'pending', attempts = 0,
          last_attempt_at = NULL, error_message = NULL
    `, [transactionId, JSON.stringify(serializeTransaction(updatedTransaction))]);

    await client.query('COMMIT');
    return successResponse(res, {
      message: 'Durasi LC dan total tagihan berhasil diperbarui.',
      transaction: serializeTransaction(updatedTransaction),
      transaction_id: transactionId,
      old_lc_total: oldLcTotal,
      lc_total: lcTotal,
      difference: lcTotal - oldLcTotal,
      grand_total: grandTotal,
      lc_logs: newItems,
      can_edit: true,
      requires_admin_pin: false
    });
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
    const enteredBy = String(payload.entered_by || cashierName).trim();
    const sourceReason = String(payload.source_note || payload.reason || payload.note || 'Transaksi manual saat gangguan sistem').trim();
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

    await writeOperationalAudit(client, {
      risk_level: 'high', domain: 'transaction', event_type: 'manual_outage_transaction',
      source_action: 'createManualOutageTransaction',
      initiated_by: enteredBy,
      target_type: 'transaction', target_id: transactionId, transaction_id: transactionId,
      room_id: mode === 'room' ? roomId : 'FNB-GENERAL', room_name: roomName,
      reason: sourceReason,
      amount_before: 0, amount_after: grandTotal,
      new_value: {
        mode, room_id: mode === 'room' ? roomId : 'FNB-GENERAL', room_name: roomName,
        duration_minutes: durationMinutes, room_total: roomTotal, fnb_total: fnbTotal,
        lc_total: lcTotal, grand_total: grandTotal, payment_method: paymentMethod,
        payment_status: paymentStatus, package_id: transactionPackageId,
        package_name: transactionPackageName
      },
      metadata: {
        backdated_start_time: startTime.toISOString(),
        recorded_cashier_name: cashierName,
        fnb_item_count: fnbItems.length,
        lc_count: lcAssignments.length
      },
      idempotency_key: `audit:${idempotencyKey}`
    });

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
  applyTransactionManualDiscount,
  deleteTransaction,
  getTransactionLcEditDetails: getTransactionLcDetails,
  getTransactionLcReceiptDetails: getTransactionLcDetails,
  updateTransactionLcDurations,
  createManualOutageTransaction,
  voidTransactionFnbOrder,
};
