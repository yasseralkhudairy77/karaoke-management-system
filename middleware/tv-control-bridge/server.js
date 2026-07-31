const express = require("express");
const cors = require("cors");
require("dotenv").config();

const {
  connectToRoom,
  getRuntime,
  getStatus,
  getRoomRuntime,
  getTestDeviceRuntime,
  launchApp,
  listRoomStatuses,
  listTestDeviceStatuses,
  sleepRoom,
  wakeRoom,
  resolveRoomId,
  resolveTestDeviceId,
} = require("./src/adbService");
const { listRooms } = require("./src/roomConfig");
const {
  cancelCountdown,
  getCountdown,
  listCountdowns,
  readDurationSeconds,
  startCountdown,
} = require("./src/countdownService");

const PORT = Number(process.env.PORT) || 3030;
const apiToken = String(process.env.API_TOKEN || "").trim();
const autoConnect = String(process.env.AUTO_CONNECT || "false").toLowerCase() === "true";
const autoConnectAll = String(process.env.AUTO_CONNECT_ALL || "false").toLowerCase() === "true";
const autoConnectDelayMs = Math.max(0, Number(process.env.AUTO_CONNECT_DELAY_MS) || 15000);
const autoConnectRetries = Math.max(1, Number(process.env.AUTO_CONNECT_RETRIES) || 8);

const app = express();

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function autoConnectConfiguredRooms() {
  const rooms = listRooms().filter((room) => room.enabled && room.ip);
  console.log(`Auto-connect: ${rooms.length} room(s), ${autoConnectRetries} attempt(s), ${autoConnectDelayMs}ms interval`);

  for (let attempt = 1; attempt <= autoConnectRetries; attempt += 1) {
    let connected = 0;

    for (const room of rooms) {
      try {
        await connectToRoom(room);
        connected += 1;
      } catch (error) {
        console.warn(`Auto-connect ${room.name} attempt ${attempt}/${autoConnectRetries}: ${error.message}`);
      }
    }

    if (connected === rooms.length) {
      console.log(`Auto-connect complete: ${connected}/${rooms.length} room(s) connected`);
      return;
    }

    if (attempt < autoConnectRetries) {
      await wait(autoConnectDelayMs);
    }
  }

  console.warn("Auto-connect finished with one or more rooms unavailable; dashboard commands can retry on demand.");
}

app.use(express.json({ limit: "50kb" }));
app.use(
  cors({
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }

      const allowedOrigins = String(process.env.CORS_ORIGINS || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);

      if (
        /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin) ||
        /^https?:\/\/192\.168\.\d+\.\d+(:\d+)?$/i.test(origin) ||
        allowedOrigins.includes(origin)
      ) {
        callback(null, true);
        return;
      }

      callback(null, false);
    },
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type", "Authorization", "X-API-Token"],
  })
);

function log(message) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

function sendError(res, error, statusCode = 500) {
  const message = error && error.message ? error.message : "Unknown error";
  const resolvedStatusCode = error && error.statusCode ? error.statusCode : statusCode;
  log(`Error: ${message}`);
  res.status(resolvedStatusCode).json({
    ok: false,
    success: false,
    error: message,
    message,
  });
}

function getRequestToken(req) {
  const authHeader = String(req.get("authorization") || "").trim();
  if (/^Bearer\s+/i.test(authHeader)) {
    return authHeader.replace(/^Bearer\s+/i, "").trim();
  }

  return String(req.get("x-api-token") || "").trim();
}

function requireApiToken(req, res, next) {
  if (!apiToken) {
    return next();
  }

  if (getRequestToken(req) === apiToken) {
    return next();
  }

  return res.status(401).json({
    ok: false,
    success: false,
    error: "Unauthorized",
    message: "Unauthorized",
  });
}

function isConfirmed(input) {
  if (typeof input === "boolean") {
    return input;
  }
  if (typeof input === "number") {
    return input === 1;
  }
  if (typeof input === "string") {
    return ["true", "1", "yes", "y"].includes(input.trim().toLowerCase());
  }
  return false;
}

function readRoomSelector(req) {
  return req.params.roomId || req.query.roomId || (req.body ? req.body.room_id || req.body.roomId : undefined);
}

function readTestDeviceSelector(req) {
  return req.params.deviceId || req.query.deviceId || (req.body ? req.body.device_id || req.body.deviceId : undefined);
}

