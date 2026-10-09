const assert = require('assert');

// Mock data & test logic for getPendingLcPayroll aggregation
function mockAggregatePendingPayroll(workLogs, bonusLogs, cashAdvances, lcs, startDate, endDate) {
  const reportsMap = new Map();
  for (const lc of lcs) {
    const lcId = String(lc.lc_id || '').trim();
    if (!lcId) continue;
    reportsMap.set(lcId, {
      lc_id: lcId,
      lc_name: lc.lc_name || '',
      rate_per_room: Number(lc.rate_per_hour || 0),
      total_sessions: 0,
      total_duration_minutes: 0,
      room_earning_total: 0,
      sales_bonus_total: 0,
      cash_advance_outstanding: 0,
      cash_advance_deducted: 0,
      gross_earning_total: 0,
      net_payout_total: 0,
      total_earnings: 0,
      work_logs: [],
      bonus_logs: [],
      advance_logs: []
    });
  }

  for (const row of workLogs) {
    const lcId = String(row.lc_id || '').trim();
    if (!lcId) continue;
    if (!reportsMap.has(lcId)) {
      reportsMap.set(lcId, {
        lc_id: lcId,
        lc_name: row.lc_name || `LC ${lcId}`,
        rate_per_room: Number(row.rate_per_hour || 0),
        total_sessions: 0,
        total_duration_minutes: 0,
        room_earning_total: 0,
        sales_bonus_total: 0,
        cash_advance_outstanding: 0,
        cash_advance_deducted: 0,
        gross_earning_total: 0,
        net_payout_total: 0,
        total_earnings: 0,
        work_logs: [],
        bonus_logs: [],
        advance_logs: []
      });
    }
    const rep = reportsMap.get(lcId);
    rep.total_sessions += 1;
    rep.total_duration_minutes += Number(row.duration_minutes || 0);
    rep.room_earning_total += Number(row.rate || 0);
    rep.work_logs.push(row);
  }

  for (const row of bonusLogs) {
    const lcId = String(row.lc_id || '').trim();
    if (!lcId) continue;
    const rep = reportsMap.get(lcId);
    if (rep) {
      rep.sales_bonus_total += Number(row.bonus_total || 0);
      rep.bonus_logs.push(row);
    }
  }

  for (const row of cashAdvances) {
    const lcId = String(row.lc_id || '').trim();
    if (!lcId) continue;
    const rep = reportsMap.get(lcId);
    if (rep) {
      rep.cash_advance_outstanding += Number(row.amount || 0);
      rep.advance_logs.push(row);
    }
  }

  const reports = Array.from(reportsMap.values())
    .map(rep => {
      rep.gross_earning_total = rep.room_earning_total + rep.sales_bonus_total;
      rep.cash_advance_deducted = Math.min(rep.gross_earning_total, rep.cash_advance_outstanding);
      rep.net_payout_total = Math.max(0, rep.gross_earning_total - rep.cash_advance_deducted);
      rep.total_earnings = rep.net_payout_total;
      return rep;
    })
    .filter(rep => rep.total_sessions > 0 || rep.sales_bonus_total > 0 || rep.cash_advance_outstanding > 0);

  const summaryTotalAmount = reports.reduce((s, r) => s + r.net_payout_total, 0);

  return {
    ok: true,
    success: true,
    reports,
    current_range: { startDate, endDate },
    summary: { total_amount: summaryTotalAmount }
  };
}

function runTests() {
  console.log('Running LC Payroll Aggregation & Contract Tests...');

  const lcs = [
    { lc_id: 'LC-01', lc_name: 'Siska', rate_per_hour: 175000 },
    { lc_id: 'LC-02', lc_name: 'Rina', rate_per_hour: 175000 }
  ];

  const workLogs = [
    { log_id: 'W1', lc_id: 'LC-01', lc_name: 'Siska', rate: 175000, duration_minutes: 60, status: 'done', operational_date: '2026-10-02' },
    { log_id: 'W2', lc_id: 'LC-01', lc_name: 'Siska', rate: 175000, duration_minutes: 60, status: 'done', operational_date: '2026-10-05' },
    { log_id: 'W3', lc_id: 'LC-02', lc_name: 'Rina', rate: 175000, duration_minutes: 60, status: 'done', operational_date: '2026-10-06' }
  ];

  const bonusLogs = [
    { bonus_log_id: 'B1', lc_id: 'LC-01', bonus_total: 25000, operational_date: '2026-10-02' }
  ];

  const cashAdvances = [
    { cash_advance_id: 'A1', lc_id: 'LC-01', amount: 50000, status: 'open' }
  ];

  const res = mockAggregatePendingPayroll(workLogs, bonusLogs, cashAdvances, lcs, '2026-10-01', '2026-10-08');

  assert.strictEqual(res.success, true);
  assert.strictEqual(res.current_range.startDate, '2026-10-01');
  assert.strictEqual(res.current_range.endDate, '2026-10-08');
  assert.strictEqual(res.reports.length, 2);

  const siska = res.reports.find(r => r.lc_id === 'LC-01');
  assert.strictEqual(siska.total_sessions, 2);
  assert.strictEqual(siska.room_earning_total, 350000);
  assert.strictEqual(siska.sales_bonus_total, 25000);
  assert.strictEqual(siska.gross_earning_total, 375000);
  assert.strictEqual(siska.cash_advance_deducted, 50000);
  assert.strictEqual(siska.net_payout_total, 325000);

  const rina = res.reports.find(r => r.lc_id === 'LC-02');
  assert.strictEqual(rina.total_sessions, 1);
  assert.strictEqual(rina.net_payout_total, 175000);

  assert.strictEqual(res.summary.total_amount, 500000);

  console.log('✅ ALL LC Payroll Aggregation & Contract Tests PASSED SUCCESSFULLY!');
}

runTests();
