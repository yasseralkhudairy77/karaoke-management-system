const db = require('../db');
const http = require('http');
const crypto = require('crypto');
const tvBridgeService = require('../services/tvBridgeService');
const { successResponse, errorResponse } = require('../utils/response');

function normalizeMac(mac) {
  if (!mac) return '';
  const clean = String(mac).trim().toLowerCase().replace(/[^a-f0-9]/g, '');
  if (clean.length !== 12) return '';
  return clean.match(/.{1,2}/g).join(':');
}

function isValidIpv4(ip) {
  if (!ip) return false;
  const parts = String(ip).trim().split('.');
  if (parts.length !== 4) return false;
  return parts.every(p => {
    const num = Number(p);
    return Number.isInteger(num) && num >= 0 && num <= 255 && String(num) === p;
  });
}

async function verifyAdminPinPayload(payload, requiredRole = 'admin') {
  const pin = payload && (payload.admin_pin || payload.pin);
  if (!pin) {
    const err = new Error('PIN Admin/Owner wajib diisi.');
    err.code = 'INVALID_ADMIN_PIN';
    throw err;
  }

  const requestedRole = String(requiredRole || 'admin').trim().toLowerCase();
  const allowedRoles = requestedRole === 'owner' ? ['owner'] : ['owner', 'manager'];

  const result = await db.query(`
    SELECT employee_id, employee_name, role, pin, pin_hash
    FROM employees
    WHERE role = ANY($1::text[]) AND is_active = TRUE
    ORDER BY CASE role WHEN 'owner' THEN 1 WHEN 'manager' THEN 2 ELSE 3 END
  `, [allowedRoles]);

  let matchedEmp = null;
  for (const emp of result.rows) {
    if (emp.pin && String(emp.pin) === String(pin)) {
      matchedEmp = emp;
      break;
    }
    if (emp.pin_hash) {
      const hash = crypto.createHash('sha256').update(String(pin)).digest('hex');
      if (emp.pin_hash === hash) {
        matchedEmp = emp;
        break;
      }
    }
  }

  // Fallback khusus dev jika DB kosong
  if (!matchedEmp && result.rows.length === 0 && (pin === '123456' || pin === '654321')) {
    matchedEmp = { employee_id: 'EMP-OWNER-MOCK', employee_name: 'Owner (Default)', role: 'owner' };
  }

  if (!matchedEmp) {
    const err = new Error('PIN Admin/Owner tidak valid.');
    err.code = 'INVALID_ADMIN_PIN';
    throw err;
  }

  return matchedEmp;
}

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
          requested_by: cashier_name,
          // Dipakai aksi "notify": teks pesan yang tampil di layar TV.
          text: payload.text || undefined,
          subtext: payload.subtext || undefined,
          seconds: payload.seconds || undefined
        });

        const urlObj = new URL(middlewareUrl);
        const bridgeToken = String(process.env.TV_BRIDGE_TOKEN || '').trim();
        const options = {
          hostname: urlObj.hostname,
          port: urlObj.port || 80,
          path: urlObj.pathname,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData),
            ...(bridgeToken ? { 'X-API-Token': bridgeToken } : {})
          },
          // Menyalakan TV = keyevent 224 + paket WoL ke beberapa alamat, jadi bisa lebih dari
          // 4 detik. Batas 4 detik sebelumnya membuat POS mencatat "gagal" padahal TV menyala.
          timeout: Number(process.env.TV_BRIDGE_TIMEOUT_MS || 12000)
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

