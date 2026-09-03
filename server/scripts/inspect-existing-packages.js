const db = require('../src/db');

async function inspectExistingPackages() {
  console.log('\n🔍 [AUDIT PAKET & LINK STOK] Memeriksa daftar paket dan hubungan komponen fisiknya...\n');

  try {
    const pkgRes = await db.query(`
      SELECT package_id, package_name, package_category, package_type, selling_price, duration_minutes, status
      FROM package_master
      ORDER BY status ASC, package_category ASC, package_name ASC
    `);

    const packages = pkgRes.rows;
    console.log(`📊 Ditemukan ${packages.length} paket di dalam database:\n`);

    const detailsRes = await db.query(`
      SELECT pd.package_id, pd.component_ref_id, pd.component_name, pd.qty, pd.unit, pd.component_type,
             i.stock_item_id AS inv_id, i.stock_item_name AS inv_name, i.stock_qty, i.status AS inv_status,
             m.menu_name, m.stock_item_id AS menu_stock_item_id
      FROM package_details pd
      LEFT JOIN inventory i ON i.stock_item_id = pd.component_ref_id
      LEFT JOIN menu m ON m.menu_id = pd.component_ref_id
      ORDER BY pd.package_id ASC, pd.line_no ASC
    `);

    const detailsByPkg = detailsRes.rows.reduce((map, row) => {
      if (!map[row.package_id]) map[row.package_id] = [];
      map[row.package_id].push(row);
      return map;
    }, {});

    let fullyLinkedCount = 0;
    let partialOrEmptyCount = 0;

    for (let i = 0; i < packages.length; i++) {
      const pkg = packages[i];
      const components = detailsByPkg[pkg.package_id] || [];
      const priceFmt = Number(pkg.selling_price || 0).toLocaleString('id-ID');

      console.log(`======================================================================`);
      console.log(`${i + 1}. [${pkg.package_id}] ${pkg.package_name}`);
      console.log(`   Kategori: ${pkg.package_category || '-'} | Tipe: ${pkg.package_type || '-'} | Harga: Rp ${priceFmt} | Status: ${pkg.status}`);

      if (components.length === 0) {
        console.log(`   ⚠️  BELUM MEMILIKI KOMPONEN (Paket kosong/belum di-link ke bahan baku).`);
        partialOrEmptyCount++;
      } else {
        console.log(`   📦 Daftar Komponen Resep (${components.length} item):`);
        let allOk = true;

        for (const comp of components) {
          const isDirectInv = Boolean(comp.inv_id);
          const isViaMenu = Boolean(comp.menu_stock_item_id);
          const isServiceOrRoom = String(comp.component_type).toLowerCase() === 'service' || String(comp.component_name).toLowerCase().includes('room');

          if (isServiceOrRoom) {
            console.log(`      • [SERVICE] ${comp.component_name} (${comp.qty} ${comp.unit || 'jam'}) - Durasi Ruangan`);
          } else if (isDirectInv) {
            console.log(`      • [LINK STOK LANGSUNG OK] ${comp.inv_name} (${comp.qty} ${comp.unit}) -> Stok Gudang: ${comp.stock_qty || 0}`);
          } else if (isViaMenu) {
            console.log(`      • [LINK VIA MENU OK] ${comp.menu_name} -> ID Stok: ${comp.menu_stock_item_id} (${comp.qty} ${comp.unit})`);
          } else {
            console.log(`      • ❌ [PERLU DIHUBUNGKAN] ${comp.component_name} (Ref: ${comp.component_ref_id || '-'}) -> Belum terhubung ke item fisik di Stok`);
            allOk = false;
          }
        }

        if (allOk) fullyLinkedCount++;
        else partialOrEmptyCount++;
      }
      console.log('');
    }

    console.log(`======================================================================`);
    console.log(`REKAP AUDIT LINK PAKET:`);
    console.log(`✅ Paket sudah terhubung sempurna ke stok fisik: ${fullyLinkedCount} paket`);
    console.log(`⚠️  Paket yang perlu diatur/dihubungkan ulang: ${partialOrEmptyCount} paket`);
    console.log(`======================================================================\n`);

  } catch (err) {
    console.error('❌ Error during package inspection:', err.message);
  } finally {
    if (db.pool) {
      await db.pool.end().catch(() => {});
    }
  }
}

if (require.main === module) {
  inspectExistingPackages();
}

module.exports = inspectExistingPackages;
