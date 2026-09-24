const assert = require('assert');
const fs = require('fs');
const path = require('path');

function testSchemaSqlContainsNewColumns() {
  const schemaPath = path.join(__dirname, '../src/db/schema.sql');
  const schemaContent = fs.readFileSync(schemaPath, 'utf8');

  const requiredColumns = [
    'tv_ip',
    'tv_mac',
    'adb_port',
    'adb_timeout_ms',
    'wol_broadcast',
    'notify_package',
    'notes',
    'last_checked_at',
    'last_check_result',
    'last_check_message'
  ];

  for (const col of requiredColumns) {
    assert(
      schemaContent.includes(col),
      `Kolom ${col} harus didefinisikan pada server/src/db/schema.sql`
    );
  }
  console.log('✓ Definisi kolom tv_devices di schema.sql terverifikasi.');
}

testSchemaSqlContainsNewColumns();