function resolveRouteRoom(req, res) {
  const selector = readRoomSelector(req);
  const roomId = resolveRoomId(selector);

  if (!roomId) {
    res.status(404).json({
      ok: false,
      success: false,
      error: `Unknown room: ${selector || "empty"}`,
      message: `Unknown room: ${selector || "empty"}`,
    });
    return null;
  }

  return roomId;
}

function resolveRouteTestDevice(req, res) {
  const selector = readTestDeviceSelector(req);
  const deviceId = resolveTestDeviceId(selector);

  if (!deviceId) {
    res.status(404).json({
      ok: false,
      success: false,
      error: `Unknown test device: ${selector || "empty"}`,
      message: `Unknown test device: ${selector || "empty"}`,
    });
    return null;
  }

  return deviceId;
}

function sendDisabledRoom(res, roomId) {
  const room = getRoomRuntime(roomId);
  if (!room || room.enabled) {
    return false;
  }

  res.status(409).json({
    ok: false,
    success: false,
    error: `ROOM ${room.id} is disabled`,
    message: `ROOM ${room.id} is disabled`,
    room,
  });
  return true;
}

function sendDisabledTestDevice(res, deviceId) {
  const device = getTestDeviceRuntime(deviceId);
  if (!device || device.enabled) {
    return false;
  }

  res.status(409).json({
    ok: false,
    success: false,
    error: `TEST DEVICE ${device.id} is disabled`,
    message: `TEST DEVICE ${device.id} is disabled`,
    device,
  });
  return true;
}

function activeRooms() {
  return listRoomStatuses().filter((room) => room && room.enabled && room.ip);
}

async function runBatch(rooms, action) {
  const settled = await Promise.allSettled(rooms.map((room) => action(room)));
  return settled.map((result, index) => {
    const room = rooms[index];
    if (result.status === "fulfilled") {
      return {
        ok: true,
        success: true,
        roomId: room.id,
        roomName: room.name,
        result: result.value,
      };
    }

    return {
      ok: false,
      success: false,
      roomId: room.id,
      roomName: room.name,
      error: result.reason && result.reason.message ? result.reason.message : String(result.reason),
    };
  });
}

function asTestDeviceResult(result) {
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    return result;
  }

  const { roomId, roomName, adbWake, ...rest } = result;
  const mapped = {
    ...rest,
    deviceId: roomId,
    deviceName: roomName,
  };

  if (adbWake) {
    mapped.adbWake = asTestDeviceResult(adbWake);
  }

  return mapped;
}

function successResult(result = {}) {
  return {
    ok: true,
    success: true,
    ...result,
  };
}

async function handleRoomSleep(req, res) {
  if (!isConfirmed(req.body && req.body.confirm)) {
    return res.status(400).json({
      ok: false,
      success: false,
      error: 'Confirm required: send {"confirm":true} to sleep the TV',
    });
  }

  try {
    const roomId = resolveRouteRoom(req, res);
    if (!roomId || sendDisabledRoom(res, roomId)) {
      return;
    }

    const keycode = req.body && typeof req.body.keycode !== "undefined" ? Number(req.body.keycode) : undefined;
    return res.json(await sleepRoom(roomId, keycode));
  } catch (error) {
    return sendError(res, error);
  }
}

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    success: true,
    service: "tv-control-bridge",
    status: "ok",
    adb: "real",
    authRequired: Boolean(apiToken),
  });
});

app.get("/api/auth/status", (_req, res) => {
  res.json({
    ok: true,
    success: true,
    authRequired: Boolean(apiToken),
  });
});

