const db = require('../db');
const { verifyAndUpgradePin } = require('../middleware/auth');
const { successResponse, errorResponse, getServerTimeFields } = require('../utils/response');

const BACKUP_TABLES = [
  'settings',
  'employees',
  'inventory',
  'promos',
  'lc_master',
  'petty_cash_ledger',
  'master_data_audit_logs',
  'operational_audit_events',
  'sync_outbox',
  'owner_mirror_snapshots',
  'rooms',
  'tv_devices',
  'tv_displays',
  'tv_control_logs',
  'room_time_logs',
  'room_recovery_logs',
  'menu',
  'package_master',
  'lc_cash_advances',
  'lc_payroll_history',
  'cashier_closings',
  'recipe',
  'package_details',
  'room_sessions',
  'room_session_segments',
  'inventory_audits',
  'cashier_closing_transactions',
  'cashier_closing_fnb_items',
  'cashier_closing_lc_details',
  'inventory_audit_lines',
  'transactions',
  'fnb_orders',
  'lc_work_logs',
  'transaction_lines',
  'transaction_correction_logs',
  'sales_commission_logs',
  'receipt_print_logs',
  'fnb_order_items',
  'stock_movements',
  'lc_sales_bonus_logs',
  'fnb_order_item_components'
];

async function getDatabaseStatus(req, res) {
  try {
    const counts = {};
    const keyTables = ['transactions', 'rooms', 'menu', 'inventory', 'employees', 'cashier_closings', 'fnb_orders'];

    for (const tbl of keyTables) {
      try {
        const result = await db.query(`SELECT COUNT(*)::int AS count FROM "${tbl}"`);
        counts[tbl] = result.rows[0]?.count || 0;
      } catch (e) {
        counts[tbl] = 0;
      }
    }

    return res.json({
      ok: true,
      success: true,
      database_name: process.env.PGDATABASE || 'happy_song_pos',
      status: 'online',
      total_tables: BACKUP_TABLES.length,
      counts,
      ...getServerTimeFields()
    });
  } catch (err) {
    return errorResponse(res, `Gagal memeriksa status database: ${err.message}`);
  }
}

async function exportDatabase(req, res) {
  try {
    const tableData = {};
    const tableCounts = {};
    let totalRecords = 0;

    for (const tableName of BACKUP_TABLES) {
      try {
        const result = await db.query(`SELECT * FROM "${tableName}"`);
        tableData[tableName] = result.rows;
        tableCounts[tableName] = result.rows.length;
        totalRecords += result.rows.length;
      } catch (tableErr) {
        console.warn(`[BACKUP] Peringatan membaca tabel ${tableName}:`, tableErr.message);
        tableData[tableName] = [];
        tableCounts[tableName] = 0;
      }
    }

    const now = new Date();
    const timestampStr = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `happy_song_backup_${timestampStr}.json`;

    const payload = {
      app: 'Happy Song Karaoke Management System',
      schema_version: '1.0',
      backup_type: 'full_database_snapshot',
      created_at: now.toISOString(),
      database: process.env.PGDATABASE || 'happy_song_pos',
      total_tables: BACKUP_TABLES.length,
      total_records: totalRecords,
      table_counts: tableCounts,
      data: tableData
    };

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(JSON.stringify(payload, null, 2));
  } catch (err) {
    console.error('[BACKUP] Gagal mengekspor database:', err);
    return errorResponse(res, `Gagal membuat backup database: ${err.message}`);
  }
}

