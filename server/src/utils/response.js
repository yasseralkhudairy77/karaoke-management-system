/**
 * Response Utility for Apps Script Compatibility
 */

function successResponse(res, data = {}) {
  return res.json({
    ok: true,
    success: true,
    server_time: new Date().toISOString(),
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
    server_time: new Date().toISOString(),
  });
}

module.exports = {
  successResponse,
  errorResponse,
};
