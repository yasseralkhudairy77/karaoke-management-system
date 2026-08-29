const db = require('../db');
const { successResponse, errorResponse } = require('../utils/response');
const { getOperationalDate, getOperationalDateRange } = require('../utils/operationalDate');

function toNumber(value) {
  const num = Number(value || 0);
  return Number.isFinite(num) ? num : 0;
}

function toIsoString(value) {
  if (!value) return '';
  const dt = new Date(value);
  return Number.isNaN(dt.getTime()) ? String(value) : dt.toISOString();
}

function getLcReportDateRange(query = {}) {
  const period = String(query.period || 'today');
  const startDate = query.start_date || query.startDate || '';
  const endDate = query.end_date || query.endDate || '';
  const normalizedPeriod = {
    this_month: 'thismonth',
    last_7_days: 'last7days',
  }[period] || period;

  if (period === 'this_week' || period === 'last_week' || period === 'last_month') {
    const currentOpDate = getOperationalDate();
    const [year, month, day] = currentOpDate.split('-').map(Number);
    const currentDate = new Date(Date.UTC(year, month - 1, day));
    const dayOfWeek = currentDate.getUTCDay() || 7;

    if (period === 'this_week' || period === 'last_week') {
      const monday = new Date(currentDate.getTime() - ((dayOfWeek - 1) * 24 * 60 * 60 * 1000));
      const offsetDays = period === 'last_week' ? -7 : 0;
      const start = new Date(monday.getTime() + (offsetDays * 24 * 60 * 60 * 1000));
      const end = new Date(start.getTime() + (6 * 24 * 60 * 60 * 1000));
      if (period === 'this_week' && end > currentDate) end.setTime(currentDate.getTime());
      return {
        startDate: start.toISOString().slice(0, 10),
        endDate: end.toISOString().slice(0, 10),
      };
    }

    const firstThisMonth = new Date(Date.UTC(year, month - 1, 1));
    const firstLastMonth = new Date(Date.UTC(year, month - 2, 1));
    const lastLastMonth = new Date(firstThisMonth.getTime() - (24 * 60 * 60 * 1000));
    return {
      startDate: firstLastMonth.toISOString().slice(0, 10),
      endDate: lastLastMonth.toISOString().slice(0, 10),
    };
  }

  return getOperationalDateRange(normalizedPeriod, startDate, endDate);
}

