const DB_NAME = "happy-song-offline";
const DB_VERSION = 1;
const SNAPSHOT_STORE = "snapshots";
const TRANSACTION_STORE = "transactions";

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) {
      reject(new Error("Penyimpanan offline tidak didukung browser ini."));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error || new Error("Database offline gagal dibuka."));
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SNAPSHOT_STORE)) {
        db.createObjectStore(SNAPSHOT_STORE, { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains(TRANSACTION_STORE)) {
        const store = db.createObjectStore(TRANSACTION_STORE, { keyPath: "offline_transaction_id" });
        store.createIndex("sync_status", "sync_status", { unique: false });
        store.createIndex("created_at", "created_at", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

async function withStore(storeName, mode, operation) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    let request;
    try {
      request = operation(store);
    } catch (error) {
      db.close();
      reject(error);
      return;
    }
    request.onerror = () => reject(request.error || new Error("Penyimpanan offline gagal."));
    request.onsuccess = () => resolve(request.result);
    transaction.oncomplete = () => db.close();
    transaction.onerror = () => reject(transaction.error || new Error("Transaksi database offline gagal."));
  });
}

export async function saveOfflineSnapshot(key, data) {
  const record = {
    key: String(key),
    data,
    updated_at: new Date().toISOString(),
    schema_version: 1,
  };
  await withStore(SNAPSHOT_STORE, "readwrite", (store) => store.put(record));
  return record;
}

export function getOfflineSnapshot(key) {
  return withStore(SNAPSHOT_STORE, "readonly", (store) => store.get(String(key)));
}

export async function saveOfflineTransaction(record) {
  const normalized = {
    ...record,
    offline_transaction_id: String(record?.offline_transaction_id || "").trim(),
    updated_at: new Date().toISOString(),
  };
  if (!normalized.offline_transaction_id) {
    throw new Error("ID transaksi offline tidak valid.");
  }
  await withStore(TRANSACTION_STORE, "readwrite", (store) => store.put(normalized));
  return normalized;
}

export function getOfflineTransaction(id) {
  return withStore(TRANSACTION_STORE, "readonly", (store) => store.get(String(id)));
}

export async function listOfflineTransactions() {
  const records = await withStore(TRANSACTION_STORE, "readonly", (store) => store.getAll());
  return (Array.isArray(records) ? records : []).sort((a, b) =>
    String(b.created_at || "").localeCompare(String(a.created_at || ""))
  );
}

export async function updateOfflineTransaction(id, changes) {
  const current = await getOfflineTransaction(id);
  if (!current) throw new Error("Transaksi offline tidak ditemukan.");
  return saveOfflineTransaction({ ...current, ...changes, offline_transaction_id: current.offline_transaction_id });
}
