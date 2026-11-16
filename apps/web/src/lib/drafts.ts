// Drafts (US-04): reports whose photos lack valid location and time metadata, or are too old, are kept in this
// browser only (IndexedDB, photos as Blobs). Nothing is sent to the server.
const DB_NAME = 'kiezruf';
const STORE = 'drafts';

export interface Draft {
  id: string;
  createdAt: string;
  category: string;
  description: string;
  dangerous: boolean;
  reasons: string[];
  photos: { name: string; type: string; blob: Blob }[];
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('indexeddb_unavailable'));
      return;
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = run(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export function draftsAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}

export async function saveDraft(draft: Omit<Draft, 'id' | 'createdAt'>): Promise<Draft> {
  const full: Draft = { ...draft, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
  await withStore('readwrite', (store) => store.put(full));
  return full;
}

export async function listDrafts(): Promise<Draft[]> {
  const all = await withStore<Draft[]>('readonly', (store) => store.getAll() as IDBRequest<Draft[]>);
  return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function deleteDraft(id: string): Promise<void> {
  await withStore('readwrite', (store) => store.delete(id));
}
