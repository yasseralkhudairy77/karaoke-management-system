const assert = require('assert');
const path = require('path');
const fs = require('fs');

async function runTests() {
  console.log('🧪 Running LC Thermal Print Reports (58mm) Tests...\n');

  const receiptPath = path.resolve(__dirname, '../../js/receipt.js');
  const { formatLcSlip58mm, formatLcShiftReport58mm } = await import(`file://${receiptPath.replace(/\\/g, '/')}`);

  // Test 1: Standard LC Individual Slip 58mm
  {
    console.log('  Testing Test 1: Standard LC individual slip 58mm...');
    const sampleLc = {
      lc_id: 'LC-002',
      lc_name: 'Rere',
      rate_per_room: 100000,
      total_sessions: 2,
      total_duration_minutes: 210,
      room_earning_total: 350000,
      sales_bonus_total: 50000,
      gross_earning_total: 400000,
      cash_advance_deduction: 50000,
      net_payout: 350000,
      logs: [
        {
          session_id: 'Executive-123',
          room_name: 'Room Executive',
          duration_minutes: 120,
          rate_per_hour: 100000,
          rate: 200000,
          status: 'closed',
          created_at: '2026-09-09T01:00:00.000Z',
          closed_at: '2026-09-09T03:00:00.000Z'
        },
        {
          session_id: 'VIP 1-124',
          room_name: 'Room VIP 1',
          duration_minutes: 90,
          rate_per_hour: 100000,
          rate: 150000,
          status: 'closed',
          created_at: '2026-09-09T03:30:00.000Z',
          closed_at: '2026-09-09T05:00:00.000Z'
        }
      ],
      sales_bonus_logs: [
        {
          menu_name: 'Captain Morgan 750ml',
          quantity: 1,
          bonus_per_item: 50000,
          bonus_total: 50000
        }
      ]
    };

    const slip = formatLcSlip58mm(sampleLc, {
      cashierName: 'Siti Rahma',
      periodLabel: 'Shift Malam (09/09/2026)',
      width: 32
    });

    assert(slip.includes('SLIP KERJA & FEE PARTNER (LC)'), 'Slip harus memiliki header Partner LC');
    assert(slip.includes('TANDA TERIMA PEMBAYARAN'), 'Slip harus memiliki subheader tanda terima');
    assert(slip.includes('Rere (LC-002)'), 'Slip harus mencantumkan nama dan ID LC');
    assert(slip.includes('Siti Rahma'), 'Slip harus mencantumkan nama kasir');
    assert(slip.includes('Room Executive'), 'Slip harus mencantumkan Room Executive');
    assert(slip.includes('Room VIP 1'), 'Slip harus mencantumkan Room VIP 1');
    assert(slip.includes('2.0 Jam @ Rp100.000'), 'Slip harus mencantumkan jam dan tarif');
    assert(slip.includes('Captain Morgan 750ml'), 'Slip harus mencantumkan item bonus penjualan');
    assert(slip.includes('Bonus Sales F&B'), 'Slip harus mencantumkan subtotal bonus sales');
    assert(slip.includes('Potongan Kasbon'), 'Slip harus mencantumkan potongan kasbon');
    assert(slip.includes('TOTAL DITERIMA'), 'Slip harus mencantumkan total diterima bersih');
    assert(slip.includes('Partner (LC)'), 'Slip harus memiliki kolom tanda tangan LC');
    assert(slip.includes('Kasir (PIC)'), 'Slip harus memiliki kolom tanda tangan Kasir');

    console.log('  PASS: Standard LC individual slip renders accurately.');
  }

  // Test 2: LC Individual Slip Reprint
  {
    console.log('  Testing Test 2: LC individual slip reprint banner...');
    const sampleLc = {
      lc_id: 'LC-005',
      lc_name: 'Sari',
      rate_per_room: 100000,
      total_sessions: 1,
      total_duration_minutes: 60,
      room_earning_total: 100000,
      logs: [
        {
          session_id: 'Medium 02-125',
          room_name: 'Room Medium 02',
          duration_minutes: 60,
          rate_per_hour: 100000,
          rate: 100000,
          status: 'closed'
        }
      ]
    };

    const slipReprint = formatLcSlip58mm(sampleLc, { isReprint: true, width: 32 });
    assert(slipReprint.includes('*** CETAK ULANG ***'), 'Slip cetak ulang harus menyertakan banner cetak ulang');
    console.log('  PASS: Reprint banner verified on LC slip.');
  }

  // Test 3: LC Shift Recap Report 58mm (formatLcShiftReport58mm)
  {
    console.log('  Testing Test 3: LC shift recap report 58mm...');
    const sampleReportData = {
      period: 'Hari Ini (09/09/2026)',
      summary: {
        total_lcs: 3,
        total_sessions: 6,
        total_duration_minutes: 540,
        room_earning_total: 900000,
        sales_bonus_total: 100000,
        gross_earning_total: 1000000
      },
      reports: [
        {
          lc_id: 'LC-001',
          lc_name: 'Bella',
          total_sessions: 3,
          total_duration_minutes: 270,
          room_earning_total: 450000,
          sales_bonus_total: 50000,
          gross_earning_total: 500000
        },
        {
          lc_id: 'LC-002',
          lc_name: 'Rere',
          total_sessions: 2,
          total_duration_minutes: 180,
          room_earning_total: 300000,
          sales_bonus_total: 50000,
          gross_earning_total: 350000
        },
        {
          lc_id: 'LC-003',
          lc_name: 'Sari',
          total_sessions: 1,
          total_duration_minutes: 90,
          room_earning_total: 150000,
          sales_bonus_total: 0,
          gross_earning_total: 150000
        }
      ]
    };

    const shiftSlip = formatLcShiftReport58mm(sampleReportData, {
      cashierName: 'Ahmad Subarkah',
      width: 32
    });

    assert(shiftSlip.includes('REKAPITULASI LAPORAN LC'), 'Struk harus memiliki header rekapitulasi LC');
    assert(shiftSlip.includes('(SHIFT / HARIAN)'), 'Struk harus memiliki subheader shift/harian');
    assert(shiftSlip.includes('Ahmad Subarkah'), 'Struk harus mencantumkan nama kasir');
    assert(shiftSlip.includes('Total LC Aktif'), 'Struk harus mencantumkan total LC aktif');
    assert(shiftSlip.includes('3 Orang'), 'Struk harus mencantumkan jumlah 3 orang');
    assert(shiftSlip.includes('6 Sesi'), 'Struk harus mencantumkan 6 sesi');
    assert(shiftSlip.includes('9.0 Jam'), 'Struk harus mencantumkan 9.0 jam');
    assert(shiftSlip.includes('Bella (LC-001)'), 'Struk harus mencantumkan Bella');
    assert(shiftSlip.includes('Rere (LC-002)'), 'Struk harus mencantumkan Rere');
    assert(shiftSlip.includes('Sari (LC-003)'), 'Struk harus mencantumkan Sari');
    assert(shiftSlip.includes('TOTAL FEE LC'), 'Struk harus mencantumkan total fee LC');
    assert(shiftSlip.includes('Supervisor / Owner'), 'Struk harus memiliki tanda tangan supervisor');

    console.log('  PASS: LC shift recap report 58mm renders accurately.');
  }

  // Test 4: Frontend Contract & Integrity in js/app.js
  {
    console.log('  Testing Test 4: Frontend UI contract in js/app.js...');
    const appJsContent = fs.readFileSync(path.resolve(__dirname, '../../js/app.js'), 'utf8');

    assert(appJsContent.includes('formatLcSlip58mm'), 'js/app.js harus mengimpor formatLcSlip58mm');
    assert(appJsContent.includes('formatLcShiftReport58mm'), 'js/app.js harus mengimpor formatLcShiftReport58mm');
    assert(appJsContent.includes('Cetak Rekap (58mm)'), 'js/app.js harus memiliki tombol Cetak Rekap (58mm)');
    assert(appJsContent.includes('btn-print-lc-slip'), 'js/app.js harus memiliki tombol Cetak Slip per LC');

    console.log('  PASS: Frontend contract in js/app.js verified.');
  }

  console.log('\n✅ ALL LC Thermal Print Reports Tests PASSED SUCCESSFULLY!\n');
}

runTests().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
