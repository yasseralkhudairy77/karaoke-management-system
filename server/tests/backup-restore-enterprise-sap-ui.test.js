const assert = require('assert');
const fs = require('fs');
const path = require('path');

function testBackupRestoreEnterpriseSapUi() {
  const repoRoot = path.resolve(__dirname, '..', '..');
  const appJsPath = path.join(repoRoot, 'js/app.js');
  const styleCssPath = path.join(repoRoot, 'css/style.css');

  const appJsContent = fs.readFileSync(appJsPath, 'utf8');
  const styleCssContent = fs.readFileSync(styleCssPath, 'utf8');

  console.log('🧪 Running Backup & Restore SAP Enterprise UI Tests...\n');

  // 1. Ekstrak kode blok createDatabaseBackupSection & createRestoreDatabaseModalElement
  const sectionCodeMatch = appJsContent.match(
    /function createDatabaseBackupSection\(\)\s*\{([\s\S]*?)\nfunction createRestoreDatabaseModalElement\(\)/
  );
  assert(sectionCodeMatch, 'createDatabaseBackupSection harus ditemukan di js/app.js');
  const sectionCode = sectionCodeMatch[1];

  const modalCodeMatch = appJsContent.match(
    /function createRestoreDatabaseModalElement\(\)\s*\{([\s\S]*?)\nfunction getAuditBadgeTone\(/
  );
  assert(modalCodeMatch, 'createRestoreDatabaseModalElement harus ditemukan di js/app.js');
  const modalCode = modalCodeMatch[1];

  const combinedCode = sectionCode + '\n' + modalCode;

  // 2. Pastikan tidak ada emoji kekanak-kanakan / AI slop
  const forbiddenEmojis = ['🔄', '🗄️', '📥', '✔️', '⏳', '⚠️', '📄', '📂', '📤', '❌'];
  forbiddenEmojis.forEach((emoji) => {
    assert(
      !combinedCode.includes(emoji),
      `Emoji ${emoji} tidak boleh ada di tampilan Backup & Restore (harus memakai SVG profesional)`
    );
  });
  console.log('  ✓ Bebas dari seluruh emoji AI-look/kekanak-kanakan');

  // 3. Pastikan elemen SVG enterprise hadir di komponen
  assert(
    combinedCode.includes('<svg') && combinedCode.includes('viewBox="0 0 24 24"'),
    'Komponen Backup & Restore wajib menggunakan ikon SVG enterprise'
  );
  console.log('  ✓ Menggunakan ikon SVG enterprise presisi');

  // 4. Pastikan ribbon status arsitektur SAP dan tabel spesifikasi hadir
  assert(sectionCode.includes('db-system-ribbon'), 'Wajib memuat System Environment Ribbon bergaya SAP');
  assert(sectionCode.includes('db-spec-table'), 'Wajib memuat tabel spesifikasi teknis snapshot');
  console.log('  ✓ System Environment Ribbon & Technical Data Specification Table hadir');

  // 5. Pastikan CSS mendefinisikan kelas-kelas pendukung SAP Fiori Cockpit
  assert(styleCssContent.includes('.db-system-ribbon'), 'CSS wajib mendefinisikan .db-system-ribbon');
  assert(styleCssContent.includes('.db-spec-table'), 'CSS wajib mendefinisikan .db-spec-table');
  assert(styleCssContent.includes('.db-spin-icon'), 'CSS wajib mendefinisikan animasi .db-spin-icon');
  assert(styleCssContent.includes('.restore-dropzone-box'), 'CSS wajib mendefinisikan .restore-dropzone-box');
  console.log('  ✓ Aturan CSS SAP Fiori Cockpit terverifikasi');

  console.log('\n✅ Semua pengujian UI SAP Enterprise Backup & Restore PASSED!');
}

testBackupRestoreEnterpriseSapUi();
