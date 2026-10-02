const crypto = require('crypto');
const db = require('../db');

/**
 * Node.js Crypto scrypt helper for PIN hashing
 */
function hashPin(pin, salt = 'happysong_pos_salt_2026') {
  if (!pin) return '';
  const derivedKey = crypto.scryptSync(String(pin), salt, 64);
  return derivedKey.toString('hex');
}

/**
 * Verify PIN against stored pin_hash or legacy plain text pin.
 * Automatically upgrades legacy plain text PIN to pin_hash in PostgreSQL.
 */
async function verifyAndUpgradePin(employeeId, pinInput, storedPin, storedPinHash) {
  if (!pinInput) return false;

  const inputHash = hashPin(pinInput);

  // 1. Check against pin_hash if set
  if (storedPinHash) {
    return storedPinHash === inputHash;
  }

  // 2. Fallback check legacy plain text pin
  if (storedPin && String(storedPin).trim() === String(pinInput).trim()) {
    // Automatically upgrade to hashed PIN in database!
    try {
      await db.query(
        'UPDATE employees SET pin_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE employee_id = $2',
        [inputHash, employeeId]
      );
      console.log(`🔒 Upgraded legacy plain text PIN to hashed PIN for employee: ${employeeId}`);
    } catch (err) {
      console.error('Failed to auto-upgrade PIN hash:', err.message);
    }
    return true;
  }

  return false;
}

/**
 * Middleware to verify Admin/Manager/Owner authorization PIN
 */
async function requireAdminPin(req, res, next) {
  const pin = req.body?.admin_pin || req.body?.pin || req.headers['x-admin-pin'];
  if (!pin) {
    return res.status(403).json({
      ok: false,
      success: false,
      code: 'ADMIN_PIN_REQUIRED',
      message: 'Otorisasi PIN Admin/Manager diperlukan.',
      error: 'Otorisasi PIN Admin/Manager diperlukan.'
    });
  }

  try {
    const result = await db.query(`
      SELECT employee_id, employee_name, role, pin, pin_hash 
      FROM employees 
      WHERE role IN ('owner', 'manager') AND is_active = TRUE
    `);

    let valid = false;
    let matchedEmp = null;

    for (const emp of result.rows) {
      const isValid = await verifyAndUpgradePin(emp.employee_id, pin, emp.pin, emp.pin_hash);
      if (isValid) {
        valid = true;
        matchedEmp = emp;
        break;
      }
    }

    if (!valid) {
      return res.status(403).json({
        ok: false,
        success: false,
        code: 'INVALID_ADMIN_PIN',
        message: 'PIN Manager/Owner tidak valid.',
        error: 'PIN Manager/Owner tidak valid.'
      });
    }

    req.authEmployee = matchedEmp;
    next();
  } catch (err) {
    return res.status(500).json({ ok: false, success: false, error: err.message });
  }
}

module.exports = {
  hashPin,
  verifyAndUpgradePin,
  requireAdminPin
};
