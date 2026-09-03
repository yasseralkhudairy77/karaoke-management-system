const db = require('../db');
const { successResponse, errorResponse } = require('../utils/response');
const { getOperationalDateRange } = require('../utils/operationalDate');

function getInventoryStatus(stockQty, minStock) {
  if (stockQty < 0) {
    return 'negative';
  }
  if (stockQty <= minStock) {
    return 'low';
  }
  return 'safe';
}

async function getInventoryItems(req, res) {
  try {
    const statusParam = req.query?.status;
    let whereClause = '';
    const params = [];
    if (statusParam === 'all') {
      whereClause = '';
    } else if (statusParam === 'inactive') {
      whereClause = "WHERE status = 'inactive'";
    } else {
      whereClause = "WHERE (status = 'active' OR status IS NULL OR status = '')";
    }

    const result = await db.query(`
      SELECT stock_item_id, stock_item_name, category, unit, stock_qty, min_stock, status, updated_at
      FROM inventory
      ${whereClause}
      ORDER BY category ASC, stock_item_name ASC
    `, params);

    const items = result.rows.map(row => {
      const stockQty = Number(row.stock_qty || 0);
      const minStock = Number(row.min_stock || 0);
      return {
        stock_item_id: row.stock_item_id,
        stock_item_name: row.stock_item_name,
        category: row.category,
        unit: row.unit,
        stock_qty: stockQty,
        min_stock: minStock,
        status: row.status,
        stock_status: getInventoryStatus(stockQty, minStock),
        updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : ""
      };
    });

    const summary = items.reduce((acc, item) => {
      acc.total_items += 1;
      if (item.stock_status === 'negative') {
        acc.negative_items += 1;
      } else if (item.stock_status === 'low') {
        acc.low_items += 1;
      } else {
        acc.safe_items += 1;
      }
      return acc;
    }, {
      total_items: 0,
      safe_items: 0,
      low_items: 0,
      negative_items: 0
    });

    return res.json({ ok: true, success: true, items, summary });
  } catch (err) {
    return errorResponse(res, err.message);
  }
}

async function adjustInventoryStock(req, res, payload) {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const { stock_item_id, adjustment_type, quantity, note = '', cashier_name = 'Kasir' } = payload;
    const qtyChange = Number(quantity || 0);

    if (!stock_item_id) throw new Error('stock_item_id wajib diisi.');
    if (isNaN(qtyChange)) throw new Error('quantity tidak valid.');

    const invRes = await client.query('SELECT * FROM inventory WHERE stock_item_id = $1 FOR UPDATE', [stock_item_id]);
    if (invRes.rowCount === 0) throw new Error('Item stok tidak ditemukan.');

    const item = invRes.rows[0];
    const stockBefore = Number(item.stock_qty || 0);
    let stockAfter = stockBefore;
    let movementType = 'adjustment';

    if (adjustment_type === 'restock' || adjustment_type === 'in') {
      stockAfter = stockBefore + Math.abs(qtyChange);
      movementType = 'in';
    } else if (adjustment_type === 'out') {
      stockAfter = stockBefore - Math.abs(qtyChange);
      movementType = 'out';
    } else {
      // Set stock directly
      stockAfter = qtyChange;
      movementType = 'adjustment';
    }

    // Update inventory
    await client.query(`
      UPDATE inventory SET stock_qty = $1, updated_at = CURRENT_TIMESTAMP WHERE stock_item_id = $2
    `, [stockAfter, stock_item_id]);

    // Record stock movement
    const movementId = `MOV-${Date.now()}`;
    await client.query(`
      INSERT INTO stock_movements (
        movement_id, stock_item_id, stock_item_name, movement_type,
        reference_type, reference_id, qty_change, stock_before, stock_after, note, cashier_name
      ) VALUES ($1, $2, $3, $4, 'manual_adjustment', $1, $5, $6, $7, $8, $9)
    `, [movementId, stock_item_id, item.stock_item_name, movementType, (stockAfter - stockBefore), stockBefore, stockAfter, note, cashier_name]);

    await client.query('COMMIT');
    const finalStockStatus = getInventoryStatus(stockAfter, Number(item.min_stock || 0));
    return successResponse(res, {
      message: `Stok ${item.stock_item_name} berhasil disesuaikan.`,
      stock_item_id,
      stock_before: stockBefore,
      stock_after: stockAfter,
      status: finalStockStatus,
      stock_status: finalStockStatus
    });
  } catch (err) {
    await client.query('ROLLBACK');
    return errorResponse(res, err.message);
  } finally {
    client.release();
  }
}

