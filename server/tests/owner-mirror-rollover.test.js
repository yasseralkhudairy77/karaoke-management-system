const assert = require('assert');
const db = require('../src/db');
const {
  getLatestOwnerMirrorSnapshot,
  saveOwnerMirrorSnapshot
} = require('../src/services/ownerMirrorService');

async function runOwnerMirrorRolloverTests() {
  console.log('Running Owner Mirror Cutoff Rollover Tests...');
  const originalQuery = db.query;
  const originalPoolConnect = db.pool.connect;
  let capturedSql = '';
  let capturedParams = [];

  try {
    db.query = async (sql, params) => {
      capturedSql = sql;
      capturedParams = params;
      const [, , startDate, endDate] = params;
      return {
        rowCount: 1,
        rows: [{
          snapshot_id: 9870,
          source_id: 'happy-song-local',
          period: 'today',
          received_at: new Date('2026-08-18T05:20:48+07:00'),
          payload_json: {
            mirror_version: 'owner-mirror-snapshot-v1',
            period: 'today',
            operational_date_start: startDate,
            operational_date_end: endDate,
            summary: { total_transactions: 7 }
          }
        }]
      };
    };

    const snapshot = await getLatestOwnerMirrorSnapshot('happy-song-local', { period: 'yesterday' });

    assert.match(capturedSql, /operational_date_start\s*=\s*\$3::date/i);
    assert.match(capturedSql, /operational_date_end\s*=\s*\$4::date/i);
    assert.match(capturedSql, /CASE WHEN period = \$2 THEN 0 ELSE 1 END/i);
    assert.doesNotMatch(capturedSql, /AND\s+period\s*=\s*\$2/i);
    assert.strictEqual(capturedParams[0], 'happy-song-local');
    assert.strictEqual(capturedParams[1], 'yesterday');
    assert.strictEqual(snapshot.has_snapshot, true);
    assert.strictEqual(snapshot.period, 'yesterday');
    assert.strictEqual(snapshot.snapshot_period, 'today');
    assert.strictEqual(snapshot.period_relabelled, true);
    assert.strictEqual(snapshot.summary.total_transactions, 7);
    console.log('  PASS today snapshot remains available as yesterday after cutoff');

    db.query = async () => ({ rowCount: 0, rows: [] });
    const missing = await getLatestOwnerMirrorSnapshot('happy-song-local', { period: 'today' });
    assert.strictEqual(missing.has_snapshot, false);
    assert.strictEqual(missing.summary.paid_revenue, 0);
    assert.strictEqual(missing.summary.total_transactions, 0);
    console.log('  PASS unmatched operational date remains empty when DB has no rows');

    // Test: Jika DB memiliki snapshot kemarin yang masih berlabel period 'today',
    // setelah cutoff jam 10:00 WIB query 'today' TIDAK BOLEH fallback ke snapshot kemarin tersebut!
    db.query = async (sql, params) => {
      const text = String(sql);
      // Query 1 untuk tanggal eksak hari ini tidak menemukan baris (karena PC kasir mati/belum buka shift baru)
      if (/WHERE source_id = \$1\s+AND operational_date_start = \$3::date/i.test(text)) {
        return { rowCount: 0, rows: [] };
      }
      // Jika ada query fallback lama, misalnya cari WHERE period = $2 ('today')
      if (/WHERE source_id = \$1\s+AND period = \$2/i.test(text)) {
        return {
          rowCount: 1,
          rows: [{
            snapshot_id: 101,
            source_id: 'happy-song-local',
            period: 'today',
            operational_date_start: '2026-09-20',
            operational_date_end: '2026-09-20',
            received_at: new Date('2026-09-21T05:17:00+07:00'),
            payload_json: {
              period: 'today',
              operational_date_start: '2026-09-20',
              operational_date_end: '2026-09-20',
              summary: { paid_revenue: 10060000, total_transactions: 7 }
            }
          }]
        };
      }
      return { rowCount: 0, rows: [] };
    };

    const todaySnapshotAfterCutoff = await getLatestOwnerMirrorSnapshot('happy-song-local', { period: 'today' });
    assert.strictEqual(todaySnapshotAfterCutoff.has_snapshot, false, 'Today should NOT fallback to yesterday snapshot after cutoff');
    assert.strictEqual(todaySnapshotAfterCutoff.is_fallback, false);
    assert.strictEqual(todaySnapshotAfterCutoff.summary.paid_revenue, 0);
    assert.strictEqual(todaySnapshotAfterCutoff.summary.total_transactions, 0);
    console.log('  PASS today snapshot strictly resets to 0 after cutoff without falling back to yesterday');

    // Test smart fallback: Saat PC offline dan tidak ada tanggal eksak untuk last7days, fallback ke snapshot last7days terakhir
    db.query = async (sql, params) => {
      const text = String(sql);
      if (/WHERE source_id = \$1\s+AND operational_date_start = \$3::date/i.test(text)) {
        return { rowCount: 0, rows: [] }; // exact date range not found (PC offline)
      }
      if (/WHERE source_id = \$1\s+AND period = \$2/i.test(text)) {
        return {
          rowCount: 1,
          rows: [{
            snapshot_id: 888,
            source_id: 'happy-song-local',
            period: 'last7days',
            operational_date_start: '2026-09-12',
            operational_date_end: '2026-09-18',
            received_at: new Date('2026-09-19T04:52:00+07:00'),
            payload_json: {
              period: 'last7days',
              operational_date_start: '2026-09-12',
              operational_date_end: '2026-09-18',
              summary: { total_revenue_all: 85000000 }
            }
          }]
        };
      }
      return { rowCount: 0, rows: [] };
    };

    const fallbackSnapshot = await getLatestOwnerMirrorSnapshot('happy-song-local', { period: 'last7days' });
    assert.strictEqual(fallbackSnapshot.has_snapshot, true);
    assert.strictEqual(fallbackSnapshot.is_fallback, true);
    assert.strictEqual(fallbackSnapshot.period, 'last7days');
    assert.strictEqual(fallbackSnapshot.operational_date_end, '2026-09-18');
    assert.strictEqual(fallbackSnapshot.summary.total_revenue_all, 85000000);
    console.log('  PASS smart fallback successfully serves last available 7-day snapshot when PC is offline');

    const executedSql = [];
    const snapshotPayload = {
      mirror_version: 'owner-mirror-snapshot-v1',
      period: 'today',
      operational_date_start: '2026-08-18',
      operational_date_end: '2026-08-18',
      summary: { total_transactions: 1 }
    };

    db.pool.connect = async () => ({
      query: async (sql) => {
        executedSql.push(String(sql));
        if (/SELECT snapshot_id/i.test(sql)) {
          return { rowCount: 1, rows: [{ snapshot_id: 4321 }] };
        }
        if (/UPDATE owner_mirror_snapshots/i.test(sql)) {
          return {
            rowCount: 1,
            rows: [{
              snapshot_id: 4321,
              source_id: 'happy-song-local',
              received_at: new Date('2026-08-18T10:00:00+07:00')
            }]
          };
        }
        return { rowCount: 0, rows: [] };
      },
      release: () => {}
    });

    const saved = await saveOwnerMirrorSnapshot(snapshotPayload, 'happy-song-local');
    assert.strictEqual(saved.snapshot_id, 4321);
    assert.ok(executedSql.some(sql => /UPDATE owner_mirror_snapshots/i.test(sql)));
    assert.ok(executedSql.some(sql => /DELETE FROM owner_mirror_snapshots target/i.test(sql)));
    assert.ok(executedSql.some(sql => /received_at < CURRENT_TIMESTAMP/i.test(sql)));
    // Test custom date: Exact match single day
    db.query = async (sql, params) => {
      const text = String(sql);
      if (/WHERE source_id = \$1\s+AND operational_date_start = \$3::date/i.test(text)) {
        return {
          rowCount: 1,
          rows: [{
            snapshot_id: 555,
            source_id: 'happy-song-local',
            period: 'custom',
            operational_date_start: params[2],
            operational_date_end: params[3],
            received_at: new Date('2026-09-19T23:00:00+07:00'),
            payload_json: {
              period: 'custom',
              operational_date_start: params[2],
              operational_date_end: params[3],
              summary: { paid_revenue: 12500000, total_transactions: 8 },
              transactions: [{ transaction_id: 'TRX-1', grand_total: 12500000, payment_status: 'paid' }]
            }
          }]
        };
      }
      return { rowCount: 0, rows: [] };
    };

    const customExact = await getLatestOwnerMirrorSnapshot('happy-song-local', {
      period: 'custom',
      start_date: '2026-09-19',
      end_date: '2026-09-19'
    });
    assert.strictEqual(customExact.has_snapshot, true);
    assert.strictEqual(customExact.period, 'custom');
    assert.strictEqual(customExact.summary.paid_revenue, 12500000);
    console.log('  PASS custom date exact match single day returns valid snapshot');

    // Test custom date: Multi-day range merge when exact single snapshot does not exist
    db.query = async (sql, params) => {
      const text = String(sql);
      if (/WHERE source_id = \$1\s+AND operational_date_start = \$3::date/i.test(text)) {
        return { rowCount: 0, rows: [] }; // No exact multi-day snapshot
      }
      if (/WHERE source_id = \$1\s+AND operational_date_start >= \$2::date/i.test(text)) {
        // Returns 2 daily snapshots in that range
        return {
          rowCount: 2,
          rows: [
            {
              snapshot_id: 101,
              source_id: 'happy-song-local',
              period: 'today',
              operational_date_start: '2026-09-18',
              operational_date_end: '2026-09-18',
              received_at: new Date('2026-09-19T05:00:00+07:00'),
              payload_json: {
                operational_date_start: '2026-09-18',
                operational_date_end: '2026-09-18',
                summary: { paid_revenue: 5000000, total_transactions: 3 },
                transactions: [{ transaction_id: 'T-1', grand_total: 5000000, payment_status: 'paid', room_total: 3000000, fnb_total: 2000000 }],
                fnb_sold_items: [{ menu_id: 'M-1', menu_name: 'Ice Tea', quantity: 4, revenue: 80000 }],
                lc_performance: { items: [{ lc_id: 'LC-1', lc_name: 'Mawar', session_count: 1, total_duration_minutes: 120, total_fee: 300000 }] }
              }
            },
            {
              snapshot_id: 102,
              source_id: 'happy-song-local',
              period: 'today',
              operational_date_start: '2026-09-19',
              operational_date_end: '2026-09-19',
              received_at: new Date('2026-09-20T05:00:00+07:00'),
              payload_json: {
                operational_date_start: '2026-09-19',
                operational_date_end: '2026-09-19',
                summary: { paid_revenue: 7000000, total_transactions: 4 },
                transactions: [{ transaction_id: 'T-2', grand_total: 7000000, payment_status: 'paid', room_total: 4000000, fnb_total: 3000000 }],
                fnb_sold_items: [{ menu_id: 'M-1', menu_name: 'Ice Tea', quantity: 6, revenue: 120000 }],
                lc_performance: { items: [{ lc_id: 'LC-1', lc_name: 'Mawar', session_count: 2, total_duration_minutes: 240, total_fee: 600000 }] }
              }
            }
          ]
        };
      }
      return { rowCount: 0, rows: [] };
    };

    const customMerged = await getLatestOwnerMirrorSnapshot('happy-song-local', {
      period: 'custom',
      start_date: '2026-09-18',
      end_date: '2026-09-19'
    });
    assert.strictEqual(customMerged.has_snapshot, true);
    assert.strictEqual(customMerged.period, 'custom');
    assert.strictEqual(customMerged.summary.paid_revenue, 12000000);
    assert.strictEqual(customMerged.summary.total_transactions, 2);
    assert.strictEqual(customMerged.fnb_sold_summary.items[0].quantity, 10);
    assert.strictEqual(customMerged.fnb_sold_summary.items[0].revenue, 200000);
    assert.strictEqual(customMerged.lc_performance.items[0].session_count, 3);
    assert.strictEqual(customMerged.lc_performance.items[0].total_duration_minutes, 360);
    assert.strictEqual(customMerged.lc_performance.items[0].total_fee, 900000);
    console.log('  PASS multi-day custom range seamlessly aggregates daily snapshots when PC is offline');

    console.log('Owner Mirror Cutoff Rollover Tests passed.');
  } finally {
    db.query = originalQuery;
    db.pool.connect = originalPoolConnect;
  }
}

if (require.main === module) {
  runOwnerMirrorRolloverTests().catch(error => {
    console.error(`Owner Mirror Cutoff Rollover Test failed: ${error.message}`);
    process.exit(1);
  });
}

module.exports = runOwnerMirrorRolloverTests;
