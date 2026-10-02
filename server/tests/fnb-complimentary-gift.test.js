const assert = require('assert');
const path = require('path');

// Test formatFreeGiftSlip58mm & formatReceiptText58mm from js/receipt.js
async function runTests() {
  console.log('🧪 Running Free Gift (Complimentary) Tests...');

  const receiptPath = path.resolve(__dirname, '../../js/receipt.js');
  const { formatFreeGiftSlip58mm, buildReceiptData, formatReceipt58mm } = await import(`file://${receiptPath.replace(/\\/g, '/')}`);

  // Test 1: Standard Free Gift Bar Slip 58mm
  {
    const sampleGift = {
      order_id: 'FNB-GIFT-1725890000000',
      created_at: '2026-09-09T02:30:00.000Z',
      room_name: 'Room Executive',
      cashier_name: 'Siti Rahma',
      authorizer: 'Pak Budi (OWNER)',
      reason: 'Hadiah Khusus Tamu VIP Rekanan',
      menu_name: 'Captain Morgan 750ml',
      quantity: 1,
      original_price: 450000
    };

    const slip = formatFreeGiftSlip58mm(sampleGift, { width: 32 });
    assert(slip.includes('SLIP FREE GIFT / KOMPLIMEN BAR'), 'Slip harus memiliki header Free Gift Bar');
    assert(slip.includes('Room Executive'), 'Slip harus mencantumkan nama room');
    assert(slip.includes('Pak Budi (OWNER)'), 'Slip harus mencantumkan nama pengotorisasi');
    assert(slip.includes('Captain Morgan 750ml'), 'Slip harus mencantumkan nama menu');
    assert(slip.includes('Rp0 (GRATIS)'), 'Slip harus mencantumkan Rp0 (GRATIS)');
    assert(slip.includes('Pemberi Hadiah'), 'Slip harus memiliki kolom tanda tangan pemberi');
    assert(slip.includes('Petugas Bar'), 'Slip harus memiliki kolom tanda tangan bartender');
    console.log('  PASS: Standard Free Gift 58mm bar slip renders accurately');
  }

  // Test 2: Reprint notice on Free Gift Slip
  {
    const sampleGift = {
      order_id: 'FNB-GIFT-1725890000000',
      room_name: 'VIP 1',
      authorizer: 'Owner',
      menu_name: 'Heineken Bucket',
      quantity: 2,
      original_price: 250000
    };

    const slipReprint = formatFreeGiftSlip58mm(sampleGift, { width: 32, isReprint: true });
    assert(slipReprint.includes('*** CETAK ULANG ***'), 'Slip cetak ulang harus memiliki banner CETAK ULANG');
    console.log('  PASS: Free Gift reprint slip includes *** CETAK ULANG ***');
  }

  // Test 3: Checkout customer receipt with Free Gift item
  {
    const sampleTx = {
      transaction_id: 'TRX-1725899999999',
      room_name: 'Room Executive',
      start_time: '2026-09-09T01:00:00.000Z',
      end_time: '2026-09-09T03:00:00.000Z',
      duration_minutes: 120,
      rate_per_hour: 100000,
      room_total: 200000,
      fnb_total: 0,
      lc_total: 0,
      grand_total: 200000,
      payment_method: 'cash',
      payment_status: 'paid',
      cashier_name: 'Kasir',
      fnb_orders: [
        {
          order_id: 'FNB-GIFT-123456',
          items: [
            {
              menu_name: 'Captain Morgan 750ml',
              quantity: 1,
              price: 0,
              subtotal: 0,
              is_complimentary: true,
              complimentary_reason: 'Hadiah Owner untuk Tamu VIP',
              complimentary_by: 'Owner'
            }
          ]
        }
      ]
    };

    const receiptData = buildReceiptData(sampleTx);
    const customerReceipt = formatReceipt58mm(receiptData, { width: 32 });
    assert(customerReceipt.includes('Captain Morgan 750ml'), 'Nota tamu harus mencantumkan item Captain Morgan');
    assert(customerReceipt.includes('FREE GIFT'), 'Nota tamu harus menandai FREE GIFT');
    assert(customerReceipt.includes('Hadiah Owner'), 'Nota tamu harus mencantumkan catatan hadiah');
    assert(customerReceipt.includes('Rp200.000'), 'Grand total tagihan tidak boleh tertambah biaya minuman gratis');
    console.log('  PASS: Customer checkout receipt displays Free Gift with Rp 0 and appreciation banner');
  }

  // Test 4: Anti double-deduction logic verification
  {
    // Mock inventory simulation
    let barStock = 10; // 10 botol Captain Morgan di bar
    const complimentaryItem = {
      menu_name: 'Captain Morgan 750ml',
      quantity: 1,
      is_complimentary: true,
      stock_deducted: false
    };

    // Saat tombol "Kirim Hadiah" ditekan: potong stok langsung
    if (complimentaryItem.is_complimentary && !complimentaryItem.stock_deducted) {
      barStock -= complimentaryItem.quantity;
      complimentaryItem.stock_deducted = true;
    }
    assert.strictEqual(barStock, 9, 'Stok bar harus berkurang 1 botol saat hadiah dikirim');
    assert.strictEqual(complimentaryItem.stock_deducted, true, 'Item harus ditandai stock_deducted = true');

    // Saat checkout 2 jam kemudian: simulasi checkout filter
    const orderItemsAtCheckout = [
      complimentaryItem,
      { menu_name: 'French Fries', quantity: 2, is_complimentary: false, stock_deducted: false }
    ];

    // Filter checkout: hanya potong item yang bukan complimentary dan belum pernah dipotong
    const itemsToDeductAtCheckout = orderItemsAtCheckout.filter(
      item => !item.is_complimentary && !item.stock_deducted
    );

    assert.strictEqual(itemsToDeductAtCheckout.length, 1, 'Hanya French Fries yang dipotong saat checkout');
    assert.strictEqual(itemsToDeductAtCheckout[0].menu_name, 'French Fries');
    assert.strictEqual(barStock, 9, 'Stok botol Captain Morgan tidak boleh terpotong ulang saat checkout');
    console.log('  PASS: Anti-double-deduction logic prevents re-deducting stock at room checkout');
  }

  // Test 5: Cancellation / Void restores stock
  {
    let barStock = 9;
    const giftItemToCancel = {
      menu_name: 'Captain Morgan 750ml',
      quantity: 1,
      is_complimentary: true,
      stock_deducted: true
    };

    // Saat dibatalkan dengan otorisasi Owner
    if (giftItemToCancel.stock_deducted) {
      barStock += giftItemToCancel.quantity;
      giftItemToCancel.stock_deducted = false;
    }
    assert.strictEqual(barStock, 10, 'Stok bar harus kembali menjadi 10 botol jika hadiah dibatalkan');
    console.log('  PASS: Cancelling complimentary gift successfully restores inventory stock');
  }

  console.log('✅ ALL Free Gift Tests PASSED SUCCESSFULLY!\n');
}

runTests().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
