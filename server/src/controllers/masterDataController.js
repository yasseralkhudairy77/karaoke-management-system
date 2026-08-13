const db = require('../db');
const { successResponse, errorResponse } = require('../utils/response');

async function getEmployees(req, res) {
  try {
    const result = await db.query('SELECT employee_id, employee_name, role, salary_type, base_salary, is_active FROM employees ORDER BY employee_name ASC');
    return res.json({ ok: true, success: true, employees: result.rows });
  } catch (err) {
    return errorResponse(res, err.message);
  }
}

async function validateAdminPin(req, res, payload) {
  try {
    const { pin } = payload;
    if (!pin) throw new Error('PIN wajib diisi.');

    const result = await db.query(`
      SELECT employee_name, role FROM employees 
      WHERE pin = $1 AND role IN ('owner', 'manager') AND is_active = TRUE
    `, [pin]);

    if (result.rowCount === 0) {
      return errorResponse(res, 'PIN Manager/Owner tidak valid.', 'INVALID_ADMIN_PIN');
    }

    const emp = result.rows[0];
    return successResponse(res, {
      message: 'PIN terverifikasi.',
      validated: true,
      employee_name: emp.employee_name,
      role: emp.role
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

async function getPromos(req, res) {
  try {
    const result = await db.query('SELECT * FROM promos WHERE is_active = TRUE ORDER BY promo_code ASC');
    return res.json({ ok: true, success: true, promos: result.rows });
  } catch (err) {
    return errorResponse(res, err.message);
  }
}

module.exports = {
  getEmployees,
  validateAdminPin,
  getPackages,
  getPromos,
};
