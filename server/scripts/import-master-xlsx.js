const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { pool } = require('../src/db');

const MASTER_SHEETS = [
  'Settings',
  'Employees',
  'Rooms',
  'Inventory',
  'Menu',
  'LcMaster',
  'PackageMaster',
  'PackageDetail',
  'PromoMaster',
  'TVDevices',
  'TVDisplays',
];

const ROOM_RATE_FALLBACKS = {
  // Fallback from production Rooms sheet export 2026-08-13.
  // Used only when XLSX parsing returns blank/zero rate_per_hour for a known room.
  'ROOM-001': 125000,
  'ROOM-002': 135000,
  'ROOM-003': 125000,
  'ROOM-004': 135000,
  'ROOM-005': 135000,
  'ROOM-006': 135000,
  'ROOM-007': 125000,
  'ROOM-008': 135000,
  'ROOM-009': 185000,
};

function parseArgs(argv) {
  const args = { dryRun: false, preserveRoomState: false };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--preserve-room-state') args.preserveRoomState = true;
    else if (arg === '--xlsx') {
      args.xlsxPath = argv[i + 1];
      i += 1;
    } else if (!args.xlsxPath) {
      args.xlsxPath = arg;
    }
  }
  return args;
}

function decodeXml(value = '') {
  return String(value)
    .replace(/_x000D_/g, '\n')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function columnIndex(cellRef = '') {
  const letters = String(cellRef).replace(/[^A-Z]/gi, '').toUpperCase();
  let index = 0;
  for (const ch of letters) index = index * 26 + (ch.charCodeAt(0) - 64);
  return Math.max(index - 1, 0);
}

function extractXlsx(xlsxPath) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'happy-song-xlsx-'));
  const ps = [
    'Add-Type -AssemblyName System.IO.Compression.FileSystem',
    '$src=$env:HAPPY_SONG_XLSX_PATH',
    '$dst=$env:HAPPY_SONG_XLSX_TEMP',
    '[System.IO.Compression.ZipFile]::ExtractToDirectory($src,$dst)',
  ].join('; ');

  execFileSync(
    'powershell',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps],
    {
      stdio: 'pipe',
      env: {
        ...process.env,
        HAPPY_SONG_XLSX_PATH: xlsxPath,
        HAPPY_SONG_XLSX_TEMP: tempDir,
      },
    },
  );

  return tempDir;
}

function readSharedStrings(rootDir) {
  const sharedPath = path.join(rootDir, 'xl', 'sharedStrings.xml');
  if (!fs.existsSync(sharedPath)) return [];
  const xml = fs.readFileSync(sharedPath, 'utf8');
  const strings = [];
  for (const match of xml.matchAll(/<si\b[\s\S]*?<\/si>/g)) {
    const text = [...match[0].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)]
      .map((part) => decodeXml(part[1]))
      .join('');
    strings.push(text);
  }
  return strings;
}

