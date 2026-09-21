const assert = require('assert');
const db = require('../src/db');
const { buildOwnerMirrorSnapshot, deriveAnalyticsFromSnapshotPayload } = require('../src/services/ownerMirrorService');

(async () => {
  console.log('🧪 Testing Owner Mirror Snapshot Analytics Integration...');

  const originalQuery = db.query;

  try {
    db.query = async (sql, params) => {
      const sqlText = String(sql);

      // Mock rooms
      if (sqlText.includes('FROM rooms')) {
        return {
          rowCount: 4,
          rows: [
            { room_id: 'R01', room_name: 'Room 01 (Small)', status: 'available', rate_per_hour: 50000, start_time: null, booked_duration_minutes: 0, scheduled_end_time: null, tv_device_id: 'TV-1', updated_at: new Date() },
            { room_id: 'R02', room_name: 'Room 02 (Medium)', status: 'occupied', rate_per_hour: 80000, start_time: new Date(), booked_duration_minutes: 120, scheduled_end_time: new Date(), tv_device_id: 'TV-2', updated_at: new Date() },
            { room_id: 'VIP1', room_name: 'VIP 01', status: 'available', rate_per_hour: 150000, start_time: null, booked_duration_minutes: 0, scheduled_end_time: null, tv_device_id: 'TV-3', updated_at: new Date() },
            { room_id: 'VIP2', room_name: 'VIP 02', status: 'cleaning', rate_per_hour: 150000, start_time: null, booked_duration_minutes: 0, scheduled_end_time: null, tv_device_id: 'TV-4', updated_at: new Date() }
          ]
        };
      }

      // Mock transactions (Current & Compare)
      if (sqlText.includes('COUNT(*) AS trx_count') || sqlText.includes('FROM transactions WHERE operational_date')) {
        if (sqlText.includes('EXTRACT(HOUR')) {
          // Hourly traffic mock
          return {
            rowCount: 2,
            rows: [
              { hour_wib: 14, session_count: 3, hourly_revenue: 600000, hourly_room_hours: 4.5 },
              { hour_wib: 21, session_count: 5, hourly_revenue: 1400000, hourly_room_hours: 9.0 }
            ]
          };
        }
        if (sqlText.includes('GROUP BY operational_date')) {
          // Daily sequence mock
          return {
            rowCount: 1,
            rows: [
              { operational_date: '2026-09-21', trx_count: 8, daily_revenue: 2000000, daily_room_hours: 13.5 }
            ]
          };
        }
        if (sqlText.includes('GROUP BY dow_wib')) {
          // Day of week mock
          return {
            rowCount: 7,
            rows: [
              { dow_wib: 0, total_sessions: 4, total_revenue: 1200000, total_room_hours: 8 },
              { dow_wib: 1, total_sessions: 2, total_revenue: 500000, total_room_hours: 3 },
              { dow_wib: 2, total_sessions: 2, total_revenue: 600000, total_room_hours: 4 },
              { dow_wib: 3, total_sessions: 3, total_revenue: 700000, total_room_hours: 5 },
              { dow_wib: 4, total_sessions: 3, total_revenue: 800000, total_room_hours: 6 },
              { dow_wib: 5, total_sessions: 6, total_revenue: 2500000, total_room_hours: 14 },
              { dow_wib: 6, total_sessions: 8, total_revenue: 3500000, total_room_hours: 18 }
            ]
          };
        }
        if (sqlText.includes('GROUP BY t.room_id, r.room_name')) {
          // Room leaderboard mock
          return {
            rowCount: 2,
            rows: [
              { room_id: 'VIP1', room_name: 'VIP 01', session_count: 5, total_revenue: 2500000, total_room_hours: 12.0 },
              { room_id: 'R02', room_name: 'Room 02 (Medium)', session_count: 3, total_revenue: 1000000, total_room_hours: 6.0 }
            ]
          };
        }

        // Standard current/compare aggregation
        return {
          rowCount: 1,
          rows: [
            {
              trx_count: 8,
              total_revenue: 3500000,
              room_revenue: 2000000,
              fnb_revenue: 1000000,
              lc_revenue: 500000,
              total_room_minutes: 810,
              total_discounts: 50000,
              total_cash: 2000000,
              total_transfer: 1500000,
              extended_sessions_count: 3,
              lc_sessions_count: 2
            }
          ]
        };
      }

      // Mock F&B Margin
      if (sqlText.includes('fnb_gross_sales')) {
        return {
          rowCount: 1,
          rows: [{ fnb_gross_sales: 1000000, fnb_total_hpp: 400000 }]
        };
      }

      // Mock F&B Leaderboard
      if (sqlText.includes('oi.menu_id, oi.menu_name, oi.category') && sqlText.includes('GROUP BY')) {
        return {
          rowCount: 2,
          rows: [
            { menu_id: 'MN-01', menu_name: 'Es Teh Manis', category: 'Drink', total_quantity: 25, total_revenue: 250000 },
            { menu_id: 'MN-02', menu_name: 'Snack Platter', category: 'Food', total_quantity: 10, total_revenue: 350000 }
          ]
        };
      }

      // Mock normal transactions list
      if (sqlText.includes('FROM transactions')) {
        return {
          rowCount: 0,
          rows: []
        };
      }

      // Mock cashier_closings
      if (sqlText.includes('FROM cashier_closings')) {
        return { rowCount: 0, rows: [] };
      }

      // Mock fnb_orders
      if (sqlText.includes('FROM fnb_orders')) {
        return { rowCount: 0, rows: [] };
      }

      // Mock sales_commission_logs
      if (sqlText.includes('FROM sales_commission_logs')) {
        return { rowCount: 0, rows: [] };
      }

      // Mock lc_work_logs
      if (sqlText.includes('lc_work_logs')) {
        return { rowCount: 0, rows: [] };
      }

      // Mock sync_outbox
      if (sqlText.includes('FROM sync_outbox')) {
        return { rowCount: 1, rows: [{ pending_count: 0, synced_count: 10, failed_count: 0 }] };
      }

      // Mock inventory
      if (sqlText.includes('FROM inventory') || sqlText.includes('stock')) {
        return { rowCount: 0, rows: [] };
      }

      return { rowCount: 0, rows: [] };
    };

    const snapshot = await buildOwnerMirrorSnapshot({ period: 'today' });

    assert.ok(snapshot, 'Snapshot must not be null');
    assert.strictEqual(snapshot.period, 'today', 'Snapshot period must be today');
    assert.ok(snapshot.analytics, 'Snapshot must contain analytics property');

    const analytics = snapshot.analytics;
    assert.ok(analytics.kpi, 'Analytics must have KPI object');
    assert.strictEqual(analytics.kpi.totalRevenue.current, 3500000, 'KPI totalRevenue must match mock');
    assert.strictEqual(analytics.kpi.fnbGrossMargin.grossSales, 1000000, 'KPI fnbGrossMargin grossSales must match mock');
    assert.strictEqual(analytics.kpi.fnbGrossMargin.grossProfit, 600000, 'KPI gross profit must be sales minus hpp');
    assert.strictEqual(analytics.kpi.fnbGrossMargin.currentPercent, 60, 'KPI gross profit margin percent must be 60%');

    assert.ok(Array.isArray(analytics.hourlyTraffic), 'hourlyTraffic must be an array');
    assert.strictEqual(analytics.hourlyTraffic.length, 24, 'hourlyTraffic must have 24 hours');

    assert.ok(Array.isArray(analytics.dayOfWeekPattern.days), 'dayOfWeekPattern must have days array');
    assert.strictEqual(analytics.dayOfWeekPattern.days.length, 7, 'dayOfWeekPattern must have 7 days');

    assert.ok(Array.isArray(analytics.roomLeaderboard), 'roomLeaderboard must be an array');
    assert.ok(Array.isArray(analytics.fnbLeaderboard), 'fnbLeaderboard must be an array');

    console.log('  ✓ PASS: Snapshot successfully encapsulates rich analytics data for Railway Owner Monitor');

    // Test deriveAnalyticsFromSnapshotPayload timezone handling
    const samplePayload = {
      operational_date_start: '2026-09-20',
      operational_date_end: '2026-09-20',
      transactions: [
        {
          transaction_id: 'TRX-1',
          start_time: '2026-09-20T14:55:09.861Z',
          start_time_wib: '2026-09-20T21:55:09+07:00',
          operational_date: '2026-09-20',
          payment_status: 'paid',
          grand_total: 3775000,
          room_total: 2500000,
          fnb_total: 1275000,
          duration_minutes: 180
        },
        {
          transaction_id: 'TRX-2',
          start_time: '2026-09-20T17:11:24.372Z',
          start_time_wib: '2026-09-21T00:11:24+07:00',
          operational_date: '2026-09-20',
          payment_status: 'paid',
          grand_total: 1610000,
          room_total: 1000000,
          fnb_total: 610000,
          duration_minutes: 120
        }
      ]
    };

    const derived = deriveAnalyticsFromSnapshotPayload(samplePayload, 'yesterday');
    const hour14 = derived.hourlyTraffic.find(h => h.hour_wib === 14);
    const hour21 = derived.hourlyTraffic.find(h => h.hour_wib === 21);
    const hour00 = derived.hourlyTraffic.find(h => h.hour_wib === 0);

    assert.strictEqual(hour14.hourly_revenue, 0, 'Hour 14 WIB must have 0 revenue (Karaoke has no 14:00 session)');
    assert.strictEqual(hour14.session_count, 0, 'Hour 14 WIB must have 0 sessions');
    assert.strictEqual(hour21.hourly_revenue, 3775000, 'Hour 21 WIB must have 3,775,000 revenue');
    assert.strictEqual(hour21.session_count, 1, 'Hour 21 WIB must have 1 session');
    assert.strictEqual(hour00.hourly_revenue, 1610000, 'Hour 00 WIB (midnight) must have 1,610,000 revenue');
    assert.strictEqual(hour00.session_count, 1, 'Hour 00 WIB must have 1 session');

    // Day of week check: 2026-09-20 was Sunday (index 0)
    assert.strictEqual(derived.dayOfWeekPattern.days[0].total_sessions, 2, 'Sunday (Minggu) must capture the 2 sessions');
    assert.strictEqual(derived.dayOfWeekPattern.days[0].day_name, 'Minggu');

    console.log('  ✓ PASS: deriveAnalyticsFromSnapshotPayload accurately maps UTC times to Asia/Jakarta (WIB) hours without offset bugs');
    console.log('🎉 All Owner Mirror Analytics Integration Tests Passed!\n');
  } catch (err) {
    console.error('❌ Test failed with error:', err);
    process.exit(1);
  } finally {
    db.query = originalQuery;
  }
})();
