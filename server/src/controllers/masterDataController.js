const db = require('../db');
const { successResponse, errorResponse } = require('../utils/response');
const { verifyAndUpgradePin } = require('../middleware/auth');

async function logMasterAudit(entityType, entityId, entityName, actionType, oldValue, newValue, changedBy, note = '', result = 'success', executor = db) {
  await executor.query(`
    INSERT INTO master_data_audit_logs (
      log_id, entity_type, entity_id, entity_name, action_type, old_value_json, new_value_json, changed_by, note, result
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
  `, [`MDA-${Date.now()}-${Math.floor(Math.random() * 1000)}`, entityType, entityId, entityName, actionType, oldValue || null, newValue || null, changedBy || 'Operator', note, result]);
}

let fnbBundleSchemaChecked = false;
async function ensureFnbBundleSchema(executor = db) {
  if (fnbBundleSchemaChecked) return;
  await executor.query(`
    ALTER TABLE menu ADD COLUMN IF NOT EXISTS menu_type VARCHAR(30) NOT NULL DEFAULT 'regular';
    ALTER TABLE recipe ADD COLUMN IF NOT EXISTS component_mode VARCHAR(20) NOT NULL DEFAULT 'included';
    ALTER TABLE recipe ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 1;
  `);
  fnbBundleSchemaChecked = true;
}

let packageLcSchemaChecked = false;
async function ensurePackageLcSchema(executor = db) {
  if (packageLcSchemaChecked) return;
  await executor.query(`
    ALTER TABLE package_master ADD COLUMN IF NOT EXISTS included_lc_count INT NOT NULL DEFAULT 0;
    ALTER TABLE package_master ADD COLUMN IF NOT EXISTS included_lc_duration_minutes INT NOT NULL DEFAULT 0;
  `);
  packageLcSchemaChecked = true;
}

function normalizeFnbBundleComponents(rawComponents) {
  if (!Array.isArray(rawComponents)) return [];
  return rawComponents.map((component, index) => ({
    item_id: String(component.item_id || component.stock_item_id || '').trim(),
    qty_used: Number(component.qty_used ?? component.quantity ?? component.qty),
    component_mode: String(component.component_mode || component.mode || 'included').trim().toLowerCase(),
    sort_order: index + 1
  }));
}

async function getEmployees(req, res) {
  try {
    const result = await db.query('SELECT employee_id, employee_name, role, salary_type, base_salary, is_active FROM employees ORDER BY employee_name ASC');
    return res.json({ ok: true, success: true, employees: result.rows });
  } catch (err) {
    return errorResponse(res, err.message);
  }
}

async function getServiceItems(req, res) {
  try {
    const result = await db.query(`
      SELECT DISTINCT component_ref_id, component_name, unit, additional_price, cost_amount
      FROM package_details
      WHERE component_type = 'service'
      ORDER BY component_name ASC
    `);
    return res.json({ ok: true, success: true, items: result.rows, service_items: result.rows });
  } catch (err) {
    return errorResponse(res, err.message);
  }
}

async function getCosting(req, res) {
  try {
    const menuRes = await db.query(`
      SELECT menu_id, menu_name, category, price, hpp, variable_cost_rate, bonus_sales_lc
      FROM menu
      ORDER BY category ASC, menu_name ASC
    `);
    const packageRes = await db.query(`
      SELECT package_id, package_name, selling_price
      FROM package_master
      ORDER BY package_name ASC
    `);

    return res.json({
      ok: true,
      success: true,
      menu_costing: menuRes.rows.map(row => ({
        ...row,
        price: Number(row.price || 0),
        hpp: Number(row.hpp || 0),
        variable_cost_rate: Number(row.variable_cost_rate || 0),
        bonus_sales_lc: Number(row.bonus_sales_lc || 0)
      })),
      package_costing: packageRes.rows.map(row => ({
        ...row,
        selling_price: Number(row.selling_price || 0)
      }))
    });
  } catch (err) {
    return errorResponse(res, err.message);
  }
}

async function getMasterDataAuditLogs(req, res) {
  try {
    const result = await db.query('SELECT * FROM master_data_audit_logs ORDER BY created_at DESC LIMIT 300');
    return res.json({ ok: true, success: true, logs: result.rows, audit_logs: result.rows });
  } catch (err) {
    return errorResponse(res, err.message);
  }
}