function readWorkbookSheets(rootDir) {
  const workbookXml = fs.readFileSync(path.join(rootDir, 'xl', 'workbook.xml'), 'utf8');
  const relsXml = fs.readFileSync(path.join(rootDir, 'xl', '_rels', 'workbook.xml.rels'), 'utf8');
  const rels = new Map();

  for (const match of relsXml.matchAll(/<Relationship\b([^>]*)\/>/g)) {
    const attrs = parseAttributes(match[1]);
    if (attrs.Id && attrs.Target) rels.set(attrs.Id, attrs.Target);
  }

  const sheets = [];
  for (const match of workbookXml.matchAll(/<sheet\b([^>]*)\/>/g)) {
    const attrs = parseAttributes(match[1]);
    const relId = attrs['r:id'];
    const target = rels.get(relId);
    if (!attrs.name || !target) continue;
    sheets.push({
      name: attrs.name,
      file: path.join(rootDir, 'xl', target.replace(/^\//, '').replace(/^xl\//, '')),
    });
  }
  return sheets;
}

function parseAttributes(text = '') {
  const attrs = {};
  for (const match of text.matchAll(/([\w:.-]+)="([^"]*)"/g)) {
    attrs[match[1]] = decodeXml(match[2]);
  }
  return attrs;
}

function cellValue(cellXml, sharedStrings) {
  const attrsMatch = cellXml.match(/^<c\b([^>]*)>/);
  const attrs = parseAttributes(attrsMatch ? attrsMatch[1] : '');
  const valueMatch = cellXml.match(/<v>([\s\S]*?)<\/v>/);
  const inlineMatch = cellXml.match(/<is>[\s\S]*?<t(?:\s[^>]*)?>([\s\S]*?)<\/t>[\s\S]*?<\/is>/);

  if (attrs.t === 's' && valueMatch) {
    const idx = Number(valueMatch[1]);
    return sharedStrings[idx] ?? '';
  }
  if (attrs.t === 'inlineStr' && inlineMatch) return decodeXml(inlineMatch[1]);
  if (valueMatch) return decodeXml(valueMatch[1]);
  return '';
}

function parseSheet(filePath, sharedStrings) {
  const xml = fs.readFileSync(filePath, 'utf8');
  const rowMatches = [...xml.matchAll(/<row\b[^>]*>[\s\S]*?<\/row>/g)];
  const matrix = [];

  for (const rowMatch of rowMatches) {
    const row = [];
    for (const cellMatch of rowMatch[0].matchAll(/<c\b[\s\S]*?<\/c>/g)) {
      const attrsMatch = cellMatch[0].match(/^<c\b([^>]*)>/);
      const attrs = parseAttributes(attrsMatch ? attrsMatch[1] : '');
      row[columnIndex(attrs.r)] = String(cellValue(cellMatch[0], sharedStrings)).trim();
    }
    if (row.some(Boolean)) matrix.push(row.map((value) => value || ''));
  }

  if (matrix.length === 0) return [];
  const headers = matrix[0].map((header) => String(header || '').trim());
  return matrix.slice(1)
    .map((row) => Object.fromEntries(headers.map((header, idx) => [header, row[idx] || ''])))
    .filter((row) => Object.values(row).some((value) => String(value || '').trim()));
}

function loadWorkbook(xlsxPath) {
  const rootDir = extractXlsx(xlsxPath);
  try {
    const sharedStrings = readSharedStrings(rootDir);
    const sheets = readWorkbookSheets(rootDir);
    const workbook = {};
    for (const sheet of sheets) {
      workbook[sheet.name] = parseSheet(sheet.file, sharedStrings);
    }
    return workbook;
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
}

function firstNonEmpty(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== '') return String(value).trim();
  }
  return '';
}

function numberValue(value, fallback = 0) {
  const cleaned = String(value ?? '').trim().replace(/\s/g, '').replace(/,/g, '');
  if (!cleaned) return fallback;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function intValue(value, fallback = 0) {
  return Math.round(numberValue(value, fallback));
}

function boolValue(value, fallback = true) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!normalized) return fallback;
  return ['1', 'true', 'yes', 'y', 'active', 'aktif'].includes(normalized);
}

function statusValue(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  return ['inactive', 'nonactive', 'nonaktif', 'disabled'].includes(normalized) ? 'inactive' : 'active';
}

function pinValue(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const parsed = Number(raw);
  if (Number.isFinite(parsed)) return parsed.toFixed(0);
  return raw.replace(/\.0$/, '');
}

function roleValue(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === 'owner') return 'owner';
  if (normalized === 'manager' || normalized === 'admin') return 'manager';
  if (normalized === 'receptionist' || normalized === 'resepsionis') return 'receptionist';
  return 'cashier';
}

function safeRoomStatus(value, preserveRoomState) {
  if (!preserveRoomState) return 'available';
  const normalized = String(value ?? '').trim().toLowerCase();
  return ['available', 'paid_waiting_start', 'occupied', 'cleaning', 'maintenance'].includes(normalized)
    ? normalized
    : 'available';
}

