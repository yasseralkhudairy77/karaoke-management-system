const db = require('../db');
const { successResponse, errorResponse } = require('../utils/response');
const { getOperationalDate, getOperationalDateRange } = require('../utils/operationalDate');

async function getTodayCashierClosings(req, res) {
  try {
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
    `);
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

    trxs.forEach(t => {
      const gTotal = Number(t.grand_total || 0);
      if (t.payment_status === 'paid') {
        totalRevenue += gTotal;
        paidTrx++;
        paidRevenue += gTotal;
        if (t.payment_method === 'cash') {
          cashTrx++;
          cashExpected += gTotal;
        } else {
          transferTrx++;
          transferRevenue += gTotal;
        }
      } else if (t.payment_status === 'unpaid') {
        totalRevenue += gTotal;
        unpaidTrx++;
        unpaidRevenue += gTotal;
      }
    });

    const cashActualNum = Number(cash_actual || 0);
    const cashDiff = cashActualNum - cashExpected;
    const closingId = `CLS-${Date.now()}`;

    await client.query(`
      INSERT INTO cashier_closings (
        closing_id, closing_date, cashier_name, total_transactions, paid_transactions,
        unpaid_transactions, cash_transactions, transfer_transactions, paid_revenue,
        cash_expected, cash_actual, cash_difference, transfer_revenue, unpaid_revenue,
        total_revenue, note
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
    `, [closingId, todayOpDate, cashier_name, totalTrx, paidTrx, unpaidTrx, cashTrx, transferTrx, paidRevenue, cashExpected, cashActualNum, cashDiff, transferRevenue, unpaidRevenue, totalRevenue, note]);

    for (const t of trxs) {
      await client.query(`
        INSERT INTO cashier_closing_transactions (
          closing_id, transaction_id, room_id, room_name, duration_minutes,
          room_total, fnb_total, lc_total, grand_total, payment_method, payment_status, created_at,
          promo_discount, manual_discount, manual_discount_room, manual_discount_fnb
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      `, [closingId, t.transaction_id, t.room_id, t.room_name, t.duration_minutes, t.room_total, t.fnb_total, t.lc_total, t.grand_total, t.payment_method, t.payment_status, t.created_at, t.promo_discount || 0, t.manual_discount || 0, t.manual_discount_room || 0, t.manual_discount_fnb || 0]);
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
      cash_expected: cashExpected,
      cash_actual: cashActualNum,
      cash_difference: cashDiff,
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

    return res.json({
      ok: true,
      success: true,
      closing: closingRes.rows[0],
      transactions: trxRes.rows,
      fnb_items: fnbRes.rows,
      lc_details: lcRes.rows
    });
  } catch (err) {
    return errorResponse(res, err.message);
  }
}

async function validateCashierClosingSnapshot(req, res, payload) {
  try {
    const closingDate = payload.closing_date || getOperationalDate();
    const trxRes = await db.query("SELECT COUNT(*) AS count, COALESCE(SUM(grand_total), 0) AS total FROM transactions WHERE operational_date = $1 AND payment_status <> 'cancelled'", [closingDate]);
    const existingRes = await db.query('SELECT closing_id FROM cashier_closings WHERE closing_date = $1', [closingDate]);
    return successResponse(res, {
      valid: existingRes.rowCount === 0,
      closing_date: closingDate,
      already_closed: existingRes.rowCount > 0,
      transaction_count: Number(trxRes.rows[0].count || 0),
      total_revenue: Number(trxRes.rows[0].total || 0)
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
