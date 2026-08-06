const { sleepRoom } = require('./adbService');

const countdowns = new Map();

function makeKey(targetType, targetId) {
  return `${targetType}:${String(targetId).toLowerCase()}`;
}

function readDurationSeconds(input = {}) {
  const seconds = Number(input.seconds);
  if (Number.isFinite(seconds) && seconds > 0) {
    return Math.ceil(seconds);
  }

  const minutes = Number(input.minutes);
  if (Number.isFinite(minutes) && minutes > 0) {
    return Math.ceil(minutes * 60);
  }

  throw new Error('minutes or seconds must be a positive number');
}

function snapshot(record) {
  if (!record) {
    return {
      active: false,
      state: 'idle',
    };
  }

  const remainingSeconds = record.state === 'running'
    ? Math.max(0, Math.ceil((record.endsAtMs - Date.now()) / 1000))
    : 0;

  return {
    active: record.state === 'running',
    state: record.state,
    targetType: record.targetType,
    targetId: record.targetId,
    targetName: record.targetName,
    durationSeconds: record.durationSeconds,
    remainingSeconds,
    startedAt: record.startedAt,
    endsAt: record.endsAt,
    completedAt: record.completedAt,
    canceledAt: record.canceledAt,
    lastError: record.lastError,
  };
}

async function finishCountdown(key) {
  const record = countdowns.get(key);
  if (!record || record.state !== 'running') {
    return;
  }

  record.timer = null;
  record.state = 'sleeping';

  try {
    await sleepRoom(record.sleepTarget);
    record.state = 'completed';
    record.completedAt = new Date().toISOString();
    record.lastError = null;
  } catch (error) {
    record.state = 'failed';
    record.completedAt = new Date().toISOString();
    record.lastError = error && error.message ? error.message : String(error);
  }
}

function startCountdown({ targetType, target, durationSeconds }) {
  if (!target || !target.id) {
    throw new Error('target is required');
  }

  const key = makeKey(targetType, target.id);
  cancelCountdown(targetType, target.id);

  const startedAtMs = Date.now();
  const endsAtMs = startedAtMs + durationSeconds * 1000;
  const record = {
    targetType,
    targetId: target.id,
    targetName: target.name,
    sleepTarget: target,
    durationSeconds,
    startedAt: new Date(startedAtMs).toISOString(),
    endsAt: new Date(endsAtMs).toISOString(),
    endsAtMs,
    completedAt: null,
    canceledAt: null,
    lastError: null,
    state: 'running',
    timer: null,
  };

  record.timer = setTimeout(() => {
    finishCountdown(key);
  }, durationSeconds * 1000);

  countdowns.set(key, record);
  return snapshot(record);
}

function cancelCountdown(targetType, targetId) {
  const key = makeKey(targetType, targetId);
  const record = countdowns.get(key);
  if (!record) {
    return {
      active: false,
      state: 'idle',
    };
  }

  if (record.timer) {
    clearTimeout(record.timer);
  }

  record.timer = null;
  record.state = 'canceled';
  record.canceledAt = new Date().toISOString();
  return snapshot(record);
}

function getCountdown(targetType, targetId) {
  return snapshot(countdowns.get(makeKey(targetType, targetId)));
}

function listCountdowns() {
  return Array.from(countdowns.values()).map(snapshot);
}

module.exports = {
  cancelCountdown,
  getCountdown,
  listCountdowns,
  readDurationSeconds,
  startCountdown,
};
