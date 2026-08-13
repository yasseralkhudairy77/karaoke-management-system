const fs = require('fs');
const path = require('path');
const { pool } = require('../src/db');

function parseCSV(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const content = fs.readFileSync(filePath, 'utf8').trim();
  if (!content) return [];

  const lines = content.split(/\r?\n/);
  if (lines.length <= 1) return [];

  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
    const row = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] !== undefined ? values[idx] : '';
    });
    rows.push(row);
  }

  return rows;
}

async function migrate() {
  console.log('🚀 Starting Data Migration (Spreadsheet Template -> PostgreSQL Local)...');
  const templateDir = path.join(__dirname, '../../spreadsheet-template');
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Settings
    const settings = parseCSV(path.join(templateDir, 'Settings.csv'));
    console.log(`Importing ${settings.length} Settings records...`);
    for (const s of settings) {
      if (!s.key) continue;
      await client.query(`
        INSERT INTO settings (key, value, description)
        VALUES ($1, $2, $3)
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, description = EXCLUDED.description
      `, [s.key, s.value || '', s.description || '']);
    }

    // 2. Employees
    const employees = parseCSV(path.join(templateDir, 'Employees.csv'));
    console.log(`Importing ${employees.length} Employees records...`);
    for (const e of employees) {
      if (!e.employee_id) continue;
      await client.query(`
        INSERT INTO employees (employee_id, employee_name, role, salary_type, base_salary, is_active)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (employee_id) DO UPDATE SET 
          employee_name = EXCLUDED.employee_name, 
          role = EXCLUDED.role, 
          base_salary = EXCLUDED.base_salary
      `, [
        e.employee_id,
        e.employee_name || 'Staff',
        (e.role || 'cashier').toLowerCase(),
        e.salary_type || 'monthly',
        Number(e.base_salary || 0),
        e.is_active === 'TRUE' || e.is_active === 'true'
      ]);
    }

    // 3. Rooms
    const rooms = parseCSV(path.join(templateDir, 'Rooms.csv'));
    console.log(`Importing ${rooms.length} Rooms records...`);
    for (const r of rooms) {
      if (!r.room_id) continue;
      await client.query(`
        INSERT INTO rooms (room_id, room_name, status, rate_per_hour, tv_device_id)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (room_id) DO UPDATE SET 
          room_name = EXCLUDED.room_name, 
          rate_per_hour = EXCLUDED.rate_per_hour,
          tv_device_id = EXCLUDED.tv_device_id
      `, [
        r.room_id,
        r.room_name,
        r.status || 'available',
        Number(r.rate_per_hour || 0),
        r.tv_device_id || null
      ]);
    }

    // 4. Inventory
    const inventory = parseCSV(path.join(templateDir, 'Inventory.csv'));
    console.log(`Importing ${inventory.length} Inventory records...`);
    for (const i of inventory) {
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
        id,
        name,
        i.category || 'General',
        i.unit || 'pcs',
        Number(i.stock_qty || 0),
        Number(i.min_stock || 0),
        i.status || 'active'
      ]);
    }

    // 5. Menu
    const menu = parseCSV(path.join(templateDir, 'Menu.csv'));
    console.log(`Importing ${menu.length} Menu records...`);
    for (const m of menu) {
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
        m.menu_id,
        m.menu_name,
        m.category || 'Makanan',
        Number(m.price || 0),
        m.status || 'active',
        m.stock_tracking || 'no',
        m.stock_item_id || null,
        Number(m.stock_qty_per_unit || 1),
        Number(m.bonus_sales_lc || 0),
        Number(m.hpp || 0),
        Number(m.variable_cost_rate || 0)
      ]);
    }

    // 6. TV Devices
    const tvDevices = parseCSV(path.join(templateDir, 'TVDevices.csv'));
    console.log(`Importing ${tvDevices.length} TVDevices records...`);
    for (const tv of tvDevices) {
      if (!tv.tv_device_id) continue;
      await client.query(`
        INSERT INTO tv_devices (tv_device_id, room_id, device_name, control_type, status, middleware_url)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (tv_device_id) DO UPDATE SET 
          room_id = EXCLUDED.room_id,
          control_type = EXCLUDED.control_type,
          middleware_url = EXCLUDED.middleware_url
      `, [
        tv.tv_device_id,
        tv.room_id || null,
        tv.device_name || 'TV Controller',
        tv.control_type || 'mock',
        tv.status || 'active',
        tv.middleware_url || null
      ]);
    }

    await client.query('COMMIT');
    console.log('✅ Baseline Data Migration Completed Successfully!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Migration Failed:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
