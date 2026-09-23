/**
 * Package Stock Component Resolver Utility
 * Memastikan setiap komponen fisik paket karaoke (termasuk Spirit pilihan seperti Hennessy VSOP & mixer Coke)
 * terhubung otomatis ke SKU barang fisik di tabel inventory (zero leakage),
 * bahkan jika komponen di master data masih berupa placeholder service (SVC-SPIRIT-CHOICE, SVC-COKE).
 */

async function resolvePackageComponentStockItem(client, comp, packageId = '', packageName = '') {
  if (!comp) return null;
  let stockItemId = comp.component_ref_id;

  // 1. Cek langsung via menu jika component_type === 'menu'
  if (comp.component_type === 'menu' && stockItemId) {
    const menuRes = await client.query('SELECT stock_item_id FROM menu WHERE menu_id = $1', [stockItemId]);
    if (menuRes.rowCount > 0 && menuRes.rows[0].stock_item_id) {
      stockItemId = menuRes.rows[0].stock_item_id;
    }
  }

  // 2. Cek apakah stockItemId langsung valid di tabel inventory
  if (stockItemId) {
    const directInv = await client.query('SELECT stock_item_id FROM inventory WHERE stock_item_id = $1', [stockItemId]);
    if (directInv.rowCount > 0) {
      return directInv.rows[0].stock_item_id;
    }
  }

  // 3. Smart Resolution Fallback untuk placeholder / service ref (SVC-SPIRIT-CHOICE, SVC-COKE, dsb.)
  const compRef = String(comp.component_ref_id || '').trim();
  const compName = String(comp.component_name || '').trim();
  const pkgName = String(packageName || packageId || '').trim();

  // Abaikan service non-fisik murni seperti sewa room atau talent LC
  if (/^(svc-talent|svc-room|talent|room\s*\d*h)/i.test(compRef) ||
      /^(talent|room\s*\d*\s*jam)/i.test(compName)) {
    return null;
  }

  // Prioritas 1: Coke / Coca-Cola (cek nama komponen dan ref komponen)
  if (/coke|coca[-\s]?cola/i.test(compName) || /coke|coca/i.test(compRef)) {
    const cokeInv = await client.query(`
      SELECT stock_item_id FROM inventory 
      WHERE (stock_item_id = 'MENU-096' OR stock_item_name ILIKE '%coca-cola%' OR stock_item_name ILIKE '%coke%')
        AND (status = 'active' OR status IS NULL OR status = '')
      ORDER BY CASE WHEN stock_item_id = 'MENU-096' THEN 1 ELSE 2 END, stock_item_name ASC
      LIMIT 1
    `);
    if (cokeInv.rowCount > 0) {
      return cokeInv.rows[0].stock_item_id;
    }
  }

  // Prioritas 2: Spirit / Minuman Keras (Hennessy, Martell, Captain Morgan, Singleton)
  const isSpiritComp = /spirit|liquor|choice|botol|bottle/i.test(compName) || /spirit|choice/i.test(compRef);

  // Kasus Hennessy / Hennesy VSOP -> Prioritaskan SKU MENU-023
  if (/hennes+y/i.test(compName) || (isSpiritComp && /hennes+y/i.test(pkgName))) {
    const hennessyInv = await client.query(`
      SELECT stock_item_id FROM inventory 
      WHERE (stock_item_id = 'MENU-023' OR stock_item_name ILIKE '%hennes%')
        AND (status = 'active' OR status IS NULL OR status = '')
      ORDER BY CASE WHEN stock_item_id = 'MENU-023' THEN 1 ELSE 2 END, stock_item_name ASC
      LIMIT 1
    `);
    if (hennessyInv.rowCount > 0) {
      return hennessyInv.rows[0].stock_item_id;
    }
  }

  // Kasus Martell VSOP -> Prioritaskan SKU MENU-024
  if (/martell/i.test(compName) || (isSpiritComp && /martell/i.test(pkgName))) {
    const martellInv = await client.query(`
      SELECT stock_item_id FROM inventory 
      WHERE (stock_item_id = 'MENU-024' OR stock_item_name ILIKE '%martell%')
        AND (status = 'active' OR status IS NULL OR status = '')
      ORDER BY CASE WHEN stock_item_id = 'MENU-024' THEN 1 ELSE 2 END, stock_item_name ASC
      LIMIT 1
    `);
    if (martellInv.rowCount > 0) {
      return martellInv.rows[0].stock_item_id;
    }
  }

  // Kasus Captain Morgan
  if (/captain(\s*morgan)?/i.test(compName) || (isSpiritComp && /captain/i.test(pkgName))) {
    const capInv = await client.query(`
      SELECT stock_item_id FROM inventory 
      WHERE stock_item_name ILIKE '%captain%'
        AND (status = 'active' OR status IS NULL OR status = '')
      LIMIT 1
    `);
    if (capInv.rowCount > 0) {
      return capInv.rows[0].stock_item_id;
    }
  }

  // Kasus Singleton
  if (/singleton/i.test(compName) || (isSpiritComp && /singleton/i.test(pkgName))) {
    const sngInv = await client.query(`
      SELECT stock_item_id FROM inventory 
      WHERE stock_item_name ILIKE '%singleton%'
        AND (status = 'active' OR status IS NULL OR status = '')
      LIMIT 1
    `);
    if (sngInv.rowCount > 0) {
      return sngInv.rows[0].stock_item_id;
    }
  }

  // Prioritas 3: Pencocokan umum berdasarkan nama komponen jika ada di inventory
  if (compName && !/service|talent|room/i.test(compName)) {
    const generalInv = await client.query(`
      SELECT stock_item_id FROM inventory 
      WHERE stock_item_name ILIKE $1
        AND (status = 'active' OR status IS NULL OR status = '')
      LIMIT 1
    `, [`%${compName}%`]);
    if (generalInv.rowCount > 0) {
      return generalInv.rows[0].stock_item_id;
    }
  }

  return null;
}

function resolvePackageComponentStockItemSync(comp, packageId = '', packageName = '', consumptionMap = null) {
  if (!comp) return null;
  let refId = comp.component_ref_id || '';

  if (consumptionMap && consumptionMap.has(refId)) {
    return refId;
  }

  const compRef = String(refId).trim();
  const compName = String(comp.component_name || '').trim();
  const pkgName = String(packageName || packageId || '').trim();

  if (/^(svc-talent|svc-room|talent|room\s*\d*h)/i.test(compRef) ||
      /^(talent|room\s*\d*\s*jam)/i.test(compName)) {
    return null;
  }

  // Cek Coke lebih dulu
  if (/coke|coca[-\s]?cola/i.test(compName) || /coke|coca/i.test(compRef)) {
    return 'MENU-096';
  }

  const isSpiritComp = /spirit|liquor|choice|botol|bottle/i.test(compName) || /spirit|choice/i.test(compRef);

  if (/hennes+y/i.test(compName) || (isSpiritComp && /hennes+y/i.test(pkgName))) {
    return 'MENU-023';
  }

  if (/martell/i.test(compName) || (isSpiritComp && /martell/i.test(pkgName))) {
    return 'MENU-024';
  }

  return refId || null;
}

module.exports = {
  resolvePackageComponentStockItem,
  resolvePackageComponentStockItemSync,
};
