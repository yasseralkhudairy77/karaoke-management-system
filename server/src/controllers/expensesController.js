const db = require('../db');
const { getOperationalDate } = require('../utils/operationalDate');
const { successResponse, errorResponse } = require('../utils/response');
const { verifyAndUpgradePin } = require('../middleware/auth');

async function ensureExpensesSchema(clientOrDb = db) {
  await clientOrDb.query(`
    CREATE TABLE IF NOT EXISTS operational_expenses (
      expense_id VARCHAR(50) PRIMARY KEY,
      operational_date DATE NOT NULL,
      expense_title VARCHAR(255) NOT NULL,
      category VARCHAR(100) NOT NULL DEFAULT 'Perlengkapan',
      amount NUMERIC(12,2) NOT NULL DEFAULT 0,
      payment_source VARCHAR(20) NOT NULL DEFAULT 'cash',
      cashier_name VARCHAR(100) NOT NULL DEFAULT 'Kasir',
      note TEXT DEFAULT '',
      is_voided BOOLEAN DEFAULT FALSE,
      void_reason TEXT DEFAULT '',
      voided_at TIMESTAMPTZ,
      voided_by VARCHAR(100),
      idempotency_key VARCHAR(100),
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_operational_expenses_date ON operational_expenses(operational_date);
    CREATE INDEX IF NOT EXISTS idx_operational_expenses_void ON operational_expenses(is_voided);
    CREATE INDEX IF NOT EXISTS idx_operational_expenses_created ON operational_expenses(created_at);
  `);
}

async function validateOwnerOrManagerPin(pin) {
  const cleanPin = String(pin || '').trim();
  if (!cleanPin) throw new Error('PIN Owner/Manager wajib diisi untuk otorisasi.');

  const result = await db.query(`
    SELECT employee_id, employee_name, role, pin, pin_hash
    FROM employees
    WHERE role IN ('owner', 'manager') AND is_active = TRUE
    ORDER BY CASE role WHEN 'owner' THEN 1 ELSE 2 END, employee_name ASC
  `);

  for (const emp of result.rows) {
    const isValid = await verifyAndUpgradePin(emp.employee_id, cleanPin, emp.pin, emp.pin_hash);
    if (isValid) {
      return {
        employee_id: emp.employee_id,
        employee_name: emp.employee_name,
        role: emp.role
      };
    }
  }

  throw new Error('PIN Owner/Manager tidak valid.');
}

async function getTodayExpenses(req, res) {
  try {
    await ensureExpensesSchema();
    const todayOpDate = getOperationalDate();

    const result = await db.query(`
      SELECT *
      FROM operational_expenses
      WHERE operational_date = $1
      ORDER BY created_at DESC
    `, [todayOpDate]);

    const expenses = result.rows.map(row => ({
      ...row,
      amount: Number(row.amount || 0),
      created_at: row.created_at ? new Date(row.created_at).toISOString() : '',
      updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : '',
      voided_at: row.voided_at ? new Date(row.voided_at).toISOString() : null
    }));

    let totalActiveAmount = 0;
    let activeCount = 0;
    let voidedCount = 0;

    expenses.forEach(e => {
      if (e.is_voided) {
        voidedCount++;
      } else {
        activeCount++;
        totalActiveAmount += e.amount;
      }
    });

    return res.json({
      ok: true,
      success: true,
      operational_date: todayOpDate,
      expenses,
      summary: {
        total_active_amount: totalActiveAmount,
        total_count: expenses.length,
        active_count: activeCount,
        voided_count: voidedCount
      }
    });
  } catch (err) {
    return errorResponse(res, err.message);
  }
}

async function getExpensesByDateRange(req, res) {
  try {
    await ensureExpensesSchema();
    const startDate = req.query.start_date || req.query.startDate || getOperationalDate();
    const endDate = req.query.end_date || req.query.endDate || startDate;

    const result = await db.query(`
      SELECT *
      FROM operational_expenses
      WHERE operational_date >= $1 AND operational_date <= $2
      ORDER BY operational_date DESC, created_at DESC
    `, [startDate, endDate]);

    const expenses = result.rows.map(row => ({
      ...row,
      amount: Number(row.amount || 0),
      created_at: row.created_at ? new Date(row.created_at).toISOString() : '',
      updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : '',
      voided_at: row.voided_at ? new Date(row.voided_at).toISOString() : null
    }));

    return res.json({
      ok: true,
      success: true,
      start_date: startDate,
      end_date: endDate,
      expenses
    });
  } catch (err) {
    return errorResponse(res, err.message);
  }
}

