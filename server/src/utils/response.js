/**
 * Response Utility for Apps Script Compatibility
 */

const { toJakartaIsoString } = require('./operationalDate');

function getServerTimeFields() {
  const now = new Date();
  return {
    server_time: now.toISOString(),
    server_time_wib: toJakartaIsoString(now),
    server_timezone: 'Asia/Jakarta',
  };
}

function successResponse(res, data = {}) {
  return res.json({
    ok: true,
    success: true,
    ...getServerTimeFields(),
    ...data,
  });
}

function errorResponse(res, message = 'An error occurred', code = 'ERROR', statusCode = 200) {
  return res.status(statusCode).json({
    ok: false,
    success: false,
    code,
    message,
    error: message,
    ...getServerTimeFields(),
  });
}

module.exports = {
  successResponse,
  errorResponse,
  getServerTimeFields,
};
