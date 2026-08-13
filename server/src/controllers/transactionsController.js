const db = require('../db');
const { successResponse, errorResponse } = require('../utils/response');
const { getOperationalDateRange } = require('../utils/operationalDate');

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

module.exports = {
  getTodayTransactions,
  markTransactionPaid,
  logReceiptPrint,
};
