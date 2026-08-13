const fs = require('fs');
const path = require('path');
const { pool } = require('../src/db');

function parseNum(val) {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  const cleaned = String(val).replace(/[^0-9.-]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

function parseBool(val) {
  if (typeof val === 'boolean') return val;
  const s = String(val).trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'yes';
}

function parseDateIso(val) {
  if (!val) return null;
  const dt = new Date(val);
  return isNaN(dt.getTime()) ? null : dt.toISOString();
}

async function importProductionData(sourceJsonPath) {
  console.log(`🚀 Starting Robust Production Import from: ${sourceJsonPath}`);
  if (!fs.existsSync(sourceJsonPath)) {
    console.error(`❌ Source file not found: ${sourceJsonPath}`);
    return;
  }

  const dump = JSON.parse(fs.readFileSync(sourceJsonPath, 'utf8'));
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Settings
    if (Array.isArray(dump.Settings)) {
      console.log(`Importing ${dump.Settings.length} Settings...`);
      for (const s of dump.Settings) {
        if (!s.key) continue;
        await client.query(`
          INSERT INTO settings (key, value, description)
          VALUES ($1, $2, $3)
          ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, description = EXCLUDED.description
        `, [String(s.key).trim(), String(s.value || ''), String(s.description || '')]);
      }
    }

    // 2. Employees
    if (Array.isArray(dump.Employees)) {
      console.log(`Importing ${dump.Employees.length} Employees...`);
      for (const e of dump.Employees) {
        if (!e.employee_id) continue;
        await client.query(`
          INSERT INTO employees (employee_id, employee_name, role, pin, salary_type, base_salary, is_active)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (employee_id) DO UPDATE SET 
            employee_name = EXCLUDED.employee_name, 
            role = EXCLUDED.role, 
            pin = EXCLUDED.pin,
            base_salary = EXCLUDED.base_salary
        `, [
          String(e.employee_id).trim(),
          String(e.employee_name || 'Staf').trim(),
          String(e.role || 'cashier').trim().toLowerCase(),
          String(e.pin || ''),
          String(e.salary_type || 'monthly'),
          parseNum(e.base_salary),
          parseBool(e.is_active)
        ]);
      }
    }

    // 3. Rooms
    if (Array.isArray(dump.Rooms)) {
      console.log(`Importing ${dump.Rooms.length} Rooms...`);
      for (const r of dump.Rooms) {
        if (!r.room_id) continue;
        await client.query(`
          INSERT INTO rooms (
            room_id, room_name, status, start_time, 
            booked_duration_minutes, scheduled_end_time, rate_per_hour, tv_device_id
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (room_id) DO UPDATE SET 
            room_name = EXCLUDED.room_name, 
            status = EXCLUDED.status,
            rate_per_hour = EXCLUDED.rate_per_hour
        `, [
          String(r.room_id).trim(),
          String(r.room_name || '').trim(),
          String(r.status || 'available').trim().toLowerCase(),
          parseDateIso(r.start_time),
          parseNum(r.booked_duration_minutes),
          parseDateIso(r.scheduled_end_time),
          parseNum(r.rate_per_hour),
          r.tv_device_id ? String(r.tv_device_id).trim() : null
        ]);
      }
    }

    // 4. Inventory
    if (Array.isArray(dump.Inventory)) {
      console.log(`Importing ${dump.Inventory.length} Inventory items...`);
      for (const i of dump.Inventory) {
        const id = i.stock_item_id || i.item_id;
        const name = i.stock_item_name || i.item_name;
        if (!id || !name) continue;

        await client.query(`
          INSERT INTO inventory (stock_item_id, stock_item_name, category, unit, stock_qty, min_stock, status)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (stock_item_id) DO UPDATE SET 
            stock_item_name = EXCLUDED.stock_item_name, 
            stock_qty = EXCLUDED.stock_qty,
            min_stock = EXCLUDED.min_stock
        `, [
          String(id).trim(),
          String(name).trim(),
          String(i.category || 'General').trim(),
          String(i.unit || 'pcs').trim(),
          parseNum(i.stock_qty),
          parseNum(i.min_stock),
          String(i.status || 'active').trim().toLowerCase()
        ]);
      }
    }

    // 5. Menu
    if (Array.isArray(dump.Menu)) {
      console.log(`Importing ${dump.Menu.length} Menu items...`);
      for (const m of dump.Menu) {
        if (!m.menu_id) continue;
        await client.query(`
          INSERT INTO menu (
            menu_id, menu_name, category, price, status, 
            stock_tracking, stock_item_id, stock_qty_per_unit, bonus_sales_lc, hpp, variable_cost_rate
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          ON CONFLICT (menu_id) DO UPDATE SET 
            menu_name = EXCLUDED.menu_name, 
            price = EXCLUDED.price,
            hpp = EXCLUDED.hpp
        `, [
          String(m.menu_id).trim(),
          String(m.menu_name || '').trim(),
          String(m.category || 'Makanan').trim(),
          parseNum(m.price),
          String(m.status || 'active').trim().toLowerCase(),
          String(m.stock_tracking || 'no').trim().toLowerCase(),
          m.stock_item_id ? String(m.stock_item_id).trim() : null,
          parseNum(m.stock_qty_per_unit || 1),
          parseNum(m.bonus_sales_lc),
          parseNum(m.hpp),
          parseNum(m.variable_cost_rate)
        ]);
      }
    }

    // 6. Transactions
    if (Array.isArray(dump.Transactions)) {
      console.log(`Importing ${dump.Transactions.length} Transactions...`);
      for (const t of dump.Transactions) {
        if (!t.transaction_id) continue;
        const opDate = t.operational_date ? t.operational_date : (t.created_at ? t.created_at.split('T')[0] : '2026-06-20');

        await client.query(`
          INSERT INTO transactions (
            transaction_id, room_id, room_name, start_time, end_time,
            duration_minutes, rate_per_hour, room_total, fnb_total, lc_total,
            grand_total, fnb_order_ids, payment_method, payment_status, cashier_name, operational_date
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
          ON CONFLICT (transaction_id) DO UPDATE SET 
            payment_status = EXCLUDED.payment_status,
            payment_method = EXCLUDED.payment_method,
            grand_total = EXCLUDED.grand_total
        `, [
          String(t.transaction_id).trim(),
          String(t.room_id || '').trim(),
          String(t.room_name || '').trim(),
          parseDateIso(t.start_time) || new Date().toISOString(),
          parseDateIso(t.end_time) || new Date().toISOString(),
          parseNum(t.duration_minutes),
          parseNum(t.rate_per_hour),
          parseNum(t.room_total),
          parseNum(t.fnb_total),
          parseNum(t.lc_total),
          parseNum(t.grand_total),
          String(t.fnb_order_ids || ''),
          String(t.payment_method || 'cash').trim().toLowerCase(),
          String(t.payment_status || 'unpaid').trim().toLowerCase(),
          String(t.cashier_name || 'Kasir').trim(),
          opDate
        ]);
      }
    }

    await client.query('COMMIT');
    console.log('✅ Robust Production Data Import Finished Successfully!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Production Import Failed:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

if (require.main === module) {
  const dumpPath = process.argv[2] || path.join(__dirname, '../../backups/production_dump.json');
  importProductionData(dumpPath);
}

module.exports = importProductionData;
