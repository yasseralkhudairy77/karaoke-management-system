const assert = require('assert');
const fs = require('fs');
const path = require('path');

function testModalAndActionsInAppJs() {
  const appJsPath = path.join(__dirname, '../../js/app.js');
  const appJsContent = fs.readFileSync(appJsPath, 'utf8');

  // 1. Fungsi komponen modal
  assert(
    appJsContent.includes('createTvDeviceModalElement'),
    'js/app.js wajib memiliki fungsi createTvDeviceModalElement'
  );
  assert(
    appJsContent.includes('createTvNotifyModalElement'),
    'js/app.js wajib memiliki fungsi createTvNotifyModalElement'
  );

  // 2. Penempelan modal ke createSettingsPanelElement
  assert(
    appJsContent.includes('panel.appendChild(tvDeviceModal)') || appJsContent.includes('panel.append') && appJsContent.includes('tvDeviceModal'),
    'js/app.js wajib menempelkan tvDeviceModal ke panel pengaturan'
  );
  assert(
    appJsContent.includes('panel.appendChild(tvNotifyModal)') || appJsContent.includes('panel.append') && appJsContent.includes('tvNotifyModal'),
    'js/app.js wajib menempelkan tvNotifyModal ke panel pengaturan'
  );

  // 3. Penanganan seluruh aksi tombol di handleRoomAction
  const requiredActions = [
    'add-tv-device',
    'edit-tv-device',
    'close-tv-device-modal',
    'test-modal-tv-device',
    'save-tv-device-settings',
    'notify-tv-device',
    'close-tv-notify-modal',
    'send-tv-notify',
    'check-tv-device',
    'wake-tv-device',
    'sleep-tv-device',
    'test-tv-device',
  ];

  for (const act of requiredActions) {
    assert(
      appJsContent.includes(`action === "${act}"`),
      `js/app.js wajib memiliki penanganan aksi action === "${act}" di handleRoomAction`
    );
  }

  // 4. Penggunaan dialog PIN otorisasi admin untuk aksi sensitif
  assert(
    appJsContent.includes('openAdminPinModal') && appJsContent.includes('check_tv_device'),
    'Aksi check-tv-device wajib menggunakan otorisasi PIN openAdminPinModal'
  );
  assert(
    appJsContent.includes('openAdminPinModal') && appJsContent.includes('wake_tv_device'),
    'Aksi wake-tv-device wajib menggunakan otorisasi PIN openAdminPinModal'
  );
  assert(
    appJsContent.includes('openAdminPinModal') && appJsContent.includes('sleep_tv_device'),
    'Aksi sleep-tv-device wajib menggunakan otorisasi PIN openAdminPinModal'
  );
  assert(
    appJsContent.includes('openAdminPinModal') && appJsContent.includes('test_tv_device'),
    'Aksi test-tv-device wajib menggunakan otorisasi PIN openAdminPinModal'
  );

  console.log('✓ Seluruh 12 aksi Kontrol TV dan penempelan modal terverifikasi di js/app.js.');
}

testModalAndActionsInAppJs();