async function saveExpense(req, res, payload) {
  let client;
  try {
    client = await db.pool.connect();
    await client.query('BEGIN');
    await ensureExpensesSchema(client);

    const expenseTitle = String(payload.expense_title || payload.title || payload.description || '').trim();
    const category = String(payload.category || 'Perlengkapan').trim();
    const amount = Number(payload.amount || 0);
    const cashierName = String(payload.cashier_name || payload.cashier || 'Kasir').trim();
    const note = String(payload.note || '').trim();
    const idempotencyKey = String(payload.idempotency_key || '').trim() || null;

    if (!expenseTitle) {
      throw new Error('Keperluan/nama pengeluaran wajib diisi.');
    }
    if (isNaN(amount) || amount <= 0) {
      throw new Error('Nominal pengeluaran harus berupa angka positif lebih dari Rp 0.');
    }

    if (idempotencyKey) {
      const existing = await client.query('SELECT * FROM operational_expenses WHERE idempotency_key = $1', [idempotencyKey]);
      if (existing.rowCount > 0) {
        await client.query('COMMIT');
        const row = existing.rows[0];
        return successResponse(res, {
          message: 'Pengeluaran sudah dicatat sebelumnya (idempotent).',
          expense: {
            ...row,
            amount: Number(row.amount || 0)
          },
          idempotent_replay: true
        });
      }
    }

    const todayOpDate = getOperationalDate();
    const expenseId = `EXP-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

    const insertRes = await client.query(`
      INSERT INTO operational_expenses (
        expense_id, operational_date, expense_title, category, amount,
        payment_source, cashier_name, note, idempotency_key
      ) VALUES ($1, $2, $3, $4, $5, 'cash', $6, $7, $8)
      RETURNING *
    `, [expenseId, todayOpDate, expenseTitle, category, amount, cashierName, note, idempotencyKey]);

    const createdExpense = insertRes.rows[0];

    // Sync outbox
    await client.query(`
      INSERT INTO sync_outbox (entity_type, entity_id, action, payload_json)
      VALUES ('operational_expenses', $1, 'INSERT', $2)
      ON CONFLICT DO NOTHING
    `, [expenseId, JSON.stringify({
      expense_id: expenseId,
      operational_date: todayOpDate,
      expense_title: expenseTitle,
      amount,
      cashier_name: cashierName
    })]);

    await client.query('COMMIT');

    return successResponse(res, {
      message: `Pengeluaran ${expenseTitle} senilai Rp ${amount.toLocaleString('id-ID')} berhasil dicatat.`,
      expense: {
        ...createdExpense,
        amount: Number(createdExpense.amount || 0),
        created_at: createdExpense.created_at ? new Date(createdExpense.created_at).toISOString() : '',
        updated_at: createdExpense.updated_at ? new Date(createdExpense.updated_at).toISOString() : ''
      }
    });
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    return errorResponse(res, err.message);
  } finally {
    if (client) client.release();
  }
}

async function voidExpense(req, res, payload) {
  let client;
  try {
    client = await db.pool.connect();
    await client.query('BEGIN');
    await ensureExpensesSchema(client);

    const expenseId = String(payload.expense_id || '').trim();
    const reason = String(payload.reason || '').trim();
    const adminPin = String(payload.admin_pin || payload.owner_pin || '').trim();
    const voidedBy = String(payload.voided_by || payload.changed_by || '').trim();

    if (!expenseId) throw new Error('expense_id wajib diisi.');
    if (!reason || reason.length < 3) throw new Error('Alasan pembatalan minimal 3 karakter.');

    const authorizer = await validateOwnerOrManagerPin(adminPin);
    const finalVoidedBy = voidedBy || `${authorizer.employee_name} (${authorizer.role})`;

    const existingRes = await client.query('SELECT * FROM operational_expenses WHERE expense_id = $1 FOR UPDATE', [expenseId]);
    if (existingRes.rowCount === 0) {
      throw new Error('Data pengeluaran tidak ditemukan.');
    }
    const existing = existingRes.rows[0];
    if (existing.is_voided) {
      throw new Error('Pengeluaran ini sudah dibatalkan sebelumnya.');
    }

    const updateRes = await client.query(`
      UPDATE operational_expenses
      SET is_voided = TRUE,
          void_reason = $1,
          voided_at = CURRENT_TIMESTAMP,
          voided_by = $2,
          updated_at = CURRENT_TIMESTAMP
      WHERE expense_id = $3
      RETURNING *
    `, [reason, finalVoidedBy, expenseId]);

    const updatedExpense = updateRes.rows[0];

    // Sync outbox
    await client.query(`
      INSERT INTO sync_outbox (entity_type, entity_id, action, payload_json)
      VALUES ('operational_expenses', $1, 'UPDATE', $2)
      ON CONFLICT (entity_type, entity_id, action) DO UPDATE
      SET payload_json = EXCLUDED.payload_json,
          status = 'pending',
          attempts = 0,
          last_attempt_at = NULL,
          error_message = NULL
    `, [expenseId, JSON.stringify({
      expense_id: expenseId,
      is_voided: true,
      void_reason: reason,
      voided_by: finalVoidedBy
    })]);

    await client.query('COMMIT');

    return successResponse(res, {
      message: `Pengeluaran ${existing.expense_title} berhasil dibatalkan.`,
      expense: {
        ...updatedExpense,
        amount: Number(updatedExpense.amount || 0),
        created_at: updatedExpense.created_at ? new Date(updatedExpense.created_at).toISOString() : '',
        updated_at: updatedExpense.updated_at ? new Date(updatedExpense.updated_at).toISOString() : '',
        voided_at: updatedExpense.voided_at ? new Date(updatedExpense.voided_at).toISOString() : ''
      }
    });
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    return errorResponse(res, err.message);
  } finally {
    if (client) client.release();
  }
}

module.exports = {
  ensureExpensesSchema,
  validateOwnerOrManagerPin,
  getTodayExpenses,
  getExpensesByDateRange,
  saveExpense,
  voidExpense
};