async function getTvRoomOverview(req, res) {
  try {
    const roomsRes = await db.query(`
      SELECT room_id, room_name, status, updated_at
      FROM rooms
      WHERE room_id <> 'FNB-GENERAL'
      ORDER BY room_id ASC
    `);

    const devRes = await db.query(`
      SELECT * FROM tv_devices ORDER BY room_id ASC
    `);
    const devMap = new Map();
    devRes.rows.forEach(d => {
      devMap.set(d.room_id, d);
    });

    const bridgeConfig = tvBridgeService.getConfig();
    let bridgeRooms = [];
    let bridgeReachable = false;
    try {
      const bridgeRes = await tvBridgeService.getBridgeRooms();
      if (bridgeRes.ok && bridgeRes.data && Array.isArray(bridgeRes.data.rooms)) {
        bridgeRooms = bridgeRes.data.rooms;
        bridgeReachable = true;
      }
    } catch (_e) {
      bridgeReachable = false;
    }

    const bridgeMap = new Map();
    bridgeRooms.forEach(b => {
      if (b.id) bridgeMap.set(String(b.id).toLowerCase(), b);
      if (Array.isArray(b.aliases)) {
        b.aliases.forEach(a => bridgeMap.set(String(a).toLowerCase(), b));
      }
    });

    const result = roomsRes.rows.map(r => {
      const dev = devMap.get(r.room_id) || {};
      const bRoom = bridgeMap.get(r.room_id.toLowerCase()) || bridgeMap.get(r.room_name.toLowerCase()) || null;

      const tvDeviceId = dev.tv_device_id || `TV-${r.room_id}`;
      const controlType = dev.control_type || 'middleware';
      const status = dev.status || 'active';
      const tvIp = dev.tv_ip || (bRoom ? bRoom.ip : '') || '';
      const tvMac = dev.tv_mac || (dev.device_identifier && dev.device_identifier.includes(':') ? dev.device_identifier : '') || (bRoom ? bRoom.mac : '') || '';
      const adbPort = dev.adb_port || (bRoom ? bRoom.adbPort : 5555) || 5555;
      const adbTimeoutMs = dev.adb_timeout_ms || 15000;
      const wolBroadcast = dev.wol_broadcast || '192.168.1.255';
      const notifyPackage = dev.notify_package || 'com.happysong.tvnotify';
      const notes = dev.notes || '';
      const middlewareUrl = dev.middleware_url || bridgeConfig.url;

      const deviceConnected = bRoom ? Boolean(bRoom.connected) : false;
      const wakefulness = bRoom ? (bRoom.wakefulness || (deviceConnected ? 'Awake' : null)) : null;
      const arpMac = bRoom ? (bRoom.arpMac || '') : '';
      const macMatchesArp = (!tvMac || !arpMac) ? 'tidak diketahui' : (tvMac.toLowerCase() === arpMac.toLowerCase() ? 'cocok' : 'beda');

      const masalah = [];
      if (controlType === 'mock') {
        masalah.push('Mode mock aktif (tanpa perangkat nyata)');
      } else {
        if (!tvMac) masalah.push('Alamat MAC belum diisi');
        if (!tvIp) masalah.push('Alamat IP belum diisi');
        else if (!isValidIpv4(tvIp)) masalah.push('Format IP tidak valid');
        if (middlewareUrl && middlewareUrl.includes('lhr.life')) {
          masalah.push('Tunnel middleware lama tidak aktif (lhr.life)');
        }
        if (!bridgeReachable) {
          masalah.push('TV Bridge lokal (127.0.0.1:3030) tidak dapat dihubungi');
        } else if (!deviceConnected && bRoom && bRoom.enabled) {
          masalah.push('ADB tidak tersambung ke perangkat TV');
        }
      }

      return {
        room_id: r.room_id,
        room_name: r.room_name,
        tv_device_id: tvDeviceId,
        device_name: dev.device_name || `TV ${r.room_name}`,
        control_type: controlType,
        status,
        tv_ip: tvIp,
        tv_mac: tvMac,
        adb_port: adbPort,
        adb_timeout_ms: adbTimeoutMs,
        wol_broadcast: wolBroadcast,
        notify_package: notifyPackage,
        notes,
        middleware_url: middlewareUrl,
        bridge_url: bridgeConfig.url,
        bridge_reachable: bridgeReachable,
        device_connected: deviceConnected,
        wakefulness,
        mac_matches_arp: macMatchesArp,
        arp_mac: arpMac,
        last_checked_at: dev.last_checked_at ? new Date(dev.last_checked_at).toISOString() : '',
        last_check_result: dev.last_check_result || '',
        last_check_message: dev.last_check_message || '',
        masalah
      };
    });

    return res.json({ ok: true, success: true, rooms: result });
  } catch (err) {
    return errorResponse(res, err.message);
  }
}