async function getTodayStockMovements(req, res) {
  try {
    const { stock_item_id, movement_type, reference_type, period, start_date, end_date } = req.query;
    const { startDate, endDate } = getOperationalDateRange(period, start_date, end_date);

    const params = [startDate, endDate];
    const filters = [`DATE(created_at AT TIME ZONE 'Asia/Jakarta') >= $1`, `DATE(created_at AT TIME ZONE 'Asia/Jakarta') <= $2`];
    if (stock_item_id) {
      params.push(stock_item_id);
      filters.push(`stock_item_id = $${params.length}`);
    }
    if (movement_type) {
      params.push(movement_type);
      filters.push(`movement_type = $${params.length}`);
    }
    if (reference_type) {
      params.push(reference_type);
      filters.push(`reference_type = $${params.length}`);
    }

    const result = await db.query(`
      SELECT * FROM stock_movements
      WHERE ${filters.join(' AND ')}
      ORDER BY created_at DESC
    `, params);

    const movements = result.rows.map(row => ({
      ...row,
      qty_change: Number(row.qty_change || 0),
      stock_before: Number(row.stock_before || 0),
      stock_after: Number(row.stock_after || 0),
      created_at: row.created_at ? row.created_at.toISOString() : ''
    }));

    return res.json({ ok: true, success: true, movements, stock_movements: movements });
  } catch (err) {
    return errorResponse(res, err.message);
  }
}

async function getRecipeBom(req, res) {
  try {
    const menuId = req.query.menu_id || '';
    if (!menuId) throw new Error('menu_id wajib diisi.');

    const result = await db.query(`
      SELECT r.*, i.stock_item_name, i.unit
      FROM recipe r
      LEFT JOIN inventory i ON i.stock_item_id = r.item_id
      WHERE r.menu_id = $1
      ORDER BY r.sort_order ASC, r.recipe_id ASC
    `, [menuId]);

    const recipe = result.rows.map(row => ({
      ...row,
      qty_used: Number(row.qty_used || 0),
      component_mode: row.component_mode || 'included',
      sort_order: Number(row.sort_order || 0)
    }));
    return res.json({ ok: true, success: true, recipe, items: recipe });
  } catch (err) {
    return errorResponse(res, err.message);
  }
}

async function getInventoryAudits(req, res) {
  try {
    const result = await db.query('SELECT * FROM inventory_audits ORDER BY created_at DESC LIMIT 200');
    return res.json({ ok: true, success: true, audits: result.rows });
  } catch (err) {
    return errorResponse(res, err.message);
  }
}

async function getInventoryAuditDetails(req, res) {
  try {
    const auditId = req.query.audit_id || '';
    if (!auditId) throw new Error('audit_id wajib diisi.');
    const auditRes = await db.query('SELECT * FROM inventory_audits WHERE audit_id = $1', [auditId]);
    if (auditRes.rowCount === 0) return errorResponse(res, 'Audit stok tidak ditemukan.', 'AUDIT_NOT_FOUND');
    const linesRes = await db.query('SELECT * FROM inventory_audit_lines WHERE audit_id = $1 ORDER BY stock_item_name ASC', [auditId]);
    return res.json({ ok: true, success: true, audit: auditRes.rows[0], lines: linesRes.rows });
  } catch (err) {
    return errorResponse(res, err.message);
  }
}

