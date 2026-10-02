const assert = require('assert');

// Logika penentuan durasi tagihan Happy Song Karaoke:
// "Kita tidak main hitungan menit, ketika sistem klik 2 jam maka yang harus ditagihkan adalah 2 jam"
function resolveRoomHourlyBilling({ startTime, endTime, bookedDurationMinutes, ratePerHour }) {
  const start = new Date(startTime);
  const end = new Date(endTime);
  const diffMs = end.getTime() - start.getTime();
  const physicalMinutes = Math.max(0, Math.ceil(diffMs / (60 * 1000)));

  const physicalHours = Math.ceil(physicalMinutes / 60);
  const bookedHours = Math.ceil((Number(bookedDurationMinutes) || 0) / 60);
  const billableHours = Math.max(1, bookedHours, physicalHours);
  const finalDurationMinutes = billableHours * 60;
  const roomTotal = billableHours * Number(ratePerHour || 0);

  return {
    billableHours,
    durationMinutes: finalDurationMinutes,
    roomTotal
  };
}

// Logika format durasi UI
function formatLcDurationShort(minutes) {
  const duration = Math.round(Number(minutes) || 0);
  if (duration <= 0) {
    return "0 menit";
  }
  const hours = Math.floor(duration / 60);
  const remainingMinutes = duration % 60;

  if (hours > 0 && remainingMinutes > 0) {
    return `${hours} jam ${remainingMinutes} menit`;
  }
  if (hours > 0) {
    return `${hours} jam`;
  }
  return `${duration} menit`;
}

function runTests() {
  console.log('🧪 Running Happy Song Karaoke Hourly Billing Tests...\n');

  // Test 1: Sesi TRX-1789072627631 (Ruangan 5 - VIP 5, booked 2 jam, checkout di 97 menit)
  console.log('Test 1: Sewa 2 jam checkout di 97 menit (1 jam 37 menit) wajib ditagih 2 jam penuh');
  const t1 = resolveRoomHourlyBilling({
    startTime: '2026-09-11T02:00:00+07:00',
    endTime: '2026-09-11T03:37:07+07:00', // 97 menit 7 detik
    bookedDurationMinutes: 120, // 2 jam sewa
    ratePerHour: 135000
  });
  assert.strictEqual(t1.billableHours, 2, 'Harus ditagih 2 jam');
  assert.strictEqual(t1.durationMinutes, 120, 'Durasi harus 120 menit');
  assert.strictEqual(t1.roomTotal, 270000, 'Biaya room harus Rp 270.000 (2 x Rp 135.000)');
  console.log('  ✓ Lulus: 120 menit sewa -> ditagih Rp 270.000 (bukan Rp 0 atau 1 menit)\n');

  // Test 2: Overtime lewat 2 jam (135 menit = 2 jam 15 menit) -> dibulatkan ke 3 jam
  console.log('Test 2: Sewa 2 jam tetapi overtime menjadi 135 menit dibulatkan ke atas menjadi 3 jam');
  const t2 = resolveRoomHourlyBilling({
    startTime: '2026-09-11T02:00:00+07:00',
    endTime: '2026-09-11T04:15:00+07:00', // 135 menit
    bookedDurationMinutes: 120,
    ratePerHour: 135000
  });
  assert.strictEqual(t2.billableHours, 3, 'Overtime dibulatkan ke 3 jam');
  assert.strictEqual(t2.durationMinutes, 180, 'Durasi harus 180 menit');
  assert.strictEqual(t2.roomTotal, 405000, 'Biaya room harus Rp 405.000 (3 x Rp 135.000)');
  console.log('  ✓ Lulus: Overtime 135 menit -> dibulatkan ke 3 jam (Rp 405.000)\n');

  // Test 3: Sewa 1 jam checkout di 25 menit -> tetap ditagih 1 jam penuh
  console.log('Test 3: Sewa 1 jam checkout di 25 menit ditagih 1 jam penuh');
  const t3 = resolveRoomHourlyBilling({
    startTime: '2026-09-11T02:00:00+07:00',
    endTime: '2026-09-11T02:25:00+07:00', // 25 menit
    bookedDurationMinutes: 60,
    ratePerHour: 135000
  });
  assert.strictEqual(t3.billableHours, 1, 'Harus ditagih 1 jam');
  assert.strictEqual(t3.durationMinutes, 60, 'Durasi harus 60 menit');
  assert.strictEqual(t3.roomTotal, 135000, 'Biaya room harus Rp 135.000');
  console.log('  ✓ Lulus: 60 menit sewa -> ditagih Rp 135.000\n');

  // Test 4: Fallback jika booked_duration_minutes kosong/0 tapi room fisik dipakai 97 menit
  console.log('Test 4: Fallback jika booked_duration_minutes kosong/0 tetapi fisik kamar dipakai 97 menit');
  const t4 = resolveRoomHourlyBilling({
    startTime: '2026-09-11T02:00:00+07:00',
    endTime: '2026-09-11T03:37:07+07:00',
    bookedDurationMinutes: 0, // kosong/hilang
    ratePerHour: 135000
  });
  assert.strictEqual(t4.billableHours, 2, 'Fallback membulatkan 97 menit ke 2 jam');
  assert.strictEqual(t4.durationMinutes, 120, 'Durasi harus 120 menit');
  assert.strictEqual(t4.roomTotal, 270000, 'Biaya room harus Rp 270.000');
  console.log('  ✓ Lulus: Fallback fisik membulatkan ke 2 jam (Rp 270.000)\n');

  // Test 5: Format UI formatLcDurationShort
  console.log('Test 5: Format tampilan durasi di UI dan Struk');
  assert.strictEqual(formatLcDurationShort(120), '2 jam');
  assert.strictEqual(formatLcDurationShort(60), '1 jam');
  assert.strictEqual(formatLcDurationShort(180), '3 jam');
  assert.strictEqual(formatLcDurationShort(0), '0 menit', 'Durasi 0 tidak boleh berubah jadi 1 menit');
  console.log('  ✓ Lulus: Tampilan durasi 120 menit = "2 jam", 0 menit = "0 menit"\n');

  console.log('✅ SEMUA PENGUJIAN HOURLY BILLING KARAOKE LULUS DENGAN SEMPURNA!');
}

runTests();
