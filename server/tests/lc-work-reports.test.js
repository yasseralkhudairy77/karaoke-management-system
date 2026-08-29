const assert = require('assert');
const db = require('../src/db');
const { createLcSalesBonusLog, getLcWorkReports } = require('../src/controllers/lcController');

async function run() {
  await testReportAggregation();
  await testSalesBonusInsertUsesPostgresSchema();
  console.log('LC work reports aggregation test passed.');
}

async function testReportAggregation() {
  const originalQuery = db.query;
  const queries = [];

  db.query = async (sql, params = []) => {
    const text = String(sql);
    queries.push({ text, params });

    if (text.includes('FROM lc_master')) {
      return {
        rows: [
          { lc_id: 'LC-024', lc_name: 'Karin', rate_per_hour: '175000', status: 'active' },
          { lc_id: 'LC-039', lc_name: 'Ketrin', rate_per_hour: '150000', status: 'active' },
        ],
        rowCount: 2
      };
    }

    if (text.includes('FROM lc_work_logs')) {
      return {
        rows: [
          {
            log_id: 'LCW-1', session_id: 'SES-1', room_id: 'ROOM-1', room_name: 'Room 1',
            lc_id: 'LC-024', lc_name: 'Karin', duration_minutes: 60, rate_per_hour: '175000',
            rate: '175000', status: 'closed', created_at: new Date('2026-08-18T15:00:00+07:00'),
            closed_at: new Date('2026-08-18T16:00:00+07:00'), payroll_id: null, closed_transaction_id: 'TRX-1'
          },
          {
            log_id: 'LCW-2', session_id: 'SES-2', room_id: 'ROOM-2', room_name: 'Room 2',
            lc_id: 'LC-024', lc_name: 'Karin', duration_minutes: 120, rate_per_hour: '175000',
            rate: '350000', status: 'paid', created_at: new Date('2026-08-19T15:00:00+07:00'),
            closed_at: new Date('2026-08-19T17:00:00+07:00'), payroll_id: 'LCP-1', closed_transaction_id: 'TRX-2'
          },
          {
            log_id: 'LCW-3', session_id: 'SES-3', room_id: 'ROOM-3', room_name: 'Room 3',
            lc_id: 'LC-039', lc_name: 'Ketrin', duration_minutes: 60, rate_per_hour: '150000',
            rate: '150000', status: 'active', created_at: new Date('2026-08-20T15:00:00+07:00'),
            closed_at: null, payroll_id: null, closed_transaction_id: null
          },
        ],
        rowCount: 3
      };
    }

    if (text.includes('FROM lc_sales_bonus_logs')) {
      return {
        rows: [
          {
            bonus_log_id: 'LCBONUS-1', operational_date: '2026-08-18', transaction_id: 'TRX-1',
            order_id: 'ORD-1', menu_id: 'MENU-1', menu_name: 'Beer Test', category: 'Minuman',
            lc_id: 'LC-024', lc_name: 'Karin', quantity: 2, bonus_per_item: '10000',
            bonus_total: '20000', source_status: 'earned', payroll_id: null,
            created_at: new Date('2026-08-18T15:30:00+07:00'), created_by: 'Kasir',
            voided_at: null, void_reason: null
          }
        ],
        rowCount: 1
      };
    }

    return { rows: [], rowCount: 0 };
  };

  let payload;
  const req = { query: { period: 'custom', start_date: '2026-08-17', end_date: '2026-08-29' } };
  const res = { json(value) { payload = value; return value; } };

  try {
    await getLcWorkReports(req, res);
  } finally {
    db.query = originalQuery;
  }

  assert.strictEqual(payload.ok, true);
  assert.deepStrictEqual(payload.range, {
    period: 'custom',
    startDate: '2026-08-17',
    endDate: '2026-08-29'
  });
  assert.strictEqual(payload.reports.length, 1, 'Only LC with closed/paid sessions or bonus should be listed.');

  const karin = payload.reports[0];
  assert.strictEqual(karin.lc_id, 'LC-024');
  assert.strictEqual(karin.rate_per_room, 175000);
  assert.strictEqual(karin.total_sessions, 2);
  assert.strictEqual(karin.room_earning_total, 525000);
  assert.strictEqual(karin.sales_bonus_total, 20000);
  assert.strictEqual(karin.gross_earning_total, 545000);
  assert.strictEqual(karin.total_earnings, 545000);
  assert.strictEqual(karin.logs.length, 2);
  assert.strictEqual(karin.sales_bonus_logs.length, 1);

  assert(queries.some(query => query.text.includes('COALESCE(closed_at, created_at)')));
  assert(queries.every(query => (
    query.text.includes('FROM lc_master')
    || (query.params[0] === '2026-08-17' && query.params[1] === '2026-08-29')
  )));
}

async function testSalesBonusInsertUsesPostgresSchema() {
  const originalQuery = db.query;
  let captured;

  db.query = async (sql, params = []) => {
    captured = { sql: String(sql), params };
    return { rows: [], rowCount: 1 };
  };

  let payload;
  const req = {};
  const res = { json(value) { payload = value; return value; } };

  try {
    await createLcSalesBonusLog(req, res, {
      transaction_id: 'TRX-1',
      order_id: 'ORD-1',
      menu_id: 'MENU-1',
      menu_name: 'Beer Test',
      category: 'Minuman',
      lc_id: 'LC-024',
      lc_name: 'Karin',
      quantity: 3,
      bonus_per_item: 10000,
      cashier_name: 'Kasir Test'
    });
  } finally {
    db.query = originalQuery;
  }

  assert.strictEqual(payload.ok, true);
  assert(captured.sql.includes('bonus_per_item'));
  assert(captured.sql.includes('bonus_total'));
  assert(!captured.sql.includes('bonus_amount'));
  assert.strictEqual(captured.params[9], 3);
  assert.strictEqual(captured.params[10], 10000);
  assert.strictEqual(captured.params[11], 30000);
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
