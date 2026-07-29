const express = require("express");
const cors = require("cors");
require("dotenv").config();

const {
  connectToRoom,
  getRuntime,
  getStatus,
  listRoomStatuses,
  sleepRoom,
  wakeRoom,
} = require("./src/adbService");

const PORT = Number(process.env.PORT) || 3030;

const app = express();

app.use(express.json());
app.use(
  cors({
    origin(origin, callback) {
      if (
        !origin
        || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)
      ) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"],
  })
);

function log(message) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
}

// ─── Health ───────────────────────────────────────────────────────────────────

app.get("/health", (_req, res) => {
  res.json({
    success: true,
    service: "tv-control-bridge",
    status: "ok",
    adb: "real",
  });
});

// ─── Runtime info (semua room + status koneksi) ───────────────────────────────

app.get("/runtime", (_req, res) => {
  try {
    const data = getRuntime();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── Status satu room ─────────────────────────────────────────────────────────

app.get("/rooms/:roomId/status", async (req, res) => {
  const { roomId } = req.params;
  try {
    const status = await getStatus(roomId);
    res.json({ success: true, data: status });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// ─── Connect ke room ─────────────────────────────────────────────────────────

app.post("/rooms/:roomId/connect", async (req, res) => {
  const { roomId } = req.params;
  try {
    log(`Connecting to ${roomId}...`);
    const result = await connectToRoom(roomId);
    log(`Connected to ${roomId}: ${result.connected}`);
    res.json({ success: true, data: result });
  } catch (err) {
    log(`Connect failed for ${roomId}: ${err.message}`);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── TV Command (power_on / power_off / test) ─────────────────────────────────

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

  const validActions = new Set(["test", "power_on", "power_off"]);
  if (!validActions.has(tvAction)) {
    return res.status(400).json({
      success: false,
      result: "failed",
      message: "tv_action tidak valid. Gunakan: power_on, power_off, test",
      block_reason: "INVALID_TV_ACTION",
    });
  }

  log(`TV command: room=${roomId} action=${tvAction}`);

  try {
    if (tvAction === "test") {
      const status = await getStatus(roomId);
      log(`Test result for ${roomId}: connected=${status.connected}`);
      return res.json({
        success: true,
        result: "tested",
        message: `Test ADB untuk ${roomId}: ${status.connected ? "Terhubung" : "Tidak terhubung"}`,
        data: status,
      });
    }

    if (tvAction === "power_off") {
      const result = await sleepRoom(roomId);
      log(`Power OFF sent to ${roomId} (keyevent ${result.keycode})`);
      return res.json({
        success: true,
        result: "sent",
        message: `TV ${roomId} berhasil dimatikan (sleep keyevent ${result.keycode})`,
        data: result,
      });
    }

    if (tvAction === "power_on") {
      const result = await wakeRoom(roomId);
      log(`Power ON sent to ${roomId} (WoL + keyevent 224)`);
      return res.json({
        success: true,
        result: "sent",
        message: `TV ${roomId} berhasil dinyalakan (WoL + wake keyevent)`,
        data: result,
      });
    }
  } catch (err) {
    log(`TV command failed: room=${roomId} action=${tvAction} error=${err.message}`);
    return res.status(500).json({
      success: false,
      result: "failed",
      message: err.message,
      block_reason: "ADB_ERROR",
    });
  }
});

// ─── Power OFF semua room ─────────────────────────────────────────────────────

app.post("/rooms/all/power-off", async (req, res) => {
  const statuses = listRoomStatuses();
  const enabled = statuses.filter((r) => r && r.enabled && r.ip);

  const results = await Promise.allSettled(
    enabled.map(async (room) => {
      const result = await sleepRoom(room.id);
      log(`Power OFF sent to ${room.id}`);
      return result;
    })
  );

  const summary = results.map((r, i) => ({
    roomId: enabled[i].id,
    ok: r.status === "fulfilled",
    error: r.status === "rejected" ? r.reason?.message : null,
  }));

  res.json({ success: true, results: summary });
});

// ─── Power ON semua room ──────────────────────────────────────────────────────

app.post("/rooms/all/power-on", async (req, res) => {
  const statuses = listRoomStatuses();
  const enabled = statuses.filter((r) => r && r.enabled && r.ip && r.mac);

  const results = await Promise.allSettled(
    enabled.map(async (room) => {
      const result = await wakeRoom(room.id);
      log(`Power ON sent to ${room.id}`);
      return result;
    })
  );

  const summary = results.map((r, i) => ({
    roomId: enabled[i].id,
    ok: r.status === "fulfilled",
    error: r.status === "rejected" ? r.reason?.message : null,
  }));

  res.json({ success: true, results: summary });
});

// ─── Start server ─────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`tv-control-bridge (ADB mode) listening on http://localhost:${PORT}`);
  console.log("Endpoints:");
  console.log("  GET  /health");
  console.log("  GET  /runtime");
  console.log("  GET  /rooms/:roomId/status");
  console.log("  POST /rooms/:roomId/connect");
  console.log("  POST /tv-command              { room_id, tv_action: power_on|power_off|test }");
  console.log("  POST /rooms/all/power-off");
  console.log("  POST /rooms/all/power-on");
});