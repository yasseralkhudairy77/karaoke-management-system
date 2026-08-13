const db = require('../db');
const { successResponse, errorResponse } = require('../utils/response');
const { verifyAndUpgradePin } = require('../middleware/auth');

async function logMasterAudit(entityType, entityId, entityName, actionType, oldValue, newValue, changedBy, note = '', result = 'success') {
  await db.query(`
    INSERT INTO master_data_audit_logs (
      log_id, entity_type, entity_id, entity_name, action_type, old_value_json, new_value_json, changed_by, note, result
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
  `, [`MDA-${Date.now()}-${Math.floor(Math.random() * 1000)}`, entityType, entityId, entityName, actionType, oldValue || null, newValue || null, changedBy || 'Operator', note, result]);
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
  try {
    const menuId = payload.menu_id || `MENU-${Date.now()}`;
    await db.query(`
      INSERT INTO menu (menu_id, menu_name, category, price, status, stock_tracking, stock_item_id, stock_qty_per_unit, bonus_sales_lc, hpp, variable_cost_rate)
      VALUES ($1, $2, $3, $4, COALESCE($5, 'active'), $6, $7, $8, $9, $10, $11)
      ON CONFLICT (menu_id) DO UPDATE SET menu_name = EXCLUDED.menu_name, category = EXCLUDED.category, price = EXCLUDED.price, status = EXCLUDED.status, stock_tracking = EXCLUDED.stock_tracking, stock_item_id = EXCLUDED.stock_item_id, stock_qty_per_unit = EXCLUDED.stock_qty_per_unit, bonus_sales_lc = EXCLUDED.bonus_sales_lc, hpp = EXCLUDED.hpp, variable_cost_rate = EXCLUDED.variable_cost_rate, updated_at = CURRENT_TIMESTAMP
    `, [menuId, payload.menu_name || menuId, payload.category || 'F&B', Number(payload.price || 0), payload.status || 'active', payload.stock_tracking || 'no', payload.stock_item_id || null, Number(payload.stock_qty_per_unit || 1), Number(payload.bonus_sales_lc || 0), Number(payload.hpp || 0), Number(payload.variable_cost_rate || 0)]);
    await logMasterAudit('menu', menuId, payload.menu_name || menuId, 'save', null, payload, payload.changed_by || payload.cashier_name);
    return successResponse(res, { message: 'Master menu berhasil disimpan.', menu_id: menuId });
  } catch (err) {
    return errorResponse(res, err.message);
  }
}