async function getLcMasterList(req, res) {
  try {
    const result = await db.query('SELECT * FROM lc_master ORDER BY lc_name ASC');
    const lcs = result.rows.map(row => ({
      lc_id: row.lc_id,
      lc_name: row.lc_name,
      rate_per_hour: Number(row.rate_per_hour || 0),
      rate_per_room: Number(row.rate_per_hour || 0),
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

    lcAssignments = Array.from(
      lcAssignments.reduce((map, item) => {
        const lcId = String(item?.lc_id || '').trim();
        if (!lcId || lcId === 'PENDING') return map;
        map.set(lcId, {
          ...item,
          lc_id: lcId,
          duration_minutes: Number(item.duration_minutes || 60)
        });
        return map;
      }, new Map()).values()
    );

    const roomRes = await client.query('SELECT room_name, start_time FROM rooms WHERE room_id = $1 FOR UPDATE', [roomId]);
    const roomName = roomRes.rowCount > 0 ? roomRes.rows[0].room_name : roomId;

    const sessRes = await client.query(`
      SELECT session_id FROM room_sessions WHERE room_id = $1 AND status IN ('starting', 'active') ORDER BY created_at DESC LIMIT 1
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

async function getLcWorkReports(req, res) {
  try {
    const { startDate, endDate } = getLcReportDateRange(req.query);
    const [lcsRes, logsRes, bonusRes] = await Promise.all([
      db.query('SELECT * FROM lc_master ORDER BY lc_name ASC'),
      db.query(`
        SELECT
          log_id, session_id, room_id, room_name, lc_id, lc_name,
          duration_minutes, rate_per_hour, rate, status,
          created_at, closed_at, payroll_id, closed_transaction_id
        FROM lc_work_logs
        WHERE status <> 'cancelled'
          AND (((COALESCE(closed_at, created_at) AT TIME ZONE 'Asia/Jakarta') - INTERVAL '10 hours')::date) >= $1::date
          AND (((COALESCE(closed_at, created_at) AT TIME ZONE 'Asia/Jakarta') - INTERVAL '10 hours')::date) <= $2::date
        ORDER BY created_at DESC, log_id DESC
      `, [startDate, endDate]),
      db.query(`
        SELECT
          bonus_log_id, operational_date, transaction_id, order_id,
          menu_id, menu_name, category, lc_id, lc_name, quantity,
          bonus_per_item, bonus_total, source_status, payroll_id,
          created_at, created_by, voided_at, void_reason
        FROM lc_sales_bonus_logs
        WHERE source_status NOT IN ('voided', 'cancelled')
          AND voided_at IS NULL
          AND operational_date >= $1::date
          AND operational_date <= $2::date
        ORDER BY created_at DESC, bonus_log_id DESC
      `, [startDate, endDate])
    ]);

    const reportsByLcId = new Map();
    for (const lc of lcsRes.rows) {
      const lcId = String(lc.lc_id || '').trim();
      if (!lcId) continue;
      reportsByLcId.set(lcId, {
        lc_id: lcId,
        lc_name: lc.lc_name || '',
        rate_per_room: toNumber(lc.rate_per_hour ?? lc.rate_per_room),
        total_sessions: 0,
        total_duration_minutes: 0,
        room_earning_total: 0,
        sales_bonus_total: 0,
        gross_earning_total: 0,
        total_earnings: 0,
        logs: [],
        sales_bonus_logs: []
      });
    }

    for (const row of logsRes.rows) {
      const lcId = String(row.lc_id || '').trim();
      if (!lcId) continue;
      if (!reportsByLcId.has(lcId)) {
        reportsByLcId.set(lcId, {
          lc_id: lcId,
          lc_name: row.lc_name || `LC ${lcId}`,
          rate_per_room: toNumber(row.rate_per_hour),
          total_sessions: 0,
          total_duration_minutes: 0,
          room_earning_total: 0,
          sales_bonus_total: 0,
          gross_earning_total: 0,
          total_earnings: 0,
          logs: [],
          sales_bonus_logs: []
        });
      }

      const report = reportsByLcId.get(lcId);
      const log = {
        log_id: row.log_id || '',
        session_id: row.session_id || '',
        room_id: row.room_id || '',
        room_name: row.room_name || '',
        lc_id: lcId,
        lc_name: row.lc_name || report.lc_name,
        duration_minutes: toNumber(row.duration_minutes),
        rate_per_hour: toNumber(row.rate_per_hour),
        rate_per_room: toNumber(row.rate_per_hour),
        rate: toNumber(row.rate),
        status: row.status || '',
        created_at: toIsoString(row.created_at),
        closed_at: toIsoString(row.closed_at),
        payroll_id: row.payroll_id || '',
        closed_transaction_id: row.closed_transaction_id || ''
      };
      report.logs.push(log);
      if (['done', 'closed', 'paid'].includes(String(row.status || '').toLowerCase())) {
        report.total_sessions += 1;
        report.total_duration_minutes += log.duration_minutes;
        report.room_earning_total += log.rate;
      }
    }

    for (const row of bonusRes.rows) {
      const lcId = String(row.lc_id || '').trim();
      if (!lcId) continue;
      if (!reportsByLcId.has(lcId)) {
        reportsByLcId.set(lcId, {
          lc_id: lcId,
          lc_name: row.lc_name || `LC ${lcId}`,
          rate_per_room: 0,
          total_sessions: 0,
          total_duration_minutes: 0,
          room_earning_total: 0,
          sales_bonus_total: 0,
          gross_earning_total: 0,
          total_earnings: 0,
          logs: [],
          sales_bonus_logs: []
        });
      }

      const bonusTotal = toNumber(row.bonus_total);
      const report = reportsByLcId.get(lcId);
      report.sales_bonus_total += bonusTotal;
      report.sales_bonus_logs.push({
        bonus_log_id: row.bonus_log_id || '',
        operational_date: row.operational_date ? new Date(row.operational_date).toISOString().slice(0, 10) : '',
        transaction_id: row.transaction_id || '',
        order_id: row.order_id || '',
        menu_id: row.menu_id || '',
        menu_name: row.menu_name || '',
        category: row.category || '',
        lc_id: lcId,
        lc_name: row.lc_name || report.lc_name,
        quantity: toNumber(row.quantity),
        bonus_per_item: toNumber(row.bonus_per_item),
        bonus_total: bonusTotal,
        source_status: row.source_status || '',
        payroll_id: row.payroll_id || '',
        created_at: toIsoString(row.created_at),
        created_by: row.created_by || '',
        voided_at: toIsoString(row.voided_at),
        void_reason: row.void_reason || ''
      });
    }

    const reports = Array.from(reportsByLcId.values())
      .map(report => {
        report.gross_earning_total = report.room_earning_total + report.sales_bonus_total;
        report.total_earnings = report.gross_earning_total;
        return report;
      })
      .filter(report => report.total_sessions > 0 || report.sales_bonus_total > 0)
      .sort((a, b) => (b.gross_earning_total - a.gross_earning_total) || String(a.lc_name).localeCompare(String(b.lc_name), 'id'));

    return res.json({
      ok: true,
      success: true,
      reports,
      logs: logsRes.rows,
      range: { period: req.query.period || 'today', startDate, endDate }
    });
  } catch (err) {
    return errorResponse(res, err.message);
  }
}

async function getLcFinanceSummary(req, res) {
  try {
    const workRes = await db.query(`
      SELECT
        lc_id,
        lc_name,
        COUNT(*) AS work_count,
        COALESCE(SUM(rate), 0) AS earned_total
      FROM lc_work_logs
      WHERE status <> 'cancelled'
      GROUP BY lc_id, lc_name
      ORDER BY lc_name ASC
    `);
    const advanceRes = await db.query(`
      SELECT lc_id, COALESCE(SUM(amount), 0) AS advance_total
      FROM lc_cash_advances
      WHERE status = 'open'
      GROUP BY lc_id
    `);
    const advances = new Map(advanceRes.rows.map(row => [row.lc_id, Number(row.advance_total || 0)]));
    const summary = workRes.rows.map(row => ({
      lc_id: row.lc_id,
      lc_name: row.lc_name,
      work_count: Number(row.work_count || 0),
      earned_total: Number(row.earned_total || 0),
      advance_total: advances.get(row.lc_id) || 0,
      net_total: Number(row.earned_total || 0) - (advances.get(row.lc_id) || 0)
    }));
    return res.json({ ok: true, success: true, summary });
  } catch (err) {
    return errorResponse(res, err.message);
  }
}

async function getPendingLcPayroll(req, res) {
  try {
    const result = await db.query(`
      SELECT * FROM lc_work_logs
      WHERE status IN ('active', 'closed', 'done') AND payroll_id IS NULL
      ORDER BY created_at ASC
    `);
    return res.json({ ok: true, success: true, logs: result.rows, pending: result.rows });
  } catch (err) {
    return errorResponse(res, err.message);
  }
}

async function getLcPayrollHistory(req, res) {
  try {
    const result = await db.query('SELECT * FROM lc_payroll_history ORDER BY created_at DESC LIMIT 200');
    return res.json({ ok: true, success: true, history: result.rows, payroll_history: result.rows });
  } catch (err) {
    return errorResponse(res, err.message);
  }
}

async function getLcPayrollDetails(req, res) {
  try {
    const payrollId = req.query.payroll_id || '';
    if (!payrollId) throw new Error('payroll_id wajib diisi.');
    const payrollRes = await db.query('SELECT * FROM lc_payroll_history WHERE payroll_id = $1', [payrollId]);
    const workRes = await db.query('SELECT * FROM lc_work_logs WHERE payroll_id = $1 ORDER BY created_at ASC', [payrollId]);
    const advanceRes = await db.query('SELECT * FROM lc_cash_advances WHERE payroll_id = $1 ORDER BY created_at ASC', [payrollId]);
    return res.json({ ok: true, success: true, payroll: payrollRes.rows[0] || null, work_logs: workRes.rows, advances: advanceRes.rows });
  } catch (err) {
    return errorResponse(res, err.message);
  }
}

async function createLcCashAdvance(req, res, payload) {
  try {
    const { lc_id, amount, requested_by = 'LC', cashier_name = 'Kasir', note = '' } = payload;
    const amountNum = Number(amount || payload.cash_out_amount || 0);
    if (!lc_id) throw new Error('lc_id wajib diisi.');
    if (!Number.isFinite(amountNum) || amountNum <= 0) throw new Error('amount wajib positif.');

    const lcRes = await db.query('SELECT lc_name FROM lc_master WHERE lc_id = $1', [lc_id]);
    if (lcRes.rowCount === 0) throw new Error('LC tidak ditemukan.');
    const opDate = getOperationalDate();
    const advanceId = `LCA-${Date.now()}`;
    await db.query(`
      INSERT INTO lc_cash_advances (cash_advance_id, operational_date, lc_id, lc_name, amount, status, requested_by, cashier_name, note)
      VALUES ($1, $2, $3, $4, $5, 'open', $6, $7, $8)
    `, [advanceId, opDate, lc_id, lcRes.rows[0].lc_name, amountNum, requested_by, cashier_name, note]);
    return successResponse(res, { message: 'Kasbon LC berhasil dicatat.', cash_advance_id: advanceId });
  } catch (err) {
    return errorResponse(res, err.message);
  }
}

async function createLcSalesBonusLog(req, res, payload) {
  try {
    const bonusId = `LSB-${Date.now()}`;
    const opDate = getOperationalDate();
    const quantity = toNumber(payload.quantity || 1) || 1;
    const bonusPerItem = toNumber(payload.bonus_per_item ?? payload.bonus_amount);
    const bonusTotal = toNumber(payload.bonus_total ?? (bonusPerItem * quantity));
    await db.query(`
      INSERT INTO lc_sales_bonus_logs (
        bonus_log_id, operational_date, transaction_id, order_id, menu_id, menu_name, category,
        lc_id, lc_name, quantity, bonus_per_item, bonus_total, source_status, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'earned', $13)
    `, [
      bonusId,
      opDate,
      payload.transaction_id || null,
      payload.order_id || null,
      payload.menu_id || null,
      payload.menu_name || 'Bonus Sales',
      payload.category || 'F&B',
      payload.lc_id || null,
      payload.lc_name || '',
      quantity,
      bonusPerItem,
      bonusTotal,
      payload.created_by || payload.cashier_name || 'Kasir'
    ]);
    return successResponse(res, { message: 'Bonus sales LC berhasil dicatat.', bonus_log_id: bonusId });
  } catch (err) {
    return errorResponse(res, err.message);
  }
}

async function processLcPayroll(req, res, payload) {
  let client;
  try {
    client = await db.pool.connect();
    await client.query('BEGIN');
    const processedBy = payload.processed_by || payload.cashier_name || 'Kasir';
    const periodStart = payload.payroll_period_start || payload.start_date || getOperationalDate();
    const periodEnd = payload.payroll_period_end || payload.end_date || periodStart;
    const payrollId = `LCP-${Date.now()}`;

    const workRes = await client.query(`
      SELECT * FROM lc_work_logs
      WHERE payroll_id IS NULL AND status <> 'cancelled'
    `);
    const bonusRes = await client.query(`
      SELECT * FROM lc_sales_bonus_logs
      WHERE payroll_id IS NULL AND source_status = 'earned'
    `);
    const advanceRes = await client.query(`
      SELECT * FROM lc_cash_advances
      WHERE payroll_id IS NULL AND status = 'open'
    `);

    const roomEarningTotal = workRes.rows.reduce((sum, row) => sum + Number(row.rate || 0), 0);
    const salesBonusTotal = bonusRes.rows.reduce((sum, row) => sum + Number(row.bonus_total || 0), 0);
    const cashAdvanceTotal = advanceRes.rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const totalMinutes = workRes.rows.reduce((sum, row) => sum + Number(row.duration_minutes || 0), 0);
    const grossTotal = roomEarningTotal + salesBonusTotal;
    const netTotal = grossTotal - cashAdvanceTotal;

    await client.query(`
      INSERT INTO lc_payroll_history (
        payroll_id, payroll_period_start, payroll_period_end, total_hours,
        room_earning_total, sales_bonus_total, cash_advance_deducted,
        gross_earning_total, net_payout_total, total_amount, processed_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9, $10)
    `, [payrollId, periodStart, periodEnd, totalMinutes / 60, roomEarningTotal, salesBonusTotal, cashAdvanceTotal, grossTotal, netTotal, processedBy]);

    await client.query('UPDATE lc_work_logs SET payroll_id = $1, status = $2 WHERE payroll_id IS NULL AND status <> $3', [payrollId, 'paid', 'cancelled']);
    await client.query('UPDATE lc_sales_bonus_logs SET payroll_id = $1, source_status = $2 WHERE payroll_id IS NULL AND source_status = $3', [payrollId, 'payrolled', 'earned']);
    await client.query('UPDATE lc_cash_advances SET payroll_id = $1, status = $2, deducted_at = CURRENT_TIMESTAMP WHERE payroll_id IS NULL AND status = $3', [payrollId, 'deducted', 'open']);

    await client.query('COMMIT');
    return successResponse(res, { message: 'Payroll LC berhasil diproses.', payroll_id: payrollId, net_payout_total: netTotal });
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    return errorResponse(res, err.message);
  } finally {
    if (client) client.release();
  }
}

function foundationOk(res, name) {
  return successResponse(res, { message: `${name} siap.`, initialized: true, valid: true });
}

module.exports = {
  getLcMasterList,
  assignSessionLcs,
  recordPettyCashEntry,
  getLcWorkReports,
  getLcFinanceSummary,
  getPendingLcPayroll,
  getLcPayrollHistory,
  getLcPayrollDetails,
  createLcCashAdvance,
  createLcSalesBonusLog,
  processLcPayroll,
  initializeLcFinanceFoundation: (req, res) => foundationOk(res, 'LC finance foundation'),
  validateLcFinanceFoundation: (req, res) => foundationOk(res, 'LC finance foundation'),
};
