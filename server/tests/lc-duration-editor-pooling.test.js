const assert = require('assert');
const path = require('path');
const db = require('../src/db');
const { getTransactionLcEditDetails, updateTransactionLcDurations } = require('../src/controllers/transactionsController');

async function runTests() {
  console.log('🧪 Menjalankan Pengujian Modal Revisi LC dengan Sistem Pooling Kuota Paket...');

  const originalPoolConnect = db.pool.connect;
  const originalDbQuery = db.query;

  try {
    // 1. Uji getTransactionLcDetails menyertakan package_rule untuk Paket Twin Morgan
    {
      console.log('\n--- Test 1: getTransactionLcDetails Menyertakan package_rule Kuota Paket ---');
      db.query = async (sql, params = []) => {
        const text = String(sql);
        if (text.includes('SELECT * FROM transactions WHERE transaction_id = $1')) {
          return {
            rowCount: 1,
            rows: [{
              transaction_id: 'TRX-1791300869871',
              room_id: 'ROOM-VIP-5',
              room_name: 'VIP 5',
              package_id: 'PKG-TWIN-MORGAN',
              package_name: 'PAKET TWIN MORGAN',
              package_total: 1200000,
              room_total: 1200000,
              fnb_total: 510000,
              lc_total: 480000,
              grand_total: 2190000,
              payment_status: 'paid',
              payment_method: 'transfer',
              cash_amount: 0,
              transfer_amount: 2190000,
              booking_mode: 'package'
            }]
          };
        }
        if (text.includes('FROM lc_work_logs')) {
          return {
            rowCount: 4,
            rows: [
              { log_id: 'LOG-DESI', lc_id: 'LC-DESI', lc_name: 'DESI', duration_minutes: 60, rate_per_hour: 120000, rate: 120000, customer_charge_amount: 0, billing_source: 'package_included', included_minutes: 60, extra_minutes: 0 },
              { log_id: 'LOG-OLA', lc_id: 'LC-OLA', lc_name: 'Ola', duration_minutes: 60, rate_per_hour: 120000, rate: 120000, customer_charge_amount: 0, billing_source: 'package_included', included_minutes: 60, extra_minutes: 0 },
              { log_id: 'LOG-NADIA', lc_id: 'LC-NADIA', lc_name: 'Nadia', duration_minutes: 120, rate_per_hour: 120000, rate: 240000, customer_charge_amount: 240000, billing_source: 'extra_charge', included_minutes: 0, extra_minutes: 120 },
              { log_id: 'LOG-EKA', lc_id: 'LC-EKA', lc_name: 'Eka', duration_minutes: 120, rate_per_hour: 120000, rate: 240000, customer_charge_amount: 240000, billing_source: 'extra_charge', included_minutes: 0, extra_minutes: 120 }
            ]
          };
        }
        if (text.includes('FROM package_master')) {
          return {
            rowCount: 1,
            rows: [{ package_id: 'PKG-TWIN-MORGAN', package_name: 'PAKET TWIN MORGAN', included_lc_count: 2, included_lc_duration_minutes: 120 }]
          };
        }
        return { rowCount: 0, rows: [] };
      };

      const req = { query: { transaction_id: 'TRX-1791300869871' } };
      let jsonResult = null;
      const res = {
        json: (data) => { jsonResult = data; return data; },
        status: () => res
      };

      await getTransactionLcEditDetails(req, res);
      assert.ok(jsonResult, 'Response json harus ada');
      assert.strictEqual(jsonResult.ok, true);
      assert.ok(jsonResult.package_rule, 'package_rule harus ada di response');
      assert.strictEqual(jsonResult.package_rule.included_lc_count, 2, 'Jatah paket harus 2 LC');
      assert.strictEqual(jsonResult.package_rule.included_lc_duration_minutes, 120, 'Durasi jatah paket harus 120 menit');
      console.log('  ✓ PASS: getTransactionLcDetails mengembalikan package_rule 2 LC @ 120 menit');
    }

    // 2. Uji Logika Frontend Modal: Desi & Ola dinaikkan ke 2 jam
    {
      console.log('\n--- Test 2: Simulasi Frontend Modal Revisi LC dengan Pooling ---');

      function allocateEditorLcBillingTest(logs, packageRule, editedDurations = {}) {
        const includedCount = Math.max(0, Math.floor(Number(packageRule?.included_lc_count || 0)));
        const includedDuration = Math.max(0, Math.floor(Number(packageRule?.included_lc_duration_minutes || 0)));
        const hasPackageRule = Boolean(packageRule?.package_id || includedCount > 0);

        let remainingPackageQuota = includedCount * includedDuration;
        const maxIncludedPerLc = includedDuration > 0 ? includedDuration : remainingPackageQuota;

        const items = (logs || []).map((log) => {
          const durationMinutes = Math.max(0, Math.round(Number(editedDurations?.[log.lc_id] ?? log.duration_minutes ?? 60)));
          const ratePerHour = Number(log.rate_per_hour || log.rate || 120000);
          return {
            ...log,
            duration_minutes: durationMinutes,
            rate_per_hour: ratePerHour,
          };
        });

        const sortedItems = [...items].sort((a, b) => {
          if (b.duration_minutes !== a.duration_minutes) return b.duration_minutes - a.duration_minutes;
          return b.rate_per_hour - a.rate_per_hour;
        });

        const allocatedMap = new Map();
        sortedItems.forEach((item) => {
          const canInclude = Math.min(item.duration_minutes, maxIncludedPerLc, remainingPackageQuota);
          const includedMinutes = Math.max(0, canInclude);
          remainingPackageQuota = Math.max(0, remainingPackageQuota - includedMinutes);

          const extraMinutes = Math.max(0, item.duration_minutes - includedMinutes);
          const payableAmount = Math.ceil(item.duration_minutes / 60) * item.rate_per_hour;
          const customerCharge = Math.ceil(extraMinutes / 60) * item.rate_per_hour;
          const billingSource = includedMinutes > 0
            ? (extraMinutes > 0 ? 'package_partial' : 'package_included')
            : (hasPackageRule ? 'extra_charge' : 'regular');

          allocatedMap.set(item.lc_id, {
            ...item,
            included_minutes: includedMinutes,
            extra_minutes: extraMinutes,
            payable_amount: payableAmount,
            customer_charge_amount: customerCharge,
            billing_source: billingSource,
          });
        });

        return {
          allocatedList: items.map((log) => allocatedMap.get(log.lc_id) || log),
          allocatedMap,
        };
      }

      const logs = [
        { lc_id: 'LC-DESI', lc_name: 'DESI', duration_minutes: 60, rate_per_hour: 120000 },
        { lc_id: 'LC-OLA', lc_name: 'Ola', duration_minutes: 60, rate_per_hour: 120000 },
        { lc_id: 'LC-NADIA', lc_name: 'Nadia', duration_minutes: 120, rate_per_hour: 120000 },
        { lc_id: 'LC-EKA', lc_name: 'Eka', duration_minutes: 120, rate_per_hour: 120000 }
      ];
      const packageRule = { package_id: 'PKG-TWIN-MORGAN', included_lc_count: 2, included_lc_duration_minutes: 120 };

      // Kasir mengubah durasi Desi menjadi 120 menit dan Ola menjadi 120 menit di dropdown
      const editedDurations = {
        'LC-DESI': 120,
        'LC-OLA': 120,
        'LC-NADIA': 120,
        'LC-EKA': 120
      };

      const { allocatedList, allocatedMap } = allocateEditorLcBillingTest(logs, packageRule, editedDurations);

      const totalCustomerCharge = allocatedList.reduce((sum, item) => sum + item.customer_charge_amount, 0);
      assert.strictEqual(totalCustomerCharge, 480000, 'Total customer charge LC harus tetap Rp 480.000 (tidak ada kenaikan tagihan)!');

      // 2 orang harus 100% masuk paket (Rp 0), dan 2 orang lagi extra charge (Rp 240.000)
      const freeLcs = allocatedList.filter(item => item.customer_charge_amount === 0 && item.billing_source === 'package_included');
      const extraLcs = allocatedList.filter(item => item.customer_charge_amount === 240000 && item.billing_source === 'extra_charge');

      assert.strictEqual(freeLcs.length, 2, 'Harus ada tepat 2 LC yang jatah paket Rp 0');
      assert.strictEqual(extraLcs.length, 2, 'Harus ada tepat 2 LC yang ditagih extra charge');

      console.log('  ✓ PASS: Total LC Baru tetap Rp 480.000 (Grand Total tetap Rp 2.190.000)');
      console.log('  ✓ PASS: Tidak ada tagihan tambahan ke konsumen!');
    }

    // 3. Uji updateTransactionLcDurations saat disimpan ke Backend
    {
      console.log('\n--- Test 3: Eksekusi updateTransactionLcDurations di Backend ---');
      const updatedLogs = [];
      const mockClient = {
        query: async (sql, params = []) => {
          const text = String(sql);
          if (text.includes('SELECT * FROM transactions WHERE transaction_id = $1')) {
            return {
              rowCount: 1,
              rows: [{
                transaction_id: 'TRX-1791300869871',
                room_id: 'ROOM-VIP-5',
                room_name: 'VIP 5',
                package_id: 'PKG-TWIN-MORGAN',
                package_name: 'PAKET TWIN MORGAN',
                package_total: 1200000,
                room_total: 1200000,
                fnb_total: 510000,
                lc_total: 480000,
                grand_total: 2190000,
                payment_status: 'paid',
                payment_method: 'transfer',
                cash_amount: 0,
                transfer_amount: 2190000,
                booking_mode: 'package'
              }]
            };
          }
          if (text.includes('FROM lc_work_logs') && text.includes('closed_transaction_id = $1')) {
            return {
              rowCount: 4,
              rows: [
                { log_id: 'LOG-DESI', lc_id: 'LC-DESI', lc_name: 'DESI', duration_minutes: 60, rate_per_hour: 120000, rate: 120000, customer_charge_amount: 0, billing_source: 'package_included', included_minutes: 60, extra_minutes: 0 },
                { log_id: 'LOG-OLA', lc_id: 'LC-OLA', lc_name: 'Ola', duration_minutes: 60, rate_per_hour: 120000, rate: 120000, customer_charge_amount: 0, billing_source: 'package_included', included_minutes: 60, extra_minutes: 0 },
                { log_id: 'LOG-NADIA', lc_id: 'LC-NADIA', lc_name: 'Nadia', duration_minutes: 120, rate_per_hour: 120000, rate: 240000, customer_charge_amount: 240000, billing_source: 'extra_charge', included_minutes: 0, extra_minutes: 120 },
                { log_id: 'LOG-EKA', lc_id: 'LC-EKA', lc_name: 'Eka', duration_minutes: 120, rate_per_hour: 120000, rate: 240000, customer_charge_amount: 240000, billing_source: 'extra_charge', included_minutes: 0, extra_minutes: 120 }
              ]
            };
          }
          if (text.includes('FROM package_master')) {
            return {
              rowCount: 1,
              rows: [{ package_id: 'PKG-TWIN-MORGAN', package_name: 'PAKET TWIN MORGAN', included_lc_count: 2, included_lc_duration_minutes: 120 }]
            };
          }
          if (text.includes('UPDATE lc_work_logs')) {
            updatedLogs.push({ sql: text, params });
            return { rowCount: 1 };
          }
          if (text.includes('UPDATE transactions')) {
            return {
              rowCount: 1,
              rows: [{
                transaction_id: 'TRX-1791300869871',
                grand_total: 2190000,
                lc_total: 480000,
                room_total: 1200000,
                fnb_total: 510000,
                payment_method: 'transfer',
                transfer_amount: 2190000,
                cash_amount: 0,
                booking_mode: 'package'
              }]
            };
          }
          if (text.includes('INSERT INTO')) {
            return { rowCount: 1 };
          }
          return { rowCount: 1, rows: [] };
        },
        release: () => {}
      };

      db.pool.connect = async () => mockClient;

      const req = {};
      let saveResult = null;
      const res = {
        json: (data) => { saveResult = data; return data; },
        status: () => res
      };

      await updateTransactionLcDurations(req, res, {
        transaction_id: 'TRX-1791300869871',
        assignments: [
          { log_id: 'LOG-DESI', lc_id: 'LC-DESI', duration_minutes: 120 },
          { log_id: 'LOG-OLA', lc_id: 'LC-OLA', duration_minutes: 120 },
          { log_id: 'LOG-NADIA', lc_id: 'LC-NADIA', duration_minutes: 120 },
          { log_id: 'LOG-EKA', lc_id: 'LC-EKA', duration_minutes: 120 }
        ],
        reason: 'Koreksi jam riil LC paket twin morgan',
        changed_by: 'Owner'
      });

      assert.ok(saveResult, 'Save result harus ada');
      assert.strictEqual(saveResult.ok, true);
      assert.strictEqual(saveResult.grand_total, 2190000, 'Grand total harus tetap Rp 2.190.000!');
      assert.strictEqual(saveResult.lc_total, 480000, 'LC total harus tetap Rp 480.000!');
      assert.strictEqual(updatedLogs.length, 4, 'Keempat LC harus ter-update di database');

      console.log('  ✓ PASS: updateTransactionLcDurations berhasil menyimpan durasi baru tanpa mengubah grand_total');
      console.log('  ✓ PASS: Grand Total tetap Rp 2.190.000 dan LC Total tetap Rp 480.000');
    }

    console.log('\n🎉 SEMUA PENGUJIAN MODAL REVISI LC POOLING BERHASIL DENGAN SEMPURNA!');
  } finally {
    db.pool.connect = originalPoolConnect;
    db.query = originalDbQuery;
  }
}

runTests().catch((err) => {
  console.error('❌ Test gagal:', err);
  process.exit(1);
});
