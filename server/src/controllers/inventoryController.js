const db = require('../db');
const { successResponse, errorResponse } = require('../utils/response');

async function getInventoryItems(req, res) {
  try {
    const result = await db.query(`
      SELECT stock_item_id, stock_item_name, category, unit, stock_qty, min_stock, status, updated_at
      FROM inventory
      ORDER BY category ASC, stock_item_name ASC
    `);

    const items = result.rows.map(row => ({
      stock_item_id: row.stock_item_id,
      stock_item_name: row.stock_item_name,
      category: row.category,
      unit: row.unit,
      stock_qty: Number(row.stock_qty || 0),
      min_stock: Number(row.min_stock || 0),
      status: row.status,
      updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : ""
    }));

    return res.json({ ok: true, success: true, items });
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
    return successResponse(res, {
      message: `Stok ${item.stock_item_name} berhasil disesuaikan.`,
      stock_item_id,
      stock_before: stockBefore,
      stock_after: stockAfter
    });
  } catch (err) {
    await client.query('ROLLBACK');
    return errorResponse(res, err.message);
  } finally {
    client.release();
  }
}

module.exports = {
  getInventoryItems,
  adjustInventoryStock,
};