async function saveInventoryMaster(req, res, payload) {
  try {
    const stockItemId = payload.stock_item_id || payload.item_id || `STOCK-${Date.now()}`;
    await db.query(`
      INSERT INTO inventory (stock_item_id, stock_item_name, category, unit, stock_qty, min_stock, status)
      VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, 'active'))
      ON CONFLICT (stock_item_id) DO UPDATE SET stock_item_name = EXCLUDED.stock_item_name, category = EXCLUDED.category, unit = EXCLUDED.unit, stock_qty = EXCLUDED.stock_qty, min_stock = EXCLUDED.min_stock, status = EXCLUDED.status, updated_at = CURRENT_TIMESTAMP
    `, [stockItemId, payload.stock_item_name || payload.item_name || stockItemId, payload.category || 'General', payload.unit || 'pcs', Number(payload.stock_qty || 0), Number(payload.min_stock || 0), payload.status || 'active']);
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

async function savePromo(req, res, payload) {
  try {
    const promoCode = String(payload.promo_code || payload.code || '').trim().toUpperCase();
    if (!promoCode) throw new Error('promo_code wajib diisi.');
    await db.query(`
      INSERT INTO promos (promo_code, promo_name, discount_type, discount_value, max_discount, min_spend, valid_from, valid_until, is_active)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (promo_code) DO UPDATE SET promo_name = EXCLUDED.promo_name, discount_type = EXCLUDED.discount_type, discount_value = EXCLUDED.discount_value, max_discount = EXCLUDED.max_discount, min_spend = EXCLUDED.min_spend, valid_from = EXCLUDED.valid_from, valid_until = EXCLUDED.valid_until, is_active = EXCLUDED.is_active
    `, [promoCode, payload.promo_name || promoCode, payload.discount_type || 'fixed', Number(payload.discount_value || 0), payload.max_discount || null, Number(payload.min_spend || 0), payload.valid_from || null, payload.valid_until || null, payload.is_active !== false]);
    await logMasterAudit('promo', promoCode, payload.promo_name || promoCode, 'save', null, payload, payload.changed_by || payload.cashier_name);
    return successResponse(res, { message: 'Promo berhasil disimpan.', promo_code: promoCode });
  } catch (err) {
    return errorResponse(res, err.message);
  }
}

async function updatePromoStatus(req, res, payload) {
  try {
    const promoCode = String(payload.promo_code || payload.code || '').trim().toUpperCase();
    if (!promoCode) throw new Error('promo_code wajib diisi.');
    await db.query('UPDATE promos SET is_active = $1 WHERE promo_code = $2', [payload.is_active !== false && payload.status !== 'inactive', promoCode]);
    return successResponse(res, { message: 'Status promo berhasil diperbarui.', promo_code: promoCode });
  } catch (err) {
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
    const packages = Array.isArray(payload.packages) ? payload.packages : [];
    for (const pkg of packages) {
      if (!pkg.package_id) continue;
      await client.query(`
        INSERT INTO package_master (package_id, package_name, package_category, package_type, selling_price, duration_minutes, valid_day_type, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, 'active'))
        ON CONFLICT (package_id) DO UPDATE SET package_name = EXCLUDED.package_name, package_category = EXCLUDED.package_category, package_type = EXCLUDED.package_type, selling_price = EXCLUDED.selling_price, duration_minutes = EXCLUDED.duration_minutes, valid_day_type = EXCLUDED.valid_day_type, status = EXCLUDED.status, updated_at = CURRENT_TIMESTAMP
      `, [pkg.package_id, pkg.package_name || pkg.package_id, pkg.package_category || '', pkg.package_type || 'room_fnb_bundle', Number(pkg.selling_price || 0), Number(pkg.duration_minutes || 60), pkg.valid_day_type || 'all', pkg.status || 'active']);
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

    const result = await db.query(`
      SELECT employee_id, employee_name, role, pin, pin_hash
      FROM employees
      WHERE role IN ('owner', 'manager') AND is_active = TRUE
      ORDER BY CASE role WHEN 'owner' THEN 1 WHEN 'manager' THEN 2 ELSE 3 END
    `);

    let matchedEmp = null;
    for (const emp of result.rows) {
      const isValid = await verifyAndUpgradePin(emp.employee_id, pin, emp.pin, emp.pin_hash);
      if (isValid) {
        matchedEmp = emp;
        break;
      }
    }

    if (!matchedEmp) {
      return errorResponse(res, 'PIN Manager/Owner tidak valid.', 'INVALID_ADMIN_PIN');
    }

    if (required_role === 'owner' && matchedEmp.role !== 'owner') {
      return errorResponse(res, 'Aksi ini membutuhkan PIN Owner.', 'OWNER_PIN_REQUIRED');
    }

    return successResponse(res, {
      message: 'PIN terverifikasi.',
      validated: true,
      employee_name: matchedEmp.employee_name,
      role: matchedEmp.role
    });
  } catch (err) {
    return errorResponse(res, err.message);
  }
}

async function getPackages(req, res) {
  try {
    const result = await db.query('SELECT * FROM package_master WHERE status = \'active\' ORDER BY package_name ASC');
    const packages = result.rows.map(p => ({
      ...p,
      selling_price: Number(p.selling_price)
    }));
    return res.json({ ok: true, success: true, packages });
  } catch (err) {
    return errorResponse(res, err.message);
  }
}

async function getPackageDetails(req, res) {
  try {
    const packageId = req.query.package_id || req.query.packageId || '';
    if (!packageId) throw new Error('package_id wajib diisi.');

    const pkgRes = await db.query('SELECT * FROM package_master WHERE package_id = $1', [packageId]);
    if (pkgRes.rowCount === 0) {
      return errorResponse(res, 'Paket tidak ditemukan.', 'PACKAGE_NOT_FOUND');
    }

    const detailRes = await db.query('SELECT * FROM package_details WHERE package_id = $1 ORDER BY line_no ASC', [packageId]);
    const pkg = pkgRes.rows[0];
    return res.json({
      ok: true,
      success: true,
      package: {
        ...pkg,
        selling_price: Number(pkg.selling_price || 0),
        duration_minutes: Number(pkg.duration_minutes || 0)
      },
      details: detailRes.rows.map(detail => ({
        ...detail,
        qty: Number(detail.qty || 0),
        hpp: Number(detail.hpp || 0),
        additional_price: Number(detail.additional_price || 0),
        cost_amount: Number(detail.cost_amount || 0)
      }))
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
        duration_minutes: Number(pkg.duration_minutes || 0)
      }))
    });
  } catch (err) {
    return errorResponse(res, err.message);
  }
}

async function getPromos(req, res) {
  try {
    const result = await db.query('SELECT * FROM promos WHERE is_active = TRUE ORDER BY promo_code ASC');
    return res.json({ ok: true, success: true, promos: result.rows });
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
  savePromo,
  updatePromoStatus,
  deletePromo: (req, res, payload) => updatePromoStatus(req, res, { ...payload, is_active: false }),
  bulkUpdateMenuProfitability,
  bulkImportPackages,
  seedReceptionistEmployee,
};
