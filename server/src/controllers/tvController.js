const db = require('../db');
const http = require('http');
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

module.exports = {
  getTvDevices,
  sendTvCommand,
};
