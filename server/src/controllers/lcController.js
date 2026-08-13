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
  let client;
  try {
    client = await db.pool.connect();
    await client.query('BEGIN');
    const roomId = payload.room_id;
    const changedBy = payload.changed_by || payload.cashier_name || 'Kasir';
    let lcAssignments = [];

    if (!roomId) throw new Error('room_id wajib diisi.');

    if (payload.lc_assignments) {
      if (typeof payload.lc_assignments === 'string') {
        try {
          lcAssignments = JSON.parse(payload.lc_assignments);
        } catch (e) {
          lcAssignments = [];
        }
      } else if (Array.isArray(payload.lc_assignments)) {
        lcAssignments = payload.lc_assignments;
      }
    }

    if (lcAssignments.length === 0 && payload.lc_ids) {
      const idsArray = typeof payload.lc_ids === 'string'
        ? payload.lc_ids.split(',').map(s => s.trim()).filter(Boolean)
        : (Array.isArray(payload.lc_ids) ? payload.lc_ids : []);

      lcAssignments = idsArray.map(lcId => ({ lc_id: lcId, duration_minutes: 60 }));
    }

    const roomRes = await client.query('SELECT room_name, start_time FROM rooms WHERE room_id = $1', [roomId]);
    const roomName = roomRes.rowCount > 0 ? roomRes.rows[0].room_name : roomId;

    const sessRes = await client.query(`
      SELECT session_id FROM room_sessions WHERE room_id = $1 AND status = 'active' ORDER BY created_at DESC LIMIT 1
    `, [roomId]);
    const sessionId = sessRes.rowCount > 0 ? sessRes.rows[0].session_id : null;

    await client.query(`
      UPDATE lc_work_logs SET status = 'cancelled' 
      WHERE room_id = $1 AND closed_at IS NULL
    `, [roomId]);

    for (const lcItem of lcAssignments) {
      const lcId = lcItem.lc_id;
      if (!lcId || lcId === 'PENDING') continue;

      const durationMinutes = Number(lcItem.duration_minutes || 60);

      const lcMasterRes = await client.query('SELECT lc_name, rate_per_hour FROM lc_master WHERE lc_id = $1', [lcId]);
      if (lcMasterRes.rowCount === 0) continue;

      const lcName = lcMasterRes.rows[0].lc_name;
      const ratePerHour = Number(lcMasterRes.rows[0].rate_per_hour || 0);
      const rate = Math.ceil(durationMinutes / 60) * ratePerHour;

      const logId = `LCW-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

      await client.query(`
        INSERT INTO lc_work_logs (
          log_id, session_id, room_id, room_name, lc_id, lc_name,
          duration_minutes, rate_per_hour, rate, status, cashier_name
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'active', $10)
      `, [logId, sessionId, roomId, roomName, lcId, lcName, durationMinutes, ratePerHour, rate, changedBy]);
    }

    await client.query('COMMIT');
    return successResponse(res, { message: `Pilihan LC untuk room ${roomName} berhasil disimpan.` });
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    return errorResponse(res, err.message);
  } finally {
    if (client) client.release();
  }
}

async function recordPettyCashEntry(req, res, payload) {
  try {
    const { entry_type, category, cash_in_amount = 0, cash_out_amount = 0, cashier_name = 'Kasir', note = '' } = payload;
    if (!entry_type || !category) throw new Error('entry_type dan category wajib diisi.');

    const todayOpDate = getOperationalDate();

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