// Compatibility endpoint for Google Apps Script TVDevices.middleware_url.
app.post("/tv-command", async (req, res) => {
  const body = req.body || {};
  const roomId = String(body.room_id || "").trim();
  const tvAction = String(body.tv_action || "").trim().toLowerCase();

  if (!roomId || !tvAction) {
    return res.status(400).json({
      success: false,
      result: "failed",
      message: "room_id dan tv_action wajib diisi.",
      block_reason: "VALIDATION_ERROR",
    });
  }

  if (!["test", "power_on", "power_off"].includes(tvAction)) {
    return res.status(400).json({
      success: false,
      result: "failed",
      message: "tv_action tidak valid. Gunakan: power_on, power_off, test.",
      block_reason: "INVALID_TV_ACTION",
    });
  }

  const normalizedRoomId = resolveRoomId(roomId);
  if (!normalizedRoomId) {
    return res.status(404).json({
      success: false,
      result: "failed",
      message: `Room tidak dikenal: ${roomId}`,
      block_reason: "ROOM_NOT_FOUND",
    });
  }

  if (sendDisabledRoom(res, normalizedRoomId)) {
    return;
  }

  log(`TV command: room=${roomId} resolved=${normalizedRoomId} action=${tvAction}`);

  try {
    if (tvAction === "test") {
      const status = await getStatus(normalizedRoomId);
      return res.json({
        success: true,
        result: status.connected ? "sent" : "tested",
        message: `Test ADB ${status.roomName}: ${status.connected ? "terhubung" : "belum terhubung"}.`,
        data: status,
      });
    }

    if (tvAction === "power_off") {
      const result = await sleepRoom(normalizedRoomId);
      return res.json({
        success: true,
        result: "sent",
        message: `TV ${result.roomName} berhasil dimatikan.`,
        data: result,
      });
    }

    const result = await wakeRoom(normalizedRoomId);
    return res.json({
      success: true,
      result: "sent",
      message: `TV ${result.roomName} berhasil dinyalakan.`,
      data: result,
    });
  } catch (error) {
    log(`TV command failed: room=${roomId} action=${tvAction} error=${error.message}`);
    return res.status(error.statusCode || 500).json({
      success: false,
      result: "failed",
      message: error.message,
      block_reason: "ADB_ERROR",
    });
  }
});

app.use("/api", requireApiToken);

app.get("/api/runtime", (_req, res) => {
  res.json(successResult({ data: getRuntime() }));
});

app.get("/api/rooms", (_req, res) => {
  res.json(successResult({ rooms: listRoomStatuses() }));
});

app.get("/api/test-devices", (_req, res) => {
  res.json(successResult({ devices: listTestDeviceStatuses() }));
});

app.get("/api/countdowns", (_req, res) => {
  res.json(successResult({ countdowns: listCountdowns() }));
});

app.get("/api/rooms/:roomId/status", async (req, res) => {
  try {
    const roomId = resolveRouteRoom(req, res);
    if (!roomId || sendDisabledRoom(res, roomId)) {
      return;
    }

    res.json(await getStatus(roomId));
  } catch (error) {
    sendError(res, error);
  }
});

app.post("/api/rooms/:roomId/connect", async (req, res) => {
  try {
    const roomId = resolveRouteRoom(req, res);
    if (!roomId || sendDisabledRoom(res, roomId)) {
      return;
    }

    res.json(successResult(await connectToRoom(roomId)));
  } catch (error) {
    sendError(res, error);
  }
});

app.post("/api/rooms/:roomId/wake", async (req, res) => {
  try {
    const roomId = resolveRouteRoom(req, res);
    if (!roomId || sendDisabledRoom(res, roomId)) {
      return;
    }

    res.json(await wakeRoom(roomId));
  } catch (error) {
    sendError(res, error);
  }
});

app.post("/api/rooms/:roomId/sleep", handleRoomSleep);
app.post("/api/rooms/:roomId/off", handleRoomSleep);

app.post("/api/rooms/:roomId/app", async (req, res) => {
  try {
    const roomId = resolveRouteRoom(req, res);
    if (!roomId || sendDisabledRoom(res, roomId)) {
      return;
    }

    res.json(await launchApp(req.body ? req.body.packageName : undefined, roomId));
  } catch (error) {
    sendError(res, error, 400);
  }
});

app.post("/api/rooms/wake-all", async (_req, res) => {
  try {
    const results = await runBatch(activeRooms(), (room) => wakeRoom(room));
    res.json(successResult({ count: results.length, results, ok: results.every((result) => result.ok) }));
  } catch (error) {
    sendError(res, error);
  }
});

app.post("/api/rooms/sleep-all", async (req, res) => {
  if (!isConfirmed(req.body && req.body.confirm)) {
    return res.status(400).json({
      ok: false,
      success: false,
      error: 'Confirm required: send {"confirm":true} to sleep all enabled rooms',
    });
  }

  try {
    const results = await runBatch(activeRooms(), (room) => sleepRoom(room));
    res.json(successResult({ count: results.length, results, ok: results.every((result) => result.ok) }));
  } catch (error) {
    sendError(res, error);
  }
});

