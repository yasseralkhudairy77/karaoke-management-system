const assert = require('assert');
const fs = require('fs');
const path = require('path');

function testApiRoutesConfigured() {
  const apiRoutePath = path.join(__dirname, '../src/routes/api.js');
  const routeContent = fs.readFileSync(apiRoutePath, 'utf8');

  const requiredGetActions = ['getTvRoomOverview'];
  const requiredPostActions = [
    'saveTvDeviceSettings',
    'checkTvDevice',
    'testTvDevice',
    'wakeTvDevice',
    'sleepTvDevice',
    'notifyTvDevice',
    'reloadTvBridgeConfig'
  ];

  for (const action of requiredGetActions) {
    assert(
      routeContent.includes(`'${action}'`) || routeContent.includes(`"${action}"`),
      `Aksi GET ${action} wajib terdaftar pada api.js`
    );
  }
  for (const action of requiredPostActions) {
    assert(
      routeContent.includes(`'${action}'`) || routeContent.includes(`"${action}"`),
      `Aksi POST ${action} wajib terdaftar pada api.js`
    );
  }

  const tvControllerPath = path.join(__dirname, '../src/controllers/tvController.js');
  const tvControllerContent = fs.readFileSync(tvControllerPath, 'utf8');
  for (const action of [...requiredGetActions, ...requiredPostActions]) {
    assert(
      tvControllerContent.includes(action),
      `Fungsi ${action} wajib diimplementasikan pada tvController.js`
    );
  }

  // Uji fungsi helper validasi IP dan normalisasi MAC
  const { normalizeMac, isValidIpv4 } = require('../src/controllers/tvController');
  assert(typeof normalizeMac === 'function', 'normalizeMac harus berupa fungsi');
  assert.strictEqual(normalizeMac('74:81:9A:FF:72:BE'), '74:81:9a:ff:72:be', 'Normalisasi MAC uppercase ke lowercase');
  assert.strictEqual(normalizeMac('74-81-9a-ff-72-be'), '74:81:9a:ff:72:be', 'Normalisasi MAC dash ke colon');
  assert.strictEqual(normalizeMac('74819aff72be'), '74:81:9a:ff:72:be', 'Normalisasi MAC tanpa pemisah');
  assert.strictEqual(normalizeMac('invalid-mac'), '', 'MAC tidak valid mengembalikan string kosong');

  assert(typeof isValidIpv4 === 'function', 'isValidIpv4 harus berupa fungsi');
  assert.strictEqual(isValidIpv4('192.168.1.104'), true, 'IPv4 valid');
  assert.strictEqual(isValidIpv4('192.168.1.300'), false, 'IPv4 oktet > 255 tidak valid');
  assert.strictEqual(isValidIpv4('192.168.1'), false, 'IPv4 3 oktet tidak valid');
  assert.strictEqual(isValidIpv4(''), false, 'IP kosong tidak valid');

  console.log('✓ Seluruh rute dan fungsi API Kontrol TV terverifikasi.');
}

testApiRoutesConfigured();