async function saveTvDeviceSettings(req, res, payload) {
  try {
    const operator = await verifyAdminPinPayload(payload);
    const roomId = String(payload.room_id || '').trim();
    if (!roomId) throw new Error('room_id wajib diisi.');

    const controlType = payload.control_type || 'middleware';
    let tvMac = String(payload.tv_mac || '').trim();
    let tvIp = String(payload.tv_ip || '').trim();

    if (tvMac) {
      const normalized = normalizeMac(tvMac);
      if (!normalized) throw new Error('Format MAC address tidak valid. Gunakan format seperti 74:81:9a:ff:72:be.');
      tvMac = normalized;
    }

    if (tvIp && !isValidIpv4(tvIp)) {
      throw new Error('Format IP address tidak valid. Gunakan format IPv4 (contoh: 192.168.1.104).');
    }

    const tvDeviceId = `TV-${roomId}`;
    const deviceName = payload.device_name || `TV ${roomId}`;
    const status = payload.status || 'active';
    const adbPort = Number(payload.adb_port || 5555);
    const adbTimeoutMs = Number(payload.adb_timeout_ms || 15000);
    const wolBroadcast = String(payload.wol_broadcast || '192.168.1.255').trim();
    const notifyPackage = String(payload.notify_package || 'com.happysong.tvnotify').trim();
    const notes = String(payload.notes || '').trim();
    const middlewareUrl = String(payload.middleware_url || '').trim() || tvBridgeService.getConfig().url;

    await db.query(`
      INSERT INTO tv_devices (
        tv_device_id, room_id, device_name, control_type, status,
        middleware_url, device_identifier, tv_ip, tv_mac, adb_port,
        adb_timeout_ms, wol_broadcast, notify_package, notes, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, CURRENT_TIMESTAMP)
      ON CONFLICT (tv_device_id) DO UPDATE SET
        room_id = EXCLUDED.room_id,
        device_name = EXCLUDED.device_name,
        control_type = EXCLUDED.control_type,
        status = EXCLUDED.status,
        middleware_url = EXCLUDED.middleware_url,
        device_identifier = EXCLUDED.device_identifier,
        tv_ip = EXCLUDED.tv_ip,
        tv_mac = EXCLUDED.tv_mac,
        adb_port = EXCLUDED.adb_port,
        adb_timeout_ms = EXCLUDED.adb_timeout_ms,
        wol_broadcast = EXCLUDED.wol_broadcast,
        notify_package = EXCLUDED.notify_package,
        notes = EXCLUDED.notes,
        updated_at = CURRENT_TIMESTAMP
    `, [
      tvDeviceId, roomId, deviceName, controlType, status,
      middlewareUrl, tvMac || null, tvIp || null, tvMac || null, adbPort,
      adbTimeoutMs, wolBroadcast, notifyPackage, notes
    ]);

    // Kirim pembaruan ke TV Bridge lokal jika control_type === 'middleware'
    let bridgeSyncResult = null;
    if (controlType === 'middleware') {
      try {
        bridgeSyncResult = await tvBridgeService.updateBridgeRoomConfig(roomId, {
          ip: tvIp,
          mac: tvMac,
          adbPort,
          adbTimeoutMs,
          wolBroadcast,
          notes,
          enabled: status === 'active'
        });
      } catch (bridgeErr) {
        bridgeSyncResult = { ok: false, error: bridgeErr.message };
      }
    }

    await tvBridgeService.recordTvLog({
      roomId,
      tvDeviceId,
      action: 'save_settings',
      triggerSource: 'kontrol_tv_ui',
      cashierName: operator.employee_name || 'Admin',
      controlType,
      result: 'sent',
      success: true,
      message: `Pengaturan TV ruangan ${roomId} disimpan oleh ${operator.employee_name || 'Admin'}.`,
      rawResponse: JSON.stringify(bridgeSyncResult || {})
    });

    return successResponse(res, {
      message: 'Pengaturan TV berhasil disimpan.',
      tv_device_id: tvDeviceId,
      bridge_sync: bridgeSyncResult
    });
  } catch (err) {
    return errorResponse(res, err.message, err.code || 'SAVE_ERROR');
  }
}

async function checkTvDevice(req, res, payload) {
  try {
    const operator = await verifyAdminPinPayload(payload);
    const roomId = String(payload.room_id || '').trim();
    if (!roomId) throw new Error('room_id wajib diisi.');

    const statusRes = await tvBridgeService.getBridgeRoomStatus(roomId);
    let checkResult = 'offline';
    let checkMessage = 'Tidak dapat menghubungi bridge TV lokal.';
    let bridgeData = null;

    if (statusRes.ok && statusRes.data) {
      bridgeData = statusRes.data;
      checkResult = bridgeData.connected ? 'connected' : 'offline';
      checkMessage = bridgeData.message || (bridgeData.connected ? 'Terhubung ke ADB' : 'ADB tidak tersambung');
    } else if (statusRes.error) {
      checkMessage = statusRes.error;
    }

    try {
      await db.query(`
        UPDATE tv_devices
        SET last_checked_at = CURRENT_TIMESTAMP,
            last_check_result = $1,
            last_check_message = $2,
            updated_at = CURRENT_TIMESTAMP
        WHERE room_id = $3
      `, [checkResult, checkMessage, roomId]);
    } catch (_dbErr) {}

    await tvBridgeService.recordTvLog({
      roomId,
      action: 'check_device',
      triggerSource: 'kontrol_tv_ui',
      cashierName: operator.employee_name || 'Admin',
      result: checkResult,
      success: checkResult === 'connected',
      message: `Pemeriksaan TV ${roomId}: ${checkMessage}`,
      rawResponse: JSON.stringify(statusRes || {})
    });

    return successResponse(res, {
      message: `Pemeriksaan TV ${roomId} selesai: ${checkMessage}`,
      status: checkResult,
      details: bridgeData,
      last_check_message: checkMessage
    });
  } catch (err) {
    return errorResponse(res, err.message, err.code || 'CHECK_ERROR');
  }
}

