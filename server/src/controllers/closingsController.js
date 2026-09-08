const db = require('../db');
const { successResponse, errorResponse } = require('../utils/response');
const { getOperationalDate, getOperationalDateRange } = require('../utils/operationalDate');

function toNumber(value, fallback = 0) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function getPaymentBreakdown(row) {
  const paymentStatus = String(row?.payment_status || '').toLowerCase();
  const paymentMethod = String(row?.payment_method || '').toLowerCase();
  const grandTotal = toNumber(row?.grand_total || 0);
  const cashAmount = toNumber(row?.cash_amount || 0);
  const transferAmount = toNumber(row?.transfer_amount || 0);

  if (paymentStatus !== 'paid') return { cash_amount: 0, transfer_amount: 0 };
  if (paymentMethod === 'split') {
    if (cashAmount + transferAmount === grandTotal) {
      return { cash_amount: cashAmount, transfer_amount: transferAmount };
    }
    const safeCash = Math.min(grandTotal, Math.max(0, cashAmount));
    const safeTransfer = Math.max(0, toNumber(grandTotal - safeCash));
    return { cash_amount: safeCash, transfer_amount: safeTransfer };
  }
  if (paymentMethod === 'cash') return { cash_amount: grandTotal, transfer_amount: 0 };
  if (paymentMethod === 'transfer' || paymentMethod === 'qris') return { cash_amount: 0, transfer_amount: grandTotal };
  return { cash_amount: 0, transfer_amount: 0 };
}