async function createInventoryAudit(req, res, payload) {
  let client;
  try {
    client = await db.pool.connect();
    await client.query('BEGIN');
    const auditId = `INV-AUD-${Date.now()}`;
    const createdBy = payload.created_by || payload.cashier_name || 'Operator';
    await client.query(`
      INSERT INTO inventory_audits (audit_id, status, created_by, note)
      VALUES ($1, 'draft', $2, $3)
    `, [auditId, createdBy, payload.note || '']);

    const invRes = await client.query('SELECT stock_item_id, stock_item_name, unit, stock_qty FROM inventory WHERE status = $1 ORDER BY stock_item_name ASC', ['active']);
    for (const item of invRes.rows) {
      await client.query(`
        INSERT INTO inventory_audit_lines (audit_id, stock_item_id, stock_item_name, unit, book_qty_snapshot, count_qty, difference_qty, note)
        VALUES ($1, $2, $3, $4, $5, 0, 0, '')
      `, [auditId, item.stock_item_id, item.stock_item_name, item.unit, item.stock_qty]);
    }

    await client.query('COMMIT');
    return successResponse(res, { message: 'Audit stok berhasil dibuat.', audit_id: auditId });
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    return errorResponse(res, err.message);
  } finally {
    if (client) client.release();
  }
}

async function saveInventoryAuditCounts(req, res, payload) {
  let client;
  try {
    client = await db.pool.connect();
    await client.query('BEGIN');
    const auditId = payload.audit_id;
    const lines = Array.isArray(payload.lines) ? payload.lines : [];
    if (!auditId) throw new Error('audit_id wajib diisi.');

    for (const line of lines) {
      const countedQty = Number(line.counted_qty ?? line.count_qty);
      if (!line.stock_item_id || !Number.isFinite(countedQty)) continue;
      await client.query(`
        UPDATE inventory_audit_lines
        SET count_qty = $1, difference_qty = $1 - book_qty_snapshot, note = $2
        WHERE audit_id = $3 AND stock_item_id = $4
      `, [countedQty, line.note || '', auditId, line.stock_item_id]);
    }

    await client.query('COMMIT');
    return successResponse(res, { message: 'Hitungan audit stok berhasil disimpan.', audit_id: auditId });
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    return errorResponse(res, err.message);
  } finally {
    if (client) client.release();
  }
}

async function submitInventoryAudit(req, res, payload) {
  try {
    const auditId = payload.audit_id;
    if (!auditId) throw new Error('audit_id wajib diisi.');
    await db.query('UPDATE inventory_audits SET status = $1, submitted_at = CURRENT_TIMESTAMP WHERE audit_id = $2', ['submitted', auditId]);
    return successResponse(res, { message: 'Audit stok berhasil disubmit.', audit_id: auditId });
  } catch (err) {
    return errorResponse(res, err.message);
  }
}

async function approveInventoryAudit(req, res, payload) {
  let client;
  try {
    client = await db.pool.connect();
    await client.query('BEGIN');
    const auditId = payload.audit_id;
    const approvedBy = payload.approved_by || payload.cashier_name || 'Manager';
    if (!auditId) throw new Error('audit_id wajib diisi.');

    const linesRes = await client.query('SELECT * FROM inventory_audit_lines WHERE audit_id = $1', [auditId]);
    for (const line of linesRes.rows) {
      const invRes = await client.query('SELECT * FROM inventory WHERE stock_item_id = $1 FOR UPDATE', [line.stock_item_id]);
      if (invRes.rowCount === 0) continue;
      const before = Number(invRes.rows[0].stock_qty || 0);
      const after = Number(line.count_qty || 0);
      await client.query('UPDATE inventory SET stock_qty = $1, updated_at = CURRENT_TIMESTAMP WHERE stock_item_id = $2', [after, line.stock_item_id]);
      await client.query(`
        INSERT INTO stock_movements (
          movement_id, stock_item_id, stock_item_name, movement_type, reference_type, reference_id,
          qty_change, stock_before, stock_after, note, cashier_name
        ) VALUES ($1, $2, $3, 'adjustment', 'inventory_audit', $4, $5, $6, $7, $8, $9)
      `, [`MOV-${auditId}-${line.stock_item_id}`, line.stock_item_id, line.stock_item_name, auditId, after - before, before, after, 'Posting audit stok', approvedBy]);
    }
    await client.query('UPDATE inventory_audits SET status = $1, approved_at = CURRENT_TIMESTAMP, approved_by = $2 WHERE audit_id = $3', ['posted', approvedBy, auditId]);
    await client.query('COMMIT');
    return successResponse(res, { message: 'Audit stok berhasil diposting.', audit_id: auditId });
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    return errorResponse(res, err.message);
  } finally {
    if (client) client.release();
  }
}

