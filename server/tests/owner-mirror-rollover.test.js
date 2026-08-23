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
    console.log('  PASS unmatched operational date remains empty');

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
    console.log('  PASS saving same-period mirror snapshot updates existing row and prunes duplicates');

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
