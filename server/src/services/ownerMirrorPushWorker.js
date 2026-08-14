const { buildOwnerMirrorSnapshot } = require('./ownerMirrorService');

let isPushRunning = false;
let pushIntervalHandle = null;
let lastPushTime = null;
let lastPushError = null;

function getPushConfig() {
  const periods = String(process.env.OWNER_MIRROR_PERIODS || process.env.OWNER_MIRROR_PERIOD || 'today,yesterday,last7days,thismonth')
    .split(',')
    .map(period => period.trim())
    .filter(Boolean);

  return {
    enabled: process.env.OWNER_MIRROR_MODE !== 'cloud'
      && Boolean(process.env.OWNER_MIRROR_CLOUD_URL)
      && Boolean(process.env.OWNER_MIRROR_TOKEN),
    cloudUrl: process.env.OWNER_MIRROR_CLOUD_URL || '',
    token: process.env.OWNER_MIRROR_TOKEN || '',
    sourceId: process.env.OWNER_MIRROR_SOURCE_ID || 'happy-song-local',
    periods: periods.length > 0 ? periods : ['today']
  };
}

async function pushOneOwnerMirrorSnapshot(config, period) {
  const snapshot = await buildOwnerMirrorSnapshot({ period });
  const endpoint = new URL(config.cloudUrl);
  endpoint.searchParams.set('action', 'pushOwnerMirrorSnapshot');

  const response = await fetch(endpoint.toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.token}`
    },
    body: JSON.stringify({
      action: 'pushOwnerMirrorSnapshot',
      source_id: config.sourceId,
      snapshot
    })
  });

  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.ok) {
    throw new Error(result?.error || result?.message || `HTTP ${response.status}`);
  }

  return result;
}

async function pushOwnerMirrorSnapshot(periodsOverride = null) {
  if (isPushRunning) return;

  const config = getPushConfig();
  if (!config.enabled) return;

  isPushRunning = true;
  try {
    const periods = Array.isArray(periodsOverride) && periodsOverride.length > 0
      ? periodsOverride
      : config.periods;
    for (const period of periods) {
      await pushOneOwnerMirrorSnapshot(config, period);
    }

    lastPushTime = new Date().toISOString();
    lastPushError = null;
  } catch (err) {
    lastPushError = err.message;
    console.error('Owner mirror push failed:', err.message);
  } finally {
    isPushRunning = false;
  }
}

function startOwnerMirrorPushWorker(intervalMs = 60000) {
  if (pushIntervalHandle) clearInterval(pushIntervalHandle);

  const config = getPushConfig();
  if (!config.enabled) {
    console.log('Owner Mirror Push Worker disabled (cloud URL/token not configured or running in cloud mode).');
    return;
  }

  console.log(`Owner Mirror Push Worker started (Polling every ${intervalMs}ms). Periods: ${config.periods.join(', ')}`);
  pushOwnerMirrorSnapshot().catch(() => {});
  pushIntervalHandle = setInterval(pushOwnerMirrorSnapshot, intervalMs);
}

function stopOwnerMirrorPushWorker() {
  if (pushIntervalHandle) {
    clearInterval(pushIntervalHandle);
    pushIntervalHandle = null;
  }
}

function getOwnerMirrorPushStatus() {
  const config = getPushConfig();
  return {
    enabled: config.enabled,
    worker_running: isPushRunning,
    cloud_url_configured: Boolean(config.cloudUrl),
    token_configured: Boolean(config.token),
    source_id: config.sourceId,
    periods: config.periods,
    period: config.periods.join(','),
    last_push_time: lastPushTime,
    last_push_error: lastPushError
  };
}

module.exports = {
  startOwnerMirrorPushWorker,
  stopOwnerMirrorPushWorker,
  pushOwnerMirrorSnapshot,
  getOwnerMirrorPushStatus
};
