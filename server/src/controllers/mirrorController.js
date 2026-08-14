const { successResponse, errorResponse } = require('../utils/response');
const {
  buildOwnerMirrorSnapshot,
  saveOwnerMirrorSnapshot,
  getLatestOwnerMirrorSnapshot
} = require('../services/ownerMirrorService');

function getBearerToken(req) {
  const authorization = req.get('authorization') || '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

function assertMirrorToken(req, payload = {}) {
  const expectedToken = process.env.OWNER_MIRROR_TOKEN;
  if (!expectedToken) {
    throw new Error('OWNER_MIRROR_TOKEN belum dikonfigurasi di server cloud.');
  }

  const providedToken = getBearerToken(req) || payload.owner_mirror_token || req.query.owner_mirror_token;
  if (providedToken !== expectedToken) {
    const err = new Error('Token owner mirror tidak valid.');
    err.code = 'UNAUTHORIZED';
    throw err;
  }
}

async function getOwnerMirrorSnapshot(req, res) {
  try {
    const sourceId = req.query.source_id || process.env.OWNER_MIRROR_SOURCE_ID || 'happy-song-local';
    const snapshot = process.env.OWNER_MIRROR_MODE === 'cloud'
      ? await getLatestOwnerMirrorSnapshot(sourceId, req.query || {})
      : await buildOwnerMirrorSnapshot(req.query || {});
    return successResponse(res, snapshot);
  } catch (err) {
    return errorResponse(res, err.message);
  }
}

async function pushOwnerMirrorSnapshot(req, res, payload) {
  try {
    assertMirrorToken(req, payload);
    const sourceId = payload.source_id || process.env.OWNER_MIRROR_SOURCE_ID || 'happy-song-local';
    const snapshot = payload.snapshot || payload;
    const saved = await saveOwnerMirrorSnapshot(snapshot, sourceId);
    return successResponse(res, {
      message: 'Snapshot owner mirror diterima cloud.',
      ...saved
    });
  } catch (err) {
    const code = err.code === 'UNAUTHORIZED' ? 'UNAUTHORIZED' : 'ERROR';
    const statusCode = err.code === 'UNAUTHORIZED' ? 401 : 200;
    return errorResponse(res, err.message, code, statusCode);
  }
}

module.exports = {
  getOwnerMirrorSnapshot,
  pushOwnerMirrorSnapshot
};
