const STORAGE_KEY = "karaoke_api_diagnostics_v1";
const MAX_EVENTS = 200;

function readEvents() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function writeEvents(events) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(events.slice(-MAX_EVENTS)));
  } catch (error) {
    console.warn("Diagnostik API lokal gagal disimpan.", error);
  }
}

export function createApiRequestId(prefix = "REQ") {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`.toUpperCase();
}

export function recordApiDiagnostic(event) {
  const safeEvent = {
    request_id: String(event?.request_id || ""),
    action: String(event?.action || "unknown"),
    method: String(event?.method || "GET").toUpperCase(),
    attempt: Number(event?.attempt) || 1,
    outcome: String(event?.outcome || "unknown"),
    http_status: Number(event?.http_status) || 0,
    duration_ms: Math.max(0, Math.round(Number(event?.duration_ms) || 0)),
    server_duration_ms: Math.max(0, Math.round(Number(event?.server_duration_ms) || 0)),
    reached_backend: event?.reached_backend === true,
    error_type: String(event?.error_type || ""),
    recorded_at: new Date().toISOString(),
  };
  const events = readEvents();
  events.push(safeEvent);
  writeEvents(events);
  return safeEvent;
}

export function getRecentApiDiagnostics(limit = 50) {
  const safeLimit = Math.max(1, Math.min(MAX_EVENTS, Number(limit) || 50));
  return readEvents().slice(-safeLimit).reverse();
}

export function getApiDiagnosticsSummary(windowMinutes = 30) {
  const cutoff = Date.now() - Math.max(1, Number(windowMinutes) || 30) * 60000;
  const events = readEvents().filter((event) => new Date(event.recorded_at).getTime() >= cutoff);
  const successes = events.filter((event) => event.outcome === "success");
  const failures = events.filter((event) => event.outcome !== "success");
  const durations = successes.map((event) => Number(event.duration_ms) || 0).sort((a, b) => a - b);
  const percentile = (fraction) => durations.length
    ? durations[Math.min(durations.length - 1, Math.ceil(durations.length * fraction) - 1)]
    : 0;

  return {
    window_minutes: windowMinutes,
    total: events.length,
    success: successes.length,
    failed: failures.length,
    success_rate: events.length ? Math.round((successes.length / events.length) * 100) : 0,
    p50_ms: percentile(0.5),
    p95_ms: percentile(0.95),
    http_404: failures.filter((event) => event.http_status === 404).length,
    timeout: failures.filter((event) => event.error_type === "timeout").length,
    backend_unconfirmed: events.filter((event) => event.reached_backend !== true).length,
  };
}

export function buildApiDiagnosticsReport(context = {}) {
  return JSON.stringify({
    generated_at: new Date().toISOString(),
    context,
    summary_30m: getApiDiagnosticsSummary(30),
    recent_events: getRecentApiDiagnostics(50),
  }, null, 2);
}