async function ensureClosingCommissionSchema(client = db) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS sales_commission_logs (
      commission_id VARCHAR(80) PRIMARY KEY,
      transaction_id VARCHAR(50) NOT NULL UNIQUE REFERENCES transactions(transaction_id) ON DELETE CASCADE,
      operational_date DATE NOT NULL,
      basis_type VARCHAR(30) NOT NULL DEFAULT 'grand_total',
      basis_amount NUMERIC(12,2) NOT NULL,
      commission_percent NUMERIC(7,4) NOT NULL,
      commission_amount NUMERIC(12,2) NOT NULL,
      recipient_name VARCHAR(100) NOT NULL,
      cashier_name VARCHAR(100) NOT NULL,
      note TEXT,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
    ALTER TABLE cashier_closings ADD COLUMN IF NOT EXISTS sales_commission_total NUMERIC(12,2) DEFAULT 0;
    ALTER TABLE cashier_closings ADD COLUMN IF NOT EXISTS net_revenue_after_commission NUMERIC(12,2) DEFAULT 0;
  `);
}

async function getTodayCashierClosings(req, res) {
  try {
    await ensureClosingCommissionSchema();
    const { period, start_date, end_date } = req.query;
    const { startDate, endDate } = getOperationalDateRange(period, start_date, end_date);

    const result = await db.query(`
      SELECT * FROM cashier_closings
      WHERE closing_date >= $1 AND closing_date <= $2
      ORDER BY created_at DESC
    `, [startDate, endDate]);

    const closings = result.rows.map(c => ({
      closing_id: c.closing_id,
      closing_date: c.closing_date ? c.closing_date.toISOString().split('T')[0] : '',
      cashier_name: c.cashier_name,
      total_transactions: c.total_transactions,
      paid_transactions: c.paid_transactions,
      unpaid_transactions: c.unpaid_transactions,
      cash_transactions: c.cash_transactions,
      transfer_transactions: c.transfer_transactions,
      paid_revenue: Number(c.paid_revenue),
      cash_expected: Number(c.cash_expected),
      cash_actual: Number(c.cash_actual),
      cash_difference: Number(c.cash_difference),
      transfer_revenue: Number(c.transfer_revenue),
      sales_commission_total: Number(c.sales_commission_total || 0),
      operational_expense_total: Number(c.operational_expense_total || 0),
      net_revenue_after_commission: Number(c.net_revenue_after_commission || 0),
      unpaid_revenue: Number(c.unpaid_revenue),
      total_revenue: Number(c.total_revenue),
      note: c.note || '',
      created_at: new Date(c.created_at).toISOString()
    }));

    return res.json({ ok: true, success: true, closings });
  } catch (err) {
    return errorResponse(res, err.message);
  }
}

async function saveCashierClosing(req, res, payload) {
  let client;
  try {
    client = await db.pool.connect();
    await client.query('BEGIN');
    await client.query(`
      ALTER TABLE cashier_closing_transactions ADD COLUMN IF NOT EXISTS promo_discount NUMERIC(12,2) DEFAULT 0;
      ALTER TABLE cashier_closing_transactions ADD COLUMN IF NOT EXISTS manual_discount NUMERIC(12,2) DEFAULT 0;
      ALTER TABLE cashier_closing_transactions ADD COLUMN IF NOT EXISTS manual_discount_room NUMERIC(12,2) DEFAULT 0;
      ALTER TABLE cashier_closing_transactions ADD COLUMN IF NOT EXISTS manual_discount_fnb NUMERIC(12,2) DEFAULT 0;
      ALTER TABLE cashier_closing_transactions ADD COLUMN IF NOT EXISTS cash_amount NUMERIC(12,2) DEFAULT 0;
      ALTER TABLE cashier_closing_transactions ADD COLUMN IF NOT EXISTS transfer_amount NUMERIC(12,2) DEFAULT 0;
      ALTER TABLE cashier_closings ADD COLUMN IF NOT EXISTS operational_expense_total NUMERIC(12,2) DEFAULT 0;
    `);
    await ensureClosingCommissionSchema(client);
    const { cash_actual = 0, note = '', cashier_name = 'Kasir' } = payload;
    const todayOpDate = getOperationalDate();

    const existing = await client.query('SELECT * FROM cashier_closings WHERE closing_date = $1', [todayOpDate]);
    if (existing.rowCount > 0) throw new Error(`Closing kasir untuk tanggal operasional ${todayOpDate} sudah dilakukan sebelumnya.`);

    const trxRes = await client.query("SELECT * FROM transactions WHERE operational_date = $1 AND payment_status <> 'cancelled'", [todayOpDate]);
    const trxs = trxRes.rows;

    let totalTrx = trxs.length;
    let paidTrx = 0;
    let unpaidTrx = 0;
    let cashTrx = 0;
    let transferTrx = 0;
    let paidRevenue = 0;
    let cashExpected = 0;
    let transferRevenue = 0;
    let unpaidRevenue = 0;
    let totalRevenue = 0;
    let salesCommissionTotal = 0;
    let operationalExpenseTotal = 0;

    const commissionRes = await client.query(`
      SELECT COALESCE(SUM(scl.commission_amount), 0) AS total
      FROM sales_commission_logs scl
      JOIN transactions t ON t.transaction_id = scl.transaction_id
      WHERE scl.operational_date = $1
        AND t.payment_status = 'paid'
        AND t.payment_status <> 'cancelled'
    `, [todayOpDate]);
    salesCommissionTotal = Number(commissionRes.rows[0]?.total || 0);

    const expenseRes = await client.query(`
      SELECT COALESCE(SUM(amount), 0) AS total
      FROM operational_expenses
      WHERE operational_date = $1 AND (is_voided IS FALSE OR is_voided IS NULL)
    `, [todayOpDate]);
    operationalExpenseTotal = Number(expenseRes.rows[0]?.total || 0);

    trxs.forEach(t => {
      const gTotal = Number(t.grand_total || 0);
      if (t.payment_status === 'paid') {
        totalRevenue += gTotal;
        paidTrx++;
        paidRevenue += gTotal;
        const breakdown = getPaymentBreakdown(t);
        if (breakdown.cash_amount > 0) {
          cashTrx++;
          cashExpected += breakdown.cash_amount;
        }
        if (breakdown.transfer_amount > 0) {
          transferTrx++;
          transferRevenue += breakdown.transfer_amount;
        }
      } else if (t.payment_status === 'unpaid') {
        totalRevenue += gTotal;
        unpaidTrx++;
        unpaidRevenue += gTotal;
      }
    });

    const cashActualNum = Number(cash_actual || 0);
    const cashExpectedAfterDeductions = Math.max(0, cashExpected - salesCommissionTotal - operationalExpenseTotal);
    const cashDiff = cashActualNum - cashExpectedAfterDeductions;
    const netRevenueAfterDeductions = Math.max(0, paidRevenue - salesCommissionTotal - operationalExpenseTotal);
    const closingId = `CLS-${Date.now()}`;

    await client.query(`
      INSERT INTO cashier_closings (
        closing_id, closing_date, cashier_name, total_transactions, paid_transactions,
        unpaid_transactions, cash_transactions, transfer_transactions, paid_revenue,
        cash_expected, cash_actual, cash_difference, transfer_revenue, unpaid_revenue,
        total_revenue, note, sales_commission_total, net_revenue_after_commission,
        operational_expense_total
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
    `, [closingId, todayOpDate, cashier_name, totalTrx, paidTrx, unpaidTrx, cashTrx, transferTrx, paidRevenue, cashExpectedAfterDeductions, cashActualNum, cashDiff, transferRevenue, unpaidRevenue, totalRevenue, note, salesCommissionTotal, netRevenueAfterDeductions, operationalExpenseTotal]);

    for (const t of trxs) {
      await client.query(`
        INSERT INTO cashier_closing_transactions (
          closing_id, transaction_id, room_id, room_name, duration_minutes,
          room_total, fnb_total, lc_total, grand_total, payment_method, payment_status, created_at,
          promo_discount, manual_discount, manual_discount_room, manual_discount_fnb,
          cash_amount, transfer_amount
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
      `, [
        closingId,
        t.transaction_id,
        t.room_id,
        t.room_name,
        t.duration_minutes,
        t.room_total,
        t.fnb_total,
        t.lc_total,
        t.grand_total,
        t.payment_method,
        t.payment_status,
        t.created_at,
        t.promo_discount || 0,
        t.manual_discount || 0,
        t.manual_discount_room || 0,
        t.manual_discount_fnb || 0,
        getPaymentBreakdown(t).cash_amount,
        getPaymentBreakdown(t).transfer_amount
      ]);
    }

    await client.query(`
      INSERT INTO sync_outbox (entity_type, entity_id, action, payload_json)
      VALUES ('cashier_closings', $1, 'INSERT', $2)
      ON CONFLICT DO NOTHING
    `, [closingId, JSON.stringify({ closing_id: closingId, closing_date: todayOpDate, total_revenue: totalRevenue })]);

    await client.query('COMMIT');
    return successResponse(res, {
      message: `Tutup kasir tanggal ${todayOpDate} berhasil disimpan.`,
      closing_id: closingId,
      closing_date: todayOpDate,
      cash_expected: cashExpectedAfterDeductions,
      cash_expected_before_commission: cashExpected,
      cash_expected_after_commission: cashExpectedAfterDeductions,
      cash_actual: cashActualNum,
      cash_difference: cashDiff,
      sales_commission_total: salesCommissionTotal,
      operational_expense_total: operationalExpenseTotal,
      net_revenue_after_commission: netRevenueAfterDeductions,
      total_revenue: totalRevenue
    });
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    return errorResponse(res, err.message);
  } finally {
    if (client) client.release();
  }
}

async function getCashierClosingDetails(req, res) {
  try {
    const closingId = req.query.closing_id || '';
    if (!closingId) throw new Error('closing_id wajib diisi.');

    const closingRes = await db.query('SELECT * FROM cashier_closings WHERE closing_id = $1', [closingId]);
    if (closingRes.rowCount === 0) return errorResponse(res, 'Data closing tidak ditemukan.', 'CLOSING_NOT_FOUND');

    const trxRes = await db.query('SELECT * FROM cashier_closing_transactions WHERE closing_id = $1 ORDER BY created_at DESC', [closingId]);
    const fnbRes = await db.query('SELECT * FROM cashier_closing_fnb_items WHERE closing_id = $1 ORDER BY created_at DESC', [closingId]);
    const lcRes = await db.query('SELECT * FROM cashier_closing_lc_details WHERE closing_id = $1 ORDER BY created_at DESC', [closingId]);
    const expRes = await db.query('SELECT * FROM operational_expenses WHERE operational_date = $1 ORDER BY created_at DESC', [closingRes.rows[0].closing_date]);

    return res.json({
      ok: true,
      success: true,
      closing: closingRes.rows[0],
      transactions: trxRes.rows,
      fnb_items: fnbRes.rows,
      lc_details: lcRes.rows,
      expenses: expRes.rows
    });
  } catch (err) {
    return errorResponse(res, err.message);
  }
}

async function validateCashierClosingSnapshot(req, res, payload) {
  try {
    await ensureClosingCommissionSchema();
    const closingDate = payload.closing_date || getOperationalDate();
    const trxRes = await db.query("SELECT COUNT(*) AS count, COALESCE(SUM(grand_total), 0) AS total FROM transactions WHERE operational_date = $1 AND payment_status <> 'cancelled'", [closingDate]);
    const commissionRes = await db.query('SELECT COALESCE(SUM(commission_amount), 0) AS total FROM sales_commission_logs WHERE operational_date = $1', [closingDate]);
    const expenseRes = await db.query('SELECT COALESCE(SUM(amount), 0) AS total FROM operational_expenses WHERE operational_date = $1 AND (is_voided IS FALSE OR is_voided IS NULL)', [closingDate]);
    const existingRes = await db.query('SELECT closing_id FROM cashier_closings WHERE closing_date = $1', [closingDate]);
    const operationalExpenseTotal = Number(expenseRes.rows[0]?.total || 0);
    const totalRev = Number(trxRes.rows[0]?.total || 0);
    const commTotal = Number(commissionRes.rows[0]?.total || 0);

    return successResponse(res, {
      valid: existingRes.rowCount === 0,
      closing_date: closingDate,
      already_closed: existingRes.rowCount > 0,
      transaction_count: Number(trxRes.rows[0].count || 0),
      total_revenue: totalRev,
      sales_commission_total: commTotal,
      operational_expense_total: operationalExpenseTotal,
      net_revenue_after_commission: Math.max(0, totalRev - commTotal - operationalExpenseTotal)
    });
  } catch (err) {
    return errorResponse(res, err.message);
  }
}

module.exports = {
  getTodayCashierClosings,
  getCashierClosingDetails,
  validateCashierClosingSnapshot,
  saveCashierClosing,
};
