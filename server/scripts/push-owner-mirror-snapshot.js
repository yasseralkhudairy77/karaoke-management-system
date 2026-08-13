const { buildOwnerMirrorSnapshot } = require('../src/services/ownerMirrorService');

async function main() {
  const mirrorUrl = process.env.OWNER_MIRROR_CLOUD_URL;
  const token = process.env.OWNER_MIRROR_TOKEN;
  const sourceId = process.env.OWNER_MIRROR_SOURCE_ID || 'happy-song-local';
  const period = process.argv[2] || process.env.OWNER_MIRROR_PERIOD || 'today';

  if (!mirrorUrl) {
    throw new Error('OWNER_MIRROR_CLOUD_URL belum diisi. Contoh: https://nama-app.up.railway.app/exec');
  }

  if (!token) {
    throw new Error('OWNER_MIRROR_TOKEN belum diisi.');
  }

  const snapshot = await buildOwnerMirrorSnapshot({ period });
  const endpoint = new URL(mirrorUrl);
  endpoint.searchParams.set('action', 'pushOwnerMirrorSnapshot');

  const response = await fetch(endpoint.toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      action: 'pushOwnerMirrorSnapshot',
      source_id: sourceId,
      snapshot
    })
  });

  const result = await response.json().catch(() => null);

  if (!response.ok || !result?.ok) {
    throw new Error(result?.error || result?.message || `Cloud mirror push gagal HTTP ${response.status}`);
  }

  console.log('Owner mirror snapshot pushed successfully.');
  console.log(`Cloud   : ${endpoint.origin}`);
  console.log(`Source  : ${sourceId}`);
  console.log(`Period  : ${period}`);
  console.log(`Snapshot: ${result.snapshot_id}`);
  console.log(`Received: ${result.received_at}`);
}

main().catch(err => {
  console.error(`Failed to push owner mirror snapshot: ${err.message}`);
  process.exit(1);
});