async function testTvDevice(req, res, payload) {
  try {
    const operator = await verifyAdminPinPayload(payload);
    const roomId = String(payload.room_id || '').trim();
    if (!roomId) throw new Error('room_id wajib diisi.');

    const cmdRes = await tvBridgeService.sendTvCommand(roomId, 'test', {
      triggerSource: 'kontrol_tv_ui',
      cashierName: operator.employee_name || 'Admin'
    });

    return successResponse(res, {
      message: cmdRes.ok ? `Uji ADB ruangan ${roomId} berhasil dikirim.` : `Uji ADB ruangan ${roomId} gagal: ${cmdRes.error}`,
      success: cmdRes.ok,
      data: cmdRes.data
    });
  } catch (err) {
    return errorResponse(res, err.message, err.code || 'TEST_ERROR');
  }
}

async function wakeTvDevice(req, res, payload) {
  try {
    const operator = await verifyAdminPinPayload(payload);
    const roomId = String(payload.room_id || '').trim();
    if (!roomId) throw new Error('room_id wajib diisi.');

    const cmdRes = await tvBridgeService.sendTvCommand(roomId, 'power_on', {
      triggerSource: 'kontrol_tv_ui',
      cashierName: operator.employee_name || 'Admin'
    });

    return successResponse(res, {
      message: cmdRes.ok ? `Perintah menyalakan TV ruangan ${roomId} berhasil dikirim.` : `Gagal menyalakan TV: ${cmdRes.error}`,
      success: cmdRes.ok,
      data: cmdRes.data
    });
  } catch (err) {
    return errorResponse(res, err.message, err.code || 'WAKE_ERROR');
  }
}

async function sleepTvDevice(req, res, payload) {
  try {
    const operator = await verifyAdminPinPayload(payload);
    const roomId = String(payload.room_id || '').trim();
    if (!roomId) throw new Error('room_id wajib diisi.');

    const cmdRes = await tvBridgeService.sendTvCommand(roomId, 'power_off', {
      triggerSource: 'kontrol_tv_ui',
      cashierName: operator.employee_name || 'Admin'
    });

    return successResponse(res, {
      message: cmdRes.ok ? `Perintah mematikan TV ruangan ${roomId} berhasil dikirim.` : `Gagal mematikan TV: ${cmdRes.error}`,
      success: cmdRes.ok,
      data: cmdRes.data
    });
  } catch (err) {
    return errorResponse(res, err.message, err.code || 'SLEEP_ERROR');
  }
}

async function notifyTvDevice(req, res, payload) {
  try {
    const operator = await verifyAdminPinPayload(payload);
    const roomId = String(payload.room_id || '').trim();
    if (!roomId) throw new Error('room_id wajib diisi.');
    const text = String(payload.text || '').trim();
    if (!text) throw new Error('Teks pesan notifikasi wajib diisi.');

    const cmdRes = await tvBridgeService.sendTvCommand(roomId, 'notify', {
      text,
      subtext: payload.subtext,
      seconds: payload.seconds ? Number(payload.seconds) : 10,
      triggerSource: 'kontrol_tv_ui',
      cashierName: operator.employee_name || 'Admin'
    });

    return successResponse(res, {
      message: cmdRes.ok ? `Pesan notifikasi berhasil dikirim ke layar TV ${roomId}.` : `Gagal mengirim notifikasi: ${cmdRes.error}`,
      success: cmdRes.ok,
      data: cmdRes.data
    });
  } catch (err) {
    return errorResponse(res, err.message, err.code || 'NOTIFY_ERROR');
  }
}

async function reloadTvBridgeConfig(req, res, payload) {
  try {
    await verifyAdminPinPayload(payload);
    const reloadRes = await tvBridgeService.reloadBridgeConfig();
    return successResponse(res, {
      message: reloadRes.ok ? 'Konfigurasi bridge berhasil dimuat ulang.' : `Gagal reload bridge: ${reloadRes.error}`,
      success: reloadRes.ok,
      data: reloadRes.data
    });
  } catch (err) {
    return errorResponse(res, err.message, err.code || 'RELOAD_ERROR');
  }
}

module.exports = {
  checkTvDevice,
  getCustomerDisplayState,
  getTvControlLogs,
  getTvDevices,
  getTvDisplaySetupList,
  getTvRoomOverview,
  isValidIpv4,
  normalizeMac,
  notifyTvDevice,
  reloadTvBridgeConfig,
  rotateTvDisplayToken,
  saveTvDevice,
  saveTvDeviceSettings,
  seedPilotTvDisplay,
  seedTvDisplaysForAllRooms,
  sendTvCommand,
  sleepTvDevice,
  testTvDevice,
  wakeTvDevice,
};
