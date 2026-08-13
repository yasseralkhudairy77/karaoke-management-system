const db = require('../db');
const { successResponse, errorResponse } = require('../utils/response');
const { getOperationalDate } = require('../utils/operationalDate');

async function getLcMasterList(req, res) {
  try {
    const result = await db.query('SELECT * FROM lc_master ORDER BY lc_name ASC');
    const lcs = result.rows.map(row => ({
      lc_id: row.lc_id,
      lc_name: row.lc_name,
      rate_per_hour: Number(row.rate_per_hour || 0),
      status: row.status,
      phone: row.phone || '',
      joined_date: row.joined_date ? row.joined_date.toISOString().split('T')[0] : ''
    }));

    return res.json({ ok: true, success: true, lcs });
  } catch (err) {
    return errorResponse(res, err.message);
  }
}

async function assignSessionLcs(req, res, payload) {
  try {
    const { room_id, session_id, lcs, cashier_name = 'Kasir' } = payload;
    if (!room_id) throw new Error('room_id wajib diisi.');
    if (!Array.isArray(lcs)) throw new Error('Daftar LC wajib diisi.');

    const roomRes = await db.query('SELECT room_name FROM rooms WHERE room_id = $1', [room_id]);
    const roomName = roomRes.rowCount > 0 ? roomRes.rows[0].room_name : room_id;

    for (const lc of lcs) {
      const logId = `LCW-${Date.now()}-${Math.floor(Math.random()*1000)}`;
      const durationMinutes = Number(lc.duration_minutes || 60);
      const ratePerHour = Number(lc.rate_per_hour || 0);
      const rate = Math.ceil(durationMinutes / 60) * ratePerHour;

      await db.query(`
        INSERT INTO lc_work_logs (
          log_id, session_id, room_id, room_name, lc_id, lc_name,
          duration_minutes, rate_per_hour, rate, cashier_name
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `, [logId, session_id || null, room_id, roomName, lc.lc_id, lc.lc_name, durationMinutes, ratePerHour, rate, cashier_name]);
    }

    return successResponse(res, { message: `Penugasan LC untuk room ${roomName} berhasil disimpan.` });
  } catch (err) {
    return errorResponse(res, err.message);
  }
}

async function recordPettyCashEntry(req, res, payload) {
  try {
    const { entry_type, category, cash_in_amount = 0, cash_out_amount = 0, cashier_name = 'Kasir', note = '' } = payload;
    if (!entry_type || !category) throw new Error('entry_type dan category wajib diisi.');

    const todayOpDate = getOperationalDate();

    // Get last balance
    const lastRes = await db.query('SELECT balance_after FROM petty_cash_ledger ORDER BY created_at DESC LIMIT 1');
    const lastBalance = lastRes.rowCount > 0 ? Number(lastRes.rows[0].balance_after || 0) : 0;

    const inAmt = Number(cash_in_amount || 0);
    const outAmt = Number(cash_out_amount || 0);
    const balanceAfter = lastBalance + inAmt - outAmt;

    const ledgerId = `PCL-${Date.now()}`;
    await db.query(`
      INSERT INTO petty_cash_ledger (
        ledger_id, operational_date, entry_type, category,
        cash_in_amount, cash_out_amount, balance_after, cashier_name, note
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `, [ledgerId, todayOpDate, entry_type, category, inAmt, outAmt, balanceAfter, cashier_name, note]);

    return successResponse(res, {
      message: 'Transaksi Petty Cash berhasil dicatat.',
      ledger_id: ledgerId,
      balance_after: balanceAfter
    });
  } catch (err) {
    return errorResponse(res, err.message);
  }
}

module.exports = {
  getLcMasterList,
  assignSessionLcs,
  recordPettyCashEntry,
};
