const assert = require('assert');
const fs = require('fs');
const path = require('path');

function testBridgeServerConfigRoute() {
  const serverPath = path.join(__dirname, '../../middleware/tv-control-bridge/server.js');
  const serverContent = fs.readFileSync(serverPath, 'utf8');

  assert(
    serverContent.includes('/api/rooms/:roomId/config') || serverContent.includes('/api/rooms/:id/config'),
    'server.js bridge wajib memuat rute PUT untuk pembaruan konfigurasi ruangan'
  );
  assert(
    serverContent.includes('/api/config/reload'),
    'server.js bridge wajib memuat rute POST untuk memuat ulang konfigurasi'
  );

  const roomConfigPath = path.join(__dirname, '../../middleware/tv-control-bridge/src/roomConfig.js');
  const roomConfigContent = fs.readFileSync(roomConfigPath, 'utf8');
  assert(
    roomConfigContent.includes('updateRoomConfig'),
    'roomConfig.js bridge wajib mengekspor fungsi updateRoomConfig'
  );
  assert(
    roomConfigContent.includes('reloadRoomConfig'),
    'roomConfig.js bridge wajib mengekspor fungsi reloadRoomConfig'
  );

  console.log('✓ Endpoint dan handler konfigurasi bridge terverifikasi.');
}

testBridgeServerConfigRoute();
