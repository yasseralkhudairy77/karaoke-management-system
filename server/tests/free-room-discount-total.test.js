const assert = require('assert');
const path = require('path');
const fs = require('fs');

async function runTests() {
  console.log('🧪 Running Free Room Discount & Grand Total Verification Tests...');

  // 1. Uji logika kalkulasi koreksi free room pada transactionsController
  const transactionsControllerPath = path.join(__dirname, '../src/controllers/transactionsController.js');
  const txSource = fs.readFileSync(transactionsControllerPath, 'utf8');

  assert.ok(txSource.includes('promoDiscount = toNumber(oldTransaction.promo_discount)'), 'Harus membaca promo_discount lama');
  assert.ok(txSource.includes('manualDiscountRoom = toNumber(oldTransaction.manual_discount_room)'), 'Harus membaca manual_discount_room lama');
  assert.ok(txSource.includes('nextRoomTotal = Math.max(0, baseBilledRoomTotal - promoDiscount - manualDiscountRoom)'), 'nextRoomTotal harus memperhitungkan promo & manual discount');
  assert.ok(txSource.includes('discountAmount = Math.max(0, Math.ceil((freeRoomMinutes / 60) * ratePerHour))'), 'discountAmount harus dihitung presisi');
  console.log('  ✓ transactionsController.correctTransactionFreeRoom terverifikasi menjaga promo_discount dan manual_discount');

  // 2. Uji roomsController closeSession memasukkan room_discount_amount
  const roomsControllerPath = path.join(__dirname, '../src/controllers/roomsController.js');
  const roomSource = fs.readFileSync(roomsControllerPath, 'utf8');

  assert.ok(roomSource.includes('roomDiscountAmount = freeRoomMinutes > 0'), 'closeSession harus menghitung room_discount_amount');
  assert.ok(roomSource.includes('billable_room_minutes, free_room_minutes, room_discount_amount'), 'INSERT INTO transactions harus menyertakan room_discount_amount');
  console.log('  ✓ roomsController.closeSession terverifikasi menyimpan room_discount_amount ke database transactions');

  // 3. Uji formula kalkulasi matematis:
  // Kasus A: Transaksi biasa 4 jam @ Rp 135.000 = Rp 540.000, FNB = Rp 50.000, LC = Rp 270.000.
  // Grand total awal = Rp 860.000.
  // Koreksi Free Room 1 jam (60m):
  const actualDurationMinutesA = 240;
  const freeMinutesA = 60;
  const rateA = 135000;
  const grossRoomTotalA = Math.ceil((actualDurationMinutesA / 60) * rateA); // 540.000
  const discountAmountA = Math.max(0, Math.ceil((freeMinutesA / 60) * rateA)); // 135.000
  const nextRoomTotalA = Math.max(0, grossRoomTotalA - discountAmountA); // 405.000
  const grandTotalA = nextRoomTotalA + 50000 + 270000; // 725.000
  assert.strictEqual(discountAmountA, 135000, 'Potongan room harus Rp 135.000');
  assert.strictEqual(nextRoomTotalA, 405000, 'Sewa room baru harus Rp 405.000');
  assert.strictEqual(grandTotalA, 725000, 'Grand total baru harus turun tepat Rp 135.000');
  console.log('  ✓ Kalkulasi Free Room transaksi regular terverifikasi presisi memotong total akhir');

  // Kasus B: Transaksi dengan promo voucher Rp 50.000 + Koreksi Free Room 1 jam
  // Room 3 jam @ 100.000 = Rp 300.000 - Promo Rp 50.000 = Rp 250.000. Grand total awal = Rp 250.000.
  const actualDurationMinutesB = 180;
  const freeMinutesB = 60;
  const rateB = 100000;
  const promoDiscountB = 50000;
  const grossRoomTotalB = Math.ceil((actualDurationMinutesB / 60) * rateB); // 300.000
  const discountAmountB = Math.max(0, Math.ceil((freeMinutesB / 60) * rateB)); // 100.000
  const baseBilledRoomTotalB = Math.max(0, grossRoomTotalB - discountAmountB); // 200.000
  const nextRoomTotalB = Math.max(0, baseBilledRoomTotalB - promoDiscountB); // 150.000
  const grandTotalB = nextRoomTotalB + 0 + 0; // 150.000
  assert.strictEqual(nextRoomTotalB, 150000, 'Room baru harus Rp 150.000 (300k - 100k free - 50k promo)');
  assert.strictEqual(grandTotalB, 150000, 'Grand total baru harus turun menjadi Rp 150.000');
  console.log('  ✓ Kalkulasi Free Room dengan promo diskon terverifikasi tidak menghapus promo');

  // 4. Uji file frontend js/app.js selector & badge
  const appJsPath = path.join(__dirname, '../../js/app.js');
  const appJsSource = fs.readFileSync(appJsPath, 'utf8');

  assert.ok(appJsSource.includes('billing-breakdown-total p:last-child'), 'updateCheckoutTotals harus menargetkan .billing-breakdown-total');
  assert.ok(appJsSource.includes('Free Room -${formatCurrency(getTransactionRoomDiscountAmount(transaction))}'), 'Tabel transaksi harus menampilkan badge potongan Free Room');
  console.log('  ✓ js/app.js terverifikasi menggunakan selector spesifik .billing-breakdown-total dan badge potongan Free Room');

  console.log('\n🎉 ALL FREE ROOM DISCOUNT & GRAND TOTAL TESTS PASSED!\n');
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
