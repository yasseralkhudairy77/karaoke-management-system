const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..');
const appSource = fs.readFileSync(path.join(repoRoot, 'js/app.js'), 'utf8');
const lcControllerSource = fs.readFileSync(path.join(repoRoot, 'server/src/controllers/lcController.js'), 'utf8');

console.log('🧪 Running LC Transaction Tracking & Search Bar Verification Tests...');

// 1. Verifikasi variabel state dan integrasi pencarian transaksi di app.js
assert(appSource.includes('let transactionSearchQuery = "";'), 'Harus ada deklarasi transactionSearchQuery');
assert(appSource.includes('function getFilteredTodayTransactions()'), 'Fungsi getFilteredTodayTransactions harus ada');
assert(appSource.includes('String(transactionSearchQuery || "").trim().toLowerCase()'), 'Pencarian harus case-insensitive dan trim');

// 2. Verifikasi UI search bar di Riwayat Transaksi
assert(appSource.includes('id = "transactionSearchInput"'), 'Input pencarian riwayat transaksi harus memiliki ID');
assert(appSource.includes('placeholder = "Cari No. Transaksi, Ruangan, LC..."'), 'Placeholder pencarian harus informatif');
assert(appSource.includes('transaction-search-clear-btn'), 'Tombol clear pencarian harus tersedia');
assert(appSource.includes('Tidak ada transaksi yang cocok dengan pencarian'), 'Empty state harus menampilkan pesan pencarian');

// 3. Verifikasi kolom No. Transaksi di modal rincian LC
assert(appSource.includes('No. Transaksi</th>'), 'Tabel modal rincian LC harus memiliki header No. Transaksi');
assert(appSource.includes('btn-jump-to-trx'), 'Tombol lompat ke transaksi sesi room harus ada');
assert(appSource.includes('btn-jump-to-bonus-trx'), 'Tombol lompat ke transaksi bonus F&B harus ada');

// 4. Verifikasi fungsi jumpToTransactionInHistory
assert(appSource.includes('async function jumpToTransactionInHistory(transactionId)'), 'Fungsi jumpToTransactionInHistory harus ada');
assert(appSource.includes('activeDashboardTab = "transactions"'), 'jumpToTransactionInHistory harus mengarahkan ke tab transaksi');
assert(appSource.includes('activeTransactionsSubTab = "history"'), 'jumpToTransactionInHistory harus membuka subtab history');

// 5. Verifikasi controller backend lcController menyediakan data closed_transaction_id & upfront_transaction_id
assert(lcControllerSource.includes('lwl.closed_transaction_id'), 'lcController query harus memilih closed_transaction_id');
assert(lcControllerSource.includes('lwl.upfront_transaction_id'), 'lcController query harus memilih upfront_transaction_id');
assert(lcControllerSource.includes('closed_transaction_id: row.closed_transaction_id || \'\''), 'lcController log mapping harus menyertakan closed_transaction_id');

console.log('✅ ALL LC Transaction Tracking & Search Bar Tests PASSED SUCCESSFULLY!');
