const { successResponse, errorResponse } = require('../utils/response');
const { buildOwnerMirrorSnapshot } = require('../services/ownerMirrorService');

async function getOwnerMirrorSnapshot(req, res) {
  try {
    const snapshot = await buildOwnerMirrorSnapshot(req.query || {});
    return successResponse(res, snapshot);
  } catch (err) {
    return errorResponse(res, err.message);
  }
}

module.exports = {
  getOwnerMirrorSnapshot
};
