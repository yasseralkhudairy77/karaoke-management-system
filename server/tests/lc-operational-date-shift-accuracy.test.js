const assert = require('assert');
const fs = require('fs');
const path = require('path');
const db = require('../src/db');
const { getLcWorkReports } = require('../src/controllers/lcController');

async function runTests() {
  console.log('🧪 Running LC Operational Date Shift Accuracy Tests...');

  await testEarlyMorningUpfrontSessionBelongsToYesterday();
  await testAppsScriptOperationalDateResolution();

  console.log('✅ ALL LC Operational Date Shift Accuracy Tests PASSED SUCCESSFULLY!');
}

async function testEarlyMorningUpfrontSessionBelongsToYesterday() {
  const originalDbQuery = db.query;

  const mockLcMaster = [
    { lc_id: 'LC-014', lc_name: 'Eka', rate_per_hour: 135000 },
    { lc_id: 'LC-027', lc_name: 'Nadia', rate_per_hour: 135000 },
    { lc_id: 'LC-SANIA', lc_name: 'SANIA', rate_per_hour: 135000 },
    { lc_id: 'LC-SOFI', lc_name: 'sofi', rate_per_hour: 135000 },
    { lc_id: 'LC-019', lc_name: 'Nisa', rate_per_hour: 130000 },
    { lc_id: 'LC-040', lc_name: 'Dewi', rate_per_hour: 130000 },
    { lc_id: 'LC-DESI', lc_name: 'DESI', rate_per_hour: 135000 }
  ];

  // Simulasi tabel lc_work_logs di database
  const mockWorkLogs = [
    // Sesi 1 Eka: 11 Sep 02:57 WIB (Shift 2026-09-10) -> 5 jam
    {
      log_id: 'LCW-EKA-1', session_id: 'SES-TODAY-1', room_id: 'ROOM-1', room_name: 'Room 1',
      lc_id: 'LC-014', lc_name: 'Eka', duration_minutes: 300, rate_per_hour: 135000, rate: 675000,
      status: 'closed', created_at: new Date('2026-09-10T19:57:29Z'), // 02:57:29 WIB
      closed_at: new Date('2026-09-11T01:00:00Z'), closed_transaction_id: 'TRX-101', upfront_transaction_id: null
    },
    // Sesi 2 Eka: 10 Sep 20:00 WIB (Shift 2026-09-10) -> 3 jam
    {
      log_id: 'LCW-EKA-2', session_id: 'SES-TODAY-2', room_id: 'ROOM-5', room_name: 'Room 5',
      lc_id: 'LC-014', lc_name: 'Eka', duration_minutes: 180, rate_per_hour: 135000, rate: 405000,
      status: 'closed', created_at: new Date('2026-09-10T13:00:00Z'), // 20:00:00 WIB
      closed_at: new Date('2026-09-10T16:00:00Z'), closed_transaction_id: 'TRX-102', upfront_transaction_id: null
    },
    // Sesi 3 Eka (Subuh Kemarin): 10 Sep 03:07 WIB (Shift 2026-09-09), baru di-checkout jam 13:00 WIB siang
    {
      log_id: 'LCW-1788984435698-912', session_id: 'ROOM-004-20260909195123933', room_id: 'ROOM-4', room_name: 'Room 4',
      lc_id: 'LC-014', lc_name: 'Eka', duration_minutes: 120, rate_per_hour: 135000, rate: 270000,
      status: 'closed', created_at: new Date('2026-09-09T20:07:15Z'), // 10 Sep 03:07:15 WIB
      closed_at: new Date('2026-09-10T06:00:00Z'), // 10 Sep 13:00:00 WIB (checkout siang)
      closed_transaction_id: null, upfront_transaction_id: 'TRX-UPFRONT-4'
    },

    // Sesi Nadia: 3 sesi hari ini (2 jam + 2 jam + 1 jam = 5 jam) + 1 sesi subuh kemarin (2 jam)
    {
      log_id: 'LCW-NADIA-1', session_id: 'SES-TODAY-3', room_id: 'ROOM-5', room_name: 'Room 5',
      lc_id: 'LC-027', lc_name: 'Nadia', duration_minutes: 120, rate_per_hour: 135000, rate: 270000,
      status: 'closed', created_at: new Date('2026-09-10T19:02:57Z'), // 11 Sep 02:02:57 WIB
      closed_at: new Date('2026-09-10T21:00:00Z'), closed_transaction_id: 'TRX-103', upfront_transaction_id: null
    },
    {
      log_id: 'LCW-NADIA-2', session_id: 'SES-TODAY-4', room_id: 'ROOM-4', room_name: 'Room 4',
      lc_id: 'LC-027', lc_name: 'Nadia', duration_minutes: 120, rate_per_hour: 135000, rate: 270000,
      status: 'closed', created_at: new Date('2026-09-10T15:31:00Z'), // 10 Sep 22:31:00 WIB
      closed_at: new Date('2026-09-10T17:30:00Z'), closed_transaction_id: 'TRX-104', upfront_transaction_id: null
    },
    {
      log_id: 'LCW-NADIA-3', session_id: 'SES-TODAY-5', room_id: 'ROOM-1', room_name: 'Room 1',
      lc_id: 'LC-027', lc_name: 'Nadia', duration_minutes: 60, rate_per_hour: 135000, rate: 135000,
      status: 'closed', created_at: new Date('2026-09-10T15:17:46Z'), // 10 Sep 22:17:46 WIB
      closed_at: new Date('2026-09-10T16:17:00Z'), closed_transaction_id: 'TRX-105', upfront_transaction_id: null
    },
    {
      log_id: 'LCW-1788984435669-216', session_id: 'ROOM-004-20260909195123933', room_id: 'ROOM-4', room_name: 'Room 4',
      lc_id: 'LC-027', lc_name: 'Nadia', duration_minutes: 120, rate_per_hour: 135000, rate: 270000,
      status: 'closed', created_at: new Date('2026-09-09T20:07:15Z'), // 10 Sep 03:07:15 WIB
      closed_at: new Date('2026-09-10T06:00:00Z'), // 10 Sep 13:00:00 WIB
      closed_transaction_id: null, upfront_transaction_id: 'TRX-UPFRONT-4'
    },

    // Sesi Sania: 1 sesi hari ini (2 jam) + 1 sesi subuh kemarin (2 jam)
    {
      log_id: 'LCW-SANIA-1', session_id: 'SES-TODAY-6', room_id: 'ROOM-2', room_name: 'Room 2',
      lc_id: 'LC-SANIA', lc_name: 'SANIA', duration_minutes: 120, rate_per_hour: 135000, rate: 270000,
      status: 'closed', created_at: new Date('2026-09-10T14:00:00Z'), // 10 Sep 21:00:00 WIB
      closed_at: new Date('2026-09-10T16:00:00Z'), closed_transaction_id: 'TRX-106', upfront_transaction_id: null
    },
    {
      log_id: 'LCW-SANIA-SUBUH', session_id: 'ROOM-004-20260909195123933', room_id: 'ROOM-4', room_name: 'Room 4',
      lc_id: 'LC-SANIA', lc_name: 'SANIA', duration_minutes: 120, rate_per_hour: 135000, rate: 270000,
      status: 'closed', created_at: new Date('2026-09-09T20:07:15Z'), // 10 Sep 03:07:15 WIB
      closed_at: new Date('2026-09-10T06:00:00Z'), closed_transaction_id: null, upfront_transaction_id: 'TRX-UPFRONT-4'
    },

    // Sesi Sofi: Hanya ada sesi subuh kemarin (2 jam), tidak ada sesi hari ini
    {
      log_id: 'LCW-1788984435700-318', session_id: 'ROOM-004-20260909195123933', room_id: 'ROOM-4', room_name: 'Room 4',
      lc_id: 'LC-SOFI', lc_name: 'sofi', duration_minutes: 120, rate_per_hour: 135000, rate: 270000,
      status: 'closed', created_at: new Date('2026-09-09T20:07:15Z'), // 10 Sep 03:07:15 WIB
      closed_at: new Date('2026-09-10T06:00:00Z'), closed_transaction_id: null, upfront_transaction_id: 'TRX-UPFRONT-4'
    },

    // Sesi Nisa: 1 jam hari ini
    {
      log_id: 'LCW-NISA-1', session_id: 'SES-TODAY-7', room_id: 'ROOM-3', room_name: 'Room 3',
      lc_id: 'LC-019', lc_name: 'Nisa', duration_minutes: 60, rate_per_hour: 130000, rate: 130000,
      status: 'closed', created_at: new Date('2026-09-10T14:30:00Z'),
      closed_at: new Date('2026-09-10T15:30:00Z'), closed_transaction_id: 'TRX-107', upfront_transaction_id: null
    },

    // Sesi Dewi: 3 jam hari ini
    {
      log_id: 'LCW-DEWI-1', session_id: 'SES-TODAY-8', room_id: 'ROOM-6', room_name: 'Room 6',
      lc_id: 'LC-040', lc_name: 'Dewi', duration_minutes: 180, rate_per_hour: 130000, rate: 390000,
      status: 'closed', created_at: new Date('2026-09-10T13:30:00Z'),
      closed_at: new Date('2026-09-10T16:30:00Z'), closed_transaction_id: 'TRX-108', upfront_transaction_id: null
    },

    // Sesi Desi: 2 jam hari ini
    {
      log_id: 'LCW-DESI-1', session_id: 'SES-TODAY-9', room_id: 'ROOM-7', room_name: 'Room 7',
      lc_id: 'LC-DESI', lc_name: 'DESI', duration_minutes: 120, rate_per_hour: 135000, rate: 270000,
      status: 'closed', created_at: new Date('2026-09-10T15:00:00Z'),
      closed_at: new Date('2026-09-10T17:00:00Z'), closed_transaction_id: 'TRX-109', upfront_transaction_id: null
    }
  ];

  const mockTransactions = {
    'TRX-101': { transaction_id: 'TRX-101', operational_date: '2026-09-10' },
    'TRX-102': { transaction_id: 'TRX-102', operational_date: '2026-09-10' },
    'TRX-103': { transaction_id: 'TRX-103', operational_date: '2026-09-10' },
    'TRX-104': { transaction_id: 'TRX-104', operational_date: '2026-09-10' },
    'TRX-105': { transaction_id: 'TRX-105', operational_date: '2026-09-10' },
    'TRX-106': { transaction_id: 'TRX-106', operational_date: '2026-09-10' },
    'TRX-107': { transaction_id: 'TRX-107', operational_date: '2026-09-10' },
    'TRX-108': { transaction_id: 'TRX-108', operational_date: '2026-09-10' },
    'TRX-109': { transaction_id: 'TRX-109', operational_date: '2026-09-10' },
    'TRX-UPFRONT-4': { transaction_id: 'TRX-UPFRONT-4', operational_date: '2026-09-09' }
  };

  try {
    db.query = async (sql, params = []) => {
      const text = String(sql);

      if (text.includes('SELECT * FROM lc_master')) {
        return { rowCount: mockLcMaster.length, rows: mockLcMaster };
      }

      if (text.includes('FROM lc_work_logs lwl')) {
        const startTarget = params[0];
        const endTarget = params[1];

        // Simulasi query SQL dengan filter operational_date
        const filteredRows = mockWorkLogs.map(log => {
          const tClosed = mockTransactions[log.closed_transaction_id];
          const tUpfront = mockTransactions[log.upfront_transaction_id];

          // Formula operational date presisi:
          let opDate = tClosed?.operational_date || tUpfront?.operational_date;
          if (!opDate) {
            const jakartaMs = log.created_at.getTime() + (7 * 3600000);
            const shiftedMs = jakartaMs - (10 * 3600000);
            opDate = new Date(shiftedMs).toISOString().slice(0, 10);
          }

          return { ...log, operational_date: opDate };
        }).filter(row => row.operational_date >= startTarget && row.operational_date <= endTarget);

        return { rowCount: filteredRows.length, rows: filteredRows };
      }

      if (text.includes('FROM lc_sales_bonus_logs')) {
        return { rowCount: 0, rows: [] };
      }

      return { rowCount: 0, rows: [] };
    };

    // 1. Uji Periode "Hari Ini" (2026-09-10)
    let todayResponse = null;
    const reqToday = { query: { period: 'custom', start_date: '2026-09-10', end_date: '2026-09-10' } };
    const resToday = { json: (data) => { todayResponse = data; return data; }, status: () => resToday };

    await getLcWorkReports(reqToday, resToday);
    assert.ok(todayResponse?.ok, 'Response Hari Ini harus ok');
    const todayReports = todayResponse.reports;

    // Periksa Eka: harus tepat 8 jam (2 sesi)
    const eka = todayReports.find(r => r.lc_id === 'LC-014');
    assert.ok(eka, 'Eka harus ada di laporan Hari Ini');
    assert.strictEqual(eka.total_sessions, 2, 'Eka harus 2 sesi');
    assert.strictEqual(eka.total_duration_minutes, 480, 'Eka harus 480 menit (8 jam)');
    assert.strictEqual(eka.room_earning_total, 1080000, 'Gaji room Eka harus Rp 1.080.000');

    // Periksa Nadia: harus tepat 5 jam (3 sesi)
    const nadia = todayReports.find(r => r.lc_id === 'LC-027');
    assert.ok(nadia, 'Nadia harus ada di laporan Hari Ini');
    assert.strictEqual(nadia.total_sessions, 3, 'Nadia harus 3 sesi');
    assert.strictEqual(nadia.total_duration_minutes, 300, 'Nadia harus 300 menit (5 jam)');
    assert.strictEqual(nadia.room_earning_total, 675000, 'Gaji room Nadia harus Rp 675.000');

    // Periksa Sania: harus tepat 2 jam (1 sesi)
    const sania = todayReports.find(r => r.lc_id === 'LC-SANIA');
    assert.ok(sania, 'Sania harus ada di laporan Hari Ini');
    assert.strictEqual(sania.total_sessions, 1, 'Sania harus 1 sesi');
    assert.strictEqual(sania.total_duration_minutes, 120, 'Sania harus 120 menit (2 jam)');

    // Periksa Sofi: TIDAK BOLEH muncul di laporan Hari Ini (karena sesi subuh kemarin)
    const sofi = todayReports.find(r => r.lc_id === 'LC-SOFI');
    assert.strictEqual(sofi, undefined, 'Sofi tidak boleh muncul di laporan Hari Ini karena hanya bertugas di sesi subuh kemarin');

    // Periksa Nisa (1 jam), Dewi (3 jam), Desi (2 jam)
    const nisa = todayReports.find(r => r.lc_id === 'LC-019');
    assert.strictEqual(nisa.total_duration_minutes, 60, 'Nisa harus 1 jam (60 menit)');

    const dewi = todayReports.find(r => r.lc_id === 'LC-040');
    assert.strictEqual(dewi.total_duration_minutes, 180, 'Dewi harus 3 jam (180 menit)');

    const desi = todayReports.find(r => r.lc_id === 'LC-DESI');
    assert.strictEqual(desi.total_duration_minutes, 120, 'Desi harus 2 jam (120 menit)');

    console.log('  ✓ Laporan Hari Ini (2026-09-10) akurat 100%: Eka 8j, Nadia 5j, Sania 2j, Sofi 0j, Nisa 1j, Dewi 3j, Desi 2j');

    // 2. Uji Periode "Kemarin" (2026-09-09)
    let yesterdayResponse = null;
    const reqYesterday = { query: { period: 'custom', start_date: '2026-09-09', end_date: '2026-09-09' } };
    const resYesterday = { json: (data) => { yesterdayResponse = data; return data; }, status: () => resYesterday };

    await getLcWorkReports(reqYesterday, resYesterday);
    assert.ok(yesterdayResponse?.ok, 'Response Kemarin harus ok');
    const yesterdayReports = yesterdayResponse.reports;

    // Sesi subuh Room 4 harus masuk ke Kemarin untuk Eka, Nadia, Sania, dan Sofi
    const ekaYesterday = yesterdayReports.find(r => r.lc_id === 'LC-014');
    assert.ok(ekaYesterday, 'Eka harus muncul di Kemarin');
    assert.strictEqual(ekaYesterday.total_duration_minutes, 120, 'Sesi subuh Eka (2 jam) harus tercatat di Kemarin');

    const sofiYesterday = yesterdayReports.find(r => r.lc_id === 'LC-SOFI');
    assert.ok(sofiYesterday, 'Sofi harus muncul di Kemarin');
    assert.strictEqual(sofiYesterday.total_duration_minutes, 120, 'Sofi harus tercatat 2 jam di Kemarin');

    console.log('  ✓ Sesi subuh Room 4 (03:07:15 WIB) terbukti masuk secara akurat ke shift Kemarin (2026-09-09)');

  } finally {
    db.query = originalDbQuery;
  }
}

async function testAppsScriptOperationalDateResolution() {
  const codeGs = fs.readFileSync(path.join(__dirname, '../../apps-script/Code.gs'), 'utf8');

  assert.ok(
    codeGs.includes('function resolveLcWorkLogOperationalDateString_(log, transactionMap)'),
    'Code.gs wajib mendukung resolveLcWorkLogOperationalDateString_ dengan transactionMap'
  );
  assert.ok(
    codeGs.includes('readSheetAsObjects_("Transactions")'),
    'Code.gs wajib memuat transaksi untuk memetakan tanggal operasional sesi LC'
  );
  assert.ok(
    codeGs.includes('operational_date: logOperationalDate'),
    'Code.gs wajib menyertakan operational_date eksplisit pada log LC'
  );

  console.log('  ✓ Google Apps Script terverifikasi memiliki pemetaan tanggal operasional transaksi');
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
