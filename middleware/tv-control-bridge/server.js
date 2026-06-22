const express = require("express");
const cors = require("cors");

const PORT = 3030;
const TIMEOUT_DELAY_MS = 5000;
const VALID_TV_ACTIONS = new Set(["test", "power_on", "power_off"]);

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

function logTvCommand({ roomId, tvDeviceId, tvAction, result, blockReason = "" }) {
  const timestamp = new Date().toISOString();
  const suffix = blockReason ? ` block_reason=${blockReason}` : "";

  console.log(
    `[${timestamp}] room_id=${roomId} tv_device_id=${tvDeviceId} tv_action=${tvAction} result=${result}${suffix}`
  );
}

function buildValidationError(message) {
  return {
    success: false,
    result: "failed",
    message: message || "Payload tidak lengkap.",
    block_reason: "VALIDATION_ERROR",
  };
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

app.get("/health", (_req, res) => {
  res.json({
    success: true,
    service: "tv-control-bridge",
    status: "ok",
  });
});

app.post("/tv-command", async (req, res) => {
  const body = req.body || {};
  const roomId = String(body.room_id || "").trim();
  const tvDeviceId = String(body.tv_device_id || "").trim();
  const tvAction = String(body.tv_action || "").trim().toLowerCase();

  if (!isNonEmptyString(roomId) || !isNonEmptyString(tvDeviceId) || !isNonEmptyString(tvAction)) {
    const response = buildValidationError("room_id, tv_device_id, dan tv_action wajib diisi.");
    logTvCommand({
      roomId: roomId || "-",
      tvDeviceId: tvDeviceId || "-",
      tvAction: tvAction || "-",
      result: response.result,
      blockReason: response.block_reason,
    });
    res.status(400).json(response);
    return;
  }

  if (!VALID_TV_ACTIONS.has(tvAction)) {
    const response = {
      success: false,
      result: "failed",
      message: "tv_action tidak valid.",
      block_reason: "INVALID_TV_ACTION",
    };

    logTvCommand({
      roomId,
      tvDeviceId,
      tvAction,
      result: response.result,
      blockReason: response.block_reason,
    });
    res.status(400).json(response);
    return;
  }

  if (tvDeviceId === "TV-FAIL") {
    const response = {
      success: false,
      result: "failed",
      message: "SIMULATOR: Device offline",
      block_reason: "TV_DEVICE_OFFLINE",
    };

    logTvCommand({
      roomId,
      tvDeviceId,
      tvAction,
      result: response.result,
      blockReason: response.block_reason,
    });
    res.status(200).json(response);
    return;
  }

  if (tvDeviceId === "TV-TIMEOUT") {
    await new Promise((resolve) => {
      setTimeout(resolve, TIMEOUT_DELAY_MS);
    });

    const response = {
      success: false,
      result: "timeout",
      message: "SIMULATOR: Device timeout",
      block_reason: "TV_DEVICE_TIMEOUT",
    };

    logTvCommand({
      roomId,
      tvDeviceId,
      tvAction,
      result: response.result,
      blockReason: response.block_reason,
    });
    res.status(200).json(response);
    return;
  }

  const response = {
    success: true,
    result: "sent",
    message: `Perintah TV berhasil dikirim. Middleware menerima command ${tvAction} untuk ${tvDeviceId}`,
    data: {
      room_id: roomId,
      tv_device_id: tvDeviceId,
      tv_action: tvAction,
    },
  };

  logTvCommand({
    roomId,
    tvDeviceId,
    tvAction,
    result: response.result,
  });
  res.status(200).json(response);
});

app.listen(PORT, () => {
  console.log(`tv-control-bridge listening on http://localhost:${PORT}`);
  console.log("Endpoints: GET /health, POST /tv-command");
});