function normalizeRoomRef(rawRoomId, tvDeviceId, roomRows) {
  const raw = String(rawRoomId ?? '').trim();
  const exact = roomRows.find((room) => room.room_id === raw);
  if (exact) return raw;

  const byTv = roomRows.find((room) => room.tv_device_id && room.tv_device_id === tvDeviceId);
  if (byTv) return byTv.room_id;

  const digitMatch = raw.match(/(\d+)/);
  if (digitMatch) {
    const roomId = `ROOM-${digitMatch[1].padStart(3, '0')}`;
    if (roomRows.some((room) => room.room_id === roomId)) return roomId;
  }

  return null;
}

function buildMasterData(workbook, options) {
  const settings = (workbook.Settings || []).filter((row) => firstNonEmpty(row.key));

  const employees = (workbook.Employees || [])
    .filter((row) => firstNonEmpty(row.employee_id, row.employee_name))
    .map((row) => ({
      employee_id: firstNonEmpty(row.employee_id),
      employee_name: firstNonEmpty(row.employee_name, 'Staff'),
      role: roleValue(row.role),
      pin: pinValue(row.pin),
      salary_type: ['daily', 'monthly', 'hourly'].includes(String(row.salary_type || '').toLowerCase())
        ? String(row.salary_type).toLowerCase()
        : 'monthly',
      base_salary: numberValue(row.base_salary, 0),
      is_active: boolValue(firstNonEmpty(row.is_active, row.status), true),
    }));

  const rooms = (workbook.Rooms || [])
    .filter((row) => firstNonEmpty(row.room_id, row.room_name))
    .map((row) => {
      const roomId = firstNonEmpty(row.room_id);
      const parsedRate = numberValue(row.rate_per_hour, 0);
      return {
        room_id: roomId,
        room_name: firstNonEmpty(row.room_name),
        status: safeRoomStatus(row.status, options.preserveRoomState),
        rate_per_hour: parsedRate > 0 ? parsedRate : (ROOM_RATE_FALLBACKS[roomId] || 0),
        tv_device_id: firstNonEmpty(row.tv_device_id) || null,
      };
    });

  const inventory = (workbook.Inventory || [])
    .filter((row) => firstNonEmpty(row.stock_item_id, row.item_id, row.stock_item_name, row.item_name))
    .map((row) => ({
      stock_item_id: firstNonEmpty(row.stock_item_id, row.item_id),
      stock_item_name: firstNonEmpty(row.stock_item_name, row.item_name),
      category: firstNonEmpty(row.category, 'General'),
      unit: firstNonEmpty(row.unit, 'pcs'),
      stock_qty: numberValue(row.stock_qty, 0),
      min_stock: numberValue(row.min_stock, 0),
      status: statusValue(row.status),
    }));

  const menu = (workbook.Menu || [])
    .filter((row) => firstNonEmpty(row.menu_id, row.menu_name))
    .map((row) => ({
      menu_id: firstNonEmpty(row.menu_id),
      menu_name: firstNonEmpty(row.menu_name),
      category: firstNonEmpty(row.category, 'General'),
      price: numberValue(firstNonEmpty(row.price, row.selling_price), 0),
      status: statusValue(row.status || row.is_active),
      stock_tracking: String(firstNonEmpty(row.stock_tracking, 'no')).toLowerCase() === 'yes' ? 'yes' : 'no',
      stock_item_id: firstNonEmpty(row.stock_item_id) || null,
      stock_qty_per_unit: numberValue(row.stock_qty_per_unit, 1),
      bonus_sales_lc: numberValue(row.bonus_sales_lc, 0),
      hpp: numberValue(row.hpp, 0),
      variable_cost_rate: numberValue(row.variable_cost_rate, 0),
    }));

  const lcMaster = (workbook.LcMaster || [])
    .filter((row) => firstNonEmpty(row.lc_id, row.lc_name))
    .map((row) => ({
      lc_id: firstNonEmpty(row.lc_id),
      lc_name: firstNonEmpty(row.lc_name),
      rate_per_hour: numberValue(firstNonEmpty(row.rate_per_hour, row.rate_per_room), 0),
      status: statusValue(row.status),
    }));

  const packages = (workbook.PackageMaster || [])
    .filter((row) => firstNonEmpty(row.package_id, row.package_name))
    .map((row) => ({
      package_id: firstNonEmpty(row.package_id),
      package_name: firstNonEmpty(row.package_name),
      package_category: firstNonEmpty(row.package_category, 'Package'),
      package_type: firstNonEmpty(row.package_type, 'room_fnb_bundle'),
      selling_price: numberValue(row.selling_price, 0),
      duration_minutes: intValue(row.duration_minutes, 0),
      valid_day_type: ['all', 'weekday', 'weekend'].includes(String(row.valid_day_type || '').toLowerCase())
        ? String(row.valid_day_type).toLowerCase()
        : 'all',
      status: statusValue(row.status),
    }));

  const packageDetails = (workbook.PackageDetail || [])
    .filter((row) => firstNonEmpty(row.package_detail_id, row.package_id))
    .map((row, idx) => ({
      package_detail_id: firstNonEmpty(row.package_detail_id, `${firstNonEmpty(row.package_id)}-D${idx + 1}`),
      package_id: firstNonEmpty(row.package_id),
      line_no: intValue(row.line_no, idx + 1),
      component_type: ['service', 'inventory', 'menu'].includes(String(row.component_type || '').toLowerCase())
        ? String(row.component_type).toLowerCase()
        : 'service',
      component_ref_id: firstNonEmpty(row.component_ref_id, 'SERVICE'),
      component_name: firstNonEmpty(row.component_name, 'Service'),
      qty: numberValue(row.qty, 1),
      unit: firstNonEmpty(row.unit, 'unit'),
      hpp: numberValue(row.hpp, 0),
      additional_price: numberValue(row.additional_price, 0),
      cost_amount: numberValue(row.cost_amount, 0),
      is_choice: boolValue(row.is_choice, false),
      choice_group: firstNonEmpty(row.choice_group) || null,
      note: firstNonEmpty(row.note) || null,
    }));

  const promos = (workbook.PromoMaster || [])
    .filter((row) => firstNonEmpty(row.code))
    .map((row) => ({
      promo_code: firstNonEmpty(row.code),
      promo_name: firstNonEmpty(row.code),
      discount_type: ['percentage', 'fixed'].includes(String(row.discount_type || '').toLowerCase())
        ? String(row.discount_type).toLowerCase()
        : 'fixed',
      discount_value: numberValue(row.discount_value, 0),
      is_active: boolValue(row.status, true),
      created_at: firstNonEmpty(row.created_at) || null,
    }));

  const tvDevices = (workbook.TVDevices || [])
    .filter((row) => firstNonEmpty(row.tv_device_id))
    .map((row) => ({
      tv_device_id: firstNonEmpty(row.tv_device_id),
      room_id: normalizeRoomRef(row.room_id, firstNonEmpty(row.tv_device_id), rooms),
      device_name: firstNonEmpty(row.device_name, 'TV Controller'),
      control_type: ['mock', 'middleware', 'home_assistant', 'manual'].includes(String(row.control_type || '').toLowerCase())
        ? String(row.control_type).toLowerCase()
        : 'mock',
      status: statusValue(row.status),
      middleware_url: firstNonEmpty(row.middleware_url) || null,
      device_identifier: firstNonEmpty(row.device_identifier) || null,
    }));

  const tvDisplays = (workbook.TVDisplays || [])
    .filter((row) => firstNonEmpty(row.display_id, row.room_id, row.display_token))
    .map((row) => ({
      display_id: firstNonEmpty(row.display_id),
      room_id: normalizeRoomRef(row.room_id, '', rooms),
      display_name: firstNonEmpty(row.display_name, 'Room Display'),
      display_token: firstNonEmpty(row.display_token),
      display_enabled: boolValue(row.display_enabled, true),
      refresh_interval_seconds: intValue(row.refresh_interval_seconds, 30),
      notes: firstNonEmpty(row.notes) || null,
    }))
    .filter((row) => row.room_id);

  return { settings, employees, rooms, inventory, menu, lcMaster, packages, packageDetails, promos, tvDevices, tvDisplays };
}

