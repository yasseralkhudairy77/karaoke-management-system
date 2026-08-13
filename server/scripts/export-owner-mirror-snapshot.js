const fs = require('fs');
const path = require('path');
const { buildOwnerMirrorSnapshot } = require('../src/services/ownerMirrorService');

async function main() {
  const outputArg = process.argv[2] || path.join(__dirname, '..', 'mirror', 'owner-snapshot.json');
  const outputPath = path.resolve(outputArg);
  const period = process.argv[3] || 'today';

  const snapshot = await buildOwnerMirrorSnapshot({ period });

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');

  console.log('Owner mirror snapshot exported successfully.');
  console.log(`Output : ${outputPath}`);
  console.log(`Period : ${snapshot.period}`);
  console.log(`Tanggal: ${snapshot.operational_date_start} s/d ${snapshot.operational_date_end}`);
  console.log(`Transaksi: ${snapshot.summary.total_transactions}`);
  console.log(`Omzet lunas: Rp ${snapshot.summary.paid_revenue.toLocaleString('id-ID')}`);
}

main().catch(err => {
  console.error(`Failed to export owner mirror snapshot: ${err.message}`);
  process.exit(1);
});