async function saveRoomMaster(req, res, payload) {
  try {
    const roomId = payload.room_id || `ROOM-${Date.now()}`;
    await db.query(`
      INSERT INTO rooms (room_id, room_name, status, rate_per_hour, tv_device_id)
      VALUES ($1, $2, COALESCE($3, 'available'), $4, $5)
      ON CONFLICT (room_id) DO UPDATE SET room_name = EXCLUDED.room_name, rate_per_hour = EXCLUDED.rate_per_hour, tv_device_id = EXCLUDED.tv_device_id, updated_at = CURRENT_TIMESTAMP
    `, [roomId, payload.room_name || roomId, payload.status || 'available', Number(payload.rate_per_hour || 0), payload.tv_device_id || null]);
    await logMasterAudit('room', roomId, payload.room_name || roomId, 'save', null, payload, payload.changed_by || payload.cashier_name);
    return successResponse(res, { message: 'Master room berhasil disimpan.', room_id: roomId });
  } catch (err) {
    return errorResponse(res, err.message);
  }
}

async function saveMenuMaster(req, res, payload) {
  let client;
  try {
    client = await db.pool.connect();
    await ensureFnbBundleSchema(client);
    await client.query('BEGIN');

    const menuId = String(payload.menu_id || '').trim() || `MENU-${Date.now()}`;
    const menuType = String(payload.menu_type || 'regular').trim().toLowerCase();
    const bundleComponents = normalizeFnbBundleComponents(payload.bundle_components);
    const requestedStockItemId = String(payload.stock_item_id || '').trim() || null;
    const stockItemId = menuType === 'fnb_bundle' ? null : requestedStockItemId;
    const stockTracking = menuType === 'fnb_bundle'
      ? 'no'
      : (payload.stock_tracking || (stockItemId ? 'yes' : 'no'));
    const stockQtyPerUnit = Number(payload.stock_qty_per_unit || payload.qty_per_unit || 1);

    if (!['regular', 'fnb_bundle'].includes(menuType)) throw new Error('Jenis menu tidak valid.');
    if (!String(payload.menu_name || '').trim()) throw new Error('Nama menu wajib diisi.');
    if (!Number.isFinite(Number(payload.price)) || Number(payload.price) < 0) throw new Error('Harga menu tidak valid.');
    if (!['active', 'inactive'].includes(String(payload.status || 'active').toLowerCase())) throw new Error('Status menu tidak valid.');

    if (menuType === 'fnb_bundle') {
      if (bundleComponents.length === 0) throw new Error('Paket F&B wajib memiliki minimal satu komponen.');
      const componentIds = bundleComponents.map(component => component.item_id);
      if (componentIds.some(itemId => !itemId)) throw new Error('Semua komponen paket wajib memilih item inventory.');
      if (new Set(componentIds).size !== componentIds.length) throw new Error('Item inventory yang sama tidak boleh ditambahkan dua kali dalam satu paket.');
      if (bundleComponents.some(component => !Number.isFinite(component.qty_used) || component.qty_used <= 0)) throw new Error('Jumlah setiap komponen paket harus lebih dari 0.');
      if (bundleComponents.some(component => !['included', 'bonus'].includes(component.component_mode))) throw new Error('Mode komponen paket tidak valid.');

      const inventoryResult = await client.query(`
        SELECT stock_item_id, stock_item_name, unit, status
        FROM inventory
        WHERE stock_item_id = ANY($1)
      `, [componentIds]);
      const inventoryById = new Map(inventoryResult.rows.map(item => [item.stock_item_id, item]));
      for (const component of bundleComponents) {
        const inventoryItem = inventoryById.get(component.item_id);
        if (!inventoryItem) throw new Error(`Item inventory ${component.item_id} tidak ditemukan.`);
        if (String(inventoryItem.status || '').toLowerCase() !== 'active') throw new Error(`Item inventory ${inventoryItem.stock_item_name} tidak aktif.`);
        component.item_name = inventoryItem.stock_item_name;
        component.unit = inventoryItem.unit || 'unit';
      }
    }

    const oldRes = await client.query('SELECT * FROM menu WHERE menu_id = $1 FOR UPDATE', [menuId]);
    const oldValue = oldRes.rows[0] || null;

    await client.query(`
      INSERT INTO menu (menu_id, menu_name, category, price, status, stock_tracking, stock_item_id, stock_qty_per_unit, bonus_sales_lc, hpp, variable_cost_rate, menu_type)
      VALUES ($1, $2, $3, $4, COALESCE($5, 'active'), $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT (menu_id) DO UPDATE SET menu_name = EXCLUDED.menu_name, category = EXCLUDED.category, price = EXCLUDED.price, status = EXCLUDED.status, stock_tracking = EXCLUDED.stock_tracking, stock_item_id = EXCLUDED.stock_item_id, stock_qty_per_unit = EXCLUDED.stock_qty_per_unit, bonus_sales_lc = EXCLUDED.bonus_sales_lc, hpp = EXCLUDED.hpp, variable_cost_rate = EXCLUDED.variable_cost_rate, menu_type = EXCLUDED.menu_type, updated_at = CURRENT_TIMESTAMP
    `, [menuId, String(payload.menu_name).trim(), payload.category || 'F&B', Number(payload.price), payload.status || 'active', stockTracking, stockItemId, stockQtyPerUnit, Number(payload.bonus_sales_lc || 0), Number(payload.hpp || 0), Number(payload.variable_cost_rate || 0), menuType]);

    if (menuType === 'fnb_bundle') {
      await client.query('DELETE FROM recipe WHERE menu_id = $1', [menuId]);
      for (const component of bundleComponents) {
        await client.query(`
          INSERT INTO recipe (recipe_id, menu_id, item_id, qty_used, unit, component_mode, sort_order)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [`RCP-${Date.now()}-${component.sort_order}-${Math.floor(Math.random() * 10000)}`, menuId, component.item_id, component.qty_used, component.unit, component.component_mode, component.sort_order]);
      }
    } else if (String(oldValue?.menu_type || 'regular').toLowerCase() === 'fnb_bundle') {
      await client.query('DELETE FROM recipe WHERE menu_id = $1', [menuId]);
    }

    const auditPayload = { ...payload, menu_type: menuType, bundle_components: bundleComponents };
    await logMasterAudit('menu', menuId, String(payload.menu_name).trim(), oldValue ? 'update' : 'save', oldValue, auditPayload, payload.changed_by || payload.cashier_name, '', 'success', client);
    await client.query('COMMIT');
    return successResponse(res, { message: menuType === 'fnb_bundle' ? 'Paket F&B berhasil disimpan.' : 'Master menu berhasil disimpan.', menu_id: menuId, menu_type: menuType });
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    return errorResponse(res, err.message);
  } finally {
    if (client) client.release();
  }
}

async function saveInventoryMaster(req, res, payload) {
  try {
    const stockItemName = payload.stock_item_name || payload.item_name || '';
    const category = payload.category || 'General';
    let stockItemId = payload.stock_item_id || payload.item_id || '';
    let existingStockQty = null;

    if (!stockItemId && stockItemName) {
      const existingRes = await db.query(`
        SELECT stock_item_id, stock_qty
        FROM inventory
        WHERE LOWER(stock_item_name) = LOWER($1)
          AND LOWER(category) = LOWER($2)
        ORDER BY updated_at DESC
        LIMIT 1
      `, [stockItemName, category]);
      stockItemId = existingRes.rows[0]?.stock_item_id || '';
      existingStockQty = existingRes.rows[0]?.stock_qty ?? null;
    }

    if (!stockItemId) {
      stockItemId = `STOCK-${Date.now()}`;
    }

    const stockQty = Object.prototype.hasOwnProperty.call(payload, 'stock_qty')
      ? Number(payload.stock_qty || 0)
      : Number(existingStockQty || 0);

    await db.query(`
      INSERT INTO inventory (stock_item_id, stock_item_name, category, unit, stock_qty, min_stock, status)
      VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, 'active'))
      ON CONFLICT (stock_item_id) DO UPDATE SET stock_item_name = EXCLUDED.stock_item_name, category = EXCLUDED.category, unit = EXCLUDED.unit, stock_qty = EXCLUDED.stock_qty, min_stock = EXCLUDED.min_stock, status = EXCLUDED.status, updated_at = CURRENT_TIMESTAMP
    `, [stockItemId, stockItemName || stockItemId, category, payload.unit || 'pcs', stockQty, Number(payload.min_stock || 0), payload.status || 'active']);
    await logMasterAudit('inventory', stockItemId, payload.stock_item_name || stockItemId, 'save', null, payload, payload.changed_by || payload.cashier_name);
    return successResponse(res, { message: 'Master stok berhasil disimpan.', stock_item_id: stockItemId });
  } catch (err) {
    return errorResponse(res, err.message);
  }
}

async function saveLcMaster(req, res, payload) {
  try {
    const lcId = payload.lc_id || `LC-${Date.now()}`;
    await db.query(`
      INSERT INTO lc_master (lc_id, lc_name, rate_per_hour, status, phone, joined_date)
      VALUES ($1, $2, $3, COALESCE($4, 'active'), $5, $6)
      ON CONFLICT (lc_id) DO UPDATE SET lc_name = EXCLUDED.lc_name, rate_per_hour = EXCLUDED.rate_per_hour, status = EXCLUDED.status, phone = EXCLUDED.phone, joined_date = EXCLUDED.joined_date, updated_at = CURRENT_TIMESTAMP
    `, [lcId, payload.lc_name || lcId, Number(payload.rate_per_hour || payload.rate_per_room || 0), payload.status || 'active', payload.phone || null, payload.joined_date || null]);
    await logMasterAudit('lc', lcId, payload.lc_name || lcId, 'save', null, payload, payload.changed_by || payload.cashier_name);
    return successResponse(res, { message: 'Master LC berhasil disimpan.', lc_id: lcId });
  } catch (err) {
    return errorResponse(res, err.message);
  }
}

async function savePackageMaster(req, res, payload) {
  try {
    await ensurePackageLcSchema();
    const packageId = String(payload.package_id || '').trim() || `PKG-${Date.now()}`;
    const packageName = String(payload.package_name || packageId).trim();
    const sellingPrice = Number(payload.selling_price || 0);
    const durationMinutes = Number(payload.duration_minutes || 60);
    const includedLcCount = Math.max(0, Math.floor(Number(payload.included_lc_count || payload.lc_included_count || 0)));
    const includedLcDurationMinutes = Math.max(0, Math.floor(Number(payload.included_lc_duration_minutes || payload.lc_included_duration_minutes || 0)));
    const validDayType = String(payload.valid_day_type || 'all').trim().toLowerCase();
    const status = String(payload.status || 'active').trim().toLowerCase();
    const packageType = String(payload.package_type || 'room_fnb_bundle').trim().toLowerCase();

    if (!packageName) throw new Error('Nama paket wajib diisi.');
    if (!Number.isFinite(sellingPrice) || sellingPrice < 0) throw new Error('Harga paket tidak valid.');
    if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) throw new Error('Durasi paket harus lebih dari 0 menit.');
    if (!['all', 'weekday', 'weekend'].includes(validDayType)) throw new Error('Berlaku hari tidak valid.');
    if (!['active', 'inactive'].includes(status)) throw new Error('Status paket tidak valid.');

    const oldRes = await db.query('SELECT * FROM package_master WHERE package_id = $1', [packageId]);
    const oldValue = oldRes.rows[0] || null;

    await db.query(`
      INSERT INTO package_master (
        package_id, package_name, package_category, package_type,
        selling_price, duration_minutes, included_lc_count,
        included_lc_duration_minutes, valid_day_type, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (package_id) DO UPDATE SET
        package_name = EXCLUDED.package_name,
        package_category = EXCLUDED.package_category,
        package_type = EXCLUDED.package_type,
        selling_price = EXCLUDED.selling_price,
        duration_minutes = EXCLUDED.duration_minutes,
        included_lc_count = EXCLUDED.included_lc_count,
        included_lc_duration_minutes = EXCLUDED.included_lc_duration_minutes,
        valid_day_type = EXCLUDED.valid_day_type,
        status = EXCLUDED.status,
        updated_at = CURRENT_TIMESTAMP
    `, [
      packageId,
      packageName,
      payload.package_category || '',
      packageType,
      sellingPrice,
      Math.floor(durationMinutes),
      includedLcCount,
      includedLcDurationMinutes,
      validDayType,
      status
    ]);

    await logMasterAudit('package', packageId, packageName, oldValue ? 'update' : 'save', oldValue, payload, payload.changed_by || payload.cashier_name, payload.note || '');
    return successResponse(res, { message: 'Master paket berhasil disimpan.', package_id: packageId });
  } catch (err) {
    return errorResponse(res, err.message);
  }
}

let promoSchemaChecked = false;
async function ensurePromosSchema() {
  if (promoSchemaChecked) return;
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS promos (
        promo_code VARCHAR(50) PRIMARY KEY,
        promo_name VARCHAR(100) NOT NULL,
        type VARCHAR(20) DEFAULT 'promo',
        discount_type VARCHAR(20),
        discount_value NUMERIC(12,2) NOT NULL DEFAULT 0,
        max_discount NUMERIC(12,2),
        min_spend NUMERIC(12,2) DEFAULT 0,
        valid_from DATE,
        valid_until DATE,
        is_active BOOLEAN DEFAULT TRUE,
        used_in_transaction_id VARCHAR(50),
        used_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
      ALTER TABLE promos DROP CONSTRAINT IF EXISTS promos_discount_type_check;
      ALTER TABLE promos ADD CONSTRAINT promos_discount_type_check CHECK (discount_type IN ('percentage', 'fixed', 'nominal'));
    `);
    promoSchemaChecked = true;
  } catch (e) {
    console.warn('[Schema] ensurePromosSchema notice:', e.message);
  }
}

async function savePromo(req, res, payload) {
  try {
    await ensurePromosSchema();
    const promoCode = String(payload.promo_code || payload.code || '').trim().toUpperCase();
    if (!promoCode) throw new Error('promo_code wajib diisi.');
    const promoType = String(payload.type || 'promo').trim().toLowerCase();
    
    // Normalisasi discount_type: 'percentage' atau 'fixed' (juga menerima 'nominal')
    const rawDiscType = String(payload.discount_type || payload.discountType || 'percentage').trim().toLowerCase();
    const discountType = (rawDiscType === 'percentage' || rawDiscType === 'percent') ? 'percentage' : 'fixed';

    const discountValue = Math.max(0, Number(payload.discount_value || payload.discountValue || 0));
    const maxDiscount = (payload.max_discount !== null && payload.max_discount !== undefined && payload.max_discount !== '') 
      ? Number(payload.max_discount) 
      : null;
    const minSpend = Math.max(0, Number(payload.min_spend || payload.minSpend || 0));

    await db.query(`
      INSERT INTO promos (
        promo_code, promo_name, type, discount_type, discount_value,
        max_discount, min_spend, valid_from, valid_until, is_active
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (promo_code) DO UPDATE SET
        promo_name = EXCLUDED.promo_name,
        type = EXCLUDED.type,
        discount_type = EXCLUDED.discount_type,
        discount_value = EXCLUDED.discount_value,
        max_discount = EXCLUDED.max_discount,
        min_spend = EXCLUDED.min_spend,
        valid_from = EXCLUDED.valid_from,
        valid_until = EXCLUDED.valid_until,
        is_active = EXCLUDED.is_active
    `, [
      promoCode,
      payload.promo_name || promoCode,
      promoType,
      discountType,
      discountValue,
      maxDiscount,
      minSpend,
      payload.valid_from || null,
      payload.valid_until || null,
      payload.is_active !== false && payload.status !== 'inactive'
    ]);

    await logMasterAudit('promo', promoCode, payload.promo_name || promoCode, 'save', null, payload, payload.changed_by || payload.cashier_name);
    return successResponse(res, { message: 'Promo berhasil disimpan.', promo_code: promoCode });
  } catch (err) {
    if (err.message && err.message.includes('DATABASE_OFFLINE')) throw err;
    return errorResponse(res, err.message);
  }
}

async function updatePromoStatus(req, res, payload) {
  try {
    await ensurePromosSchema();
    const promoCode = String(payload.promo_code || payload.code || '').trim().toUpperCase();
    if (!promoCode) throw new Error('promo_code wajib diisi.');
    const isActive = payload.is_active !== false && payload.status !== 'inactive';
    await db.query('UPDATE promos SET is_active = $1 WHERE promo_code = $2', [isActive, promoCode]);
    await logMasterAudit('promo', promoCode, promoCode, isActive ? 'activate' : 'deactivate', null, payload, payload.changed_by || payload.cashier_name);
    return successResponse(res, { message: 'Status promo berhasil diperbarui.', promo_code: promoCode, is_active: isActive });
  } catch (err) {
    if (err.message && err.message.includes('DATABASE_OFFLINE')) throw err;
    return errorResponse(res, err.message);
  }
}

async function deletePromo(req, res, payload) {
  try {
    await ensurePromosSchema();
    const promoCode = String(payload.promo_code || payload.code || '').trim().toUpperCase();
    if (!promoCode) throw new Error('promo_code wajib diisi.');
    await db.query('DELETE FROM promos WHERE promo_code = $1', [promoCode]);
    await logMasterAudit('promo', promoCode, promoCode, 'delete', null, payload, payload.changed_by || payload.cashier_name);
    return successResponse(res, { message: 'Promo berhasil dihapus.', promo_code: promoCode });
  } catch (err) {
    if (err.message && err.message.includes('DATABASE_OFFLINE')) throw err;
    return errorResponse(res, err.message);
  }
}

async function softDeleteMaster(req, res, table, idColumn, entityType, payload) {
  try {
    const id = payload[idColumn] || payload.id;
    if (!id) throw new Error(`${idColumn} wajib diisi.`);
    await db.query(`UPDATE ${table} SET status = 'inactive', updated_at = CURRENT_TIMESTAMP WHERE ${idColumn} = $1`, [id]);
    await logMasterAudit(entityType, id, id, 'delete', null, payload, payload.changed_by || payload.cashier_name);
    return successResponse(res, { message: `${entityType} berhasil dinonaktifkan.`, id });
  } catch (err) {
    return errorResponse(res, err.message);
  }
}

async function deleteRoomMaster(req, res, payload) {
  try {
    const roomId = payload.room_id || payload.id;
    if (!roomId) throw new Error('room_id wajib diisi.');
    await db.query(`UPDATE rooms SET status = 'maintenance', updated_at = CURRENT_TIMESTAMP WHERE room_id = $1`, [roomId]);
    await logMasterAudit('room', roomId, roomId, 'delete', null, payload, payload.changed_by || payload.cashier_name);
    return successResponse(res, { message: 'Room berhasil dipindahkan ke maintenance.', room_id: roomId });
  } catch (err) {
    return errorResponse(res, err.message);
  }
}

async function bulkUpdateMenuProfitability(req, res, payload) {
  try {
    const items = Array.isArray(payload.items) ? payload.items : [];
    for (const item of items) {
      if (!item.menu_id) continue;
      await db.query(`
        UPDATE menu SET hpp = $1, variable_cost_rate = $2, bonus_sales_lc = $3, updated_at = CURRENT_TIMESTAMP WHERE menu_id = $4
      `, [Number(item.hpp || 0), Number(item.variable_cost_rate || 0), Number(item.bonus_sales_lc || 0), item.menu_id]);
    }
    return successResponse(res, { message: 'Profitability menu berhasil diperbarui.', updated_count: items.length });
  } catch (err) {
    return errorResponse(res, err.message);
  }
}

async function bulkImportPackages(req, res, payload) {
  let client;
  try {
    client = await db.pool.connect();
    await client.query('BEGIN');
    await ensurePackageLcSchema(client);
    const packages = Array.isArray(payload.packages) ? payload.packages : [];
    for (const pkg of packages) {
      if (!pkg.package_id) continue;
      const includedLcCount = Math.max(0, Math.floor(Number(pkg.included_lc_count || pkg.lc_included_count || 0)));
      const includedLcDurationMinutes = Math.max(0, Math.floor(Number(pkg.included_lc_duration_minutes || pkg.lc_included_duration_minutes || 0)));
      await client.query(`
        INSERT INTO package_master (
          package_id, package_name, package_category, package_type,
          selling_price, duration_minutes, included_lc_count,
          included_lc_duration_minutes, valid_day_type, status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, COALESCE($10, 'active'))
        ON CONFLICT (package_id) DO UPDATE SET
          package_name = EXCLUDED.package_name,
          package_category = EXCLUDED.package_category,
          package_type = EXCLUDED.package_type,
          selling_price = EXCLUDED.selling_price,
          duration_minutes = EXCLUDED.duration_minutes,
          included_lc_count = EXCLUDED.included_lc_count,
          included_lc_duration_minutes = EXCLUDED.included_lc_duration_minutes,
          valid_day_type = EXCLUDED.valid_day_type,
          status = EXCLUDED.status,
          updated_at = CURRENT_TIMESTAMP
      `, [
        pkg.package_id,
        pkg.package_name || pkg.package_id,
        pkg.package_category || '',
        pkg.package_type || 'room_fnb_bundle',
        Number(pkg.selling_price || 0),
        Number(pkg.duration_minutes || 60),
        includedLcCount,
        includedLcDurationMinutes,
        pkg.valid_day_type || 'all',
        pkg.status || 'active'
      ]);
    }
    await client.query('COMMIT');
    return successResponse(res, { message: 'Import paket berhasil diproses.', imported_count: packages.length });
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    return errorResponse(res, err.message);
  } finally {
    if (client) client.release();
  }
}

async function seedReceptionistEmployee(req, res, payload) {
  try {
    const employeeId = payload.employee_id || 'EMP-RECEPTIONIST';
    await db.query(`
      INSERT INTO employees (employee_id, employee_name, role, pin, salary_type, base_salary, is_active)
      VALUES ($1, $2, 'receptionist', $3, 'monthly', 0, TRUE)
      ON CONFLICT (employee_id) DO UPDATE SET
        employee_name = EXCLUDED.employee_name,
        role = EXCLUDED.role,
        is_active = TRUE,
        updated_at = CURRENT_TIMESTAMP
    `, [employeeId, payload.employee_name || 'Resepsionis', payload.pin || '']);
    return successResponse(res, { message: 'Akun resepsionis berhasil disiapkan.', employee_id: employeeId });
  } catch (err) {
    return errorResponse(res, err.message);
  }
}

async function validateAdminPin(req, res, payload) {
  try {
    const { pin, required_role } = payload;
    if (!pin) throw new Error('PIN wajib diisi.');

    const requestedRole = String(required_role || 'admin').trim().toLowerCase();
    const allowedRoles = requestedRole === 'staff'
      ? ['owner', 'manager', 'cashier', 'receptionist']
      : requestedRole === 'owner'
        ? ['owner']
        : ['owner', 'manager'];

    const result = await db.query(`
      SELECT employee_id, employee_name, role, pin, pin_hash
      FROM employees
      WHERE role = ANY($1::text[]) AND is_active = TRUE
      ORDER BY CASE role WHEN 'owner' THEN 1 WHEN 'manager' THEN 2 ELSE 3 END
    `, [allowedRoles]);

    let matchedEmp = null;
    for (const emp of result.rows) {
      const isValid = await verifyAndUpgradePin(emp.employee_id, pin, emp.pin, emp.pin_hash);
      if (isValid) {
        matchedEmp = emp;
        break;
      }
    }

    if (!matchedEmp) {
      const message = requestedRole === 'staff'
        ? 'PIN operator tidak valid.'
        : requestedRole === 'owner'
          ? 'PIN Owner tidak valid.'
          : 'PIN Manager/Owner tidak valid.';
      return errorResponse(res, message, 'INVALID_ADMIN_PIN');
    }

    const employee = {
      employee_id: matchedEmp.employee_id,
      employee_name: matchedEmp.employee_name,
      role: matchedEmp.role
    };

    return successResponse(res, {
      message: 'PIN terverifikasi.',
      validated: true,
      employee,
      employee_id: employee.employee_id,
      employee_name: employee.employee_name,
      role: employee.role
    });
  } catch (err) {
    return errorResponse(res, err.message);
  }
}

async function getPackages(req, res) {
  try {
    await ensurePackageLcSchema();
    const result = await db.query('SELECT * FROM package_master WHERE status = \'active\' ORDER BY package_name ASC');
    const packages = result.rows.map(p => ({
      ...p,
      selling_price: Number(p.selling_price),
      duration_minutes: Number(p.duration_minutes || 0),
      included_lc_count: Number(p.included_lc_count || 0),
      included_lc_duration_minutes: Number(p.included_lc_duration_minutes || 0)
    }));
    return res.json({ ok: true, success: true, packages });
  } catch (err) {
    return errorResponse(res, err.message);
  }
}

async function getPackageDetails(req, res) {
  try {
    await ensurePackageLcSchema();
    const packageId = req.query.package_id || req.query.packageId || '';
    if (!packageId) throw new Error('package_id wajib diisi.');

    const pkgRes = await db.query('SELECT * FROM package_master WHERE package_id = $1', [packageId]);
    if (pkgRes.rowCount === 0) {
      return errorResponse(res, 'Paket tidak ditemukan.', 'PACKAGE_NOT_FOUND');
    }

    const detailRes = await db.query('SELECT * FROM package_details WHERE package_id = $1 ORDER BY line_no ASC', [packageId]);
    const pkg = pkgRes.rows[0];
    const details = detailRes.rows.map(detail => ({
      ...detail,
      qty: Number(detail.qty || 0),
      hpp: Number(detail.hpp || 0),
      additional_price: Number(detail.additional_price || 0),
      cost_amount: Number(detail.cost_amount || 0)
    }));

    return res.json({
      ok: true,
      success: true,
      package: {
        ...pkg,
        selling_price: Number(pkg.selling_price || 0),
        duration_minutes: Number(pkg.duration_minutes || 0),
        included_lc_count: Number(pkg.included_lc_count || 0),
        included_lc_duration_minutes: Number(pkg.included_lc_duration_minutes || 0)
      },
      details,
      package_details: details
    });
  } catch (err) {
    return errorResponse(res, err.message);
  }
}

function getDayType(dateInput) {
  const dt = dateInput ? new Date(dateInput) : new Date();
  const day = dt.getDay();
  return day === 0 || day === 6 ? 'weekend' : 'weekday';
}

async function getEligiblePackages(req, res) {
  try {
    await ensurePackageLcSchema();
    const durationMinutes = Number(req.query.duration_minutes || req.query.durationMinutes || 0);
    const bookingDate = req.query.booking_date || req.query.bookingDate || new Date().toISOString();
    const dayType = getDayType(bookingDate);

    const result = await db.query(`
      SELECT * FROM package_master
      WHERE status = 'active'
        AND (valid_day_type = 'all' OR valid_day_type = $1)
        AND ($2::int <= 0 OR duration_minutes = $2 OR duration_minutes <= $2)
      ORDER BY selling_price ASC, duration_minutes ASC
    `, [dayType, Number.isFinite(durationMinutes) ? Math.floor(durationMinutes) : 0]);

    return res.json({
      ok: true,
      success: true,
      packages: result.rows.map(pkg => ({
        ...pkg,
        selling_price: Number(pkg.selling_price || 0),
        duration_minutes: Number(pkg.duration_minutes || 0),
        included_lc_count: Number(pkg.included_lc_count || 0),
        included_lc_duration_minutes: Number(pkg.included_lc_duration_minutes || 0)
      }))
    });
  } catch (err) {
    return errorResponse(res, err.message);
  }
}

async function getPromos(req, res) {
  try {
    await ensurePromosSchema();
    const result = await db.query('SELECT * FROM promos ORDER BY created_at DESC, promo_code ASC');
    const promos = result.rows.map(p => ({
      code: p.promo_code,
      promo_code: p.promo_code,
      promo_name: p.promo_name || p.promo_code,
      type: p.type || 'promo',
      discount_type: p.discount_type || 'fixed',
      discount_value: Number(p.discount_value || 0),
      max_discount: (p.max_discount !== null && p.max_discount !== undefined) ? Number(p.max_discount) : null,
      min_spend: Number(p.min_spend || 0),
      valid_from: p.valid_from ? new Date(p.valid_from).toISOString().slice(0, 10) : '',
      valid_until: p.valid_until ? new Date(p.valid_until).toISOString().slice(0, 10) : '',
      status: p.is_active ? 'active' : 'inactive',
      is_active: Boolean(p.is_active),
      used_in_transaction_id: p.used_in_transaction_id || '',
      used_at: p.used_at ? new Date(p.used_at).toISOString() : '',
      created_at: p.created_at ? new Date(p.created_at).toISOString() : ''
    }));
    return res.json({ ok: true, success: true, promos });
  } catch (err) {
    if (err.message && err.message.includes('DATABASE_OFFLINE')) throw err;
    return errorResponse(res, err.message);
  }
}

async function deletePackageMaster(req, res, payload) {
  try {
    const packageId = payload.package_id || payload.id;
    if (!packageId) throw new Error('package_id wajib diisi.');

    const oldRes = await db.query('SELECT * FROM package_master WHERE package_id = $1', [packageId]);
    if (oldRes.rowCount === 0) throw new Error('Paket tidak ditemukan.');

    await db.query('UPDATE package_master SET status = \'inactive\', updated_at = CURRENT_TIMESTAMP WHERE package_id = $1', [packageId]);
    await logMasterAudit('package', packageId, oldRes.rows[0].package_name || packageId, 'deactivate', oldRes.rows[0], payload, payload.changed_by || payload.cashier_name, payload.note || 'Nonaktifkan paket');
    return successResponse(res, { message: 'Paket berhasil dinonaktifkan.', package_id: packageId });
  } catch (err) {
    return errorResponse(res, err.message);
  }
}

async function validatePromoCode(req, res) {
  try {
    const code = String(req.query.code || req.query.promo_code || '').trim().toUpperCase();
    const roomTotal = Number(req.query.room_total || req.query.roomTotal || 0);
    if (!code) throw new Error('Kode promo wajib diisi.');

    const result = await db.query(`
      SELECT * FROM promos
      WHERE UPPER(promo_code) = $1 AND is_active = TRUE
      LIMIT 1
    `, [code]);

    if (result.rowCount === 0) {
      return errorResponse(res, 'Kode promo tidak ditemukan atau tidak aktif.', 'PROMO_NOT_FOUND');
    }

    const promo = result.rows[0];
    const promoType = String(promo.type || 'promo').trim().toLowerCase();
    if (promoType === 'voucher' && promo.used_in_transaction_id) {
      return errorResponse(res, `Voucher "${code}" sudah digunakan di transaksi ${promo.used_in_transaction_id}.`, 'VOUCHER_ALREADY_USED');
    }

    const today = new Date().toISOString().slice(0, 10);
    const validFrom = promo.valid_from ? promo.valid_from.toISOString().slice(0, 10) : '';
    const validUntil = promo.valid_until ? promo.valid_until.toISOString().slice(0, 10) : '';

    if (validFrom && today < validFrom) {
      return errorResponse(res, 'Kode promo belum berlaku.', 'PROMO_NOT_STARTED');
    }
    if (validUntil && today > validUntil) {
      return errorResponse(res, 'Kode promo sudah berakhir.', 'PROMO_EXPIRED');
    }
    if (roomTotal < Number(promo.min_spend || 0)) {
      return errorResponse(res, 'Belanja belum memenuhi minimum promo.', 'PROMO_MIN_SPEND');
    }

    let discount = 0;
    if (promo.discount_type === 'percentage') {
      discount = Math.floor(roomTotal * (Number(promo.discount_value || 0) / 100));
      if (promo.max_discount !== null && promo.max_discount !== undefined) {
        discount = Math.min(discount, Number(promo.max_discount || discount));
      }
    } else {
      discount = Number(promo.discount_value || 0);
    }
    discount = Math.max(0, Math.min(discount, roomTotal));

    return successResponse(res, {
      valid: true,
      code: promo.promo_code,
      promo,
      discount,
      final_total: Math.max(0, roomTotal - discount)
    });
  } catch (err) {
    return errorResponse(res, err.message);
  }
}

module.exports = {
  getEmployees,
  getServiceItems,
  getCosting,
  getMasterDataAuditLogs,
  validateAdminPin,
  getPackages,
  getPackageDetails,
  getEligiblePackages,
  getPromos,
  validatePromoCode,
  saveRoomMaster,
  updateRoomMaster: saveRoomMaster,
  deleteRoomMaster,
  saveMenuMaster,
  updateMenuMaster: saveMenuMaster,
  deleteMenuMaster: (req, res, payload) => softDeleteMaster(req, res, 'menu', 'menu_id', 'menu', payload),
  saveInventoryMaster,
  updateInventoryMaster: saveInventoryMaster,
  deleteInventoryMaster: (req, res, payload) => softDeleteMaster(req, res, 'inventory', 'stock_item_id', 'inventory', payload),
  saveLcMaster,
  updateLcMaster: saveLcMaster,
  deleteLcMaster: (req, res, payload) => softDeleteMaster(req, res, 'lc_master', 'lc_id', 'lc', payload),
  savePackageMaster,
  updatePackageMaster: savePackageMaster,
  deletePackageMaster,
  savePromo,
  updatePromoStatus,
  deletePromo,
  bulkUpdateMenuProfitability,
  bulkImportPackages,
  seedReceptionistEmployee,
};
