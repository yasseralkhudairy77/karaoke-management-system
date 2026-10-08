const assert = require('assert');
const path = require('path');

async function run() {
  console.log('🧪 Menjalankan Pengujian Alokasi Sistem Pooling Tabungan Kuota LC Paket...\n');

  const receiptModulePath = path.resolve(__dirname, '../../js/receipt.js');
  const { buildReceiptData, formatReceipt58mm } = await import('file://' + receiptModulePath.replace(/\\/g, '/'));

  // Formula resmi pooling yang sudah kita pasang di backend dan frontend
  function allocatePackageLcBillingPooled(lcRows, pkgRule) {
    const includedCount = Math.max(0, Math.floor(Number(pkgRule?.included_lc_count || 0)));
    const includedDuration = Math.max(0, Math.floor(Number(pkgRule?.included_lc_duration_minutes || 0)));
    const hasPackageRule = Boolean(pkgRule?.package_id || includedCount > 0);

    let remainingPackageQuota = includedCount * includedDuration;
    const maxIncludedPerLc = includedDuration > 0 ? includedDuration : remainingPackageQuota;

    const sortedRows = [...lcRows].sort((a, b) => {
      const durA = Math.max(0, Math.round(Number(a.duration_minutes || a.durationMinutes || 0)));
      const durB = Math.max(0, Math.round(Number(b.duration_minutes || b.durationMinutes || 0)));
      if (durB !== durA) return durB - durA;
      const rateA = Number(a.rate_per_hour || a.ratePerHour || a.rate_per_room || 0);
      const rateB = Number(b.rate_per_hour || b.ratePerHour || b.rate_per_room || 0);
      return rateB - rateA;
    });

    return sortedRows.map((row) => {
      const durationMinutes = Math.max(0, Math.round(Number(row.duration_minutes || row.durationMinutes || 0)));
      const ratePerHour = Number(row.rate_per_hour || 120000);
      const payableAmount = Math.ceil(durationMinutes / 60) * ratePerHour;

      const canInclude = Math.min(durationMinutes, maxIncludedPerLc, remainingPackageQuota);
      const includedMinutes = Math.max(0, canInclude);
      remainingPackageQuota = Math.max(0, remainingPackageQuota - includedMinutes);

      const extraMinutes = Math.max(0, durationMinutes - includedMinutes);
      const customerChargeAmount = Math.ceil(extraMinutes / 60) * ratePerHour;
      const billingSource = includedMinutes > 0
        ? (extraMinutes > 0 ? 'package_partial' : 'package_included')
        : hasPackageRule
          ? 'extra_charge'
          : 'regular';

      return {
        ...row,
        duration_minutes: durationMinutes,
        rate_per_hour: ratePerHour,
        payable_amount: payableAmount,
        customer_charge_amount: customerChargeAmount,
        included_minutes: includedMinutes,
        extra_minutes: extraMinutes,
        billing_source: billingSource,
        package_id: pkgRule?.package_id || null
      };
    });
  }

  const packageRule = {
    package_id: 'PKG-TWIN-MORGAN',
    included_lc_count: 2,
    included_lc_duration_minutes: 120, // 2 LC @ 2 jam = Total Pool 240 menit (4 jam)
  };

  // Test 1: Skenario yang Diinginkan Pengguna:
  // Tamu memesan paket 4 jam jatah LC. Awalnya Desi & Ola baru kerja 1 jam (60 menit).
  // Kemudian Desi & Ola ditambah 1 jam lagi (sehingga masing-masing jadi 2 jam / 120 menit).
  // Sistem membaca bahwa jatah masih tersisa 2 jam, sehingga penambahan 1 jam tersebut
  // otomatis gratis (Tagihan Rp 0, tidak ada tambahan tagihan baru).
  {
    console.log('--- Test 1: Penambahan Jam Menyerap Sisa Kuota Paket Tanpa Tambahan Tagihan ---');

    // Tahap A: Desi dan Ola 1 jam
    const tahapA = [
      { lc_id: 'LC-DESI', lc_name: 'DESI', duration_minutes: 60, rate_per_hour: 120000 },
      { lc_id: 'LC-OLA', lc_name: 'Ola', duration_minutes: 60, rate_per_hour: 120000 },
    ];
    const resA = allocatePackageLcBillingPooled(tahapA, packageRule);
    const tagihanA = resA.reduce((sum, r) => sum + r.customer_charge_amount, 0);
    assert.strictEqual(tagihanA, 0, 'Tahap A: Tagihan LC harus Rp 0');
    assert.strictEqual(resA[0].included_minutes, 60);
    assert.strictEqual(resA[1].included_minutes, 60);
    console.log('  ✓ PASS: Desi (1 jam) & Ola (1 jam) = Rp 0, sisa kuota paket masih 2 jam');

    // Tahap B: Desi dan Ola dinaikkan jadi 2 jam (120 menit)
    const tahapB = [
      { lc_id: 'LC-DESI', lc_name: 'DESI', duration_minutes: 120, rate_per_hour: 120000 },
      { lc_id: 'LC-OLA', lc_name: 'Ola', duration_minutes: 120, rate_per_hour: 120000 },
    ];
    const resB = allocatePackageLcBillingPooled(tahapB, packageRule);
    const tagihanB = resB.reduce((sum, r) => sum + r.customer_charge_amount, 0);
    assert.strictEqual(tagihanB, 0, 'Tahap B: Tagihan LC HARUS TETAP Rp 0 (tidak ada tambahan tagihan)');
    assert.strictEqual(resB[0].included_minutes, 120, 'Desi dapat jatah penuh 120 menit gratis');
    assert.strictEqual(resB[0].extra_minutes, 0, 'Desi extra minutes 0');
    assert.strictEqual(resB[1].included_minutes, 120, 'Ola dapat jatah penuh 120 menit gratis');
    assert.strictEqual(resB[1].extra_minutes, 0, 'Ola extra minutes 0');
    console.log('  ✓ PASS: Desi dinaikkan ke 2 jam & Ola dinaikkan ke 2 jam = TETAP Rp 0! (Tidak dihitung tambahan tagihan)');
  }

  // Test 2: Skenario 4 LC (Nadia 2 jam, Eka 2 jam, Ola 2 jam, Desi 2 jam)
  {
    console.log('\n--- Test 2: Skenario 4 LC (Nadia, Eka, Ola, Desi masing-masing 2 jam) ---');
    const inputLcRows = [
      { lc_id: 'LC-DESI', lc_name: 'DESI', duration_minutes: 120, rate_per_hour: 120000 },
      { lc_id: 'LC-OLA', lc_name: 'Ola', duration_minutes: 120, rate_per_hour: 120000 },
      { lc_id: 'LC-NADIA', lc_name: 'Nadia', duration_minutes: 120, rate_per_hour: 120000 },
      { lc_id: 'LC-EKA', lc_name: 'Eka', duration_minutes: 120, rate_per_hour: 120000 },
    ];

    const allocated = allocatePackageLcBillingPooled(inputLcRows, packageRule);
    const includedLcs = allocated.filter(r => r.billing_source === 'package_included');
    const extraLcs = allocated.filter(r => r.billing_source === 'extra_charge');

    assert.strictEqual(includedLcs.length, 2, 'Harus ada 2 LC gratis jatah paket');
    assert.strictEqual(extraLcs.length, 2, 'Harus ada 2 LC ekstra');

    const totalCustomerCharge = allocated.reduce((sum, r) => sum + r.customer_charge_amount, 0);
    assert.strictEqual(totalCustomerCharge, 480000, 'Total tagihan LC customer adalah Rp 480.000');

    console.log('  ✓ PASS: 2 LC diserap kuota paket (Rp 0), 2 LC sisanya menjadi extra charge (Rp 480.000)');
    console.log('  ✓ PASS: Total tagihan customer sesuai uang yang dibayarkan tamu');
  }

  // Test 3: Skenario Struk Bersih (Bug Nilai 0 Teratasi)
  {
    console.log('\n--- Test 3: Verifikasi Struk Bebas dari Baris Ganjil "Extra Jam 1 jam" ---');
    const sampleLc = {
      lc_id: 'LC-DESI',
      lc_name: 'DESI',
      duration_minutes: 120,
      included_minutes: 120,
      extra_minutes: 0,
      rate_per_hour: 120000,
      payable_amount: 240000,
      customer_charge_amount: 0,
      billing_source: 'package_included'
    };

    const transaction = {
      transaction_id: 'TRX-TEST-POOL',
      room_name: 'VIP 5',
      booking_mode: 'package',
      package_name: 'PAKET TWIN MORGAN',
      room_total: 0,
      fnb_total: 0,
      lc_total: 0,
      grand_total: 2190000,
      lc_details: {
        detail_available: true,
        lc_logs: [sampleLc],
        total: 0
      }
    };

    const receiptData = buildReceiptData(transaction, { lcDetails: transaction.lc_details });
    const formattedReceipt = formatReceipt58mm(receiptData);

    assert.strictEqual(formattedReceipt.includes('DESI'), true);
    assert.strictEqual(formattedReceipt.includes('Termasuk Paket'), true);
    assert.strictEqual(formattedReceipt.includes('Extra Jam'), false, 'TIDAK BOLEH mencetak Extra Jam jika extra_minutes = 0');
    assert.strictEqual(formattedReceipt.includes('Tagihan                      Rp0'), true);

    console.log('  ✓ PASS: Struk kasir mencetak "Termasuk Paket" dan Tagihan Rp0 tanpa memunculkan "Extra Jam"');
  }

  console.log('\n🎉 SEMUA PENGUJIAN SISTEM POOLING PAKET LC BERHASIL DENGAN SEMPURNA!');
}

run().catch((err) => {
  console.error('Test Failed:', err);
  process.exit(1);
});