async function restoreDatabase(req, res, explicitPayload = null) {
  const payload = explicitPayload || req.body || {};
  const pinInput = payload.admin_pin || payload.pin || req?.headers?.['x-admin-pin'];
  const confirmationText = String(payload.confirmation_text || payload.confirm_text || '').trim().toUpperCase();

  if (!pinInput) {
    return res.status(403).json({
      ok: false,
      success: false,
      code: 'ADMIN_PIN_REQUIRED',
      message: 'PIN Otorisasi Owner/Manager diperlukan untuk memulihkan database.',
      error: 'PIN Otorisasi Owner/Manager diperlukan untuk memulihkan database.'
    });
  }

  if (confirmationText !== 'PULIHKAN') {
    return res.status(400).json({
      ok: false,
      success: false,
      code: 'CONFIRMATION_REQUIRED',
      message: 'Ketik kata konfirmasi "PULIHKAN" dengan benar untuk melanjutkan pemulihan.',
      error: 'Ketik kata konfirmasi "PULIHKAN" dengan benar untuk melanjutkan pemulihan.'
    });
  }

  // 1. Verifikasi PIN Owner/Manager
  try {
    const authResult = await db.query(`
      SELECT employee_id, employee_name, role, pin, pin_hash 
      FROM employees 
      WHERE role IN ('owner', 'manager') AND is_active = TRUE
    `);

    let authorizedEmployee = null;
    for (const emp of authResult.rows) {
      const isValid = await verifyAndUpgradePin(emp.employee_id, pinInput, emp.pin, emp.pin_hash);
      if (isValid) {
        authorizedEmployee = emp;
        break;
      }
    }

    if (!authorizedEmployee) {
      return res.status(403).json({
        ok: false,
        success: false,
        code: 'INVALID_ADMIN_PIN',
        message: 'PIN Owner/Manager tidak valid.',
        error: 'PIN Owner/Manager tidak valid.'
      });
    }

    // 2. Validasi Struktur Backup
    const backupContent = payload.backup || payload;
    const backupData = backupContent.data;

    if (!backupData || typeof backupData !== 'object') {
      return res.status(400).json({
        ok: false,
        success: false,
        code: 'INVALID_BACKUP_FORMAT',
        message: 'Format file backup tidak valid. Objek data tabel tidak ditemukan.',
        error: 'Format file backup tidak valid. Objek data tabel tidak ditemukan.'
      });
    }

    // 3. Eksekusi Restore dalam Single Transaction
    const client = await db.pool.connect();
    let restoredTablesCount = 0;
    let restoredRowsCount = 0;

    try {
      await client.query('BEGIN');

      // Matikan foreign key checks sementara (hanya berlaku dalam session transaksi ini)
      try {
        await client.query("SET session_replication_role = 'replica'");
      } catch (replicaErr) {
        console.warn('[RESTORE] Notice session_replication_role:', replicaErr.message);
      }

      // Kosongkan tabel yang ada dalam backup (reverse order)
      const tablesToClear = [...BACKUP_TABLES].reverse();
      for (const tableName of tablesToClear) {
        if (tableName in backupData) {
          await client.query(`TRUNCATE TABLE "${tableName}" CASCADE`);
        }
      }

      // Masukkan data baru sesuai urutan dependensi
      for (const tableName of BACKUP_TABLES) {
        const rows = backupData[tableName];
        if (!Array.isArray(rows) || rows.length === 0) continue;

        restoredTablesCount++;
        for (const row of rows) {
          const keys = Object.keys(row);
          if (keys.length === 0) continue;

          const cols = keys.map(k => `"${k}"`).join(', ');
          const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
          const values = keys.map(k => row[k]);

          await client.query(`INSERT INTO "${tableName}" (${cols}) VALUES (${placeholders})`, values);
          restoredRowsCount++;
        }
      }

      // Kembalikan session_replication_role ke origin
      try {
        await client.query("SET session_replication_role = 'origin'");
      } catch (originErr) {
        console.warn('[RESTORE] Notice resetting session_replication_role:', originErr.message);
      }

      // Reset sequence ID jika ada
      try {
        await client.query(`
          SELECT setval(pg_get_serial_sequence('sync_outbox', 'sync_id'), COALESCE((SELECT MAX(sync_id) FROM sync_outbox), 1));
          SELECT setval(pg_get_serial_sequence('owner_mirror_snapshots', 'snapshot_id'), COALESCE((SELECT MAX(snapshot_id) FROM owner_mirror_snapshots), 1));
        `);
      } catch (seqErr) {
        console.warn('[RESTORE] Notice resetting sequences:', seqErr.message);
      }

      // Catat log pemulihan
      await client.query(`
        INSERT INTO master_data_audit_logs (
          log_id, entity_type, entity_id, entity_name, action_type, old_value_json, new_value_json, changed_by, note, result
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `, [
        `MDA-RESTORE-${Date.now()}`,
        'database',
        process.env.PGDATABASE || 'happy_song_pos',
        'Database Restore',
        'restore_from_backup',
        null,
        JSON.stringify({
          source_backup_created_at: backupContent.created_at || null,
          restored_tables: restoredTablesCount,
          restored_rows: restoredRowsCount
        }),
        authorizedEmployee.employee_name || 'Owner',
        `Pemulihan database dari file backup oleh ${authorizedEmployee.employee_name} (${authorizedEmployee.role})`,
        'success'
      ]);

      await client.query('COMMIT');

      return res.json({
        ok: true,
        success: true,
        message: `Database berhasil dipulihkan sepenuhnya. ${restoredTablesCount} tabel dan ${restoredRowsCount} baris data dimuat ulang.`,
        restored_tables: restoredTablesCount,
        restored_records: restoredRowsCount,
        restored_by: authorizedEmployee.employee_name
      });
    } catch (txErr) {
      await client.query('ROLLBACK');
      console.error('[RESTORE] Gagal memulihkan database (Rollback executed):', txErr);
      return res.status(500).json({
        ok: false,
        success: false,
        error: `Gagal memulihkan database: ${txErr.message}. Seluruh perubahan telah dibatalkan (Rollback).`
      });
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('[RESTORE] Error proses restore:', err);
    return errorResponse(res, `Gagal memproses pemulihan: ${err.message}`);
  }
}

module.exports = {
  BACKUP_TABLES,
  getDatabaseStatus,
  exportDatabase,
  restoreDatabase
};