async function receiveGoodsBatch(req, res, payload) {
  let client;
  try {
    client = await db.pool.connect();
    await client.query('BEGIN');

    const {
      reference_id = '',
      supplier_name = '',
      notes = '',
      cashier_name = 'Admin Gudang',
      items = []
    } = payload;

    if (!Array.isArray(items) || items.length === 0) {
      throw new Error('Daftar barang masuk tidak boleh kosong.');
    }

    const docNumber = reference_id.trim() || `SJ-${Date.now()}`;
    const supplierText = supplier_name.trim() || 'Supplier Umum';
    const combinedNote = `Penerimaan Supplier: ${supplierText} (No: ${docNumber})${notes ? ' - ' + notes.trim() : ''}`;

    const processedItems = [];

    for (const entry of items) {
      const stockItemId = String(entry.stock_item_id || '').trim();
      const qtyIn = Math.abs(Number(entry.quantity || 0));

      if (!stockItemId || qtyIn <= 0) continue;

      const invRes = await client.query('SELECT * FROM inventory WHERE stock_item_id = $1 FOR UPDATE', [stockItemId]);
      if (invRes.rowCount === 0) continue;

      const inv = invRes.rows[0];
      const stockBefore = Number(inv.stock_qty || 0);
      const stockAfter = stockBefore + qtyIn;

      await client.query('UPDATE inventory SET stock_qty = $1, updated_at = CURRENT_TIMESTAMP WHERE stock_item_id = $2', [stockAfter, stockItemId]);

      const movementId = `MOV-IN-${Date.now()}-${stockItemId}`;
      await client.query(`
        INSERT INTO stock_movements (
          movement_id, stock_item_id, stock_item_name, movement_type,
          reference_type, reference_id, qty_change, stock_before, stock_after, note, cashier_name, idempotency_key
        ) VALUES ($1, $2, $3, 'in', 'goods_receipt', $4, $5, $6, $7, $8, $9, $1)
        ON CONFLICT (idempotency_key) DO NOTHING
      `, [
        movementId,
        stockItemId,
        inv.stock_item_name,
        docNumber,
        qtyIn,
        stockBefore,
        stockAfter,
        combinedNote,
        cashier_name
      ]);

      processedItems.push({
        stock_item_id: stockItemId,
        stock_item_name: inv.stock_item_name,
        qty_in: qtyIn,
        unit: inv.unit,
        stock_before: stockBefore,
        stock_after: stockAfter
      });
    }

    if (processedItems.length === 0) {
      throw new Error('Tidak ada barang valid yang dapat diproses.');
    }

    await client.query('COMMIT');

    return successResponse(res, {
      message: `Berhasil mencatat penerimaan ${processedItems.length} barang masuk (No. Dokumen: ${docNumber}).`,
      document_number: docNumber,
      supplier_name: supplierText,
      total_items: processedItems.length,
      items: processedItems
    });
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    return errorResponse(res, err.message);
  } finally {
    if (client) client.release();
  }
}

module.exports = {
  getInventoryItems,
  getInventoryStatus,
  getTodayStockMovements,
  getRecipeBom,
  getInventoryAudits,
  getInventoryAuditDetails,
  createInventoryAudit,
  saveInventoryAuditCounts,
  submitInventoryAudit,
  approveInventoryAudit,
  adjustInventoryStock,
  receiveGoodsBatch,
};
