const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('Running Backup & Restore UI Integration Tests...\n');

const appJsPath = path.join(__dirname, '../../js/app.js');
const appJsContent = fs.readFileSync(appJsPath, 'utf8');

const cssPath = path.join(__dirname, '../../css/style.css');
const cssContent = fs.readFileSync(cssPath, 'utf8');

// Test 1: Subtab exists in app.js
console.log('Test 1: Verifying Backup & Restore subtab declaration...');
assert.ok(appJsContent.includes('["backup", "Backup & Restore"]'), 'Subtab array must include ["backup", "Backup & Restore"]');
assert.ok(appJsContent.includes('activeSettingsSubTab === "backup"'), 'getActiveSettingsSectionElement must route to backup subtab');
console.log('  ✓ PASS: Settings navigation includes Backup & Restore subtab');

// Test 2: UI functions existence
console.log('Test 2: Verifying backup UI rendering functions...');
assert.ok(appJsContent.includes('function createDatabaseBackupSection()'), 'createDatabaseBackupSection function must exist');
assert.ok(appJsContent.includes('function createRestoreDatabaseModalElement()'), 'createRestoreDatabaseModalElement function must exist');
assert.ok(appJsContent.includes('function downloadDatabaseBackup()'), 'downloadDatabaseBackup function must exist');
assert.ok(appJsContent.includes('function confirmRestoreDatabase()'), 'confirmRestoreDatabase function must exist');
console.log('  ✓ PASS: Core backup & restore UI generator functions exist in app.js');

// Test 3: Action triggers
console.log('Test 3: Verifying action handler integrations in handleRoomAction...');
assert.ok(appJsContent.includes('action === "download-db-backup"'), 'handleRoomAction must handle download-db-backup');
assert.ok(appJsContent.includes('action === "trigger-db-restore"'), 'handleRoomAction must handle trigger-db-restore');
assert.ok(appJsContent.includes('action === "confirm-restore-database"'), 'handleRoomAction must handle confirm-restore-database');
assert.ok(appJsContent.includes('action === "refresh-database-backup-status"'), 'handleRoomAction must handle refresh-database-backup-status');
console.log('  ✓ PASS: All interactive backup actions registered in handleRoomAction');

// Test 4: Modal & overlay inclusion
console.log('Test 4: Verifying modal overlay integration in global dashboard render...');
assert.ok(appJsContent.includes('if (restoreDatabaseModalState) {'), 'Global overlay must include restoreDatabaseModalState check');
assert.ok(appJsContent.includes('fragment.appendChild(createRestoreDatabaseModalElement());'), 'Must append restore modal element');
console.log('  ✓ PASS: Restore confirmation modal hooked into global dashboard overlays');

// Test 5: CSS classes existence
console.log('Test 5: Verifying CSS classes styling in style.css...');
assert.ok(cssContent.includes('.database-backup-section'), 'CSS must define .database-backup-section');
assert.ok(cssContent.includes('.database-backup-grid'), 'CSS must define .database-backup-grid');
assert.ok(cssContent.includes('.database-backup-card'), 'CSS must define .database-backup-card');
assert.ok(cssContent.includes('.btn-backup'), 'CSS must define .btn-backup');
assert.ok(cssContent.includes('.btn-restore'), 'CSS must define .btn-restore');
assert.ok(cssContent.includes('.restore-modal-warning-banner'), 'CSS must define .restore-modal-warning-banner');
console.log('  ✓ PASS: All Backup & Restore UI classes present in style.css');

console.log('\nAll Backup & Restore UI Tests Passed Successfully! 🎉\n');