async function upsertMasterData(masterData) {
  const client = await pool.connect();
  const counts = {};
  try {
    await client.query('BEGIN');

    for (const row of masterData.settings) {
      await client.query(`
        INSERT INTO settings (key, value, description)
        VALUES ($1, $2, $3)
        ON CONFLICT (key) DO UPDATE SET
          value = EXCLUDED.value,
          description = EXCLUDED.description,
          updated_at = CURRENT_TIMESTAMP
      `, [row.key, row.value || '', row.description || '']);
    }
    counts.settings = masterData.settings.length;

    for (const row of masterData.employees) {
      await client.query(`
        INSERT INTO employees (employee_id, employee_name, role, pin, salary_type, base_salary, is_active)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (employee_id) DO UPDATE SET
          employee_name = EXCLUDED.employee_name,
          role = EXCLUDED.role,
          pin = COALESCE(NULLIF(EXCLUDED.pin, ''), employees.pin),
          salary_type = EXCLUDED.salary_type,
          base_salary = EXCLUDED.base_salary,
          is_active = EXCLUDED.is_active,
          updated_at = CURRENT_TIMESTAMP
      `, [row.employee_id, row.employee_name, row.role, row.pin, row.salary_type, row.base_salary, row.is_active]);
    }
    counts.employees = masterData.employees.length;

    for (const row of masterData.rooms) {
      await client.query(`
        INSERT INTO rooms (room_id, room_name, status, start_time, booked_duration_minutes, scheduled_end_time, rate_per_hour, tv_device_id)
        VALUES ($1, $2, $3, NULL, 0, NULL, $4, $5)
        ON CONFLICT (room_id) DO UPDATE SET
          room_name = EXCLUDED.room_name,
          status = EXCLUDED.status,
          start_time = NULL,
          booked_duration_minutes = 0,
          scheduled_end_time = NULL,
          rate_per_hour = EXCLUDED.rate_per_hour,
          tv_device_id = EXCLUDED.tv_device_id,
          updated_at = CURRENT_TIMESTAMP
      `, [row.room_id, row.room_name, row.status, row.rate_per_hour, row.tv_device_id]);
    }
    counts.rooms = masterData.rooms.length;

    for (const row of masterData.inventory) {
      await client.query(`
        INSERT INTO inventory (stock_item_id, stock_item_name, category, unit, stock_qty, min_stock, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (stock_item_id) DO UPDATE SET
          stock_item_name = EXCLUDED.stock_item_name,
          category = EXCLUDED.category,
          unit = EXCLUDED.unit,
          stock_qty = EXCLUDED.stock_qty,
          min_stock = EXCLUDED.min_stock,
          status = EXCLUDED.status,
          updated_at = CURRENT_TIMESTAMP
      `, [row.stock_item_id, row.stock_item_name, row.category, row.unit, row.stock_qty, row.min_stock, row.status]);
    }
    counts.inventory = masterData.inventory.length;

    for (const row of masterData.menu) {
      await client.query(`
        INSERT INTO menu (menu_id, menu_name, category, price, status, stock_tracking, stock_item_id, stock_qty_per_unit, bonus_sales_lc, hpp, variable_cost_rate)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (menu_id) DO UPDATE SET
          menu_name = EXCLUDED.menu_name,
          category = EXCLUDED.category,
          price = EXCLUDED.price,
          status = EXCLUDED.status,
          stock_tracking = EXCLUDED.stock_tracking,
          stock_item_id = EXCLUDED.stock_item_id,
          stock_qty_per_unit = EXCLUDED.stock_qty_per_unit,
          bonus_sales_lc = EXCLUDED.bonus_sales_lc,
          hpp = EXCLUDED.hpp,
          variable_cost_rate = EXCLUDED.variable_cost_rate,
          updated_at = CURRENT_TIMESTAMP
      `, [row.menu_id, row.menu_name, row.category, row.price, row.status, row.stock_tracking, row.stock_item_id, row.stock_qty_per_unit, row.bonus_sales_lc, row.hpp, row.variable_cost_rate]);
    }
    counts.menu = masterData.menu.length;

    for (const row of masterData.lcMaster) {
      await client.query(`
        INSERT INTO lc_master (lc_id, lc_name, rate_per_hour, status)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (lc_id) DO UPDATE SET
          lc_name = EXCLUDED.lc_name,
          rate_per_hour = EXCLUDED.rate_per_hour,
          status = EXCLUDED.status,
          updated_at = CURRENT_TIMESTAMP
      `, [row.lc_id, row.lc_name, row.rate_per_hour, row.status]);
    }
    counts.lc_master = masterData.lcMaster.length;

    for (const row of masterData.packages) {
      await client.query(`
        INSERT INTO package_master (package_id, package_name, package_category, package_type, selling_price, duration_minutes, valid_day_type, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (package_id) DO UPDATE SET
          package_name = EXCLUDED.package_name,
          package_category = EXCLUDED.package_category,
          package_type = EXCLUDED.package_type,
          selling_price = EXCLUDED.selling_price,
          duration_minutes = EXCLUDED.duration_minutes,
          valid_day_type = EXCLUDED.valid_day_type,
          status = EXCLUDED.status,
          updated_at = CURRENT_TIMESTAMP
      `, [row.package_id, row.package_name, row.package_category, row.package_type, row.selling_price, row.duration_minutes, row.valid_day_type, row.status]);
    }
    counts.package_master = masterData.packages.length;

    for (const row of masterData.packageDetails) {
      await client.query(`
        INSERT INTO package_details (package_detail_id, package_id, line_no, component_type, component_ref_id, component_name, qty, unit, hpp, additional_price, cost_amount, is_choice, choice_group, note)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        ON CONFLICT (package_detail_id) DO UPDATE SET
          package_id = EXCLUDED.package_id,
          line_no = EXCLUDED.line_no,
          component_type = EXCLUDED.component_type,
          component_ref_id = EXCLUDED.component_ref_id,
          component_name = EXCLUDED.component_name,
          qty = EXCLUDED.qty,
          unit = EXCLUDED.unit,
          hpp = EXCLUDED.hpp,
          additional_price = EXCLUDED.additional_price,
          cost_amount = EXCLUDED.cost_amount,
          is_choice = EXCLUDED.is_choice,
          choice_group = EXCLUDED.choice_group,
          note = EXCLUDED.note
      `, [row.package_detail_id, row.package_id, row.line_no, row.component_type, row.component_ref_id, row.component_name, row.qty, row.unit, row.hpp, row.additional_price, row.cost_amount, row.is_choice, row.choice_group, row.note]);
    }
    counts.package_details = masterData.packageDetails.length;

    for (const row of masterData.promos) {
      await client.query(`
        INSERT INTO promos (promo_code, promo_name, discount_type, discount_value, is_active, created_at)
        VALUES ($1, $2, $3, $4, $5, COALESCE($6::timestamptz, CURRENT_TIMESTAMP))
        ON CONFLICT (promo_code) DO UPDATE SET
          promo_name = EXCLUDED.promo_name,
          discount_type = EXCLUDED.discount_type,
          discount_value = EXCLUDED.discount_value,
          is_active = EXCLUDED.is_active
      `, [row.promo_code, row.promo_name, row.discount_type, row.discount_value, row.is_active, row.created_at]);
    }
    counts.promos = masterData.promos.length;

    for (const row of masterData.tvDevices) {
      await client.query(`
        INSERT INTO tv_devices (tv_device_id, room_id, device_name, control_type, status, middleware_url, device_identifier)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (tv_device_id) DO UPDATE SET
          room_id = EXCLUDED.room_id,
          device_name = EXCLUDED.device_name,
          control_type = EXCLUDED.control_type,
          status = EXCLUDED.status,
          middleware_url = EXCLUDED.middleware_url,
          device_identifier = EXCLUDED.device_identifier,
          updated_at = CURRENT_TIMESTAMP
      `, [row.tv_device_id, row.room_id, row.device_name, row.control_type, row.status, row.middleware_url, row.device_identifier]);
    }
    counts.tv_devices = masterData.tvDevices.length;

    for (const row of masterData.tvDisplays) {
      await client.query(`
        INSERT INTO tv_displays (display_id, room_id, display_name, display_token, display_enabled, refresh_interval_seconds, notes)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (display_id) DO UPDATE SET
          room_id = EXCLUDED.room_id,
          display_name = EXCLUDED.display_name,
          display_token = EXCLUDED.display_token,
          display_enabled = EXCLUDED.display_enabled,
          refresh_interval_seconds = EXCLUDED.refresh_interval_seconds,
          notes = EXCLUDED.notes,
          updated_at = CURRENT_TIMESTAMP
      `, [row.display_id, row.room_id, row.display_name, row.display_token, row.display_enabled, row.refresh_interval_seconds, row.notes]);
    }
    counts.tv_displays = masterData.tvDisplays.length;

    await client.query('COMMIT');
    return counts;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

function printPlan(workbook, masterData) {
  console.log('Safe master import plan');
  console.log('---------------------------------------------------------');
  for (const sheet of MASTER_SHEETS) {
    const rows = workbook[sheet] || [];
    console.log(`${sheet.padEnd(16)} source rows: ${String(rows.length).padStart(4)}`);
  }
  console.log('---------------------------------------------------------');
  const planned = {
    settings: masterData.settings.length,
    employees: masterData.employees.length,
    rooms: masterData.rooms.length,
    inventory: masterData.inventory.length,
    menu: masterData.menu.length,
    lc_master: masterData.lcMaster.length,
    package_master: masterData.packages.length,
    package_details: masterData.packageDetails.length,
    promos: masterData.promos.length,
    tv_devices: masterData.tvDevices.length,
    tv_displays: masterData.tvDisplays.length,
  };
  for (const [name, count] of Object.entries(planned)) {
    console.log(`${name.padEnd(16)} import rows: ${String(count).padStart(4)}`);
  }
  console.log('---------------------------------------------------------');
  console.log('Skipped by design: Transactions, FnbOrders, FnbOrderItems, StockMovements, DeletedTransactions, RoomSessions, LC logs, cashier closings, audit logs.');
}

async function main() {
  const options = parseArgs(process.argv);
  if (!options.xlsxPath) {
    throw new Error('Usage: npm run db:import-master-xlsx -- "C:\\path\\Karaoke POS Database.xlsx" [-- --dry-run]');
  }

  const xlsxPath = path.resolve(options.xlsxPath);
  if (!fs.existsSync(xlsxPath)) throw new Error(`Excel file not found: ${xlsxPath}`);

  const workbook = loadWorkbook(xlsxPath);
  const masterData = buildMasterData(workbook, options);
  printPlan(workbook, masterData);

  if (options.dryRun) {
    console.log('DRY RUN ONLY - no database changes were made.');
    return;
  }

  const counts = await upsertMasterData(masterData);
  console.log('Master data import completed successfully.');
  console.log(JSON.stringify(counts, null, 2));
}

main()
  .catch((err) => {
    console.error('Master data import failed:', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end().catch(() => {});
  });
