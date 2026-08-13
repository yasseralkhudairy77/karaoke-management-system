const db = require('../db');
const http = require('http');
const crypto = require('crypto');
const { successResponse, errorResponse } = require('../utils/response');

async function getTvDevices(req, res) {
  try {
    const result = await db.query('SELECT * FROM tv_devices ORDER BY room_id ASC');
    const devices = result.rows.map(d => ({
      tv_device_id: d.tv_device_id,
      room_id: d.room_id,
      device_name: d.device_name,
      control_type: d.control_type,
      status: d.status,
      middleware_url: d.middleware_url || '',
      device_identifier: d.device_identifier || '',
      updated_at: d.updated_at ? new Date(d.updated_at).toISOString() : ''
    }));

    return res.json({ ok: true, success: true, tv_devices: devices });
  } catch (err) {
    return errorResponse(res, err.message);
  }
}

async function getTvControlLogs(req, res) {
  try {
    const { room_id, tv_device_id } = req.query;
    const limit = Math.min(Math.max(parseInt(req.query.limit || '100', 10), 1), 500);
    const params = [];
    const filters = [];

    if (room_id) {
      params.push(room_id);
      filters.push(`room_id = $${params.length}`);
    }
    if (tv_device_id) {
      params.push(tv_device_id);
      filters.push(`tv_device_id = $${params.length}`);
    }

    params.push(limit);
    const whereSql = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const result = await db.query(`
      SELECT * FROM tv_control_logs
      ${whereSql}
      ORDER BY created_at DESC
      LIMIT $${params.length}
    `, params);

    return res.json({ ok: true, success: true, logs: result.rows, tv_control_logs: result.rows });
  } catch (err) {
    return errorResponse(res, err.message);
  }
}

async function getTvDisplaySetupList(req, res) {
  try {
    const result = await db.query(`
      SELECT d.*, r.room_name
      FROM tv_displays d
      LEFT JOIN rooms r ON r.room_id = d.room_id
      ORDER BY d.room_id ASC, d.display_name ASC
    `);
    return res.json({ ok: true, success: true, displays: result.rows, tv_displays: result.rows });
  } catch (err) {
    return errorResponse(res, err.message);
  }
}

async function getCustomerDisplayState(req, res) {
  try {
    const roomId = req.query.room_id || req.body?.room_id || '';
    const token = req.query.token || req.body?.token || '';
    if (!roomId) throw new Error('room_id wajib diisi.');

    if (token) {
      const displayRes = await db.query('SELECT * FROM tv_displays WHERE room_id = $1 AND display_token = $2 AND display_enabled = TRUE', [roomId, token]);
      if (displayRes.rowCount === 0) {
        return errorResponse(res, 'Token display tidak valid.', 'INVALID_DISPLAY_TOKEN');
      }
    }

    const roomRes = await db.query('SELECT * FROM rooms WHERE room_id = $1', [roomId]);
    if (roomRes.rowCount === 0) throw new Error('Ruangan tidak ditemukan.');
    const room = roomRes.rows[0];

    return res.json({
      ok: true,
      success: true,
      room: {
        room_id: room.room_id,
        room_name: room.room_name,
        status: room.status,
        start_time: room.start_time ? room.start_time.toISOString() : '',
        scheduled_end_time: room.scheduled_end_time ? room.scheduled_end_time.toISOString() : '',
        booked_duration_minutes: Number(room.booked_duration_minutes || 0)
      }
    });
  } catch (err) {
    return errorResponse(res, err.message);
  }
}

async function sendTvCommand(req, res, payload) {
  try {
    const { room_id, tv_device_id, tv_action, trigger_source = 'room_card', cashier_name = 'Kasir' } = payload;
    if (!room_id || !tv_action) throw new Error('room_id dan tv_action wajib diisi.');

    // Fetch device mapping
    let deviceRes;
    if (tv_device_id) {
      deviceRes = await db.query('SELECT * FROM tv_devices WHERE tv_device_id = $1', [tv_device_id]);
    } else {
      deviceRes = await db.query('SELECT * FROM tv_devices WHERE room_id = $1 AND status = \'active\' LIMIT 1', [room_id]);
    }

    let controlType = 'mock';
    let middlewareUrl = '';
    let targetDeviceId = tv_device_id || `TV-${room_id}`;

    if (deviceRes.rowCount > 0) {
      const dev = deviceRes.rows[0];
      controlType = dev.control_type;
      middlewareUrl = dev.middleware_url;
      targetDeviceId = dev.tv_device_id;
    }

    let resultStatus = 'sent';
    let successFlag = true;
    let blockReason = null;
    let rawResponse = 'Simulated mock OK';

    if (controlType === 'middleware' && middlewareUrl) {
      // Send HTTP POST to LAN TV Control Bridge
      try {
        const postData = JSON.stringify({
          room_id,
          tv_device_id: targetDeviceId,
          tv_action,
          trigger_source,
          requested_by: cashier_name
        });

        const urlObj = new URL(middlewareUrl);
        const options = {
          hostname: urlObj.hostname,
          port: urlObj.port || 80,
          path: urlObj.pathname,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData)
          },
          timeout: 4000
        };

        rawResponse = await new Promise((resolve, reject) => {
          const reqHttp = http.request(options, (resHttp) => {
            let data = '';
            resHttp.on('data', chunk => data += chunk);
            resHttp.on('end', () => resolve(data));
          });
          reqHttp.on('error', err => reject(err));
          reqHttp.on('timeout', () => { reqHttp.destroy(); reject(new Error('MIDDLEWARE_TIMEOUT')); });
          reqHttp.write(postData);
          reqHttp.end();
        });
      } catch (httpErr) {
        resultStatus = 'failed';
        successFlag = false;
        blockReason = httpErr.message.includes('TIMEOUT') ? 'MIDDLEWARE_TIMEOUT' : 'MIDDLEWARE_ERROR';
        rawResponse = httpErr.message;
      }
    }

    // Record TV Control Audit Log
    const logId = `TVL-${Date.now()}`;
    await db.query(`
      INSERT INTO tv_control_logs (
        log_id, room_id, tv_device_id, tv_action, trigger_source,
        cashier_name, control_type, result, success, block_reason, message, raw_response
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    `, [logId, room_id, targetDeviceId, tv_action, trigger_source, cashier_name, controlType, resultStatus, successFlag, blockReason, `Perintah TV ${tv_action} diproses (${resultStatus}).`, rawResponse]);

    return successResponse(res, {
      message: successFlag ? `Perintah TV ${tv_action} berhasil dikirim.` : `Gagal mengirim perintah TV: ${blockReason}`,
      result: resultStatus,
      success: successFlag,
      block_reason: blockReason,
      raw_response: rawResponse
    });
  } catch (err) {
    return errorResponse(res, err.message);
  }
}