app.get("/api/rooms/:roomId/countdown", (req, res) => {
  const roomId = resolveRouteRoom(req, res);
  if (!roomId) {
    return;
  }

  res.json(successResult({ countdown: getCountdown("room", roomId) }));
});

app.post("/api/rooms/:roomId/countdown/start", (req, res) => {
  try {
    const roomId = resolveRouteRoom(req, res);
    if (!roomId || sendDisabledRoom(res, roomId)) {
      return;
    }

    const durationSeconds = readDurationSeconds(req.body || {});
    const countdown = startCountdown({
      targetType: "room",
      target: getRoomRuntime(roomId),
      durationSeconds,
    });
    res.json(successResult({ countdown }));
  } catch (error) {
    sendError(res, error, 400);
  }
});

app.post("/api/rooms/:roomId/countdown/cancel", (req, res) => {
  const roomId = resolveRouteRoom(req, res);
  if (!roomId) {
    return;
  }

  res.json(successResult({ countdown: cancelCountdown("room", roomId) }));
});

app.post("/api/rooms/countdown/start-all", (req, res) => {
  try {
    const durationSeconds = readDurationSeconds(req.body || {});
    const results = activeRooms().map((room) => ({
      ok: true,
      success: true,
      roomId: room.id,
      roomName: room.name,
      countdown: startCountdown({
        targetType: "room",
        target: room,
        durationSeconds,
      }),
    }));
    res.json(successResult({ count: results.length, results }));
  } catch (error) {
    sendError(res, error, 400);
  }
});

app.post("/api/rooms/countdown/cancel-all", (_req, res) => {
  const results = activeRooms().map((room) => ({
    ok: true,
    success: true,
    roomId: room.id,
    roomName: room.name,
    countdown: cancelCountdown("room", room.id),
  }));
  res.json(successResult({ count: results.length, results }));
});

app.get("/api/test-devices/:deviceId/status", async (req, res) => {
  try {
    const deviceId = resolveRouteTestDevice(req, res);
    if (!deviceId || sendDisabledTestDevice(res, deviceId)) {
      return;
    }

    res.json(asTestDeviceResult(await getStatus(getTestDeviceRuntime(deviceId))));
  } catch (error) {
    sendError(res, error);
  }
});

app.post("/api/test-devices/:deviceId/wake", async (req, res) => {
  try {
    const deviceId = resolveRouteTestDevice(req, res);
    if (!deviceId || sendDisabledTestDevice(res, deviceId)) {
      return;
    }

    res.json(asTestDeviceResult(await wakeRoom(getTestDeviceRuntime(deviceId))));
  } catch (error) {
    sendError(res, error);
  }
});

app.post("/api/test-devices/:deviceId/sleep", async (req, res) => {
  if (!isConfirmed(req.body && req.body.confirm)) {
    return res.status(400).json({
      ok: false,
      success: false,
      error: 'Confirm required: send {"confirm":true} to sleep the test device',
    });
  }

  try {
    const deviceId = resolveRouteTestDevice(req, res);
    if (!deviceId || sendDisabledTestDevice(res, deviceId)) {
      return;
    }

    const keycode = req.body && typeof req.body.keycode !== "undefined" ? Number(req.body.keycode) : undefined;
    res.json(asTestDeviceResult(await sleepRoom(getTestDeviceRuntime(deviceId), keycode)));
  } catch (error) {
    sendError(res, error);
  }
});

app.use((_req, res) => {
  res.status(404).json({
    ok: false,
    success: false,
    error: "Not found",
    message: "Not found",
  });
});

app.listen(PORT, async () => {
  console.log(`tv-control-bridge listening on http://localhost:${PORT}`);
  console.log(`API auth: ${apiToken ? "enabled" : "disabled"}`);
  console.log("Endpoints:");
  console.log("  GET  /health");
  console.log("  POST /tv-command");
  console.log("  GET  /api/rooms");
  console.log("  POST /api/rooms/:roomId/wake");
  console.log("  POST /api/rooms/:roomId/sleep");

  if (autoConnectAll) {
    setTimeout(() => autoConnectConfiguredRooms().catch((error) => {
      console.error("Auto-connect all failed:", error.message);
    }), autoConnectDelayMs);
  } else if (autoConnect) {
    try {
      await connectToRoom();
    } catch (error) {
      console.error("Auto-connect failed:", error.message);
    }
  }
});

process.on("SIGINT", () => {
  console.log("\nShutting down");
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\nShutting down");
  process.exit(0);
});
