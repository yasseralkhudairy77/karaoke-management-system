const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const db = require('../src/db');
const masterDataController = require('../src/controllers/masterDataController');
const { DEFAULT_RECEIPT_CONFIG } = masterDataController;

test('Receipt Settings - DEFAULT_RECEIPT_CONFIG contains all required venue fields', () => {
  assert.ok(DEFAULT_RECEIPT_CONFIG, 'DEFAULT_RECEIPT_CONFIG must exist');
  assert.equal(typeof DEFAULT_RECEIPT_CONFIG.business_name, 'string');
  assert.equal(typeof DEFAULT_RECEIPT_CONFIG.tagline, 'string');
  assert.equal(typeof DEFAULT_RECEIPT_CONFIG.tax_id, 'string');
  assert.equal(typeof DEFAULT_RECEIPT_CONFIG.social_media, 'string');
  assert.equal(typeof DEFAULT_RECEIPT_CONFIG.wifi_ssid, 'string');
  assert.equal(typeof DEFAULT_RECEIPT_CONFIG.wifi_password, 'string');
  assert.equal(typeof DEFAULT_RECEIPT_CONFIG.footer_text, 'string');
  assert.equal(typeof DEFAULT_RECEIPT_CONFIG.footer_terms, 'string');
  assert.equal(typeof DEFAULT_RECEIPT_CONFIG.show_logo, 'boolean');
  assert.equal(typeof DEFAULT_RECEIPT_CONFIG.paper_width, 'number');
});

test('Receipt Settings - getReceiptSettings and saveReceiptSettings work with database', async () => {
  const originalQuery = db.query;
  const inMemoryStore = new Map();

  db.query = async (sql, params = []) => {
    const s = String(sql).toLowerCase();
    if (s.includes("from settings where key = 'receipt_settings'")) {
      const val = inMemoryStore.get('receipt_settings');
      return { rows: val ? [{ value: val }] : [] };
    }
    if (s.includes('insert into settings')) {
      inMemoryStore.set('receipt_settings', params[0]);
      return { rows: [{ key: 'receipt_settings' }] };
    }
    if (s.includes('insert into audit_logs') || s.includes('audit')) {
      return { rows: [] };
    }
    return { rows: [] };
  };

  try {
    const req = {};
    let saveResult = null;
    const saveRes = {
      json: (payload) => {
        saveResult = payload;
        return saveRes;
      },
      status: () => saveRes,
    };

    const payload = {
      settings: {
        business_name: 'Karaoke Bintang Gemilang',
        tagline: 'PREMIUM FAMILY & LOUNGE',
        logo_text: 'BINTANG GEMILANG',
        address: 'Jl. Sudirman Kav. 45, Lantai 3',
        phone: '0812-9988-7766',
        tax_id: '01.234.567.8-012.000',
        social_media: 'IG: @bintanggml / TT: @bintanggml',
        wifi_ssid: 'BINTANG_GUEST_5G',
        wifi_password: 'karaokeasyik2026',
        footer_text: 'Terima kasih atas kunjungan Anda.',
        footer_terms: 'Dilarang membawa senjata tajam atau miras dari luar.',
        show_logo: true,
        logo_base64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        paper_width: 48,
      },
      changed_by: 'Owner Tester',
    };

    await masterDataController.saveReceiptSettings(req, saveRes, payload);
    assert.ok(saveResult, 'Response must be returned');
    assert.equal(saveResult.ok, true);
    assert.equal(saveResult.settings.business_name, 'Karaoke Bintang Gemilang');
    assert.equal(saveResult.settings.tax_id, '01.234.567.8-012.000');
    assert.equal(saveResult.settings.wifi_ssid, 'BINTANG_GUEST_5G');
    assert.equal(saveResult.settings.wifi_password, 'karaokeasyik2026');
    assert.equal(saveResult.settings.social_media, 'IG: @bintanggml / TT: @bintanggml');
    assert.equal(saveResult.settings.paper_width, 48);

    // Verifikasi pembacaan kembali melalui getReceiptSettings
    let readBack = null;
    const readRes = {
      json: (p) => {
        readBack = p;
        return readRes;
      },
      status: () => readRes,
    };
    await masterDataController.getReceiptSettings(req, readRes);
    assert.ok(readBack, 'Response getReceiptSettings must be returned');
    assert.equal(readBack.ok, true);
    assert.equal(readBack.settings.business_name, 'Karaoke Bintang Gemilang');
    assert.equal(readBack.settings.tax_id, '01.234.567.8-012.000');
    assert.equal(readBack.settings.wifi_ssid, 'BINTANG_GUEST_5G');
    assert.equal(readBack.settings.wifi_password, 'karaokeasyik2026');
  } finally {
    db.query = originalQuery;
  }
});

test('Receipt Engine - Receipt formatting contains tax, social media, wifi, and terms', async () => {
  const receiptModulePath = path.resolve(__dirname, '../../js/receipt.js');
  const receipt = await import('file://' + receiptModulePath.replace(/\\/g, '/'));

  const testConfig = {
    business_name: 'Star Karaoke & Resto',
    tagline: 'Sing & Dine Everyday',
    logo_text: 'STAR KARAOKE',
    address: 'Jl. Ahmad Yani No. 88',
    phone: '0811-2233-4455',
    tax_id: '99.888.777.6-555.000',
    social_media: 'IG: @starkaraoke',
    wifi_ssid: 'STAR_FREE_WIFI',
    wifi_password: 'singalongstar',
    footer_text: 'Sampai jumpa di kunjungan berikutnya!',
    footer_terms: 'Barang tertinggal di luar tanggung jawab pengelola.',
    show_logo: true,
    paper_width: 32,
  };

  const dummyTx = {
    transaction_id: 'TRX-TEST-001',
    created_at: '2026-10-09T14:00:00.000Z',
    start_time: '2026-10-09T12:00:00.000Z',
    end_time: '2026-10-09T14:00:00.000Z',
    cashier_name: 'Kasir Uji',
    room_name: 'Medium 02',
    duration_minutes: 120,
    rate_per_hour: 100000,
    room_total: 200000,
    fnb_total: 50000,
    grand_total: 250000,
    payment_method: 'cash',
    payment_status: 'paid',
    cash_amount: 300000,
  };

  const receiptData = receipt.buildReceiptData(dummyTx, {
    business: testConfig,
    paper: { width: 32 },
  });

  const formattedReceipt = receipt.formatReceipt58mm(receiptData);

  assert.ok(formattedReceipt.includes('STAR KARAOKE'), 'Harus memuat logo text');
  assert.ok(formattedReceipt.includes('Sing & Dine Everyday'), 'Harus memuat tagline');
  assert.ok(formattedReceipt.includes('99.888.777.6-555.000'), 'Harus memuat nomor NPWP/NOPD');
  assert.ok(formattedReceipt.includes('IG: @starkaraoke'), 'Harus memuat akun media sosial');
  assert.ok(formattedReceipt.includes('STAR_FREE_WIFI'), 'Harus memuat nama SSID Wi-Fi');
  assert.ok(formattedReceipt.includes('singalongstar'), 'Harus memuat password Wi-Fi');
  assert.ok(formattedReceipt.includes('Sampai jumpa di kunjungan'), 'Harus memuat footer text');
  assert.ok(formattedReceipt.includes('Barang tertinggal di luar'), 'Harus memuat syarat/ketentuan');
});