function makeDisplayToken() {
  return crypto.randomBytes(24).toString('hex');
}

async function saveTvDevice(req, res, payload) {
  try {
    const tvDeviceId = payload.tv_device_id || `TV-${payload.room_id || Date.now()}`;
    if (!payload.room_id) throw new Error('room_id wajib diisi.');
    await db.query(`
      INSERT INTO tv_devices (tv_device_id, room_id, device_name, control_type, status, middleware_url, device_identifier)
      VALUES ($1, $2, $3, $4, COALESCE($5, 'active'), $6, $7)
      ON CONFLICT (tv_device_id) DO UPDATE SET room_id = EXCLUDED.room_id, device_name = EXCLUDED.device_name, control_type = EXCLUDED.control_type, status = EXCLUDED.status, middleware_url = EXCLUDED.middleware_url, device_identifier = EXCLUDED.device_identifier, updated_at = CURRENT_TIMESTAMP
    `, [tvDeviceId, payload.room_id, payload.device_name || tvDeviceId, payload.control_type || 'mock', payload.status || 'active', payload.middleware_url || null, payload.device_identifier || null]);
    return successResponse(res, { message: 'Perangkat TV berhasil disimpan.', tv_device_id: tvDeviceId });
  } catch (err) {
    return errorResponse(res, err.message);
  }
}

async function rotateTvDisplayToken(req, res, payload) {
  try {
    const displayId = payload.display_id || '';
    if (!displayId) throw new Error('display_id wajib diisi.');
    const token = makeDisplayToken();
    await db.query('UPDATE tv_displays SET display_token = $1, updated_at = CURRENT_TIMESTAMP WHERE display_id = $2', [token, displayId]);
    return successResponse(res, { message: 'Token display berhasil diganti.', display_id: displayId, display_token: token });
  } catch (err) {
    return errorResponse(res, err.message);
  }
}

async function seedTvDisplaysForAllRooms(req, res) {
  try {
    const roomsRes = await db.query(`SELECT room_id, room_name FROM rooms WHERE room_id <> 'FNB-GENERAL' ORDER BY room_id ASC`);
    let created = 0;
    for (const room of roomsRes.rows) {
      const displayId = `DSP-${room.room_id}`;
      const existing = await db.query('SELECT display_id FROM tv_displays WHERE display_id = $1', [displayId]);
      if (existing.rowCount > 0) continue;
      await db.query(`
        INSERT INTO tv_displays (display_id, room_id, display_name, display_token, display_enabled, refresh_interval_seconds, notes)
        VALUES ($1, $2, $3, $4, TRUE, 30, 'Auto seeded')
      `, [displayId, room.room_id, `Display ${room.room_name}`, makeDisplayToken()]);
      created++;
    }
    return successResponse(res, { message: 'Setup display TV diproses.', created_count: created });
  } catch (err) {
    return errorResponse(res, err.message);
  }
}

async function seedPilotTvDisplay(req, res, payload) {
  try {
    const roomId = payload.room_id || '';
    if (!roomId) throw new Error('room_id wajib diisi.');
    const displayId = `DSP-${roomId}`;
    const token = makeDisplayToken();
    await db.query(`
      INSERT INTO tv_displays (display_id, room_id, display_name, display_token, display_enabled, refresh_interval_seconds, notes)
      VALUES ($1, $2, $3, $4, TRUE, 30, 'Pilot display')
      ON CONFLICT (display_id) DO UPDATE SET display_token = EXCLUDED.display_token, display_enabled = TRUE, updated_at = CURRENT_TIMESTAMP
    `, [displayId, roomId, `Display ${roomId}`, token]);
    return successResponse(res, { message: 'Pilot display berhasil disiapkan.', display_id: displayId, display_token: token });
  } catch (err) {
    return errorResponse(res, err.message);
  }
}

module.exports = {
  getTvDevices,
  getTvControlLogs,
  getTvDisplaySetupList,
  getCustomerDisplayState,
  sendTvCommand,
  saveTvDevice,
  rotateTvDisplayToken,
  seedTvDisplaysForAllRooms,
  seedPilotTvDisplay,
};
