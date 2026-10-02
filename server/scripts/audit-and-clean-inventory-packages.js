const db = require('../src/db');

async function auditAndCleanInventory(options = { dryRun: true }) {
  console.log(`\n🔍 [INVENTORY AUDIT] Starting inventory vs package separation audit... (DryRun: ${options.dryRun})`);

  try {
    // 1. Fetch all items currently in inventory
    const invRes = await db.query(`
      SELECT stock_item_id, stock_item_name, category, unit, stock_qty, min_stock, status
      FROM inventory
      ORDER BY category ASC, stock_item_name ASC
    `);

    const allItems = invRes.rows;
    console.log(`📊 Total items in inventory table: ${allItems.length}`);

    // Patterns that indicate an item is a package/bundle, NOT a raw physical good:
    const packageKeywords = [
      /\bpackage\b/i,
      /\bpaket\b/i,
      /\btwin\b/i,
      /\btriple\b/i,
      /\bbundle\b/i,
      /\bcombo\b/i,
      /\bholic\b/i
    ];

    const suspectedPackages = [];
    const legitimatePhysicalItems = [];

    for (const item of allItems) {
      const name = item.stock_item_name || '';
      const category = item.category || '';
      const id = item.stock_item_id || '';

      const isPackageMatch = packageKeywords.some(pattern => pattern.test(name) || pattern.test(category)) ||
        id.startsWith('PKG-') ||
        (category.toLowerCase().includes('paket') || category.toLowerCase().includes('package'));

      if (isPackageMatch) {
        suspectedPackages.push(item);
      } else {
        legitimatePhysicalItems.push(item);
      }
    }

    console.log(`\n📦 Legitimate physical stock items: ${legitimatePhysicalItems.length}`);
    console.log(`⚠️  Suspected package/bundle items in inventory: ${suspectedPackages.length}`);

    if (suspectedPackages.length > 0) {
      console.log('\n--- DAFTAR ITEM PAKET YANG TERCAMPUR DI TABEL INVENTORY ---');
      suspectedPackages.forEach((pkg, index) => {
        console.log(`${index + 1}. [${pkg.stock_item_id}] ${pkg.stock_item_name} | Kategori: ${pkg.category} | Qty: ${pkg.stock_qty} | Status: ${pkg.status}`);
      });

      if (!options.dryRun) {
        console.log('\n🔄 Memproses pemisahan data dari tabel inventory...');
        for (const pkg of suspectedPackages) {
          // Check if package already exists in package_master
          const pkgCheck = await db.query(
            'SELECT package_id, package_name FROM package_master WHERE LOWER(package_name) = LOWER($1) OR package_id = $2',
            [pkg.stock_item_name, pkg.stock_item_id]
          );

          if (pkgCheck.rowCount === 0) {
            // Auto-register to package_master as fnb_only_bundle if not yet registered
            const newPkgId = pkg.stock_item_id.startsWith('PKG-') ? pkg.stock_item_id : `PKG-${Date.now()}-${Math.floor(Math.random()*1000)}`;
            console.log(`  ➕ Mendaftarkan ke package_master: [${newPkgId}] ${pkg.stock_item_name}`);
            await db.query(`
              INSERT INTO package_master (
                package_id, package_name, package_category, package_type,
                selling_price, duration_minutes, included_lc_count, included_lc_duration_minutes,
                valid_day_type, status
              ) VALUES ($1, $2, $3, 'fnb_only_bundle', 0, 0, 0, 0, 'all', 'active')
              ON CONFLICT (package_id) DO NOTHING
            `, [newPkgId, pkg.stock_item_name, pkg.category || 'F&B Package']);
          }

          // Inactivate or safely clean from inventory
          // We set status = 'inactive' so that any historical foreign key referencing this stock_item_id remains valid,
          // while it is completely excluded from active stock opname and inventory tables.
          await db.query(
            `UPDATE inventory SET status = 'inactive', updated_at = CURRENT_TIMESTAMP WHERE stock_item_id = $1`,
            [pkg.stock_item_id]
          );
          console.log(`  ✅ Dinonaktifkan dari tabel inventory aktif: [${pkg.stock_item_id}] ${pkg.stock_item_name}`);
        }
        console.log('\n✨ Pembersihan data selesai!');
      } else {
        console.log('\n💡 Catatan: Jalankan dengan argumen --execute untuk menerapkan pembersihan ke database.');
      }
    } else {
      console.log('\n✅ Tidak ditemukan item paket yang tercampur di tabel inventory. Master stok bersih!');
    }

    return {
      total: allItems.length,
      legitimateCount: legitimatePhysicalItems.length,
      packagesCount: suspectedPackages.length,
      packages: suspectedPackages
    };
  } catch (err) {
    console.error('❌ Error during inventory audit:', err.message);
    throw err;
  } finally {
    if (db.pool) {
      await db.pool.end().catch(() => {});
    }
  }
}

if (require.main === module) {
  const isExecute = process.argv.includes('--execute');
  auditAndCleanInventory({ dryRun: !isExecute })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('\n❌ Eksekusi terhenti:', err.message);
      process.exit(1);
    });
}

module.exports = auditAndCleanInventory;
