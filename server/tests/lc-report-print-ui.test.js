const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..');
const appSource = fs.readFileSync(path.join(repoRoot, 'js/app.js'), 'utf8');
const styleSource = fs.readFileSync(path.join(repoRoot, 'css/style.css'), 'utf8');

assert(appSource.includes('function getLcWorkStatusDisplay(status)'));
assert(appSource.includes('normalized === "closed" || normalized === "done"'));
assert(appSource.includes('normalized === "paid"'));
assert(appSource.includes('textContent = "Download PDF"'));
assert(appSource.includes('function createLcReportPrintPreviewElement()'));
assert(appSource.includes('function printLcReport()'));
assert(appSource.includes('Dokumen ini dibuat dari database PostgreSQL lokal'));

assert(styleSource.includes('.lc-report-print'));
assert(styleSource.includes('@page lc-report-page'));
assert(styleSource.includes('page: lc-report-page'));
assert(styleSource.includes('.lc-report-print-actions'));

console.log('LC report print UI static test passed.');
